# AlgoLearn India 🚀

> Learn algorithmic trading from scratch. Build strategies in plain English, backtest on real NSE/BSE data, simulate trades risk-free — and log your results on the blockchain.

---

## Features

| Module | Description |
|---|---|
| 📚 **Learning Hub** | 9 structured lessons covering candlestick basics to famous trader strategies |
| 🤖 **AI Strategy Builder** | Describe your strategy in plain English → get Python code (Gemini AI or templates) |
| 📊 **Backtester** | Run strategies against real NSE/BSE historical data with full performance stats |
| 🎮 **Trade Simulator** | Replay past charts candle-by-candle with ₹1,00,000 virtual portfolio + dynamic signals |
| 📈 **Interactive Charts** | Zoomable/pannable TradingView-style candlestick charts (lightweight-charts) |
| 🔗 **Blockchain Logging** | Log your simulation results immutably on-chain via MetaMask (ethers.js) |
| 🔐 **Auth & DB** | Google Sign-In via Firebase, with Firestore for saved strategies and progress |
| 🌗 **Theme Toggle** | Light/Dark mode with OS preference detection |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Vanilla CSS |
| Charts | TradingView lightweight-charts (zoom, pan, markers) |
| Auth/DB | Firebase Authentication (Google) + Firestore |
| Backend | Python FastAPI + yfinance + pandas + pandas_ta |
| AI | Google Gemini API (optional, with template fallback) |
| Web3 | ethers.js + MetaMask (blockchain result logging) |

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- A **Firebase project** (free tier is fine)
- *(Optional)* A **Google Gemini API key** for AI strategy generation
- *(Optional)* **MetaMask** browser extension for blockchain logging

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/algolearn.git
cd algolearn
```

### 2. Set up the Python Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env and add your GEMINI_API_KEY (optional)

# Start the server
python main.py
# → Backend runs at http://localhost:8000
```

### 3. Set up the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
copy .env.local.example .env.local
# Edit .env.local and add your Firebase config values

# Start dev server
npm run dev
# → Frontend runs at http://localhost:3000
```

### 4. Open http://localhost:3000 🎉

---

## Firebase Setup (Step-by-Step)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"**
3. Once created, go to **Project Settings → General → Your apps → Add Web App**
4. Copy the config values into `frontend/.env.local`:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
   ```
5. Go to **Authentication → Sign-in method → Enable Google**
6. Go to **Firestore Database → Create database** (start in test mode)

---

## Gemini API Key (Optional)

The AI Strategy Builder uses Google Gemini to convert plain-English descriptions to Python code.

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Add it to `backend/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```

If no key is provided, the app automatically falls back to **pre-built strategy templates** (Moving Average Crossover, RSI, MACD, Bollinger Bands, Supertrend).

---

## Project Structure

```
algolearn/
├── backend/
│   ├── main.py              # FastAPI server (data + backtesting + AI)
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment template
│   └── venv/                # Python virtual env (created by you, git-ignored)
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       # Root layout + providers
│   │   ├── page.tsx         # Landing page
│   │   ├── learn/           # Learning Hub (9 lessons)
│   │   ├── builder/         # AI Strategy Builder
│   │   ├── backtest/        # Backtester with zoomable charts
│   │   ├── simulator/       # Trade Simulator with signals & Web3
│   │   └── dashboard/       # User Dashboard
│   ├── components/
│   │   ├── Navbar.tsx       # Navigation bar
│   │   └── Web3Connect.tsx  # MetaMask wallet connector
│   ├── contexts/
│   │   ├── ThemeContext.tsx  # Light/Dark theme
│   │   └── AuthContext.tsx   # Firebase auth state
│   ├── lib/
│   │   ├── firebase.ts      # Firebase init + helpers
│   │   └── api.ts           # Backend API client
│   └── .env.local.example   # Environment template
│
└── README.md                # This file
```

---

## Available Strategies

| Strategy | Type | Description |
|---|---|---|
| Moving Average Crossover | Trend | Buy on golden cross (SMA20 > SMA50) |
| RSI Mean Reversion | Momentum | Buy when RSI < 30, sell when RSI > 70 |
| MACD Strategy | Trend/Momentum | Buy on MACD/Signal bullish cross |
| Bollinger Bands | Mean Reversion | Buy at lower band, sell at upper band |
| Supertrend | Trend | ATR-based trend following |

---

## Supported Stocks (40+)

**Large Cap:** RELIANCE, TCS, INFY, HDFC Bank, ICICI Bank, HUL, Bajaj Finance, Wipro, L&T, SBI, Axis Bank, Maruti, Titan, Sun Pharma, Asian Paints, Kotak Bank, ITC, HCL Tech, M&M, Bharti Airtel

**Additional NIFTY/BSE:** Tata Steel, JSW Steel, ONGC, NTPC, Power Grid, Adani Enterprises, Tata Motors, Bajaj Finserv, Grasim, IndusInd Bank

**New Additions:** Zomato, Tata Power, HDFC Life, Bajaj Auto, Coal India, Adani Ports, UltraTech Cement, Dr. Reddy's, Cipla, Divi's Labs, Pidilite, Havells, Dabur, Godrej CP, Biocon, Muthoot Finance, SRF, Page Industries (Jockey), IRCTC, Nykaa

