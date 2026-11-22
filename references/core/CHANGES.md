# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BR-CHG                                               |
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

## BRIDGER-00

`core/README.md`

- 0.29 (2026-11-10): CCR-BR-034 registered (phase 3 of the specification audit: the round-2 findings of 2026-11-09, core side, and the companion records of the round); CCR register rows CCR-BR-017 to CCR-BR-019 put in ascending order; CCR-BR-034 follow-ups for C22 and C23 recorded (CCR-BR-034)
- 0.28 (2026-11-09): CCR-BR-033 registered (remaining core findings of the specification audit: unique identifiers, handoff under supersession, realm readiness, plan tags, local contracts; core side of requests M-01, M-02, F-07 and the data-plane local contract); CCR-BR-032's impact list corrected (INV-BR-020: verification and related only); CCR-BR-033 extended with the independent reviews' fixes (CCR-BR-033)
- 0.27 (2026-11-09): CCR-BR-032 registered (phase 2 of the specification audit, core: host interface single source, realms and base keys, shutdown destination and final snapshot, lifecycle exceptions and checks) (CCR-BR-032)
- 0.26 (2026-11-09): CCR-BR-031 registered (phase 1 of the specification audit: GxP companion re-synchronised, gap G35 closed, sealing through audit-chain, rigour for every risk); `@bridger/gxp` added to the companion specifications table (CCR-BR-031)
- 0.25 (2026-11-08): CCR-BR-030 registered (resolutions of the round-2 prototype third pass G-P19..G-P24; third pass recorded) (CCR-BR-030)
- 0.24 (2026-11-08): CCR-BR-029 extended with the companion and docs fix phase (FX-AGENTIC, FX-TRUST, FX-NET, FX-NEW) and its integration (RSK-BR-048, RSK-BR-065, BEH-BR-302, gap G70) (CCR-BR-029)
- 0.23 (2026-11-08): CCR-BR-029 registered (resolutions of the round-2 agent review, core side; host-core prototype second pass and findings G-P13..G-P18) (CCR-BR-029)
- 0.22 (2026-11-08): CCR-BR-028 registered (resolutions of the round-2 prototype findings G-P1..G-P12; prototype pass P7) (CCR-BR-028)
- 0.21 (2026-11-08): CCR-BR-027 extended to round 2 phase 2 (companion revisions, new trees, docs, core seams); companion table rows for event-store, sequence and keyring and CCR ranges; reading-order guides row; seams 22–24 (CCR-BR-027)
- 0.20 (2026-11-08): CCR-BR-024, CCR-BR-025 and CCR-BR-026 registered; contents ranges for files 26–29 and 31–34 (CCR-BR-024, CCR-BR-025, CCR-BR-026); CCR-BR-027 opened (round 2 integration and docs) (CCR-BR-027)
- 0.19 (2026-11-08): CCR-BR-023 registered (CCR-BR-023)
- 0.18 (2026-11-08): CCR-BR-022 registered; register entries of CCR-BR-018, 019 and 020 corrected; file 30's range BEH-BR-289–296 (CCR-BR-022)
- 0.17 (2026-11-08): CCR-BR-017, 018, 019, 020 and 021 registered; behaviours 26–34 in the contents; companion specifications table, guides in the reading order, honest-claims note on audit chaining and out-of-process code (CCR-BR-017, CCR-BR-018, CCR-BR-019, CCR-BR-020, CCR-BR-021)
- 0.16 (2026-11-08): CCR-BR-016 registered; link into references/gxp/ in the CCR-BR-015 entry turned into a plain-text citation (CCR-BR-016)
- 0.15 (2026-10-03): CCR-BR-015 registered (CCR-BR-015)
- 0.14 (2026-10-03): CCR-BR-014 registered (CCR-BR-014)
- 0.13 (2026-10-03): CCR-BR-013 registered; register entries of CCR-BR-002, 008, 009 and 012 corrected (CCR-BR-013)
- 0.12 (2026-10-03): CCR-BR-012 registered (CCR-BR-012)
- 0.11 (2026-10-02): CCR-BR-011 registered (CCR-BR-011)
- 0.10 (2026-10-02): CCR-BR-010 registered (CCR-BR-010)
- 0.9 (2026-10-02): CCR-BR-009 registered (CCR-BR-009)
- 0.8 (2026-10-02): CCR-BR-008 registered, including its second review pass; impact assessments added to CCR-BR-006 and CCR-BR-007 (CCR-BR-008)
- 0.7 (2026-10-02): CCR-BR-007 registered (CCR-BR-007)
- 0.6 (2026-10-02): CCR-BR-006 registered (CCR-BR-006)
- 0.5 (2026-10-02): CCR-BR-005 registered (CCR-BR-005)
- 0.4 (2026-10-02): CCR-BR-004 registered (CCR-BR-004)
- 0.3 (2026-10-02): CCR-BR-003 registered (CCR-BR-003)
- 0.2 (2026-10-02): CCR-BR-002 registered (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-GLOSSARY

`core/glossary.md`

- 0.16 (2026-11-11): Cascade root: a child's sub-scope close or unmount is the no-caller root of the cascades that stop its own dependents (CL3); Parked: a sub-scope finalizer whose closing fiber holds a lease on the child leaves the parent's parked stop to it, and `unmount` from such a fiber fails with `WouldDeadlock` (H1) (SPEC-AUDIT-06); Package digest, signature policy, revocation set, kill switch: a revocation removes the plugins it revokes by `remove` (H6) (SPEC-AUDIT-06) (loader CCR-LD-009) (CCR-BR-038)
- 0.15 (2026-11-11): Cascade root: the refused background restart; parked stop and ended intent: a child's sub-scope close or unmount resumes only a stop parked outside its parent's stop (H1, CL1, CL3) (SPEC-AUDIT-05); Audit position: `lastNumbered`, `HostControls.closed` and `CloseTail` (C5); Refusal list: operator calls able to start and the `whenAvailable` re-run (C9, CL14) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.14 (2026-11-10): Audit-degraded latch: a running `reconcile`'s parent record lost at shutdown also sets it (C4) (CCR-BR-036)
- 0.13 (2026-11-10): Parked stop and ended intent: a child's sub-scope close or unmount also resumes (C11); plan: `expect` binds code only through `meta.digest` (C6) (CCR-BR-035)
- 0.12 (2026-11-10): System stop names the refused background restart (C5); `HoldRevoked` `seq` and `GenerationRevoked` (C7); Call-log entry kinds include "dispatch" (audit round 2, Low) (CCR-BR-034)
- 0.11 (2026-11-09): Contract: local contract (`Contract.local`); realm family: a ready member; state handoff: `restart` and `reconfigure` under `alsoOn`, and a superseded build (U-02, U-03; local contracts); system stop names the idle return of a lazy plugin (BEH-BR-252, BEH-BR-073) (CCR-BR-033)
- 0.10 (2026-11-09): Base service: replaceable only in a realm that isolates its key; host-owned keys (C-02) (CCR-BR-032)
- 0.9 (2026-11-08): Companion terms of round 2: receipt, listing record, model-facing envelope, signed statement, data pack, revocation list, kill-only apply, chain series, verification bundle, residency label, writers last, payload codec, expected version, fact, number series, crypto-shredding; entry owner and `HoldRevoked` (CCR-BR-027)
- 0.8 (2026-11-08): Hook point entry: phases, targets, breaker per plugin, declarations; declared contribution, HostLink, held event, idle return, denied-policy (CCR-BR-024); atomic apply, undo action, PartialApply, mandatory catalog, contract registry, Selector range (CCR-BR-025); refusal list, CurrentCorrelation, call-log failure policy, attributed unmount, call-log entry kinds (CCR-BR-026)
- 0.7 (2026-11-08): Plugin principal: "on whose behalf" (CCR-BR-022)
- 0.6 (2026-11-08): Contracts, manifest, consent diff, lazy plugin and legality table with seven states (CCR-BR-017); principal, policy and annotation terms (CCR-BR-018); hook point, selector, gate, plan, realm family and handoff terms (CCR-BR-019); `Plugin.Any` (CCR-BR-020); hash chain and companion terms (CCR-BR-021)
- 0.5 (2026-10-03): Fingerprint; Audit position (CCR-BR-014)
- 0.4 (2026-10-03): Parked (a child's removal resumed only by `remove`), Confluence (the failure exception) and Audit-degraded latch (what sets it) follow their behaviours (consistency pass) (CCR-BR-013)
- 0.3 (2026-10-02): Transition step, cascade, parked, operation in flight, system stop; Linearization and Drain updated; parked per the single parking rule, ended intents and `intent-ended`, operator-rooted cascades (CCR-BR-008)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-INV

`core/invariants.md`

- 0.20 (2026-11-11): INV-BR-009 a sub-scope close or `unmount` resumes a child stop parked outside its parent's stop only before the parent's stop has begun (C1); INV-BR-016 `unmount` also refuses on `CurrentTransition` (CL5), and the Source states how a scoped `lease(keys)` puts the provider in the acquiring fiber's `HeldPlugins` for the lease's scope, inherited by fibers forked afterwards (C5); INV-BR-017 "begun" counts from the parent becoming `stopping` or shutdown beginning, whose limits a sub-scope close or `unmount` never shortens, and the take-over of any outside stop waits for the owning operation's stop step and build, bounded by `drainTimeout` + `buildTimeout` (H1, C2) (SPEC-AUDIT-08) (CCR-BR-040)
- 0.19 (2026-11-11): INV-BR-016 `unmount` fails with `WouldDeadlock` at the call, before any wait and writing no record, whenever the caller carries in `HeldPlugins` (own or inherited; "or a fiber it awaits" removed) a plugin of the child's removal set (the child and its dependents, transitively), and the unmount and finalizer checks are taken out of the "follow the `requested` record" sentence; INV-BR-017 the same set for the finalizer, the parent's stop has begun from the revision in which it becomes `stopping`, an `unmount` without such a lease waits under the limits of the removal it joins or begins, and the no-caller list names the take-over of a stop begun outside the parent's stop, draining or parked; Related of INV-BR-016 and INV-BR-017 cite BEH-BR-121 and BEH-BR-126, INV-BR-023 cites BEH-BR-205 (H1, C1, C2, C3, C4, C5, CL7, CL11); INV-BR-023 `shutdown`'s own `requested` record lost at close sets the latch (CL1); INV-BR-029 the close-flush trigger and its verification (CL10); INV-BR-045 `cold` part of the operation: joins need equal `cold`, a `cold: true` superseding call yields the skip record, a plan binds `cold` (C7, C8, CL5) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.18 (2026-11-11): INV-BR-023 a terminal, `rejected` or system record unwritten at close, numbered or not, sets the latch carried as `CloseTail.auditDegraded`; the error log alone only for a never-numbered `requested` record (C2) (SPEC-AUDIT-06); INV-BR-045 a handoff skipped by `cold: true` yields one `handoff` record marked `cold: true`, and the call's gate request and records carry `cold` (C7) (SPEC-AUDIT-06); INV-BR-016 `unmount` raises `WouldDeadlock` at the call, before any wait, and a sub-scope finalizer never fails or waits on a lease of its closing fiber (C3, H1, H2, C1); INV-BR-017 the same for the wait on a parent's stop, and the no-caller paths name the cascades that stop a child's own dependents (H1, CL3); INV-BR-009 a sub-scope close or `unmount` never resumes a child stop the parent's stop parked (H1) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.17 (2026-11-11): INV-BR-009 and INV-BR-017 a child stop the parent's stop parked stays the parent's; a sub-scope close or unmount only waits for it, failing with `WouldDeadlock` when its fiber holds a lease on the child (H1); INV-BR-016 the untracked-fork false positive, `Effect.forkScoped` into the activation scope included (C1); INV-BR-018 report and snapshot entries matched by (`id`, `realm`) (C2); INV-BR-001 `providerRealm` (C2) (SPEC-AUDIT-05); INV-BR-023 a close-flush loss signalled by `Host.controls().closed` (`CloseTail`), never-numbered records by the log only (C5); INV-BR-029 the latch set after the final snapshot publishes and emits nothing (C3); INV-BR-041 `settle` never awaited (C8) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.16 (2026-11-10): INV-BR-009 a child's parked stop is also resumed by its sub-scope close or `unmount` (C10); INV-BR-017 the paths with no caller name the refused background restart and a sub-scope close or `unmount` that removes a child itself, and one that waits on the parent's stop follows that stop's limits (H1); INV-BR-016 and INV-BR-030 name plugins by the canonical key `JSON.stringify([realm, id])`, `WouldDeadlock` carries `realm` (C1), and INV-BR-016 Source and verification state the `emit` exception and the record-less refused `shutdown` (CL8); INV-BR-022 and INV-BR-029 name the running `reconcile`'s parent record lost at shutdown (C4); INV-BR-023 a record mid-retry at close keeps its number, and a loss at close is signalled by the error log and `auditPosition`, not `CloseReport.auditDegraded` (CL7, C5); INV-BR-050 statement and Source name the `whenAvailable` re-run beside the background restart (C11) (CCR-BR-036)
- 0.15 (2026-11-10): INV-BR-016 statement, Source and verification: `CurrentTransition` for builds, `load` and finalizers, `shutdown` refused from it before its `requested` record (H1); INV-BR-030 Source aligned (H1); INV-BR-043 `expect` binds code only through `meta.digest`, the Implication narrowed (C6); INV-BR-022 and INV-BR-027 cover steps 4a and 4b and the refused `shutdown`; INV-BR-007 shutdown's unregistration; INV-BR-050 the `dormant` trigger, including a move to `waiting` (audit round 3, Low) (CCR-BR-035)
- 0.14 (2026-11-10): INV-BR-026 covers files 02–21 and 26–34, and its differential test compares generated identifiers by order of first appearance (C12; audit round 2, Low); INV-BR-043 names what `expect` compares and that configuration values are outside a plan (H2); INV-BR-037 statement and verification cover files 02–20 and 22–34 (review of CCR-BR-034) (CCR-BR-034)
- 0.13 (2026-11-09): INV-BR-024 generated identifiers are unique within their host and across hosts sharing a store, an obligation on the generator that core does not check (F-03); INV-BR-004 the staleness of a build that imports handed-off state is decided before the import (U-02); INV-BR-045 covers `restart` and `reconfigure` under `alsoOn`, the stop's final step, and a superseded build that leaves the value held (C-14, U-02) (CCR-BR-033)
- 0.12 (2026-11-09): INV-BR-018 the final snapshot holds exactly the `failed(cleanup)` plugins of the report (U-01); INV-BR-020 verification: no realm isolates the host or its bus (C-02) (CCR-BR-032)
- 0.11 (2026-11-08): INV-BR-046 covers idling and refused declarations, `HostLink.none` and failed reads, and states its scope (forged links, gap G64); INV-BR-052 retitled to Effect members with the residual named (CCR-BR-029)
- 0.10 (2026-11-08): INV-BR-046–047; INV-BR-040 and INV-BR-032 amended (CCR-BR-024); INV-BR-048–049 (CCR-BR-025); INV-BR-050–052 (CCR-BR-026)
- 0.9 (2026-11-08): INV-BR-035 implication: principal of the calling fiber; INV-BR-026: unwired entitlement mode `unmetered`; INV-BR-041 verification: no host events for breakers (CCR-BR-022)
- 0.8 (2026-11-08): INV-BR-031–034 added, INV-BR-001, 007, 011 and 015 amended for contracts, manifests and lazy activation (CCR-BR-017); INV-BR-035–039 added for the plugin principal, mandatory policy, grants, call log and annotations (CCR-BR-018); INV-BR-040–045 added for hook points, plans, realm retirement and state handoff (CCR-BR-019); INV-BR-026 covers an unwired `EntitlementView` (CCR-BR-020)
- 0.7 (2026-10-03): INV-BR-013 and INV-BR-028 except the fingerprints produced by the consumer's `ConfigFingerprinter` port at step 4a (core computes no hash); INV-BR-026 an unwired fingerprinter changes nothing (CCR-BR-014)
- 0.6 (2026-10-03): INV-BR-006 distinguishes revoked callbacks from interrupted holders; INV-BR-009 notes a child's parked removal (consistency pass) (CCR-BR-013)
- 0.5 (2026-10-02): INV-BR-002 graph includes mount edges, child→parent; INV-BR-009 per transition step and operation in flight, a parked stop resumed by a call, a cascade or shutdown; INV-BR-010 interruption outcomes per stage; INV-BR-016 and INV-BR-030 cover builds and finalizers (and the fibers a build or finalizer forks and awaits), INV-BR-016 also `retry` and `enable`; INV-BR-017 parks every unsettled stop a failing operator call drives, revokes paths with no caller, never parks once shutdown has begun; INV-BR-022 no record for a `requested` record dropped for overflow, verification pairs records by call and covers resumption and `Interrupted`; INV-BR-025 `reconcile` re-checks `requireReason` on the diff recomputed at its intent; INV-BR-030 bound per cascade drain limit plus `buildTimeout` per build step, finalizers that return, stops take no `concurrency` slot (CCR-BR-008, both review passes)
- 0.4 (2026-10-02): INV-BR-010 source: interruption before intent writes a failed (Interrupted) record (CCR-BR-007)
- 0.3 (2026-10-02): INV-BR-030 added (CCR-BR-006)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-OVW

`core/overview.md`

- 0.8 (2026-11-08): Hook point, lazy and Host rows: declarations, `HostLink`, held event, idle return, phases, targets, policy deny (CCR-BR-024); `ReconcileOptions.atomic`, desired-entry policy, `mandatoryCatalog`, contract registries, `MethodSpec.timeout`, handoff `alsoOn` and `cold`, errors `PolicyMismatch`, `ApplyRolledBack`, `PartialApply` (CCR-BR-025); `RefusalList`, `AccessPolicy.declaredOnly`/`ask`, `CurrentCorrelation`, `offerCallEntry`, `Plugin.Runtime.unmount`, `settle`, call-log failure policy, `buildTimeout` (CCR-BR-026)
- 0.7 (2026-11-08): `CurrentPlugin` row: "on whose behalf" (CCR-BR-022)
- 0.6 (2026-11-08): Contracts and manifests API, loading errors, `baseContracts` (CCR-BR-017); principal, policy and annotations API and errors (CCR-BR-018); hook points, gates, plans, realm families and handoff API and errors (CCR-BR-019); `Plugin.Any`, `HeldPlugins`, `EntitlementView`, `Plugin.Runtime.entitled` (CCR-BR-020); companion package rows, guides pointer, core exclusions extended (CCR-BR-021)
- 0.5 (2026-10-03): API surface: `Host.controls` and `HostControls`, the `ConfigFingerprinter` port and `ConfigChange`, `ConfigFingerprintUnavailable` and `ConfigFingerprintFailed`, the `fingerprintTimeout` option, `CloseReport.auditLastSeq` (CCR-BR-014)
- 0.4 (2026-10-03): The gate covers operator mutations other than `shutdown`; system transitions are recorded, never gated (consistency pass) (CCR-BR-013)
- 0.3 (2026-10-02): Parked stops, `DrainTimeout` fields, `Interrupted` record-only tag, TestHost members; `intent-ended` record and `resumes` (CCR-BR-008)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-ROADMAP

`core/roadmap.md`

- 0.19 (2026-11-08): Round 2 core fixes: prototype second pass recorded (every check 59–111 with a passing test, 25 only partly); CCR-BR-029 row (CCR-BR-029)
- 0.18 (2026-11-08): Round 2 core fixes: P7 prototype pass recorded (partial coverage of checks 59–111, evidences no requirement); CCR-BR-028 row (CCR-BR-028)
- 0.17 (2026-11-08): Round 2 companion revisions on B1 and B4–B7; step B8 (event-store, sequence, keyring); CCR-BR-027 in the round 2 core fixes table (CCR-BR-027)
- 0.16 (2026-11-08): Round 2 core fixes table: CCR-BR-024, CCR-BR-025 and CCR-BR-026, specified only (CCR-BR-024, CCR-BR-025, CCR-BR-026)
- 0.15 (2026-11-08): Core seams and companion phases B1–B7 (CCR-BR-017, CCR-BR-018, CCR-BR-019, CCR-BR-020, CCR-BR-021); loader and audit chaining moved out of "Deferred"; sandbox non-plan points to the remote companion (CCR-BR-021)
- 0.14 (2026-11-08): P6 row: the companion Draft in references/gxp/ is not present in this repository and must be restored or re-drafted before approval (gap G35); link turned into a plain-text citation (CCR-BR-016)
- 0.13 (2026-10-03): P6 row: companion specification drafted in references/gxp/ (Draft 0.1, CCR-GX-001), approval before code pending, prerequisite CCR-BR-014 done; non-plan wording without a restricted word (CCR-BR-015)
- 0.12 (2026-10-03): P6 row: prerequisite core change CCR-BR-014 specified and prototyped (CCR-BR-014)
- 0.11 (2026-10-03): P5 row: every settled cell (consistency pass) (CCR-BR-013)
- 0.10 (2026-10-03): P5 exit criterion met in the prototype (CCR-BR-012)
- 0.9 (2026-10-02): P5 prototyped (CCR-BR-011)
- 0.8 (2026-10-02): P4 prototyped (CCR-BR-010)
- 0.7 (2026-10-02): P2 prototyped (CCR-BR-009)
- 0.6 (2026-10-02): Stale G2–G4 exit criterion and blocker removed; review of CCR-BR-003..007, in two passes, noted (CCR-BR-008)
- 0.5 (2026-10-02): In-flight table prototyped (CCR-BR-007)
- 0.4 (2026-10-02): G11 resolved; P1 prototype extended (CCR-BR-006)
- 0.3 (2026-10-02): P3 prototype recorded (CCR-BR-005)
- 0.2 (2026-10-02): P1 prototype recorded (CCR-BR-004)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-URS

`core/urs.md`

- 0.19 (2026-11-08): URS-BR-049–050; gaps G37, G39 and G62 closed; gap G64 (a loaded but inactive veto plugin still fails open) (CCR-BR-024); URS-BR-051–052; gaps G36, G40, G44 and G48 closed; gap G65 (a narrowing provider replace needs two runs) (CCR-BR-025); URS-BR-053–055; gaps G38, G41–G43, G54, G55 (core side), G57–G61 and G63 closed (CCR-BR-026)
- 0.18 (2026-11-08): Gaps G61–G63 from the open questions of the loader and entitlement companions (CCR-BR-023)
- 0.17 (2026-11-08): URS-BR-032 reads "on behalf of which plugin" (CCR-BR-022)
- 0.16 (2026-11-08): URS-BR-029–031, gaps G36–G38 and G5 narrowed (CCR-BR-017); URS-BR-032–035, gaps G39–G42 (CCR-BR-018); URS-BR-036–040, gaps G44–G47 (CCR-BR-019); companion-origin URS-BR-041–048, Partner user group, companion scope row, gaps G43 and G48–G56 (CCR-BR-021)
- 0.15 (2026-11-08): Gap G35 recorded (the companion Draft in references/gxp/, on which G8's closure rests, is not present in this repository); G8's status points to G35; links into references/gxp/ turned into plain-text citations (CCR-BR-016)
- 0.14 (2026-10-03): Gap G8 closed: the companion is specified as a Draft in references/gxp/ (CCR-BR-015)
- 0.13 (2026-10-03): Gap G34 recorded and closed (`CloseReport.auditLastSeq` and the audit position after close) (CCR-BR-014)
- 0.12 (2026-10-03): §6 points to the behaviours' Satisfies lines (consistency pass) (CCR-BR-013)
- 0.11 (2026-10-03): G33 recorded and closed from the P5 exit-criterion work (CCR-BR-012)
- 0.10 (2026-10-02): G26–G32 recorded and closed from the P5 prototype (CCR-BR-011)
- 0.9 (2026-10-02): G19–G25 recorded and closed from the P4 prototype (CCR-BR-010)
- 0.8 (2026-10-02): G17 and G18 recorded and closed from the P2 prototype (CCR-BR-009)
- 0.7 (2026-10-02): G11 status reworded (the prototype evidences no requirement); G16 recorded and closed, including the second review pass (CCR-BR-008)
- 0.6 (2026-10-02): G14 and G15 recorded and closed from the in-flight table prototype (CCR-BR-007)
- 0.5 (2026-10-02): G11 closed by ADR-BR-038 (CCR-BR-006)
- 0.4 (2026-10-02): G11 extended and G13 recorded from the GxP prototype (CCR-BR-005)
- 0.3 (2026-10-02): G10–G12 recorded from the host-core prototype (CCR-BR-004)
- 0.2 (2026-10-02): Open items G2–G4 closed by the Effect API prototype; G9 added (CCR-BR-003)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-GXP-02

`core/gxp/02-compliance-matrix.md`

- 0.8 (2026-11-08): 11.10(e) cites root `lazy-triggered` `onBehalfOf` and `lazy-idle` (CCR-BR-024), undo records with `undoes` (CCR-BR-025), `start-refused`, `unmount-requested` with `requestedBy`, `auditDropped` and `sanitized` (CCR-BR-026); Attributable cites the correlation in the fiber; Complete cites `auditDropped` on every record
- 0.7 (2026-11-08): 11.10(e) note: `onBehalfOf` is the principal of the calling fiber; §12.4 row cites BEH-BR-259, Attributable row cites BEH-BR-293 (CCR-BR-022)
- 0.6 (2026-11-08): 11.10(e), (f), Annex 11 §5, §9, §10 cite the dormant state, contract checks and manifests (CCR-BR-017); 11.10(d), (e), (g) and Attributable cite the plugin principal, policy seams and annotations (CCR-BR-018); 11.10(d), (e), (f), (g) and Attributable cite plans, deferral, realm retirement, narrowed actors and handoff (CCR-BR-019); companion notes for 11.10(a), (d), (e), (f), (g), Annex 11 §5 (now Core + Companion + Consumer), §9, §10, Original and Enduring, and claim 6 (CCR-BR-021)
- 0.5 (2026-11-08): Links into the companion's Draft compliance matrix and behaviour files (references/gxp/) turned into plain-text citations, each row noting that the Draft is not present in this repository (gap G35) (CCR-BR-016)
- 0.4 (2026-10-03): Every row allocated to the Companion links the answering section of the companion's Draft compliance matrix and its behaviour file (CCR-BR-015)
- 0.3 (2026-10-03): Three loss paths; audit-trail statements scoped to what core hands the sink (BEH-BR-194) (consistency pass) (CCR-BR-013)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-GXP-03

`core/gxp/03-risk-assessment.md`

- 0.26 (2026-11-11): RSK-BR-017 controls: a catalog acceptance admits only while contributed by the catalog activation that recorded it, its end leaving it withdrawn (loader CCR-LD-012, SPEC-AUDIT-09 L1); RSK-BR-044 controls: the round-8 loader controls CCR-LD-011 named but did not write — a revocation removal is never caused by a loader's stop or a catalog withdrawal, and a held run is released only by the reviewed run id, now "<startId>-<n>" from `IdGenerator` (SPEC-AUDIT-09 PL8, L2) (loader CCR-LD-011, CCR-LD-012); scores unchanged; RSK-BR-009 controls, risks and verification: a child whose cleanup fails in a removal not under shutdown is unregistered at once with the leak logged as acknowledged, and families and ephemeral realms remove their own before retiring the realm; RSK-BR-011: a take-over never waits for a build; RSK-BR-011 risks introduced: a handed-off removal's revocation of a parent's `background` fiber lease fails the parent under "fail-plugin" (SPEC-AUDIT-09 CL4); RSK-BR-016: background fibers supervised from outside and re-forked after a revocation under "restart"; RSK-BR-023: a parent's cascade waits for a take-over begun by a sub-scope close or `unmount`; RSK-BR-034, 035: the failed-cleanup and take-over rules (SPEC-AUDIT-09 R1, C10, C11) (CCR-BR-041); scores unchanged; second pass (cleanest design): RSK-BR-009 and RSK-BR-034 controls name the one system acknowledgement of BEH-BR-047 with its `leak-acknowledged` record and the families' `pruneAcknowledgeLeaks` prune in place of the second prune, and RSK-BR-009's introduced risk the review of `leak-acknowledged` records in place of log monitoring (CCR-BR-041); scores unchanged
- 0.25 (2026-11-11): RSK-BR-011 controls: `unmount` also refused when its caller carries a plugin of the child's removal set in `CurrentTransition` (CL5); RSK-BR-016 controls: a background fiber interrupted by a lease revocation is a failure under its policy (C4); scores unchanged (SPEC-AUDIT-08) (CCR-BR-040)
- 0.24 (2026-11-11): RSK-BR-053 title, failure mode, controls and residual: the resolver is the application's port, and a restarted offline host past `maxAge` starts none of its entries until a fresh revocation set, while kills still act; scores unchanged (SPEC-AUDIT-08 H2, F2) (federation CCR-FD-011)
- 0.23 (2026-11-11): RSK-BR-017 controls: gate-piece admission (c) of a federation proxy digest and the kill switch's scope, a revoked plugin outside it only reported (PL15, CL3); RSK-BR-044 controls: the scope is the plugins `Host.snapshot` reports owned by it, a plugin outside it reported and logged, never removed nor counted; residual: a revoked plugin outside the scope keeps running until its owner removes it (PL15) (SPEC-AUDIT-08) (CCR-BR-040)
- 0.22 (2026-11-11): RSK-BR-006 residual: `shutdown`'s own `requested` record lost at close sets the latch (CL1); RSK-BR-035 controls and verification: `cold` part of the operation, checks 83 and 103 (C7, C8, CL5); RSK-BR-017 controls: `reconfigure` not refused "verification-unknown" by the gate piece but at step 4b, and running revoked plugins removed by the kill switch with `Host.remove`; RSK-BR-044 core control the `Host.remove` path; RSK-BR-061 companion control: the kill switch removes, never disables (CL12); scores unchanged ; RSK-BR-011 controls, introduced risk and verification: `unmount` refused and the finalizer not waiting on a lease in the child's removal set, and the sub-scope closing with its child still registered until the removal settles (CL9, H1) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.21 (2026-11-11): RSK-BR-006 residual: a terminal, `rejected` or system record lost in the close flush, numbered or not, sets the latch carried as `CloseTail.auditDegraded`, the log alone only for a never-numbered `requested` record (C2); RSK-BR-035 controls: the `cold: true` skip record and `cold` on the gate request and records (C7); RSK-BR-044 controls: a loader revocation removes the dropped installed plugins with `Host.remove` and never reconciles, and re-evaluation reads the accepting policy and publisher bindings from the record (H5, H6, L1) (loader CCR-LD-009); scores unchanged (SPEC-AUDIT-06) (CCR-BR-038)
- 0.20 (2026-11-11): RSK-BR-017 and RSK-BR-044 controls gain the loader's round-4 and round-5 controls: an exemption by digest counts as a pinned acceptance, a revocation reconcile issues prune removals only and keeps every entry still installed whatever its pending status, signer revocation is re-evaluated from the verification record alone (identities, roles, requirement), and the gate refuses "verification-unknown" for restart-like calls unless the digest is pinned or exempt (L4, H7, H8, L3) (SPEC-AUDIT-05) (loader CCR-LD-007, CCR-LD-008); RSK-BR-006 controls and residual: the latch after the final snapshot and a close-flush loss reported by `Host.controls().closed` (`CloseTail`), never-numbered records by the log only, the lost reconcile record under BEH-BR-192's fourth exception (C3, C4, C5); RSK-BR-008 and RSK-BR-012 controls name the four `correlationId` exceptions (C4); RSK-BR-061 controls name the `whenAvailable` re-run (CL14); scores unchanged (SPEC-AUDIT-05) (CCR-BR-037)
- 0.19 (2026-11-10): RSK-BR-006 residual names a fourth loss path, a running `reconcile`'s parent record lost at shutdown, with its control the latch (C4), and a record lost in the close flush is shown by `auditPosition`, not `CloseReport.auditDegraded` (C5); RSK-BR-011 risks introduced by controls: the untracked forked fiber that keeps `CurrentTransition` for life, a documented false positive, and realm-qualified references (C2, C1); RSK-BR-033 controls, verification and residual gain the definition without `meta.digest` of the narrowed INV-BR-043 and its consumer control, residual reassessed to Medium (3) / Medium (4) (C13); RSK-BR-061 controls name a trigger applied to a `dormant` plugin leaving for `waiting` (INV-BR-050) (CL11) (CCR-BR-036)
- 0.18 (2026-11-10): RSK-BR-011 controls: `HeldPlugins` and `CurrentTransition`, `load`, `shutdown` from a transition step, and both references carried across companion hand-offs (H1); RSK-BR-008 and RSK-BR-012 controls name the three bare-`correlationId` exceptions, the hook decision record among them (C5; audit round 3, Low); companion range RSK-RM-001–017, RSK-RM-017 named beside RSK-BR-062 (remote CCR-RM-006) (CCR-BR-035)
- 0.17 (2026-11-10): RSK-BR-034 failure mode, controls (BEH-BR-331 failure after ready, BEH-BR-336 refused teardown), residual, owner and the consumer residual list gain the refused ephemeral teardown (C16, C19); RSK-BR-015 controls: generations report forced revocations on their own feed, unaudited (C7); scores unchanged; RSK-BR-014 failure mode, controls and residual gain the ungated child-mount route, and its §4 owner the Consumer (C18; audit round 2, Low); RSK-BR-063 states that the actor is inherited as the correlation is, re-scored with scores unchanged because the wrong actor is RSK-BR-005's hazard (C21); RSK-BR-008 and RSK-BR-012 controls name the `CallLog`, RSK-BR-012 also the bare correlation of `reconcile-partial` (H1; audit round 2, Low); RSK-BR-003 controls and residual and RSK-BR-016 residual name the background "restart" and "ignore" policies (audit round 2, Low); RSK-BR-039 failure mode, controls, residual and the consumer residual list gain an envelope origin not bound to its sender, a claim the transport and the deployment must bind (durable-bus BEH-DB-018, CCR-DB-005, P2); scores unchanged; RSK-BR-055 control: a snapshot restore or re-bootstrap install also passes a range, recorded as a `GapRecord` (durable-bus CCR-DB-005; review of CCR-BR-034) (CCR-BR-034)
- 0.16 (2026-11-09): RSK-BR-007 retitled and reworded to cover colliding identifiers: uniqueness obligation on the generator (BEH-BR-210, BEH-BR-016), the sink's keep-or-refuse rule (BEH-BR-193), installation check 8 for a provided generator; scores unchanged (F-03); RSK-BR-035 controls gain the superseded-build rule, the import commit, principal and annotations of the handoff steps and the lazy old side (U-02, U-04, U-05); RSK-BR-034 controls gain member readiness (U-03); RSK-BR-070 controls aligned with keyring BEH-KR-012 and the delivery companions: a tombstone makes fields decode as `Shredded`, an unreadable payload is parked or halts, never dropped (C-13); `receiveVerbatim` cited as event-store's (BEH-ES-030), reading through durable-bus `subscribeEnvelopes`; RSK-BR-007 states the default's random bound (122 bits per value) in place of "high probability" (CCR-BR-033)
- 0.15 (2026-11-09): RSK-BR-009 controls gain the shutdown destination and final snapshot (BEH-BR-105, BEH-BR-109); RSK-BR-029 controls gain a failing wrap on an optional or reactive capture (BEH-BR-152), verification check 26; no score changed (CCR-BR-032)
- 0.14 (2026-11-09): Introduction states the register's real range, RSK-BR-001 to RSK-BR-070 (CCR-BR-031)
- 0.13 (2026-11-08): RSK-BR-048 controls cite the command taint floor (replacing the withdrawn `TaintGuard` interception) and residual gains a command wrongly declared `readOnly`; RSK-BR-065 residual names a failed receipt `void`; scores unchanged (CCR-BR-029)
- 0.12 (2026-11-08): RSK-BR-057 controls and residual (idling and refused declarations, owner matching, `HostLink.none`, forged links); RSK-BR-059 undo controls; RSK-BR-061 controls and residual (plan and atomic validation, statement digests, confluence modulo the list); RSK-BR-062 residual for non-Effect members; scores unchanged (CCR-BR-029)
- 0.11 (2026-11-08): RSK-BR-064–070 added (command batches and receipts, stale data packs, a revocation without a `RefusalList`, event-store, sequence, keyring); RSK-BR-043–048 controls and residual notes extended, scores unchanged; remote round-2 risks summarised (CCR-BR-027)
- 0.10 (2026-11-08): RSK-BR-057–058 added; RSK-BR-032 controls extended, RSK-BR-026 and RSK-BR-028 gain controls, scores unchanged (CCR-BR-024); RSK-BR-059–060 added; RSK-BR-025, 033 and 035 controls extended, scores unchanged (CCR-BR-025); RSK-BR-061–063 added; RSK-BR-030 controls and residual, RSK-BR-017 and RSK-BR-044 gain the refusal list, scores unchanged (CCR-BR-026); identifier range to RSK-BR-063; §4 summary rows and consumer residual list extended
- 0.9 (2026-11-08): RSK-BR-052–056 added for residuals proposed by the federation and event delivery companions; §4 summary rows and the consumer residual list extended (CCR-BR-023)
- 0.8 (2026-11-08): RSK-BR-028 residual: provider-method attribution; RSK-BR-027 residual cites `CapabilityPolicy` (BEH-BR-273–275) (CCR-BR-022)
- 0.7 (2026-11-08): RSK-BR-025–027 added, RSK-BR-004, 010, 017 and 019 controls extended, scores unchanged (CCR-BR-017); RSK-BR-028–031 added, RSK-BR-013 reviewed (CCR-BR-018); RSK-BR-032–035 added, RSK-BR-013 and 014 reviewed (CCR-BR-019); `EntitlementView` added to the ports walked (CCR-BR-020); companion-origin RSK-BR-036–051 added, RSK-BR-006, 013 and 017 residual notes and the remote companion's risk pointer added, scores unchanged (CCR-BR-021)
- 0.6 (2026-10-03): RSK-BR-024 added (value port used to exfiltrate configuration values; controls from BEH-BR-188, BEH-BR-192, BEH-BR-197, ADR-BR-039); RSK-BR-008 reviewed — the `ConfigFingerprinter` port added as a path and its controls, scores unchanged; RSK-BR-014 owner in the §4 summary corrected to Core + Companion; `ConfigFingerprinter` added to the ports walked in §1; §4 residual list extended (CCR-BR-014)
- 0.5 (2026-10-03): RSK-BR-006 residual names three loss paths; RSK-BR-005 control notes the `reconcile` exception (BEH-BR-158) (consistency pass) (CCR-BR-013)
- 0.4 (2026-10-02): RSK-BR-023 controls justifying the residual named, cross-fiber residual allocated to RSK-BR-011 (whose controls now cover builds and finalizers, scores unchanged), owner and §4 residual list extended (re-issuing an ended intent); RSK-BR-004 and RSK-BR-006 reviewed for CCR-BR-007 and CCR-BR-008 (interruption before intent, record-only `Interrupted`, first terminal cause wins, `endsIntentOf`) — controls extended, scores unchanged; second review pass: `intent-ended` record and `resumes` (RSK-BR-004, RSK-BR-023), a dropped `requested` record fails its call at once (RSK-BR-006), mount edges child→parent, stops parking with a failing call, shutdown never parks and the cascade bound per build step (RSK-BR-023), forks of builds and finalizers (RSK-BR-011) — scores unchanged (CCR-BR-008)
- 0.3 (2026-10-02): RSK-BR-023 added (CCR-BR-006)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-GXP-04

`core/gxp/04-validation-plan.md`

- 0.4 (2026-10-03): §5.1 checks 5–6 executable through `Host.controls` (BEH-BR-212); check 7 "fingerprinter wired as required" added; RSK-BR-024 added to the High rigour row; `ConfigFingerprinter` out of scope like the other consumer ports; `fingerprintTimeout` added to the revalidation defaults (CCR-BR-014)
- 0.3 (2026-10-03): Known-gaps list no longer cites the Effect 4.x items closed by CCR-BR-003 (consistency pass) (CCR-BR-013)
- 0.2 (2026-10-02): RSK-BR-023 added to the High rigour row (CCR-BR-006)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-ADR-008

`core/decisions/008-error-taxonomy.md`

- 0.9 (2026-11-10): The error table is completed with every error and defect later decisions added, each citing its behaviour, and is again called complete; it points to the overview's grouping; record-only tag `DigestRefused` (C23) (CCR-BR-034)
- 0.8 (2026-11-09): `InvalidDefinition` raised by `enable` too (BEH-BR-062) and the cause of a `load` that fails phase "load" (BEH-BR-246) (CCR-BR-033)
- 0.7 (2026-11-09): `InvalidRealm` added (C-02); `InstallError` and the `reconcile` union aligned with BEH-BR-013, named as the single source of host unions (C-01) (CCR-BR-032)
- 0.6 (2026-11-08): record-only handoff loss tags (`HandoffExportFailed`, `HandoffVersionUnaccepted`, `HandoffUpgradeFailed`, `HandoffDecodeFailed`, `HandoffImportFailed`, `HandoffAbandoned`) beside `Interrupted` (CCR-BR-022)
- 0.5 (2026-10-03): `ConfigFingerprintUnavailable { operation, message }` (call error of `install` and `reconfigure`, per entry for `reconcile`; message written by core) and `ConfigFingerprintFailed { message }` (the port's error, never reaching a caller) (CCR-BR-014)
- 0.4 (2026-10-03): `Conflict` and `HostClosed` also raised by child install (BEH-BR-121) (consistency pass) (CCR-BR-013)
- 0.3 (2026-10-02): Record-only `Interrupted` tag; `DependencyCycle` raised by child install; `DrainTimeout { id, leases, target? }`, `id` also naming a plugin whose running transition step the call waited for; `WouldDeadlock` raised by `retry` and `enable` (CCR-BR-008)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-ADR-038

`core/decisions/038-cross-plugin-stop-ordering.md`

- 0.5 (2026-11-11): Item 4 the no-caller roots name the refused background restart (CL3); item 5 a child's sub-scope close or unmount resumes only a stop parked outside its parent's stop and only waits for one the parent's stop parked (H1, CL1); `DrainTimeout` carries `realm` (C2) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.4 (2026-11-10): A lease holder carries its provider in `HeldPlugins`, a build, `load` or finalizer fiber its plugin in `CurrentTransition` (H1) (CCR-BR-035)
- 0.3 (2026-10-03): `awaitIdle` counts requested steps (G33); a child's parked removal resumed only by `remove` (consistency pass) (CCR-BR-013)
- 0.2 (2026-10-02): Parked system stops, resumption ownership, cascades with no caller, cascade drain limit and bound, children removed, re-entrancy from builds and finalizers; second pass: one parking rule for a failing call, drain limit while waiting on a build, child→parent mount edges, stops take no slot, `intent-ended` record, shutdown never parks (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft; closes URS gap G11 (CCR-BR-006)

## BRIDGER-BEH-01

`core/behaviors/01-plugin-definition.md`

- 0.3 (2026-11-08): Plugin.Any and the phantom brand (CCR-BR-020); contract references in Keys, manifest field, contract rules in BEH-BR-006/007, lazy load note in BEH-BR-008 (CCR-BR-017); handoff field and rule (i) (CCR-BR-019); loader companion wording (CCR-BR-021)
- 0.2 (2026-10-02): IdentifiersOf made distributive (prototype finding G10) (CCR-BR-004)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-02

`core/behaviors/02-host-construction.md`

- 0.8 (2026-11-09): BEH-BR-012 the base-key rule scoped to the default realm's resolution scope, an isolating realm may provide a base key, the host-owned keys `Bridger.Host` and `Bridger.Events` never provided or isolated (C-02); BEH-BR-013 made the single source of host signatures: `restart` and `reconfigure` take `HandoffCallOptions`, `reconcile` adds `ApplyRolledBack` and `PartialApply`, `defineRealm` adds `InvalidRealm`, Settled note (C-01) (CCR-BR-032)
- 0.7 (2026-11-08): BEH-BR-010 `HostLink` reference and BEH-BR-013 `declaredContributions` and `link` (CCR-BR-024); BEH-BR-011 option `mandatoryCatalog` and its domain rule (CCR-BR-025)
- 0.6 (2026-11-08): BEH-BR-010 `CurrentCorrelation` reference; BEH-BR-013 `offerCallEntry`, Settled item 8; BEH-BR-015 the `RefusalList` port and the `CallLog` fields read at construction (CCR-BR-026)
- 0.5 (2026-11-08): `wake` takes no `OperationContext` and is a class of its own (system transitions only); generic `install`/`replace` overloads take the branded `Plugin` (CCR-BR-022)
- 0.4 (2026-11-08): BEH-BR-011 options `mandatory`, `resolutionTimeout`, `callLogTimeout` (CCR-BR-018), `baseContracts` (CCR-BR-017), `handoffTimeout` (CCR-BR-019); BEH-BR-013 `Plugin.Any` overloads (CCR-BR-020), `wake` (CCR-BR-017), `plan`, `retireRealm`, `PlanStale` (CCR-BR-019), `ResolutionRefused` (CCR-BR-018); BEH-BR-014 `retireRealm` operation; BEH-BR-015 policy ports, context references (CCR-BR-018) and `EntitlementView` (CCR-BR-020)
- 0.3 (2026-10-03): BEH-BR-011 `fingerprintTimeout` option and its domain rule; BEH-BR-013 `controls()` observation member and `ConfigFingerprintUnavailable` in the `install` and `reconfigure` unions (per entry for `reconcile`), Settled item 7; BEH-BR-014 `controls` is not mutating; BEH-BR-015 `ConfigFingerprinter` read once at construction, and an unwired fingerprinter changes nothing (CCR-BR-014)
- 0.2 (2026-10-02): HeldPlugins also carried by builds and finalizers; `concurrency` bounds builds only; `retry` and `enable` add `WouldDeadlock` (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-04

`core/behaviors/04-states-and-snapshots.md`

- 0.12 (2026-11-11): BEH-BR-026 the `active → stopping` edge names the refused `whenAvailable` re-run and a child's sub-scope close or unmount (CL8), and the settled legality of `failed` (cleanup) cites BEH-BR-071 (CL7); BEH-BR-027 a child removal by its sub-scope close or unmount shows `reason` "remove", `parked` is cleared by them only for a stop parked outside the parent's stop (H1, CL1), `providerIds` name plugins as `{ id, realm }` (C2) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.11 (2026-11-10): BEH-BR-027 `StopReason` "refused-digest" also covers a refused `whenAvailable` re-run (C11) (CCR-BR-036)
- 0.10 (2026-11-10): BEH-BR-031 dependency loss leaves a `dormant` plugin unchanged, and shutdown's unregistration is named as the one other exit from `failed` (audit round 3, Low) (CCR-BR-035)
- 0.9 (2026-11-10): BEH-BR-026 `starting` may also be left by unregistration when shutdown begins before its build (C2); diagram edge `active → stopping` for a refused background restart; BEH-BR-027 `StopReason` gains "refused-digest" (C5) (CCR-BR-034)
- 0.8 (2026-11-09): BEH-BR-026 edge `starting` → unregistered when shutdown begins while its build has not begun (12, BEH-BR-105) (review of CCR-BR-032) (CCR-BR-033)
- 0.7 (2026-11-09): BEH-BR-026 the unregistration edges name shutdown; BEH-BR-027 under shutdown every `stopping` entry shows `reason` "shutdown" and `next` "gone" (U-01) (CCR-BR-032)
- 0.6 (2026-11-08): idle return edges and `StopReason` "idle" (27, BEH-BR-252) (CCR-BR-024); disabled reason "refused-digest" and start-refused edges (CCR-BR-026)
- 0.5 (2026-11-08): `PluginCommon` gains `allowChildren` and `mandatoryServiceIds` (28); a lazy registration's `meta` is the lazy definition's identity (27) (CCR-BR-022)
- 0.4 (2026-11-08): Seventh state `dormant`, its edges, snapshot variant, `starting.loading`, failure phase "load", `PluginCommon.lazy` (CCR-BR-017)
- 0.3 (2026-10-03): The `starting` → `waiting` edge of BEH-BR-035 added to the meaning of `starting`, the diagram, the leave rule and dependency loss; `reconfigure` removed from the `waiting` → `starting` label (consistency pass) (CCR-BR-013)
- 0.2 (2026-10-02): `stopping` gains `parked`; `reason` and `next` when a cascade, a call or shutdown resumes a parked stop; parked per the single parking rule (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-05

`core/behaviors/05-activation.md`

- 0.7 (2026-11-09): BEH-BR-033 a `waiting` plugin does not start once shutdown has begun; BEH-BR-034 no build begins and queued builds are cancelled under shutdown; BEH-BR-039 shutdown is a target change whose stale build is discarded (U-01) (CCR-BR-032)
- 0.6 (2026-11-08): BEH-BR-033 a wired `RefusalList` is consulted before a plugin enters `starting`, and a refused start lands in `disabled` (CCR-BR-026)
- 0.5 (2026-11-08): BEH-BR-034 the build step of an unloaded lazy registration begins with `load`; BEH-BR-038 contract references compared by version instead of object (CCR-BR-017)
- 0.4 (2026-10-03): A transition step requested and not yet begun counts against idleness (prototype finding G33) (CCR-BR-012)
- 0.3 (2026-10-02): A build begins when it holds a slot; a `starting` plugin whose requirement is gone when its build would begin returns to `waiting`, not `failed`; a stop cancels a build that has not begun (prototype finding G25) (CCR-BR-010)
- 0.2 (2026-10-02): Stale build with both causes; parked stops never count for `awaitIdle` and do not prevent idleness; `WouldDeadlock` from builds and finalizers; `concurrency` bounds builds only, stops take no slot (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-06

`core/behaviors/06-removal.md`

- 0.6 (2026-11-11): BEH-BR-045 `DrainTimeout` carries `realm` beside `id` (absent for a `Generation`) and `target` as `{ id, realm }`; BEH-BR-046 `CleanupError` carries `realm` (C2) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.5 (2026-11-10): BEH-BR-045 `WouldDeadlock` carries `id` and `realm` (C1) (CCR-BR-036)
- 0.4 (2026-11-09): BEH-BR-041 and BEH-BR-043 a dependent ends `waiting` (or `starting`) except where its own stop ends otherwise (BEH-BR-039, BEH-BR-046, BEH-BR-033), `dormant` and `stopping` dependents named (C-17); a dependency-loss stop under shutdown ends "gone" (U-01) (CCR-BR-032)
- 0.3 (2026-10-02): `DrainTimeout { id, leases, target? }` for every stopping operation; cascade drain limit runs while waiting, for a build step too; one parking rule; children removed before the parent's scope closes; stops take no `concurrency` slot (CCR-BR-008)
- 0.2 (2026-10-02): DrainTimeout names the plugin whose leases did not drain; cascade ordering cross-referenced (CCR-BR-006)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-07

`core/behaviors/07-replacement-and-reactivation.md`

- 0.5 (2026-11-08): BEH-BR-058 `restart` takes `HandoffCallOptions`; handoff on restart when declared (34, BEH-BR-353) (CCR-BR-025)
- 0.4 (2026-11-08): BEH-BR-049: branded generic overload and the `Plugin.Any | LazyPluginDefinition` overload (CCR-BR-022)
- 0.3 (2026-11-08): BEH-BR-049 points to state handoff on replace (CCR-BR-019)
- 0.2 (2026-10-02): Replace reservations end with an ended intent; `retry`/`enable` on a parked system stop, or one that parks while they wait, fail with `Conflict`; their unions gain `WouldDeadlock` (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-08

`core/behaviors/08-operation-legality.md`

- 0.20 (2026-11-11): "begun" counts also from the parent's activation failing (C6); BEH-BR-073 a take-over waits only for the stop step (drain, export), begins the removal as it ends, and the owning operation and queued calls are decided against the removal, `remove` completing and any other failing `UnknownPlugin` (H1, C2, C3); BEH-BR-074, BEH-BR-079, BEH-BR-080 a parent's cascade waits for a removal or take-over a sub-scope close or `unmount` began and neither removes nor resumes the child itself, only shutdown taking it over (C1); `background` and `whenAvailable` fibers inherit a scoped lease the forking fiber held (C8) (SPEC-AUDIT-09) (CCR-BR-041)
- 0.19 (2026-11-11): Intro, BEH-BR-074 and BEH-BR-080: a sub-scope close or `unmount` resumes a child stop parked outside its parent's stop only before the parent's stop has begun (from the parent becoming `stopping` or shutdown beginning) (C1); BEH-BR-073 the system stops include a child's removal by its sub-scope close or `unmount` (`reason` "remove", `next` "gone", a take-over included), bounded by `drainTimeout`, after the owning operation's stop step and build for a take-over (CL13) (SPEC-AUDIT-08); BEH-BR-071 the `starting` × `replace` cell states the held handoff value's outcome, and the account of when a held value is abandoned names a superseding call with `cold: true` (C6); BEH-BR-069 `Conflict.reason` "cold-mismatch" and BEH-BR-072 the `cold` mismatch fails with it (CL1) (SPEC-AUDIT-08) (CCR-BR-040)
- 0.18 (2026-11-11): BEH-BR-073 the account of how long a wait lasts names every no-caller cascade root, a child's sub-scope close or unmount included (CL8); BEH-BR-074 the lease that makes a sub-scope close or `unmount` leave a parent-parked child stop is one in the child's removal set (H1); BEH-BR-071 the `starting` cells keep a held handoff value unless the superseding call passes `cold: true`; BEH-BR-072 a join requires equal `cold`, a different one is `Conflict` (C7, C8) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.17 (2026-11-11): Intro and BEH-BR-080: a child's sub-scope close or unmount is the no-caller root of the cascades that stop the child's own dependents (CL3); BEH-BR-074 `stop-parked` and `stop-resumed` carry `realm`, `target` compared as `{ id, realm }` (CL5, CL6); BEH-BR-074 and BEH-BR-080 a child stop the parent's stop parked is left to that stop, not waited for, when the closing or calling fiber holds a lease on the child (H1) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.16 (2026-11-11): Intro: cascade roots name the refused background restart, and a child's sub-scope close or unmount resumes only a stop parked outside its parent's stop (H1, CL1, CL3); BEH-BR-074 and BEH-BR-080 a child stop the parent's stop parked is never resumed by its sub-scope close or unmount, which only wait, and their `intent-ended` and settling records take the mount or `unmount-requested` record as cause (H1, CL2); BEH-BR-079, BEH-BR-080 `DrainTimeout` carries `realm` (C2) (SPEC-AUDIT-05); BEH-BR-072 a `Conflict` cell or join is not submitted to the `RefusalList` at step 4b (C9) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.15 (2026-11-10): BEH-BR-066 the ordered check list names steps 4a (fingerprints) and 4b (refusal list) (CL3), and `ConfigInvalid` only for a value on a registration already loaded (C8); BEH-BR-074 the resume list and `stop-resumed` `by` name the sub-scope close and `unmount` of a child, with their drain limit; BEH-BR-080 such a resumption is not a cascade (C10) (CCR-BR-036)
- 0.14 (2026-11-10): BEH-BR-066 and BEH-BR-075 `shutdown`'s `WouldDeadlock` is the one decided before the `requested` record, with no record and no join; the carried references named (H1); BEH-BR-079 a refused background restart is a cascade root with no caller (C3) (CCR-BR-035)
- 0.13 (2026-11-10): BEH-BR-068 `replace` and `enable` complete on entering `dormant` too, and a row for a call whose start the `RefusalList` refuses after step 4b (completes on `disabled`, `completed` record, `start-refused` caused by its `requested` record) (H3); BEH-BR-073 names the system stop of a refused background restart, reason "refused-digest", `next` "disabled" (C5) (CCR-BR-034)
- 0.12 (2026-11-09): BEH-BR-071 `starting` row: a `restart` or `reconfigure` that supersedes a build keeps a held handoff value for the next build, and a call that arrives while a build imports handed-off state waits for the build step and is decided against the state it lands in (U-02) (CCR-BR-033)
- 0.11 (2026-11-09): BEH-BR-073 covers every system stop, the idle return of a lazy plugin (reason "idle", `next` "dormant") named (C-06); BEH-BR-075 every stop under shutdown ends "gone" or `failed(cleanup)` and nothing starts; BEH-BR-080 a resumed stop under shutdown unregisters the plugin (U-01) (CCR-BR-032)
- 0.10 (2026-11-08): BEH-BR-071 prose: `disabled` split by its reason (CCR-BR-026)
- 0.9 (2026-11-08): BEH-BR-071 gains the row "disabled (refused-digest)" (28, BEH-BR-267) (CCR-BR-026)
- 0.8 (2026-11-08): `unknown` row registers → `dormant` too; BEH-BR-065: realm turn for registrations into a realm and `retireRealm` (CCR-BR-022)
- 0.7 (2026-11-08): BEH-BR-071 gains the `dormant` row, failure phase "load" and the lazy `enable` outcome (CCR-BR-017)
- 0.6 (2026-10-03): `InstallError` among the named outcomes of BEH-BR-069; a child's parked removal resumed only by `remove` among operator calls (BEH-BR-125) in BEH-BR-073 and BEH-BR-074; a resumer's terminal `causationId` deferred to BEH-BR-200 (consistency pass) (CCR-BR-013)
- 0.5 (2026-10-02): Parked operations and parked system stops, resumption and interruption made total; cascade drain limit and bound; children removed; re-entrancy from builds and finalizers; second pass: one parking rule for a failing call, `intent-ended` record and `resumes` link, outcome after a resumed system stop, shutdown never parks, child→parent mount edges, stops take no slot, revert of every override change under an ended intent (CCR-BR-008)
- 0.4 (2026-10-02): Interruption before intent ends with a failed record; a parked call's records are final (findings G14, G15) (CCR-BR-007)
- 0.3 (2026-10-02): BEH-BR-078–080 added and BEH-BR-074 extended for cross-plugin stop ordering (CCR-BR-006)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-09

`core/behaviors/09-leases.md`

- 0.13 (2026-11-11): BEH-BR-086 a sub-scope finalizer never fails or waits on a lease of its closing fiber, and `unmount` fails with `WouldDeadlock` before any wait while the parent's operator-rooted stop removes the child (H1, H2, C1); the no-caller list names the stops of a child's own dependents during its sub-scope close or unmount (CL3); BEH-BR-085 the `drain-timeout` and `stop-parked` events carry `realm` (CL6) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.12 (2026-11-11): BEH-BR-086 a sub-scope close or unmount resumes only a child stop parked outside its parent's stop, never one the parent's stop parked, and fails with `WouldDeadlock` when its fiber holds a lease on the child while that stop is parked with an operator call (H1); the no-caller list names the refused `whenAvailable` re-run (CL3); BEH-BR-085 `DrainTimeout` carries `realm` and `target` as `{ id, realm }` (C2); BEH-BR-088 the fibers without `CurrentTransition` are those the host forks through `background` or `whenAvailable`, a `forkScoped` fiber following the untracked-fork rule (C1) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.11 (2026-11-10): BEH-BR-086 a sub-scope close or `unmount` that removes a child itself is a path with no caller, and one that waits for a removal the parent's stop began follows that stop's limits (H1); BEH-BR-088 `HeldPlugins` and `CurrentTransition` name plugins by the canonical key `JSON.stringify([realm, id])`, never a separator join, which two (realm, id) pairs could share since neither name has a grammar, `WouldDeadlock` carries `realm` (C1); an untracked fiber a step forks keeps `CurrentTransition` for life, a documented false positive (C2) (CCR-BR-036)
- 0.10 (2026-11-10): BEH-BR-088 builds, `load` and finalizers carry their plugin in the new `@bridger/core/CurrentTransition` reference, `HeldPlugins` keeps leases only, and `CurrentTransition` is exported for companions to carry across a hand-off on the rules of `HeldPlugins`; `shutdown` fails `WouldDeadlock` from `CurrentTransition` alone, before its `requested` record (H1); BEH-BR-084 the child inherits `CurrentTransition`; BEH-BR-086 a refused background restart is a no-caller revocation (C3) (CCR-BR-035)
- 0.9 (2026-11-09): BEH-BR-081–083 the unions of `use`, `useAll` and `lease` add `ResolutionRefused`, as BEH-BR-013 (C-01) (CCR-BR-032)
- 0.8 (2026-11-08): BEH-BR-087: a deadline shortens only a given per-call timeout, never `lease`; BEH-BR-088: `HeldPlugins` provided only with a holder's set (CCR-BR-022)
- 0.7 (2026-11-08): BEH-BR-087 lease wait shortened by `Annotation.Deadline` (CCR-BR-018); BEH-BR-088 `HeldPlugins` exported for companions (CCR-BR-020)
- 0.6 (2026-10-02): Builds and finalizers carry HeldPlugins (forks they await too, not fibers forked into the activation scope); WouldDeadlock rechecked at linearization and raised by `retry`/`enable`; DrainTimeout `id`/`target`, `leases` 0 while waiting on a build; one parking rule; no-caller cascades revoke (CCR-BR-008)
- 0.5 (2026-10-02): WouldDeadlock decided before any wait (ADR-BR-038) (CCR-BR-006)
- 0.4 (2026-10-02): Scoped-lease revocation mechanism stated (prototype finding G12) (CCR-BR-004)
- 0.3 (2026-10-02): Prototype finding on supervised-child interruption ordering (CCR-BR-003)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-10

`core/behaviors/10-runtime-failure-and-health.md`

- 0.7 (2026-11-08): BEH-BR-089: `EntitlementView` failure modes (one `watch` per activation, shared latest-wins, unbounded first element, ended port yields a stale state once); unwired mode `unmetered`, core-only mode `unknown` (CCR-BR-022)
- 0.6 (2026-11-08): BEH-BR-089 `Plugin.Runtime` gains `principal` and `asSelf` and `install` may fail with `ChildNotAllowed` (CCR-BR-018); `install` takes `Plugin.Any`, and the optional `EntitlementView` port with `Plugin.Runtime.entitled` (CCR-BR-020)
- 0.5 (2026-10-03): A phase-"cleanup" failure is left only by `remove` (consistency pass) (CCR-BR-013)
- 0.4 (2026-10-02): `Plugin.Runtime.install` also fails with `Conflict` and `HostClosed` (prototype finding G19) (CCR-BR-010)
- 0.3 (2026-10-02): An in-flight health check is interrupted when the stop begins (prototype finding G17) (CCR-BR-009)
- 0.2 (2026-10-02): Cascades with no caller drain under `drainTimeout` and revoke, never park; shutdown revokes only after its overall limit; an ended parked intent gets an `intent-ended` record (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-11

`core/behaviors/11-configuration.md`

- 0.2 (2026-10-02): An ended operator intent reverts every override change made under it, to the override before the first; the paths are recorded on its `intent-ended` record; a resuming `reconfigure` stores its override only when decided (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-12

`core/behaviors/12-shutdown-and-hosting.md`

- 0.12 (2026-11-10): BEH-BR-108 the wait for a running `reconcile`'s parent record applies only when an `AuditSink` is wired (C3); BEH-BR-108 and BEH-BR-110 a record lost in the close flush, and the shutdown's terminal record, are signalled by the error log and `Host.controls().auditPosition`, not by `CloseReport.auditDegraded`, which is produced before them (C5); BEH-BR-105 `WouldDeadlock` carries `realm` (C1) (CCR-BR-036)
- 0.11 (2026-11-10): BEH-BR-105 `shutdown`'s `WouldDeadlock` read from `CurrentTransition` only, after attribution and before the `requested` record (H1); BEH-BR-108 shutdown waits, bounded, for the parent terminal record of an in-flight `reconcile` before its report and terminal record, Settled note (C14); BEH-BR-109 a refused `shutdown` joins nothing (H1); BEH-BR-110 the union includes `WouldDeadlock` (H2) (CCR-BR-035)
- 0.10 (2026-11-10): BEH-BR-105 `shutdown` from a build, `load` or finalizer fiber of a plugin fails at once with `WouldDeadlock` and begins nothing; the Settled note limited to lease callbacks (C6) (CCR-BR-034)
- 0.9 (2026-11-09): BEH-BR-105 a `starting` plugin whose build has not begun is unregistered without a stop step when shutdown begins, like a `waiting` one, and gets no record of its own; every plugin shutdown moves through `stopping` gets its `system-stop` record (review of CCR-BR-032) (CCR-BR-033)
- 0.8 (2026-11-09): BEH-BR-105 once shutdown begins no plugin enters `starting` and no build or load begins, queued builds are cancelled, every stop ends "gone" (or `failed(cleanup)`), plugins with nothing to stop are unregistered in the first revision, Settled note; BEH-BR-109 the final snapshot defined (U-01) (CCR-BR-032)
- 0.7 (2026-11-08): BEH-BR-105 `dormant` plugins unregistered without a stop step (CCR-BR-017)
- 0.6 (2026-10-03): BEH-BR-106 `CloseReport.auditLastSeq?`, the highest `auditSeq` written when the report is produced; the shutdown's own terminal record comes after it and is read from `Host.controls` (prototype finding G34) (CCR-BR-014)
- 0.5 (2026-10-02): The scope-close path flushes the audit writer before it closes (prototype finding G18) (CCR-BR-009)
- 0.4 (2026-10-02): Shutdown resumes parked stops of any kind under its own limits; never parks; ends parked intents with an `intent-ended` record; stops take no `concurrency` slot (CCR-BR-008)
- 0.3 (2026-10-02): ManagedRuntime build forced with runtime.context() (CCR-BR-003)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-13

`core/behaviors/13-observability-and-diagnostics.md`

- 0.11 (2026-11-11): BEH-BR-114 `stop-resumed` `by` "sub-scope" or "unmount" only for a child stop parked outside its parent's stop (H1); BEH-BR-119 each registration is reported once, an event listener as `listener` only (CL9) (SPEC-AUDIT-05); `audit-degraded` lists the lost reconcile parent record, and none is emitted after the final snapshot (CL11, C3) (SPEC-AUDIT-05); `drain-timeout` and `stop-parked` name `target` by `{ id, realm }`, as `DrainTimeout.target` does (residual of C2) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.10 (2026-11-10): BEH-BR-119 `ActivePlugin` is typed `Option<ActivePlugin>` with `pluginId`, `realm` and a scoped `report` operation, the only way a registry built before the host reaches it; `report` publishes no event and does nothing after the activation ends (C12) (CCR-BR-036)
- 0.9 (2026-11-10): BEH-BR-114 `stop-resumed.by` gains "sub-scope" and "unmount" for a child stop resumed by its sub-scope close or `Plugin.Runtime.unmount` (C13) (CCR-BR-035)
- 0.8 (2026-11-10): BEH-BR-114 `Generation` joins the helpers that publish on their own streams, never on `Host.events` (C7) (CCR-BR-034)
- 0.7 (2026-11-08): `plugin-idled` and `held-event-dropped` events (27, BEH-BR-251, BEH-BR-252) (CCR-BR-024); `reconcile-partial` event (32, BEH-BR-324) (CCR-BR-025)
- 0.6 (2026-11-08): `hook-breaker` and `family-eviction` leave `HostEvent`; helpers outside the `Host` publish on their own streams (CCR-BR-022)
- 0.5 (2026-11-08): `plugin-triggered` event, `contracts` and `manifest` in `PluginInspection` (CCR-BR-017); `child-refused` and `resolution-refused` events, BEH-BR-119 `ActivePlugin` is not the principal (CCR-BR-018); `hook-breaker`, `family-eviction`, `handoff-imported` and `handoff-lost` events (CCR-BR-019)
- 0.4 (2026-10-02): `parked`/`pending` (with `requestedRecordId?`) in inspection; `stop-parked` (one per parked stop, `target` from the one failing call), `stop-resumed`; `drain-timeout` `pluginId`/`target`; ended intents shown by the `intent-ended` record (CCR-BR-008)
- 0.3 (2026-10-02): Sliding PubSub lag confirmed per subscriber (CCR-BR-003)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-14

`core/behaviors/14-children-and-groups.md`

- 0.15 (2026-11-11): BEH-BR-121 "the parent's stop has begun" counts from the parent becoming `stopping` or shutdown beginning, whichever comes first, and from then the child's stop is the parent's stop's or shutdown's, whose limits a sub-scope close or `unmount` never shortens; a stop begun outside the parent's stop is any stop the parent's stop or shutdown did not begin, the child's own system stop included; the take-over never cancels the owning operation and waits for its stop step under `drainTimeout` and for a build it then runs under `buildTimeout` (bound `drainTimeout` + `buildTimeout`), then removes a child still registered; a child whose cleanup fails during any of these removals stays `failed` (cleanup), the sub-scope close logs it, `unmount` fails with `CleanupError`, a re-mount fails `DuplicatePlugin` until an operator `remove`; BEH-BR-125 the resumer list carries "before the parent's stop has begun"; BEH-BR-126 `unmount` also refuses on `CurrentTransition`, adds `CleanupError` to its union, and fails `HostClosed` once the host has closed, waiting under shutdown's limits while shutdown runs (H1, C1, C2, C3, CL5, CL11) (SPEC-AUDIT-08) (CCR-BR-040)
- 0.14 (2026-11-11): BEH-BR-126 the dependents a sub-scope close stops first take the child's mount record as cause (SPEC-AUDIT-07 residual of round 6); BEH-BR-121 defines the child's removal set (the child and its dependents, transitively, the set BEH-BR-088 guards), a held lease (its own or inherited from the forking fiber, "or a fiber it awaits" removed) and "the parent's stop has begun" (from the revision in which the parent becomes `stopping`); the finalizer's lease check covers the whole removal set; a stop begun outside the parent's stop and still draining is taken over as a no-caller cascade takes over a dependent's running step, under `drainTimeout` counted from meeting it; BEH-BR-126 `unmount` fails with `WouldDeadlock` at the call whenever the caller holds a lease in the removal set, otherwise waits under the limits of the removal it joins or begins, and writes `unmount-requested` only when it begins or takes over a removal (H1, C1, C3, C4, C5, CL7) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.13 (2026-11-11): BEH-BR-121 a sub-scope finalizer never fails and never waits on a lease held by the closing fiber or a fiber it awaits: read from its `HeldPlugins` at the start, such a lease makes it hand a removal it would run itself (or a resumption of a stop parked outside the parent's stop) to the host as a removal with no caller, forked outside the closing fiber, leave a removal the parent's stop began to that stop, log a warning naming the child, and close with the child still registered until the removal settles; the "finalizer MUST fail with `WouldDeadlock`" rule removed; BEH-BR-126 `unmount` fails with `WouldDeadlock` at the call, before any wait, when the parent's operator-rooted stop has begun removing the child (draining or parked) and the caller holds a lease on it (H1, H2, C1); BEH-BR-122 `parentId` is the parent's `{ id, realm }` (C5) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.12 (2026-11-11): BEH-BR-121 a child stop the parent's stop parked stays the parent's: the sub-scope finalizer only waits, never resumes or revokes, and fails with `WouldDeadlock` when the closing fiber holds a lease on the child while that stop is parked with an operator call; the bound by `drainTimeout` and the revocation of the closing fiber's lease apply only to a removal the finalizer begins itself; resume-and-revoke applies only to a stop parked outside the parent's stop, showing `reason` "remove"; BEH-BR-125 the resumer list says so; BEH-BR-126 `unmount` waits the same way and may fail with `WouldDeadlock` (H1) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.11 (2026-11-10): BEH-BR-121 the wait of a sub-scope finalizer or `unmount` on a removal the parent's stop began follows that stop's limits — parks with an operator call at its root, waits for the overall limit under shutdown, revokes at `drainTimeout` only on a path with no caller; BEH-BR-126 `unmount` waits the same way (H1) (CCR-BR-036)
- 0.10 (2026-11-10): BEH-BR-121 the wait of a sub-scope finalizer or `unmount` on a removal the parent's stop began is bounded by `drainTimeout`, then revokes; the resumption emits `stop-resumed` with `by` "sub-scope" or "unmount"; BEH-BR-126 `unmount` waits the same bound; BEH-BR-125 the list of what resumes a parked child stop names the sub-scope close and `unmount` (C11, C13) (CCR-BR-035)
- 0.9 (2026-11-10): BEH-BR-121 a sub-scope close or `unmount` resumes a parked child stop, ends its parked intent, revokes at `drainTimeout` and never parks, with causes the mount or `unmount-requested` record (C8); BEH-BR-127 `Plugin.group` error type is the mount errors, not `never` (audit round 2, Low) (CCR-BR-034)
- 0.8 (2026-11-09): BEH-BR-126 the mount record's `after.state` may be `starting`, the state a child with nothing missing is registered in, with its activation's `system-start` caused by the mount record (C-05) (CCR-BR-032)
- 0.7 (2026-11-08): BEH-BR-121 a refused digest refuses the mount (`ChildNotAllowed`); BEH-BR-126 `Plugin.Runtime.unmount`, an attributed child removal recorded by `unmount-requested` with `requestedBy` (G57) (CCR-BR-026)
- 0.6 (2026-11-08): BEH-BR-121: the sub-scope finalizer waits for the removal, a held lease is revoked at the limit, a removal begun by the parent's stop takes precedence (CCR-BR-022)
- 0.5 (2026-11-08): BEH-BR-121 a lazy child refused with `InvalidDefinition` (CCR-BR-017); BEH-BR-121 `ChildNotAllowed` and BEH-BR-122 mandatory interceptions always inherited (CCR-BR-018); BEH-BR-121 sub-scope mount removed when the sub-scope closes, BEH-BR-126 its `system-stop` record, `Plugin.Any` in `Plugin.Runtime.install` and BEH-BR-127 group members (CCR-BR-020)
- 0.4 (2026-10-03): A child's parked removal is also resumed by a cascade of another of its providers, as BEH-BR-080 gives it (consistency pass) (CCR-BR-013)
- 0.3 (2026-10-02): No mount once the parent's stop or shutdown has begun; a parked child removal resumes only as a removal; mount and activation records; a parent awaiting a child in its build can starve for a slot; a group member's install error fails the group with phase "build" (prototype findings G19–G22) (CCR-BR-010)
- 0.2 (2026-10-02): Child install fails with `DependencyCycle` (mount edges child→parent); children removed as dependents before the parent's scope begins to close, whatever they hold; a parked child operation ends; child causation per BEH-BR-190; shutdown never parks (CCR-BR-008)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-16

`core/behaviors/16-event-bus.md`

- 0.15 (2026-11-22): BEH-BR-138 an event key carries its dispatch mode (`Event.make(id, { mode })`); BEH-BR-139 `on` serves `emit`, `parallel` and `serial` keys and `around` serves `waterfall` keys only; BEH-BR-141 to 143 each dispatcher accepts only its own mode; a mismatch is a compile error, and for an untyped caller a defect naming the event (improvement report 04, R1)
- 0.14 (2026-11-11): BEH-BR-140 the listener-list registries are made with `report: false` (CL4) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.13 (2026-11-11): BEH-BR-140 the registries holding listener lists report nothing; the bus reports each listener once (CL9) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.12 (2026-11-10): BEH-BR-139 listener ownership is reported through `ActivePlugin.report` (C12) (CCR-BR-036)
- 0.11 (2026-11-10): BEH-BR-144 `serial`, `parallel` and `waterfall` listeners inherit `CurrentTransition` beside `HeldPlugins`; `emit` does not await its listeners, so they carry none (H1) (CCR-BR-035)
- 0.10 (2026-11-10): BEH-BR-140 each listener registry is made with the host's `BridgerOptions.drainTimeout` (C11) (CCR-BR-034)
- 0.9 (2026-11-09): BEH-BR-137 `Bridger.Events` cannot be provided in any resolution scope and no realm may isolate it (`InvalidRealm`) (C-02) (CCR-BR-032)
- 0.8 (2026-11-08): BEH-BR-144: listeners run with the dispatcher's `CurrentCorrelation` (CCR-BR-026)
- 0.7 (2026-11-08): BEH-BR-141: the event that applies an `OnEvent` trigger is held for the plugin it wakes and delivered once, with `emit` semantics, to that plugin's `on` listeners when it becomes `active` (27, BEH-BR-251); the dispatch reads the emitter's principal for the `lazy-triggered` record (27, BEH-BR-253) (CCR-BR-024)
- 0.6 (2026-11-08): BEH-BR-141: `OnEvent` triggers apply only after the emit access decision allows the dispatch (CCR-BR-022)
- 0.5 (2026-11-08): BEH-BR-141 dispatch applies `OnEvent` triggers without redelivery (CCR-BR-017); BEH-BR-139/141 consult a wired `AccessPolicy`, BEH-BR-144 listener principal and "events" annotations (CCR-BR-018); BEH-BR-143 points to hook points (CCR-BR-019)
- 0.4 (2026-10-02): A listener withdrawn after a dispatch began, before its turn, fails the dispatch like one interrupted (prototype finding G32) (CCR-BR-011)
- 0.3 (2026-10-02): A listener interrupted by its plugin's removal fails a `parallel`, `serial` or `waterfall` dispatch with a defect and is not reported by `emit` (prototype finding G23) (CCR-BR-010)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-17

`core/behaviors/17-realms-and-interception.md`

- 0.2 (2026-10-02): A child's own `intercept` replaces the interceptions it inherits; realm interceptors are never inherited; composition order restated (prototype finding G24) (CCR-BR-010)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-18

`core/behaviors/18-reconciliation-and-confluence.md`

- 0.11 (2026-11-10): BEH-BR-156 edges on a cycle of the change phase are ignored for the order (list order) and the entry closing the cycle is rejected with `DependencyCycle` (C9); BEH-BR-157 shutdown during a non-atomic `reconcile` issues no further action and fails with `HostClosed`, parent record `failed` (C10) (CCR-BR-034)
- 0.10 (2026-11-09): BEH-BR-153 `IncompatibleContract` and `IncompatibleEngine` reach the report as `InstallError` members, and a plan names each by its own tag (C-07) (CCR-BR-033)
- 0.9 (2026-11-08): BEH-BR-154 the diff reads the operator's `disabled` flag, a "refused-digest" registration counts as not disabled; BEH-BR-155 atomic undo removals use the prune options whatever `prune` is; BEH-BR-159 idempotence after a run with no rejection, refused entries retried; BEH-BR-160 refusal-list answers are history like failure (agent review R1-07, R1-11) (CCR-BR-029)
- 0.8 (2026-11-08): BEH-BR-160 lazy registrations compared with `dormant` and `active` as one class; eager registrations compared exactly (host-core prototype finding G-P7) (CCR-BR-028)
- 0.7 (2026-11-08): BEH-BR-153 `DesiredPlugin.mandatoryInterceptions` and `allowChildren`, `BridgerOptions.mandatoryCatalog`, `ReconcileOptions.atomic`, `PolicyMismatch`, `ApplyRolledBack` and `PartialApply`; BEH-BR-154 policy compared, never changed in place; BEH-BR-156 entries ordered by dependency (removals dependents first, other changes providers first), closing gap G36; BEH-BR-157 and 158 atomic apply and undo operations; acceptance checks 98 and 101 (CCR-BR-025)
- 0.6 (2026-11-08): BEH-BR-154: lazy identity `meta` (digest supplied beside the manifest); BEH-BR-153/155: `pruneDrain` and `pruneForce` (CCR-BR-022)
- 0.5 (2026-11-08): BEH-BR-153 `DesiredPlugin.plugin` accepts lazy definitions, BEH-BR-154 lazy definitions compared by manifest `version` and `digest` without loading (CCR-BR-017); BEH-BR-153 `expect` and `PlanStale`, BEH-BR-156 diff shared with `Host.plan`, BEH-BR-158 a stale plan applies nothing (CCR-BR-019); BEH-BR-153 `plugin: Plugin.Any` (CCR-BR-020)
- 0.4 (2026-10-03): `ConfigFingerprintUnavailable` added to the per-entry `rejected` reasons; entry actions that install with `config` or reconfigure with a value run step 4a of BEH-BR-188 on their own (CCR-BR-014)
- 0.3 (2026-10-02): A reconcile's intent is recorded with its parent `requested` record; interruption after that ends only the caller's wait; `requireReason` checked on a provisional diff at step 2 and again on the diff recomputed at the intent, failing with a recorded `ReasonRequired` (CCR-BR-008)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-19

`core/behaviors/19-contribution-registry.md`

- 0.3 (2026-11-08): BEH-BR-162 `Options.contract` and `range`, `implements` on `add`, `version` and `methods` on view entries, `within(range)` reader; BEH-BR-163 contract check on `add` (26, BEH-BR-233); BEH-BR-165 entries carry their declared version; BEH-BR-168 `Selector` range (CCR-BR-025)
- 0.2 (2026-11-08): BEH-BR-163 `add` consults a wired `AccessPolicy` (CCR-BR-018); BEH-BR-168 points to `Selector` and hook points (CCR-BR-019)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)                

## BRIDGER-BEH-21

`core/behaviors/21-testing-host.md`

- 0.26 (2026-11-11): check 88 a superseding `restart` or `reconfigure` keeps the held value only without `cold: true`; check 103 the `cold` mismatch `Conflict` carries `reason` "cold-mismatch" and `inspect().pending.cold` shows the operation's `cold` (C6, CL1); `step` advances a stop parked outside the parent's stop on a sub-scope close or `unmount` only before the parent's stop has begun (C1); check 89 adds take-overs of an unforced `restart`, a `replace` and a runtime-failure stop of the child (waiting for the build, bound `drainTimeout` + `buildTimeout`), shutdown begun while the parent builds, `unmount` refused on `CurrentTransition`, a child cleanup failure (`failed` (cleanup), `CleanupError`, `DuplicatePlugin` on re-mount) and `HostClosed` after close (H1, C2, C3, CL5, CL11); check 49 leaves `scope` out of the snapshot comparison (CL10) (SPEC-AUDIT-08) (CCR-BR-040)
- 0.25 (2026-11-11): check 89 covers a lease on a dependent of the child and an inherited lease, `unmount` refused with the parent active, its stop draining, parked or rooted in a runtime failure, no record on a refused or joining `unmount`, the window after the parent becomes `stopping`, and the take-over of a draining outside stop (H1, C1, C3, C4, C5, CL7); check 57 `CloseTail.auditDegraded` for a terminal, `rejected` or system record or the shutdown's `requested` record unwritten at the flush's end, numbered or not (CL10, CL1); check 83 `expect` compares `cold` (C8); check 103 the `cold` join and supersede outcomes and no host event for a skip (C7, CL5) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.24 (2026-11-11): check 103 a `cold: true` skip writes one `handoff` record with `cold: true`, and `cold` is on the gate request and the call's records (C7) (SPEC-AUDIT-06); check 89: with a lease on the child held by the closing fiber the finalizer neither fails nor waits, and `unmount` fails with `WouldDeadlock` before any wait while the parent's operator-rooted stop drains or is parked (H1, H2, C1) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.23 (2026-11-11): BEH-BR-178 a parked child stop advances on its sub-scope close or unmount only when parked outside its parent's stop (H1); `PendingStep.waiter` is `{ id, realm }` and `stepPlugin` matches id and realm (CL13); check 89 asserts the wait-only rule and the `WouldDeadlock` of a lease-holding closing fiber (H1); check 45 `DrainTimeout` carries `realm` (C2) (SPEC-AUDIT-05); check 57 `lastNumbered` and `closed`; check 75 `useOptional`'s timeout; check 79 an unawaited `settle`; check 86 `InvalidRealm` before any host call; check 103 `cold` on `replace` and `reconcile` (C5, C3, CL12, C8, C7, H9) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.22 (2026-11-10): BEH-BR-178 a parked child stop also advances when its sub-scope closes or `unmount` is called (C10); check 89 asserts `stop-resumed` `by` "sub-scope"/"unmount" and that a sub-scope finalizer or `unmount` waiting on the parent's stop follows that stop's limits (H1) (CCR-BR-036)
- 0.21 (2026-11-10): check 48: `shutdown` from a build or finalizer fails `WouldDeadlock`, from a lease callback proceeds (H1); check 84: a plugin failing or refused after a member's wait expired marks it "failed", and `use` reports the member's reason (C9; Low); check 86: a failed teardown or undo step, `retireRealm` refused and `HostClosed` included, stops and leaves the realm (C10); check 98: a cycle-closing entry is a validation-stage rejection (C7); check 100: latch and shutdown before any completed forward action end in `ApplyRolledBack` (C15; Low) (CCR-BR-035)
- 0.20 (2026-11-10): check 53: a generation's forced revocation is a `GenerationRevoked` on its own feed, not a host event (C7); BEH-BR-177 `TestHost` implements files 02–20 and 22–34 (audit round 2, Low); check 38 compares values drawn from `IdGenerator` by order of first appearance (C12); check 83 covers a changed incoming version, digest or consent diff (H2); checks 70, 73 and 76 cover files 02–20 and 22–34 (review of CCR-BR-034) (CCR-BR-034)
- 0.19 (2026-11-09): BEH-BR-179 the counter is unique within one `TestHost`, and `TestHost`s whose records meet in one sink need distinct prefixes (F-03); checks 59 (local contracts, `descriptor.local`), 65 (a loaded definition breaking BEH-BR-003 fails phase "load" with `InvalidDefinition`), 83 (the plan's rejection tags), 84 (member readiness, timeout and the next `use`), 86 (`EphemeralRealm.use` is `Host.useAll`), 87 (handoff on `restart` and `reconfigure` under `alsoOn`, the stop's final step, principal, annotations, lazy registrations), 88 (a superseded build keeps the held value; a call during the import waits) and 112 (`CrossingInfo.disclosed`) amended; check 114 added (identifier uniqueness); check 8: a plugin whose build is queued when shutdown begins is unregistered without a stop step or record (CCR-BR-033)
- 0.18 (2026-11-09): Checks 4 (idle return under BEH-BR-073), 8 (shutdown: no start, cancelled and discarded builds, destination "gone", final snapshot), 9 and 24 (dependents' exceptions; undeclared keys of the optional members), 26 (base key in an isolating realm, `InvalidRealm`, failing `wrap` after activation), 27 (`enable` precedence, `replace` of a disabled plugin), 51 (mount record in `starting`) and 103 (`PluginHandle.restart` options) amended (BEH-BR-183, BEH-BR-184) (CCR-BR-032)
- 0.17 (2026-11-09): `memoryAuditSink` keeps a different record under a stored `recordId` beside the first, following BEH-BR-193 (CCR-BR-031)
- 0.16 (2026-11-08): Checks amended for the host-core prototype third pass: 83 (prune drain and force compared only when they take effect, G-P23), 92 (link without `hostId`, wait to the end of a non-empty window, G-P20, G-P21), 96 (a discarded successful build drops "ended", G-P19), 97 (kept trigger not in `triggered`, G-P22), 99 (half-finished two-action undo step, G-P24) (CCR-BR-030)
- 0.15 (2026-11-08): Checks amended for the round-2 agent review and prototype second pass: 72 (`Grant.all` layer with `changes`, G-P13), 92 (idling and refused declarations, owner matching, `HostLink.none`, failed reads, wake window, long waking), 96 (held-event drop reason during a load, G-P14), 97 (registry holds not idle conditions, G-P17), 99 (multi-action undo, override restore, prune options, refused digests), 104 (refused-digest and the reconcile diff, plan) (CCR-BR-029)
- 0.14 (2026-11-08): Checks amended for the resolutions of the host-core prototype findings G-P1..G-P12: 49 (lazy registrations in the confluence comparison), 59 (`serviceKey`), 60 (`disabled: true`), 62 (`consentDiff` shapes), 63 (`range` with `version`), 79 (`settle` outcomes), 83 (decoded paths, host-level mismatches), 86 (delimiter rule), 92 (empty wake window, woken while `starting`, `make` refusal), 108 (which records carry `sanitized`) (CCR-BR-028)
- 0.13 (2026-11-08): BEH-BR-184 checks 112 (call-log kind "dispatch", string epochs) and 113 (registry entry owner, `HoldRevoked` feed) (CCR-BR-027)
- 0.12 (2026-11-08): Check 64 amended, checks 92–97 (CCR-BR-024); checks 98–103 (CCR-BR-025); `memoryCallLog` `onFailure` and `queue`, `scriptedRefusalList` fixture, check 79 renamed to `policy` and covers `settle`, checks 104–111 (CCR-BR-026)
- 0.11 (2026-11-08): check 22 (generation `changes` and `view`); checks 63, 65, 66 (lazy digest, not-yet-loaded `reconfigure`, `methods`); copies of checks 67, 68, 70, 75 and 76 aligned with files 28 and 30; checks 77, 79, 81, 83 and 85 aligned with files 31–33; check 91 (entitlement failure modes, mode `unmetered`) (CCR-BR-022)
- 0.10 (2026-11-08): Acceptance checks 59–66 (CCR-BR-017), 67–76 (CCR-BR-018), 77–88 (CCR-BR-019) and 89–91 (CCR-BR-020); `Fault.loadFails` and `Fault.handoffFails`; scripted `AccessPolicy`, `CapabilityPolicy` and `Gate<Req>` fixtures, in-memory `CallLog` fixture and `heldHandoff` (CCR-BR-017, CCR-BR-018, CCR-BR-019)
- 0.9 (2026-10-03): Acceptance checks 55–58: configuration fingerprints at step 4a and equal in request and records, a fail-closed fingerprinter, `Host.controls` with the audit position and `CloseReport.auditLastSeq`, the presented definition on `requested` and `rejected` records (CCR-BR-014)
- 0.8 (2026-10-03): A parked stop does not count against `awaitIdle`; acceptance checks 23 (children removed as dependents) and 41 (`crypto.getRandomValues()`, the one `IdGenerator` exemption) follow their behaviours (consistency pass) (CCR-BR-013)
- 0.7 (2026-10-03): A held step counts against `awaitIdle`; acceptance check 6 extended (prototype finding G33) (CCR-BR-012)
- 0.6 (2026-10-02): The scheduling seam; `pending` at a settlement point; `awaitIdle` on a TestHost; the scope-close path runs on its own; faults through the TestHost's entry points; acceptance checks 53–54, check 52 extended (prototype findings G27–G32) (CCR-BR-011)
- 0.5 (2026-10-02): Acceptance checks 49–52 from the P4 prototype findings G19–G25 (CCR-BR-010)
- 0.4 (2026-10-02): Deterministic pending order, `pending` and `stepPlugin`; `PendingStep` owner, waiter and correlation; acceptance checks 45–48, check 45 split in two tests, check 33 reworded (CCR-BR-008)
- 0.3 (2026-10-02): Acceptance checks 43–45 for cross-plugin stop ordering (CCR-BR-006)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-22

`core/behaviors/22-attributable-operations.md`

- 0.14 (2026-11-10): BEH-BR-190 a refused `whenAvailable` re-run is a refused background restart among the cascade roots (C11) (CCR-BR-036)
- 0.13 (2026-11-10): BEH-BR-186 `shutdown`'s union includes `WouldDeadlock` (H2); BEH-BR-188 `shutdown` makes its `WouldDeadlock` check before step 6, writing no record and joining nothing, Settled note (H1); BEH-BR-190 a refused background restart as a cascade root (C3), and causation of a child's resumed stop and `intent-ended` record on a sub-scope close or unmount (C12); BEH-BR-187 and BEH-BR-192 the `HookDecisionRecord.correlationId` is the third exception (C5) (CCR-BR-035)
- 0.12 (2026-11-10): BEH-BR-187 and BEH-BR-192: a call's `correlationId` alone may appear in `inspect().pending` and in a `PartialApply`'s error log and `reconcile-partial` event, and nowhere else (H1); BEH-BR-192 unwired equivalence covers files 02–21 and 26–34 (audit round 2, Low); the GxP companion is cited as a Draft, not as specified later (C20); BEH-BR-192's "to nothing else" names the two correlation exceptions (review of CCR-BR-034) (CCR-BR-034)
- 0.11 (2026-11-09): BEH-BR-187 a handoff's `export`, `upgrade` and `import` run with `CurrentActor` reset and an empty annotation bag, `export` with the correlation of its stop and `upgrade` and `import` with that of the build (U-04) (CCR-BR-033)
- 0.10 (2026-11-09): BEH-BR-186 table: `restart`, `reconfigure` and `PluginHandle.restart` take `HandoffCallOptions`, as BEH-BR-013 (C-01) (CCR-BR-032)
- 0.9 (2026-11-08): BEH-BR-185 `sanitized: true` on the call's `requested`, `rejected` and terminal records; a system record the call causes carries the replaced correlation and is flagged only for its own replacements (host-core prototype finding G-P12) (CCR-BR-028)
- 0.8 (2026-11-08): `SystemTransition` gains "start-refused"; lone surrogates replaced in recorded strings (G59); BEH-BR-187 `CurrentCorrelation`, the default correlation of a call and of the work it causes (G58); BEH-BR-188 step 4b, the `RefusalList`; BEH-BR-190 causes of `start-refused` and the attributed child unmount (`requestedBy`, G57); BEH-BR-192 the correlation reaches the call log (CCR-BR-026); `lazy-idle`, root `lazy-triggered` records carry `onBehalfOf`, `Host.wake` reads the caller's principal (CCR-BR-024)
- 0.7 (2026-11-08): `Host.wake` classified (not mutating, not read-only); step 4 and 4a: `reconfigure` of a registration not yet loaded is not decoded and uses form "raw"; BEH-BR-190: a child removed by its sub-scope is caused by its mount record; BEH-BR-192 heading names the call log (CCR-BR-022)
- 0.6 (2026-11-08): `SystemTransition` gains `lazy-triggered` and its cause (CCR-BR-017); `OperationContext.annotations`, annotation resolution and empty bags at plugin entry points, `onBehalfOf` and annotations at step 2, `CurrentPlugin` never an actor, the actor also reaches the `CallLog` (BEH-BR-185, 187, 188, 190, 192; CCR-BR-018); `retireRealm` (thirteen operations), `plan` read-only, `handoff` system transition, `Actor.narrow` a caller-invoked derivation (BEH-BR-185, 186; CCR-BR-019)
- 0.5 (2026-10-03): BEH-BR-188 step 4a — configuration fingerprints from the optional `ConfigFingerprinter` port, after validation and before the gate: when the port is called and never called, `select` before `fingerprint`, only selected values handed over, no attribution to the port, validation of the answer, `fingerprintTimeout`, fail-closed `ConfigFingerprintUnavailable` with a core-written message, interruption outcome, stored fingerprints reused without calling the port; BEH-BR-192 attribution never reaches the fingerprinter, and an unwired fingerprinter changes nothing; BEH-BR-186 `controls` added to the read-only operations; fingerprints ordered by `configChange.paths`, whatever order the port answers in (CCR-BR-014, CCR-BR-015)
- 0.4 (2026-10-02): Interruption outcome per stage of the call order; approval-to-`requested` passage uninterruptible; record-only `Interrupted` wins over a later `AuditUnavailable`; `WouldDeadlock` checked before any wait and at the linearization point; resumption of a parked stop is the call's intent; causation of system records in cascades; second review pass: `SystemTransition` "intent-ended" and its cause; a child's removal caused by the cascade root's record; pre-intent waits are a running system stop and the call's turn only; a `requested` record dropped for overflow fails the call at once (CCR-BR-008)
- 0.3 (2026-10-02): Interruption before intent is allowed and ends with a failed (Interrupted) record (prototype finding G14) (CCR-BR-007)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-23

`core/behaviors/23-audit-sink-and-record.md`

- 0.18 (2026-11-11): BEH-BR-199 `unmount-requested` each time an unmount begins or takes over a child's removal, never for a refused or joining unmount (C5); the `lease-revoked` no-caller list names the take-over of a stop begun outside the parent's stop, draining or parked (C4); BEH-BR-199 `handoff` also once per handoff skipped or abandoned by a `cold: true` call (CL5); BEH-BR-208 `shutdown`'s own `requested` record lost in the close flush sets `CloseTail.auditDegraded`, the error log alone covering any other never-numbered `requested` record (CL1) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.17 (2026-11-11): BEH-BR-205 a terminal, `rejected` or system record still unwritten when the close flush ends sets the latch whether numbered or not; BEH-BR-208 the close-flush loss of such a record shown by `CloseTail.auditDegraded`, the error log alone only for a never-numbered `requested` record (C2) (SPEC-AUDIT-06); BEH-BR-195 `AuditRecord.cold`, on the records of a call that passes `cold: true` and on the `handoff` record of the skip it causes (core 34, BEH-BR-350, BEH-BR-353) (C7) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.16 (2026-11-11): BEH-BR-199 the `lease-revoked` paths name the refused background restart and a child's sub-scope close or unmount, which end an intent only for a stop parked outside the parent's stop (H1, CL3) (SPEC-AUDIT-05); BEH-BR-205 during shutdown, after the final snapshot, the latch is set without a snapshot or event and reported by `Host.controls().closed` (C3); BEH-BR-208 a close-flush loss signalled by `CloseTail`, never-numbered records by the log only (C5) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.15 (2026-11-10): BEH-BR-195 `definition` is exempt from the never-empty rule, present as `{}` on a `requested` or `rejected` record whose definition declares neither `version` nor `digest` (G4); BEH-BR-205 the latch triggers name a running `reconcile`'s parent record lost at shutdown (C4); BEH-BR-208 a record lost in the close flush is signalled by the error log and `auditPosition`, not `CloseReport.auditDegraded` (C5) (CCR-BR-036)
- 0.14 (2026-11-10): BEH-BR-198 a `shutdown` refused with `WouldDeadlock` writes no record (H1), a step-4a failure none and a step-4b refusal one `rejected` record (audit round 3, Low); BEH-BR-199 `intent-ended` on a sub-scope close or unmount, with its `causationId` (C12) (CCR-BR-035)
- 0.13 (2026-11-10): BEH-BR-199 `system-stop` also for a stop that settles into `dormant` (a `replace` with a lazy definition; an idle return stays `lazy-idle`) (C15); BEH-BR-194 unwired equivalence covers files 02–21 and 26–34 (audit round 2, Low); BEH-BR-201 `children` counts the entry and undo actions that wrote a record of their own, step-4b refusals included (audit round 2, Low); the GxP companion is cited as a Draft (C20) (CCR-BR-034)
- 0.12 (2026-11-09): BEH-BR-193 a different record under a stored `recordId` is a breach of the uniqueness rule of BEH-BR-210; the keep-or-refuse rule stays as its detection, since a sink cannot verify a generator (F-03); BEH-BR-199 a plugin that shutdown unregisters without a stop step gets no `system-stop` (BEH-BR-105) (CCR-BR-033)
- 0.11 (2026-11-09): BEH-BR-199 a mount record's `after.state` is the child's registration state, `starting` included, and only the activation of a child registered `starting` is caused by it (C-05) (CCR-BR-032)
- 0.10 (2026-11-09): BEH-BR-193: only an equal record under a stored `recordId` is an idempotent repeat; a different record under it is kept beside the first or refused, never dropped while reporting success (audit finding, raised by CCR-GX-002) (CCR-BR-031)
- 0.9 (2026-11-08): BEH-BR-196 which records carry `sanitized: true`: the call's own records, and a system record only for a string replaced as it is written (host-core prototype finding G-P12) (CCR-BR-028)
- 0.8 (2026-11-08): BEH-BR-195 `auditDropped` on every record (G54), `sanitized` (G59), `requestedBy`, transitions "start-refused" and "unmount-requested", Settled (6); BEH-BR-196 their rules and the lone-surrogate replacement; BEH-BR-199 the two new system records and the correlation of a root record from the fiber (G58); BEH-BR-202 `auditDropped` stamped at numbering (CCR-BR-026); `lazy-idle`, `onBehalfOf` on root `lazy-triggered` records (CCR-BR-024); BEH-BR-195 `undoes`; BEH-BR-201 records of an atomic apply's undo (CCR-BR-025)
- 0.7 (2026-11-08): BEH-BR-197: paths of a `reconfigure` on a registration not yet loaded; BEH-BR-199: sub-scope child removal named (CCR-BR-022)
- 0.6 (2026-11-08): BEH-BR-195 `trigger`, "lazy-triggered", state "dormant", failure phase "load" in BEH-BR-199 (CCR-BR-017); `onBehalfOf`, `annotations`, `annotationsOmitted`, none on system records (CCR-BR-018); "handoff" and "retireRealm", `target` of `retireRealm`, handoff records in BEH-BR-199 (CCR-BR-019); `schemaVersion` stays 1 on pre-release ground (Settled 5)
- 0.5 (2026-10-03): BEH-BR-195 `configChange?: ConfigChange` with optional `fingerprints`, and `definition?` on the `requested` and `rejected` records of plugin-addressed operations, both folded into `schemaVersion: 1` under the pre-release rule (Settled (4)); BEH-BR-197 the one exception for fingerprints returned by the consumer's `ConfigFingerprinter` (subset of the paths, same order, absent when the change removes the override, stored fingerprints on `intent-ended` and resumer records), core still computes no hash; BEH-BR-199 and BEH-BR-200 carry the stored fingerprints with the paths (CCR-BR-014)
- 0.4 (2026-10-02): `AuditRecord.endsIntentOf` and `resumes` (record ids of the parked call's `requested` record); system record `intent-ended`, written when a cascade or shutdown ends a parked intent and carrying the reverted `configChange` paths (not the `system-stop`); record-only `Interrupted` and first-terminal-cause precedence; resumption of a parked operation writes `completed` or `failed`, not `joined` or `superseded`, with `resumes` and the stored override's paths; a `requested` record dropped for overflow fails the call at once with no terminal record; `noop` on a `children: 0` parent record only when `completed`; revocation on paths with no caller (CCR-BR-008)
- 0.3 (2026-10-02): Acknowledgement waits for the drained backlog (prototype finding G13) (CCR-BR-005)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-24

`core/behaviors/24-time-ids-and-sequence.md`

- 0.6 (2026-11-09): BEH-BR-210 every value an `IdGenerator` returns is unique within its host and across every host whose identified outputs reach a common store; a provided generator carries that obligation, the default meets it with high probability only, and the testing counter within one `TestHost` (F-03); the requirement states what a conforming design is — unique by construction, or at least 122 bits per value drawn independently and uniformly from a cryptographically secure source — so that the default conforms (CCR-BR-033)
- 0.5 (2026-11-08): BEH-BR-212 `HostControls` gains `buildTimeout` (G61), `policy.refusal` and the call-log counters `dropped` and `refused` with the effective `onFailure` and `queue` (CCR-BR-026)
- 0.4 (2026-11-08): BEH-BR-215 prose points to the audit-chain companion's `verifyChain` (CCR-BR-021); BEH-BR-212 `HostControls` gains the `policy` block of BEH-BR-265 and the `callLog.failed` counter of BEH-BR-276 (CCR-BR-018)
- 0.3 (2026-10-03): BEH-BR-212 `HostControls` through `Host.controls`, with the audit position `lastWritten` (highest `auditSeq` the sink accepted; per host; never decreases); `Host.controls` stays readable after close (prototype finding G34) (CCR-BR-014)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-25

`core/behaviors/25-operation-gate.md`

- 0.3 (2026-10-02): An approval is never consumed without a `requested` record; interruption outcomes aligned with BEH-BR-188; that rule placed after the refusal rules; `intent-ended` is not gated (CCR-BR-008)
- 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)

## BRIDGER-BEH-26

`core/behaviors/26-versioned-contracts.md`

- 0.7 (2026-11-09): BEH-BR-225 a *local* contract, `Contract.local(Key, { version, members })`: members without codecs, `local` and `descriptor.local` true, every other rule of this file unchanged, never served, proxied or derived across a host boundary, locality fixed per major; BEH-BR-231 and BEH-BR-234 do not apply to it; BEH-BR-232 a companion refuses a local contract at a boundary (requested by event-store CCR-ES-003 and sequence CCR-SQ-003); the signature of `Contract.local` rejects a `members` list that omits an own key (`MissingMembers`), the example is a self-contained shape, and `Contract.local` is pure like `Contract.make` (CCR-BR-033)
- 0.6 (2026-11-09): BEH-BR-228 a `replace` that leaves the plugin disabled forms no registered pair; pairs checked at `enable` (U-07) (CCR-BR-032)
- 0.5 (2026-11-08): BEH-BR-233 Settled (3): a hook point is not a contract registry (agent review R1-14) (CCR-BR-029)
- 0.4 (2026-11-08): BEH-BR-225 `serviceKey` holds the key passed to `Contract.make` and `key` is the `ServiceId` string, Settled (4) (prototype finding G-P1); BEH-BR-228 an `install` with `disabled: true` forms no registered pair and is checked at `enable` (G-P2); BEH-BR-229 compares with `Contract.serviceKey` (CCR-BR-028)
- 0.3 (2026-11-08): BEH-BR-233 contract-checked contribution registries (`ContributionRegistry.make({ contract })`, `implements` on `add`, `within(range)` reader and `Selector` range); BEH-BR-234 optional per-method `timeout` in `MethodSpec` and `descriptor.timeouts`, not enforced by core (gap G48); BEH-BR-228 Open on `reconcile` order closed by BEH-BR-156 (gap G36); BEH-BR-230 timeout row; BEH-BR-232 seams list the timeouts; acceptance check 102 (CCR-BR-025)
- 0.2 (2026-11-08): acceptance checks 59–61; BEH-BR-232 rewritten to match the remote companion (build opens no session; a provision serves only peers at its major and at least its version; one provision per major);  divergence from npm stated (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-017)                

## BRIDGER-BEH-27

`core/behaviors/27-manifest-and-lazy-activation.md`

- 0.10 (2026-11-09): BEH-BR-242 the registered manifest of an eager definition is the `manifest` it carries when it is installed or replaced; a definition stamped by the loader companion carries the signed package manifest, which core does not verify (M-02, core side); BEH-BR-246 a loaded definition that breaks a rule of BEH-BR-003, an invalid `handoff` among them, fails the load with `InvalidDefinition` (U-05) (CCR-BR-033)
- 0.9 (2026-11-09): BEH-BR-252 an operator operation during an idle return waits for it and is decided against `dormant`, under BEH-BR-073 (C-06) (CCR-BR-032)
- 0.8 (2026-11-08): BEH-BR-251 a load and build that succeed for a stop that waited are discarded and drop the held event "ended" (prototype finding G-P19); BEH-BR-252 a trigger kept during an idle return is not listed in `WakeReport.triggered` (G-P22); BEH-BR-250 a link without `hostId` counts as `HostLink.none` at a hook point (G-P20) (CCR-BR-030)
- 0.7 (2026-11-08): BEH-BR-250 declarations also reported "idling" (idle return under way) and "refused" (disabled by the `RefusalList`), `HostLink.hostId`, the link is no longer called harmless (agent review R1-03, R1-04, R1-06); BEH-BR-251 drop reason when a removal waits for a running load (G-P14); BEH-BR-252 idle conditions limited to what the host observes (G-P17) (CCR-BR-029)
- 0.6 (2026-11-08): BEH-BR-241 `range` and `version` of a required reference appear together (prototype finding G-P5); BEH-BR-243 shapes of `methods` going from a list to absent and of an egress `purpose` change (G-P6); BEH-BR-252 Settled (4), loaded or not is history for confluence (G-P7) (CCR-BR-028)
- 0.5 (2026-11-08): BEH-BR-241 note: the loader companion binds `publisher` to a configured signer (`PublisherMismatch`, loader BEH-LD-053); core's reading unchanged (CCR-BR-027)
- 0.4 (2026-11-08): manifest `listens`; BEH-BR-246 Settled cites `AccessPolicy.declaredOnly`; BEH-BR-245 refused starts are not triggered (CCR-BR-026)
- 0.3 (2026-11-08): manifest `contributions` entries carry an optional hook `role` and `target`; `Host.declaredContributions` and the `HostLink` reference (BEH-BR-250); an `OnEvent` wake holds its triggering event for the woken plugin's listeners (BEH-BR-251, amends BEH-BR-245); `Plugin.lazy` `idle` returns an idle loaded plugin to `dormant` through a normal drain (BEH-BR-252, closes URS gap G37); the root `lazy-triggered` record of a `wake` or a dispatch carries the caller's principal as `onBehalfOf` (BEH-BR-253, closes URS gap G39); checks 92, 96 and 97 (CCR-BR-024)
- 0.2 (2026-11-08): a lazy definition's identity digest is supplied to `Plugin.lazy` beside the manifest (a signed manifest cannot carry its own package's digest); manifest `digest` compared only when present; a loaded definition's own manifest ignored; contract references with a version require `methods`; manifest decoding first within the `InvalidDefinition` check; `reconfigure` on any registration not yet loaded is treated like `install` with `config`; `wake` takes no `OperationContext`; checks 62–66 (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-017)

## BRIDGER-BEH-28

`core/behaviors/28-plugin-principal-and-mandatory-policy.md`

- 0.9 (2026-11-10): BEH-BR-267 step 4b skips `Conflict` cells as well as no-op cells, `enable` of `failed` listed as not submitted; check 104 aligned (C6, C7); a `whenAvailable` re-run under "restart" is a consult point and counts as a background restart (C11) (CCR-BR-036)
- 0.8 (2026-11-10): BEH-BR-267 one step-4b criterion: the listed operations except where the BEH-BR-071 cell is a no-op, a `reconfigure` of a `dormant` plugin never submitted; check 104 aligned (C8); BEH-BR-263 mount-check order includes the `InstallError` checks (audit round 3, Low) (CCR-BR-035)
- 0.7 (2026-11-10): BEH-BR-257 a build that supersedes another in `starting` begins a new activation in a new revision, so the principal's revision stays unique (audit round 2, Low); BEH-BR-263 a mount refused by `allowChildren` or the `AccessPolicy` writes no record, one refused by the `RefusalList` writes `start-refused`, and the order of the mount checks (audit round 2, Low); BEH-BR-267 a trigger on a `dormant` plugin is its own consult point, to `waiting` too (C14), and a refused background restart stops with `StopReason` "refused-digest" (C5); the unwired-equivalence statements cover files 02–20 and 22–34 (audit round 2, Low) (CCR-BR-034)
- 0.6 (2026-11-09): BEH-BR-258 a handoff's `export` runs under the old activation's principal, `upgrade` and `import` under the new activation's (U-04) (CCR-BR-033)
- 0.5 (2026-11-09): BEH-BR-260 a failing mandatory `wrap` on an optional or reactive capture has the outcome BEH-BR-152 now states (U-06) (CCR-BR-032)
- 0.4 (2026-11-08): BEH-BR-262 Settled: the call's realm adds to, never replaces, a plugin's own mandatory sets (G-P16 not adopted); BEH-BR-267 only the definition's own digest is submitted, other revocation identifiers are the list's mapping (agent review R3-03), the reconcile diff, `registeredAt` and `plan` with a refused digest (R1-07); BEH-BR-269 `origin` form is the companion's to document (agent review F27); check 104 amended (CCR-BR-029)
- 0.3 (2026-11-08): BEH-BR-267 `RefusalList` port consulted on every start, system transitions included; BEH-BR-268 `AccessPolicy.declaredOnly`; BEH-BR-269 `AccessPolicy.ask` for companion buses and delivery; `AccessRequest` gains `declared`, `origin` and the styles "subscribe", "delivery" and mode "publish"; BEH-BR-263 Open closed (the install request carries `allowChildren` and `mandatoryInterceptions`, 25); BEH-BR-265 reports `refusal`; checks 104, 105 and 109 (CCR-BR-026); BEH-BR-259: root lazy-triggered records carry onBehalfOf (CCR-BR-024); BEH-BR-260 Open settled by the mandatory catalog (CCR-BR-025)
- 0.2 (2026-11-08): `onBehalfOf` defined as the principal of the calling fiber, with the provider case stated; principal retired after the activation's finalizers; `child` access requests carry the parent activation's principal; principal `revision` defined; realms of `Host.use` from plugin code; mandatory interceptions are application-wired and cover host captures only (not base-service reads); `who` before the access check; unwired-sameness reworded (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-018); hook calls under the owner's principal and the hook registry's access check (CCR-BR-019)

## BRIDGER-BEH-29

`core/behaviors/29-capability-grants-and-call-log.md`

- 0.3 (2026-11-08): BEH-BR-279 call-log failure policy (`onFailure` "drop" or "refuse", bounded hand-off queue, `CallLogUnavailable`); BEH-BR-280 entry kinds ("call", "crossing", "refusal", "revocation"), `Host.offerCallEntry` and `PrincipalRef.encode`/`decode`; BEH-BR-281 `CapabilityPolicy.changes` re-resolves live captures (narrowing on entitlement lapse); BEH-BR-276 `CallEntry` gains `kind`, `correlationId` and `sanitized`, Open closed; BEH-BR-275 a grant layer is kept when the policy declares `changes`; checks 107, 110 and 111 (CCR-BR-026)
- 0.2 (2026-11-08): `ResolutionRequest.contract` is `{ name, version }` of the bound provision; one member set for narrowing and the malformed-grant check; the port never receives an actor, stated with the route for companions that admit by actor (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-018)

## BRIDGER-BEH-31

`core/behaviors/31-hook-points.md`

- 0.6 (2026-11-08): BEH-BR-297 option `allowNoLink`; BEH-BR-305 record field `link`; BEH-BR-309 declarations matched by id, owner and role, "idling" and "refused" statuses, `HostLink.none` and failed or late reads deny on a veto point, enrich allowance in the wake window, a long "waking" declaration not waited for again, Settled (5)–(7); BEH-BR-312 G63 closed by `settle` (agent review R1-03–R1-06, R1-08–R1-10, R1-13) (CCR-BR-029)
- 0.5 (2026-11-08): BEH-BR-297 `timeout` equal to `deadline` refused when a veto may be woken (host-core prototype finding G-P3); BEH-BR-309 an empty wake window wakes and records "wake-timeout" without waiting (G-P3), a woken contribution takes part while its plugin is `starting` (G-P4); BEH-BR-302 `settle` outcomes for timeout, deadline, interruption and revocation (G-P11) (CCR-BR-028)
- 0.4 (2026-11-08): BEH-BR-307 `Selector.make` takes a contract `range` (26, BEH-BR-233) (CCR-BR-025); BEH-BR-302 `settle` step, closing URS gap G63; BEH-BR-305 record `correlationId` from `CurrentCorrelation` and BEH-BR-306 hook calls run with it; check 79 covers `settle` (CCR-BR-026)
- 0.3 (2026-11-08): declared contributions of plugins not yet loaded are read through the `HostLink` and woken or denied (BEH-BR-309); per-contribution `onError` within what the point allows and `breakerScope` (BEH-BR-310); ordered phases enrich → veto → advise, veto hooks see the enrichments (BEH-BR-311, BEH-BR-300, BEH-BR-301, BEH-BR-303); targets seen by admission and a policy deny recorded as "denied-policy", option `skip` renamed `policy` (BEH-BR-312); checks 92–95 (CCR-BR-024)
- 0.2 (2026-11-08): empty `codes` allowed, a veto registration then refused; `decisions` carries dispatch and breaker records; breaker transitions no longer host events; `who` before the registry's access check; unowned hooks run with no principal; a deadline interruption is outcome "deadline" and does not feed the breaker (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-019)

## BRIDGER-BEH-32

`core/behaviors/32-generic-gate-and-plan.md`

- 0.7 (2026-11-09): BEH-BR-318 a plan rejection's `_tag` is the concrete tag of the error, an `InstallError` member's own tag, never the union's name (C-07) (CCR-BR-033)
- 0.6 (2026-11-08): BEH-BR-318 and BEH-BR-319 `expect` compares `pruneDrain` and `pruneForce` only when `prune` or `atomic` is true (host-core prototype finding G-P23), BEH-BR-326 aligned; BEH-BR-323 a two-action undo step that stops halfway is one `notUndone` entry (G-P24); checks REQ-BR-083 and REQ-BR-099 amended (CCR-BR-030)
- 0.5 (2026-11-08): BEH-BR-317 `plan` and atomic validation consult the `RefusalList`; BEH-BR-318 `rejected` may carry a refusal, `registeredAt` tracks the operator's flag; BEH-BR-322 a step-4b refusal stops an atomic apply; BEH-BR-323 undo of `replace` restores the entry's previous override, expected revision moves with the undo, the "refused-digest" reason is not restored; BEH-BR-326 undo removals use the prune options whatever `prune` is (agent review R1-01, R1-02, R1-07, R1-11, R1-12) (CCR-BR-029)
- 0.4 (2026-11-08): BEH-BR-317 `plan` MUST decode a `reconfigure` value to compute the recorded paths (host-core prototype finding G-P10); BEH-BR-319 `PlanStale` mismatches not about one entry carry no `id` or `realm` (G-P9) (CCR-BR-028)
- 0.3 (2026-11-08): BEH-BR-322–326 atomic apply (`atomic: true`): dependency order, stop at the first failure, undo in reverse, `ApplyRolledBack` and `PartialApply`, records with `undoes`, gate requests with `undo`, interaction with leases, drain, `PlanStale`, the latch, interruption and shutdown; BEH-BR-318 plan carries `atomic`, `undo` and `policy`, and `PolicyMismatch` among rejections; BEH-BR-319 compares `atomic`; acceptance checks 99 and 100 (CCR-BR-025)
- 0.2 (2026-11-08): `plan` may decode `reconfigure` values to compute paths (never exposed); `configChange.paths` and the prune options are part of the `expect` comparison; plan `rejected` reasons are `{ _tag, message }`; `Gate.all` pieces take a timeout (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-019)

## BRIDGER-BEH-33

`core/behaviors/33-realm-families.md`

- 0.7 (2026-11-10): BEH-BR-331 the failed and refused-digest rules hold for any "creating" member, an expired wait included (C9); BEH-BR-334 `use` reports the reason the member was marked with, and an operator `enable` or `replace` recovers a refused-digest plugin (Low); BEH-BR-329 family scope close and BEH-BR-336 teardown and creation undo stop on any error of any step, `retireRealm` refused and `HostClosed` included; `FamilyEvent.outcome` "refused" (C10); REQ-BR-084, 086 rows (CCR-BR-035)
- 0.6 (2026-11-10): BEH-BR-329 family scope close removes a `failed(cleanup)` plugin as BEH-BR-047 allows, as an ephemeral realm does (C13); BEH-BR-331 a ready member whose plugin fails or is refused is marked "failed" (C16); BEH-BR-336 a teardown step refused by the gate or blocked by the latch stops, logs at error level and leaves the realm visible (C19) (CCR-BR-034)
- 0.5 (2026-11-09): BEH-BR-331 a member is ready when every plugin is `active`, `dormant` or disabled by an operator; a plugin disabled "refused-digest" fails the member ("rejected"); after `activationTimeout` the member stays "creating", the next `use` waits again without a host call, and BEH-BR-333 lets idle eviction evict it (U-03); BEH-BR-336 `EphemeralRealm.use` is `Host.useAll` with the realm, with its callback shape and error union (C-15); acceptance row REQ-BR-084 (CCR-BR-033)
- 0.4 (2026-11-09): BEH-BR-336 `Realm.ephemeral` adds `InvalidRealm` from `defineRealm` (C-02) (CCR-BR-032)
- 0.3 (2026-11-08): BEH-BR-337 "/" reserved as the narrowing delimiter, `isWithin` specified for ids that keep it, a Settled paragraph (host-core prototype finding G-P8; actor half of gap G47) (CCR-BR-028)
- 0.2 (2026-11-08): eviction and teardown prune through `reconcile` with `pruneDrain`/`pruneForce`; a per-realm turn serialises `retireRealm` with registrations into the realm; eviction outcomes on the family's own `events` stream, not the host feed; `family.use` aligned with `Host.useAll`; duplicate family ids a documented precondition (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-019)

## BRIDGER-BEH-34

`core/behaviors/34-state-handoff.md`

- 0.9 (2026-11-11): BEH-BR-346 and BEH-BR-353 `replace` and `reconcile` take `cold` (`ReplaceOptions.cold`, `ReconcileOptions.cold` applied to every replace and restarting reconfigure it issues), Settled (1); REQ-BR-103 row (H9) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.8 (2026-11-10): BEH-BR-347 and BEH-BR-349 the plugin is carried in `CurrentTransition` by its canonical key (C1) (CCR-BR-036)
- 0.7 (2026-11-10): BEH-BR-347 and BEH-BR-349 export, `upgrade` and `import` carry the plugin in `CurrentTransition`, not `HeldPlugins` (H1) (CCR-BR-035)
- 0.6 (2026-11-10): BEH-BR-345 a definition without `handoff` behaves as files 01–20 and 22–33 specify (review of CCR-BR-034) (CCR-BR-034)
- 0.5 (2026-11-09): Examples use `Plugin.define` (C-15); BEH-BR-347 export as the stop's final step of any handing-off operation (C-14); export under the old activation's principal and import and upgrade under the new one's, each with an empty annotation bag and the correlation of its stop or build (U-04); BEH-BR-346 a lazy registration's old side is its loaded definition, whose `handoff` is checked at load (U-05); BEH-BR-349 the value is imported only into a build that will be published, a stale build receives nothing and a target change during the import waits for publication; BEH-BR-351 a `restart` or `reconfigure` that supersedes the new build keeps the value held for the next build (U-02); acceptance rows REQ-BR-087 and 088 (CCR-BR-033)
- 0.4 (2026-11-09): BEH-BR-353 `PluginHandle.restart` takes `HandoffCallOptions`; BEH-BR-013 named as the source of every signature (C-01) (CCR-BR-032)
- 0.3 (2026-11-08): BEH-BR-353 handoff on `restart` and on a restarting `reconfigure` when the definition lists them in `alsoOn`, `cold` call option, none on a volatile-only `reconfigure` (gap G44); BEH-BR-346 and 350 extended to those operations and to the undo `replace` of an atomic apply; BEH-BR-352 the previous definition kept for an atomic apply's undo; acceptance check 103 (CCR-BR-025)
- 0.2 (2026-11-08): handoff loss tags declared record-only (ADR-BR-008) (CCR-BR-022)
- 0.1 (2026-11-08): Initial draft (CCR-BR-019)

## BRIDGER-TRACE

`core/traceability.md`

- 0.24 (2026-11-11): REQ-BR-089 the lease check covers the child's removal set, `unmount` from such a lease holder always fails `WouldDeadlock` and writes no record, otherwise waits under the limits of the removal it joins or begins, `unmount-requested` only when it begins or takes over a removal, "begun" from the revision the parent becomes `stopping`, an outside stop taken over draining or parked (H1, C1, C2, C3, C4, C5); INV-BR-017 row cites BEH-BR-121 and BEH-BR-126, INV-BR-023 row BEH-BR-205 (CL11); REQ-BR-057 the close-flush latch and BEH-BR-205 (CL10); REQ-BR-083 `cold` compared (C8); REQ-BR-103 the `cold` join and supersede outcomes, BEH-BR-351 (C7); RSK-BR-044 row cites the `Host.remove` path (BEH-BR-041, BEH-BR-188) and INV-BR-050 in place of the reconcile diff (CL12) (SPEC-AUDIT-07) (CCR-BR-039)
- 0.23 (2026-11-11): REQ-BR-103 the `cold: true` skip record and `cold` on the gate request and records (C7) (SPEC-AUDIT-06); REQ-BR-089 the finalizer of a lease-holding closing fiber neither fails nor waits, `unmount` fails `WouldDeadlock` (H1); INV-BR-016 row cites BEH-BR-121 and BEH-BR-126 (C3) (SPEC-AUDIT-06) (CCR-BR-038)
- 0.22 (2026-11-11): REQ-BR-057 `lastNumbered` and `closed` (C5); REQ-BR-079 `settle` never awaited (C8); REQ-BR-085 `FamilyEvictionError` and REQ-BR-086 `InvalidRealm` and "rejected" (CL16, C7); REQ-BR-103 `cold` on replace and reconcile (H9); REQ-BR-104 and the RSK-BR-061 row: the `whenAvailable` re-run (BEH-BR-134) and the calls able to start (BEH-BR-072) (CL14, C9) (SPEC-AUDIT-05) (CCR-BR-037)
- 0.21 (2026-11-10): §7 rows for RSK-BR-008, 011 and 012 gain the behaviours their controls cite (BEH-BR-105, 276, 305, 324) (CL12), and RSK-BR-006, 033 and 061 those of this round's controls (BEH-BR-108, 245, 250, 309, 317, 322–326) (C4, C13, CL11) (CCR-BR-036)
- 0.20 (2026-11-10): REQ-BR-048 row: `shutdown` from a build or finalizer (H1); REQ-BR-084, 086, 098 and 100 rows follow their amended checks; REQ-BR-100 title qualified: latch and shutdown before a completed forward action end in `ApplyRolledBack` (C7, C9, C10, C15) (CCR-BR-035)
- 0.19 (2026-11-10): REQ-BR-083 row: a changed incoming version, digest or consent diff (H2) (CCR-BR-034)
- 0.18 (2026-11-09): REQ-BR-059, 065, 083, 084, 086, 087, 088 and 112 rows extended with their amended checks; REQ-BR-114 added (identifier uniqueness); §5 range to check 114; INV-BR-004, 024 and 045 rows cite BEH-BR-349, BEH-BR-193 and BEH-BR-349/353; RSK-BR-007 retitled with its controls and REQ-BR-114, RSK-BR-035 and RSK-BR-070 controls extended (F-03, C-07, C-13, C-14, C-15, U-02, U-03, U-04, U-05) (CCR-BR-033)
- 0.17 (2026-11-09): REQ-BR-004, 008, 009, 024, 026, 027, 051 and 103 rows extended with their amended checks; INV-BR-018 and INV-BR-020 rows and the RSK-BR-009 and RSK-BR-029 controls extended (CCR-BR-032 findings C-01, C-02, C-05, C-06, C-17, U-01, U-06, U-07, U-08, U-13) (CCR-BR-032)
- 0.16 (2026-11-08): REQ-BR-083, 092, 096, 097 and 099 rows extended (CCR-BR-030)
- 0.15 (2026-11-08): REQ-BR-072, 092, 096, 097, 099 and 104 rows extended; INV-BR-052 link (CCR-BR-029)
- 0.14 (2026-11-08): REQ-BR-112–113 (call-log kind "dispatch" and string epochs; registry entry owner and `HoldRevoked`); RSK-BR-064–070 rows (CCR-BR-027)
- 0.13 (2026-11-08): Rows for BEH-BR-250–253 and 309–312, INV-BR-046–047, ADR-BR-050, RSK-BR-057–058 and REQ-BR-092–097 (CCR-BR-024); BEH-BR-233–234, 322–326 and 353, INV-BR-048–049, ADR-BR-051–052, RSK-BR-059–060 and REQ-BR-098–103 (CCR-BR-025); BEH-BR-267–269 and 279–281, INV-BR-050–052, ADR-BR-053–054, RSK-BR-061–063 and REQ-BR-104–111 (CCR-BR-026); existing INV, ADR, RSK and REQ rows extended; checks 21–111
- 0.12 (2026-11-08): §7 rows for RSK-BR-052–056 (CCR-BR-023)
- 0.11 (2026-11-08): file 30 range BEH-BR-289–296; REQ-BR-022 and REQ-BR-075 rows; RSK-BR-031 controls cite BEH-BR-296 (CCR-BR-022)
- 0.10 (2026-11-08): Rows for behaviours 26–27, INV-BR-031–034, ADR-BR-040–042, RSK-BR-025–027 and REQ-BR-059–066 (CCR-BR-017); behaviours 28–30, INV-BR-035–039, ADR-BR-043–045, RSK-BR-028–031 and REQ-BR-067–076 (CCR-BR-018); behaviours 31–34, INV-BR-040–045, ADR-BR-046–049, RSK-BR-032–035 and REQ-BR-077–088 (CCR-BR-019); REQ-BR-089–091 for the companion-requested seams (CCR-BR-020); companion-origin RSK-BR-036–051 (CCR-BR-021); existing INV, ADR and RSK rows extended
- 0.9 (2026-10-03): Regenerated; ADR-BR-039, RSK-BR-024 and REQ-BR-055–058 added (CCR-BR-014)
- 0.8 (2026-10-03): Regenerated; REQ-BR-013, 021, 025 and 029 cite the behaviours their checks cover (CCR-BR-013)
- 0.7 (2026-10-03): REQ-BR-006 summary follows acceptance check 6 (CCR-BR-012)
- 0.6 (2026-10-02): Regenerated; REQ-BR-053–054 added (CCR-BR-011)
- 0.5 (2026-10-02): Regenerated; REQ-BR-049–052 added (CCR-BR-010)
- 0.4 (2026-10-02): Regenerated; REQ-BR-046–048 added (CCR-BR-008)
- 0.3 (2026-10-02): Regenerated; INV-BR-030, ADR-BR-038, RSK-BR-023 and REQ-BR-043–045 added (CCR-BR-006)
- 0.2 (2026-10-02): Regenerated after consistency fixes; REQ-BR-042 added (CCR-BR-002)
- 0.1 (2026-10-02): Initial draft (CCR-BR-001)
