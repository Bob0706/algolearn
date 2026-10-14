import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/ledger/store";
import { getCaller } from "@/lib/server/auth";
import { errorResponse, limited } from "@/lib/server/http";
import { publicView } from "@/lib/server/records";

export const runtime = "nodejs";

/** GET a record's public view. ?proof=1 downloads a self-contained proof bundle. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tooMany = limited(req, "records", 60);
  if (tooMany) return tooMany;
  try {
    const { id } = await ctx.params;
    const caller = await getCaller(req);
    const rec = getRecord(id.toLowerCase());
    if (!rec) return NextResponse.json({ detail: "Record not found." }, { status: 404 });
    const v = publicView(rec, caller.uid ? caller.subject : null);

    if (new URL(req.url).searchParams.get("proof") === "1") {
      if (!v.proofAvailable) return NextResponse.json({ detail: "Only the author can download a strategy's proof bundle." }, { status: 403 });
      const bundle = {
        format: "algolearn-proof-v1",
        id: rec.id,
        kind: rec.kind,
        contentHash: rec.contentHash,
        content: rec.content,
        ledger: { mode: rec.receipt.mode, txHash: rec.receipt.txHash, blockNumber: rec.receipt.blockNumber, contract: process.env.LEDGER_CONTRACT_ADDRESS },
        howToVerify: [
          "1. contentHash = SHA-256 of canonical JSON(content): object keys sorted, no whitespace, UTF-8.",
          "2. On the Besu network call AlgoLedger.verify(id, contentHash) — it must return true.",
          "3. Or POST {id, content} to /api/ledger/verify on any AlgoLearn deployment.",
        ],
      };
      return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="algolearn-proof-${rec.id.slice(2, 12)}.json"` },
      });
    }
    return NextResponse.json(v);
  } catch (err) {
    return errorResponse(err);
  }
}
