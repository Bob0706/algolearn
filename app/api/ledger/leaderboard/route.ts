// Leaderboard of simulator results. Every entry was computed by the server (not
// reported by the browser) and is backed by a ledger record anyone can verify.
import { NextRequest, NextResponse } from "next/server";
import { getRecords, listIndex } from "@/lib/ledger/store";
import { errorResponse, limited } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const tooMany = limited(req, "leaderboard", 60);
  if (tooMany) return tooMany;
  try {
    const entries = await listIndex(e => e.kind === "SIMULATION_RESULT" && !/^0x0+$/.test(e.subject), 2000);
    const rows = (await getRecords(entries.map(e => e.id)))
      .filter(r => r.receipt.status === "confirmed")
      .map(r => {
        const c = r!.content as any;
        return {
          id: r!.id,
          trader: `trader-${r!.subject.slice(2, 8)}`,
          symbol: c.symbol,
          period: c.period,
          returnPct: c.returnPct,
          buyHoldReturnPct: c.buyHoldReturnPct,
          closedTrades: c.closedTrades,
          endDate: c.endDate,
          dataSource: c.dataSource,
          completedFullSession: c.completedFullSession,
          recordedAt: r!.createdAt,
        };
      })
      .filter(r => r.completedFullSession && r.dataSource === "yahoo" && r.closedTrades > 0)
      .sort((a, b) => b.returnPct - a.returnPct)
      .slice(0, 25);
    return NextResponse.json({ rows, rules: "Full-length sessions on real (Yahoo) data with at least one closed trade. Signed-in users only." });
  } catch (err) {
    return errorResponse(err);
  }
}
