import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/http";
import { deleteStrategy } from "@/lib/server/userData";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireUser(req);
    await deleteStrategy(me.uid, (await ctx.params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
