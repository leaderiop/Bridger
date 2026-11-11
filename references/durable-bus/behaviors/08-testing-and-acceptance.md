# 08 — Testing and acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-BEH-08                                            |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — check 39: `publish` refused inside a transaction admitted earlier and in an `apply` transaction (B1); check 44: the bus retries `recordIncarnation` while `origin-unrecorded` holds (H4); check 45: `publish`'s own freeze check, `receive` refused during the freeze and the holds (B1, PL19); check 46: `follow` paused under `origin-unrecorded` (B2), `whenReadable` gates event-store reads (H3) (CCR-DB-011)<br>0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — check 44: store-swap `apply` steps run after `run` and commit before the `OriginChange`, a failing one fails the install "apply-failed"; check 45: `TestStore` passes each `onEnd` function the outcome (H4, K3); SPEC-AUDIT-07 residual — check 44: a failed `apply` holds `apply-pending` (writes refused, readers paused, `settle` refused "store-swap-pending") until its retries commit, the `OriginChange` emitted when the hold lifts, a withdrawn participant's `apply` dropped; check 45: the fence refuses during `apply-pending`, a repeated `fence` on an admitted transaction succeeds, `publish` fences before it encodes; check 46: `follow` and subscriptions stay paused while `apply-pending` holds; check 44: `settle` fails "store-swap-pending" while `origin-unrecorded` holds; check 41: a key the keyring's codec created before a `publish` error is the keyring's write, kept if the caller commits, not an outbox row (CCR-DB-010)<br>0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — check 45: an admission ends through `tx.onEnd`, whose effects `TestStore` runs on every exit in registration order (H3) (CCR-DB-009)<br>0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-DB-057: `TestStore` meets property 8 as restated (admissions end with the transaction); check 45: an admission ends at commit or rollback, not at a scope inside the transaction (H2, B1, B3); check 46: subscriptions stay paused while `origin-unrecorded` holds (B2) (CCR-DB-008)<br>0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — check 45: the freeze refuses new admissions first, then waits for the admitted ones to end at their transaction's scope (H3); check 46: subscriptions paused during a whole-store settlement, `OutboxFrozen` not counted, paused shown in `status` (F4, PL19) (CCR-DB-007)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — check 6 covers the per-node incarnation record (H9); check 24 the install reason and actor (Low); check 37 the "backlog" report (M16); check 45 added: the write fence (M17); check 46 added: `follow` paused during a settlement and pulled pages checked against the asked origin and `origins` (Low) (CCR-DB-006)<br>0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — check 24 covers the `GapRecord` of a restore or install (P3); check 44 covers the raise before `run`, a failing raise and a failing `run` after the raise (H8) (CCR-DB-005)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 — `TestStore.conflictAtCommit`; checks 42–44 added (publish options, commit conflicts, origin changes and store-swap participants) (CCR-DB-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F8, F9, F12, F13, F16, F22, F25, F26, F27; R5-04/05, R5-13) — checks 31, 33–35, 37, 38 restated; checks 39–41 added (CCR-DB-003)<br>0.3 (2026-11-08): round 2: recheck items 19–22, 24 and 25 — checks 31–38 (CCR-DB-003)<br>0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — checks 6, 8, 13, 15, 17, 20, 21, 24, 25 and 27 restated; checks 28–30 added (receiver regression, two parking levels, history pulls) (CCR-DB-002)<br>0.1 (2026-11-08): Initial draft (CCR-DB-001)                 |

---

This file specifies the in-memory store and faulty delivery used to test the
bus deterministically, and the acceptance checks an implementation must
pass. This file owns BEH-DB-057–064 and uses BEH-DB-057–058; BEH-DB-059–064
are reserved.

Planned source: `packages/durable-bus/src/testing/TestStore.ts`,
`packages/durable-bus/src/testing/TestDelivery.ts`; planned tests:
`packages/durable-bus/test/acceptance/*.test.ts` *(Planned)*.

## BEH-DB-057: TestStore and TestDelivery

