// lib/server/redis.ts — minimal Upstash Redis REST client (no SDK, works on serverless).
//
// Enabled when either pair of variables is set (Vercel's Upstash integration sets the KV_* pair):
//   KV_REST_API_URL + KV_REST_API_TOKEN
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// Without them the app keeps its single-server behaviour (files + memory).

type Arg = string | number;

const conf = () => ({
  url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, ""),
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

export const redisEnabled = () => {
  const c = conf();
  return Boolean(c.url && c.token);
};

export class RedisError extends Error {}

async function post(path: string, body: unknown): Promise<any> {
  const { url, token } = conf();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json === null) throw new RedisError(`Redis request failed (${res.status}): ${json?.error ?? "no response"}`);
  return json;
}

/** Runs one command, e.g. redis(["SET", "k", "v", "EX", 60]). */
export async function redis<T = any>(cmd: Arg[]): Promise<T> {
  const json = await post("", cmd.map(String));
  if (json.error) throw new RedisError(json.error);
  return json.result as T;
}

/** Runs several commands in one round trip. */
export async function redisPipeline(cmds: Arg[][]): Promise<any[]> {
  const json = await post("/pipeline", cmds.map(c => c.map(String)));
  return (json as { result?: any; error?: string }[]).map(r => {
    if (r.error) throw new RedisError(r.error);
    return r.result;
  });
}

/** Cross-instance mutex (SET NX PX). Runs `fn` while holding `name`; waits up to ~10 s. */
export async function withRedisLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const token = Math.random().toString(36).slice(2);
  const key = `lock:${name}`;
  for (let i = 0; ; i++) {
    if ((await redis(["SET", key, token, "NX", "PX", 15_000])) === "OK") break;
    if (i > 100) throw new RedisError(`could not acquire lock ${name}`);
    await new Promise(r => setTimeout(r, 100));
  }
  try {
    return await fn();
  } finally {
    // release only our own lock
    const current = await redis<string | null>(["GET", key]).catch(() => null);
    if (current === token) await redis(["DEL", key]).catch(() => undefined);
  }
}
