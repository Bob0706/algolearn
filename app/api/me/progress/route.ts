import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { errorResponse, readJson } from "@/lib/server/http";
import { completeLesson, getProgress } from "@/lib/server/userData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: lessons completed + simulator totals. POST {lessonId}: mark a lesson complete. */
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    return NextResponse.json(await getProgress(me.uid), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await requireUser(req);
    await completeLesson(me.uid, (await readJson(req, 2_000)).lessonId);
    return NextResponse.json(await getProgress(me.uid));
  } catch (err) {
    return errorResponse(err);
  }
}
