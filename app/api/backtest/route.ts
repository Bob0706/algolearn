import { NextRequest, NextResponse } from "next/server";
import { getMarketData, InputError } from "@/lib/stockService";
import { identifyTemplate, runNativeTemplate } from "@/lib/strategyTemplates";
import { EngineSignals, EngineUnavailableError, runStrategyInEngine } from "@/lib/server/engineClient";
import { simulatePortfolio, INDIA_DELIVERY, ZERO_COST } from "@/lib/portfolio";
import { BacktestResult, LedgerReceipt } from "@/lib/types";
import { errorResponse, limited, readJson } from "@/lib/server/http";
import { getCaller } from "@/lib/server/auth";
import { recordOnLedger } from "@/lib/ledger";
import { codeHash, hashJson, strategyContent } from "@/lib/server/records";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const tooMany = limited(req, "backtest", 20);
  if (tooMany) return tooMany;
  try {
    const caller = await getCaller(req);
    const body = await readJson(req);
    const code = String(body.strategy_code ?? "");
    if (!code.trim()) throw new InputError("Strategy code is required.");
    if (code.length > 20_000) throw new InputError("Strategy code is too long (max 20,000 characters).");
    const capital = Number(body.initial_capital ?? 100000);
    if (!Number.isFinite(capital) || capital < 1000 || capital > 1e10) throw new InputError("Starting capital must be between ₹1,000 and ₹1,000 crore.");
    const includeCosts = body.include_costs !== false;

    const market = await getMarketData(body.symbol ?? "RELIANCE.NS", body.period ?? "1y");
    if (market.bars.length < 30) throw new InputError("Not enough historical data for backtesting (need 30+ bars).");

    // 1) signals: always from the user's actual code
    let signals: EngineSignals;
    let engine: BacktestResult["meta"]["engine"] = "python-sandbox";
    const template = identifyTemplate(code);
    try {
      signals = await runStrategyInEngine(code, market.bars);
    } catch (e) {
      if (!(e instanceof EngineUnavailableError) || !template) throw e;
      // Engine offline, but this is a byte-identical template whose TS twin is parity-tested.
      const native = runNativeTemplate(template.id, template.params, market.bars);
      signals = { ...native, logs: [], warnings: [], lookahead: { checked: false }, runtime_ms: 0 };
      engine = "native-template";
    }

    // 2) one accounting engine for everything
    const pf = simulatePortfolio(market.bars, signals.buy, signals.sell, capital, includeCosts ? INDIA_DELIVERY : ZERO_COST);

    const warnings = [...signals.warnings];
    if (market.source === "synthetic") warnings.unshift("Yahoo Finance was unreachable: these results use SYNTHETIC prices, not real market data.");
    if (signals.lookahead.uses_future_data) {
      warnings.unshift(`Look-ahead bias detected: this strategy's signals change when future bars are removed (first on ${signals.lookahead.first_mismatch_date}). Its results are not achievable in real trading.`);
    }
    if (pf.summary.total_trades === 0) warnings.push("The strategy produced no trades in this period.");

    const result: BacktestResult = {
      summary: pf.summary,
      ohlcv: market.bars,
      buy_signals: pf.buy_signals,
      sell_signals: pf.sell_signals,
      equity_curve: pf.equity_curve,
      trades: pf.trades,
      meta: {
        symbol: market.symbol,
        period: market.period,
        data_source: market.source,
        data_hash: market.dataHash,
        code_hash: codeHash(code),
        engine,
        template_id: template?.id,
        assumptions: includeCosts ? pf.assumptions : pf.assumptions.map(a => a.startsWith("Slippage") ? "No transaction costs or slippage (disabled by user)." : a),
        warnings,
        logs: signals.logs,
        lookahead: signals.lookahead,
      },
    };

    // 3) tamper-evident record: strategy → backtest (parent link)
    const ledger: LedgerReceipt[] = [];
    const strat = await recordOnLedger("STRATEGY", strategyContent(code), { subject: caller.subject });
    if (strat) ledger.push(strat);
    const bt = await recordOnLedger("BACKTEST", {
      schema: "algolearn.backtest.v1",
      strategyId: strat?.id ?? null,
      codeHash: result.meta.code_hash,
      symbol: market.symbol,
      period: market.period,
      firstBar: market.bars[0].date,
      lastBar: market.bars[market.bars.length - 1].date,
      dataSource: market.source,
      dataHash: market.dataHash,
      engine,
      lookahead: signals.lookahead,
      costModel: includeCosts ? INDIA_DELIVERY : ZERO_COST,
      summary: pf.summary,
      tradesHash: hashJson(pf.trades),
    }, { subject: caller.subject, parentId: strat?.id });
    if (bt) ledger.push(bt);
    result.ledger = ledger;

    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
