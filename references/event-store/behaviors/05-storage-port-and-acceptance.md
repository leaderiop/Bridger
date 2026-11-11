# 05 — Storage Port and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-BEH-05                                            |
> | Revision       | 0.10                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-ES-033 and its acceptance check: the adapter passes each durable-bus `onEnd` function the outcome, "committed" only when the commit succeeded (K3, durable-bus CCR-DB-010); BEH-ES-034 unchanged: projections still restart after the `OriginChange`, which now follows every store-swap `apply`; SPEC-AUDIT-07 residual — BEH-ES-034: each write calls `fence` before it passes a payload through the codec; acceptance check 18: a `receive` handler is not retried while a store-swap `apply` is pending (CCR-ES-009)<br>0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-ES-033: the adapter runs the effects registered with durable-bus `StoreTransaction.onEnd` at commit or rollback, on every exit, in registration order, and a fence admission ends through it; BEH-ES-034 restated (H3) (CCR-ES-008)<br>0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-ES-033: `EventStoreAdapter.transaction` provides `StoreTransaction` only, and a REQUIREMENT that the adapter ends every `DurableBus.fence` admission taken on a transaction when it commits or rolls back, on every exit (H2, B1, B3); BEH-ES-034: `fence` takes the transaction handle; BEH-ES-037: the conformance suite covers the admission's end; check 18: retries wait while the incarnation is unrecorded (B2) (CCR-ES-007)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-ES-033: the adapter's `transaction` provides the transaction's own `Scope`; BEH-ES-034: `DurableBus.fence` runs in that scope (H3); BEH-ES-040 check 18: a `receive` handler refused by the freeze does not halt its stream (F4) (CCR-ES-006)<br>0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, M17) — BEH-ES-034: every write of the store calls durable-bus `DurableBus.fence(tx)` inside its own write transaction during a whole-store install instead of following the sliding `outbox-frozen`/`outbox-thawed` feed; check 18 restated (CCR-ES-005)<br>0.5 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-ES-034: what the store does at a re-bootstrap install — every write refused with `OutboxFrozen` during a whole-store freeze, followers read their checkpoint each batch, stop at a whole-store swap and restart from the new store's checkpoints, chain followers wait for the application, positions never translated (P6); BEH-ES-040 check 18 (CCR-ES-004)<br>0.4 (2026-11-09): Specification audit of 2026-11-09 — BEH-ES-034: a commit-time conflict fails the durable-bus inbox transaction with `CommitConflict` (C-12); BEH-ES-037 tests it; BEH-ES-038 defines the members of the `EventStore` contract that grants name, routes every helper through them and states that the contract is local, declared with core `Contract.local` (core CCR-BR-033) (M-05); BEH-ES-040 checks 6, 8, 13, 14 and 16 extended and check 17 added (CCR-ES-003)<br>0.3 (2026-11-08): BEH-ES-033 replaces `hasEvent` by `hasFact`, adds `savepoint` and declared `capabilities` with their obligations; BEH-ES-036 requires savepoints and read-committed visibility on Postgres; BEH-ES-037 and BEH-ES-040 checks extended (R5 review) (CCR-ES-002)<br>0.2 (2026-11-08): BEH-ES-034 cites URS-BR-056 (registered by core CCR-BR-027) (CCR-ES-001)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

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
  // provides StoreTransaction; runs its `onEnd` functions at commit or rollback, given the outcome, which ends every DurableBus.fence admission (below)
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

```
REQUIREMENT: The adapter MUST run every function registered with the
             durable-bus `StoreTransaction.onEnd` of a transaction
             (BEH-DB-009) once that transaction has committed or rolled
             back, on every exit (success, failure, defect, interruption, a
             failed commit), in registration order, and not before, passing
             "committed" only when the commit succeeded and "rolled-back"
             otherwise. A
             `DurableBus.fence` admission (BEH-DB-048) ends through it, so
             it is bound to the transaction, not to a `Scope`, and a write
             admitted before a whole-store freeze can never commit after it
             (durable-bus BEH-DB-054, property 8).
```

