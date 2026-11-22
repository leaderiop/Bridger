# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-CHG                                               |
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

## BRIDGER-ES-00

`event-store/README.md`

- 0.6 (2026-11-09): CCR-ES-003 registered (specification audit of 2026-11-09: F-05, C-11, C-12, C-18, C-20, U-10, M-05); core 26 dependency row restated; open question 3 closed; the core seam for a local contract, provided by core CCR-BR-033, noted (CCR-ES-003)
- 0.5 (2026-11-08): CCR-ES-002 extended (round-2 integration: `publish` errors in `AppendError`) (CCR-ES-002)
- 0.4 (2026-11-08): CCR-ES-002 registered (round-2 agent review); open question 3 names the durable-bus subscription options requested (CCR-ES-002)
- 0.3 (2026-11-08): CCR-ES-001 extended: `ES` infix registered by core, URS-BR-056 and 059 cited (CCR-ES-001)
- 0.2 (2026-11-08): `PayloadCodec` dependency cites durable-bus BEH-DB-008; open question 1 updated after the alignment of BEH-ES-002, BEH-ES-006 and BEH-ES-032 (CCR-ES-001, revision bump)
- 0.1 (2026-11-08): Initial draft (CCR-ES-001)                

## BRIDGER-ES-BEH-04

`event-store/behaviors/04-versions-publication-and-chaining.md`

- 0.6 (2026-11-09): Specification audit of 2026-11-09 — BEH-ES-025: every change of the encoded payload raises the version, an added optional field included (C-11; heading changed, old anchor kept); BEH-ES-028 passes the delivery stream and causation to durable-bus `publish` and takes the published event's attribution from the returned envelope (F-05, C-20); BEH-ES-030 cites durable-bus BEH-DB-020 for both subscription forms, adds `receiveVerbatimOptions`, drops the interim rule for encrypted types, leaves commit-time conflicts to durable-bus `CommitConflict` and states which origin a re-published fact carries (C-12, C-18, C-20) (CCR-ES-003)
- 0.5 (2026-11-08): BEH-ES-028 fails the append on every durable-bus `publish` error, including `DowncastRefused`, `AccessRefused` and `OutboxFrozen` (round-2 integration) (CCR-ES-002)
- 0.4 (2026-11-08): BEH-ES-028 states that idempotency rests on `factId`; BEH-ES-030 records received facts with `decider.factId`, requires halting subscription options, states the key precondition, and adds `receiveVerbatim`; BEH-ES-031 hashes the stored event without `position` and requires JSON payloads; BEH-ES-032 stores an existing `Shredded` marker without a key (CCR-ES-002)
- 0.3 (2026-11-08): BEH-ES-028 cites URS-BR-056 and BEH-ES-032 URS-BR-059 (registered by core CCR-BR-027) (CCR-ES-001)
- 0.2 (2026-11-08): BEH-ES-032 aligned with durable-bus BEH-DB-008 (`PayloadCodec` shape, codec id stored, one encode for published events, read order and failures); BEH-ES-028 lists `PayloadEncodeFailed` (CCR-ES-001, revision bump)
- 0.1 (2026-11-08): Initial draft (CCR-ES-001)                

## BRIDGER-ES-BEH-05

`event-store/behaviors/05-storage-port-and-acceptance.md`

- 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — BEH-ES-034: `read` and `readAll`, and every load and follower batch through them, await `DurableBus.whenReadable` before they read, and a write fences before its loads decode (H3); followers stopped by `prepare` restart from the existing store's checkpoints when the install fails before the raise (B3); check 18 follows (CCR-ES-010)
- 0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-ES-033 and its acceptance check: the adapter passes each durable-bus `onEnd` function the outcome, "committed" only when the commit succeeded (K3, durable-bus CCR-DB-010); BEH-ES-034 unchanged: projections still restart after the `OriginChange`, which now follows every store-swap `apply`; SPEC-AUDIT-07 residual — BEH-ES-034: each write calls `fence` before it passes a payload through the codec; acceptance check 18: a `receive` handler is not retried while a store-swap `apply` is pending (CCR-ES-009)
- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-ES-033: the adapter runs the effects registered with durable-bus `StoreTransaction.onEnd` at commit or rollback, on every exit, in registration order, and a fence admission ends through it; BEH-ES-034 restated (H3) (CCR-ES-008)
- 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-ES-033: `EventStoreAdapter.transaction` provides `StoreTransaction` only, and a REQUIREMENT that the adapter ends every `DurableBus.fence` admission taken on a transaction when it commits or rolls back, on every exit (H2, B1, B3); BEH-ES-034: `fence` takes the transaction handle; BEH-ES-037: the conformance suite covers the admission's end; check 18: retries wait while the incarnation is unrecorded (B2) (CCR-ES-007)
- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-ES-033: the adapter's `transaction` provides the transaction's own `Scope`; BEH-ES-034: `DurableBus.fence` runs in that scope (H3); BEH-ES-040 check 18: a `receive` handler refused by the freeze does not halt its stream (F4) (CCR-ES-006)
- 0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, M17) — BEH-ES-034: every write of the store calls durable-bus `DurableBus.fence(tx)` inside its own write transaction during a whole-store install instead of following the sliding `outbox-frozen`/`outbox-thawed` feed; check 18 restated (CCR-ES-005)
- 0.5 (2026-11-10): Specification audit of 2026-11-09, round 2 — BEH-ES-034: what the store does at a re-bootstrap install — every write refused with `OutboxFrozen` during a whole-store freeze, followers read their checkpoint each batch, stop at a whole-store swap and restart from the new store's checkpoints, chain followers wait for the application, positions never translated (P6); BEH-ES-040 check 18 (CCR-ES-004)
- 0.4 (2026-11-09): Specification audit of 2026-11-09 — BEH-ES-034: a commit-time conflict fails the durable-bus inbox transaction with `CommitConflict` (C-12); BEH-ES-037 tests it; BEH-ES-038 defines the members of the `EventStore` contract that grants name, routes every helper through them and states that the contract is local, declared with core `Contract.local` (core CCR-BR-033) (M-05); BEH-ES-040 checks 6, 8, 13, 14 and 16 extended and check 17 added (CCR-ES-003)
- 0.3 (2026-11-08): BEH-ES-033 replaces `hasEvent` by `hasFact`, adds `savepoint` and declared `capabilities` with their obligations; BEH-ES-036 requires savepoints and read-committed visibility on Postgres; BEH-ES-037 and BEH-ES-040 checks extended (R5 review) (CCR-ES-002)
- 0.2 (2026-11-08): BEH-ES-034 cites URS-BR-056 (registered by core CCR-BR-027) (CCR-ES-001)
- 0.1 (2026-11-08): Initial draft (CCR-ES-001)                
