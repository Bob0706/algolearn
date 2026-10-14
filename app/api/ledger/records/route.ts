import { NextRequest, NextResponse } from "next/server";
import { listIndex, getRecord } from "@/lib/ledger/store";
import { getCaller } from "@/lib/server/auth";
import { errorResponse, limited } from "@/lib/server/http";
import { publicView } from "@/lib/server/records";
import { LedgerKind } from "@/lib/types";

export const runtime = "nodejs";
const KINDS: LedgerKind[] = ["STRATEGY", "BACKTEST", "SIGNAL_BATCH", "SIMULATION_RESULT", "LIVE_SIGNAL"];

/** GET ?kind=BACKTEST&mine=1&limit=20 */
export async function GET(req: NextRequest) {
  const tooMany = limited(req, "records", 60);
  if (tooMany) return tooMany;
  try {
    const caller = await getCaller(req);
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind") as LedgerKind | null;
    const mine = q.get("mine") === "1";
    if (mine && !caller.uid) return NextResponse.json({ records: [], note: "Sign in to see your records." });
    const limit = Math.min(100, Math.max(1, Number(q.get("limit")) || 25));
    const entries = listIndex(
      e => (!kind || !KINDS.includes(kind) || e.kind === kind) && (!mine || e.subject === caller.subject),
      limit,
    );
    const records = entries.map(e => getRecord(e.id)).filter(Boolean).map(r => {
      const v = publicView(r!, caller.uid ? caller.subject : null);
      return { ...v, content: summarise(v.kind, v.content) };
    });
    return NextResponse.json({ records });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Short, list-friendly summary of a record's content. */
function summarise(kind: LedgerKind, c: any) {
  switch (kind) {
    case "BACKTEST":
      return { symbol: c.symbol, period: c.period, dataSource: c.dataSource, engine: c.engine, total_return_pct: c.summary?.total_return_pct, buy_hold_return_pct: c.summary?.buy_hold_return_pct, trades: c.summary?.total_trades, lookahead: c.lookahead?.uses_future_data };
    case "SIMULATION_RESULT":
      return { symbol: c.symbol, period: c.period, dataSource: c.dataSource, returnPct: c.returnPct, buyHoldReturnPct: c.buyHoldReturnPct, closedTrades: c.closedTrades, completedFullSession: c.completedFullSession };
    case "SIGNAL_BATCH":
      return { symbol: c.symbol, period: c.period, dataSource: c.dataSource, engine: c.engine, signalCount: c.signalCount };
    case "LIVE_SIGNAL":
      return { symbol: c.symbol, date: c.date, type: c.type, pattern: c.pattern, close: c.close };
    case "STRATEGY":
      return { codeHash: c.codeHash, lines: c.lines };
  }
}
