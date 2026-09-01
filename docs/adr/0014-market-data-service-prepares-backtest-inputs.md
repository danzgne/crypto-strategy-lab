# Market Data Service prepares immutable backtest inputs

**Status:** accepted. Resolves ownership of historical data preparation.

## Context

Backtests need closed, contiguous Candles and enough warm-up history, but the Worker is an independently scalable
consumer and must replay the exact input selected by the request.

## Decision

The Backend calls the Market Data Service, which uses the Exchange Adapter to fetch and validate historical Candles
before the Backtest Job is enqueued. The Worker receives only the immutable Dataset Snapshot and never calls an
exchange.

## Alternatives considered

- **Worker fetches Binance directly** — rejected because it duplicates the exchange boundary and makes a queued
  Experiment depend on execution time.
- **Frontend prepares the data** — rejected because validation and exchange access belong to backend-owned services.

## Consequences

Submission waits for historical input preparation, while Worker execution is deterministic and independent of Binance
availability. Adding another exchange remains localized to the Exchange Adapter.
