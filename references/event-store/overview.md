# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-OVW                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview (companion)              |
> | Change History | 0.3 (2026-11-09): API table: `EventStore` members, `publish.stream` signature, `receiveVerbatimOptions`; publication's delivery stream and attribution (CCR-ES-003)<br>0.2 (2026-11-08): API table adds `recordFact`, `receiveVerbatim` and `receiveOptions`; the worked example gives the `FactDecider` its required `factId` (CCR-ES-002)<br>0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

## Mission

A local-first plugin system keeps working when the network does not: each
host — a terminal, a shop hub, an authority — writes its own state, and the
hosts converge later. The event delivery companion moves versioned events
between them through an outbox and an inbox, and leaves the storage engine
and the domain events to the application
([durable-bus overview](../durable-bus/overview.md)). Every such system then
writes the same layer by hand: streams with expected versions, a fold from
events to state, projections that must not skip an event, snapshots, and an
outbox written in the same transaction as the events.

`@bridger/event-store` specifies that layer once, as mechanism only:

- **streams** — append-only, numbered 1, 2, 3 … per stream, appended with an
  expected version and refused with `WrongExpectedVersion` when another
  writer got there first;
- **decide and evolve** — a decider whose `evolve` folds events into state and
  whose `decide` turns a command into events; and, for facts that already
  happened offline, an entry point that cannot reject: rule violations come
  out as events;
- **projections** — read models fed in commit order, with a checkpoint written
  in the projection's own transaction, a halt instead of a skip, and rebuild;
- **snapshots** — a cache of folded state, never a source of truth;
- **versions** — events declared once with durable-bus `DurableEvent`, read
  through its upcasters;
- **publication** — selected events handed to durable-bus `publish` inside the
  append's transaction, on their event-store stream and with the stored
  event's attribution, so an event is published exactly when it is stored;
- **chaining** (optional) — the stored events handed to audit-chain's
  `ChainSink<R>`, in their stored form, so that field encryption and
  crypto-shredding leave the chain verifiable.

## Package boundary

| Package | Relationship |
| ------- | ------------ |
| `@bridger/core` | Dependency. The store is a plugin providing the `EventStore` contract (core 26); it reads `Clock`, `IdGenerator`, the caller's context and `CurrentCorrelation` (core 22, 24) and consults `AccessPolicy.ask` (core 28). Core never depends on this package. |
| `@bridger/durable-bus` | Dependency. Event declarations (`DurableEvent`), `StoreTransaction`, `publish`, the origin and its incarnation, the inbox, and `PayloadCodec`. The event store and the bus's `OutboxStore` share one storage adapter and one database. |
| `@bridger/audit-chain` | Optional. When wired, stored events are handed to a `ChainSink<R>`; audit-chain is not a dependency of the package's main entry point. |
| `@bridger/sequence` | Consumer. A number series is an event-store stream ([sequence companion](../sequence/README.md)). |
| `@bridger/keyring` | Optional. Supplies a `PayloadCodec` that encrypts selected fields ([keyring companion](../keyring/README.md)). |
| Storage adapter | Behind the `EventStoreAdapter` port; SQLite and Postgres obligations specified, no adapter shipped by this specification. |

Planned source: `packages/event-store/src/` *(Planned)*, testing entry point
`@bridger/event-store/testing` *(Planned)*.

## Public API surface

All signatures are illustrative until code exists.

### Streams — [behaviour 01](./behaviors/01-streams-and-append.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `EventStore` | service (contract, local) | The store, provided by the event-store plugin; members `register`, `append`, `read`, `readAll`, `hasFact`, `savepoint`, `checkpoints`, `snapshots`, which grants name ([behaviour 05](./behaviors/05-storage-port-and-acceptance.md), BEH-ES-038) |
| `EventStore.register` | function | Register the `DurableEvent`s a store may hold |
| `Stream.append(id, events, { expectedVersion, context? })` | function | Append in the caller's `StoreTransaction` |
| `Stream.read(id, options?)` | function | Read a stream, upcast then decoded |
| `ExpectedVersion` | type | `number \| "no-stream" \| "stream-exists" \| "any"` |
| `StoredEvent`, `AppendResult` | types | The stored form; what an append returns |
| `WrongExpectedVersion` | error | The stream's version was not the expected one |

### Decide and evolve — [behaviour 02](./behaviors/02-decide-and-evolve.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Decider<S, C, E, Err>` | type | `initial`, `evolve`, `decide`, `streamOf` |
| `FactDecider<S, F, E>` | type | `initial`, `evolve`, `accept` — no error channel |
| `Aggregate.handle`, `Aggregate.run` | functions | Load, decide, append; `run` opens the transaction and retries on conflict |
| `Aggregate.record`, `Aggregate.recordFact` | functions | Record a fact; never rejects. `record` runs in the caller's transaction, `recordFact` opens its own and retries on conflict |

### Projections and snapshots — [behaviour 03](./behaviors/03-projections-and-snapshots.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Projection.make` | function | Declare a projection: name, version, handled events, `apply`, `reset` |
| `Projections.inline`, `Projections.follow` | functions | Run a projection in the append's transaction, or after commit by position |
| `Projections.rebuild`, `Projections.status` | functions | Reset and replay; status per projection |
| `Snapshots.policy` | function | When and how folded state is cached |

