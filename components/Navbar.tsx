"use client";
// components/Navbar.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn, LogOut, Menu, Moon, Sun, TrendingUp, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchHealth, Health } from "@/lib/api";

const LINKS = [
  { href: "/live", label: "Live Market" },
  { href: "/learn", label: "Learn" },
  { href: "/builder", label: "Strategy Builder" },
  { href: "/backtest", label: "Backtest" },
  { href: "/simulator", label: "Simulator" },
  { href: "/ledger", label: "Ledger" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, signIn, signOut, error, demoMode } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const ledgerColor = !health ? "var(--text-muted)" : !health.ledger.ok ? "var(--danger)" : health.ledger.mode === "besu" ? "var(--success)" : "var(--warning)";
  const ledgerTitle = health ? `Ledger: ${health.ledger.detail}${health.ledger.blockNumber ? ` (block ${health.ledger.blockNumber})` : ""}` : "Ledger status unknown";

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <Link href="/" className="navbar-brand">
          <TrendingUp size={20} style={{ color: "var(--accent)" }} /> AlgoLearn
        </Link>
        <div className={`navbar-links ${open ? "open" : ""}`}>
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className={`nav-link ${pathname?.startsWith(l.href) ? "active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="navbar-right">
          <Link href="/ledger" className="btn btn-ghost btn-sm" title={ledgerTitle} aria-label={ledgerTitle}>
            <span className="status-dot" style={{ background: ledgerColor }} />
            <span className="small hide-sm">{health?.ledger.mode === "besu" ? "Besu" : health?.ledger.mode === "local" ? "Local ledger" : "Ledger"}</span>
          </Link>
          <button className="btn-icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {user ? (
            <button className="btn btn-secondary btn-sm" onClick={signOut} title={user.isDemo ? "Demo account (data stays in this browser)" : user.email ?? ""}>
              <LogOut size={14} /> <span className="hide-sm">{user.isDemo ? "Demo" : user.displayName?.split(" ")[0] ?? "Sign out"}</span>
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={signIn} title={demoMode ? "Firebase not configured: starts a local demo account" : "Sign in with Google"}>
              <LogIn size={14} /> <span className="hide-sm">{demoMode ? "Try demo" : "Sign in"}</span>
            </button>
          )}
          <button className="btn-icon nav-toggle" onClick={() => setOpen(o => !o)} aria-label="Menu">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
      {error && (
        <div className="container" style={{ paddingBottom: "0.5rem" }}>
          <div className="alert alert-danger small">{error}</div>
        </div>
      )}
    </nav>
  );
}
