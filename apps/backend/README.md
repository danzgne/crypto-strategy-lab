# Backend architecture

The backend is a feature-oriented modular monolith. Each feature owns its HTTP handlers, business logic, and
transport types. When a feature persists data, it also owns its persistence interface and Prisma repository
implementation. Shared HTTP and runtime concerns remain outside individual features.

Pino is the only application logger. HTTP logging uses `pino-http`, and the logger writes structured JSON through
an asynchronous destination. Morgan and direct `console.*` calls are intentionally not used: one structured
pipeline keeps request IDs and service context consistent and avoids blocking application work on formatted logs.

The directories below describe the intended organization. Do not create an empty directory for a future feature
or layer; add it only when the implementation needs it.

## HTTP request flow

Express runs global middleware before it matches a feature route. Authentication, authorization, and validation
then run as route middleware before the controller.

```text
Request
  → Global middleware (request ID, logging, security, parsing, session)
  → Route
  → Route middleware (authentication, authorization, validation)
  → Controller
  → Service
  → Repository
  → Prisma Client
  → PostgreSQL
```

Success and error responses take different return paths:

```text
Service result
  → Controller
  → ApiResponse.success(...)
  → Client

AppError or unexpected error from any layer
  → Global error handler
  → ApiResponse.error(...)
  → Client
```

Services return application results and throw typed errors. They never return `ApiResponse` values or depend on
Express `Request` and `Response` objects. Controllers own HTTP status codes and successful response formatting;
the global error handler owns error response formatting.

### Layer responsibilities

| Layer           | Responsibility                                                                   | Must not do                                   |
| --------------- | -------------------------------------------------------------------------------- | --------------------------------------------- |
| Route           | Declare the URL, HTTP method, and middleware order                               | Contain business logic or Prisma queries      |
| Middleware      | Add request context and perform authentication, authorization, or validation     | Implement feature workflows                   |
| Controller      | Translate HTTP input into a service call and format the successful HTTP response | Query Prisma directly                         |
| Service         | Implement a feature workflow and enforce business rules                          | Depend on Express or construct Prisma queries |
| Repository      | Encapsulate the feature's persisted-data operations                              | Format HTTP responses                         |
| Prisma Client   | Execute generated and raw database queries                                       | Leak into controllers or services             |
| `schema.prisma` | Define the persistence model, relations, indexes, and constraints                | Implement application behavior                |
| `ApiResponse`   | Keep HTTP success and error bodies consistent                                    | Cross into services or repositories           |

## Persistence rules

- There is no separate model layer. `prisma/schema.prisma` is the database persistence model.
- A feature repository is the only runtime feature layer allowed to query or mutate persisted data through Prisma.
- Controllers and services must not import `PrismaClient`, Prisma query inputs, or generated Prisma record types.
- Repository interfaces use feature-owned inputs and results rather than exposing Prisma-specific types.
- Repositories are optional for features that do not persist data. Pure strategies, combination calculations,
  metric evaluation, validation, and response formatting do not need repositories.
- Repository methods describe feature operations such as `findVersionOwnedBy` or `claimNextJob`; do not introduce a
  generic `BaseRepository<T>` that merely renames Prisma CRUD methods.
- Database bootstrap, migrations, seed scripts, and test setup are infrastructure exceptions to the repository-only
  query rule.
- The Prisma schema and migration history stay at the monorepo root because both the backend and backtest worker use
  the same PostgreSQL database. Migrations run once from a root command or deployment step, never independently from
  both processes at startup.

## Realtime flow

Socket.IO does not pass through Express routes or controllers. It has its own transport path while reusing the same
feature services and repositories:

```text
Socket.IO connection or event
  → Socket session authentication
  → Socket event handler
  → Service
  → Repository and/or domain event publisher
```

### Market-data vertical slice

The first market-data slice keeps exchange protocol details behind `BinanceAdapter`:

```text
market:subscribe
  → marketDataGateway
  → MarketDataService
  → ExchangeAdapter.fetchCandles + openKlineStream
  → normalized Candle snapshot/update
  → market:snapshot (requesting socket only)
  → market:candle (market:<pair>:<timeframe> room)
```

`MarketDataService` starts the WebSocket before requesting REST history, buffers incoming updates while history is
being merged, and deduplicates by `(pair, timeframe, openTime)`. Forming candles remain in the keyed in-memory
state. Closed candles go through `CandleRepository.upsertClosed`, whose Prisma implementation is protected by the
same unique database key. Forming updates publish `MarketPriceUpdated`; the first transition to closed publishes
`CandleClosed` exactly once.

The service keeps one reference-counted state per `(pair, timeframe)`, so multiple chart panels and users share one
upstream kline stream. A stream drop changes the state to `RECONNECTING`, resubscribes after capped exponential
backoff, then fetches from the last known closed candle minus one interval. Recovery opens the new stream before
backfill, batches REST ranges at Binance's 1,000-candle limit, and merges overlap idempotently. A failed backfill
closes the replacement stream, discards its unconfirmed updates, retains the last confirmed state, and reports
`STALE` until a later recovery succeeds.

The service accepts an injected `ExchangeAdapter`, `CandleRepository`, and domain-event publisher, so unit tests do
not connect to Binance and a future exchange adapter does not require gateway or frontend changes.

