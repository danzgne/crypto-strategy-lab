# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repository is **greenfield**: only agent tooling exists (`.claude/`). There is no source code, no chosen
language/framework/tech stack, and no build/lint/test tooling yet. Do not assume any stack — check what's
actually present before recommending commands, and update this file's "Commands" section once real tooling
exists.

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

**No direct pushes to `main` — every change lands via a PR**, even from a solo/agent session. Branch, push the
branch, `gh pr create`. (Not currently enforced by GitHub branch protection on this repo, but it's the team's
convention regardless — don't rely on the technical absence of protection as permission to push straight to
`main`.)

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

None yet — no package manifest, build system, or test runner exists. Once a stack is chosen, replace this
section with the real install/build/lint/single-test commands.
