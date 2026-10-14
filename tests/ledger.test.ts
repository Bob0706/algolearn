import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalJson, hashJson } from "@/lib/ledger/canonical";
import { recordOnLedger, verifyRecord, ledgerHealth } from "@/lib/ledger";
import artifact from "@/lib/ledger/AlgoLedger.json";

function freshDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "algolearn-ledger-"));
  process.env.LEDGER_DATA_DIR = dir;
  return dir;
}

describe("canonical hashing", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: undefined } })).toBe('{"a":{"d":[1,2]},"b":1}');
    expect(hashJson({ x: 1, y: 2 })).toBe(hashJson({ y: 2, x: 1 }));
  });
});

describe("local ledger", () => {
  let dir: string;
  beforeEach(() => {
    dir = freshDir();
    process.env.LEDGER_MODE = "local";
  });

  it("records, dedupes and verifies", async () => {
    const a = await recordOnLedger("STRATEGY", { code: "x" });
    expect(a?.status).toBe("confirmed");
    const again = await recordOnLedger("STRATEGY", { code: "x" });
    expect(again?.id).toBe(a?.id);
    const v = await verifyRecord(a!.id);
    expect(v.verdict).toBe("VERIFIED");
    expect((await ledgerHealth()).recordCount).toBe(1);
  });

  it("detects edited content", async () => {
    const r = await recordOnLedger("BACKTEST", { total_return_pct: 5 });
    const file = path.join(dir, "records", `${r!.id}.json`);
    const rec = JSON.parse(fs.readFileSync(file, "utf8"));
    rec.content.total_return_pct = 500; // someone inflates their result
    fs.writeFileSync(file, JSON.stringify(rec));
    const v = await verifyRecord(r!.id);
    expect(v.verdict).toBe("TAMPERED");
    expect(v.contentIntact).toBe(false);
  });

  it("detects a rewritten chain", async () => {
    const r1 = await recordOnLedger("LIVE_SIGNAL", { s: 1 });
    await recordOnLedger("LIVE_SIGNAL", { s: 2 });
    const chainFile = path.join(dir, "chain.jsonl");
    const lines = fs.readFileSync(chainFile, "utf8").trim().split("\n").map(l => JSON.parse(l));
    lines[0].timestamp = "2000-01-01T00:00:00.000Z"; // backdate the first entry
    fs.writeFileSync(chainFile, lines.map(l => JSON.stringify(l)).join("\n") + "\n");
    expect((await verifyRecord(r1!.id)).verdict).toBe("TAMPERED");
  });

  it("verifies a user-supplied copy of the content", async () => {
    const r = await recordOnLedger("SIMULATION_RESULT", { ret: 3 });
    expect((await verifyRecord(r!.id, { ret: 3 })).verdict).toBe("VERIFIED");
    expect((await verifyRecord(r!.id, { ret: 4 })).verdict).toBe("TAMPERED");
  });
});

// Integration test against a real Hyperledger Besu node:
//   LEDGER_TEST_RPC=http://127.0.0.1:8545 LEDGER_TEST_CONTRACT=0x... npx vitest run tests/ledger.test.ts
const RPC = process.env.LEDGER_TEST_RPC;
const CONTRACT = process.env.LEDGER_TEST_CONTRACT;
const DEV_KEY = "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63";

describe.skipIf(!RPC || !CONTRACT)("Hyperledger Besu ledger", () => {
  beforeEach(() => {
    freshDir();
    Object.assign(process.env, {
      LEDGER_MODE: "besu", LEDGER_RPC_URL: RPC, LEDGER_CONTRACT_ADDRESS: CONTRACT,
      LEDGER_PRIVATE_KEY: process.env.LEDGER_TEST_KEY || DEV_KEY,
    });
  });

  it("writes a hash on-chain and verifies it", async () => {
    const content = { test: "besu", at: Date.now() };
    const r = await recordOnLedger("BACKTEST", content);
    expect(r?.status, r?.error).toBe("confirmed");
    expect(r?.txHash).toMatch(/^0x[0-9a-f]{64}$/);

    const v = await verifyRecord(r!.id);
    expect(v.verdict).toBe("VERIFIED");
    expect(v.onChain?.contentHash).toBe(hashJson(content));
    expect(v.onChain?.blockNumber).toBeGreaterThan(0);
    expect((await verifyRecord(r!.id, { ...content, test: "edited" })).verdict).toBe("TAMPERED");

    const health = await ledgerHealth();
    expect(health.ok).toBe(true);
    expect(health.chainId).toBe(4242);
  });

  it("links children to parents on-chain", async () => {
    const parent = await recordOnLedger("STRATEGY", { code: `p${Date.now()}` });
    const child = await recordOnLedger("BACKTEST", { r: Date.now() }, { parentId: parent!.id });
    const v = await verifyRecord(child!.id);
    expect(v.onChain?.parent).toBe(parent!.id);
  });

  it("rejects writes from accounts that are not authorised writers", async () => {
    const provider = new JsonRpcProvider(RPC);
    const outsider = Wallet.createRandom().connect(provider);
    const c = new Contract(CONTRACT!, artifact.abi, outsider);
    await expect(c.record("0x" + "11".repeat(32), 1, "0x" + "22".repeat(32), "0x" + "00".repeat(32), "0x" + "00".repeat(32), { gasPrice: 0, gasLimit: 200000 }))
      .rejects.toThrow();
  });
});

describe("misconfigured Besu", () => {
  it("reports failure instead of throwing", async () => {
    freshDir();
    const saved = { ...process.env };
    (globalThis as any).__algolearnBesu = undefined;
    Object.assign(process.env, { LEDGER_MODE: "besu", LEDGER_RPC_URL: "", LEDGER_PRIVATE_KEY: "", LEDGER_CONTRACT_ADDRESS: "" });
    const r = await recordOnLedger("BACKTEST", { x: 1 });
    expect(r?.status).toBe("failed");
    expect(r?.error).toMatch(/LEDGER_RPC_URL/);
    const v = await verifyRecord(r!.id);
    expect(v.verdict).toBe("UNAVAILABLE");
    process.env = saved;
    (globalThis as any).__algolearnBesu = undefined;
  });
});
