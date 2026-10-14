// lib/server/records.ts — the exact content that gets hashed onto the ledger, per record kind,
// and what of it may be shown publicly.

import { hashJson, sha256Hex } from "../ledger/canonical";
import { StoredRecord } from "../ledger/store";

export const strategyContent = (code: string) => ({ schema: "algolearn.strategy.v1", code });

export const codeHash = (code: string) => sha256Hex(code);

/** Public view of a stored record. Strategy source code is only shown to its owner. */
export function publicView(rec: StoredRecord, viewerSubject: string | null) {
  const owner = viewerSubject !== null && viewerSubject === rec.subject && !/^0x0+$/.test(rec.subject);
  let content: unknown = rec.content;
  if (rec.kind === "STRATEGY" && !owner) {
    const code = (rec.content as any)?.code ?? "";
    content = { schema: (rec.content as any)?.schema, codeHash: codeHash(code), lines: code.split("\n").length, code: "(hidden: only the author can see the source)" };
  }
  return {
    id: rec.id,
    kind: rec.kind,
    subject: rec.subject,
    parentId: rec.parentId,
    contentHash: rec.contentHash,
    createdAt: rec.createdAt,
    receipt: rec.receipt,
    content,
    isOwner: owner,
    /** A proof bundle lets anyone re-hash the content themselves. Only complete when content is not redacted. */
    proofAvailable: rec.kind !== "STRATEGY" || owner,
  };
}

export { hashJson };
