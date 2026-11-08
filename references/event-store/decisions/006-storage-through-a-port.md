# ADR-ES-006: Storage through a port; SQLite and Postgres adapters as obligations

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-006                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Decision names the `factId` constraint and the savepoint capability (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

## Context

Terminals typically run an embedded engine; authorities run a server engine. Both must share one transaction with the durable-bus outbox. The package cannot make an engine keep a commit; that depends on the engine, its settings and the device.

## Decision

- Storage sits behind `EventStoreAdapter`; constraints of the engine enforce one event per stream version, one `eventId` per stream and one `factId` per stream; savepoints are a declared capability.
- SQLite (terminal) and Postgres (authority) adapters are specified as obligations — locking, position order, conflict reporting — and checked by a conformance suite. No adapter is implemented by this specification, and the main entry point exports none.
- The package makes no persistence claim of its own, as the event delivery companion makes none ([ADR-DB-007](../../durable-bus/decisions/007-the-name-is-not-a-claim.md)).

## Alternatives considered

- **Bundle one engine.** Rejected: terminals and authorities need different engines.
- **Leave positions to the engine without a rule.** Rejected: out-of-order commits make followers skip events silently.

## Consequences

**Positive**: one package on several engines; the hard engine-specific rule (position order) is explicit and tested.

**Negative**: each adapter is a separate piece of work and evidence.

**Trade-off accepted**: per-adapter evidence, in exchange for engine choice.

## References

- Behaviours: [BEH-ES-033](../behaviors/05-storage-port-and-acceptance.md#beh-es-033-the-eventstoreadapter-port), [BEH-ES-035](../behaviors/05-storage-port-and-acceptance.md#beh-es-035-sqlite-adapter-obligations-terminal), [BEH-ES-036](../behaviors/05-storage-port-and-acceptance.md#beh-es-036-postgres-adapter-obligations-authority), [BEH-ES-037](../behaviors/05-storage-port-and-acceptance.md#beh-es-037-the-adapter-conformance-suite)
- Invariants: [INV-ES-003](../invariants.md#inv-es-003-stored-events-are-never-rewritten-or-deleted-by-the-package), [INV-ES-004](../invariants.md#inv-es-004-a-projection-never-skips-a-committed-event)
