# Crypto Strategy Lab

A software-architecture capstone: a platform for plugging in crypto trading strategies, auto-combining them,
backtesting and ranking the combinations, and continuously searching for better ones. The domain is strategy
evaluation, not trading — no real money changes hands.

## Language

### Strategy & Search

**Strategy**:
A plugin implementing `analyze(context): Signal`, called synchronously exactly once per closed Candle (never a
partial one). Knows only its own indicator logic: no exchange calls, no DB access, no chart rendering. Declares
its configurable parameters via a static `paramsSchema` and the history window it needs via `requiredHistory`.
Every Strategy's `paramsSchema` includes optional `stopLoss` and `takeProfit`, so risk management travels with
the Strategy Version rather than with the run that used it (see ADR-0006).
_Avoid_: Indicator (an indicator, e.g. MA20, is data a Strategy consumes or computes, not the Strategy itself),
Rule (retired; a single condition inside a RuleStrategy is a **Condition**).

**Signal**:
The value a Strategy returns: `{ action: 'BUY'|'SELL'|'HOLD' (or 'LONG'|'SHORT'|'NONE'), strength?: number
(0 to 1), reason?: string }`. `action` is required; `strength` and `reason` are optional, so simple Strategies
can omit them, but a weighted-score Composite Strategy has something to weight beyond a flat vote. Weighted
composition treats an omitted `strength` as `1`.
_Avoid_: Decision (as a synonym for Signal itself).

**Context**:
The bundle passed into `Strategy.analyze()`: a rolling window of closed Candles (OHLCV) sized to the Strategy's
own `requiredHistory`, plus Pair, Timeframe, market state, and Sentiment when available. Indicator values (MA,
RSI, ...) are *not* precomputed into Context. Each Strategy computes its own from the raw Candle window via a
shared indicator-math library, per "a Strategy only knows its own indicator logic."
_Avoid_: Input, State.

**StrategyRegistry**:
Where Strategies register themselves via an explicit `StrategyRegistry.register(id, factory)` call in each
strategy's own module, collected through one barrel import so registration fires at boot. This is how the
Combination Engine and StrategyGenerators discover them without hard-coded dispatch. The registry never grows
at runtime; see RuleStrategy for how NL/link-authored strategies fit without adding registry entries.

