# 03 — Delivery and inbox

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-03                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-DB-018: an envelope's origin is a claim, not the sender's identity; the limit is documented and binding origins to authenticated senders is the transport's (P2); BEH-DB-019: a snapshot restore or re-bootstrap install is the one other way past unstored sequences, with its own `GapRecord` (P3) (CCR-DB-005)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 (C-12) — `InboxStore.transaction` and `receive` fail with the new `CommitConflict` when the engine refuses a commit for a conflict; a handler attempt that ends in `CommitConflict` is retried in a new transaction and, when the attempts end on one, halts its (origin, stream) without parking (CCR-DB-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F13; R5-04/05) — the inbox stores a `Withheld` marker at its sequence and advances the watermark and every cursor without a handler call; subscriptions gain `onUnreadable` ("park", "halt") and `subscribeEnvelopes` delivers stored envelopes undecoded, so an unreadable fact is halted on or recorded as received, never parked away (FX-NEW N1) (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck item 20 — `PlacementRefused` added as an inbox-level stop (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — `send` returns `Ack` only, `Ack.retryAfter`; receiver regression detected and repaired or reported; attributed `acceptGap`; inbox-level stops separated from subscription-level parks and halts; duplicate check bounded by the inbox's retention; handler receipt (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

A network can lose a batch, lose its acknowledgement, or deliver it twice.
The relay therefore resends until acknowledged, and the receiver's inbox
turns repeated deliveries into one stored envelope, in order. Subscriptions
then process stored envelopes once per subscription. This file owns
BEH-DB-017–024 and uses all eight.

Planned source: `packages/durable-bus/src/Relay.ts`,
`packages/durable-bus/src/Inbox.ts` and
`packages/durable-bus/src/Subscription.ts` *(Planned)*.

## BEH-DB-017: The relay delivers at least once, in order

> **Invariant:** [INV-DB-003](../invariants.md#inv-db-003-an-envelope-is-acknowledged-only-after-the-receiver-committed-it), [INV-DB-005](../invariants.md#inv-db-005-handlers-see-each-stream-in-sequence-without-skipping)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```ts
// illustrative — not type-checked
interface DeliveryTransport {               // the push path; downstream history is pulled (HistorySource, 06)
  readonly send: (destination: string, batch: readonly (Envelope | Withheld)[]) =>   // Withheld: 02, BEH-DB-016
    Effect.Effect<Ack, DeliveryFailed>
}
interface Ack {
  readonly watermarks: readonly { origin: string; stream: string; sequence: number }[]   // highest contiguous committed
  readonly credit: { readonly maxBatch: number; readonly maxInFlight: number }           // 06
  readonly retryAfter?: Duration.Duration                                                // with zero credit (BEH-DB-041)
}
```

```
REQUIREMENT: For each destination, the relay MUST read `pending` and send
             envelopes of each (origin, stream) in sequence order, starting
             after the destination's acknowledged watermark (or after the
             lower watermark of a regressed receiver, BEH-DB-019). It MUST resend
             unacknowledged envelopes after `DeliveryFailed`, a timeout, or an
             acknowledgement that does not cover them.
```

```
REQUIREMENT: Every `send` MUST be bounded by `deliveryTimeout` (default 30
             seconds). A timeout MUST be treated as `DeliveryFailed`; the
             batch's outcome is unknown and it MUST be resent, never assumed
             delivered.
```

```
REQUIREMENT: The relay MUST call `OutboxStore.acknowledge` with the
             acknowledgement's watermarks only, never with what it sent.
```

Over the remote companion, a delivery is one bounded remote call on a
contract the receiver serves; any transport that returns a watermark after
the receiver's commit will do.

## BEH-DB-018: The inbox accepts the next sequence, ignores repeats, and stops at gaps

> **Invariant:** [INV-DB-004](../invariants.md#inv-db-004-an-inbox-records-each-envelope-processed-at-most-once-per-subscription), [INV-DB-005](../invariants.md#inv-db-005-handlers-see-each-stream-in-sequence-without-skipping)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md), [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```ts
// illustrative — not type-checked
interface InboxStore {
  readonly watermark: (tx: StoreTransaction["Service"], origin: string, stream: string) => Effect.Effect<number, StoreUnavailable>
  readonly store: (tx: StoreTransaction["Service"], envelope: Envelope | Withheld) => Effect.Effect<void, StoreUnavailable>
  readonly eventIdAt: (tx: StoreTransaction["Service"], origin: string, stream: string, sequence: number) =>
    Effect.Effect<string | undefined, StoreUnavailable>                 // undefined once purged by retention
  // inbox level (BEH-DB-022): the (origin, stream) stops; the watermark does not move
  readonly stopStream: (tx: StoreTransaction["Service"], origin: string, stream: string, element: unknown, reason: StopReason) => Effect.Effect<void, StoreUnavailable>
  readonly stopped: (tx: StoreTransaction["Service"], origin: string, stream: string) => Effect.Effect<StopReason | undefined, StoreUnavailable>
  readonly releaseStream: (tx: StoreTransaction["Service"], origin: string, stream: string, by: Actor) => Effect.Effect<void, StoreUnavailable>
  // inbox level (BEH-DB-019): moves the watermark over sequences that will never arrive, and records it
  readonly acceptGap: (tx: StoreTransaction["Service"], record: GapRecord) => Effect.Effect<void, StoreUnavailable>
  // subscription level (BEH-DB-022)
  readonly park: (tx: StoreTransaction["Service"], subscription: string, envelope: Envelope, reason: ParkReason) => Effect.Effect<void, StoreUnavailable>
  readonly unpark: (tx: StoreTransaction["Service"], subscription: string, origin: string, stream: string, sequence: number) => Effect.Effect<Envelope | undefined, StoreUnavailable>
  readonly saveClock: (tx: StoreTransaction["Service"], hlc: Hlc) => Effect.Effect<void, StoreUnavailable>        // BEH-DB-034
  readonly savedClock: Effect.Effect<Hlc | undefined, StoreUnavailable>
  readonly retained: (q: { origin: string; stream: string; after: number; limit: number }) =>
    Effect.Effect<{ readonly envelopes: readonly Envelope[]; readonly oldest?: number }, StoreUnavailable>   // HistorySource, 06
  readonly cursor: (tx: StoreTransaction["Service"], subscription: string, origin: string, stream: string) => Effect.Effect<number, StoreUnavailable>
  readonly advance: (tx: StoreTransaction["Service"], subscription: string, origin: string, stream: string, to: number) => Effect.Effect<void, StoreUnavailable>
  // the commit itself may fail with CommitConflict (below); E is the effect's own error
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R | StoreTransaction>) => Effect.Effect<A, E | StoreUnavailable | CommitConflict, R>
}
// The engine refused the commit because a concurrent transaction conflicted with it: a serialization
// failure, or a conflict that a store sharing the transaction detects only at commit (event-store BEH-ES-034).
class CommitConflict extends Schema.TaggedError<CommitConflict>()("CommitConflict", { reason: Schema.String }) {}

