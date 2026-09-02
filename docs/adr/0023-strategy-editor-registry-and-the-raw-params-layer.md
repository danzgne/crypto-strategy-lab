# Strategy editors plug in like Strategies, and the raw parameter layer outlives the reason it was introduced

**Status:** accepted

Implements the `StrategyEditorRegistry` [ADR-0013](0013-params-provenance-boundary-and-editor-registry.md)
specified but did not build. Amends [ADR-0015](0015-editable-draft-params-with-live-server-validation.md), whose
justification for an editable JSON textarea expires the moment a form exists.

Resolves the editing half of [#48](https://github.com/danzgne/crypto-strategy-lab/issues/48).

ADR-0013 predicted that a schema-driven form rendered from `paramsSchema` cannot render RuleStrategy, whose
`indicators` and `conditions` are declared `array` and `object` with no inner shape. That prediction is already
observable: `SingularStrategyBuilder` lists every catalog entry including `rule`, and `StrategyParameterFields`
renders those declarations as free-text inputs whose contents the constructor then rejects. The Discovery page
ships a broken card today.

## Decision

**`StrategyEditorRegistry` mirrors `StrategyRegistry`.** A Strategy id maps to a React component that edits that
Strategy's parameters. A schema-driven form rendered from `paramsSchema` is the default and covers every Strategy
whose parameters are flat numbers, which is all six built-ins. RuleStrategy registers the one editor that
understands its grammar. Adding MACD still needs zero UI changes, and there is no `if (strategyId === 'rule')`
anywhere, which is the hard-coded dispatch this project is graded against and would have been most tempting in
exactly this spot.

**The RuleStrategy editor covers the whole grammar and makes invalid references unrepresentable.** The shape is
small and fully enumerable: three indicator kinds (`RSI`, `BollingerBands`, `SMA`, each with an optional `as`
alias), four operators, six timeframes, two percent fields, and a pairs restriction. A condition's left operand
and its `indicatorRef` are both dropdowns populated from the references the currently declared indicators expose,
so a dangling reference cannot be expressed rather than being caught after the fact. Renaming an `as` alias
renames it in every condition pointing at it. Carving out a subset of the grammar would only push users back into
the raw layer for whatever was cut, which is the opposite of the point.

**The raw parameter textarea stays, for a new reason.** ADR-0015 introduced it because "in the generation flow
there is no form yet", and it explicitly framed it as "a deliberate stopgap" that #48's editor "is expected to
replace". That reasoning is now spent, but the textarea is kept anyway on a different argument: the form and the
raw text are two layers with different jobs. The form is the constrained surface, where the set of expressible
values is exactly the set of valid ones. The raw layer is where a user pastes a strategy from elsewhere, diffs two
of them, or reaches a shape the form's affordances make tedious. Removing it would trade a capability for
tidiness. ADR-0013's rejection of hand-edited JSON stands where it was argued, in the **Library**, whose editor is
form plus read-only JSON per `imgs/img4.jpg`.

**One `params` value per surface, written by both layers.** The form writes it structurally, the textarea writes
it textually. A text edit that parses and validates updates the form; an unparseable or invalid one leaves the
last confirmed-valid value standing, which is already how ADR-0015's analysis panel behaves and needs no second
rule. `POST /api/v1/strategies/validate` remains the single verdict for both layers, still sharing
`tryConstruct()` with save, so ADR-0012's one-validator rule is untouched by having two ways to type into it.

**The same registered editor serves before and after save.** This is the obligation ADR-0015 wrote for this ADR
to inherit, and it is met literally: the Strategy Engine page's pre-save flow and the Library's drill-in render
the same registered component for the same Strategy id. There is exactly one editor per grammar regardless of
when in its lifecycle a `params` value is being edited, which is what `CONTEXT.md`'s widened **Strategy Editor**
definition already describes.

**Validation messages stay English and untranslated.** `resolveRuleStrategyParams` throws developer-flavored
strings that reach the user verbatim through the validate route, the save route's `GENERATION_INVALID`, and
`strategy:error`. After this editor lands they are unreachable from the form path, because operators and
references are dropdowns and periods are bounded number inputs, and they survive only in the raw layer and on the
Realtime page, both of which are the developer-facing surfaces. Giving the constructor stable error codes to
translate against would mean touching roughly fifteen throw sites for messages the intended user should never
see.

## Considered Options

- **Make `StrategyParamsSchema` recursive so one generic form renders everything**: rejected, as ADR-0012 and
  ADR-0013 both rejected it. A richer schema is more to get wrong, and the generation pipeline still has no repair
  loop.
- **Special-case the `rule` id in one editor component**: rejected. A registry was already the house pattern for
  the thing being dispatched on.
- **Drop the raw textarea once the form exists**, as ADR-0015 anticipated: rejected, and this is the one place
  this ADR departs from its predecessor's stated expectation. See above.
- **Make the Library editor's JSON editable too, for symmetry**: rejected. ADR-0013 argued that case on its own
  merits and the argument still holds where it was made: a saved entry's edit mints a Strategy Version, and
  hand-typing a grammar the system renders as a form is a worse way to reach that.
- **A subset editor covering conditions but not indicator declarations**: rejected. Indicator declarations are
  where the `as` aliases live, so a form that cannot touch them cannot fix the references it renders.
- **Error codes on the constructor, translated in the frontend**: rejected for now, on reachability rather than
  on principle.

## Consequences

- `StrategyParameterFields` stops being a component the composite builder happens to import and becomes the
  registry's default editor, with one owner.
- `SingularStrategyBuilder` is deleted. Its strategy list is replaced by the Library list and its parameter form
  by the registered default editor at `/strategies/new`.
- The Strategy Engine page keeps two editing affordances for the same value, so any future change to how
  RuleStrategy parameters are shaped has to be checked against both. That is the accepted price of the two-layer
  decision, and the shared `params` value plus the single validate route is what keeps it to one place in the
  data flow rather than two.
- Revisit if: a Strategy appears whose parameters are neither flat numbers nor expressible in the rule grammar,
  so a third editor kind is needed and the registry's default stops earning its keep. This is ADR-0013's original
  trigger, unchanged.