**Condition**:
One comparison inside a RuleStrategy's `conditions.long` or `conditions.short` list, comparing a declared
indicator (or `Close`) against either a literal value or another declared indicator. Conditions within a
direction combine as a flat AND and are never nested.
_Avoid_: Rule (the retired name from ADR-0002's original single-condition shape).

**RuleStrategy**:
The one generic Strategy implementation that backs NL/link-authored strategies. Its `params` declares an
`indicators` list, `conditions.long` and `conditions.short`, `riskManagement`, a `timeframe`, and an
`applicability` block, alongside `source` and `sourceInput` (see ADR-0006). Registered once at boot like any
hand-written Strategy: authoring a new one via natural language or a link never adds a `StrategyRegistry` entry,
it only produces a new `params` value (and therefore a new Strategy Version) for this one class. Combining
multiple Strategies' Signals into one decision stays the Combination Engine's job, not something a RuleStrategy
does internally.

**Applicability**:
A RuleStrategy's declared `timeframe` and permitted Pairs. Enforced server-side before execution, by the
Combination Engine when assembling a Composite Strategy and by the SearchCoordinator when accepting a candidate,
never by raising from inside `analyze()`.

**Composite Strategy**:
At least two unique Strategy Versions combined into one Signal-producing unit. Its immutable definition contains the
member versions, an explicit `majority` or `weighted` mode, and (for weighted mode) nonnegative normalized weights
and a threshold. Every member sees the same Context. Majority mode emits BUY or SELL only when that action has a
strict majority of all member actions; otherwise it emits HOLD. Weighted mode maps BUY/SELL/HOLD to `+1/-1/0`,
scales by member strength and weight, and emits BUY above the threshold, SELL below its negative, and HOLD otherwise.
Changing a member Strategy Version, mode, weight, or threshold produces a different Composite Strategy; member order
alone does not. Its display name includes the member types and parameter summaries (for example,
`MA[fast=20,slow=50] + RSI[period=14] · weighted`), while its machine identity is the canonical definition.
_Avoid_: Combination (reserve for the Combination Engine, the component that builds Composite Strategies).

**Combination Engine**:
The component that validates and assembles a Composite Strategy from enabled Strategy Versions. It rejects empty,
single-member, duplicate-member, or otherwise invalid definitions and does not silently convert member failures into
HOLD.

**CandidateStrategy**:
A frozen Composite Strategy once it has been produced by a StrategyGenerator and submitted to the Backtester/Evaluator
pipeline. Downstream components (Backtester, Evaluator, Leaderboard, Visualization) treat it as opaque — they don't
need to know how it was generated.

**StrategyGenerator**:
The interface behind a search algorithm (`RandomGenerator`, `DomainGuidedGenerator`, `GeneticGenerator`, ...).
Produces CandidateStrategies. Swappable independently of everything downstream.

**Search Space**:
The bounded set of enabled Strategies, parameter domains, and permitted combination choices from which a
StrategyGenerator may produce CandidateStrategies.

**SearchRun**:
A bounded search session that generates CandidateStrategies, queues their Experiments, and tracks progress until
its Stop Policy ends generation and all submitted Experiments reach a terminal state.
_Avoid_: Experiment (one candidate evaluation), Job (the queue-level unit of work).

**Search Scheduler**:
The single long-lived component that keeps Discovery running continuously by starting a new SearchRun each time
the previous one terminates, round-robining across Users with an active Discovery session. The Scheduler never
stops; a SearchRun always does (see ADR-0007).
_Avoid_: Search Loop (suggests the unbounded `while(true)` the architecture specifically avoids).

**Stop Policy**:
The finite limits governing when a SearchRun stops generating candidates, such as a candidate cap, wall-clock
budget, or consecutive evaluations without a better Score.

**Strategy Version**:
An immutable snapshot of a Strategy's parameters at a point in time, identified by a deterministic tag derived
from the Strategy's id and its canonical parameters. Changing a Strategy's configuration creates a different
Strategy Version: for example, MA(20,50)+RSI(14) and MA(10,30)+RSI(14) are different versions and therefore
different Composite Strategies when assembled. Experiments and Leaderboard entries reference a specific version,
never "the strategy" generically, which is what makes a result reproducible.
_Avoid_: Library Version (the human-authored label; see below).

**Strategy Library**:
A User's browsable collection of their own authored Strategy entries, shown alongside the read-only built-in
Strategies. Entries carry a name, tags, and a Library Version.

**Library Version**:
The human-authored semantic-version label on a Strategy Library entry (for example `1.0.0`). Purely descriptive:
editing parameters always mints a new Strategy Version whether or not anyone bumps the Library Version, and
Experiments reference the Strategy Version, never this.

### Backtesting & Evaluation

**Backtester** / **Backtest Worker**:
Simulates trades for a CandidateStrategy against historical Candles over a date range and Timeframe, producing
Trades. Runs as an independently-scalable process (see ADR-0001), separate from the request that queued it.

**Trade**:
One simulated entry+exit pair from a backtest run, carrying both `entryTime` and `exitTime`, and its resulting
profit or loss. Retained in full only while its Experiment is on a Leaderboard or pinned by its owner; otherwise
pruned after a retention window, while the Experiment and its Metrics are kept permanently (see ADR-0007).

**Evaluator**:
Computes Metrics (Return, Win Rate, Max Drawdown, Number of Trades, Profit Factor, Sharpe Ratio) from a
CandidateStrategy's Trades. Kept as a separate component from the Backtester — evaluation logic must be
swappable without touching simulation logic.

**Metrics**:
The computed performance numbers an Evaluator produces for one CandidateStrategy's backtest run.

**Experiment**:
One full generate, backtest, evaluate run: a specific CandidateStrategy against a specific Dataset, Timeframe,
and parameter set, producing a Result (Metrics + Trades). Its inputs include the Transaction Cost and Slippage
the simulation used, so a result can be reproduced exactly.
_Avoid_: Run, Job (Job is the queue-level unit of work; Experiment is the domain-level record of what it produced).

**Score**:
The single number a CandidateStrategy is ranked by on the Leaderboard (e.g. a weighted blend of Return, Win
Rate, and a risk term).
_Avoid_: Rank (Rank is the resulting position; Score is the number that determines it).

**RiskScore**:
A normalized [0, 1] measure of risk quality derived from Max Drawdown for Leaderboard scoring; higher means
lower drawdown and therefore safer performance.

**Leaderboard**:
One User's ranked Top-K list of their own evaluated CandidateStrategies, ordered by Score. Private per User:
there is no global Leaderboard, because an entry names its member Strategies and would otherwise publish one
User's strategy design to everyone (see ADR-0005).

### Market Data

**Pair**:
A tradable symbol, e.g. `BTCUSDT`.

**Timeframe**:
The candle interval a chart or Strategy operates on: 1m/5m/15m/1h/4h/1d.

**Candle**:
One OHLCV bar for a Pair at a Timeframe, identified by its UTC open time. A Candle may be forming or closed;
closed means its OHLCV values will not receive further market updates.

**Market Data Service**:
The only component the Frontend is allowed to talk to for price data — never an exchange directly.

**Tick**:
One individual trade reported by the exchange, carrying time, price, quantity, and taker side. Distinct from a
Candle, which aggregates Ticks over a Timeframe. Only a bounded, in-memory window of recent Ticks is kept; they
are never persisted.

**Exchange Adapter** (e.g. BinanceAdapter):
Translates one exchange's API/WebSocket protocol into the system's normalized Candle, Tick, and price shapes.
Adding a new exchange means adding a new Adapter, not touching the Market Data Service or Frontend.

**Stream Latency**:
The delay between the exchange stamping a message and this system receiving it, computed as local receive time
minus the message's exchange-side event time, corrected for clock skew. Derived by the Market Data Service; no
exchange reports it directly.

### News & Sentiment

**NewsItem**:
The normalized shape (id, title, content, source, publishedAt, relatedCoins, url) any News Provider produces.

**News Provider**:
A swappable *kind* of NewsItem source, implemented as one adapter: RSS, Website (URL plus an Extraction
Template), or HTML (a one-off raw paste). The Crawler collects raw news only; it does not know about sentiment
scoring.
_Avoid_: News Source (the configured instance, not the adapter; see below).

**News Source**:
One configured feed URL or site that a News Provider crawls. Many News Sources share one News Provider. A Source
is **active** when its most recent crawl attempt succeeded within its configured refresh interval; the ratio of
active to configured Sources is what the source-health coverage figure reports.

**Extraction Template**:
A versioned, LLM-generated description of where a Website Source's title, summary, timestamp, and related fields
live in its HTML. When drift is detected from crawl validation metrics, a replacement version is *proposed* with
a diff and activated only by an explicit admin action, never automatically (see ADR-0008).

**Sentiment Service**:
The stateless, swappable component that scores a NewsItem's text into a Sentiment. Realized as an in-process
module inside the backend (see ADR-0001, ADR-0004), not a separate deployable process; the interface stays
swappable regardless of which scoring technique sits behind it. Decoupled from both the Crawler, which never
depends on it, and its consumer, which owns persisting the result.
_Avoid_: Sentiment Analysis (the activity, not the component).

**Sentiment**:
The `POSITIVE | NEUTRAL | NEGATIVE` classification plus numeric score the Sentiment Service attaches to a
NewsItem, produced in the same scoring call as its Event Type and `relatedCoins`. Persistence of the result stays
with the consumer, not the Sentiment Service itself.

**Event Type**:
The single category a scored NewsItem falls into, from a closed set: `ETF_FUND_FLOW`, `PROTOCOL_UPGRADE`,
`REGULATION`, `PARTNERSHIP`, `MARKET_TREND`, `OTHER`. Single-label by design, so a set of items aggregates into
percentages of a whole.

**Sentiment Aggregate**:
The per-Pair rollup of recent Sentiment over a trailing window (`{ positive, neutral, negative, score,
sampleSize }`), matched to a Pair by `relatedCoins`. This is what populates `Context.sentiment` and what
NewsSentimentStrategy reads; individual NewsItems never reach a Strategy.

### Accounts & Access

**User**:
An authenticated account, and the unit of tenancy. Every Strategy Library entry, Strategy Version, Experiment,
Trade, SearchRun, and Leaderboard entry belongs to exactly one User and is invisible to every other.
_Avoid_: Account (reserve for the credential record), Trader (a role in the problem domain, not an entity here).

**Owner**:
The User a private record belongs to. Ownership is the only tenancy check in the system: every read and write on
an owned entity is scoped to the current User, with no branch on Role.

**Role**:
A User's single access level, `ADMIN` or `USER`. Governs shared infrastructure only (News Sources, crawl
cadence, Extraction Templates, HTML ingest), never visibility into another User's records. The first `ADMIN` is
seeded from configuration at boot; there is no self-service promotion (see ADR-0005).

**Shared Data**:
The records no User owns and every User reads: Candles, Ticks, NewsItems, Sentiments, News Sources, Extraction
Templates, and the built-in Strategy registry entries. Writes to Shared Data are the actions Role gates.
