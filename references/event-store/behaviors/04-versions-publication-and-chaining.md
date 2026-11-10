# 04 — Versions, Publication and Chaining

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-BEH-04                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-ES-030: the `receive` and `receiveVerbatim` handlers take the transaction's `Scope` that the scoped `DurableBus.fence` needs; a whole-store freeze pauses them and never halts a stream (H3, F4) (CCR-ES-006)<br>0.6 (2026-11-09): Specification audit of 2026-11-09 — BEH-ES-025: every change of the encoded payload raises the version, an added optional field included (C-11; heading changed, old anchor kept); BEH-ES-028 passes the delivery stream and causation to durable-bus `publish` and takes the published event's attribution from the returned envelope (F-05, C-20); BEH-ES-030 cites durable-bus BEH-DB-020 for both subscription forms, adds `receiveVerbatimOptions`, drops the interim rule for encrypted types, leaves commit-time conflicts to durable-bus `CommitConflict` and states which origin a re-published fact carries (C-12, C-18, C-20) (CCR-ES-003)<br>0.5 (2026-11-08): BEH-ES-028 fails the append on every durable-bus `publish` error, including `DowncastRefused`, `AccessRefused` and `OutboxFrozen` (round-2 integration) (CCR-ES-002)<br>0.4 (2026-11-08): BEH-ES-028 states that idempotency rests on `factId`; BEH-ES-030 records received facts with `decider.factId`, requires halting subscription options, states the key precondition, and adds `receiveVerbatim`; BEH-ES-031 hashes the stored event without `position` and requires JSON payloads; BEH-ES-032 stores an existing `Shredded` marker without a key (CCR-ES-002)<br>0.3 (2026-11-08): BEH-ES-028 cites URS-BR-056 and BEH-ES-032 URS-BR-059 (registered by core CCR-BR-027) (CCR-ES-001)<br>0.2 (2026-11-08): BEH-ES-032 aligned with durable-bus BEH-DB-008 (`PayloadCodec` shape, codec id stored, one encode for published events, read order and failures); BEH-ES-028 lists `PayloadEncodeFailed` (CCR-ES-001, revision bump)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

This file specifies how stored events evolve (durable-bus versions and
upcasters; every payload change raises the version), how they are published
through the durable-bus outbox in the append's transaction, how envelopes
received from other hosts are recorded, and how stored events are optionally
chained (audit-chain `ChainSink<R>`) and field-encrypted (durable-bus
`PayloadCodec`). This file owns BEH-ES-025–032 and uses all eight.

Planned source: `packages/event-store/src/Publish.ts`,
`packages/event-store/src/Chain.ts` *(Planned)*.

## BEH-ES-025: Event versions follow durable-bus; every payload change raises the version

<a id="beh-es-025-event-versions-follow-durable-bus-additive-changes-follow-core-26"></a>

