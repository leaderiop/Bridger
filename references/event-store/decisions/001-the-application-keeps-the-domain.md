# ADR-ES-001: The application keeps domain events, aggregates and projection schemas

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-001                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

## Context

Core knows nothing about domains ([ADR-BR-027](../../core/decisions/027-core-exclusions.md)), and the event delivery companion leaves the storage engine and the domain events to the application ([durable-bus overview](../../durable-bus/overview.md)). An event store that shipped domain events or aggregate shapes would carry one consumer's domain into every other.

## Decision

- The package is mechanism only: streams, expected versions, the decider loop, followers, checkpoints, snapshots, publication and chaining hooks.
- Domain events, deciders, rules, violation events, projection tables and their schemas are the application's. The package calls the application's functions and stores encoded payloads; it never inspects them.

## Alternatives considered

- **A library of common events (created, updated, deleted).** Rejected: generic events hide intent and invite edits disguised as events.
- **A projection schema language.** Rejected: projection storage is the application's database design.

## Consequences

**Positive**: the package stays generic and small; consumers keep full control of their model.

**Negative**: every application writes its own events and projections, and the package cannot check that `evolve` is pure.

**Trade-off accepted**: a smaller package, at the cost of more application code.

## References

- Behaviours: [BEH-ES-009](../behaviors/02-decide-and-evolve.md#beh-es-009-a-decider-has-an-initial-state-evolve-and-decide), [BEH-ES-017](../behaviors/03-projections-and-snapshots.md#beh-es-017-a-projection-is-declared-with-a-name-a-version-and-its-events)
- Core decisions: [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
