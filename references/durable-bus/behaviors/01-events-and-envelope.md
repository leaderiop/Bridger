# 01 — Events and the envelope

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-01                                            |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09), second pass (cleanest design) — BEH-DB-008: `PayloadCodec.encode` takes the transaction the payload is written in as an explicit argument, which `publish` passes; a codec writes only in it, after `fence`, and never looks for a transaction in its environment (CCR-DB-012)<br>0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — BEH-DB-008: a codec failure writes no outbox row, and a key the keyring's codec created before it is the keyring's write in the caller's transaction (PL20) (CCR-DB-011)<br>0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07 residual) — BEH-DB-004: after a failed store-swap `apply`, the `OriginChange` is emitted once the `apply-pending` hold lifts; BEH-DB-008: `publish` runs `PayloadCodec.encode` after `DurableBus.fence(tx)` (CCR-DB-010)<br>0.9 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, H9) — BEH-DB-004: the bus records its incarnation keyed by node through `OutboxStore.recordIncarnation`, at start and after every raise; an incarnation recorded for another node never blocks the start and is left unchanged (CCR-DB-006)<br>0.8 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-DB-004: a whole-store re-bootstrap raises the incarnation before the install runs, and the old origin is never used again once raised (H8) (CCR-DB-005)<br>0.7 (2026-11-09): Specification audit of 2026-11-09 — BEH-DB-001 states that every change of the encoded payload, an added optional field included, raises the version (C-11); BEH-DB-003 takes the stream from `publish`'s `options.stream` when given (F-05); BEH-DB-004 adds `DurableBus.origin` and `originChanges` and confines an origin change to a whole-store re-bootstrap (U-10); BEH-DB-005 takes `causationId` from `options.causationId` outside a handler (C-20) (CCR-DB-004)<br>0.6 (2026-11-08): Round-2 agent review (R4 F12, F26; R5-04/05, R5-06, R5-08) — `IncarnationSource`, raised by a whole-store re-bootstrap; downstream signature of an unraised restore stated; codec rotation through `decodes`; write order schema → downcast → codec; `PayloadUnreadable` under the subscription's `onUnreadable` ("park" or "halt") or read undecoded through `subscribeEnvelopes`, never dropped; codec markers pass through upcasters; erasure sentence narrowed to holders without another copy of the key (CCR-DB-003)<br>0.5 (2026-11-08): BEH-DB-008 cites URS-BR-059 (registered by core CCR-BR-027) instead of a proposal (CCR-DB-003)<br>0.4 (2026-11-08): round 2: recheck items 21 and 25, CORE-DECISIONS-2 — BEH-DB-008 `PayloadCodec` and the no-personal-data guidance for annotations, actors, the call log and audit `reason`; `onBehalfOf` as `PrincipalRef.encode`; correlation from `CurrentCorrelation` and set for handlers through `CallerContext.serve` (CCR-DB-003)<br>0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — annotations carried as core `AnnotationEntry[]` under flow "wire" (BEH-BR-296), the deadline never carried; envelope-level stops for unknown formats and conflicts; check 6 and the incarnation rule restated as an operator obligation (CCR-DB-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

An event that outlives a process needs a declared shape, a version, and an
envelope that says where it came from, in which stream and position, when
(in a clock that orders causally), and on whose behalf. This file fixes the
declaration, the envelope and the identities in it. This file owns
BEH-DB-001–008 and uses all eight.

Planned source: `packages/durable-bus/src/DurableEvent.ts` and
`packages/durable-bus/src/Envelope.ts` *(Planned)*.

## BEH-DB-001: DurableEvent.make declares a versioned event

> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md), [ADR-DB-001](../decisions/001-a-separate-contract-from-the-core-bus.md)
> **Satisfies:** [URS-BR-013](../../core/urs.md#urs-br-013-exchange-typed-events-between-plugins)

```ts
// illustrative — not type-checked
type Upcaster = (encoded: unknown) => Effect.Effect<unknown, UpcastFailed>   // no services: R = never

interface DurableEventOptions<A> {
  readonly version: number                                 // positive integer, the current version
  readonly upcast?: Readonly<Record<number, Upcaster>>     // key k: encoded v(k) -> encoded v(k+1)
  readonly minVersion?: number                             // oldest accepted; default: lowest k with a chain to `version`, else `version`
  readonly stream?: (event: A) => string                   // default: () => id
}

interface DurableEvent<A, I> {
  readonly id: string
  readonly version: number
  readonly minVersion: number
  readonly schema: Schema.Codec<A, I>
  readonly upcast: Readonly<Record<number, Upcaster>>
  readonly stream: (event: A) => string
}

declare const DurableEvent: {
  make<A, I>(id: string, schema: Schema.Codec<A, I>, options: DurableEventOptions<A>): DurableEvent<A, I>
}
```

```
REQUIREMENT: `DurableEvent.make` MUST reject, at the call, a `version` that is
             not a positive integer, an `upcast` key outside
             [minVersion, version − 1], and a chain with a missing step
             between `minVersion` and `version`, by throwing a defect
             naming the event id. A declaration error MUST NOT be deferred to
             the first publish or receive.
```

```
REQUIREMENT: The schema MUST be an Effect Schema codec without service
             requirements for decoding or encoding; upcasters MUST have no
             service requirements. Decoding MUST ignore unknown fields.
```

```
REQUIREMENT: Documentation MUST state the evolution rule of a declared
             event: every change of the encoded payload, an added field
             included whether optional or not, MUST raise `version` and add
             the upcaster from the previous version (BEH-DB-028). `version`
             MAY stay only for a change that leaves the encoding of every
             value as it was.
```

```
REQUIREMENT: Event ids are a namespace of this package, separate from core
             `EventKey` ids. Ids SHOULD follow `domain/action`; a change that
             cannot be upcast MUST take a new id.
```

**Settled here.** Upcasters work on the *encoded* form, one step at a time,
so a v1 envelope stored years ago is read by running v1→v2→…→current and
then decoding once with the current schema. Working on encoded data means
old schemas need not be kept as code, only their transformations. An added
optional field raises the version, unlike an additive change of a service
contract within one major (core BEH-BR-230): an event is a record that
older hosts keep and pass on. A reader at the old version that decodes the
event ignores the new field, so a host that records or re-publishes what it
decoded would drop the field without a trace; under a raised version the
same reader halts or parks the envelope (BEH-DB-026), and a writer that
must still publish the old version refuses a value the old version cannot
carry (BEH-DB-031).

## BEH-DB-002: The envelope

> **Invariant:** [INV-DB-002](../invariants.md#inv-db-002-sequence-is-contiguous-per-origin-and-stream)
> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md), [ADR-DB-008](../decisions/008-actor-and-annotations-are-claims.md)
> **Depends on:** [core 30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md) (BEH-BR-289–296)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)

```ts
// illustrative — not type-checked
interface Envelope {
  readonly envelope: 1                       // envelope format version
  readonly eventId: string                   // IdGenerator
  readonly type: string                      // DurableEvent.id
  readonly version: number                   // version the payload was encoded at
  readonly origin: string                    // origin id, incarnation included (BEH-DB-004)
  readonly stream: string
  readonly sequence: number                  // 1, 2, 3 … per (origin, stream)
  readonly hlc: Hlc                          // 05
  readonly occurredAt: string                // Clock, ISO 8601; informational
  readonly actor: Actor                      // claim of the origin (BEH-DB-006)
  readonly onBehalfOf?: string               // PrincipalRef.encode of the publishing plugin's principal (core BEH-BR-280)
  readonly annotations: readonly AnnotationEntry[]          // core 30 encoding of the carried subset (BEH-DB-007)
  readonly annotationsOmitted: readonly string[]             // `omitted` of Annotations.encode (BEH-BR-289)
  readonly correlationId: string
  readonly causationId?: string              // eventId of the envelope that caused this one
  readonly codec?: string                    // id of the PayloadCodec that encoded `payload`, absent for the identity codec (BEH-DB-008)
  readonly payload: unknown                  // encoded with the event schema at `version`, then by the codec
}
```

```
REQUIREMENT: Every envelope MUST carry every field above except
             `onBehalfOf` and `causationId`, which are optional. The envelope
             MUST be described by an Effect Schema whose decode ignores
             unknown fields. An element whose `envelope` value is not 1 but
             whose `origin`, `stream` and `sequence` decode MUST stop that
             (origin, stream) at the inbox with `UnknownEnvelopeFormat`
             (BEH-DB-022, inbox level); an element in which those three do
             not decode MUST make `receive` refuse the whole batch (BEH-DB-018).
```

