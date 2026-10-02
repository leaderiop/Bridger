# Bridger Core — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-00                                                   |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index                      |
> | Change History | 0.9 (2026-10-02): CCR-BR-009 registered (CCR-BR-009)<br>0.8 (2026-10-02): CCR-BR-008 registered, including its second review pass; impact assessments added to CCR-BR-006 and CCR-BR-007 (CCR-BR-008)<br>0.7 (2026-10-02): CCR-BR-007 registered (CCR-BR-007)<br>0.6 (2026-10-02): CCR-BR-006 registered (CCR-BR-006)<br>0.5 (2026-10-02): CCR-BR-005 registered (CCR-BR-005)<br>0.4 (2026-10-02): CCR-BR-004 registered (CCR-BR-004)<br>0.3 (2026-10-02): CCR-BR-003 registered (CCR-BR-003)<br>0.2 (2026-10-02): CCR-BR-002 registered (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

**implementation: absent**

This is the specification of `@bridger/core`, the generic plugin runtime on
which the Bridger ERP is built. It replaces the design document
`docs/SPEC.md`, which remains in the repository as design history and is no
longer normative.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The line `implementation: absent` above is read by
`scripts/verify-traceability.sh`; while it says `absent`, the script refuses
any document that calls itself Effective and any decision that calls itself
Accepted ([ADR-BR-036](./decisions/036-prospective-specification.md)).

The consequence matters in a regulated setting: **this specification is not
evidence that the library behaves as described.** It is the input to
development and, later, to a regulated user's validation. A requirement becomes
evidence only when a test that exercises it has run and passed.

## The honest-claims rule

This specification never claims a property that is not assembled and tested.
In particular it makes **no** claim that Bridger is validated, qualified,
compliant with 21 CFR Part 11 or EU GMP Annex 11, or that it provides a
durable or tamper-evident audit trail. It specifies hooks that *support* a
regulated user's compliance — attributable operations, an `AuditSink` port, an
`OperationGate` port, deterministic time and identifiers — and states, clause
by clause, which obligations remain with the companion package and with the
regulated system ([compliance matrix](./gxp/02-compliance-matrix.md)).

The rule is inherited from the sibling `qadi` specification, whose ADR-QD-016
removed a predecessor's unassembled compliance machinery and whose ADR-QD-056
reintroduced audit support only as a narrowly scoped companion package. Their
lesson is recorded in [ADR-BR-028](./decisions/028-gxp-scope.md).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, packages, public API surface, worked example |
| 2 | [Glossary](./glossary.md) | Terms, including the GxP vocabulary |
| 3 | [User requirements](./urs.md) | What users need, scope and allocation, assumptions, known gaps |
| 4 | [Behaviours](./behaviors/01-plugin-definition.md) | What the library must do, as `BEH-BR` requirements |
| 5 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 6 | [Decisions](./decisions/001-effect-v4-as-effect-system.md) | Why, as `ADR-BR` records |
| 7 | [GxP documents](./gxp/01-regulatory-scope.md) | Regulatory scope, compliance matrix, risk assessment, validation plan |
| 8 | [Traceability](./traceability.md) | URS → BEH → INV → ADR → REQ → RSK → test |
| 9 | [Process](./process/requirement-id-scheme.md) | Identifier scheme, Definitions of Done, change control |
| 10 | [Roadmap](./roadmap.md) | Implementation order and what is not planned |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Plugin definition](./behaviors/01-plugin-definition.md) | BEH-BR-001–008 |
| 02 | [Host construction](./behaviors/02-host-construction.md) | BEH-BR-009–016 |
| 03 | [Installation](./behaviors/03-installation.md) | BEH-BR-017–024 |
| 04 | [States and snapshots](./behaviors/04-states-and-snapshots.md) | BEH-BR-025–032 |
| 05 | [Activation](./behaviors/05-activation.md) | BEH-BR-033–040 |
| 06 | [Removal](./behaviors/06-removal.md) | BEH-BR-041–048 |
| 07 | [Replacement and reactivation](./behaviors/07-replacement-and-reactivation.md) | BEH-BR-049–064 |
| 08 | [Operation legality](./behaviors/08-operation-legality.md) | BEH-BR-065–080 |
| 09 | [Leases](./behaviors/09-leases.md) | BEH-BR-081–088 |
| 10 | [Runtime failure and health](./behaviors/10-runtime-failure-and-health.md) | BEH-BR-089–096 |
| 11 | [Configuration](./behaviors/11-configuration.md) | BEH-BR-097–104 |
| 12 | [Shutdown and hosting](./behaviors/12-shutdown-and-hosting.md) | BEH-BR-105–112 |
| 13 | [Observability and diagnostics](./behaviors/13-observability-and-diagnostics.md) | BEH-BR-113–120 |
| 14 | [Children and groups](./behaviors/14-children-and-groups.md) | BEH-BR-121–128 |
| 15 | [Optional and reactive dependencies](./behaviors/15-optional-and-reactive.md) | BEH-BR-129–136 |
| 16 | [Event bus](./behaviors/16-event-bus.md) | BEH-BR-137–144 |
| 17 | [Realms and interception](./behaviors/17-realms-and-interception.md) | BEH-BR-145–152 |
| 18 | [Reconciliation and confluence](./behaviors/18-reconciliation-and-confluence.md) | BEH-BR-153–160 |
| 19 | [Contribution registry](./behaviors/19-contribution-registry.md) | BEH-BR-161–168 |
| 20 | [Generation](./behaviors/20-generation.md) | BEH-BR-169–176 |
| 21 | [Testing host](./behaviors/21-testing-host.md) | BEH-BR-177–184 |
| 22 | [Attributable operations](./behaviors/22-attributable-operations.md) | BEH-BR-185–192 |
| 23 | [Audit sink and record](./behaviors/23-audit-sink-and-record.md) | BEH-BR-193–208 |
| 24 | [Time, identifiers and sequence](./behaviors/24-time-ids-and-sequence.md) | BEH-BR-209–216 |
| 25 | [Operation gate](./behaviors/25-operation-gate.md) | BEH-BR-217–224 |

