# 02 — Incarnation and Verification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-SQ-BEH-02                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-09): Specification audit of 2026-11-09 — BEH-SQ-009 runs the supersession step again when the durable-bus origin changes on a running host, takes the old series from the store being replaced through a durable-bus store-swap participant, refuses calls under the new origin with `SupersessionPending` until the step has committed, and states what a re-bootstrap snapshot may hold (U-10); `lastKnownOnly` is false for series read from the live store at a re-bootstrap (BEH-SQ-009, BEH-SQ-010, BEH-SQ-012); BEH-SQ-011 publishes on the event-store stream by event-store's default (F-05) (CCR-SQ-003)<br>0.2 (2026-11-08): BEH-SQ-009 records a supersession in the new incarnation's own stream, never in the old series, and closes every open series of lower incarnations when the plugin starts; BEH-SQ-011 publishes `SeriesSuperseded`; BEH-SQ-012 takes decoded series events and orders by number; BEH-SQ-013 states what a restore without a raised incarnation looks like at the authority and drops the foreign-writer exemption (CCR-SQ-002)<br>0.1 (2026-11-08): Initial draft (CCR-SQ-001)                 |

---

This file specifies the incarnation bump after a restore, the lost-tail
limit, publication to the authority, `verifySeries`, the authority's registry
across incarnations, authority-side closure, and chaining. This file owns
BEH-SQ-009–016 and uses all eight.

Planned source: `packages/sequence/src/Incarnation.ts`,
`packages/sequence/src/verifySeries.ts` *(Planned)*.

## BEH-SQ-009: A new incarnation closes the old series as superseded

