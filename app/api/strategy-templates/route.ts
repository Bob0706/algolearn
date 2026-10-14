import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/strategyTemplates";

export async function GET() {
  return NextResponse.json({ templates: listTemplates() });
}
