# Generated params are editable before save, validated live by the server, never by a second schema

**Status:** accepted

Amends [ADR-0013](0013-params-provenance-boundary-and-editor-registry.md), which rejected a JSON textarea:
"hand-editing a grammar the system can render as a form is a worse experience for no gain." That rejection was
aimed at the Strategy Library, where the alternative is a structured form. In the generation flow there is no
form yet, and the alternative to editing isn't a form, it's discarding the draft and re-prompting the LLM. This
ADR scopes ADR-0013's rejection back to where it was actually argued, and widens `CONTEXT.md`'s **Strategy
Editor** definition to cover a `params` value before it has a Library entry at all.

## Decision

**The JSON panel in the Strategy Engine page becomes an editable textarea, open by default**, amending #34's own
shipped criterion of a collapsed toggle. It edits only the unsaved, in-flight `params` value; a saved entry's
params stay untouched by this surface, since that editor is #48's job. Per the widened Strategy Editor
definition, this textarea is a deliberate stopgap: #48's registered, RuleStrategy-aware editor is expected to
replace it here too, so the pre-save and post-save surfaces render the same registered editor for the same
Strategy id rather than accumulating two editors for one grammar.

**A new `POST /api/v1/strategies/validate` route runs the same constructor as save, but answers with 200 either
way.** Body `{ params }`, response `{ valid: boolean, message?: string }`. This deliberately diverges from the
save route's `GENERATION_INVALID` 422: for save, invalid params are a failure to persist; for validate, "this is
invalid" is the successful answer to the question the caller asked, the same reasoning ADR-0011 already used for
the LLM provider chain's own return-value failures. `StrategyLibraryService` gets a `validate()` method and a
private `tryConstruct()` shared by both `validate()` and `save()`, so the constructor is invoked from exactly one
place internally, keeping ADR-0012's "one validator" rule intact.

**The client checks live: client-side `JSON.parse` on every keystroke, a debounced (500ms) server validate call
only once the text parses.** A syntax error is the majority case for "I broke it" and needs no round trip. Every
edit bumps a sequence counter; a validate response is applied only if its captured sequence still matches the
current one, so a slow response to an old edit can never overwrite a newer verdict. There is no rate limiting
anywhere in this backend today, so the debounce is the only thing standing between this textarea and a request
per keystroke.

**Save is gated on a confirmed-valid verdict, but this gate is UX only.** The button disables while the current
edit is unchecked, checking, or invalid. The save route still re-runs the constructor regardless, exactly as it
already did before this ADR, so a client that ignores the gate still cannot persist a broken strategy.

**The human-readable analysis panel renders only the last confirmed-valid parse, lagging the debounce by design.**
Feeding it a half-typed or invalid shape would mean rendering defensively for cases the constructor would reject,
which is the complexity ADR-0006's flat-AND grammar and ADR-0012's single-validator rule both exist to avoid. A
reader sees exactly what the server most recently confirmed is a real strategy, never a live half-edit.

**Re-prompting while the draft has unsaved edits requires an inline two-step confirm**, not a `window.confirm`
(none exists anywhere in this codebase) and not a discard-recovery mechanism (a bin nobody empties). The button
itself becomes the confirmation: one click arms it for a few seconds, a second click within that window fires the
request, anything else lets it disarm.

**Provenance, `unsupportedRequests`, and the generation-time name/description/tags are untouched by editing.**
Hand-editing a generated strategy's conditions does not reclassify its Provenance from `USER_PROMPT` or
`WEB_IMPORT`, per `CONTEXT.md`'s existing "immutable" rule: an edit is refinement of the same origin, not a new
one, and no downstream component reads whether a draft was edited before saving. `unsupportedRequests` stays
correct as written, since it describes the generation attempt, not the current params (ADR-0014).

## Considered Options

- **Debounce dropped in favor of a check-on-blur or an explicit "Check" button**: rejected. The user asked for
  live feedback specifically so a near-miss surfaces before they go looking for a save button to click.
- **A debounced check on every keystroke, with no client-side JSON.parse gate**: rejected. It would spend a
  request per keystroke burst against a route with no rate limiting for a class of error a parser catches for
  free.
- **A second Zod schema at the validate route, mirroring `RuleStrategyParams`**: rejected, for the same reason
  ADR-0012 rejected it for the params transport generally: the constructor must validate to build itself, so a
  second schema is a second, driftable source of truth for one shape.
- **Reusing the save route's 422 contract for validate, treating "invalid" as an error to catch**: rejected.
  `browserHttpClient` throws on any non-2xx response, and forcing every validate call through a try/catch to read
  an expected, ordinary outcome is the same shape of mistake ADR-0011 already reasoned through once.
- **A write endpoint with a "dry run" flag instead of a separate validate route**: rejected. A write path that
  can pretend not to write is how write paths grow modes that quietly diverge from each other over time.
- **Clearing the generated name/description/tags once params are edited, since they may no longer describe the
  new params**: rejected. Silently discarding fields the user may have already reviewed or edited themselves is
  worse than a suggestion that goes stale in a way the user can see and fix.
- **A new Provenance value (e.g. `MANUAL`) once a generated draft is edited**: rejected. Provenance records where
  params _originated_; a prompt that was then refined by hand is still a prompt-originated strategy. `MANUAL`
  remains reserved for a from-scratch authoring path with no LLM step at all, which ADR-0013 already anticipated.
- **Landing this as a follow-up ticket rather than amending #34 while its PR is still a draft**: rejected. These
  are #34's own problems, surfacing after implementation and before merge; a second review pass on a small
  follow-up costs more than extending the one already in flight.

## Consequences

- `StrategyEditorRegistry` (still to be built in #48) inherits an obligation from this ADR: whatever RuleStrategy
  editor it registers must also be usable in the Strategy Engine page's pre-save flow, or the two surfaces drift
  into two editors for one grammar, which the widened Strategy Editor definition was written specifically to
  prevent.
- `POST /api/v1/strategies/validate` and `POST /api/v1/strategies` now share one `tryConstruct()` in
  `StrategyLibraryService`; a future change to how RuleStrategy params are constructed changes both call sites
  identically by construction, not by convention.
- The debounce lives inside the Strategy Engine feature (`useStrategyGeneration`), not as a shared utility, since
  it has exactly one consumer today. Extract it if a second one appears.
- Revisit if: the backend gains real rate limiting, at which point the debounce's job shifts from "the only
  throttle" to "a UX nicety," which may loosen how conservative its interval needs to be.
