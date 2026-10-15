import { NextRequest, NextResponse } from "next/server";
import { endOtherSessions, endSession, listSessions } from "@/lib/server/accounts";
import { requireUser, shortSessionId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { InputError } from "@/lib/stockService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: this user's active logins. Session ids are shown shortened; full ids never leave the server. */
export async function GET(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const sessions = (await listSessions(me.uid)).map(s => ({
      id: shortSessionId(s.id), device: s.device, createdAt: s.createdAt, expiresAt: s.expiresAt, current: s.id === me.sessionId,
    }));
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE ?id=<short id> ends one session; DELETE ?others=1 ends every session except this one. */
export async function DELETE(req: NextRequest) {
  try {
    const me = await requireUser(req);
    const q = new URL(req.url).searchParams;
    if (q.get("others") === "1") return NextResponse.json({ ended: await endOtherSessions(me.uid, me.sessionId) });
    const short = q.get("id") ?? "";
    const target = (await listSessions(me.uid)).find(s => short.length === 16 && shortSessionId(s.id) === short);
    if (!target) throw new InputError("Session not found.");
    await endSession(target.id, me.uid);
    return NextResponse.json({ ended: 1 });
  } catch (err) {
    return errorResponse(err);
  }
}
