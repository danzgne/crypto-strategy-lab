# Backtest worker architecture

The backtest worker is a separate process that claims queued backtest jobs, runs deterministic simulations, evaluates the results, persists them, and records completion events.

Unlike the backend, it does not handle HTTP requests. It therefore does not need routes, middleware, controllers, or `ApiResponse`. It is organized around its processing pipeline rather than copying the backend's feature structure.

## Responsibilities

The worker is responsible for:

- atomically claiming available backtest jobs;
- keeping an active job lease alive while processing;
- loading the immutable candidate definition, exact strategy versions and parameters, and historical candles;
- simulating trades through a swappable backtester;
- calculating metrics through a separate, swappable evaluator;
- persisting trades, metrics, job status, and completion events transactionally;
- retrying recoverable failures with bounded attempts and backoff;
- recovering safely from worker crashes or expired leases; and
- shutting down without claiming new work or abandoning a job silently.

The worker is not responsible for:

- generating candidate strategies;
- ranking strategies or updating the leaderboard directly;
- serving HTTP or WebSocket clients;
- fetching live exchange data;
- implementing frontend-facing response formats; or
- defining a second Prisma schema.

## Processing flow

```text
Worker starts
  → Validate environment
  → Connect Prisma
  → Register worker heartbeat
  → Poll for available job
  → Repository atomically claims job
  → Start lease heartbeat
  → ProcessBacktestJob
      → Load immutable candidate and candles
      → Backtester produces Trades
      → Evaluator produces Metrics
      → Repository persists result
      → Event publisher records completion events
  → Mark job completed
  → Stop lease heartbeat
  → Poll again
```

The polling loop must be controlled by an `AbortSignal` and a configured polling interval. Do not use an uncontrolled `while (true)` loop.

### Failure flow

```text
Processing failure
  → RetryPolicy classifies error
      → Retryable
          → Increment attempt
          → Schedule retry with backoff
      → Non-retryable or attempts exhausted
          → Mark job failed
  → Poll again
```

Retries must be bounded. A crashed worker's job becomes claimable again only after its lease expires, and the next worker must continue from durable database state rather than in-memory state.

### Shutdown flow

```text
SIGINT/SIGTERM
  → Stop claiming new jobs
  → Allow the active job to finish or release its lease safely
  → Stop heartbeat
  → Disconnect Prisma
  → Exit
```

## Target file structure

```text
apps/backtest-worker/
├── README.md
├── src/
│   ├── config/
│   │   ├── workerConfig.ts
│   │   └── validateEnv.ts
│   ├── database/
│   │   └── prismaClient.ts
│   ├── worker/
│   │   ├── backtestWorker.ts
│   │   ├── processBacktestJob.ts
│   │   ├── retryPolicy.ts
│   │   ├── leaseHeartbeat.ts
│   │   └── types.ts
│   ├── backtesting/
│   │   ├── interfaces/
│   │   │   └── backtester.interface.ts
│   │   ├── simulation/
│   │   │   ├── historicalBacktester.ts
│   │   │   ├── tradeSimulator.ts
│   │   │   ├── positionManager.ts
│   │   │   └── transactionCosts.ts
│   │   ├── types/
│   │   │   ├── backtestInput.ts
│   │   │   └── backtestOutcome.ts
│   │   └── index.ts
│   ├── evaluation/
│   │   ├── interfaces/
│   │   │   └── evaluator.interface.ts
│   │   ├── metrics/
│   │   │   ├── calculateReturn.ts
│   │   │   ├── calculateWinRate.ts
│   │   │   ├── calculateMaxDrawdown.ts
│   │   │   ├── calculateProfitFactor.ts
│   │   │   └── calculateSharpeRatio.ts
│   │   ├── defaultEvaluator.ts
│   │   └── index.ts
│   ├── repositories/
│   │   ├── interfaces/
│   │   │   └── backtestJobRepository.interface.ts
│   │   └── prisma/
│   │       └── prismaBacktestJobRepository.ts
│   ├── events/
│   │   ├── interfaces/
│   │   │   └── eventPublisher.interface.ts
│   │   └── prismaOutboxEventPublisher.ts
│   ├── errors/
│   │   ├── BacktestError.ts
│   │   └── JobLeaseLostError.ts
│   ├── utils/
│   │   ├── logger/
│   │   └── sleep.ts
│   └── index.ts
├── tests/
│   ├── unit/
│   │   ├── worker/
│   │   ├── backtesting/
│   │   └── evaluation/
│   ├── integration/
│   │   ├── repositories/
│   │   └── worker/
│   ├── e2e/
│   ├── fixtures/
│   ├── helpers/
│   └── setup/
├── Dockerfile
├── eslint.config.mjs
├── jest.config.json
├── tsconfig.json
└── package.json
```

This is the target structure, not a request to create every directory immediately. Add a directory when the corresponding production code or test is introduced.

### Minimal issue #27 scaffold

The monorepo scaffold should create only the files needed to build, start, and verify the worker skeleton:

```text
apps/backtest-worker/
├── README.md
├── src/
│   ├── config/
│   ├── database/
│   └── index.ts
├── tests/
├── Dockerfile
├── tsconfig.json
└── package.json
```

