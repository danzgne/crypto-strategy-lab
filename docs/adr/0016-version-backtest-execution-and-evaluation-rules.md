# Version Backtest execution and evaluation rules

Each Experiment persists the Simulation Rules Version and Evaluator Version alongside its Strategy Version and Dataset Snapshot. This carries small metadata cost but prevents a later change to fills, risk handling, or metric formulas from making old results appear reproducible when they were calculated under different rules.
