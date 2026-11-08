# 06 — Replay, backpressure and snapshots

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-06                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — downstream history is pulled through the new `HistorySource` port (BEH-DB-047); `SnapshotRequired` only on that port; `Ack.retryAfter` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

When a fleet reconnects after a long outage, every node sends its backlog at
once and every subscriber asks for everything it missed: a replay storm
(architecture review §9). This file bounds the load a receiver accepts,
keeps live traffic flowing during a replay, and replaces replay by a
snapshot for a subscriber that is behind the source's retained history.
Two directions are distinguished throughout: **upstream facts** (a node's
own outbox) are never dropped, only slowed; **downstream history** (a
source's retained envelopes that a subscriber reads) may be replaced by a
snapshot. Upstream facts are pushed by the relay (`DeliveryTransport`, 03);
downstream history is pulled by the subscriber (`HistorySource`,
BEH-DB-047). This file owns BEH-DB-041–048 and uses BEH-DB-041–047;
BEH-DB-048 is reserved.

Planned source: `packages/durable-bus/src/Relay.ts` and
`packages/durable-bus/src/Snapshot.ts` *(Planned)*.

## BEH-DB-041: The receiver grants credit

> **Invariant:** [INV-DB-008](../invariants.md#inv-db-008-in-flight-delivery-is-bounded-by-the-receivers-credit)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```
REQUIREMENT: Every acknowledgement MUST carry `credit { maxBatch, maxInFlight }`.
             A relay MUST NOT send a batch larger than `maxBatch` nor have
             more than `maxInFlight` unacknowledged batches to that
             destination. Before the first acknowledgement it MUST use
             `initialCredit` (default `{ maxBatch: 100, maxInFlight: 1 }`).
```

```
REQUIREMENT: A receiver MUST compute credit from its own load (inbox
             transaction latency, pending handler work) and MAY grant zero,
             in which case the relay MUST wait `Ack.retryAfter` (default
             `retryMin` when absent) before trying again.
```

## BEH-DB-042: Reconnection is spread out

> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```
REQUIREMENT: After `DeliveryFailed`, the relay MUST back off exponentially
             from `retryMin` (default 1 second) to `retryMax` (default 5
             minutes), with full jitter drawn from Effect's `Random`.
```

Full jitter is what keeps a thousand terminals that lost the WAN at the same
second from all retrying at the same second when it returns.

## BEH-DB-043: Live streams are not starved by a backlog

> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```
REQUIREMENT: When several streams are pending for one destination, the relay
             MUST fill each batch across streams by stream `priority`
             (configured per route, default 0, higher first) and, within one
             priority, round-robin. Order within one (origin, stream) MUST be
             kept.
```

A stream of urgent notifications can be configured above a week's backlog
of routine events; ordering within each stream is never traded for it.

## BEH-DB-044: A subscriber behind the retained history needs a snapshot

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)
> **Depends on:** [BEH-FD-014](../../federation/behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot) (federation re-bootstrap)

```
REQUIREMENT: A `HistorySource` (BEH-DB-047) MUST answer a read whose `after`
             is older than its oldest retained envelope for that
             (origin, stream) — `after + 1 < oldest` — with
             `SnapshotRequired { source, stream, since: after }`, and MUST
             NOT silently start from its oldest retained envelope.
```

```
REQUIREMENT: On `SnapshotRequired`, the following bus MUST stop following
             that source and stream, report `snapshot-required`, and call the
             application's `SnapshotProvider.restore` when one is wired; the
             provider returns the positions the snapshot reflects. The inbox
             watermark of each returned (origin, stream) and the cursor of
             every subscription on it MUST be set to the returned position,
             and following resumes from there. Without a provider, following
             MUST stay stopped and reported.
```

```ts
// illustrative — not type-checked
interface SnapshotProvider {
  readonly restore: (q: { readonly source: string; readonly streams: readonly string[] }) =>
    Effect.Effect<readonly { origin: string; stream: string; sequence: number }[], SnapshotFailed, StoreTransaction>
}
```

```
REQUIREMENT: The snapshot's restore, the watermark reset and the cursor
             resets MUST commit in one `StoreTransaction`.
```

**Settled here.** The snapshot's content is the application's (a catalogue, a
projection); this package only refuses to pretend a gap is not there, and
moves the cursor atomically with the restored state.

## BEH-DB-045: Upstream facts are slowed, never truncated

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```
REQUIREMENT: The push path MUST NOT carry `SnapshotRequired`:
             `DeliveryTransport.send` returns only `Ack` or `DeliveryFailed`
             (BEH-DB-017), and an inbox accepts the next sequence of any
             origin however old (BEH-DB-018). Backpressure MUST be the only
             limit on upstream delivery.
```

```
REQUIREMENT: The replay horizon of downstream history SHOULD be no shorter
             than the federation offline cap
             ([BEH-FD-013](../../federation/behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-013-the-offline-cap)),
             so that a host back within the cap replays rather than
             re-bootstraps.
```

## BEH-DB-046: Replay progress is observable

> **See:** [ADR-BR-007](../../core/decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-004](../../core/urs.md#urs-br-004-know-why-a-plugin-is-not-running)

```
REQUIREMENT: `DurableBus.status` MUST report, per destination, the pending
             count, the oldest pending age, the current credit and the
             retry state; and per subscription and source, the cursor, the
             lag, parked counts and halted streams. A `changes` stream MUST
             publish the events named in this specification as a sliding
             feed, which is not a record.
```


## BEH-DB-047: HistorySource — the pull port for downstream history

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently), [INV-DB-008](../invariants.md#inv-db-008-in-flight-delivery-is-bounded-by-the-receivers-credit)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```ts
// illustrative — not type-checked
interface HistorySource {
  readonly read: (q: { readonly origin: string; readonly stream: string; readonly after: number; readonly limit: number }) =>
    Effect.Effect<readonly Envelope[] | SnapshotRequired, HistoryUnavailable>
}
declare const DurableBus: {
  // serves this bus's retained envelopes (its outbox, and envelopes its inbox stores) as a HistorySource
  historySource(options?: { readonly maxPage?: number }): Effect.Effect<HistorySource, never, DurableBus>
  // pulls one source's history into this bus's inbox, for the streams and origins named
  follow(options: { readonly source: string; readonly history: HistorySource;
                    readonly streams: readonly string[]; readonly origins: readonly string[] }):
    Effect.Effect<void, never, DurableBus | Scope.Scope>
}
```

```
REQUIREMENT: `read` MUST return committed envelopes of (origin, stream) with
             sequences after `after`, contiguous and in sequence order, at
             most `min(limit, maxPage)` of them (`maxPage` default 500), read
             through `OutboxStore.retained` or `InboxStore.retained`; an
             empty array means the source holds nothing newer. It MUST return
             `SnapshotRequired` under BEH-DB-044. How a remote subscriber
             reaches a source's `read` is the transport's (for example one
             bounded call of the remote companion).
```

```
REQUIREMENT: `follow` MUST pull with `after` equal to its inbox watermark of
             each (origin, stream), MUST have at most one `read` in flight per
             source, MUST bound each `read` by `deliveryTimeout`, MUST back
             off after `HistoryUnavailable` or a timeout as BEH-DB-042, and
             MUST wait `followInterval` (default 5 seconds, jittered from
             `Random`) after an empty page. Each page MUST be passed to the
             same inbox processing as `receive` (BEH-DB-018), so duplicates,
             gaps, conflicts and stops follow those rules.
```

```
REQUIREMENT: `follow` MUST run as a background fiber of the bus plugin
             (BEH-DB-051) and stop with its scope; its position, lag and
             snapshot state MUST appear in `DurableBus.status` (BEH-DB-046).
```

**Settled here.** Pulling makes the subscriber the party that paces
downstream replay: it asks for a bounded page when it is ready, which is the
credit rule of BEH-DB-041 seen from the other side. The pull reuses the
inbox, so the delivery contract does not fork into two sets of rules. A
federation host that re-bootstraps after the offline cap restores its
application state and these positions together (BEH-DB-044).

---

_Previous: [05 — Order and hybrid logical clocks](./05-order-and-clocks.md)_ · _Next: [07 — Core bus, plugin packaging and storage adapters](./07-core-bus-and-adapters.md)_
