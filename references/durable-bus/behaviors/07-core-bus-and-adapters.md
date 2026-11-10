# 07 — Core bus, plugin packaging and storage adapters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-07                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, H9) — BEH-DB-054 property 6: the incarnation is recorded per node (CCR-DB-006)<br>0.6 (2026-11-09): Specification audit of 2026-11-09 (C-12) — BEH-DB-054 property 1: a commit the engine refuses for a conflict fails `transaction` with `CommitConflict`, never with `StoreUnavailable`; BEH-DB-056 exercises it (CCR-DB-004)<br>0.5 (2026-11-08): Round-2 agent review (R4 F16, F27) — the delivery check's `origin` documented as `node#incarnation` for every envelope, local ones included, with policies told to match the `node` part (aligned with core BEH-BR-269 as amended by CCR-BR-029); out-of-host readers are checked by the serving side's `HistoryAccess` (CCR-DB-003)<br>0.4 (2026-11-08): round 2: recheck item 24, CORE-DECISIONS-2 — BEH-DB-053 rewritten on core `AccessPolicy.ask` (publish, subscribe, and every delivery with `origin`), `AccessRefused`, denied deliveries parked; `listens` and `declaredOnly`; G55 closed; core held-event note (CCR-DB-003)<br>0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — no self-lease in `publish`; callers keep the bus up through core's own rules; adapter properties cover the saved receipt clock, retention and inbox-level stops (CCR-DB-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

This file places the package next to the core: its relation to the
in-memory event bus, how it runs as a plugin inside a host, and what a
storage adapter must guarantee for the rest of this specification to hold.
Adapters are obligations here, not implementations. This file owns
BEH-DB-049–056 and uses all eight.

Planned source: `packages/durable-bus/src/Plugin.ts`,
`packages/durable-bus/src/Forward.ts`; adapter conformance suite
`packages/durable-bus/src/testing/AdapterSuite.ts` *(Planned)*.

## BEH-DB-049: A separate contract, never a mode of the core bus

