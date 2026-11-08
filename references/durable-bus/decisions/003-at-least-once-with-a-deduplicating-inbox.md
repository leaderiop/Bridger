# ADR-DB-003: At-least-once delivery with a deduplicating inbox

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-003                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Context

Over an unreliable network a sender cannot know whether a batch whose acknowledgement was lost arrived. Either it may lose events (at most once) or repeat them (at least once). "Exactly once" exists only as at-least-once delivery plus idempotent processing.

## Decision

- The relay resends until an acknowledgement watermark covers an envelope; the receiver acknowledges only after its inbox transaction committed ([BEH-DB-017](../behaviors/03-delivery-and-inbox.md#beh-db-017-the-relay-delivers-at-least-once-in-order), [BEH-DB-019](../behaviors/03-delivery-and-inbox.md#beh-db-019-acknowledgement-follows-the-receivers-commit)).
- The inbox deduplicates by watermark per (origin, stream); subscriptions advance a cursor in the same transaction as the handler's writes.
- Effects outside that transaction are at least once and must be idempotent; the package never describes itself as exactly once.

## Alternatives considered

- **At most once.** Rejected: loses offline facts.
- **Claiming exactly once.** Rejected: untrue for external effects; would violate the honest-claims rule.

## Consequences

**Positive**: no committed envelope is forgotten by the sender before the receiver committed it; repeats are absorbed.

**Negative**: handlers with external effects need idempotency keys.

## References

- Behaviours: [03](../behaviors/03-delivery-and-inbox.md)
