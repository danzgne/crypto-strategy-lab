# Sentiment Service: in-process LLM-based scoring replaces the Python/FastAPI + VADER design

**Status:** accepted. Superseded in part by
[ADR-0011](0011-shared-llm-json-provider.md), which replaces the DeepSeek V4 Flash via OpenCode Zen fallback
named below with Groq, and records that sentiment scoring calls Gemini first while strategy generation calls
Groq first. The per-consumer cooldown reasoning below is unaffected and is carried forward unchanged.

Supersedes the Sentiment Service portion of [ADR-0001](0001-tech-stack-and-modular-monolith.md) and the
recommendation in [#8](https://github.com/danzgne/crypto-strategy-lab/issues/8). During the
[#26 MVP Implementation Spec](https://github.com/danzgne/crypto-strategy-lab/issues/26) session, the Sentiment
Service moved from a separate Python/FastAPI process running VADER to an in-process module inside `apps/backend`,
reusing the dual-provider LLM adapter pattern [ADR-0003](0003-nl-link-strategy-generation-pipeline.md) already
established for RuleStrategy generation (Gemini 3.1 Flash-Lite primary, DeepSeek V4 Flash via OpenCode Zen
fallback, schema-constrained JSON output, reactive per-consumer cooldown). This removes the only reason
ADR-0001 gave for a separate Sentiment Service process: once scoring is a hosted LLM call instead of local
Python NLP compute, there is no Python-specific capability left to justify a second language and a second
deployable. The Backtest Worker is now the sole justified separate process from ADR-0001's original two, and
`apps/sentiment-service` drops out of the planned monorepo layout entirely.

## Considered Options

- **Keep VADER in a separate Python/FastAPI process (the original ADR-0001/#8 design):** rejected on
  reconsideration. VADER is a reasonable lexicon scorer but doesn't handle crypto slang, negation, or sarcasm
  well, and keeping it meant carrying a second language and a second process for a 4-person, 2-week team with no
  confirmed Python skill, to run a scorer an LLM call does better on the text that actually matters here.
- **Call an LLM for sentiment, but keep the Python/FastAPI process as a thin wrapper around the call:** rejected.
  Once the process does nothing Python-specific (no local model, no NLP library), there is no reason left to pay
  for a second language and deployable; the call belongs in the same process as everything else that already
  isn't justified as separate.
- **Drop Python but keep local lexicon scoring via a JS VADER port, instead of calling an LLM:** considered and
  discussed, not chosen. It would collapse the same process boundary without adding a live external dependency
  or shared LLM-quota risk, but was set aside in favor of the accuracy an LLM gives on crypto-specific and
  sarcastic text. Worth revisiting first if the shared-quota risk below turns out to bite in practice.
- **Route sentiment scoring through the exact same provider-adapter instances as RuleStrategy generation, with
  shared cooldown state:** rejected. Sentiment scoring is bulk (every crawled NewsItem, potentially many per
  crawl) where RuleStrategy generation is occasional (one user action at a time); sharing cooldown state would
  let a sentiment-scoring burst falsely mark a provider unavailable for the demo-required "+ Add Strategy"
  feature, or the reverse. Both consumers share the same two vendors but track availability independently, keyed
  per consumer.

## Consequences

- `apps/sentiment-service` (Python/FastAPI) is removed from the planned monorepo layout. Only
  `apps/backtest-worker` remains as a justified separate process from ADR-0001's original two; everything else,
  including sentiment scoring, stays in-process per ADR-0001's default.
- Sentiment scoring now depends on the same two free-tier LLM vendors as RuleStrategy generation. Per-consumer
  cooldown tracking (see ADR-0003) stops a scoring burst from producing a false "unavailable" signal for the
  other consumer, but if the vendor pools quota per account rather than per key, a genuine sentiment-scoring
  burst can still cause real failures for RuleStrategy generation. Provisioning separate API credentials per
  consumer, where the vendor's free tier allows it, is a recommended hardening step, not required for the MVP.
- News items are scored in bounded batches per LLM call rather than one call per item, to keep a normal crawl
  from consuming an outsized share of a free-tier rate limit.
- A schema-invalid or hard-failed scoring batch leaves its items unscored rather than retried inline; they are
  picked up automatically on the next scoring pass. No repair loop, consistent with ADR-0002 and ADR-0003.
- ADR-0001's Backtest Worker reasoning, its monorepo structure elsewhere, and its in-process-by-default principle
  are unaffected; only its Sentiment Service paragraph and its two-process framing are superseded.
- Revisit if: real usage shows the shared-quota risk actually biting (evidence to gather once the natural-
  language generation pipeline and sentiment scoring both ship), or free-tier terms for Gemini or OpenCode Zen
  change materially, in which case the JS-lexicon-port alternative above is the fallback worth reconsidering
  first.
