# Shared LLM JSON Provider: a provider chain, failures as return values, per-consumer cooldown and ordering

**Status:** accepted. Supersedes four parts of
[ADR-0003](0003-nl-link-strategy-generation-pipeline.md) (the deferred interface name, the availability clause,
the fallback vendor, and the user-facing provider preference) and the fallback vendor named in
[ADR-0004](0004-sentiment-service-in-process-llm-based.md).

Resolves [#32](https://github.com/danzgne/crypto-strategy-lab/issues/32). ADR-0003 established dual-provider
schema-constrained JSON generation for strategy authoring, ADR-0004 made sentiment scoring a second consumer of
the same pattern, and ADR-0008 added extraction-template generation as a third. This ADR settles the shape of the
one module all three share, which ADR-0003 explicitly deferred to implementation time (it named the interface
`RuleStrategyGenerationProvider`, a placeholder that is now wrong, since it names one of three consumers).

Two research notes back the vendor facts below and should be read before implementing against either API:
[wire formats](../research/llm-json-provider-wire-formats.md) and
[fallback vendor selection](../research/llm-json-provider-fallback-vendor.md).

## Decision

**An ordered chain of N providers, not a primary/fallback pair.** `LlmJsonProvider` is an interface with a single
`generate()` method. `GeminiJsonProvider` and `GroqJsonProvider` implement it and know nothing about each other
or about fallback: each makes one call to one vendor. `FallbackLlmJsonProvider` implements the same interface
over an ordered list of providers and owns the chain walk, the cooldown state, and the availability read. Adding
a third vendor is one new class plus one list entry, which is what makes ADR-0003's stated promise ("adding a
third provider later means implementing one more adapter, not touching the fallback logic") actually true.
Vendor classes are named for the vendor or gateway rather than the model, so swapping the model behind one is not
a rename.

The module lives at `apps/backend/src/llm/`, a sibling of `config/`, `database/`, `errors/`, and `realtime/`,
not under `api/features/`. It is cross-feature backend infrastructure with no routes of its own, and nesting it
inside any one consuming feature would make the other two depend on that feature. Instances are constructed in
`apps/backend/src/index.ts` next to `BinanceAdapter`, so cooldown state lives for the process lifetime.

**The vendors are Gemini 3.1 Flash-Lite and Groq `openai/gpt-oss-120b`.** This replaces the DeepSeek V4 Flash via
OpenCode Zen fallback that ADR-0003 and ADR-0004 both name. Research disqualified it on two counts: OpenCode Zen
routes that model to a Chat Completions surface whose `response_format.type` accepts only `text` or
`json_object`, so it cannot be schema-constrained at all, and it is not free ($0.22 in / $0.66 out per 1M
tokens), which was half the justification for a two-vendor design. Groq's `strict: true` uses constrained
decoding, its Free plan publishes standing limits rather than expiring credits, and its terms forbid training on
inputs or outputs. Gemini's call is the Interactions API with `response_format: {type, mime_type, schema}`, not
the `responseSchema` shape ADR-0003 describes.

**Chain order is per consumer, not global.** Two `FallbackLlmJsonProvider` instances are composed in
`index.ts`: Groq first for strategy generation, Gemini first for sentiment scoring and extraction-template
generation. Strategy generation carries private user-authored text (strategies are per-User private under
ADR-0005), so it goes to the vendor contractually barred from training on it; Gemini's free tier is documented as
used to improve Google's products. Sentiment and extraction are throughput-bound over public news, and Groq's
8,000 tokens per minute is the tighter ceiling, so they lead with Gemini. This needs no interface change, because
the chain already takes its provider list from its constructor.

Cooldown remains keyed by Consumer Identity rather than collapsing into per-instance state, since sentiment and
extraction share one instance and ADR-0008 requires their cooldown pools stay separate.

**No user-facing provider preference.** ADR-0003 gave the user a non-exclusive preference control in the
"+ Add Strategy" panel. That is withdrawn. Once ordering is a privacy property rather than a taste, a control
that lets a user route their own private strategy text to the training-permitted vendor trades a real protection
for no perceivable benefit, since both vendors answer the same question. `generatedBy` still reports which vendor
answered, which demonstrates the swappable seam better than a dropdown did. ADR-0003's separate rejection of
_exclusive_ provider choice is unaffected and still stands.

**Zod is the schema language, in both directions.** The caller passes a Zod schema and gets back the parsed value
typed by it. `z.toJSONSchema()` (Zod 4, already a dependency) produces the vendor payloads, and `.safeParse()` on
the response is the validation step. No second schema language and no new dependency.

**Each provider sanitizes the schema for its own vendor.** Zod emits keywords neither vendor documents (`$schema`
always, plus `const`, `oneOf`, `allOf`, and `pattern` depending on the schema), and the two vendors share almost
no `format` values. A `toVendorSchema()` step inside each provider class strips and rewrites what that vendor
does not accept. Pushing those restrictions outward onto callers would make all three consumers encode one
vendor's keyword list, so adding a fourth vendor would edit all of them. Stripping a keyword silently loosens the
constraint sent to the vendor, so the sanitizer logs at `warn` when it drops one; `.safeParse()` still enforces
the real contract on the way back.

**Failures are return values, not exceptions.** `generate()` returns a discriminated union: success carrying the
parsed value and `generatedBy`, or a typed failure of `SCHEMA_INVALID` or `ALL_PROVIDERS_UNAVAILABLE`. Both are
expected outcomes that three different UIs must branch on as ordinary UX, not exceptional conditions. `throw` is
reserved for programmer and configuration error (a malformed schema, an HTTP 4xx other than 429 such as a bad
key).

**The failure line is parseability, not validity.** A response that fails `JSON.parse`, arrives empty, or is
truncated mid-stream is a **hard failure**: the provider did not produce a response at all, so it falls through
the chain and starts a cooldown exactly as a 5xx does. Well-formed JSON that fails `.safeParse()` is
`SCHEMA_INVALID`, returned to the caller, with no retry and no cooldown, because the vendor answered and only the
content was wrong. This rule reads identically for every provider and needs no special case for a weaker one.

**One attempt per provider, and no retries anywhere.** A hard failure (network error, timeout, HTTP 429, HTTP
5xx, HTTP 424, or an unparseable response) moves to the next provider in the chain immediately. There is no
same-provider retry before moving on: a retry-then-fallback is the repair loop ADR-0002 and ADR-0003 both ruled
out, under a different name. Each vendor class owns its own timeout via an `AbortSignal` on its `fetch`, because
a timeout is a property of that vendor, not of the chain.

**Cooldown is per Consumer Identity, gates the call path, and lifts on expiry only.** A hard failure puts that
vendor on a 5 minute cooldown scoped to the calling consumer's identity string, so a sentiment-scoring burst
cannot mark a vendor unavailable for strategy generation (ADR-0004) or extraction (ADR-0008). `generate()`
consults cooldown state before dialing and skips a cooling-down vendor without spending a request on it; if every
vendor is cooling down it returns `ALL_PROVIDERS_UNAVAILABLE` without a network call.

This is the clause of ADR-0003 that is superseded. ADR-0003 said a cooldown lifts "until the cooldown lapses or a
later request succeeds." Once cooldown gates the call path, the second half is unreachable: a skipped vendor never
gets a request that could succeed. Cooldown therefore lifts on expiry only. The window stays a fixed in-code
constant rather than an environment variable, consistent with nothing else at this granularity being externalized
in this repo.

**The consumer identifier is an opaque string this module never enumerates.** There is no union type listing the
three consumers; each consuming feature declares its own constant. Adding a fourth consumer touches no code in
`llm/`.

**Credentials are per vendor, and a missing key is not a boot failure.** `GEMINI_API_KEY` and `GROQ_API_KEY` are
optional in `appConfig.ts`. A vendor with no key reads as permanently unavailable and is skipped like a
cooling-down one, so a teammate with neither key can still run `pnpm dev`, and both keys missing surfaces as
`ALL_PROVIDERS_UNAVAILABLE` at call time. Per-consumer credentials remain the hardening step ADR-0004 described
as optional for the MVP.

**The provider owns schema scaffolding; the caller owns only its domain prompt.** Each vendor class translates
the sanitized schema into that vendor's mechanism (Gemini's `response_format.schema`, Groq's
`response_format.json_schema` with `strict: true`) and appends whatever instruction text that vendor needs.
Vendor differences are exactly what this seam exists to hide.

