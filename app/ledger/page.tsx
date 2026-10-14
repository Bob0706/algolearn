"use client";
// app/ledger/page.tsx — ledger explorer, verification and verified leaderboard

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Blocks, Search, ShieldCheck, Trophy } from "lucide-react";
import { fetchHealth, fetchLeaderboard, fetchRecords, Health, LeaderboardRow, LedgerRecordView } from "@/lib/api";
import type { LedgerKind } from "@/lib/types";

const KINDS: { value: LedgerKind | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "BACKTEST", label: "Backtests" },
  { value: "SIMULATION_RESULT", label: "Simulations" },
  { value: "SIGNAL_BATCH", label: "Signal batches" },
  { value: "LIVE_SIGNAL", label: "Live signals" },
  { value: "STRATEGY", label: "Strategies" },
];

function describe(r: LedgerRecordView): string {
  const c = r.content ?? {};
  switch (r.kind) {
    case "BACKTEST": return `${c.symbol} ${c.period}: ${c.total_return_pct}% (buy & hold ${c.buy_hold_return_pct}%), ${c.trades} orders${c.lookahead ? " — LOOK-AHEAD" : ""}`;
    case "SIMULATION_RESULT": return `${c.symbol} ${c.period}: ${c.returnPct}% vs buy & hold ${c.buyHoldReturnPct}%, ${c.closedTrades} closed trades`;
    case "SIGNAL_BATCH": return `${c.symbol} ${c.period}: ${c.signalCount} signals (${c.engine})`;
    case "LIVE_SIGNAL": return `${c.symbol} ${c.date}: ${c.type} — ${c.pattern} @ ₹${c.close}`;
    case "STRATEGY": return `${c.lines ?? "?"} lines of code`;
  }
}

