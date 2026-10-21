// lib/charges.ts — Indian trading charges: rate card + calculator.
//
// One source of truth for the charges assistant (chat answers, calculator UI and the AI prompt).
// Statutory rates (STT/CTT, stamp duty, SEBI fee, GST) are the same at every broker; exchange
// transaction charges depend on the exchange; brokerage and DP charges depend on the broker plan.
// Rates as of RATES_AS_OF. Update this file when the exchange, SEBI or the Finance Act changes them.

export const RATES_AS_OF = "1 April 2026";

export type Segment =
  | "equity_delivery"
  | "equity_intraday"
  | "equity_futures"
  | "equity_options"
  | "currency_futures"
  | "currency_options"
  | "commodity_futures"
  | "commodity_options";

export type Exchange = "NSE" | "BSE" | "MCX";
export type BrokerPlan = "discount" | "full_service";

interface SegmentRates {
  label: string;
  /** STT for equity/F&O, CTT for commodities, none for currency; % of turnover (premium for options). */
  tax: { name: "STT" | "CTT" | null; buyPct: number; sellPct: number };
  stampBuyPct: number;
  /** Exchange transaction charge incl. investor-protection fund (IPFT), % of turnover. */
  exchangePct: Partial<Record<Exchange, number>>;
  /** Price is a premium (options): turnover = premium × quantity. */
  premium: boolean;
}

export const SEGMENTS: Record<Segment, SegmentRates> = {
  equity_delivery: {
    label: "Equity delivery",
    tax: { name: "STT", buyPct: 0.1, sellPct: 0.1 },
    stampBuyPct: 0.015,
    exchangePct: { NSE: 0.00307, BSE: 0.00375 },
    premium: false,
  },
  equity_intraday: {
    label: "Equity intraday",
    tax: { name: "STT", buyPct: 0, sellPct: 0.025 },
    stampBuyPct: 0.003,
    exchangePct: { NSE: 0.00307, BSE: 0.00375 },
    premium: false,
  },
  equity_futures: {
    label: "Equity / index futures",
    tax: { name: "STT", buyPct: 0, sellPct: 0.05 },
    stampBuyPct: 0.002,
    exchangePct: { NSE: 0.00183, BSE: 0 },
    premium: false,
  },
  equity_options: {
    label: "Equity / index options",
    tax: { name: "STT", buyPct: 0, sellPct: 0.15 },
    stampBuyPct: 0.003,
    exchangePct: { NSE: 0.03553, BSE: 0.0325 },
    premium: true,
  },
  currency_futures: {
    label: "Currency futures",
    tax: { name: null, buyPct: 0, sellPct: 0 },
    stampBuyPct: 0.0001,
    exchangePct: { NSE: 0.00035, BSE: 0.00045 },
    premium: false,
  },
  currency_options: {
    label: "Currency options",
    tax: { name: null, buyPct: 0, sellPct: 0 },
    stampBuyPct: 0.0001,
    exchangePct: { NSE: 0.0311, BSE: 0.001 },
    premium: true,
  },
  commodity_futures: {
    label: "Commodity futures (non-agri)",
    tax: { name: "CTT", buyPct: 0, sellPct: 0.01 },
    stampBuyPct: 0.002,
    exchangePct: { MCX: 0.0021 },
    premium: false,
  },
  commodity_options: {
    label: "Commodity options",
    tax: { name: "CTT", buyPct: 0, sellPct: 0.05 },
    stampBuyPct: 0.003,
    exchangePct: { MCX: 0.0418 },
    premium: true,
  },
};

export const SEBI_FEE_PCT = 0.0001; // ₹10 per crore
export const GST_PCT = 18; // on brokerage + exchange charges + SEBI fee (+ DP charges)
export const DP_CHARGE = 13.5; // ₹ per scrip per day a delivery holding is sold (typical; + GST)
export const OPTIONS_EXERCISE_STT_PCT = 0.15; // of intrinsic value, on exercised ITM long options

interface Brokerage { pct: number; cap: number; flat?: number }

