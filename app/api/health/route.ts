import { NextResponse } from "next/server";
import { engineHealthy } from "@/lib/server/engineClient";
import { ledgerHealth } from "@/lib/ledger";
import { redisEnabled } from "@/lib/server/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const [engine, ledger] = await Promise.all([engineHealthy(), ledgerHealth()]);
  return NextResponse.json({
    status: "ok",
    engine: { ok: engine, detail: engine ? "Python sandbox online" : "Python engine offline: only unmodified templates can be backtested" },
    ledger,
    ai: { configured: Boolean(process.env.GEMINI_API_KEY) },
    storage: redisEnabled()
      ? { backend: "redis", persistent: true }
      : process.env.VERCEL
        ? { backend: "files", persistent: false, warning: "Running on Vercel without Redis: simulator sessions and ledger records will be lost. Add Upstash Redis from the Vercel Storage tab." }
        : { backend: "files", persistent: true },
  });
}
