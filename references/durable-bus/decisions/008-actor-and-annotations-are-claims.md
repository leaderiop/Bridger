# ADR-DB-008: Actor and annotations travel as claims

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-008                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — annotations travel as core-encoded entries under flow "wire" and are combined on receipt through `CallerContext.serve` (CCR-DB-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

A receiver wants to know who caused an event and with what context (taint, provenance). The origin can state these; the receiver cannot verify them from the envelope alone. Core records the actor it is given and never establishes identity ([BEH-BR-191](../../core/behaviors/22-attributable-operations.md)).

## Decision

- The envelope carries the publishing fiber's `CurrentActor`, `onBehalfOf` when [core 28](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) supplies it, a correlation and a causation id, and the annotations whose keys declare the "wire" flow, encoded with core's `Annotations.encode` ([BEH-BR-296](../../core/behaviors/30-operation-context-annotations.md#beh-br-296-annotations-across-a-host-boundary)); taint and provenance always travel, the deadline never ([BEH-DB-006](../behaviors/01-events-and-envelope.md#beh-db-006-the-actor-is-carried-and-on-receipt-it-is-a-claim), [BEH-DB-007](../behaviors/01-events-and-envelope.md#beh-db-007-annotations-travel-under-flow-wire-and-taint-is-never-dropped)).
- On receipt the entries are decoded with `Annotations.decode` for the keys the receiver declares, and the handler runs inside `CallerContext.serve` with that actor and the decoded annotations plus a provenance entry naming the origin, combined into its fiber, never replacing; nothing is described as verified.

## Alternatives considered

- **Re-attribute received events to a service actor.** Rejected: loses who acted at the origin.
- **Sign envelopes in this package.** Rejected: cryptography belongs to a companion such as the audit-chain one or to the transport.

## Consequences

**Positive**: attribution survives the hop, visibly as a claim.

**Negative**: trust in the claim rests on the transport and the origin.

## References

- Behaviours: [01](../behaviors/01-events-and-envelope.md)
- Core: [ADR-BR-029](../../core/decisions/029-attributable-mutations.md)
