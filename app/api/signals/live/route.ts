// Today's system signal for a symbol, computed on the latest real data and recorded on
// the ledger once per symbol per trading day — a timestamped, unalterable prediction
// whose outcome anyone can check later.
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, limited } from "@/lib/server/http";
import { getMarketData } from "@/lib/stockService";
import { analyzeCandlePatterns, SIGNAL_ENGINE_VERSION } from "@/lib/signalEngine";
import { recordOnLedger } from "@/lib/ledger";
import { hashJson } from "@/lib/ledger/canonical";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds; data download + sandbox run can exceed the 10 s default on serverless hosts

export async function GET(req: NextRequest) {
  const tooMany = limited(req, "live-signal", 30);
  if (tooMany) return tooMany;
  try {
    const { searchParams } = new URL(req.url);
    const market = await getMarketData(searchParams.get("symbol") ?? "^NSEI", "6mo");
    const lastBar = market.bars[market.bars.length - 1];
    const signals = analyzeCandlePatterns(market.bars);
    const today = signals.find(s => s.date === lastBar.date) ?? null;
    const previous = [...signals].reverse().find(s => s.date !== lastBar.date) ?? null;

    let ledger = null;
    if (today && market.source === "yahoo") {
      ledger = await recordOnLedger("LIVE_SIGNAL", {
        schema: "algolearn.live-signal.v1",
        engine: SIGNAL_ENGINE_VERSION,
        symbol: market.symbol,
        date: today.date,
        type: today.type,
        pattern: today.pattern,
        strength: today.strength,
        close: lastBar.close,
        dataHash: market.dataHash,
      }, { id: hashJson({ kind: "LIVE_SIGNAL", symbol: market.symbol, date: today.date, engine: SIGNAL_ENGINE_VERSION }) });
    }
    return NextResponse.json({
      symbol: market.symbol,
      dataSource: market.source,
      asOf: lastBar.date,
      close: lastBar.close,
      signal: today,
      previousSignal: previous,
      ledger,
      note: market.source === "synthetic" ? "Live data unavailable: synthetic prices shown, signal not recorded." : market.note,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
