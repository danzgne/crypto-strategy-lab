# Concurrent, poison-safe transactional outbox dispatch

**Status:** accepted

The transactional outbox is delivered by multiple backend replicas through database-coordinated, expiring claims,
not process-local locks or global ordering. Each claim advances the delivery attempt, and a failed decode or publish
is persisted with bounded exponential backoff and jitter; after eight failures the event is dead-lettered in place for
read-only inspection. A successful publish is acknowledged separately, preserving the existing at-least-once
contract: a crash between publish and acknowledgement may redeliver the event, so consumers remain idempotent.

## Considered Options

- **Process-local locking** — rejected because it cannot coordinate concurrent backend replicas and does not recover
  abandoned work.
- **Acknowledge unsupported events** — rejected because malformed or unknown payloads would disappear without a
  durable failure record or operator visibility.
- **Stop the batch at the first failure** — rejected because one poison event would block independent healthy events.
- **Require ordered delivery** — rejected because database claims intentionally allow workers to make progress on
  different events without introducing a throughput-limiting global sequence.

## Consequences

The outbox schema stores claim ownership, expiry, attempts, retry timing, the last error, and dead-letter time.
`FOR UPDATE SKIP LOCKED` keeps claim selection atomic across replicas, while claim-token fencing prevents an expired
dispatcher from acknowledging a row reclaimed by another dispatcher. Delivery remains unordered and at least once;
the event bus's consumer idempotency remains responsible for duplicate publishes.
