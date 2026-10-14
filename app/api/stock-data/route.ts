import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/stockService";
import { errorResponse, limited } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  const tooMany = limited(req, "stock-data", 60);
  if (tooMany) return tooMany;
  try {
    const { searchParams } = new URL(req.url);
    const m = await getMarketData(searchParams.get("symbol") ?? "RELIANCE.NS", searchParams.get("period") ?? "1y");
    return NextResponse.json({ symbol: m.symbol, period: m.period, source: m.source, data_hash: m.dataHash, data: m.bars });
  } catch (err) {
    return errorResponse(err);
  }
}
