# Experiments keep strong provenance and dispatch only recorded versions

**Status:** accepted. This decision records the reproducibility contract made concrete by the Experiment provenance
API, deterministic StrategyGenerator restoration, and Backtest Worker version registries.

## Decision

Every new Experiment records its immutable Strategy Version and parameters, Dataset Snapshot fingerprint, Strategy
implementation version, Simulation Rules Version, Evaluator Version, and build revision. Search-generated Experiments
also record the SearchRun, generator algorithm family, registered generator version, seed, and generation ordinal.
Candidate fingerprints are deterministic, and RandomGenerator derives each ordinal's random stream from the persisted
seed and ordinal so a restored run resumes the same sequence without replaying earlier candidates. Manual Experiments
have no generator provenance; legacy rows with missing version facts are explicitly not fully reproducible.

The Backtest Worker dispatches Strategy, Backtester, and Evaluator implementations by the versions recorded on the
Experiment. If a recorded version is unavailable or the running build does not match, the Job fails as unsupported;
the Worker never silently substitutes its current implementation. This preserves the meaning of an old Leaderboard
Entry even when new Strategy logic, simulation rules, evaluator formulas, or application builds exist.

## Consequences

The Experiment and Dataset Snapshot carry more metadata, and historical implementations must remain registered for old
Experiments that need to be replayed. Removing or renaming an implementation can make a Job fail instead of producing a
plausible but incomparable result. That visible failure is intentional: accepting an unavailable historical version
would destroy the traceability guarantee. A new implementation version can coexist with an old one and be selected for
new Experiments without rewriting prior results.

The provenance chain is exposed through `BacktestResultResponse.provenance` and is described in the
[Architecture Document](../architecture.md#experiment-provenance-and-reproducibility). The Strategy Version and
execution-version choices remain detailed in [ADR-0020](0020-version-backtest-execution-and-evaluation-rules.md).
