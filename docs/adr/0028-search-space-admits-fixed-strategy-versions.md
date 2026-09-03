# Search Space admits fixed Strategy Versions alongside parameter domains

**Status:** accepted.

## Decision

A Search Space member is one of two kinds. A **registry member** names a registered Strategy id and the parameter
domains a StrategyGenerator may sample from, which is the only kind that existed before. A **version member** names one
immutable Strategy Version from a User's Strategy Library, carries its resolved parameters, and is never sampled: a
generator may only decide whether to include it in a CandidateStrategy and, in weighted mode, what weight it gets.
`EnabledStrategyDescriptor` becomes a discriminated union on `kind`, and a persisted `SearchRun.searchConfig` written
before this decision parses as a registry member.

The Strategy Version is resolved when the session starts, so a SearchRun pins the `versionTag` it began with and editing
the Library entry afterwards cannot change what the run is measuring. Candidates copy the member's parameter snapshot
rather than referencing the `StrategyVersion` row, consistent with [ADR-0022](0022-one-strategy-library-over-three-writers.md),
and record the source `versionTag` plus the entry's display name as provenance metadata, outside `params` and outside
the candidate fingerprint.

## Considered Options

Sampling a Library entry's parameters was the obvious alternative, and it is what "add my strategy to the search" sounds
like it should mean. It was rejected because a RuleStrategy's `params` is a grammar (an indicator list plus ordered
condition lists), not a handful of numeric ranges. Sampling it requires defining a domain over that grammar, which is a
new generator, not a flag on this one. It would also mint Strategy Versions the User never authored, at a rate bounded
only by the candidate cap, which makes an entry's own history unreadable. Searching around an existing entry is what a
`GeneticGenerator` is for, and this decision leaves that door open rather than half-opening it here.

Carrying the fixed parameters as an optional field on the existing descriptor shape was rejected because it admits a
state with no meaning: a descriptor holding both `paramDomains` and fixed parameters says nothing about whether the
generator should sample. The union makes "this member is not sampled" a fact the type system enforces.

## Consequences

`buildSearchSpace` stays a pure function over the registry: resolving a version member from the database, and checking
that its Strategy Version belongs to the requesting User, happens in the caller that starts the session. A version
member is still subject to the live-only rule, because a Library entry built on a live-only Strategy is no more
backtestable than the Strategy itself.

Composite Library entries are excluded from the Search Space for now. Admitting them means a Composite Strategy could
contain another one, which requires deciding what "at least two unique member versions" means across nesting levels and
how a nested composite's `strength` feeds weighted scoring. Neither question has an obviously right answer, so the
exclusion is deliberate rather than an oversight.
