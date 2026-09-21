import { NextResponse } from "next/server";
import { POPULAR_SYMBOLS } from "@/lib/marketData";

export async function GET() {
  return NextResponse.json({ symbols: POPULAR_SYMBOLS });
}