> **See:** [ADR-DB-001](../decisions/001-a-separate-contract-from-the-core-bus.md), [ADR-BR-020](../../core/decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-013](../../core/urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: The bus MUST be the service `@bridger/durable-bus/DurableBus`,
             distinct from `Bridger.Events`. It MUST NOT register listeners
             on, emit on, wrap or replace `Bridger.Events`, and MUST NOT
             accept a core `EventKey` where a `DurableEvent` is expected.
```

```
REQUIREMENT: The core event bus MUST NOT gain an option, mode or adapter that
             makes `emit`, `parallel`, `serial` or `waterfall` persistent
             because of this package.
```

Core holds and delivers exactly one triggering event when an event wakes a
lazy plugin (core BEH-BR-251); a consumer that needs every event across a
plugin's dormancy or a restart still needs this package.

**Settled here.** The two have different contracts: the core bus is
synchronous with its caller, typed by argument tuples, may return results
and compose as middleware, and loses everything on a crash; this one is
asynchronous, one-way, schema-encoded, transactional and at least once.
One API with a persistence flag would let a caller believe it had the second
contract while using the first.

## BEH-DB-050: forward is an explicit, after-commit bridge

> **See:** [ADR-DB-001](../decisions/001-a-separate-contract-from-the-core-bus.md)

```ts
// illustrative — not type-checked
declare const DurableBus: {
  forward<A, I, R, E>(subscription: string, event: DurableEvent<A, I>, to: EventKey<[A], R, E>):
    Effect.Effect<void, never, DurableBus | Bridger.Events | Scope.Scope>
}
```

```
REQUIREMENT: `forward` MUST be a subscription (03) whose handler, after its
             transaction committed, calls `Bridger.Events.emit(to, value)`.
             A core listener's failure MUST NOT affect the cursor, and the
             emit MUST NOT run inside the store transaction.
```

```
REQUIREMENT: Documentation of `forward` MUST state that core listeners
             receive the event at least once and may miss it if the process
             stops between commit and emit, and that they receive the
             decoded value: whatever they log or keep is outside the
             `PayloadCodec`'s reach (INV-DB-010).
```

## BEH-DB-051: The bus is a plugin; its relay is a background fiber

> **See:** [ADR-BR-002](../../core/decisions/002-plugin-build-is-a-layer.md)
> **Depends on:** [INV-RM-002](../../remote/invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer)

```
REQUIREMENT: `DurableBus.plugin({ id, origin, outbox, inbox, transport?,
             routes, carry?, annotationKeys?, … })` MUST return an ordinary plugin definition
             that requires the store and transport keys it names and provides
             `DurableBus`. Its build MUST NOT call the transport; it MUST read
             the incarnation and the start HLC from the store (BEH-DB-004,
             BEH-DB-034) and fork the relay, the followers (BEH-DB-047) and
             the subscription runners with `Plugin.Runtime.background`.
```

```
REQUIREMENT: Transport and store unavailability MUST be reported in status
             and retried; they MUST NOT end the plugin in `failed`.
```

## BEH-DB-052: Stopping the bus loses nothing

> **Invariant:** [INV-DB-003](../invariants.md#inv-db-003-an-envelope-is-acknowledged-only-after-the-receiver-committed-it)
> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md)

```
REQUIREMENT: When the bus plugin stops, the relay MUST be interrupted; a
             batch whose acknowledgement was not received MUST stay pending.
             Running handlers MUST be interrupted with their transactions
             rolled back. No envelope state MAY be kept only in memory across
             the stop.
```

```
REQUIREMENT: Callers MUST reach `publish` through a requirement on
             `DurableBus` (a captured binding) or through `Host.use`, so that
             core's own rules keep the bus up while they use it: dependents
             stop before their providers, and a `Host.use` lease holds the
             provider until released
             ([09 — Leases](../../core/behaviors/09-leases.md)). `publish`
             itself MUST NOT take a lease on `DurableBus`.
```

```
REQUIREMENT: `publish` runs in the caller's fiber and writes only through the
             caller's `StoreTransaction`; stopping the bus MUST NOT interrupt
             it. A `publish` that commits while the relay is stopped leaves
             its envelope pending for the next start (BEH-DB-014).
```

## BEH-DB-053: Who may publish and subscribe: the host's AccessPolicy

> **Invariant:** [INV-DB-011](../invariants.md#inv-db-011-no-envelope-is-delivered-to-a-subscriber-the-access-policy-denied)
> **Depends on:** [core 28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (`AccessPolicy.ask` BEH-BR-269, `AccessPolicy.declaredOnly` BEH-BR-268, `AccessRefused`)
> **Satisfies:** [URS-BR-033](../../core/urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove)

```
REQUIREMENT: When the core plugin principal is available, the bus MUST
             record the publishing plugin as `onBehalfOf`
             (`PrincipalRef.encode`, BEH-DB-002) and MUST call core
             `AccessPolicy.ask` (BEH-BR-269):
             - `{ kind: "emit", event: type, mode: "publish" }` in the
               publishing fiber before each `publish`;
             - `{ kind: "listen", event: type, style: "subscribe" }` in the
               subscriber's fiber when a subscription is made;
             - `{ kind: "listen", event: type, style: "delivery", origin }`
               before each delivery to a subscription handler, with
               `options.principal` the principal read with
               `CurrentPlugin.get` at subscription and `origin` the
               envelope's origin, for every envelope — whether published
               locally, received from another host by `receive`, or pulled
               by `follow`.
             `origin` is this package's documented source id (core
             BEH-BR-269): `node#incarnation` (BEH-DB-004). It changes at
             every restore that raises the incarnation and at every
             whole-store re-bootstrap (BEH-DB-048), so a policy that keys on
             a host MUST match the `node` part (the text before "#").
             Locally published envelopes carry this node's own origin, as
             core allows.
             A denial of `publish` or `subscribe` MUST fail the call with
             `AccessRefused` and write nothing.
```

```
REQUIREMENT: A denied delivery MUST NOT run the handler. The envelope MUST
             stay stored in the inbox; for that subscription it MUST be
             handled as unreadable with `AccessRefused` under its
             `onPoison`, so that it is parked or halts, never silently
             skipped. A `{ deny: "principal-retired" }` (the subscriber's
             activation ended) MUST instead leave the cursor where it is,
             for the next registration (BEH-DB-023).
```

```
REQUIREMENT: Documentation MUST state that `AccessPolicy.declaredOnly`
             (core BEH-BR-268) applies to events of this package through the
             manifest's `listens` list: a subscriber plugin declares the
             event ids it subscribes to, and an undeclared subscription is
             refused like an undeclared core listener.
