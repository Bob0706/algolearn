import { NextRequest, NextResponse } from "next/server";
import { endSession, sessionFromToken } from "@/lib/server/accounts";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

/** Ends only this browser's session; the user's other devices stay signed in. */
export async function POST(req: NextRequest) {
  try {
    const s = await sessionFromToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (s) await endSession(s.id, s.userId);
    const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
