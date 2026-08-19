# Strategy plugin interface, registry, and a JSON-defined RuleStrategy for NL-authored strategies

**Status:** accepted

Resolves [#3](https://github.com/danzgne/crypto-strategy-lab/issues/3). `Strategy.analyze(context): Signal` is
synchronous and called exactly once per closed Candle. `Context` carries only a raw OHLCV Candle window (sized to
each Strategy's own `requiredHistory`) plus Pair, Timeframe, and Sentiment. Indicator values are never precomputed
upstream: each Strategy computes its own via a shared `packages/shared/indicators` library, which is the literal
reading of CLAUDE.md's "a Strategy only knows its own indicator logic" constraint. `Signal` is
`{ action, strength?, reason? }` rather than a bare enum, so the Combination Engine's weighted-score mode has
something to weight. Strategies register via an explicit `StrategyRegistry.register(id, factory)` call in each
strategy's own module, collected through one barrel import so registration fires at boot: no decorators, no
filesystem auto-discovery. Each Strategy exposes a static `paramsSchema` and is constructed from a validated
`params` object; a concrete `params` value is what CONTEXT.md's Strategy Version snapshots (exact storage/hash
mechanics deferred to #4). Separately, the team confirmed a natural-language/link "add strategy" feature is
required for the demo, simplified from generating executable Python (rejected: would need a sandboxed execution
runtime and a repair loop, both out of scope for a 2-week build) to generating **JSON**. The LLM's output becomes
`params` for one generic `RuleStrategy` class, registered once at boot exactly like the 4 hand-written strategies,
holding an ordered list of single-condition Rules (`indicator`, `indicatorParams`, `comparator`, `value`,
`action`). This keeps every downstream consumer (Combination Engine, Backtester, Evaluator) blind to whether a
Strategy was hand-written or NL-authored, and needs no code execution or sandboxing. The generation pipeline
itself (LLM call, link fetch, confirmation UI, schema validation with no repair loop) is a separate decision,
[#15](https://github.com/danzgne/crypto-strategy-lab/issues/15), blocked by this decision and by #4.

## The 4 MVP strategies

- **MA**: dual SMA crossover (not price-vs-single-MA, matching the spec's own "MA20/MA50" example). BUY when the
  fast SMA crosses above the slow SMA, SELL when it crosses below, HOLD otherwise. Fires only on the crossing
  candle. Defaults: fast=20, slow=50.
- **RSI**: cross-triggered, not a level check repeated every candle. BUY when RSI crosses below the oversold
  threshold, SELL when it crosses above the overbought threshold. Defaults: period=14, oversold=30, overbought=70.
- **Bollinger Bands**: cross-triggered. BUY when close crosses below the lower band, SELL when close crosses
  above the upper band. Defaults: period=20, stdDev=2.
- **Support/Resistance**: fractal-style local pivots. A candle is a resistance pivot if its high is the max
  within N candles on each side, a support pivot if its low is the min within N candles on each side; track the
  most recent 3 pivots of each type. BUY when close comes within `tolerance` of a tracked support level, SELL
  when within `tolerance` of a tracked resistance level. Defaults: N=10, levels tracked=3, tolerance=0.5%.

## Considered Options

- **Precompute indicators upstream and attach them to `Context`**: rejected. Blurs "a Strategy only knows its
  own indicator logic" into a separate indicator service, and forces every future indicator to be added to that
  service instead of being self-contained inside the Strategy that needs it.
- **Decorator-based (`@Strategy(...)`) or filesystem auto-discovery registration**: rejected. Decorators add an
  `experimentalDecorators` TS config wrinkle, and directory scanning is fragile with bundlers; an explicit
  `register()` call is also the literal wording of CLAUDE.md's constraint #2.
- **NL/link generates executable code (originally Python), injected and run, with a repair loop for code that
  fails on first try**: rejected. Requires a sandboxed execution runtime as a new justified process boundary,
  plus a whole self-healing-codegen subsystem, neither of which fits a 2-week capstone timeline. Generating JSON
  config for an already-registered generic Strategy gets the same user-facing feature with none of that risk.
- **Nested AND/OR condition trees inside a RuleStrategy's JSON**: rejected. Duplicates what the Combination
  Engine already does (combining multiple Strategies' Signals), and a more expressive DSL is more likely to make
  the LLM emit something schema-invalid, which matters more now that there's no repair loop.

## Consequences

- Every future strategy (hand-written or `RuleStrategy`-backed) must compute its own indicators from raw Candles
  via the shared indicator library. Don't add a second path that hands precomputed indicator values to
  `Strategy.analyze()`.
- `RuleStrategy` is the only Strategy whose `params` is end-user-authorable; the registry itself never grows at
  runtime. Adding a "new" NL-authored strategy is always just a new `params` value.
- The repair loop is deferred indefinitely, not just out of MVP scope. On invalid LLM output, the user is asked
  to resubmit, not auto-retried.
- Revisit if: `RuleStrategy`'s single-condition-per-rule DSL turns out to be too limited for what users actually
  try to describe in natural language (evidence to gather once #15 ships), or the exact Strategy Version
  storage/hash mechanics chosen in #4 don't fit a plain `params` object cleanly.