interface GapRecord { readonly origin: string; readonly stream: string; readonly from: number; readonly through: number;
                     readonly actor: Actor; readonly reason: string; readonly at: string }
type StopReason = "UnknownEnvelopeFormat" | "EnvelopeConflict" | "PlacementRefused"   // the last: BEH-DB-016

// DurableBus.receive(batch): Effect<Ack, StoreUnavailable | CommitConflict | MalformedBatch>  — called by the transport's serving side
```

```
REQUIREMENT: `receive` MUST first decode every element's `origin`, `stream`
             and `sequence`; when one does not decode, it MUST store nothing,
             fail with `MalformedBatch` and report `malformed-batch` (the
             relay treats it as `DeliveryFailed`). It MUST then process the
             batch in one inbox transaction. An envelope of an (origin,
             stream) stopped at the inbox level (BEH-DB-022) MUST be ignored
             and not acknowledged. For every other envelope, against the
             watermark W of its (origin, stream):
             - sequence ≤ W        → duplicate: MUST be ignored; while the
                                     inbox still holds the `eventId` stored
                                     at that sequence (`eventIdAt`), it MUST
                                     first compare it (BEH-DB-004); once the
                                     stored envelope has been purged by the
                                     inbox's retention, it MUST be ignored
                                     without the comparison;
             - sequence = W + 1    → MUST be stored and W advanced, unless
                                     its `envelope` format is unknown
                                     (BEH-DB-002), which stops the stream;
                                     a `Withheld` element (BEH-DB-016) is
                                     stored as a marker, advances W like an
                                     envelope and is counted in status as
                                     `withheld` per (origin, stream);
             - sequence > W + 1    → gap: this envelope and the rest of the
                                     batch for that (origin, stream) MUST be
                                     ignored (the sender resends in order),
                                     and the gap MUST be counted in status
                                     (expected W + 1, received sequence).
```

```
REQUIREMENT: The acknowledgement MUST be computed from the watermarks after
             the inbox transaction committed, and MUST NOT be returned if it
             did not commit. When the commit fails with `CommitConflict`,
             `receive` MUST fail with it, having stored and acknowledged
             nothing; the sender resends the batch (BEH-DB-017).
