# ADR-DB-004: Order per origin, stream and sequence; clocks for causality only

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-004                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — starting a new incarnation is the operator's obligation; the HLC is stamped with the sequence (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

Wall clocks across a fleet disagree. A global order computed from timestamps would let a node with a fast clock reorder others' events. Applications still need per-flow order, a stable identity for deduplication, and a readable cross-node timeline.

## Decision

- The guaranteed order is per (origin, stream) by a storage-allocated `sequence`; an origin includes an incarnation that the operator changes when a store is restored or replaced — the package cannot detect a restore ([BEH-DB-004](../behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused)). The HLC is stamped in the same serialized step as the sequence, so the two agree within a stream ([BEH-DB-011](../behaviors/02-transactional-outbox.md#beh-db-011-sequence-numbers-are-allocated-in-the-transaction)).
- Each envelope carries a hybrid logical clock for causally consistent merged reading; HLCs never decide identity, deduplication or authority order ([BEH-DB-036](../behaviors/05-order-and-clocks.md#beh-db-036-hlcs-are-never-identity)).
- A received HLC beyond `maxDrift` is stored and flagged but not adopted.
- Global order is the application's authority's.

## Alternatives considered

- **Order by wall time.** Rejected: skew.
- **Vector clocks.** Rejected: size grows with the fleet; per-stream sequences plus HLC cover the need.
- **Refuse skewed envelopes.** Rejected: they are facts.

## Consequences

**Positive**: order is exact where promised; one bad clock cannot drag the fleet's HLCs forward.

**Negative**: no cross-stream order without the authority.

## References

- Behaviours: [01](../behaviors/01-events-and-envelope.md), [05](../behaviors/05-order-and-clocks.md)
