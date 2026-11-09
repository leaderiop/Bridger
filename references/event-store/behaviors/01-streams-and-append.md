# 01 — Streams and Append

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-BEH-01                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-09): Specification audit of 2026-11-09 — BEH-ES-001 `publish.stream` takes the event-store stream and the event (F-05); BEH-ES-007 serves an append's `context` over the whole append, publication included, draws one correlation for the stored event and its envelope, and reads the origin from durable-bus `DurableBus.origin` at each append (C-20, U-10) (CCR-ES-003)<br>0.5 (2026-11-08): BEH-ES-003 `AppendError` gains the durable-bus `publish` errors `DowncastRefused`, `AccessRefused` and `OutboxFrozen` (durable-bus BEH-DB-009) (round-2 integration) (CCR-ES-002)<br>0.4 (2026-11-08): BEH-ES-002 adds `factId` and states one rule for `eventId` (never a fact id or a received id); BEH-ES-003 defines `AppendError` (with `PayloadEncodeFailed`) and `LoadError` once (CCR-ES-002)<br>0.3 (2026-11-08): BEH-ES-001, 002, 003 and 005 cite URS-BR-056 (registered by core CCR-BR-027) (CCR-ES-001)<br>0.2 (2026-11-08): BEH-ES-002 `StoredEvent.codec`; BEH-ES-002 and BEH-ES-006 cite the `PayloadCodec` of durable-bus BEH-DB-008 (CCR-ES-001, revision bump)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

A stream is an ordered, append-only list of events with one identifier. This
file specifies the stored form of an event, `Stream.append` with an expected
version, the `WrongExpectedVersion` refusal, reads, attribution, and the
store-wide position that projections follow. This file owns BEH-ES-001–008
and uses all eight.

> **What this package does not do — and who does**
>
> The package does not define a single domain event (the application does,
> [ADR-ES-001](../decisions/001-the-application-keeps-the-domain.md)), does
> not open a database (the adapter does, [05](./05-storage-port-and-acceptance.md)),
> and does not make an acknowledged write survive a crash (the engine and the
> consumer's configuration do, or do not).

Planned source: `packages/event-store/src/Stream.ts`,
`packages/event-store/src/EventStore.ts` *(Planned)*.

## BEH-ES-001: Event types are durable-bus DurableEvents registered with the store

> **See:** [ADR-ES-002](../decisions/002-one-event-declaration-for-storage-and-delivery.md)
> **Depends on:** [BEH-DB-001](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-001-durableeventmake-declares-a-versioned-event)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect), [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)

```ts
// illustrative — not type-checked
interface RegisterOptions<A> {
  // true: publish on the event-store stream; `stream` maps (event-store stream, event) to another delivery stream
  readonly publish?: boolean | { readonly stream?: (stream: string, event: A) => string }   // 04, BEH-ES-028
}
declare const EventStore: {
  readonly register: <A, I>(event: DurableEvent<A, I>, options?: RegisterOptions<A>) => Effect.Effect<void, DuplicateEventType>
}
```

```
REQUIREMENT: Every event the store writes or reads MUST be declared with
             durable-bus `DurableEvent.make` and registered with the store
             before the first append or read of its type. An append of an
             unregistered type MUST fail with `UnregisteredEventType { type }`
             and write nothing. Registering two declarations with one `id`
             MUST fail with `DuplicateEventType { type }`.
```

```
REQUIREMENT: The package MUST NOT define a second event declaration form. An
             event's `id`, current `version`, `minVersion` and upcasters are
             those of its `DurableEvent`, for storage and for delivery alike.
```

One declaration serves both the stored form and the published envelope, so a
version raised for one is raised for the other, and an upcaster written for
replay also serves delivery
([ADR-ES-002](../decisions/002-one-event-declaration-for-storage-and-delivery.md)).

## BEH-ES-002: The stored event

> **Invariant:** [INV-ES-003](../invariants.md#inv-es-003-stored-events-are-never-rewritten-or-deleted-by-the-package)
> **See:** [ADR-ES-002](../decisions/002-one-event-declaration-for-storage-and-delivery.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-209, BEH-BR-210)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect), [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)

