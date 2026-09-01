# Lease-fenced Backtest Job completion

**Status:** accepted. Resolves stale-worker writes after lease reclamation.

## Context

A Worker can pause after claiming a Backtest Job and finish after another Worker has reclaimed it. Without fencing,
both Workers could persist Trades, Metrics, or completion events.

## Decision

Claims carry a worker owner, renewable lease expiry, and unique lease token. Transactions that persist Trades, Metrics,
completed status, or completion outbox records require the current owner, token, unexpired lease, and claimed status.
Failed attempts remain bounded and stale claims are rejected.

## Alternatives considered

- **Status-only completion** — rejected because a stale Worker can still observe the same status after reclamation.
- **Worker-local cancellation only** — rejected because process pauses and crashes cannot be coordinated reliably.

## Consequences

Lease renewal adds database traffic and a worker may lose a valid result when its lease expires, but no stale Worker can
create a duplicate completed Experiment. Outbox delivery remains at least once and is separately idempotent.