```

```
REQUIREMENT: The bus MUST NOT treat an envelope's `origin` as the sender's
             identity: `receive` cannot see who sent a batch, and the origin
             is a claim of the sender, as the actor is (BEH-DB-006). Any
             party whose batches the transport accepts can write under any
             (origin, stream): it can take sequences before the true origin
             does, so that the true envelopes stop the stream with
             `EnvelopeConflict`, and it passes an access policy or a series
             check keyed on the origin it names (BEH-DB-053). Documentation
             MUST state this limit and that binding origins to authenticated
             senders is the transport's and the deployment's: a transport
             that authenticates its peers SHOULD refuse a batch with an
             element whose origin's `node` part is not the authenticated
             peer's, unless the deployment lists that peer as a relay for
             that node.
```

**Settled here.** The inbox stores only contiguous envelopes and keeps no
reorder buffer: a gap means the sender skipped ahead or a batch was split,
and the sender — which holds every envelope until acknowledged — is the
cheapest party to fix it by resending. Deciding that an envelope is a
duplicate needs one number per (origin, stream), not a set of seen ids;
detecting an equivocating origin (BEH-DB-004) additionally needs the stored
envelope's `eventId`, which the inbox has only for as long as it retains the
envelope. The inbox's retention therefore SHOULD cover at least the senders'
resend window (`retryMax` plus `deliveryTimeout`); past it, a repeat is
absorbed without the conflict check, and that limit is documented.

## BEH-DB-019: Acknowledgement follows the receiver's commit

> **Invariant:** [INV-DB-003](../invariants.md#inv-db-003-an-envelope-is-acknowledged-only-after-the-receiver-committed-it)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```
REQUIREMENT: A sender MUST treat an envelope as delivered to a destination
             only when an acknowledgement watermark from that destination
             covers it. Until then it MUST stay pending (BEH-DB-014).
```

```
REQUIREMENT: An acknowledgement watermark W_r lower than the watermark W_s
             already acknowledged for (destination, origin, stream) is a
             receiver regression (its store was restored, replaced or
             wiped). The relay MUST report `receiver-regressed
             { destination, origin, stream, acknowledged: W_s, reported: W_r }`
             and MUST resend that (origin, stream) from W_r + 1, reading the
             already-acknowledged envelopes through `OutboxStore.retained`.
             When the outbox no longer retains some of W_r + 1 … W_s, the
             relay MUST report `envelopes-lost { destination, origin, stream,
             from, through }` naming the sequences it cannot resend, and MUST
             keep offering the rest once the receiver has accepted the gap.
```

```
REQUIREMENT: `DurableBus.acceptGap({ origin, stream, through, reason })` MUST
             be the only way for an inbox watermark to pass sequences it
             never stored, apart from a snapshot restore or a re-bootstrap
             install, which record the passed range as a `GapRecord` of
             their own (06, BEH-DB-044). It MUST require a non-system `CurrentActor`,
             record a `GapRecord` through `InboxStore.acceptGap` in one
             inbox transaction, report `gap-accepted`, and list the record in
             `DurableBus.status`. It MUST NOT invent envelopes; subscriptions
             pass the accepted range without a handler call.
