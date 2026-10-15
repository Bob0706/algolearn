// Runs the serverless (Redis) storage paths against a real Redis behind an
// Upstash-compatible REST API:
//   docker run -d --name algo-redis --network algonet redis:7-alpine
//   docker run -d --network algonet -p 8079:80 -e SRH_MODE=env -e SRH_TOKEN=test_token \
//     -e SRH_CONNECTION_STRING=redis://algo-redis:6379 hiett/serverless-redis-http
//   REDIS_TEST_URL=http://127.0.0.1:8079 REDIS_TEST_TOKEN=test_token npx vitest run tests/redis.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const URL_ = process.env.REDIS_TEST_URL;
const TOKEN = process.env.REDIS_TEST_TOKEN || "test_token";

describe.skipIf(!URL_)("Redis (Upstash REST) storage for serverless hosts", () => {
  let redis: typeof import("@/lib/server/redis").redis;

  beforeAll(async () => {
    Object.assign(process.env, { KV_REST_API_URL: URL_, KV_REST_API_TOKEN: TOKEN });
    ({ redis } = await import("@/lib/server/redis"));
  });

  beforeEach(async () => {
    await redis(["FLUSHDB"]);
    // a fresh empty file dir proves nothing is read from disk
    process.env.LEDGER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "algolearn-empty-"));
    process.env.LEDGER_MODE = "local";
  });

  it("stores, dedupes and verifies ledger records in Redis", async () => {
    const { recordOnLedger, verifyRecord, ledgerHealth } = await import("@/lib/ledger");
    const a = await recordOnLedger("BACKTEST", { r: 1 });
    expect(a?.status).toBe("confirmed");
    expect((await recordOnLedger("BACKTEST", { r: 1 }))?.id).toBe(a?.id);
    expect((await verifyRecord(a!.id)).verdict).toBe("VERIFIED");
    expect(fs.readdirSync(process.env.LEDGER_DATA_DIR!)).toEqual([]);
    const h = await ledgerHealth();
    expect(h.recordCount).toBe(1);
    expect(h.detail).toMatch(/Redis/);
  });

  it("detects a record edited directly in Redis", async () => {
    const { recordOnLedger, verifyRecord } = await import("@/lib/ledger");
    const r = await recordOnLedger("SIMULATION_RESULT", { returnPct: 2 });
    const key = `ledger:rec:${r!.id}`;
    const rec = JSON.parse(await redis(["GET", key]));
    rec.content.returnPct = 200;
    await redis(["SET", key, JSON.stringify(rec)]);
    expect((await verifyRecord(r!.id)).verdict).toBe("TAMPERED");
  });

  it("keeps the hash chain consistent under concurrent writers", async () => {
    const { appendChainLocked, readChain } = await import("@/lib/ledger/store");
    const { hashJson, ZERO_HASH } = await import("@/lib/ledger/canonical");
    // 15 parallel appends, as if from separate serverless instances
    await Promise.all(Array.from({ length: 15 }, (_, i) => appendChainLocked(`0x${String(i).padStart(64, "0")}`, prev => {
      const body = { seq: (prev?.seq ?? 0) + 1, id: `0x${String(i).padStart(64, "0")}`, kind: "BACKTEST" as const, contentHash: hashJson(i),
        subject: ZERO_HASH, parent: null, timestamp: new Date().toISOString(), prevHash: prev?.entryHash ?? ZERO_HASH };
      return { ...body, entryHash: hashJson(body) };
    })));
    const chain = await readChain();
    expect(chain.map(e => e.seq)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    chain.forEach((e, i) => expect(e.prevHash).toBe(i ? chain[i - 1].entryHash : ZERO_HASH));
  });

  it("keeps simulator sessions in Redis so any instance can continue them", async () => {
    process.env.ALLOW_SYNTHETIC_DATA = "true"; // no market-data network in CI
    const { startSession, stepSession } = await import("@/lib/server/simulator");
    const { ANONYMOUS } = await import("@/lib/server/auth");
    const v = await startSession(ANONYMOUS, "RELIANCE.NS", "1y");
    (globalThis as any).__algolearnSim?.clear?.(); // simulate a different instance
    expect(await redis(["EXISTS", `sim:${v.sessionId}`])).toBe(1);
    const s1 = await stepSession(ANONYMOUS, { sessionId: v.sessionId, action: { type: "BUY", shares: 5 } });
    expect(s1.portfolio.shares).toBe(5);
    const s2 = await stepSession(ANONYMOUS, { sessionId: v.sessionId, advance: 5 });
    expect(s2.cursor).toBe(v.cursor + 5);
    expect(s2.portfolio.shares).toBe(5);
    delete process.env.ALLOW_SYNTHETIC_DATA;
  });

  it("serves the shared NSE/BSE company list from Redis on a cold instance", async () => {
    const { buildUniverse, getUniverse, parseNseList } = await import("@/lib/server/universe");
    const nse = parseNseList(fs.readFileSync(path.join(__dirname, "fixtures", "EQUITY_L.csv"), "utf8"));
    const u = buildUniverse(nse, [], [{ symbol: "500325.BO", exchange: "BSE", code: "500325", name: "Reliance Industries Ltd" }]);
    await redis(["SET", "universe:v2", JSON.stringify(u)]);
    process.env.MARKET_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "algolearn-mkt-empty-"));
    const g = globalThis as any;
    g.__algolearnUniverse = undefined;
    g.__algolearnUniverseIndex = null;
    g.__algolearnUniverseCheckedAt = Date.now(); // don't start a background download
    const got = await getUniverse();
    expect(got.counts).toEqual({ nse: 5, nseSme: 0, bse: 1 });
    expect(got.complete).toBe(true);
  });
});
