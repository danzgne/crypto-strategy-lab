# Authored params reach a running Strategy over the realtime channel, and Strategy Version gets a real tag

**Status:** accepted

Extends [ADR-0002](0002-strategy-plugin-interface-and-rulestrategy.md) and
[ADR-0006](0006-declarative-strategy-definition-and-two-advanced-builtins.md), which fixed what a
`RuleStrategy.params` value contains but not how one reaches a strategy that is actually running. Nothing in the
system carries params today: `StrategyLiveService` constructs every strategy with `StrategyRegistry.create(id)`
and no arguments, and `StrategySubscribeRequest` has no field to put them in.

**An authored params value travels in the `strategy:subscribe` request.** Every strategy concern already flows
over the realtime channel (catalog, subscribe, snapshot, signal), the socket is session-authenticated, and #33
persists nothing, so a second HTTP surface would be a parallel protocol for one field. Three changes follow from
that choice. `StrategyLiveService` keys its active strategies by a params hash alongside pair and timeframe,
because the existing `strategyId:pair:timeframe` key would silently hand two different rule JSONs the same
running instance. A new `strategy:error` event carries `{ chartId, strategyId, message }`, since the gateway
previously had no channel back to the client and simply logged a failed subscription. And catalog entries become
`{ id, requiresParams }`, derived from the already-present but unused `StrategyParamsSchema.required`, so the
frontend learns which strategies need a params blob instead of testing for the `rule` id, which would be the
hard-coded dispatch the project is graded against. Deriving it from the schema forces `StrategyParamDefinition`
to admit `object`, `array`, and `string` beside its numeric types; the extension stays shallow, naming a field
and its type rather than becoming recursive JSON Schema.

**Both validation and applicability enforcement are raised inside `StrategyLiveService.subscribe`**, not in the
gateway, so a future non-socket caller is gated by the same code. This is where ADR-0006's "enforced server-side
before execution, never thrown during it" lands in practice while the Combination Engine and SearchCoordinator
do not yet exist.

**`Strategy Version` gets the tag `CONTEXT.md` already describes**: a canonical, key-ordered serialization of
`(strategy.id, strategy.params)` under SHA-256. It hashes the **resolved** params rather than the authored JSON,
so `MA()` and `MA({fast: 20, slow: 50})` are correctly one version. It lives in `packages/shared` in its own
file, deliberately absent from both the root barrel and the `./strategy` barrel, because `shared/src/index.ts`
is a flat `export *` that the Next.js client bundle pulls in and `node:crypto` must never reach it.

## Considered Options

- **A synchronous `POST /strategies/rule` that validates and returns a handle to subscribe by**: rejected. Its
  real advantage is a natural 400 with structured detail, but `strategy:error` buys the same thing without
  splitting one feature across two protocols, and the repo has no zod request-validation pattern in its API
  layer to be consistent with.
- **Persisting a `StrategyVersion` row and subscribing by its id**: rejected for #33. The models exist and unused,
  but persistence and ownership are #48's subject; pulling them forward would make a hand-pasted throwaway JSON
  a durable library entry nobody asked to save.
- **A `requiresParams` flag on `StrategyFactory`, leaving `StrategyParamsSchema` numeric-only**: rejected. It
  works, but it leaves `RuleStrategy` with a `paramsSchema` that cannot name its own parameters, which #48's
  library editor would hit immediately.
- **Validating params with a zod schema in the backend, in addition to the constructor**: rejected. The
  constructor must validate to build itself, so a second schema is a second source of truth for one shape. The
  accepted cost is that a constructor reports the first problem rather than all of them, which is how every
  existing strategy already behaves.
- **A hand-rolled pure-JS hash to dodge the bundling problem**: rejected. An export boundary solves it without
  trading away a real digest.

## Consequences

- The catalog payload changes shape, so `useStrategyCatalog`, the gateway, and their tests move together.
- Any future caller that constructs a strategy outside `StrategyLiveService` must compute the version tag from
  resolved params, not from whatever it was handed, or two identical strategies will carry different tags.
- The tag's inputs include both `riskManagement` and its derived flat `stopLoss`/`takeProfit`, per ADR-0006's
  mapping. Dropping the redundant half later would change every previously computed tag, so the mapping is now
  effectively load-bearing for reproducibility.
- Revisit if: a second params-carrying surface appears (a backtest form, a library run action) and duplicating
  validation and enforcement at each entry point starts to cost more than a single request-validated endpoint
  would have.
