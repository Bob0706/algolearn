// lib/ledger/index.ts — AlgoLearn's tamper-evident ledger service.
//
// LEDGER_MODE
//   besu   Hyperledger Besu (QBFT) network: hashes are written to the AlgoLedger
//          contract by the platform signer. Requires LEDGER_RPC_URL,
//          LEDGER_PRIVATE_KEY and LEDGER_CONTRACT_ADDRESS.
//   local  Development fallback: a hash-chained append-only file. Tamper-EVIDENT
//          but not decentralised — the UI labels it as such.
//   off    Nothing is recorded.
// Default: besu if the three LEDGER_* variables are set, otherwise local.
//
// Only the SHA-256 of the canonical content goes on-chain; the content itself is
// kept in the off-chain store so it can be re-hashed and compared at any time.

import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";
import artifact from "./AlgoLedger.json";
import { hashJson, ZERO_HASH } from "./canonical";
import { appendChainLocked, ChainEntry, getRecord, putRecord, readChain, storeBackend, StoredRecord } from "./store";
import { LedgerKind, LedgerMode, LedgerReceipt } from "../types";

export const KIND_CODES: Record<LedgerKind, number> = {
  STRATEGY: 0,
  BACKTEST: 1,
  SIGNAL_BATCH: 2,
  SIMULATION_RESULT: 3,
  LIVE_SIGNAL: 4,
};

export function ledgerMode(): LedgerMode {
  const m = (process.env.LEDGER_MODE || "").toLowerCase();
  if (m === "besu" || m === "local" || m === "off") return m;
  return process.env.LEDGER_RPC_URL && process.env.LEDGER_PRIVATE_KEY && process.env.LEDGER_CONTRACT_ADDRESS
    ? "besu"
    : "local";
}

// ─── Besu connection (singleton across hot reloads) ─────────────────────────
interface BesuConn { contract: Contract; readOnly: Contract; chainId?: number }
const g = globalThis as any;

function besu(): BesuConn {
  if (g.__algolearnBesu) return g.__algolearnBesu;
  const { LEDGER_RPC_URL, LEDGER_PRIVATE_KEY, LEDGER_CONTRACT_ADDRESS } = process.env;
  if (!LEDGER_RPC_URL || !LEDGER_PRIVATE_KEY || !LEDGER_CONTRACT_ADDRESS) {
    throw new Error("LEDGER_MODE=besu needs LEDGER_RPC_URL, LEDGER_PRIVATE_KEY and LEDGER_CONTRACT_ADDRESS");
  }
  const provider = new JsonRpcProvider(LEDGER_RPC_URL, undefined, { staticNetwork: true, polling: true, pollingInterval: 500 });
  const signer = new NonceManager(new Wallet(LEDGER_PRIVATE_KEY, provider));
  g.__algolearnBesu = {
    contract: new Contract(LEDGER_CONTRACT_ADDRESS, artifact.abi, signer),
    readOnly: new Contract(LEDGER_CONTRACT_ADDRESS, artifact.abi, provider),
  };
  return g.__algolearnBesu;
}