> **See:** [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Depends on:** core [21 — Testing host](../../core/behaviors/21-testing-host.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```ts
// illustrative — not type-checked
interface TestStore {           // an in-memory adapter meeting BEH-DB-054 (1–6, 8)
  readonly layer: Layer.Layer<StoreTransaction | OutboxStore | InboxStore>
  readonly crashBeforeCommit: Effect.Effect<void>   // next commit fails as if the process died
  readonly conflictAtCommit: Effect.Effect<void>    // next commit fails with CommitConflict, nothing committed (BEH-DB-054)
  readonly restoreFrom: (snapshot: TestStoreSnapshot) => Effect.Effect<void>   // simulate a restored backup
  readonly dump: Effect.Effect<TestStoreSnapshot>
}
interface TestDelivery {        // a DeliveryTransport between buses in one process
  readonly drop: (n: number) => Effect.Effect<void>          // lose the next n batches
  readonly dropAck: (n: number) => Effect.Effect<void>       // deliver, then lose the acknowledgement
  readonly duplicate: (n: number) => Effect.Effect<void>
  readonly reorder: Effect.Effect<void>                      // swap the next two batches
  readonly partition: Effect.Effect<void>
  readonly heal: Effect.Effect<void>
}
```

```
REQUIREMENT: `TestStore` MUST pass the adapter conformance suite
             (BEH-DB-056). `TestDelivery` MUST run under `TestClock` and a
             seeded `Random`, so that every fault schedule is reproducible.
```

## BEH-DB-058: Required acceptance checks

> **See:** [ADR-DB-003](../decisions/003-at-least-once-with-a-deduplicating-inbox.md), [ADR-DB-004](../decisions/004-order-per-origin-stream-sequence.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-013](../../core/urs.md#urs-br-013-exchange-typed-events-between-plugins)

```
REQUIREMENT: An implementation MUST pass the checks below with `TestStore`
             and `TestDelivery` before any behaviour of this companion is
             described as implemented. Each check is a planned scenario
             REQ-DB-NNN, numbered as listed (traceability.md §4).
```

1. `DurableEvent.make` rejects a non-integer version and a broken upcaster chain at the call (BEH-DB-001).
2. Every published envelope carries all required fields, ids from `IdGenerator` and times from `Clock` (BEH-DB-002).
3. Publishing outside a `StoreTransaction` does not type-check (type-level test) (BEH-DB-009).
4. A rolled-back transaction leaves no envelope, no sequence gap and nothing the relay can send; a commit makes it pending (BEH-DB-009, BEH-DB-010, BEH-DB-011).
5. Concurrent transactions on one stream commit contiguous unique sequences (BEH-DB-011).
6. A configured incarnation lower than the one the store recorded refuses to start; a store restored with its recorded incarnation starts (the package cannot detect it), and when it reuses sequences under one origin, a receiver that still holds the first envelopes stops that stream at the inbox with `EnvelopeConflict` and keeps the first; the incarnation is recorded through `recordIncarnation` keyed by node, and a store that records a higher incarnation for another node starts and keeps that entry unchanged (BEH-DB-004, BEH-DB-012).
7. The actor is the publishing fiber's; on receipt the handler sees it with a provenance annotation naming the origin (BEH-DB-006).
8. Envelopes carry `Annotations.encode` of the "wire" filter: taint and provenance always, never the deadline, other keys only with "wire" and within `carry`; on receipt `Annotations.decode` rejects undeclared keys (listed in the receipt) and the handler runs inside `CallerContext.serve` with the received taint, which it cannot remove (BEH-DB-007).
9. Under generated schedules of drop, dropAck, duplicate, reorder and partition, every committed envelope is eventually stored once by the receiver and processed once per subscription, in sequence order per (origin, stream) (BEH-DB-017, BEH-DB-018, BEH-DB-019, BEH-DB-020).
10. An acknowledgement is never returned for an inbox transaction that did not commit; the sender keeps the envelopes pending (BEH-DB-018, BEH-DB-019).
11. A handler's writes, its cursor advance and envelopes it publishes commit or roll back together (BEH-DB-015, BEH-DB-020).
12. Envelopes recorded at every version from `minVersion` to the current one read correctly through the upcaster chain; stored envelopes are not rewritten (BEH-DB-025, BEH-DB-028).
13. A newer version than the reader knows is stored and acknowledged; under "halt" the subscription's stream halts at it and processes it in order after upgrade and re-registration; under "park-and-continue" it is parked with `UnknownEventVersion` and processed after upgrade and `unpark` (BEH-DB-026, BEH-DB-022).
14. An upcaster failure parks with `UpcastFailed`; nothing is deleted (BEH-DB-027, BEH-DB-022).
15. A poison handler halts its stream by default, with the cursor before it, and `resume` retries it; with "park-and-continue" it parks and continues (BEH-DB-021).
16. A subscription withdrawn by its plugin's stop resumes from its cursor when a handler registers again (BEH-DB-023).
17. HLCs issued by one node strictly increase across publishes, receipts and a restart with the clock set backwards, including a restart right after a receipt with no publish since (the saved receipt clock) (BEH-DB-034, BEH-DB-035).
18. A received HLC beyond `maxDrift` is stored with `skewed: true`, reported, and not adopted by the local HLC (BEH-DB-035).
19. Deduplication ignores HLCs: two envelopes with equal HLCs and different sequences are both stored (BEH-DB-036).
20. Merged reads are in HLC order and consistent with every stream's sequence order under concurrent publishers to one stream; an envelope published by a handler sorts after its cause unless the cause was stored `skewed` (BEH-DB-011, BEH-DB-037).
21. The relay never exceeds the receiver's credit; zero credit waits `Ack.retryAfter` (BEH-DB-041).
22. Reconnect backoff uses seeded full jitter between `retryMin` and `retryMax` (BEH-DB-042).
23. A high-priority stream is delivered while a large low-priority backlog drains, with order kept in each stream (BEH-DB-043).
24. A follower behind the source's retained history receives `SnapshotRequired` from `HistorySource.read`; the restore, the watermark reset and the cursor resets commit together; a watermark moved past unstored sequences, by a restore or by an in-store or whole-store install, is recorded as a `GapRecord` with reason "snapshot:" and the restoring actor (for an install, reason "rebootstrap:" + `replaces` and the actor of the fiber that called `install`, the system actor when it is unattributed), and listed in status; without a provider following stays stopped (BEH-DB-019, BEH-DB-044, BEH-DB-047).
25. The push path carries no `SnapshotRequired`: an inbox accepts a relay's backlog however old (BEH-DB-045).
26. `forward` emits on the core bus after commit; a failing core listener leaves the cursor advanced; the bus never touches `Bridger.Events` otherwise (BEH-DB-049, BEH-DB-050).
27. Stopping the bus plugin mid-batch leaves unacknowledged envelopes pending and rolls back running handlers; the build makes no transport call; a `publish` in a caller's transaction is not interrupted by the stop (BEH-DB-051, BEH-DB-052).
28. A receiver restored to an older store reports a lower watermark; the relay reports `receiver-regressed` and resends from it out of `retained`; when the outbox purged part of the range it reports `envelopes-lost`, and the stream proceeds only after an attributed `acceptGap` (BEH-DB-017, BEH-DB-019).
29. An unknown envelope format and a conflicting event id stop the (origin, stream) at the inbox — watermark unchanged, later envelopes not acknowledged, no subscription sees them — until `releaseStream`; a batch with an element lacking origin, stream or sequence is refused whole; a parked envelope is per subscription, and after `unpark` it is processed after the envelopes that followed it (BEH-DB-002, BEH-DB-018, BEH-DB-022).
30. `follow` pulls pages of at most `maxPage` with one read in flight per source, backs off with seeded jitter, and feeds pages through the inbox rules (duplicates and gaps absorbed) (BEH-DB-047).
31. With a test `PayloadCodec`, every stored and sent payload is the codec's output and `Envelope.codec` names it; no other field differs from an identity-codec run; a codec failure fails `publish` and writes nothing; `PayloadUnreadable` is parked under `onUnreadable` "park" and halts under "halt"; `subscribeEnvelopes` hands the handler the stored payload and codec unchanged, with no decode; an envelope under a codec id listed in `decodes` reads after a rotation, an unlisted one is handled under `onPoison` (BEH-DB-008, BEH-DB-020).
32. `onBehalfOf` is `PrincipalRef.encode` of the publisher's principal and decodes on receipt; `correlationId` is the publisher's `CurrentCorrelation`; a handler's mutating calls carry the envelope's correlation (BEH-DB-002, BEH-DB-005, BEH-DB-007).
33. `rebootstrapOutbox().settle` pushes pending envelopes and reports `pushed` and `kept`; under "pushed" (the default) a remaining backlog fails with `RebootstrapBlocked`; "pushed-or-kept" with `replaces` "whole-store" fails with "kept-needs-in-store"; a store error fails with "outbox-unavailable"; `settle` acknowledges nothing itself (BEH-DB-048).
34. A `SnapshotProvider.restore`, or an in-store install run through `OutboxSettlement.install`, that deletes or acknowledges an outbox row is rolled back with "outbox-touched" and the outbox is unchanged; an envelope published between `settle` and the in-store install survives it (BEH-DB-044, BEH-DB-048, INV-DB-009).
35. A wired `AccessPolicy` is asked on publish, on subscribe and on every delivery, with the envelope's `node#incarnation` origin for local, received and pulled envelopes; a denied publish or subscribe fails with `AccessRefused` and writes nothing; a denied delivery parks or halts under `onPoison`, never runs the handler, for local, received and pulled envelopes; a retired principal leaves the cursor in place (BEH-DB-053).
36. With `publishVersion` N−1, a value that survives the round trip is published at N−1 and one that does not fails with `DowncastRefused`; `publishVersions` switches the writer to N without a new release; `DurableEvent.make` rejects a `publishVersion` below N−1 or without `downcast[N]` (BEH-DB-030, BEH-DB-031).
37. `status.versions` reports the lowest and highest version stored per (type, origin), updated in the receipt transaction, reset only by an attributed `resetVersions`; `status.readers` reports the lowest version read per type by registered subscriptions; both are offered as federation `VersionReports` (kinds "received" and "reader"); one "backlog" report for the current origin carries `pending` 0 exactly when nothing is pending for any destination, and is left out when the backlog cannot be read (BEH-DB-029, BEH-DB-032).
38. A destination whose route does not offer an envelope's `placement/residency` label is skipped and reported, and receives a `Withheld` marker at that sequence carrying no type, payload, actor or annotations; its inbox stores the marker, advances the watermark and every cursor without a handler call, and the next envelope of the stream is processed without a gap; a receiver whose `inboxResidency` does not offer a label stops the (origin, stream) with `PlacementRefused` (BEH-DB-016, BEH-DB-018, BEH-DB-020).
39. A whole-store re-bootstrap without an `IncarnationSource` is refused with "no-incarnation-source"; with one, `publish` fails with `OutboxFrozen` from the end of the first drain phase until the settlement's scope closes, also inside a transaction `fence` admitted before the freeze and inside an `apply` transaction, the install raises the incarnation, and envelopes published afterwards carry the new origin and are accepted by a receiver that acknowledged the old one (BEH-DB-004, BEH-DB-048).
40. A `HistorySource` built for a reader returns, in place of an envelope the reader's route does not offer or the `HistoryAccess` denies, a `Withheld` marker with the matching reason, counted per reader; with `access` "open" only placement is checked; a failing `decide` is a denial (BEH-DB-047).
41. Every `publish` error (`EncodeFailed`, `DowncastRefused`, `PayloadEncodeFailed`, `AccessRefused`, `OutboxFrozen`, `OutboxWriteFailed`, `Unattributed`) writes nothing (no outbox row; a key the keyring's codec created in the caller's transaction before the error is the keyring's write, kept when the caller catches the error and commits, keyring BEH-KR-017) and, left unhandled, rolls back the caller's own write in the same transaction (BEH-DB-009, BEH-DB-031).
42. `publish` with `options.stream` writes the envelope on that stream, numbered in that stream's own sequence, and without it on `event.stream(payload)`; an empty stream is a defect and writes nothing; `options.causationId` sets the causation outside a handler, and inside one the handled envelope's `eventId` is used (BEH-DB-003, BEH-DB-005, BEH-DB-009).
43. A handler attempt whose commit fails with `CommitConflict` (`TestStore.conflictAtCommit`) commits nothing and is retried in a new transaction; when the attempts end on a conflict the (origin, stream) halts under either `onPoison` and nothing is parked; a conflict in `receive` stores and acknowledges nothing (BEH-DB-018, BEH-DB-021, BEH-DB-054).
44. `DurableBus.origin` returns the origin of the next envelope; a whole-store install runs every `onStoreSwap` participant's `prepare` on the store being replaced, before `run` and while `publish` fails with `OutboxFrozen`; a failing `prepare` fails the install with "prepare-failed" and raises nothing; the incarnation is raised before `run`, and a failing raise fails the install with `IncarnationUnavailable` without calling `run`; every participant's `apply` runs after `run`, also when `run` fails, in a transaction on the store `run` left that `fence` admits during the freeze and in which `publish` fails with `OutboxFrozen`, and commits before the incarnation is recorded, the `OriginChange` is emitted and any subscription resumes; a participant registered with a bare `prepare` effect has no `apply`; a failing `apply` rolls back its own writes, the later ones still run, and the install fails with "apply-failed" while the origin still switches; the bus then holds `apply-pending`: `fence` and `publish` fail with `OutboxFrozen`, no subscription handler call or `follow` read starts and `outbox-thawed` is not reported, after the settlement's scope closes too, `settle` fails with `RebootstrapBlocked` "store-swap-pending", and the failed `apply` is retried, uncounted and in registration order, until it commits, when the `OriginChange` is emitted and the freeze lifts and readers resume once the scope has closed; a participant withdrawn during the hold drops its `apply`, and the hold lifts when none remains; after the raise, `originChanges` emits one `OriginChange` (after a failed `apply`, once the hold lifts) and `origin` returns the new origin, also when `run` fails; while `origin-unrecorded` holds, `settle` also fails with "store-swap-pending", `follow` and subscriptions stay paused, and the bus retries `recordIncarnation` under bounded backoff, uncounted, until it commits, when the hold lifts and, once the scope has closed and no `apply-pending` holds, the freeze lifts and readers resume; a restart after the raise, before the incarnation was recorded, starts under the raised incarnation (BEH-DB-004, BEH-DB-048).
45. `DurableBus.fence(tx)` fails with `OutboxFrozen` inside a transaction from the moment a whole-store freeze is set until the settlement's scope closes, and while the incarnation is unrecorded or `apply-pending` holds; a `fence` called again on a transaction already admitted succeeds, also once the freeze is set, and `publish` calls `fence` before the codec encodes; setting the freeze first refuses every new admission, then waits for the admissions already granted to end, each ending when its transaction commits or rolls back (through `tx.onEnd`, whose functions `TestStore` runs on both, on every exit, in registration order, given "committed" only after a successful commit and "rolled-back" otherwise, `crashBeforeCommit` and `conflictAtCommit` included, and not when a scope inside the transaction closes), so a write admitted before the freeze never commits after it and steady new writes cannot extend the wait; an admission still open at `timeout` fails `settle` with "outbox-unsettled" and lifts the freeze; `publish` checks the same fence, and before it checks the freeze and the holds itself, so it fails with `OutboxFrozen` inside a transaction admitted before the freeze; `receive` during the freeze or a hold stores and acknowledges nothing and answers zero credit with `retryAfter`, and the freeze's second step waits for a `receive` already admitted (BEH-DB-018, BEH-DB-048, BEH-DB-054).
46. While a settlement's scope is open, and while `apply-pending` or `origin-unrecorded` holds, `follow` issues no `read`, an interrupted read commits nothing, and after the scope closes it resumes from the watermarks the install wrote; a page carrying an (origin, stream) other than the one asked for, or an origin outside `origins`, is discarded uncommitted and reported `history-mismatch`. While a whole-store settlement's scope is open, and after it closes while `origin-unrecorded` or `apply-pending` holds, no subscription handler call starts; a handler failing with `OutboxFrozen` neither counts toward `maxAttempts` nor halts or parks, and is retried when the pause ends, not before the incarnation is recorded; `status` shows each paused `follow` and subscription as paused. `whenReadable` completes at once with no freeze or hold, waits from the end of the freeze's second step while a freeze, `apply-pending` or `origin-unrecorded` is in force, and completes when the last ends; an event-store `read` or `readAll` started during the install or a hold decodes nothing until then, and a read inside a transaction admitted before the freeze does not wait (BEH-DB-021, BEH-DB-046, BEH-DB-047, BEH-DB-048).

---

_Previous: [07 — Core bus, plugin packaging and storage adapters](./07-core-bus-and-adapters.md)_
