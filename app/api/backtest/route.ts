import { NextRequest, NextResponse } from "next/server";
import { fetchStockDataFromSource } from "@/lib/stockService";
import { executeBacktest } from "@/lib/backtestEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = body.symbol || "RELIANCE.NS";
    const period = body.period || "1y";
    const strategyCode = body.strategy_code || "";
    const initialCapital = Number(body.initial_capital) || 100000;

    if (!strategyCode.trim()) {
      return NextResponse.json({ detail: "Strategy code is required" }, { status: 400 });
    }

    const bars = await fetchStockDataFromSource(symbol, period);
    if (!bars || bars.length < 10) {
      return NextResponse.json({ detail: "Not enough historical data for backtesting" }, { status: 400 });
    }

    const result = executeBacktest(bars, strategyCode, initialCapital);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { detail: err?.message || "Backtest execution failed" },
      { status: 400 }
    );
  }
}