```ts
// illustrative — not type-checked
interface StoredEvent {
  readonly stored: 1                          // stored-form version
  readonly eventId: string                    // this store's id: IdGenerator, or the id of the envelope it published (BEH-ES-028)
  readonly factId?: string                    // the fact's identity, on the first event of a recorded fact only (BEH-ES-015)
  readonly stream: string                     // non-empty, at most 256 UTF-8 bytes
  readonly streamVersion: number              // 1, 2, 3 … per stream (BEH-ES-003)
  readonly position: number                   // store-wide, assigned by the adapter (BEH-ES-008)
  readonly type: string                       // DurableEvent.id
  readonly version: number                    // version the payload was encoded at
  readonly payload: unknown                   // encoded at `version`, after the PayloadCodec (04, BEH-ES-032)
  readonly codec?: string                     // the PayloadCodec's id; absent for the identity codec (durable-bus BEH-DB-008)
  readonly recordedAt: string                 // Clock, ISO 8601; informational
  readonly origin: string                     // durable-bus origin, node#incarnation (BEH-DB-004); BEH-ES-007
  readonly actor: Actor                       // BEH-ES-007
  readonly onBehalfOf?: string                // PrincipalRef.encode (core BEH-BR-280)
  readonly correlationId: string
  readonly causationId?: string
  readonly annotations: readonly AnnotationEntry[]
  readonly annotationsOmitted: readonly string[]
}
```

```
REQUIREMENT: The store MUST write exactly the fields above. `eventId` MUST
             come from core's `IdGenerator`, except for an event the store
             publishes, whose `eventId` MUST be the published envelope's
             (BEH-ES-028). `eventId` MUST NOT be set from a fact identifier
             or from a received envelope's `eventId`: a fact's identity is
             `factId` (BEH-ES-015), and a received envelope's id is the
             stored event's `causationId` (BEH-ES-030). `recordedAt` MUST
             come from core's `Clock`. The package MUST read no ambient time
             or randomness.
```

```
REQUIREMENT: `payload` MUST be the event schema's encoding at the event's
             current `version`, passed through the `PayloadCodec` of
             durable-bus BEH-DB-008 when one is wired, with `codec` its `id`
             (BEH-ES-032). The package MUST NOT store a decoded value.
```

`recordedAt` is informational, as `occurredAt` is in the delivery companion
(BEH-DB-038): order is given by `streamVersion` within a stream and by
`position` within a store, never by the clock.

## BEH-ES-003: Stream.append takes an expected version

