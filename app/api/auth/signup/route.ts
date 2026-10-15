import { NextRequest, NextResponse } from "next/server";
import { createAccount, createSession } from "@/lib/server/accounts";
import { setSessionCookie, shortSessionId } from "@/lib/server/auth";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { clientIp } from "@/lib/server/rateLimit";
import { kv } from "@/lib/server/kv";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tooMany = limited(req, "signup", 10);
  if (tooMany) return tooMany;
  try {
    if ((await kv().incr(`rl:signup:ip:${clientIp(req)}`, 3600)) > 10) {
      return NextResponse.json({ detail: "Too many sign-ups from this network. Please try again later." }, { status: 429 });
    }
    const body = await readJson(req, 5_000);
    const account = await createAccount(body.name, body.email, body.password);
    const { token, session } = await createSession(account.id, req.headers.get("user-agent"));
    const res = NextResponse.json({ user: account, session: { id: shortSessionId(session.id), createdAt: session.createdAt } }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