**Batching is the consumer's concern.** The interface is one prompt in, one JSON value out. ADR-0004's bounded
sentiment batches are expressed by that consumer passing an array schema and many items in its prompt. Batch
size and partial-failure policy are sentiment's business and would be dead weight for strategy generation. Groq's
rate-limit response headers are not surfaced through the interface either, because Gemini publishes no equivalent
and exposing a value that is real for one vendor and absent for the other is the asymmetry this seam exists to
hide.

**Logging never includes prompts or responses.** The module takes an injected `AppLogger` like every other
service. Hard failures and cooldown activation log at `warn`, a successful fallback at `info`, with context
`{ consumerId, provider, status, durationMs }`. A `SCHEMA_INVALID` result logs the Zod issue paths only. Prompts
carry user-authored strategy text and crawled article bodies, and logging them would put user content in the log
stream for a debugging benefit a local reproduction already gives.

**No HTTP endpoint in this ticket.** Availability is readable via a `getAvailability(consumerId)` method only.
ADR-0003 describes a UI that greys out an unavailable provider, but that is #34's panel; #34 adds the route
shaped to what that panel needs, rather than this ticket guessing a response contract with no consumer to
validate it.

## Considered Options

- **A primary/fallback pair with fallback special-cased between exactly two providers**: rejected. Simpler today,
  but it makes ADR-0003's third-provider promise false, and the generalization is a list and a loop.