Do not add empty placeholder feature directories in issue #27.

## Module boundaries

### `worker/`

`backtestWorker.ts` owns polling, concurrency limits, shutdown, the active-job set, and lease heartbeats. It must not contain simulation or metric calculations.

`processBacktestJob.ts` orchestrates exactly one claimed job:

```text
Input → Backtester → Evaluator → Persistence → Events
```

Its dependencies should be injected so unit tests can use deterministic fakes without Prisma or a running worker loop.

### `backtesting/`

The backtesting module executes the candidate strategy against historical candles and produces trades and an equity curve. It owns simulation rules such as:

- evaluating signals once per closed candle;
- opening and closing positions;
- stop-loss and take-profit behavior;
- fees and slippage; and
- deterministic ordering and timestamps.

It does not rank candidates or decide leaderboard placement.

### `evaluation/`

The evaluation module converts a backtest outcome into metrics such as Return, Win Rate, Max Drawdown, Number of Trades, Profit Factor, and Sharpe Ratio. Keeping it separate from simulation allows the evaluator and ranking policy to evolve independently.

### `repositories/`

Repositories are the only worker layer allowed to issue Prisma queries. Repository operations should represent job and persistence use cases, not generic table-by-table CRUD.

```ts
interface BacktestJobRepository {
  claimNext(input: ClaimJobInput): Promise<ClaimedBacktestJob | null>;
  renewLease(jobId: string, workerId: string): Promise<void>;
  complete(jobId: string, outcome: EvaluatedBacktest): Promise<void>;
  scheduleRetry(jobId: string, failure: JobFailure): Promise<void>;
  markFailed(jobId: string, failure: JobFailure): Promise<void>;
}
```

The Prisma implementation may update the job, experiment, trades, metrics, and event outbox in one transaction. Atomic job claiming should use PostgreSQL locking semantics such as `FOR UPDATE SKIP LOCKED`, hidden behind the repository interface.

There is no worker `models/` directory. The root Prisma schema is the persistence model, while TypeScript input, outcome, job, and event shapes live beside the modules that own them.

## Prisma ownership

The monorepo has one Prisma schema and migration history:

```text
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

`src/database/prismaClient.ts` creates or exposes the generated Prisma client for this process. It does not define tables or run schema synchronization at application startup. Schema changes are made through the root migration workflow.

## Cross-process events

The worker runs in a different process from the backend, so it cannot rely on the backend's in-memory event emitter. The recommended transport is a PostgreSQL transactional outbox:

```text
Worker completion transaction
  ├── Persist Trades and Metrics
  ├── Mark BacktestJob completed
  └── Insert BacktestCompleted and StrategyEvaluated into event_outbox

StrategyEvaluated
  → Backend outbox consumer/event dispatcher
  → Ranking Service
  → Leaderboard
```

The worker records `BacktestStarted`, `BacktestCompleted`, and `StrategyEvaluated`; it never calls the Ranking or Leaderboard service directly. Persisting the result and its completion event in the same database transaction prevents a completed result from being saved without its event.

The transactional-outbox choice must be captured in an ADR before implementation because it establishes a new cross-process communication mechanism. The existing decision to avoid Redis or Kafka remains unchanged unless a demonstrated scaling requirement justifies revisiting it.

## Shared strategy execution

The worker must not import code from `apps/backend`. Strategy execution used by both processes should be extracted into a pure workspace package:

```text
packages/
├── shared/                 # Transport contracts and event envelopes
└── strategy-engine/        # Strategy interface, registry, built-ins, indicators

apps/backend → packages/strategy-engine
apps/backtest-worker → packages/strategy-engine
```

This prevents duplicated strategy logic and divergence between live analysis and backtesting. `strategy-engine` must remain independent of Express, Prisma, WebSockets, and exchange SDKs: a strategy receives an analysis context and returns a signal.

The package should be introduced with the first slice that genuinely shares strategy execution; it is not required as an empty placeholder in issue #27.

## Configuration

Expected configuration includes:

- `DATABASE_URL` — PostgreSQL connection string;
- `WORKER_ID` — stable identity used for claims and leases;
- `POLL_INTERVAL_MS` — delay when no work is available;
- `LEASE_DURATION_MS` — time after which an abandoned job may be reclaimed;
- `HEARTBEAT_INTERVAL_MS` — lease-renewal interval, shorter than the lease duration;
- `MAX_ATTEMPTS` — bounded retry count; and
- `WORKER_CONCURRENCY` — maximum jobs processed by one worker process.

`validateEnv.ts` must reject invalid relationships such as a heartbeat interval greater than or equal to the lease duration.

## Tests

All worker tests live in the central `tests/` directory outside `src/`:

- unit tests cover orchestration, retry classification, simulation rules, and metric calculations;
- integration tests use PostgreSQL to verify atomic concurrent claims, lease renewal and reclamation, transactional result persistence, and the outbox;
- end-to-end tests cover a queued job through completion and crash/restart recovery; and
- fixtures preserve exact candles, strategy versions, parameters, costs, and expected deterministic outcomes.

Production readiness requires structured logs containing the worker ID, job ID, candidate ID, attempt number, duration, and final state. Tests must verify behavior, while logs and heartbeat state make long-running jobs observable in production.
