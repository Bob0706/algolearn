"use client";
// app/page.tsx — Landing Page

import Link from "next/link";
import {
  TrendingUp, BookOpen, Zap, BarChart2, Gamepad2, Shield,
  ArrowRight, Star, ChevronRight, Brain, Target, Award
} from "lucide-react";

const FEATURES = [
  {
    icon: BookOpen,
    color: "#6366f1",
    bg: "rgba(99,102,241,0.12)",
    title: "Structured Learning",
    desc: "9 short lessons from candlesticks to backtesting pitfalls. No finance background needed.",
    link: "/learn",
  },
  {
    icon: Brain,
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.12)",
    title: "AI Strategy Builder",
    desc: "Describe your trading idea in plain English and get Python code that runs in a secure sandbox.",
    link: "/builder",
  },
  {
    icon: BarChart2,
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.12)",
    title: "Real Data Backtester",
    desc: "Test your exact code on NSE/BSE history with next-day fills, Indian charges, a buy-and-hold benchmark and look-ahead detection.",
    link: "/backtest",
  },
  {
    icon: Gamepad2,
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
    title: "Trade Simulator",
    desc: "Trade a past chart candle by candle with ₹1,00,000 of virtual money while the system flags pattern signals.",
    link: "/simulator",
  },
];

const STRATEGIES = [
  { name: "Moving Average Crossover", level: "Beginner" },
  { name: "RSI Mean Reversion",       level: "Beginner" },
  { name: "MACD Crossover",           level: "Intermediate" },
  { name: "Bollinger Bands",          level: "Intermediate" },
  { name: "Donchian Breakout",        level: "Intermediate" },
  { name: "Supertrend",               level: "Intermediate" },
];

const STEPS = [
  { num: "01", title: "Learn the Basics",    desc: "Go through our structured lessons — no coding or finance background required." },
  { num: "02", title: "Describe Your Idea",  desc: "Tell us your strategy in plain English. We generate Python code you can read and edit." },
  { num: "03", title: "Backtest It",         desc: "Run it on real NSE/BSE data and compare it honestly with buy & hold." },
  { num: "04", title: "Simulate & Practice", desc: "Practice on past charts with a virtual portfolio before using real money." },
];

