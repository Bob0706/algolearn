"""
AlgoLearn India — Python FastAPI Backend
Handles: stock data fetching, backtesting, AI strategy generation
"""

import os
import re
import json
import traceback
from io import StringIO
from contextlib import redirect_stdout
from typing import Optional, List

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AlgoLearn Backend", version="1.0.0")

# ──────────────────────────────────────────────────────────────────────────────
# CORS — allow Next.js dev server
# ──────────────────────────────────────────────────────────────────────────────
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# Popular NSE/BSE stocks
# ──────────────────────────────────────────────────────────────────────────────
POPULAR_SYMBOLS = [
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "sector": "Energy"},
    {"symbol": "TCS.NS",      "name": "Tata Consultancy Services", "sector": "IT"},
    {"symbol": "INFY.NS",     "name": "Infosys", "sector": "IT"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "sector": "Banking"},
    {"symbol": "ICICIBANK.NS","name": "ICICI Bank", "sector": "Banking"},
    {"symbol": "HINDUNILVR.NS","name": "Hindustan Unilever", "sector": "FMCG"},
    {"symbol": "BAJFINANCE.NS","name": "Bajaj Finance", "sector": "Finance"},
    {"symbol": "WIPRO.NS",    "name": "Wipro", "sector": "IT"},
    {"symbol": "LT.NS",       "name": "Larsen & Toubro", "sector": "Infrastructure"},
    {"symbol": "SBIN.NS",     "name": "State Bank of India", "sector": "Banking"},
    {"symbol": "AXISBANK.NS", "name": "Axis Bank", "sector": "Banking"},
    {"symbol": "MARUTI.NS",   "name": "Maruti Suzuki", "sector": "Auto"},
    {"symbol": "TITAN.NS",    "name": "Titan Company", "sector": "Consumer"},
    {"symbol": "SUNPHARMA.NS","name": "Sun Pharmaceutical", "sector": "Pharma"},
    {"symbol": "ASIANPAINT.NS","name": "Asian Paints", "sector": "Consumer"},
    {"symbol": "KOTAKBANK.NS","name": "Kotak Mahindra Bank", "sector": "Banking"},
    {"symbol": "ITC.NS",      "name": "ITC Limited", "sector": "FMCG"},
    {"symbol": "HCLTECH.NS",  "name": "HCL Technologies", "sector": "IT"},
    {"symbol": "M&M.NS",      "name": "Mahindra & Mahindra", "sector": "Auto"},
    {"symbol": "BHARTIARTL.NS","name": "Bharti Airtel", "sector": "Telecom"},
    {"symbol": "TATASTEEL.NS","name": "Tata Steel", "sector": "Metals"},
    {"symbol": "JSWSTEEL.NS", "name": "JSW Steel", "sector": "Metals"},
    {"symbol": "ONGC.NS",     "name": "ONGC", "sector": "Energy"},
    {"symbol": "NTPC.NS",     "name": "NTPC", "sector": "Energy"},
    {"symbol": "POWERGRID.NS","name": "Power Grid", "sector": "Energy"},
    {"symbol": "ADANIENT.NS", "name": "Adani Enterprises", "sector": "Diversified"},
    {"symbol": "TATAMOTORS.NS","name": "Tata Motors", "sector": "Auto"},
    {"symbol": "BAJAJFINSV.NS","name": "Bajaj Finserv", "sector": "Finance"},
    {"symbol": "GRASIM.NS",   "name": "Grasim Industries", "sector": "Cement/Chemicals"},
    {"symbol": "INDUSINDBK.NS","name": "IndusInd Bank", "sector": "Banking"},
    # ── Additional NIFTY 50 / NIFTY Next 50 stocks ──
    {"symbol": "ZOMATO.NS",   "name": "Zomato", "sector": "Consumer Tech"},
    {"symbol": "TATAPOWER.NS","name": "Tata Power", "sector": "Energy"},
    {"symbol": "HDFCLIFE.NS", "name": "HDFC Life Insurance", "sector": "Insurance"},
    {"symbol": "BAJAJ-AUTO.NS","name": "Bajaj Auto", "sector": "Auto"},
    {"symbol": "COALINDIA.NS","name": "Coal India", "sector": "Mining"},
    {"symbol": "ADANIPORTS.NS","name": "Adani Ports & SEZ", "sector": "Logistics"},
    {"symbol": "ULTRACEMCO.NS","name": "UltraTech Cement", "sector": "Cement"},
    {"symbol": "DRREDDY.NS",  "name": "Dr. Reddy's Laboratories", "sector": "Pharma"},
    {"symbol": "CIPLA.NS",    "name": "Cipla", "sector": "Pharma"},
    {"symbol": "DIVISLAB.NS", "name": "Divi's Laboratories", "sector": "Pharma"},
    {"symbol": "PIDILITIND.NS","name": "Pidilite Industries", "sector": "Chemicals"},
    {"symbol": "HAVELLS.NS",  "name": "Havells India", "sector": "Consumer Electricals"},
    {"symbol": "DABUR.NS",    "name": "Dabur India", "sector": "FMCG"},
    {"symbol": "GODREJCP.NS", "name": "Godrej Consumer Products", "sector": "FMCG"},
    {"symbol": "BIOCON.NS",   "name": "Biocon", "sector": "Biotech"},
    {"symbol": "MUTHOOTFIN.NS","name": "Muthoot Finance", "sector": "Finance"},
    {"symbol": "SRF.NS",      "name": "SRF Limited", "sector": "Chemicals"},
    {"symbol": "PAGEIND.NS",  "name": "Page Industries (Jockey)", "sector": "Consumer"},
    {"symbol": "IRCTC.NS",    "name": "IRCTC", "sector": "Travel & Tourism"},
    {"symbol": "NYKAA.NS",    "name": "Nykaa (FSN E-Commerce)", "sector": "Consumer Tech"},
    {"symbol": "^NSEI",       "name": "Nifty 50", "sector": "Index"},
    {"symbol": "^BSESN",      "name": "Sensex (BSE)", "sector": "Index"},
]

