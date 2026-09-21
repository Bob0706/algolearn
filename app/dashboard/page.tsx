"use client";
// app/dashboard/page.tsx — User Dashboard

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserStrategies, getUserDoc, signInWithGoogle } from "@/lib/firebase";
import {
  LayoutDashboard, TrendingUp, Target, Award, BookOpen,
  Zap, LogIn, Copy, Check, Trash2, BarChart2
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [strategies, setStrategies] = useState<any[]>([]);
  const [userData,   setUserData]   = useState<any>(null);
  const [copied,     setCopied]     = useState<string | null>(null);
  const [dataLoading,setDataLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    Promise.all([
      getUserStrategies(user.uid),
      getUserDoc(user.uid),
    ]).then(([strats, ud]) => {
      setStrategies(strats);
      setUserData(ud);
    }).finally(() => setDataLoading(false));
  }, [user]);

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: "5rem", textAlign: "center" }}>
          <div style={{ maxWidth: 440, margin: "0 auto" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
              <LayoutDashboard size={32} style={{ color: "var(--accent)" }} />
            </div>
            <h2 style={{ fontWeight: 800, fontSize: "1.5rem", marginBottom: "0.75rem" }}>Sign In to Access Dashboard</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2rem" }}>
              Save your strategies, track learning progress, and view your simulator stats.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => signInWithGoogle()}>
              <LogIn size={18} /> Sign In with Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lessonsCompleted = userData?.lessonsCompleted?.length ?? 0;
  const simStats         = userData?.simulatorStats ?? { totalTrades: 0, wins: 0, losses: 0, totalPnL: 0 };
  const winRate          = simStats.totalTrades > 0 ? ((simStats.wins / (simStats.wins + simStats.losses)) * 100).toFixed(0) : "—";

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        {/* Welcome Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
          {user.photoURL && (
            <img src={user.photoURL} alt="" style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--accent)" }} />
          )}
          <div>
            <h1 className="page-title">Welcome, {user.displayName?.split(" ")[0]}!</h1>
            <p className="page-subtitle">Here&apos;s your algo trading progress dashboard</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid" style={{ marginBottom: "2rem" }}>
          <div className="stat-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <BookOpen size={16} style={{ color: "var(--accent)" }} />
              <span className="stat-label">Lessons Done</span>
            </div>
            <div className="stat-value" style={{ color: "var(--accent)" }}>{lessonsCompleted}<span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>/9</span></div>
            <div className="stat-change">{Math.round(lessonsCompleted / 9 * 100)}% complete</div>
          </div>

          <div className="stat-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Zap size={16} style={{ color: "var(--warning)" }} />
              <span className="stat-label">Strategies Saved</span>
            </div>
            <div className="stat-value" style={{ color: "var(--warning)" }}>{strategies.length}</div>
            <div className="stat-change">strategies built</div>
          </div>

          <div className="stat-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <Target size={16} style={{ color: "var(--success)" }} />
              <span className="stat-label">Sim Win Rate</span>
            </div>
            <div className="stat-value" style={{ color: "var(--success)" }}>{winRate}{winRate !== "—" ? "%" : ""}</div>
            <div className="stat-change">{simStats.wins}W / {simStats.losses}L</div>
          </div>

          <div className="stat-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <TrendingUp size={16} style={{ color: simStats.totalPnL >= 0 ? "var(--success)" : "var(--danger)" }} />
              <span className="stat-label">Sim Total P&L</span>
            </div>
            <div className={`stat-value ${simStats.totalPnL >= 0 ? "positive" : "negative"}`}>
              {simStats.totalPnL >= 0 ? "+" : ""}₹{simStats.totalPnL.toFixed(0)}
            </div>
            <div className="stat-change">{simStats.totalTrades} total trades</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3 className="card-title" style={{ marginBottom: "1rem" }}>Quick Actions</h3>
          <div className="grid-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))" }}>
            {[
              { label: "Continue Learning", href: "/learn",     icon: BookOpen,     color: "#6366f1" },
              { label: "Build Strategy",    href: "/builder",   icon: Zap,          color: "#8b5cf6" },
              { label: "Run Backtest",      href: "/backtest",  icon: BarChart2,    color: "#06b6d4" },
              { label: "Start Simulation",  href: "/simulator", icon: TrendingUp,   color: "#10b981" },
            ].map(action => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} style={{ textDecoration: "none" }}>
                  <div
                    className="card card-interactive"
                    style={{ textAlign: "center", padding: "1.25rem 0.75rem", cursor: "pointer" }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${action.color}18`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
                      <Icon size={20} style={{ color: action.color }} />
                    </div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{action.label}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Learning Progress */}
        <div className="card" style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 className="card-title">Learning Progress</h3>
            <Link href="/learn" className="btn btn-secondary btn-sm">View Lessons</Link>
          </div>
          <div className="progress-bar" style={{ height: 10 }}>
            <div className="progress-bar-fill" style={{ width: `${(lessonsCompleted / 9) * 100}%` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{lessonsCompleted} lessons completed</span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{9 - lessonsCompleted} remaining</span>
          </div>
          {lessonsCompleted === 9 && (
            <div className="badge badge-success" style={{ marginTop: "0.75rem" }}>
              <Award size={13} /> 🎉 All lessons completed!
            </div>
          )}
        </div>

        {/* Saved Strategies */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 className="card-title">Saved Strategies ({strategies.length})</h3>
            <Link href="/builder" className="btn btn-primary btn-sm">
              <Zap size={13} /> Build New
            </Link>
          </div>

          {dataLoading ? (
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <span className="spinner" style={{ margin: "0 auto" }} />
            </div>
          ) : strategies.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
              <Zap size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
              <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>No strategies saved yet</div>
              <div style={{ fontSize: "0.85rem" }}>Go to the Strategy Builder to create your first strategy!</div>
              <Link href="/builder" className="btn btn-primary btn-sm" style={{ marginTop: "1rem", display: "inline-flex" }}>
                Build Strategy
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {strategies.map((s: any) => (
                <div key={s.id} className="card" style={{ padding: "1rem", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.2rem" }}>{s.name}</div>
                      {s.description && <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>{s.description}</div>}
                      {s.symbol && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          <span className="badge badge-accent">{s.symbol}</span>
                          {s.backtestResult && (
                            <span className={`badge ${s.backtestResult.total_return_pct >= 0 ? "badge-success" : "badge-danger"}`}>
                              {s.backtestResult.total_return_pct >= 0 ? "+" : ""}{s.backtestResult.total_return_pct?.toFixed(1)}% return
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
                      <button
                        className="btn-icon"
                        onClick={() => handleCopy(s.code, s.id)}
                        title="Copy code"
                      >
                        {copied === s.id ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
                      </button>
                      <Link href="/backtest" className="btn-icon" title="Backtest this strategy">
                        <BarChart2 size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
