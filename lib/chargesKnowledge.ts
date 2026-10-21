// lib/chargesKnowledge.ts — FAQ knowledge base for the trading-charges assistant.
//
// Answers use a small markdown subset understood by components/ChatMessage: **bold**, "- " bullets,
// blank-line paragraphs. Keywords are lower-case; multi-word keywords score higher than single words.

import { DP_CHARGE, GST_PCT, RATES_AS_OF, SEBI_FEE_PCT, SEGMENTS } from "./charges";

export interface KnowledgeEntry {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  related?: string[];
}

const S = SEGMENTS;

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: "overview",
    title: "What charges do I pay on a trade?",
    keywords: ["all charges", "what charges", "which charges", "charges list", "rate card", "charges breakdown", "types of charges", "fees", "hidden charges", "charge", "charges", "cost of trading"],
    answer: `Every trade in India carries two kinds of charges:

**Statutory (same at every broker)**
- **STT / CTT**: securities (or commodities) transaction tax, paid to the government.
- **Stamp duty**: on the buy side only, collected for the state.
- **Exchange transaction charge**: NSE/BSE/MCX fee on turnover.
- **SEBI turnover fee**: ₹10 per crore.
- **GST**: ${GST_PCT}% on brokerage + exchange charge + SEBI fee.

**Broker-specific**
- **Brokerage**: ₹0 to ₹20 per order at discount brokers, a % of turnover at full-service brokers.
- **DP charge**: about ₹${DP_CHARGE} + GST per scrip when you sell delivery shares.
- Optional services: call & trade, auto square-off, margin (MTF) interest, pledging.

Ask me to calculate one, e.g. "charges to buy 100 shares at ₹500 and sell at ₹520 intraday".`,
    related: ["stt", "brokerage", "dp_charges"],
  },
  {
    id: "stt",
    title: "What is STT (Securities Transaction Tax)?",
    keywords: ["stt", "securities transaction tax", "transaction tax"],
    answer: `**STT** is a tax on buying/selling securities on a recognised exchange, collected by the exchange for the government. Rates (as of ${RATES_AS_OF}):
- **Equity delivery**: ${S.equity_delivery.tax.buyPct}% on buy **and** sell.
- **Equity intraday**: ${S.equity_intraday.tax.sellPct}% on the sell side.
- **Futures**: ${S.equity_futures.tax.sellPct}% on the sell side (raised from 0.02% by Budget 2026).
- **Options**: ${S.equity_options.tax.sellPct}% of premium on the sell side (raised from 0.1%), and 0.15% of intrinsic value if a long option is exercised.
- **Currency** derivatives: no STT.

STT is charged on loss-making trades too, and GST is not levied on STT.`,
    related: ["options_exercise", "fno_charges", "tax_on_profits"],
  },
  {
    id: "stamp_duty",
    title: "What is stamp duty on trades?",
    keywords: ["stamp duty", "stamp"],
    answer: `**Stamp duty** is charged on the **buy side only** under the Indian Stamp Act and is uniform across states:
- Equity delivery: ${S.equity_delivery.stampBuyPct}% (₹1,500 per crore)
- Equity intraday: ${S.equity_intraday.stampBuyPct}% (₹300 per crore)
- Futures: ${S.equity_futures.stampBuyPct}% (₹200 per crore)
- Options: ${S.equity_options.stampBuyPct}% of premium (₹300 per crore)
- Currency derivatives: ${S.currency_futures.stampBuyPct}%
- Mutual fund purchases: 0.005%`,
  },
  {
    id: "exchange_txn",
    title: "What is the exchange transaction charge?",
    keywords: ["exchange transaction charge", "transaction charge", "exchange charge", "exchange fee", "turnover charge", "nse charge", "bse charge", "ipft"],
    answer: `The **exchange transaction charge** is what NSE, BSE or MCX bills on your turnover (buy + sell value). The figures below include the small investor-protection fund (IPFT) levy:
- Equity (delivery & intraday): NSE ${S.equity_delivery.exchangePct.NSE}%, BSE ${S.equity_delivery.exchangePct.BSE}%
- Futures: NSE ${S.equity_futures.exchangePct.NSE}%
- Options: NSE ${S.equity_options.exchangePct.NSE}% of premium, BSE ${S.equity_options.exchangePct.BSE}%
- Currency: futures ${S.currency_futures.exchangePct.NSE}%, options ${S.currency_options.exchangePct.NSE}% (NSE)
- MCX commodity: futures ${S.commodity_futures.exchangePct.MCX}%, options ${S.commodity_options.exchangePct.MCX}%

Since October 2024 SEBI requires exchanges to charge one flat rate to all brokers, so this is passed on to you as-is. GST of ${GST_PCT}% applies on it.`,
  },
  {
    id: "sebi_fee",
    title: "What is the SEBI turnover fee?",
    keywords: ["sebi fee", "sebi charge", "sebi turnover", "sebi"],
    answer: `The **SEBI turnover fee** is ₹10 per crore of turnover (${SEBI_FEE_PCT}%), on both buy and sell, in every segment. On a ₹1 lakh trade it is just ₹0.10, plus ${GST_PCT}% GST.`,
  },
  {
    id: "gst",
    title: "How is GST charged on trades?",
    keywords: ["gst", "goods and services tax", "service tax"],
    answer: `**GST at ${GST_PCT}%** is charged on the *services* part of your trade:
- brokerage
- exchange transaction charges
- SEBI turnover fee
- DP charges and other broker fees (call & trade, auto square-off, AMC)

GST is **not** charged on STT/CTT or stamp duty, because those are taxes themselves.`,
  },
  {
    id: "dp_charges",
    title: "What are DP (depository) charges?",
    keywords: ["dp charge", "dp charges", "depository charge", "depository participant", "cdsl", "nsdl", "debit transaction"],
    answer: `**DP charges** apply when shares leave your demat account, i.e. when you **sell delivery holdings**.
- Charged once per scrip per day, whatever the quantity (selling 1 or 1,000 shares of the same stock costs the same).
- Typically about **₹${DP_CHARGE} + GST** (≈ ₹${(DP_CHARGE * 1.18).toFixed(2)}) at discount brokers; full-service brokers often charge more.
- Not charged on intraday or F&O trades, or when you buy.`,
  },
  {
    id: "brokerage",
    title: "How does brokerage work?",
    keywords: ["brokerage", "broker fee", "broker charge", "discount broker", "full service", "full-service", "flat fee", "₹20", "rs 20", "zero brokerage", "free delivery"],
    answer: `**Brokerage** is your broker's fee per executed order. Two common models:

**Discount brokers** (flat fee)
- Equity delivery: often ₹0
- Intraday, futures, currency, commodity futures: 0.03% or ₹20 per order, whichever is lower
- Options: flat ₹20 per order

**Full-service brokers** (percentage)
- Delivery around 0.3–0.5%, intraday/futures around 0.03–0.05%, options a flat ₹50–₹100 per lot or order
- Usually include research, advisory and branch support

Brokerage is per *executed order*: a buy and a sell are two orders. ${GST_PCT}% GST is added. Check your broker's current tariff; this assistant uses typical values.`,
    related: ["call_trade", "compare_plans"],
  },
  {
    id: "compare_plans",
    title: "Discount vs full-service broker: which is cheaper?",
    keywords: ["which broker", "cheapest broker", "best broker", "compare broker", "discount vs", "vs full", "cheaper"],
    answer: `On cost alone, **discount brokers** are cheaper for almost every trader: brokerage is capped at ~₹20 per order however large the trade, and delivery is often free. Full-service brokers charge a percentage, so their fee grows with the trade size, but they bundle research, relationship managers and branches.

Statutory charges (STT, stamp duty, exchange and SEBI fees) are identical at every broker. Try the calculator and switch the plan to compare. AlgoLearn doesn't recommend specific brokers.`,
  },
  {
    id: "delivery",
    title: "What are the charges for delivery (CNC) trades?",
    keywords: ["delivery charges", "delivery trade", "cnc", "long term", "investment charges", "equity delivery", "delivery"],
    answer: `For **equity delivery** (buy today, hold beyond the day):
- Brokerage: often ₹0 at discount brokers
- STT: ${S.equity_delivery.tax.buyPct}% on buy **and** sell
- Stamp duty: ${S.equity_delivery.stampBuyPct}% on buy
- Exchange charge: NSE ${S.equity_delivery.exchangePct.NSE}% / BSE ${S.equity_delivery.exchangePct.BSE}%
- SEBI fee ₹10/crore, GST ${GST_PCT}% on fees
- DP charge ~₹${DP_CHARGE} + GST when you sell

Round-trip cost is roughly **0.22–0.25%** of trade value plus the DP charge.`,
    related: ["dp_charges", "tax_on_profits"],
  },
  {
    id: "intraday",
    title: "What are the charges for intraday (MIS) trades?",
    keywords: ["intraday charges", "intraday", "mis", "day trading", "same day", "square off same day"],
    answer: `For **equity intraday** (buy and sell the same day):
- Brokerage: 0.03% or ₹20 per order, whichever is lower (discount broker)
- STT: ${S.equity_intraday.tax.sellPct}% on the **sell** side only
- Stamp duty: ${S.equity_intraday.stampBuyPct}% on buy
- Exchange charge: NSE ${S.equity_intraday.exchangePct.NSE}%
- SEBI fee ₹10/crore, GST ${GST_PCT}% on fees
- No DP charge

Intraday is cheaper per trade than delivery, but frequent trading adds up. Always check your breakeven.`,
    related: ["breakeven", "auto_squareoff"],
  },
  {
    id: "fno_charges",
    title: "What are the charges for options trading?",
    keywords: ["options charges", "option charges", "options", "option", "call option", "put option", "premium", "ce", "pe", "nifty options", "banknifty", "bank nifty", "sensex options", "f&o", "fno", "derivatives"],
    answer: `For **equity/index options** (charges are on the **premium**, not the contract value):
- Brokerage: flat ₹20 per order (discount broker)
- STT: ${S.equity_options.tax.sellPct}% of premium on the **sell** side (from ${RATES_AS_OF})
- Stamp duty: ${S.equity_options.stampBuyPct}% on buy
- Exchange charge: NSE ${S.equity_options.exchangePct.NSE}%, BSE ${S.equity_options.exchangePct.BSE}% of premium
- SEBI fee ₹10/crore, GST ${GST_PCT}% on fees
- If a long ITM option expires and is exercised: STT 0.15% of intrinsic value

On cheap options the flat ₹20 brokerage is the biggest part of the cost, so it's a large % of a small premium.`,
    related: ["options_exercise", "futures", "physical_settlement"],
  },
  {
    id: "futures",
    title: "What are the charges for futures trading?",
    keywords: ["futures charges", "future charges", "futures", "future", "fut", "nifty futures", "stock futures"],
    answer: `For **equity/index futures** (charges are on the full contract value):
- Brokerage: 0.03% or ₹20 per order, whichever is lower (discount broker)
- STT: ${S.equity_futures.tax.sellPct}% on the **sell** side (raised from 0.02% from ${RATES_AS_OF})
- Stamp duty: ${S.equity_futures.stampBuyPct}% on buy
- Exchange charge: NSE ${S.equity_futures.exchangePct.NSE}%
- SEBI fee ₹10/crore, GST ${GST_PCT}% on fees`,
    related: ["fno_charges", "physical_settlement"],
  },
  {
    id: "options_exercise",
    title: "What happens to STT when my option is exercised?",
    keywords: ["exercise", "exercised", "expiry", "expire", "itm", "in the money", "intrinsic value", "stt trap"],
    answer: `If you hold a **long, in-the-money option to expiry**, it is exercised and STT is charged at **0.15% of the intrinsic value** (strike vs settlement price × quantity), not of the premium.

Since the 2026 Budget the exercise rate and the sell rate are both 0.15%, but exercise STT is on *intrinsic value*, which can be far larger than the premium you'd get by selling. Many brokers also charge extra for exercised contracts. Squaring off before expiry is usually cheaper.`,
  },
  {
    id: "physical_settlement",
    title: "What is physical settlement of stock F&O?",
    keywords: ["physical settlement", "physical delivery", "stock options expiry", "delivery margin"],
    answer: `**Stock** futures and options in India are **physically settled**: if you hold an ITM stock option or a stock future at expiry, you must take or give delivery of the shares.
- Delivery STT (0.1%) applies to the settlement value.
- Brokers raise margin requirements in the expiry week and may square off positions.
- Index derivatives (Nifty, Bank Nifty, Sensex) are cash-settled instead.`,
  },
  {
    id: "currency",
    title: "What are the charges for currency derivatives?",
    keywords: ["currency", "usdinr", "usd inr", "forex", "eurinr", "gbpinr", "jpyinr", "cds"],
    answer: `For **currency derivatives** (e.g. USDINR):
- **No STT**
- Brokerage: 0.03% or ₹20 per order (futures), flat ₹20 (options) at discount brokers
- Exchange charge (NSE): futures ${S.currency_futures.exchangePct.NSE}%, options ${S.currency_options.exchangePct.NSE}% of premium
- Stamp duty: ${S.currency_futures.stampBuyPct}% on buy
- SEBI fee ₹10/crore, GST ${GST_PCT}% on fees

Exchange-traded currency derivatives need an underlying forex exposure under RBI rules; check with your broker.`,
  },
  {
    id: "commodity",
    title: "What are the charges for commodity trading (MCX)?",
    keywords: ["commodity", "commodities", "mcx", "crude", "crude oil", "gold", "silver", "natural gas", "ctt", "copper"],
    answer: `For **commodity derivatives on MCX**:
- **CTT** (commodity transaction tax): ${S.commodity_futures.tax.sellPct}% on sell for non-agri futures, ${S.commodity_options.tax.sellPct}% of premium on sell for options. Agri commodities are exempt.
- Brokerage: 0.03% or ₹20 per order (futures), flat ₹20 (options) at discount brokers
- Exchange charge: futures ${S.commodity_futures.exchangePct.MCX}%, options ${S.commodity_options.exchangePct.MCX}% of premium
- Stamp duty: ${S.commodity_futures.stampBuyPct}% (futures), ${S.commodity_options.stampBuyPct}% (options) on buy
- SEBI fee ₹10/crore, GST ${GST_PCT}% on fees`,
  },
  {
    id: "breakeven",
    title: "How do I find my breakeven after charges?",
    keywords: ["breakeven", "break even", "break-even", "points to cover", "cover charges", "minimum profit", "net profit"],
    answer: `**Breakeven** is how far the price must move in your favour just to pay all charges:

breakeven points per share = total charges ÷ quantity

Example: if a round trip costs ₹60 on 100 shares, the price must rise ₹0.60 before you make a rupee. Give me a quantity with buy and sell prices and I'll work out the charges, net P&L and breakeven.`,
  },
  {
    id: "account_charges",
    title: "Account opening and AMC (annual maintenance) charges",
    keywords: ["account opening", "open account", "amc", "annual maintenance", "maintenance charge", "demat charges", "demat", "bsda", "yearly charge"],
    answer: `- **Account opening**: free at most discount brokers; some charge ₹200–₹500.
- **Demat AMC**: usually ₹0–₹300 + GST a year, billed quarterly or yearly.
- **BSDA (Basic Services Demat Account)**: if you hold only one demat account and your holdings are small, SEBI rules cap the AMC: **₹0 up to ₹4 lakh** of holdings and at most **₹100 a year from ₹4 lakh to ₹10 lakh**. Ask your broker to convert your account.
- Trading accounts themselves normally have no annual fee.`,
  },
  {
    id: "call_trade",
    title: "What are call & trade charges?",
    keywords: ["call and trade", "call & trade", "call trade", "dealer", "phone order", "order by phone"],
    answer: `**Call & trade** means placing an order by phoning your broker's dealing desk. Discount brokers typically charge **₹50 + GST per executed order** on top of normal brokerage. Orders placed in the app or website are not charged this.`,
  },
  {
    id: "auto_squareoff",
    title: "What are auto square-off charges?",
    keywords: ["auto square off", "auto square-off", "auto squareoff", "square off charge", "rms square off", "mis square off"],
    answer: `If you don't close an **intraday (MIS)** or margin position before the broker's cut-off (typically around 3:15–3:25 pm for equity), the broker's risk system closes it for you. Many brokers charge about **₹50 + GST per order** for this, on top of brokerage. Close intraday positions yourself to avoid it.`,
  },
  {
    id: "mtf",
    title: "What does margin trading (MTF) cost?",
    keywords: ["mtf", "margin trading", "margin interest", "pay later", "leverage", "funding", "interest"],
    answer: `**Margin Trading Facility (MTF)** lets you buy delivery shares with part of the money lent by the broker. You pay:
- **Interest** on the funded amount, commonly 0.03–0.05% per day (~12–18% a year), charged every calendar day you hold.
- Normal delivery charges (STT, stamp duty, etc.), plus pledge charges at some brokers.

Interest can quickly exceed brokerage, so MTF suits short holding periods. Losses are magnified as well as gains.`,
    related: ["pledge"],
  },
  {
    id: "pledge",
    title: "What are pledge charges?",
    keywords: ["pledge", "unpledge", "collateral margin", "margin pledge"],
    answer: `**Pledging** shares or ETFs gives you margin for F&O or intraday. Brokers commonly charge around **₹30 + GST per ISIN** per pledge request; unpledging is often free. A 50% cash component may still be needed for F&O positions held overnight.`,
  },
  {
    id: "tax_on_profits",
    title: "How are trading profits taxed?",
    keywords: ["tax on profit", "income tax", "capital gains", "stcg", "ltcg", "short term", "long term capital", "itr", "tax", "speculative", "business income", "turnover audit"],
    answer: `(General information, not tax advice. Check with a CA.)
- **Delivery, held ≤ 12 months** (listed equity): STCG at **20%**.
- **Delivery, held > 12 months**: LTCG at **12.5%** on gains above **₹1.25 lakh** a year.
- **Intraday equity**: *speculative business income*, taxed at your slab rate.
- **F&O**: *non-speculative business income* at slab rate. Expenses (brokerage, STT, internet, etc.) are deductible and audit rules may apply.

STT and stamp duty are not deductible against capital gains, but they are part of your business expenses for F&O/intraday.`,
  },
  {
    id: "settlement",
    title: "Settlement cycle and market timings",
    keywords: ["settlement", "t+1", "t+0", "when will i get", "funds credited", "market hours", "market timing", "trading hours", "pre open"],
    answer: `- Equity settles on **T+1**: shares bought today reach your demat, and sale proceeds become withdrawable, the next trading day. An optional T+0 settlement exists for a limited set of stocks at some brokers.
- Equity market hours: **9:15 am – 3:30 pm IST**, with a pre-open session from 9:00.
- Currency derivatives: 9:00 am – 5:00 pm. MCX commodities: 9:00 am – 11:30/11:55 pm.`,
  },
  {
    id: "ipo",
    title: "Are there charges for applying to an IPO?",
    keywords: ["ipo", "initial public offering", "apply ipo", "asba", "upi mandate", "allotment"],
    answer: `Applying for an IPO through UPI or ASBA is **free**: no brokerage, STT or stamp duty on the application. The money is only blocked in your bank account until allotment. If you're allotted shares and later sell them, normal delivery charges (and DP charge) apply.`,
  },
  {
    id: "mutual_funds",
    title: "What charges apply to mutual funds?",
    keywords: ["mutual fund", "mutual funds", "sip", "direct plan", "regular plan", "expense ratio", "exit load", "etf"],
    answer: `- **Direct plans**: no commission; you pay only the fund's **expense ratio** (deducted from NAV daily).
- **Regular plans**: higher expense ratio that includes distributor commission.
- **Stamp duty**: 0.005% on purchase (including each SIP instalment).
- **Exit load**: some funds charge (often 1%) if you redeem within a set period, e.g. 1 year.
- **ETFs** trade like shares, so delivery charges apply to them.`,
  },
  {
    id: "loss_trades",
    title: "Do I pay charges on losing trades?",
    keywords: ["loss trade", "losing trade", "charges on loss", "even on loss", "refund charges", "no profit"],
    answer: `Yes. Brokerage, STT, stamp duty, exchange and SEBI fees and GST are charged on **turnover**, not profit, so they apply whether a trade makes or loses money. This is why frequent small trades can lose money even with a decent win rate.`,
  },
  {
    id: "contract_note",
    title: "Where can I see the charges I paid?",
    keywords: ["contract note", "where can i see", "statement", "ledger statement", "p&l statement", "tax p&l", "charges paid"],
    answer: `Your broker emails a **contract note** for every trading day you trade. It lists each order and every charge (brokerage, STT, exchange charges, SEBI fee, stamp duty, GST). Your broker's back-office (P&L or tax P&L reports) shows totals for any period.`,
  },
  {
    id: "debit_balance",
    title: "What if my account goes into a debit (negative) balance?",
    keywords: ["debit balance", "negative balance", "delayed payment", "interest on debit", "shortfall"],
    answer: `If charges or losses push your trading account below zero, brokers charge **delayed-payment interest**, often 0.05% per day (~18% a year), until you add funds. Some also charge a flat fee (e.g. ₹40 + GST) per order placed while the account is in debit. Add funds promptly to avoid it.`,
  },
  {
    id: "funds",
    title: "Are there charges for adding or withdrawing funds?",
    keywords: ["add funds", "withdraw", "withdrawal", "payin", "pay in", "payout", "net banking", "upi deposit", "payment gateway"],
    answer: `- **UPI** deposits are free at most brokers.
- **Net banking** through a payment gateway may cost around ₹9 + GST per transfer at some brokers.
- **NEFT/RTGS/IMPS** bank transfers to the broker's account are usually free.
- **Withdrawals** are generally free and processed the same or next working day.`,
  },
];

