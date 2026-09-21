import { NextRequest, NextResponse } from "next/server";
import { fetchStockDataFromSource } from "@/lib/stockService";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") || "RELIANCE.NS";
    const period = searchParams.get("period") || "1y";

    const data = await fetchStockDataFromSource(symbol, period);
    return NextResponse.json({ symbol, period, data });
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || "Failed to fetch stock data" },
      { status: 400 }
    );
  }
}
