# 05 — Storage Port and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-BEH-05                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-ES-033 replaces `hasEvent` by `hasFact`, adds `savepoint` and declared `capabilities` with their obligations; BEH-ES-036 requires savepoints and read-committed visibility on Postgres; BEH-ES-037 and BEH-ES-040 checks extended (R5 review) (CCR-ES-002)<br>0.2 (2026-11-08): BEH-ES-034 cites URS-BR-056 (registered by core CCR-BR-027) (CCR-ES-001)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

This file specifies the `EventStoreAdapter` port, the obligations of a SQLite
adapter (for a terminal) and of a Postgres adapter (for an authority), the
conformance suite, the store as a plugin, test fixtures and the acceptance
checks. No adapter is implemented or shipped by this specification. This file
owns BEH-ES-033–040 and uses all eight.

Planned source: `packages/event-store/src/Adapter.ts`,
`packages/event-store/testing/` *(Planned)*.

## BEH-ES-033: The EventStoreAdapter port

> **See:** [ADR-ES-006](../decisions/006-storage-through-a-port.md)
> **Risk:** [RSK-ES-001](../risks.md#rsk-es-001), [RSK-ES-006](../risks.md#rsk-es-006)

```ts
// illustrative — not type-checked
interface EventStoreAdapter {
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R | StoreTransaction>) =>
    Effect.Effect<A, E | StoreUnavailable | WrongExpectedVersion, Exclude<R, StoreTransaction>>
  readonly append: (tx: StoreTransaction["Service"], stream: string, expected: ExpectedVersion,
                    rows: readonly Omit<StoredEvent, "streamVersion" | "position">[]) =>
    Effect.Effect<readonly StoredEvent[], WrongExpectedVersion | StoreWriteFailed>
  readonly readStream: (stream: string, options: ReadOptions) => Stream.Stream<StoredEvent, StoreUnavailable>
  readonly readAll: (q: { after: number; limit: number; types?: readonly string[] }) =>
    Effect.Effect<readonly StoredEvent[], StoreUnavailable>          // BEH-ES-008 order rule
  readonly hasFact: (tx: StoreTransaction["Service"], stream: string, factId: string) => Effect.Effect<boolean, StoreUnavailable>   // BEH-ES-015
  // runs `effect` under a savepoint of `tx`; a failure rolls back to the savepoint only (BEH-ES-013)
  readonly savepoint: <A, E>(tx: StoreTransaction["Service"], effect: Effect.Effect<A, E>) => Effect.Effect<A, E | StoreUnavailable>
  readonly capabilities: { readonly savepoints: boolean; readonly conflictsDetectedAt: "insert" | "commit" }
  readonly checkpoint: { get: (name: string) => Effect.Effect<Checkpoint | undefined, StoreUnavailable>;
                         put: (tx: StoreTransaction["Service"], c: Checkpoint) => Effect.Effect<void, StoreWriteFailed> }
  readonly snapshot: { latest: (stream: string, stateVersion: number) => Effect.Effect<StoredSnapshot | undefined, StoreUnavailable>;
                       put: (s: StoredSnapshot) => Effect.Effect<void, StoreWriteFailed> }
  readonly lowestStoredVersion: (type: string) => Effect.Effect<number | undefined, StoreUnavailable>
}
```

```
REQUIREMENT: An adapter MUST enforce one event per (stream, streamVersion),
             one `eventId` per stream and one `factId` per stream with
             constraints of the engine,
             so that the atomicity of BEH-ES-003 does not rest on the
             package's in-memory state. An adapter MUST NOT update or delete
             a stored event row.
```

```
REQUIREMENT: `append` MUST either take a lock on the stream (or the store)
             for the rest of the transaction or detect the conflict at
             insert, and MUST report a conflict as `WrongExpectedVersion`.
             An adapter that detects conflicts only at commit MUST declare
             `conflictsDetectedAt: "commit"`.
```

```
REQUIREMENT: An adapter that declares `savepoints: true` MUST run `savepoint`
             so that a failure inside it, including a constraint violation
             that the engine would otherwise treat as fatal for the
             transaction, rolls back only the writes made inside it and
             leaves the transaction usable, and so that a read made after
             that rollback sees every transaction that committed before the
             read (the visibility `record`'s retry needs, BEH-ES-013). An
             adapter that cannot MUST declare `savepoints: false`.
```

## BEH-ES-034: One adapter, one database, one transaction with the outbox

> **Invariant:** [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
> **Satisfies:** [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)
> **Depends on:** [BEH-DB-012](../../durable-bus/behaviors/02-transactional-outbox.md#beh-db-012-the-outboxstore-port), [BEH-DB-054](../../durable-bus/behaviors/07-core-bus-and-adapters.md#beh-db-054-storage-adapter-obligations)
> **Risk:** [RSK-ES-003](../risks.md#rsk-es-003)

```
REQUIREMENT: The `StoreTransaction` provided by `EventStoreAdapter.transaction`
             MUST be accepted by the durable-bus `OutboxStore` and inbox of
             the same deployment, so that events, outbox entries and inbox
             marks are rows of one database written in one engine
             transaction. An engine that cannot do so MUST NOT be offered as
             an adapter for this package.
```

## BEH-ES-035: SQLite adapter obligations (terminal)

> **See:** [ADR-ES-006](../decisions/006-storage-through-a-port.md)
> **Depends on:** [BEH-DB-055](../../durable-bus/behaviors/07-core-bus-and-adapters.md#beh-db-055-sqlite-is-the-first-adapter-target)

```
REQUIREMENT: A SQLite adapter MUST open write transactions so that the
             write lock is taken at the start (BEGIN IMMEDIATE or an
             equivalent), so that appends serialize and BEH-ES-008 holds
             with `position` as a monotonically assigned integer key. It
             MUST document the journal and synchronous settings it requires
             and state that the persistence of an acknowledged commit under
             power loss depends on those settings and the device — an
             obligation of the consumer's configuration, not a property of
             the package.
```

## BEH-ES-036: Postgres adapter obligations (authority)

> **See:** [ADR-ES-006](../decisions/006-storage-through-a-port.md)
> **Risk:** [RSK-ES-002](../risks.md#rsk-es-002)

```
REQUIREMENT: A Postgres adapter MUST meet BEH-ES-008 although concurrent
             transactions allocate sequence values out of commit order: it
             MUST either serialize appends for the positions it assigns (for
             example with a transaction-scoped lock) or make `readAll` return
             only positions below the lowest position held by a transaction
             still in progress. It MUST document which, and the throughput
             consequence.
```

```
REQUIREMENT: A Postgres adapter MUST report a unique-constraint conflict on
             (stream, streamVersion) as `WrongExpectedVersion`, and MUST NOT
             require the serializable isolation level for correctness of
             the expected-version check.
```

```
REQUIREMENT: A Postgres adapter MUST implement `savepoint` with SAVEPOINT and
             ROLLBACK TO SAVEPOINT, and MUST run transactions that call
             `record` at the read-committed level (or take a
             transaction-scoped lock on the stream before `record`'s read),
             so that the re-read after a rolled-back conflict sees the
             conflicting commit. Without a savepoint a unique-constraint
             violation aborts the whole Postgres transaction, and no
             in-transaction retry is possible.
```

## BEH-ES-037: The adapter conformance suite

> **Risk:** [RSK-ES-002](../risks.md#rsk-es-002), [RSK-ES-006](../risks.md#rsk-es-006)

```
REQUIREMENT: The testing entry point MUST export `EventStoreConformance`, a
             suite any adapter runs against a real engine, covering:
             concurrent appends with one expected version (one commits);
             rollback leaving no event, outbox entry or checkpoint; position
             order under concurrent commits with a follower running (no skip,
             BEH-ES-008); `hasFact` inside a transaction; a conflict inside
             `savepoint` leaving the transaction usable and the re-read
             seeing the conflicting commit; the declared `capabilities`; no
             update or delete path. Passing the suite is evidence about the adapter
             tested, on the engine and settings tested, and about nothing
             else.
```

## BEH-ES-038: The store is a plugin with a versioned contract

> **Core seam:** [26 — Versioned Contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225), [27 — Manifest and Lazy Activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-244, BEH-BR-251), [28 — Plugin Principal and Mandatory Policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-269), [29 — Capability Grants and Call Log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273)
> **Satisfies:** [URS-BR-029](../../core/urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)

```
REQUIREMENT: The `EventStore` service MUST be declared with core
             `Contract.make` (version 1.0 in this revision) and provided by a
             plugin, so that dependents state a version range and grants
             apply per method (BEH-BR-273). Followers MUST run in that
             plugin's scope.
```

```
REQUIREMENT: A plugin declared with `Plugin.lazy` (core BEH-BR-244) that
             runs a follower or a chain MUST resume from its stored
             checkpoint when it wakes. Documentation MUST state that core
             holds only the one event that woke a plugin (BEH-BR-251) and
             that a follower never relies on it: every committed event is
             read from the store by position.
```

```
REQUIREMENT: When the store serves reads to plugins other than the writer
             of a stream, it MUST consult `AccessPolicy.ask` (BEH-BR-269)
             with mode "subscribe" for followers and refuse with
             `AccessRefused` as core specifies.
```

## BEH-ES-039: Test fixtures

> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-209, BEH-BR-210)

```
REQUIREMENT: The testing entry point MUST export `memoryEventStore` (an
             in-memory adapter that also provides a durable-bus test store
             sharing its transaction) and `Deciders.check(decider, given,
             when, then)` for given/when/then tests of a decider. With core's
             test clock and identifier fixtures, two runs MUST produce equal
             stored events. The main entry point MUST NOT export an adapter.
```

## BEH-ES-040: Required acceptance checks

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following (planned acceptance scenarios
             REQ-ES-001–016, traceability §2):
             1. Registration: unregistered and duplicate types refused
                (BEH-ES-001).
             2. Stored form: fields, Clock and IdGenerator sources, no
                decoded payload (BEH-ES-002).
             3. Expected version: each `ExpectedVersion` form; two
                concurrent appends expecting n, one commits, the other
                fails `WrongExpectedVersion` and writes nothing (BEH-ES-003,
                BEH-ES-004).
             4. Transaction: rollback leaves no event, outbox entry,
                inline projection row or sequence number (BEH-ES-005,
                BEH-ES-018, BEH-ES-028).
             5. Reads: upcast then decode; an unknown version stops the
                read (BEH-ES-006, BEH-ES-026).
             6. Attribution: actor, `CurrentCorrelation`, `onBehalfOf`,
                wire annotations; `Unattributed` writes nothing (BEH-ES-007).
             7. Deciders: `decide` without services; `handle` never
                retries; `run` re-reads and re-decides on conflict; a
                refused command appends nothing (BEH-ES-009–012, BEH-ES-016).
             8. Facts: `record` has no rule error; a violation is appended
                as an event; a redelivered fact, and the same fact received
                by a second path with another envelope `eventId`, is
                "already-recorded"; a concurrent writer makes `record` retry
                under a savepoint and succeed, and past `retries` fail with
                `StoreContention` with the caller's other writes intact; a
                commit-time conflict is retried by `recordFact` in a new
                transaction (BEH-ES-013–015).
             9. Followers: checkpoint and writes in one transaction; a
                failing projection halts without advancing (BEH-ES-019,
                BEH-ES-020).
             10. Rebuild and version change (BEH-ES-021, BEH-ES-022).
             11. Snapshots: deleting all snapshots changes no state;
                 `Snapshots.verify` (BEH-ES-023, BEH-ES-024).
             12. Upcaster retention refusal (BEH-ES-025, BEH-ES-027).
             13. Publication: envelope `eventId` equals stored `eventId`;
                 a re-published received fact keeps its `factId` and gets a
                 new `eventId`; unpublished types never reach the outbox
                 (BEH-ES-028, BEH-ES-029).
             14. Receipt: inbox mark and recorded fact commit together;
                 causation set; a late fact about a subject shredded at the
                 receiver is recorded with `Shredded` markers; on a host
                 without the subject's key the subscription halts under
                 `receiveOptions` and parks nothing; `receiveVerbatim`
                 records the payload and codec byte for byte without a key
                 (BEH-ES-030).
             15. Chaining and codec: the chain receives the stored form only
                 and its links do not depend on `position`; a shredded field
                 does not fail a read (BEH-ES-031, BEH-ES-032).
             16. Adapters: the conformance suite on SQLite and on Postgres,
                 including no skip under concurrent commits (BEH-ES-033–039).
```

**Settled here.** (1) Constraints of the engine, not package memory, enforce
stream versions (BEH-ES-033). (2) One transaction spans events, outbox and
inbox (BEH-ES-034). (3) SQLite and Postgres obligations are stated, not
implemented (BEH-ES-035, BEH-ES-036). (4) Conformance passes are evidence only
for the adapter tested (BEH-ES-037).

**Open.** (1) Other engines (an embedded key-value store). (2) Archival of old
streams to cold storage without deleting from the store's logical view.

---

_Previous: [04 — Versions, publication and chaining](./04-versions-publication-and-chaining.md)_ · _Next: [Invariants](../invariants.md)_