# ──────────────────────────────────────────────────────────────────────────────
# Pre-built strategy templates (fallback when no Gemini key)
# ──────────────────────────────────────────────────────────────────────────────
STRATEGY_TEMPLATES = {
    "moving_average_crossover": {
        "name": "Moving Average Crossover",
        "description": "Buy when short-term MA crosses above long-term MA; sell when it crosses below.",
        "code": '''
import pandas as pd

def run_strategy(df):
    """
    Moving Average Crossover Strategy
    Buy when 20-day SMA crosses above 50-day SMA (Golden Cross)
    Sell when 20-day SMA crosses below 50-day SMA (Death Cross)
    """
    df = df.copy()
    df['SMA_20'] = df['Close'].rolling(window=20).mean()
    df['SMA_50'] = df['Close'].rolling(window=50).mean()

    df['Signal'] = 0
    df.loc[df['SMA_20'] > df['SMA_50'], 'Signal'] = 1   # Buy
    df.loc[df['SMA_20'] < df['SMA_50'], 'Signal'] = -1  # Sell

    df['Position'] = df['Signal'].diff()
    df['Buy']  = df['Position'] == 2
    df['Sell'] = df['Position'] == -2

    return df
''',
    },
    "rsi_mean_reversion": {
        "name": "RSI Mean Reversion",
        "description": "Buy when RSI < 30 (oversold); sell when RSI > 70 (overbought).",
        "code": '''
import pandas as pd

def run_strategy(df):
    """
    RSI Mean Reversion Strategy
    Buy when RSI drops below 30 (oversold)
    Sell when RSI rises above 70 (overbought)
    """
    df = df.copy()
    delta = df['Close'].diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs  = avg_gain / avg_loss
    df['RSI'] = 100 - (100 / (1 + rs))

    df['Signal'] = 0
    df['Buy']  = df['RSI'] < 30
    df['Sell'] = df['RSI'] > 70

    return df
''',
    },
    "macd_strategy": {
        "name": "MACD Strategy",
        "description": "Buy when MACD line crosses above signal line; sell on opposite crossover.",
        "code": '''
import pandas as pd

def run_strategy(df):
    """
    MACD (Moving Average Convergence Divergence) Strategy
    Buy when MACD crosses above Signal Line
    Sell when MACD crosses below Signal Line
    """
    df = df.copy()
    exp1 = df['Close'].ewm(span=12, adjust=False).mean()
    exp2 = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD']        = exp1 - exp2
    df['Signal_Line'] = df['MACD'].ewm(span=9, adjust=False).mean()
    df['Histogram']   = df['MACD'] - df['Signal_Line']

    df['Buy']  = (df['MACD'] > df['Signal_Line']) & (df['MACD'].shift(1) <= df['Signal_Line'].shift(1))
    df['Sell'] = (df['MACD'] < df['Signal_Line']) & (df['MACD'].shift(1) >= df['Signal_Line'].shift(1))

    return df
''',
    },
    "bollinger_bands": {
        "name": "Bollinger Bands",
        "description": "Buy when price touches lower band; sell when price touches upper band.",
        "code": '''
import pandas as pd

def run_strategy(df):
    """
    Bollinger Bands Strategy
    Buy when close price touches/crosses below lower band
    Sell when close price touches/crosses above upper band
    """
    df = df.copy()
    df['SMA_20']    = df['Close'].rolling(window=20).mean()
    df['Std_20']    = df['Close'].rolling(window=20).std()
    df['Upper_Band'] = df['SMA_20'] + (df['Std_20'] * 2)
    df['Lower_Band'] = df['SMA_20'] - (df['Std_20'] * 2)

    df['Buy']  = df['Close'] <= df['Lower_Band']
    df['Sell'] = df['Close'] >= df['Upper_Band']

    return df
''',
    },
    "supertrend": {
        "name": "Supertrend Strategy",
        "description": "Follow trend direction using ATR-based Supertrend indicator.",
        "code": '''
import pandas as pd
import numpy as np

def run_strategy(df):
    """
    Supertrend Strategy using ATR
    Uptrend → Hold/Buy | Downtrend → Sell/Short
    """
    df = df.copy()
    atr_period = 10
    multiplier = 3

    high_low   = df['High'] - df['Low']
    high_close = abs(df['High'] - df['Close'].shift())
    low_close  = abs(df['Low']  - df['Close'].shift())
    ranges     = pd.concat([high_low, high_close, low_close], axis=1)
    true_range = ranges.max(axis=1)
    df['ATR']  = true_range.rolling(atr_period).mean()

    df['Upper'] = ((df['High'] + df['Low']) / 2) + (multiplier * df['ATR'])
    df['Lower'] = ((df['High'] + df['Low']) / 2) - (multiplier * df['ATR'])

    df['Supertrend'] = 0.0
    for i in range(1, len(df)):
        if df['Close'].iloc[i] > df['Upper'].iloc[i-1]:
            df['Supertrend'].iloc[i] = df['Lower'].iloc[i]
        elif df['Close'].iloc[i] < df['Lower'].iloc[i-1]:
            df['Supertrend'].iloc[i] = df['Upper'].iloc[i]
        else:
            df['Supertrend'].iloc[i] = df['Supertrend'].iloc[i-1]

    df['Buy']  = df['Close'] > df['Supertrend']
    df['Sell'] = df['Close'] < df['Supertrend']

    return df
''',
    },
}

# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────────────────────────────────────
class BacktestRequest(BaseModel):
    symbol: str
    period: str = "1y"
    strategy_code: str
    initial_capital: float = 100000.0

class GenerateStrategyRequest(BaseModel):
    description: str

# ──────────────────────────────────────────────────────────────────────────────
# Helper: Fetch stock data
# ──────────────────────────────────────────────────────────────────────────────
def fetch_stock_data(symbol: str, period: str = "1y") -> pd.DataFrame:
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period)
    if df.empty:
        raise ValueError(f"No data found for symbol: {symbol}")
    df.index = df.index.tz_localize(None)
    return df

# ──────────────────────────────────────────────────────────────────────────────
# Helper: Run backtest
# ──────────────────────────────────────────────────────────────────────────────
def run_backtest(df: pd.DataFrame, strategy_code: str, initial_capital: float = 100000.0) -> dict:
    # Execute strategy code safely
    local_ns = {"pd": pd, "np": np}
    exec(strategy_code, local_ns)
    run_fn = local_ns.get("run_strategy")
    if not run_fn:
        raise ValueError("Strategy code must define a 'run_strategy(df)' function.")

    result_df = run_fn(df)

    # Simulate trades with proper per-trade PnL tracking
    capital       = initial_capital
    shares        = 0
    avg_buy_price = 0.0
    trades        = []
    equity_curve  = []
    buy_signals   = []
    sell_signals  = []
    realized_pnl  = 0.0

    for i, row in result_df.iterrows():
        price = float(row['Close'])
        date  = str(i.date())
        equity_curve.append({"date": date, "equity": round(capital + shares * price, 2)})

        if row.get('Buy', False) and shares == 0 and capital > price:
            shares        = int(capital // price)
            cost          = shares * price
            avg_buy_price = price
            capital      -= cost
            trades.append({"date": date, "type": "BUY", "price": round(price, 2),
                           "shares": shares, "value": round(cost, 2), "pnl": None})
            buy_signals.append({"date": date, "price": round(price, 2)})

        elif row.get('Sell', False) and shares > 0:
            proceeds    = shares * price
            trade_pnl   = (price - avg_buy_price) * shares
            realized_pnl += trade_pnl
            capital     += proceeds
            trades.append({"date": date, "type": "SELL", "price": round(price, 2),
                           "shares": shares, "value": round(proceeds, 2),
                           "pnl": round(trade_pnl, 2)})
            sell_signals.append({"date": date, "price": round(price, 2)})
            shares        = 0
            avg_buy_price = 0.0

    # Mark open position value at end
    last_price  = float(result_df['Close'].iloc[-1])
    open_pnl    = (last_price - avg_buy_price) * shares if shares > 0 else 0.0
    final_value = capital + shares * last_price
    total_return = ((final_value - initial_capital) / initial_capital) * 100

    # Win rate — based on actual realized PnL per completed trade
    sell_trades = [t for t in trades if t['type'] == 'SELL']
    wins        = sum(1 for t in sell_trades if (t.get('pnl') or 0) > 0)
    win_rate    = (wins / len(sell_trades) * 100) if sell_trades else 0

    # Max drawdown
    equity_vals = [e['equity'] for e in equity_curve]
    peak        = equity_vals[0] if equity_vals else initial_capital
    max_dd      = 0
    for v in equity_vals:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd:
            max_dd = dd

    # Build OHLCV for chart
    ohlcv = []
    for i, row in result_df.iterrows():
        ohlcv.append({
            "date":   str(i.date()),
            "open":   round(float(row['Open']),  2),
            "high":   round(float(row['High']),  2),
            "low":    round(float(row['Low']),   2),
            "close":  round(float(row['Close']), 2),
            "volume": int(row.get('Volume', 0)),
        })

    return {
        "summary": {
            "initial_capital":  round(initial_capital, 2),
            "final_value":      round(final_value, 2),
            "total_return_pct": round(total_return, 2),
            "realized_pnl":     round(realized_pnl, 2),
            "open_pnl":         round(open_pnl, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "win_rate_pct":     round(win_rate, 2),
            "total_trades":     len(trades),
            "winning_trades":   wins,
        },
        "ohlcv":        ohlcv,
        "buy_signals":  buy_signals,
        "sell_signals": sell_signals,
        "equity_curve": equity_curve,
        "trades":       trades,
    }

# ──────────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "AlgoLearn Backend is running 🚀"}

@app.get("/api/symbols")
def get_symbols():
    return {"symbols": POPULAR_SYMBOLS}

@app.get("/api/stock-data")
def get_stock_data(
    symbol: str = Query(..., description="Stock symbol e.g. RELIANCE.NS"),
    period: str = Query("1y", description="Period: 1mo, 3mo, 6mo, 1y, 2y, 5y"),
):
    try:
        df = fetch_stock_data(symbol, period)
        ohlcv = []
        for i, row in df.iterrows():
            ohlcv.append({
                "date":   str(i.date()),
                "open":   round(float(row['Open']),  2),
                "high":   round(float(row['High']),  2),
                "low":    round(float(row['Low']),   2),
                "close":  round(float(row['Close']), 2),
                "volume": int(row.get('Volume', 0)),
            })
        return {"symbol": symbol, "period": period, "data": ohlcv}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/strategy-templates")
def get_strategy_templates():
    return {
        "templates": [
            {"id": k, "name": v["name"], "description": v["description"], "code": v["code"]}
            for k, v in STRATEGY_TEMPLATES.items()
        ]
    }

@app.post("/api/backtest")
def backtest(req: BacktestRequest):
    try:
        df = fetch_stock_data(req.symbol, req.period)
        result = run_backtest(df, req.strategy_code, req.initial_capital)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/generate-strategy")
def generate_strategy(req: GenerateStrategyRequest):
    """
    Use Google Gemini to convert plain-English strategy description into Python code.
    Falls back to best-matching template if API key not configured.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")

    if api_key and api_key != "your_gemini_api_key_here":
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")

            prompt = f"""You are an expert algo trading Python developer for Indian stock markets.
The user wants to create a trading strategy with this description:
"{req.description}"

Write a Python function called `run_strategy(df)` that:
1. Takes a pandas DataFrame `df` with standard OHLCV columns: Open, High, Low, Close, Volume.
2. Calculates required technical indicators using `pandas_ta` (e.g. `df.ta.rsi()`, `df.ta.macd()`) or standard `pandas`/`numpy`.
3. Adds a boolean 'Buy' column to `df` (True when to buy).
4. Adds a boolean 'Sell' column to `df` (True when to sell).
5. Returns the modified DataFrame `df`.

Rules:
- CRITICAL: You MUST include `import pandas_ta as ta` and `import pandas as pd` at the very beginning of the function.
- CRITICAL: Make sure to `.copy()` the input DataFrame at the start (`df = df.copy()`) to avoid warnings.
- The function must be named exactly `run_strategy(df)`.
- Assume `pandas_ta` is installed. Use it for indicators whenever possible.
- Keep it beginner-friendly and heavily commented.
- Return ONLY the raw Python code. DO NOT include markdown formatting, backticks, or any conversational text.
"""

            response = model.generate_content(prompt)
            code = response.text.strip()
            # Aggressively strip markdown fences if still present
            if code.startswith("```"):
                lines = code.split("\n")
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                code = "\n".join(lines).strip()

            return {"code": code, "source": "gemini", "description": req.description}
        except Exception as e:
            # Fall through to template matching
            pass

    # Fallback: keyword matching to templates
    desc_lower = req.description.lower()
    if any(k in desc_lower for k in ["macd", "convergence", "divergence"]):
        template_id = "macd_strategy"
    elif any(k in desc_lower for k in ["rsi", "relative strength", "oversold", "overbought"]):
        template_id = "rsi_mean_reversion"
    elif any(k in desc_lower for k in ["bollinger", "band", "standard deviation"]):
        template_id = "bollinger_bands"
    elif any(k in desc_lower for k in ["supertrend", "atr", "average true range"]):
        template_id = "supertrend"
    else:
        template_id = "moving_average_crossover"

    t = STRATEGY_TEMPLATES[template_id]
    return {
        "code":        t["code"],
        "source":      "template",
        "template_id": template_id,
        "description": req.description,
        "note":        f"Generated using template: {t['name']}. Add a GEMINI_API_KEY to .env for AI-powered generation.",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
