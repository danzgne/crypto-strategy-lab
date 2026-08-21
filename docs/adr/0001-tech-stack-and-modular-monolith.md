# Tech stack: Node/TS modular monolith + two justified service boundaries

**Status:** accepted. Sentiment Service portion superseded by
[ADR-0004](0004-sentiment-service-in-process-llm-based.md), and frontend framework portion superseded by
[ADR-0009](0009-nextjs-app-router-frontend.md). The modular-monolith reasoning and the Backtest Worker decision
below remain current.

Crypto Strategy Lab is a 4-person, 2-week capstone build with no confirmed stack familiarity across the team. We
chose a Node.js/TypeScript backend (Express), a React/TS/Vite frontend using `lightweight-charts` for candlestick
visualization, and PostgreSQL via Prisma — organized as a single modular monolith rather than microservices —
because the spec's non-negotiable constraints (CLAUDE.md, mirroring the PDF's §32/§40–44) are satisfiable through
clean in-process module boundaries (a `Strategy` interface + registry, an in-process event emitter for
`MarketPriceUpdated`/`StrategyEvaluated`/etc.) without needing message-broker infrastructure the team has no time
to learn in two weeks. Two components break out as separate processes because the spec explicitly requires it,
not by preference: a Node/TS **Backtest Worker**, polling a Postgres-backed job table so it can scale
horizontally and restart independently of the backend; and a Python/FastAPI **Sentiment Service**, in a different
language because Python's NLP ecosystem is what makes a 2-week sentiment pipeline feasible, and because the spec
already mandates sentiment scoring be swappable and decoupled from its consumer. The repo is a pnpm workspace
monorepo (`apps/backend`, `apps/backtest-worker`, `apps/sentiment-service`, `apps/frontend`,
`packages/shared`).

## Considered Options

- **Microservices + Kafka/RabbitMQ** (CLAUDE.md's own "optional extensions" list) — rejected: the constraints it
  would satisfy (independent scaling, swappable search/backtest, decoupled sentiment) are all achievable with
  in-process interfaces plus the two justified process boundaries below, and message-broker ops would eat build
  days the team doesn't have.
- **Single language throughout, sentiment via a JS library** — rejected: JS sentiment libraries lag far behind
  Python's pretrained-model ecosystem for a module this central to the grade.
- **Redis/BullMQ for the backtest queue** — rejected in favor of a Postgres-backed job table: one fewer infra
  dependency for a 2-week build; revisit only if worker throughput becomes a real bottleneck.

## Consequences

- Everything except the Backtest Worker and Sentiment Service must stay in-process — don't reach for a new
  network service without revisiting this ADR first.
- The Sentiment Service is stateless (text in, score out); persistence stays owned by the Node backend, mirroring
  the "strategies don't touch the DB" rule the spec applies elsewhere.
- Revisit if: the team's actual per-person skill split (still unconfirmed at decision time) turns out to conflict
  with Node/Python, or backtest volume genuinely outgrows a DB-polling queue.
