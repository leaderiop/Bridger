# ADR-SQ-002: A series is an event-store stream; contiguity comes from stream versions

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-ADR-002                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

## Context

A separate counter table would need its own transaction rules, its own publication and its own verification. The event store already gives contiguous stream versions checked atomically, the shared transaction, publication through the outbox, and chaining by stream.

## Decision

- A series is the event-store stream `"sq:" + node + ":" + incarnation + ":" + name`, holding `SeriesOpened`, `NumberIssued` and `SeriesClosed`.
- `next()` appends `NumberIssued` with the expected version read, in the caller's transaction; the number is the count of issued numbers plus one.
- The package defines no storage port of its own.

## Alternatives considered

- **A database sequence.** Rejected: engine sequences skip values on rollback, so committed numbers would have holes.
- **A counter row without events.** Rejected: the authority could not verify issued numbers.

## Consequences

**Positive**: contiguity, atomicity with the record and publication follow from the event store; verification works over received events.

**Negative**: every number costs one extra event.

**Trade-off accepted**: one extra event per number, in exchange for verifiability.

## References

- Behaviours: [BEH-SQ-001](../behaviors/01-series-and-ownership.md#beh-sq-001-a-series-is-identified-by-its-origin-and-name), [BEH-SQ-004](../behaviors/01-series-and-ownership.md#beh-sq-004-next-reserves-a-number-in-the-callers-transaction), [BEH-SQ-018](../behaviors/03-formats-testing-and-acceptance.md#beh-sq-018-no-storage-of-its-own)
- Companion: [event-store ADR-ES-003](../../event-store/decisions/003-append-in-the-callers-transaction-with-the-outbox.md)
