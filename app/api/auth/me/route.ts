import { NextRequest, NextResponse } from "next/server";
import { resolveCaller, shortSessionId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const c = await resolveCaller(req);
    return NextResponse.json(
      c.uid ? { user: { id: c.uid, name: c.name, email: c.email }, session: { id: shortSessionId(c.sessionId!), createdAt: c.session!.createdAt, expiresAt: c.session!.expiresAt } } : { user: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
