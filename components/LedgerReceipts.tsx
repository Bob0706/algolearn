"use client";
// components/LedgerReceipts.tsx — shows where a result was recorded and links to its verification page

import Link from "next/link";
import { ShieldCheck, ShieldAlert, Clock } from "lucide-react";
import type { LedgerReceipt } from "@/lib/types";

const LABEL: Record<LedgerReceipt["kind"], string> = {
  STRATEGY: "Strategy code",
  BACKTEST: "Backtest result",
  SIGNAL_BATCH: "System signals (committed before you saw them)",
  SIMULATION_RESULT: "Simulation result",
  LIVE_SIGNAL: "Live signal",
};

export default function LedgerReceipts({ receipts, title = "Recorded on the ledger" }: { receipts: (LedgerReceipt | null | undefined)[]; title?: string }) {
  const list = receipts.filter(Boolean) as LedgerReceipt[];
  if (!list.length) return null;
  return (
    <div className="card" style={{ padding: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.6rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <ShieldCheck size={16} style={{ color: "var(--success)" }} /> {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {list.map(r => (
          <div key={r.id} style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.8rem" }}>
            {r.status === "confirmed" ? (
              <span className="badge badge-success"><ShieldCheck size={11} /> {r.mode === "besu" ? `Besu block ${r.blockNumber}` : `Local entry #${r.blockNumber}`}</span>
            ) : r.status === "pending" ? (
              <span className="badge badge-warning"><Clock size={11} /> Pending</span>
            ) : (
              <span className="badge badge-danger" title={r.error}><ShieldAlert size={11} /> Not recorded</span>
            )}
            <span>{LABEL[r.kind]}</span>
            <Link href={`/ledger/${r.id}`} className="hash" style={{ marginLeft: "auto" }}>
              {r.id.slice(0, 10)}…{r.id.slice(-6)} → verify
            </Link>
          </div>
        ))}
      </div>
      {list.some(r => r.mode === "local") && (
        <p className="small muted" style={{ marginTop: "0.6rem" }}>
          Local development ledger: tamper-evident hash chain, not a blockchain. Configure Hyperledger Besu for an independent ledger.
        </p>
      )}
    </div>
  );
}
