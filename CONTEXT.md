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
_Avoid_: Indicator (an indicator, e.g. MA20, is data a Strategy consumes or computes, not the Strategy itself),
Rule (as a synonym for a whole Strategy; see the narrower **Rule** entry below, used only inside RuleStrategy).

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

**Rule**:
One single-condition building block inside a RuleStrategy's `params.rules` list: `{ indicator, indicatorParams,
comparator, value, action }`. Not a synonym for Strategy: a RuleStrategy is one Strategy instance holding an
ordered list of Rules.

**RuleStrategy**:
The one generic Strategy implementation that backs NL/link-authored strategies (see #15). Its `params` is
`{ source: 'manual'|'nl-generated', sourceInput?: string, rules: Rule[] }`. Registered once at boot like any
hand-written Strategy: authoring a new one via natural language or a link never adds a `StrategyRegistry` entry,
it only produces a new `params` value (and therefore a new Strategy Version) for this one class. Rules are
deliberately single-condition and evaluated in order; combining multiple signals into one decision stays the
Combination Engine's job, not something a RuleStrategy does internally.

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

**Stop Policy**:
The finite limits governing when a SearchRun stops generating candidates, such as a candidate cap, wall-clock
budget, or consecutive evaluations without a better Score.

**Strategy Version**:
An immutable snapshot of a Strategy's parameters at a point in time. Changing a Strategy's configuration creates a
different Strategy Version: for example, MA(20,50)+RSI(14) and MA(10,30)+RSI(14) are different versions and therefore
different Composite Strategies when assembled. Experiments and Leaderboard entries reference a specific version,
never "the strategy" generically — this is what makes a result reproducible.

### Backtesting & Evaluation

**Backtester** / **Backtest Worker**:
Simulates trades for a CandidateStrategy against historical Candles over a date range and Timeframe, producing
Trades. Runs as an independently-scalable process (see ADR-0001), separate from the request that queued it.

**Trade**:
One simulated entry+exit pair from a backtest run, with its resulting profit or loss.

**Evaluator**:
Computes Metrics (Return, Win Rate, Max Drawdown, Number of Trades, Profit Factor, Sharpe Ratio) from a
CandidateStrategy's Trades. Kept as a separate component from the Backtester — evaluation logic must be
swappable without touching simulation logic.

**Metrics**:
The computed performance numbers an Evaluator produces for one CandidateStrategy's backtest run.

**Experiment**:
One full generate → backtest → evaluate run: a specific CandidateStrategy against a specific Dataset, Timeframe,
and parameter set, producing a Result (Metrics + Trades).
_Avoid_: Run, Job (Job is the queue-level unit of work; Experiment is the domain-level record of what it produced).

**Score**:
The single number a CandidateStrategy is ranked by on the Leaderboard (e.g. a weighted blend of Return, Win
Rate, and a risk term).
_Avoid_: Rank (Rank is the resulting position; Score is the number that determines it).

**RiskScore**:
A normalized [0, 1] measure of risk quality derived from Max Drawdown for Leaderboard scoring; higher means
lower drawdown and therefore safer performance.

**Leaderboard**:
The ranked Top-K list of evaluated CandidateStrategies.

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

**Exchange Adapter** (e.g. BinanceAdapter):
Translates one exchange's API/WebSocket protocol into the system's normalized Candle/price shape. Adding a new
exchange means adding a new Adapter, not touching the Market Data Service or Frontend.

### News & Sentiment

**NewsItem**:
The normalized shape (id, title, content, source, publishedAt, relatedCoins, url) any News Provider produces.

**News Provider**:
A swappable source of NewsItems — RSS, a News API, a custom Crawler. The Crawler collects raw news only; it does
not know about the ML model.

**Sentiment Service**:
The stateless, swappable component that scores a NewsItem's text into a Sentiment. Realized as an in-process
module inside the backend (see ADR-0001, ADR-0004), not a separate deployable process; the interface stays
swappable regardless of which scoring technique sits behind it. Decoupled from both the Crawler, which never
depends on it, and its consumer, which owns persisting the result.
_Avoid_: Sentiment Analysis (the activity, not the component).

**Sentiment**:
The `POSITIVE | NEUTRAL | NEGATIVE` classification plus numeric score the Sentiment Service attaches to a
NewsItem. Persistence of the result stays with the consumer, not the Sentiment Service itself.
