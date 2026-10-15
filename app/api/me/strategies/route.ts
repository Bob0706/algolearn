import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { listStrategies, saveStrategy } from "@/lib/server/userData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    return NextResponse.json({ strategies: await listStrategies(me.uid) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const tooMany = limited(req, "save-strategy", 30);
  if (tooMany) return tooMany;
  try {
    const me = await requireUser(req);
    return NextResponse.json({ strategy: await saveStrategy(me.uid, await readJson(req, 60_000)) });
  } catch (err) {
    return errorResponse(err);
  }
}
