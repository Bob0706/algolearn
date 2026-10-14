// lib/ledger/canonical.ts — deterministic hashing shared by the ledger and its verifiers.

import { createHash } from "node:crypto";

/** JSON with sorted object keys and no undefined values, so equal data ⇒ equal bytes. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const val = (v as Record<string, unknown>)[k];
      if (val !== undefined) out[k] = sortDeep(val);
    }
    return out;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

/** 0x-prefixed SHA-256, i.e. a Solidity bytes32. */
export function sha256Hex(data: string): string {
  return "0x" + createHash("sha256").update(data, "utf8").digest("hex");
}

export const hashJson = (value: unknown) => sha256Hex(canonicalJson(value));

export const ZERO_HASH = "0x" + "0".repeat(64);