/** Greetings and other small talk, matched before the knowledge base. */
export const SMALL_TALK: { pattern: RegExp; answer: string }[] = [
  { pattern: /^(hi|hello|hey|hii+|namaste|good (morning|afternoon|evening))\b[\s!.]*$/i, answer: "Hello! I'm the AlgoLearn charges assistant. Ask me about brokerage, STT, stamp duty, DP charges or taxes, or give me a trade (quantity, buy and sell price) and I'll calculate the exact charges." },
  { pattern: /^(thanks|thank you|thx|ty|great|awesome|cool|ok|okay)\b[\s!.]*$/i, answer: "You're welcome! Ask me anything else about trading charges." },
  { pattern: /^(bye|goodbye|see you)\b[\s!.]*$/i, answer: "Bye! Happy (paper) trading." },
  { pattern: /\b(who are you|what can you do|help|how to use)\b/i, answer: `I answer questions about **Indian trading charges** (NSE, BSE, MCX) and calculate them for you. Try:
- "Charges for buying 100 shares at ₹500 and selling at ₹520 intraday"
- "Nifty option: 75 qty, buy at 120, sell at 150"
- "What is STT?" or "What are DP charges?"
- "What about delivery?" after a calculation, to compare segments` },
];

export const STARTER_QUESTIONS = [
  "Charges to buy 100 shares at ₹500 and sell at ₹520 intraday",
  "Options: qty 75, buy at 120, sell at 150",
  "What is STT?",
  "What are DP charges?",
  "How are trading profits taxed?",
];