## BEH-ES-034: One adapter, one database, one transaction with the outbox

> **Invariant:** [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
> **Satisfies:** [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)
> **Depends on:** [BEH-DB-012](../../durable-bus/behaviors/02-transactional-outbox.md#beh-db-012-the-outboxstore-port), [BEH-DB-054](../../durable-bus/behaviors/07-core-bus-and-adapters.md#beh-db-054-storage-adapter-obligations), [BEH-DB-048](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept-and-the-install-goes-through-the-bus) (re-bootstrap install)
> **Risk:** [RSK-ES-003](../risks.md#rsk-es-003)

```
REQUIREMENT: The `StoreTransaction` provided by `EventStoreAdapter.transaction`
             MUST be accepted by the durable-bus `OutboxStore` and inbox of
             the same deployment, so that events, outbox entries and inbox
             marks are rows of one database written in one engine
             transaction. An engine that cannot do so MUST NOT be offered as
             an adapter for this package.
```

```
REQUIREMENT: An adapter that detects conflicts only at commit
             (`conflictsDetectedAt: "commit"`, BEH-ES-033) MUST report such a
             conflict as `WrongExpectedVersion { actual: "unknown" }` from
             `EventStoreAdapter.transaction` (BEH-ES-004) and as durable-bus
             `CommitConflict` from the durable-bus `InboxStore.transaction`
             of the same deployment (durable-bus BEH-DB-018, BEH-DB-054),
             never as `StoreUnavailable`: the inbox's combinator has no
             event-store error, and the bus retries a `CommitConflict` in a
             new transaction (BEH-DB-021).
```

A re-bootstrap (federation BEH-FD-014) replaces the local state of the store
through durable-bus `OutboxSettlement.install`, either in one transaction
("in-store") or by replacing the database ("whole-store", BEH-DB-048).

```
REQUIREMENT: During a whole-store install, every write of the store —
             `Stream.append`, `Aggregate.handle`, `run`, `record` and
             `recordFact`, and the handlers of `receive` and
             `receiveVerbatim` — MUST fail with durable-bus `OutboxFrozen`
             and write nothing, whether or not its types are published: the
             store being replaced would take the write with it. Each such
             write MUST call durable-bus `DurableBus.fence(tx)` (BEH-DB-048)
             inside its own write transaction, before its first write and
             before it passes any payload through the `PayloadCodec` (whose
             encode may write, keyring BEH-KR-017), passing that transaction (the admission lasts until the
             transaction commits or rolls back, ended through its `onEnd`,
             BEH-ES-033), and fail
             with the fence's `OutboxFrozen`; the `outbox-frozen` and
             `outbox-thawed` reports are a sliding status feed and MUST NOT
             be used to decide. An in-store install refuses no write; the
             engine orders the install transaction with every other
             (above).
```

```
REQUIREMENT: Every follower of the store (projections, BEH-ES-019, and
             chaining, BEH-ES-031) MUST read its checkpoint from the store
             at the start of each batch transaction, never only from
             memory, so that after an in-store install it continues from
             the checkpoint the install left. For a whole-store install the
             store MUST register a durable-bus `onStoreSwap` participant
             whose `prepare` stops every follower, its batch in flight
             rolled back. After the `OriginChange`, projections MUST restart
             from the checkpoints the new store holds, and from the start
             (a rebuild, BEH-ES-021) where it holds none. Chain followers
             MUST NOT restart on their own: each is reported `halted
             { cause: "store-replaced" }` until the application calls
             `EventStore.chain` again, under the same series only when the
             new store holds the chained stream versions unchanged.
```

```
REQUIREMENT: The package MUST NOT translate a checkpoint or a position of
             the replaced store into the new one; positions are per store
             (BEH-ES-008). Documentation MUST state that a snapshot which
             carries checkpoints MUST carry the events and positions they
             refer to, or leave them out so that the projections rebuild,
             and that origins and appends after the install follow
             BEH-ES-007 (the new origin).
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
             seeing the conflicting commit; under `conflictsDetectedAt:
             "commit"`, a commit-time conflict reported as
             `WrongExpectedVersion { actual: "unknown" }` by `transaction`
             and as `CommitConflict` by the inbox transaction (BEH-ES-034);
             `StoreTransaction.onEnd` functions, a `DurableBus.fence`
             admission's among them, run in registration order at commit
             (given "committed"), at rollback, at a failed commit, at a
             defect and at an interruption (given "rolled-back"), and not when a scope opened inside the
             transaction closes (BEH-ES-033); the declared `capabilities`; no
             update or delete path. Passing the suite is evidence about the adapter
             tested, on the engine and settings tested, and about nothing
             else.
```

## BEH-ES-038: The store is a plugin with a versioned contract

> **Core seam:** [26 — Versioned Contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225), [27 — Manifest and Lazy Activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-244, BEH-BR-251), [28 — Plugin Principal and Mandatory Policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-269), [29 — Capability Grants and Call Log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273)
> **Satisfies:** [URS-BR-029](../../core/urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)

```ts
// illustrative — not type-checked
// The members of the local EventStore contract (core BEH-BR-225, `Contract.local`): `register`, `append`, `read`,
// `readAll` and `hasFact` take one request; `savepoint` takes an effect; `checkpoints` and `snapshots` are objects of functions.
interface EventStoreShape {
  readonly register: (r: { event: DurableEvent<any, any>; options?: RegisterOptions<any> }) => Effect.Effect<void, DuplicateEventType>
  readonly append: (r: { stream: string; events: readonly unknown[]; options: AppendOptions }) =>
    Effect.Effect<AppendResult, WrongExpectedVersion | AppendError, StoreTransaction>
  readonly read: (r: { stream: string; options?: ReadOptions }) => Stream.Stream<ReadEvent<unknown>, LoadError>
  readonly readAll: (r: { after: number; limit: number; types?: readonly string[] }) =>      // store-wide, by position (BEH-ES-008)
    Effect.Effect<readonly StoredEvent[], StoreUnavailable | AccessRefused>
  readonly hasFact: (r: { stream: string; factId: string }) => Effect.Effect<boolean, StoreUnavailable, StoreTransaction>
  readonly savepoint: <A, E>(effect: Effect.Effect<A, E, StoreTransaction>) =>            // BEH-ES-013, BEH-ES-033
    Effect.Effect<A, E | StoreUnavailable, StoreTransaction>
  readonly checkpoints: { readonly get: (name: string) => Effect.Effect<Checkpoint | undefined, StoreUnavailable>
                          readonly put: (c: Checkpoint) => Effect.Effect<void, StoreWriteFailed, StoreTransaction> }
  readonly snapshots: { readonly latest: (stream: string, stateVersion: number) => Effect.Effect<StoredSnapshot | undefined, StoreUnavailable>
                        readonly put: (s: StoredSnapshot) => Effect.Effect<void, StoreWriteFailed> }
}
```

| Helper (01–04) | Members it calls |
| -------------- | ---------------- |
| `EventStore.register` | `register` |
| `Stream.append`; `Aggregate.handle`, `Aggregate.run` | `read` (loads), `append` |
| `Stream.read` | `read` |
| `Aggregate.record`, `Aggregate.recordFact`, `EventStore.receive` | `read`, `append`, `hasFact`, `savepoint` |
| `EventStore.receiveVerbatim` | `append`, `hasFact` |
| `Projections.follow`, `Projections.rebuild`, `EventStore.chain` | `readAll`, `checkpoints` |
| `Snapshots.policy` | `snapshots` |

```
REQUIREMENT: The `EventStore` service MUST be declared with core
             `Contract.local` (core BEH-BR-225; version 1.0 in this
             revision) listing the members above, and provided by a plugin, so that dependents state a
             version range and a grant names the members it allows
             (`Grant.of(EventStore, { methods })`, core BEH-BR-273). Every
             helper of files 01–04 MUST reach the store only through these
             members of the `EventStore` service in its environment, as the
             table states, so that a capture narrowed by a grant refuses
             every helper that needs a member the grant omits. Followers
             MUST run in that plugin's scope.
```

```
REQUIREMENT: The contract is local: `append`, `hasFact`, `savepoint` and
             `checkpoints.put` run in the caller's `StoreTransaction`,
             `savepoint` takes an effect, and `snapshots` and `checkpoints`
             are objects of functions; none crosses a host. The contract
             therefore has no member codecs, and every major of
             `EventStore` MUST stay local (core BEH-BR-225). It MUST NOT be
             served to another host, provided from a peer or turned into a
             wire artifact; a boundary companion refuses it on `local`
             (core BEH-BR-232). Documentation MUST say so.
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
             REQ-ES-001–018, traceability §2):
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
                wire annotations; `Unattributed` writes nothing; an append
                given a `context` stores that context's actor and its
                envelope carries the same actor, correlation and annotations;
                without any correlation set, the stored event and its
                envelope share one drawn identifier; an append after a
                whole-store re-bootstrap stores the new origin
                (BEH-ES-007, BEH-ES-028).
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
                transaction, and in `receive`'s inbox transaction by
                durable-bus after `CommitConflict` (BEH-ES-013–015,
                BEH-ES-030, BEH-ES-034).
             9. Followers: checkpoint and writes in one transaction; a
                failing projection halts without advancing (BEH-ES-019,
                BEH-ES-020).
             10. Rebuild and version change (BEH-ES-021, BEH-ES-022).
             11. Snapshots: deleting all snapshots changes no state;
                 `Snapshots.verify` (BEH-ES-023, BEH-ES-024).
             12. Upcaster retention refusal (BEH-ES-025, BEH-ES-027).
             13. Publication: envelope `eventId` equals stored `eventId`;
                 the envelope is on the event-store stream, or on the stream
                 `publish.stream` names; a re-published received fact keeps
                 its `factId` and its origin and gets a new `eventId`, and its
                 envelope carries this host's origin; unpublished types never
                 reach the outbox (BEH-ES-028, BEH-ES-029, BEH-ES-030).
             14. Receipt: inbox mark and recorded fact commit together;
                 causation set; a late fact about a subject shredded at the
                 receiver is recorded with `Shredded` markers; on a host
                 without the subject's key the subscription halts under
                 `receiveOptions` and parks nothing; `receiveVerbatim`
                 under `subscribeEnvelopes` with `receiveVerbatimOptions`
                 records the payload, codec and annotations byte for byte
                 without a key (BEH-ES-030).
             15. Chaining and codec: the chain receives the stored form only
                 and its links do not depend on `position`; a shredded field
                 does not fail a read (BEH-ES-031, BEH-ES-032).
             16. Adapters: the conformance suite on SQLite and on Postgres,
                 including no skip under concurrent commits and a commit-time
                 conflict reported to both combinators (BEH-ES-033–039).
             17. Grants: a capture of `EventStore` granted `read` only
                 refuses `Stream.append` and `Aggregate.record`, one granted
                 `readAll` and `checkpoints` runs a follower, and no helper
                 reaches the adapter except through the members
                 (BEH-ES-038).
             18. Re-bootstrap install: during a whole-store freeze an
                 append of an unpublished type fails with `OutboxFrozen` and
                 writes nothing, decided by `DurableBus.fence` inside its
                 transaction, so a write whose transaction began before the
                 freeze is either committed before it or refused; a
                 `receive` handler refused with `OutboxFrozen` does not halt
                 its stream and is retried after the settlement, not while the
                 incarnation is unrecorded or a store-swap `apply` is pending; followers stop at the swap and projections
                 resume from the new store's checkpoints, or rebuild where
                 there is none; a chain follower stays halted with
                 "store-replaced" until `chain` is called again; after an
                 in-store install a follower continues from the checkpoint
                 the install wrote (BEH-ES-034).
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