**Indices:** Nifty 50 (^NSEI), Sensex (^BSESN)

---

## Blockchain Feature

The simulator includes a **Web3 integration** that lets you log your trading performance immutably on the Ethereum blockchain:

1. Click **"Connect Wallet"** after completing a simulation
2. MetaMask will prompt you to connect
3. Click **"Log Results On-Chain"** to sign a transaction
4. Your P&L and win rate are recorded permanently, with a verifiable Etherscan link

> ⚠️ Use a **test network** (e.g., Sepolia) to avoid spending real ETH.

---

## Disclaimer

⚠️ **This platform is for educational purposes only.** It does not constitute financial advice. Always consult a qualified financial advisor before investing. Past performance does not guarantee future results. Algorithmic trading involves significant risk.

---

Built with ❤️ for Indian markets


---

## Features

| Module | Description |
|---|---|
| 📚 **Learning Hub** | 8 structured lessons from candlestick basics to risk management |
| 🤖 **AI Strategy Builder** | Describe your strategy in plain English → get Python code (Gemini AI or templates) |
| 📊 **Backtester** | Run strategies against real NSE/BSE historical data with full performance stats |
| 🎮 **Trade Simulator** | Replay past charts candle-by-candle, place buy/sell with ₹1,00,000 virtual portfolio |
| 🔐 **Auth & DB** | Google Sign-In via Firebase, with Firestore for saved strategies and progress |
| 🌗 **Theme Toggle** | Light/Dark mode with OS preference detection |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Vanilla CSS |
| Auth/DB | Firebase Authentication (Google) + Firestore |
| Charts | HTML5 Canvas (custom candlestick renderer) |
| Backend | Python FastAPI + yfinance + pandas |
| AI | Google Gemini API (optional, with template fallback) |

---

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- A **Firebase project** (free tier is fine)
- *(Optional)* A **Google Gemini API key** for AI strategy generation

---

## Quick Start

### 1. Clone / Open the project

```
cd C:\Users\bp877\.gemini\antigravity-ide\scratch\algolearn
```

### 2. Set up the Python Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
# Edit .env and add your GEMINI_API_KEY (optional)

# Start the server
python main.py
# → Backend runs at http://localhost:8000
```

### 3. Set up the Frontend

```bash
cd frontend

# Configure environment
copy .env.local.example .env.local
# Edit .env.local and add your Firebase config values

# Start dev server
npm run dev
# → Frontend runs at http://localhost:3000
```

### 4. Open http://localhost:3000 🎉

---

## Firebase Setup (Step-by-Step)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"**
3. Once created, go to **Project Settings → General → Your apps → Add Web App**
4. Copy the config values into `frontend/.env.local`:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
   ```
5. Go to **Authentication → Sign-in method → Enable Google**
6. Go to **Firestore Database → Create database** (start in test mode)

---

## Gemini API Key (Optional)

The AI Strategy Builder uses Google Gemini to convert plain-English descriptions to Python code.

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Add it to `backend/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```

If no key is provided, the app automatically falls back to **pre-built strategy templates** (Moving Average Crossover, RSI, MACD, Bollinger Bands, Supertrend).

---

## Project Structure

```
algolearn/
├── backend/
│   ├── main.py              # FastAPI server (data + backtesting + AI)
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment template
│   └── venv/                # Python virtual env (created by you)
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx       # Root layout + providers
│   │   ├── page.tsx         # Landing page
│   │   ├── learn/           # Learning Hub (8 lessons)
│   │   ├── builder/         # AI Strategy Builder
│   │   ├── backtest/        # Backtester
│   │   ├── simulator/       # Trade Simulator
│   │   └── dashboard/       # User Dashboard
│   ├── components/
│   │   └── Navbar.tsx       # Navigation bar
│   ├── contexts/
│   │   ├── ThemeContext.tsx  # Light/Dark theme
│   │   └── AuthContext.tsx   # Firebase auth state
│   ├── lib/
│   │   ├── firebase.ts      # Firebase init + helpers
│   │   └── api.ts           # Backend API client
│   └── .env.local.example   # Environment template
│
└── README.md                # This file
```

---

## Available Strategies

| Strategy | Type | Description |
|---|---|---|
| Moving Average Crossover | Trend | Buy on golden cross (SMA20 > SMA50) |
| RSI Mean Reversion | Momentum | Buy when RSI < 30, sell when RSI > 70 |
| MACD Strategy | Trend/Momentum | Buy on MACD/Signal bullish cross |
| Bollinger Bands | Mean Reversion | Buy at lower band, sell at upper band |
| Supertrend | Trend | ATR-based trend following |

---

## Supported Stocks

RELIANCE, TCS, INFY, HDFC Bank, ICICI Bank, HUL, Bajaj Finance, Wipro, L&T, SBI, Axis Bank, Maruti, Titan, Sun Pharma, Asian Paints, Kotak Bank, Nifty 50, Sensex

---

## Disclaimer

⚠️ **This platform is for educational purposes only.** It does not constitute financial advice. Always consult a qualified financial advisor before investing. Past performance does not guarantee future results. Algorithmic trading involves significant risk.

---

Built with ❤️ for Indian markets
