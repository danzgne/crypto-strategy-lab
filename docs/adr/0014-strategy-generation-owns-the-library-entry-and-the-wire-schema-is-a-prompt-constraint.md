# Strategy generation creates the Library entry, and the LLM's wire schema is a prompt constraint, not a validator

**Status:** accepted

Amends [ADR-0013](0013-params-provenance-boundary-and-editor-registry.md), which assigned the `source` and
`sourceInput` columns to #48. Withdraws one consequence of
[ADR-0011](0011-shared-llm-json-provider.md), the availability HTTP route it assigned to this ticket. Extends
[ADR-0012](0012-authored-params-transport-and-strategy-version-tag.md).

Resolves [#34](https://github.com/danzgne/crypto-strategy-lab/issues/34), the "+ Add Strategy" pipeline drawn in
`imgs/img4.jpg`.

## Decision

**#34 creates the Strategy Library entry.** ADR-0013 said "#34 must attach `source` and `sourceInput` to the
Library entry it creates" and then assigned those columns to #48, which is blocked by #34. Both cannot hold, and
a comment on #34 had pushed persistence out of the ticket entirely. Persistence comes back in, because the
alternative is a feature that generates a strategy and then discards it: nothing durable, and nothing runnable
either, since the Realtime page filters `rule` out on `requiresParams`. #48 keeps listing, editing, forking, and
running. It becomes a read and edit ticket, which is what most of its own acceptance criteria already describe.

**A Library entry is the definition-level record; a Strategy Version is one parameter snapshot inside it.**
`CONTEXT.md` could be read either way, since it called an entry a `(strategyId, params)` pair while also giving
it a name, tags, and a Provenance. The entry owns the name, description, tags, Provenance, and source input; it
holds one or more Strategy Versions, each carrying one `params` snapshot, its version tag, and its Library
Version. This makes ADR-0013's immutability claim structural rather than a rule someone has to remember:
provenance lives on the parent, so an edit that mints a new version physically cannot rewrite where the entry's
parameters came from. The **Library Version labels the snapshot, not the entry**, because the thing a person
means by `1.2.1` is a set of parameters, and #48's "editing parameters mints a new Strategy Version whether or
not anyone bumps the semver" only parses if the semver travels with the snapshot.

**Authored parameters are stored; resolved parameters are hashed.** A `StrategyVersion` stores the `params` as
written, with optional fields absent. The version tag is computed from the constructor's resolved output, as
ADR-0012 requires. Storing the resolved form instead would persist the redundant flat `stopLoss`/`takeProfit`
beside `riskManagement` that ADR-0012 already flagged, and would show a reader the same stop-loss twice in the
JSON panel `imgs/img4.jpg` draws.

**The LLM wire schema is a deliberately total schema plus a normalizer, and it is a prompt constraint rather
than a second validator.** Three facts collide. `jsonSchemaSanitizer.ts` rewrites `required` to every declared
property for both vendors, which Groq's `strict: true` needs. Groq additionally strips `minimum` and `maximum`.
And `resolveRuleStrategyParams` rejects unknown keys, allows `stdDev` only on Bollinger Bands, and throws when a
condition carries both `value` and `indicatorRef`, where `null` counts as carrying. A Zod schema mirroring
`RuleStrategyParams`' optionality therefore produces output the constructor rejects on the first call. The wire
schema instead declares every field, expresses absence as `null`, and uses a discriminated union on indicator
`name` so each branch carries only its own parameter keys. A normalizer strips nulls and prunes to
`RuleStrategyParams`. Validation still happens in exactly one place, the constructor, so ADR-0012's rejection of
a second schema stands: the wire schema constrains what a vendor may emit, and never decides what is valid.

**One validation verdict, not `imgs/img4.jpg`'s four checklist rows.** ADR-0012 accepted that a constructor
reports the first problem rather than all of them. Rendering four rows would mean either classifying a thrown
message by its text, or rewriting `resolveRuleStrategyParams` to accumulate issues and reversing that trade-off
for a cosmetic gain. The panel shows the status card and the message.

**The availability route is withdrawn, not deferred.** ADR-0011 left `getAvailability()` without an HTTP caller
on the understanding that "#34 adds the route shaped to what that panel needs". #34's own amendment then deleted
the provider notice from the UI, which removed that route's only consumer. `ALL_PROVIDERS_UNAVAILABLE` surfaces
as a plain-language inline error naming no vendor, in the same slot as an invalid-generation error. There is no
pre-flight availability check, so nothing reads availability over HTTP and the method keeps zero callers.

**A flat `unsupportedRequests` array is the escape hatch for indicators the grammar lacks.** RuleStrategy knows
`SMA`, `RSI`, and `BollingerBands`. A prompt about MACD or EMA, hard-constrained to that enum, yields a
plausible strategy built from the wrong indicators with nothing to warn the user, which is the worst failure
mode available: silently wrong, and common, since MACD and EMA are among the first things anyone describes. The
envelope carries a required `unsupportedRequests: string[]`, empty when nothing was dropped, rendered as a
warning. It does not block saving, because the params are valid and there is no repair loop or grammar-extension
path to offer instead. It is not persisted; it describes the generation attempt, not the strategy.

**Generation is one route with a `kind` discriminator, and provenance is derived server-side.**
`POST /strategies/generate` takes `{ kind: 'USER_PROMPT' | 'WEB_IMPORT', input }`, so the mockup's two buttons
share one route and Provenance is decided by the server at generation time rather than asserted by the client.
Saving is a second call carrying the reviewed params and metadata, matching the mockup, where a user names and
tags an entry before it exists. That save re-runs the constructor before writing and computes the tag itself.
A client could therefore claim a Provenance that does not match its input, which is accepted: the entry is
private to that user and nobody else ever reads the badge, so the alternative buys honesty about a lie only its
teller can hear, at the cost of process-local generation state with a TTL.

**Link fetching is guarded at the request boundary.** The backend fetches user-supplied URLs from inside its own
network, where `postgres`, loopback, and `169.254.169.254` are all reachable. Extraction requires `http` or
`https`, resolves the host and rejects private, loopback, and link-local addresses, re-checks every redirect hop
with a cap of three, accepts only `text/html`, and bounds both response size and time. Extracted text is
truncated before it reaches a prompt and is never persisted, per ADR-0003.

**Running a generated strategy stays out.** `imgs/img4.jpg` draws no chart, and a preview would need a pair
picker and chart wiring duplicating #48's run action. `Signal.reason` and `strategy:error` therefore stay
UI-unreachable until #48, as #34's own notes anticipated.

## Considered Options

- **Leaving persistence out of #34 entirely**, per its second comment: rejected. It makes ADR-0013's phrase "the
  Library entry it creates" refer to nothing, and it ships a generator whose output has no destination.
- **A Library entry as one row per `(strategyId, params)`**, with name and provenance repeated per snapshot:
  rejected. It makes provenance immutability a convention enforced by care rather than by structure, and it has
  no place to put an entry's identity across edits.
- **Relaxing `resolveRuleStrategyParams` to tolerate nulls and per-indicator irrelevant keys**: rejected. It
  loosens the validator every caller depends on to accommodate one caller's wire format.
- **Making the sanitizer's forced `required` vendor-conditional**: rejected. That line exists because Groq's
  strict mode requires it, and optionality on the wire is expressible as a nullable type instead.
- **Storing resolved parameters in `StrategyVersion.params`**: rejected, with a real cost accepted. Authored
  parameters mean a future change to a resolution default silently changes what a stored value denotes. ADR-0012
  already accepted that exposure for the tag itself, and the remedy, if it ever bites, is an added resolved
  snapshot column rather than a different choice now.
- **A success-or-refusal union in the response schema** instead of `unsupportedRequests`: rejected. It needs
  `anyOf` at the schema root, unverified against either vendor, and Gemini's sanitizer rewrites a two-branch
  `anyOf` into a nullable type.
- **Blocking the save when `unsupportedRequests` is non-empty**: rejected. The strategy is valid and the user
  has no other path forward.
- **Holding generation results in server memory so provenance cannot be faked**: rejected. Process-local state
  with a TTL, dying on restart and unshared across instances, to prevent a user misleading only themselves.
- **Nullable `source` and `sourceInput`**: rejected. It makes "is this row a library entry" an implicit question
  every read re-answers with a null check. ADR-0013 declared the provenance list extensible precisely so a
  future search-generated candidate can add a value instead.

## Consequences

- `StrategyDefinition` gains `source`, `sourceInput`, and `tags`; `StrategyVersion` gains `versionTag` and
  `libraryVersion`. `source` and `sourceInput` are required, so the `StrategyDefinition` fixture in
  `apps/backtest-worker/tests/integration/PostgresJobQueue.test.ts` moves with them.
- When the SearchCoordinator persists candidates it will need a `StrategyDefinition` row with no user-facing
  provenance, which is a new enum value rather than a schema change.
- `getAvailability()` now has no caller outside a boot-time log line. Cooldown and automatic fallback stay fully
  exercised by #32's tests, per #34's amendment, but nothing user-facing observes them.
- The wire schema and the normalizer are a second description of RuleStrategy's grammar in a different shape.
  A grammar change (a fourth indicator, a fifth operator) touches both it and `ruleEvaluation.ts`. This is the
  accepted price of keeping `StrategyParamsSchema` non-recursive, as ADR-0012 and ADR-0013 both chose.
- `imgs/img4.jpg`'s JSON panel is followed as a layout, not as a payload. Its `name`, `version`, `description`,
  and `applicability.market` fields are not part of `RuleStrategy.params` and `assertNoUnknownKeys` would throw
  on them, and its `"position"` key is `"operator"` in the implemented grammar.
- Name, description, and tags come back from the LLM as prefills outside `params`, so none of them affect the
  version tag. Neither their length nor their count can be schema-enforced, since `pattern`, `maxLength`, and
  `maxItems` are stripped for both vendors; the prompt asks and the normalizer trims.
- Revisit if: a second params-authoring surface appears and the generate-then-save split starts duplicating
  validation, or the flat AND grammar proves too weak for what users actually describe, which is the same
  evidence trigger ADR-0006 set for itself.
