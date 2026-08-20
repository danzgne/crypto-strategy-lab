# News pipeline: three providers, versioned extraction templates, and enriched scoring

**Status:** accepted

Amends the News and Sentiment sections of the
[#26 MVP Implementation Spec](https://github.com/danzgne/crypto-strategy-lab/issues/26) to match the
instructor's sample UI (`imgs/img3.jpg`), which the team chose to follow. ADR-0004's decision that sentiment
scoring is an in-process, LLM-based module behind a swappable interface is unchanged.

**Three News Providers behind the one existing interface**, matching img3's own source tabs: **RSS** (many
configured feed URLs served by one adapter), **Website** (a URL plus an LLM-generated Extraction Template), and
**HTML** (a one-off raw-HTML paste, which doubles as the authoring and testing path for templates). **CryptoPanic
is dropped.** #26 justified it at length as the only free candidate offering a structured `relatedCoins` field,
so its removal needs the replacement stated: `relatedCoins` moves into the LLM step, which already reads each
article to produce a sentiment label and now an event type as well, so the field costs no extra call.

**Extraction Templates are versioned, and regeneration is proposed but never auto-applied.** A template is
generated once by an LLM reading a source's raw HTML, and is stored with a version. Drift is detected from
validation metrics on subsequent crawls (empty-field rate, malformed-field rate, average confidence). When drift
crosses a threshold, the system generates a **proposed** new version and surfaces it with a diff; an admin
activates it explicitly. This is the distinction that keeps the standing no-repair-loop rule intact: what
ADR-0002 and ADR-0003 banned is the system silently retrying on a user's behalf with no visible failure, and
img3's own panel ends in "Xem diff" and "Áp dụng ngay" buttons, which is a human in the loop rather than a loop.
Auto-applying a regenerated template is out of scope and stays out.

**Scoring returns more per item.** The existing batch call's response schema grows from `{ id, label, score }` to
`{ id, label, score, eventType, relatedCoins }`. `eventType` is a closed single-label set of six: `ETF_FUND_FLOW`,
`PROTOCOL_UPGRADE`, `REGULATION`, `PARTNERSHIP`, `MARKET_TREND`, `OTHER`. Batching, per-consumer cooldown, and
the no-repair-loop failure behaviour from ADR-0004 are all unchanged.

**Source health derives from a per-source crawl-attempt log.** A source is **active** when its most recent crawl
attempt succeeded within its configured refresh interval. Coverage is active over configured, which is the same
number img3 renders twice (23/25 and 92%). Average extraction confidence and items-analysed are both computed
over a trailing 24 hours. The crawl refresh interval is a single global setting, admin-controlled per ADR-0005.

## Considered Options

- **Keeping CryptoPanic as a fourth provider not surfaced as a tab**: rejected. The team chose the mockup's three
  sources, and the one thing CryptoPanic uniquely supplied is now produced by a call the pipeline already makes.
- **Auto-applying a regenerated Extraction Template when drift crosses the threshold**: rejected. That is the
  self-healing repair loop, and it stays out of scope by the same reasoning as ADR-0002 and ADR-0003.
- **No template regeneration at all**, fixing a stale template by re-authoring it manually: rejected. Under it
  almost nothing ever mints a new version, which makes img3's version list (v1.4.0, v1.4.1, v1.4.2) decorative.
  Detect-and-propose is what gives versioning something to version.
- **An open-ended event taxonomy** rather than a closed set: rejected. img3's aggregate chips render as
  percentages of a whole, which an unbounded label set cannot produce.
- **Multi-label event classification**: rejected. img3's five percentages sum to 100, so it is single-label.
- **A per-user crawl cadence**: rejected. News is shared data under ADR-0005, so per-user cadence would have
  users competing over one corpus's refresh rate.

## Consequences

- The Crawler still contains no import of, and no dependency on, any sentiment or scoring code, so constraint 6
  holds. But the Website provider now depends on an LLM for **extraction**, which is a different dependency from
  scoring and a reviewer will reasonably ask about it. The two must stay behind separate seams with separate
  consumer identities (and therefore separate cooldown pools, per ADR-0004), so that extraction failures never
  mark a provider unavailable for scoring or for strategy generation, and vice versa. What constraint 6 forbids
  is a Crawler wired to one specific model; an extraction step behind its own adapter is not that.
- Dropping CryptoPanic means `relatedCoins` quality now depends on LLM output rather than a curated field. Since
  `Context.sentiment` is matched to a Pair by `relatedCoins` (ADR-0006), a systematic mis-tag degrades
  NewsSentimentStrategy rather than just a news filter. Worth a spot-check during implementation.
- The crawl-attempt log is a small new table, and it also supplies the failure history a production system would
  want independently of the health panel.
- Three providers plus a template subsystem is materially more News work than #26 scoped, on a timeline that was
  already full. This was accepted knowingly.
- Revisit if: LLM-driven extraction proves unreliable enough that RSS alone would have served, in which case the
  Website provider is the piece to cut and the interface survives intact.
