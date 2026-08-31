# Immutable Dataset Snapshots for reproducible backtests

Each Experiment references an immutable, fingerprinted Dataset Snapshot containing its exact ordered closed Candles and warm-up history, deduplicated when the complete series matches. Querying the mutable market-data store only by date range was rejected because a corrected or backfilled Candle could make an identical Experiment yield a different result; snapshot storage is the accepted cost of verifiable reproducibility and exact result-chart rendering.
