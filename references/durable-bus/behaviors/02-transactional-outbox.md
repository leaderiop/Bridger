# 02 — Transactional outbox

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-02                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — the HLC is stamped in the adapter's serialized append step; `OutboxStore.retained` for resends after a receiver regression and for `HistorySource` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

The dual-write problem — the state change commits and the event is lost, or
the event is sent and the state change rolls back — is avoided by writing
the event into an outbox in the same storage transaction as the state
change. The bus owns no storage, so the transaction is the caller's and the
outbox is written through a port. This file owns BEH-DB-009–016 and uses
BEH-DB-009–015; BEH-DB-016 is reserved.

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

interface DurableBus {
  readonly publish: <A, I>(event: DurableEvent<A, I>, payload: A) =>
    Effect.Effect<Envelope, EncodeFailed | OutboxWriteFailed | Unattributed, StoreTransaction>
  // subscribe, receive, status: 03, 06
}
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
REQUIREMENT: `publish` MUST write the envelope through `OutboxStore.append`
             with the transaction handle. An `OutboxWriteFailed` MUST be
             returned to the caller, whose transaction then fails or rolls
             back by the caller's own handling.
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
    Effect.Effect<readonly Envelope[], StoreUnavailable>                  // committed, unacknowledged, in (origin, stream, sequence) order
  readonly acknowledge: (destination: string, upTo: readonly { origin: string; stream: string; sequence: number }[]) =>
    Effect.Effect<void, StoreUnavailable>
  readonly incarnation: Effect.Effect<number, StoreUnavailable>
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

---

_Previous: [01 — Events and the envelope](./01-events-and-envelope.md)_ · _Next: [03 — Delivery and inbox](./03-delivery-and-inbox.md)_