Each file owns a block of identifiers; unused numbers at the end of a block
are reserved, not gaps ([identifier scheme](./process/requirement-id-scheme.md) §3).

### GxP documents

| Document | Purpose |
| -------- | ------- |
| [Regulatory scope](./gxp/01-regulatory-scope.md) | Intended use, GAMP 5 positioning, regulations cited, what a library can and cannot claim |
| [Compliance matrix](./gxp/02-compliance-matrix.md) | 21 CFR Part 11, EU GMP Annex 11 and ALCOA+, clause by clause: Core, Companion, Consumer or N/A |
| [Risk assessment](./gxp/03-risk-assessment.md) | ICH Q9(R1) / GAMP 5 FMEA, `RSK-BR` risks, controls and residual risk |
| [Validation plan](./gxp/04-validation-plan.md) | How the library's verification feeds a regulated user's IQ/OQ/PQ, using CSA risk-based rigour |

### Appendices (informative)

| Appendix | Purpose |
| -------- | ------- |
| [SPEC.md migration map](./appendices/spec-md-migration-map.md) | Every heading of `docs/SPEC.md` and where it went |
| [Cordis comparison](./appendices/cordis-comparison.md) | Feature parity with the Cordis plugin framework |

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `URS-BR-NNN` / `NFR-BR-NNN` | User / non-functional requirement |
| `BEH-BR-NNN` | Functional behaviour requirement |
| `INV-BR-NNN` | Runtime invariant |
| `ADR-BR-NNN` | Architecture decision |
| `REQ-BR-NNN` | Acceptance scenario (planned) |
| `RSK-BR-NNN` | Risk |
| `CCR-BR-NNN` | Change control record |

