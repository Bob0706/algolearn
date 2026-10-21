import { describe, expect, it } from "vitest";
import { calculateCharges, ChargeInputError, inr } from "@/lib/charges";
import { answerQuestion, parseTrade, searchKnowledge, toNumber } from "@/lib/chatbot";

describe("calculateCharges", () => {
  it("computes an NSE intraday round trip line by line", () => {
    const c = calculateCharges({ segment: "equity_intraday", quantity: 100, buyPrice: 500, sellPrice: 520 });
    const line = (k: string) => c.lines.find(l => l.key === k)!.amount;
    expect(c.turnover).toBe(102_000);
    expect(line("brokerage")).toBe(30.6); // 0.03% of 50,000 (15) + 0.03% of 52,000 (15.6), both under ₹20
    expect(line("tax")).toBe(13); // STT 0.025% of the 52,000 sell
    expect(line("exchange")).toBe(3.13);
    expect(line("sebi")).toBe(0.1);
    expect(line("stamp")).toBe(1.5); // 0.003% of the 50,000 buy
    expect(line("gst")).toBe(6.09); // 18% of (30.6 + 3.1314 + 0.102)
    expect(c.total).toBe(54.42);
    expect(c.netPnl).toBe(1945.58);
    expect(c.breakevenPoints).toBe(0.54);
  });

  it("caps discount brokerage at ₹20 and charges delivery STT and DP on both sides", () => {
    const c = calculateCharges({ segment: "equity_delivery", quantity: 1000, buyPrice: 1000, sellPrice: 1000 });
    expect(c.lines.find(l => l.key === "brokerage")!.amount).toBe(0);
    expect(c.lines.find(l => l.key === "tax")!.amount).toBe(2000);
    expect(c.lines.find(l => l.key === "dp")!.amount).toBe(13.5);
    const intraday = calculateCharges({ segment: "equity_intraday", quantity: 1000, buyPrice: 1000 });
    expect(intraday.lines.find(l => l.key === "brokerage")!.amount).toBe(20);
  });

  it("charges options on premium with flat brokerage and 0.15% sell STT", () => {
    const c = calculateCharges({ segment: "equity_options", quantity: 75, buyPrice: 100, sellPrice: 100 });
    expect(c.lines.find(l => l.key === "brokerage")!.amount).toBe(40);
    expect(c.lines.find(l => l.key === "tax")!.amount).toBe(11.25);
  });

  it("has no STT on currency and uses MCX for commodities", () => {
    expect(calculateCharges({ segment: "currency_futures", quantity: 1000, buyPrice: 85 }).lines.some(l => l.key === "tax")).toBe(false);
    expect(calculateCharges({ segment: "commodity_futures", exchange: "NSE", quantity: 100, sellPrice: 6000 }).input.exchange).toBe("MCX");
  });

  it("rejects bad input", () => {
    expect(() => calculateCharges({ segment: "equity_delivery", quantity: 0, buyPrice: 10 })).toThrow(ChargeInputError);
    expect(() => calculateCharges({ segment: "equity_delivery", quantity: 10 })).toThrow(ChargeInputError);
  });

  it("formats rupees in the Indian style", () => {
    expect(inr(102000)).toBe("₹1,02,000");
    expect(inr(-82.6)).toBe("-₹82.60");
  });
});

describe("parseTrade", () => {
  it("reads numbers with Indian units", () => {
    expect(toNumber("1.5", "lakh")).toBe(150_000);
    expect(toNumber("2", "cr")).toBe(20_000_000);
    expect(toNumber("12,500")).toBe(12_500);
  });

  it.each([
    ["Charges to buy 100 shares at ₹500 and sell at ₹520 intraday", { quantity: 100, buyPrice: 500, sellPrice: 520, segment: "equity_intraday" }],
    ["Options: qty 75, buy at 120, sell at 150", { quantity: 75, buyPrice: 120, sellPrice: 150, segment: "equity_options" }],
    ["bought 50 reliance at 2,800 sold at 2,950 on bse", { quantity: 50, buyPrice: 2800, sellPrice: 2950, exchange: "BSE" }],
    ["crude oil futures qty 100 from 6000 to 6100", { quantity: 100, buyPrice: 6000, sellPrice: 6100, segment: "commodity_futures" }],
    ["2 lots lot size 75 nifty options buy at 100 sell at 130", { quantity: 150, buyPrice: 100, sellPrice: 130, exchange: "NSE" }],
    ["short 40 shares at 300 cover at 290 intraday", { quantity: 40, buyPrice: 290, sellPrice: 300 }],
    ["entry 1200 exit 1250, 20 shares", { quantity: 20, buyPrice: 1200, sellPrice: 1250 }],
  ])("%s", (msg, expected) => {
    expect(parseTrade(msg)).toMatchObject(expected);
  });
});

describe("answerQuestion", () => {
  it("calculates a trade and remembers it for follow-ups", () => {
    const first = answerQuestion("buy 100 shares at 500 and sell at 520 intraday");
    expect(first.matched).toBe("calculator");
    expect(first.calc!.total).toBe(54.42);

    const delivery = answerQuestion("What about delivery?", first.context);
    expect(delivery.calc!.input).toMatchObject({ segment: "equity_delivery", quantity: 100, buyPrice: 500, sellPrice: 520 });

    const sell = answerQuestion("what if I sell at 530", delivery.context);
    expect(sell.calc!.input.sellPrice).toBe(530);

    const full = answerQuestion("full service broker?", sell.context);
    expect(full.calc!.input.plan).toBe("full_service");
    expect(full.calc!.total).toBeGreaterThan(sell.calc!.total);
  });

  it("explains a concept instead of recalculating when asked a definition", () => {
    const ctx = answerQuestion("buy 100 at 500 sell at 520 intraday").context;
    expect(answerQuestion("What are options charges?", ctx).matched).toBe("fno_charges");
  });

  it("asks for what's missing", () => {
    expect(answerQuestion("nifty futures 2 lots buy 24000 sell 24100").matched).toBe("calculator_missing");
    expect(answerQuestion("buy at 500 sell at 520").reply).toMatch(/How many/);
  });

  it("handles a turnover-only question", () => {
    const r = answerQuestion("charges on ₹1 lakh intraday trade");
    expect(r.calc!.turnover).toBe(200_000);
    expect(r.calc!.input.segment).toBe("equity_intraday");
  });

  it.each([
    ["What is STT?", "stt"],
    ["what are dp charges", "dp_charges"],
    ["how much tax on short term capital gains", "tax_on_profits"],
    ["do I pay charges on losing trades", "loss_trades"],
    ["what is the AMC on my demat account", "account_charges"],
    ["is there any charge to apply for an IPO", "ipo"],
    ["what does exercise of ITM options cost", "options_exercise"],
  ])("answers %s from the knowledge base", (q, id) => {
    expect(searchKnowledge(q)[0]?.entry.id).toBe(id);
    expect(answerQuestion(q).matched).toBe(id);
  });

  it("declines off-topic questions and greets politely", () => {
    expect(answerQuestion("should I buy tata motors").matched).toBe("fallback");
    expect(answerQuestion("hello").matched).toBe("smalltalk");
  });
});
