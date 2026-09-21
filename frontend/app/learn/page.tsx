"use client";
// app/learn/page.tsx — Learning Hub

import { useState, useEffect } from "react";
import { CheckCircle, Circle, Clock, BookOpen, ChevronRight, Lock, Play } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { markLessonComplete, getUserDoc } from "@/lib/firebase";

const LESSONS = [
  {
    id: "l1", title: "What is Algo Trading?", duration: "5 min", level: "Beginner",
    content: `
## What is Algorithmic Trading?

Algorithmic trading (also called **algo trading** or **automated trading**) is the process of using computer programs to automatically execute trades in the stock market based on **predefined rules and conditions**.

Instead of sitting in front of a screen all day and manually clicking "Buy" or "Sell", you write (or generate) a set of instructions — a **strategy** — and the computer follows those instructions 24/7 without emotions.

---

## Why Algo Trading?

Traditional traders often struggle with:
- 😰 **Emotions** — Fear and greed cause bad decisions
- 😴 **Fatigue** — You can't watch markets 24 hours a day
- ⏰ **Speed** — Computers react in milliseconds; humans can't

Algo trading solves all three problems.

---

## How It Works (Simply Put)

1. **Define Rules** — e.g., "If the 20-day average price rises above the 50-day average price, Buy"
2. **Computer Monitors** — The program watches the market 24/7
3. **Auto Execute** — When conditions are met, it places the trade instantly
4. **No Emotion** — It follows the rules exactly, every time

---

## Indian Market Context

In India, we have two major stock exchanges:
- **NSE** (National Stock Exchange) — India's largest, home to NIFTY 50
- **BSE** (Bombay Stock Exchange) — World's largest number of listed companies, home to SENSEX

Algo trading is fully **legal** in India and is regulated by **SEBI** (Securities and Exchange Board of India).

---

## What You'll Learn in This Course

| Module | Topics |
|---|---|
| 📊 Charts | Candlesticks, OHLC data |
| 📈 Indicators | Moving Averages, RSI, MACD |
| 🤖 Strategy | How to define rules |
| 🔬 Backtesting | Testing on historical data |
| 💼 Risk Mgmt | Stop-loss, position sizing |

> 💡 **You don't need to code!** Our AI Builder converts your ideas into Python automatically.
`,
  },
  {
    id: "l2", title: "Reading Candlestick Charts", duration: "8 min", level: "Beginner",
    content: `
## Reading Candlestick Charts

Candlestick charts are the most popular way to view stock prices. Each "candle" shows 4 key pieces of data for a given time period (1 day, 1 hour, etc.).

---

## The Four Parts of a Candle (OHLC)

| Letter | Meaning | Description |
|---|---|---|
| **O** | Open  | Price when the period started |
| **H** | High  | Highest price during the period |
| **L** | Low   | Lowest price during the period |
| **C** | Close | Price when the period ended |

---

## Green vs Red Candles

🟢 **Green Candle** (Bullish) — Price went UP during the period
- Open is at the BOTTOM of the body
- Close is at the TOP of the body

🔴 **Red Candle** (Bearish) — Price went DOWN during the period  
- Open is at the TOP of the body
- Close is at the BOTTOM of the body

---

## The "Wicks" (Shadows)

The thin lines above and below the body are called **wicks** or **shadows**.
- **Upper wick** = How high the price went but came back from
- **Lower wick** = How low the price went but recovered from

Long wicks signal **uncertainty** or **rejection** at those price levels.

---

## Common Candlestick Patterns

### 1. Doji (Indecision)
Open ≈ Close. The market is undecided. Often signals a reversal.

### 2. Hammer (Bullish)
Long lower wick + small body at top. Buyers pushed price back up strongly.

### 3. Shooting Star (Bearish)
Long upper wick + small body at bottom. Sellers pushed price back down strongly.

---

## Why This Matters for Algo Trading

In algo trading, you work with OHLC data as columns in a table (DataFrame):

\`\`\`
Date         Open    High    Low     Close   Volume
2024-01-15   500.0   510.5   495.0   507.8   1500000
2024-01-16   507.8   515.0   503.5   511.2   1800000
\`\`\`

Your strategy will analyze these numbers to decide when to buy or sell!
`,
  },
  {
    id: "l3", title: "Moving Averages", duration: "10 min", level: "Beginner",
    content: `
## Moving Averages — The Foundation of Algo Trading

A **Moving Average (MA)** is simply the **average price** over the last N days. It "moves" forward as new data comes in and old data drops off.

---

## Why Use Moving Averages?

Stock prices are noisy and jumpy. Moving averages **smooth out** the noise and reveal the underlying **trend**.

Think of it like this:
- Raw price = a bumpy road
- Moving Average = the average height of the road (smooth curve)

---

## Simple Moving Average (SMA)

**Formula:** Sum of last N closing prices ÷ N

**Example (5-day SMA):**
| Day | Close | 5-day SMA |
|-----|-------|-----------|
| 1   | 100   | —         |
| 2   | 102   | —         |
| 3   | 98    | —         |
| 4   | 105   | —         |
| 5   | 103   | (100+102+98+105+103)/5 = **101.6** |
| 6   | 107   | (102+98+105+103+107)/5 = **103.0** |

---

## Exponential Moving Average (EMA)

EMA gives **more weight to recent prices**. This makes it react faster to price changes than SMA.

**Rule of thumb:**
- **SMA** = Better for long-term trends
- **EMA** = Better for short-term momentum

---

## The Golden Strategy: MA Crossover

This is the **most popular beginner strategy** and it works like this:

1. Calculate two MAs — a **fast** one (short period, e.g., 20 days) and a **slow** one (long period, e.g., 50 days)
2. When fast MA **crosses above** slow MA → **BUY** 📈 (Golden Cross)
3. When fast MA **crosses below** slow MA → **SELL** 📉 (Death Cross)

**Python Logic:**
\`\`\`python
df['SMA_20'] = df['Close'].rolling(20).mean()
df['SMA_50'] = df['Close'].rolling(50).mean()

df['Buy']  = df['SMA_20'] > df['SMA_50']
df['Sell'] = df['SMA_20'] < df['SMA_50']
\`\`\`

> 💡 Try this strategy in our **Strategy Builder** — just describe it and we'll generate the full code!
`,
  },
  {
    id: "l4", title: "RSI — Relative Strength Index", duration: "12 min", level: "Beginner",
    content: `
## RSI — Relative Strength Index

RSI is a **momentum indicator** that measures how fast and how much prices are changing. It gives you a number from **0 to 100** that tells you if a stock is:

- **Overbought (RSI > 70)** → Price has risen too fast, might be due to fall
- **Oversold (RSI < 30)** → Price has fallen too fast, might be due to rise
- **Neutral (30–70)** → Normal range

---

## How RSI is Calculated

1. Calculate **gains** (positive days) and **losses** (negative days) over 14 days
2. Compute **Average Gain** and **Average Loss**
3. **RS** = Average Gain ÷ Average Loss
4. **RSI** = 100 − (100 ÷ (1 + RS))

The exact math doesn't matter much. What matters is what the number MEANS.

---

## RSI Trading Strategy

### Buy Signal
- RSI drops **below 30** (oversold)
- Stock has been falling too fast and may bounce back

### Sell Signal
- RSI rises **above 70** (overbought)
- Stock has been rising too fast and may pull back

---

## RSI Strategy Example

\`\`\`python
# RSI Mean Reversion Strategy

# Calculate RSI (14-period)
delta    = df['Close'].diff()
gain     = delta.clip(lower=0)
loss     = -delta.clip(upper=0)
avg_gain = gain.rolling(14).mean()
avg_loss = loss.rolling(14).mean()
rs       = avg_gain / avg_loss
df['RSI'] = 100 - (100 / (1 + rs))

# Signals
df['Buy']  = df['RSI'] < 30   # Oversold → Buy
df['Sell'] = df['RSI'] > 70   # Overbought → Sell
\`\`\`

---

## RSI Tips for Indian Markets

- Works best in **sideways (range-bound) markets**
- In strong **trending markets**, RSI can stay overbought for a long time
- Combine RSI with MACD or Moving Averages for better accuracy

> ⚠️ **Important:** No single indicator is perfect. Always backtest before using!
`,
  },
  {
    id: "l5", title: "MACD Strategy", duration: "12 min", level: "Intermediate",
    content: `
## MACD — Moving Average Convergence Divergence

MACD is one of the most popular indicators in the world. It shows the **relationship between two moving averages** and helps identify:

- **Trend direction** (up or down?)
- **Momentum** (is the trend gaining or losing strength?)
- **Potential reversal points**

---

## The Three Parts of MACD

| Component | What it is |
|---|---|
| **MACD Line** | 12-day EMA minus 26-day EMA |
| **Signal Line** | 9-day EMA of the MACD Line |
| **Histogram** | MACD Line minus Signal Line |

---

## How to Read MACD

### Bullish Cross (Buy Signal)
When MACD Line crosses **above** the Signal Line:
- Short-term momentum is stronger than long-term
- **Potential uptrend ahead**

### Bearish Cross (Sell Signal)
When MACD Line crosses **below** the Signal Line:
- Short-term momentum is weaker than long-term
- **Potential downtrend ahead**

### Zero Line Cross
- MACD crossing above zero = Confirmation of uptrend
- MACD crossing below zero = Confirmation of downtrend

---

## Python Code

\`\`\`python
# MACD Calculation
exp1 = df['Close'].ewm(span=12, adjust=False).mean()
exp2 = df['Close'].ewm(span=26, adjust=False).mean()
df['MACD']        = exp1 - exp2
df['Signal_Line'] = df['MACD'].ewm(span=9, adjust=False).mean()
df['Histogram']   = df['MACD'] - df['Signal_Line']

# Crossover signals
df['Buy']  = (df['MACD'] > df['Signal_Line']) & (df['MACD'].shift(1) <= df['Signal_Line'].shift(1))
df['Sell'] = (df['MACD'] < df['Signal_Line']) & (df['MACD'].shift(1) >= df['Signal_Line'].shift(1))
\`\`\`

---

## MACD + RSI Combined (Powerful!)

For even better results, combine both indicators:
- **Buy** when MACD crosses up AND RSI < 70 (not overbought)
- **Sell** when MACD crosses down AND RSI > 30 (not oversold)

> 💡 Try typing this combination into our **AI Strategy Builder** — it will write the code for you!
`,
  },
  {
    id: "l6", title: "Bollinger Bands", duration: "10 min", level: "Intermediate",
    content: `
## Bollinger Bands

Bollinger Bands consist of **three lines** around the price:

1. **Middle Band** — 20-day Simple Moving Average
2. **Upper Band** — Middle Band + 2 × Standard Deviation
3. **Lower Band** — Middle Band − 2 × Standard Deviation

---

## What Do They Show?

The bands **expand** when prices are volatile (moving a lot) and **contract** when prices are calm (moving very little).

**Key principle:** Price tends to stay **within the bands** ~95% of the time.

---

## Bollinger Band Strategies

### Mean Reversion (Most Popular)
- Price touches **lower band** → Likely to bounce back up → **BUY**
- Price touches **upper band** → Likely to pull back → **SELL**

### Breakout Strategy
- Bands are very narrow (Squeeze) → Big move coming soon
- Price breaks **above** upper band with volume → **BUY** (strong uptrend)
- Price breaks **below** lower band with volume → **SELL** (strong downtrend)

---

## Python Code

\`\`\`python
# Bollinger Bands Calculation
df['SMA_20']     = df['Close'].rolling(20).mean()
df['Std_20']     = df['Close'].rolling(20).std()
df['Upper_Band'] = df['SMA_20'] + (df['Std_20'] * 2)
df['Lower_Band'] = df['SMA_20'] - (df['Std_20'] * 2)

# Mean Reversion Signals
df['Buy']  = df['Close'] <= df['Lower_Band']
df['Sell'] = df['Close'] >= df['Upper_Band']
\`\`\`

---

## Bollinger Bands in Indian Markets

Bollinger Bands work particularly well for:
- **Large cap Indian stocks** (RELIANCE, TCS, HDFC Bank) in sideways markets
- **Nifty 50 index** ETFs during consolidation phases

> 🔑 **Remember:** Mean reversion strategies work better in sideways markets. In strong trends, price can "walk the band" for an extended period.
`,
  },
  {
    id: "l7", title: "Backtesting Basics", duration: "10 min", level: "Intermediate",
    content: `
## What is Backtesting?

**Backtesting** is the process of testing a trading strategy against **historical price data** to see how it would have performed in the past.

It answers the question: *"If I had used this strategy over the last year, what would my returns have been?"*

---

## Why Backtest?

Before risking real money, backtesting lets you:
- ✅ Validate your strategy has an "edge"
- 📊 See realistic profit/loss numbers
- 📉 Understand the risks (drawdowns)
- 🔧 Optimize parameters

---

## Key Backtest Metrics

### 1. Total Return %
*"How much did I make?"*
\`\`\`
Total Return = (Final Value - Initial Capital) / Initial Capital × 100
\`\`\`

### 2. Max Drawdown %
*"What was the worst loss from a peak?"*
This measures **risk**. A strategy with +50% returns but -80% drawdown is too risky.

### 3. Win Rate %
*"What % of my trades were profitable?"*
\`\`\`
Win Rate = Winning Trades / Total Closed Trades × 100
\`\`\`

### 4. Sharpe Ratio
*"Return per unit of risk"*
- > 1.0 = Good
- > 2.0 = Excellent
- < 0 = Strategy loses money

---

## Backtesting Pitfalls to Avoid

| Pitfall | What it is | How to avoid |
|---|---|---|
| **Overfitting** | Strategy works on past data but fails live | Test on out-of-sample data |
| **Lookahead Bias** | Using future data to make past decisions | Ensure signals only use past data |
| **Ignoring Costs** | Forgetting brokerage fees & slippage | Account for ₹20-50 per trade |
| **Survivorship Bias** | Testing only on stocks that still exist | Use a broad universe |

---

## Our Backtester

In the **Backtest** section of AlgoLearn, you can:
1. Pick any NSE/BSE stock
2. Choose a date range (up to 5 years)
3. Run your strategy and see all metrics
4. View buy/sell signals on the interactive chart

> 💡 **Tip:** A good beginner target is: **> 15% annual return**, **< 30% max drawdown**, **> 50% win rate**.
`,
  },
  {
    id: "l8", title: "Risk Management", duration: "12 min", level: "Intermediate",
    content: `
## Risk Management — The Most Important Lesson

*"The first rule of investing is don't lose money. The second rule is don't forget rule number one."* — Warren Buffett

No matter how good your strategy is, **without risk management, you WILL blow up your account**. This lesson is the most important one in this course.

---

## The 3 Core Risk Rules

### Rule 1: Never Risk More Than 2% Per Trade
If you have ₹1,00,000, the maximum you should risk losing on any single trade is ₹2,000.

**Why?** Even if you have 10 losing trades in a row, you still have 80% of your capital left.

### Rule 2: Always Use a Stop-Loss
A **stop-loss** is a predefined price at which you automatically EXIT a losing trade.

\`\`\`python
entry_price = 500
stop_loss   = 490     # Exit if price drops 2%
target      = 520     # Take profit at 4% gain

# Risk-Reward Ratio = 20/10 = 2:1 ✅ Good
\`\`\`

Always aim for **Risk:Reward ≥ 1:2** (risk ₹1 to make ₹2).

### Rule 3: Don't Put All Eggs in One Basket
Never put all your capital in one stock. Spread across:
- Different stocks
- Different sectors (IT, Banking, Pharma, etc.)

---

## Position Sizing

**How many shares should you buy?**

\`\`\`
Capital at Risk   = Total Capital × 2% = ₹1,00,000 × 0.02 = ₹2,000
Stop Loss Distance = Entry - Stop = ₹500 - ₹490 = ₹10 per share
Shares to Buy      = Capital at Risk / Stop Distance = ₹2,000 / ₹10 = 200 shares
\`\`\`

---

## Psychological Rules

1. **Don't chase losses** — After a losing trade, don't double your position to "recover"
2. **Follow your system** — Trust your backtested rules, don't override them emotionally
3. **Journal every trade** — Track why you entered, exited, and what you learned
4. **Start small** — Trade with the minimum capital until you're consistently profitable

---

## Risk Management in AlgoLearn

Our backtester automatically calculates:
- **Max Drawdown** — Worst peak-to-trough loss
- **Win Rate** — % of profitable trades
- **Risk per trade** — Based on your ₹1,00,000 virtual portfolio

> 🎓 **Congratulations!** You've completed all core lessons. Now check out the best video tutorials in the next lesson!
`,
  },
  {
    id: "l9", title: "Best Trading Video Tutorials", duration: "20 min", level: "All Levels",
    content: `
## Video Tutorials: Trading Fundamentals & Strategies

We have curated some of the best YouTube channels and tutorials for learning trading fundamentals, price action, and technical analysis.

---

### 1. CA Rachana Phadke Ranade (Fundamentals & Indian Markets)
CA Rachana is one of the most trusted educators for the Indian stock market. Her tutorials cover everything from basics to advanced technical analysis in an easy-to-understand manner.
- **Channel:** [CA Rachana Phadke Ranade](https://www.youtube.com/@CARachanaPhadkeRanade)

### 2. Rayner Teo (Price Action & Strategies)
Rayner Teo is known for his highly practical, data-backed approach to trading. He focuses on price action, moving averages, and systematic strategies without the fluff.
- **Channel:** [Trading with Rayner](https://www.youtube.com/@tradingwithrayner)

### 3. The Trading Channel (Technical Analysis)
Steven Hart offers deep dives into candlestick patterns, support/resistance, and risk management. Great for learning how to read naked charts.
- **Channel:** [The Trading Channel](https://www.youtube.com/channel/UCGL9ubdGcvZh_dvSV2z1hoQ)

### 4. Zerodha Varsity (Comprehensive Modules)
While not just video, Varsity by Zerodha is the gold standard for learning the Indian stock market. They also have an excellent YouTube channel for fundamental analysis and options trading.
- **Link:** [Zerodha Varsity](https://zerodha.com/varsity/)

> 💡 **Ready to build?** After watching these, head to the **Strategy Builder** to turn your new knowledge into an automated Python strategy!
`,
  },
];

