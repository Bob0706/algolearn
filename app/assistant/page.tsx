"use client";
// app/assistant/page.tsx — Charges Assistant: chatbot + interactive charges calculator

import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import ChargesChat from "@/components/ChargesChat";
import { BreakdownTable } from "@/components/ChatMessage";
import {
  BROKER_PLANS, BrokerPlan, ChargeInput, ChargeInputError, Exchange, RATES_AS_OF, SEGMENTS, Segment, calculateCharges, defaultExchange, inr,
} from "@/lib/charges";

interface Form { segment: Segment; exchange: Exchange; plan: BrokerPlan; quantity: string; buyPrice: string; sellPrice: string }

const toForm = (i: ChargeInput): Form => ({
  segment: i.segment,
  exchange: i.exchange ?? defaultExchange(i.segment),
  plan: i.plan ?? "discount",
  quantity: String(i.quantity),
  buyPrice: i.buyPrice ? String(i.buyPrice) : "",
  sellPrice: i.sellPrice ? String(i.sellPrice) : "",
});

export default function AssistantPage() {
  const [form, setForm] = useState<Form>({ segment: "equity_intraday", exchange: "NSE", plan: "discount", quantity: "100", buyPrice: "500", sellPrice: "520" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  const exchanges = Object.keys(SEGMENTS[form.segment].exchangePct) as Exchange[];

  const result = useMemo(() => {
    try {
      return {
        calc: calculateCharges({
          segment: form.segment, exchange: form.exchange, plan: form.plan,
          quantity: Number(form.quantity), buyPrice: Number(form.buyPrice) || undefined, sellPrice: Number(form.sellPrice) || undefined,
        }),
      };
    } catch (e) {
      return { error: e instanceof ChargeInputError ? e.message : "Check the numbers." };
    }
  }, [form]);

  const changeSegment = (segment: Segment) =>
    setForm(f => ({ ...f, segment, exchange: SEGMENTS[segment].exchangePct[f.exchange] !== undefined ? f.exchange : defaultExchange(segment) }));

  const calc = result.calc;
  const premium = SEGMENTS[form.segment].premium;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
          <div>
            <h1 className="page-title">Charges Assistant</h1>
            <p className="page-subtitle">Ask anything about brokerage, STT, stamp duty, GST, DP charges and taxes, or calculate the exact cost of a trade on NSE, BSE or MCX.</p>
          </div>
        </div>

        <div className="assistant-layout">
          <ChargesChat onCalc={i => setForm(toForm(i))} />

          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
              <Calculator size={18} style={{ color: "var(--accent)" }} />
              <h2 className="card-title">Charges calculator</h2>
            </div>
            <div className="grid-2" style={{ gap: "0.75rem" }}>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label" htmlFor="seg">Segment</label>
                <select id="seg" className="form-select" value={form.segment} onChange={e => changeSegment(e.target.value as Segment)}>
                  {(Object.keys(SEGMENTS) as Segment[]).map(s => <option key={s} value={s}>{SEGMENTS[s].label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="exch">Exchange</label>
                <select id="exch" className="form-select" value={form.exchange} onChange={e => set("exchange", e.target.value as Exchange)}>
                  {exchanges.map(x => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="plan">Broker</label>
                <select id="plan" className="form-select" value={form.plan} onChange={e => set("plan", e.target.value as BrokerPlan)}>
                  {(Object.keys(BROKER_PLANS) as BrokerPlan[]).map(p => <option key={p} value={p}>{BROKER_PLANS[p].label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label" htmlFor="qty">Quantity {premium || form.segment.includes("futures") ? "(total units = lots × lot size)" : "(shares)"}</label>
                <input id="qty" className="form-input" inputMode="decimal" value={form.quantity} onChange={e => set("quantity", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="buy">Buy {premium ? "premium" : "price"} (₹)</label>
                <input id="buy" className="form-input" inputMode="decimal" value={form.buyPrice} onChange={e => set("buyPrice", e.target.value)} placeholder="optional" />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="sell">Sell {premium ? "premium" : "price"} (₹)</label>
                <input id="sell" className="form-input" inputMode="decimal" value={form.sellPrice} onChange={e => set("sellPrice", e.target.value)} placeholder="optional" />
              </div>
            </div>

            {result.error ? (
              <div className="alert alert-warning" style={{ marginTop: "1rem" }}>{result.error}</div>
            ) : calc && (
              <>
                <div className="stats-grid" style={{ marginTop: "1.1rem", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem" }}>
                  <div className="stat-card" style={{ padding: "0.75rem" }}>
                    <div className="stat-label">Total charges</div>
                    <div className="stat-value" style={{ fontSize: "1.25rem" }}>{inr(calc.total)}</div>
                    <div className="stat-change">{calc.chargesPct}% of turnover</div>
                  </div>
                  {calc.netPnl !== undefined && (
                    <div className="stat-card" style={{ padding: "0.75rem" }}>
                      <div className="stat-label">Net P&amp;L</div>
                      <div className={`stat-value ${calc.netPnl >= 0 ? "positive" : "negative"}`} style={{ fontSize: "1.25rem" }}>{inr(calc.netPnl)}</div>
                      <div className="stat-change">gross {inr(calc.grossPnl!)}</div>
                    </div>
                  )}
                  {calc.breakevenPoints !== undefined && (
                    <div className="stat-card" style={{ padding: "0.75rem" }}>
                      <div className="stat-label">Breakeven</div>
                      <div className="stat-value" style={{ fontSize: "1.25rem" }}>{inr(calc.breakevenPoints)}</div>
                      <div className="stat-change">per unit</div>
                    </div>
                  )}
                </div>
                <BreakdownTable calc={calc} />
                <p className="small muted" style={{ marginTop: "0.6rem" }}>Turnover {inr(calc.turnover)}. Statutory rates as of {RATES_AS_OF}. Brokerage and DP charges use typical values; check your broker&apos;s tariff.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
