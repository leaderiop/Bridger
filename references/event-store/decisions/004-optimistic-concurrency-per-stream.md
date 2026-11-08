# ADR-ES-004: Optimistic concurrency per stream, with expected versions

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-004                                           |
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

Two writers that decide against the same state and both append produce a lost update. Pessimistic locks across a read-decide-append cycle hold database locks during application code; a version check at the append does not.

## Decision

- Every append states an expected version; there is no default.
- A mismatch is `WrongExpectedVersion`, a typed refusal that writes nothing. `append` and `Aggregate.handle` never retry; `Aggregate.run` retries whole transactions after re-reading and re-deciding.
- The consistency boundary is one stream. Rules across streams are the application's.

## Alternatives considered

- **Last writer wins.** Rejected: silent lost updates.
- **Cross-stream expected versions.** Rejected for this revision: it widens the lock scope on every engine; several appends in one transaction already give atomicity where the engine allows it.

## Consequences

**Positive**: conflicts are visible and typed; locks are held only during the write.

**Negative**: hot streams retry under contention.

**Trade-off accepted**: retries under contention, in exchange for no lost update.

## References

- Behaviours: [BEH-ES-003](../behaviors/01-streams-and-append.md#beh-es-003-streamappend-takes-an-expected-version), [BEH-ES-004](../behaviors/01-streams-and-append.md#beh-es-004-wrongexpectedversion-is-a-typed-refusal-that-writes-nothing), [BEH-ES-011](../behaviors/02-decide-and-evolve.md#beh-es-011-aggregatehandle-runs-inside-the-callers-transaction), [BEH-ES-012](../behaviors/02-decide-and-evolve.md#beh-es-012-aggregaterun-retries-the-whole-transaction-on-a-conflict)
- Invariant: [INV-ES-001](../invariants.md#inv-es-001-stream-versions-are-contiguous-from-1-one-event-per-version)
