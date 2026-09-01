# Version Backtest execution and evaluation rules

**Status:** accepted. Resolves reproducibility across rule changes.

## Context

Fills, risk handling, and metric formulas may evolve independently of a Strategy Version or Dataset Snapshot. Replaying
those inputs alone would not identify which execution and evaluation behavior produced an old result.

## Decision

Each Experiment persists a Simulation Rules Version and Evaluator Version alongside its Strategy Version, Dataset
Snapshot, and input assumptions.

## Alternatives considered

- **Infer versions from the deployment currently running** — rejected because deployments change and old results would
  become ambiguous.
- **Store only the source commit** — rejected because the relevant simulation and evaluator seams can evolve
  independently.

## Consequences

The Experiment carries a small amount of metadata, while future rule implementations can coexist with historical
results without misrepresenting their reproducibility.
