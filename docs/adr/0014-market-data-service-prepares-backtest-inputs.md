# Market Data Service prepares immutable backtest inputs

**Status:** accepted. Resolves ownership of historical data preparation.

## Context

Backtests need closed, contiguous Candles and enough warm-up history, but the Worker is an independently scalable
consumer and must replay the exact input selected by the request.

## Decision

The Backend validates the target and range, then atomically creates the Experiment and a queued Backtest Job before
historical data is available. This lets the API return the asynchronous resource immediately. A Backend-owned
preparation coordinator resumes queued Experiments without a Dataset Snapshot at startup and calls the Market Data
Service, which uses the Exchange Adapter to fetch and validate historical Candles. It attaches the immutable Dataset
Snapshot in a transaction; the Backtest Worker only claims queued Jobs whose Experiment already has a snapshot. The
Worker receives only the immutable Dataset Snapshot and never calls an exchange.

## Alternatives considered

- **Worker fetches Binance directly** — rejected because it duplicates the exchange boundary and makes a queued
  Experiment depend on execution time.
- **Frontend prepares the data** — rejected because validation and exchange access belong to backend-owned services.
- **Keep the HTTP request open until data preparation finishes** — rejected because a large historical range can
  make the UI appear stuck and prevents the user from observing the queued resource.

## Consequences

Submission returns quickly with a queued resource, while the preparation coordinator may leave it queued until the
historical input is ready. A restart resumes any queued Experiment that has not received a snapshot, and a failed
preparation is recorded on that resource. Worker execution remains deterministic and independent of Binance
availability after attachment. Adding another exchange remains localized to the Exchange Adapter.
