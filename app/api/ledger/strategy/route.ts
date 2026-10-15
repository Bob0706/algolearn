// Records a strategy's code on the ledger (proof of authorship and time).
import { NextRequest, NextResponse } from "next/server";
import { recordOnLedger } from "@/lib/ledger";
import { requireUser } from "@/lib/server/auth";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { strategyContent } from "@/lib/server/records";
import { InputError } from "@/lib/stockService";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tooMany = limited(req, "record-strategy", 20);
  if (tooMany) return tooMany;
  try {
    const caller = await requireUser(req);
    const body = await readJson(req);
    const code = String(body.code ?? "");
    if (!code.trim() || code.length > 20_000) throw new InputError("Strategy code is required (max 20,000 characters).");
    const receipt = await recordOnLedger("STRATEGY", strategyContent(code), { subject: caller.subject });
    return NextResponse.json({ receipt });
  } catch (err) {
    return errorResponse(err);
  }
}
