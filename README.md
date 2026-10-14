# AlgoLearn India

Learn algorithmic trading on Indian markets:
- describe a strategy in plain English and get Python code;
- backtest that exact code on NSE/BSE data;
- paper-trade a past chart with system BUY/SELL signals;
- prove every result on a **Hyperledger Besu** blockchain ledger.

> Educational software. AlgoLearn never places real orders and nothing here is investment advice.

---

## What it does

| Module | What happens |
|---|---|
| **Strategy Builder** (`/builder`) | Plain English → `run_strategy(df)` Python. Uses Gemini when `GEMINI_API_KEY` is set (hardened prompt, validator, self-correcting retry). Without it, a parser reads indicators and numbers from your text (e.g. "RSI(10) below 25") into one of 7 parametrised templates and tells you exactly how it interpreted you. |
| **Backtester** (`/backtest`) | Runs **your actual code** in a sandboxed Python engine. Signals fill at the **next bar's open**, with Indian delivery charges (STT, stamp duty, brokerage, exchange/SEBI fees, GST) and slippage. It is compared against buy-and-hold and **automatically checked for look-ahead bias**. |
| **Simulator** (`/simulator`) | Server-authoritative paper trading. The server reveals candles one at a time (no peeking, no rewinding), fills your orders, and flags candlestick-pattern signals. All signals are committed to the ledger before you see them. A "live signal" panel runs the same engine on today's data. |
| **Ledger** (`/ledger`) | Explorer and verifier for every strategy, backtest, signal batch, live signal and simulator result. Includes downloadable proof bundles and a leaderboard of server-computed, ledger-backed scores. |
| **Learn** (`/learn`) | 9 lessons, from candlesticks to backtesting pitfalls, Indian market rules and verifiable track records. |
| **Dashboard** (`/dashboard`) | Saved strategies (one click to backtest), lesson progress, cumulative simulator stats, and your ledger records. |

## Architecture

```
Browser (Next.js pages)
   │  Firebase ID token (optional)
   ▼
Next.js API routes ──────────────► Yahoo Finance (daily OHLCV)
   │   │
   │   ├──► Python strategy engine (backend/, FastAPI)
   │   │       AST validator → isolated subprocess (restricted builtins,
   │   │       CPU/memory/file limits, drops to `nobody`) → Buy/Sell arrays
   │   │       + look-ahead re-run check. No internet access needed.
   │   │
   │   ├──► lib/portfolio.ts   one accounting engine for every backtest
   │   ├──► lib/signalEngine.ts candlestick patterns (server-side)
   │   │
   │   └──► Ledger service (lib/ledger)
   │           SHA-256(canonical JSON) ──► AlgoLedger.sol on Hyperledger Besu (QBFT)
   │           content ──► off-chain record store (.ledger-data/)
   ▼
Firestore (users, saved strategies) — or local demo mode
```

### Why Hyperledger Besu, and what goes on-chain

Only **fingerprints** go on-chain. A record is `sha256(canonical JSON)` plus a pseudonymous user hash (`sha256(salt:uid)`) and an optional parent link (backtest → strategy, simulation → signal batch). Code, results and identities stay off-chain, so the design suits India's DPDP Act. Records are write-once: the contract has no update or delete function.

| Record | Proves |
|---|---|
| `STRATEGY` | You had this exact code at this time (authorship). Source is visible only to the author. |
| `BACKTEST` | The result came from this code (by hash), this data (by hash), this engine and this cost model. It was not edited afterwards. |
| `SIGNAL_BATCH` | The system's simulator signals were fixed **before** the user saw them. |
| `SIMULATION_RESULT` | A server-computed score linked to the signal batch it was played against. It feeds the leaderboard. |
| `LIVE_SIGNAL` | Today's signal for a symbol, time-stamped once per trading day, so its track record can be audited later. |

The network is a **permissioned** Besu QBFT chain:
- block time 2s, zero gas price;
- only allow-listed accounts may transact (`blockchain/besu/permissions`);
- only `writers` registered in the contract may record.

Writing is ~1 tx per record, queued and non-blocking for the user. A failed write is stored as `pending` or `failed` and retried on the next verification.

Without a Besu node the app uses a **local hash-chained log** (`LEDGER_MODE=local`). It is tamper-evident, but it is clearly labelled as not a blockchain.

---

## Quick start

### Option A: everything in Docker

```bash
cp .env.example .env.local
docker compose up -d --build besu engine     # Besu node + Python engine
npm install
npm run ledger:deploy                        # deploys AlgoLedger, prints LEDGER_CONTRACT_ADDRESS
# put LEDGER_MODE=besu and LEDGER_CONTRACT_ADDRESS=... into .env.local
docker compose up -d --build web             # http://localhost:3000
```

### Option B: local development

Requirements: Node 20+, Python 3.11+, and Docker (for Besu only).

```bash
npm install
cp .env.example .env.local

# 1. Python strategy engine (http://127.0.0.1:8000)
npm run engine:setup
npm run engine            # keep running in its own terminal

# 2. Hyperledger Besu (optional: without it the local dev ledger is used)
npm run besu:up
npm run ledger:deploy     # copy the printed values into .env.local

# 3. Web app
npm run dev               # http://localhost:3000
```

The navbar dot shows the ledger state: green = Besu, amber = local dev ledger, red = unreachable. `GET /api/health` reports the engine, the ledger and the AI configuration.

