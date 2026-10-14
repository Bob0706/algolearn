import { NextRequest, NextResponse } from "next/server";
import { verifyRecord } from "@/lib/ledger";
import { isRecordId } from "@/lib/ledger/store";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { InputError } from "@/lib/stockService";

export const runtime = "nodejs";

function checkId(id: unknown): string {
  const s = String(id ?? "").trim().toLowerCase();
  if (!isRecordId(s)) throw new InputError("A record id is a 0x-prefixed 64-character hex string.");
  return s;
}

/** GET ?id=0x…  — verify the stored copy against the ledger */
export async function GET(req: NextRequest) {
  const tooMany = limited(req, "verify", 60);
  if (tooMany) return tooMany;
  try {
    return NextResponse.json(await verifyRecord(checkId(new URL(req.url).searchParams.get("id"))));
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { id, content } — verify YOUR copy (e.g. a downloaded proof bundle) against the ledger */
export async function POST(req: NextRequest) {
  const tooMany = limited(req, "verify", 60);
  if (tooMany) return tooMany;
  try {
    const body = await readJson(req, 2_000_000);
    if (body.content === undefined) throw new InputError("Provide the record content to verify.");
    return NextResponse.json(await verifyRecord(checkId(body.id), body.content));
  } catch (err) {
    return errorResponse(err);
  }
}
