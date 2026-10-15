// Several processes (like separate Vercel instances) share one Besu signer through Redis.
//   LEDGER_TEST_RPC=http://127.0.0.1:8545 LEDGER_TEST_CONTRACT=0x… REDIS_TEST_URL=http://127.0.0.1:8079 npx vitest run tests/besu-serverless.test.ts
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const RPC = process.env.LEDGER_TEST_RPC;
const CONTRACT = process.env.LEDGER_TEST_CONTRACT;
const REDIS = process.env.REDIS_TEST_URL;
const DEV_KEY = "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63";
const run = promisify(execFile);

describe.skipIf(!RPC || !CONTRACT || !REDIS)("Besu ledger on serverless (shared signer via Redis)", () => {
  const env = {
    ...process.env,
    LEDGER_MODE: "besu", LEDGER_RPC_URL: RPC!, LEDGER_CONTRACT_ADDRESS: CONTRACT!, LEDGER_PRIVATE_KEY: process.env.LEDGER_TEST_KEY || DEV_KEY,
    KV_REST_API_URL: REDIS!, KV_REST_API_TOKEN: process.env.REDIS_TEST_TOKEN || "test_token",
    LEDGER_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "algolearn-besu-sls-")),
  };

  it("three instances writing at once all get confirmed (no nonce collisions)", async () => {
    const outs = await Promise.all(["a", "b", "c"].map(tag =>
      run("npx", ["tsx", "tests/fixtures/besu-writer.ts", `${tag}-${Date.now()}`, "4"], { env, timeout: 120_000 })));
    const results = outs.flatMap(o => JSON.parse(o.stdout));
    expect(results).toHaveLength(12);
    expect(results.filter(r => r.status !== "confirmed"), JSON.stringify(results)).toEqual([]);
  }, 180_000);

  it("re-anchors a record from the local ledger onto Besu when the mode changes", async () => {
    Object.assign(process.env, env, { LEDGER_MODE: "local" });
    const { recordOnLedger, verifyRecord } = await import("@/lib/ledger");
    const local = await recordOnLedger("STRATEGY", { code: `migrate-${Date.now()}` });
    expect(local?.mode).toBe("local");
    process.env.LEDGER_MODE = "besu";
    const v = await verifyRecord(local!.id);
    expect(v.verdict, v.explanation).toBe("VERIFIED");
    expect(v.mode).toBe("besu");
    expect(v.onChain?.blockNumber).toBeGreaterThan(0);
  }, 60_000);
});
