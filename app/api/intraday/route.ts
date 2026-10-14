// GET /api/intraday?symbol=TCS.NS&interval=1m|5m|15m&days=1|5 — today's (or 5 days') candles
import { NextRequest, NextResponse } from "next/server";
import { getIntraday, IntradayInterval } from "@/lib/server/marketFeed";
import { InputError, validateSymbol } from "@/lib/stockService";
import { errorResponse, limited } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tooMany = limited(req, "intraday", 120);
  if (tooMany) return tooMany;
  try {
    const q = new URL(req.url).searchParams;
    const symbol = validateSymbol(q.get("symbol"));
    const interval = (q.get("interval") ?? "1m") as IntradayInterval;
    if (!["1m", "5m", "15m"].includes(interval)) throw new InputError("interval must be 1m, 5m or 15m");
    const days = q.get("days") === "5" ? 5 : 1;
    const { bars, source } = await getIntraday(symbol, interval, days);
    return NextResponse.json({ symbol, interval, days, source, bars }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