export const BROKER_PLANS: Record<BrokerPlan, { label: string; perOrder: Record<Segment, Brokerage> }> = {
  discount: {
    label: "Discount broker (₹20 / order)",
    perOrder: {
      equity_delivery: { pct: 0, cap: 0 },
      equity_intraday: { pct: 0.03, cap: 20 },
      equity_futures: { pct: 0.03, cap: 20 },
      equity_options: { pct: 0, cap: 20, flat: 20 },
      currency_futures: { pct: 0.03, cap: 20 },
      currency_options: { pct: 0, cap: 20, flat: 20 },
      commodity_futures: { pct: 0.03, cap: 20 },
      commodity_options: { pct: 0, cap: 20, flat: 20 },
    },
  },
  full_service: {
    label: "Full-service broker (% of turnover)",
    perOrder: {
      equity_delivery: { pct: 0.5, cap: Infinity },
      equity_intraday: { pct: 0.05, cap: Infinity },
      equity_futures: { pct: 0.05, cap: Infinity },
      equity_options: { pct: 0, cap: Infinity, flat: 50 },
      currency_futures: { pct: 0.05, cap: Infinity },
      currency_options: { pct: 0, cap: Infinity, flat: 50 },
      commodity_futures: { pct: 0.05, cap: Infinity },
      commodity_options: { pct: 0, cap: Infinity, flat: 50 },
    },
  },
};

export interface ChargeInput {
  segment: Segment;
  exchange?: Exchange;
  quantity: number;
  buyPrice?: number;
  sellPrice?: number;
  plan?: BrokerPlan;
}

export interface ChargeLine { key: string; label: string; amount: number; note?: string }

export interface ChargeBreakdown {
  input: Required<Pick<ChargeInput, "segment" | "exchange" | "quantity" | "plan">> & { buyPrice?: number; sellPrice?: number };
  segmentLabel: string;
  planLabel: string;
  buyTurnover: number;
  sellTurnover: number;
  turnover: number;
  lines: ChargeLine[];
  total: number;
  /** Gross P&L (sell − buy) when both legs are given. */
  grossPnl?: number;
  netPnl?: number;
  /** Points the price must move per unit to cover all charges (both legs given). */
  breakevenPoints?: number;
  /** Charges as % of turnover. */
  chargesPct: number;
}

export class ChargeInputError extends Error {}

const r2 = (n: number) => Math.round(n * 100) / 100;

function brokerageFor(turnover: number, b: Brokerage): number {
  if (turnover <= 0) return 0;
  if (b.flat !== undefined) return b.flat;
  return Math.min((turnover * b.pct) / 100, b.cap);
}

export function defaultExchange(segment: Segment): Exchange {
  return segment.startsWith("commodity") ? "MCX" : "NSE";
}

