import { NextResponse } from "next/server";
import { STRATEGY_TEMPLATES } from "@/lib/marketData";

export async function GET() {
  const templates = Object.entries(STRATEGY_TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
    code: t.code,
  }));
  return NextResponse.json({ templates });
}
