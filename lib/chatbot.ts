// lib/chatbot.ts — rule-based brain of the trading-charges assistant.
//
// Works with no API key: it parses trades out of plain English ("buy 100 at 500, sell at 520 intraday"),
// runs lib/charges.ts on them, and answers other questions from the knowledge base. The /api/chat route
// can layer an LLM on top, but always feeds it these deterministic numbers.

import {
  BrokerPlan, ChargeBreakdown, ChargeInput, ChargeInputError, Exchange, Segment, calculateCharges, inr, rateCardText,
} from "./charges";
import { KNOWLEDGE, KnowledgeEntry, SMALL_TALK, STARTER_QUESTIONS } from "./chargesKnowledge";

export interface ChatReply {
  reply: string;
  calc?: ChargeBreakdown;
  /** Trade to remember for follow-ups ("what about delivery?"). Send it back with the next message. */
  context?: ChargeInput;
  suggestions: string[];
  /** Knowledge-base entry or handler that produced the answer. */
  matched: string;
}

// ── number parsing ───────────────────────────────────────────────────────

const UNIT = "(k|thousand|l|lakhs?|lacs?|cr|crores?)";
const NUM = `(\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)\\s*${UNIT}?(?![a-z])`;
const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

export function toNumber(digits: string, unit?: string): number {
  const n = parseFloat(digits.replace(/,/g, ""));
  return unit ? n * (MULT[unit.toLowerCase()] ?? 1) : n;
}

const CUR = "(?:rs\\.?|inr|₹)?\\s*";

// ── trade parsing ────────────────────────────────────────────────────────

export interface ParsedTrade {
  segment?: Segment;
  segmentGuessed?: boolean;
  exchange?: Exchange;
  plan?: BrokerPlan;
  quantity?: number;
  buyPrice?: number;
  sellPrice?: number;
  lots?: number;
  turnover?: number;
  hasNumbers: boolean;
}

function detectSegment(t: string): Segment | undefined {
  const currency = /\b(currency|usd ?inr|eur ?inr|gbp ?inr|jpy ?inr|forex|cds)\b/.test(t);
  const commodity = /\b(commodit(y|ies)|mcx|crude|gold|silver|natural ?gas|copper|zinc|aluminium|ctt)\b/.test(t);
  const options = /\b(options?|calls?|puts?|ce|pe|premium|strike)\b/.test(t);
  const futures = /\b(futures?|fut)\b/.test(t);
  if (currency) return options ? "currency_options" : "currency_futures";
  if (commodity) return options ? "commodity_options" : "commodity_futures";
  if (options) return "equity_options";
  if (futures) return "equity_futures";
  if (/\b(intra-?day|mis|day ?trad(e|ing)|same day)\b/.test(t)) return "equity_intraday";
  if (/\b(delivery|cnc|long ?term|hold(ing)?|invest(ment|ing)?)\b/.test(t)) return "equity_delivery";
  return undefined;
}

const ACTION = /\b(buy|bought|buying|purchase[sd]?|purchasing|entry|enter|entered|long|cover|covered|sell|sold|selling|exit|exited|short|shorted|square[- ]?off|target)\b/gi;
const SELL_WORDS = /^(sell|sold|selling|exit|exited|short|shorted|square[- ]?off|target)$/i;
const PRICE_ONLY_WORDS = /^(entry|enter|entered|exit|exited|cover|covered|target)$/i;

