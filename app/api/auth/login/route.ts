import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession, endSession, sessionFromToken } from "@/lib/server/accounts";
import { SESSION_COOKIE, setSessionCookie, shortSessionId } from "@/lib/server/auth";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { clientIp } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tooMany = limited(req, "login", 30);
  if (tooMany) return tooMany;
  try {
    const body = await readJson(req, 5_000);
    const account = await authenticate(body.email, body.password, clientIp(req));
    // Whatever session this browser had (possibly someone else's) ends; the login gets a fresh one.
    const previous = await sessionFromToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (previous) await endSession(previous.id, previous.userId);
    const { token, session } = await createSession(account.id, req.headers.get("user-agent"));
    const res = NextResponse.json({ user: account, session: { id: shortSessionId(session.id), createdAt: session.createdAt } }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
