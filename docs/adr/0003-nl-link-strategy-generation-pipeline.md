# NL/link to JSON strategy generation pipeline: dual-provider, reactive fallback, no repair loop

**Status:** accepted. Superseded in part by
[ADR-0011](0011-shared-llm-json-provider.md), in four places. It settles the shared generation interface this ADR
deferred to implementation time; it replaces the availability clause below ("until the cooldown lapses or a later
request succeeds") with expiry-only cooldown, since a skipped provider never gets a request that could succeed;
it replaces the DeepSeek V4 Flash via OpenCode Zen fallback with Groq, that model having turned out to offer no
schema-constrained mechanism and no free tier; and it withdraws the user-facing provider preference, since
provider order became a data-privacy property rather than a matter of taste. The rejection of *exclusive*
provider choice below is unaffected. Gemini's wire format is also stated here as `responseSchema`; the current
API is the Interactions API with `response_format`.

Resolves [#15](https://github.com/danzgne/crypto-strategy-lab/issues/15). A user submits NL text or a URL from
an "+ Add Strategy" panel in the frontend; the request is handled synchronously by a new in-process endpoint in
`apps/backend` (e.g. `POST /strategies/generate`), consistent with ADR-0001's default of staying in-process
unless a boundary is justified. If the input is a URL, the backend fetches and extracts the page itself via
`@mozilla/readability` + `linkedom` (falling back to a plain fetch + tag-strip if Readability can't parse the
page) before handing text to the generation step — this happens server-side and identically regardless of which
LLM provider ends up generating the JSON, not via a provider-native fetch tool, because that uniformity is what
makes the fallback below actually work.

Generation itself is **dual-provider**, not tied to one vendor: **Gemini 3.1 Flash-Lite** (free tier,
`responseSchema`-constrained generation) is primary, **DeepSeek V4 Flash via OpenCode Zen** (free,
`response_format` JSON-schema-constrained generation) is fallback, both behind one internal interface — the same
adapter shape this codebase already uses for `News Provider` and `Exchange Adapter`. The user can pick a
preferred provider in the UI, but this is a *preference*, not an exclusion: automatic fallback stays active
regardless of which one they pick, and the response reports `generatedBy` so the confirmation box can show which
one actually answered. Fallback triggers only on hard provider failures (timeout, 429, 5xx, network error) —
never on the primary's own output failing schema validation. A schema-invalid response from either provider
surfaces immediately as a user-facing error, not a silent retry against the other provider, because chaining
"try model A, if invalid try model B" would recreate the repair loop ADR-0002 already deferred indefinitely
under a different name.

Availability is tracked **reactively**, not via a scheduled health-check job: when a real request to a provider
hard-fails, the backend remembers it in-memory for a short cooldown (e.g. 5 minutes), and the UI disables that
provider's option with a visible notice until the cooldown lapses or a later request succeeds. On schema
validation failure (from either provider, whichever answered), the user sees a plain-language inline error next
to the input, the input stays editable for immediate resubmission, there is no partial save and no auto-retry.
The extracted link content is not persisted — only the original `sourceInput` (URL or NL text), which ADR-0002
already locked into `RuleStrategy.params` for audit/confirmation purposes; `generatedBy` provenance is shown in
the response but not written into `RuleStrategy.params`, so this decision needs no schema change.

## Considered Options

- **Single LLM provider** (e.g. Claude Haiku 4.5 alone): rejected. Ties a required demo-day feature to one
  vendor's uptime and free-tier terms; the dual-provider design costs one extra adapter implementation and
  removes that single point of failure entirely, for two providers that are both free.
- **Scheduled health-check polling** to gate the UI ahead of any user action: rejected for MVP. Requires a new
  background job, shared cache state, and a definition of "healthy" (auth check vs. dummy generation) for a
  feature that sees occasional use, not sustained traffic. Reactive marking (derived from real request failures)
  gets the same "announce and disable" UX without the new infrastructure; revisit only if usage volume makes
  reactive marking feel laggy in practice.
- **Fall back to the secondary provider on schema-validation failure, not just hard failure**: rejected. Retrying
  a different model until one produces valid output is a repair loop in substance, even if it isn't the
  single-model retry loop ADR-0002 named explicitly. Scoping fallback to infrastructure failures only keeps that
  boundary intact while still solving the single-point-of-failure problem hard failures represent.
- **Exclusive provider choice** (picking a provider in the UI means only that provider, no substitution): rejected.
  Undermines the reason a dual-provider design exists — the users most likely to pick a specific provider because
  the other seems unreliable are exactly the users who'd want the fallback most.
- **Provider-native link fetching** (e.g. a Claude-style server-side web-fetch tool) instead of the backend doing
  its own fetch+extract: rejected. Only some providers offer this, and using it would mean the fetched content
  differs depending on which provider generates the strategy, breaking the "either provider, same input" property
  the fallback depends on.
- **Async/job-queue invocation** (mirroring the Backtest Worker's polling pattern): rejected. A single LLM call
  plus an optional link fetch is a low-latency, one-shot request, nothing like backtesting's scale — queue
  infrastructure isn't justified here.

## Consequences

- Adding a third provider later (or replacing one) means implementing one more adapter against the shared
  generation interface, not touching the endpoint, the frontend, or the fallback/marking logic.
- The reactive-marking cooldown window and its in-memory storage are process-local; if `apps/backend` ever runs
  as multiple instances, "provider X is on cooldown" won't be shared across them until that state moves
  somewhere shared. Not a problem at capstone scale; revisit if horizontal scaling of the backend becomes real.
- No repair loop exists anywhere in this pipeline, including across providers: a schema-invalid response is
  always a user-visible failure to fix by resubmitting different input, never something the system retries on
  the user's behalf.
- `RuleStrategyGenerationProvider` (or whatever the shared interface ends up named at implementation time) is new
  vocabulary parallel to `News Provider`/`Exchange Adapter`; worth a `/domain-modeling` pass on `CONTEXT.md` once
  this ships, though it doesn't block this decision.
- Revisit if: Gemini's or OpenCode Zen's free-tier terms change materially (rate limits tightened, free access
  withdrawn), or real usage shows reactive marking's cooldown window feels wrong in either direction.