> **Invariant:** [INV-ES-001](../invariants.md#inv-es-001-stream-versions-are-contiguous-from-1-one-event-per-version), [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
> **See:** [ADR-ES-004](../decisions/004-optimistic-concurrency-per-stream.md)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect), [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)
> **Risk:** [RSK-ES-001](../risks.md#rsk-es-001)

```ts
// illustrative — not type-checked
type ExpectedVersion = number | "no-stream" | "stream-exists" | "any"

interface AppendOptions {
  readonly expectedVersion: ExpectedVersion            // required: no default
  readonly context?: OperationContext                  // core 22
  readonly causationId?: string
}
interface AppendResult {
  readonly stream: string
  readonly from: number                                // streamVersion of the first appended event
  readonly to: number                                  // streamVersion of the last; the stream's new version
  readonly events: readonly StoredEvent[]
}
// The two error unions of the package, defined once and used by every signature in 01–05.
// WrongExpectedVersion (BEH-ES-004) and StoreContention (BEH-ES-013) are not members: each signature lists them where they occur.
type AppendError = UnregisteredEventType | EncodeFailed | PayloadEncodeFailed | DowncastRefused | AccessRefused | OutboxFrozen
                  | StoreWriteFailed | OutboxWriteFailed | Unattributed   // the publish errors of durable-bus BEH-DB-009
type LoadError   = UnknownEventVersion | UpcastFailed | DecodeFailed | StoreUnavailable      // EvolveFailed is a defect (BEH-ES-010)
declare const Stream: {
  readonly append: <A, I>(id: string, events: readonly EventOf<A, I>[], options: AppendOptions) =>
    Effect.Effect<AppendResult, WrongExpectedVersion | AppendError, EventStore | StoreTransaction>
}
```

```
REQUIREMENT: `expectedVersion` MUST be stated on every append. A number n
             MUST match a stream whose current version is n (0 means the
             stream has no event); "no-stream" MUST match only a stream with
             no event; "stream-exists" only a stream with at least one;
             "any" every stream.
```

```
REQUIREMENT: When the expected version matches, the appended events MUST
             receive the stream versions current + 1 … current + k, in the
             order given, and the append MUST return them. An empty `events`
             MUST append nothing, check the expected version, and return
             `from = to = current`.
```

```
REQUIREMENT: The check and the write MUST be atomic with respect to every
             other append to the same stream in the same store: two appends
             that both expected version n MUST NOT both commit (adapter
             obligation, BEH-ES-033).
```

"any" exists for streams the application knows to have one writer — a
terminal's own fact stream, say — and is never the default: a missing
expected version is a type error, so the choice is visible in review.

## BEH-ES-004: WrongExpectedVersion is a typed refusal that writes nothing

> **Invariant:** [INV-ES-001](../invariants.md#inv-es-001-stream-versions-are-contiguous-from-1-one-event-per-version)
> **See:** [ADR-ES-004](../decisions/004-optimistic-concurrency-per-stream.md)
> **Risk:** [RSK-ES-001](../risks.md#rsk-es-001)

```ts
// illustrative — not type-checked
class WrongExpectedVersion extends Data.TaggedError("WrongExpectedVersion")<{
  readonly stream: string
  readonly expected: ExpectedVersion
  readonly actual: number | "unknown"          // "unknown" when the adapter detects the conflict only at commit
}> {}
```

```
REQUIREMENT: When the expected version does not match, `append` MUST fail
             with `WrongExpectedVersion` and MUST write no event and no
             outbox entry. It MUST NOT retry by itself.
```

```
REQUIREMENT: An adapter that detects the conflict only when the transaction
             commits MUST fail the transaction combinator with
             `WrongExpectedVersion { actual: "unknown" }`, never with a
             generic storage error, so that callers can tell a conflict from
             an outage.
```

`WrongExpectedVersion` is an expected outcome of optimistic concurrency, not
a fault. Retrying is the caller's choice, and the only safe retry re-reads the
stream and decides again: `Aggregate.run` does exactly that (02,
BEH-ES-012).

## BEH-ES-005: Append runs inside the caller's StoreTransaction

> **Invariant:** [INV-ES-002](../invariants.md#inv-es-002-an-append-and-its-outbox-entries-commit-together-or-not-at-all)
> **See:** [ADR-ES-003](../decisions/003-append-in-the-callers-transaction-with-the-outbox.md)
> **Depends on:** [BEH-DB-009](../../durable-bus/behaviors/02-transactional-outbox.md#beh-db-009-publish-runs-inside-the-callers-transaction)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect), [URS-BR-056](../../core/urs.md#urs-br-056-keep-event-sourced-business-streams-with-the-outbox-in-one-transaction)
> **Risk:** [RSK-ES-003](../risks.md#rsk-es-003)

```
REQUIREMENT: `append` MUST require durable-bus `StoreTransaction` in its
             environment, so that an append outside a transaction is a
             compile error. The store MUST NOT open, commit or roll back a
             transaction inside `append`.
```

```
REQUIREMENT: All events of one append, their outbox entries (BEH-ES-028),
             inline projection writes (BEH-ES-018) and any other write the
             caller makes with the same `StoreTransaction` — a number of
             the sequence companion, the application's own tables — MUST
             commit together or not at all. When the transaction rolls back,
             none of them MUST be visible to any reader.
```

The single transaction is the point of the package: the state change, the
events that describe it, their publication and the number that identifies
them cannot drift apart. An engine that cannot share one transaction between
these tables is not an adapter for this package (BEH-ES-034).

## BEH-ES-006: Reading a stream upcasts, then decodes

> **See:** [ADR-ES-002](../decisions/002-one-event-declaration-for-storage-and-delivery.md)
> **Depends on:** [BEH-DB-025](../../durable-bus/behaviors/04-versions-and-upcasters.md#beh-db-025-read-is-upcast-then-decode)
> **Risk:** [RSK-ES-005](../risks.md#rsk-es-005)

```ts
// illustrative — not type-checked
interface ReadOptions {
  readonly from?: number                      // streamVersion, default 1
  readonly to?: number                        // inclusive, default the current version
  readonly direction?: "forward" | "backward"
}
interface ReadEvent<A> { readonly stored: StoredEvent; readonly event: A }
declare const Stream: {
  readonly read: (id: string, options?: ReadOptions) =>
    Stream.Stream<ReadEvent<unknown>, LoadError, EventStore>
}
```

```
REQUIREMENT: Each stored event MUST be read by passing its payload through
             the `PayloadCodec` decode (when the event has a `codec`,
             BEH-ES-032), then the event's
             upcasters from its stored `version` to the current version,
             then the schema decode — the order of BEH-DB-025. The stored
             row MUST NOT be changed by a read.
```

```
REQUIREMENT: An event stored at a version below `minVersion`, above the
             current version, or of a type no longer registered MUST end the
             read with `UnknownEventVersion { stream, streamVersion, type,
             version }`. A read MUST NOT skip an event.
```

Unlike a delivery subscriber, which parks an envelope it cannot read
(BEH-DB-026), a stream read cannot continue past an event: folding state
without one event yields a state the stream never had.

## BEH-ES-007: Attribution of stored events

> **Core seam:** [22 — Attributable Operations](../../core/behaviors/22-attributable-operations.md) (BEH-BR-185, BEH-BR-187), [28 — Plugin Principal and Mandatory Policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-259), [30 — Operation Context Annotations](../../core/behaviors/30-operation-context-annotations.md) (BEH-BR-289, BEH-BR-296)
> **Satisfies:** [URS-BR-054](../../core/urs.md#urs-br-054-follow-one-request-through-everything-it-causes), [URS-BR-035](../../core/urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)

```
REQUIREMENT: An append MUST resolve its context once and take every
             attribution field from it. When the append is given a
             `context`, the store MUST run the whole append — the stored
             attribution and the `publish` of BEH-ES-028 alike — inside
             `CallerContext.serve(context)` (core BEH-BR-292); otherwise it
             runs in the calling fiber's context. The stored `actor` MUST be
             the actor of that context, resolved as core resolves the actor
             of a call (BEH-BR-187). An append with no resolvable actor MUST
             fail with durable-bus `Unattributed` and write nothing.
```

```
REQUIREMENT: `correlationId` MUST be the `CurrentCorrelation` of that
             context. When none is set, the store MUST draw one identifier
             from `IdGenerator` and serve it as `CurrentCorrelation` for the
             rest of the append, so that the stored events and their
             envelopes carry the same one. `onBehalfOf` MUST be the calling
             plugin's principal, encoded with `PrincipalRef.encode`
             (BEH-BR-280), when the append runs under a plugin principal
             (BEH-BR-259).
```

```
REQUIREMENT: `origin` MUST be the durable-bus origin `DurableBus.origin`
             returns during the append (durable-bus BEH-DB-004), and for a
             published event the returned envelope's, which is the same.
             The store MUST NOT keep an origin across appends, so that an
             append after a whole-store re-bootstrap carries the new
             origin. A recorded received fact keeps the fact's origin
             instead (BEH-ES-030).
```

```
REQUIREMENT: `annotations` and `annotationsOmitted` MUST be the
             `Annotations.encode` of that context's annotations filtered to
             flow "wire" (BEH-BR-292, BEH-BR-296), and for a published event
             the returned envelope's (BEH-ES-028), which also apply the bus's
             `carry` option. The store MUST NOT interpret an annotation.
```

The actor stored on an event is a claim of the host that wrote it, as it is on
an envelope (ADR-DB-008): it is what the writer said, not an authenticated
identity. Serving the append's context over the whole append is what keeps a
stored event and its envelope on one actor: durable-bus takes the actor from
the publishing fiber (BEH-DB-006), and the served context is that fiber's. The package stores no free-text reason; personal data in actors and
annotations is the application's to avoid (the keyring companion's guidance).

## BEH-ES-008: The store-wide position never goes back for a reader

> **Invariant:** [INV-ES-004](../invariants.md#inv-es-004-a-projection-never-skips-a-committed-event)
> **See:** [ADR-ES-006](../decisions/006-storage-through-a-port.md)
> **Risk:** [RSK-ES-002](../risks.md#rsk-es-002)

```
REQUIREMENT: Every stored event MUST carry a `position`, a positive integer
             unique within the store and increasing with stream version
             within a stream. Positions MAY have holes (a rolled-back
             transaction's numbers).
```

```
REQUIREMENT: A reader that has read every committed event up to position p
             MUST NOT later observe a committed event with position ≤ p.
             The adapter MUST provide this, either by assigning positions in
             commit order or by exposing only positions below the lowest
             position still held by an open transaction (adapter obligation,
             BEH-ES-036).
```

Engines that hand out sequence numbers at insert time let a later transaction
commit first. A follower that checkpoints past the higher number never sees
the lower one when it commits: a silent skip. The rule moves that hazard into
the adapter's obligations and the conformance suite (BEH-ES-037), where it can
be tested.

**Settled here.** (1) Events are declared once, with `DurableEvent`
(BEH-ES-001). (2) The expected version is mandatory and checked atomically per
stream (BEH-ES-003). (3) `WrongExpectedVersion` writes nothing and is never
retried inside `append` (BEH-ES-004). (4) Append runs only inside the caller's
`StoreTransaction` (BEH-ES-005). (5) A read stops at an event it cannot read
(BEH-ES-006). (6) Attribution follows core and `CurrentCorrelation`
(BEH-ES-007). (7) Positions never go back for a reader (BEH-ES-008).

**Open.** (1) A maximum number of events per append, and of bytes per event,
as adapter-declared limits. (2) Stream metadata (a stream-level deletion
marker or retention hint), which this revision does not specify because the
package never deletes (INV-ES-003).

---

_Previous: [Overview](../overview.md)_ · _Next: [02 — Decide and evolve](./02-decide-and-evolve.md)_
