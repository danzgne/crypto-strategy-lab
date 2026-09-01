# Transactional outbox for Backtest Worker lifecycle events

**Status:** accepted. Resolves durable delivery for backtest lifecycle facts.

## Context

The Backtest Worker must publish lifecycle facts without calling backend services directly, while completion must not
become visible without its Trades, Metrics, and completed Job state.

## Decision

Record `BacktestStarted`, `BacktestCompleted`, and `StrategyEvaluated` in a PostgreSQL transactional outbox. The
completion events are inserted in the same transaction as the result. A Backend dispatcher delivers unpublished rows
at least once to the in-memory Domain Event Bus, and consumers de-duplicate by event ID.

## Alternatives considered

- **Direct service calls** — rejected because the Worker would be coupled to Ranking/Leaderboard services.
- **Redis or Kafka now** — rejected because this slice has no demonstrated throughput or deployment need for them.

## Consequences

PostgreSQL remains the durable boundary and a dispatcher retry can redeliver an event, so consumers must be
idempotent. A future durable broker can replace the dispatcher without changing the Worker transaction.
