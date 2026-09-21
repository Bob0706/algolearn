// lib/marketData.ts — Static symbols, strategy templates, and indicator calculators

export interface StockSymbol {
  symbol: string;
  name: string;
  sector: string;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const POPULAR_SYMBOLS: StockSymbol[] = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "IT" },
  { symbol: "INFY.NS", name: "Infosys", sector: "IT" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Banking" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Banking" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "Finance" },
  { symbol: "WIPRO.NS", name: "Wipro", sector: "IT" },
  { symbol: "LT.NS", name: "Larsen & Toubro", sector: "Infrastructure" },
  { symbol: "SBIN.NS", name: "State Bank of India", sector: "Banking" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", sector: "Banking" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki", sector: "Auto" },
  { symbol: "TITAN.NS", name: "Titan Company", sector: "Consumer" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", sector: "Pharma" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Consumer" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", sector: "Banking" },
  { symbol: "ITC.NS", name: "ITC Limited", sector: "FMCG" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies", sector: "IT" },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra", sector: "Auto" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sector: "Telecom" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel", sector: "Metals" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel", sector: "Metals" },
  { symbol: "ONGC.NS", name: "ONGC", sector: "Energy" },
  { symbol: "NTPC.NS", name: "NTPC", sector: "Energy" },
  { symbol: "POWERGRID.NS", name: "Power Grid", sector: "Energy" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises", sector: "Diversified" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", sector: "Auto" },
  { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv", sector: "Finance" },
  { symbol: "GRASIM.NS", name: "Grasim Industries", sector: "Cement/Chemicals" },
  { symbol: "INDUSINDBK.NS", name: "IndusInd Bank", sector: "Banking" },
  { symbol: "ZOMATO.NS", name: "Zomato", sector: "Consumer Tech" },
  { symbol: "TATAPOWER.NS", name: "Tata Power", sector: "Energy" },
  { symbol: "HDFCLIFE.NS", name: "HDFC Life Insurance", sector: "Insurance" },
  { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto", sector: "Auto" },
  { symbol: "COALINDIA.NS", name: "Coal India", sector: "Mining" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports & SEZ", sector: "Logistics" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories", sector: "Pharma" },
  { symbol: "CIPLA.NS", name: "Cipla", sector: "Pharma" },
  { symbol: "DIVISLAB.NS", name: "Divi's Laboratories", sector: "Pharma" },
  { symbol: "PIDILITIND.NS", name: "Pidilite Industries", sector: "Chemicals" },
  { symbol: "HAVELLS.NS", name: "Havells India", sector: "Consumer Electricals" },
  { symbol: "DABUR.NS", name: "Dabur India", sector: "FMCG" },
  { symbol: "GODREJCP.NS", name: "Godrej Consumer Products", sector: "FMCG" },
  { symbol: "BIOCON.NS", name: "Biocon", sector: "Biotech" },
  { symbol: "MUTHOOTFIN.NS", name: "Muthoot Finance", sector: "Finance" },
  { symbol: "SRF.NS", name: "SRF Limited", sector: "Chemicals" },
  { symbol: "PAGEIND.NS", name: "Page Industries (Jockey)", sector: "Consumer" },
  { symbol: "IRCTC.NS", name: "IRCTC", sector: "Travel & Tourism" },
  { symbol: "NYKAA.NS", name: "Nykaa (FSN E-Commerce)", sector: "Consumer Tech" },
  { symbol: "^NSEI", name: "Nifty 50", sector: "Index" },
  { symbol: "^BSESN", name: "Sensex (BSE)", sector: "Index" },
];

export const STRATEGY_TEMPLATES: Record<string, { name: string; description: string; code: string }> = {
  moving_average_crossover: {
    name: "Moving Average Crossover",
    description: "Buy when short-term MA crosses above long-term MA; sell when it crosses below.",
    code: `import pandas as pd

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
`,
  },
  rsi_mean_reversion: {
    name: "RSI Mean Reversion",
    description: "Buy when RSI < 30 (oversold); sell when RSI > 70 (overbought).",
    code: `import pandas as pd

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
`,
  },
  macd_strategy: {
    name: "MACD Strategy",
    description: "Buy when MACD line crosses above signal line; sell on opposite crossover.",
    code: `import pandas as pd

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
`,
  },
  bollinger_bands: {
    name: "Bollinger Bands",
    description: "Buy when price touches lower band; sell when price touches upper band.",
    code: `import pandas as pd

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
`,
  },
  supertrend: {
    name: "Supertrend Strategy",
    description: "Follow trend direction using ATR-based Supertrend indicator.",
    code: `import pandas as pd
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
`,
  },
};
