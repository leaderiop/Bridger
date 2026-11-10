# 02 — Transactional outbox

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-02                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, H9) — BEH-DB-012: `OutboxStore.incarnation(node)` and `recordIncarnation(tx, node, n)`, keyed by node (CCR-DB-006)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 — `publish` takes `PublishOptions` (`stream`, `causationId`), which change nothing but the envelope's stream and causation (F-05, C-20) (CCR-DB-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F13, F25; R5-13) — `publish` error union completed (`PayloadEncodeFailed`, `DowncastRefused`, `AccessRefused`, `OutboxFrozen`), each writes nothing and aborts the caller's write if unhandled; a destination skipped on placement receives a `Withheld` marker at that sequence, so mixed labels leave no gap (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck item 20 — BEH-DB-016 residency labels on routes and at the inbox, `PlacementRefused` (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — the HLC is stamped in the adapter's serialized append step; `OutboxStore.retained` for resends after a receiver regression and for `HistorySource` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

The dual-write problem — the state change commits and the event is lost, or
the event is sent and the state change rolls back — is avoided by writing
the event into an outbox in the same storage transaction as the state
change. The bus owns no storage, so the transaction is the caller's and the
outbox is written through a port. This file owns BEH-DB-009–016 and uses
all eight.

Planned source: `packages/durable-bus/src/Outbox.ts` *(Planned)*.

## BEH-DB-009: publish runs inside the caller's transaction

> **Invariant:** [INV-DB-001](../invariants.md#inv-db-001-an-envelope-is-in-the-outbox-exactly-when-its-transaction-committed)
> **See:** [ADR-DB-002](../decisions/002-outbox-through-a-storage-port.md)
> **Satisfies:** [URS-BR-013](../../core/urs.md#urs-br-013-exchange-typed-events-between-plugins)

```ts
// illustrative — not type-checked
// Provided by the storage adapter inside its own `transaction(effect)` combinator.
class StoreTransaction extends Context.Service<StoreTransaction, { readonly handle: unknown }>()(
  "@bridger/durable-bus/StoreTransaction") {}

interface PublishOptions {
  readonly stream?: string        // 01, BEH-DB-003: the envelope's stream, in place of event.stream(payload)
  readonly causationId?: string   // 01, BEH-DB-005: used outside a subscription handler only
}
interface DurableBus {
  readonly publish: <A, I>(event: DurableEvent<A, I>, payload: A, options?: PublishOptions) =>
    Effect.Effect<Envelope, PublishError, StoreTransaction>
  // subscribe, receive, status: 03, 06; origin, originChanges: 01; onStoreSwap: 06
}
type PublishError =
  | EncodeFailed            // schema encoding (this behaviour)
  | DowncastRefused         // 04, BEH-DB-031
  | PayloadEncodeFailed     // 01, BEH-DB-008
  | AccessRefused           // 07, BEH-DB-053 (core)
  | OutboxFrozen            // 06, BEH-DB-048 — a whole-store re-bootstrap holds the outbox
  | OutboxWriteFailed       // BEH-DB-012, BEH-DB-014
  | Unattributed            // 01, BEH-DB-006
```

```
REQUIREMENT: `publish` MUST require `StoreTransaction` in its environment, so
             that a call outside a transaction is a compile error. The bus
             MUST NOT open, commit or roll back a transaction.
```

```
REQUIREMENT: `publish` MUST encode the payload with the event schema at its
             current `version` before writing; `EncodeFailed` MUST write
             nothing.
```

```
REQUIREMENT: `options` MUST change nothing but the envelope's `stream`
             (BEH-DB-003) and `causationId` (BEH-DB-005). Order, sequence
             allocation, routes, access checks and placement MUST apply to
             the stream `publish` chose exactly as to a declared one.
```

```
REQUIREMENT: `publish` MUST write the envelope through `OutboxStore.append`
             with the transaction handle. Every `PublishError` MUST write
             nothing and MUST be returned to the caller, whose transaction
             then fails or rolls back by the caller's own handling.
             Documentation MUST state that, because `publish` runs inside
             the caller's transaction, any of these errors left unhandled
             aborts the caller's own write — a sale, a stock movement — and
             not only the event.
```

**Settled here.** The type requirement is the cheapest enforcement there is:
the mistake of publishing outside the transaction that wrote the state
cannot compile. An adapter whose engine cannot share a transaction between
the application's tables and the outbox cannot implement `StoreTransaction`
and is not an adapter for this package.

## BEH-DB-010: The envelope exists exactly when the transaction commits

> **Invariant:** [INV-DB-001](../invariants.md#inv-db-001-an-envelope-is-in-the-outbox-exactly-when-its-transaction-committed)
> **See:** [ADR-DB-002](../decisions/002-outbox-through-a-storage-port.md)

```
REQUIREMENT: No part of the bus MAY read, send or expose an envelope before
             its transaction has committed. The relay MUST read only
             committed rows.
```

```
REQUIREMENT: When the transaction rolls back, the envelope, its sequence
             number and its HLC tick MUST leave no trace that a later publish
             can observe, except that the in-memory HLC MAY have advanced
             (05).
```

## BEH-DB-011: Sequence numbers are allocated in the transaction

> **Invariant:** [INV-DB-002](../invariants.md#inv-db-002-sequence-is-contiguous-per-origin-and-stream)
> **See:** [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)

```
REQUIREMENT: `sequence` MUST be allocated by the adapter inside the
             transaction as one more than the highest committed sequence of
             (origin, stream), starting at 1. Two transactions publishing to
             one (origin, stream) MUST be serialized by the adapter so that
             committed sequences are contiguous and unique.
```

```
REQUIREMENT: The envelope's `hlc` MUST be assigned in the same serialized
             step as its sequence: `append` MUST call the `stamp` effect it is
             given (which ticks the node's HLC, BEH-DB-034) once per
             envelope, after it holds the serialization of that
             (origin, stream) and before it writes the row. The bus MUST NOT
             tick the HLC for an envelope anywhere else.
```

```
REQUIREMENT: Several publishes in one transaction to one stream MUST receive
             consecutive sequences in call order.
```

A rolled-back transaction leaves no gap because its numbers were never
committed. That is why allocation belongs to the storage, not to an
in-memory counter. Stamping the HLC inside the same serialized step is what
makes HLC order agree with sequence order within one (origin, stream): an
HLC ticked before the serialization was taken could belong to a transaction
that obtained its sequence after a later-ticked one.

## BEH-DB-012: The OutboxStore port

> **See:** [ADR-DB-002](../decisions/002-outbox-through-a-storage-port.md)

```ts
// illustrative — not type-checked
interface OutboxStore {
  readonly append: (tx: StoreTransaction["Service"], envelopes: readonly Omit<Envelope, "sequence" | "hlc">[],
                    stamp: Effect.Effect<Hlc>) =>
    Effect.Effect<readonly Envelope[], OutboxWriteFailed>                 // allocates sequences, stamps HLCs (BEH-DB-011)
  readonly pending: (destination: string, limit: number) =>
    Effect.Effect<readonly (Envelope | Withheld)[], StoreUnavailable>     // committed, unacknowledged, in (origin, stream, sequence) order; Withheld: BEH-DB-016
  readonly acknowledge: (destination: string, upTo: readonly { origin: string; stream: string; sequence: number }[]) =>
    Effect.Effect<void, StoreUnavailable>
  readonly incarnation: (node: string) => Effect.Effect<number | undefined, StoreUnavailable>   // recorded for `node` (BEH-DB-004)
  readonly recordIncarnation: (tx: StoreTransaction["Service"], node: string, incarnation: number) =>
    Effect.Effect<void, StoreUnavailable>                                 // keyed by node; a lower number than the one recorded is a no-op
  readonly backlog: (destination: string) => Effect.Effect<{ count: number; oldest?: string }, StoreUnavailable>
  // committed envelopes still retained, acknowledged or not, after `after`, in sequence order;
  // `oldest` is the lowest retained sequence of (origin, stream), absent when none is retained
  readonly retained: (q: { origin: string; stream: string; after: number; limit: number }) =>
    Effect.Effect<{ readonly envelopes: readonly Envelope[]; readonly oldest?: number }, StoreUnavailable>
  readonly highestHlc: Effect.Effect<Hlc | undefined, StoreUnavailable>  // BEH-DB-034
}
```

```
REQUIREMENT: The bus MUST reach storage only through `OutboxStore` and
             `InboxStore` (03). It MUST NOT embed SQL or an engine.
```

```
REQUIREMENT: `acknowledge` MUST be monotone: acknowledging a lower sequence
             than one already acknowledged for (destination, origin,
             stream) MUST be a no-op. A lower acknowledgement watermark is
             not ignored by the relay, though: it is a receiver regression,
             handled by BEH-DB-019.
```

## BEH-DB-013: Routes decide where each stream goes

> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```
REQUIREMENT: The bus MUST be configured with `routes`: a list of
             `{ destination, streams }` where `streams` is a list of stream
             names or "*". Each committed envelope MUST be pending for every
             destination whose route matches its stream, with an independent
             acknowledgement per destination.
```

```
REQUIREMENT: A change of routes MUST apply to envelopes committed after the
             change; envelopes already pending for a destination MUST stay
             pending for it until acknowledged or until the destination is
             explicitly retired by `retireDestination`, which MUST be
             reported.
```

## BEH-DB-014: The outbox is never truncated before acknowledgement

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```
REQUIREMENT: An envelope MUST remain retrievable by `pending` for every
             routed destination until that destination acknowledged it.
             Retention after acknowledgement is the adapter's configuration.
```

```
REQUIREMENT: The bus MUST report a `backlog` event when a destination's
             pending count exceeds `pendingWarn` or its oldest pending
             envelope is older than `pendingAgeWarn`. With
             `onPendingLimit: "refuse"` and the count above `pendingLimit`,
             `publish` MUST fail with `OutboxWriteFailed { cause: "limit" }`;
             the default is "warn".
```

**Settled here.** Facts recorded offline are not dropped to save space: a
node that ran out of room for its outbox must refuse new facts (if the
application chose "refuse") rather than lose old ones. Refusing is off by
default because stopping work is an application decision.

## BEH-DB-015: Publishing from a handler uses the handler's transaction

> **Invariant:** [INV-DB-004](../invariants.md#inv-db-004-an-inbox-records-each-envelope-processed-at-most-once-per-subscription)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```
REQUIREMENT: A subscription handler (03) MUST run inside a `StoreTransaction`
             that also advances its cursor; a `publish` from the handler
             MUST join that transaction, so that the handled event's cursor,
             the handler's writes and the derived envelopes commit or roll
             back together.
```

This is what makes a chain of processing steps safe to retry: a step either
happened entirely — cursor moved, writes made, follow-on events queued — or
not at all.

## BEH-DB-016: Routes declare residency labels, and an event is not routed where its label is not offered

> **See:** [ADR-RM-010](../../remote/decisions/010-placement-labels-compared-at-the-boundary.md)
> **Depends on:** remote companion `PlacementPolicy`, `Placement.Residency` ([BEH-RM-068](../../remote/behaviors/09-placement-budgets-and-adapters.md#beh-rm-068-transports-and-routes-declare-the-residency-labels-they-offer), [BEH-RM-069](../../remote/behaviors/09-placement-budgets-and-adapters.md#beh-rm-069-the-residency-label-travels-as-a-wire-annotation-and-is-checked-by-the-serving-end))

```ts
// illustrative — not type-checked
interface Route { readonly destination: string; readonly streams: readonly string[] | "*"
                  readonly residency?: readonly string[] }        // labels this destination offers
// DurableBus.plugin options gain: placement?: PlacementPolicy (default PlacementPolicy.exact)

// What a skipped destination receives at the envelope's sequence: position and identity only.
interface Withheld {
  readonly envelope: 1
  readonly withheld: "placement-refused" | "access-refused"   // the latter: HistorySource only (06, BEH-DB-047)
  readonly eventId: string; readonly origin: string; readonly stream: string; readonly sequence: number
}
```

```
REQUIREMENT: When the publishing fiber carries `placement/residency`, the
             envelope carries it among its "wire" annotations (BEH-DB-007),
             and `publish` MUST evaluate the `PlacementPolicy` with
             `subject.kind` "route" for each destination whose route
             matches the stream. A destination the policy refuses MUST NOT
             receive the envelope; it MUST be recorded as skipped for that
             destination with reason "placement-refused" and reported as
             `placement-refused`, and the other destinations MUST still
             receive it.
```

```
REQUIREMENT: Sequences are per (origin, stream), not per destination, so a
             skipped destination MUST still receive that sequence: for it,
             `OutboxStore.pending` MUST return a `Withheld` element in the
             envelope's place, carrying only the position and the
             `eventId` — no type, version, payload, actor, annotations or
             HLC — and the relay MUST send and resend it like an envelope.
             A receiver stores it as a marker and advances its watermark
             (03, BEH-DB-018), so a stream that mixes labels never leaves a
             gap that halts the receiver. `HistorySource.read` MUST serve
             the same marker to a reader the label refuses (06, BEH-DB-047).
```

```
REQUIREMENT: A receiver MUST evaluate the policy again for a received
             envelope's label against the residency of its own inbox
             configuration (`inboxResidency`); a refusal MUST stop that
             (origin, stream) at the inbox with `PlacementRefused`
             (BEH-DB-022, inbox level), so that no subscription sees it and
             nothing is silently dropped.
```

**Settled here.** The label is the remote companion's annotation key, so an
event and a call labelled alike are refused by the same rule. A refused
destination is skipped, not failed, because the fact is still committed for
the destinations that may hold it; refusing at the receiver as a stop keeps
INV-DB-006 — nothing is dropped silently. The `Withheld` marker is the
alternative to two worse choices: refusing the whole `publish` (which would
abort the caller's business write for one destination's label) or forcing
one label per stream (which the application cannot always arrange). The
marker tells the skipped destination that a sequence exists and was not
sent to it, which is less than the event and is stated as such.

---

_Previous: [01 — Events and the envelope](./01-events-and-envelope.md)_ · _Next: [03 — Delivery and inbox](./03-delivery-and-inbox.md)_
