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
One ordering comparison (`<`, `>`, `<=`, `>=`) inside a RuleStrategy's `conditions.long` or `conditions.short`
list, comparing an Indicator Reference (or `Close`) against either a literal value or another Indicator
Reference. Conditions within a direction combine as a flat AND, are never nested, and signal on the candle where
that AND becomes true rather than on every candle it continues to hold. An empty direction list means that
direction never signals; it is not a vacuously true AND.
_Avoid_: Rule (the retired name from ADR-0002's original single-condition shape).

**Indicator Reference**:
The name a Condition uses to address one output of a RuleStrategy's declared indicator: `RSI`, `BB_Upper`,
`BB_Lower`, `BB_Middle`, `SMA`. A declaration may override its reference with an `as` alias, which is required
when the same indicator kind is declared more than once, as a two-SMA crossover needs.
_Avoid_: Indicator (the computation itself; a reference names one of its outputs).

**RuleStrategy**:
The one generic Strategy implementation that backs NL/link-authored strategies. Its `params` declares an
`indicators` list, `conditions.long` and `conditions.short`, `riskManagement`, a `timeframe`, and an
`applicability` block (see ADR-0006). Registered once at boot like any hand-written Strategy: authoring a new
one via natural language or a link never adds a `StrategyRegistry` entry, it only produces a new `params` value
(and therefore a new Strategy Version) for this one class. `params` carries only what the Strategy *does*: a
name, description, tags, and a Provenance are Strategy Library entry fields and a Library Version labels the
snapshot, so neither renaming an entry nor correcting the prompt it came from mints a new Strategy Version (see
ADR-0013). Combining multiple Strategies' Signals into one decision stays the Combination Engine's job, not
something a RuleStrategy does internally.

**Provenance**:
Where a Strategy Library entry's parameters originated: `USER_PROMPT` for the natural-language pipeline,
`WEB_IMPORT` for a link, `MANUAL` for an entry authored without an LLM (a forked or tuned built-in, a hand-built
Composite Strategy). Immutable, so editing a generated strategy never rewrites where it came from, and descriptive
only: it is entry metadata, never part of `params` and never part of the Strategy Version. The entry's **source
input**, the original prompt text or URL, is present exactly when Provenance is `USER_PROMPT` or `WEB_IMPORT`, and
absent for `MANUAL` (see ADR-0022).
_Avoid_: Source (ambiguous with a News Provider's source and with a Market Data source), Record Kind (a different
property; see below).

**Record Kind**:
Why a Strategy definition record exists at all: `LIBRARY_ENTRY` for one a User curated, `BACKTEST_TARGET` for one
minted only so an ad-hoc backtest has a Strategy Version to reference, and `SEARCH_CANDIDATE` for one generated by a
SearchRun. Only `LIBRARY_ENTRY` records appear in the Strategy Library, so this never reaches a client payload.
_Avoid_: Provenance (that is where an entry's *parameters* came from; Record Kind is why the *record* exists),
Origin (rejected: too close to Provenance to be told apart in reading), and the entry's own singular-or-composite
kind, which is a different distinction on a record whose Record Kind is always `LIBRARY_ENTRY`.

**Strategy Editor**:
The UI surface for viewing and changing a Strategy's parameters, whether or not they are saved yet. Reached by
drilling into a Strategy Library entry, and also by editing a just-generated, unsaved `params` value in the
generation flow (see ADR-0015): both consume the same registered editor for a Strategy's id, so there is exactly
one editor per grammar regardless of when in its lifecycle a `params` value is being edited. A schema-driven form
rendered from `paramsSchema` is the default; a Strategy may register a custom editor for its id in the
**StrategyEditorRegistry**, which is how RuleStrategy's grammar gets an editor without making `paramsSchema`
recursive (see ADR-0013). Built-in Strategies are read-only in place but can be forked into a User's own entry.
Before an entry exists, the editor sits beside a **raw parameter layer**, a text view of the same unsaved `params`
value that the editor writes structurally; a saved entry's parameters are edited only through the editor, and its
raw view is display-and-copy (see ADR-0023).

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
`MA[fast=20,slow=50] + RSI[period=14] · weighted`), while its machine identity is the canonical definition. When
saved as a Strategy Library entry it stores its members as copied parameter snapshots rather than references, so
"member versions" means the version identity computed from those copies, not a foreign key to a stored Strategy
Version (see ADR-0022).
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
The component that keeps Discovery running continuously by starting a new SearchRun each time the previous one
terminates for each User with an active Discovery session. See [ADR-0007](docs/adr/0007-continuous-discovery-via-search-scheduler.md)
for the scheduling decision and its fairness boundary.
_Avoid_: Search Loop (suggests the unbounded `while(true)` the architecture specifically avoids).

**Stop Policy**:
The finite limits governing when a SearchRun stops generating candidates, such as a candidate cap, wall-clock
budget, or consecutive evaluations without a better Score.

**Strategy Version**:
An immutable snapshot of a Strategy's parameters at a point in time, identified by a deterministic tag derived
from the Strategy's id and its canonical *resolved* parameters, so a Strategy constructed with no arguments and
one constructed with its own defaults are the same version. Changing a Strategy's configuration creates a
different Strategy Version: for example, MA(20,50)+RSI(14) and MA(10,30)+RSI(14) are different versions and therefore
different Composite Strategies when assembled. Experiments and Leaderboard entries reference a specific version,
never "the strategy" generically, which is what makes a result reproducible.
_Avoid_: Library Version (the human-authored label; see below).

**Strategy Library**:
A User's browsable collection of their own authored Strategy entries, shown alongside the read-only built-in
Strategies. An **entry** is either *singular*, naming one Strategy id, or *composite*, naming a Composite
Strategy; either way it carries a name, description, tags, and a Provenance, none of which are part of `params`,
and it holds one or more Strategy Versions, one per parameter snapshot. Tuning a built-in's parameters produces an
entry just as authoring a RuleStrategy does, and editing an entry appends a Strategy Version rather than replacing
one. Provenance and the source input live on the entry, never on a version, which is what makes it structurally
impossible for a later edit to rewrite where an entry's parameters came from (see ADR-0014). Built-in Strategies
appear in the Library as read-only rows with no entry record behind them, so they carry no name, tags, Provenance,
or Library Version until forked. An entry may be **archived**, which hides it from the default listing; it is
never deleted, because Experiments reference its Strategy Versions (see ADR-0022).

**Library Version**:
The human-authored semantic-version label on one Strategy Version inside a Strategy Library entry (for example
`1.0.0`). It labels the parameter snapshot rather than the entry, so one entry's successive versions read
`1.0.0`, `1.1.0`, and so on. Authored by the person editing, and unique within its entry, so a label always names
one parameter set. Purely descriptive: editing parameters always mints a new Strategy Version whether or not
anyone bumps the Library Version, and Experiments reference the Strategy Version, never this.

**Authored Parameters**:
A `params` value as a person or the generation pipeline wrote it, with optional fields left out. **Resolved
Parameters** are what a Strategy actually runs with, once its constructor has filled in defaults and computed
derived values. A Strategy Library entry stores the authored form, because that is what a Strategy Editor edits
and what a reader recognizes; the Strategy Version tag is computed from the resolved form, so an omitted
parameter and an explicitly written default are one version, not two.

### Backtesting & Evaluation

**Backtester** / **Backtest Worker**:
Simulates trades for a Strategy Version or Composite Strategy against an immutable Dataset Snapshot over a selected
date range and Timeframe, producing closed Trades. The Backtest Worker runs this work independently from the request
that queued it and does not rank the result.

**Dataset Snapshot**:
The exact ordered closed Candles, including any strategy warm-up history, used by one or more Experiments. It is
immutable once captured, so the same fingerprint always means the same historical input.

**Backtest Job**:
The queue-level unit of work that asks a Backtest Worker to process one Experiment. A Job may be retried after a
failure, but only one active lease may persist its Experiment result.

**Trade**:
One simulated entry+exit pair from a backtest run, carrying direction, fill prices, investment, costs, exit reason,
and resulting profit or loss. The position is closed at a signal, risk trigger, or selected-range boundary.

**Evaluator**:
Computes Metrics (Return, Win Rate, Max Drawdown, Number of Trades, Profit Factor, Sharpe Ratio) from a
CandidateStrategy's Trades. Kept as a separate component from the Backtester — evaluation logic must be
swappable without touching simulation logic.

**Metrics**:
The computed performance numbers an Evaluator produces for one Experiment: total profit, Return, Win Rate, Wins,
Losses, Max Drawdown, Number of Trades, Profit Factor, Sharpe Ratio, and Score.

**Experiment**:
One manual or generated evaluation run: a specific Strategy Version or Composite Strategy against a specific Dataset
Snapshot, Timeframe, and parameter set, producing a Result (Metrics + Trades). Its inputs include Transaction Cost,
Slippage, Simulation Rules Version, and Evaluator Version, so a result can be reproduced exactly.
_Avoid_: Run, Job (Job is the queue-level unit of work; Experiment is the domain-level record of what it produced).

**Transaction Cost**:
The quote-currency fee ratio charged independently on every simulated entry and exit, such as `0.0008` for
`0.08%`.

**Slippage**:
The adverse fill adjustment applied independently on every simulated entry and exit, expressed in basis points;
for example, `5` means five basis points.

**Simulation Rules Version**:
The named rule set governing how an Experiment turns closed-candle signals, OHLC risk triggers, fills, costs, and
range-boundary exits into Trades.

**Evaluator Version**:
The named formula set governing how an Experiment's Trades become Metrics and Score.

**Score**:
The single number a CandidateStrategy is ranked by on the Leaderboard (e.g. a weighted blend of Return, Win
Rate, and a risk term).
_Avoid_: Rank (Rank is the resulting position; Score is the number that determines it).

**RiskScore**:
A normalized [0, 1] measure of risk quality derived from Max Drawdown for Leaderboard scoring; higher means
lower drawdown and therefore safer performance.

**Leaderboard Entry**:
The item shown on a User's Leaderboard: one successful completed singular or composite Strategy Experiment with its
rank, strategy display information, and evaluation metrics. It points to that Experiment rather than replacing it, so
the full backtest result remains available through the Experiment detail.

**Leaderboard**:
One User's ranked Top-K list of successful completed singular and composite Strategy Experiments, ordered by Score. It
spans the User's evaluated pairs, timeframes, and date ranges, and is private per User: there is no global Leaderboard,
because an entry may name private member Strategies and would otherwise publish one User's strategy design to everyone
(see ADR-0005).

**Ranking Service**:
The component that consumes StrategyEvaluated facts, selects a User's highest-scoring eligible Experiments, and
maintains the User's Leaderboard. It does not run backtests or recompute evaluation Scores.

### Domain Events & Delivery

**Outbox Event**:
A domain event committed with the business transaction and held for asynchronous delivery to the Domain Event Bus.
Its delivery is at least once and unordered, so consumers must tolerate redelivery and must not depend on creation order.

**Dead-Lettered Event**:
An Outbox Event whose delivery has failed eight times and will not be retried automatically. It remains stored for
read-only inspection and operational recovery.

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

**Chart Renderer**:
A frontend-only adapter that renders neutral financial chart data (candles, volume, indicator lines, and markers).
It has no market-data subscription, exchange, strategy, or network responsibility. The current implementation uses
TradingView Lightweight Charts behind the `FinancialChartRenderer` interface, so another chart renderer can be
introduced without changing the Market Data Service or strategy pipeline.

**Stream Latency**:
The delay between the exchange stamping a message and this system receiving it, computed as local receive time
minus the message's exchange-side event time, corrected for clock skew. Derived by the Market Data Service; no
exchange reports it directly.

### News & Sentiment

**NewsItem**:
The normalized shape (id, title, content, source, publishedAt, relatedCoins, url) any News Provider produces.
`relatedCoins` may begin as a provider or author hint, but the scorer's deduplicated uppercase base-asset list is
authoritative after successful scoring. An unscored item's hints do not contribute to a Sentiment Aggregate.

**News Provider**:
A swappable *kind* of NewsItem source, implemented as one adapter: RSS, Website (URL plus an Extraction
Template), or HTML (a one-off raw paste). The Crawler collects raw news only; it does not know about sentiment
scoring.
_Avoid_: News Source (the configured instance, not the adapter; see below).

**News Source**:
One configured feed URL or site that a News Provider crawls. Many News Sources share one News Provider. A Source
is **Enabled** or not, and separately **active** or not: active is health, meaning its most recent Crawl Attempt
succeeded within twice its configured refresh interval, so one skipped tick is not an outage. The source-health
coverage figure is the ratio of active to Enabled Sources.
_Avoid_: Active as a word for the on/off switch (that is **Enabled**), Inactive for a Source that is merely
unhealthy.

**Enabled**:
A News Source's admin-controlled on/off switch, deciding whether the Crawler visits it at all. Independent of
Active, which is health: a Source can be Enabled and failing, while a disabled Source is neither active nor a
health failure and counts on neither side of coverage.
_Avoid_: Active (the health notion).

**Crawl Attempt**:
One recorded visit to one News Source, carrying its outcome, timestamp, how many items it found and persisted,
and, for a Website Source, which Template Version it applied and that application's validation metrics. Source
health and Drift are both derived from the attempt log rather than tracked as their own state.

**Extraction Template**:
A versioned, LLM-generated description of where a Website Source's news items live in its HTML. It locates a
*listing*: an item container plus each item's title, summary, timestamp, and link, every one of them read from an
element's text or from one of its attributes. A model writes a template only when a version is generated or
proposed, never while crawling, so applying one is selector evaluation and nothing else. The Template is the
abstraction and a Template Version is the record (see ADR-0008, ADR-0024).

**Template Version**:
One immutable snapshot of an Extraction Template, numbered per News Source and carrying its own selectors,
Extraction Confidence, and status. Exactly one version per Source is active at a time; the others are proposed,
superseded, or rejected. The first version for a Source activates on generation, because it replaces nothing;
every later activation, rolling back to an earlier version included, is an explicit admin action.
_Avoid_: Strategy Version and Library Version (unrelated concepts in the strategy pipeline).

**Extraction Confidence**:
How sure the model was about a Template Version when it wrote it, from 0 to 1. Stored on the version and reported
on each Crawl Attempt that applies it, so a trailing average spans versions and Sources. Distinct from the
empty-field and malformed-field rates: confidence describes the template, the rates describe how it is holding
up.

**Drift**:
The condition where a Website Source's active Template Version has stopped matching its page: the sum of the
empty-field and malformed-field rates crosses the configured threshold, measured only over Crawl Attempts that
applied the currently active version since it was activated. An attempt matching no item containers at all is
fully empty rather than absent evidence. Crossing the threshold proposes a replacement version with a diff; it
never applies one.
_Avoid_: Self-healing (the mockup's label for the panel; nothing heals itself here, a person approves every
change).

**Sentiment Service**:
The stateless, swappable component that scores a NewsItem's text into a Sentiment. Realized as an in-process
module inside the backend (see ADR-0001, ADR-0004), not a separate deployable process; the interface stays
swappable regardless of which scoring technique sits behind it. Decoupled from both the Crawler, which never
depends on it, and its consumer, which owns persisting the result.
_Avoid_: Sentiment Analysis (the activity, not the component).

**Sentiment**:
The `POSITIVE | NEUTRAL | NEGATIVE` classification plus numeric score the Sentiment Service attaches to a
NewsItem, produced in the same scoring call as its Event Type and `relatedCoins`. The score is directional and
normalized to `-1..1`; a NewsItem has one current result or no result when it is unscored. Persistence of the
result stays with the consumer, not the Sentiment Service itself.

**Event Type**:
The single category a scored NewsItem falls into, from a closed set: `ETF_FUND_FLOW`, `PROTOCOL_UPGRADE`,
`REGULATION`, `PARTNERSHIP`, `MARKET_TREND`, `OTHER`. Single-label by design, so a set of items aggregates into
percentages of a whole.

**Sentiment Aggregate**:
The per-Pair rollup of recent Sentiment over a trailing 24-hour window based on `publishedAt` (`{ positive, neutral,
negative, score, sampleSize }`). The first three fields are percentages, `score` is the arithmetic mean of signed
scores, and `sampleSize` is the number of scored items matching the Pair's base asset through `relatedCoins`. An
item with multiple related coins counts once for each matching Pair; an untagged item is excluded. This is what
populates `Context.sentiment` and what NewsSentimentStrategy reads; individual NewsItems never reach a Strategy.

**NewsSentimentStrategy**:
A Strategy plugin that reads the live `Sentiment Aggregate` from Context, uses a configured score threshold and
minimum sample size to emit BUY or SELL, and emits HOLD when the sample is insufficient. Historical backtesting is
outside #42 until an immutable sentiment snapshot exists.

### LLM Infrastructure

**LLM JSON Provider**:
The seam behind schema-constrained JSON generation from a hosted LLM: one `generate()` call taking a prompt, a
schema, and a Consumer Identity, returning the parsed value plus which vendor answered (`generatedBy`). Vendor
implementations know nothing of each other; a chain implementation of the same interface owns fallback and
Provider Cooldown, so adding a vendor is one class and one list entry (see ADR-0011).
_Avoid_: LLM Adapter (overloads Exchange Adapter and News Provider, which are data-source seams, not
generation), Sentiment Service (one consumer of this, not this).

**Consumer Identity**:
The opaque string a caller passes to an LLM JSON Provider naming which feature is asking: strategy generation,
sentiment scoring, or extraction-template generation. It is the isolation key for provider availability, so a
vendor put on cooldown by one consumer stays available to the others (see ADR-0004, ADR-0008).
_Avoid_: Consumer, Client (the identity is the value passed, not the calling component).

**Provider Cooldown**:
The window during which an LLM JSON Provider skips one vendor for one Consumer Identity, started by a hard
failure and lifted only by expiry. A hard failure is one where no usable response arrived at all: a network
error, a timeout, a 429 or 5xx, or output that will not parse as JSON. A schema-invalid response never starts
one, because the vendor answered and only the content was wrong.
_Avoid_: Circuit Breaker (implies half-open probing and shared state, neither of which this has).

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
