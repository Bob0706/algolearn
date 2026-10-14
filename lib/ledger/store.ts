// lib/ledger/store.ts — off-chain record store (the content behind each on-chain hash).
//
// Files under LEDGER_DATA_DIR (default ./.ledger-data):
//   records/<id>.json   full record incl. content and latest receipt
//   index.jsonl         one line per record, for listing
//   chain.jsonl         hash-chained append-only log (LEDGER_MODE=local only)
// For multi-instance production deployments, swap this for Postgres/Firestore —
// the ledger only needs get/put/list.

import fs from "node:fs";
import path from "node:path";
import { LedgerKind, LedgerReceipt } from "../types";

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

const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.LEDGER_DATA_DIR || ".ledger-data");
const ID_RE = /^0x[0-9a-f]{64}$/;

function ensureDirs() {
  fs.mkdirSync(path.join(dataDir(), "records"), { recursive: true });
}

export function isRecordId(id: string): boolean {
  return ID_RE.test(id);
}

export function getRecord(id: string): StoredRecord | null {
  if (!isRecordId(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir(), "records", `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function putRecord(rec: StoredRecord, isNew: boolean) {
  ensureDirs();
  const file = path.join(dataDir(), "records", `${rec.id}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(rec));
  fs.renameSync(file + ".tmp", file);
  if (isNew) {
    const entry: IndexEntry = { id: rec.id, kind: rec.kind, subject: rec.subject, createdAt: rec.createdAt };
    fs.appendFileSync(path.join(dataDir(), "index.jsonl"), JSON.stringify(entry) + "\n");
  }
}

export function listIndex(filter: (e: IndexEntry) => boolean = () => true, limit = 50): IndexEntry[] {
  let text = "";
  try {
    text = fs.readFileSync(path.join(dataDir(), "index.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out: IndexEntry[] = [];
  const lines = text.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    if (!lines[i]) continue;
    const e = JSON.parse(lines[i]) as IndexEntry;
    if (filter(e)) out.push(e);
  }
  return out;
}

// ─── local hash chain ───────────────────────────────────────────────────────
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

export function readChain(): ChainEntry[] {
  try {
    return fs
      .readFileSync(path.join(dataDir(), "chain.jsonl"), "utf8")
      .trimEnd()
      .split("\n")
      .filter(Boolean)
      .map(l => JSON.parse(l));
  } catch {
    return [];
  }
}

export function appendChain(entry: ChainEntry) {
  ensureDirs();
  fs.appendFileSync(path.join(dataDir(), "chain.jsonl"), JSON.stringify(entry) + "\n");
}
