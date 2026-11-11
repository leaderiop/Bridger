# 06 — Replay, backpressure and snapshots

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-06                                            |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — BEH-DB-048: `DurableBus.whenReadable`, the read gate of a whole-store install, which event-store reads await and an application decoding through the codec awaits as its own duty (H3); while `origin-unrecorded` holds the bus retries `recordIncarnation` under bounded backoff on its background fiber and lifts the hold when it commits, `settle` refused meanwhile, a record failing on every retry stated with residual (c) (H4); `publish` checks the freeze and the holds itself before `fence`, so it is refused inside an `apply` transaction and in one admitted before the freeze (B1); BEH-DB-047 and BEH-DB-048: `origin-unrecorded` pauses `follow` too (B2); `receive` fences and is refused during the freeze and the holds, answering `retryAfter`, so the `apply` transaction is the only writer (PL19); residual (a) points to the keyring's own bound (B4) (CCR-DB-011)<br>0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-DB-048: `onStoreSwap` takes a participant `{ prepare, apply? }` (a bare effect still registers `prepare` only); every `apply` runs after `run`, whether it succeeded or failed, each in its own transaction on the store `run` left that `fence` admits during the freeze, before the incarnation is recorded, the `OriginChange` emitted, the freeze lifted or any subscription resumed; a failing `apply` fails the install with `SnapshotFailed` "apply-failed", handled as a failure of `run` after the raise; `publish` stays refused in that transaction; `fence` ignores the `onEnd` outcome (H4, K3); SPEC-AUDIT-07 residual — BEH-DB-048: after a failed `apply` the bus enters the hold `apply-pending`, treated as `origin-unrecorded` (`fence` and `publish` refused, subscriptions and `follow` paused, no `outbox-thawed`), retries each failed `apply` in its own `InboxStore.transaction` under bounded backoff, uncounted, in registration order, drops the `apply` of a withdrawn participant, and emits the `OriginChange` only when the hold lifts; `settle` fails with `RebootstrapBlocked` "store-swap-pending" during the hold; a `fence` on a transaction already admitted succeeds, and `publish` fences before it encodes; BEH-DB-047: `follow` stays paused while `apply-pending` holds; BEH-DB-048: `settle` also fails "store-swap-pending" while `origin-unrecorded` holds; the accepted residuals of a store-swap `apply` stated once with their bounds (a stop of the process during the install or the hold, a participant withdrawn during the hold, an `apply` that fails on every retry); a key the keyring's codec creates inside a `publish` that then fails is the keyring's write in the caller's transaction, kept if the caller commits (CCR-DB-010)<br>0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-DB-048: `fence` registers the end of its admission through `tx.onEnd` (H3); the keyring is named beside event-store as a store that calls `fence` in its write transactions (H4) (CCR-DB-009)<br>0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-DB-048: a `DurableBus.fence(tx)` admission is bounded by the transaction handle `tx` and ended by the adapter at commit or rollback, on every exit, not by a `Scope`; `fence` drops `Scope.Scope` (H2, B1); subscriptions stay paused, and `OutboxFrozen` uncounted, while `origin-unrecorded` holds after the scope closes (B2) (CCR-DB-008)<br>0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-DB-048: `DurableBus.fence(tx)` is scoped to the transaction's `Scope`, and setting a whole-store freeze takes two steps, refusing new admissions and then waiting for the admitted ones to end, bounded by the settlement's `timeout` (H3); subscriptions are paused while a whole-store settlement's scope is open, and `OutboxFrozen` from a handler does not count toward `maxAttempts` (F4); BEH-DB-046: a paused `follow` or subscription is reported as paused (PL19) (CCR-DB-007)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — BEH-DB-048: the raised incarnation is recorded for this node through `recordIncarnation` (H9); `DurableBus.fence(tx)`, checked inside the write transaction by `publish` and by stores that share it, and the freeze waits for transactions already past the fence (M17); BEH-DB-044: an install's `GapRecord` carries reason "rebootstrap:" + `replaces` and the calling fiber's actor, the system actor when unattributed (Low); BEH-DB-047: `follow` is paused while a settlement's scope is open, and processes a pulled page only when every element carries the asked (origin, stream) and an origin in `origins`, with the residual stated (Low, seen not assessed) (CCR-DB-006)<br>0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-DB-048: a whole-store install raises the incarnation before `run`; a failed raise replaces nothing; after a raise the old origin is never used again, even when `run` fails or the process stops; `run` gets no live `StoreTransaction` (H8, P1); BEH-DB-044: a snapshot restore, and an install through `OutboxSettlement.install`, records every forward move of an inbox watermark as an attributed `GapRecord` (P3); `outbox-thawed` is held back while the raised incarnation is unrecorded (review of the round) (CCR-DB-005)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 (U-10) — BEH-DB-048: participants registered with `DurableBus.onStoreSwap` read the store being replaced before a whole-store install (`prepare`, failure "prepare-failed"); the switch to the new origin emits an `OriginChange` (CCR-DB-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F8, F9, F12, F16) — BEH-DB-048 rewritten: scoped `settle` returns an `OutboxSettlement` whose `install` is the guarded install path ("in-store": outbox comparison in one transaction; "whole-store": outbox frozen with `OutboxFrozen`, incarnation raised through `IncarnationSource`); default `require` "pushed", "pushed-or-kept" only in-store; heading changed (old anchor kept); `HistorySource` built per reader with a placement check and a `HistoryAccess` decision ("open" explicit), refusals served as `Withheld` markers (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck item 19 — BEH-DB-048 `DurableBus.rebootstrapOutbox` (push or keep before a snapshot, `RebootstrapBlocked`); BEH-DB-044 restore checked not to touch the outbox (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — downstream history is pulled through the new `HistorySource` port (BEH-DB-047); `SnapshotRequired` only on that port; `Ack.retryAfter` (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

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
BEH-DB-047). This file owns BEH-DB-041–048 and uses all eight.

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
> **Depends on:** [BEH-FD-014](../../federation/behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot-outbox-first) (federation re-bootstrap)

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

```
REQUIREMENT: A watermark that the restore moves from W to a returned
             sequence above W passes sequences the inbox never stored. The
             restore MUST record them in the same transaction as a
             `GapRecord { origin, stream, from: W + 1, through, actor,
             reason }` through `InboxStore.acceptGap`, with `reason`
             "snapshot:" + source and `actor` the restoring fiber's
             `CurrentActor` (the system actor when the bus restores on its
             own), report `gap-accepted` and list the record in
             `DurableBus.status`, as `acceptGap` does (BEH-DB-019). The
             snapshot accounts for what those sequences did, so the
             non-system-actor rule of `acceptGap` does not apply; the record
             makes the passage attributed and visible (INV-DB-006). The same
             MUST hold for an install run through `OutboxSettlement.install`
             (BEH-DB-048): in-store, the bus compares every inbox watermark
             before and after `run` inside the install transaction; whole-
             store, it reads the watermarks of the store being replaced after
             the `prepare` participants and records each forward move in the
             new store together with the raised incarnation. An install's
             record carries `reason` "rebootstrap:" + `replaces` ("in-store"
             or "whole-store") and `actor` the `CurrentActor` of the fiber
             that called `install` — the federation companion's service
             actor when it runs the install (federation BEH-FD-014) — or the
             system actor when that fiber is unattributed, never an
             unattributed actor.
```

```
REQUIREMENT: The restore MUST NOT remove, rewrite or acknowledge any outbox
             envelope. Inside the restore transaction, the bus MUST compare,
             for each destination, the pending (origin, stream, sequence)
             set and the highest outbox sequence per (origin, stream) before
             and after `SnapshotProvider.restore`; any difference MUST roll
             the transaction back and fail the restore with
             `SnapshotFailed { reason: "outbox-touched" }`.
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
             feed, which is not a record. A `follow` or a subscription paused
             by a whole-store settlement (BEH-DB-047, BEH-DB-048) MUST be
             reported as paused, with its cursor or position, and not as
             halted.
```


## BEH-DB-047: HistorySource — the pull port for downstream history

> **Invariant:** [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently), [INV-DB-008](../invariants.md#inv-db-008-in-flight-delivery-is-bounded-by-the-receivers-credit)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)

```ts
// illustrative — not type-checked
interface HistorySource {
  readonly read: (q: { readonly origin: string; readonly stream: string; readonly after: number; readonly limit: number }) =>
    Effect.Effect<readonly (Envelope | Withheld)[] | SnapshotRequired, HistoryUnavailable>
}
interface HistoryReader {
  readonly id: string                               // the reader the serving transport authenticated (a peer, a host)
  readonly residency?: readonly string[]            // labels the route to this reader offers (BEH-DB-016)
}
interface HistoryAccess {                           // the serving side's decision per reader and event type
  readonly decide: (q: { readonly reader: string; readonly type: string; readonly origin: string }) =>
    Effect.Effect<"allow" | { readonly deny: string }>
}
declare const DurableBus: {
  // serves this bus's retained envelopes (its outbox, and envelopes its inbox stores) to ONE reader
  historySource(options: {
    readonly reader: HistoryReader
    readonly access: HistoryAccess | "open"         // no default: "open" is the operator's written egress decision
    readonly maxPage?: number
  }): Effect.Effect<HistorySource, never, DurableBus>
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
             bounded call of the remote companion), and the serving
             transport MUST build one `HistorySource` per reader it
             authenticated.
```

```
REQUIREMENT: Before returning an envelope, `read` MUST, for that reader:
             (1) evaluate the `PlacementPolicy` (subject kind "route",
             `offered` the reader's `residency`) for the envelope's
             `placement/residency` label, as BEH-DB-016 does for a route;
             (2) unless `access` is "open", call `HistoryAccess.decide`
             with the reader's id, the envelope's type and its
             `node#incarnation` origin (07, BEH-DB-053). An envelope refused by either MUST
             be returned as a `Withheld` element with reason
             "placement-refused" or "access-refused" in its place — never
             the envelope, and never omitted, so the reader's inbox sees no
             gap — and the refusal MUST be counted in `DurableBus.status`
             per reader. A failure or defect of `decide` MUST be treated as
             a denial.
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
REQUIREMENT: The origins of a pulled page are claims of the source, as on
             the push path (BEH-DB-018). `follow` MUST process a page only
             when every element carries the (origin, stream) its `read` asked
             for and that origin is one of `options.origins`; otherwise the
             whole page MUST be discarded uncommitted, `follow` backs off as
             after `HistoryUnavailable` and reports `history-mismatch
             { source, origin, stream }`. Binding `source` to the peer that
             serves it is the transport's, as on the push path: a transport
             that authenticates its peers SHOULD reach a `HistorySource`
             only of the authenticated peer, and the deployment lists in
             `origins` only that peer's own origins and the origins it relays
             for. Documentation MUST state the residual: a source accepted
             for an origin can serve envelopes under that origin which the
             origin never wrote, with the effects BEH-DB-018 states.
```

```
REQUIREMENT: `follow` MUST run as a background fiber of the bus plugin
             (BEH-DB-051) and stop with its scope; its position, lag and
             snapshot state MUST appear in `DurableBus.status` (BEH-DB-046).
```

```
REQUIREMENT: While a re-bootstrap settlement's `Scope` is open (BEH-DB-048),
             and after it closes while `apply-pending` or `origin-unrecorded`
             holds (BEH-DB-048),
             every `follow` MUST be paused: it issues no `read`, a `read` in
             flight is interrupted and its page discarded uncommitted, and
             no page is processed. It resumes when the scope has closed and
             neither hold is in force, from
             the watermarks the store then holds — the ones the install
             wrote, or the old ones when nothing was installed — so that no
             receipt commits into a store being replaced or races the
             install's watermark writes. `DurableBus.status` MUST show each
             paused `follow` as paused.
```

**Settled here.** Access on the pull path is decided by the serving side,
because the reader is outside the serving host and its own `AccessPolicy`
(BEH-DB-053) is not the serving host's. `access` has no default, so serving
every stream to a peer is a written decision. On the push path, a route
(BEH-DB-013) is the operator's egress decision: this package checks only
placement there. Pulling makes the subscriber the party that paces
downstream replay: it asks for a bounded page when it is ready, which is the
credit rule of BEH-DB-041 seen from the other side. The pull reuses the
inbox, so the delivery contract does not fork into two sets of rules. A
federation host that re-bootstraps after the offline cap restores its
application state and these positions together (BEH-DB-044).

## BEH-DB-048: Before a snapshot, the outbox is pushed or kept, and the install goes through the bus

<a id="beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept"></a>

> **Invariant:** [INV-DB-009](../invariants.md#inv-db-009-no-snapshot-restore-removes-an-unacknowledged-outbox-envelope), [INV-DB-006](../invariants.md#inv-db-006-no-envelope-is-dropped-silently)
> **See:** [ADR-DB-006](../decisions/006-bounded-replay-and-snapshots.md)
> **Depends on:** federation re-bootstrap order ([BEH-FD-014](../../federation/behaviors/02-sync-offline-and-rebootstrap.md#beh-fd-014-a-host-too-far-behind-re-bootstraps-from-a-snapshot-outbox-first))

```ts
// illustrative — not type-checked
declare const DurableBus: {
  rebootstrapOutbox(options?: { readonly require?: "pushed" | "pushed-or-kept" }):   // default "pushed"
    Effect.Effect<RebootstrapOutbox, never, DurableBus>      // the federation companion's port (BEH-FD-014)
}
// RebootstrapOutbox.settle({ timeout, replaces }) — scoped; the settlement lives until its Scope closes
//   replaces: "in-store"    — the application's install rewrites state inside the bus's store
//             "whole-store" — the application's install replaces the store by other means (a new database file)
interface OutboxSettlement {
  readonly pushed: number
  readonly kept: number
  // runs the application's install on the guarded path for `replaces` (below); federation step 3 calls it
  readonly install: <A, E, R>(run: Effect.Effect<A, E, R>) =>
    Effect.Effect<A, E | SnapshotFailed | IncarnationUnavailable, Exclude<R, StoreTransaction>>
}
class OutboxFrozen extends Schema.TaggedError<OutboxFrozen>()("OutboxFrozen", { reason: Schema.String }) {}
// DurableBus gains: onStoreSwap(name: string, participant: StoreSwapParticipant | Effect.Effect<void, unknown>):
//   Effect<void, never, Scope.Scope> — registers, for the caller's Scope, a participant of every whole-store
//   install (below); a bare effect is a participant with `prepare` only
interface StoreSwapParticipant {
  readonly prepare: Effect.Effect<void, unknown>                                     // on the store about to be replaced
  readonly apply?: (tx: StoreTransaction["Service"]) => Effect.Effect<void, unknown>  // on the store `run` left, before the OriginChange
}
// DurableBus gains: fence(tx: StoreTransaction["Service"]): Effect.Effect<void, OutboxFrozen>
//   the write fence of a whole-store install, checked inside the caller's transaction (below); admitted
//   for `tx`, its end registered through `tx.onEnd` (02, BEH-DB-009; 07, BEH-DB-054)
// DurableBus gains: whenReadable: Effect.Effect<void>
//   the read gate of a whole-store install: completes at once when no whole-store freeze, `apply-pending` or
//   `origin-unrecorded` is in force, else when the last of them ends (below)
// settle fails with RebootstrapBlocked { pending, reason }: "outbox-unsettled", "outbox-unavailable",
//   "kept-needs-in-store", "no-incarnation-source", "store-swap-pending" (while `apply-pending` or `origin-unrecorded` holds, below)
```

```
REQUIREMENT: `settle` MUST run the relay for every destination with
             pending envelopes, under the credit and backoff rules of 06,
             until no envelope is pending or `timeout` passes, then read
             `OutboxStore.backlog` for every destination; `pushed` is the
             number acknowledged during the call and `kept` the number
             still pending. `settle` MUST NOT acknowledge, delete or
             rewrite an envelope itself. A store that cannot answer MUST
             fail with `RebootstrapBlocked { reason: "outbox-unavailable" }`.
```

```
REQUIREMENT: With `require` "pushed" (the default), any envelope still
             pending MUST fail `settle` with `RebootstrapBlocked { reason:
             "outbox-unsettled", pending }`. "pushed-or-kept" MUST be
             accepted only with `replaces` "in-store"; with "whole-store"
             it MUST fail with `RebootstrapBlocked { reason:
             "kept-needs-in-store" }`, because nothing protects kept
             envelopes from a store that is replaced.
```

```
REQUIREMENT: With `replaces` "in-store", `install(run)` MUST run `run`
             inside one bus `StoreTransaction` with the before-and-after
             outbox comparison of BEH-DB-044 around it: a difference rolls
             the transaction back and fails with `SnapshotFailed { reason:
             "outbox-touched" }`. Envelopes published after `settle`
             returned stay pending and survive the install; no write fence
             is needed.
```

```
REQUIREMENT: With `replaces` "whole-store", `settle` MUST require a wired
             `IncarnationSource` (01, BEH-DB-004), else fail with
             `RebootstrapBlocked { reason: "no-incarnation-source" }`.
             Once the first drain phase has ended, `settle` MUST freeze the
             outbox — every `publish` fails with `OutboxFrozen` and writes
             nothing, inside a transaction `fence` admitted earlier too
             (below) — then drain what is still pending for at most
             `timeout` again, and keep the freeze until the settlement's
             `Scope` closes. `install(run)` MUST first run the `prepare`
             effect of every participant registered with
             `DurableBus.onStoreSwap`, in registration order, each to its
             end; then `IncarnationSource.raise`; then `run`; then the
             `apply` step of every participant that has one, in
             registration order, each in its own transaction on the store
             `run` left, which the install opens with the storage adapter's
             `InboxStore.transaction` (03, BEH-DB-018) and commits before the
             next `apply` starts (a failed commit, `CommitConflict` included,
             is a failure of that `apply`); then
             record the raised incarnation for this node in the store `run`
             left (`OutboxStore.recordIncarnation`, 01, BEH-DB-004; an entry
             that store holds for another node is left as it is), switch the
             bus to the new origin and emit the `OriginChange` (01,
             BEH-DB-004), all before the freeze is lifted and before any
             subscription or `follow` resumes (below). `run` runs outside any bus
             transaction, since the store is replaced by other means; when
             its `R` includes `StoreTransaction`, the bus provides one whose
             every use dies with a defect naming "whole-store". A `prepare`
             that fails MUST fail `install` with `SnapshotFailed { reason:
             "prepare-failed" }` before the raise, and a `raise` that fails
             MUST fail it with `IncarnationUnavailable` before `run`, so that
             in both cases nothing is raised or replaced and the freeze is
             lifted when the scope closes.
```

```
REQUIREMENT: The `apply` steps MUST run whether `run` succeeded or failed,
             since a failed `run` may have replaced the store; a
             participant's `apply` MUST therefore leave as it is what the
             store already holds of what it writes. An `apply` that fails or
             dies rolls back its own transaction, the later participants'
             `apply` steps still run, and `install` MUST then fail with
             `SnapshotFailed { reason: "apply-failed" }` (with `run`'s error
             when `run` failed), handled as a failure of `run` after the
             raise (below): the incarnation is still recorded and the bus
             switched to the new origin, but the bus MUST enter the hold
             `apply-pending` (below), report it on `DurableBus.status` with
             the names of the participants whose `apply` failed, and emit
             the `OriginChange` only when that hold lifts. `fence(tx)` MUST
             admit the transaction the install opened for an `apply` step,
             or the bus opened for a retry of one (below), while the freeze
             or `apply-pending` is in force, and no other new admission;
             `publish` inside
             it MUST still fail with `OutboxFrozen` and write nothing (below). With
             the outbox frozen and drained, every subscription and
             `follow` paused and every `receive` refused (below), that
             transaction is the only writer the store admits, so on a single-writer engine (BEH-DB-055) it waits on
             no other admitted write.
```

```
REQUIREMENT: While `apply-pending` holds, the bus MUST treat it as it
             treats `origin-unrecorded`, after the settlement's scope closes
             too: `fence` and `publish` fail with `OutboxFrozen`, every
             subscription and every `follow` stays paused (BEH-DB-047,
             below), `receive` stores nothing and `whenReadable` waits
             (below), and `outbox-thawed` is not reported. During the hold
             the bus MUST retry the `apply` of each participant whose
             `apply` failed, in registration order, each in its own
             `InboxStore.transaction` committed before the next starts,
             under bounded backoff between rounds and without counting a
             failed retry against anything, until it commits. A participant
             withdrawn during the hold (its `Scope` closed) MUST drop its
             pending `apply`: no retry of it starts, and one already running
             ends with its transaction. The hold lifts when no failed
             `apply` remains; the bus then emits the `OriginChange` and,
             once the settlement's scope has closed and no
             `origin-unrecorded` holds, lifts the freeze and resumes every
             subscription and `follow`, in that order. The retries run on a
             background fiber of the bus plugin (BEH-DB-051) and stop with
             it. While the hold is in force, and while `origin-unrecorded`
             holds (the swap is unfinished until the raised incarnation is
             recorded), `settle` MUST fail with `RebootstrapBlocked {
             reason: "store-swap-pending" }`, for either `replaces`, before
             it drains, freezes or reads anything, so that no second install
             starts over a store whose participants' rows are not back or
             whose raised incarnation is not recorded.
```

```
REQUIREMENT: Documentation MUST state three accepted residuals of a
             store-swap `apply`, each with its bound; the bus adds nothing
             to close them. (a) The hold, and what a participant's
             `prepare` kept, live in memory only: a process that stops
             after `run` and before every `apply` has committed, during the
             install or during `apply-pending`, starts again under the
             raised incarnation (BEH-DB-004) with no hold and no pending
             `apply`, on a store without the rows those `apply` steps would
             have written, until the participant puts them back by its own
             rule (the keyring states its bound in keyring BEH-KR-020).
             (b) A participant withdrawn during the hold drops its pending
             `apply` (above), so the hold can lift without its rows, with
             the same bound. (c) An `apply` that fails on every retry keeps
             the hold, and with it every write refused and every reader
             paused, until the operator restores what that `apply` needs; a
             `recordIncarnation` that fails on every retry (below) keeps
             `origin-unrecorded` likewise, until the operator restores the
             store so that it can record the incarnation.
```

```
REQUIREMENT: Once `raise` has returned, the bus MUST NOT publish under the
             old origin again. When `run` fails, the bus MUST still record
             the raised incarnation in whatever store `run` left, switch to
             the new origin and emit the `OriginChange` (when `apply-pending`
             holds, once it lifts, above) before the freeze is lifted, and
             `install` fails with `run`'s error. While the raised
             incarnation cannot be recorded, the bus MUST keep `fence` and
             `publish` failing with `OutboxFrozen`, every subscription and
             every `follow` paused (BEH-DB-047, below), `receive` storing
             nothing and `whenReadable` waiting (below), after the scope
             closes too, and report `origin-unrecorded`. During that hold
             the bus MUST retry `recordIncarnation` for this node in the
             store in use, each attempt in its own `InboxStore.transaction`,
             under bounded backoff and without counting a failed attempt
             against anything, on the background fiber that retries a failed
             `apply` (above; after that round's `apply` retries when both
             holds are in force), until an attempt commits. The hold then
             lifts, and once the settlement's scope has closed and no
             `apply-pending` holds, the bus lifts the freeze and resumes
             every subscription and `follow`, in that order. The retries stop
             with the bus plugin; a bus that starts again records its
             incarnation at start (BEH-DB-004). A process that stops at any point
             after the raise starts again under the raised incarnation, which
             it reads from `IncarnationSource.current` (BEH-DB-004), whatever
             store it then finds: a replaced store's (origin, stream,
             sequence) triples are never issued twice.
```

```
REQUIREMENT: Participant names MUST be unique; registering a second
             participant under a name MUST fail with a defect naming it. A
             participant is withdrawn when its `Scope` closes. Documentation
             MUST state what `prepare` sees and what it may keep: it runs on
             the store about to be replaced, frozen and drained, so nothing
             can be published or numbered while it reads; what it keeps
             lives in the participant's memory until its `apply` commits it
             to the store `run` left (or, for a participant without `apply`,
             until it writes it after the `OriginChange`), and is lost if the
             process stops before then. What an `apply` commits is in the
             store before any subscription, `follow` or reader that waits
             for the `OriginChange` runs on it.
```

```
REQUIREMENT: The bus MUST report `outbox-frozen` and `outbox-thawed` on
             `DurableBus.status`, and documentation MUST state that the
             freeze refuses business writes that publish for the length of
             the drain, the snapshot fetch and the install, and that an
             application which cannot accept that uses an in-store install.
             `outbox-thawed` MUST NOT be reported while the raised
             incarnation is unrecorded (`origin-unrecorded`) or a store-swap
             `apply` is pending (`apply-pending`). These reports
             are a sliding feed (BEH-DB-046), not a fence.
```

```
REQUIREMENT: `DurableBus.fence(tx)` MUST fail with `OutboxFrozen` while a
             whole-store freeze is in force, the raised incarnation is
             unrecorded (`origin-unrecorded`) or `apply-pending` holds, and
             succeed otherwise; it writes nothing. A `fence` called again on
             a transaction already admitted MUST succeed without a second
             admission, since the freeze waits for that transaction anyway,
             so that a write made inside a transaction already fenced (a key
             the keyring's codec creates inside `publish`, keyring
             BEH-KR-017) is never refused. Such a key is the keyring's write
             in the caller's transaction, not an outbox row: when `publish`
             then fails, it is kept if the caller catches the error and
             commits, encrypts nothing that was stored, and is used by the
             next encryption for that subject (keyring BEH-KR-017). A `fence` that succeeds is admitted for the
             transaction `tx` it receives, and the admission ends when that
             transaction has committed or rolled back, on every exit:
             `fence` MUST register the end of its admission through
             `tx.onEnd` (02, BEH-DB-009), which the storage adapter runs at
             that end (BEH-DB-054, property 8). No `Scope` bounds an
             admission, so a scope opened and closed inside the transaction
             cannot end it early. `publish` MUST run it inside the caller's transaction
             before it passes the payload through the codec (01, BEH-DB-008)
             and appends. Before `fence`, `publish` MUST also check the
             freeze and the holds itself: while a whole-store freeze is in
             force (from the first of the two steps below),
             `origin-unrecorded` holds or `apply-pending` holds, it MUST fail
             with `OutboxFrozen` and write nothing, also inside a
             transaction `fence` has already admitted — the transaction of
             an `apply` step or of a retry of one, or a business transaction
             admitted before the freeze was set — so that no envelope is
             appended from the moment the freeze is set until the last hold
             lifts. Setting the freeze MUST take two steps,
             before the second drain phase: first `fence` refuses every new
             admission, then the bus waits until every admission already
             granted has ended, so that no write admitted before the freeze
             commits to the store being replaced after it; new transactions
             cannot extend the wait, because they are refused. An admission
             still open when the settlement's `timeout` passes MUST fail
             `settle` with `RebootstrapBlocked { reason: "outbox-unsettled"
             }` and lift the freeze. A store that shares the bus's
             transaction and must not write during the freeze (event-store
             BEH-ES-034, keyring BEH-KR-017) MUST call `fence` inside each
             of its write transactions before writing; `fence` ignores the
             outcome `onEnd` passes (02, BEH-DB-009).
```

```
REQUIREMENT: `receive` (03, BEH-DB-018) MUST call `fence` with its inbox
             transaction before it stores anything. A refusal rolls that
             transaction back, stores and acknowledges nothing, and answers
             an `Ack` with no `watermarks`, zero credit and `retryAfter`
             (BEH-DB-041), so that the sender waits and resends. During the
             freeze and the holds no receipt therefore commits into a store
             being replaced, the freeze's second step waits for a receipt
             already admitted, and the transaction of an `apply` step, of a
             retry of one or of a `recordIncarnation` retry is the only
             writer the store admits.
```

```
REQUIREMENT: `DurableBus.whenReadable` MUST complete at once when no
             whole-store freeze, `apply-pending` or `origin-unrecorded` is in
             force, and otherwise when the last of them ends; it reads the
             bus's own state, as `fence` does, never the status feed. A
             freeze counts for it from the end of its second step (no
             admission granted before the freeze remains), so that a read
             inside a transaction admitted before the freeze never waits for
             the freeze that waits for that transaction. Every read that
             decodes stored payloads through the `PayloadCodec` outside a
             subscription or `follow` (which the bus pauses itself) MUST
             await it first, before it reads: event-store `read`, `readAll`
             and every load that decodes through the codec (event-store
             BEH-ES-034). Documentation MUST state that an application that
             decodes through the codec itself awaits `whenReadable` first,
             its own duty, since the bus cannot see that read; that a caller
             reading inside its own write transaction on a single-writer
             engine (BEH-DB-055) calls `fence` with it first, as event-store
             writes do, so that it is refused rather than held waiting with
             the write lock taken; and that a `prepare`, `run` or `apply`
             MUST NOT await `whenReadable`, directly or through an
             event-store read, since it would wait for the install it runs
             in. The gate lives in the bus's memory: a caller still waiting
             when the bus plugin stops waits until its own scope closes
             (event-store's plugin requires the bus and stops before it).
```

```
REQUIREMENT: While a whole-store settlement's `Scope` is open, and after
             it closes for as long as the raised incarnation is unrecorded
             (`origin-unrecorded`) or `apply-pending` holds, every
             subscription of the bus (03, BEH-DB-020) MUST be paused, not
             failed: no handler call starts, and it resumes from its cursor
             when the scope has closed and neither hold is in force. A handler call that fails with
             `OutboxFrozen` (one that started before the pause, or a write
             refused by `fence`) MUST roll back like any failed call but
             MUST NOT count toward `maxAttempts` (BEH-DB-021) and MUST NOT
             halt or park the envelope; it is retried when the pause
             ends. `DurableBus.status` MUST show each paused subscription
             as paused (BEH-DB-046).
```

**Settled here.** Upstream facts are never truncated (BEH-DB-045); a
re-bootstrap is the moment that rule is most at risk, because it replaces
local state wholesale. Putting the install on the bus's path is what makes
"kept" checkable: the federation companion calls the application's install
only through `OutboxSettlement.install`, so the outbox comparison runs on
every in-store install rather than on the restores the application happens
to route through `SnapshotProvider`. A whole-store swap cannot be checked,
so it gets the strict mode instead: everything pushed, nothing new written
until the swap is over, and a new incarnation raised before the swap, so that
the replaced store's sequences are never issued twice under one origin
(BEH-DB-004). Raising first is what makes every failure safe: a failed raise
replaces nothing, and after a successful one no path — a failed `run`, a crash
— leads back to the old origin, because the raised number lives outside the
store and is read again at start. A raised number left unused by a failed
install is a gap in incarnation numbers, which costs nothing. "pushed" is the default because it is safe for both kinds of
install; "kept" is an opt-in that only the in-store path can honour. A
companion that keeps state per origin cannot learn what the old store held
once it is gone, and the snapshot that replaces it comes from another host:
`prepare` is its one chance to read the old store, at the moment that store
can no longer change. The sequence companion uses it to close the old
incarnation's number series (sequence BEH-SQ-009). `apply` is the matching
moment on the other side: the new store is in place but nothing reads or
writes it yet, so a companion that must carry rows across (the keyring's
tombstones, keyring BEH-KR-020) has them back before any reader resumes;
when it fails, the bus keeps every reader held (`apply-pending`) and retries
it, rather than letting readers run on a store that lacks those rows.

---

_Previous: [05 — Order and hybrid logical clocks](./05-order-and-clocks.md)_ · _Next: [07 — Core bus, plugin packaging and storage adapters](./07-core-bus-and-adapters.md)_
