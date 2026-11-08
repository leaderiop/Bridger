# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-INV                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): INV-ES-006 states the savepoint retry, the transaction owner's retry of a commit-time conflict, and that a received fact is halted on, never parked (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

Properties of `@bridger/event-store` that hold for every execution. As in the
core ([invariants](../core/invariants.md)), each names the mechanism that is
to enforce it; every **Source** and **Verification** is *(Planned)*, nothing
here is implemented, and no invariant may be cited as evidence until a test
that checks it has been written and executed
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-ES-001: Stream versions are contiguous from 1, one event per version

The committed events of a stream carry stream versions 1, 2, … n, each once.

**Source**: `packages/event-store/src/Stream.ts` *(Planned)* — the expected
version check; the adapter's unique constraint on (stream, streamVersion).

**Implication**: two writers that read the same version cannot both commit;
a lost update shows up as `WrongExpectedVersion`.

**Verification** *(Planned)*: conformance test with concurrent appends;
property test over generated append and rollback sequences.

**Related**: [BEH-ES-003](behaviors/01-streams-and-append.md#beh-es-003-streamappend-takes-an-expected-version), [BEH-ES-004](behaviors/01-streams-and-append.md#beh-es-004-wrongexpectedversion-is-a-typed-refusal-that-writes-nothing), [ADR-ES-004](decisions/004-optimistic-concurrency-per-stream.md).

---

## INV-ES-002: An append and its outbox entries commit together or not at all

The events of an append, their outbox entries, inline projection writes and
every other write made with the same `StoreTransaction` are all visible after
commit, or none of them is.

**Source**: `packages/event-store/src/Publish.ts` *(Planned)* — `publish` and
inline `apply` called with the append's transaction; no publication after
commit.

**Implication**: no event is published without being stored and none stored
without being published, when its type is published.

**Verification** *(Planned)*: fault injection at each write of the
transaction, asserting all-or-nothing across the four tables.

**Related**: [BEH-ES-005](behaviors/01-streams-and-append.md#beh-es-005-append-runs-inside-the-callers-storetransaction), [BEH-ES-018](behaviors/03-projections-and-snapshots.md#beh-es-018-inline-projections-commit-with-the-append), [BEH-ES-028](behaviors/04-versions-publication-and-chaining.md#beh-es-028-publication-writes-the-outbox-in-the-appends-transaction), [BEH-ES-034](behaviors/05-storage-port-and-acceptance.md#beh-es-034-one-adapter-one-database-one-transaction-with-the-outbox), [ADR-ES-003](decisions/003-append-in-the-callers-transaction-with-the-outbox.md).

---

## INV-ES-003: Stored events are never rewritten or deleted by the package

No path of the package or of a conforming adapter updates or deletes a stored
event row.

**Source**: `packages/event-store/src/Adapter.ts` *(Planned)* — the port has
no update or delete member; upcasting happens on read.

**Implication**: history read today is the history read tomorrow, apart from
fields a codec can no longer decrypt; chains over the stored form keep
verifying.

**Verification** *(Planned)*: conformance check that the adapter offers no
mutation path; byte comparison of stored rows before and after upcaster and
codec changes.

**Related**: [BEH-ES-002](behaviors/01-streams-and-append.md#beh-es-002-the-stored-event), [BEH-ES-025](behaviors/04-versions-publication-and-chaining.md#beh-es-025-event-versions-follow-durable-bus-additive-changes-follow-core-26), [BEH-ES-033](behaviors/05-storage-port-and-acceptance.md#beh-es-033-the-eventstoreadapter-port).

---

## INV-ES-004: A projection never skips a committed event

For every projection, every committed matching event at or below its
checkpoint has been applied in a transaction that committed that checkpoint.

**Source**: `packages/event-store/src/Projection.ts` *(Planned)* — checkpoint
written with the batch; halt on failure; the adapter's position rule.

**Implication**: a read model is behind, halted or rebuilding — never silently
wrong by omission.

**Verification** *(Planned)*: conformance test with concurrent commits and a
running follower; fault injection in `apply`.

**Related**: [BEH-ES-008](behaviors/01-streams-and-append.md#beh-es-008-the-store-wide-position-never-goes-back-for-a-reader), [BEH-ES-019](behaviors/03-projections-and-snapshots.md#beh-es-019-async-projections-follow-positions-with-a-checkpoint-in-the-same-transaction), [BEH-ES-020](behaviors/03-projections-and-snapshots.md#beh-es-020-a-failing-projection-halts-and-reports--it-never-skips), [BEH-ES-021](behaviors/03-projections-and-snapshots.md#beh-es-021-rebuild-resets-and-replays).

---

## INV-ES-005: A snapshot is a cache

The state the package returns for a stream equals the fold of `evolve` over
all its events from `initial`, whether or not a snapshot was used.

**Source**: `packages/event-store/src/Snapshot.ts` *(Planned)* — snapshots
written only from folded state and selected only by `stateVersion`.

**Implication**: removing or corrupting snapshots costs time, not correctness
(a corrupt snapshot that still decodes is the exception, found by
`Snapshots.verify`).

**Verification** *(Planned)*: property test comparing loads with and
without snapshots.

**Related**: [BEH-ES-010](behaviors/02-decide-and-evolve.md#beh-es-010-evolve-is-pure-and-total), [BEH-ES-023](behaviors/03-projections-and-snapshots.md#beh-es-023-snapshots--policy-write-and-load), [BEH-ES-024](behaviors/03-projections-and-snapshots.md#beh-es-024-a-snapshot-is-a-cache-never-a-source-of-truth).

---

## INV-ES-006: Recording a fact cannot fail for a rule

`Aggregate.record` has no error for a broken rule or a version conflict; it
fails only for operational causes (store unavailable, `StoreContention` past
its retries, encoding). A conflict detected only at commit is raised by the
transaction combinator to the transaction's owner; the owners the package
provides (`Aggregate.recordFact`, and durable-bus for `EventStore.receive`)
retry it in a new transaction. A received fact is never refused, parked or
dropped: it is recorded, retried, or its subscription halts (BEH-ES-030).

**Source**: `packages/event-store/src/Aggregate.ts` *(Planned)* — the type of
`FactDecider.accept` has no error channel; conflicts roll back to a savepoint, re-read and re-accept.

**Implication**: a fact that reaches a host is recorded or retried, never
refused; rule violations become events for review.

**Verification** *(Planned)*: type-level test; scenario with a violating fact,
with a concurrent writer (insert-time and commit-time), with a fact about a
shredded subject, and with a receiver that lacks the subject's key.

**Related**: [BEH-ES-013](behaviors/02-decide-and-evolve.md#beh-es-013-facts-are-recorded-through-aggregaterecord-which-cannot-reject), [BEH-ES-015](behaviors/02-decide-and-evolve.md#beh-es-015-recording-a-fact-is-idempotent-by-its-fact-identifier), [BEH-ES-030](behaviors/04-versions-publication-and-chaining.md#beh-es-030-received-envelopes-are-recorded-as-facts-in-the-inboxs-transaction), [ADR-ES-005](decisions/005-offline-facts-are-recorded-never-rejected.md).

---

_Previous: [05 — Storage port and acceptance](./behaviors/05-storage-port-and-acceptance.md)_ · _Next: [Risks](./risks.md)_
