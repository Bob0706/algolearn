import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/server/auth";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { stepSession } from "@/lib/server/simulator";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tooMany = limited(req, "sim-step", 600);
  if (tooMany) return tooMany;
  try {
    const caller = await getCaller(req);
    const body = await readJson(req);
    return NextResponse.json(await stepSession(caller, body));
  } catch (err) {
    return errorResponse(err);
  }
}
