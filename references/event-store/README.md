# Bridger Event Store — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-00                                                |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index (companion)          |
> | Change History | 0.13 (2026-11-11): CCR-ES-010 registered (specification audit of 2026-11-11, round 8: H3, B3; event-delivery dependency row: `whenReadable`)<br>0.12 (2026-11-11): CCR-ES-009 registered (specification audit of 2026-11-11, round 7: K3; H4 checked; event-delivery dependency row: `onEnd` given the outcome) ; extended with the round's residuals (SPEC-AUDIT-07 residual: `apply-pending`; writes fence before encoding) (CCR-ES-009)<br>0.11 (2026-11-11): CCR-ES-008 registered (specification audit of 2026-11-11, round 6: H3; event-delivery dependency row names `StoreTransaction.onEnd`) (CCR-ES-008)<br>0.10 (2026-11-11): CCR-ES-007 registered (specification audit of 2026-11-11, round 5: H2, B1, B2, B3, PL13, PL14; event-delivery dependency row names the write fence and the pause) (CCR-ES-007)<br>0.9 (2026-11-10): CCR-ES-006 registered (specification audit of 2026-11-10, round 4: H3, F4) (CCR-ES-006)<br>0.8 (2026-11-10): CCR-ES-005 registered (specification audit of 2026-11-10, round 3: M17) (CCR-ES-005)<br>0.7 (2026-11-10): CCR-ES-004 registered (specification audit of 2026-11-09, round 2: P6, P4); durable-bus dependency row names the re-bootstrap install (CCR-ES-004)<br>0.6 (2026-11-09): CCR-ES-003 registered (specification audit of 2026-11-09: F-05, C-11, C-12, C-18, C-20, U-10, M-05); core 26 dependency row restated; open question 3 closed; the core seam for a local contract, provided by core CCR-BR-033, noted (CCR-ES-003)<br>0.5 (2026-11-08): CCR-ES-002 extended (round-2 integration: `publish` errors in `AppendError`) (CCR-ES-002)<br>0.4 (2026-11-08): CCR-ES-002 registered (round-2 agent review); open question 3 names the durable-bus subscription options requested (CCR-ES-002)<br>0.3 (2026-11-08): CCR-ES-001 extended: `ES` infix registered by core, URS-BR-056 and 059 cited (CCR-ES-001)<br>0.2 (2026-11-08): `PayloadCodec` dependency cites durable-bus BEH-DB-008; open question 1 updated after the alignment of BEH-ES-002, BEH-ES-006 and BEH-ES-032 (CCR-ES-001, revision bump)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/event-store`, an optional companion
package of `@bridger/core`. It keeps **event-sourced streams** for local-first
plugin systems: append-only streams with expected versions, a
`decide`/`evolve` loop over them, projections with checkpoints and rebuild,
snapshots, event versions with upcasters, and publication of stored events
through the event delivery companion (`@bridger/durable-bus`) by an outbox
written in the same storage transaction as the append. It owns no storage:
the engine sits behind a storage port, for which a SQLite adapter (for a
terminal) and a Postgres adapter (for an authority) are specified as
obligations only. It depends on `@bridger/core` and `@bridger/durable-bus`;
neither depends on it. It covers item 26 of the Bridger recheck of
2026-11-08.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rules of the core specification apply unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)): this
specification is not evidence that the package behaves as described, and a
requirement becomes evidence only when a test that exercises it has run and
passed.

## The honest-claims rule

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). In particular:

- The package owns **no** storage. Whether a stored event survives a crash, a
  power loss or a disk failure depends on the storage adapter, the engine's
  configuration and the consumer's backups; this specification states the
  adapter's obligations and makes no persistence claim of its own
  ([ADR-ES-006](./decisions/006-storage-through-a-port.md)).