```

Together with BEH-DB-018 this is the whole delivery contract: the sender may
repeat, the receiver absorbs repeats, and nothing is forgotten by the sender
that the receiver has not committed. How long the receiver's commit lasts is
its storage adapter's property, not this package's. A receiver whose store
went back in time is detected by the watermark it reports, not by an
incarnation: the watermark is exactly the quantity that regressed, so no
inbox incarnation is needed to see it. When the sender has purged what the
receiver lost, the loss cannot be repaired by the bus; it is reported on
both sides and stays a stalled stream until a person accepts the gap or the
application re-bootstraps the receiver (06).

## BEH-DB-020: Subscriptions process each stored envelope once, in order

> **Invariant:** [INV-DB-004](../invariants.md#inv-db-004-an-inbox-records-each-envelope-processed-at-most-once-per-subscription), [INV-DB-005](../invariants.md#inv-db-005-handlers-see-each-stream-in-sequence-without-skipping)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```ts
// illustrative — not type-checked
interface DurableBus {
  readonly subscribe: <Events extends readonly DurableEvent<any, any>[]>(
    name: string,
    events: Events,
    handler: (event: EventOf<Events>, envelope: Envelope, receipt: Receipt) => Effect.Effect<void, unknown, StoreTransaction>,
    options?: { readonly maxAttempts?: number; readonly onPoison?: "halt" | "park-and-continue"
                readonly onUnreadable?: "park" | "halt"   // PayloadUnreadable (01, BEH-DB-008); default "park"
                readonly origins?: readonly string[] }
  ) => Effect.Effect<void, never, Scope.Scope>
  // the same, without decoding: the handler receives the stored envelope, payload and codec as received
  readonly subscribeEnvelopes: (
    name: string,
    types: readonly DurableEvent<any, any>[],
    handler: (envelope: Envelope, receipt: Receipt) => Effect.Effect<void, unknown, StoreTransaction>,
    options?: { readonly maxAttempts?: number; readonly onPoison?: "halt" | "park-and-continue"; readonly origins?: readonly string[] }
  ) => Effect.Effect<void, never, Scope.Scope>
  readonly resume: (subscription: string, origin: string, stream: string) => Effect.Effect<void>   // BEH-DB-021
}
interface Receipt {
  readonly skewed: boolean                         // BEH-DB-035
  readonly rejectedAnnotations: readonly string[]  // BEH-DB-007
}
```

```
REQUIREMENT: For each subscription name and each (origin, stream) that holds
             any of its event types, the bus MUST call the handler for stored
             envelopes in sequence order, each inside one `InboxStore`
             transaction that also advances the subscription's cursor past
             it. Envelopes of other types MUST advance the cursor without a
             call. A stored `Withheld` marker MUST advance the cursor of
             every subscription without a call and MUST be counted in that
             subscription's status, so that a skipped sequence is visible
             to the subscriber without being a gap or a poison.
```

```
REQUIREMENT: Before the call, the envelope MUST be upcast and decoded (04);
             the handler MUST receive the current-version value. An envelope
             that cannot be read (`UnknownEventVersion`, `UpcastFailed`,
             `DecodeFailed`) MUST be handled as a poison envelope under the
             subscription's `onPoison` without retry (BEH-DB-021).
```

```
REQUIREMENT: `onUnreadable` (default "park") decides what a
             `PayloadUnreadable` from the `PayloadCodec` does for this
             subscription: "park" parks the envelope as BEH-DB-008 states;
             "halt" stops processing that (origin, stream) for the
             subscription with its cursor before the envelope, as
             `onPoison: "halt"` does, and reports `subscription-halted`
             with reason `PayloadUnreadable`; `resume` retries it. A
             subscription that records facts (event-store BEH-ES-030) uses
             "halt", because a parked fact is a lost fact.
```

```
REQUIREMENT: `subscribeEnvelopes` MUST call the handler with the stored
             envelope, `payload` and `codec` as received, without the
             `PayloadCodec` decode, the upcasters or the schema decode;
             every other rule of BEH-DB-020 and BEH-DB-021 applies,
             `Withheld` markers and the delivery access check (07,
             BEH-DB-053) included. A subscription name is unique across
             `subscribe` and `subscribeEnvelopes`. Documentation MUST state
             that a subscriber which records facts that must never be lost
             may use it to store the payload byte for byte, and that "park"
             is for subscribers that can do nothing useful with a payload
             they cannot read.
```

```
REQUIREMENT: A subscription name MUST be unique per bus. Registering a second
             handler under a name already registered MUST fail with a defect
             naming the subscription.
```

```
REQUIREMENT: Different (origin, stream) pairs MAY be processed concurrently,
             bounded by `subscriptionConcurrency` (default 1).
```

## BEH-DB-021: A failing handler retries, then halts or parks

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```
REQUIREMENT: When a handler fails or dies, its transaction MUST roll back
             (cursor unchanged) and the call MUST be retried with backoff
             and jitter from `Random`, up to `maxAttempts` (default 5).
```

```
REQUIREMENT: A handler call whose transaction fails to commit with
             `CommitConflict` (BEH-DB-018) MUST be treated as a failed
             attempt: nothing of it is committed, the cursor is unchanged,
             and the call MUST be retried in a new transaction under the
             same backoff, counted against `maxAttempts`. When the attempts
             end on a `CommitConflict`, the subscription MUST halt that
             (origin, stream) with reason `CommitConflict` whatever its
             `onPoison`, and MUST NOT park the envelope; `resume` retries
             it.
```

```
REQUIREMENT: After `maxAttempts`, or at once for an envelope that cannot be
             read (BEH-DB-020), with `onPoison: "halt"` (the default) the
             subscription MUST stop processing that (origin, stream) with
             its cursor left before the envelope, and report
             `subscription-halted` with the envelope's position and reason;
             nothing is parked. With "park-and-continue" it MUST park the
             envelope for that subscription with the failure as reason,
             advance its cursor past it, and continue.