export default function LandingPage() {
  return (
    <div style={{ overflowX: "hidden" }}>
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />

        <div className="container" style={{ width: "100%" }}>
          <div className="hero-content">
            <div className="hero-badge">
              <Star size={12} fill="currentColor" /> Learn algo trading · Results verifiable on Hyperledger Besu
            </div>

            <h1 className="hero-title">
              Learn Algo Trading <br />
              <span>Without Writing Code</span>
            </h1>

            <p className="hero-subtitle">
              Describe your strategy in plain English. We generate the code, backtest it on real
              NSE &amp; BSE data, and let you practice risk-free with a virtual portfolio.
            </p>

            <div className="hero-cta">
              <Link href="/learn" className="btn btn-lg" style={{ background: "white", color: "#1e1b4b", fontWeight: 700 }}>
                Start Learning Free <ArrowRight size={18} />
              </Link>
              <Link href="/builder" className="btn btn-lg btn-ghost" style={{ border: "1px solid rgba(255,255,255,0.3)", color: "white", backdropFilter: "blur(8px)" }}>
                Try Strategy Builder <Zap size={16} />
              </Link>
            </div>

            {/* Social proof */}
            <div style={{ display: "flex", gap: "2rem", justifyContent: "center", marginTop: "3rem", flexWrap: "wrap" }}>
              {[["50+", "NSE/BSE symbols"], ["7", "Strategy templates"], ["5 years", "Historical data"], ["₹0", "To start"]].map(([val, label]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "white" }}>{val}</div>
                  <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--bg-primary)" }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Platform Features</div>
            <h2 className="section-title">Everything You Need to Trade Algorithmically</h2>
            <p className="section-subtitle">From learning to backtesting — one platform for your complete algo trading journey.</p>
          </div>

          <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))" }}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Link key={f.title} href={f.link} style={{ textDecoration: "none" }}>
                  <div className="card card-interactive" style={{ height: "100%", cursor: "pointer" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem" }}>
                      <Icon size={22} style={{ color: f.color }} />
                    </div>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>{f.title}</h3>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{f.desc}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "1rem", color: f.color, fontSize: "0.8rem", fontWeight: 600 }}>
                      Explore <ChevronRight size={14} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── How it works ──────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--bg-secondary)" }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">How It Works</div>
            <h2 className="section-title">From Zero to Algo Trader in 4 Steps</h2>
          </div>

          <div className="grid-2" style={{ gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))" }}>
            {STEPS.map((step, i) => (
              <div key={step.num} className="card" style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ fontSize: "3rem", fontWeight: 900, color: "var(--border-color)", position: "absolute", top: 12, right: 16, lineHeight: 1, userSelect: "none" }}>
                  {step.num}
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
                  Step {i + 1}
                </div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "0.5rem" }}>{step.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Strategies Preview ────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--bg-primary)" }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Ready-to-Use Strategies</div>
            <h2 className="section-title">Pre-Built Strategies to Get You Started</h2>
            <p className="section-subtitle">Start from a template, then backtest it yourself on the stock and period you choose. No cherry-picked returns.</p>
          </div>

          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 700, margin: "0 auto" }}>
            {STRATEGIES.map((s) => (
              <div key={s.name} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{s.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{s.level}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <Link href="/backtest" style={{ color: "var(--accent)", fontSize: "0.8rem", fontWeight: 600 }}>
                    Try it →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: "2rem" }}>
            <Link href="/builder" className="btn btn-primary btn-lg">
              Build Your Own Strategy <Zap size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Why AlgoLearn ────────────────────────────────────────────── */}
      <section className="section" style={{ background: "var(--bg-secondary)" }}>
        <div className="container">
          <div className="section-header">
            <div className="section-tag">Why AlgoLearn</div>
            <h2 className="section-title">Built for Indian Markets</h2>
          </div>

          <div className="grid-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))" }}>
            {[
              { icon: Target,   color: "#6366f1", title: "NSE & BSE Focused",       desc: "Real data for NIFTY, SENSEX and 50+ Indian stocks, with STT, stamp duty and brokerage built in." },
              { icon: Shield,   color: "#10b981", title: "Verifiable Results",       desc: "Backtests, signals and simulator scores are fingerprinted on a Hyperledger Besu blockchain, so they cannot be quietly edited." },
              { icon: Award,    color: "#f59e0b", title: "Beginner Friendly",        desc: "Guided step-by-step system. Zero prior coding or trading knowledge needed." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="card" style={{ textAlign: "center" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: `${item.color}18`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                    <Icon size={24} style={{ color: item.color }} />
                  </div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.5rem" }}>{item.title}</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ────────────────────────────────────────────────── */}
      <section style={{ background: "var(--accent)", padding: "4rem 0" }}>
        <div className="container" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "white", marginBottom: "0.75rem" }}>
            Ready to Start Your Algo Trading Journey?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: "2rem", fontSize: "1rem" }}>
            Learn, build, backtest and practise: all with virtual money.
          </p>
          <Link href="/learn" className="btn btn-lg" style={{ background: "white", color: "var(--accent)", fontWeight: 700 }}>
            Start for Free Today <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────── */}
      <footer style={{ background: "var(--bg-secondary)", borderTop: "1px solid var(--border-color)", padding: "2rem 0" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 800 }}>
            <TrendingUp size={18} style={{ color: "var(--accent)" }} />
            AlgoLearn India
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            For educational purposes only. Not investment advice. AlgoLearn never places real orders.
          </div>
          <div style={{ display: "flex", gap: "1.25rem" }}>
            {["/learn", "/builder", "/backtest", "/simulator", "/ledger"].map((href) => (
              <Link key={href} href={href} style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {href.slice(1).charAt(0).toUpperCase() + href.slice(2)}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
