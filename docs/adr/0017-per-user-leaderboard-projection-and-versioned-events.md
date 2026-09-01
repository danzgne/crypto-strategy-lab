# Per-user leaderboard projection from versioned evaluation events

**Status:** accepted. Resolves the ownership, projection, and delivery contract for the Leaderboard.

## Context

The Leaderboard must rank evaluated strategy combinations without coupling the Backtest Worker to ranking or
publishing one User's private strategy design to another User. The existing `Leaderboard` table is only a per-user
scaffold, while `StrategyEvaluated` currently carries only an Experiment ID, Strategy Version ID, and Score. The
frontend screenshot shows a compact leaderboard card, but the product also needs reproducible detail links, live
updates, restart recovery, and delivery through the existing transactional outbox.

## Decision

The Leaderboard is a private, per-User materialized Top-K projection across all of that User's successful completed
Composite Strategy Experiments, regardless of Pair, Timeframe, date range, or whether the Experiment was manual or
search-generated. `K` is server-configurable with a default of 10; it is not a per-user setting.

Each projection row represents one Experiment, so the same Composite Strategy Version may appear more than once when
evaluated in different contexts. Zero-trade completed Experiments remain eligible with Score zero. Rows sort by
Score descending, then Experiment ID ascending for deterministic ties. Evicted rows are removed from the projection;
the underlying Experiment remains the durable history and detail resource.

The Backtest Worker publishes a version-2 `StrategyEvaluated` event containing the owner, Experiment and Strategy
Version identities, explicit composite kind, display/member names, Pair, Timeframe, date range, and the persisted
evaluation metrics. Decimal values use strings at the event boundary. Ranking Service subscribes to this event and
never receives a direct Worker call or recomputes Score.

Ranking updates lock the per-user Leaderboard row, recompute and replace the current Top-K projection in one database
transaction, and insert a version-2 `LeaderboardUpdated` record containing the full ordered snapshot into the same
transactional outbox. The dispatcher delivers it asynchronously after commit to the in-process event bus. The
consumer is idempotent through event-ID de-duplication and a unique per-board/per-Experiment projection identity.
No update event is emitted when the ordered Top-K snapshot is unchanged. Ranking subscribes before startup
reconciliation and rebuilds projections from all eligible completed Experiments; the same reconciliation handles a
changed K or a missed delivery.

The existing `Leaderboard` model remains the per-user board header and gains a `LeaderboardEntry` projection relation.
The REST API returns the user's current snapshot from `GET /api/v1/leaderboard`. Authenticated Socket.IO connections
join a private user room automatically and receive `leaderboard:updated`; they never supply a user ID. The Discovery
page renders the screenshot's four visible columns—Rank, Strategy, Profit (USDT), and Winrate—while Score and the
other evaluation metrics remain available in the API and linked Experiment detail.

## Alternatives considered

- **A global leaderboard** — rejected because the Strategy column exposes private member compositions such as
  `MA + RSI + S/R`.
- **Recompute the leaderboard in the Frontend or query the Experiment synchronously for every event** — rejected
  because it moves ranking logic across the boundary or couples the event consumer to another service read.
- **Persist every evaluation as a leaderboard row** — rejected for this slice; Experiment history already retains
  every result, while the Leaderboard is specifically a current Top-K projection.
- **Publish `LeaderboardUpdated` only after the projection transaction** — rejected because a process crash between
  commit and publish could leave clients without a durable notification. The transactional outbox closes that gap.
- **Process-local per-user locks** — rejected because they do not protect a second backend instance; the database
  board-row lock is the authoritative serialization boundary.

## Consequences

The ranking path is independently testable with synthetic events and fake repositories, and the Backtest Worker stays
decoupled from Leaderboard persistence. The projection duplicates display and metric data intentionally so REST and
Socket.IO clients can receive one consistent snapshot without another synchronous lookup. At-least-once delivery
and startup reconciliation make the projection recoverable, while the Experiment remains the source of complete
backtest detail.

Changing the event payload requires the shared event catalog and consumers to move to the next event version. A future
global board, per-context boards, historical leaderboard browsing, or user-configurable K would be a separate decision
and must not be inferred from this projection.
