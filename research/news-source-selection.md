# Research: Free/low-friction crypto news source(s) for the News Crawler MVP

**Question:** Which free or low-friction crypto news source(s) can a News Crawler realistically pull from
within a 2-week academic build — RSS feed(s), a free-tier News API, or a lightweight scraper — that return
usable `title` / `content` / `publishedAt` / `relatedCoins` data without paid API keys or heavy rate limits?

Target shape (`NewsItem`): `id, title, content, source, publishedAt, relatedCoins, url`. The News Provider must
be swappable (RSS / News API / custom Crawler all implement the same abstraction), so the goal here is one or
two good MVP candidates, not a single irreversible choice.

Research date: 2026-08-14.

---

## Candidates investigated

### 1. CoinDesk RSS (`https://www.coindesk.com/arc/outboundfeeds/rss/`) — viable, recommended

- **Auth:** None. Public RSS, no signup, no key.
- **Rate limits:** None documented; it's a static feed. Feed itself advertises hourly updates with a 5-minute
  TTL hint.
- **Fields available per item** (verified by fetching the live feed):
  `title`, `link` (article URL), `pubDate`, `description` (1–2 sentence summary), `dc:creator` (author),
  `guid`, `category` (multiple tags: section like "Markets"/"Policy"/"Tech" plus topic tags like "Bitcoin
  News", "Regulation", "Stablecoins"), `media:content` (image). `content:encoded` is present as a tag but
  **empty** in this feed — only the short `description` is usable as article text, not full body.
- **Maps to `NewsItem` as:** `title`←title, `content`←description (summary, not full body),
  `publishedAt`←pubDate, `url`←link, `source`←"CoinDesk" (static), `relatedCoins`← must be derived by the
  Crawler from `category` tags / title text via simple keyword matching (e.g. "Bitcoin News" → BTC) — the feed
  has no structured coin-ticker field.
- Source: fetched `https://www.coindesk.com/arc/outboundfeeds/rss/` directly (2026-08-14).

### 2. Cointelegraph RSS (`https://cointelegraph.com/rss`) — viable, recommended

- **Auth:** None. Public RSS, no signup, no key.
- **Rate limits:** None documented; static feed, hourly updates.
- **Fields available per item** (verified by fetching the live feed):
  `title`, `pubDate`, `atom:updated`, `guid`, `link`, `description` (summary with embedded image HTML),
  `dc:creator`, `media:content`, `enclosure`, `category` (e.g. "Latest News", "Markets").
- **Maps to `NewsItem`** the same way as CoinDesk: `content` = summary only, `relatedCoins` derived
  heuristically from category/title text.
- Source: fetched `https://cointelegraph.com/rss` directly (2026-08-14).

### 3. CryptoPanic API — viable as a second provider, weaker on `content`

- **Auth:** Requires a free-signup `auth_token` passed as a query parameter (`https://cryptopanic.com/api/API_PLAN/v2/...?auth_token=...`); a `public=true` mode also exists for the public community feed.
- **Rate limits:** Reported at ~5 requests/sec (up to ~10 req/sec on higher plans), with server-side caching
  such that requests faster than every ~30s return the same cached data anyway.
- **Fields available:** Post objects expose `id`, `slug`, `title`, `description`, `published_at`,
  `created_at`, `kind`, `source`, `original_url`, `url`, `image`, `votes`, `panic_score`, `author`, and —
  importantly — a `currencies`/`instruments` array that gives **structured related-coin data** (ticker, name,
  slug) directly. This is the one candidate that satisfies `relatedCoins` without heuristics.
- **Caveat found:** full `content` (article body) and search are reported as gated to the paid **GROWTH /
  ENTERPRISE** plans; the free plan gives `title` + `description` (short blurb) but not full body text — same
  practical limitation as the RSS feeds.
- **Verification caveat:** CryptoPanic's own docs pages (`cryptopanic.com/developers/api/...`) returned HTTP
  403 to automated fetching in this session (Cloudflare-style bot protection blocked the request, not a
  content issue) — could not read the primary docs text directly. The auth/rate-limit/field details above are
  corroborated by multiple independent secondary sources describing the same JSON shape (a white-label
  instance of the same product at `fxpanic.com/developers/api/about`, an unofficial Python wrapper's field
  list, and a third-party API marketplace listing), which agree with each other. Treat as high-confidence but
  not primary-source-verified; re-check `cryptopanic.com/developers/api/` manually (e.g. from a browser)
  before committing to it.

### 4. NewsAPI.org — not recommended for this project

- **Auth:** Free "Developer" plan API key via signup.
- **Rate limits:** 100 requests/day; free-tier articles are delayed 24 hours; the `content` field is
  truncated to 200 characters even when populated.
- **Fields:** `source {id,name}`, `author`, `title`, `description`, `url`, `urlToImage`, `publishedAt`,
  `content` (truncated). No related-coin field — would need the same keyword-derivation as RSS.
- **Blocking ToS restriction (primary source, `https://newsapi.org/terms`):**
  > "The Developer plan may be used for development and testing in a development environment only, and cannot
  > be used in a staging or production environment (including internally)."

  This is disqualifying for a project whose deliverable includes a *working demo* — even running it live for
  grading arguably isn't "development and testing in a development environment," and deploying it anywhere is
  explicitly against the terms. Also: no full article body is ever returned, on any plan (paid plans only
  unlock real-time delivery and remove the 24h delay/truncation up to a point, at $449/month).
- Source: `https://newsapi.org/terms` fetched directly (2026-08-14); pricing confirmed at
  `https://newsapi.org/pricing`.

### 5. CryptoCompare News API / CoinDesk Data (`data-api.coindesk.com`, formerly `min-api.cryptocompare.com`) — not usable, free tier retired

- CoinDesk acquired CryptoCompare (rebranded "CoinDesk Data") and **retired the free API tier entirely,
  effective May 21, 2026** — confirmed on CoinDesk's own announcement:
  `https://data.coindesk.com/blogs/changes-to-coindesk-data-indices-api-free-tier-access`, which states: "we
  will be retiring our free API tier and accounts without a subscription will no longer have API access,"
  effective that date, after which "your current access will stop returning data" for unsubscribed accounts.
  As of today (2026-08-14) this is already in effect. The lowest paid tier bundles as an API add-on to a
  $999/month plan with contact-sales pricing. **Not viable for a zero-budget student project.**

### 6. CoinGecko `/news` endpoint — not usable on the free tier

- Primary docs (`https://docs.coingecko.com/reference/news`, fetched 2026-08-14) state the endpoint is
  restricted to "Analyst Plan and Above" (Analyst/Lite/Pro/Enterprise) and authenticates via
  `x-cg-pro-api-key` — **it is explicitly not available on the free Demo API key.** Fields would otherwise
  have been good (`title`, `url`, `author`, `posted_at`, `source_name`, `related_coin_ids` — a structured
  related-coins field), but it's gated behind a paid plan, so it's out of scope for this MVP.

---

## Recommendation

**Use RSS as the primary News Provider for the MVP — CoinDesk RSS and Cointelegraph RSS together — and treat
the CryptoPanic free API as a second provider implementation to prove out swappability.**

Why:

- Both RSS feeds are **zero-friction**: no signup, no key, no rate limit to manage, no ToS clause that
  forbids using them in a live demo. That directly matches "2-week academic build" constraints and removes an
  entire class of risk (a course demo breaking because a free-tier quota or a "dev-only" ToS clause got
  tripped, which is a real risk with NewsAPI.org and would have been a real risk with CoinDesk Data/CryptoPanic-style
  paid tiers).
- They provide everything the `NewsItem` shape needs except a fully-structured `relatedCoins` field: `title`,
  `content` (short summary — acceptable for MVP sentiment analysis, which works fine on headlines/summaries),
  `publishedAt`, `url`, and `source` is trivially the feed name. `relatedCoins` needs a small keyword-matching
  step in the Crawler (match category tags / title against a known ticker list) — simple, self-contained
  logic that stays inside the Crawler and doesn't leak into other components, consistent with this repo's
  decoupling constraints.
- Adding **CryptoPanic** as a second `News Provider` implementation is worth the extra signup step specifically
  because it is the only free candidate found that returns a **structured relatedCoins field**
  (`currencies`/`instruments`) instead of requiring heuristic tag matching — it's a good second data point to
  prove the News Provider abstraction really is swappable (RSS-based vs. API-based), which is exactly what the
  architecture is graded on. Just budget for its `content` field being a short blurb, not full article body,
  same as RSS.
- NewsAPI.org, CoinDesk Data (ex-CryptoCompare), and CoinGecko `/news` are all disqualified for the MVP: the
  first by its own ToS forbidding anything beyond local dev/test, the second because CoinDesk retired free
  access in May 2026 (confirmed on their own blog), and the third because the news endpoint requires a paid
  Analyst-tier key.

If the project later wants full article bodies (not just summaries) rather than headline/summary-level
sentiment, the natural next step is a lightweight scraper that follows each RSS `link`/`url` and extracts the
full page text — that can be added later as a third `News Provider` implementation without touching anything
downstream of the abstraction, per the same swappability requirement.