### Optional services
- **Gemini**: set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) for free-form strategy translation.
- **Firebase**: set the `NEXT_PUBLIC_FIREBASE_*` values and enable Google sign-in. Records are then attributed to signed-in users, and leaderboard entries need a signed-in user. Without Firebase, a local "Demo Trader" account stores data in the browser.

## Tests

```bash
npm run engine:test   # 18 tests: sandbox security, limits, look-ahead detection, API
npm test              # portfolio maths, English parser, Python↔TS template parity, ledger
# against a running Besu node as well:
LEDGER_TEST_RPC=http://127.0.0.1:8545 LEDGER_TEST_CONTRACT=0x... npm test
npm run typecheck && npm run lint && npm run build
```

The Besu tests cover:
- writing a hash and verifying it;
- detecting an edited copy;
- recording parent links on-chain;
- rejecting writes from unauthorised accounts.

---

## Flaws fixed in the original workflow

| # | Problem | Fix |
|---|---|---|
| 1 | The app did not compile: `globals.css`, `contexts/*`, `components/Navbar`, `components/Web3Connect` and the `/learn` page were missing. | All written. Production build passes. |
| 2 | **Backtests ignored the generated code.** The engine searched the code text for words like "rsi" and ran one of 5 hard-coded strategies. | The real code runs in a sandboxed Python engine. Templates have TypeScript twins that are parity-tested and used only for byte-identical templates when the engine is offline. |
| 3 | Look-ahead bias: trades filled at the same close that produced the signal. | Fills happen at the next bar's open, and every strategy is re-run on truncated data to detect future peeking. |
| 4 | No costs, no benchmark. | Indian delivery charges and slippage (toggleable), buy-and-hold benchmark, CAGR, Sharpe, exposure. |
| 5 | Synthetic prices were silently presented as real NSE data. | Every response says `yahoo` or `synthetic`, and the UI shows a warning banner. `ALLOW_SYNTHETIC_DATA=false` turns synthetic data off. |
| 6 | "Run Backtest" in the Builder (and Dashboard) dropped your code and loaded a default template. | Code is handed over to the backtester. |
| 7 | Simulator: the full future price series was sent to the browser, a slider allowed rewinding and trading at past prices, and P&L was computed and reported by the client. | Server-authoritative sessions: forward-only reveal, server-side fills and scoring, ledger-backed results. |
| 8 | Candlestick engine: Morning/Evening Star checks were inverted, and reversal patterns had no trend context. | Patterns corrected, a trend filter added, and the engine versioned (`candlestick-v2`). |
| 9 | The Supertrend template used chained assignment (a silent no-op on modern pandas) and fired Buy on every bar. | Correct Supertrend with flip signals. RSI now uses Wilder smoothing. |
| 10 | A failed Google sign-in silently logged you in as a shared demo user. Simulator stats overwrote instead of adding up. The Firestore query needed a missing index. The dashboard win rate could show `NaN%`. | All fixed. Demo mode only applies when Firebase is not configured, and is clearly labelled. |
| 11 | The Gemini prompt interpolated user text directly and the generated code was never validated. | System instruction plus delimited user data, validator-checked output with one corrective retry, and a safe fallback. |
| 12 | No input validation or rate limits on API routes. | Symbol/period/capital validation, body size limits, per-IP rate limits, consistent JSON errors. |
| 13 | The landing page claimed "India's #1", "10,000+ students" and fixed "+24.3% backtested" returns. | Replaced with verifiable statements. |
| 14 | MetaMask logging was documented but not implemented, and needed users to hold ETH. | A permissioned Besu ledger signed by the platform; users need no wallet. |
| 15 | The README described `backend/` and `frontend/` folders that did not exist; `@google/genai` was pinned to `*`. | Accurate docs and pinned dependencies. |

## Production checklist

- Generate a new platform key, put its address in `permissions_config.toml` and the genesis `alloc`, and run `npm run ledger:deploy` with it. **Never use the public dev key.**
- Run 4+ Besu validators (`blockchain/besu/generate-network.sh`, `count: 4`). QBFT then tolerates one faulty node. Partner organisations (brokers, colleges) can each run a validator.
- Set `LEDGER_SUBJECT_SALT`, `ENGINE_API_KEY` and `ALLOW_SYNTHETIC_DATA=false`.
- Keep the engine on an internal network (as in `docker-compose.yml`).
- Simulator sessions, rate limits and the record store are single-instance (memory and files). Move them to Redis/Postgres before scaling out.
- Yahoo Finance is an unofficial source; use a licensed NSE/BSE data vendor for anything beyond education.

## Project layout

```
app/                    pages + API routes (api/backtest, api/simulator/*, api/ledger/*, api/signals/live, …)
components/             Navbar, CandleChart, LedgerReceipts, DataSourceBanner
contexts/               Auth + Theme providers
lib/
  portfolio.ts          accounting engine (fills, costs, metrics)
  strategyTemplates.ts  7 templates (Python + TS twin) + English parser
  signalEngine.ts       candlestick-pattern signals
  stockService.ts       Yahoo data, validation, labelled synthetic fallback
  ledger/               AlgoLedger ABI, canonical hashing, Besu/local ledger, record store
  server/               engine client, auth (Firebase JWT), simulator sessions, rate limiting
backend/                FastAPI strategy engine (validator, sandbox runner, tests, Dockerfile)
blockchain/
  contracts/            AlgoLedger.sol
  scripts/              compile.mjs, deploy.mjs
  besu/                 QBFT genesis, validator key (DEV), permissions, generate-network.sh
tests/                  vitest suites
```