Full rules in [the identifier scheme](./process/requirement-id-scheme.md).
Changes follow [change control](./process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-BR-001 | 2026-10-02 | Initial specification, converted from `docs/SPEC.md` (design of 2026-10-02) and extended with GxP hooks (attributable operations, `AuditSink`, `OperationGate`, deterministic time and identifiers) and GxP documents. `docs/SPEC.md` marked superseded. |
| CCR-BR-002 | 2026-10-02 | Consistency fixes from an independent review of CCR-BR-001: Host signatures aligned to BEH-BR-013; `WouldDeadlock` decided after the `requested` record; scope-close shutdown exempt from attribution; ADR-BR-031 aligned with the audit writer (BEH-BR-202–205); install configuration not decoded at the call; `ReconcileReport.rejected` union; `correlationId` always present; `AuditRecord.droppedSinceAck`; `Desired.overlay` specified; no "complete" or "lossless" claims about the audit trail; risk citations corrected; acceptance check 42 (definition digest in gate requests and records). |
| CCR-BR-003 | 2026-10-02 | Effect API prototype (`prototypes/effect-v4-api`, effect 4.0.0): open items G2–G4 closed — sliding `PubSub` lag is per subscriber, `Layer.effectContext` exists, `runtime.context()` forces a `ManagedRuntime` build; finding G9 recorded — a naive `forkChild` + `join` releases the lease before the child's finalizers, so BEH-BR-084 needs explicit interrupt-and-await. Platform facts only; no Bridger behaviour is evidenced. |
| CCR-BR-004 | 2026-10-02 | Host-core prototype (`prototypes/host-core`, phase P1, 24 scenario tests on effect 4.0.0). Findings: G10 `IdentifiersOf` made distributive (BEH-BR-002); G11 cross-plugin stop ordering recorded as an open design item; G12 scoped-lease revocation interrupts the acquiring fiber (BEH-BR-086). The prototype is not the implementation and evidences no requirement. |
| CCR-BR-005 | 2026-10-02 | GxP hooks prototype (phase P3, in `prototypes/host-core`: attribution, `AuditSink` single writer with in-place retry and the latch, `OperationGate`, `IdGenerator`; 11 scenario tests for acceptance checks 31–36, 38, 39, 41, 42). Finding G13: acknowledging the latch waits for the drained backlog (BEH-BR-206); G11 extended. The prototype evidences no requirement. |
| CCR-BR-006 | 2026-10-02 | Cross-plugin stop ordering; closes URS gap G11. ADR-BR-038 (no host-wide operation order; waits run only from a provider to its dependents; a cascade waits for a dependent's step, never its operation; a cascade resumes a parked stop and ends the parked intent; `WouldDeadlock` before any wait); BEH-BR-078–080 (reserved IDs of file 08 now used), BEH-BR-074, BEH-BR-045, BEH-BR-088 amended; INV-BR-030; RSK-BR-023; acceptance checks 43–45 (REQ-BR-043–045). Host-core prototype: host-wide lock replaced by per-plugin admission and step locks; 3 scenario tests, which fail against the previous prototype. The prototype evidences no requirement. Also amended: BEH-BR-065 (cross-plugin ordering points to BEH-BR-078–080) and ADR-BR-012 (item 4 delegates cross-plugin ordering to ADR-BR-038).<br>**Impact (PROC-03 §3, recorded by CCR-BR-008).** (1) Identifiers: BEH-BR-078–080, INV-BR-030, ADR-BR-038, RSK-BR-023 and REQ-BR-043–045 added; BEH-BR-045, 065, 074, 088 and 184 and ADR-BR-012 amended; no URS-BR requirement changed (gap G11 closed); nothing withdrawn. (2) Risk: RSK-BR-023 is new (initial High / High, residual Medium / Low); no other entry re-scored. (3) GxP impact: yes — it changes the legality of concurrent operations (parked stops, cascades) and which records a cascade writes and what causes them. (4) Revalidation: no version has been released or qualified (implementation absent), so nothing is to be re-executed; REQ-BR-043–045 cover the change. (5) Compatibility: no public type and no audit `schemaVersion` changed; documented behaviour changed — a cascade ends a parked operation instead of completing it (BEH-BR-080), and `DrainTimeout.id` can name a dependent (BEH-BR-045). |
| CCR-BR-007 | 2026-10-02 | In-flight operation table prototyped (`prototypes/host-core`: per-plugin flights run by host fibers; join, supersede, conflict and parked resumption; 34 scenario tests including all 28 live cells of BEH-BR-072 without `reconfigure`). Findings: G14 — a caller interrupted after its `requested` record and before its intent changes nothing and ends with a `failed` (`Interrupted`) record, replacing the uninterruptible span of BEH-BR-188 (BEH-BR-067, BEH-BR-188, INV-BR-010 amended); G15 — a parked call's terminal record is final (BEH-BR-074). The prototype evidences no requirement.<br>**Impact (PROC-03 §3, recorded by CCR-BR-008).** (1) Identifiers: BEH-BR-067, 074 and 188 and INV-BR-010 amended; nothing added or withdrawn (gaps G14 and G15 recorded and closed). (2) Risk: RSK-BR-004 and RSK-BR-006 affected (what a call interrupted before its intent leaves in the trail); not re-scored at the time — reviewed under CCR-BR-008, scores unchanged; no new risk. (3) GxP impact: yes — it changes the audit records an interrupted call produces. (4) Revalidation: no version has been released or qualified (implementation absent); no REQ-BR scenario was named at the time — acceptance check 46 of BEH-BR-184 (added by CCR-BR-008) now covers the change. (5) Compatibility: no public type changed and `schemaVersion` stays 1, but records may carry a new `error._tag`, "Interrupted", which ADR-BR-008 lists as record-only from CCR-BR-008 on; the documented behaviour of BEH-BR-188 changed. |
| CCR-BR-008 | 2026-10-02 | Resolutions of a review of CCR-BR-003..007 by three agent reviewers — not the independent review of PROC-03 §5 (URS gap G16) — in two passes: the first pass's resolutions were reviewed again, and the second pass corrected them before this record was closed. **Interruption:** an outcome for each stage of the call order; the passage from the gate's approval to the enqueue of the `requested` record is uninterruptible; before the intent the call path writes a `failed` record with the record-only tag `Interrupted`, and the first terminal cause wins over a later `AuditUnavailable`; a `reconcile`'s intent is recorded with its parent `requested` record. **Parked stops:** joining or superseding a parked operation is a resumption whose caller writes its own `completed` or `failed` record; a stop rooted in an operator call parks, a cascade with no caller (runtime failure, shutdown) revokes; `retry` and `enable` on a parked system stop fail with `Conflict` "dependency-loss"; resuming a parked system stop is the resuming call's intent; a resumed drain that expires again leaves a parked system stop; ending a parked `replace` or `reconfigure` releases its reservations or reverts its override. **Cascades and children:** a parent's stop removes its children; a child install that closes a cycle fails with `DependencyCycle`; builds and finalizers carry `HeldPlugins`, so re-entry from them fails with `WouldDeadlock`, checked before any wait and at the linearization point; a cascading call's own drain limit runs while it waits; `DrainTimeout { id, leases, target? }`. **Visibility:** `parked` in snapshots and inspection, `pending` in inspection, `stop-parked` and `stop-resumed` events. Glossary terms (transition step, cascade, parked); `TestHost` order of pending steps; acceptance check 45 split and checks 46–48 added; RSK-BR-023 controls and residual owner; URS G11 wording; stale roadmap lines removed. **Second pass:** ending a parked intent writes its own system record, `intent-ended`, carrying `endsIntentOf` and the reverted `configChange` paths (no longer the `system-stop`); a call that resumes a parked operation names it in `resumes` on its terminal record, with the stored override's paths; parked calls are identified by the `recordId` of their `requested` record (`endsIntentOf`, `resumes`, `PluginInspection.pending.requestedRecordId`); when a call fails with `DrainTimeout`, every stop it drives that has not settled parks with it, and another cascade waiting on such a stop resumes it under its own options; mount edges run child→parent; the outcome of a call that resumes a parked system stop is decided after the stop settles; once shutdown has begun no stop parks; children are removed before the parent's scope begins to close, caused by the cascade root's record; stops take no `concurrency` slot; `retry` and `enable` add `WouldDeadlock`; a cascading call's drain limit also runs while it waits for a build (`DrainTimeout.leases` 0); every override change made under an ended intent reverts; `HeldPlugins` is carried by forks a build or finalizer awaits, not by fibers forked into the activation scope; a `requested` record dropped for writer overflow fails its call at once with no terminal record; `reconcile` checks `requireReason` on a provisional diff and again on the diff recomputed at its intent. The host-core prototype was updated to follow the resolutions (`prototypes/host-core/RESULTS.md`); it evidences no requirement.<br>**Impact (PROC-03 §3).** (1) Identifiers: amended — BEH-BR-010, 011, 013, 027, 039, 040, 041, 043, 045, 050, 056, 062, 065–075, 077–080, 085, 086, 088, 094, 095, 099, 101, 105, 107, 114, 118, 121, 125, 133, 156, 158, 177, 178, 184, 188, 190, 195–203 and 221; INV-BR-002, 009, 010, 016, 017, 022, 025 and 030; ADR-BR-008, 012, 013, 014, 015, 016, 017 and 038; RSK-BR-004, 006, 011 and 023 (text only); acceptance check 45 of BEH-BR-184 changed (REQ-BR-045) and checks 46–48 added (REQ-BR-046–048); no URS-BR requirement changed (gap G16 recorded and closed); no BEH, INV, ADR or RSK identifier added or withdrawn. (2) Risk: RSK-BR-023 controls justifying its residual named, its cross-fiber residual allocated to RSK-BR-011, and its owner extended to the consumer for re-issuing ended intents; RSK-BR-004, 006 and 011 controls extended; no score changed; no new risk. (3) GxP impact: yes — it changes the audit record (the `intent-ended` record with `endsIntentOf`, `resumes`, the `Interrupted` tag, terminal-record precedence, the records of a resumption, no terminal record for a dropped `requested` record), attribution (`requireReason` re-checked at a `reconcile`'s intent), the legality table (parked system stops, `Conflict` "dependency-loss") and the window in which a gate's approval can be lost. (4) Revalidation: no version has been released or qualified (implementation absent); REQ-BR-045–048 (acceptance checks 45–48 of BEH-BR-184) cover the change. For a released version it would be a trigger under item 1 of the validation plan §9, and under item 3 too, since it adds `AuditRecord` fields (`endsIntentOf`, `resumes`) and a `SystemTransition` value ("intent-ended") that after a release would require a new `schemaVersion`; here `schemaVersion` stays 1 because no record has yet been handed to a sink (BEH-BR-195, Settled (3)). (5) Compatibility: public types extended — `parked` on the `stopping` snapshot, `parked` and `pending` (with `requestedRecordId`) on `PluginInspection`, two events, `DrainTimeout.target`, `WouldDeadlock` in the error unions of `retry` and `enable`, `AuditRecord.endsIntentOf` and `resumes`, the `SystemTransition` value "intent-ended"; `schemaVersion` stays 1 because no record has been handed to a sink yet (BEH-BR-195); documented behaviour changed for system stops, child-install cycles, re-entry from builds and finalizers, the records of a resumption and of an ended intent, the `concurrency` option (builds only), and shutdown, which never parks a stop. |
| CCR-BR-009 | 2026-10-02 | P2 prototype (`prototypes/host-core`: Plugin.Runtime with background policies and `reportFailure`, the runtime-failure transition, health checks, configuration and `reconfigure`, shutdown with `CloseReport` and the scope-close path, `Host.events`, `inspect`, `ManagedRuntime` hosting; 18 scenario tests). Findings: G17 — an in-flight health check is interrupted when the stop begins (BEH-BR-092 amended); G18 — the scope-close path flushes queued audit records before the writer closes, bounded by `auditTimeout` (BEH-BR-108 amended). The prototype evidences no requirement.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-BR-092 and BEH-BR-108 amended; nothing added or withdrawn (gaps G17 and G18 recorded and closed). (2) Risk: RSK-BR-016 (hidden runtime failure) and RSK-BR-004 (unaudited lifecycle change) reviewed; controls strengthened, scores unchanged; no new risk. (3) GxP impact: yes — G18 protects the last record of a host's audit trail. (4) Revalidation: no version has been released or qualified (implementation absent); covered by REQ-BR-014 (health) and REQ-BR-008 (shutdown). (5) Compatibility: no public type, record field or `schemaVersion` changes. |
