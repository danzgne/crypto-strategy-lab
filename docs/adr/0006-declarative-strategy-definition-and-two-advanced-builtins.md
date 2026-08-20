# Declarative RuleStrategy definition, strategy-level risk management, and three new built-in strategies

**Status:** accepted

Amends [ADR-0002](0002-strategy-plugin-interface-and-rulestrategy.md): its RuleStrategy `params` shape and its
rejection of multi-condition definitions are superseded here. Everything else in ADR-0002 (the
`analyze(context): Signal` contract, explicit registry calls, per-strategy indicator computation, the four MVP
strategies' rules) stands unchanged.

The team decided to follow the instructor's sample UI (`imgs/img4.jpg`) rather than adapt it, so
**RuleStrategy's params adopt the mockup's declarative shape**: a declared `indicators` list, `conditions.long`
and `conditions.short`, `riskManagement` with `stopLoss` and `takeProfit`, a `timeframe`, and an `applicability`
block, alongside the `source` and `sourceInput` fields ADR-0002 already locked. The `Rule` term is retired and
replaced by `Condition`. **Conditions are a flat AND-list per direction and are never nested**: this is the one
line drawn against ADR-0002's original objection, and it costs nothing because the mockup itself only ever
renders a flat AND. Declaring indicators up front buys real expressiveness the old flat `Rule` shape could not
represent at all, namely comparing one series against another (`Close` below `BB_Lower`) rather than only
against a literal.

**Risk management generalizes to every Strategy, not just RuleStrategy.** Each Strategy's `paramsSchema` gains
optional `stopLoss` and `takeProfit`, and RuleStrategy's `riskManagement` block maps onto them. This is forced by
`imgs/img2.jpg`, which draws Stop Loss and Take Profit lines with "MA Crossover" selected and populates those
columns in the trade table; without it, those columns are permanently null for six of the eight strategies. The
Backtester honours SL/TP intrabar against OHLC, which is what that same screen states as its own assumption.
Because SL/TP are strategy parameters, they are captured by the immutable Strategy Version and stay reproducible.

`timeframe` and `applicability` are **enforced server-side before execution, never thrown during it**. The
Combination Engine rejects a Composite Strategy whose members declare conflicting timeframes, and the
SearchCoordinator discards a candidate whose declared timeframe does not match the run's, before any BacktestJob
is enqueued. A runtime assertion inside `analyze()` may exist as a defensive backstop, but it is unreachable by
design.

Three strategies join the registry, all previously out of scope. **SMC**: BUY on a bullish break of structure
(close above the most recent swing high), marking the last down-candle body before the break as the order block
and firing on its first retest; SELL mirrors. Params: swing lookback N, retest tolerance. **Wyckoff**: classify a
trailing window as accumulation or distribution from range width plus volume trend, then BUY on a breakout above
an accumulation range and SELL on a breakdown below a distribution range. Params: window length, range-width
threshold, volume ratio. **NewsSentimentStrategy**: reads `Context.sentiment`, now populated with a per-Pair 24h
aggregate (`{ positive, neutral, negative, score, sampleSize }`) matched by `NewsItem.relatedCoins`, and emits
BUY above a score threshold and SELL below, with `sampleSize` guarding against firing on a handful of articles.

## Considered Options

- **Keep ADR-0002's flat, ordered `Rule[]`**: rejected. It cannot express an indicator-to-indicator comparison
  at all, which is the first thing the sample UI's own example strategy does, and the team chose to follow the
  mockups rather than reshape them.
- **Adopt fully nested AND/OR condition trees**, as ADR-0002 described when rejecting them: rejected again, for
  ADR-0002's original two reasons. Arbitrary nesting duplicates what the Combination Engine exists to do, and a
  more expressive grammar makes schema-invalid LLM output likelier, which matters more given there is still no
  repair loop. A flat AND per direction is strictly less than what was rejected and is all the mockup asks for.
- **`riskManagement` on RuleStrategy only**, leaving hand-written strategies without SL/TP: rejected. It
  contradicts img2 directly, where SL/TP is drawn for a hand-written strategy.
- **SL/TP as backtest-run inputs** rather than strategy parameters: rejected. It would add two controls to a
  parameter bar the mockup draws completely, and it would put an input outside the Strategy Version, so two runs
  of "the same strategy" could differ without producing a new version. That breaks the reproducibility
  constraint.
- **Throwing on a timeframe mismatch inside `analyze()`**: rejected, and worth recording why, because it reads
  like the stricter option. A throwing member fails its whole Composite Strategy, and five consecutive failed
  backtests trip the SearchRun's `maxConsecutiveFailures` safety stop. Since RandomGenerator samples strategies
  with no timeframe awareness, continuous Discovery (ADR-0007) would terminate run after run on the failure stop.
  Rejecting the candidate before enqueue is enforcement; throwing mid-run is a self-inflicted outage.
- **Leaving SMC and Wyckoff out of scope** as the MVP spec originally had them: rejected. They are the strongest
  available evidence for the plugin constraint the project is graded on, because each is one class plus one
  registry call and touches nothing else.

## Consequences

- The JSON schema the LLM is constrained to in the generation pipeline changes shape, so #34's prompt, its
  response schema, and its human-readable confirmation rendering all change with it.
- The Search Space partitions by declared timeframe for RuleStrategy candidates, so a composite can only mix
  members that agree on one. This narrows what Random Search can explore, and is the accepted price of
  enforcement.
- `Rule` disappears from the vocabulary. Anything referring to it (CONTEXT.md, #33, #34) refers to `Condition`
  now.
- SMC and Wyckoff have a deliberate escape hatch if they run long during implementation: drop the retest
  condition from SMC and the volume term from Wyckoff. Dropping either strategy entirely is the wrong cut, since
  their presence is the point.
- `Context.sentiment` stops being a permanently-empty slot, which means the sentiment pipeline is now upstream of
  strategy evaluation rather than a terminal branch. Ordering matters: a Context built before the first scoring
  pass has `sampleSize: 0` and NewsSentimentStrategy must return HOLD rather than treating absent as neutral.
- Revisit if: the flat AND-list turns out to be too weak for what users actually describe in natural language,
  which is the same evidence-gathering trigger ADR-0002 set for its own DSL.
