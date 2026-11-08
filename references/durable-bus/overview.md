# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-OVW                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — `HistorySource`, `follow`, `acceptGap`, `releaseStream`, `resume`; new error tags; annotations under flow "wire" (BEH-BR-296) (CCR-DB-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

## Mission

The core event bus ([16 — Event bus](../core/behaviors/16-event-bus.md)) is
in memory: an `emit` whose process dies is gone, and a listener on another
host never hears it. That is right for notifications between plugins of one
host. It is wrong for business facts that must reach an authority after an
outage — a sale finalised offline, a delivery received — which is the
pattern local-first systems settle on: each node writes intent-level events
to an **outbox** in the same transaction as its own state change, and an
authority orders and re-checks them.

`@bridger/durable-bus` specifies that pattern as a library contract:

1. `DurableEvent.make(id, schema, { version, upcast })` declares a versioned
   event described by an Effect Schema, with pure upcasters from older
   versions.
2. `DurableBus.publish` writes an envelope into the outbox **inside the
   caller's storage transaction**, through a storage port; the package owns
   no storage, so the event exists exactly when the caller's own write does.
3. A relay delivers envelopes **at least once**, in sequence per
   (origin, stream); the receiver's **inbox** deduplicates them and lets
   subscription handlers process each one once per subscription, in order.
4. Each envelope carries a **hybrid logical clock**, the **actor** and the
   **annotations** of the operation that produced it (those declaring the
   core "wire" flow, core-encoded), as claims.
5. Replay after a long absence is **bounded**: upstream facts are pushed
   under the receiver's credit, downstream history is pulled in bounded pages
   through `HistorySource`, and a follower behind the source's retained
   history re-bootstraps from a snapshot.

## Package boundary

| Concern | Where it lives |
| ------- | -------------- |
| In-memory typed events between plugins of one host | Core — [16 — Event bus](../core/behaviors/16-event-bus.md); not replaced, not wrapped |
| `Actor`, `OperationContext`, `CurrentActor` | Core — [22 — Attributable operations](../core/behaviors/22-attributable-operations.md) |
| Annotation bag (taint, provenance, deadline) | Core — [core 30 — Operation context annotations](../core/behaviors/30-operation-context-annotations.md) (BEH-BR-289–296) |
| Who may publish or subscribe | Core — [core 28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (bus access rules; BEH-BR-257–266), optional |
| `Clock`, `Random`, `IdGenerator` | Core — [24 — Time, identifiers and sequence](../core/behaviors/24-time-ids-and-sequence.md) |
| Transport between hosts, sessions, epochs, call timeouts | `@bridger/remote` ([references/remote/](../remote/README.md)) or an application transport |
| Offline cap, re-bootstrap trigger for a host | `@bridger/federation` — [references/federation/](../federation/README.md) |
| **Event declaration, envelope, outbox, relay, inbox, subscriptions, upcasting, HLC, replay bounds, adapter obligations** | **This package** |
| Storage engine and its persistence settings, the storage adapters, the transport, snapshot content, domain events and their meaning, global ordering at the authority | The application (adapters may ship as separate packages; each is held to BEH-DB-055) |

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose | Behaviour |
| ------ | ---- | ------- | --------- |
| `DurableEvent.make`, `DurableEvent` | function, type | Declare a versioned event | [01](./behaviors/01-events-and-envelope.md) |
| `Envelope`, `Hlc` | types | What travels | [01](./behaviors/01-events-and-envelope.md), [05](./behaviors/05-order-and-clocks.md) |
| `DurableBus` | service `@bridger/durable-bus/DurableBus` | `publish`, `subscribe`, `receive`, `status`, `resume`, `unpark`, `releaseStream`, `acceptGap` | [02](./behaviors/02-transactional-outbox.md), [03](./behaviors/03-delivery-and-inbox.md) |
| `StoreTransaction` | service | The caller's open transaction, provided by the storage adapter | [02](./behaviors/02-transactional-outbox.md) |
| `OutboxStore`, `InboxStore` | ports | Storage obligations, implemented by adapters | [02](./behaviors/02-transactional-outbox.md), [03](./behaviors/03-delivery-and-inbox.md), [07](./behaviors/07-core-bus-and-adapters.md) |
| `DeliveryTransport` | port | Push path: sends a batch to a destination and returns its acknowledgement | [03](./behaviors/03-delivery-and-inbox.md) |
| `HistorySource`, `DurableBus.historySource`, `DurableBus.follow` | port, functions | Pull path: bounded pages of a source's retained envelopes, fed into the follower's inbox | [06](./behaviors/06-replay-and-snapshots.md) |
| `SnapshotProvider` | port | The application's snapshot for a subscriber behind the horizon | [06](./behaviors/06-replay-and-snapshots.md) |
| `DurableBus.plugin` | function | The bus as a plugin with its relay as a background fiber | [07](./behaviors/07-core-bus-and-adapters.md) |
| `DurableBus.forward` | function | Explicit, after-commit bridge to a core `EventKey` | [07](./behaviors/07-core-bus-and-adapters.md) |
| `TestStore`, `TestDelivery` | testing | In-memory transactional store, faulty delivery | [08](./behaviors/08-testing-and-acceptance.md) |

### Errors

| Tag | Raised when |
| --- | ----------- |
| `EncodeFailed { type, issue }` | The payload does not encode with the event's schema |
| `OutboxWriteFailed { cause }` | The adapter could not write in the caller's transaction (the caller's transaction fails with it) |
| `DeliveryFailed { destination, cause }` | A batch could not be delivered; retried by the relay |
| `EnvelopeConflict { origin, stream, sequence }` | One (origin, stream, sequence) seen with two different event ids |
| `UnknownEventVersion { type, version }` | An envelope's version is newer than the receiver knows, or older than its upcasters reach |
| `UpcastFailed { type, from }` | An upcaster failed |
| `DecodeFailed { type, version, issue }` | A payload does not decode after upcasting |
| `SnapshotRequired { source, stream, since }` | A `HistorySource.read` position predates the source's retained history (pull path only) |
| `HistoryUnavailable { source, cause }` | A history read could not be served; the follower backs off |
| `MalformedBatch { destination }` | A received batch holds an element without a decodable origin, stream or sequence; nothing is stored |
| `UnknownEnvelopeFormat { origin, stream, sequence, envelope }` | An element's envelope format is not 1; its stream stops at the inbox |
| `ClockSkewExceeded { origin, drift }` | A received HLC is ahead of the local clock by more than `maxDrift` (reported; the envelope is still received) |

