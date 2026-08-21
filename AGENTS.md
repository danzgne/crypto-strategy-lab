# AGENTS.md

This file provides guidance to AI coding agents (Claude Code, Codex, and others) when working with code in this
repository. `CLAUDE.md` is a symlink to this file, so the two can never drift apart: edit only here, and every
tool sees the same content under whichever filename it looks for.

## Repository status

This repository now has its issue #27 production scaffold. It is a pnpm/Node 24 monorepo with an Express backend,
an independent Node backtest worker, a Next.js App Router frontend, shared TypeScript contracts, PostgreSQL via
Prisma, Vitest, ESLint, Prettier, and Docker Compose. Check the current manifests and README before changing
commands or dependencies.

### Logging

- Backend and worker application logs must use their injected Pino logger and structured context objects.
- Direct `console.log`, `console.error`, `console.warn`, `console.info`, `console.debug`, and other `console.*`
  calls are prohibited in application code. The repository ESLint configuration enforces `no-console`.
- HTTP request logs go through `pino-http` so request IDs and service context use the same structured pipeline.
- Production log destinations must remain asynchronous. Flush the logger during graceful shutdown when needed.
- Tests use a disabled Pino logger; do not silence code by replacing the logger with console calls.

The full assignment brief lives at `../project.pdf` (one directory above this repo root, Vietnamese-language
final-project spec for "Crypto Strategy Lab"). The distillation below is the operative context; consult the PDF
directly only when a decision needs a level of detail not captured here.

## Agent skills

### Issue tracker

GitHub Issues on `danzgne/crypto-strategy-lab`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), unchanged. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Contribution workflow

**No direct pushes to `main`. Every change lands via a PR**, even from a solo/agent session. Branch, push the
branch, `gh pr create`.

This is enforced, not just convention. An active GitHub ruleset named `main` targets the branch with
`required_approving_review_count: 1`, `required_linear_history`, `non_fast_forward`, and a `deletion` rule, and
its bypass-actor list is empty. Practical consequences for an agent session:

- You can open a PR but you cannot land it by yourself. GitHub refuses to let an account approve its own PR, so
  a human teammate has to review it. Expect `mergeStateStatus: BLOCKED` with `reviewDecision: REVIEW_REQUIRED`
  on a PR that is otherwise perfectly mergeable; that is the review requirement, not a problem with the branch.
- Do not reach for `gh pr merge --admin` when that happens. `gh` suggests the flag in its error text, but no
  bypass actors are configured, so using it would deliberately circumvent a control the team put in place.
  Report the block and let a human decide. `gh pr merge --auto` is the safe way to queue a merge for the moment
  approval lands.
- Linear history is required, so rebase rather than merge when a branch falls behind.

**Branch each PR off `main`, never off another PR's branch.** Stacked PRs have already cost this repo a silent
loss of work. PR #50 was based on #49's branch; #49 merged into `main` first, and #50 merged into that
now-consumed branch 19 seconds later. GitHub retargets a stacked child to `main` when its base merges, but that
did not happen inside the 19-second window, so #50's content came to rest on a dead branch and never reached
`main` until it was re-landed as #51. Nothing failed loudly: both PRs showed as merged. Because this repo
squash-merges, a stacked branch's history diverges from `main` regardless, so the stacking buys nothing to
begin with. If work genuinely depends on an unmerged PR, wait for that PR to land, then branch from `main`.

**Skill-pack installs/updates get their own PR.** `skills-lock.json` has no pinned ref per skill source, so
re-running the installer can silently change many skills' `computedHash` at once, even when you only meant to add
one new skill. A same-PR commit isn't enough of a boundary: this repo merges with squash-and-merge, which
collapses every commit on a branch into one on `main`, so a "separate commit" inside a feature PR still lands as
one mixed diff for a reviewer to approve as a unit. Never bundle a `skills-lock.json` change into a feature PR:
run the install/update, open a PR containing only that change with a title/description saying what changed and
why, merge it on its own, then branch the feature work from there. This keeps skill-pack drift independently
reviewable, approvable, and revertable instead of riding along inside an unrelated diff.

## What this project is

**Crypto Strategy Lab** is a school software-architecture capstone, not a trading product. The graded deliverable
is architecture quality, not profitable strategies — the spec repeats this explicitly: don't optimize for "does
MA+RSI make money," optimize for "can a brand-new strategy or search algorithm be plugged in without touching
existing components."

The system lets a user:

- Watch up to 4 realtime candlestick charts at once (same pair, independent timeframes, e.g. 5m/15m/1h/4h),
  streamed from Binance without polling.
- Enable individual technical-analysis strategies (MA, RSI, Bollinger Bands, Support/Resistance, and later
  MACD/SMC/Wyckoff/sentiment-based ones) that each emit `BUY | SELL | HOLD` (or `LONG | SHORT | NONE`).
- Auto-combine enabled strategies into **composite strategies** (majority vote or weighted score) and backtest
  every combination against historical data.
- Rank composites on a **Leaderboard** using metrics beyond raw profit (Win Rate, Max Drawdown, Profit Factor,
  Sharpe Ratio, etc.), keeping only the Top-K.
- Run a **Strategy Search Engine** (random search minimum; domain-guided/genetic/etc. are stretch) that
  continuously generates candidates, backtests them, and updates the leaderboard — with an explicit,
  non-`while(true)` stop condition (max iterations / time budget / no-improvement-after-N).
- Crawl crypto news, run ML sentiment analysis on it, and optionally feed sentiment into the strategy pool as
  just another strategy input.

