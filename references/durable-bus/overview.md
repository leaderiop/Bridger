# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-OVW                                               |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09) — `DurableBus.whenReadable` row: not awaited inside a store transaction or a participant step; `DurableBus.guardRead` row (H4, H5, H6); second pass (cleanest design): `onStoreSwap` row names the `stage` and the `SwapStep`; rows for `DurableBus.fenceRead` and `DurableBus.guardStep`; the `whenReadable` and `guardRead` rows lose the step exemption; `OutboxFrozen` row names `fenceRead`; `PayloadCodec` row: `encode` passed the transaction; third pass: a store-swap step that awaits the read gate is refused at once instead of left to deadlock — the `whenReadable` row names the refusal (CCR-DB-012)<br>0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — `DurableBus.whenReadable` row (H3); error rows: `OutboxFrozen` names the fence and the holds, `RebootstrapBlocked` names "store-swap-pending", `SnapshotFailed` row added (PL20) (CCR-DB-011)<br>0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — `DurableBus.onStoreSwap` row names `apply`; `StoreTransaction` row: `onEnd` given the outcome (H4, K3) (CCR-DB-010)<br>0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — `StoreTransaction` row names `onEnd` (H3) (CCR-DB-009)<br>0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — `DurableBus.fence` row: admitted until its transaction commits or rolls back, not scoped (H2) (CCR-DB-008)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — `DurableBus.fence` in the API table (PL19) (CCR-DB-007)<br>0.6 (2026-11-09): Specification audit of 2026-11-09 — `publish` options, `origin`, `originChanges` and `onStoreSwap` in the API table; `CommitConflict` in the error table (CCR-DB-004)<br>0.5 (2026-11-08): Round-2 agent review — API rows for `OutboxSettlement`, `IncarnationSource`, `HistoryReader`/`HistoryAccess`, `Withheld`, `subscribeEnvelopes`, reader versions; errors `OutboxFrozen`, `IncarnationUnavailable` (CCR-DB-003)<br>0.4 (2026-11-08): round 2: recheck items 19–22 and 24 — API rows and errors for the codec, outbox settle, writers-last options and version reports; access through `AccessPolicy.ask` (CCR-DB-003)<br>0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — `HistorySource`, `follow`, `acceptGap`, `releaseStream`, `resume`; new error tags; annotations under flow "wire" (BEH-BR-296) (CCR-DB-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

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
| Who may publish, subscribe and receive each delivery | Core — [core 28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (`AccessPolicy.ask` BEH-BR-269, `declaredOnly` BEH-BR-268), optional |
| Payload encryption keys, per-subject erasure | The planned keyring companion, through this package's `PayloadCodec` port |
| Residency labels and their comparison | `@bridger/remote` `PlacementPolicy` ([references/remote/](../remote/README.md)) |
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
| `DurableBus` | service `@bridger/durable-bus/DurableBus` | `publish` (with `PublishOptions`: `stream`, `causationId`), `subscribe`, `receive`, `status`, `resume`, `unpark`, `releaseStream`, `acceptGap` | [02](./behaviors/02-transactional-outbox.md), [03](./behaviors/03-delivery-and-inbox.md) |
| `DurableBus.origin`, `DurableBus.originChanges`, `OriginChange` | effect, stream, type | The origin `publish` stamps now, and each switch to a new origin | [01](./behaviors/01-events-and-envelope.md) |
| `DurableBus.onStoreSwap` | function | A participant of a whole-store install, declaring its `stage` ("codec": restores keys and tombstones, its `apply` first; "data": every other): `prepare` reads the store about to be replaced, the optional `apply` writes to the new store before the `OriginChange`; each `prepare` and "data" `apply` is handed a `SwapStep`, the only way a step decodes | [06](./behaviors/06-replay-and-snapshots.md) |
| `DurableBus.fence` | function | The write fence of a whole-store install, checked inside a write transaction and admitted until that transaction commits or rolls back | [06](./behaviors/06-replay-and-snapshots.md), [07](./behaviors/07-core-bus-and-adapters.md) |
| `DurableBus.whenReadable` | effect | The read gate of a whole-store install: completes when no freeze (from its second step), `apply-pending` or `origin-unrecorded` is in force; a follower awaits it before each batch transaction, a read inside a store transaction takes `fenceRead` instead; awaited in a running store-swap step, or a fiber it forked, it dies at once with a defect naming the participant and the step (the bus-owned `CurrentSwapStep`, used only to refuse) | [06](./behaviors/06-replay-and-snapshots.md) |
| `DurableBus.guardRead` | function | Runs one page of a read outside a store transaction behind `whenReadable`, interrupted (`Option.none()`) when a freeze's second step begins; never skips the gate; event-store `read` and `readAll`, and any application decoding through the codec outside a transaction, use it | [06](./behaviors/06-replay-and-snapshots.md) |
| `DurableBus.fenceRead(tx)` | function | The read fence: `fence`'s admission taken for a read inside `tx`, never awaiting `whenReadable`, refused with `OutboxFrozen` during a freeze and the holds; dies on a store-swap step's transaction; event-store `readIn` uses it | [06](./behaviors/06-replay-and-snapshots.md) |
| `DurableBus.guardStep(step, page)` | function | Runs one page of a read a store-swap step makes with the `SwapStep` it was handed, at once, neither gated nor interrupted; dies once that step has ended; event-store `readForSwap` uses it | [06](./behaviors/06-replay-and-snapshots.md) |
| `StoreTransaction` | service | The caller's open transaction, provided by the storage adapter: its `handle`, and `onEnd(f)`, run by the adapter once the transaction has committed or rolled back, given the outcome | [02](./behaviors/02-transactional-outbox.md) |
| `OutboxStore`, `InboxStore` | ports | Storage obligations, implemented by adapters | [02](./behaviors/02-transactional-outbox.md), [03](./behaviors/03-delivery-and-inbox.md), [07](./behaviors/07-core-bus-and-adapters.md) |
| `DeliveryTransport` | port | Push path: sends a batch to a destination and returns its acknowledgement | [03](./behaviors/03-delivery-and-inbox.md) |
| `HistorySource`, `DurableBus.historySource`, `DurableBus.follow` | port, functions | Pull path: bounded pages of a source's retained envelopes, fed into the follower's inbox | [06](./behaviors/06-replay-and-snapshots.md) |
| `SnapshotProvider` | port | The application's snapshot for a subscriber behind the horizon | [06](./behaviors/06-replay-and-snapshots.md) |
| `DurableBus.plugin` | function | The bus as a plugin with its relay as a background fiber | [07](./behaviors/07-core-bus-and-adapters.md) |
| `DurableBus.forward` | function | Explicit, after-commit bridge to a core `EventKey` | [07](./behaviors/07-core-bus-and-adapters.md) |
| `PayloadCodec`, `PayloadCodec.identity` | port, value | Encodes payloads after schema encoding (for example field encryption); `encode` is passed the transaction the payload is written in, the only one a codec may write in | [01](./behaviors/01-events-and-envelope.md) |
| `DurableBus.rebootstrapOutbox`, `OutboxSettlement` | function, type | Push or keep the outbox before a snapshot (the federation companion's `RebootstrapOutbox`); the settlement's `install` is the guarded install path | [06](./behaviors/06-replay-and-snapshots.md) |
| `IncarnationSource` | port | The origin's incarnation kept outside the store, raised by a whole-store re-bootstrap | [01](./behaviors/01-events-and-envelope.md) |
| `HistoryReader`, `HistoryAccess` | types, port | Per-reader placement and access on the pull path | [06](./behaviors/06-replay-and-snapshots.md) |
| `Withheld` | type | A sequence withheld from a destination or reader | [02](./behaviors/02-transactional-outbox.md), [03](./behaviors/03-delivery-and-inbox.md) |
| `DurableBus.subscribeEnvelopes`, `onUnreadable` | function, option | Undecoded delivery for fact recorders; halt or park on an unreadable payload | [03](./behaviors/03-delivery-and-inbox.md) |
| `DurableEventOptions.publishVersion`, `downcast`; `DurableBus.status.versions`, `status.readers`, `resetVersions`, `versionReports` | options, status | Writers-last rollout, the oldest version received per origin and the readers' versions | [04](./behaviors/04-versions-and-upcasters.md) |
| `TestStore`, `TestDelivery` | testing | In-memory transactional store, faulty delivery | [08](./behaviors/08-testing-and-acceptance.md) |

### Errors

| Tag | Raised when |
| --- | ----------- |
| `EncodeFailed { type, issue }` | The payload does not encode with the event's schema |
| `OutboxWriteFailed { cause }` | The adapter could not write in the caller's transaction (the caller's transaction fails with it) |
| `CommitConflict { reason }` | The engine refused an inbox transaction's commit because of a concurrent transaction; the attempt is retried (`receive` fails and the sender resends) |
| `DeliveryFailed { destination, cause }` | A batch could not be delivered; retried by the relay |
| `EnvelopeConflict { origin, stream, sequence }` | One (origin, stream, sequence) seen with two different event ids |
| `UnknownEventVersion { type, version }` | An envelope's version is newer than the receiver knows, or older than its upcasters reach |
| `UpcastFailed { type, from }` | An upcaster failed |
| `DecodeFailed { type, version, issue }` | A payload does not decode after upcasting |
| `SnapshotRequired { source, stream, since }` | A `HistorySource.read` position predates the source's retained history (pull path only) |
| `HistoryUnavailable { source, cause }` | A history read could not be served; the follower backs off |
| `MalformedBatch { destination }` | A received batch holds an element without a decodable origin, stream or sequence; nothing is stored |
| `UnknownEnvelopeFormat { origin, stream, sequence, envelope }` | An element's envelope format is not 1; its stream stops at the inbox |
| `PayloadEncodeFailed`, `PayloadDecodeFailed`, `PayloadUnreadable` | The codec could not encode, could not decode, or can no longer read a payload (handled under `onUnreadable`: parked, halted or handed over raw; never dropped) |
| `DowncastRefused { type, from, reason }` | A value at N cannot be published at N−1 without loss |
| `RebootstrapBlocked { pending, reason }` | `rebootstrapOutbox` could neither push nor keep the outbox, or the install kind does not allow it, or an earlier whole-store install is unfinished ("store-swap-pending": `apply-pending` or `origin-unrecorded` holds) (federation's tag) |
| `SnapshotFailed { reason }` | A snapshot restore or `OutboxSettlement.install` failed: "outbox-touched", "prepare-failed", "apply-failed" (the bus then holds `apply-pending`), or the `SnapshotProvider`'s own reason |
| `OutboxFrozen { reason }` | `publish`, `DurableBus.fence(tx)`, `DurableBus.fenceRead(tx)` and the writes of stores that take the fence (event-store, keyring) during a whole-store freeze, and while `origin-unrecorded` or `apply-pending` holds (the caller's transaction fails with it) |
| `IncarnationUnavailable { cause }` | The `IncarnationSource` could not be read or raised |
| `AccessRefused { kind, subject, reason }` | Core's tag: the `AccessPolicy` denied a publish, a subscription or a delivery |
| `PlacementRefused` | The remote companion's tag: a route or inbox does not offer an envelope's residency label |
| `ClockSkewExceeded { origin, drift }` | A received HLC is ahead of the local clock by more than `maxDrift` (reported; the envelope is still received) |

Parked envelopes and halted subscription streams (BEH-DB-021, BEH-DB-022) carry
`UnknownEventVersion`, `UpcastFailed`, `DecodeFailed` or the handler's
failure as their reason, and also `PayloadDecodeFailed`, `PayloadUnreadable`
(under `onUnreadable`) or `AccessRefused`; streams stopped at the inbox carry
`UnknownEnvelopeFormat`, `EnvelopeConflict` or `PlacementRefused`.

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
  ([ADR-BR-027](../core/decisions/027-core-exclusions.md)). This package
  uses core's `AccessPolicy.ask`, `CurrentCorrelation` and
  `PrincipalRef.encode`; core now holds one triggering event for a lazy
  plugin (BEH-BR-251), which does not replace this package.
- **The application** chooses the storage engine and its persistence
  settings, implements or adopts an adapter that meets the obligations of
  [07](./behaviors/07-core-bus-and-adapters.md), decides routes and global
  ordering at its authority, and decides what each domain event means —
  including how an authority treats a fact it would have refused online.

---

_Next: [01 — Events and the envelope](./behaviors/01-events-and-envelope.md)_