export function calculateCharges(raw: ChargeInput): ChargeBreakdown {
  const seg = SEGMENTS[raw.segment];
  if (!seg) throw new ChargeInputError("Unknown segment.");
  const plan = raw.plan ?? "discount";
  let exchange = raw.exchange ?? defaultExchange(raw.segment);
  if (seg.exchangePct[exchange] === undefined) exchange = defaultExchange(raw.segment);
  const qty = Number(raw.quantity);
  if (!Number.isFinite(qty) || qty <= 0) throw new ChargeInputError("Quantity must be a positive number.");
  const valid = (p?: number) => p !== undefined && p !== null && Number.isFinite(Number(p)) && Number(p) > 0;
  const buyPrice = valid(raw.buyPrice) ? Number(raw.buyPrice) : undefined;
  const sellPrice = valid(raw.sellPrice) ? Number(raw.sellPrice) : undefined;
  if (buyPrice === undefined && sellPrice === undefined) throw new ChargeInputError("Give a buy price, a sell price, or both.");

  const buyT = buyPrice ? buyPrice * qty : 0;
  const sellT = sellPrice ? sellPrice * qty : 0;
  const turnover = buyT + sellT;
  const b = BROKER_PLANS[plan].perOrder[raw.segment];

  const brokerage = brokerageFor(buyT, b) + brokerageFor(sellT, b);
  const tax = (buyT * seg.tax.buyPct + sellT * seg.tax.sellPct) / 100;
  const exch = (turnover * (seg.exchangePct[exchange] ?? 0)) / 100;
  const sebi = (turnover * SEBI_FEE_PCT) / 100;
  const stamp = (buyT * seg.stampBuyPct) / 100;
  const dp = raw.segment === "equity_delivery" && sellT > 0 ? DP_CHARGE : 0;
  const gst = ((brokerage + exch + sebi + dp) * GST_PCT) / 100;

  const lines: ChargeLine[] = [
    { key: "brokerage", label: "Brokerage", amount: r2(brokerage), note: BROKER_PLANS[plan].label },
  ];
  if (seg.tax.name) {
    const side = seg.tax.buyPct && seg.tax.sellPct ? "buy & sell" : "sell side";
    lines.push({ key: "tax", label: seg.tax.name, amount: r2(tax), note: `${seg.tax.sellPct}% on ${side}${seg.premium ? " (premium)" : ""}` });
  }
  lines.push(
    { key: "exchange", label: `Exchange transaction charge (${exchange})`, amount: r2(exch), note: `${seg.exchangePct[exchange]}% of turnover` },
    { key: "sebi", label: "SEBI turnover fee", amount: r2(sebi), note: "₹10 per crore" },
    { key: "stamp", label: "Stamp duty", amount: r2(stamp), note: `${seg.stampBuyPct}% on buy side` },
  );
  if (dp) lines.push({ key: "dp", label: "DP charge", amount: r2(dp), note: "per scrip on the day you sell delivery shares" });
  lines.push({ key: "gst", label: "GST", amount: r2(gst), note: "18% on brokerage, exchange, SEBI & DP charges" });

  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  const out: ChargeBreakdown = {
    input: { segment: raw.segment, exchange, quantity: qty, plan, buyPrice, sellPrice },
    segmentLabel: seg.label,
    planLabel: BROKER_PLANS[plan].label,
    buyTurnover: r2(buyT),
    sellTurnover: r2(sellT),
    turnover: r2(turnover),
    lines,
    total,
    chargesPct: turnover ? Math.round((total / turnover) * 100 * 1000) / 1000 : 0,
  };
  if (buyT && sellT) {
    out.grossPnl = r2(sellT - buyT);
    out.netPnl = r2(sellT - buyT - total);
    out.breakevenPoints = r2(total / qty);
  }
  return out;
}

export const inr = (n: number) =>
  (n < 0 ? "-₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

/** Plain-text rate card, used in the AI prompt and the "show all rates" answer. */
export function rateCardText(): string {
  const rows = (Object.keys(SEGMENTS) as Segment[]).map(k => {
    const s = SEGMENTS[k];
    const tax = s.tax.name
      ? `${s.tax.name} ${s.tax.buyPct ? `${s.tax.buyPct}% buy & ` : ""}${s.tax.sellPct}% sell${s.premium ? " on premium" : ""}`
      : "no STT/CTT";
    const ex = Object.entries(s.exchangePct).map(([e, p]) => `${e} ${p}%`).join(", ");
    const d = BROKER_PLANS.discount.perOrder[k];
    const brk = d.flat !== undefined ? `flat ₹${d.flat}/order` : d.pct === 0 ? "₹0" : `${d.pct}% or ₹${d.cap}/order, whichever lower`;
    return `- ${s.label}: ${tax}; stamp duty ${s.stampBuyPct}% buy side; exchange txn ${ex}; typical discount brokerage ${brk}.`;
  });
  return [
    `Indian trading charges (rates as of ${RATES_AS_OF}):`,
    ...rows,
    `- SEBI turnover fee: ${SEBI_FEE_PCT}% (₹10 per crore) on all segments.`,
    `- GST: ${GST_PCT}% on brokerage + exchange transaction charges + SEBI fee (+ DP charges). Not on STT or stamp duty.`,
    `- DP charge: about ₹${DP_CHARGE} + GST per scrip per day when delivery shares are sold (broker-specific).`,
    `- STT on exercised in-the-money long options: ${OPTIONS_EXERCISE_STT_PCT}% of intrinsic value.`,
  ].join("\n");
}
