# 03 — Risk Assessment

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GXP-03                                               |
> | Revision       | 0.21                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.21 (2026-11-11): RSK-BR-006 residual: a terminal, `rejected` or system record lost in the close flush, numbered or not, sets the latch carried as `CloseTail.auditDegraded`, the log alone only for a never-numbered `requested` record (C2); RSK-BR-035 controls: the `cold: true` skip record and `cold` on the gate request and records (C7); RSK-BR-044 controls: a loader revocation removes the dropped installed plugins with `Host.remove` and never reconciles, and re-evaluation reads the accepting policy and publisher bindings from the record (H5, H6, L1) (loader CCR-LD-009); scores unchanged (SPEC-AUDIT-06) (CCR-BR-038)<br>0.20 (2026-11-11): RSK-BR-017 and RSK-BR-044 controls gain the loader's round-4 and round-5 controls: an exemption by digest counts as a pinned acceptance, a revocation reconcile issues prune removals only and keeps every entry still installed whatever its pending status, signer revocation is re-evaluated from the verification record alone (identities, roles, requirement), and the gate refuses "verification-unknown" for restart-like calls unless the digest is pinned or exempt (L4, H7, H8, L3) (SPEC-AUDIT-05) (loader CCR-LD-007, CCR-LD-008); RSK-BR-006 controls and residual: the latch after the final snapshot and a close-flush loss reported by `Host.controls().closed` (`CloseTail`), never-numbered records by the log only, the lost reconcile record under BEH-BR-192's fourth exception (C3, C4, C5); RSK-BR-008 and RSK-BR-012 controls name the four `correlationId` exceptions (C4); RSK-BR-061 controls name the `whenAvailable` re-run (CL14); scores unchanged (SPEC-AUDIT-05) (CCR-BR-037)<br>0.19 (2026-11-10): RSK-BR-006 residual names a fourth loss path, a running `reconcile`'s parent record lost at shutdown, with its control the latch (C4), and a record lost in the close flush is shown by `auditPosition`, not `CloseReport.auditDegraded` (C5); RSK-BR-011 risks introduced by controls: the untracked forked fiber that keeps `CurrentTransition` for life, a documented false positive, and realm-qualified references (C2, C1); RSK-BR-033 controls, verification and residual gain the definition without `meta.digest` of the narrowed INV-BR-043 and its consumer control, residual reassessed to Medium (3) / Medium (4) (C13); RSK-BR-061 controls name a trigger applied to a `dormant` plugin leaving for `waiting` (INV-BR-050) (CL11) (CCR-BR-036)<br>0.18 (2026-11-10): RSK-BR-011 controls: `HeldPlugins` and `CurrentTransition`, `load`, `shutdown` from a transition step, and both references carried across companion hand-offs (H1); RSK-BR-008 and RSK-BR-012 controls name the three bare-`correlationId` exceptions, the hook decision record among them (C5; audit round 3, Low); companion range RSK-RM-001–017, RSK-RM-017 named beside RSK-BR-062 (remote CCR-RM-006) (CCR-BR-035)<br>0.17 (2026-11-10): RSK-BR-034 failure mode, controls (BEH-BR-331 failure after ready, BEH-BR-336 refused teardown), residual, owner and the consumer residual list gain the refused ephemeral teardown (C16, C19); RSK-BR-015 controls: generations report forced revocations on their own feed, unaudited (C7); scores unchanged; RSK-BR-014 failure mode, controls and residual gain the ungated child-mount route, and its §4 owner the Consumer (C18; audit round 2, Low); RSK-BR-063 states that the actor is inherited as the correlation is, re-scored with scores unchanged because the wrong actor is RSK-BR-005's hazard (C21); RSK-BR-008 and RSK-BR-012 controls name the `CallLog`, RSK-BR-012 also the bare correlation of `reconcile-partial` (H1; audit round 2, Low); RSK-BR-003 controls and residual and RSK-BR-016 residual name the background "restart" and "ignore" policies (audit round 2, Low); RSK-BR-039 failure mode, controls, residual and the consumer residual list gain an envelope origin not bound to its sender, a claim the transport and the deployment must bind (durable-bus BEH-DB-018, CCR-DB-005, P2); scores unchanged; RSK-BR-055 control: a snapshot restore or re-bootstrap install also passes a range, recorded as a `GapRecord` (durable-bus CCR-DB-005; review of CCR-BR-034) (CCR-BR-034)<br>0.16 (2026-11-09): RSK-BR-007 retitled and reworded to cover colliding identifiers: uniqueness obligation on the generator (BEH-BR-210, BEH-BR-016), the sink's keep-or-refuse rule (BEH-BR-193), installation check 8 for a provided generator; scores unchanged (F-03); RSK-BR-035 controls gain the superseded-build rule, the import commit, principal and annotations of the handoff steps and the lazy old side (U-02, U-04, U-05); RSK-BR-034 controls gain member readiness (U-03); RSK-BR-070 controls aligned with keyring BEH-KR-012 and the delivery companions: a tombstone makes fields decode as `Shredded`, an unreadable payload is parked or halts, never dropped (C-13); `receiveVerbatim` cited as event-store's (BEH-ES-030), reading through durable-bus `subscribeEnvelopes`; RSK-BR-007 states the default's random bound (122 bits per value) in place of "high probability" (CCR-BR-033)<br>0.15 (2026-11-09): RSK-BR-009 controls gain the shutdown destination and final snapshot (BEH-BR-105, BEH-BR-109); RSK-BR-029 controls gain a failing wrap on an optional or reactive capture (BEH-BR-152), verification check 26; no score changed (CCR-BR-032)<br>0.14 (2026-11-09): Introduction states the register's real range, RSK-BR-001 to RSK-BR-070 (CCR-BR-031)<br>0.13 (2026-11-08): RSK-BR-048 controls cite the command taint floor (replacing the withdrawn `TaintGuard` interception) and residual gains a command wrongly declared `readOnly`; RSK-BR-065 residual names a failed receipt `void`; scores unchanged (CCR-BR-029)<br>0.12 (2026-11-08): RSK-BR-057 controls and residual (idling and refused declarations, owner matching, `HostLink.none`, forged links); RSK-BR-059 undo controls; RSK-BR-061 controls and residual (plan and atomic validation, statement digests, confluence modulo the list); RSK-BR-062 residual for non-Effect members; scores unchanged (CCR-BR-029)<br>0.11 (2026-11-08): RSK-BR-064–070 added (command batches and receipts, stale data packs, a revocation without a `RefusalList`, event-store, sequence, keyring); RSK-BR-043–048 controls and residual notes extended, scores unchanged; remote round-2 risks summarised (CCR-BR-027)<br>0.10 (2026-11-08): RSK-BR-057–058 added; RSK-BR-032 controls extended, RSK-BR-026 and RSK-BR-028 gain controls, scores unchanged (CCR-BR-024); RSK-BR-059–060 added; RSK-BR-025, 033 and 035 controls extended, scores unchanged (CCR-BR-025); RSK-BR-061–063 added; RSK-BR-030 controls and residual, RSK-BR-017 and RSK-BR-044 gain the refusal list, scores unchanged (CCR-BR-026); identifier range to RSK-BR-063; §4 summary rows and consumer residual list extended<br>0.9 (2026-11-08): RSK-BR-052–056 added for residuals proposed by the federation and event delivery companions; §4 summary rows and the consumer residual list extended (CCR-BR-023)<br>0.8 (2026-11-08): RSK-BR-028 residual: provider-method attribution; RSK-BR-027 residual cites `CapabilityPolicy` (BEH-BR-273–275) (CCR-BR-022)<br>0.7 (2026-11-08): RSK-BR-025–027 added, RSK-BR-004, 010, 017 and 019 controls extended, scores unchanged (CCR-BR-017); RSK-BR-028–031 added, RSK-BR-013 reviewed (CCR-BR-018); RSK-BR-032–035 added, RSK-BR-013 and 014 reviewed (CCR-BR-019); `EntitlementView` added to the ports walked (CCR-BR-020); companion-origin RSK-BR-036–051 added, RSK-BR-006, 013 and 017 residual notes and the remote companion's risk pointer added, scores unchanged (CCR-BR-021)<br>0.6 (2026-10-03): RSK-BR-024 added (value port used to exfiltrate configuration values; controls from BEH-BR-188, BEH-BR-192, BEH-BR-197, ADR-BR-039); RSK-BR-008 reviewed — the `ConfigFingerprinter` port added as a path and its controls, scores unchanged; RSK-BR-014 owner in the §4 summary corrected to Core + Companion; `ConfigFingerprinter` added to the ports walked in §1; §4 residual list extended (CCR-BR-014)<br>0.5 (2026-10-03): RSK-BR-006 residual names three loss paths; RSK-BR-005 control notes the `reconcile` exception (BEH-BR-158) (consistency pass) (CCR-BR-013)<br>0.4 (2026-10-02): RSK-BR-023 controls justifying the residual named, cross-fiber residual allocated to RSK-BR-011 (whose controls now cover builds and finalizers, scores unchanged), owner and §4 residual list extended (re-issuing an ended intent); RSK-BR-004 and RSK-BR-006 reviewed for CCR-BR-007 and CCR-BR-008 (interruption before intent, record-only `Interrupted`, first terminal cause wins, `endsIntentOf`) — controls extended, scores unchanged; second review pass: `intent-ended` record and `resumes` (RSK-BR-004, RSK-BR-023), a dropped `requested` record fails its call at once (RSK-BR-006), mount edges child→parent, stops parking with a failing call, shutdown never parks and the cascade bound per build step (RSK-BR-023), forks of builds and finalizers (RSK-BR-011) — scores unchanged (CCR-BR-008)<br>0.3 (2026-10-02): RSK-BR-023 added (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This document assesses the hazards that `@bridger/core` itself could introduce into a regulated user's computerized system, scores them with the GAMP 5 FMEA method under the ICH Q9(R1) process, names the specified behaviours and invariants that control each one, and states the residual risk and who owns it. It defines the risk identifiers `RSK-BR-001` to `RSK-BR-070` that behaviours cite on their `**Risk:**` lines.

It is a **supplier-side** assessment of a component. It does not replace the regulated user's risk assessment of their system, which decides the extent of their validation (EU GMP Annex 11 §1). Every control named here is *specified*, not implemented, and every verification is *Planned*: nothing has been executed, so no residual score below is yet supported by evidence ([ADR-BR-036](../decisions/036-prospective-specification.md)).

## §1 Method

The assessment follows the quality risk management process of ICH Q9(R1) (2023).

