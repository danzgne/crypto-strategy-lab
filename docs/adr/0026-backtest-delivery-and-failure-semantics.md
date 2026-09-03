# Backtest delivery is lease-fenced, at-least-once, unordered, and poison-safe

**Status:** accepted. This decision consolidates the delivery contract implemented by the Backtest Worker, PostgreSQL
Job Queue, transactional outbox, and event consumers.

## Decision

The `BacktestJob` table is the durable queue. A Worker claims a Job with its Worker ID, an expiring lease, and a unique
lease token; renewal and every result/failure write are fenced by that exact claim. A transient processing failure is
requeued with bounded backoff until four failed attempts/claims; a permanent failure or exhausted retry budget marks the
Job `FAILED`. An expired claim can be reclaimed, but the stale Worker cannot persist Trades, Metrics, or completion
events.

Backtest lifecycle and evaluation facts are written to the PostgreSQL transactional outbox in the same transaction as
the Job/Experiment result. The dispatcher publishes them to the in-process Domain Event Bus at least once and without
global ordering. A crash between publish and acknowledgement may redeliver an event, so every consumer is idempotent by
event ID or an equivalent unique projection identity. Unsupported or undecodable events are retried with bounded
backoff and jitter; after eight delivery failures they remain stored as dead-lettered events for read-only operational
inspection and recovery. One poison event must not block independent events.

## Consequences

The Worker can scale horizontally and recover after a process pause or crash, but queue claims and lease renewal add
database traffic. Consumers cannot use event creation order as a coordination mechanism and must tolerate duplicates.
The outbox is easy to inspect and transactional with PostgreSQL, while moving to a broker later would require preserving
these same fencing, delivery, and idempotency contracts.

This ADR complements [ADR-0016](0016-transactional-outbox-for-backtest-lifecycle-events.md), which establishes the
outbox boundary, [ADR-0019](0019-lease-fenced-backtest-job-completion.md), which establishes stale-Worker fencing, and
[ADR-0025](0025-concurrent-poison-safe-outbox-dispatch.md), which establishes concurrent poison-safe dispatch.
