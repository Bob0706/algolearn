// lib/ledger/store.ts — off-chain record store (the content behind each on-chain hash).
//
// Two backends with the same async API:
//   Redis  when Upstash/Vercel KV is configured (required on serverless hosts like Vercel,
//          whose instances share no memory or disk). Keys: ledger:rec:<id>, ledger:index,
//          ledger:chain, ledger:chainseq:<id>.
//   Files  otherwise, under LEDGER_DATA_DIR (default ./.ledger-data, /tmp on Vercel):
//            records/<id>.json   full record incl. content and latest receipt
//            index.jsonl         one line per record, for listing
//            chain.jsonl         hash-chained append-only log (LEDGER_MODE=local only)

import fs from "node:fs";
import path from "node:path";
import { LedgerKind, LedgerReceipt } from "../types";
import { redis, redisEnabled, redisPipeline, withRedisLock } from "../server/redis";

export interface StoredRecord {
  id: string;
  kind: LedgerKind;
  subject: string;
  parentId: string | null;
  contentHash: string;
  content: unknown;
  createdAt: string;
  receipt: LedgerReceipt;
}

export interface IndexEntry {
  id: string;
  kind: LedgerKind;
  subject: string;
  createdAt: string;
}

export interface ChainEntry {
  seq: number;
  id: string;
  kind: LedgerKind;
  contentHash: string;
  subject: string;
  parent: string | null;
  timestamp: string;
  prevHash: string;
  entryHash: string;
}

const ID_RE = /^0x[0-9a-f]{64}$/;
const MAX_INDEX_SCAN = 5000;

export function isRecordId(id: string): boolean {
  return ID_RE.test(id);
}

export function defaultDataDir(name: string): string {
  return process.env.VERCEL ? path.join("/tmp", name) : name;
}

const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.LEDGER_DATA_DIR || defaultDataDir(".ledger-data"));

export const storeBackend = () => (redisEnabled() ? "redis" : "files");

// ─── file backend ───────────────────────────────────────────────────────
const files = {
  ensure() {
    fs.mkdirSync(path.join(dataDir(), "records"), { recursive: true });
  },
  get(id: string): StoredRecord | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir(), "records", `${id}.json`), "utf8"));
    } catch {
      return null;
    }
  },
  put(rec: StoredRecord, isNew: boolean) {
    this.ensure();
    const file = path.join(dataDir(), "records", `${rec.id}.json`);
    fs.writeFileSync(file + ".tmp", JSON.stringify(rec));
    fs.renameSync(file + ".tmp", file);
    if (isNew) {
      const entry: IndexEntry = { id: rec.id, kind: rec.kind, subject: rec.subject, createdAt: rec.createdAt };
      fs.appendFileSync(path.join(dataDir(), "index.jsonl"), JSON.stringify(entry) + "\n");
    }
  },
  index(): IndexEntry[] {
    try {
      return fs.readFileSync(path.join(dataDir(), "index.jsonl"), "utf8").trimEnd().split("\n").filter(Boolean).map(l => JSON.parse(l));
    } catch {
      return [];
    }
  },
  chain(): ChainEntry[] {
    try {
      return fs.readFileSync(path.join(dataDir(), "chain.jsonl"), "utf8").trimEnd().split("\n").filter(Boolean).map(l => JSON.parse(l));
    } catch {
      return [];
    }
  },
  append(entry: ChainEntry) {
    this.ensure();
    fs.appendFileSync(path.join(dataDir(), "chain.jsonl"), JSON.stringify(entry) + "\n");
  },
};

// ─── public async API ──────────────────────────────────────────────────

export async function getRecord(id: string): Promise<StoredRecord | null> {
  if (!isRecordId(id)) return null;
  if (!redisEnabled()) return files.get(id);
  const raw = await redis<string | null>(["GET", `ledger:rec:${id}`]);
  return raw ? JSON.parse(raw) : null;
}

export async function putRecord(rec: StoredRecord, isNew: boolean): Promise<void> {
  if (!redisEnabled()) return files.put(rec, isNew);
  const entry: IndexEntry = { id: rec.id, kind: rec.kind, subject: rec.subject, createdAt: rec.createdAt };
  await redisPipeline([
    ["SET", `ledger:rec:${rec.id}`, JSON.stringify(rec)],
    ...(isNew ? [["RPUSH", "ledger:index", JSON.stringify(entry)]] : []),
  ]);
}

/** Newest first. */
export async function listIndex(filter: (e: IndexEntry) => boolean = () => true, limit = 50): Promise<IndexEntry[]> {
  const all: IndexEntry[] = redisEnabled()
    ? (await redis<string[]>(["LRANGE", "ledger:index", -MAX_INDEX_SCAN, -1])).map(l => JSON.parse(l))
    : files.index();
  const out: IndexEntry[] = [];
  for (let i = all.length - 1; i >= 0 && out.length < limit; i--) if (filter(all[i])) out.push(all[i]);
  return out;
}

export async function getRecords(ids: string[]): Promise<StoredRecord[]> {
  if (!ids.length) return [];
  if (!redisEnabled()) return ids.map(id => files.get(id)).filter(Boolean) as StoredRecord[];
  const raws = await redis<(string | null)[]>(["MGET", ...ids.map(id => `ledger:rec:${id}`)]);
  return raws.filter(Boolean).map(r => JSON.parse(r!));
}

export async function readChain(): Promise<ChainEntry[]> {
  if (!redisEnabled()) return files.chain();
  return (await redis<string[]>(["LRANGE", "ledger:chain", 0, -1])).map(l => JSON.parse(l));
}

/**
 * Appends to the local hash chain under a cross-instance lock. `build` receives the current
 * last entry (or null) and the existing entry for `id` if already chained.
 */
export async function appendChainLocked(
  id: string,
  build: (last: ChainEntry | null) => ChainEntry,
): Promise<ChainEntry> {
  if (!redisEnabled()) {
    const chain = files.chain();
    const existing = chain.find(e => e.id === id);
    if (existing) return existing;
    const entry = build(chain[chain.length - 1] ?? null);
    files.append(entry);
    return entry;
  }
  return withRedisLock("ledger:chain", async () => {
    const [seq, lastRaw] = await redisPipeline([["GET", `ledger:chainseq:${id}`], ["LINDEX", "ledger:chain", -1]]);
    if (seq) return JSON.parse(await redis<string>(["LINDEX", "ledger:chain", Number(seq) - 1]));
    const entry = build(lastRaw ? JSON.parse(lastRaw) : null);
    await redisPipeline([["RPUSH", "ledger:chain", JSON.stringify(entry)], ["SET", `ledger:chainseq:${id}`, entry.seq]]);
    return entry;
  });
}
