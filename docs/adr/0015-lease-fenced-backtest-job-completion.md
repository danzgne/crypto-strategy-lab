# Lease-fenced Backtest Job completion

Backtest Job claims carry a worker owner and renewable lease token, and the transaction that persists Trades, Metrics, completed status, and outbox records succeeds only for the current claim. This rejects a stale worker that finishes after a job has been reclaimed, preventing duplicate Experiment results while retaining bounded retries and at-least-once outbox delivery.
