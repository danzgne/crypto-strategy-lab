# Extraction Templates locate a listing, and applying one never calls an LLM

**Status:** accepted

Implements the Extraction Template half of
[ADR-0008](0008-news-providers-extraction-templates-and-enriched-scoring.md) and resolves
[#46](https://github.com/danzgne/crypto-strategy-lab/issues/46). ADR-0008 settled that templates are versioned,
that drift is detected from validation metrics, and that a replacement is proposed and never auto-applied. It did
not settle what a template points at, what applies it, or what happens when there isn't a usable one. Those four
answers are load-bearing enough to record separately, because each of them shapes the database, the provider
contract, or both.

## Decision

**A template locates a listing, not an article.** The Website provider that exists today reads one article off
the Source URL and emits a single item whose `url` is the Source URL itself. Since `NewsItem.url` is unique, that
means a Website Source persists exactly one item in its lifetime and every subsequent crawl is a permanent
no-op: nothing new is found, `itemsPersisted` is zero forever, and the validation metrics this feature is built
on would describe a page that never changes. A template therefore carries an item-container locator plus four
per-item field locators (`title`, `summary`, `publishedAt`, `url`), each optionally reading an attribute instead
of text, with the item URL resolved absolute and used for deduplication. A page yielding one item is the
degenerate case of that design rather than its shape.

**Applying a template is pure selector evaluation with no network call and no model.** The LLM appears exactly
twice in a template's life: once when a version is generated, and once when drift proposes a replacement.
Crawling applies stored selectors with `node-html-parser` and nothing else. This is what makes the per-crawl cost
of a Website Source comparable to an RSS Source, and it is what keeps the extraction dependency confined to
authoring, which is the honest answer to the reviewer who will ask how constraint 6 survives ADR-0008.

**Confidence is the model's generation-time self-report, not a restatement of the error rates.** Empty-field rate
and malformed-field rate are computed per application; confidence is stored on the version and copied onto each
attempt that applies it, so the trailing-24-hour figure is an item-weighted mean across versions and sources. The
two are separate quantities, which is also the only reading under which `imgs/img3.jpg`'s own numbers are
consistent: 8.7% empty plus 3.2% malformed alongside an average confidence of 0.76, where one minus the error
rate would be 0.881.

**Version 1 self-activates; only replacements need an admin.** A Source with no active template generates one on
its first crawl and uses it in that same attempt. ADR-0008's rule is that a _proposed replacement_ activates only
by explicit admin action, and there is nothing for v1 to replace and nothing to diff it against. Requiring
approval before a Source can crawl at all would mean a newly configured Source sits inert until someone notices
it, which is a worse failure than the one the rule guards against.

**A missing template, a failed generation, or an unusable one fails the attempt.** No fallback to the meta-tag
heuristics the current provider uses; those are deleted rather than left in place. A fallback would extract
_something_ on a page whose template has drifted, which suppresses the empty-field and malformed-field signal at
precisely the moment it is the only evidence that anything is wrong. The failure is recorded on the crawl
attempt with its reason and surfaces in source health, where a human can see it.

**The drift window is scoped to the active version since its activation.** A plain trailing 24 hours would still
contain the outgoing version's failures the moment an admin activates a replacement, so a fresh version would
inherit the numbers that condemned its predecessor and propose a replacement against itself on its first crawl.
Combined with the minimum-sample rule (three attempts and ten items), a just-activated version simply has no
verdict yet and the panel says so.

## Considered Options

- **Keeping the article-page shape and treating a Website Source as one tracked article**: rejected. It cannot
  produce a second item, so versioning, drift, and the entire source-health panel would describe a corpus of size
  one.
- **Calling the LLM per crawl to extract, with the template as a cached hint**: rejected. The template stops
  being a template, per-crawl cost becomes unbounded, and the Crawler's LLM dependency stops being confined to
  authoring, which is the specific thing ADR-0008 promised a reviewer.
- **Regex templates, adding no HTML-parsing dependency**: rejected. The proposal diff is the feature's whole
  human-in-the-loop surface, and a regex diff is not something an admin can approve or reject on sight.
- **`cheerio` over `node-html-parser`**: rejected on size for what is used. The CSS subset an LLM will emit for
  this task (tag, class, id, attribute, descendant) is fully covered by the smaller library, and constraining the
  generation schema to that subset is a prompt concern rather than a library one.
- **A fifth `asset` template field**, as `imgs/img3.jpg` shows: rejected. ADR-0008 removed CryptoPanic precisely
  because `relatedCoins` now comes from the scoring call that already reads each article. A template field for it
  would be a second, weaker source of the same fact, read off a listing card that rarely states it.
- **Requiring admin approval for v1 as well as for replacements**: rejected, see above.
- **Falling back to the meta-tag heuristics when extraction fails**: rejected, see above.
- **Asking the model to predict the improvement a proposal would deliver**: rejected. The proposed template is
  dry-run against the same freshly fetched HTML and its three metrics are measured, because a predicted error
  rate placed next to a measured one in the same panel invites a comparison between a number and a guess.

## Consequences

- The heuristic meta-tag extractor in `websiteProvider.ts` and its tests are deleted. Nothing else imports them.
- `WebsiteNewsProvider` gains a one-method port for reading its Source's active template, so it depends on an
  interface rather than on Prisma and the `NewsProvider` contract is unchanged for the RSS and HTML adapters.
  Provider construction moves out of `NewsCrawler`'s constructor into `index.ts`, beside the other composition.
- Roughly half the crypto press is not fetchable by a plain client. Of eight candidate listing pages probed,
  The Block and BeInCrypto returned 403, CoinDesk 429, and Cointelegraph 404 on its news path; CryptoSlate,
  Decrypt, Bitcoin Magazine and news.bitcoin.com served real HTML. The RSS provider therefore carries the corpus
  and the Website provider is the architectural demonstration, which is the disposition ADR-0008 already
  anticipated when it named Website as the piece to cut if extraction proved unreliable.
- Listing pages state times as "3 mins ago" in text and ISO-8601 in a `datetime` attribute, so the generation
  prompt has to ask for the attribute and the applier still needs a relative-time reader for when it does not get
  it. An item whose timestamp parses under neither is counted malformed and falls back to crawl time, which can
  pull a genuinely old article into the trailing-24-hour Sentiment Aggregate. Accepted because a listing page's
  items are recent by construction and the alternative discards news over a formatting detail.
- HTML sent to the model is stripped of scripts, styles, SVG, `noscript` and comments and capped at roughly
  150KB. The cap is not arbitrary: on the seeded Source the article list sits between offsets 24.6k and 62.9k of
  123KB of stripped markup, so a tighter budget would truncate the very region being described.
- Revisit if: sites that serve real HTML start gating behind rendering rather than headers, so a template over
  static markup describes a page no user sees. The Website provider is the piece to cut, and the News Provider
  interface survives it intact.