export default function LedgerPage() {
  const router = useRouter();
  const [health, setHealth] = useState<Health | null>(null);
  const [kind, setKind] = useState<LedgerKind | "">("");
  const [records, setRecords] = useState<LedgerRecordView[] | null>(null);
  const [board, setBoard] = useState<{ rows: LeaderboardRow[]; rules: string } | null>(null);
  const [id, setId] = useState("");
  const [idError, setIdError] = useState("");

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
    fetchLeaderboard().then(setBoard).catch(() => setBoard(null));
  }, []);

  useEffect(() => {
    setRecords(null);
    fetchRecords({ kind: kind || undefined, limit: 30 }).then(r => setRecords(r.records)).catch(() => setRecords([]));
  }, [kind]);

  const go = () => {
    const v = id.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(v)) { setIdError("A record id looks like 0x followed by 64 hex characters."); return; }
    router.push(`/ledger/${v}`);
  };

  const l = health?.ledger;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
          <div>
            <h1 className="page-title">Ledger Explorer</h1>
            <p className="page-subtitle">Every backtest, signal batch and simulator score is fingerprinted on Hyperledger Besu. Check any of them.</p>
          </div>
        </div>

        <div className="two-col" style={{ marginBottom: "1.5rem" }}>
          <div className="card">
            <h2 className="card-title" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.8rem" }}>
              <Blocks size={17} style={{ color: "var(--accent)" }} /> Network
            </h2>
            {!l ? <span className="spinner" /> : (
              <dl className="kv">
                <dt>Mode</dt>
                <dd>
                  <span className={`badge ${!l.ok ? "badge-danger" : l.mode === "besu" ? "badge-success" : "badge-warning"}`}>
                    {l.mode === "besu" ? "Hyperledger Besu" : l.mode === "local" ? "Local dev ledger" : "Off"}
                  </span>
                </dd>
                <dt>Status</dt><dd>{l.detail}</dd>
                {l.chainId !== undefined && <><dt>Chain id</dt><dd>{l.chainId}</dd></>}
                {l.blockNumber !== undefined && <><dt>Latest block</dt><dd>{l.blockNumber.toLocaleString()}</dd></>}
                {l.recordCount !== undefined && <><dt>Records</dt><dd>{l.recordCount.toLocaleString()}</dd></>}
                {l.contract && <><dt>Contract</dt><dd className="hash">{l.contract}</dd></>}
              </dl>
            )}
            {l?.mode === "local" && (
              <p className="small muted" style={{ marginTop: "0.8rem" }}>
                Running without a Besu node. Records are kept in a tamper-evident hash chain on this server. See the README to start Hyperledger Besu with <code>npm run besu:up</code>.
              </p>
            )}
          </div>

          <div className="card">
            <h2 className="card-title" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.8rem" }}>
              <Search size={17} style={{ color: "var(--accent)" }} /> Verify a record
            </h2>
            <div className="form-group">
              <label className="form-label" htmlFor="rid">Record id</label>
              <input id="rid" className="form-input mono" placeholder="0x…" value={id} onChange={e => { setId(e.target.value); setIdError(""); }} onKeyDown={e => e.key === "Enter" && go()} />
            </div>
            {idError && <p className="small negative" style={{ marginTop: "0.4rem" }}>{idError}</p>}
            <button className="btn btn-primary" style={{ marginTop: "0.8rem" }} onClick={go}><ShieldCheck size={16} /> Verify</button>
            <p className="small muted" style={{ marginTop: "0.8rem" }}>
              Verification recomputes the SHA-256 fingerprint of the stored content and compares it with the value written on-chain. You can also upload your own copy of a proof bundle.
            </p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 className="card-title" style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
            <Trophy size={17} style={{ color: "var(--warning)" }} /> Verified simulator leaderboard
          </h2>
          <p className="small muted" style={{ marginBottom: "0.8rem" }}>{board?.rules ?? "Scores are computed by the server, never reported by the browser."}</p>
          {!board ? <span className="spinner" /> : !board.rows.length ? (
            <p className="small muted">No qualifying sessions yet. Finish a full simulation on real data while signed in.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Trader</th><th>Stock</th><th>Return</th><th>Buy & hold</th><th>Trades</th><th>Proof</th></tr></thead>
                <tbody>
                  {board.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td><td className="mono small">{r.trader}</td><td>{r.symbol} <span className="muted small">{r.period}</span></td>
                      <td className={r.returnPct >= 0 ? "positive" : "negative"}>{r.returnPct.toFixed(2)}%</td>
                      <td>{r.buyHoldReturnPct.toFixed(2)}%</td><td>{r.closedTrades}</td>
                      <td><Link href={`/ledger/${r.id}`} className="small">verify →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.6rem", marginBottom: "0.8rem" }}>
            <h2 className="card-title">Recent records</h2>
            <div className="tabs" style={{ flexWrap: "wrap" }}>
              {KINDS.map(k => <button key={k.value} className={`tab-btn ${kind === k.value ? "active" : ""}`} onClick={() => setKind(k.value)}>{k.label}</button>)}
            </div>
          </div>
          {!records ? <span className="spinner" /> : !records.length ? <p className="small muted">No records yet.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Type</th><th>Summary</th><th>Status</th><th>Time</th><th></th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td><span className="badge badge-muted">{r.kind.replace("_", " ").toLowerCase()}</span></td>
                      <td className="small">{describe(r)}{r.content?.dataSource === "synthetic" ? <span className="badge badge-warning" style={{ marginLeft: 6 }}>synthetic</span> : null}</td>
                      <td>
                        <span className={`badge ${r.receipt.status === "confirmed" ? "badge-success" : r.receipt.status === "pending" ? "badge-warning" : "badge-danger"}`}>
                          {r.receipt.status === "confirmed" ? (r.receipt.mode === "besu" ? `block ${r.receipt.blockNumber}` : `entry #${r.receipt.blockNumber}`) : r.receipt.status}
                        </span>
                      </td>
                      <td className="small muted">{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                      <td><Link href={`/ledger/${r.id}`} className="small">verify →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
