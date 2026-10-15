"use client";
// app/dashboard/page.tsx — user dashboard

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart2, BookOpen, Check, Copy, LayoutDashboard, LogIn, Monitor, ShieldCheck, Target, Trash2, TrendingUp, UserPlus, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ActiveSession, deleteMyStrategy, endOtherSessions, endSessionById, fetchMyStrategies, fetchProgress, fetchRecords,
  fetchSessions, LedgerRecordView, Progress, SavedStrategy,
} from "@/lib/api";
import { setHandoff } from "@/lib/handoff";
import { LESSONS } from "@/lib/lessons";

const KIND_LABEL: Record<string, string> = {
  STRATEGY: "Strategy", BACKTEST: "Backtest", SIMULATION_RESULT: "Simulation", SIGNAL_BATCH: "Signals", LIVE_SIGNAL: "Live signal",
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, sessionId, loading } = useAuth();
  const uid = user?.id;
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [userData, setUserData] = useState<Progress | null>(null);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [records, setRecords] = useState<LedgerRecordView[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // a different login never sees the previous one's data, even for a moment
    setStrategies([]); setUserData(null); setRecords([]); setSessions([]); setError("");
    if (!uid) return;
    setBusy(true);
    Promise.all([fetchMyStrategies(), fetchProgress(), fetchRecords({ mine: true, limit: 20 }), fetchSessions()])
      .then(([s, d, r, ss]) => { setStrategies(s.strategies); setUserData(d); setRecords(r.records); setSessions(ss.sessions); })
      .catch(e => setError(e?.message || "Could not load your data."))
      .finally(() => setBusy(false));
  }, [uid, sessionId]);

  const reloadSessions = () => fetchSessions().then(r => setSessions(r.sessions)).catch(e => setError(e?.message || "Could not load sessions."));
  const endOne = async (id: string) => { try { await endSessionById(id); } catch (e: any) { setError(e?.message); } reloadSessions(); };
  const endOthers = async () => { try { await endOtherSessions(); } catch (e: any) { setError(e?.message); } reloadSessions(); };
  const removeStrategy = async (id: string) => {
    if (!confirm("Delete this saved strategy?")) return;
    try { await deleteMyStrategy(id); setStrategies(list => list.filter(s => s.id !== id)); } catch (e: any) { setError(e?.message || "Could not delete."); }
  };

  if (loading) return <div className="page" style={{ display: "grid", placeItems: "center" }}><span className="spinner spinner-lg" /></div>;

  if (!user) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: "5rem", textAlign: "center", maxWidth: 480 }}>
          <LayoutDashboard size={40} style={{ color: "var(--accent)", margin: "0 auto 1rem" }} />
          <h1 style={{ fontWeight: 800, fontSize: "1.5rem" }}>Log in to see your dashboard</h1>
          <p className="muted" style={{ margin: "0.75rem 0 1.5rem" }}>Save strategies, track lessons and simulator stats, and see your verified ledger records.</p>
          <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/login?next=/dashboard" className="btn btn-primary btn-lg"><LogIn size={18} /> Log in</Link>
            <Link href="/login?mode=signup&next=/dashboard" className="btn btn-secondary btn-lg"><UserPlus size={18} /> Create account</Link>
          </div>
        </div>
      </div>
    );
  }

  const lessonsDone = userData?.lessonsCompleted.length ?? 0;
  const st = userData?.simulatorStats ?? { sessions: 0, totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 };
  const closed = st.wins + st.losses;
  const winRate = closed > 0 ? `${Math.round((st.wins / closed) * 100)}%` : "—";

  const copy = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
          <span className="avatar" style={{ width: 48, height: 48, fontSize: "1.3rem" }}>{user.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <h1 className="page-title">Welcome, {user.name.split(" ")[0]}!</h1>
            <p className="page-subtitle">{user.email} · your progress is saved to your account, not this browser.</p>
          </div>
        </div>
        {error && <div className="alert alert-danger small" style={{ marginBottom: "1rem" }}>{error}</div>}

        <div className="stats-grid" style={{ marginBottom: "1.5rem" }}>
          <div className="stat-card">
            <span className="stat-label"><BookOpen size={13} style={{ display: "inline" }} /> Lessons</span>
            <div className="stat-value" style={{ color: "var(--accent)" }}>{lessonsDone}<span className="muted" style={{ fontSize: "1rem" }}>/{LESSONS.length}</span></div>
            <div className="progress-bar" style={{ marginTop: "0.4rem" }}><div className="progress-bar-fill" style={{ width: `${(lessonsDone / LESSONS.length) * 100}%` }} /></div>
          </div>
          <div className="stat-card">
            <span className="stat-label"><Zap size={13} style={{ display: "inline" }} /> Strategies saved</span>
            <div className="stat-value" style={{ color: "var(--warning)" }}>{strategies.length}</div>
          </div>
          <div className="stat-card">
            <span className="stat-label"><Target size={13} style={{ display: "inline" }} /> Simulator win rate</span>
            <div className="stat-value" style={{ color: "var(--success)" }}>{winRate}</div>
            <div className="stat-change">{st.wins}W / {st.losses}L across {st.sessions} session{st.sessions === 1 ? "" : "s"}</div>
          </div>
          <div className="stat-card">
            <span className="stat-label"><TrendingUp size={13} style={{ display: "inline" }} /> Simulator total P&L</span>
            <div className={`stat-value ${st.totalPnL >= 0 ? "positive" : "negative"}`}>{st.totalPnL >= 0 ? "+" : ""}₹{Math.round(st.totalPnL).toLocaleString("en-IN")}</div>
            <div className="stat-change">{st.totalTrades} orders</div>
          </div>
        </div>

        <div className="two-col">
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="card-title">Saved strategies</h2>
              <Link href="/builder" className="btn btn-primary btn-sm"><Zap size={13} /> New</Link>
            </div>
            {busy ? <span className="spinner" /> : !strategies.length ? (
              <p className="small muted">Nothing saved yet. Build a strategy, then press Save.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {strategies.map(s => (
                  <div key={s.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "0.75rem", display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{s.name}</div>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                        {s.symbol && <span className="badge badge-accent">{s.symbol}</span>}
                        {typeof s.backtestResult?.total_return_pct === "number" && (
                          <span className={`badge ${(s.backtestResult.total_return_pct as number) >= 0 ? "badge-success" : "badge-danger"}`}>
                            {(s.backtestResult.total_return_pct as number).toFixed(1)}% backtested
                          </span>
                        )}
                        {s.ledgerId && <Link href={`/ledger/${s.ledgerId}`} className="badge badge-success"><ShieldCheck size={11} /> on ledger</Link>}
                      </div>
                    </div>
                    <button className="btn-icon" title="Copy code" onClick={() => copy(s.code, s.id)}>{copied === s.id ? <Check size={14} /> : <Copy size={14} />}</button>
                    <button className="btn-icon" title="Backtest this strategy" onClick={() => { setHandoff({ code: s.code, name: s.name }); router.push("/backtest"); }}>
                      <BarChart2 size={14} />
                    </button>
                    <button className="btn-icon" title="Delete" onClick={() => removeStrategy(s.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="card-title">My ledger records</h2>
              <Link href="/ledger" className="btn btn-secondary btn-sm">Explorer</Link>
            </div>
            {!records.length ? (
              <p className="small muted">Run a backtest or finish a simulation to create verifiable records.</p>
            ) : (
              <table className="table">
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td><span className="badge badge-muted">{KIND_LABEL[r.kind]}</span></td>
                      <td className="small">{r.content?.symbol ?? ""} {typeof r.content?.total_return_pct === "number" ? `${r.content.total_return_pct}%` : typeof r.content?.returnPct === "number" ? `${r.content.returnPct}%` : ""}</td>
                      <td className="small muted">{new Date(r.createdAt).toLocaleDateString("en-IN")}</td>
                      <td><Link href={`/ledger/${r.id}`} className="small">verify →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", gap: "0.5rem", flexWrap: "wrap" }}>
            <div>
              <h2 className="card-title">Active sessions</h2>
              <p className="small muted">Every login gets its own isolated session. End any you don&apos;t recognise.</p>
            </div>
            {sessions.length > 1 && <button className="btn btn-secondary btn-sm" onClick={endOthers}>Sign out all other sessions</button>}
          </div>
          <table className="table">
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td><Monitor size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> {s.device} {s.current && <span className="badge badge-success">this browser</span>}</td>
                  <td className="small muted">signed in {new Date(s.createdAt).toLocaleString("en-IN")}</td>
                  <td className="small muted hide-sm">expires {new Date(s.expiresAt).toLocaleDateString("en-IN")}</td>
                  <td style={{ textAlign: "right" }}>{!s.current && <button className="btn btn-ghost btn-sm" onClick={() => endOne(s.id)}>Sign out</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>
    </div>
  );
}