| Step | What is done here |
| ---- | ----------------- |
| Risk identification | Hazards were identified by walking every mutating operation, every system transition, every port (`AuditSink`, `OperationGate`, `ConfigFingerprinter`, `AccessPolicy`, `CapabilityPolicy`, `CallLog`, `EntitlementView`, `Clock`, `IdGenerator`) and every concurrency rule of the specification, and asking how each could cause a GMP-relevant change to go unrecorded, misattributed, unapproved, wrong, or lost. The known gaps of [urs.md](../urs.md#7-known-gaps-and-open-items) and the lessons of the qadi precedent ([ADR-BR-028](../decisions/028-gxp-scope.md)) were inputs. |
| Risk analysis | Each hazard is described as a failure mode and its effect on GMP data and processes, and scored for Severity, Probability and Detectability (§2). |
| Risk evaluation | Severity and Probability give a risk class; class and Detectability give a priority (§2). Initial scores assume the general design but not the controls specific to the hazard. |
| Risk control | Each hazard names the behaviours (`BEH-BR`) and invariants (`INV-BR`) that reduce it, the risks those controls themselves introduce, and the residual score once the controls work as specified. A residual that core cannot reduce further is allocated to the companion or the consumer by name. |
| Risk communication | Risk identifiers are cited on the `**Risk:**` line of each controlling behaviour, in [traceability.md](../traceability.md) §7, and in the [compliance matrix](./02-compliance-matrix.md). Consumer-owned residuals are listed in §4 so that a regulated user can carry them into their own assessment. |
| Risk review | The register is reviewed on the triggers of §5 and re-scored under change control ([change control](../process/change-control.md) §3). |

**Formality proportional to risk.** ICH Q9(R1) asks that the formality of risk management match the level of risk and the importance of the decision. The whole register uses the same FMEA format because the library is assessed once for many deployments; the *rigour of verification* is what scales with risk, through the CSA mapping in the [validation plan](./04-validation-plan.md) §4.

**Reducing subjectivity.** ICH Q9(R1) recognises that risk scores carry subjectivity. To limit it here: every score uses the written anchors of §2 and nothing else; each Probability score is tied to a named triggering condition in the failure mode; each Detectability score names how the failure would or would not surface; each residual score names the control that justifies the change from the initial score; and Severity is not reduced by a control unless the control removes the consequence itself (not merely its likelihood). The scores are a single author's judgement and have not been independently reviewed ([change control](../process/change-control.md) §5); a regulated user should re-score them against their own intended use.

## §2 Scoring

Scoring follows the GAMP 5 Second Edition (2022) FMEA approach, with anchors written for a plugin runtime embedded in a GxP system. Each factor is scored 1, 2 or 3.

### Severity (S) — impact if the failure occurs

| Score | Level | Anchor |
| ----- | ----- | ------ |
| 3 | High | A GMP-relevant change or operation could take effect unrecorded, misattributed, unapproved, with the wrong code or configuration, or with a GMP write left partial — with potential impact on product quality, patient safety or data integrity |
| 2 | Medium | A GMP process or record is affected, but the effect is limited to availability or delay, or the missing information can be reconstructed from another system of record |
| 1 | Low | No effect on GMP data or decisions; diagnostic or convenience impact only |

### Probability (P) — likelihood of the failure mode

| Score | Level | Anchor |
| ----- | ----- | ------ |
| 3 | High | Expected in routine operation of a plugin host — every replace under load, every sink or gate outage, every operator call path — unless controlled |
| 2 | Medium | Plausible under specific but foreseeable conditions: races between concurrent operations, faults, misconfiguration, upgrades |
| 1 | Low | Requires a rare combination of conditions, or use contrary to the documented contract |

### Detectability (D) — likelihood that the failure escapes detection

The score expresses how likely the failure is to go **unnoticed**, so a higher number is worse. (GAMP 5 often labels the same scale by detectability itself, where "High detectability" corresponds to D 1 here.)

| Score | Level | Anchor |
| ----- | ----- | ------ |
| 3 | High | Unlikely to be noticed in normal operation; surfaces only through an incident or an investigation |
| 2 | Medium | Noticed by a routine check: record review, `verifyAuditSequence`, snapshot inspection, periodic review |
| 1 | Low | Surfaces immediately, as a typed error, a plugin state, an event or the audit-degraded latch |

### Risk class and priority

Risk class = S × P: **1–2 Low**, **3–4 Medium**, **6–9 High**.

Priority = class weight × D, where the class weight is Low 1, Medium 2, High 3, mapped with the same bands (1–2 Low, 3–4 Medium, 6–9 High):

| Risk class \ D | D 1 | D 2 | D 3 |
| -------------- | --- | --- | --- |
| Low (1) | Low (1) | Low (2) | Medium (3) |
| Medium (2) | Low (2) | Medium (4) | High (6) |
| High (3) | Medium (3) | High (6) | High (9) |

Each entry gives the initial scores (before the controls specific to it) and the residual scores (with those controls working as specified). The verification rigour applied to a control follows the **initial** class of the risk it controls ([validation plan](./04-validation-plan.md) §4): a control matters most where the uncontrolled risk is high.

## §3 Risk register

Controls cite behaviours, defined in the [behaviour files](../behaviors/01-plugin-definition.md), and invariants, defined in [invariants.md](../invariants.md). Verification names planned test types; `REQ-BR` scenarios are allocated in [traceability.md](../traceability.md) §5.

<a id="rsk-br-001"></a>
### RSK-BR-001: Provider closed mid-call

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A provider is removed, replaced, restarted or fails while a call is using its service, and the service's resources (a connection pool, an equipment session) close underneath the call. Trigger: any lifecycle change to a provider under load. |
| Effect on GMP data / processes | A GMP write or instrument interaction is cut off part-way, or fails with an error unrelated to its cause; a partial record may be left in the plugin's store. |
| Initial scoring | S 3 · P 3 · D 2 → class **High** (9) · priority **High** (6) |
| Controls | Leases hold an active provider for the duration of a call (BEH-BR-081, BEH-BR-082, BEH-BR-083, BEH-BR-084); a removed provider is hidden from new consumers at once (BEH-BR-042) and dependents stop before it (BEH-BR-043, BEH-BR-044); a provider that is not active cannot be leased (BEH-BR-076); draining is bounded (BEH-BR-085). Invariants INV-BR-006, INV-BR-005, INV-BR-017. |
| Risks introduced by controls | A lease held by a slow call delays removal: an availability cost, bounded by `drainTimeout`. Ending the drain by force interrupts the call — see [RSK-BR-015](#rsk-br-015). |
| Verification | Planned — property tests over generated interleavings of `use`, `remove`, `replace` and runtime failure under `TestHost`; REQ-BR scenarios for acceptance checks 1, 2, 12 and 18 of BEH-BR-183; mutation testing. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Remaining paths are uses outside a lease: a reference captured from `Runtime.optional` (BEH-BR-130) and kept past the call, or a service object stored by a plugin. These contradict the documented contract. Acceptable: closing them would need a sandbox, which is out of scope. |
| Owner | Core |

<a id="rsk-br-002"></a>
### RSK-BR-002: Stale build published

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A build started for an earlier intent finishes after a later `remove`, `replace`, `reconfigure` or `restart`, and its services are published anyway. Trigger: a lifecycle operation arriving while a build is in flight. |
| Effect on GMP data / processes | Consumers run a superseded plugin version or configuration while snapshots and records say the new one is active; GMP calculations use the wrong code, and the trail is inaccurate. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | A stale build is never published (BEH-BR-039); publication is atomic and a failed activation publishes nothing (BEH-BR-037); operations are linearized per plugin with intent recorded at the linearization point (BEH-BR-065, BEH-BR-066); each activation has a fresh scope and memo map (BEH-BR-036). Invariants INV-BR-004, INV-BR-003, INV-BR-009, INV-BR-014. |
| Risks introduced by controls | A discarded build has already run its acquisition effects; they are released by its scope, but any external side effect of the build itself is not undone (ADR-BR-004). |
| Verification | Planned — property tests that step `TestHost` through every ordering of build completion against incoming operations; REQ-BR scenarios for the in-flight table of BEH-BR-072; mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | The control depends on Effect's interruption and scope semantics ([RSK-BR-022](#rsk-br-022)). Records carry the `version` and `digest` before and after each change (BEH-BR-196), so a mismatch is detectable on review. Acceptable. |
| Owner | Core |

<a id="rsk-br-003"></a>
### RSK-BR-003: Silent retry repeats side effects

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A failed plugin is restarted automatically — on dependency return, on a timer, by reconcile — and each start repeats external side effects (re-sending a message to an MES, re-registering equipment). Trigger: any build or runtime failure. |
| Effect on GMP data / processes | Duplicate GMP-relevant actions in external systems, not visible in the plugin set, and not attributable to anyone. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Failure is sticky (BEH-BR-031, BEH-BR-096) and survives dependency loss and return; `retry` restarts only on request (BEH-BR-056); a failed replacement stays failed (BEH-BR-053); reconcile converges without retrying failures on its own (BEH-BR-160). Every retry of a failed plugin is an attributed, audited operator call (BEH-BR-198). The one automatic repetition core performs is a `background` fiber under the policy "restart", which the plugin author opts into per fiber and which re-runs that fiber only, never the build (BEH-BR-090). Invariant INV-BR-007. |
| Risks introduced by controls | Availability: a transient failure keeps the plugin down until someone acts. The consumer must monitor plugin state (snapshots, `Host.events`) and respond. |
| Verification | Planned — REQ-BR scenarios for acceptance check 10 of BEH-BR-183; property test that no transition leaves `failed` without an operator operation; mutation testing. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Side effects repeated within a single start, by a `background` fiber the author declared "restart", or by an operator's deliberate retry, remain; idempotence of external effects is the plugin author's and the consumer's. Acceptable: each retry is now visible and attributed. |
| Owner | Core (residual: Consumer) |

<a id="rsk-br-004"></a>
### RSK-BR-004: Unaudited lifecycle change

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin-set change takes effect with no audit record: through a path that bypasses the recorder (a `PluginHandle`, a reconcile entry, a child mount, a system transition), through an interrupted caller, or because the sink failed and the host carried on. Trigger: any lifecycle change. |
| Effect on GMP data / processes | The configuration of a computerized system changes without a trail; the gap supports neither 21 CFR 11.10(e) nor Annex 11 §9 and cannot be reconstructed later. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | A fixed check order for every mutating call (BEH-BR-188); one `requested` and one terminal record per admitted call (BEH-BR-198); system transitions recorded (BEH-BR-199), including child mounts (BEH-BR-126) and forced revocations (BEH-BR-086); every route uses the same tables (BEH-BR-077) and reconcile entries are audited individually (BEH-BR-158); caller interruption does not cancel the transition or its record (BEH-BR-067); a caller interrupted before its intent changes nothing and leaves a `failed` (`Interrupted`) record, and an approval is never consumed without a `requested` record (BEH-BR-188); an ended parked intent is recorded by its own `intent-ended` record, which names the parked call's `requested` record in `endsIntentOf` and the reverted override paths (BEH-BR-199), and a call that resumes a parked operation names it in `resumes` (BEH-BR-200); a change whose request cannot be recorded is not made (BEH-BR-203); an unwritten outcome sets the latch (BEH-BR-205). Invariants INV-BR-022, INV-BR-027, INV-BR-029, INV-BR-010. |
| Risks introduced by controls | Fail-closed refusal and the latch block operator changes during a sink outage — an availability cost, assessed as [RSK-BR-020](#rsk-br-020). Shutdown is exempt so that the safe direction stays open (BEH-BR-110). |
| Verification | Planned — property test that, for any generated operation script with injected sink faults and caller interruptions, admitted calls and records correspond one to one; REQ-BR scenarios for acceptance checks 32–34, 39 and 46 of BEH-BR-184; mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | With no sink wired there is no trail at all; the host reports `HostSnapshot.audit` as `"unwired"` (BEH-BR-194), and the regulated user must wire a sink and check this at installation. Changes made outside the host (directly to a plugin's store) are outside scope. Acceptable on that condition. |
| Owner | Core (residual: Consumer — wiring the sink) |

<a id="rsk-br-005"></a>
### RSK-BR-005: Unattributed change

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A change is recorded without an actor, or with the wrong one: inferred from a fiber or plugin, inherited from a stale `CurrentActor` in a forked fiber, or simply omitted by the caller. Trigger: any operator call. |
| Effect on GMP data / processes | The trail cannot say who changed the system; ALCOA+ *Attributable* and Annex 11 §12.4 are not supported. |
| Initial scoring | S 3 · P 3 · D 2 → class **High** (9) · priority **High** (6) |
| Controls | `Actor` and `OperationContext` on every mutating operation (BEH-BR-185, BEH-BR-186); a per-call context wins over `CurrentActor` (BEH-BR-187); `attribution.require` and `requireReason` turn omission into `Unattributed` or `ReasonRequired` before anything is changed, and, except for a `reconcile` whose diff recomputed at its intent needs a reason (BEH-BR-158), before anything is recorded (BEH-BR-189); identity is never inferred (BEH-BR-191); defaults change nothing (BEH-BR-192). Invariant INV-BR-025. |
| Risks introduced by controls | With `require` set, a caller that forgets its context fails — a deliberate availability cost. `CurrentActor` is a fiber reference, so long-lived fibers forked under a user's actor attribute later calls to that user unless the application resets it (ADR-BR-029). |
| Verification | Planned — REQ-BR scenarios for acceptance check 31 of BEH-BR-184; type-level tests that every mutating method accepts `OperationOptions`; mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) — within core's scope |
| Residual risk and acceptability | Core records the actor it is given. Whether that actor is the authenticated person is the consumer's identity binding (21 CFR 11.10(d), 11.300), and `attribution.require` defaults to `false`. Acceptable for core; the regulated user must carry identity binding and enabling `require` into their own assessment. |
| Owner | Core (residual: Consumer — identity binding) |

<a id="rsk-br-006"></a>
### RSK-BR-006: Undetected audit gap

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A record is lost between the host and the store — a failed write the host ignores, a skipped sequence number, a write that timed out but landed and was then written again, a sink that acknowledges and discards — and nobody notices. Trigger: any sink fault. |
| Effect on GMP data / processes | A trail believed complete is not; review cannot see what is missing. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | One writer, in order, retrying in place with the same `recordId` and `auditSeq` (BEH-BR-202); `auditSeq` contiguous from 1 per host (BEH-BR-212) and not consumed by a failed write (BEH-BR-213); an unwritten terminal, rejected or system record, and a `reconcile` parent record lost at shutdown, set the latch (BEH-BR-108, BEH-BR-205), which during shutdown, once the final snapshot is published, is set without a snapshot or event and reported by `Host.controls().closed` (BEH-BR-109, BEH-BR-205, BEH-BR-212); exactly one requested and one terminal record per admitted call, the first terminal cause winning, so a delayed `requested` record of an interrupted call is not answered twice (BEH-BR-198, BEH-BR-203); `verifyAuditSequence` detects gaps, duplicates and disorder (BEH-BR-215). Invariants INV-BR-023, INV-BR-029, INV-BR-022. |
| Risks introduced by controls | Retrying in place creates a duplicate in a sink that is not idempotent on `recordId`; `verifyAuditSequence` reports it. The latch blocks operator changes ([RSK-BR-020](#rsk-br-020)). |
| Verification | Planned — property tests of sequence contiguity under generated write failures and timeouts; property and unit tests of `verifyAuditSequence`; REQ-BR scenarios for acceptance checks 34–36 and 46 of BEH-BR-184; mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Core itself can lose records on four paths, all stated rather than hidden: a record dropped because the writer's queue (1024 records) is full is never numbered, so it leaves no gap in `auditSeq` — it is counted in `HostSnapshot.auditDropped`, logged, and sets the latch (BEH-BR-202, BEH-BR-205), and when it is a call's `requested` record the call fails at once with `AuditUnavailable`, changes nothing and has no terminal record; records still unwritten `auditTimeout` after the host closes are logged as lost and, when they were numbered, shown by `Host.controls().closed`, whose `CloseTail.lastWritten` stays below `lastNumbered` (a lost terminal, `rejected` or system record, numbered or not, also sets the latch, carried as `CloseTail.auditDegraded`, BEH-BR-205), while `requested` records still queued and never numbered are shown by the error log only — not by `CloseReport.auditDegraded`, which is produced before the close flush (BEH-BR-108, BEH-BR-208, BEH-BR-212, BEH-BR-213; CCR-BR-037); records still queued in process memory when the process dies are lost (BEH-BR-208); and, with a sink wired, the parent terminal record of a `reconcile` running when shutdown begins is lost when shutdown's wait for it ends without it — it is logged as lost by operation and `correlationId` (the fourth exception of BEH-BR-192) and sets the latch, so the report and `CloseTail` carry `auditDegraded: true` (BEH-BR-108, BEH-BR-205; CCR-BR-036, CCR-BR-037). Not detectable from `auditSeq` alone: loss of a host's entire trail, loss of the tail after the last stored record (which includes records queued when the process dies), and a sink that silently discards (ADR-BR-030, ADR-BR-037). Core keeps no copy (BEH-BR-208). These are the companion's adapter contract and the consumer's store and cross-host continuity checks. Acceptable for core on that allocation. |
| Owner | Core (residual: Companion + Consumer) |

<a id="rsk-br-007"></a>
### RSK-BR-007: Non-reproducible or wrong time, or colliding identifiers

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Core takes a timestamp or identifier from an ambient source (`Date.now()`, `performance.now()`, `crypto.randomUUID()`), so tests cannot reproduce it; a test clock or counter identifier source is left wired in production; or an identifier generator repeats a value — within one host, or across hosts that write to one store (two hosts given one prefix, a counter reset on restart, too few random bits). Trigger: a coding slip, a misassembled layer, or a provided generator whose design does not ensure uniqueness. |
| Effect on GMP data / processes | Records carry times that do not match the configured `Clock`; two hosts in one store share a `hostId`, two records a `recordId`, or unrelated calls a `correlationId`, so a reviewer cannot tell their records or chains apart and a sink meets a repeated `recordId`; executed tests cannot be reproduced, weakening the evidence. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | Every timestamp from `Clock` (BEH-BR-209), every identifier from `IdGenerator` (BEH-BR-210); every generated value unique within its host and across every host whose outputs reach a common store, an obligation stated on the generator, met by the default through the random bound of BEH-BR-210 (122 bits per value from a cryptographically secure source) and by construction by the test counter within one `TestHost` (BEH-BR-210, BEH-BR-179), the `hostId` among them (BEH-BR-016); a sink never drops a different record under a repeated `recordId` but keeps or refuses it, which makes a collision visible (BEH-BR-193); ambient time and randomness prohibited in core (BEH-BR-211); `TestHost` uses `TestClock` and a counter, in tests only (BEH-BR-179); clock accuracy delimited to the consumer (BEH-BR-216). Invariant INV-BR-024. |
| Risks introduced by controls | Injectable time and identifiers mean production values are only as good as what is injected, and core checks no identifier for repeats (BEH-BR-210). Installation must confirm the production `Clock` and `IdGenerator` are wired, and that a provided generator's design gives unique values across the hosts sharing a store ([validation plan](./04-validation-plan.md) §5.1, checks 5 and 8). |
| Verification | Planned — scripted unit tests that identical scripts under `TestClock` produce identical records; acceptance check 114 of BEH-BR-184 (uniqueness of the default and counter generators, the sink's handling of a collision); the planned house-style check for ambient calls in the merge gate ([Definitions of Done](../process/definitions-of-done.md)); for a provided generator, installation check 8 executed by the regulated user. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Accuracy and synchronisation of the clock source are the consumer's (Annex 11 §12.4, 21 CFR 11.10(e) time-stamping). The uniqueness of a provided generator's values is the consumer's, verified at installation; the default meets it by the random bound (a repeat is negligible, below 2^-50 among 2^36 values, not impossible) and a repeat is undetected by core, and a repeat that reaches a sink is kept or refused, never silently merged. Acceptable. |
| Owner | Core (residual: Consumer — clock synchronisation, a provided generator's uniqueness) |

<a id="rsk-br-008"></a>
### RSK-BR-008: Secret leaks into logs or audit

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A configuration value — a password, an API key, signing material — appears in an audit record, a gate request, an event, a log, an error message or a snapshot, or is handed to a consumer port that has no need of it. Trigger: any reconfigure, decode failure or diagnostic output, or a wired `ConfigFingerprinter`. |
| Effect on GMP data / processes | A secret enters a retained trail that cannot be purged without altering it, and is readable by everyone with access to the store; the GMP system's security is compromised. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Configuration values never observable, except that the values a wired `ConfigFingerprinter` selects are handed to that port and to nothing else (BEH-BR-103, BEH-BR-188); audit records carry configuration paths and, with a fingerprinter wired, the port's fingerprints — never values (BEH-BR-197); the gate request carries the same paths and fingerprints (BEH-BR-219); the port sees paths before any value and receives only the selected values, with no attribution (BEH-BR-188, BEH-BR-192), and a fingerprinter failure fails closed with a message core writes itself, carrying no port text, and a log naming no value (BEH-BR-188); `inspect` returns names and counts only (BEH-BR-118); events, spans, logs and metrics carry identities, not values (BEH-BR-114, BEH-BR-116, BEH-BR-117); snapshots omit values (BEH-BR-028); `ConfigInvalid` carries paths and expected forms only (BEH-BR-103); attribution reaches only the gate, the sink and — the calling fiber's actor and correlation only — the `CallLog`, whose entries are payload-free (BEH-BR-192, BEH-BR-276), save four named exceptions for the bare `correlationId`, an identifier carrying no actor, reason or value: `inspect().pending` (BEH-BR-118), the log and `reconcile-partial` event of a `PartialApply` (BEH-BR-324), the `HookDecisionRecord` on a hook point's `decisions` stream (BEH-BR-305), and the error-level log of a `reconcile` parent record lost at shutdown (BEH-BR-108) (BEH-BR-192). Invariants INV-BR-013, INV-BR-028. |
| Risks introduced by controls | The trail cannot answer "what was the value at time T"; the configuration source must keep value history under its own controls (ADR-BR-033). A path name reveals that a secret changed, not its value (accepted). |
| Verification | Planned — property test with a `Redacted` canary and generated configurations asserting that no value reaches any record, request, event, log or snapshot (acceptance check 37 of BEH-BR-184); REQ-BR scenarios for acceptance checks 55 and 56 of BEH-BR-184 (selected values only, no port text in messages); mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A plugin that logs its own configuration is outside core's control; code review of plugins is the consumer's. What a wired `ConfigFingerprinter` does with the values it selects, and whether its fingerprints reveal them, is the residual of [RSK-BR-024](#rsk-br-024). Acceptable. |
| Owner | Core (residual: Consumer — plugin code review, configuration-source history; the fingerprinter under RSK-BR-024) |

<a id="rsk-br-009"></a>
### RSK-BR-009: Silent resource leak on cleanup failure

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin's finalizer fails — a connection not closed, a file lock or equipment session held — and the host reports success or hides the failure. Trigger: any stop, remove, replace or shutdown of a plugin with fragile teardown. |
| Effect on GMP data / processes | A resource stays held without anyone knowing; a later start cannot acquire it, or a second writer appears. Effect is mainly on availability, but a hidden open session to an instrument or store can corrupt a later run. |
| Initial scoring | S 2 · P 2 · D 3 → class **Medium** (4) · priority **High** (6) |
| Controls | A cleanup failure is reported, never hidden (BEH-BR-046), and a stop that fails cleanup ends in `failed` with phase `cleanup` and `CleanupError` (BEH-BR-055); removing such a plugin records the leak as acknowledged rather than claiming recovery (BEH-BR-047); the legality table refuses other operations on it (BEH-BR-071); shutdown reports every failure, including through scope close (BEH-BR-106, BEH-BR-108), ends every stop it drives in removal or in `failed(cleanup)`, and leaves exactly the `failed(cleanup)` plugins in its final snapshot (BEH-BR-105, BEH-BR-109); revertibility limits are stated (BEH-BR-161). Invariants INV-BR-007, INV-BR-018, INV-BR-011. |
| Risks introduced by controls | A plugin in `failed(cleanup)` cannot be restarted until removed — an availability cost that makes the leak impossible to ignore. |
| Verification | Planned — REQ-BR scenarios with `Fault.stopFails` for removal, replace and shutdown (acceptance check 8 of BEH-BR-183); mutation testing. |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | The leak itself is not recovered: Effect cannot re-run finalizers. Recovering the leaked resource is an operational action for the consumer. Acceptable: the failure is visible and attributed when acknowledged. |
| Owner | Core (residual: Consumer — operational recovery) |

<a id="rsk-br-010"></a>
### RSK-BR-010: Changed service shape under unchanged ServiceId

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A provider is replaced by a version whose service interface or meaning changed (a field renamed, a unit changed) while its `ServiceId` stayed the same; consumers call it as before. Trigger: a plugin upgrade that does not follow the versioned-identifier convention. |
| Effect on GMP data / processes | Runtime errors at best; at worst a consumer silently misinterprets results and a GMP calculation is wrong. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Keys are matched by `ServiceId` (BEH-BR-006) and a changed shape needs a new `ServiceId` by convention (BEH-BR-007); two key objects sharing a `ServiceId` fail activation with `KeyMismatch` (BEH-BR-038); declared keys bound the build at compile time (BEH-BR-002); event keys are typed (BEH-BR-138). Invariant INV-BR-015. |
| Risks introduced by controls | `KeyMismatch` fails an activation that might otherwise have worked — an availability cost in exchange for not running mismatched code. |
| Verification | Planned — type-level tests for key identity and undeclared dependencies; REQ-BR scenario for acceptance check 11 of BEH-BR-183; mutation testing. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6). With the consumer controls below: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Core cannot detect a changed shape under an unchanged identifier ([URS](../urs.md#7-known-gaps-and-open-items) gap G5); the convention is documentation, not enforcement. Acceptable **only** with consumer controls: change control of plugin versions, regression testing before replacement, and a gate that checks the definition `digest` against an approved list (BEH-BR-219). This residual is transferred to the regulated user's assessment. |
| Owner | Consumer (core supplies the convention and `KeyMismatch`) |

<a id="rsk-br-011"></a>
### RSK-BR-011: Re-entrant deadlock via another fiber

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A callback holding a lease, a build or a finalizer waits, through another fiber, for an operation that must wait for that same lease or that plugin's transition step. Detection uses a carried reference, which another fiber does not carry, so the wait is not recognised. Trigger: plugin code that hands work to a separate fiber and awaits it inside `use`, a build or a finalizer. |
| Effect on GMP data / processes | The operation and the call hang until the drain limit; the GMP process stalls. No data is altered. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | A re-entrant wait in the same fiber lineage fails fast with `WouldDeadlock` (BEH-BR-088) — from a lease callback (carried in `HeldPlugins`), a build, `load` or finalizer of the activation scope, or a fiber one of these forks and awaits (carried in `CurrentTransition`) — including inside optional and reactive use (BEH-BR-136); a `shutdown` from a build, `load` or finalizer fiber fails the same way before its `requested` record, while a lease callback's `shutdown` is ended by the overall shutdown limit (BEH-BR-105); both references are exported so that a companion handing work to another fiber (a remote callback, BEH-RM-022) can carry them (BEH-BR-088); builds are bounded (BEH-BR-040); every drain is bounded unless declared forever (BEH-BR-085); a stalled plugin is reported (BEH-BR-120). Invariants INV-BR-016, INV-BR-017. |
| Risks introduced by controls | `WouldDeadlock` fails a call that would otherwise have hung. One false positive is stated as a limit (CCR-BR-036): a fiber a build, `load` or finalizer forks without awaiting it and outside `background` or `whenAvailable` (with `forkScoped` or `forkDaemon`) keeps the plugin in `CurrentTransition` for life, since the host does not track it, so its guarded calls on that plugin, its `awaitIdle` and its `shutdown` are refused after the step has returned, when no cycle remains (BEH-BR-088). The refusal is a typed error, never a hang or a lost change; the remedy is to run such work in `background`. Plugin names in both references are realm-qualified, so a lease or step in one realm never refuses an operation on the same id in another (BEH-BR-088). |
| Verification | Planned — scripted unit tests for `WouldDeadlock` (acceptance check 3 of BEH-BR-183; from a build and a finalizer, check 48 of BEH-BR-184) and for drain bounds. |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | The cross-fiber case remains undetectable ([URS](../urs.md#7-known-gaps-and-open-items) gap G6) and is bounded by the drain limits, which surface as `DrainTimeout`, and by `buildTimeout` for a build. It is also the cross-fiber residual of [RSK-BR-023](#rsk-br-023). Acceptable. |
| Owner | Core |

<a id="rsk-br-012"></a>
### RSK-BR-012: Lossy event feed mistaken for audit trail

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer builds its trail by subscribing to `Host.events` or `Host.changes`. The events feed is a sliding buffer that drops the oldest entries for a slow subscriber; the state feed is latest-wins. Trigger: a dashboard-style integration reused for compliance. |
| Effect on GMP data / processes | A trail that silently loses entries under load, believed complete. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | `Host.events` is specified and documented as a diagnostic feed, not an audit trail (BEH-BR-113), and loss shows as a gap in `seq` (BEH-BR-115); `changes` is latest-wins by specification (BEH-BR-030); the audit trail is a separate channel (BEH-BR-207); attribution reaches only the gate, the sink and — actor and correlation only — the `CallLog`, which records calls through captures and is not an audit trail of plugin-set changes either (BEH-BR-192, BEH-BR-276); the one exception on `Host.events` is the bare `correlationId` of a `reconcile-partial` event, an identifier with no actor or reason (BEH-BR-192, BEH-BR-324), and a hook point's `decisions` stream, which follows the rules of `Host.events` and is not an audit trail either, carries the same bare `correlationId` in each `HookDecisionRecord` (BEH-BR-192, BEH-BR-305); the error-level log of a `reconcile` parent record lost at shutdown names it too, a log rather than a feed (BEH-BR-108, BEH-BR-192). Invariant INV-BR-008. Claims this library does not make, item 12 ([compliance matrix](./02-compliance-matrix.md) §5). |
| Risks introduced by controls | None. |
| Verification | Planned — REQ-BR scenario for acceptance check 15 of BEH-BR-183 (a slow subscriber sees a gap in `seq`); documentation gate check 11 (claims lint) over every document. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A consumer may ignore the documentation. Acceptable: the consumer's validation must identify which channel their trail uses. |
| Owner | Core (residual: Consumer) |

<a id="rsk-br-013"></a>
### RSK-BR-013: Realm mistaken for security boundary

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer uses realms to separate tenants, sites or products, believing a plugin in one realm cannot reach another's services or data; a plugin resolves `Bridger.Host` or a shared base service and reaches across. Trigger: multi-tenant or multi-site deployment. |
| Effect on GMP data / processes | GMP data of one site or product read or changed by a plugin meant for another. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | A realm changes resolution only (BEH-BR-145, BEH-BR-146), is stated not to be a security boundary (BEH-BR-150), and an interception changes neither leases nor other consumers (BEH-BR-152). Invariant INV-BR-020. ADR-BR-019. |
| Risks introduced by controls | None. |
| Verification | Planned — REQ-BR scenarios for acceptance check 26 of BEH-BR-184, including a scenario that demonstrates the documented non-guarantee (a plugin in one realm reaching the host); documentation review. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Plugins are trusted code in one process (URS assumption A1). Separation that matters for GMP must come from deployment — separate processes or hosts — and access control, both the consumer's. Acceptable on that allocation. |
| Owner | Consumer (core documents the limit) |

<a id="rsk-br-014"></a>
### RSK-BR-014: Approval bypass through the raw Host

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Approval is checked only by a wrapper, and a change reaches the host another way: a plugin or base service resolving `Bridger.Host`, a `PluginHandle`, a reconcile entry, a group operation, or a child that a gated plugin mounts from its build (a system transition, never gated: BEH-BR-126). Or a gate that crashes or hangs is treated as approval. Trigger: any code path that holds the raw host. |
| Effect on GMP data / processes | An unapproved change to the configuration of a GMP system (21 CFR 11.10(g), Annex 11 §10). |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | The gate is a port inside the host, with no default implementation (BEH-BR-217), consulted after attribution and validation and before any record (BEH-BR-218); it cannot be bypassed through the host it guards (BEH-BR-222), because every route uses the same tables (BEH-BR-077) and each reconcile entry is gated (BEH-BR-158); a gate that fails, hangs or is abandoned is a refusal (BEH-BR-221); events carry no veto over host operations (BEH-BR-144); optional ports are resolved once, at construction (BEH-BR-015); the test gate fixture makes no implicit decision (BEH-BR-182). The ungated child-mount route is bounded instead of gated: the parent's own install or replace is gated, its `allowChildren` (BEH-BR-263), which the install request carries to the gate, decides whether it may mount at all, a wired `AccessPolicy` decides each child request (BEH-BR-264), and a wired `RefusalList` refuses a listed digest at every start, system starts included (BEH-BR-267). Invariants INV-BR-027, INV-BR-026, INV-BR-050. |
| Risks introduced by controls | An unavailable approval service blocks every operator change; a gate call can hold an operation for up to `gateTimeout` (60 s, or forever only when declared). Approval should be obtained before the call so the gate only checks it ([ADR-BR-032](../decisions/032-operation-gate.md)). Shutdown is not gated. |
| Verification | Planned — property test that every route to every mutating operation consults the gate exactly once per action; REQ-BR scenarios for acceptance check 32 of BEH-BR-184 (refusal, gate defect, `gateTimeout`); mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Outside the guarantee: an unwired gate (no approval at all), a second host built by consumer code, direct access to plugin stores, and the children a plugin installed with `allowChildren` at its default (true) mounts, which no gate sees one by one; a consumer who needs them approved sets `allowChildren: false` or wires an `AccessPolicy`. These are the consumer's configuration and access control; approval capture is the companion's. Acceptable on that allocation. |
| Owner | Core (residual: Consumer + Companion) |

<a id="rsk-br-015"></a>
### RSK-BR-015: Forced revocation interrupts a GMP write

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A drain reaches its limit and is forced — by an operator's `force`, by the host revoking at the drain limit after a runtime failure, or by shutdown's overall limit — and a callback is interrupted in the middle of a GMP write. Trigger: a slow call during removal, failure or shutdown. |
| Effect on GMP data / processes | A partial write in an external store; ALCOA+ *Complete* and *Accurate* at risk for that record. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | A leased provider does not close under its lease except by explicit force or at a declared limit (BEH-BR-085, BEH-BR-045); force interrupts with `LeaseRevoked`, waits for the callback's finalizers, and is reported and audited as `lease-revoked` (BEH-BR-086, BEH-BR-199); the host revokes only at the drain limit when there is no caller (BEH-BR-095); shutdown forces only after its overall limit (BEH-BR-107); the same drain and force rules hold for generations and registries, which report a forced revocation on their own `revocations` feeds and write no audit record (BEH-BR-174, BEH-BR-167). Invariants INV-BR-017, INV-BR-006. |
| Risks introduced by controls | Declaring `drainTimeout: "forever"` avoids forced interruption but can hold a removal indefinitely — an availability trade-off the consumer chooses explicitly. |
| Verification | Planned — REQ-BR scenarios for acceptance checks 2, 12 and 22 (force, finalizers, `LeaseRevoked`) and a `lease-revoked` system record; mutation testing. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 1 → class **High** (6) · priority Medium (3). With atomic external writes (consumer control): S 1 · P 2 · D 1 → class Low (2) · priority Low (1). |
| Residual risk and acceptability | Interruption at a declared limit is by design and is always visible. Whether it can leave a partial write depends on the plugin's write being atomic (a transaction, or an idempotent retry), which is the plugin author's and the consumer's. Acceptable only with that control; transferred to the regulated user's assessment. |
| Owner | Core + Consumer |

<a id="rsk-br-016"></a>
### RSK-BR-016: Hidden runtime failure

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin's background fiber dies, or its health degrades, while the host still shows it `active`; consumers keep calling a service that no longer works. Trigger: any runtime fault in long-running plugin work. |
| Effect on GMP data / processes | A GMP process relies on a component that has stopped processing; data are not processed, or processed by a half-working service. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Supervised background work and its failure policy (BEH-BR-090); `reportFailure` is an immediate runtime failure (BEH-BR-091); health checks run only while active (BEH-BR-092); three signals lead to one runtime-failure transition that stops dependents first (BEH-BR-094) and is sticky (BEH-BR-096, BEH-BR-031); activation outcomes are state (BEH-BR-021); a failing child does not hide its own failure (BEH-BR-123); reactive failures follow the same policy (BEH-BR-134); `emit` listener failures are not runtime failures of the plugin but are reported as `listener-failed` host events (BEH-BR-141); system transitions are recorded (BEH-BR-199) and never gated (BEH-BR-223). Invariant INV-BR-007. |
| Risks introduced by controls | A runtime failure stops dependents, cascading unavailability through the dependency graph — intended, because dependents of a failed provider cannot be trusted either. |
| Verification | Planned — REQ-BR scenarios with `Fault.runtimeFailure` and failing health checks (acceptance checks 5 and 14 of BEH-BR-183); mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A plugin that hangs without failing, and declares no health check, stays `active`. So does a plugin whose `background` fiber fails under the policy "ignore" (logged at error level only) or keeps failing under "restart" until its schedule is exhausted (BEH-BR-090). Declaring health checks, choosing those policies and monitoring state are the plugin author's and the consumer's. Acceptable. |
| Owner | Core (residual: Consumer) |

<a id="rsk-br-017"></a>
### RSK-BR-017: Unverified dynamically loaded code

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin definition produced by a dynamic import comes from the wrong source, an unapproved version, or has been altered; the host installs it. `meta.digest` is a label the host compares, not a verification it performs. Trigger: any dynamic installation. |
| Effect on GMP data / processes | Unapproved or altered code runs inside a GMP system. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Entries have no import-time side effects, so importing alone changes nothing (BEH-BR-008); a definition is an inert record (BEH-BR-001); `meta` is opaque except where named (BEH-BR-104); the gate request carries the definition's `version` and `digest`, so a consumer gate can refuse anything not on an approved list (BEH-BR-219); records carry `version` and `digest` before and after (BEH-BR-196); removal releases behaviour, not imported code (BEH-BR-048); a wired `RefusalList` refuses every start of a revoked digest, system starts included (BEH-BR-267, RSK-BR-061). Companion `@bridger/loader` (Draft): its gate piece refuses an install or replace whose digest no current loader or catalog acceptance covers, and an exemption by digest counts as a pinned acceptance, never refused "verification-unknown" (loader BEH-LD-015, CCR-LD-007); an `enable`, `retry`, `restart` or `reconfigure` of an installed digest with no verification record is refused "verification-unknown" while a signer is revoked, unless the digest is pinned or exempt (loader BEH-LD-015, CCR-LD-008). |
| Risks introduced by controls | A digest-checking gate adds an approval step and its latency to every install and replace. |
| Verification | Planned — REQ-BR scenarios showing the gate receives `definition.version` and `definition.digest` and that the records carry them; scripted unit test that installing does not import or execute anything beyond the definition. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6). With consumer provenance checks gated on `digest`: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Core never verifies, signs or sandboxes code (ADR-BR-027); a digest is only as good as the consumer's process for computing and approving it. Acceptable only with consumer controls: provenance and integrity checks before installation and a gate that enforces them. Transferred to the regulated user's assessment. |
| Owner | Consumer (core supplies the seam and the record) |

<a id="rsk-br-018"></a>
### RSK-BR-018: Over-claiming qualification evidence

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Documentation or an evidence report claims more than was tested: presence checks reported as behaviour tests, hand-entered or hardcoded passes, specified behaviour described as met, "Part 11 compliant" in a README, an in-memory test sink described as a trail. Trigger: pressure to present a complete package — the qadi predecessor's failure ([ADR-BR-028](../decisions/028-gxp-scope.md)). |
| Effect on GMP data / processes | A regulated user relies on false assurance in a validation decision; a defect that the evidence claimed to exclude reaches GMP use. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Required acceptance checks are enumerated, and an unexecuted check is reported as a gap (BEH-BR-183, BEH-BR-184); the in-memory sink and scripted gate are test fixtures only, with no implicit decision (BEH-BR-181, BEH-BR-182); an unwired sink claims nothing (BEH-BR-194); `verifyAuditSequence` is documented as not tamper evidence (BEH-BR-215); core's storage and review limits are stated (BEH-BR-208); the gate seam states which controls are not core's (BEH-BR-224). ADR-BR-035 and ADR-BR-036 govern evidence and wording. |
| Risks introduced by controls | Documents are heavier and every claim is hedged; nothing material. |
| Verification | Planned — documentation gate check 11 (claims lint) and check 8 (no Effective or Accepted status while implementation is absent), runnable today over the specification; once code exists, the evidence generator is itself tested so that it cannot report a pass the runner did not, and mutation testing (≥ 80%) shows the suite can fail. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | The specification has a single maintainer and no independent review ([change control](../process/change-control.md) §5); a lint catches words, not every misleading sentence. Acceptable only with the regulated user's own supplier assessment and review ([validation plan](./04-validation-plan.md) §10). |
| Owner | Core + Companion |

<a id="rsk-br-019"></a>
### RSK-BR-019: Conflicting concurrent operator actions

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Two operators, or an operator and reconcile, issue conflicting operations on the same plugin at once (one replaces while another disables); the outcome depends on timing, and one of them believes their change applied. Trigger: concurrent administration. |
| Effect on GMP data / processes | The system's configuration is not what an operator intended or recorded believing; delay while the discrepancy is found. The trail itself stays correct. |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Operations on one plugin are linearized in call order (BEH-BR-065); every pair resolves to proceed, no-op, join, supersede or conflict (BEH-BR-069) through the total state × operation and in-flight tables (BEH-BR-071, BEH-BR-072); joins, supersession and no-ops are recorded as such (BEH-BR-200); reconcile prunes only what it owns and serializes its actions (BEH-BR-155, BEH-BR-156). Invariants INV-BR-009, INV-BR-011. |
| Risks introduced by controls | Operators receive `Conflict` or `Superseded` and must re-issue or reconcile — a usability cost that makes the conflict explicit. |
| Verification | Planned — property tests over every state × operation × in-flight combination (acceptance check 4 of BEH-BR-183); REQ-BR scenario per table cell; mutation testing. |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | Coordination between operators is procedural and the consumer's. Acceptable: every outcome is defined, returned to the caller, and recorded. |
| Owner | Core |

<a id="rsk-br-020"></a>
### RSK-BR-020: Slow audit sink blocks the host

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The sink is slow or hangs; every mutation waits on it; drains and shutdown stall; or, under the fail-closed policy, the latch stops all operator changes until someone acknowledges. Trigger: a store outage or network fault. |
| Effect on GMP data / processes | Availability of the GMP system's change path: an operator cannot disable a misbehaving plugin during a sink outage. No change is made unrecorded. |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | `auditTimeout` bounds every wait on the sink (BEH-BR-204); one writer retrying in place (BEH-BR-202); the latch is explicit and visible in `HostSnapshot.auditDegraded` and as an event (BEH-BR-205), cleared only by an attributed, reasoned acknowledgement (BEH-BR-206); shutdown is never blocked by audit (BEH-BR-110). Invariant INV-BR-029. |
| Risks introduced by controls | This risk is itself largely introduced by the controls of [RSK-BR-004](#rsk-br-004) and [RSK-BR-006](#rsk-br-006): fail-closed refusal and the latch trade availability for a trail without unacknowledged gaps (ADR-BR-031). |
| Verification | Planned — REQ-BR scenarios with a hanging and a failing sink fixture (acceptance checks 32 and 34 of BEH-BR-184); property test that no operation waits longer than `auditTimeout` on the sink; mutation testing. |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | During a sink outage, operator changes stop by design; shutdown stays available. System transitions are not refused, but their records wait behind the record being retried (BEH-BR-202): they are delayed for the length of the outage and, once 1024 records are queued, later records are dropped unnumbered and counted (`auditDropped`). A sink that refuses a record for a reason that never clears (a deterministic refusal — a schema it cannot store, a canonicalisation it cannot perform, an ordering check it will always fail) therefore stops recording for the rest of the host's life, system records included, until the host is restarted with a sink that accepts the record. The regulated user's business-continuity planning (Annex 11 §16) must cover sink outages; a sink that needs longer than `auditTimeout` should buffer with its own durability rather than hold the host, and a sink or companion that wants to stop operator changes on a condition of its own (an anchoring backlog, say) should do so with a gate piece reading its status, not by failing writes. Acceptable as a deliberate trade-off. |
| Owner | Core + Consumer |

<a id="rsk-br-021"></a>
### RSK-BR-021: Wall-clock step reorders records

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The system clock steps backward (NTP correction, virtual-machine resume), or two records share a millisecond; a reviewer orders records by timestamp. Trigger: clock adjustment on the host machine. |
| Effect on GMP data / processes | The sequence of changes is reconstructed wrongly on review. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | `auditSeq` is authoritative for order and the wall clock is not (BEH-BR-214); `auditSeq` is contiguous per host (BEH-BR-212); records are written by one writer in sequence order (BEH-BR-202); timestamps come from `Clock` (BEH-BR-209); clock accuracy is delimited to the consumer (BEH-BR-216). Invariant INV-BR-023. |
| Risks introduced by controls | None. |
| Verification | Planned — scripted unit tests under `TestClock` that step time backward and assert `auditSeq` order is unchanged and `verifyAuditSequence` reports no disorder. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Review tools must order by `auditSeq`, not by `timestamp`; that is the consumer's. Acceptable. |
| Owner | Core (residual: Consumer — review tooling, clock) |

<a id="rsk-br-022"></a>
### RSK-BR-022: Defect in the Effect runtime

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A defect in Effect 4.x — interruption, scope finalization, `Layer` memoization, `PubSub`, `Clock` — breaks a property Bridger relies on. Bridger's guarantees are no stronger than Effect's (URS assumption A5). Trigger: an Effect release, or an untested combination of Effect features. |
| Effect on GMP data / processes | Any invariant can fail: a stale build published, a provider closed under a lease, a record lost. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | The deterministic test host (BEH-BR-177) and the full required acceptance suite (BEH-BR-183, BEH-BR-184) run against the exact Effect version pinned with the package; activation isolation and atomic publication are specified on top of Effect primitives (BEH-BR-036, BEH-BR-037). Invariants INV-BR-003, INV-BR-014. `effect` is the only runtime dependency (NFR-BR-006). |
| Risks introduced by controls | Pinning the Effect version delays fixes in Effect until a new Bridger release has re-run its suite. |
| Verification | Planned — the complete scripted suite (scenarios, property tests, type-level tests, mutation testing) executed against the installed package with the pinned Effect version; re-executed on every Effect version change ([validation plan](./04-validation-plan.md) §9). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Tests reduce but cannot exclude runtime defects, especially in true parallelism that `TestHost` does not reach deterministically. Acceptable with re-execution on every Effect upgrade, by the supplier and, for the system, by the regulated user. |
| Owner | Core (residual: Consumer — re-qualification on upgrade) |

<a id="rsk-br-023"></a>
### RSK-BR-023: Host transitions stall each other or complete under the wrong call

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A stop of a provider and an operation on one of its dependents wait on each other, or an unrelated operation waits behind a drain, so a change cannot be made or hangs; or a provider's removal completes a dependent's parked operation, so a dependent is unregistered or disabled under another operator's call. Trigger: concurrent administration of plugins linked by dependencies, with leases held. |
| Effect on GMP data / processes | Operator changes are delayed or blocked; in the second case a lasting change appears in the trail under a call that did not ask for it, attributed only through a causation link. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | No host-wide operation order; waits run only from a provider to its dependents, along a graph that includes mount edges from each child to its parent and stays acyclic (BEH-BR-078, BEH-BR-121); a cascade waits for a dependent's transition step, never its operation, and never overrules an operator operation that is not parked (BEH-BR-079); a cascade resumes a parked stop and ends the parked intent rather than completing it, and an `intent-ended` record with `endsIntentOf` records that the intent ended (BEH-BR-080, BEH-BR-199); when a call fails with `DrainTimeout`, every stop it drives that has not settled parks with it, so no stop is left waiting for a call that has returned (BEH-BR-079); a cascade with no caller revokes rather than parks (BEH-BR-095), and once shutdown has begun no stop parks (BEH-BR-105); a resumption is recorded on the resuming call, never as `joined` or `superseded` (BEH-BR-200). **Controls that justify residual P 1:** `WouldDeadlock`, carried by lease callbacks, builds and finalizers alike and checked before any wait and again at the linearization point (BEH-BR-088); the cascading call's own drain limit, which runs while it waits for a dependent's step (BEH-BR-079). **Controls that justify residual D 1:** a stall surfaces at once as `DrainTimeout` to the cascading call, naming the stuck plugin in `id` and the named one in `target` (BEH-BR-080), and a parked stop shows as `parked` in the snapshot and as a `stop-parked` event (BEH-BR-027, BEH-BR-114). Invariants INV-BR-030, INV-BR-002, INV-BR-016, INV-BR-017. |
| Risks introduced by controls | An operator whose parked operation was ended by a provider's removal must issue it again; the trail shows the ended intent through the `intent-ended` record. `retry` and `enable` on a parked system stop fail with `Conflict` ("dependency-loss") until another call resumes it. A cascading call's wait is bounded by its own drain limit for the plugin it named and for each plugin on the dependency path below it, plus `buildTimeout` for each build step it waits for — longer than one drain limit — and only for finalizers that return (BEH-BR-107). |
| Verification | Planned — the property test of INV-BR-030 over random histories on random acyclic graphs; REQ-BR scenarios for acceptance checks 43–45, 47 and 48 of BEH-BR-184; mutation testing. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | A wait closed through a fiber that does not carry the held-plugin reference — a hand-off to another fiber — is not this risk's residual: it is [RSK-BR-011](#rsk-br-011)'s, bounded there by drain limits and `buildTimeout`. What remains here is procedural: an operator must notice an ended intent and re-issue it if it is still wanted. Acceptable, with that step carried by the regulated user (§4). |
| Owner | Core (residual: Consumer — re-issuing ended intents) |

<a id="rsk-br-024"></a>
### RSK-BR-024: Value port used to exfiltrate configuration values

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A wired `ConfigFingerprinter` — the consumer's port that turns new configuration override values into fingerprints for the gate request and the audit record ([ADR-BR-039](../decisions/039-config-fingerprint-port.md)) — carries configuration values out of the host, by design or by mistake. The implementation keeps, logs or transmits the values it receives. Or it returns a "fingerprint" from which a value can be recovered — the value itself where it fits the fingerprint format, or an unkeyed hash of a short secret — so the value enters the gate request and every record. Or core hands the port more than it needs (unselected values, attribution), or forwards the port's error text, which may quote a value, into an error message or a log. Trigger: any `install` with `config` or `reconfigure` with a value while a fingerprinter is wired. |
| Effect on GMP data / processes | As for [RSK-BR-008](#rsk-br-008): a secret enters a retained trail that cannot be purged without altering it, or reaches a system outside the regulated user's controls; the GMP system's security is compromised. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | **Selection before values:** the port's `select` receives the operation, the target and the candidate paths only, never a value, and must return a subset of those paths; an empty selection calls nothing more (BEH-BR-188). **Only selected values handed over:** `fingerprint` receives only the selected entries, and core passes a value nowhere but to the port (BEH-BR-188, BEH-BR-103); the port is never called for clears, `intent-ended` reverts, resumptions, activation, source values or system transitions, where stored fingerprints are reused (BEH-BR-188, BEH-BR-197). **No attribution reaches the port:** no actor, reason, `correlationId` or other attribution is passed to either call (BEH-BR-192). **Answers checked:** exactly the selected paths, each once, each matching `^[A-Za-z0-9._:-]{1,200}$` (BEH-BR-188); records and the gate request carry the same fingerprints, and a fingerprint is not a configuration value (BEH-BR-197, BEH-BR-219). **Core-written messages and logs:** the failure message is written by core and names only the cause, never the port's text, and the failure is logged by operation and target, never a value (BEH-BR-188). **Fail closed:** a failure, defect, out-of-range selection, malformed answer or a call exceeding `fingerprintTimeout` fails the call with `ConfigFingerprintUnavailable`; nothing is changed, nothing is recorded and the gate is not called (BEH-BR-188). **The consumer owns the port:** core ships no implementation, reads the port once at construction, and an unwired fingerprinter changes nothing (ADR-BR-039, BEH-BR-015); the wiring is visible in `Host.controls` (BEH-BR-212). Invariants INV-BR-013, INV-BR-026, INV-BR-028. |
| Risks introduced by controls | Fail closed blocks every `install` with `config` and every `reconfigure` with a value while the port fails — an availability cost, bounded per call by `fingerprintTimeout` (5 s by default); clears and shutdown stay available. The format check cannot tell a fingerprint from a value that happens to fit the format, and core computes no hash, so it cannot judge whether a fingerprint reveals its value. Selection is the port's: a port that selects a secret path receives that secret. |
| Verification | Planned — REQ-BR scenarios for acceptance checks 55 and 56 of BEH-BR-184 (only selected values handed over, no attribution, fail closed with no record and no gate call, no port text in the message) and check 37 (no value in any record, request, event, log or snapshot); mutation testing. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9). With the consumer controls below: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Core limits what reaches the port and what comes back, but cannot control what the port does with the values it selects, nor whether its fingerprints reveal them. Acceptable **only** with consumer controls: the port under the regulated user's code review and change control; no secret or low-entropy path selected unless the port uses a keyed one-way function whose key it holds; no value kept, logged or transmitted by the port; installation check 7 of the [validation plan](./04-validation-plan.md) §5.1. Key management and the choice of fields are the companion's, for any fingerprinting it specifies ([ADR-BR-034](../decisions/034-gxp-companion-scope.md)). This residual is transferred to the regulated user's assessment. |
| Owner | Consumer + Companion (core supplies the narrowed port and fails closed) |

<a id="rsk-br-025"></a>
### RSK-BR-025: Declared contract version does not match the implementation

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A provider declares a contract version that satisfies its consumers' ranges, but its schemas or behaviour broke the add-only rules within the major: a field became required, a unit changed, an error member was added, a value's meaning changed. Or a dependent declares a range below the version it was compiled against and calls a method or field the range's lowest version lacks. Core's checks pass. Trigger: a contract release within a major that does not follow BEH-BR-230. |
| Effect on GMP data / processes | As for [RSK-BR-010](#rsk-br-010): runtime errors at best; at worst a consumer misreads a result and a GMP calculation is wrong — now under a version label that suggests compatibility was checked. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | The major is part of the `ServiceId`, so a declared breaking change cannot bind to old consumers (BEH-BR-225); ranges stay within one major (BEH-BR-226); registration-time range and method-name checks in both directions, with `IncompatibleContract` naming both plugins (BEH-BR-228); a plain key never binds to a contract by name alone (BEH-BR-229); documentation states the add-only rules and that core checks only method names and the major (BEH-BR-230); unknown fields ignored by every companion codec through one constant (BEH-BR-231); versions fixed at registration, never at build (BEH-BR-232); registry contributions checked against the registry's range (BEH-BR-233). Invariants INV-BR-015, INV-BR-031. |
| Risks introduced by controls | Registration checks add install-order sensitivity (a dependent needing an upgrade is refused until the provider is upgraded); a version label may be read as evidence of compatibility it does not carry. |
| Verification | Planned — REQ-BR scenarios for acceptance checks 59–61 of BEH-BR-184; property test of INV-BR-031; mutation testing of the range and method checks. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6). With the consumer and companion controls below: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Core compares declarations, not behaviour. Acceptable only with: a schema diff of every contract release against the previous one (the kit companion's contract check, `references/kit/`), conformance tests of providers against the contract, change control of contract packages, and a gate that checks definition digests against an approved list (BEH-BR-219). Transferred to the regulated user's assessment. |
| Owner | Consumer + Companion (core supplies version identity, range matching and the method check) |

<a id="rsk-br-026"></a>
### RSK-BR-026: Lazy plugin loads code other than what its manifest declared

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A lazy plugin is registered and approved from its manifest; when a trigger fires, `load` returns different code — another version, an altered package, a definition declaring other keys — or loads at a moment nobody can reconstruct. Trigger: any lazy activation, in particular after the package source changed between registration and first use. |
| Effect on GMP data / processes | Unapproved or altered code runs inside a GMP system; or which code ran when cannot be established from the record. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Nothing is loaded while `dormant` (BEH-BR-244, INV-BR-032); leaving `dormant` happens only on a trigger and is recorded as `lazy-triggered` with the trigger and its cause, then a `system-start` with the outcome (BEH-BR-245, BEH-BR-248); the loaded definition must match the manifest in `id`, `version`, `digest`, keys and contract references or fails with phase "load" and publishes nothing (BEH-BR-246, INV-BR-033); the gate sees the manifest at install and replace (BEH-BR-248); load failures are sticky and their messages written by core (BEH-BR-246); an idle return releases the loaded definition, so the next wake loads and checks again (BEH-BR-252). |
| Risks introduced by controls | A first use pays load latency and can fail on availability of the code source; the manifest check refuses code that differs only in a label. |
| Verification | Planned — REQ-BR scenarios for acceptance checks 63–65 of BEH-BR-184; mutation testing of the manifest comparison. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6). With loader checks of digest and signatures before evaluation: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Core compares the declared `digest` label; it cannot tell whether the code is the code the digest names ([RSK-BR-017](#rsk-br-017)). Acceptable only with a `load` that verifies digest and signatures before the code is evaluated (the loader companion, `references/loader/`) and a gate that approves manifests by digest. Transferred to the regulated user's assessment. |
| Owner | Consumer + Companion (core supplies the dormant state, the manifest check and the records) |

<a id="rsk-br-027"></a>
### RSK-BR-027: Consent-relevant manifest change applied unnoticed

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A `replace` or a `reconcile` entry installs a version whose manifest asks for more — a capability, a method, an egress host, a permission — or changes its publisher, tier or residency, and nobody who should consent sees it. Or a change in a field core does not classify is treated as harmless. Trigger: an upgrade through a desired list or an automated update. |
| Effect on GMP data / processes | A plugin gains access or data flows the regulated user did not approve; data may leave the intended residency. Within a host the labels constrain nothing unless a policy port or a process boundary enforces them. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | One manifest schema read by every party, unknown properties kept (BEH-BR-241); a pure, deterministic `consentDiff` with a fixed classification, where every unclassified difference counts towards `requiresConsent` (BEH-BR-243, INV-BR-034); the gate request carries the presented and the previous manifest, so a gate can refuse a widening without approval (BEH-BR-248); manifests must agree with their definitions (BEH-BR-242). |
| Risks introduced by controls | Treating unclassified changes as consent-relevant may ask for consent more often than needed. |
| Verification | Planned — REQ-BR scenario for acceptance checks 62 and 66 of BEH-BR-184; property tests of `consentDiff`. |
| Residual scoring | Core controls alone: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) (core acts on no diff). With a gate that requires approval when `requiresConsent` is true: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Core computes the diff and acts on none of it by design. Acceptable only with a consumer gate or companion that requires consent on widening, and with enforcement of requested capabilities by a policy port (`CapabilityPolicy`, BEH-BR-273–275) or an out-of-process boundary (`references/remote/`); a manifest that misdescribes what code does is outside every check here. Transferred to the regulated user's assessment. |
| Owner | Consumer + Companion (core supplies the schema, the diff and the gate input) |

<a id="rsk-br-028"></a>
### RSK-BR-028: Plugin principal or policy mistaken for isolation

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer reads `onBehalfOf`, mandatory interceptions, grants or the access policy as a guarantee that in-process plugin code cannot reach a service, name another plugin or act outside its grant, and runs untrusted code in-process on that basis. Trigger: third-party or partner plugins. |
| Effect on GMP data / processes | GMP data read or changed by code believed to be confined; misattributed plugin actions in the trail. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Principal minted only by the host and checked on every read (BEH-BR-257, BEH-BR-258); stated as attribution and policy, not isolation, in every file and type (BEH-BR-266, BEH-BR-278, BEH-BR-294); grants stated as shallow (BEH-BR-275); `CurrentCall` minted (BEH-BR-277); a root `lazy-triggered` record names the caller's principal as `onBehalfOf` (BEH-BR-253). Invariant INV-BR-035. ADR-BR-043, ADR-BR-019. |
| Risks introduced by controls | None. |
| Verification | Planned — check 67; a scenario demonstrating the documented non-guarantee (a plugin reaching a service through a leaked reference); documentation review. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Plugins are trusted code in one process (URS assumption A1). Untrusted code must run out of process behind a proxy plugin (`references/remote/`). Further residual: `onBehalfOf` names the principal of the calling fiber, so a host mutation that a provider's method makes while serving consumer A, without `Plugin.Runtime.asSelf`, is recorded on behalf of A, and one made from an application `Host.use` callback carries none (BEH-BR-258); a reviewer reads the field as "on whose behalf", not "whose module". Acceptable on that allocation. |
| Owner | Consumer (core documents the limit) |

<a id="rsk-br-029"></a>
### RSK-BR-029: A policy layer is bypassed or fails open

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A policy wrapper is shed by a child's `intercept`, missed on the `Host.use` route, or delivered without its layer after a wrap failure; an access or capability policy that throws, dies or times out is read as "allow". Trigger: children, application calls to `Host.use`, policy outages. |
| Effect on GMP data / processes | Access to a GMP service that the deployment's policy meant to withhold or log. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Mandatory interceptions inherited and unremovable, outside ordinary ones, applied to `Host.use` (BEH-BR-260, BEH-BR-261, BEH-BR-262); a wrap that fails never delivers the service, at activation or on a later optional or reactive capture (BEH-BR-152, BEH-BR-260); `allowChildren` only narrows (BEH-BR-263); access policy total and fail-closed (BEH-BR-264); capability policy fail-closed per route (BEH-BR-274); wiring visible (BEH-BR-265). Invariants INV-BR-036, INV-BR-038. |
| Risks introduced by controls | A policy outage refuses activations and `Host.use` calls: an availability cost, bounded by `resolutionTimeout`. |
| Verification | Planned — checks 26, 69, 70, 71, 72. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Routes outside Bridger's API (module imports, kept references) remain; see RSK-BR-028. Acceptable. |
| Owner | Core (residual: Consumer) |

<a id="rsk-br-030"></a>
### RSK-BR-030: Call log mistaken for a complete data-access record

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Calls not made through a captured service are absent from the call log, or entries are lost when `record` fails or times out, and the log is relied on as a complete record of data access. Trigger: sink outage, plugins keeping references. |
| Effect on GMP data / processes | A data-access review misses accesses. |
| Initial scoring | S 2 · P 2 · D 3 → class **Medium** (4) · priority **High** (6) |
| Controls | One entry per call including denied ones (BEH-BR-276); failures counted in `Host.controls.callLog.failed` and logged (BEH-BR-276); documentation states the log's coverage (BEH-BR-278); optional fail-closed policy "refuse" with a bounded queue and `CallLogUnavailable`, counters `dropped` and `refused` (BEH-BR-279); companion-offered entries (BEH-BR-280). Invariant INV-BR-037. |
| Risks introduced by controls | The hand-off queue holds entries in memory until `record` returns; under "refuse", RSK-BR-062. |
| Verification | Planned — checks 73, 107. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Completeness of the data-access record is the consumer's (fail-closed logging is available per capture, BEH-BR-279). Acceptable. |
| Owner | Consumer (core documents the limit) |

<a id="rsk-br-031"></a>
### RSK-BR-031: Annotation leaks a secret into the trail, or a label is lost

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A key declared with flow "audit" or "callLog" carries a configuration value or secret into records; or a taint is dropped along a chain (a supplied context, a bus hop, a background fiber) and a companion acts on untrusted input as trusted. Trigger: companion-defined keys; agent-driven changes. |
| Effect on GMP data / processes | Secret in the trail; an untrusted input drives a GMP-relevant change unflagged. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Flows declared per key (BEH-BR-289); `Redacted` refused, limits with omission by key id, no configuration-derived annotations (BEH-BR-293); monotonic keys combine and cannot be removed by a supplied context; event-flow keys cross the bus (BEH-BR-292); labels stated as carried, not enforced (BEH-BR-294). Invariants INV-BR-039, INV-BR-028. ADR-BR-033, ADR-BR-045. |
| Risks introduced by controls | Records grow by up to 4096 bytes. |
| Verification | Planned — checks 74, 75, 76. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A key owner that declares an "audit" flow for a secret, and code that starts from an empty bag, are outside core's control; key review is the consumer's. Acceptable. |
| Owner | Core (residual: Consumer and companion key owners) |

<a id="rsk-br-032"></a>
### RSK-BR-032: A hook decision made by unadmitted or failing code

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A contribution the application did not intend to give authority vetoes a decision (a regulated command), or a failing, slow or flapping contribution blocks or silently permits it; or a reviewer cannot tell which contribution decided. Trigger: any hook point used for a policy decision. |
| Effect on GMP data / processes | A GMP action wrongly refused or wrongly allowed; an operator blocked; a refusal with no accountable author. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Admission by the application's rule over the host-minted owner and application labels, no default rule (BEH-BR-298); only veto-role contributions decide (BEH-BR-300); closed veto vocabulary (BEH-BR-300); explicit failure policy and per-hook timeout (BEH-BR-302); per-dispatch deadline (BEH-BR-303); breaker per contribution (BEH-BR-304); decision record naming the decider (BEH-BR-305); no veto over host operations (BEH-BR-308); contributions' own `onError` within what the point allows and a breaker per plugin (BEH-BR-310); enrichment before veto so vetoes judge enriched values (BEH-BR-311); targets seen by admission and a policy deny recorded as "denied-policy" (BEH-BR-312); declarations of plugins not yet loaded woken or denied (BEH-BR-309, RSK-BR-057). Invariants INV-BR-040, INV-BR-041, INV-BR-042. ADR-BR-046, ADR-BR-050. |
| Risks introduced by controls | `onError: "deny"` turns a contributor outage into refusals (availability); `"skip"` lets a decision proceed without a failed contributor's say. The choice is the application's, per hook point. Decision records are on a lossy feed until the dispatcher stores them. |
| Verification | Planned — checks 77–80 and 92–95; property test of INV-BR-040; mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Core cannot judge whether the application's rule and labels are right, and an admitted in-process hook is not confined. Acceptable with consumer controls: the rule and labels under change control; the dispatcher storing decision records in its own trail; untrusted code out of process. |
| Owner | Core + Consumer |

<a id="rsk-br-033"></a>
### RSK-BR-033: An approval applied to a changed system

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plan or draft approved against one state of the host (or of an application aggregate) is applied after another change, so the change made is not the change approved; or a dry run applies by mistake. Trigger: approval workflows, agents proposing plugin sets. |
| Effect on GMP data / processes | An unapproved combination of plugin versions or configuration becomes active. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Read-only `Host.plan` as a separate method (BEH-BR-317); plan carries `registeredAt` per plugin and no values (BEH-BR-318); `reconcile` with `expect` re-checks at validation and at the intent and applies nothing when stale (BEH-BR-319); every entry still gated (BEH-BR-319, BEH-BR-320); drafts carry expected versions and `Draft.check` (BEH-BR-316); a deferred host operation is a refusal and must be re-issued and re-gated (BEH-BR-315); an atomic apply undoes a refused plan (BEH-BR-322–326); an entry's code is bound through `incoming.digest`, and a plan entry whose definition declares no `meta.digest` shows an `incoming` without `digest`, so the approver sees that the code is not bound (BEH-BR-318, BEH-BR-319). Invariant INV-BR-043. ADR-BR-047. Consumer: approve only plans whose `install` and `replace` entries carry a digest, or bind the code by its own control. |
| Risks introduced by controls | A busy host may make plans stale often (availability of the change process). |
| Verification | Planned — checks 81–83; differential property test of INV-BR-043, with a scenario in which a digest-less definition of the same version replaces the one planned and the plan is not stale. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) — reassessed (CCR-BR-036): a definition without `meta.digest` lets different code of the same version apply under an approved plan, detectable only by the missing digest |
| Residual risk and acceptability | Application drafts outside the host are protected only if the consumer applies them after `Draft.check` and re-checks atomically. For a definition without `meta.digest`, the code applied is not bound to the code reviewed (INV-BR-043, CCR-BR-035); the consumer must require digests on approved plans or bind the code itself. Acceptable; those parts are the consumer's. |
| Owner | Core + Consumer |

<a id="rsk-br-034"></a>
### RSK-BR-034: A realm family mistaken for data separation, or eviction cuts off work

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer relies on per-key realm families or ephemeral realms to keep one organisation's or task's data from another; or idle eviction removes a member while a call is in flight; or a failed member is silently rebuilt; or an ephemeral realm's teardown, refused by the gate or blocked by the audit-degraded latch, leaves its plugins running after the task. Trigger: multi-organisation hosts, sub-agent scopes. |
| Effect on GMP data / processes | Cross-organisation data exposure; a GMP write cut off; a build's side effects repeated without an operator. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | No tenant/isolation vocabulary and realm rules unchanged (BEH-BR-329, BEH-BR-150); all changes through attributed, gated, audited operations (BEH-BR-329, BEH-BR-331); eviction only by drain, never force (BEH-BR-333); failed members not recreated, a member whose plugin fails after it was ready marked failed, and a member whose readiness wait expired neither marked failed nor created again, the next use waiting for the same plugins (BEH-BR-331, BEH-BR-334); retirement only of empty realms (BEH-BR-335); an ephemeral teardown that cannot complete never bypasses the gate or the latch, stops, logs at error level and leaves its realm and plugins visible in the snapshot (BEH-BR-336); narrowed actors confer nothing (BEH-BR-337). Invariants INV-BR-044, INV-BR-020, INV-BR-007. ADR-BR-048. |
| Risks introduced by controls | Evictions can stall behind long leases (memory held longer); the ephemeral scope close forces at the limit (see RSK-BR-015). |
| Verification | Planned — checks 84–86; documentation review for vocabulary. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Data separation is not provided by core. Acceptable only with consumer controls: separation built into services (credentials, connections) or separate processes, justified in the consumer's assessment. An ephemeral realm whose teardown the gate refuses or the latch blocks outlives its task (URS-BR-039 is then met only once an operator removes it): the consumer monitors the error-level log and removes and retires such realms by procedure. |
| Owner | Consumer (separation, refused teardowns) + Core (eviction, retirement) |

<a id="rsk-br-035"></a>
### RSK-BR-035: Handed-off state lost silently, leaked, or imported wrongly

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | On `replace` (or on `restart` or a restarting `reconfigure` declared in `handoff.alsoOn`), a plugin's state is lost without trace (it then behaves differently while looking healthy), appears in a record or log, or is imported into a version that misreads it. Trigger: every replace of a plugin that declares a handoff. |
| Effect on GMP data / processes | Wrong in-memory GMP state after an upgrade; sensitive state in a retained trail. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Handoff only on replace of an active plugin, stop-then-start unchanged (BEH-BR-346); export after drain (BEH-BR-347); held state never observable (BEH-BR-348); versioned decode with `accepts`/`upgrade`, import failure fails the activation (BEH-BR-349); one `handoff` record per attempt with a loss tag (BEH-BR-350); abandonment rules, a `restart` or `reconfigure` that supersedes the new build keeping the value for the next build instead of losing it (BEH-BR-351); staleness decided before the import and the build committed once the import begins, so no discarded build consumes the state (BEH-BR-349, BEH-BR-039); export under the old activation's principal and import under the new one's, with no caller's actor or annotations (BEH-BR-347, BEH-BR-349, BEH-BR-258, BEH-BR-292); a lazy registration hands off only from its loaded definition, whose `handoff` is checked at load (BEH-BR-346, BEH-BR-246); the same rules on `restart` and a restarting `reconfigure` when declared, never on a volatile-only change (BEH-BR-353); a handoff skipped by `cold: true` writes one `handoff` record marked `cold: true`, and `cold` is carried on the call's gate request and records, so a requested cold start is visible to the gate and in the trail (BEH-BR-350, BEH-BR-353; CCR-BR-038). Invariant INV-BR-045. ADR-BR-049. |
| Risks introduced by controls | `handoffTimeout` lengthens a replace; an import failure leaves the plugin `failed` until an operator acts. |
| Verification | Planned — checks 87–88; sentinel-value scan. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Core cannot judge whether a decodable state is correct for the new version: that is the plugin's schema, `upgrade` and `import`, under the consumer's regression testing. Acceptable on that allocation. |
| Owner | Core + Consumer |

<a id="rsk-br-036"></a>
### RSK-BR-036: Stale or rolled-back desired state on a federated host

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A host of a federated fleet keeps running old instructions: a kill entry is missed, an old signed manifest is replayed, the host crashes during an apply, or its clock is set back so a stale manifest looks fresh. Trigger: a host offline or partitioned from the authority. |
| Effect on GMP data / processes | A revoked or unapproved plugin version keeps running in a GMP system after the decision to remove it. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/federation` (Draft, [references/federation/](../../federation/README.md)): monotonic manifest revisions with a persisted floor, kill entries applied at the next contact, an offline cap, re-bootstrap and freshness checks (BEH-FD-004, BEH-FD-007, BEH-FD-010, BEH-FD-012, BEH-FD-013, BEH-FD-016; INV-FD-001, INV-FD-003, INV-FD-009). Core: every manifest is applied through `reconcile`, attributed, gated and audited per entry (BEH-BR-155, INV-BR-021). |
| Risks introduced by controls | The offline cap can stop a host from accepting new loads while the authority is unreachable (availability). |
| Verification | Planned — the companion's REQ-FD scenarios; core REQ-BR scenarios for `reconcile`. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | An erased host store resets the revision floor to the boot bundle; storage protection is the consumer's. Acceptable on that allocation. |
| Owner | Companion + Consumer |

<a id="rsk-br-037"></a>
### RSK-BR-037: Unverified desired state applied

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A forged or locally edited host manifest drives `reconcile` on a federated host. Trigger: compromise of the delivery channel or of the host's local store. |
| Effect on GMP data / processes | Unapproved plugins or configuration become active in a GMP system. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/federation`: manifests verified before decoding (BEH-FD-002, BEH-FD-003; INV-FD-002) with the loader's signature policy ([references/loader/](../../loader/README.md)). Core: each entry still passes the `OperationGate` and is audited (BEH-BR-188, BEH-BR-218). |
| Risks introduced by controls | None beyond key management. |
| Verification | Planned — the companion's REQ-FD scenarios. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Custody of the authority's signing keys is the application's. Acceptable on that allocation. |
| Owner | Companion + Consumer |

<a id="rsk-br-038"></a>
### RSK-BR-038: Split-brain on a single-owner export

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | After a partition two hosts serve one single-owner contract and importers act on both. Trigger: network partition with failover. |
| Effect on GMP data / processes | Conflicting GMP writes from two owners of one function. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/federation`: authority-issued, increasing export fences checked by importers (BEH-FD-028, BEH-FD-029, BEH-FD-030, BEH-FD-031; INV-FD-007). Core: one provider per key per realm (BEH-BR-019, INV-BR-001). |
| Risks introduced by controls | A deposed owner's calls are refused once a newer fence is seen. |
| Verification | Planned — the companion's REQ-FD scenarios with partitions. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | An importer that has seen no newer fence trusts the old owner; effects done by a deposed owner are reported, not undone. Acceptable with the consumer's reconciliation of such effects. |
| Owner | Companion + Consumer |

<a id="rsk-br-039"></a>
### RSK-BR-039: Event lost, duplicated in effect, or processed out of order

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A business event delivered between hosts is lost (dual write, lost acknowledgement), applied twice, or applied out of order (a restored-backup origin reusing sequences, a poison message skipped); or accepted under an origin the sending peer does not own, since an envelope's `origin` is a claim of its sender that neither core nor the companion binds to the authenticated peer, so a peer can write into, or ahead of, another origin's (origin, stream) sequence. Trigger: outages, restores, redeliveries, a misconfigured or compromised peer. |
| Effect on GMP data / processes | A GMP fact missing, counted twice or applied in the wrong order on another host. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Event delivery companion (package `@bridger/durable-bus`, Draft, [references/durable-bus/](../../durable-bus/README.md)): outbox written in the caller's transaction, deduplicating inbox per origin, stream and sequence, origin incarnations, parked undecodable envelopes (BEH-DB-004, BEH-DB-009, BEH-DB-010, BEH-DB-011, BEH-DB-017–022; INV-DB-001–006); the bus never treats an envelope's origin as the sender's identity and states that binding origins to authenticated senders is the transport's and the deployment's, a transport that authenticates peers SHOULD refuse foreign origins unless the peer is a listed relay (BEH-DB-018). Core: the in-process bus makes no delivery promise and says so (BEH-BR-139). |
| Risks introduced by controls | At-least-once delivery shifts deduplication of external effects onto handlers. |
| Verification | Planned — the companion's REQ-DB scenarios and adapter conformance suite. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Persistence across power loss depends on the storage adapter's settings (BEH-DB-054), which are the consumer's; external effects of handlers are at least once (BEH-DB-024); binding each envelope's origin to the authenticated peer that sent it — peer authentication, and refusing foreign origins at the transport unless the peer is a listed relay — is the transport's and the consumer's deployment (BEH-DB-018, CCR-DB-005). Acceptable on that allocation. |
| Owner | Companion + Consumer |

<a id="rsk-br-040"></a>
### RSK-BR-040: Replay storm after a long outage

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Many hosts reconnect after an outage and replay at once, overloading the authority and peers. Trigger: a regional outage. |
| Effect on GMP data / processes | Delayed GMP processing; timeouts that look like failures. |
| Initial scoring | S 2 · P 3 · D 1 → class **High** (6) · priority **Medium** (3) |
| Controls | Event delivery companion: bounded replay, back-off and snapshots (BEH-DB-041–045; INV-DB-008). Federation companion: offline cap and re-bootstrap (BEH-FD-011, BEH-FD-013, BEH-FD-014). Core: every drain and wait is bounded unless declared forever (INV-BR-017). |
| Risks introduced by controls | Re-bootstrap replaces replay with a snapshot, losing intermediate history on that host. |
| Verification | Planned — the companions' REQ-DB and REQ-FD scenarios. |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | Capacity planning is the consumer's. Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-br-041"></a>
### RSK-BR-041: Clock skew corrupts ordering or freshness

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A fast or backward clock on one host reorders cross-host events or extends the freshness of a stale manifest. Trigger: unsynchronised clocks. |
| Effect on GMP data / processes | Events applied in the wrong order; a stale desired state treated as fresh. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Event delivery companion: hybrid logical clocks, never used as identity or authority order (BEH-DB-033–036; INV-DB-007). Federation companion: freshness checks (BEH-FD-016). Core: time only from `Clock` (BEH-BR-209, INV-BR-024). |
| Risks introduced by controls | None. |
| Verification | Planned — the companions' scenarios under `TestClock`. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Clock accuracy is the consumer's (BEH-BR-216). Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-br-042"></a>
### RSK-BR-042: Version skew between hosts runs an untested combination

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Federated hosts at different versions exchange calls or events in a combination nobody tested. Trigger: a staged roll-out. |
| Effect on GMP data / processes | Misread data between hosts at different versions. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Federation companion: N/N−1 skew handshake and refusal of older peers, N−1 replay check (BEH-FD-019, BEH-FD-020, BEH-FD-034; INV-FD-006). Event delivery companion: upcasters and versioned envelopes (BEH-DB-026, BEH-DB-028). Core: contract versions checked at registration (BEH-BR-228, INV-BR-031). |
| Risks introduced by controls | Older hosts are refused rather than served. |
| Verification | Planned — REQ-FD-024 and the REQ-DB upcaster scenarios. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Regression testing of each supported version pair is the consumer's. Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-br-043"></a>
### RSK-BR-043: Trust root or signature policy accepts unapproved code

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A compromised signing key, a mis-configured policy (threshold too low, one party holding both roles) or a trust root replaced through an unreviewed path lets the loader accept code nobody approved. Trigger: key compromise or configuration error. |
| Effect on GMP data / processes | Unapproved code runs in a GMP system with a digest that looks approved in the trail. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/loader` (Draft, [references/loader/](../../loader/README.md)): distinct signers across role branches, no permissive rule, trust roots only from configuration changed by replacing the loader (BEH-LD-020, BEH-LD-022, BEH-LD-023); signer revocation (BEH-LD-030). Core: the loader's replacement is itself gated and audited (BEH-BR-222); a lazy plugin's loaded definition must match its manifest (BEH-BR-246, INV-BR-033). |
| Risks introduced by controls | Double signing slows releases. |
| Verification | Planned — the companion's REQ-LD scenarios. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Key custody and policy review are the consumer's. Acceptable on that allocation. Round 2 (CCR-LD-003): one acceptance rule per statement type, with the type signed, so no key counts across purposes; the manifest `publisher` is bound to a configured signer (`PublisherMismatch`, loader BEH-LD-053); countersigning tooling in the kit (BEH-KT-032). |
| Owner | Consumer + Companion |

<a id="rsk-br-044"></a>
### RSK-BR-044: Revocation does not take effect

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The revocation channel is stale or suppressed, or a removal requested by the kill switch is refused by the gate, parked by a drain timeout or blocked by the audit latch; a revoked release keeps loading or running. Trigger: offline device, gate policy, long-running lease. |
| Effect on GMP data / processes | Code known to be faulty or compromised keeps running in a GMP system. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Companion `@bridger/loader`: signed monotonic lists persisted across restarts, explicit `maxAge` refusing new loads (BEH-LD-026, BEH-LD-027); kill switch status reports `pending` and `residentRevoked` (BEH-LD-029, BEH-LD-031); a revocation never reconciles: its only actions are `Host.remove` calls, under the revocation actor, for the scope's installed plugins whose digest the new set drops, so it undoes no operator change (BEH-LD-029, CCR-LD-009); an exemption by digest counts as a pinned acceptance, so a bundled plugin is not dropped "verification-unknown" after a signer revocation (BEH-LD-028, BEH-LD-070, CCR-LD-007); signer revocation is re-evaluated from the verification record alone — its signer identities, roles, accepting policy, publisher bindings and requirement — so it reaches digests accepted under a replaced loader and withdraws a package whose only publisher-binding signer is revoked (BEH-LD-030, CCR-LD-008, CCR-LD-009). Core: removal through the ordinary path (BEH-BR-154, INV-BR-021); the `RefusalList` port consulted on every start, which the kill switch feeds (BEH-BR-267, INV-BR-050). |
| Risks introduced by controls | `maxAge` refuses new loads while the channel is unreachable. |
| Verification | Planned — the companion's REQ-LD scenarios. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | The channel, the gate rule for revocations and restarts to reclaim resident code are the consumer's. Acceptable on that allocation. Round 2 (CCR-LD-003): the loader's revocation set backs core's `RefusalList`, so system starts of a revoked digest are refused (loader BEH-LD-056; G60 closed). Residual: an `active` plugin is stopped only by the kill switch's removal; a deployment that wires no `RefusalList` is RSK-BR-067. |
| Owner | Consumer + Companion |

<a id="rsk-br-045"></a>
### RSK-BR-045: Chain or anchor mistaken for tamper-proofing

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer adopts hash chaining and treats the chained trail as protected against alteration, while running it without an anchor, with receipts kept in the trail's own store or under the same credentials, with an anchor service the same insider controls, or with receipts never confirmed with the anchor service. Trigger: a sealing companion adopted without a threat model. |
| Effect on GMP data / processes | Records altered by a party with store access — including a full recomputation of the chain — pass review; a trail believed protected is not. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Core provides no tamper evidence and says so (BEH-BR-215, ADR-BR-027, ADR-BR-034 non-claim 5). Companion `@bridger/audit-chain` (Draft, [references/audit-chain/](../../audit-chain/README.md)): chain-only operation is an explicit, named configuration described as corruption detection (BEH-AC-016); receipts in a separate port and counted only once confirmed with the anchor service (BEH-AC-009, BEH-AC-020); reports bounded by `verifiedThrough` with no overall pass value (BEH-AC-022); no shipped anchor (BEH-AC-023); executed detection matrix (REQ-AC-011). Invariant INV-BR-023. |
| Risks introduced by controls | Fail-closed anchoring implemented by failing writes would add a cause of the audit-degraded latch and, because core's writer retries a refused record in place (BEH-BR-202), would hold every later record — system records included — behind it and drop records past the 1024-record queue; a refusal that never clears would stop recording altogether ([RSK-BR-020](#rsk-br-020)). The core-side recommendation is to refuse operator changes through a gate piece reading the companion's status instead, while the sink keeps accepting records. |
| Verification | Planned — the companion's acceptance checks 11 and 12 (REQ-AC-011, REQ-AC-012); documentation gate check 11 (claims lint). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Truncation of the unanchored tail, and a party able to rewrite both the trail store and the anchor store, are not detected by design. The independence of the anchor and the review procedure are the consumer's. Acceptable on that allocation. Round 2 (CCR-AC-003): stored ciphertext is hashed so shredding keeps the chain recomputable (audit-chain BEH-AC-028); offline bundles report receipts needing an online check as "not-checked", never confirmed (BEH-AC-034). |
| Owner | Companion + Consumer |

<a id="rsk-br-046"></a>
### RSK-BR-046: Entitlement lapse blocks an essential operation or stops a plugin

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A licence lapse, an outage of the entitlement service or an exhausted quota refuses work the regulated system must always perform, or a plugin is stopped or failed mid-call because of it. Trigger: any lapse or entitlement-service outage in a deployment using `@bridger/entitlement`. |
| Effect on GMP data / processes | A required GMP action is not performed, or a GMP write is left partial, for a commercial reason. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Companion `@bridger/entitlement` (Draft, [references/entitlement/](../../entitlement/README.md)): modes never map to lifecycle states and no lapse calls a host operation (BEH-EN-003, BEH-EN-015, INV-EN-002); removal, disabling, recovery and shutdown never refused (BEH-EN-012, INV-EN-001); essential labels pass every helper and are counted (BEH-EN-007, BEH-EN-020, INV-EN-005); unavailability policy has no default (BEH-EN-005). Core: `Plugin.Runtime.entitled` interprets no mode and changes no state (BEH-BR-089, INV-BR-026); leases hold a provider for a call (BEH-BR-081, INV-BR-006). |
| Risks introduced by controls | Essential labels can be over-applied, letting unpaid work run; counted in `Entitlement.inspect`. |
| Verification | Planned — REQ-EN-006, REQ-EN-010, REQ-EN-013 of the companion; core acceptance check 91 (REQ-BR-091). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Depends on the consumer labelling every essential use; a missing label leaves that use refusable. Acceptable with the consumer's identification of essential operations in its own assessment. Round 2 (CCR-EN-003): grant narrowing of a lapsed plugin's captures through `CapabilityPolicy.changes` (entitlement BEH-EN-025–029, INV-EN-006; core BEH-BR-281); control-introduced hazard: a wrong read-only classification leaves a writing member callable (entitlement traceability §3 item 4). Scores unchanged. |
| Owner | Companion + Consumer |

<a id="rsk-br-047"></a>
### RSK-BR-047: Toolset taken for authorization

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A deployment treats membership of a toolset as permission and wires no command gate, or a selector offers a command the application meant to require approval for. Trigger: agent or MCP deployment with a custom selector. |
| Effect on GMP data / processes | A GMP-relevant command runs on an agent's or external client's request without approval. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/command` (Draft, [references/command/](../../command/README.md)): membership grants nothing; every dispatch passes the gate (BEH-CM-011, BEH-CM-022, INV-CM-005); the default selector excludes regulated commands (BEH-CM-021); no gate implementation is shipped, so an unwired gate is visible (BEH-CM-011); MCP calls pinned to the listed digest (mcp BEH-MC-004, INV-MC-007; CCR-MC-003). Core: the gate port ships no implementation (BEH-BR-217); the generic gate fails closed (BEH-BR-313). |
| Risks introduced by controls | None beyond approval latency. |
| Verification | Planned — REQ-CM-007 and REQ-CM-011 of the companion. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | An application that wires no gate and a permissive selector has no approval; that is its configuration. Acceptable on that allocation. |
| Owner | Consumer (the companion documents the limit) |

<a id="rsk-br-048"></a>
### RSK-BR-048: Agent write approved automatically after untrusted input

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An agent session reads untrusted text (imported tool output, external documents) and an application gate's automatic-allow rule lets a resulting write through. Trigger: any agent with auto-allow rules and external inputs. |
| Effect on GMP data / processes | A GMP record changed as steered by third-party text, without a person. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Core: `Annotation.Taint` is monotonic and cannot be removed by a supplied context (BEH-BR-290, BEH-BR-292, INV-BR-039); labels are carried, not enforced (BEH-BR-294). Companions (Drafts): taint is monotone per session (BEH-AG-017, BEH-AG-018 in [references/agent/](../../agent/README.md)); imported output is always tainted (BEH-MC-020, INV-MC-003); the command catalog's taint floor withholds every automatic allow of a tainted request of a command not declared `readOnly` (command BEH-CM-016, INV-CM-006; `TaintGuard.drafts` supplies the draft, BEH-AG-020, INV-AG-001); inbound MCP sessions tainted unless trusted (mcp BEH-MC-002, INV-MC-006); field-level untrusted output and its envelope (command BEH-CM-030, agent BEH-AG-019, BEH-AG-023, INV-AG-007) (CCR-CM-003, CCR-MC-003, CCR-AG-003). |
| Risks introduced by controls | Approval friction for long sessions; approval fatigue is the application's to watch. |
| Verification | Planned — REQ-AG-006, REQ-AG-007, REQ-MC-010 of the companions. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Untrusted text that enters by a route the application did not mark (a user pasting it) is not tainted unless the application's `TaintPolicy` marks it; an application gate that accepts an agent's own approval defeats the control (`Actor.isWithin`, BEH-BR-337, helps a gate refuse it). A command wrongly declared `readOnly` reaches its effect from a tainted session on the gate's decision: the declaration is the author's and is not enforced (command BEH-CM-006); imported commands cannot carry it (mcp BEH-MC-020); a deployment can remove the exemption with `taintFloor.readOnly: "floor"` (command ADR-CM-005). No re-score: in-process authors are trusted code (ADR-BR-019). Acceptable with the consumer's policy. |
| Owner | Companion + Consumer |

<a id="rsk-br-049"></a>
### RSK-BR-049: Plugin set changed by an agent without approval

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An agent or MCP client uses host tools to install, replace or remove plugins. Trigger: the MCP companion's apply tool enabled. |
| Effect on GMP data / processes | Unapproved change to the configuration of a GMP system. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Companion `@bridger/mcp` (Draft, [references/mcp/](../../mcp/README.md)): apply absent unless installed with `apply: true`, always regulated, passes the command gate, refused when the plan is stale (BEH-MC-025, BEH-MC-029). Core: `Host.plan` is read-only and `reconcile` with `expect` applies nothing when stale (BEH-BR-317, BEH-BR-319, INV-BR-043); each entry passes the `OperationGate` and is audited (BEH-BR-158, BEH-BR-222). |
| Risks introduced by controls | Two gates to configure. |
| Verification | Planned — REQ-MC-011, REQ-MC-012 of the companion; core REQ-BR-083. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | A deployment with neither gate wired has no approval. Acceptable on the consumer allocation. |
| Owner | Core + Companion (residual: Consumer) |

<a id="rsk-br-050"></a>
### RSK-BR-050: Development reload reaches a controlled host

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A file-watching reload tool replaces plugins on a host that feeds a regulated record or has an approval gate, so unreviewed edits become recorded production changes. Trigger: pointing `bridger dev` at a production entry, or a similar tool. |
| Effect on GMP data / processes | Unreviewed code active in a GMP process; records attribute the change to a service actor with a non-business reason. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Companion `@bridger/kit` (Draft, [references/kit/](../../kit/README.md)): `dev` creates its own host and refuses to start when a sink, gate or fingerprinter is wired (BEH-KT-026); every reload is a core `reconcile` or `replace`, attributed to `bridger-dev` with reason "dev reload: …" and gated and audited like any change (INV-KT-004). Core: no internal path for tools; every mutation is attributed and gated (BEH-BR-188, BEH-BR-218). |
| Risks introduced by controls | A developer cannot reproduce gate behaviour in `dev`; they use `PluginTest` with a scripted gate. |
| Verification | Planned — REQ-KT-017 of the companion. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Acceptable with the consumer's change control forbidding development tooling against qualified environments. |
| Owner | Companion + Consumer |

<a id="rsk-br-051"></a>
### RSK-BR-051: Facade or generated SDK hides a contract mismatch

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Sugar (facade, generated SDK) type-checks while a provider does not honour its contract: a method reaches an undeclared service at call time, a handler returns data that the contract does not describe, or a contract evolves with a breaking change under the same major. Trigger: authors trusting "it compiles". |
| Effect on GMP data / processes | Wrong or missing data from a plugin or partner used in a GMP process. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/kit`: the facade checks build requirements and states what it cannot see (BEH-KT-003); the SDK checks input and output against the contract on every call (BEH-KT-034); conformance suites per version, frozen, run cumulatively within a major (BEH-KT-017, BEH-KT-018, BEH-KT-021); `check` classifies contract changes by BEH-BR-230 (BEH-KT-028). Core: version check at registration (BEH-BR-228, INV-BR-031). |
| Risks introduced by controls | A passing suite may be read as proof of conformance; reports say "passed N of N" only (BEH-KT-022). |
| Verification | Planned — REQ-KT-003, REQ-KT-012–015, REQ-KT-018, REQ-KT-021 of the companion. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Acceptable with the consumer's own acceptance testing of each provider version. |
| Owner | Companion + Consumer |

<a id="rsk-br-052"></a>
### RSK-BR-052: A deposed owner keeps acting for importers that have not seen the new fence

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The authority moves a single-owner export to a new owner and raises its fence; importers that have not yet seen the higher token keep calling the old owner, which still serves them, while importers that have seen it call the new owner. Two owners are live at once for different importers. Trigger: a partition or a slow sync during an ownership move. |
| Effect on GMP data / processes | Conflicting GMP writes from two owners of one function, each accepted by the importers that called it. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/federation` (Draft, [references/federation/](../../federation/README.md)): a fence protects each importer and the limit is documented ([BEH-FD-028](../../federation/behaviors/04-exports-and-imports.md#beh-fd-028-a-single-owner-export-carries-a-fence)); importers keep the highest token seen and refuse lower ones (BEH-FD-029, INV-FD-007); no automatic takeover (BEH-FD-030); an export withdrawn or moved is refused at once (BEH-FD-031). Core: one provider per key per realm (BEH-BR-019, INV-BR-001). |
| Risks introduced by controls | None beyond RSK-BR-038; the fence check placed in the application's storage can refuse a legitimate write of the new owner when the store has not seen its token. |
| Verification | Planned — the companion's REQ-FD scenarios with partitions during an ownership move. |
| Residual scoring | Companion controls alone: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9). With the consumer control below: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | The package cannot reach an importer that has not seen the new fence. Acceptable **only** with a consumer check of the fence where the effect lands — the owner's storage, a sequence it allocates — and the consumer's reconciliation of effects done by a deposed owner. This residual is transferred to the regulated user's assessment. |
| Owner | Consumer (the companion documents the limit) |

<a id="rsk-br-053"></a>
### RSK-BR-053: Offline boot drops plugins the loader cache does not hold

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A federated host restarts without network. It holds no resolved definition after the restart, and every manifest entry whose digest the resolver cannot resolve from local, content-addressed storage is dropped from the desired list and not run. Trigger: a process restart while offline, with a resolver that does not keep every digest of the highest verified manifest. |
| Effect on GMP data / processes | A plugin required for a GMP process is absent until the network returns: availability and delay only. |
| Initial scoring | S 2 · P 2 · D 1 → class **Medium** (4) · priority **Low** (2) |
| Controls | Companion `@bridger/federation`: dropped entries are reported with their reason and the others still applied, and documentation states that offline boot is only as good as the resolver's local storage ([BEH-FD-005](../../federation/behaviors/01-host-manifest.md#beh-fd-005-a-manifest-projects-to-a-desired-list-without-evaluating-code)); boot applies the highest verified stored manifest, else the boot bundle (BEH-FD-010, INV-FD-004). Companion `@bridger/loader`: the resolver whose local cache keeps the digests (named by BEH-FD-005). Core: the desired list and keyed diff restart nothing for an unchanged entry once resolution returns (BEH-BR-153, BEH-BR-154). |
| Risks introduced by controls | A local cache of packages is code at rest on the host; its integrity rests on the loader's digest check at load (RSK-BR-043). |
| Verification | Planned — the companion's REQ-FD scenarios for a restart without network. |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | Acceptable with a resolver that keeps every digest of the highest verified manifest locally, which is the consumer's deployment choice. |
| Owner | Consumer + Companion |

<a id="rsk-br-054"></a>
### RSK-BR-054: Origin reused after a restore that was not announced

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A node's event store is restored from a backup and restarted without raising its incarnation; the restored store also restores the incarnation it recorded, so the start check passes, and the node issues (origin, stream, sequence) triples already used for other events. Receivers take the new envelopes for duplicates. Trigger: a restore without the operator step. |
| Effect on GMP data / processes | GMP facts published after the restore are missing on the receivers, or two different facts share one position in the order. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Event delivery companion (package `@bridger/durable-bus`, Draft, [references/durable-bus/](../../durable-bus/README.md)): an origin is (node, incarnation), the bus refuses to start when the configured incarnation is lower than the recorded one, documentation recommends keeping the incarnation outside the store's backups, and a receiver that still holds the first envelope stops the stream on two `eventId`s for one position ([BEH-DB-004](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-004-an-origin-is-an-incarnation-never-reused), BEH-DB-018, INV-DB-002). Core: event ids come only from `IdGenerator`, so two events never share an id (BEH-BR-210, INV-BR-024). |
| Risks introduced by controls | A stopped stream halts delivery from that origin until a person releases it. |
| Verification | Planned — the companion's REQ-DB scenarios for restore with and without a raised incarnation. |
| Residual scoring | Companion controls alone: S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6). With the consumer control below: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | The package cannot detect a restore whose configuration was not raised; only the conflict check at a receiver that still holds the first envelope reveals it. Acceptable **only** with the operator's procedure of raising the incarnation on every restore, replacement or wipe. This residual is transferred to the regulated user's assessment. |
| Owner | Consumer (the companion documents the limit) |

<a id="rsk-br-055"></a>
### RSK-BR-055: Envelopes lost when a receiver falls back past the sender's retention

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A receiver's store is restored, replaced or wiped and reports a watermark lower than one it acknowledged; the sender no longer retains some of the acknowledged envelopes and cannot resend them. Trigger: a receiver restore older than the sender's retention after acknowledgement. |
| Effect on GMP data / processes | GMP facts missing on the receiver; the stream stays stalled until a person accepts the gap or the receiver is re-bootstrapped. |
| Initial scoring | S 3 · P 2 · D 1 → class **High** (6) · priority **Medium** (3) |
| Controls | Event delivery companion: the relay reports `receiver-regressed` and `envelopes-lost` naming the sequences, resends what it still retains, and the watermark passes a missing range only through an attributed `acceptGap`, or a snapshot restore or re-bootstrap install that records each forward move as a `GapRecord` with reason "snapshot:" and its source, each with a recorded `GapRecord` ([BEH-DB-019](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-019-acknowledgement-follows-the-receivers-commit), INV-DB-003, INV-DB-006); a subscriber behind the retained history needs a snapshot (BEH-DB-044). Core: the actor of `acceptGap` is a core `Actor` (BEH-BR-185); the in-process bus makes no delivery promise (BEH-BR-141). |
| Risks introduced by controls | `acceptGap` can be used to move past a range that a longer wait or a re-bootstrap would have recovered; each use is attributed and listed. |
| Verification | Planned — the companion's REQ-DB scenarios for receiver regression within and beyond the sender's retention. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | The loss itself is not repaired by the bus. Acceptable with sender retention sized to the receivers' restore horizon and the consumer's procedure for accepted gaps and re-bootstrap. |
| Owner | Consumer + Companion |

<a id="rsk-br-056"></a>
### RSK-BR-056: Duplicate check stops past the inbox's retention

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A repeated (origin, stream, sequence) arrives after the inbox has purged the stored envelope's `eventId`; it is absorbed as a duplicate without the comparison that would reveal an equivocating origin. Trigger: an origin reused after an unannounced restore (RSK-BR-054) whose envelopes arrive past the inbox's retention. |
| Effect on GMP data / processes | A GMP fact published under a reused position is dropped silently on that receiver. |
| Initial scoring | S 3 · P 1 · D 3 → class **Medium** (3) · priority **High** (6) |
| Controls | Event delivery companion: the conflict check runs while the inbox holds the stored `eventId`, the limit is documented, and inbox retention SHOULD cover the senders' resend window ([BEH-DB-018](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-018-the-inbox-accepts-the-next-sequence-ignores-repeats-and-stops-at-gaps), INV-DB-004); origins are incarnations (BEH-DB-004). Core: event ids come only from `IdGenerator` (BEH-BR-210, INV-BR-024). |
| Risks introduced by controls | Longer inbox retention costs storage on the receiver. |
| Verification | Planned — the companion's REQ-DB scenarios for repeats before and after inbox retention. |
| Residual scoring | S 3 · P 1 · D 3 → class Medium (3) · priority High (6) |
| Residual risk and acceptability | Not detectable by design past retention. Acceptable only together with the operator's incarnation procedure of RSK-BR-054, which removes the cause, and inbox retention sized at least to the senders' resend window. This residual is transferred to the regulated user's assessment. |
| Owner | Consumer (the companion documents the limit) |

<a id="rsk-br-057"></a>
### RSK-BR-057: A lazy veto contributor passed over, so a policy decision fails open

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin that contributes a veto to a hook point is registered lazily; a dispatch runs before it is loaded, sees no registered veto and returns `Allowed`; or the wake is slow or fails and the point proceeds without the veto. Trigger: any lazy plugin whose manifest declares a veto contribution, in particular right after a host start. |
| Effect on GMP data / processes | A GMP action allowed that a control was meant to refuse, with no record that the control was absent. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Declared contributions readable without loading (BEH-BR-250), also while an idle return is under way ("idling") and while the `RefusalList` holds the owner disabled ("refused", resolved by `onError`) (BEH-BR-250, CCR-BR-029); wake step that admits each declaration with the point's rule, wakes it and waits within the deadline, and resolves a failed or late wake by `onError` (BEH-BR-309); declarations matched to contributions by id, owner and role, so a contribution of another plugin under the same id hides nothing (BEH-BR-309); `dormant: "deny"` for points that cannot wait; deny when there is no `HostLink`, when the link is `HostLink.none` without `allowNoLink`, and when the read fails or is late, with the answering link recorded (BEH-BR-309, BEH-BR-305); decision record listing every declaration and its outcome (BEH-BR-305); the wake recorded as `lazy-triggered` with the dispatcher as `onBehalfOf` (BEH-BR-253). Invariants INV-BR-046, INV-BR-040. ADR-BR-050. |
| Risks introduced by controls | Under "deny", the first dispatch after a cold start is refused while the plugin loads (availability); a dispatch outside the host's fibers without a link is refused; `onError: "skip"` deliberately lets a late wake pass. |
| Verification | Planned — check 92; property test of INV-BR-046. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A loaded plugin that is not active, other than during an idle return, has no hook and its veto is absent, as for an eager plugin (gap G64); in-process code can provide a forged `HostLink` that reports no declarations, which the hook point cannot tell from the host's (the record names the `hostId` the link claims); a wake window does not guarantee the woken veto is called before the deadline ("deadline" then applies); the choice of `onError` and `dormant` is the application's. Acceptable with consumer controls: veto owners kept active or monitored, the point's policies under change control, dispatchers reviewed as trusted in-process code (CCR-BR-029). |
| Owner | Core + Consumer |

<a id="rsk-br-058"></a>
### RSK-BR-058: A woken or idled lazy plugin misses, repeats or leaks an event

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The event that woke a lazy plugin is lost (no listener registered, activation fails, hold times out) without anyone noticing; or it is delivered twice, or to another plugin; or its arguments leak into a record or log; or an idle return deactivates a plugin someone still relied on through `Host.use`. Trigger: `OnEvent` triggers and `Plugin.lazy({ idle })`. |
| Effect on GMP data / processes | A GMP-relevant notification not processed or processed twice; data exposed in the trail; a function unavailable until woken. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | One held event per wake, delivered once with `emit` semantics to the woken plugin's own listeners only, never re-running the triggering dispatch (BEH-BR-251, BEH-BR-141); every drop logged and emitted as `held-event-dropped` with its reason (BEH-BR-251); held values in no record, event, log or snapshot (BEH-BR-251); idle return only when no lease, holder, listener run, child or active dependent exists, through a normal stop, recorded as `lazy-idle` (BEH-BR-252). Invariant INV-BR-047. ADR-BR-050. |
| Risks introduced by controls | A held value lives in memory and is lost with the process; events dispatched while the plugin loads are not held. |
| Verification | Planned — checks 96 and 97. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Core holds one event, in memory, for a bounded time. Acceptable with consumer controls: consumers that must see every event use the event delivery companion; `idle` set only for plugins reached through dependents, contributions or events, and callers of `Host.use` on a lazy provider wake it first. |
| Owner | Consumer + Core |

<a id="rsk-br-059"></a>
### RSK-BR-059: An atomic apply mistaken for a transaction, or a partial apply left unnoticed

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An operator treats `reconcile` with `atomic: true` as a transaction: expects external effects of builds, finalizers or served calls to be reversed, or expects no intermediate state to be visible; or an undo fails (gate refusal, concurrent change, parked drain, latch, shutdown) and the remaining mix of old and new plugins runs unnoticed. Trigger: bundle switches at a safe point, federated desired state. |
| Effect on GMP data / processes | A combination of plugin versions nobody approved runs in a GMP process; effects of a briefly active new version persist after the undo. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Dependency order (BEH-BR-156); stop at the first failure and undo in reverse by ordinary operations (BEH-BR-322, BEH-BR-323); three distinct outcomes with `PartialApply` naming every action left applied, logged at error level and published as `reconcile-partial` (BEH-BR-324); every undo attributed, gated and recorded with `undoes`, the plan listing undo actions for approval (BEH-BR-318, BEH-BR-325); no undo over a concurrent change (`ChangedSinceApply`, checked against the revision this call last produced, so multi-action entries undo in full) and no undo when the trail cannot record (BEH-BR-323, BEH-BR-326); the undo of a `replace` restores the override it dropped (BEH-BR-323, CCR-BR-029); documentation that it is not a transaction (BEH-BR-322). Invariant INV-BR-048. ADR-BR-051. |
| Risks introduced by controls | A gate that refuses undo actions makes failed applies partial; undo actions restart dependents and may lose in-memory state without handoff. |
| Verification | Planned — checks 99 and 100; property test of INV-BR-048. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | External effects and their compensation are the consumer's; `PartialApply` must be monitored and resolved under the consumer's procedure. Acceptable with those consumer controls. |
| Owner | Core + Consumer |

<a id="rsk-br-060"></a>
### RSK-BR-060: An implementation of an incompatible contract version is chosen from a registry

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A registry collecting several implementations of one contract holds one compiled against another version (a removed method, an older minor) and a selector chooses it; or a contribution declares a version its code does not honour. Trigger: third-party connectors contributed to one extension point. |
| Effect on GMP data / processes | A call fails at run time or returns data of the wrong shape in a GMP process. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Contract-checked registries: `implements` required, compared with the registry's range and method names at `add`, refusal with `IncompatibleContract` (BEH-BR-233, BEH-BR-163); `within(range)` and selector ranges (BEH-BR-233); declarations only, never described as evidence of behaviour (BEH-BR-233). Invariant INV-BR-049. ADR-BR-052. |
| Risks introduced by controls | A correct declaration can still hide a non-conforming implementation (RSK-BR-025). |
| Verification | Planned — check 102. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Conformance of each implementation to its declared version is the consumer's (or a companion conformance suite's, RSK-BR-051). Acceptable with that control. |
| Owner | Core + Consumer |

<a id="rsk-br-061"></a>
### RSK-BR-061: A revoked digest keeps running, or a list defect stops valid plugins

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin of a digest added to the `RefusalList` keeps running, because the list is consulted only on starts; or a list that throws refuses every start ("policy-defect"); or a definition without a digest is never submitted. Trigger: a revocation without an accompanying `disable`/`remove`; a defective list; unsigned definitions. |
| Effect on GMP data / processes | Revoked code keeps processing GMP data until stopped; or needed plugins are held `disabled` (availability only). |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | List consulted on every start, operator or system, every background restart, every re-run of a `whenAvailable` run under "restart" and every mount, and every trigger applied to a `dormant` plugin, whether it would leave for `starting` or for `waiting` (BEH-BR-267, BEH-BR-033, BEH-BR-090, BEH-BR-134, BEH-BR-245; CCR-BR-036, CCR-BR-037); consulted by `Host.plan` and at atomic validation, so an atomic bundle that lists a refused digest applies nothing (BEH-BR-317, BEH-BR-322); a refused veto owner's declarations still reported and resolved by `onError` (BEH-BR-250, BEH-BR-309); only the definition's own digest submitted, any other revocation identifier mapped by the list (BEH-BR-267) (CCR-BR-029); refused plugins visible as `disabled` with reason and recorded `start-refused` (BEH-BR-267, BEH-BR-199); documentation states that running plugins need `disable`/`remove` (BEH-BR-267); `Host.controls` reports the wiring (BEH-BR-265). Invariant INV-BR-050. Companion: the loader's kill switch disables or removes running plugins. |
| Risks introduced by controls | A defective list holds valid plugins `disabled` (fail-closed). |
| Verification | Planned — check 104. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Acceptable when revocation also disables or removes running plugins and every definition carries a digest — the consumer's procedure. A list that revokes by statement digest or signer refuses only what its own mapping from the package digest finds (loader companion). Confluence and reconcile idempotence hold modulo the list: a plugin active when its digest is listed and the same set built afterwards differ until an operator call (BEH-BR-159, BEH-BR-160); an atomic undo cannot restore the "refused-digest" reason (BEH-BR-323). |
| Owner | Consumer + Core |

<a id="rsk-br-062"></a>
### RSK-BR-062: Fail-closed call logging reports a performed write as failed, or stops a service

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Under "refuse", a member whose effect already happened dies with `CallLogUnavailable` because its entry was not accepted, and the consumer retries or reports a write that did happen; or a log outage refuses every call of a service; synchronous members are refused only at admission. Trigger: log outage or slowness. |
| Effect on GMP data / processes | A duplicated or misreported GMP write; availability loss of a service. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Policy chosen per capture (`select`) so writes can keep "drop" (BEH-BR-279); counters `failed`, `dropped`, `refused` (BEH-BR-279, BEH-BR-212); the refusal named in the defect; documentation of the residual (BEH-BR-279 Settled 1). Invariant INV-BR-052. |
| Risks introduced by controls | The bounded queue holds entries in memory; a process that ends abruptly loses queued entries. |
| Verification | Planned — check 107. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Acceptable with idempotent writes or "drop" for write services, and log availability sized by the consumer. A member that does not return an Effect — a synchronous function or one returning a Stream — is refused only at admission and delivers its outcome before `record` returns, so INV-BR-052 covers Effect members only; such a capture's entries can still be lost after delivery and are counted in `failed` (BEH-BR-279; CCR-BR-029). Capacity is judged before the member runs, so a member that ran never dies "queue-full". |
| Owner | Consumer |

<a id="rsk-br-063"></a>
### RSK-BR-063: An inherited correlation joins unrelated work in the trail

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A fiber forked during a request (outside `background`) keeps the request's `CurrentCorrelation` and its later host calls are recorded under that correlation; or application code sets a misleading correlation. Trigger: long-lived fibers forked from request handlers or builds. |
| Effect on GMP data / processes | A reviewer attributes a later change to the wrong request. The `causationId` remains correct. The actor does not necessarily: `CurrentActor` is a fiber reference inherited by forked fibers exactly as `CurrentCorrelation` is (BEH-BR-187), so the same fiber's later calls also carry the request's actor; that wrong-actor hazard is RSK-BR-005's and is scored there, not here. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | Reset at `background`, health check and `whenAvailable` entry points (BEH-BR-187), where `CurrentActor` is reset to `Actor.unattributed` too; `causationId` unaffected (BEH-BR-190); a supplied `options.context` wins over `CurrentActor`, and its `correlationId` over `CurrentCorrelation` (BEH-BR-187). Invariant INV-BR-051. |
| Risks introduced by controls | None. |
| Verification | Planned — check 106. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Acceptable; correlation is a grouping aid, not evidence of cause. |
| Owner | Consumer (core documents the reset rule) |

<a id="rsk-br-064"></a>
### RSK-BR-064: A batch of commands ends partly applied

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An item of a `Commands.batch` fails after earlier items ran; no atomic batch wrapper encloses the batch and an earlier item has no `compensatedBy`, or its compensation fails or is refused. Trigger: batches over handlers that write to external stores. |
| Effect on GMP data / processes | Part of an approved plan is in effect; a reviewer may believe the plan was all-or-nothing. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Companion `@bridger/command` (Draft, [references/command/](../../command/README.md)): admission of every item before any handler (BEH-CM-049, INV-CM-008); ordered run, undo in reverse by an atomic wrapper or compensating commands, never retried (BEH-CM-050); `CommandBatchPartial` lists `notUndone` and is logged at error level; batch approval bound per item with expected versions checked (BEH-CM-051). Core: the same all-or-report pattern for plugin-set changes, `ApplyRolledBack` / `PartialApply` (BEH-BR-324), and undo requests a gate can match (BEH-BR-219). |
| Risks introduced by controls | A compensation is itself a gated dispatch and can be refused. |
| Verification | Planned — command acceptance check 16. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Acceptable when the consumer encloses regulated batches in a transaction wrapper or declares compensations, and resolves every partial batch. |
| Owner | Consumer (wrappers, compensations, resolution); Companion (command) for the report |

<a id="rsk-br-065"></a>
### RSK-BR-065: A replayed command outcome is wrong or a retry runs twice

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The application's `CommandReceipts` store loses, mixes or fails to record receipts, or records them outside the transaction of the domain write; a retried dispatch then runs again, or returns another call's outcome. |
| Effect on GMP data / processes | A duplicated business effect, or a caller acting on an outcome that is not its own. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | Companion `@bridger/command`: claim after the gate and hooks, bound to input digest and actor (BEH-CM-041); completion innermost in the handler wrappers so a transaction wrapper covers it (BEH-CM-042); a key without a port refused; exactly-once not claimed (INV-CM-007). Core: the key reaches call-log entries as a "callLog" annotation (BEH-BR-293), and an executed or replayed dispatch can be offered as a "dispatch" entry carrying it (BEH-BR-280). |
| Risks introduced by controls | None. |
| Verification | Planned — command acceptance check 14; core check 112 (REQ-BR-112). |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | Replayed outcomes depend on the application's receipt store; a receipt `void` that fails after a batch undo leaves the receipt, so a retry replays an undone item (reported `receiptVoided: false`, command BEH-CM-050). Acceptable; the receipt store and its transaction are the consumer's. |
| Owner | Consumer |

<a id="rsk-br-066"></a>
### RSK-BR-066: Stale reference data used as current

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A signed data pack past its `maxAge` or `effectiveUntil` drives a decision because the reader ignores its status. Trigger: a host offline for longer than the pack's validity, or a publisher that stopped issuing. |
| Effect on GMP data / processes | A GMP decision taken on outdated reference data. |
| Initial scoring | S 3 · P 2 · D 1 → class **High** (6) · priority **Medium** (3) |
| Controls | Companion `@bridger/loader` (Draft, [references/loader/](../../loader/README.md)): `DataPackStale` reported on every read and `requireFresh` failing (BEH-LD-060); packs verified as signed statements and never evaluated (BEH-LD-057). Core: the age is measured against the injected `Clock` (BEH-BR-209, INV-BR-024). Consumer: the rule per data set and use. |
| Risks introduced by controls | `requireFresh` refuses work while no newer pack is reachable. |
| Verification | Planned — the companion's REQ-LD scenarios. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Whether stale data may be used, and for what, is the application's decision. Acceptable on that allocation. |
| Owner | Consumer + Companion |

<a id="rsk-br-067"></a>
### RSK-BR-067: A revocation reaches a host that wires no RefusalList

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A revocation list arrives (through the loader's channel or a federation kill frame) but the deployment wires no `RefusalList`; the kill path disables the plugin, and a later operator call, cascade restart or lazy trigger starts it again until the next apply removes it. |
| Effect on GMP data / processes | Code known to be faulty or compromised runs again in a GMP system. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Core: the `RefusalList` port consulted on every start, background restart and mount (BEH-BR-267, INV-BR-050). Companions (Drafts): the loader's revocation set backs a `RefusalList` (loader BEH-LD-056); the federation kill path documents the wiring and applies kill entries in any state (federation BEH-FD-042). |
| Risks introduced by controls | None beyond those of RSK-BR-061. |
| Verification | Planned — core check 104 (REQ-BR-104); the companions' scenarios. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A deployment that wires no `RefusalList` keeps only the disable; wiring it is the consumer's. Acceptable on that allocation. |
| Owner | Consumer + Companion |

<a id="rsk-br-068"></a>
### RSK-BR-068: Stored business events and their publication diverge, or a read model skips events

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An event is stored without being published or published without being stored (dual write), or a read model follows positions that a later commit fills below its checkpoint and silently omits events. Trigger: publication outside the append's transaction; engines that assign sequence values out of commit order. |
| Effect on GMP data / processes | A business record missing at the receiving host or in a read model used for decisions, without an error. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Companion `@bridger/event-store` (Draft, [references/event-store/](../../event-store/README.md)): append only in `StoreTransaction` with the outbox written in it (BEH-ES-005, BEH-ES-028, BEH-ES-034); position rule and Postgres obligation (BEH-ES-008, BEH-ES-036); checkpoint in the batch's transaction, halt never skip (BEH-ES-019, BEH-ES-020); conformance suite (BEH-ES-037). Core owns no storage; it supplies the identifiers and times the store records (BEH-BR-209, BEH-BR-210, INV-BR-024). |
| Risks introduced by controls | Every append depends on the outbox write and inline projections; a failing projection halts its read model. |
| Verification | Planned — REQ-ES-004, REQ-ES-009, REQ-ES-013, REQ-ES-016. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A non-conforming adapter used without its conformance run. Acceptable when the consumer runs the suite on its engine. |
| Owner | Companion + Consumer |

<a id="rsk-br-069"></a>
### RSK-BR-069: A record number issued twice, or handed out and then rolled back

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Two hosts draw from one series, a host restored from backup reissues numbers, or the application prints a number before its transaction commits and the next record takes it. |
| Effect on GMP data / processes | Two records with one number; a printed number with no record. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Companion `@bridger/sequence` (Draft, [references/sequence/](../../sequence/README.md)): one owning origin (BEH-SQ-002); `next()` in the caller's transaction with an expected version (BEH-SQ-004); incarnation in the identity and "superseded" closure (BEH-SQ-001, BEH-SQ-009); duplicates reported by `verifySeries` (BEH-SQ-013); hand-out obligation and fixture (BEH-SQ-006, BEH-SQ-019). Core: identifiers from the `IdGenerator` port only (BEH-BR-210, INV-BR-024). |
| Risks introduced by controls | Numbers issued after the last backup and lost with the host are not detectable from the series (BEH-SQ-010). |
| Verification | Planned — REQ-SQ-003, REQ-SQ-005, REQ-SQ-007. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A restore without a raised incarnation, and application code that prints before commit. Operator and consumer obligations. |
| Owner | Consumer + Companion |

<a id="rsk-br-070"></a>
### RSK-BR-070: Personal data remains readable after a shred, or a shred is presented as erasure

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Plaintext survives in a read model without a redaction callback, a log, a backup, another host or unencrypted metadata; or a key copy decrypts later; or a shred receipt is reported as irreversible erasure. Conversely, a shred makes fields of a record that must be retained unreadable. |
| Effect on GMP data / processes | Personal data disclosed after a removal decision; or a GMP record whose encrypted fields can no longer be read. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Companion `@bridger/keyring` (Draft, [references/keyring/](../../keyring/README.md)): tombstone before destruction (BEH-KR-017, BEH-KR-018); redaction callbacks with their own cursor and pending status (BEH-KR-019, BEH-KR-021); notices to other hosts (BEH-KR-020); backup and wrapper obligations (BEH-KR-005, BEH-KR-007); `notStated` in every receipt and wording rule (BEH-KR-022); no plaintext in call-log entries (BEH-KR-008); after a shred, a host that holds the subject's tombstone decodes each selected field as a `Shredded` marker and the decode succeeds, so reads, projections, replays and subscriptions continue and nothing halts or parks for the shred (BEH-KR-012); a payload is unreadable (`PayloadUnreadable`) only on a host that holds neither the subject's key nor its tombstone, and is then never dropped: a delivery subscription parks it under `onUnreadable: "park"` (the default) or halts, a subscription that records facts halts and never parks (`onUnreadable: "halt"`, event-store BEH-ES-030), and event-store's `receiveVerbatim` (BEH-ES-030) records the ciphertext undecoded, read through durable-bus `subscribeEnvelopes` (BEH-DB-020, BEH-DB-008). Core: call-log entries carry no arguments or results (BEH-BR-276, BEH-BR-280); the audit `reason` and annotations carry no personal data by the consumer's discipline. |
| Risks introduced by controls | Loss of the key store makes encrypted fields unreadable as a shred would (RSK-KR-002). |
| Verification | Planned — REQ-KR-006, REQ-KR-008, REQ-KR-011, REQ-KR-012. |
| Residual scoring | S 3 · P 2 · D 2 → class High (6) · priority High (6) |
| Residual risk and acceptability | Plaintext copies outside registered callbacks, unexpired backups, copied keys and personal metadata. Owned by the consumer; stated on every receipt. The consumer weighs any shred against record-retention duties. |
| Owner | Consumer |

## §4 Summary

| ID | Title | Class before | Priority | Residual (class / priority) | Owner |
| -- | ----- | ------------ | -------- | --------------------------- | ----- |
| [RSK-BR-001](#rsk-br-001) | Provider closed mid-call | High | High | Medium / Low | Core |
| [RSK-BR-002](#rsk-br-002) | Stale build published | High | High | Medium / Medium | Core |
| [RSK-BR-003](#rsk-br-003) | Silent retry repeats side effects | High | High | Medium / Low | Core |
| [RSK-BR-004](#rsk-br-004) | Unaudited lifecycle change | High | High | Medium / Medium | Core |
| [RSK-BR-005](#rsk-br-005) | Unattributed change | High | High | Medium / Medium | Core; Consumer for identity binding |
| [RSK-BR-006](#rsk-br-006) | Undetected audit gap | High | High | Medium / Medium | Core; Companion and Consumer for store continuity |
| [RSK-BR-007](#rsk-br-007) | Non-reproducible or wrong time, or colliding identifiers | Medium | Medium | Low / Low | Core |
| [RSK-BR-008](#rsk-br-008) | Secret leaks into logs or audit | High | High | Medium / Medium | Core |
| [RSK-BR-009](#rsk-br-009) | Silent resource leak on cleanup failure | Medium | High | Medium / Low | Core |
| [RSK-BR-010](#rsk-br-010) | Changed service shape under unchanged ServiceId | High | High | High / High (core alone); Medium / Medium with consumer controls | Consumer |
| [RSK-BR-011](#rsk-br-011) | Re-entrant deadlock via another fiber | Medium | Medium | Medium / Low | Core |
| [RSK-BR-012](#rsk-br-012) | Lossy event feed mistaken for audit trail | High | High | Medium / Medium | Core |
| [RSK-BR-013](#rsk-br-013) | Realm mistaken for security boundary | High | High | Medium / Medium | Consumer |
| [RSK-BR-014](#rsk-br-014) | Approval bypass through the raw Host | High | High | Medium / Medium | Core + Companion + Consumer |
| [RSK-BR-015](#rsk-br-015) | Forced revocation interrupts a GMP write | High | High | High / Medium (core alone); Low / Low with consumer controls | Core + Consumer |
| [RSK-BR-016](#rsk-br-016) | Hidden runtime failure | High | High | Medium / Medium | Core |
| [RSK-BR-017](#rsk-br-017) | Unverified dynamically loaded code | High | High | High / High (core alone); Medium / Medium with consumer controls | Consumer |
| [RSK-BR-018](#rsk-br-018) | Over-claiming qualification evidence | High | High | Medium / Medium | Core + Companion |
| [RSK-BR-019](#rsk-br-019) | Conflicting concurrent operator actions | High | High | Medium / Low | Core |
| [RSK-BR-020](#rsk-br-020) | Slow audit sink blocks the host | High | High | Medium / Low | Core + Consumer |
| [RSK-BR-021](#rsk-br-021) | Wall-clock step reorders records | Medium | Medium | Low / Low | Core |
| [RSK-BR-022](#rsk-br-022) | Defect in the Effect runtime | High | High | Medium / Medium | Core |
| [RSK-BR-023](#rsk-br-023) | Host transitions stall each other or complete under the wrong call | High | High | Medium / Low | Core; Consumer for re-issuing ended intents |
| [RSK-BR-024](#rsk-br-024) | Value port used to exfiltrate configuration values | High | High | High / High (core alone); Medium / Medium with consumer controls | Consumer + Companion |
| [RSK-BR-025](#rsk-br-025) | Declared contract version does not match the implementation | High | High | High / High (core alone); Medium / Medium with consumer controls | Consumer + Companion |
| [RSK-BR-026](#rsk-br-026) | Lazy plugin loads code other than what its manifest declared | High | High | High / High (core alone); Medium / Medium with loader checks | Consumer + Companion |
| [RSK-BR-027](#rsk-br-027) | Consent-relevant manifest change applied unnoticed | High | High | High / High (core alone); Medium / Medium with a consent gate | Consumer + Companion |
| [RSK-BR-028](#rsk-br-028) | Plugin principal or policy mistaken for isolation | High | High | Medium / Medium | Consumer (core documents the limit) |
| [RSK-BR-029](#rsk-br-029) | A policy layer is bypassed or fails open | High | High | Medium / Low | Core |
| [RSK-BR-030](#rsk-br-030) | Call log mistaken for a complete data-access record | Medium | High | Low / Low | Consumer (core documents the limit) |
| [RSK-BR-031](#rsk-br-031) | Annotation leaks a secret into the trail, or a label is lost | High | High | Medium / Medium | Core |
| [RSK-BR-032](#rsk-br-032) | A hook decision made by unadmitted or failing code | High | High | Medium / Medium | Core + Consumer |
| [RSK-BR-033](#rsk-br-033) | An approval applied to a changed system | High | High | Medium / Medium | Core + Consumer |
| [RSK-BR-034](#rsk-br-034) | A realm family mistaken for data separation, or eviction cuts off work | High | High | Medium / Medium | Consumer + Core |
| [RSK-BR-035](#rsk-br-035) | Handed-off state lost silently, leaked, or imported wrongly | High | High | Medium / Medium | Core + Consumer |
| [RSK-BR-036](#rsk-br-036) | Stale or rolled-back desired state on a federated host | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-037](#rsk-br-037) | Unverified desired state applied | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-038](#rsk-br-038) | Split-brain on a single-owner export | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-039](#rsk-br-039) | Event lost, duplicated in effect, or processed out of order | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-040](#rsk-br-040) | Replay storm after a long outage | High | Medium | Low / Low | Companion + Consumer |
| [RSK-BR-041](#rsk-br-041) | Clock skew corrupts ordering or freshness | High | High | Low / Low | Companion + Consumer |
| [RSK-BR-042](#rsk-br-042) | Version skew between hosts runs an untested combination | High | High | Medium / Low | Companion + Consumer |
| [RSK-BR-043](#rsk-br-043) | Trust root or signature policy accepts unapproved code | High | High | Medium / Medium | Consumer + Companion |
| [RSK-BR-044](#rsk-br-044) | Revocation does not take effect | High | High | Medium / Low | Consumer + Companion |
| [RSK-BR-045](#rsk-br-045) | Chain or anchor mistaken for tamper-proofing | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-046](#rsk-br-046) | Entitlement lapse blocks an essential operation or stops a plugin | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-047](#rsk-br-047) | Toolset taken for authorization | High | High | Medium / Medium | Consumer |
| [RSK-BR-048](#rsk-br-048) | Agent write approved automatically after untrusted input | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-049](#rsk-br-049) | Plugin set changed by an agent without approval | High | High | Medium / Low | Core + Companion |
| [RSK-BR-050](#rsk-br-050) | Development reload reaches a controlled host | High | High | Medium / Low | Companion + Consumer |
| [RSK-BR-051](#rsk-br-051) | Facade or generated SDK hides a contract mismatch | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-052](#rsk-br-052) | A deposed owner keeps acting for importers that have not seen the new fence | High | High | High / High (companion alone); Medium / Medium with a fence check where the effect lands | Consumer |
| [RSK-BR-053](#rsk-br-053) | Offline boot drops plugins the loader cache does not hold | Medium | Low | Low / Low | Consumer + Companion |
| [RSK-BR-054](#rsk-br-054) | Origin reused after a restore that was not announced | High | High | High / High (companion alone); Medium / Medium with the incarnation procedure | Consumer |
| [RSK-BR-055](#rsk-br-055) | Envelopes lost when a receiver falls back past the sender's retention | High | Medium | Medium / Low | Consumer + Companion |
| [RSK-BR-056](#rsk-br-056) | Duplicate check stops past the inbox's retention | Medium | High | Medium / High | Consumer |
| [RSK-BR-057](#rsk-br-057) | A lazy veto contributor passed over, so a policy decision fails open | High | High | Medium / Medium | Core + Consumer |
| [RSK-BR-058](#rsk-br-058) | A woken or idled lazy plugin misses, repeats or leaks an event | Medium | Medium | Low / Low | Consumer + Core |
| [RSK-BR-059](#rsk-br-059) | An atomic apply mistaken for a transaction, or a partial apply left unnoticed | High | High | Medium / Medium | Core + Consumer |
| [RSK-BR-060](#rsk-br-060) | An implementation of an incompatible contract version is chosen from a registry | High | High | Medium / Medium | Core + Consumer |
| [RSK-BR-061](#rsk-br-061) | A revoked digest keeps running, or a list defect stops valid plugins | High | High | Medium / Medium | Consumer + Core |
| [RSK-BR-062](#rsk-br-062) | Fail-closed call logging reports a performed write as failed, or stops a service | High | High | Medium / Medium | Consumer |
| [RSK-BR-063](#rsk-br-063) | An inherited correlation joins unrelated work in the trail | Medium | Medium | Low / Low | Consumer |
| [RSK-BR-064](#rsk-br-064) | A batch of commands ends partly applied | High | High | Medium / Low | Consumer + Companion |
| [RSK-BR-065](#rsk-br-065) | A replayed command outcome is wrong or a retry runs twice | Medium | Medium | Low / Low | Consumer |
| [RSK-BR-066](#rsk-br-066) | Stale reference data used as current | High | Medium | Medium / Low | Consumer + Companion |
| [RSK-BR-067](#rsk-br-067) | A revocation reaches a host that wires no RefusalList | High | High | Medium / Medium | Consumer + Companion |
| [RSK-BR-068](#rsk-br-068) | Stored business events and their publication diverge, or a read model skips events | High | High | Medium / Medium | Companion + Consumer |
| [RSK-BR-069](#rsk-br-069) | A record number issued twice, or handed out and then rolled back | High | High | Medium / Medium | Consumer + Companion |
| [RSK-BR-070](#rsk-br-070) | Personal data remains readable after a shred, or a shred is presented as erasure | High | High | High / High | Consumer |

Companion risks of the remote companion, RSK-RM-001–017, are assessed in its own [risk file](../../remote/risks.md); the highest residuals are RSK-RM-006 (escape from the guest runtime; Consumer; High / High, not reducible by Bridger), RSK-RM-014 (residency labels mistaken for a residency guarantee; Consumer; High (6) / High (6)) and RSK-RM-005 (out-of-process code mistaken for isolated; Consumer; Medium / High). Round 2 (CCR-RM-003): RSK-RM-015 (a browser frame reached by, or reaching, the wrong party; Companion + Consumer; residual Medium (3) / Medium (4)); RSK-RM-013 residual lowered to Low (2) / Low (2) now that a revocation-caused unmount is attributed; RSK-RM-001 residual Medium (3) / Medium (4) on per-call transports with a `DedupeStore`. Round 3 (CCR-RM-006): RSK-RM-017 (a callback's host service runs before the call-log "refuse" policy can withhold its result; residual Medium), the remote counterpart of RSK-BR-062. The event-store, sequence and keyring companions keep their own series (RSK-ES-001–006, RSK-SQ-001–004, RSK-KR-001–005) in their trees' risk files; RSK-BR-068–070 summarise them here.

**Residuals the regulated user must carry into their own assessment:** identity binding and enabling required attribution (RSK-BR-005); wiring a sink and the store's completeness and continuity (RSK-BR-004, RSK-BR-006); clock synchronisation (RSK-BR-007, RSK-BR-021); plugin version control and regression testing (RSK-BR-010); deployment-level isolation (RSK-BR-013); wiring a gate and its availability (RSK-BR-014); atomic external writes and drain sizing (RSK-BR-015); health checks and state monitoring (RSK-BR-016); code provenance (RSK-BR-017); supplier assessment and independent review (RSK-BR-018); business continuity during sink outages (RSK-BR-020); re-qualification on upgrade (RSK-BR-022); re-issuing an ended intent — an operation parked after `DrainTimeout` whose intent a provider's stop later ended (RSK-BR-023); the `ConfigFingerprinter` implementation — which paths it selects, that it keeps, logs and transmits no value, and that its fingerprints do not reveal one (RSK-BR-024); manifest review, schema diffs and conformance tests of contract releases, loader checks and consent gates (RSK-BR-025–027); running untrusted code out of process (RSK-BR-028); the completeness of a data-access record (RSK-BR-030); review of annotation keys (RSK-BR-031); the hook admission rule, labels and storage of decision records (RSK-BR-032); atomic re-check of application drafts (RSK-BR-033); data separation between family members, and removing an ephemeral realm whose teardown was refused (RSK-BR-034); correctness of a plugin's handoff schema, upgrade and import (RSK-BR-035); the choice of `onError`, `dormant` and the hook policy, and keeping veto owners active (RSK-BR-057); event retention beyond the one held triggering event, and the use of `idle` (RSK-BR-058); compensation of external effects and resolution of a `PartialApply` (RSK-BR-059); conformance of registry implementations to their declared versions (RSK-BR-060); stopping running plugins of a revoked digest and giving every definition a digest (RSK-BR-061); write idempotence or the "drop" policy for write services under fail-closed logging (RSK-BR-062, and across the remote hop RSK-RM-017); and, where the consumer adopts a companion, the residuals of RSK-BR-036–056 (storage, key custody, anchor independence, essential labels, gate wiring, development tooling, a fence check where a single-owner effect lands, the resolver's local cache, the incarnation procedure on every restore, sender and inbox retention, and binding envelope origins to authenticated peers at the transport (RSK-BR-039)); the command receipt store and batch compensations (RSK-BR-064, RSK-BR-065); the rule for stale reference data (RSK-BR-066); wiring a `RefusalList` where revocations arrive (RSK-BR-067); the event-store adapter's conformance run, the incarnation procedure for number series, and every plaintext copy, backup and key outside the keyring's reach (RSK-BR-068–070).

No residual score is yet supported by evidence; each becomes supportable only when the verification named in its entry has been executed and passed ([validation plan](./04-validation-plan.md)).

## §5 Review triggers

The register is reviewed, and affected entries re-scored, under a change control record when any of the following occurs:

1. **A CCR with GxP impact.** Every CCR whose impact assessment answers "yes" to GxP impact ([change control](../process/change-control.md) §3) — any change to attribution, the audit record or its `schemaVersion`, the audit sequence, the operation gate, time or identifier sources, the legality table, or a compliance-matrix row — names the risks it affects and whether it introduces a new one.
2. **An Effect version change.** Any change to the pinned Effect version re-opens [RSK-BR-022](#rsk-br-022) and every risk whose controls depend on interruption, scopes or layers (RSK-BR-001, RSK-BR-002, RSK-BR-015).
3. **Any incident.** A defect report, a failed scenario, a surviving mutant in a control's code, or an incident reported by a regulated user that touches a hazard in this register — or reveals one that is missing.
4. **Regulatory change.** Finalisation of the EU GMP Annex 11 revision, or a change to any instrument listed in the [regulatory scope](./01-regulatory-scope.md) §4.
5. **Transition from prospective.** When code first exists, every residual score is re-examined against executed evidence before any document leaves Draft ([ADR-BR-036](../decisions/036-prospective-specification.md)).
6. **Periodic review.** At the periodic review of the [validation plan](./04-validation-plan.md) §8, even if nothing above has occurred.

---

_Previous: [Compliance matrix](./02-compliance-matrix.md)_ · _Next: [Validation plan](./04-validation-plan.md)_
