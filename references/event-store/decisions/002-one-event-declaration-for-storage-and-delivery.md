# ADR-ES-002: One event declaration for storage and delivery: DurableEvent

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-002                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Context link to durable-bus BEH-DB-028 follows its current heading (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

## Context

Stored events are replayed for the life of a store; published events are delivered to hosts that may run an older version ([BEH-DB-028](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-028-readers-know-a-version-before-any-writer-publishes-it)). Two declaration forms — one for storage, one for delivery — would let their versions and upcasters drift.

## Decision

- Every stored event is declared with durable-bus `DurableEvent.make` and registered with the store. Its version, `minVersion` and upcasters serve storage and delivery alike.
- An optional payload field may be added within a version because decoding ignores unknown fields (core [BEH-BR-231](../../core/behaviors/26-versioned-contracts.md)); every other change raises the version with a pure upcaster.
- Stored events are never rewritten to a newer version; upcasters for stored versions are kept for the life of the store.

## Alternatives considered

- **A store-specific event form.** Rejected for the drift above.
- **Rewriting history on version change.** Rejected: it breaks chains over the stored form and makes history depend on migration code.

## Consequences

**Positive**: one upcaster serves replay and delivery; a chain over stored events stays verifiable.

**Negative**: upcasters accumulate for the life of the store.

**Trade-off accepted**: accumulated upcasters, in exchange for immutable history.

## References

- Behaviours: [BEH-ES-001](../behaviors/01-streams-and-append.md#beh-es-001-event-types-are-durable-bus-durableevents-registered-with-the-store), [BEH-ES-025](../behaviors/04-versions-publication-and-chaining.md#beh-es-025-event-versions-follow-durable-bus-additive-changes-follow-core-26), [BEH-ES-027](../behaviors/04-versions-publication-and-chaining.md#beh-es-027-upcasters-are-kept-for-as-long-as-events-at-that-version-are-stored)
- Companion decisions: [ADR-DB-005](../../durable-bus/decisions/005-versioned-events-and-pure-upcasters.md)
