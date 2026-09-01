# Immutable Dataset Snapshots for reproducible backtests

**Status:** accepted. Resolves reproducibility of historical inputs.

## Context

Historical market data can be corrected or backfilled after an Experiment is submitted. A later query for the same
date range could therefore produce a different result or chart.

## Decision

Each Experiment references an immutable, fingerprinted Dataset Snapshot containing its exact ordered closed Candles
and strategy warm-up history. Snapshots are deduplicated when the complete captured series and range metadata match.

## Alternatives considered

- **Query mutable Candle rows during worker execution** — rejected because a result would depend on when a worker ran.
- **Normalize every snapshot Candle into relational rows** — rejected because this slice only needs exact replay and
  result rendering.

## Consequences

Snapshot JSON carries storage cost, but it makes a historical result independently replayable and lets the result API
return selected-range Candles without exposing warm-up history.