### Versions, publication, chaining — [behaviour 04](./behaviors/04-versions-publication-and-chaining.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `EventStore.register(event, { publish? })` | option | Which events go to the outbox; on the event-store stream, or on `publish.stream(stream, event)` |
| `EventStore.receive`, `EventStore.receiveVerbatim`, `EventStore.receiveOptions`, `EventStore.receiveVerbatimOptions` | functions, constants | Record an envelope received through the inbox as a fact, decoded (durable-bus `subscribe`) or byte for byte (`subscribeEnvelopes`), in one transaction; the halting subscription options each requires |
| `EventStore.chain` | function | Follow stored events into a `ChainSink<StoredEvent>` |

### Storage — [behaviour 05](./behaviors/05-storage-port-and-acceptance.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `EventStoreAdapter` | port | Rows, positions, checkpoints, snapshots, the shared transaction |
| `EventStoreConformance` | test suite | The adapter conformance suite (testing entry point) |
| `memoryEventStore` | fixture | An in-memory adapter for tests (testing entry point only) |

## Worked example

```ts
// illustrative — not type-checked
import { DurableEvent } from "@bridger/durable-bus"
import { EventStore, Aggregate, Projection, Projections } from "@bridger/event-store"

// The application's events (the package defines none).
const ItemAdded   = DurableEvent.make("app/ItemAdded",   ItemAddedSchema,   { version: 1 })
const ItemRemoved = DurableEvent.make("app/ItemRemoved", ItemRemovedSchema, { version: 1 })
const LimitExceeded = DurableEvent.make("app/LimitExceeded", LimitSchema,   { version: 1 })

// An online command: may be refused.
const basket: Decider<Basket, BasketCommand, BasketEvent, BasketRejected> = {
  initial: Basket.empty,
  evolve: Basket.apply,                                       // pure, total
  decide: (state, cmd) => Basket.decide(state, cmd),          // Effect<BasketEvent[], BasketRejected>, no services
  streamOf: (cmd) => `basket-${cmd.basketId}`
}

// A fact that happened offline: cannot be refused; a broken rule becomes an event.
const counter: FactDecider<Counter, CounterFact, CounterEvent> = {
  initial: Counter.empty,
  evolve: Counter.apply,
  accept: (state, fact) => state.total + fact.amount > state.limit
    ? [fact.event, LimitExceeded.of({ by: state.total + fact.amount - state.limit })]
    : [fact.event],
  streamOf: (fact) => `counter-${fact.counterId}`,
  factId: (fact) => fact.factId                               // assigned where the fact happened; idempotency key
}

const program = Effect.gen(function* () {
  // Opens the adapter's transaction, retries the whole transaction on WrongExpectedVersion.
  yield* Aggregate.run(basket, { _tag: "AddItem", basketId: "b-1", item }, { retries: 3 })

  // Inside the caller's own transaction: the append, its outbox entries and an
  // inline projection commit together or not at all.
  yield* adapter.transaction(Aggregate.record(counter, { factId, counterId: "c-1", amount, event }))
})

// A read model the application owns, fed after commit with its checkpoint in the same transaction.
const totals = Projection.make({ name: "app/totals", version: 2, events: [ItemAdded, ItemRemoved],
  apply: (e) => totalsTable.apply(e), reset: totalsTable.truncate })
const follower = Projections.follow(totals, { batch: 200 })
```

## What stays in core

Attribution, `CurrentCorrelation`, `Clock`, `IdGenerator`, contracts,
`AccessPolicy` and grants. Core keeps no events, computes no projection and
owns no storage ([ADR-BR-027](../core/decisions/027-core-exclusions.md)).
Stored events are not core audit records: the core trail records lifecycle
operations on plugins, not the application's business facts
([BEH-BR-207](../core/behaviors/23-audit-sink-and-record.md)).

## What stays in the application

- Domain events, their schemas and their meaning; aggregates, deciders and
  rules; projection schemas and tables (ADR-ES-001).
- Which events are published, and on which delivery stream.
- Which payload fields are encrypted, through which codec.
- The storage engine, its configuration, backups and retention; the choice of
  adapter and the evidence that it meets the obligations of behaviour 05.
- Whether offline input is modelled as facts (never rejected) or as commands
  (refusable); the review of violation events.

## Limits

1. An expected version protects one stream. Rules that span streams hold only
   as far as the application writes them in one transaction or reconciles them
   with events.
2. A projection followed after commit lags the store; a read that needs the
   newest state reads the stream or uses an inline projection.
3. A snapshot is a cache: if it disagrees with the events, the events win, and
   the package can say so only when a check replays the stream.
4. Publication is at least once, and the receiving side's effect happens once
   only through the inbox in the receiver's transaction (durable-bus).
5. The package cannot make an engine keep what it acknowledged; it states what
   an adapter must do and tests it in the conformance suite.

---

_Previous: [README](./README.md)_ · _Next: [01 — Streams and append](./behaviors/01-streams-and-append.md)_