function renderMarkdown(text: string) {
  // Simple markdown renderer
  return text
    .replace(/^## (.*)/gm, '<h2>$1</h2>')
    .replace(/^### (.*)/gm, '<h3>$1</h3>')
    .replace(/^#### (.*)/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^> (.*)/gm, '<blockquote>$1</blockquote>')
    .replace(/\| (.*) \|/g, (m) => `<td>${m.slice(2,-2).split(' | ').join('</td><td>')}</td>`)
    .replace(/```python([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/^- (.*)/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.*)/gm, '<li>$2</li>')
    .split('\n\n')
    .map(p => {
      p = p.trim();
      if (p.startsWith('<h') || p.startsWith('<hr') || p.startsWith('<pre') || p.startsWith('<blockquote') || p.startsWith('<li')) return p;
      if (!p) return '';
      return `<p>${p}</p>`;
    })
    .join('\n');
}

export default function LearnPage() {
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      getUserDoc(user.uid).then(data => {
        if (data?.lessonsCompleted) setCompleted(data.lessonsCompleted);
      });
    }
  }, [user]);

  const handleComplete = async () => {
    const lesson = LESSONS[active];
    if (!completed.includes(lesson.id)) {
      const next = [...completed, lesson.id];
      setCompleted(next);
      if (user) await markLessonComplete(user.uid, lesson.id);
    }
    if (active < LESSONS.length - 1) setActive(active + 1);
  };

  const lesson = LESSONS[active];
  const progress = Math.round((completed.length / LESSONS.length) * 100);

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        {/* Header */}
        <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
          <div>
            <h1 className="page-title">Learning Hub</h1>
            <p className="page-subtitle">Master algo trading from zero — no coding experience required</p>
          </div>
          <div className="card" style={{ padding: "0.75rem 1.25rem", minWidth: 200 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Progress</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)" }}>{progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
              {completed.length} / {LESSONS.length} lessons completed
            </div>
          </div>
        </div>

        <div className="layout-sidebar">
          {/* Sidebar — Lesson List */}
          <div className="sidebar">
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Lessons ({LESSONS.length})
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {LESSONS.map((l, i) => (
                <div
                  key={l.id}
                  className={`lesson-item ${i === active ? "active" : ""} ${completed.includes(l.id) ? "completed" : ""}`}
                  onClick={() => setActive(i)}
                >
                  <div className="lesson-num">
                    {completed.includes(l.id) ? <CheckCircle size={16} style={{ color: "white" }} /> : i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lesson-title-sm truncate">{l.title}</div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: 2 }}>
                      <span className="lesson-duration">
                        <Clock size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                        {l.duration}
                      </span>
                      <span className={`badge ${l.level === "Beginner" ? "badge-success" : "badge-warning"}`} style={{ padding: "0.1rem 0.4rem", fontSize: "0.65rem" }}>
                        {l.level}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div>
            <div className="card">
              {/* Lesson header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", paddingBottom: "1rem", borderBottom: "1px solid var(--border-color)" }}>
                <div>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
                    <BookOpen size={16} style={{ color: "var(--accent)" }} />
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Lesson {active + 1} of {LESSONS.length}
                    </span>
                    <span className={`badge ${lesson.level === "Beginner" ? "badge-success" : "badge-warning"}`}>{lesson.level}</span>
                  </div>
                  <h2 style={{ fontSize: "1.4rem", fontWeight: 800 }}>{lesson.title}</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  <Clock size={14} /> {lesson.duration}
                </div>
              </div>

              {/* Lesson Content */}
              <div
                className="lesson-content"
                style={{ lineHeight: 1.8, color: "var(--text-secondary)" }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(lesson.content) }}
              />

              {/* Navigation */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setActive(Math.max(0, active - 1))}
                  disabled={active === 0}
                >
                  ← Previous
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleComplete}
                >
                  {completed.includes(lesson.id) ? (active === LESSONS.length - 1 ? "All Done! 🎉" : "Next →") : "Mark Complete & Continue"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .lesson-content h2 { font-size: 1.3rem; font-weight: 800; color: var(--text-primary); margin: 1.5rem 0 0.75rem; }
        .lesson-content h3 { font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 1.25rem 0 0.5rem; }
        .lesson-content h4 { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 1rem 0 0.5rem; }
        .lesson-content p  { margin-bottom: 0.85rem; color: var(--text-secondary); }
        .lesson-content strong { color: var(--text-primary); font-weight: 700; }
        .lesson-content code { background: var(--bg-tertiary); border-radius: 4px; padding: 0.15rem 0.4rem; font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; color: var(--accent); }
        .lesson-content pre { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px; padding: 1rem 1.25rem; overflow-x: auto; margin: 1rem 0; }
        .lesson-content pre code { background: none; padding: 0; color: var(--text-primary); font-size: 0.82rem; }
        .lesson-content blockquote { border-left: 3px solid var(--accent); padding: 0.5rem 1rem; background: var(--accent-light); border-radius: 0 8px 8px 0; margin: 1rem 0; color: var(--text-primary); font-size: 0.9rem; }
        .lesson-content li { margin-bottom: 0.35rem; color: var(--text-secondary); }
        .lesson-content hr { border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }
        .lesson-content td { padding: 0.4rem 0.85rem; border: 1px solid var(--border-color); font-size: 0.875rem; }
        .lesson-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      `}</style>
    </div>
  );
}
