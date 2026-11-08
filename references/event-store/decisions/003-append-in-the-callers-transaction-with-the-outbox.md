# ADR-ES-003: Append runs in the caller's transaction, with the outbox in the same transaction

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-003                                           |
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

The dual-write problem — a state change stored but its event not published, or the reverse — is what the transactional outbox solves ([ADR-DB-002](../../durable-bus/decisions/002-outbox-through-a-storage-port.md)). An event store whose append opened its own transaction would reintroduce it between events, outbox, the application's tables and a number series.

## Decision

- `Stream.append` requires durable-bus `StoreTransaction` and never opens or ends a transaction.
- Published events are handed to durable-bus `publish` inside the append, and stored with the envelope's `eventId`.
- Only `Aggregate.run` opens a transaction, through the adapter's combinator, so that it can retry the whole transaction on a conflict.

## Alternatives considered

- **Publish after commit from a change feed.** Rejected: a crash between commit and publication loses the event unless the feed itself is an outbox.
- **The store owns the transaction.** Rejected: the application could not write its own tables or a sequence number atomically with the events.

## Consequences

**Positive**: events, publication, inline projections and sequence numbers cannot drift apart.

**Negative**: the event store, outbox and application tables must live in one database (BEH-ES-034).

**Trade-off accepted**: one database per host, in exchange for no dual write.

## References

- Behaviours: [BEH-ES-005](../behaviors/01-streams-and-append.md#beh-es-005-append-runs-inside-the-callers-storetransaction), [BEH-ES-028](../behaviors/04-versions-publication-and-chaining.md#beh-es-028-publication-writes-the-outbox-in-the-appends-transaction), [BEH-ES-034](../behaviors/05-storage-port-and-acceptance.md#beh-es-034-one-adapter-one-database-one-transaction-with-the-outbox)
- Invariant: [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
