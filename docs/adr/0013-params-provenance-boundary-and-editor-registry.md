# Params carry only what a Strategy does, provenance belongs to the Library entry, and editors plug in like Strategies

**Status:** accepted

Amends [ADR-0002](0002-strategy-plugin-interface-and-rulestrategy.md) and
[ADR-0006](0006-declarative-strategy-definition-and-two-advanced-builtins.md), both of which put `source` and
`sourceInput` inside `RuleStrategy.params`. Extends
[ADR-0012](0012-authored-params-transport-and-strategy-version-tag.md).

#33 shipped a raw-JSON textarea on the Realtime page, because its own acceptance criteria asked for "a minimal
manual JSON input". Reviewing it against `imgs/img4.jpg` and `imgs/img5.jpg` showed that placement was wrong in
three separate ways, and unpicking it moved a boundary that ADR-0002 had drawn in the wrong place.

**`source` and `sourceInput` leave `params` and become Strategy Library entry fields.** ADR-0012 made the
Strategy Version tag a hash of resolved params, so anything inside `params` is part of a Strategy's identity.
Provenance is not: no evaluation reads it, and two identical rule sets pasted from different origins are the
same strategy. Leaving `sourceInput` in `params` had a sharper consequence still, since fixing a typo in a
natural-language prompt would mint a new Strategy Version for byte-identical rules. `params` now contains only
`indicators`, `conditions`, `riskManagement`, `timeframe`, and `applicability`, which is a defensible line:
everything in it changes what the Strategy does. `imgs/img4.jpg` already drew Source in the "save to library"
panel beside Name, Version, and Tags, next to the fields `CONTEXT.md` had already classified as library
metadata.

**Provenance is `USER_PROMPT | WEB_IMPORT`, and it is immutable.** This replaces ADR-0002's
`manual | nl-generated` with the vocabulary `imgs/img4.jpg` and #48 already use, since that is what renders as a
badge. It records where params _originated_, so editing a generated strategy later does not rewrite it. The
value set is deliberately declared as an extensible list rather than an inline union, so adding `manual` later
is a one-line change to metadata and never touches the hashing input.

**A Strategy Library entry is a general `(strategyId, params)` pair, not a RuleStrategy special case.**
`imgs/img1.jpg` draws drill-in chevrons on the built-in cards too. Built-ins are read-only in place but forkable
into a user's own entry, which is what makes `CONTEXT.md`'s existing claim that MA(20,50) and MA(10,30) are
different Strategy Versions reachable from the UI at all. Restricting the library to RuleStrategy would leave
that sentence true but unreachable.

**Editors plug in through a `StrategyEditorRegistry`, mirroring `StrategyRegistry`.** A schema-driven form
rendered from `paramsSchema` is the default and covers every strategy whose params are flat numbers. It cannot
render RuleStrategy, whose `indicators` and `conditions` are declared `array` and `object` with no inner shape,
because ADR-0012 deliberately kept `StrategyParamsSchema` non-recursive. So a Strategy may register a custom
editor for its id, and RuleStrategy registers the one editor that understands its grammar. Adding MACD still
needs zero UI changes.

**Authoring leaves the Realtime page entirely.** `imgs/img5.jpg` has no strategy selector at all; the existing
checkbox row is already a divergence, owned by a teammate and slated for redesign. The row now filters on the
`requiresParams` flag ADR-0012 introduced, so a Strategy needing authored params simply does not appear until
saved instances exist. #33 keeps the rule engine, the version tag, and the params transport, and ships with no
authoring UI at all.

## Considered Options

- **Keep `source` in `params` as ADR-0002 had it**: rejected. It makes provenance part of strategy identity, so
  the same rules authored two ways are two Strategy Versions with two sets of backtest results, for a
  distinction no Backtester or Evaluator reads.
- **Move `source` out but keep `sourceInput` in**, per #34's acceptance criteria: rejected. It is the same
  category of data, and it is the field where the cost bites hardest: prompt text is long, freely edited, and
  its edits would silently fork a strategy's history.
- **Make `StrategyParamsSchema` recursive JSON Schema** so one generic form renders everything: rejected, for
  ADR-0012's original reason. A richer schema is more to get wrong, and the generation pipeline still has no
  repair loop. A registry of editors keeps the schema shallow and puts the complexity in one opt-in component.
- **Special-case `if (strategyId === 'rule')` in the editor**: rejected. That is the hard-coded dispatch the
  project is graded against, in the one place where a registry was already the house pattern.
- **Restrict the Library to RuleStrategy entries only**: rejected. Simpler to build, but it makes tuning a
  built-in's parameters impossible, which is the most basic thing a Strategy Version is supposed to represent.
- **Keep the JSON textarea, relocated to the Library**: rejected. `imgs/img4.jpg` shows JSON as display-and-copy
  with no edit affordance, and hand-editing a grammar the system can render as a form is a worse experience for
  no gain.

## Consequences

- `RuleStrategyParams` loses two fields, so every previously computed Strategy Version tag changes. This is free
  today because nothing is persisted yet, and would be expensive after #48. Deciding it now is the point.
- #34 must attach `source` and `sourceInput` to the Library entry it creates rather than to the params it
  generates, and its acceptance criteria are amended to say so.
- #48 owns the `source`/`sourceInput` columns, the editor registry, the form editor, and listing saved
  strategies in the Realtime row beside built-ins.
- #33 has no user-facing surface until #34 or #48 lands. Its engine is covered by unit tests and its transport
  by gateway integration tests, so the gap is in reach, not in confidence.
- `manual` has no producer while no hand-authoring path exists. The provenance list is extensible precisely so
  that reintroducing one is cheap.
- Revisit if: a strategy appears whose params are neither flat numbers nor expressible in the rule grammar, so
  that a third editor kind is needed and the registry's default stops earning its keep.
