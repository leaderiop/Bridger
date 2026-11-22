# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-DB-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-DB-00

`durable-bus/README.md`

- 0.5 (2026-11-08): CCR-DB-003 extended with the resolutions of the round-2 agent review (CCR-DB-003)
- 0.4 (2026-11-08): CCR-DB-003 extended: BEH-DB-008 cites URS-BR-059 (CCR-DB-003)
- 0.3 (2026-11-08): round 2: recheck items 19–22, 24 and 25 — ADR-DB-009, no-encryption line, register row CCR-DB-003 (CCR-DB-003)
- 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 (CCR-DB-002)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-OVW

`durable-bus/overview.md`

- 0.5 (2026-11-08): Round-2 agent review — API rows for `OutboxSettlement`, `IncarnationSource`, `HistoryReader`/`HistoryAccess`, `Withheld`, `subscribeEnvelopes`, reader versions; errors `OutboxFrozen`, `IncarnationUnavailable` (CCR-DB-003)
- 0.4 (2026-11-08): round 2: recheck items 19–22 and 24 — API rows and errors for the codec, outbox settle, writers-last options and version reports; access through `AccessPolicy.ask` (CCR-DB-003)
- 0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — `HistorySource`, `follow`, `acceptGap`, `releaseStream`, `resume`; new error tags; annotations under flow "wire" (BEH-BR-296) (CCR-DB-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-TRACE

`durable-bus/traceability.md`

- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — REQ-DB-045, 046; REQ-DB-006, 024 and 037 restated (CCR-DB-006)
- 0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — REQ-DB-024 and REQ-DB-044 restated (CCR-DB-005)
- 0.5 (2026-11-09): Specification audit of 2026-11-09 — REQ-DB-042–044; INV-DB-002, 004, 005 and 009 rows extended (CCR-DB-004)
- 0.4 (2026-11-08): Round-2 agent review — REQ-DB-039–041; REQ-DB-031, 033, 034, 037, 038 restated; INV-DB-006, 009, 011 rows extended (CCR-DB-003)
- 0.3 (2026-11-08): round 2: recheck items 19–22, 24 and 25 — BEH-DB-008, 016, 031, 032, 048, INV-DB-009–011, ADR-DB-009, REQ-DB-031–038 (CCR-DB-003)
- 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — BEH-DB-047; REQ-DB-028–030; check texts aligned with BEH-DB-058 (CCR-DB-002)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-BEH-01

`durable-bus/behaviors/01-events-and-envelope.md`

- 0.7 (2026-11-09): Specification audit of 2026-11-09 — BEH-DB-001 states that every change of the encoded payload, an added optional field included, raises the version (C-11); BEH-DB-003 takes the stream from `publish`'s `options.stream` when given (F-05); BEH-DB-004 adds `DurableBus.origin` and `originChanges` and confines an origin change to a whole-store re-bootstrap (U-10); BEH-DB-005 takes `causationId` from `options.causationId` outside a handler (C-20) (CCR-DB-004)
- 0.6 (2026-11-08): Round-2 agent review (R4 F12, F26; R5-04/05, R5-06, R5-08) — `IncarnationSource`, raised by a whole-store re-bootstrap; downstream signature of an unraised restore stated; codec rotation through `decodes`; write order schema → downcast → codec; `PayloadUnreadable` under the subscription's `onUnreadable` ("park" or "halt") or read undecoded through `subscribeEnvelopes`, never dropped; codec markers pass through upcasters; erasure sentence narrowed to holders without another copy of the key (CCR-DB-003)
- 0.5 (2026-11-08): BEH-DB-008 cites URS-BR-059 (registered by core CCR-BR-027) instead of a proposal (CCR-DB-003)
- 0.4 (2026-11-08): round 2: recheck items 21 and 25, CORE-DECISIONS-2 — BEH-DB-008 `PayloadCodec` and the no-personal-data guidance for annotations, actors, the call log and audit `reason`; `onBehalfOf` as `PrincipalRef.encode`; correlation from `CurrentCorrelation` and set for handlers through `CallerContext.serve` (CCR-DB-003)
- 0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — annotations carried as core `AnnotationEntry[]` under flow "wire" (BEH-BR-296), the deadline never carried; envelope-level stops for unknown formats and conflicts; check 6 and the incarnation rule restated as an operator obligation (CCR-DB-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-BEH-02

`durable-bus/behaviors/02-transactional-outbox.md`

- 0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, H9) — BEH-DB-012: `OutboxStore.incarnation(node)` and `recordIncarnation(tx, node, n)`, keyed by node (CCR-DB-006)
- 0.5 (2026-11-09): Specification audit of 2026-11-09 — `publish` takes `PublishOptions` (`stream`, `causationId`), which change nothing but the envelope's stream and causation (F-05, C-20) (CCR-DB-004)
- 0.4 (2026-11-08): Round-2 agent review (R4 F13, F25; R5-13) — `publish` error union completed (`PayloadEncodeFailed`, `DowncastRefused`, `AccessRefused`, `OutboxFrozen`), each writes nothing and aborts the caller's write if unhandled; a destination skipped on placement receives a `Withheld` marker at that sequence, so mixed labels leave no gap (CCR-DB-003)
- 0.3 (2026-11-08): round 2: recheck item 20 — BEH-DB-016 residency labels on routes and at the inbox, `PlacementRefused` (CCR-DB-003)
- 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — the HLC is stamped in the adapter's serialized append step; `OutboxStore.retained` for resends after a receiver regression and for `HistorySource` (CCR-DB-002)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-BEH-03

`durable-bus/behaviors/03-delivery-and-inbox.md`

- 0.5 (2026-11-09): Specification audit of 2026-11-09 (C-12) — `InboxStore.transaction` and `receive` fail with the new `CommitConflict` when the engine refuses a commit for a conflict; a handler attempt that ends in `CommitConflict` is retried in a new transaction and, when the attempts end on one, halts its (origin, stream) without parking (CCR-DB-004)
- 0.4 (2026-11-08): Round-2 agent review (R4 F13; R5-04/05) — the inbox stores a `Withheld` marker at its sequence and advances the watermark and every cursor without a handler call; subscriptions gain `onUnreadable` ("park", "halt") and `subscribeEnvelopes` delivers stored envelopes undecoded, so an unreadable fact is halted on or recorded as received, never parked away (FX-NEW N1) (CCR-DB-003)
- 0.3 (2026-11-08): round 2: recheck item 20 — `PlacementRefused` added as an inbox-level stop (CCR-DB-003)
- 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — `send` returns `Ack` only, `Ack.retryAfter`; receiver regression detected and repaired or reported; attributed `acceptGap`; inbox-level stops separated from subscription-level parks and halts; duplicate check bounded by the inbox's retention; handler receipt (CCR-DB-002)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-BEH-06

`durable-bus/behaviors/06-replay-and-snapshots.md`

- 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — BEH-DB-048: `DurableBus.whenReadable`, the read gate of a whole-store install, which event-store reads await and an application decoding through the codec awaits as its own duty (H3); while `origin-unrecorded` holds the bus retries `recordIncarnation` under bounded backoff on its background fiber and lifts the hold when it commits, `settle` refused meanwhile, a record failing on every retry stated with residual (c) (H4); `publish` checks the freeze and the holds itself before `fence`, so it is refused inside an `apply` transaction and in one admitted before the freeze (B1); BEH-DB-047 and BEH-DB-048: `origin-unrecorded` pauses `follow` too (B2); `receive` fences and is refused during the freeze and the holds, answering `retryAfter`, so the `apply` transaction is the only writer (PL19); residual (a) points to the keyring's own bound (B4) (CCR-DB-011)
- 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-DB-048: `onStoreSwap` takes a participant `{ prepare, apply? }` (a bare effect still registers `prepare` only); every `apply` runs after `run`, whether it succeeded or failed, each in its own transaction on the store `run` left that `fence` admits during the freeze, before the incarnation is recorded, the `OriginChange` emitted, the freeze lifted or any subscription resumed; a failing `apply` fails the install with `SnapshotFailed` "apply-failed", handled as a failure of `run` after the raise; `publish` stays refused in that transaction; `fence` ignores the `onEnd` outcome (H4, K3); SPEC-AUDIT-07 residual — BEH-DB-048: after a failed `apply` the bus enters the hold `apply-pending`, treated as `origin-unrecorded` (`fence` and `publish` refused, subscriptions and `follow` paused, no `outbox-thawed`), retries each failed `apply` in its own `InboxStore.transaction` under bounded backoff, uncounted, in registration order, drops the `apply` of a withdrawn participant, and emits the `OriginChange` only when the hold lifts; `settle` fails with `RebootstrapBlocked` "store-swap-pending" during the hold; a `fence` on a transaction already admitted succeeds, and `publish` fences before it encodes; BEH-DB-047: `follow` stays paused while `apply-pending` holds; BEH-DB-048: `settle` also fails "store-swap-pending" while `origin-unrecorded` holds; the accepted residuals of a store-swap `apply` stated once with their bounds (a stop of the process during the install or the hold, a participant withdrawn during the hold, an `apply` that fails on every retry); a key the keyring's codec creates inside a `publish` that then fails is the keyring's write in the caller's transaction, kept if the caller commits (CCR-DB-010)
- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-DB-048: `fence` registers the end of its admission through `tx.onEnd` (H3); the keyring is named beside event-store as a store that calls `fence` in its write transactions (H4) (CCR-DB-009)
- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-DB-048: a `DurableBus.fence(tx)` admission is bounded by the transaction handle `tx` and ended by the adapter at commit or rollback, on every exit, not by a `Scope`; `fence` drops `Scope.Scope` (H2, B1); subscriptions stay paused, and `OutboxFrozen` uncounted, while `origin-unrecorded` holds after the scope closes (B2) (CCR-DB-008)
- 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-DB-048: `DurableBus.fence(tx)` is scoped to the transaction's `Scope`, and setting a whole-store freeze takes two steps, refusing new admissions and then waiting for the admitted ones to end, bounded by the settlement's `timeout` (H3); subscriptions are paused while a whole-store settlement's scope is open, and `OutboxFrozen` from a handler does not count toward `maxAttempts` (F4); BEH-DB-046: a paused `follow` or subscription is reported as paused (PL19) (CCR-DB-007)
- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — BEH-DB-048: the raised incarnation is recorded for this node through `recordIncarnation` (H9); `DurableBus.fence(tx)`, checked inside the write transaction by `publish` and by stores that share it, and the freeze waits for transactions already past the fence (M17); BEH-DB-044: an install's `GapRecord` carries reason "rebootstrap:" + `replaces` and the calling fiber's actor, the system actor when unattributed (Low); BEH-DB-047: `follow` is paused while a settlement's scope is open, and processes a pulled page only when every element carries the asked (origin, stream) and an origin in `origins`, with the residual stated (Low, seen not assessed) (CCR-DB-006)
- 0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-DB-048: a whole-store install raises the incarnation before `run`; a failed raise replaces nothing; after a raise the old origin is never used again, even when `run` fails or the process stops; `run` gets no live `StoreTransaction` (H8, P1); BEH-DB-044: a snapshot restore, and an install through `OutboxSettlement.install`, records every forward move of an inbox watermark as an attributed `GapRecord` (P3); `outbox-thawed` is held back while the raised incarnation is unrecorded (review of the round) (CCR-DB-005)
- 0.5 (2026-11-09): Specification audit of 2026-11-09 (U-10) — BEH-DB-048: participants registered with `DurableBus.onStoreSwap` read the store being replaced before a whole-store install (`prepare`, failure "prepare-failed"); the switch to the new origin emits an `OriginChange` (CCR-DB-004)
- 0.4 (2026-11-08): Round-2 agent review (R4 F8, F9, F12, F16) — BEH-DB-048 rewritten: scoped `settle` returns an `OutboxSettlement` whose `install` is the guarded install path ("in-store": outbox comparison in one transaction; "whole-store": outbox frozen with `OutboxFrozen`, incarnation raised through `IncarnationSource`); default `require` "pushed", "pushed-or-kept" only in-store; heading changed (old anchor kept); `HistorySource` built per reader with a placement check and a `HistoryAccess` decision ("open" explicit), refusals served as `Withheld` markers (CCR-DB-003)
- 0.3 (2026-11-08): round 2: recheck item 19 — BEH-DB-048 `DurableBus.rebootstrapOutbox` (push or keep before a snapshot, `RebootstrapBlocked`); BEH-DB-044 restore checked not to touch the outbox (CCR-DB-003)
- 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — downstream history is pulled through the new `HistorySource` port (BEH-DB-047); `SnapshotRequired` only on that port; `Ack.retryAfter` (CCR-DB-002)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-BEH-07

`durable-bus/behaviors/07-core-bus-and-adapters.md`

- 0.6 (2026-11-09): Specification audit of 2026-11-09 (C-12) — BEH-DB-054 property 1: a commit the engine refuses for a conflict fails `transaction` with `CommitConflict`, never with `StoreUnavailable`; BEH-DB-056 exercises it (CCR-DB-004)
- 0.5 (2026-11-08): Round-2 agent review (R4 F16, F27) — the delivery check's `origin` documented as `node#incarnation` for every envelope, local ones included, with policies told to match the `node` part (aligned with core BEH-BR-269 as amended by CCR-BR-029); out-of-host readers are checked by the serving side's `HistoryAccess` (CCR-DB-003)
- 0.4 (2026-11-08): round 2: recheck item 24, CORE-DECISIONS-2 — BEH-DB-053 rewritten on core `AccessPolicy.ask` (publish, subscribe, and every delivery with `origin`), `AccessRefused`, denied deliveries parked; `listens` and `declaredOnly`; G55 closed; core held-event note (CCR-DB-003)
- 0.3 (2026-11-08): Resolutions of the agent review of 2026-11-08 — no self-lease in `publish`; callers keep the bus up through core's own rules; adapter properties cover the saved receipt clock, retention and inbox-level stops (CCR-DB-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-DB-001)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                

## BRIDGER-DB-BEH-08

`durable-bus/behaviors/08-testing-and-acceptance.md`

- 0.12 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — check 39: `publish` refused inside a transaction admitted earlier and in an `apply` transaction (B1); check 44: the bus retries `recordIncarnation` while `origin-unrecorded` holds (H4); check 45: `publish`'s own freeze check, `receive` refused during the freeze and the holds (B1, PL19); check 46: `follow` paused under `origin-unrecorded` (B2), `whenReadable` gates event-store reads (H3) (CCR-DB-011)
- 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — check 44: store-swap `apply` steps run after `run` and commit before the `OriginChange`, a failing one fails the install "apply-failed"; check 45: `TestStore` passes each `onEnd` function the outcome (H4, K3); SPEC-AUDIT-07 residual — check 44: a failed `apply` holds `apply-pending` (writes refused, readers paused, `settle` refused "store-swap-pending") until its retries commit, the `OriginChange` emitted when the hold lifts, a withdrawn participant's `apply` dropped; check 45: the fence refuses during `apply-pending`, a repeated `fence` on an admitted transaction succeeds, `publish` fences before it encodes; check 46: `follow` and subscriptions stay paused while `apply-pending` holds; check 44: `settle` fails "store-swap-pending" while `origin-unrecorded` holds; check 41: a key the keyring's codec created before a `publish` error is the keyring's write, kept if the caller commits, not an outbox row (CCR-DB-010)
- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — check 45: an admission ends through `tx.onEnd`, whose effects `TestStore` runs on every exit in registration order (H3) (CCR-DB-009)
- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-DB-057: `TestStore` meets property 8 as restated (admissions end with the transaction); check 45: an admission ends at commit or rollback, not at a scope inside the transaction (H2, B1, B3); check 46: subscriptions stay paused while `origin-unrecorded` holds (B2) (CCR-DB-008)
- 0.8 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — check 45: the freeze refuses new admissions first, then waits for the admitted ones to end at their transaction's scope (H3); check 46: subscriptions paused during a whole-store settlement, `OutboxFrozen` not counted, paused shown in `status` (F4, PL19) (CCR-DB-007)
- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — check 6 covers the per-node incarnation record (H9); check 24 the install reason and actor (Low); check 37 the "backlog" report (M16); check 45 added: the write fence (M17); check 46 added: `follow` paused during a settlement and pulled pages checked against the asked origin and `origins` (Low) (CCR-DB-006)
- 0.6 (2026-11-10): Specification audit of 2026-11-09, round 2 — check 24 covers the `GapRecord` of a restore or install (P3); check 44 covers the raise before `run`, a failing raise and a failing `run` after the raise (H8) (CCR-DB-005)
- 0.5 (2026-11-09): Specification audit of 2026-11-09 — `TestStore.conflictAtCommit`; checks 42–44 added (publish options, commit conflicts, origin changes and store-swap participants) (CCR-DB-004)
- 0.4 (2026-11-08): Round-2 agent review (R4 F8, F9, F12, F13, F16, F22, F25, F26, F27; R5-04/05, R5-13) — checks 31, 33–35, 37, 38 restated; checks 39–41 added (CCR-DB-003)
- 0.3 (2026-11-08): round 2: recheck items 19–22, 24 and 25 — checks 31–38 (CCR-DB-003)
- 0.2 (2026-11-08): Resolutions of the agent review of 2026-11-08 — checks 6, 8, 13, 15, 17, 20, 21, 24, 25 and 27 restated; checks 28–30 added (receiver regression, two parking levels, history pulls) (CCR-DB-002)
- 0.1 (2026-11-08): Initial draft (CCR-DB-001)                
