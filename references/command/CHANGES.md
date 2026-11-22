# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-CHG                                               |
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

## BRIDGER-CM-00

`command/README.md`

- 0.4 (2026-11-08): Files 06 and 07, ADR-CM-006 and ADR-CM-007 listed; seams aligned with core round 2 (`CurrentCorrelation`, hook phases and targets, `HostLink`, `offerCallEntry`, `Draft.check`); correlation open question closed (CCR-CM-003, round 2: recheck items 1–5, 7, 8, 10; X5, X6)
- 0.3 (2026-11-08): Contents, seams and open questions aligned with the resolutions of the agent review; ADR-CM-005 listed (CCR-CM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)
- 0.1 (2026-11-08): Initial draft (CCR-CM-001)                

## BRIDGER-CM-BEH-02

`command/behaviors/02-dispatch.md`

- 0.5 (2026-11-08): BEH-CM-015 executed and replayed dispatches offered as call-log kind "dispatch" with core `DispatchInfo` (core G66 closed by CCR-BR-027); outcome mapping; Settled (3) (CCR-CM-003)
- 0.4 (2026-11-08): Steps 6 and 7 split into admission (breaker, receipt) and run (handler wrappers, handler, encode, receipt completion); `idempotencyKey` and `expectDigest` options; correlation from core `CurrentCorrelation`, `DispatchCorrelation` withdrawn; `CommandRequest` carries the typed metadata and the key; command hook points use core 31's phases, targets and policy, with the catalog's `hooks` options and `attach`; `CommandVetoed` gains `cause`; refusals offered to the call log as entries of kind "refusal", dispatch entries pending a core kind; errors `IdempotencyConflict`, `CommandBreakerOpen` (CCR-CM-003, round 2: recheck items 1, 2, 3, 4, 6, 10)
- 0.3 (2026-11-08): BEH-CM-016 taint floor; gate wrappers and draft source in catalog options; `ApprovalRef.inputDigest` and `ApprovalMismatch`; no reliance on mandatory interceptions; correlation through `DispatchCorrelation`; `onBehalfOf` as fiber principal (CCR-CM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)
- 0.1 (2026-11-08): Initial draft (CCR-CM-001)                

## BRIDGER-CM-BEH-05

`command/behaviors/05-required-acceptance-checks.md`

- 0.5 (2026-11-08): Checks 13–17 follow the resolutions of the round-2 agent review: read-only exemption from the floor, receipt digest, actor-first comparison, mode, expiry and `void`, call-log kind of a step-7 refusal, batch admission phases, compensation approvals, long items refused, keyed tasks, `CommandTaskStore` and lost tasks (BEH-CM-054) (CCR-CM-003)
- 0.4 (2026-11-08): Check 15 covers "dispatch" entries for executed and replayed dispatches (BEH-CM-015) (CCR-CM-003)
- 0.3 (2026-11-08): Checks 5, 6 and 8 follow the new step order, core `CurrentCorrelation` and core 31's phases and targets; checks 14–18 for receipts, wrappers and breakers, batches, tasks, typed metadata and the envelope (CCR-CM-003, round 2: recheck items 1–8, 10)
- 0.2 (2026-11-08): Checks for served calls, approval binding, wrappers, supplied schemas and the taint floor (check 13); core `TestHost.scriptedGateOf` used (CCR-CM-002)
- 0.1 (2026-11-08): Initial draft (CCR-CM-001)                

## BRIDGER-CM-BEH-06

`command/behaviors/06-receipts-wrappers-and-breakers.md`

- 0.3 (2026-11-09): Specification audit of 2026-11-09 — BEH-CM-041: the receipt scope gains an application-computed `partition`; every port call receives `services` (the dispatching fiber's `receiptContext` keys, and for a `Success` the wrapper chain's services), so a transaction reaches the port by context and never by fiber-local state; a dispatch from a durable-bus subscription handler joins the inbox's `StoreTransaction` with a key derived from the envelope's `eventId` (M-04); a typed error listed in the command's `retryable` is released, never stored (ERP alignment of the same audit); new BEH-CM-044, admission policies fixed in the catalog layer, consulted at step 6 and settled after step 7 (C-10); BEH-CM-043 returns the probe slot of a dispatch refused by an admission (CCR-CM-004)
- 0.2 (2026-11-08): Resolutions of the round-2 agent review (A-02, A-04, A-09, A-10, A-13, A-14): receipts compare actor first, carry the dispatch digest (`definition-differs`) and a task id (`mode-differs`; a repeat of a task returns its `CommandTaskRef`); `void` for undone batch items; a `Failure` is completed outside the wrappers, a claim is released when the wrapper chain does not end with the completed outcome, and an in-flight claim expires; one flow list for the key annotation and no inherited key in nested dispatches; a probe slot not used is returned (CCR-CM-003)
- 0.1 (2026-11-08): Initial draft — idempotency key and `CommandReceipts`, handler wrappers, breaker per command or provider (CCR-CM-003, round 2: recheck items 1, 4, 10)

## BRIDGER-CM-BEH-07

`command/behaviors/07-batches-and-long-commands.md`

- 0.3 (2026-11-09): Specification audit of 2026-11-09 (C-10) — phase C of batch admission consults the admission policies per item; items that never run, and items admitted before a phase-C failure, are settled `NotRun`; a task settles its admissions when it ends (BEH-CM-044) (CCR-CM-004)
- 0.2 (2026-11-08): Resolutions of the round-2 agent review (A-01, A-02, A-03, A-08, A-09, A-11, A-15, A-16): batch admission in three phases, so that no receipt claim or probe slot is taken before every item passed the gate, the floor and the hooks; receipts of undone items voided and replayed items never compensated; each item's request carries its planned compensation, bound by digest in the batch draft and approval, and compensations of an approved batch carry an `ApprovalRef` derived from it; the floor drafts nothing for an item of a batch; `long` items refused in a batch; a repeated keyed task returns its handle; BEH-CM-054 `CommandTaskStore` port, in memory by default, with lost tasks reported (CCR-CM-003)
- 0.1 (2026-11-08): Initial draft — batch dispatch admitted whole, run in order and undone by compensation; batch drafts approved all or none and re-planned when stale; long commands run as tasks with progress, await and cancel (CCR-CM-003, round 2: recheck items 5, 7)