/** All chain writes go through one queue so nonces and the local chain stay ordered. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = (g.__algolearnLedgerQueue ?? Promise.resolve()).then(job, job);
  g.__algolearnLedgerQueue = run.catch(() => undefined);
  return run;
}

const CONFIRM_TIMEOUT_MS = Number(process.env.LEDGER_CONFIRM_TIMEOUT_MS || 15_000);

async function submit(rec: StoredRecord): Promise<LedgerReceipt> {
  const mode = ledgerMode();
  const base = { id: rec.id, kind: rec.kind, contentHash: rec.contentHash, mode };

  if (mode === "local") {
    return enqueue(async () => {
      const entry = await appendChainLocked(rec.id, prev => {
        const body = {
          seq: (prev?.seq ?? 0) + 1,
          id: rec.id,
          kind: rec.kind,
          contentHash: rec.contentHash,
          subject: rec.subject,
          parent: rec.parentId,
          timestamp: new Date().toISOString(),
          prevHash: prev?.entryHash ?? ZERO_HASH,
        };
        return { ...body, entryHash: hashJson(body) };
      });
      return { ...base, status: "confirmed" as const, txHash: entry.entryHash, blockNumber: entry.seq };
    });
  }

  // besu
  return enqueue(async () => {
    let conn: BesuConn | null = null;
    try {
      conn = besu();
      const { contract, readOnly } = conn;
      if (await readOnly.exists(rec.id)) {
        const onChain = await readOnly.get(rec.id);
        return { ...base, status: "confirmed" as const, blockNumber: Number(onChain.blockNumber), txHash: rec.receipt.txHash };
      }
      // Only link the parent on-chain if it actually made it there (the contract rejects unknown parents).
      let parent = ZERO_HASH;
      if (rec.parentId && (await readOnly.exists(rec.parentId))) parent = rec.parentId;
      const tx = await contract.record(rec.id, KIND_CODES[rec.kind], rec.contentHash, rec.subject, parent, { gasPrice: 0 });
      const receipt = await Promise.race([
        tx.wait(1),
        new Promise<null>(r => setTimeout(() => r(null), CONFIRM_TIMEOUT_MS)),
      ]);
      if (!receipt) return { ...base, status: "pending" as const, txHash: tx.hash };
      return { ...base, status: "confirmed" as const, txHash: tx.hash, blockNumber: receipt.blockNumber };
    } catch (e: any) {
      (conn?.contract.runner as NonceManager | null)?.reset?.();
      return { ...base, status: "failed" as const, error: e?.shortMessage || e?.message || String(e) };
    }
  });
}

export interface RecordOptions {
  subject?: string;
  parentId?: string | null;
  /** Deterministic id; defaults to hash(kind, subject, contentHash) so identical records are stored once. */
  id?: string;
}

/** Records `content` on the ledger. Never throws: failures come back as status "failed". */
export async function recordOnLedger(kind: LedgerKind, content: unknown, opts: RecordOptions = {}): Promise<LedgerReceipt | null> {
  const mode = ledgerMode();
  if (mode === "off") return null;
  const subject = opts.subject ?? ZERO_HASH;
  const contentHash = hashJson(content);
  const id = opts.id ?? hashJson({ kind, subject, contentHash });

  try {
    const existing = await getRecord(id);
    if (existing && existing.receipt.status === "confirmed") return existing.receipt;

    const rec: StoredRecord = existing ?? {
      id, kind, subject, parentId: opts.parentId ?? null, contentHash, content,
      createdAt: new Date().toISOString(),
      receipt: { id, kind, contentHash, mode, status: "pending" },
    };
    await putRecord(rec, !existing);
    rec.receipt = await submit(rec);
    await putRecord(rec, false);
    return rec.receipt;
  } catch (e: any) {
    console.error("[ledger] record failed", e);
    return { id, kind, contentHash, mode, status: "failed", error: e?.message || String(e) };
  }
}

// ─── Verification ───────────────────────────────────────────────────────────
export interface VerifyResult {
  id: string;
  found: boolean;
  kind?: LedgerKind;
  mode: LedgerMode;
  status?: LedgerReceipt["status"];
  storedContentHash?: string;
  recomputedContentHash?: string;
  contentIntact?: boolean;          // off-chain content still hashes to what was recorded
  onChain?: {
    exists: boolean;
    contentHash?: string;
    subject?: string;
    parent?: string;
    timestamp?: string;
    blockNumber?: number;
    writer?: string;
    txHash?: string;
    chainIntact?: boolean;          // local mode: whole hash chain re-validated
    contract?: string;
  };
  matchesChain?: boolean;           // recomputed hash == hash on the ledger
  verdict: "VERIFIED" | "TAMPERED" | "PENDING" | "NOT_FOUND" | "UNAVAILABLE";
  explanation: string;
}

async function verifyLocalChain(): Promise<{ ok: boolean; entries: ChainEntry[] }> {
  const entries = await readChain();
  let prev = ZERO_HASH;
  for (const e of entries) {
    const { entryHash, ...body } = e;
    if (e.prevHash !== prev || hashJson(body) !== entryHash) return { ok: false, entries };
    prev = entryHash;
  }
  return { ok: true, entries };
}

async function readOnChain(id: string, mode: LedgerMode): Promise<VerifyResult["onChain"]> {
  if (mode === "local") {
    const { ok, entries } = await verifyLocalChain();
    const e = entries.find(x => x.id === id);
    return e
      ? { exists: true, contentHash: e.contentHash, subject: e.subject, parent: e.parent ?? ZERO_HASH,
          timestamp: e.timestamp, blockNumber: e.seq, txHash: e.entryHash, chainIntact: ok }
      : { exists: false, chainIntact: ok };
  }
  const { readOnly } = besu();
  if (!(await readOnly.exists(id))) return { exists: false, contract: process.env.LEDGER_CONTRACT_ADDRESS };
  const r = await readOnly.get(id);
  return {
    exists: true,
    contentHash: r.contentHash,
    subject: r.subject,
    parent: r.parent,
    timestamp: new Date(Number(r.timestamp) * 1000).toISOString(),
    blockNumber: Number(r.blockNumber),
    writer: r.writer,
    contract: process.env.LEDGER_CONTRACT_ADDRESS,
  };
}

