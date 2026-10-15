// Accounts, login sessions and isolation between them.
// Runs against the in-memory store, and again against real Redis when REDIS_TEST_URL is set
// (see tests/redis.test.ts for the docker commands).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

const REDIS_URL = process.env.REDIS_TEST_URL;
const REDIS_TOKEN = process.env.REDIS_TEST_TOKEN || "test_token";

const BASE = "http://localhost";
let ipSeq = 0;

function req(path: string, opts: { method?: string; body?: unknown; cookie?: string; tab?: string; ua?: string; ip?: string } = {}) {
  const headers = new Headers({ "user-agent": opts.ua ?? "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", "x-forwarded-for": opts.ip ?? "10.0.0.1" });
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.cookie) headers.set("cookie", `al_session=${opts.cookie}`);
  if (opts.tab) headers.set("x-al-session", opts.tab);
  return new NextRequest(`${BASE}${path}`, { method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"), body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, headers });
}

const routes = async () => ({
  signup: (await import("@/app/api/auth/signup/route")).POST,
  login: (await import("@/app/api/auth/login/route")).POST,
  logout: (await import("@/app/api/auth/logout/route")).POST,
  me: (await import("@/app/api/auth/me/route")).GET,
  sessions: await import("@/app/api/auth/sessions/route"),
  strategies: await import("@/app/api/me/strategies/route"),
  progress: await import("@/app/api/me/progress/route"),
});

const cookieOf = (res: Response) => (res as any).cookies.get("al_session")?.value as string;

for (const backend of ["memory", "redis"] as const) {
  describe.skipIf(backend === "redis" && !REDIS_URL)(`accounts & sessions (${backend})`, () => {
    beforeEach(async () => {
      if (backend === "redis") {
        Object.assign(process.env, { KV_REST_API_URL: REDIS_URL, KV_REST_API_TOKEN: REDIS_TOKEN });
        const { redis } = await import("@/lib/server/redis");
        await redis(["FLUSHDB"]);
      } else {
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        (globalThis as any).__algolearnKV?.clear();
      }
      ipSeq++;
    });

    const ip = () => `10.1.${ipSeq}.1`;

    async function signUp(r: Awaited<ReturnType<typeof routes>>, email: string, name = "Asha") {
      const res = await r.signup(req("/api/auth/signup", { body: { name, email, password: "s3cret-pass" }, ip: ip() }));
      expect(res.status).toBe(200);
      return { cookie: cookieOf(res), body: await res.json() };
    }

    it("stores only a scrypt hash and rejects bad or duplicate credentials", async () => {
      const r = await routes();
      const { kv } = await import("@/lib/server/kv");
      const { body } = await signUp(r, "Asha@Example.com");
      expect(body.user).toMatchObject({ email: "asha@example.com", name: "Asha" });
      const stored = await kv().get(`user:${body.user.id}:auth`);
      expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
      expect(stored).not.toContain("s3cret-pass");

      const dup = await r.signup(req("/api/auth/signup", { body: { name: "X", email: "asha@example.com", password: "s3cret-pass" }, ip: ip() }));
      expect(dup.status).toBe(409);
      const weak = await r.signup(req("/api/auth/signup", { body: { name: "X", email: "b@example.com", password: "short" }, ip: ip() }));
      expect(weak.status).toBe(400);

      const wrong = await r.login(req("/api/auth/login", { body: { email: "asha@example.com", password: "wrong-pass1" }, ip: ip() }));
      const unknown = await r.login(req("/api/auth/login", { body: { email: "nobody@example.com", password: "wrong-pass1" }, ip: ip() }));
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((await wrong.json()).detail).toBe((await unknown.json()).detail); // doesn't reveal which emails exist
    });

    it("gives every login its own session and keeps only the token hash in the database", async () => {
      const r = await routes();
      const { kv } = await import("@/lib/server/kv");
      const { body } = await signUp(r, "asha@example.com");
      const a = cookieOf(await r.login(req("/api/auth/login", { body: { email: "asha@example.com", password: "s3cret-pass" }, ip: ip() })));
      const b = cookieOf(await r.login(req("/api/auth/login", { body: { email: "asha@example.com", password: "s3cret-pass" }, ip: ip(), ua: "Mozilla/5.0 (iPhone) Safari/605" })));
      expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(a).not.toBe(b);
      expect(await kv().get(`sess:${a}`)).toBeNull(); // raw token is never a key

      const meA = await (await r.me(req("/api/auth/me", { cookie: a }))).json();
      const meB = await (await r.me(req("/api/auth/me", { cookie: b }))).json();
      expect(meA.user.id).toBe(body.user.id);
      expect(meA.session.id).not.toBe(meB.session.id);

      const list = (await (await r.sessions.GET(req("/api/auth/sessions", { cookie: a }))).json()).sessions;
      expect(list).toHaveLength(3); // sign-up + two logins
      expect(list.filter((s: any) => s.current)).toHaveLength(1);
      expect(list.map((s: any) => s.device)).toContain("Safari on iOS");
    });

    it("logout ends only that session; 'sign out others' keeps the current one", async () => {
      const r = await routes();
      const { cookie: first } = await signUp(r, "asha@example.com");
      const login = () => r.login(req("/api/auth/login", { body: { email: "asha@example.com", password: "s3cret-pass" }, ip: ip() })).then(cookieOf);
      const a = await login(), b = await login();

      const out = await r.logout(req("/api/auth/logout", { method: "POST", cookie: a }));
      expect(cookieOf(out)).toBe("");
      expect((await (await r.me(req("/api/auth/me", { cookie: a }))).json()).user).toBeNull();
      expect((await (await r.me(req("/api/auth/me", { cookie: b }))).json()).user).not.toBeNull();

      const ended = await (await r.sessions.DELETE(req("/api/auth/sessions?others=1", { method: "DELETE", cookie: b }))).json();
      expect(ended.ended).toBe(1); // the sign-up session
      expect((await (await r.me(req("/api/auth/me", { cookie: first }))).json()).user).toBeNull();
      expect((await (await r.me(req("/api/auth/me", { cookie: b }))).json()).user).not.toBeNull();
    });

    it("a new login on the same browser ends the previous user's session there", async () => {
      const r = await routes();
      const { cookie: asha } = await signUp(r, "asha@example.com");
      await signUp(r, "ravi@example.com", "Ravi");
      const res = await r.login(req("/api/auth/login", { body: { email: "ravi@example.com", password: "s3cret-pass" }, cookie: asha, ip: ip() }));
      expect(res.status).toBe(200);
      expect((await (await r.me(req("/api/auth/me", { cookie: asha }))).json()).user).toBeNull();
    });

    it("keeps each user's strategies and progress separate", async () => {
      const r = await routes();
      const { cookie: asha } = await signUp(r, "asha@example.com");
      const { cookie: ravi } = await signUp(r, "ravi@example.com", "Ravi");

      const saved = await (await r.strategies.POST(req("/api/me/strategies", { body: { name: "RSI dip", code: "def run_strategy(df):\n    return df" }, cookie: asha }))).json();
      await r.progress.POST(req("/api/me/progress", { body: { lessonId: "l1" }, cookie: asha }));

      const raviList = await (await r.strategies.GET(req("/api/me/strategies", { cookie: ravi }))).json();
      expect(raviList.strategies).toEqual([]);
      expect((await (await r.progress.GET(req("/api/me/progress", { cookie: ravi }))).json()).lessonsCompleted).toEqual([]);

      // Ravi cannot delete Asha's strategy even with its id
      const del = (await import("@/app/api/me/strategies/[id]/route")).DELETE;
      await del(req(`/api/me/strategies/${saved.strategy.id}`, { method: "DELETE", cookie: ravi }), { params: Promise.resolve({ id: saved.strategy.id }) });
      expect((await (await r.strategies.GET(req("/api/me/strategies", { cookie: asha }))).json()).strategies).toHaveLength(1);

      expect((await r.strategies.GET(req("/api/me/strategies"))).status).toBe(401); // guests
    });

    it("refuses a request from a tab that still shows a different login", async () => {
      const r = await routes();
      const { cookie: asha, body } = await signUp(r, "asha@example.com");
      const { cookie: ravi } = await signUp(r, "ravi@example.com", "Ravi");
      const ashaTab = body.session.id;

      const ok = await r.strategies.GET(req("/api/me/strategies", { cookie: asha, tab: ashaTab }));
      expect(ok.status).toBe(200);
      // the cookie now belongs to Ravi (logged in from another tab), but this tab still shows Asha
      const stale = await r.strategies.GET(req("/api/me/strategies", { cookie: ravi, tab: ashaTab }));
      expect(stale.status).toBe(409);
      expect((await stale.json()).code).toBe("SESSION_CHANGED");
      // a guest tab after someone logged in elsewhere
      expect((await r.strategies.GET(req("/api/me/strategies", { cookie: ravi, tab: "guest" }))).status).toBe(409);
      // /me always answers, so the tab can resync
      expect((await r.me(req("/api/auth/me", { cookie: ravi, tab: ashaTab }))).status).toBe(200);
    });

    it("binds simulator games to the login session that started them", async () => {
      process.env.ALLOW_SYNTHETIC_DATA = "true";
      const r = await routes();
      const { startSession, stepSession } = await import("@/lib/server/simulator");
      const { getCaller } = await import("@/lib/server/auth");
      const { getProgress } = await import("@/lib/server/userData");
      const { cookie: a1, body } = await signUp(r, "asha@example.com");
      const a2 = cookieOf(await r.login(req("/api/auth/login", { body: { email: "asha@example.com", password: "s3cret-pass" }, ip: ip() })));
      const { cookie: ravi } = await signUp(r, "ravi@example.com", "Ravi");

      const callerA1 = await getCaller(req("/", { cookie: a1 }));
      const game = await startSession(callerA1, "RELIANCE.NS", "1y");
      for (const other of [a2, ravi]) {
        await expect(stepSession(await getCaller(req("/", { cookie: other })), { sessionId: game.sessionId, advance: 1 })).rejects.toThrow(/not found/);
      }
      await stepSession(callerA1, { sessionId: game.sessionId, action: { type: "BUY", shares: 1 } });
      const done = await stepSession(callerA1, { sessionId: game.sessionId, end: true });
      expect(done.finished).toBe(true);
      expect((await getProgress(body.user.id)).simulatorStats.sessions).toBe(1);
      delete process.env.ALLOW_SYNTHETIC_DATA;
    }, 30_000);
  });
}
