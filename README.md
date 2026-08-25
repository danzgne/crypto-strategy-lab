# Crypto Strategy Lab

Crypto Strategy Lab is a software-architecture capstone for composing, backtesting, evaluating, and discovering
crypto strategies. Issues #27 and #28 establish the production-shaped foundation: a pnpm monorepo, one
PostgreSQL/Prisma schema, independent backend and worker processes, a Next.js dashboard, a real Socket.IO round
trip, and the first live BTCUSDT market-data chart.

## Workspace

| Workspace              | Runtime             | Purpose                                        | Development command                               | Production command                                         |
| ---------------------- | ------------------- | ---------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `apps/backend`         | Express 5 / Node 24 | HTTP API, Socket.IO, modular-monolith features | `pnpm dev:backend`                                | `pnpm --filter @crypto-strategy-lab/backend start`         |
| `apps/backtest-worker` | Node 24             | Independent database-connected worker process  | `pnpm dev:worker`                                 | `pnpm --filter @crypto-strategy-lab/backtest-worker start` |
| `apps/frontend`        | Next.js 16          | App Router dashboard and Socket.IO client      | `pnpm dev:frontend`                               | `pnpm --filter @crypto-strategy-lab/frontend start`        |
| `packages/shared`      | TypeScript          | Versioned domain-event and realtime contracts  | `pnpm --filter @crypto-strategy-lab/shared build` | consumed by apps                                           |

The Prisma schema, migration history, and generated-client command live at the repository root because the backend
and worker use the same database.

## Host development (recommended)

Run the applications directly on the host for fast feedback, and run only PostgreSQL in Docker. Requirements:
Node.js 24, Corepack, pnpm 11.19, and Docker Engine with Compose v2.

```bash
# Enable the package-manager shim declared by package.json.
corepack enable

# Install the exact dependency versions recorded in pnpm-lock.yaml.
pnpm install --frozen-lockfile

# Create the local environment file from the committed template.
cp .env.example .env

# Start only PostgreSQL and wait until its health check passes.
docker compose up -d --wait postgres

# Generate the Prisma Client used by the backend and worker.
pnpm prisma:generate

# Apply committed Prisma migrations to the running PostgreSQL instance.
pnpm prisma:migrate:deploy

# Start backend, backtest-worker, and frontend concurrently on the host.
pnpm dev
```

Open <http://localhost:3000>. The connection badge becomes **Transport live** only after the browser receives a
Socket.IO ping acknowledgement from the backend. `pnpm dev` starts all three applications together; when working
on one application, use `pnpm dev:backend`, `pnpm dev:worker`, or `pnpm dev:frontend` instead.

## Full local stack with Docker Compose

This starts PostgreSQL, the Prisma migration job, backend, worker, and frontend as containers. It is useful for
production-shaped local testing, CI-like verification, and demos. No host Node.js installation is needed.

```bash
# Create the local environment file from the committed template.
cp .env.example .env

# Build all application images, start the complete stack, and wait for health checks.
docker compose up --build -d --wait
```

Default local endpoints:

| Service           | Address                                     |
| ----------------- | ------------------------------------------- |
| Frontend          | <http://localhost:3000>                     |
| Backend liveness  | <http://localhost:3100/api/v1/health>       |
| Backend readiness | <http://localhost:3100/api/v1/health/ready> |
| PostgreSQL        | `localhost:5434`                            |

Useful operations:

```bash
docker compose ps
docker compose logs -f backend backtest-worker
docker compose down
```

Compose uses production builds, non-root application containers, health checks, a persistent PostgreSQL volume,
and a one-shot migration service. Its default credentials are only for local development; replace them before
using the topology outside a developer machine.

Each workspace resolves the repository-root `.env`, so the same file also supports the per-workspace commands in
the table above. Host-side Next.js uses `PORT`; Compose uses `FRONTEND_PORT` for its published port. The backend
and worker each persist their process lifecycle in `service_heartbeats`; job claiming and backtesting arrive in
later feature slices.

## Prisma commands

```bash
pnpm prisma:format
pnpm prisma:generate
pnpm prisma:migrate:dev --name <migration-name>
pnpm prisma:migrate:deploy
```

Never synchronize tables automatically on application startup. Create migrations in development and deploy the
committed migration history once before starting application processes.

## Architecture

### Backend HTTP flow

```text
Request
  → Global middleware (request ID, Pino logging, security, parsing)
  → Route
  → Route middleware (authentication, authorization, validation)
  → Controller
  → Service
  → Repository
  → Prisma Client
  → PostgreSQL

Success → Controller → ApiResponse → Client
Error   → Global error handler → ApiResponse → Client
```

The backend is divided by feature. There is no separate model layer: `prisma/schema.prisma` is the persistence
model, feature-owned types are application shapes, and repositories are the only runtime feature layer allowed to
issue Prisma queries.

### Live market-data flow

```text
Next.js dashboard
  → Socket.IO client
  → backend marketData gateway
  → MarketDataService
  → BinanceAdapter
  → Binance REST history + kline WebSocket

MarketDataService
  → closed Candle upsert
  → PostgreSQL
```

The browser receives only the normalized `Candle` contract. The adapter converts Binance payloads to UTC epoch-
millisecond timestamps and canonical OHLCV fields. The service opens the upstream stream before fetching REST history,
buffers updates during the merge, deduplicates by `(pair, timeframe, openTime)`, keeps the forming candle in memory,
and upserts a candle only after it closes. Socket snapshots are private to the requesting chart; live candle updates
are broadcast through the shared `market:<pair>:<timeframe>` room.

```text
Frontend → Market Data Service → Exchange Adapter → Binance
```

### Domain event catalog

`packages/shared` types `MarketPriceUpdated`, `CandleClosed`, `StrategyGenerated`, `BacktestStarted`,
`BacktestCompleted`, `StrategyEvaluated`, `LeaderboardUpdated`, `NewsCollected`, and `SentimentAnalyzed`. Every
event carries `eventId`, `name`, `version`, `occurredAt`, and a name-specific `payload`.

Detailed module rules:

- [Backend architecture](apps/backend/README.md)
- [Backtest worker architecture](apps/backtest-worker/README.md)
- [Frontend architecture](apps/frontend/README.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/)

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check
```

CI applies the committed Prisma migration to PostgreSQL before running the complete check. Backend and worker logs
use asynchronous structured Pino output; direct `console.*` calls are prohibited by both repository policy and
ESLint.

## Issue #28 demo

1. Start Compose and open the dashboard.
2. Confirm **Transport live** and a measured round-trip latency.
3. Confirm the BTCUSDT 1m panel reaches **LIVE** and shows a candlestick snapshot.
4. Watch the latest forming candle update before its `CandleClosed` event persists it.
5. Request `/api/v1/health/ready` to confirm PostgreSQL is connected, then inspect the `candles` table for closed
   bars.
6. Stop and restart the backend to see the dashboard move from **RECONNECTING** back to **LIVE**.
