import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTemplate, identifyTemplate, listTemplates, parseStrategyDescription, runNativeTemplate,
} from "@/lib/strategyTemplates";
import { OHLCVBar } from "@/lib/types";

function makeBars(n = 300): OHLCVBar[] {
  const out: OHLCVBar[] = [];
  let price = 1000;
  let seed = 7;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const d = new Date(Date.UTC(2022, 0, 3));
  for (let i = 0; i < n; i++) {
    const open = price * (1 + (rand() - 0.5) * 0.01);
    price = open * (1 + (rand() - 0.49) * 0.04);
    out.push({
      date: d.toISOString().slice(0, 10),
      open: +open.toFixed(2), close: +price.toFixed(2),
      high: +(Math.max(open, price) * (1 + rand() * 0.01)).toFixed(2),
      low: +(Math.min(open, price) * (1 - rand() * 0.01)).toFixed(2),
      volume: 1000,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("parseStrategyDescription", () => {
  it.each([
    ["Buy when RSI(10) drops below 25 and sell when it goes above 75", "rsi_mean_reversion", { period: 10, lower: 25, upper: 75 }],
    ["buy when the 10-day moving average crosses above the 30-day moving average", "sma_crossover", { fast: 10, slow: 30 }],
    ["EMA 9 day and 21 day crossover", "ema_crossover", { fast: 9, slow: 21 }],
    ["MACD 8,21,5 crossover", "macd_strategy", { fast: 8, slow: 21, signal: 5 }],
    ["buy at the lower bollinger band with 30 day period and 2.5 std", "bollinger_bands", { period: 30, std: 2.5 }],
    ["buy when price breaks above the 55-day high", "breakout", { lookback: 55 }],
    ["supertrend with 7 day ATR and multiplier 2", "supertrend", { period: 7, multiplier: 2 }],
  ])("%s", (text, id, params) => {
    const r = parseStrategyDescription(text);
    expect(r.templateId).toBe(id);
    expect(r.params).toMatchObject(params);
    expect(r.confident).toBe(true);
  });

  it("is honest when it does not understand", () => {
    const r = parseStrategyDescription("buy when the CEO tweets");
    expect(r.confident).toBe(false);
    expect(r.understood).toMatch(/Could not recognise/);
  });
});

describe("template identity", () => {
  it("recognises unmodified templates and rejects edited ones", () => {
    const t = buildTemplate("rsi_mean_reversion", { period: 10, lower: 25, upper: 75 });
    expect(identifyTemplate(t.code)).toEqual({ id: "rsi_mean_reversion", params: { period: 10, lower: 25, upper: 75 } });
    expect(identifyTemplate(t.code.replace("< 25", "< 5"))).toBeNull();
    expect(identifyTemplate("def run_strategy(df):\n    return df")).toBeNull();
  });
});

// Parity: the native TypeScript twin must produce exactly the Python signals.
const PY = path.resolve("backend/.venv/bin/python");
describe.skipIf(!fs.existsSync(PY))("native templates match the Python engine", () => {
  const bars = makeBars();
  it.each(listTemplates().map(t => [t.id, t]))("%s", (_id, t) => {
    const proc = spawnSync(PY, ["-I", path.resolve("backend/app/sandbox_runner.py")], {
      input: JSON.stringify({ code: t.code, bars, lookahead_check: true }),
      encoding: "utf8",
    });
    const py = JSON.parse(proc.stdout);
    expect(py.ok, py.error).toBe(true);
    expect(py.lookahead.uses_future_data).toBe(false);
    const native = runNativeTemplate(t.id, t.params, bars);
    expect(native.buy).toEqual(py.buy);
    expect(native.sell).toEqual(py.sell);
    expect(py.buy.some(Boolean) || py.sell.some(Boolean)).toBe(true);
  });
});