/**
 * Verifies a record. If `content` is supplied (e.g. a downloaded proof bundle) it is
 * hashed instead of the stored copy, so users can check their own copy independently.
 */
export async function verifyRecord(id: string, content?: unknown): Promise<VerifyResult> {
  const mode = ledgerMode();
  const rec = await getRecord(id);
  if (rec && rec.receipt.status !== "confirmed" && mode !== "off") {
    rec.receipt = await submit(rec); // retry records that did not reach the chain earlier
    await putRecord(rec, false);
  }

  const recomputed = content !== undefined ? hashJson(content) : rec ? hashJson(rec.content) : undefined;
  let onChain: VerifyResult["onChain"];
  try {
    onChain = mode === "off" ? undefined : await readOnChain(id, mode);
  } catch (e: any) {
    return {
      id, found: !!rec, kind: rec?.kind, mode, status: rec?.receipt.status, verdict: "UNAVAILABLE",
      explanation: `Could not reach the ledger: ${e?.shortMessage || e?.message || e}`,
    };
  }
  if (onChain && rec?.receipt.txHash && !onChain.txHash) onChain.txHash = rec.receipt.txHash;

  const base = {
    id, mode, found: !!rec || !!onChain?.exists, kind: rec?.kind, status: rec?.receipt.status,
    storedContentHash: rec?.contentHash, recomputedContentHash: recomputed, onChain,
    contentIntact: rec ? hashJson(rec.content) === rec.contentHash : undefined,
  };

  if (!rec && !onChain?.exists) return { ...base, verdict: "NOT_FOUND", explanation: "No record with this id exists." };
  if (!onChain?.exists) {
    return { ...base, verdict: "PENDING", explanation: `The record is stored but not yet confirmed on the ledger (${rec?.receipt.error || "waiting for a block"}).` };
  }
  if (onChain.chainIntact === false) {
    return { ...base, matchesChain: false, verdict: "TAMPERED", explanation: "The local hash chain has been modified: an entry no longer links to the one before it." };
  }
  if (!recomputed) {
    return { ...base, verdict: "VERIFIED", explanation: "The hash is on the ledger; supply the content to check it." };
  }
  const matches = recomputed === onChain.contentHash;
  return {
    ...base,
    matchesChain: matches,
    verdict: matches ? "VERIFIED" : "TAMPERED",
    explanation: matches
      ? `The content hashes to exactly the value written on ${mode === "besu" ? `Hyperledger Besu block ${onChain.blockNumber}` : `local ledger entry #${onChain.blockNumber}`} at ${onChain.timestamp}. It has not been changed since.`
      : "The content does NOT match the hash on the ledger: it was changed after it was recorded.",
  };
}

export async function ledgerHealth(): Promise<{ mode: LedgerMode; ok: boolean; detail: string; chainId?: number; blockNumber?: number; recordCount?: number; contract?: string }> {
  const mode = ledgerMode();
  if (mode === "off") return { mode, ok: true, detail: "Ledger disabled" };
  if (mode === "local") {
    const { ok, entries } = await verifyLocalChain();
    const where = storeBackend() === "redis" ? "stored in Redis" : "stored on this server";
    return { mode, ok, detail: ok ? `Local hash-chained ledger, ${where} (not a blockchain)` : "Local chain integrity check FAILED", recordCount: entries.length };
  }
  try {
    const { readOnly } = besu();
    const provider = readOnly.runner as JsonRpcProvider;
    const [net, block, count] = await Promise.all([provider.getNetwork(), provider.getBlockNumber(), readOnly.recordCount()]);
    return { mode, ok: true, detail: "Hyperledger Besu (QBFT)", chainId: Number(net.chainId), blockNumber: block, recordCount: Number(count), contract: process.env.LEDGER_CONTRACT_ADDRESS };
  } catch (e: any) {
    return { mode, ok: false, detail: `Besu unreachable: ${e?.shortMessage || e?.message || e}` };
  }
}
