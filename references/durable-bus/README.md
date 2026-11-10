# Bridger Durable Bus — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-00                                                |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Companion Master Index            |
> | Change History | 0.7 (2026-11-10): CCR-DB-005 registered (specification audit of 2026-11-09, round 2: H8, P1, P2, P3, P4, HLC scope); honest-claims bullet: the origin is a claim of the sender; open question 1 adds risk (d) (CCR-DB-005)<br>0.6 (2026-11-09): CCR-DB-004 registered (specification audit of 2026-11-09: F-05, C-11, C-12, C-20, U-10) (CCR-DB-004)<br>0.5 (2026-11-08): CCR-DB-003 extended with the resolutions of the round-2 agent review (CCR-DB-003)<br>0.4 (2026-11-08): CCR-DB-003 extended: BEH-DB-008 cites URS-BR-059 (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck items 19–22, 24 and 25 — ADR-DB-009, no-encryption line, register row CCR-DB-003 (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

**implementation: absent**

This is the specification of the companion package `@bridger/durable-bus`.
It moves versioned, schema-described events between plugins and between
hosts through a **transactional outbox** written in the caller's own storage
transaction, delivers them at least once, and deduplicates them in an
**inbox** on the receiving side, preserving order per origin, stream and
sequence. Envelopes carry a hybrid logical clock, the actor and the
operation-context annotations. It covers gap item 9 of the architecture
review of 2026-11-08 and the replay-storm and clock-skew hazards of its §9.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The core rule applies unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md),
[ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule, and the package name

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). The word in the
package name is a statement of intent, not a claim
([ADR-DB-007](./decisions/007-the-name-is-not-a-claim.md)):

- The package owns **no** storage. Whether an event survives a crash, a power
  loss or a disk failure depends entirely on the storage adapter and its
  configuration, which are the consumer's; this specification states the
  adapter's obligations and makes no persistence claim of its own.
- It makes **no** exactly-once claim. Delivery is at least once; an effect
  happens once only when the handler writes it in the same storage
  transaction as the inbox mark ([ADR-DB-003](./decisions/003-at-least-once-with-a-deduplicating-inbox.md)).
- It makes **no** claim that envelopes are authentic or tamper-evident. The
  actor and annotations in an envelope are claims of the origin, and the
  origin is a claim of the sender
  ([BEH-DB-018](./behaviors/03-delivery-and-inbox.md#beh-db-018-the-inbox-accepts-the-next-sequence-ignores-repeats-and-stops-at-gaps)); transport
  authentication is the transport's, and a hash chain is the audit-chain
  companion's business, not this one's.
- It performs **no** encryption and holds **no** keys. A `PayloadCodec` the
  application wires may encrypt payloads; that codec, its keys and what
  "erased" means are the application's or the keyring companion's.
- It is **not** the core event bus and not a mode of it
  ([ADR-DB-001](./decisions/001-a-separate-contract-from-the-core-bus.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-events-and-envelope.md) | What the package must do, as `BEH-DB` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-a-separate-contract-from-the-core-bus.md) | Why, as `ADR-DB` records |
| 5 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Events and the envelope](./behaviors/01-events-and-envelope.md) | BEH-DB-001–008 |
| 02 | [Transactional outbox](./behaviors/02-transactional-outbox.md) | BEH-DB-009–016 |
| 03 | [Delivery and inbox](./behaviors/03-delivery-and-inbox.md) | BEH-DB-017–024 |
| 04 | [Versions and upcasters](./behaviors/04-versions-and-upcasters.md) | BEH-DB-025–032 |
| 05 | [Order and hybrid logical clocks](./behaviors/05-order-and-clocks.md) | BEH-DB-033–040 |
| 06 | [Replay, backpressure and snapshots](./behaviors/06-replay-and-snapshots.md) | BEH-DB-041–048 |
| 07 | [Core bus, plugin packaging and storage adapters](./behaviors/07-core-bus-and-adapters.md) | BEH-DB-049–056 |
| 08 | [Testing and acceptance](./behaviors/08-testing-and-acceptance.md) | BEH-DB-057–064 |

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-DB-001](./decisions/001-a-separate-contract-from-the-core-bus.md) | A separate contract from the core event bus |
| [ADR-DB-002](./decisions/002-outbox-through-a-storage-port.md) | A transactional outbox through a storage port |
| [ADR-DB-003](./decisions/003-at-least-once-with-a-deduplicating-inbox.md) | At-least-once delivery with a deduplicating inbox |
| [ADR-DB-004](./decisions/004-order-per-origin-stream-sequence.md) | Order per origin, stream and sequence; clocks for causality only |
| [ADR-DB-005](./decisions/005-versioned-events-and-pure-upcasters.md) | Versioned events and pure upcasters |
| [ADR-DB-006](./decisions/006-bounded-replay-and-snapshots.md) | Bounded replay, and snapshots past the horizon |
| [ADR-DB-007](./decisions/007-the-name-is-not-a-claim.md) | The package name is not a claim |
| [ADR-DB-008](./decisions/008-actor-and-annotations-are-claims.md) | Actor and annotations travel as claims |
| [ADR-DB-009](./decisions/009-writers-last-for-offline-readers.md) | Writers last for readers that cannot be upgraded first |

## Identifier scheme

The core scheme applies with the infix **`DB`**: `BEH-DB`, `INV-DB`,
`ADR-DB`, `REQ-DB` (in `traceability.md` §4), `CCR-DB`, and Document IDs
`BRIDGER-DB-*`. User requirements and risks are registered in the core
`urs.md` and `gxp/03-risk-assessment.md`. Changes follow core
[change control](../core/process/change-control.md).

## Open questions

These need a decision outside this tree; until then the behaviours are
designed within the current core.

1. **Risks to register in the core risk assessment.** Besides the risks
   named by CCR-DB-001: (a) origin reuse after a restore whose incarnation
   was not raised is not detectable by the package (BEH-DB-004,
   INV-DB-002) — operator obligation; (b) a receiver regression beyond the
   sender's retention loses envelopes, reported on both sides and repaired
   only by an attributed `acceptGap` or a re-bootstrap (BEH-DB-019);
   (c) past the inbox's retention a repeated (origin, stream, sequence) is
   absorbed without the equivocation check (BEH-DB-018); (d) an envelope's
   origin is not bound to the sender by this package, so a party whose
   batches a transport accepts can write under another host's origin, stop
   its streams with `EnvelopeConflict` and pass origin-keyed policies and
   series checks (BEH-DB-018, CCR-DB-005) — transport and deployment
   obligation.

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-DB-001 | 2026-11-08 | Initial draft of the durable-bus companion: `DurableEvent.make(id, schema, { version, upcast })`; envelope with origin, stream, sequence, hybrid logical clock, actor and annotations; transactional outbox through a consumer storage port; at-least-once relay; deduplicating inbox; upcasters; order per origin/stream/sequence; replay bounds and snapshot re-bootstrap; separation from the core event bus; storage adapter obligations (SQLite first). Impact assessment (PROC-03 §3): (1) adds BEH-DB-001–007, 009–015, 017–030, 033–038, 041–046, 049–058 (the rest of each block reserved), INV-DB-001–008, ADR-DB-001–008, REQ-DB-001–027; no core identifier changed by this CCR — the core URS, RSK, glossary and overview rows it needs are proposed to the core change that registers this companion. (2) Risk: introduces event-delivery risks (lost or duplicated effects, disorder, origin equivocation, replay storms, skewed clocks) to be registered in the core risk assessment. (3) GxP impact: yes — envelopes carry the actor and annotations of the operation that produced them; the package changes no core audit record, gate or sequence. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: new package; no core public type changes. |
| CCR-DB-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (R3 findings R3-27, R3-28, R3-29, R3-30, R3-31, R3-32, R3-33, R3-34, R3-35, R3-36, R3-37). Annotations carried as `Annotations.encode(Annotations.filter(bag, "wire"))` entries plus `annotationsOmitted`, decoded with `Annotations.decode` and combined through `CallerContext.serve`; the deadline never carried (BEH-DB-002, BEH-DB-007; core BEH-BR-296). HLC stamped inside the adapter's serialized append; start clock = max(outbox highest HLC, saved receipt clock); merged order agrees with sequences and with causation except after a `skewed` cause (BEH-DB-011, BEH-DB-034, BEH-DB-035, BEH-DB-037). Receiver regression detected from the acknowledgement watermark, resent from `OutboxStore.retained` or reported as `envelopes-lost`; attributed `acceptGap` (BEH-DB-019). Two parking levels: inbox-level stops (`UnknownEnvelopeFormat`, `EnvelopeConflict`, `releaseStream`) and subscription-level halts and parks (`resume`, `unpark` processed out of order) (BEH-DB-018, 021, 022, 026). Check 6 and INV-DB-002 restate origin uniqueness as an operator obligation (BEH-DB-004). New pull port `HistorySource` and `follow` (BEH-DB-047); `SnapshotRequired` removed from `DeliveryTransport.send` (BEH-DB-017, 044, 045). Duplicate check bounded by inbox retention (BEH-DB-018). `Ack.retryAfter` (BEH-DB-017, 041). No self-lease in `publish` (BEH-DB-052). Impact assessment (PROC-03 §3): (1) adds BEH-DB-047 and REQ-DB-028–030; amends BEH-DB-002, 004, 007, 011, 012, 017–022, 026, 034, 035, 037, 041, 044, 045, 051, 052, 054, 058, INV-DB-002, 005, 006, 007, 008, ADR-DB-004, 005, 006, 008; the BEH-DB-007 heading (and anchor) changed; no core identifier changed. (2) Risk: reduces silent-stall and ordering risks; three residual risks proposed for the core register (Open questions §1). (3) GxP impact: yes — `acceptGap`, `releaseStream`, `resume` and `unpark` are attributed operator actions; no core audit record, gate or sequence changes. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: draft-to-draft; `DeliveryTransport.send`, `OutboxStore`, `InboxStore`, the subscription handler and the envelope's `annotations` field change shape. |
| CCR-DB-003 | 2026-11-08 | Round 2: recheck items 19, 20, 21, 22, 24 and 25 and alignment with CORE-DECISIONS-2 (CCR-BR-024–026). Item 19: `DurableBus.rebootstrapOutbox` pushes or keeps the outbox before a snapshot, `RebootstrapBlocked`; a restore that touches the outbox rolls back (BEH-DB-044, BEH-DB-048, INV-DB-009). Item 20: routes and inboxes declare residency labels compared with the remote companion's `PlacementPolicy` (BEH-DB-016). Item 21: `PayloadCodec` port (`Envelope.codec`, `PayloadEncodeFailed`, `PayloadDecodeFailed`, `PayloadUnreadable` parks without halting) and written guidance that annotations, actors, ids, call-log entries and audit `reason` carry no personal data (BEH-DB-008, INV-DB-010). Item 22: one skew rule with writers last where readers cannot go first — `publishVersion`, round-trip-checked `downcast`, `DowncastRefused` — and the oldest version received per origin (BEH-DB-028, 029, 030, 031, 032, ADR-DB-009). Item 24: delivery calls core `AccessPolicy.ask` for publish, subscribe and every delivery with `origin`, `AccessRefused`, denied deliveries parked; `listens` with `declaredOnly`; G55 closed (BEH-DB-053, INV-DB-011). Item 25 and alignment: `onBehalfOf` as `PrincipalRef.encode`; correlation from `CurrentCorrelation` and set for handlers by `CallerContext.serve`; core's single held event noted. Impact assessment (PROC-03 §3): (1) adds BEH-DB-008, 016, 031, 032, 048, INV-DB-009–011, ADR-DB-009, REQ-DB-031–038; amends BEH-DB-002, 005, 007, 022, 028 (heading changed, old anchor kept), 029, 030, 044, 049, 053 (heading changed), 058, ADR-DB-005; no identifier withdrawn. (2) Risk: closes the loss of offline facts at re-bootstrap and the delivery of events to a subscriber whose access was withdrawn; residency labels add remote RSK-RM-014; the open question on readers-first is answered. (3) GxP impact: yes — `resetVersions` is an attributed operator action; denied deliveries are parked visibly; the envelope's principal and correlation follow core encodings; no core record, gate or sequence changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: draft-to-draft; `Envelope` gains `codec`, `Route` gains `residency`, `DurableEventOptions` gains `publishVersion` and `downcast`. Extended after integration: BEH-DB-008 cites URS-BR-059, registered by core CCR-BR-027, in place of the proposal. **Extension (2026-11-08, resolutions of the round-2 agent review):** findings R4-offline F8, F9, F12, F13, F16, F22, F25–F27 and R5-04/05, R5-06, R5-08, R5-13 (with FX-NEW N1–N3 and FX-CORE F27). BEH-DB-048 rewritten: scoped `settle` returns an `OutboxSettlement` whose `install` is the guarded install path — "in-store" inside one transaction with the outbox comparison, "whole-store" with the outbox frozen (`OutboxFrozen`) and the incarnation raised through the new `IncarnationSource` port; `require` defaults to "pushed". Placement skips send a payload-less `Withheld` marker so mixed labels leave no gap. `HistorySource` built per reader with placement and a `HistoryAccess` decision ("open" explicit). `onUnreadable` ("park", "halt") and `subscribeEnvelopes` for fact recorders; codec rotation through `decodes`; write order schema → downcast → codec; codec markers pass upcasters. `publish` error union completed; publish errors abort the caller's write if unhandled. Reader versions reported to the authority. Delivery `origin` documented as `node#incarnation`. Downstream signature of an unraised restore stated. Erasure wording narrowed to holders without another key copy. Impact: adds REQ-DB-039–041; amends BEH-DB-004, 008, 009, 012, 016, 017, 018, 020, 022, 031, 032, 047, 048 (heading changed, old anchor kept), 050, 053, INV-DB-006, 009, 010, 011, ADR-DB-009; no identifier withdrawn. GxP impact: none on core records. Revalidation: none. |
| CCR-DB-004 | 2026-11-09 | Specification audit of 2026-11-09, data-plane findings on the delivery side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** F-05 (the event store could not choose the stream it publishes on): `publish` takes `PublishOptions`; `options.stream` sets the envelope's stream in place of `event.stream(payload)`, an empty stream is a defect, and the options change nothing else (BEH-DB-003, BEH-DB-009); the event store passes its own stream (event-store CCR-ES-003), which the sequence companion's per-(origin, stream) order on a series relies on. The alternative, a declared `stream(payload)` that returns the store stream, was rejected: a payload need not carry its stream id, and the series events would have to copy theirs into every payload. C-11 (an added optional field could keep the event version): BEH-DB-001 states that every change of the encoded payload raises the version, so the writers-last round trip (BEH-DB-031) and the halt or park of an unknown version (BEH-DB-026) cover the added field instead of an older reader dropping it silently. C-12 (a commit-time conflict had no type on the inbox path): `InboxStore.transaction` and `receive` fail with the new `CommitConflict`; a handler attempt whose commit fails with it is retried in a new transaction under `maxAttempts`, and when the attempts end on a conflict the (origin, stream) halts whatever `onPoison` says, never parked (BEH-DB-018, BEH-DB-021); adapters report such a commit as `CommitConflict`, never as `StoreUnavailable`, and the conformance suite exercises it (BEH-DB-054, BEH-DB-056, `TestStore.conflictAtCommit`). C-20 (stored event and envelope could name different actors or causations): `options.causationId` sets the causation outside a subscription handler (BEH-DB-005); the event store runs `publish` under the append's resolved context and stores the envelope's attribution (CCR-ES-003). U-10 (a re-bootstrap switches the origin on a running host): `DurableBus.origin` returns the origin of the next envelope and `originChanges` emits each switch, which only a whole-store re-bootstrap makes, while the outbox is frozen (BEH-DB-004); `DurableBus.onStoreSwap` registers participants whose `prepare` reads the store being replaced before `run`, a failure stopping the install with "prepare-failed" (BEH-DB-048); the sequence companion uses both (CCR-SQ-003). Acceptance checks 42–44 added (REQ-DB-042–044).<br>**Impact (PROC-03 §3).** (1) Identifiers: REQ-DB-042–044 added; BEH-DB-001, 003, 004, 005, 009, 018, 021, 048, 054, 056, 057 and 058 amended; traceability rows REQ-DB-004, 009 and 033 amended; nothing withdrawn. (2) Risk: no core risk added and no score changed; the open-question risks of this README are unchanged. (3) GxP impact: indirect — no envelope field is lost to an older reader without a version raise, and a commit conflict can no longer park a fact; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — `publish` gains an optional third argument; `InboxStore.transaction` and `receive` widen their error with `CommitConflict` (adapters must report it); `DurableBus` gains `origin`, `originChanges` and `onStoreSwap`; `SnapshotFailed` gains the reason "prepare-failed". |
| CCR-DB-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09, delivery side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H8 (a whole-store install raised the incarnation after `run`, so a failed raise or a crash after `run` resumed the replaced store under the old origin and reissued its sequences): `OutboxSettlement.install` now runs every `prepare`, then `IncarnationSource.raise`, then `run`; a failed raise fails with `IncarnationUnavailable` before anything is replaced; once raised, the old origin is never used again — a failed `run` still records the raised incarnation in whatever store it left and switches, `publish` stays frozen (`origin-unrecorded`) while it cannot be recorded, and a restart reads the raised number from `IncarnationSource.current` (BEH-DB-004, BEH-DB-048, check 44). The alternative, a swap marker in the store, was rejected: the store is what is being replaced, while the incarnation source already lives outside it. P1 (the port's two sides typed differently): durable-bus keeps its signature as the owner; `run` under "whole-store" gets no live `StoreTransaction`; federation restates the port (CCR-FD-005). P2 (an envelope's origin is not tied to its sender): stated as a limit — the bus never treats the origin as the sender's identity, binding origins to authenticated senders is the transport's and the deployment's, and a transport that authenticates peers SHOULD refuse foreign origins unless the peer is a listed relay (BEH-DB-018, honest-claims bullet); proposed to core as risk (d) of open question 1. An inbound allow-list in the bus was not adopted: `receive` cannot see the sender, so the check belongs where authentication happens. P3 (a snapshot restore moved inbox watermarks without `acceptGap`): a restore, and an install through the settlement, records each forward move as an attributed `GapRecord` with reason "snapshot:" + source (BEH-DB-019, BEH-DB-044, INV-DB-006, check 24). P4 (delivery side): BEH-DB-029 no longer lets the offline cap bound a backlog; an origin that has not reported an empty backlog counts as holding the old version, and the event store's stored-version refusal is named. Low (HLC monotonicity across a restore): INV-DB-007 is scoped to one origin on one store (heading changed, old anchor kept).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-DB-004, 018, 019, 029, 044 and 048, INV-DB-006 and INV-DB-007 amended; acceptance checks 24 and 44 and traceability rows REQ-DB-024 and REQ-DB-044 restated; nothing added or withdrawn. (2) Risk: risk (d), origin not bound to the sender, proposed for the core risk assessment (open question 1); no core score changed. (3) GxP impact: indirect — sequences of a replaced store are never issued twice under one origin, and a watermark never passes unstored sequences without an attributed record; no core record, gate or legality row changes. (4) Revalidation trigger: none; nothing is implemented, released or qualified (implementation absent). (5) Compatibility: draft to draft — the whole-store install order changes (raise before `run`); `install` may now fail with `IncarnationUnavailable` before `run`; a restore writes `GapRecord`s; status gains `origin-unrecorded`; no public type changes. |