> **Invariant:** [INV-SQ-004](../invariants.md#inv-sq-004-only-the-owning-origin-writes-a-series)
> **See:** [ADR-SQ-003](../decisions/003-a-restore-closes-the-old-series.md)
> **Depends on:** [BEH-DB-004](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused), [BEH-DB-048](../../durable-bus/behaviors/06-replay-and-snapshots.md#beh-db-048-before-a-snapshot-the-outbox-is-pushed-or-kept-and-the-install-goes-through-the-bus), [BEH-ES-019](../../event-store/behaviors/03-projections-and-snapshots.md#beh-es-019-async-projections-follow-positions-with-a-checkpoint-in-the-same-transaction)
> **Risk:** [RSK-SQ-001](../risks.md#rsk-sq-001), [RSK-SQ-003](../risks.md#rsk-sq-003)

```ts
// illustrative — not type-checked
// incarnation stream = "sqi:" + node + ":" + incarnation   (one per incarnation; never a series stream)
interface SeriesSuperseded {
  readonly seriesId: string           // the old series, e.g. "till-3#1/documents"
  readonly lastKnown: number          // highest number of that series the new incarnation knows (0 when none)
  readonly lastKnownOnly: boolean     // true: numbers issued after the backup are not known here (BEH-SQ-010);
                                      // false: read from the live store at a re-bootstrap, nothing after it
  readonly by: string                 // the new origin, node + "#" + incarnation
}
```

```
REQUIREMENT: When the `Sequence` plugin starts, and before `Series.open`
             serves any call, it MUST find every series of this node under a
             lower incarnation than the current one that is neither
             closed (a `SeriesClosed` in its own stream) nor already
             superseded (a `SeriesSuperseded` in any incarnation stream of
             this node), and MUST append, in one transaction, one
             `SeriesSuperseded` per such series to this incarnation's own
             incarnation stream, with the expected version it read. The
             series are found by a store-wide read by position restricted
             to the types `SeriesOpened`, `SeriesClosed` and
             `SeriesSuperseded` (the read a follower uses, event-store
             BEH-ES-019; adapter `readAll` with `types`, BEH-ES-033), and
             counted by their `NumberIssued` events; documentation MUST state
             that this read is proportional to the number of series, not of
             numbers, and runs once per start and once per origin change.
             A series found this way carries `lastKnownOnly: true`.
```

```
REQUIREMENT: The plugin MUST run the same step whenever the durable-bus origin
             changes while it runs (`originChanges`, durable-bus BEH-DB-004),
             which only a whole-store re-bootstrap does (BEH-DB-048). For that
             case it MUST register a store-swap participant
             (`DurableBus.onStoreSwap`) whose `prepare` reads, from the store
             about to be replaced, every series of this node that is neither
             closed nor superseded and its highest number; the step after the
             change MUST supersede those series too, with `lastKnownOnly:
             false`, because the store was frozen and drained when it was read
             and no number can follow it. A series is superseded once,
             whichever way it was found. Until the step has committed for the
             current origin, `open`, `next` and `close` under that origin MUST
             fail with `SupersessionPending { origin }` and write nothing; the
             step runs in the plugin's own transaction and is retried with
             backoff until it commits.
```

```
REQUIREMENT: Documentation MUST state what a whole-store re-bootstrap
             snapshot may hold. It MAY hold series streams of this node's
             earlier incarnations, copied as stored; the step supersedes the
             open ones like any other, and the package never writes in them.
             It MAY hold series of other nodes, which the package never
             writes. The package MUST NOT rely on it to hold this node's
             series: the participant reads them from the store being replaced.
             Documentation MUST also state the limit of that read: what it
             found lives in the plugin's memory until the step commits, so a
             process that stops in between leaves those series without a
             `SeriesSuperseded`, and the authority then sees them end without
             a closure.
```

```
REQUIREMENT: The package MUST NOT append to a series stream of another
             incarnation, before or after a restore: the old series' stream
             ends where the restored store ends, so no stream version of it
             is ever written twice and a chain over it (BEH-SQ-016) never
             forks. When `Series.open(origin, name)` creates a series whose
             name also exists under a lower incarnation — as a series stream
             in the store or in a `SeriesSuperseded` of this node — it MUST
             write `previous: { seriesId, lastKnown }` in `SeriesOpened`; the
             supersession itself is the `SeriesSuperseded` of the start step.
```

```
REQUIREMENT: Documentation MUST state that raising the incarnation after a
             restore, a replacement or a wipe is the operator's obligation
             (BEH-DB-004), and that the package cannot detect a restore whose
             incarnation was not raised.
```

A whole-store re-bootstrap is the one case where the origin changes while the
plugin runs and where the new store need not hold the old series at all: the
snapshot comes from another host. Reading the old store through the bus's
store-swap participant, while it is frozen and drained, is what lets the new
incarnation close series it cannot see, and with exact numbers, since every
envelope was pushed before the read. Refusing handles of the old origin
(BEH-SQ-002) and calls under the new origin until the step commits keeps any
number from being issued in between.

Recording the supersession in the new incarnation's own stream keeps every
stream single-writer: the old series is written only by its origin, and the
`SeriesSuperseded` events are written only by theirs, at stream versions no
other host has used. A per-period name (BEH-SQ-017) that is never opened
again is still closed, because the start step does not depend on the name
being reused. The authority needs no order between the old series and the
supersession record: it compares numbers (BEH-SQ-010, BEH-SQ-013), and both
arrive in order on their own (origin, stream).

## BEH-SQ-010: The lost tail is a stated limit

> **Risk:** [RSK-SQ-003](../risks.md#rsk-sq-003)

```
REQUIREMENT: Documentation and the verification report MUST state that
             numbers issued after the backup a host was restored from, and
             never received by the authority, cannot be found from the
             series: a `SeriesSuperseded` written after a restore carries
             `lastKnownOnly: true`, and the authority's report MUST show both
             its `lastKnown` and
             the highest number it received in the old series, and flag
             `receivedBeyondClosure` when the latter is higher.
```

Those numbers are not reissued — the new incarnation's series has a new id —
so a document holding one is still unique; it is merely unknown to the
authority until it surfaces.

## BEH-SQ-011: Series events are published to the authority

> **Depends on:** [BEH-ES-028](../../event-store/behaviors/04-versions-publication-and-chaining.md#beh-es-028-publication-writes-the-outbox-in-the-appends-transaction)
> **Satisfies:** [URS-BR-043](../../core/urs.md#urs-br-043-deliver-business-events-across-hosts-and-outages-without-loss-or-duplication-of-effect)

```
REQUIREMENT: `SeriesOpened`, `NumberIssued`, `SeriesClosed` and
             `SeriesSuperseded` MUST be registered with the event store with
             `publish: true`, so that each is published on the stream it was
             appended to (the series stream or the incarnation stream; the
             default delivery stream of event-store BEH-ES-028), and so that
             the authority
             receives them in order per origin and stream. The authority MUST
             record them with event-store `EventStore.receive` (a fact,
             never rejected). Series event types MUST NOT be listed in a
             payload codec's field selection (keyring `FieldSpec`): they
             carry numbers and stream ids, never personal data, and the
             authority must be able to read them without keys.
```

## BEH-SQ-012: verifySeries is a pure, total function

> **Invariant:** [INV-SQ-005](../invariants.md#inv-sq-005-verification-reports-only-what-it-checked)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-215, as a model)

```ts
// illustrative — not type-checked
interface SeriesReport {
  readonly series: Readonly<Record<string, {
    readonly origin: string
    readonly receivedThrough: number              // highest n with 1 … n all received
    readonly gaps: readonly { from: number; to: number }[]
    readonly duplicates: readonly { number: number; eventIds: readonly string[] }[]
    readonly issuedAfterClose: readonly number[]
    readonly closure?: { reason: string; last: number; lastKnownOnly: boolean; receivedBeyondClosure: boolean }
    readonly foreignWriter: readonly { eventId: string; origin: string }[]
  }>>
  readonly missingPrevious: readonly string[]      // BEH-SQ-014
}
// a series event as decoded by an event-store read (Stream.read or a follower), with the identities it needs
type SeriesEventInput =
  | { readonly type: "SeriesOpened"; readonly eventId: string; readonly origin: string; readonly seriesId: string; readonly previous?: { seriesId: string; lastKnown: number } }
  | { readonly type: "NumberIssued"; readonly eventId: string; readonly origin: string; readonly seriesId: string; readonly number: number }
  | { readonly type: "SeriesClosed"; readonly eventId: string; readonly origin: string; readonly seriesId: string; readonly last: number; readonly reason: string }
  | { readonly type: "SeriesSuperseded"; readonly eventId: string; readonly origin: string; readonly seriesId: string; readonly lastKnown: number; readonly lastKnownOnly: boolean }
  | { readonly type: "SeriesRetired"; readonly eventId: string; readonly origin: string; readonly seriesId: string; readonly reason: string }
declare const verifySeries: (events: readonly SeriesEventInput[]) => SeriesReport
declare const SeriesEventInput: { readonly of: (read: ReadEvent<unknown>) => SeriesEventInput | undefined }  // takes eventId and origin from the StoredEvent
```

```
REQUIREMENT: `verifySeries` MUST be pure and total: it MUST NOT throw, read
             services, decode payloads or depend on input order. It MUST
             order a series by `number`, never by a stream version or a
             position, because the authority's stream versions and positions
             are its own append order, not the issuing host's. It MUST have
             no overall pass or fail field.
```

## BEH-SQ-013: What verification reports

> **Invariant:** [INV-SQ-005](../invariants.md#inv-sq-005-verification-reports-only-what-it-checked)
> **Risk:** [RSK-SQ-001](../risks.md#rsk-sq-001), [RSK-SQ-004](../risks.md#rsk-sq-004)

```
REQUIREMENT: For each series the report MUST list: gaps between received
             numbers; duplicates (one number with two `eventId`s); numbers
             issued after a closure; the closure and whether numbers were
             received beyond a supersession; and events in a series stream
             whose `origin` differs from the series' origin, with no
             exception. A `SeriesSuperseded` MUST be accepted only from a
             later incarnation of the same node; one from another node MUST
             be listed under `foreignWriter` and MUST NOT close the series in
             the report.
```

```
REQUIREMENT: Documentation MUST state what a restore without a raised
             incarnation looks like at an authority that receives through
             durable-bus: the restored host resends (origin, stream,
             sequence) triples the authority already holds with new
             `eventId`s, so the inbox stops that (origin, stream) with
             `EnvelopeConflict` (BEH-DB-004, BEH-DB-022) while it still
             holds the first `eventId`, and absorbs the resends as repeats
             without recording them once its retention purged it
             (BEH-DB-018). In neither case does the reissued number reach the
             authority's store, so `duplicates` cannot reveal a missed
             incarnation bump; it reports only duplicates that reached the
             store by another path (a merged or imported store, a second
             writer).
```

Delivery is in order per stream, so a gap inside the received numbers is not
lag: it is a defect or an alteration upstream. A missed incarnation bump shows
first as a stopped stream at the inbox, which an operator must investigate
before releasing it.

## BEH-SQ-014: The authority's registry links incarnations

> **See:** [ADR-SQ-003](../decisions/003-a-restore-closes-the-old-series.md)

```
REQUIREMENT: `SeriesRegistry` MUST build, from received `SeriesOpened`
             events, the chain of incarnations of each (node, name), and
             MUST report in `missingPrevious` every `previous.seriesId` the
             authority has never received an event of, so that the loss of
             a whole series is visible.
```

## BEH-SQ-015: The authority may record a closure it decided

```
REQUIREMENT: An authority that declares a host lost MUST record its decision
             as its own event (`SeriesRetired { seriesId, reason, by }`) in
             its own stream, never as a `SeriesClosed` in the host's series.
             `verifySeries` MUST report numbers received after a retirement.
```

## BEH-SQ-016: Chaining a series through `ChainSink<R>`

> **Depends on:** [BEH-AC-025](../../audit-chain/behaviors/04-generic-chain.md#beh-ac-025-chainsinkr-chains-any-append-only-stream-and-hashchainsink-is-its-audit-instance), [BEH-ES-031](../../event-store/behaviors/04-versions-publication-and-chaining.md#beh-es-031-optional-chaining-through-chainsinkr)
> **Risk:** [RSK-SQ-004](../risks.md#rsk-sq-004)

```
REQUIREMENT: `Series.chainSpec(key)` MUST return event-store
             `seriesSpec(stream, { seriesId: stream })` for the series
             stream, so that the chain's `seq` is the stream version, its
             `recordId` the `eventId`, and its series id the series stream
             (never a host id). Chaining runs as event-store `chain`
             specifies; the package adds no hashing of its own.
```

**Settled here.** (1) A new incarnation closes every open series of lower
incarnations when the plugin starts or the origin changes under it, by events
in its own incarnation stream, and never writes in an old series
(BEH-SQ-009). (2) The lost tail is
stated, never hidden (BEH-SQ-010). (3) `verifySeries` is pure, total, without
an overall verdict (BEH-SQ-012). (4) Authorities never write in a host's
series (BEH-SQ-015).

**Open.** (1) Whether the authority should acknowledge received numbers back
to the host, so that a host can show what is not yet received. (2) A portable
export of series and their chain for an external reviewer.

---

_Previous: [01 — Series and ownership](./01-series-and-ownership.md)_ · _Next: [03 — Formats, testing and acceptance](./03-formats-testing-and-acceptance.md)_