export function parseTrade(message: string): ParsedTrade {
  const t = message.toLowerCase().replace(/[’']/g, "");
  const out: ParsedTrade = { hasNumbers: /\d/.test(t) };

  out.segment = detectSegment(t);
  if (/\bbse\b|\bsensex\b|\bbankex\b/.test(t)) out.exchange = "BSE";
  else if (/\bmcx\b/.test(t)) out.exchange = "MCX";
  else if (/\bnse\b|\bnifty\b/.test(t)) out.exchange = "NSE";
  if (/\bfull[- ]?service|traditional broker|percentage brokerage\b/.test(t)) out.plan = "full_service";
  else if (/\bdiscount broker|flat ₹?20|flat rs\.? ?20\b/.test(t)) out.plan = "discount";

  // quantity: "qty 100", "100 shares", "3 lots, lot size 75"
  const qtyWord = t.match(new RegExp(`\\b(?:qty|quantity|qnty)\\s*(?:of|is|=|:|-)?\\s*${NUM}`));
  const qtyUnit = t.match(new RegExp(`${NUM}\\s*(?:shares?|stocks?|units?|qty|quantity|nos?)\\b`));
  if (qtyWord) out.quantity = toNumber(qtyWord[1], qtyWord[2]);
  else if (qtyUnit) out.quantity = toNumber(qtyUnit[1], qtyUnit[2]);
  const lots = t.match(new RegExp(`${NUM}\\s*lots?\\b`));
  const lotSize = t.match(new RegExp(`\\blot\\s*size\\s*(?:of|is|=|:|-)?\\s*${NUM}`));
  if (lots && !out.quantity) {
    out.lots = toNumber(lots[1], lots[2]);
    if (lotSize) out.quantity = out.lots * toNumber(lotSize[1], lotSize[2]);
  }

  // "from 500 to 520"
  const range = t.match(new RegExp(`\\bfrom\\s*${CUR}${NUM}\\s*(?:to|-)\\s*${CUR}${NUM}`));
  if (range) {
    const a = toNumber(range[1], range[2]);
    const b = toNumber(range[3], range[4]);
    if (/\b(short|shorted)\b/.test(t)) { out.sellPrice = a; out.buyPrice = b; } else { out.buyPrice = a; out.sellPrice = b; }
  }

  // Each action word owns the text up to the next action word.
  const actions = [...t.matchAll(ACTION)];
  actions.forEach((m, i) => {
    const word = m[1];
    const clause = t.slice(m.index! + m[0].length, i + 1 < actions.length ? actions[i + 1].index : t.length);
    const isSell = SELL_WORDS.test(word);
    const priceAt = clause.match(new RegExp(`(?:\\bat\\b|@|\\bprice\\s*(?:of|is|=|:)?|\\brate\\b|\\bfor\\b)\\s*${CUR}${NUM}`));
    const lead = clause.match(new RegExp(`^\\s*${CUR}${NUM}`));
    let price: number | undefined;
    if (priceAt) {
      price = toNumber(priceAt[1], priceAt[2]);
      if (lead && !out.quantity && !/^\s*(rs|inr|₹)/.test(clause) && !/\b(?:lots?)\b/.test(clause.slice(0, 20))) {
        const q = toNumber(lead[1], lead[2]);
        if (q !== price) out.quantity = q;
      }
    } else if (lead && !new RegExp(`^\\s*${NUM}\\s*(?:shares?|stocks?|units?|lots?|qty)\\b`).test(clause)) {
      const n = toNumber(lead[1], lead[2]);
      if (PRICE_ONLY_WORDS.test(word) || out.quantity !== undefined || out.lots !== undefined || /^\s*(rs|inr|₹)/.test(clause)) price = n;
      else out.quantity = n;
    }
    if (price === undefined) return;
    if (isSell) out.sellPrice ??= price;
    else out.buyPrice ??= price;
  });

  // "turnover of ₹1 lakh", "₹50,000 trade"
  const turnover =
    t.match(new RegExp(`\\b(?:turnover|worth|value|trade size|order size|order value|amount|investment|capital)\\s*(?:of|is|=|:)?\\s*${CUR}${NUM}`)) ||
    t.match(new RegExp(`(?:rs\\.?|inr|₹)\\s*${NUM}(?:\\s+[a-z&]+){0,2}?\\s+(?:worth|trade|order|turnover|investment)\\b`)) ||
    t.match(new RegExp(`\\b${NUM}\\s*(?:rupees?|rs)\\s*(?:worth|trade|order|turnover|of)\\b`));
  if (turnover) out.turnover = toNumber(turnover[1], turnover[2]);

  return out;
}

const FOLLOW_UP = /\b(what about|how about|what if|and if|instead|same|compare|switch|change (it )?to|and (on|for|with|in))\b/;
const DEFINITION = /\b(what is|what are|whats|explain|meaning|define|why|how (is|are|does|do))\b/;

/** Merge a parsed message into the remembered trade. Returns the full input or what's missing. */
function resolveTrade(p: ParsedTrade, message: string, context?: ChargeInput):
  { input: ChargeInput; notes: string[] } | { missing: string; partial: boolean } | null {
  const t = message.toLowerCase();
  const notes: string[] = [];
  const hasTradeNumbers = p.quantity !== undefined || p.buyPrice !== undefined || p.sellPrice !== undefined || p.turnover !== undefined;
  const changesSetting = p.segment || p.exchange || p.plan;

  // Follow-up on the previous calculation ("what about delivery?", "what if I sell at 530?")
  const newTrade =
    (p.quantity !== undefined && (p.buyPrice !== undefined || p.sellPrice !== undefined)) ||
    p.turnover !== undefined || p.lots !== undefined ||
    (p.buyPrice !== undefined && p.sellPrice !== undefined && !FOLLOW_UP.test(t));
  const followUp = !!context && !newTrade && (
    (hasTradeNumbers && (FOLLOW_UP.test(t) || message.length < 50)) ||
    (!!changesSetting && (FOLLOW_UP.test(t) || (message.length < 30 && !DEFINITION.test(t))))
  );
  if (context && followUp) {
    const input: ChargeInput = {
      ...context,
      segment: p.segment ?? context.segment,
      exchange: p.exchange ?? (p.segment && p.segment !== context.segment ? undefined : context.exchange),
      plan: p.plan ?? context.plan,
      quantity: p.quantity ?? context.quantity,
      buyPrice: p.buyPrice ?? context.buyPrice,
      sellPrice: p.sellPrice ?? context.sellPrice,
    };
    return { input, notes };
  }

  if (!hasTradeNumbers) return null;

  let { quantity, buyPrice, sellPrice } = p;
  if (p.turnover && buyPrice === undefined && sellPrice === undefined) {
    quantity = 1;
    const onlySell = /\b(sell|sold|selling|exit)\b/.test(t) && !/\b(buy|bought|buying|round ?trip|both)\b/.test(t);
    const onlyBuy = /\b(buy|bought|buying|purchase)\b/.test(t) && !/\b(sell|sold|selling|round ?trip|both)\b/.test(t);
    if (!onlySell) buyPrice = p.turnover;
    if (!onlyBuy) sellPrice = p.turnover;
    notes.push(onlyBuy || onlySell ? `Calculated one ${onlyBuy ? "buy" : "sell"} order of ${inr(p.turnover)}.` : `Assumed a round trip: buy and sell ${inr(p.turnover)} each.`);
  }
  if (p.lots && !quantity) return { missing: `How many units is that? Give the lot size too, e.g. "${p.lots} lots, lot size 75" (lot sizes change; check the exchange's current list).`, partial: true };
  if (buyPrice === undefined && sellPrice === undefined) {
    if (quantity === undefined) return null;
    return { missing: `Got the quantity (${quantity}). At what price did you (or will you) buy and sell? e.g. "buy at 500, sell at 520".`, partial: true };
  }
  if (quantity === undefined) {
    return { missing: `Got the price. How many shares/units? e.g. "qty 100" or "100 shares". For F&O, give total units (lots × lot size).`, partial: true };
  }

  let segment = p.segment;
  if (!segment) {
    segment = "equity_delivery";
    notes.push('Assumed **equity delivery**. Say "intraday", "futures" or "options" for other segments.');
  }
  return { input: { segment, exchange: p.exchange, plan: p.plan ?? "discount", quantity, buyPrice, sellPrice }, notes };
}

export function describeCalc(c: ChargeBreakdown, notes: string[] = []): string {
  const i = c.input;
  const sameValue = i.buyPrice !== undefined && i.buyPrice === i.sellPrice;
  const legs = sameValue ? `buy & sell @ ${inr(i.buyPrice!)}` : [i.buyPrice !== undefined ? `buy @ ${inr(i.buyPrice)}` : null, i.sellPrice !== undefined ? `sell @ ${inr(i.sellPrice)}` : null].filter(Boolean).join(", ");
  const lines = [
    `**${c.segmentLabel} · ${i.exchange} · ${c.planLabel}**: qty ${i.quantity.toLocaleString("en-IN")}, ${legs}.`,
    "",
    `- Turnover: ${inr(c.turnover)}`,
    `- Total charges: **${inr(c.total)}** (${c.chargesPct}% of turnover)`,
  ];
  if (c.grossPnl !== undefined && c.netPnl !== undefined && !sameValue) {
    lines.push(`- Gross P&L: ${inr(c.grossPnl)} → Net P&L after charges: **${inr(c.netPnl)}**`);
    lines.push(`- Breakeven: the price must move **${inr(c.breakevenPoints!)}** per unit just to cover charges`);
  }
  const biggest = [...c.lines].sort((a, b) => b.amount - a.amount)[0];
  if (biggest && c.total > 0) lines.push(`- Biggest cost: ${biggest.label} (${inr(biggest.amount)})`);
  if (notes.length) lines.push("", ...notes);
  return lines.join("\n");
}

// ── knowledge-base retrieval ─────────────────────────────────────────────

// Broad words that appear in many questions; they only break ties between more specific matches.
const GENERIC = new Set(["charge", "charges", "fees", "cost of trading", "options", "option", "futures", "future", "tax", "delivery", "intraday", "premium", "interest", "stamp", "sebi", "demat"]);

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function searchKnowledge(message: string): { entry: KnowledgeEntry; score: number }[] {
  const t = ` ${message.toLowerCase().replace(/[’']/g, "").replace(/[?!.,;:()]/g, " ")} `;
  return KNOWLEDGE.map(entry => {
    let score = 0;
    for (const k of entry.keywords) {
      const re = new RegExp(`(^|[^a-z0-9&])${escapeRe(k)}s?([^a-z0-9]|$)`);
      if (re.test(t)) score += GENERIC.has(k) ? 1 : k.includes(" ") ? 3 + k.split(" ").length : k.length > 3 ? 2 : 1.5;
    }
    return { entry, score };
  })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

function suggestionsFor(entry?: KnowledgeEntry, exclude: string[] = []): string[] {
  const ids = entry?.related ?? [];
  const fromRelated = ids.map(id => KNOWLEDGE.find(k => k.id === id)?.title).filter((x): x is string => !!x);
  return [...fromRelated, ...STARTER_QUESTIONS].filter(s => !exclude.includes(s)).slice(0, 3);
}

function calcSuggestions(input: ChargeInput): string[] {
  const s: string[] = [];
  if (input.segment === "equity_intraday") s.push("What about delivery?");
  else if (input.segment === "equity_delivery") s.push("What about intraday?");
  else s.push("What are DP charges?");
  s.push(input.plan === "full_service" ? "Same trade with a discount broker" : "Same trade with a full-service broker");
  if (input.segment.startsWith("equity_") && input.exchange !== "BSE") s.push("What about on BSE?");
  else s.push("How do I find my breakeven after charges?");
  return s;
}

// ── entry point ──────────────────────────────────────────────────────────

export function answerQuestion(message: string, context?: ChargeInput): ChatReply {
  const msg = message.trim();
  if (!msg) return { reply: "Ask me anything about trading charges.", suggestions: STARTER_QUESTIONS.slice(0, 3), matched: "empty" };

  for (const s of SMALL_TALK) {
    if (s.pattern.test(msg)) return { reply: s.answer, suggestions: STARTER_QUESTIONS.slice(0, 3), matched: "smalltalk", context };
  }

  if (/\b(rate card|all (the )?rates|full rates|charges table|every charge)\b/i.test(msg)) {
    return { reply: rateCardText(), suggestions: STARTER_QUESTIONS.slice(0, 3), matched: "rate_card", context };
  }

  const parsed = parseTrade(msg);
  const trade = resolveTrade(parsed, msg, context);
  if (trade && "input" in trade) {
    try {
      const calc = calculateCharges(trade.input);
      return { reply: describeCalc(calc, trade.notes), calc, context: { ...trade.input, exchange: calc.input.exchange }, suggestions: calcSuggestions(calc.input), matched: "calculator" };
    } catch (e) {
      if (!(e instanceof ChargeInputError)) throw e;
      return { reply: e.message, suggestions: STARTER_QUESTIONS.slice(0, 2), matched: "calculator_error", context };
    }
  }

  if (trade && "missing" in trade) return { reply: trade.missing, suggestions: STARTER_QUESTIONS.slice(0, 2), matched: "calculator_missing", context };

  const hits = searchKnowledge(msg);
  if (hits.length) {
    const best = hits[0].entry;
    const extra = hits.slice(1, 3).filter(h => h.score >= hits[0].score * 0.6).map(h => h.entry.title);
    return { reply: best.answer, suggestions: [...extra, ...suggestionsFor(best, extra)].slice(0, 3), matched: best.id, context };
  }

  return {
    reply: `I specialise in **trading charges and costs** on Indian markets: brokerage, STT, stamp duty, exchange and SEBI fees, GST, DP charges, account fees and tax on trading profits. I can also calculate the charges on a trade if you give me a quantity and buy/sell prices.

I can't give stock tips or investment advice. Try one of the questions below.`,
    suggestions: STARTER_QUESTIONS.slice(0, 3),
    matched: "fallback",
    context,
  };
}