```
REQUIREMENT: `eventId` MUST come from core's `IdGenerator`, `occurredAt` and
             the physical part of `hlc` from `Clock`. Ambient time and
             randomness MUST NOT be used.
```

```
REQUIREMENT: `payload` MUST be the encoded output of the event's schema at
             `version`, passed through the bus's `PayloadCodec` (BEH-DB-008).
             Configuration values of plugins MUST NOT be placed in an
             envelope by this package.
```

```
REQUIREMENT: `onBehalfOf` MUST be `PrincipalRef.encode` of the publishing
             fiber's plugin principal (core BEH-BR-280), and a receiver MUST
             read it with `PrincipalRef.decode`, treating a string that does
             not decode as absent and reporting it. It is a claim of the
             origin, like the actor (BEH-DB-006).
```

## BEH-DB-003: Streams

> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: The stream of an envelope MUST be `options.stream` when the
             caller of `publish` gives one (02, BEH-DB-009), and otherwise
             `event.stream(payload)`, a string computed by a pure function
             of the payload. A stream MUST be a non-empty string; an empty
             one MUST fail `publish` with a defect naming the event id, and
             nothing is written. Ordering MUST be guaranteed only within one
             (origin, stream).
```

```
REQUIREMENT: An application that needs two event types ordered relative to
             each other MUST place them in one stream.
```

Streams let unrelated flows proceed independently — a slow subscriber of
`stock` does not hold back `sales` — while keeping order where it matters.
The declared `stream` suits a stream that the payload names. `options.stream`
serves a publisher that keeps its own ordering scope, such as an event-store
stream or a number series: it publishes on that scope without copying the
scope's id into every payload (event-store BEH-ES-028).

## BEH-DB-004: An origin is an incarnation, never reused

> **Invariant:** [INV-DB-002](../invariants.md#inv-db-002-sequence-is-contiguous-per-origin-and-stream)
> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: The origin id MUST be configured as (node, incarnation) and
             written as node + "#" + incarnation. The bus MUST refuse to
             start without it.
```

```
REQUIREMENT: A node whose store was restored from a backup, replaced or wiped
             MUST start a new incarnation. Starting the new incarnation is
             the operator's obligation: the package cannot detect a restore,
             because a restored store also restores the incarnation it
             recorded. The bus MUST record its incarnation in the store,
             keyed by its node, through `OutboxStore.recordIncarnation`
             (BEH-DB-012) — at start and after every raise (06, BEH-DB-048)
             — and MUST refuse to start when the configured incarnation is
             lower than the one `OutboxStore.incarnation` returns for its
             own node; documentation MUST recommend keeping the configured
             incarnation in storage the store's backups do not cover, and
             raising it on every restore.
```

```
REQUIREMENT: An incarnation the store records for another node — a store
             copied from another host, such as the snapshot a whole-store
             install brings (06, BEH-DB-048) — MUST NOT block the start and
             MUST NOT be compared with this node's: the bus reads and
             records only its own node's entry and leaves every other entry
             as it is. A store with no entry for this node MUST be started
             as one that recorded nothing, and the configured incarnation
             recorded.
```

```ts
// illustrative — not type-checked
// Context.Service "@bridger/durable-bus/IncarnationSource" — optional; kept outside the store it numbers
interface IncarnationSource {
  readonly current: Effect.Effect<number, IncarnationUnavailable>
  readonly raise: Effect.Effect<number, IncarnationUnavailable>   // persists current + 1 and returns it
}
// DurableBus.plugin options: incarnation: number | Context.Key<any, IncarnationSource>

// DurableBus gains:
//   origin: Effect.Effect<string>                 // the origin `publish` stamps now: node + "#" + incarnation
//   originChanges: Stream.Stream<OriginChange>    // one element per switch (06, BEH-DB-048)
interface OriginChange { readonly previous: string; readonly current: string }
```