> **See:** [ADR-ES-002](../decisions/002-one-event-declaration-for-storage-and-delivery.md)
> **Core seam:** [26 — Versioned Contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-230, BEH-BR-231, by contrast)
> **Depends on:** [BEH-DB-001](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-001-durableeventmake-declares-a-versioned-event), [BEH-DB-027](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-027-upcasters-are-pure), [BEH-DB-030](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-030-encoding-uses-the-current-version-only)
> **Satisfies:** [URS-BR-029](../../core/urs.md#urs-br-029-evolve-a-service-contract-without-breaking-its-consumers)
> **Risk:** [RSK-ES-005](../risks.md#rsk-es-005)

```
REQUIREMENT: The store MUST encode new events at the current `version` only
             (BEH-DB-030) and read old ones through the declared upcasters
             (BEH-DB-027). It MUST NOT rewrite a stored event to a newer
             version.
```

```
REQUIREMENT: Documentation MUST state the evolution rule of durable-bus
             BEH-DB-001: every change of an event's encoded payload, an added
             field included whether optional or not, MUST raise the version
             and add a pure upcaster from the previous one. The version MAY
             stay only for a change that leaves the encoding of every value
             as it was.
```

The rule is stricter than contract evolution within one major (core
BEH-BR-230, BEH-BR-231), where an added optional field keeps the version.
A stored event is read by every later release and, when published, by hosts
that may run an older one. Such a host decodes the event and ignores the
field it does not know; if it records the fact (BEH-ES-030) or publishes the
event again, the field is gone without a trace. Under a raised version the
same host halts or parks the envelope until it is upgraded (durable-bus
BEH-DB-026), a writer still publishing the old version refuses a value the
old version cannot carry (BEH-DB-031), and every stored event states the
version its payload was written at.

## BEH-ES-026: An unreadable version stops a load and halts a projection

> **Risk:** [RSK-ES-005](../risks.md#rsk-es-005)

```
REQUIREMENT: `UnknownEventVersion` (BEH-ES-006) MUST fail an aggregate load
             and MUST halt a projection follower at that position
             (BEH-ES-020). The store MUST NOT park, drop or skip a stored
             event.
```

## BEH-ES-027: Upcasters are kept for as long as events at that version are stored

> **Depends on:** [BEH-DB-029](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-029-upcasters-are-kept-for-as-long-as-old-envelopes-can-arrive)

```
REQUIREMENT: Registering a `DurableEvent` whose `minVersion` is above the
             lowest version still stored for its type MUST fail with
             `UpcasterRemoved { type, storedFrom, minVersion }`. The adapter
             MUST be able to report the lowest stored version per type
             (BEH-ES-033).
```

Because the store never rewrites events, an upcaster for a stored version is
needed for the life of the store, which is longer than the delivery window
durable-bus reasons about (BEH-DB-029).

## BEH-ES-028: Publication writes the outbox in the append's transaction

> **Invariant:** [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
> **See:** [ADR-ES-003](../decisions/003-append-in-the-callers-transaction-with-the-outbox.md)
> **Depends on:** [BEH-DB-003](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-003-streams), [BEH-DB-005](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-005-correlation-and-causation), [BEH-DB-009](../../durable-bus/behaviors/02-transactional-outbox.md#beh-db-009-publish-runs-inside-the-callers-transaction), [BEH-DB-010](../../durable-bus/behaviors/02-transactional-outbox.md#beh-db-010-the-envelope-exists-exactly-when-the-transaction-commits)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect), [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)
> **Risk:** [RSK-ES-003](../risks.md#rsk-es-003)

```
REQUIREMENT: For each appended event whose type was registered with
             `publish`, `append` MUST call durable-bus `publish(event,
             payload, { stream, causationId })` with the same
             `StoreTransaction`, in stream-version order, where `stream` is
             the delivery stream — the event-store stream of the append, or
             `publish.stream(stream, event)` when the registration gives one
             (BEH-ES-001) — and `causationId` is the append's. It MUST NOT
             rely on the stream the `DurableEvent` declares.
```

```
REQUIREMENT: `publish` MUST run under the context the append resolved
             (BEH-ES-007). The store MUST then take the stored event's
             `eventId`, `actor`, `onBehalfOf`, `correlationId`,
             `causationId`, `annotations` and `annotationsOmitted` from the
             returned envelope, so that a stored event and its envelope
             never disagree; inside a durable-bus subscription handler the
             envelope's causation is the handled envelope's `eventId`
             (durable-bus BEH-DB-005). Its `origin` follows BEH-ES-007, and
             BEH-ES-030 for a recorded received fact.
```

```
REQUIREMENT: Any error of `publish` (`EncodeFailed`, `PayloadEncodeFailed`,
             `DowncastRefused`, `AccessRefused`, `OutboxFrozen`,
             `OutboxWriteFailed`, `Unattributed`; durable-bus BEH-DB-009)
             MUST fail the append and write no event. The
             store MUST NOT publish after commit or from a second
             transaction.
```

Sharing `eventId` between the stored event and its envelope lets a reviewer
match the two and gives the receiver a stable `causationId`; sharing the
attribution fields means that the match shows one actor, one correlation and
one set of annotations. The delivery stream defaults to the event-store
stream, so a receiver sees the stream's events in stream-version order per
origin, which the sequence companion relies on for a series (sequence
BEH-SQ-011). The idempotency
of a received fact rests on its `factId`, not on the envelope's `eventId`
(BEH-ES-015): an event that records a received fact and is published again
gets a new envelope `eventId` and keeps the fact's `factId`.

## BEH-ES-029: Unpublished events stay local

```
REQUIREMENT: Events of types registered without `publish` MUST NOT reach the
             outbox. Documentation MUST state that the published types and
             delivery streams are the application's choice, and that
             `AccessPolicy.ask` (core BEH-BR-269) governs which plugins may
             subscribe to them on the bus.
```

## BEH-ES-030: Received envelopes are recorded as facts in the inbox's transaction

> **Invariant:** [INV-ES-006](../invariants.md#inv-es-006-recording-a-fact-cannot-fail-for-a-rule)
> **See:** [ADR-ES-005](../decisions/005-offline-facts-are-recorded-never-rejected.md)
> **Depends on:** [BEH-DB-018](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-018-the-inbox-accepts-the-next-sequence-ignores-repeats-and-stops-at-gaps), [BEH-DB-019](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-019-acknowledgement-follows-the-receivers-commit), [BEH-DB-021](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-021-a-failing-handler-retries-then-halts-or-parks), [BEH-DB-008](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-008-a-payloadcodec-encodes-payloads-and-records-carry-no-personal-data)
> **Risk:** [RSK-ES-004](../risks.md#rsk-es-004)

```ts
// illustrative — not type-checked
declare const EventStore: {
  // decoded: the bus decodes (codec, upcast, schema) before the handler
  readonly receive: <S, F, E, Events extends readonly DurableEvent<any, any>[]>(
    decider: FactDecider<S, F, E>, toFact: (event: EventOf<Events>, envelope: Envelope) => F) =>
    (event: EventOf<Events>, envelope: Envelope, receipt: Receipt) => Effect.Effect<void, unknown, StoreTransaction | Scope.Scope>
  // verbatim: the payload is stored as received, never decoded or re-encoded
  readonly receiveVerbatim: (options?: { readonly stream?: (envelope: Envelope) => string }) =>
    (envelope: Envelope, receipt: Receipt) => Effect.Effect<void, unknown, StoreTransaction | Scope.Scope>
  // the subscription options each handler requires (durable-bus BEH-DB-020, BEH-DB-021)
  readonly receiveOptions: { readonly onPoison: "halt"; readonly onUnreadable: "halt" }   // DurableBus.subscribe
  readonly receiveVerbatimOptions: { readonly onPoison: "halt" }                         // DurableBus.subscribeEnvelopes
}
```

```
REQUIREMENT: `EventStore.receive(decider, toFact)` MUST return a durable-bus
             subscription handler that, in the handler's `StoreTransaction`,
             turns the decoded event into a fact and calls `Aggregate.record`
             (fact identifier `decider.factId(fact)`, BEH-ES-015), so that the
             inbox mark, the recorded events and their own outbox entries
             commit together. A `StoreContention` from `record` MUST fail
             the handler, so that durable-bus rolls the inbox transaction
             back and retries in a new one (BEH-DB-021). A conflict the
             adapter detects only at commit happens after the handler has
             returned and is not the handler's: the adapter fails the inbox
             transaction with durable-bus `CommitConflict` (BEH-ES-034), and
             durable-bus retries it in a new transaction and halts the
             subscription when the attempts end on it (BEH-DB-021).
```

```
REQUIREMENT: A handler from `receive` MUST be registered with durable-bus
             `subscribe` and `EventStore.receiveOptions`: `onPoison: "halt"`,
             so that a fact whose handler keeps failing halts its (origin,
             stream) and is never parked past, and `onUnreadable: "halt"`,
             so that a `PayloadUnreadable` halts it too instead of parking
             the fact (durable-bus BEH-DB-020). A handler from
             `receiveVerbatim` MUST be registered with durable-bus
             `subscribeEnvelopes` and `EventStore.receiveVerbatimOptions`
             (`onPoison: "halt"`); that form never decodes, so it never
             meets `PayloadUnreadable` and takes no `onUnreadable`
             (BEH-DB-020). The package cannot see how a handler is
             registered; documentation MUST state the rule, and the
             acceptance checks exercise it (BEH-ES-040). During a
             whole-store re-bootstrap the bus pauses these subscriptions,
             and a handler that fails with `OutboxFrozen` is retried after
             the settlement without counting toward `maxAttempts`, so
             `onPoison: "halt"` never halts a stream for the freeze
             (durable-bus BEH-DB-021, BEH-DB-048).
```

```
REQUIREMENT: The stored events of a received fact MUST keep the envelope's
             `origin` and MUST set `causationId` to the envelope's `eventId`.
             Their `actor` and `correlationId` MUST be the envelope's, and
             their annotations the handler's served annotations: the
             envelope's accepted entries with the provenance entry naming
             it (durable-bus BEH-DB-006, BEH-DB-007), which is what
             BEH-ES-007 resolves inside the handler. Their `eventId`s follow
             BEH-ES-002: fresh, or those of the envelopes this store
             publishes when the types are registered with `publish`.
```

```
REQUIREMENT: When the type of a recorded fact is registered with `publish`,
             the stored event MUST keep the fact's `origin` while its new
             envelope carries this host's origin (BEH-ES-028). Documentation
             MUST state the two meanings: the stored `origin` names the host
             where the fact happened, and an envelope's `origin` names the
             host that issued its sequence (durable-bus BEH-DB-004); the
             envelope's `causationId` links it to the envelope the fact
             arrived in.
```

```
REQUIREMENT: Recording a decoded fact MUST NOT fail because a field of it is
             a keyring `Shredded` marker: the events `accept` returns may
             carry the marker, and the codec stores it as a marker without a
             key (keyring BEH-KR-012). Documentation MUST state the
             precondition of `receive` for an encrypted event type: the
             receiving host holds the subject keys, or a tombstone for every
             shredded subject. A host that holds neither for some subject
             gets `PayloadUnreadable` from the bus, which halts the
             subscription under `receiveOptions`; the operator then supplies
             the keys or moves the type to `receiveVerbatim`. A fact is never
             parked and never dropped.
```

```
REQUIREMENT: `EventStore.receiveVerbatim(options?)` MUST return a handler for
             a durable-bus `subscribeEnvelopes` subscription, which delivers
             envelopes without decoding them (durable-bus BEH-DB-020). In
             the handler's `StoreTransaction` it MUST append
             one stored event to `options.stream(envelope)`, default
             "rx:" + origin + ":" + stream, with the next stream version,
             whose `type` and `version` are the envelope's, whose `payload`
             and `codec` are the envelope's byte for byte, whose `factId` is
             the envelope's `eventId` (so a redelivery is "already-recorded",
             BEH-ES-015), whose `origin`, `actor`, `correlationId`,
             `annotations` and `annotationsOmitted` are the envelope's as
             received, and whose `causationId` is the envelope's `eventId`.
             It MUST NOT
             call the `PayloadCodec`, an upcaster or a schema, MUST require the
             type to be registered, and MUST NOT publish the event
             (BEH-ES-029).
```

Two ways of receiving keep the fact path open when keys are missing.
`receive` is for hosts that decode and apply rules; it needs the keys, or a
tombstone, for every subject it reads. `receiveVerbatim` is for hosts that
must record what they receive but may not or cannot read it — an authority
that holds no subject keys, or a store-and-forward node: the ciphertext is
kept as received, and a later shred changes no stored byte. The price is
stated: a verbatim stream can be read, folded or projected only on a host
whose codec can decode its payloads; elsewhere a read of it ends with
`DecodeFailed` under the halting rule (BEH-ES-032), so such streams serve
storage, chaining (BEH-ES-031) and later review, not local rules.

## BEH-ES-031: Optional chaining through `ChainSink<R>`

> **See:** [ADR-ES-007](../decisions/007-chaining-and-encryption-are-composed.md)
> **Depends on:** [BEH-AC-025](../../audit-chain/behaviors/04-generic-chain.md#beh-ac-025-chainsinkr-chains-any-append-only-stream-and-hashchainsink-is-its-audit-instance) (audit-chain, CCR-AC-003)
> **Risk:** [RSK-ES-006](../risks.md#rsk-es-006)

```ts
// illustrative — not type-checked; ChainSink, SeriesSpec and ChainSinkShape are audit-chain's (BEH-AC-025)
declare const EventStore: {
  // the series spec the store hands to ChainSink.make for one stream
  readonly seriesSpec: (stream: string, options?: { readonly seriesId?: string }) => SeriesSpec<StoredEvent>
  //   seriesId: options.seriesId ?? "es:" + stream;
  //   canonicaliser: Canonicaliser.jcsOf("es-stored-v1", (e) => omit(e, "position"))   // position is per store
  //   position(e) = { seq: e.streamVersion, recordId: e.eventId, origin: e.origin }
  readonly chain: <E>(stream: string, sink: ChainSinkShape<StoredEvent, E>) =>
    Effect.Effect<void, never, EventStore | Scope.Scope>
}
```

```
REQUIREMENT: `EventStore.chain` MUST hand every committed event of the
             stream, as its `StoredEvent` (payload as stored, so encrypted
             fields as ciphertext), to the sink's `append`, in stream-version
             order. One sink MUST serve one stream: `seq` is the stream
             version, which is contiguous from 1 as `ChainSink<R>` requires,
             and `recordId` is the `eventId`. The series id MUST default to
             "es:" + stream and MUST NOT be a host id.
```

```
REQUIREMENT: The canonicaliser MUST hash the `StoredEvent` without
             `position`, which the adapter assigns per store and which
             differs in a copy or a migration of the same stream. A chained
             stream's stored payloads MUST be JSON values (the identity codec
             over a JSON-encoding schema, or the keyring codec, whose
             `Encrypted` form is JSON with base64url strings); a payload that
             is not a JSON value makes the canonicaliser fail, and the chain
             follower halts at that event (BEH-ES-020) rather than skipping
             it. Binary payloads need an application canonicaliser.
```

```
REQUIREMENT: Chaining MUST run as a follower of that stream with its own
             checkpoint, retrying the sink's failures (BEH-ES-019) and halt rather than skip (BEH-ES-020). The package
             MUST NOT hand a decoded or decrypted payload to a chain.
             Documentation MUST state that events committed after the last
             chained position are not yet chained, and that the chain's
             detection limits are the audit-chain companion's.
```

Hashing the stored form keeps a chain verifiable after the keyring companion
shreds a subject: the ciphertext bytes it hashed are unchanged
([keyring](../../keyring/README.md)).

## BEH-ES-032: Stored payloads pass through the durable-bus PayloadCodec

> **See:** [ADR-ES-007](../decisions/007-chaining-and-encryption-are-composed.md)
> **Satisfies:** [URS-BR-059](../../core/urs.md#urs-br-059-make-a-persons-event-payloads-unreadable-without-breaking-their-order)
> **Depends on:** [BEH-DB-008](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-008-a-payloadcodec-encodes-payloads-and-records-carry-no-personal-data)

```ts
// illustrative — not type-checked; the shape is durable-bus BEH-DB-008's, which governs
// Context.Service "@bridger/durable-bus/PayloadCodec" — optional; default PayloadCodec.identity
//   id: string                                                     // stored in StoredEvent.codec; "identity" never written
//   encode({ type, version, stream }, encoded) => Effect<unknown, PayloadEncodeFailed>
//   decode({ type, version, stream, codec }, payload) => Effect<unknown, PayloadDecodeFailed | PayloadUnreadable>
```

```
REQUIREMENT: The store MUST use the `PayloadCodec` service of its
             environment — the one the bus uses for publication — and no
             codec of its own. For an event it publishes (BEH-ES-028), it
             MUST store the `payload` and `codec` of the `Envelope` that
             `publish` returned and MUST NOT encode the payload a second
             time, so that the stored and published payloads are
             byte-identical. For any other event it MUST call
             `encode({ type, version, stream }, encoded)` inside the
             append's transaction and store the codec's `id` in `codec`,
             leaving `codec` absent for `PayloadCodec.identity`. A
             `PayloadEncodeFailed` MUST fail the append and write no event.
             The store MUST NOT see keys and MUST NOT log payloads.
```

```
REQUIREMENT: On read, the store MUST call `decode({ type, version, stream,
             codec }, payload)` for a stored event that has a `codec`,
             before the upcasters (the order of BEH-DB-008 and BEH-ES-006).
             A decoded payload that carries field markers (keyring
             `Shredded`, keyring BEH-KR-012) MUST be passed to the upcasters
             and the schema as returned; the store MUST NOT fail a read or a
             projection because of them. Encoding an event whose value already
             carries such a marker — a fact recorded after a shred, an event
             re-published by a host that holds a tombstone — MUST store the
             marker, never fail and never need a key (keyring BEH-KR-012). A stored `codec` the store's codec
             does not match, a `PayloadDecodeFailed` and a
             `PayloadUnreadable` MUST end the read with `DecodeFailed`
             naming the tag, under the halting rule of BEH-ES-020; unlike
             a bus subscription, which parks a `PayloadUnreadable` unless
             its `onUnreadable` is "halt" (durable-bus BEH-DB-020), the store
             never skips an event. A codec whose output depends
             on `stream` MUST NOT be used with `publish.stream` naming
             another stream; the keyring's codec does not depend on it.
```

**Settled here.** (1) Stored events are never rewritten to a new version
(BEH-ES-025). (2) Upcasters live as long as their versions are stored
(BEH-ES-027). (3) Publication is in the append's transaction and shares the
`eventId` (BEH-ES-028). (4) Received envelopes are recorded as facts in the
inbox's transaction, decoded or verbatim, and a fact is halted on, never
parked or dropped (BEH-ES-030, revision 0.4). (5) Chains see only the stored form
(BEH-ES-031, BEH-ES-032). (6) Stored payloads use the bus's `PayloadCodec` as BEH-DB-008 states it,
and a published event's payload is encoded once (BEH-ES-032, revision 0.2).
(7) A published event is published on its event-store stream unless the
registration names another, and its stored attribution is its envelope's
(BEH-ES-028, revision 0.6). (8) Every payload change raises the version
(BEH-ES-025, revision 0.6).

**Open.** (1) Whether a payload made unreadable on purpose should let a
projection pass the event instead of halting; with the keyring codec a
shred yields field markers and halts nothing (BEH-ES-032). (2) Whether
the chain link should be written in the append's transaction instead of by a
follower.

---

_Previous: [03 — Projections and snapshots](./03-projections-and-snapshots.md)_ · _Next: [05 — Storage port and acceptance](./05-storage-port-and-acceptance.md)_
