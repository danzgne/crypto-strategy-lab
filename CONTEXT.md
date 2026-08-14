# Crypto Strategy Lab

A software-architecture capstone: a platform for plugging in crypto trading strategies, auto-combining them,
backtesting and ranking the combinations, and continuously searching for better ones. The domain is strategy
evaluation, not trading — no real money changes hands.

## Language

### Strategy & Search

**Strategy**:
A plugin implementing `analyze(context) → Signal`. Knows only its own indicator logic — no exchange calls, no DB
access, no chart rendering.
_Avoid_: Indicator (an indicator, e.g. MA20, is data a Strategy consumes or computes, not the Strategy itself),
Rule.

**Signal**:
The value a Strategy returns: `BUY | SELL | HOLD` (or `LONG | SHORT | NONE`).
_Avoid_: Decision, Action.

**Context**:
The bundle passed into `Strategy.analyze()` — price, volume, candles, timeframe, indicators, market state,
sentiment.
_Avoid_: Input, State.

**StrategyRegistry**:
Where Strategies register themselves (`StrategyRegistry.register(...)`) so the Combination Engine and
StrategyGenerators can discover them without hard-coded dispatch.

**Composite Strategy**:
Multiple enabled Strategies combined into one Signal-producing unit, via majority vote or weighted score (e.g.
"MA + RSI + Support/Resistance").
_Avoid_: Combination (reserve for the Combination Engine, the component that builds Composite Strategies).

**Combination Engine**:
The component that assembles Composite Strategies from the set of currently-enabled Strategies.

**CandidateStrategy**:
A Composite Strategy once it has been produced by a StrategyGenerator and submitted to the Backtester/Evaluator
pipeline. Downstream components (Backtester, Evaluator, Leaderboard, Visualization) treat it as opaque — they
don't need to know how it was generated.

**StrategyGenerator**:
The interface behind a search algorithm (`RandomGenerator`, `DomainGuidedGenerator`, `GeneticGenerator`, ...).
Produces CandidateStrategies. Swappable independently of everything downstream.

**Strategy Version**:
An immutable snapshot of a Strategy's parameters at a point in time. Experiments and Leaderboard entries
reference a specific version, never "the strategy" generically — this is what makes a result reproducible.

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

**Leaderboard**:
The ranked Top-K list of evaluated CandidateStrategies.

### Market Data

**Pair**:
A tradable symbol, e.g. `BTCUSDT`.

**Timeframe**:
The candle interval a chart or Strategy operates on: 1m/5m/15m/1h/4h/1d.

**Candle**:
One OHLCV bar for a Pair at a Timeframe and Timestamp (Open, High, Low, Close, Volume).

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

**Sentiment**:
The `POSITIVE | NEUTRAL | NEGATIVE` classification plus numeric score the Sentiment Service attaches to a
NewsItem. Computed by a separate, stateless service (see ADR-0001) — persistence stays with the consumer, not
the Sentiment Service itself.