```

```
REQUIREMENT: A halted (origin, stream) of a subscription MUST be retried from
             its cursor when a handler registers under the name again (for
             example after the plugin was upgraded) or when
             `DurableBus.resume(subscription, origin, stream)` is called;
             `resume` MUST be attributed to the current actor and reported.
```

**Settled here.** Halting is the default because skipping a fact breaks every
projection that assumed order: an envelope at a version the reader does not
know yet stops its stream until the reader is upgraded, and then is
processed in order. Parking is available for subscriptions whose events are
independent, and is visible and reversible (BEH-DB-022). A commit conflict
is never parked: it is contention between transactions, says nothing about
the envelope, and a later attempt normally commits; the handler cannot see
it, because the commit happens after the handler has returned.

## BEH-DB-022: Parked envelopes are visible and can be released

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently), [INV-DB-005](../invariants.md#inv-db-005-handlers-see-each-stream-in-sequence-without-skipping)
> **See:** [ADR-DB-005](../decisions/005-versioned-events-and-pure-upcasters.md)

There are two levels, and each problem belongs to exactly one.

```
REQUIREMENT: Inbox level. An element with an unknown envelope format
             (`UnknownEnvelopeFormat`, BEH-DB-002), a conflicting event id
             (`EnvelopeConflict`, BEH-DB-004) or a residency label this
             inbox does not offer (`PlacementRefused`, BEH-DB-016) MUST stop its (origin, stream)
             at the inbox through `InboxStore.stopStream`, keeping the
             element as received: the watermark MUST NOT move, the element
             MUST NOT be stored as an envelope, later envelopes of that
             (origin, stream) MUST be ignored and not acknowledged (so the
             sender keeps them pending), and no subscription sees any of
             them. The stop MUST be listed by `DurableBus.status` and
             reported as `stream-stopped`. `DurableBus.releaseStream(origin,
             stream)` MUST clear it, attributed to the current actor and
             reported; the sender's next resend is then processed by the
             rules of BEH-DB-018.
```

```
REQUIREMENT: Subscription level. An envelope that one subscription cannot
             process — `UnknownEventVersion`, `UpcastFailed`, `DecodeFailed`,
             or a poison handler failure — MUST be handled under that
             subscription's `onPoison` (BEH-DB-021), and a
             `PayloadUnreadable` under its `onUnreadable` (BEH-DB-008). Under
             "park-and-continue" it MUST be parked through
             `InboxStore.park(tx, subscription, …)` with its reason, listed
             by `DurableBus.status`, and reported as a `parked` event. The
             envelope stays stored and acknowledged; other subscriptions are
             not affected. The bus MUST NOT delete it.
```

```
REQUIREMENT: `DurableBus.unpark(subscription, origin, stream, sequence)` MUST
             make a parked envelope eligible again for that subscription; it
             MUST be attributed to the current actor and reported. Because
             the subscription's cursor has already passed it, an unparked
             envelope MUST be processed out of order — after envelopes of
             the same (origin, stream) that followed it — and documentation
             of `unpark` MUST say so.
```

## BEH-DB-023: Handlers belong to their plugin's scope; cursors outlive them

> **See:** [ADR-DB-001](../decisions/001-a-separate-contract-from-the-core-bus.md), [ADR-BR-020](../../core/decisions/020-typed-event-bus.md)

```
REQUIREMENT: `subscribe` MUST register the handler for the lifetime of the
             caller's `Scope`, as core bus listeners are
             ([BEH-BR-139](../../core/behaviors/16-event-bus.md)). When the
             scope closes, the handler MUST be withdrawn after its current
             call completes or is interrupted (rolling back its transaction).
```

```
REQUIREMENT: The cursor MUST persist in the inbox. Envelopes arriving while
             no handler is registered under a name MUST wait, and processing
             MUST resume from the cursor when a handler registers again.
```

A plugin replaced for an upgrade therefore resumes exactly where its
predecessor stopped; its handler is the one in force when each envelope is
processed.

## BEH-DB-024: Effects outside the store are at least once

> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```
REQUIREMENT: Documentation of `subscribe` MUST state that a handler's effects
             outside its `StoreTransaction` (a remote call, an e-mail, a
             print) may happen more than once, and that handlers performing
             them MUST be idempotent, keyed for example by `eventId`.
```

```
REQUIREMENT: The package MUST NOT describe its delivery as exactly once.
```

---

_Previous: [02 — Transactional outbox](./02-transactional-outbox.md)_ · _Next: [04 — Versions and upcasters](./04-versions-and-upcasters.md)_
