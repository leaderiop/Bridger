# 01 — Events and the envelope

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — annotations carried as core `AnnotationEntry[]` under flow "wire" (BEH-BR-296), the deadline never carried; envelope-level stops for unknown formats and conflicts; check 6 and the incarnation rule restated as an operator obligation (CCR-DB-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

An event that outlives a process needs a declared shape, a version, and an
envelope that says where it came from, in which stream and position, when
(in a clock that orders causally), and on whose behalf. This file fixes the
declaration, the envelope and the identities in it. This file owns
BEH-DB-001–008 and uses BEH-DB-001–007; BEH-DB-008 is reserved.

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
REQUIREMENT: Event ids are a namespace of this package, separate from core
             `EventKey` ids. Ids SHOULD follow `domain/action`; a change that
             cannot be upcast MUST take a new id.
```

**Settled here.** Upcasters work on the *encoded* form, one step at a time,
so a v1 envelope stored years ago is read by running v1→v2→…→current and
then decoding once with the current schema. Working on encoded data means
old schemas need not be kept as code, only their transformations.

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
  readonly onBehalfOf?: string               // plugin principal (core 28), when present
  readonly annotations: readonly AnnotationEntry[]          // core 30 encoding of the carried subset (BEH-DB-007)
  readonly annotationsOmitted: readonly string[]             // `omitted` of Annotations.encode (BEH-BR-289)
  readonly correlationId: string
  readonly causationId?: string              // eventId of the envelope that caused this one
  readonly payload: unknown                  // encoded with the event schema at `version`
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
             `version`. Configuration values of plugins MUST NOT be placed in
             an envelope by this package.
```

## BEH-DB-003: Streams

> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: The stream of an event MUST be `event.stream(payload)`, a string
             computed by a pure function of the payload. Ordering MUST be
             guaranteed only within one (origin, stream).
```

```
REQUIREMENT: An application that needs two event types ordered relative to
             each other MUST place them in one stream.
```

Streams let unrelated flows proceed independently — a slow subscriber of
`stock` does not hold back `sales` — while keeping order where it matters.

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
             recorded. The storage adapter MUST record the incarnation in the
             store and the bus MUST refuse to start when the configured
             incarnation is lower than the one recorded; documentation MUST
             recommend keeping the configured incarnation in storage the
             store's backups do not cover, and raising it on every restore.
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
REQUIREMENT: `correlationId` MUST be the `correlationId` of the publishing
             fiber's `OperationContext` when one is set, and a new identifier
             otherwise. When `publish` runs inside a subscription handler,
             `causationId` MUST be the handled envelope's `eventId` and
             `correlationId` MUST be the handled envelope's.
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
             envelope.actor, annotations })` (BEH-BR-292), `annotations`
             being the decoded bag with the provenance entry of BEH-DB-006
             added, so that the decoded values are combined into the
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

---

_Next: [02 — Transactional outbox](./02-transactional-outbox.md)_