- **Keeping DeepSeek V4 Flash via OpenCode Zen and accepting JSON mode plus local validation**: rejected. Without
  schema constraint the fallback would need a retry-on-invalid loop that the primary does not, which is the
  repair loop under yet another name, and it would cost money besides.
- **One of OpenCode Zen's genuinely free models instead**: rejected. All are documented as free "for a limited
  time" with data-collection caveats and no confirmed schema support, which is worse on every axis than paying.
- **Dropping to a single provider and keeping the chain for later**: rejected. #32 exists to build the chain, and
  with one provider `FallbackLlmJsonProvider` is decorative. Provider swappability is the architectural property
  this ticket demonstrates.
- **Groq `openai/gpt-oss-20b` rather than `-120b`**: rejected. Free-plan limits are identical for both, so the
  larger model costs nothing in quota, and the only thing the smaller one buys is latency on a path that runs
  only when the primary is already down. It is a one-string swap if 120B disappoints.
- **`qwen/qwen3.8-27b`, which has 10x the daily token budget**: rejected. It is a Preview model that Groq
  documents as subject to discontinuation at short notice, which is the wrong bet for something that must work
  on demo day.
- **A single global provider order**: rejected. It forces one workload's constraint onto the other, either
  routing private user text to the training-permitted vendor or putting bulk news scoring behind the tighter
  token ceiling.
- **Keeping ADR-0003's user-facing provider preference**: rejected, see above. An admin-configurable order was
  considered as a middle ground and set aside as unjustified configuration surface for the MVP.
- **Throwing on schema-invalid and on all-unavailable, matching `BinanceAdapter`**: rejected. `BinanceAdapter`
  throws for genuinely unexpected conditions. Here both cases are ordinary UX that every consumer must render,
  and #32's own wording says a validation failure is returned to the caller.
- **Cooldown as an advisory signal for the UI badge only, with `generate()` always dialing**: rejected. Reactive
  tracking that never changes behavior spends a request on a vendor already known to be down, and makes the
  tracking decorative.
- **A half-open probe letting one request through to test a cooling-down vendor**: rejected as machinery for
  nothing. With a 5 minute window, the next real request after expiry already is the probe.
- **Retrying the same provider once before falling through**: rejected. Indistinguishable in substance from the
  repair loop the two prior ADRs ruled out.
- **The caller writing its own "return JSON matching this schema" instructions, or its own vendor-safe schemas**:
  rejected. All three consumers would need editing to add a vendor, which is the coupling the seam exists to
  prevent.
- **Batching inside the adapter**: rejected. It is one consumer's requirement leaking into a shared interface,
  and it would force strategy generation to reason about batches of one.
- **Amending ADR-0003 in place rather than writing this ADR**: rejected. ADR-0003 is accepted and its reasoning
  was correct on the facts it had; rewriting it would erase the trail. Forward pointers plus this document
  preserve both.

## Consequences

- Cooldown state is process-local, so ADR-0003's caveat still applies: if `apps/backend` ever runs as multiple
  instances, availability is not shared across them. Unchanged at capstone scale.
- Groq's free plan allows 8,000 tokens per minute and 200,000 per day, shared across the whole organization
  rather than per key. At roughly 800 tokens per article body that is about ten news items per minute of input
  budget. #42 must size its batch loop against tokens per minute, not requests per minute. This is the binding
  constraint on the whole news pipeline and is the most likely thing to bite in practice.
- Whether Groq's Free plan requires a credit card, and whether `strict` mode is available on it, are not
  documented either way. Both need confirming by actually provisioning a key before implementation depends on
  them.
- Neither vendor's generation endpoint was exercised against a live key during research. The request and response
  shapes in the research notes come from official references, not observed round trips, and both notes carry an
  "Open questions" section listing what stayed unverified.
- The availability read exists with no HTTP caller until #34 lands. That is deliberate, and #34 owns the route.
- "Which provider is primary" is no longer a single global fact, which makes the system marginally harder to
  reason about and must be stated wherever provider order is discussed.
- Revisit if: a non-JSON LLM need appears (streaming text, embeddings), which should get its own interface rather
  than widening this one; Groq's tokens-per-minute ceiling starves batch scoring in practice, in which case
  Cohere is the researched runner-up; or either vendor's free terms change materially.