```

**Settled here.** One table answers who may read an event type, whether the
event came through `Bridger.Events`, from this host's outbox or from another
host (core gap G55, closed by CCR-BR-026). It answers for this host's
subscribers only: a reader outside the host — a peer pulling through a
`HistorySource` — is checked by the serving side's `HistoryAccess` (06,
BEH-DB-047). Checking at delivery, not only at
subscription, is what makes a policy change reach existing subscriptions —
the case of a partner whose access to a stream of personal data is
withdrawn. Parking a denied envelope keeps the inbox's no-silent-drop rule.

## BEH-DB-054: Storage adapter obligations

> **Invariant:** [INV-DB-001](../invariants.md#inv-db-001-an-envelope-is-in-the-outbox-exactly-when-its-transaction-committed), [INV-DB-002](../invariants.md#inv-db-002-sequence-is-contiguous-per-origin-and-stream)
> **See:** [ADR-DB-002](../decisions/002-outbox-through-a-storage-port.md), [ADR-DB-007](../decisions/007-the-name-is-not-a-claim.md)

```
REQUIREMENT: A storage adapter MUST provide `StoreTransaction`,
             `OutboxStore` and `InboxStore` with these properties, and
             MUST document how it meets each:
             1. The application's writes, the outbox append, the inbox
                store, the cursor advance and the snapshot restore of one
                `transaction(effect)` commit atomically or not at all. A
                commit the engine refuses because of a concurrent
                transaction fails `transaction` with `CommitConflict`
                (BEH-DB-018), never with `StoreUnavailable` or a defect, so
                that the bus can tell contention from an outage.
             2. Committed sequences per (origin, stream) are unique and
                contiguous; concurrent appenders serialize.
             3. (origin, stream, sequence) and `eventId` are unique per
                outbox and per inbox; a violation is reported, not merged;
                the inbox answers `eventIdAt` for every sequence it still
                retains, and its retention is documented (BEH-DB-018).
             4. `pending` returns committed rows only, in sequence order.
             5. Watermarks, cursors and acknowledgements never move
                backwards, except through a snapshot restore (BEH-DB-044);
                a watermark passes unstored sequences only through
                `acceptGap`; inbox-level stops persist until released.
             6. The incarnation recorded per node (BEH-DB-004), the
                highest outbox HLC and the clock saved
                by the last committed receipt are recoverable at start; the
                HLC `stamp` runs inside the serialization of BEH-DB-011.
             The `retained` reads return committed envelopes only, in
             sequence order, with the lowest retained sequence.
             7. Its persistence after a process crash and after a power loss
                is stated explicitly, with the engine settings it depends
                on; this specification makes no such claim itself.
```

```
REQUIREMENT: An adapter MUST pass the adapter conformance suite (BEH-DB-056)
             before it is described as an adapter for this package.
```

## BEH-DB-055: SQLite is the first adapter target

> **See:** [ADR-DB-002](../decisions/002-outbox-through-a-storage-port.md)

```
REQUIREMENT: The first adapter specified for conformance MUST target SQLite.
             Beyond BEH-DB-054 it MUST: run every bus transaction as an
             immediate write transaction (single writer, so sequence
             allocation serializes); declare the journal mode and
             `synchronous` setting it requires and refuse to start under a
             weaker one than it documents; keep the outbox, inbox, cursors
             and parked rows in the application's database file so that one
             transaction covers them.
```

```
REQUIREMENT: The SQLite adapter MUST NOT be part of this package's runtime
             dependencies; it ships as a separate package.
```

**Settled here.** SQLite first because the local-first pattern this package
serves keeps a native SQLite database per node. Which `synchronous` level a
deployment uses trades write latency against loss of the last transactions
on power failure — a consumer decision the adapter must make visible.

## BEH-DB-056: The adapter conformance suite

> **See:** [ADR-DB-002](../decisions/002-outbox-through-a-storage-port.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```
REQUIREMENT: The package MUST export, from its testing entry point, a
             conformance suite that exercises each property of BEH-DB-054
             (1–6) against a given adapter, including concurrent appenders,
             rollback after append, process termination between append and
             commit (where the adapter's test harness can simulate it),
             duplicate inserts, and a conflict at commit reported as
             `CommitConflict` with nothing committed (where the engine can
             refuse a commit for a conflict).
```

```
REQUIREMENT: Property 7 of BEH-DB-054 MUST NOT be reported as checked by the
             suite; it is the adapter's and the consumer's to establish.
```

---

_Previous: [06 — Replay, backpressure and snapshots](./06-replay-and-snapshots.md)_ · _Next: [08 — Testing and acceptance](./08-testing-and-acceptance.md)_