```
REQUIREMENT: When the bus is given an `IncarnationSource`, it MUST read the
             incarnation from `current` at start, under the same refusal
             rule. A re-bootstrap that replaces the whole store (06,
             BEH-DB-048) MUST raise it through `raise` before the
             application's install runs, and the bus MUST then record the
             new incarnation for its node, through `recordIncarnation`, in
             the store the install left and use the new
             origin for every later envelope; once raised, the old origin
             MUST NOT be used again, even when the install fails or the
             process stops before the incarnation is recorded. Without an
             `IncarnationSource`, a whole-store re-bootstrap MUST be refused
             (BEH-DB-048).
```

```
REQUIREMENT: `DurableBus.origin` MUST return the origin that `publish`
             stamps on the next envelope. While the bus runs, the origin
             MUST change only through a whole-store re-bootstrap, while the
             outbox is frozen (BEH-DB-048). When it changes, the bus MUST
             emit one `OriginChange` on `originChanges` (after a failed
             store-swap `apply`, only once the `apply-pending` hold lifts,
             BEH-DB-048) and report
             `origin-changed { previous, current }` once the new
             incarnation is recorded. A component that stamps the origin
             or derives identifiers from it (the event-store and sequence
             companions) MUST read `origin` at each use and MUST NOT keep it
             across calls.
```

```
REQUIREMENT: Documentation MUST state what a restore without a raised
             incarnation looks like downstream: a receiver that still holds
             the first `eventId` at a reissued (origin, stream, sequence)
             stops that stream with `EnvelopeConflict` and records nothing
             more from it; a receiver that has purged it absorbs the
             reissued envelope as a repeat (BEH-DB-018). In neither case is
             the reissued envelope stored, so a consumer that reads stored
             envelopes (for example a series check of the sequence
             companion) never sees the duplicate: it sees a stopped stream,
             or nothing.
```

```
REQUIREMENT: When a receiver sees one (origin, stream, sequence) with two
             different `eventId`s, it MUST keep the envelope already stored,
             stop that (origin, stream) at the inbox with `EnvelopeConflict`
             (BEH-DB-022, inbox level) and report it; it MUST NOT pick one.
             The check is possible only while the inbox still holds the
             stored envelope's `eventId` (BEH-DB-018).
```

