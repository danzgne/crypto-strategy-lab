# The Strategy Library is one model over three writers, and a saved entry is what a running strategy resolves from

**Status:** accepted

Amends [ADR-0013](0013-params-provenance-boundary-and-editor-registry.md) and
[ADR-0014](0014-strategy-generation-owns-the-library-entry-and-the-wire-schema-is-a-prompt-constraint.md), which
fixed Provenance as `USER_PROMPT | WEB_IMPORT` and rejected making its columns nullable. Fulfils the supersession
[ADR-0012](0012-authored-params-transport-and-strategy-version-tag.md) predicted for itself.

Resolves [#48](https://github.com/danzgne/crypto-strategy-lab/issues/48).

Three tickets landed rows in `strategy_definitions` before anything read them as a library. #34 wrote real
provenance through `createWithFirstVersion` and left `canonicalIdentity` null. #35 wrote `source: 'USER_PROMPT'`
and `sourceInput: request.name` for strategies no prompt ever touched. #37 did the same through
`findOrCreatePrivateVersion`, marked the row `isPrivate: true`, and prefixed `canonicalIdentity` with `private:`
to dodge a unique index. So `isPrivate` was already the real answer to "is this row a Library entry", undocumented,
while every writer lied about provenance to satisfy a non-null column. `POST /api/v1/strategies` picked between two
save paths by sniffing the request body, and its controller branched on `instanceof StrategyLibraryService`.

## Decision

**One model, one service, one save path.** The body-sniffing, the `instanceof` branch, and the
`StrategyLibraryServiceInterface` fallback wiring in `createV1Router` all go. Two overlapping repository method
sets collapse into one. This is the substance of #48: the read and edit surfaces on top are the smaller half.

**A Library entry is singular or composite, and composites are entries.** `Experiment.strategyVersionId` is a
single foreign key, so a backtested composite already has to be a `StrategyVersion` row; there is no second table
it could live in. Leaving that true while calling the library singular-only would keep two concepts on one table
with nothing marking which is which, which is exactly the state this ADR is unpicking. `CONTEXT.md`'s "an entry
names one Strategy id" widens to admit the composite kind.

**A composite's members stay inline copies, not foreign keys.** `CombinationEngine.assemble` already sorts members
by version identity and the stored request is rebuilt from that sorted form, so identity is order-insensitive as
`CONTEXT.md` requires. Storing each member's version tag as well would be redundant with the composite's own
canonical identity and would change every composite's hash, the cost ADR-0012 already accepted once for
`riskManagement` and should not accept twice. "Member versions" therefore means the identity computed from the
copied parameter snapshot, which stays answerable at query time through `canonicalStrategyVersionId`.

**Provenance gains `MANUAL`, and `sourceInput` becomes nullable.** ADR-0013 reserved `MANUAL` for "a from-scratch
authoring path with no LLM step at all" and #48 introduces three of them at once: forking a built-in, tuning a
built-in's parameters, and building a composite by hand. ADR-0014 rejected nullability on the grounds that it
"makes 'is this row a library entry' an implicit question every read re-answers with a null check", but that
argument was made about `source` and assumed every entry has an origin text. A forked built-in has none, and the
question ADR-0014 was protecting is answered by `recordKind` below rather than by a non-null string. The invariant
is that `sourceInput` is non-null exactly when Provenance is `USER_PROMPT` or `WEB_IMPORT`.

**`isPrivate` becomes `recordKind: LIBRARY_ENTRY | BACKTEST_TARGET`.** It is already load-bearing and already means
this; naming it honestly is the whole change. An enum rather than a boolean because ADR-0014 anticipated that
"when the SearchCoordinator persists candidates it will need a `StrategyDefinition` row with no user-facing
provenance", so `SEARCH_CANDIDATE` arrives at #39 as one value rather than as a second boolean. It is named
`recordKind` rather than `origin`, which was considered and rejected: `origin` and Provenance are near-synonyms in
plain English and would be read as the same property, where `recordKind` cannot be. `CONTEXT.md` carries an
`_Avoid_` line either way: Provenance is where an entry's _parameters_ came from, `recordKind` is why the _record_
exists. It is a database-side discriminator only, since a client is never served anything but `LIBRARY_ENTRY` rows.

**Uniqueness rescopes to `(ownerId, strategyDefinitionId, canonicalIdentity)`.** Per-owner-global uniqueness made
a duplicate save silently return the pre-existing entry under its old name, forced #37 into the `private:` prefix,
and would turn "editing an entry appends a Strategy Version" into a constraint violation the moment an edit landed
on parameters another entry already held. Scoped per entry it keeps the useful half, a no-op edit minting no
version, and lets two entries legitimately converge.

**Archive, never hard delete.** `Experiment` foreign-keys `StrategyVersion`, so deleting an entry would break the
reproducibility guarantee the project is graded on. One nullable `archivedAt`, one list filter, one route, and an
archived-entries toggle in the UI so archiving is not a one-way trip into a list nobody can open.

**Ownership is a `where` clause, not a middleware.** `requireOwner` is a placeholder whose docstring nominates
this ticket as the one that should implement it. It is dropped from these routes instead. A repository query
scoped `WHERE id = :id AND ownerId = :me` returning 404 costs one round trip rather than two, cannot be forgotten
on a new route the way a middleware can, and does not leak the existence of another user's entry the way a 403
does.

**The library list endpoint serves built-ins too, and the socket catalog is deleted.** Built-ins are synthesized
server-side from `StrategyRegistry`, excluding any whose `paramsSchema.required` is non-empty, so the exclusion
stays a registry-derived rule rather than a check on the `rule` id. Once that endpoint exists, `strategy:catalog`
has no consumer left: the Realtime dashboard, the composite builder, and the backtest dashboard all read the same
list. `CONTEXT.md` already states the registry never grows at runtime, so the event's live-push nature bought
nothing. `requiresParams` goes with it, which is the only reading under which ADR-0012's "`requiresParams` goes
vestigial" becomes true rather than aspirational.

**`strategy:subscribe` gains a `strategyVersionId` variant.** The server loads parameters it already owns, which
makes the socket path tenancy-scoped and fixes a defect this ADR found: `GET /api/v1/strategies` hard-coded
`kind: 'singular'`, so a saved composite reached the overlay as `{ strategyId: 'composite', params }` with no
`composite` field, `isValidRequest` rejected it, and the gateway returned before its try/catch, emitting no
`strategy:error`. Saved composites were unrunnable and silent about it. The `params` and `composite` variants stay,
because ADR-0012 is right that they remain the right shape for a caller holding an unsaved value.

**The migration is additive and non-destructive.** `source` and `sourceInput` are backfilled from the two
recognizable fake patterns (`sourceInput = name`, and `sourceInput LIKE 'Manual backtest target for %'`).
Legacy `canonicalIdentity` nulls are left alone: a SHA-256 over canonical parameters is not computable in SQL,
the nulls are legal under the rescoped index, and they self-heal on the entry's next save. Truncating the tables
to get a clean slate would take every developer's backtest history with it through the `Experiment` cascade.

## Considered Options

- **Leave the three writers in place and build #48's read surface on top**: rejected. It makes a fourth reader of
  three mutually inconsistent shapes, and the composite defect above is exactly what that costs.
- **Library is singular-only, composites are a separate concept**: rejected. They would still occupy
  `strategy_versions` because of the `Experiment` foreign key, so this buys a second vocabulary for the same rows.
- **Members as `strategyVersionId` foreign keys via a join table**: rejected for now. It is the literal reading of
  `CONTEXT.md` and it would enable "which composites use this entry" as a join, but it forces every ad-hoc member
  to be persisted first and adds a table to an already large change. Revisit at #39.
- **Keep `sourceInput` non-null and store the forked strategy's id in it**: rejected. `CONTEXT.md` defines it as
  the original prompt text or URL; a strategy id is different data wearing that field's name.
- **Keep `isPrivate` and document it**: rejected. The name states a tenancy property that is true of every row in
  the system since ADR-0005, and false as a description of what the column actually selects.
- **Drop the uniqueness constraint entirely**: rejected. Idempotent no-op edits are worth keeping, and without it
  every re-save of unchanged parameters appends a version that differs from its predecessor in nothing.
- **Implement `requireOwner` properly**: rejected, against its own docstring. See above.
- **Keep `strategy:catalog` for built-ins and REST for entries**: rejected. It is the same two-sources-of-one-list
  duplication this ADR exists to remove, one layer up.
- **A destructive migration truncating both tables**: rejected. Dev data is cheap but backtest history is not
  free to regenerate, and the cascade reaches further than the tables being fixed.

## Consequences

- Files #34 and #35 merged days ago are substantially rewritten here. That is the intended shape of the change,
  not scope creep: the two implementations were written against each other's blind spots.
- `SavedStrategy`, `PersistedStrategyRequest`, `StrategyLibrarySummaryDto`, and `StrategyLibraryEntry` collapse
  into one entry shape. Every consumer moves with them, including the backtest dashboard.
- Deleting `strategy:catalog` removes a socket event, its gateway handler, `useStrategyCatalog`, and their tests.
  The realtime transport contract shrinks rather than grows.
- `findOrCreatePrivateVersion` keeps minting rows for ad-hoc backtest targets, but with `recordKind: BACKTEST_TARGET`
  and `source: 'MANUAL'` instead of a fabricated prompt, and without the `private:` identity prefix.
- The `StrategyDefinition` fixture in `apps/backtest-worker/tests/integration/PostgresJobQueue.test.ts` moves
  again, for the same reason ADR-0014 predicted the first time.
- `MANUAL` finally has producers, three of them, which is what ADR-0013 declared the provenance list extensible
  for.
- Revisit if: #39's SearchCoordinator generates composites at a rate where recomputing member identity at query
  time is measurably worse than a join table, which is the evidence that would justify the foreign-key model this
  ADR deferred.
