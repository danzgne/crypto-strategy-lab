# Continuous Discovery: a Search Scheduler chaining bounded SearchRuns

**Status:** accepted

The team wants Loop Discovery to run 24/7. Taken literally that collides with a graded constraint: CLAUDE.md
requires the Strategy Search Engine to have "an explicit, non-`while(true)` stop condition (max iterations / time
budget / no-improvement-after-N)". The two reconcile in exactly one shape, which this ADR adopts.

A long-lived **Search Scheduler** starts bounded SearchRuns back to back. The scheduler is what never stops; a
SearchRun always does, keeping the full Stop Policy from #39 unchanged (candidate cap, time budget,
no-improvement streak, consecutive-failure safety stop). When a run reaches a terminal state the scheduler starts
the next one. This makes the Stop Policy load-bearing rather than ceremonial, and turns the per-run stop reason
into an accumulating history worth showing.

**One system scheduler, not one per user.** The Backend owns one long-lived `SearchScheduler` instance. It starts a
sequential chaining loop for each active User session, and clamps that session's `maxInFlight` to a per-User cap
(currently 5) layered on top of the run's Stop Policy. This limits how much one User can submit while preserving the
bounded-run contract.

This is not a global round-robin scheduler. PostgreSQL workers claim the shared `BacktestJob` table by eligibility and
creation order, with no cross-User rotation guarantee. The per-User cap is the implemented fairness boundary; stronger
fairness would require a separate queue scheduling decision and is intentionally not claimed here.

**Chained runs are independent.** Run N+1 samples the same Search Space from scratch rather than narrowing toward
where run N scored well. The Scheduler exposes a re-seeding hook, but nothing implements it for now.

**Retention is bounded.** Every Experiment's inputs and computed metrics are kept permanently, which is what
reproducibility (constraint 7) actually requires: the Strategy Version, its parameters, and the resulting
numbers. Trades are kept in full only for Experiments currently on a Leaderboard or explicitly pinned by their
owner; for everything else they are pruned after a retention window, starting at 7 days.

## Considered Options

- **A single unbounded SearchRun that simply never terminates**: rejected. It is the literal reading of "24/7",
  and it forfeits a criterion the spec says will be tested, in exchange for no capability the chained design
  lacks.
- **One Search Scheduler per user**: rejected. A single Backend scheduler keeps session lifecycle in one place and
  avoids coordinating several scheduler processes. Per-User loops are concurrent, but Job claiming remains the shared
  queue's responsibility.
- **Re-seeding each run's Search Space from the previous run's Leaderboard**: rejected, though tempting. It is a
  DomainGuidedGenerator wearing a scheduler's clothes, and building it into the scheduler would smear
  search-algorithm logic across a component required to stay algorithm-agnostic (constraint 4). Keeping runs
  independent leaves the narrowing to a future generator, which is where the extension seam is supposed to be.
- **Retaining every Trade forever**: rejected under the production framing. Continuous search generates Trades
  without bound, the Leaderboard only ever needs Top-K, and an Experiment's reproducibility depends on its
  Strategy Version and metrics rather than on individual simulated fills. Defensible for a capstone, but not for
  a system claiming to be production-shaped.
- **Pruning whole Experiments, not just their Trades**: rejected. It would break the traceability constraint and
  make the Leaderboard's history unverifiable.

## Consequences

- The stop reason stops being a single terminal message and becomes a per-run record, which is the visible proof
  that the non-`while(true)` constraint holds. Keeping it on screen (img1's "Tiến trình Discovery" card) matters
  more under this ADR than it did before.
- This decision is the concrete justification for the Backtest Worker being a separate, horizontally scalable
  process, which ADR-0001 asserted on principle. Under continuous multi-user search the worker pool is the
  system's actual bottleneck, and adding workers is the response.
- A pruned Experiment can still be reproduced from its Strategy Version and re-run, but its original individual
  fills are gone. Anyone comparing a re-run against a months-old Experiment compares metrics, not trade lists.
- img1 renders "Iteration hiện tại 47 / 500", which conflicts with #39's `maxCandidates = 100` default, and its
  "2,350 candidates" against 47 iterations implies an iteration is a batch rather than a candidate. The mockup's
  numbers are illustrative; #39's Stop Policy defaults are authoritative and the UI label reads "candidates",
  not "iterations".
- Revisit if: continuous search saturates the worker pool even with per-user caps, at which point the queue
  itself (a Postgres job table, per ADR-0001) is the thing to re-examine rather than the scheduler.
