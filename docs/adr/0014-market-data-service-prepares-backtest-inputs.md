# Market Data Service prepares immutable backtest inputs

The Backend uses the Market Data Service and its Exchange Adapter to fetch, validate, and snapshot historical Candles before a Backtest Job is enqueued; the Worker receives only the immutable Dataset Snapshot. Letting the Worker fetch an exchange directly was rejected because it would duplicate the market-data integration seam and make a queued Experiment's inputs depend on when a worker happened to run.