Parked envelopes and halted subscription streams (BEH-DB-021, BEH-DB-022) carry
`UnknownEventVersion`, `UpcastFailed`, `DecodeFailed` or the handler's
failure as their reason; streams stopped at the inbox carry
`UnknownEnvelopeFormat` or `EnvelopeConflict`.

## Worked example

```ts
// illustrative — not type-checked
const SaleFinalisedV1 = Schema.Struct({ saleId: Schema.String, total: Schema.Number })
const SaleFinalised = DurableEvent.make("pos/sale-finalised", Schema.Struct({
  saleId: Schema.String, total: Schema.Number, currency: Schema.String
}), {
  version: 2,
  upcast: { 1: (v1) => Effect.succeed({ ...(v1 as object), currency: "XXX" }) },   // v1 -> v2, pure
  stream: (e) => "sales"
})

// In the plugin that records a sale: one storage transaction for the row and the event.
const finalise = (sale: Sale) =>
  store.transaction(Effect.gen(function* () {
    yield* sales.insert(sale)                                    // the application's own write
    yield* bus.publish(SaleFinalised, { saleId: sale.id, total: sale.total, currency: sale.currency })
  }))                                                            // commit: both or neither

// At the authority: a subscription that projects sales, in the same transaction as its cursor.
yield* bus.subscribe("ledger-projection", [SaleFinalised], (event, envelope) =>
  ledger.append(envelope.origin, envelope.sequence, event))      // runs inside StoreTransaction
```

A terminal offline for a day accumulates envelopes `sales` 1…n from origin
`terminal-03#2`. On reconnect the relay sends them in order, in batches the
receiver's credit allows; the authority's inbox stores each once, even if a
batch is resent after a lost acknowledgement; the projection sees 1…n in
order, once each.

## What stays in core, and what stays in the application

- **Core** keeps its in-memory bus, unchanged, and owns no storage
  ([ADR-BR-027](../core/decisions/027-core-exclusions.md)).
- **The application** chooses the storage engine and its persistence
  settings, implements or adopts an adapter that meets the obligations of
  [07](./behaviors/07-core-bus-and-adapters.md), decides routes and global
  ordering at its authority, and decides what each domain event means —
  including how an authority treats a fact it would have refused online.

---

_Next: [01 — Events and the envelope](./behaviors/01-events-and-envelope.md)_