## File structure

```text
crypto-strategy-lab/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .husky/
│   └── pre-commit
│
├── apps/
│   ├── backend/
│   │   ├── README.md
│   │   ├── src/
│   │   │   ├── @types/
│   │   │   │   └── express.d.ts
│   │   │   │
│   │   │   ├── api/
│   │   │   │   ├── features/
│   │   │   │   │   ├── health/
│   │   │   │   │   │   ├── controllers/
│   │   │   │   │   │   │   └── healthController.ts
│   │   │   │   │   │   ├── repositories/
│   │   │   │   │   │   │   ├── interfaces/
│   │   │   │   │   │   │   │   └── healthRepository.interface.ts
│   │   │   │   │   │   │   └── prismaHealthRepository.ts
│   │   │   │   │   │   ├── routes/
│   │   │   │   │   │   │   └── v1/
│   │   │   │   │   │   │       └── health.routes.ts
│   │   │   │   │   │   ├── services/
│   │   │   │   │   │   │   ├── interfaces/
│   │   │   │   │   │   │   │   └── healthService.interface.ts
│   │   │   │   │   │   │   └── healthService.ts
│   │   │   │   │   │   ├── types/
│   │   │   │   │   │   │   └── health.dto.ts
│   │   │   │   │   │   └── index.ts
│   │   │   │   │   │
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   ├── controllers/
│   │   │   │   │   │   ├── repositories/
│   │   │   │   │   │   │   └── interfaces/
│   │   │   │   │   │   ├── routes/
│   │   │   │   │   │   │   └── v1/
│   │   │   │   │   │   ├── services/
│   │   │   │   │   │   │   └── interfaces/
│   │   │   │   │   │   ├── types/
│   │   │   │   │   │   └── index.ts
│   │   │   │   │   │
│   │   │   │   │   ├── marketData/
│   │   │   │   │   ├── strategies/
│   │   │   │   │   ├── combinations/
│   │   │   │   │   ├── search/
│   │   │   │   │   ├── backtests/
│   │   │   │   │   ├── leaderboard/
│   │   │   │   │   └── news/
│   │   │   │   │
│   │   │   │   ├── middlewares/
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   ├── authenticate.ts
│   │   │   │   │   │   └── authorizeRole.ts
│   │   │   │   │   ├── handlers/
│   │   │   │   │   │   ├── errorHandler.ts
│   │   │   │   │   │   └── notFoundHandler.ts
│   │   │   │   │   ├── logging/
│   │   │   │   │   │   └── requestLogger.ts
│   │   │   │   │   ├── requestId/
│   │   │   │   │   │   └── requestId.ts
│   │   │   │   │   └── validator/
│   │   │   │   │       └── validateRequest.ts
│   │   │   │   │
│   │   │   │   ├── routes/
│   │   │   │   │   └── v1/
│   │   │   │   │       └── index.ts
│   │   │   │   │
│   │   │   │   └── types/
│   │   │   │       ├── apiResponse.ts
│   │   │   │       └── pagination.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── appConfig.ts
│   │   │   │   └── validateEnv.ts
│   │   │   ├── constants/
│   │   │   ├── database/
│   │   │   │   └── prismaClient.ts
│   │   │   ├── errors/
│   │   │   │   └── AppError.ts
│   │   │   ├── realtime/
│   │   │   │   ├── socketServer.ts
│   │   │   │   └── socketAuth.ts
│   │   │   ├── utils/
│   │   │   │   ├── logger/
│   │   │   │   ├── response/
│   │   │   │   │   └── ApiResponse.ts
│   │   │   │   ├── session/
│   │   │   │   ├── swagger/
│   │   │   │   └── helpers.ts
│   │   │   ├── server.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── tests/
│   │   │   ├── features/
│   │   │   │   ├── health/
│   │   │   │   │   ├── unit/
│   │   │   │   │   │   └── healthService.test.ts
│   │   │   │   │   └── integration/
│   │   │   │   │       ├── healthRoutes.test.ts
│   │   │   │   │       └── prismaHealthRepository.test.ts
│   │   │   │   ├── auth/
│   │   │   │   │   ├── unit/
│   │   │   │   │   └── integration/
│   │   │   │   └── marketData/
│   │   │   │       └── integration/
│   │   │   │           └── marketDataGateway.test.ts
│   │   │   ├── infrastructure/
│   │   │   │   └── unit/
│   │   │   │       └── errorHandler.test.ts
│   │   │   ├── e2e/
│   │   │   ├── fixtures/
│   │   │   ├── helpers/
│   │   │   └── setup/
│   │   │       ├── setupTests.ts
│   │   │       └── testDatabase.ts
│   │   │
│   │   ├── Dockerfile
│   │   ├── eslint.config.mjs
│   │   ├── vitest.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── backtest-worker/
│   └── frontend/
│
├── packages/
│   └── shared/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── docker-compose.yml
├── .dockerignore
├── eslint.config.mjs
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

Repository tests are integration tests because they verify actual Prisma queries, mappings, constraints, and
PostgreSQL behavior. Service tests are unit tests and use in-memory repository implementations. Route tests use
Supertest through the Express application. Each other workspace application owns its own separate test tree.