## Non-negotiable architectural constraints

These are the actual grading criteria (see PDF §32, §40–44). Any implementation must be able to answer "yes" to
each, and a reviewer should assume the professor will test exactly these extension scenarios:

1. **Frontend never talks to Binance (or any exchange) directly.** Chain must be
   `Frontend → Market Data Service → Exchange Adapter → Binance`. Adding `OKXAdapter`/`BybitAdapter` later must
   require zero frontend changes.
2. **Strategies are plugins, not `if/else` chains.** New strategy = new class implementing a `Strategy` interface
   (`analyze(context) → signal`) + a registry call (`StrategyRegistry.register(...)`). Adding `MACDStrategy` must
   not require editing the Combination Engine, Backtester, Evaluator, UI, or DB layer.
3. **A strategy only knows its own indicator logic.** No strategy class may contain Binance-calling code, DB
   code, chart-rendering code, or notification code. It receives `context` (price/volume/candles/timeframe/
   indicators/sentiment/...) and returns a signal — nothing else.
4. **Search algorithm is swappable independent of backtesting.** `StrategyGenerator` is an interface
   (`RandomGenerator`, `DomainGuidedGenerator`, `GeneticGenerator`, ...); everything downstream
   (Backtester/Evaluator/Leaderboard/Visualization) consumes an opaque `CandidateStrategy` and must not change
   when the generator changes.
5. **Loop/backtest pipeline is decomposed, not monolithic.** Not one function looping over 100k strategies —
   separate Generator → Queue → Backtest Worker(s) → Evaluator → Ranking Service → Leaderboard, so workers can
   scale horizontally, retry on failure, and be paused/resumed/observed independently.
6. **News/sentiment is decoupled from both its source and its consumer.** `Crawler` only collects raw news into
   a normalized `NewsItem`/`News` shape (id, title, content, source, publishedAt, relatedCoins, url); it must not
   depend on the ML model. Sentiment scoring is a separate service. Multiple news providers (RSS, News API,
   custom crawler) must be swappable behind one `News Provider` abstraction.
7. **Strategy definitions are versioned.** Every backtest/leaderboard entry must be traceable to the exact
   strategy version + parameters that produced it (reproducibility) — never overwrite a strategy's prior results
   in place.
8. **Prefer event-driven decoupling over direct service calls** for cross-cutting flows (e.g. Backtest Worker
   publishes `StrategyEvaluated`, Ranking Service subscribes — it doesn't call `LeaderboardService.update()`
   directly). Candidate event names from the spec: `MarketPriceUpdated`, `CandleClosed`, `StrategyGenerated`,
   `BacktestStarted`, `BacktestCompleted`, `StrategyEvaluated`, `LeaderboardUpdated`, `NewsCollected`,
   `SentimentAnalyzed`.

### Explicit anti-patterns (spec calls these out by name)

- **God Service**: one `TradingService` that fetches Binance data, computes indicators, crawls news, runs ML,
  backtests, ranks, persists, and pushes WebSocket updates.
- **Hard-coded strategy dispatch**: `if MA && RSI ... else if MA && Bollinger ...`.
- **Business logic in the frontend**: React/Vue computing strategy signals, backtest results, or rankings.
- **Strategy classes reading/writing the database directly.**
- **Crawler hard-wired to a specific ML model** (e.g. `Crawler → BERT model` inline).

## MVP scope (minimum to be considered complete)

- Market: Binance data, candlestick chart, realtime updates, up to 4 independently-switchable timeframes.
- Strategy: at least 4 standalone strategies (MA, RSI, Bollinger, Support/Resistance).
- Combination: ability to compose multiple strategies into one composite.
- Backtest: simulate trades over historical data.
- Evaluation: at minimum Return, Win Rate, Max Drawdown, Number of Trades.
- Search: at least Random Search.
- Leaderboard: Top-K ranked strategies.
- Visualization: chart must show Buy/Sell signals and Entry/Exit points.
- News: Collect → Store → Analyze sentiment pipeline (doesn't need to feed back into strategies for MVP).

Advanced search algorithms (Genetic/Bayesian/RL/LLM-generated/agent-based), SMC/Wyckoff strategies, multi-
exchange/multi-coin, position sizing/stop-loss/trailing-stop, and infra like Kafka/Redis/microservices/CQRS/
event-sourcing are explicitly optional extensions — the spec warns not to reach for them unless you can justify
which architectural problem they solve.

## Required deliverables

1. Source code (this repo).
2. `README.md` covering Install / Run / Architecture / Demo.
3. An Architecture Document: System Context, Container/Module decomposition, Component responsibilities, Data
   Flow, Realtime Flow, Strategy Flow, Search/Backtest Flow.
4. ADRs for key decisions (the spec's own examples: why WebSocket, why plugin architecture for strategies, why a
   queue for backtesting, why sentiment is a separate service) — mirror this style for any other major decision.
5. A working demo: realtime multi-timeframe chart → select strategies → generate combinations → backtest →
   leaderboard → trade visualization → news → sentiment.

## Commands

Run these commands from the repository root:

- Install: `pnpm install --frozen-lockfile`
- Development stack: `pnpm dev`
- Full local Compose stack: `docker compose up --build -d --wait`
- Generate Prisma client: `pnpm prisma:generate`
- Apply migrations: `pnpm prisma:migrate:deploy`
- Format check: `pnpm format:check`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`
- All tests: `pnpm test`
- One workspace test file: `pnpm --filter <workspace-name> exec vitest run <test-file>`
- Production build: `pnpm build`
- Complete verification: `pnpm check`