**Settled here.** A store restored from yesterday's backup would issue
sequence numbers that were already used; giving it a new incarnation keeps
every (origin, stream, sequence) unique, and the conflict check catches the
case where the rule was not followed. The old incarnation's last sequence
tells the authority what was lost. The refusal at start catches only a
configuration lower than the store; it does not catch a restore whose
configuration was not raised, which only the conflict check — at a receiver
that still holds the first envelope — can reveal. Uniqueness of origins is
therefore an operator obligation the package supports, not a property it
provides ([INV-DB-002](../invariants.md#inv-db-002-sequence-is-contiguous-per-origin-and-stream)).

## BEH-DB-005: Correlation and causation

> **See:** [ADR-DB-008](../decisions/008-actor-and-annotations-are-claims.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)

```
REQUIREMENT: `correlationId` MUST be the publishing fiber's
             `CurrentCorrelation` (core BEH-BR-187) when one is set, and a
             new identifier from the `IdGenerator` otherwise. When `publish` runs inside a subscription handler,
             `causationId` MUST be the handled envelope's `eventId` and
             `correlationId` MUST be the handled envelope's. Outside a
             handler, `causationId` MUST be `options.causationId` (02,
             BEH-DB-009) when given, and absent otherwise.
```

This gives every chain of events one correlation and an explicit parent, so
that an authority can reconstruct why a downstream event exists.

## BEH-DB-006: The actor is carried, and on receipt it is a claim

> **See:** [ADR-DB-008](../decisions/008-actor-and-annotations-are-claims.md), [ADR-BR-029](../../core/decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e) and ALCOA+ "attributable" for the consumer's records

```
REQUIREMENT: `actor` MUST be the `CurrentActor` of the publishing fiber;
             `publish` MUST NOT accept an actor argument that differs from
             it. When the actor is `Actor.unattributed` and the bus was made
             with `requireActor: true`, `publish` MUST fail with
             `Unattributed`.
```

```
REQUIREMENT: On receipt, a handler MUST run with an `OperationContext` whose
             actor is the envelope's actor and whose annotations include a
             provenance annotation (core 30, `Annotation.Provenance` entry
             `{ source: origin, ref: eventId }`) naming the origin, so that
             the actor is visibly asserted by that origin (BEH-DB-007 says
             how the context is applied).
```

```
REQUIREMENT: The package MUST NOT authenticate the actor, and its
             documentation MUST NOT describe a received actor as verified.
```

## BEH-DB-007: Annotations travel under flow "wire", and taint is never dropped

> **See:** [ADR-DB-008](../decisions/008-actor-and-annotations-are-claims.md)
> **Depends on:** [core 30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md) (taint, provenance, host boundaries; BEH-BR-289–296)

```
REQUIREMENT: `publish` MUST set `annotations` and `annotationsOmitted` from
             `Annotations.encode(Annotations.filter(bag, "wire"))`, where
             `bag` is the publishing fiber's `CurrentAnnotations`
             (BEH-BR-296). A key whose flows do not include "wire" MUST NOT
             be carried. The bus option `carry` MAY narrow the carried keys
             further, but MUST NOT exclude `bridger:taint` or
             `bridger:provenance`; a `carry` that lists neither still
             carries both.
```

```
REQUIREMENT: `Annotation.Deadline` MUST NOT be carried (it declares no
             "wire" flow). The bus MUST NOT start a deadline on the receiver
             from anything in an envelope: delivery is asynchronous, and no
             remaining time of the publishing call applies to its handlers.
```

```
REQUIREMENT: On receipt, the stored entries MUST be decoded with
             `Annotations.decode(envelope.annotations, keys)`, `keys` being
             the core keys plus the bus option `annotationKeys`. Rejected
             entries MUST stay in the stored envelope, unapplied, and be
             listed in the handler's receipt (`rejectedAnnotations`). The
             handler MUST run inside `CallerContext.serve({ actor:
             envelope.actor, annotations, correlationId:
             envelope.correlationId })` (BEH-BR-292), `annotations` being
             the decoded bag with the provenance entry of BEH-DB-006 added,
             so that `CurrentCorrelation` is the envelope's for the
             handler's work, so that the decoded values are combined into the
             handler fiber's annotations and a monotonic key received
             cannot be removed by the handler.
```

**Settled here.** Which keys cross hosts is decided by each key's owner when
it declares the "wire" flow (BEH-BR-296), not by this package; `carry` can
only narrow that set. Taint and provenance always travel: an event derived
from untrusted input stays marked as such wherever it goes. The deadline
never travels: it is an instant on the publisher's clock, usually long past
when the event is handled, and being monotonic it could not be removed once
applied.

## BEH-DB-008: A PayloadCodec encodes payloads, and records carry no personal data

> **Invariant:** [INV-DB-010](../invariants.md#inv-db-010-a-payload-reaches-storage-and-the-wire-only-through-the-payload-codec)
> **See:** [ADR-DB-008](../decisions/008-actor-and-annotations-are-claims.md)
> **Satisfies:** [URS-BR-013](../../core/urs.md#urs-br-013-exchange-typed-events-between-plugins), [URS-BR-059](../../core/urs.md#urs-br-059-make-a-persons-event-payloads-unreadable-without-breaking-their-order)
> **Risk:** [RSK-BR-031](../../core/gxp/03-risk-assessment.md#rsk-br-031)

```ts
// illustrative — not type-checked
// Context.Service "@bridger/durable-bus/PayloadCodec" — optional; default PayloadCodec.identity
interface PayloadCodec {
  readonly id: string                                   // written to Envelope.codec; "identity" is never written
  readonly decodes?: readonly string[]                  // codec ids it can read, `id` included; default [id] (rotation)
  // `tx`: the transaction the payload is written in, passed by `publish` and by event-store's append; the only one
  // a codec that writes (the keyring's, creating a key) may write in
  readonly encode: (event: { readonly type: string; readonly version: number; readonly stream: string },
                    encoded: unknown, tx: StoreTransaction["Service"]) => Effect.Effect<unknown, PayloadEncodeFailed>
  readonly decode: (envelope: Pick<Envelope, "type" | "version" | "stream" | "codec">, payload: unknown) =>
    Effect.Effect<unknown, PayloadDecodeFailed | PayloadUnreadable>
}
declare const PayloadCodec: { readonly identity: PayloadCodec }
// PayloadUnreadable: the codec can no longer read the payload (for example its key was destroyed)
```

```
REQUIREMENT: `publish` MUST pass the schema-encoded payload through
             `PayloadCodec.encode` inside the caller's transaction, after
             `DurableBus.fence(tx)` (06, BEH-DB-048) and before the outbox
             append, passing that transaction `tx` as `encode`'s argument,
             and MUST write the codec's `id` in
             `Envelope.codec` unless the codec is the identity. A failure
             MUST fail `publish` with `PayloadEncodeFailed` and write no
             outbox row; a key the keyring's codec created in the caller's
             transaction before the failure is the keyring's write, not the
             bus's, kept if the caller catches the error and commits (02,
             BEH-DB-009; keyring BEH-KR-017). A codec that writes MUST
             write only in the `tx` it is passed, after `DurableBus.fence(tx)`
             with it (admitted again, since every caller of `encode` has
             fenced that transaction first), and MUST NOT look for a
             transaction anywhere else, the reading fiber's environment
             included; `decode` writes nothing and is passed none.
```

```
REQUIREMENT: Writing MUST run the schema encoding at the event's
             `version`, then the downcast when `publishVersion` is N−1
             (BEH-DB-031), then `PayloadCodec.encode`. Reading MUST run
             `PayloadCodec.decode`, then the upcasters (BEH-DB-025), then
             the schema. An envelope whose `codec` is neither absent nor in
             the codec's `decodes` MUST be handled as unreadable under the
             subscription's `onPoison` with `PayloadDecodeFailed`, so that a
             codec rotated to a new `id` keeps reading history as long as
             it lists the old one.
```

```
REQUIREMENT: A `PayloadUnreadable` MUST be handled under the
             subscription's `onUnreadable` (03, BEH-DB-020): by default
             ("park") it parks the envelope for that subscription with that
             tag and does not halt the stream, since a payload made
             unreadable on purpose is an expected outcome, not a poison;
             with "halt" it halts that (origin, stream) for the
             subscription, as a poison under `onPoison: "halt"` would. A
             recorder that must keep every fact — the event-store
             companion's `receive` — either halts, or reads through
             `subscribeEnvelopes` (03, BEH-DB-020), which never decodes and
             so never meets `PayloadUnreadable`, and stores the payload and
             `codec` exactly as received. No mode drops the envelope.
```

```
REQUIREMENT: Values a codec returns in place of fields it cannot reveal
             (for example the keyring companion's `Shredded` markers) MUST
             be passed to the upcasters and the schema unchanged; a codec
             that returns such markers MUST document them, and upcasters
             MUST pass a marker they do not know through unchanged.
```

```
REQUIREMENT: The codec MUST NOT change any envelope field other than
             `payload` and `codec`; origin, stream, sequence, HLC, actor,
             `onBehalfOf`, correlation and annotations stay readable without
             it, so that ordering, deduplication and access checks work on
             payloads nobody can read.
```

```
REQUIREMENT: Documentation MUST state, for application authors, that
             personal data belongs only in payloads, where a codec can
             encrypt it, and MUST NOT be placed in: an annotation value, the
             actor's id or display fields, an event id, a stream name or an
             origin; a core `CallLog` entry (its member names, reasons and
             error tags); or the `reason` of an `OperationContext`, which
             core writes to the audit trail. Those fields are copied to
             logs, the call log and audit records that a codec never sees
             and that cannot be erased selectively.
```

**Settled here.** (1) The codec is a port so that field encryption with
per-subject keys — the planned keyring companion's job — can be added
without this package holding keys or choosing ciphers; destroying a key
then makes that subject's payloads unreadable to any holder that has no
other copy of the key (see the keyring companion's BEH-KR-022), while the
stream's order and identities stay intact. This package does not erase
anything. (2) The codec runs after schema encoding and the downcast on
write and before upcasting on read, so upcasters work on plaintext and stay
pure; the plaintext a subscription handler or `forward` (07, BEH-DB-050)
receives is outside the codec's reach (INV-DB-010). (3) The rule about where personal data may go is
guidance this package states, not a check it performs: the fields named are
strings it cannot classify.

---

_Next: [02 — Transactional outbox](./02-transactional-outbox.md)_