- It makes **no** exactly-once claim. Publication is the event delivery
  companion's at-least-once delivery; a projection's effect happens once only
  when the projection writes it in the same transaction as its checkpoint
  ([BEH-ES-019](./behaviors/03-projections-and-snapshots.md#beh-es-019-async-projections-follow-positions-with-a-checkpoint-in-the-same-transaction)).
- It makes **no** consistency claim across streams. An expected version
  protects one stream; two streams written in one transaction commit together
  only because the engine's transaction says so.
- It is **not** a conflict-free replicated data type and merges nothing.
  Offline operation is supported by a pattern — facts recorded as they
  happened, rule violations emitted as events — that the application chooses
  and the package makes easy; it does not enforce the pattern
  ([ADR-ES-005](./decisions/005-offline-facts-are-recorded-never-rejected.md)).
- It makes **no** claim that a stored stream cannot be altered. Chaining the
  stored events is the audit-chain companion's business, through its generic
  `ChainSink<R>`, within that companion's stated limits
  ([BEH-ES-031](./behaviors/04-versions-publication-and-chaining.md#beh-es-031-optional-chaining-through-chainsinkr)).
- Domain events, aggregates, projection schemas and their meaning are the
  **application's** ([ADR-ES-001](./decisions/001-the-application-keeps-the-domain.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example, limits |
| 2 | [Behaviours](./behaviors/01-streams-and-append.md) | What the package must do, as `BEH-ES` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-the-application-keeps-the-domain.md) | Why, as `ADR-ES` records |
| 5 | [Risks](./risks.md) | Hazards the package could introduce, scored with the core method |
| 6 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ, and risk notes |

Readers new to Bridger should first read the event delivery companion's
[overview](../durable-bus/overview.md) and its
[02 — Transactional outbox](../durable-bus/behaviors/02-transactional-outbox.md),
then core [22 — Attributable Operations](../core/behaviors/22-attributable-operations.md).

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Streams and append](./behaviors/01-streams-and-append.md) | BEH-ES-001–008 |
| 02 | [Decide and evolve](./behaviors/02-decide-and-evolve.md) | BEH-ES-009–016 |
| 03 | [Projections and snapshots](./behaviors/03-projections-and-snapshots.md) | BEH-ES-017–024 |
| 04 | [Versions, publication and chaining](./behaviors/04-versions-publication-and-chaining.md) | BEH-ES-025–032 |
| 05 | [Storage port and acceptance](./behaviors/05-storage-port-and-acceptance.md) | BEH-ES-033–040 |

### Decisions

| ID | Title |
| -- | ----- |
| [ADR-ES-001](./decisions/001-the-application-keeps-the-domain.md) | The application keeps domain events, aggregates and projection schemas |
| [ADR-ES-002](./decisions/002-one-event-declaration-for-storage-and-delivery.md) | One event declaration for storage and delivery: `DurableEvent` |
| [ADR-ES-003](./decisions/003-append-in-the-callers-transaction-with-the-outbox.md) | Append runs in the caller's transaction, with the outbox in the same transaction |
| [ADR-ES-004](./decisions/004-optimistic-concurrency-per-stream.md) | Optimistic concurrency per stream, with expected versions |
| [ADR-ES-005](./decisions/005-offline-facts-are-recorded-never-rejected.md) | Offline facts are recorded, never rejected; rule violations are events |
| [ADR-ES-006](./decisions/006-storage-through-a-port.md) | Storage through a port; SQLite and Postgres adapters as obligations |
| [ADR-ES-007](./decisions/007-chaining-and-encryption-are-composed.md) | Chaining and field encryption are composed from other companions, not built in |

## Dependencies on core and on other companions

| Document | What this package uses | Owner |
| -------- | ---------------------- | ----- |
| [22 — Attributable Operations](../core/behaviors/22-attributable-operations.md) | `Actor`, `OperationContext` (BEH-BR-185), the resolution of a call's context and `CurrentCorrelation` (BEH-BR-187) for the stored event's actor and correlation | Core (CCR-BR-026 for `CurrentCorrelation`) |
| [23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md) | Nothing is written to the core trail; stored events are not audit records (BEH-BR-207, BEH-BR-208), and the package says so | Core (existing) |
| [24 — Time, Identifiers and Sequence](../core/behaviors/24-time-ids-and-sequence.md) | `Clock` (BEH-BR-209) and `IdGenerator` (BEH-BR-210) for `recordedAt` and `eventId`; no ambient time (BEH-BR-211) | Core (existing) |
| [26 — Versioned Contracts](../core/behaviors/26-versioned-contracts.md) | The `EventStore` service is a local contract with named members (BEH-BR-225; BEH-ES-038). Event payloads do not follow the add-only rule of a contract major (BEH-BR-230, BEH-BR-231): every payload change raises the event's version (BEH-ES-025) | Core (CCR-BR-017) |
| [27 — Manifest and Lazy Activation](../core/behaviors/27-manifest-and-lazy-activation.md) | A lazily activated store plugin resumes followers from checkpoints and never relies on the one held event (BEH-BR-244, BEH-BR-251) | Core (CCR-BR-017, CCR-BR-024) |
| [28 — Plugin Principal and Mandatory Policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) | `onBehalfOf` of the calling plugin (BEH-BR-259); `AccessPolicy.ask` for reads and subscriptions by other plugins (BEH-BR-269) | Core (CCR-BR-018, CCR-BR-026) |
| [29 — Capability Grants and Call Log](../core/behaviors/29-capability-grants-and-call-log.md) | `PrincipalRef.encode` for the stored principal string (BEH-BR-280); grants on the `EventStore` service (BEH-BR-273) | Core (CCR-BR-018, CCR-BR-026) |
| [30 — Operation Context Annotations](../core/behaviors/30-operation-context-annotations.md) | `Annotations.encode` and the "wire" flow for annotations carried on stored events (BEH-BR-289, BEH-BR-296) | Core (CCR-BR-018) |
| [Event delivery companion](../durable-bus/README.md) | `DurableEvent` with versions and upcasters (BEH-DB-001, BEH-DB-025–030), `StoreTransaction` and `publish` with its stream and causation options (BEH-DB-003, BEH-DB-009), the origin, its incarnation and `DurableBus.origin` (BEH-DB-004), the inbox, its `CommitConflict` and both subscription forms (BEH-DB-018, BEH-DB-020, BEH-DB-021, CCR-DB-004), the freeze and store-swap participants of a re-bootstrap install (BEH-DB-048, CCR-DB-005), the write fence `DurableBus.fence(tx)` checked inside each write transaction and admitted until that transaction commits or rolls back, ended through `StoreTransaction.onEnd`, whose functions the adapter passes the outcome (BEH-DB-009, BEH-DB-048, BEH-DB-054 property 8, CCR-DB-008, CCR-DB-009, CCR-DB-010), the pause of subscriptions during a whole-store settlement and while the raised incarnation is unrecorded, with `OutboxFrozen` not counted (BEH-DB-021, BEH-DB-048, CCR-DB-007, CCR-DB-008), the read gate `DurableBus.whenReadable` that `read` and `readAll` await (BEH-DB-048, CCR-DB-011), the `PayloadCodec` port ([BEH-DB-008](../durable-bus/behaviors/01-events-and-envelope.md#beh-db-008-a-payloadcodec-encodes-payloads-and-records-carry-no-personal-data), CCR-DB-003) | Companion DB |
| [Audit-chain companion](../audit-chain/README.md) | The generic `ChainSink<R>` with a series id that is not the host id (audit-chain revision 0.3, CCR-AC-003) | Companion AC |

The package is a plugin with a service; core does not know it exists. The
local `EventStore` contract is declared with core `Contract.local`
(BEH-BR-225, added by core CCR-BR-033 at the request of CCR-ES-003), so that
it carries no codecs and a boundary companion refuses it (BEH-BR-232).

## Open questions

1. **`PayloadCodec` — aligned.** BEH-ES-002, BEH-ES-006 and BEH-ES-032 follow
   the `PayloadCodec` of durable-bus BEH-DB-008 as written (revision 0.2): the
   store keeps the codec id, a published event's payload is encoded once by
   the bus, and a `PayloadUnreadable` halts a read rather than skipping it.
   Still open: whether a payload made unreadable on purpose may let a
   projection pass the event (BEH-ES-032 Open 1). `ChainSink<R>` is aligned with
   audit-chain BEH-AC-025 (CCR-AC-003): one sink per stream, `seq` = stream
   version (BEH-ES-031).
2. **Cross-store reads.** A projection that reads several stores (a terminal's
   and an authority's) is the application's; whether the package should
   offer a merged position is open.
3. **Delivery-companion subscription options — closed.** The delivery
   companion defines both (durable-bus BEH-DB-020, CCR-DB-003):
   `onUnreadable: "halt"` for `subscribe`, which `receive` uses with
   `receiveOptions`, and `subscribeEnvelopes`, which `receiveVerbatim` uses
   with `receiveVerbatimOptions` (BEH-ES-030, CCR-ES-003).
4. **Copy-transform migration.** Stored events are never rewritten
   (INV-ES-003); a migration that copies a store into a new one with
   transformed events is not specified here.

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-ES-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-ES-NNN` | Runtime invariant |
| `ADR-ES-NNN` | Architecture decision |
| `REQ-ES-NNN` | Acceptance scenario (planned) |
| `RSK-ES-NNN` | Risk of this package ([risks](./risks.md)) |
| `CCR-ES-NNN` | Change control record of this package |
| `BRIDGER-ES-*` | Document ID |

The rules of the core [identifier scheme](../core/process/requirement-id-scheme.md)
apply, with infix `ES`, registered in core's change control (CCR-BR-027;
core identifier scheme).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-ES-001 | 2026-11-08 | Initial draft: event-sourced streams with `Stream.append(id, events, { expectedVersion })` and `WrongExpectedVersion`; the `decide`/`evolve` loop (`Aggregate.handle`, `Aggregate.run`) and the offline-fact pattern (`Aggregate.record`, rule violations emitted as events, never thrown); projections with checkpoints, inline and async modes, halting on failure, and rebuild; snapshots as a cache; event versions and upcasters through durable-bus `DurableEvent`, additive changes per core 26; publication through the durable-bus outbox in the append's transaction; optional chaining through audit-chain `ChainSink<R>` over the stored, ciphertext-bearing form; the `EventStoreAdapter` port with SQLite and Postgres obligations and a conformance suite. Recheck item 26 of 2026-11-08.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-001–040, INV-ES-001–006, ADR-ES-001–007, REQ-ES-001–016 and RSK-ES-001–006 added; no core identifier changed (proposed core amendments are recorded separately for core's change control). (2) Risk: six package risks scored with the core method; two core risks proposed for the core register; no core score changed. (3) GxP impact: indirect — stored events may hold GMP-relevant business records of the application; the package changes no core record, gate or legality row and claims no audit, persistence or tamper-evidence property. (4) Revalidation: no version has been released or qualified (implementation absent); none. (5) Compatibility: no core public type changes; depends on durable-bus `DurableEvent`, `StoreTransaction` and `publish` as specified, and on `PayloadCodec` (CCR-DB-003) and `ChainSink<R>` (CCR-AC-003) as they are being specified. Extended after integration: the `ES` infix and URS-BR-056 and URS-BR-059 are registered by core CCR-BR-027; BEH-ES-001, 002, 003, 005, 028 and 034 cite URS-BR-056 and BEH-ES-032 cites URS-BR-059. |
| CCR-ES-002 | 2026-11-08 | Resolutions of the round-2 agent review (R5-01, R5-02, R5-04, R5-05, R5-13–R5-16): `Aggregate.record` retries under an adapter `savepoint` and fails with `StoreContention`; a commit-time conflict belongs to the transaction's owner, and the new `Aggregate.recordFact` and durable-bus (for `receive`) retry it in a new transaction; Postgres obligations for savepoints and read-committed visibility; the fact identity is a separate `StoredEvent.factId` (unique per stream, `hasFact`), and `eventId` is always this store's own id; `receive` requires halting subscription options, records `Shredded` markers without a key and states the key precondition; new `receiveVerbatim` records a received payload byte for byte; `AppendError` (with `PayloadEncodeFailed`) and `LoadError` defined once; the chain canonicaliser omits `position` and requires JSON payloads; the worked example's `factId`; the ADR-ES-002 link to BEH-DB-028.<br>**Impact (PROC-03 §3).** (1) Identifiers: no identifier added or withdrawn; BEH-ES-002, 003, 006, 013, 015, 028, 030–033, 036, 037, 040, INV-ES-006, ADR-ES-002, 005, 006 and RSK-ES-004 revised. (2) Risk: RSK-ES-004 controls extended; no score changed. (3) GxP impact: indirect, unchanged; a received fact can no longer be lost to a missing key or a shred. (4) Revalidation: none (implementation absent). (5) Compatibility: `hasEvent` replaced by `hasFact`, `savepoint` and `capabilities` added to the port; `StoredEvent` gains `factId`; durable-bus subscription options requested (open question 3), and `PayloadEncodeFailed` requested on durable-bus `publish`.<br>**Integration extension (round-2 integration, CCR-BR-029).** BEH-ES-003 `AppendError` and BEH-ES-028 gain the durable-bus `publish` errors `DowncastRefused`, `AccessRefused` and `OutboxFrozen` (durable-bus BEH-DB-009). Impact: (1) BEH-ES-003 and BEH-ES-028 amended, nothing added or withdrawn; (2) no risk or score changed; (3) GxP impact: none; (4) none (implementation absent); (5) the `Stream.append` error union widens (exhaustive matches must add three cases). |
| CCR-ES-003 | 2026-11-09 | Specification audit of 2026-11-09, data-plane findings on the event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** F-05 (the store could not choose its delivery stream): durable-bus `publish` takes `PublishOptions.stream` (CCR-DB-004), and BEH-ES-028 passes the event-store stream, or `publish.stream(stream, event)` from the registration (BEH-ES-001, whose callback no longer receives a `StoredEvent` it cannot have before the envelope exists); the alternative of requiring every registered type to compute the store stream from its payload was rejected, because a payload need not carry its stream id and the sequence companion's series would have to copy theirs into every event. C-11 (an added optional field could keep the version): BEH-ES-025 and ADR-ES-002 now require a version raise for every change of the encoded payload, as durable-bus BEH-DB-001 does; the exemption limited to types never received and re-published was rejected, because whether a type is re-published is a deployment fact the declaration cannot see. C-12 (a commit-time conflict was to "fail the handler" after the handler returned): durable-bus `InboxStore.transaction` fails with the new `CommitConflict`, retried in a new transaction (CCR-DB-004); BEH-ES-034 makes the adapter report a commit-time conflict to that combinator as `CommitConflict` and to its own as `WrongExpectedVersion { actual: "unknown" }`; BEH-ES-013, BEH-ES-030 and BEH-ES-037 follow. C-18 (stale open question on `onUnreadable`): BEH-ES-030 cites durable-bus BEH-DB-020, registers `receive` under `subscribe` with `receiveOptions` and `receiveVerbatim` under `subscribeEnvelopes` with the new `receiveVerbatimOptions` (`onPoison` only), and drops the interim ban on encrypted types; open question 3 is closed. C-20 (a stored event and its envelope could name different actors): BEH-ES-007 serves an append's `context` over the whole append, publication included, and draws one correlation for both when none is set; BEH-ES-028 takes the published event's attribution from the returned envelope; BEH-ES-030 states that a re-published received fact keeps the fact's origin in the store while its envelope carries this host's, the envelope's `causationId` linking the two. U-10 (the origin changes on a running host): BEH-ES-007 reads the origin from durable-bus `DurableBus.origin` at each append and keeps none across appends; the store holds no handle keyed by origin. M-05 (grantable members never defined): BEH-ES-038 defines the members of the `EventStore` contract (`register`, `append`, `read`, `readAll`, `hasFact`, `savepoint`, `checkpoints`, `snapshots`), maps every helper to the members it calls, and states that the contract is local and is never served or proxied across a host. **Core follow-up.** Core CCR-BR-033 added the requested form; `EventStore` is declared with `Contract.local`, every major stays local, and a boundary companion refuses it (core BEH-BR-225, BEH-BR-232).<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-ES-017 added; BEH-ES-001, 002, 007, 013, 025 (heading changed, old anchor kept), 028, 030, 032, 034, 037, 038 and 040, ADR-ES-002, RSK-ES-003 and RSK-ES-005 amended; traceability rows REQ-ES-001, 006, 008 and 016 amended; nothing withdrawn. (2) Risk: RSK-ES-003 and RSK-ES-005 failure modes and controls extended; no score changed. (3) GxP impact: indirect — a stored business record and its published envelope now carry one attribution, and no field is lost to an older reader without a version raise; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `RegisterOptions.publish.stream` takes `(stream, event)`; `receiveVerbatimOptions` added; the `EventStore` contract gains named members; depends on durable-bus CCR-DB-004 (`PublishOptions`, `CommitConflict`, `DurableBus.origin`). **Requested of core (satisfied):** a form for a local contract, or local members without codecs, in core 26 (BEH-BR-225), and a rule that the remote companion refuses to serve or proxy one. Core CCR-BR-033 added `Contract.local` and the boundary refusal (BEH-BR-232); BEH-ES-038 now declares the contract with it, and no member codecs are needed. |
| CCR-ES-004 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09, event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** P6 (the store said nothing about a re-bootstrap install): BEH-ES-034 states it. During a whole-store freeze every write of the store — append, `handle`, `run`, `record`, `recordFact`, and the `receive` and `receiveVerbatim` handlers — fails with durable-bus `OutboxFrozen` and writes nothing, published types or not, since the replaced store would take the write with it; an in-store install refuses nothing. Followers read their checkpoint at each batch, so they continue from what an in-store install left; at a whole-store swap a durable-bus store-swap participant stops them, projections restart from the new store's checkpoints after the `OriginChange` (a rebuild where there is none), and chain followers stay `halted` with "store-replaced" until the application calls `EventStore.chain` again; positions and checkpoints are never translated between stores, and a snapshot that carries checkpoints carries the events they refer to. Acceptance check 18 added (REQ-ES-018). P4 (event-store side): the federation skew table and durable-bus BEH-DB-029 now name BEH-ES-027's stored-version refusal (CCR-FD-005, CCR-DB-005); BEH-ES-027 is unchanged.<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-ES-018 added; BEH-ES-034 and BEH-ES-040 amended; traceability row BEH-ES-034 cites INV-ES-004; nothing withdrawn. (2) Risk: no risk added and no score changed; the risks file is unchanged. (3) GxP impact: indirect — no write is lost to a store swap and no follower skips or re-chains across one; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — writes of unpublished types may now fail with `OutboxFrozen` during a whole-store re-bootstrap; followers re-read checkpoints per batch; depends on durable-bus CCR-DB-005. |
| CCR-ES-005 | 2026-11-10 | Round 3 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-03), event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** M17 (the store had to refuse every write during an outbox freeze, but the freeze was visible only on a sliding status feed): every write of the store calls durable-bus `DurableBus.fence(tx)` inside its own write transaction before its first write and fails with its `OutboxFrozen`; the bus sets the freeze only after every transaction already past the fence has ended (durable-bus BEH-DB-048, CCR-DB-006), so no write admitted before the freeze commits to the replaced store after it (BEH-ES-034, check 18).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-034 amended; check 18 and traceability row REQ-ES-018 restated; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: indirect — a write racing the start of a whole-store freeze is either committed before it or refused, never lost with the replaced store; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — store writes depend on the new durable-bus `DurableBus.fence` (CCR-DB-006). |
| CCR-ES-006 | 2026-11-10 | Round 4 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-04), event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H3 (durable-bus): `DurableBus.fence` is scoped to the write transaction's `Scope`; the adapter's `transaction` provides that `Scope` with `StoreTransaction` and closes it when the transaction ends, and every store write runs `fence` in it (BEH-ES-033, BEH-ES-034; durable-bus CCR-DB-007). F4 (a whole-store freeze failed every `receive` handler with `OutboxFrozen` and, under `onPoison: "halt"`, halted each stream with traffic after five attempts): durable-bus pauses subscriptions during a whole-store settlement and does not count `OutboxFrozen` toward `maxAttempts`, so a stream never halts for the freeze; the `receive` and `receiveVerbatim` handler types carry the transaction's `Scope` (BEH-ES-030; check 18).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-030, 033 and 034 amended; check 18 and REQ-ES-018 restated; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: indirect — facts received during a re-bootstrap wait instead of halting their stream; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `EventStoreAdapter.transaction` and handler types gain `Scope.Scope`; depends on durable-bus CCR-DB-007. |
| CCR-ES-007 | 2026-11-11 | Round 5 findings of the specification audit of 2026-11-11 (SPEC-AUDIT-05), event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H2, B1 and B3 (durable-bus): a `DurableBus.fence` admission is bound to the transaction handle, not a `Scope`; `EventStoreAdapter.transaction` provides `StoreTransaction` only, and BEH-ES-033 gains the REQUIREMENT that the adapter ends every fence admission taken on a transaction when that transaction commits or rolls back, on every exit; BEH-ES-034 passes the handle to `fence`; `EventStoreConformance` covers the admission's end (BEH-ES-037); the `receive` and `receiveVerbatim` handler types drop `Scope.Scope` (BEH-ES-030). B2: those subscriptions stay paused while the raised incarnation is unrecorded (BEH-ES-030; check 18). PL13: the event-delivery dependency row names the write fence and the pause. PL14 (catalogs): `StoreUnavailable` is raised by `EventStoreAdapter.transaction`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-030, 033, 034, 037 and check 18 amended; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: indirect — a write admitted before a whole-store freeze can no longer commit after it; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `EventStoreAdapter.transaction` and the handler types lose `Scope.Scope` (reverting CCR-ES-006's type change); depends on durable-bus CCR-DB-008. |
| CCR-ES-008 | 2026-11-11 | Round 6 findings of the specification audit of 2026-11-11 (SPEC-AUDIT-06), event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H3 (durable-bus): the adapter ends fence admissions by running the effects registered with durable-bus `StoreTransaction.onEnd` once the transaction has committed or rolled back, on every exit, in registration order (BEH-ES-033); BEH-ES-034 passes the transaction to `fence`; `EventStoreConformance` checks the `onEnd` effects (BEH-ES-037); the event-delivery dependency row names `onEnd`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-033, 034 and 037 amended; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: none beyond durable-bus CCR-DB-009. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — adapters run `onEnd` effects; depends on durable-bus CCR-DB-009. |
| CCR-ES-009 | 2026-11-11 | Round 7 findings of the specification audit of 2026-11-11 (SPEC-AUDIT-07), event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** K3 (durable-bus `StoreTransaction.onEnd` now passes the outcome, durable-bus CCR-DB-010): the adapter passes each `onEnd` function "committed" only when the commit succeeded and "rolled-back" on every other exit, and the acceptance check says so (BEH-ES-033); the event-delivery dependency row follows. H4 (durable-bus side): checked, unchanged — projections restart from the new store's checkpoints after the `OriginChange` (BEH-ES-034), which durable-bus now emits only after every store-swap participant's `apply` has run (BEH-DB-048), so a companion's rows carried across the install are in the store before any projection restarts. **Follow-up (residuals of the round).** SPEC-AUDIT-07 residual, durable-bus side (CCR-DB-010): `receive` subscriptions are also paused, and `OutboxFrozen` uncounted, while a store-swap `apply` is pending (`apply-pending`), and the `OriginChange` that restarts projections waits for that hold (BEH-ES-030, acceptance check 18); each store write calls `fence` before it passes a payload through the codec, whose encode may write a key (keyring CCR-KR-009) (BEH-ES-034).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-030, 033, 034 and acceptance checks 18 and the one of BEH-ES-033 amended; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: none. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — the adapter passes the outcome to `onEnd` functions; a store write fences before it encodes; depends on durable-bus CCR-DB-010. |
| CCR-ES-010 | 2026-11-11 | Round 8 findings of the specification audit of 2026-11-11 (SPEC-AUDIT-08), event-store side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H3 (`read` and `readAll` decoded through the keyring codec during a whole-store install and durable-bus's holds, while a subject shredded in the replaced store could lack its tombstone): `read` and `readAll`, and every load, follower batch and helper through them, await durable-bus `DurableBus.whenReadable` before they read; a write fences before its loads decode, so it is refused rather than kept waiting with its transaction open (BEH-ES-034). B3 (followers stopped by `prepare` never restarted when the install failed before the raise): when nothing was raised (`DurableBus.origin` unchanged since `prepare`), every stopped follower, chain followers included, restarts from the existing store's checkpoints once `whenReadable` completes at the settlement scope's close (BEH-ES-034). Check 18 and REQ-ES-018 follow; the event-delivery dependency row names `whenReadable`.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-ES-034 and acceptance check 18, REQ-ES-018 amended; nothing added or withdrawn. (2) Risk: no risk added and no score changed. (3) GxP impact: none. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — reads wait during a whole-store install and its holds; depends on durable-bus CCR-DB-011. |

---

_Next: [Overview](./overview.md)_
