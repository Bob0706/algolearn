// GET /api/quote?symbol=RELIANCE.NS — latest traded price
import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/server/marketFeed";
import { validateSymbol } from "@/lib/stockService";
import { errorResponse, limited } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tooMany = limited(req, "quote", 240);
  if (tooMany) return tooMany;
  try {
    const symbol = validateSymbol(new URL(req.url).searchParams.get("symbol"));
    return NextResponse.json(await getQuote(symbol), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
