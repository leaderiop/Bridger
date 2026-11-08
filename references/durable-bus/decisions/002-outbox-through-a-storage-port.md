# ADR-DB-002: A transactional outbox through a storage port

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-ADR-002                                            |
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

Writing a state change and sending its event are two writes; without a shared transaction, a crash between them loses the event or sends one for a change that rolled back. The standard remedy is the transactional outbox. The package must not own storage, and the right engine (SQLite on a terminal, Postgres at an authority) differs per deployment.

## Decision

- `publish` requires `StoreTransaction`, a service only a storage adapter provides inside its own transaction; the envelope is appended through `OutboxStore` in that transaction ([BEH-DB-009](../behaviors/02-transactional-outbox.md#beh-db-009-publish-runs-inside-the-callers-transaction)).
- Sequences are allocated by the storage in the transaction.
- Adapters are held to written obligations and a conformance suite ([BEH-DB-054](../behaviors/07-core-bus-and-adapters.md#beh-db-054-storage-adapter-obligations)); SQLite is the first target; adapters are separate packages.

## Alternatives considered

- **An embedded store in the package.** Rejected: the event must share the application's transaction, so it must live in the application's database.
- **Two-phase commit with a broker.** Rejected: unavailable offline, and heavy.

## Consequences

**Positive**: an envelope exists exactly when its state change does ([INV-DB-001](../invariants.md#inv-db-001-an-envelope-is-in-the-outbox-exactly-when-its-transaction-committed)); publishing outside a transaction does not compile.

**Negative**: engines that cannot share a transaction with the application's tables cannot be used; whether a commit survives a power loss is the adapter's and consumer's.

## References

- Behaviours: [02](../behaviors/02-transactional-outbox.md), [07](../behaviors/07-core-bus-and-adapters.md)
