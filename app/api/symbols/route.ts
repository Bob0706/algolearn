// GET /api/symbols?q=tata&exchange=NSE|BSE|INDEX|ALL&limit=20 — search every NSE/BSE listing
import { NextRequest, NextResponse } from "next/server";
import { getUniverse, searchInstruments } from "@/lib/server/universe";
import { errorResponse, limited } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds; data download + sandbox run can exceed the 10 s default on serverless hosts

export async function GET(req: NextRequest) {
  const tooMany = limited(req, "symbols", 240);
  if (tooMany) return tooMany;
  try {
    const q = new URL(req.url).searchParams;
    const u = await getUniverse();
    const results = searchInstruments(u, (q.get("q") ?? "").slice(0, 60), {
      exchange: q.get("exchange") ?? undefined,
      limit: Number(q.get("limit")) || 20,
    });
    return NextResponse.json({
      results,
      total: u.instruments.length,
      counts: u.counts,
      complete: u.complete,
      updatedAt: u.updatedAt,
      note: u.complete ? undefined
        : !u.updatedAt ? "The NSE/BSE company lists could not be downloaded yet, so only a built-in list of large caps is searchable."
        : !u.counts.bse ? "BSE's company list could not be downloaded right now, so only NSE companies are searchable. It is retried automatically."
        : "NSE's company list could not be downloaded right now, so only BSE companies are searchable. It is retried automatically.",
      errors: u.errors,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
