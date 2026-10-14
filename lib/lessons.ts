// lib/lessons.ts — Learning Hub content

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  level: "Beginner" | "Intermediate";
  summary: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
  tryIt?: { href: string; label: string };
}

export const LESSONS: Lesson[] = [
  {
    id: "l1",
    title: "What is algorithmic trading?",
    minutes: 5,
    level: "Beginner",
    summary: "Rules instead of gut feeling: what an algorithm is, and what it is not.",
    sections: [
      {
        heading: "Rules you can write down",
        paragraphs: [
          "An algorithmic strategy is a set of rules precise enough for a computer to follow: when to buy, when to sell, and how much. \"Buy when the 20-day average crosses above the 50-day average\" is a rule. \"Buy when it feels cheap\" is not.",
          "Because the rules are exact, you can test them on years of past data before risking money. That test is called a backtest.",
        ],
      },
      {
        heading: "What algorithms do NOT do",
        bullets: [
          "They do not predict the future. They exploit patterns that may or may not continue.",
          "They do not remove risk. A bad rule followed perfectly still loses money.",
          "Most simple public strategies do not beat buying and holding an index after costs. Always compare against that benchmark.",
        ],
      },
    ],
    tryIt: { href: "/builder", label: "Describe your first rule" },
  },
  {
    id: "l2",
    title: "Candlesticks and OHLCV data",
    minutes: 6,
    level: "Beginner",
    summary: "Read a candle: open, high, low, close and volume.",
    sections: [
      {
        heading: "One candle = one trading day",
        bullets: [
          "Open: the first traded price of the day. Close: the last.",
          "High / Low: the extremes reached during the day (the thin wicks).",
          "Green body: close above open. Red body: close below open.",
          "Volume: how many shares changed hands — conviction behind the move.",
        ],
      },
      {
        heading: "Patterns",
        paragraphs: [
          "Some candle shapes hint at a change of direction: a Hammer (long lower wick after a fall), an Engulfing candle that swallows the previous one, a Morning Star (big red, small indecisive, big green). The simulator flags these automatically.",
          "Patterns only matter in context: a bullish reversal pattern means something after a decline, not in the middle of a rally. They are weak signals on their own.",
        ],
      },
    ],
    tryIt: { href: "/simulator", label: "Spot patterns in the simulator" },
  },
  {
    id: "l3",
    title: "Moving averages and trend",
    minutes: 7,
    level: "Beginner",
    summary: "SMA, EMA, golden cross and death cross.",
    sections: [
      {
        heading: "Smoothing the noise",
        paragraphs: [
          "A 20-day simple moving average (SMA) is the average close of the last 20 days. It shows the trend with day-to-day noise removed. An exponential moving average (EMA) weights recent days more, so it reacts faster.",
        ],
      },
      {
        heading: "Crossovers",
        bullets: [
          "Golden cross: a fast average (20-day) crosses above a slow one (50-day) — the trend may be turning up.",
          "Death cross: the fast average crosses below — the trend may be turning down.",
          "Trade-off: longer averages give fewer false signals but react late.",
        ],
      },
    ],
    tryIt: { href: "/backtest", label: "Backtest a moving-average crossover" },
  },
  {
    id: "l4",
    title: "RSI and momentum",
    minutes: 6,
    level: "Beginner",
    summary: "Overbought, oversold, and why mean reversion can fail.",
    sections: [
      {
        heading: "Relative Strength Index",
        paragraphs: [
          "RSI compares recent gains with recent losses on a 0–100 scale (Wilder's 14-day version is standard). Below 30 is called oversold, above 70 overbought.",
          "A mean-reversion strategy buys oversold and sells overbought, betting that extremes snap back.",
        ],
      },
      {
        heading: "The catch",
        bullets: [
          "In a strong downtrend RSI can stay below 30 for weeks while the price keeps falling.",
          "Many traders add a trend filter, e.g. only buy oversold dips while the price is above its 200-day average.",
        ],
      },
    ],
    tryIt: { href: "/builder", label: "Try: \"RSI(2) below 10 while above the 200-day average\"" },
  },
  {
    id: "l5",
    title: "MACD and Bollinger Bands",
    minutes: 8,
    level: "Intermediate",
    summary: "Momentum crossovers and volatility bands.",
    sections: [
      {
        heading: "MACD",
        paragraphs: [
          "MACD = 12-day EMA − 26-day EMA. Its 9-day EMA is the signal line. MACD crossing above the signal line suggests momentum is turning up.",
        ],
      },
      {
        heading: "Bollinger Bands",
        paragraphs: [
          "A 20-day average with bands two standard deviations above and below. Bands widen in volatile markets and narrow in calm ones. Touching the lower band means the price is unusually low relative to its recent range — not necessarily cheap.",
        ],
      },
    ],
    tryIt: { href: "/backtest", label: "Compare MACD and Bollinger templates" },
  },
  {
    id: "l6",
    title: "Backtesting without fooling yourself",
    minutes: 9,
    level: "Intermediate",
    summary: "Look-ahead bias, overfitting, costs and benchmarks.",
    sections: [
      {
        heading: "The four classic mistakes",
        bullets: [
          "Look-ahead bias: using information you would not have had at the time (e.g. shift(-1), or trading at the same close that generated the signal). AlgoLearn fills at the next open and re-runs your code on truncated data to detect this.",
          "Overfitting: tuning parameters until the past looks perfect. Test the same rules on other stocks and periods.",
          "Ignoring costs: brokerage, STT, stamp duty and slippage turn many profitable-looking strategies into losers. They are on by default here.",
          "No benchmark: a +12% strategy is poor if buy-and-hold made +30% with less effort.",
        ],
      },
      {
        heading: "Read the whole report",
        paragraphs: [
          "Look at max drawdown (the worst peak-to-trough fall), the number of trades (3 trades prove nothing), time in the market, and the Sharpe ratio (return per unit of volatility).",
        ],
      },
    ],
    tryIt: { href: "/backtest", label: "Run a backtest and read every number" },
  },
  {
    id: "l7",
    title: "Risk management",
    minutes: 7,
    level: "Intermediate",
    summary: "Position sizing, drawdowns and stop-losses.",
    sections: [
      {
        heading: "Survive first",
        bullets: [
          "A 50% loss needs a 100% gain to recover. Avoiding big drawdowns matters more than chasing returns.",
          "Position sizing: risk a small fixed share of capital (often 1–2%) per trade.",
          "Stop-loss: decide your exit before you enter. Write it into the rules.",
          "Diversify: one stock can fall 30% on a single piece of news.",
        ],
      },
    ],
    tryIt: { href: "/simulator", label: "Practise disciplined exits" },
  },
  {
    id: "l8",
    title: "Trading in Indian markets",
    minutes: 8,
    level: "Intermediate",
    summary: "NSE/BSE, charges, settlement and SEBI's algo rules.",
    sections: [
      {
        heading: "Market basics",
        bullets: [
          "Equity cash market hours: 9:15 am – 3:30 pm IST. Settlement is T+1.",
          "Stocks have price bands (circuit limits); indices have market-wide circuit breakers.",
          "Delivery trades pay STT of 0.1% on both buy and sell, stamp duty on the buy side, exchange and SEBI fees, and GST on brokerage and fees.",
        ],
      },
      {
        heading: "Algo trading as a retail investor",
        paragraphs: [
          "SEBI's 2025 framework for retail algorithmic trading requires automated orders to go through a registered broker's API, with algorithms identified to the exchange. Rules and deadlines evolve, so check SEBI circulars and your broker's current requirements before automating real orders.",
          "AlgoLearn never places real orders. Everything here is education and paper trading.",
        ],
      },
    ],
  },
  {
    id: "l9",
    title: "Verifiable track records with a blockchain ledger",
    minutes: 6,
    level: "Intermediate",
    summary: "Why AlgoLearn fingerprints strategies, backtests and signals on Hyperledger Besu.",
    sections: [
      {
        heading: "The problem",
        paragraphs: [
          "Anyone can screenshot a great backtest or claim a signal service is 80% accurate. Results are easy to cherry-pick or edit after the fact.",
        ],
      },
      {
        heading: "How the ledger helps",
        bullets: [
          "Each strategy, backtest, signal batch and simulator result is reduced to a SHA-256 fingerprint and written to a Hyperledger Besu blockchain at the moment it is created.",
          "The system's signals are committed before you see them, so they cannot be quietly changed later.",
          "Changing even one digit of a recorded result changes its fingerprint, and verification fails.",
          "Only fingerprints go on-chain: your code and identity stay private (users appear as pseudonymous hashes).",
        ],
      },
    ],
    tryIt: { href: "/ledger", label: "Verify a record yourself" },
  },
];
