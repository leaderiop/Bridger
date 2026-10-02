# 03 — Risk Assessment

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GXP-03                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.3 (2026-10-02): RSK-BR-023 added (CCR-BR-006)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This document assesses the hazards that `@bridger/core` itself could introduce into a regulated user's computerized system, scores them with the GAMP 5 FMEA method under the ICH Q9(R1) process, names the specified behaviours and invariants that control each one, and states the residual risk and who owns it. It defines the risk identifiers `RSK-BR-001` to `RSK-BR-023` that behaviours cite on their `**Risk:**` lines.

It is a **supplier-side** assessment of a component. It does not replace the regulated user's risk assessment of their system, which decides the extent of their validation (EU GMP Annex 11 §1). Every control named here is *specified*, not implemented, and every verification is *Planned*: nothing has been executed, so no residual score below is yet supported by evidence ([ADR-BR-036](../decisions/036-prospective-specification.md)).

## §1 Method

The assessment follows the quality risk management process of ICH Q9(R1) (2023).

| Step | What is done here |
| ---- | ----------------- |
| Risk identification | Hazards were identified by walking every mutating operation, every system transition, every port (`AuditSink`, `OperationGate`, `Clock`, `IdGenerator`) and every concurrency rule of the specification, and asking how each could cause a GMP-relevant change to go unrecorded, misattributed, unapproved, wrong, or lost. The known gaps of [urs.md](../urs.md#7-known-gaps-and-open-items) and the lessons of the qadi precedent ([ADR-BR-028](../decisions/028-gxp-scope.md)) were inputs. |
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
| Controls | Failure is sticky (BEH-BR-031, BEH-BR-096) and survives dependency loss and return; `retry` restarts only on request (BEH-BR-056); a failed replacement stays failed (BEH-BR-053); reconcile converges without retrying failures on its own (BEH-BR-160). Every retry is an attributed, audited operator call (BEH-BR-198). Invariant INV-BR-007. |
| Risks introduced by controls | Availability: a transient failure keeps the plugin down until someone acts. The consumer must monitor plugin state (snapshots, `Host.events`) and respond. |
| Verification | Planned — REQ-BR scenarios for acceptance check 10 of BEH-BR-183; property test that no transition leaves `failed` without an operator operation; mutation testing. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | Side effects repeated within a single start, or by an operator's deliberate retry, remain; idempotence of external effects is the plugin author's and the consumer's. Acceptable: each retry is now visible and attributed. |
| Owner | Core (residual: Consumer) |

<a id="rsk-br-004"></a>
### RSK-BR-004: Unaudited lifecycle change

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin-set change takes effect with no audit record: through a path that bypasses the recorder (a `PluginHandle`, a reconcile entry, a child mount, a system transition), through an interrupted caller, or because the sink failed and the host carried on. Trigger: any lifecycle change. |
| Effect on GMP data / processes | The configuration of a computerized system changes without a trail; the gap supports neither 21 CFR 11.10(e) nor Annex 11 §9 and cannot be reconstructed later. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | A fixed check order for every mutating call (BEH-BR-188); one `requested` and one terminal record per admitted call (BEH-BR-198); system transitions recorded (BEH-BR-199), including child mounts (BEH-BR-126) and forced revocations (BEH-BR-086); every route uses the same tables (BEH-BR-077) and reconcile entries are audited individually (BEH-BR-158); caller interruption does not cancel the transition or its record (BEH-BR-067); a change whose request cannot be recorded is not made (BEH-BR-203); an unwritten outcome sets the latch (BEH-BR-205). Invariants INV-BR-022, INV-BR-027, INV-BR-029. |
| Risks introduced by controls | Fail-closed refusal and the latch block operator changes during a sink outage — an availability cost, assessed as [RSK-BR-020](#rsk-br-020). Shutdown is exempt so that the safe direction stays open (BEH-BR-110). |
| Verification | Planned — property test that, for any generated operation script with injected sink faults, admitted calls and records correspond one to one; REQ-BR scenarios for acceptance checks 32–34 and 39 of BEH-BR-184; mutation testing. |
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
| Controls | `Actor` and `OperationContext` on every mutating operation (BEH-BR-185, BEH-BR-186); a per-call context wins over `CurrentActor` (BEH-BR-187); `attribution.require` and `requireReason` turn omission into `Unattributed` or `ReasonRequired` before anything is recorded or changed (BEH-BR-189); identity is never inferred (BEH-BR-191); defaults change nothing (BEH-BR-192). Invariant INV-BR-025. |
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
| Controls | One writer, in order, retrying in place with the same `recordId` and `auditSeq` (BEH-BR-202); `auditSeq` contiguous from 1 per host (BEH-BR-212) and not consumed by a failed write (BEH-BR-213); an unwritten terminal, rejected or system record sets the latch (BEH-BR-205); exactly one requested and one terminal record per admitted call (BEH-BR-198); `verifyAuditSequence` detects gaps, duplicates and disorder (BEH-BR-215). Invariants INV-BR-023, INV-BR-029, INV-BR-022. |
| Risks introduced by controls | Retrying in place creates a duplicate in a sink that is not idempotent on `recordId`; `verifyAuditSequence` reports it. The latch blocks operator changes ([RSK-BR-020](#rsk-br-020)). |
| Verification | Planned — property tests of sequence contiguity under generated write failures and timeouts; property and unit tests of `verifyAuditSequence`; REQ-BR scenarios for acceptance checks 34–36 of BEH-BR-184; mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Core itself can lose records on two paths, both stated rather than hidden: a record dropped because the writer's queue (1024 records) is full is never numbered, so it leaves no gap in `auditSeq` — it is counted in `HostSnapshot.auditDropped`, logged, and sets the latch (BEH-BR-202, BEH-BR-205); and records still queued in process memory when the process dies are lost (BEH-BR-208). Not detectable from `auditSeq` alone: loss of a host's entire trail, loss of the tail after the last stored record (which includes records queued when the process dies), and a sink that silently discards (ADR-BR-030, ADR-BR-037). Core keeps no copy (BEH-BR-208). These are the companion's adapter contract and the consumer's store and cross-host continuity checks. Acceptable for core on that allocation. |
| Owner | Core (residual: Companion + Consumer) |

<a id="rsk-br-007"></a>
### RSK-BR-007: Non-reproducible or wrong time

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Core takes a timestamp or identifier from an ambient source (`Date.now()`, `performance.now()`, `crypto.randomUUID()`), so tests cannot reproduce it; or a test clock or counter identifier source is left wired in production. Trigger: a coding slip, or a misassembled layer. |
| Effect on GMP data / processes | Records carry times that do not match the configured `Clock`, or identifiers that collide across hosts; executed tests cannot be reproduced, weakening the evidence. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | Every timestamp from `Clock` (BEH-BR-209), every identifier from `IdGenerator` (BEH-BR-210); ambient time and randomness prohibited in core (BEH-BR-211); each host has a distinct `hostId` (BEH-BR-016); `TestHost` uses `TestClock` and a counter, in tests only (BEH-BR-179); clock accuracy delimited to the consumer (BEH-BR-216). Invariant INV-BR-024. |
| Risks introduced by controls | Injectable time means production time is only as good as what is injected. Installation must confirm the production `Clock` and `IdGenerator` are wired ([validation plan](./04-validation-plan.md) §5.1). |
| Verification | Planned — scripted unit tests that identical scripts under `TestClock` produce identical records; the planned house-style check for ambient calls in the merge gate ([Definitions of Done](../process/definitions-of-done.md)). |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Accuracy and synchronisation of the clock source are the consumer's (Annex 11 §12.4, 21 CFR 11.10(e) time-stamping). Acceptable. |
| Owner | Core (residual: Consumer — clock synchronisation) |

<a id="rsk-br-008"></a>
### RSK-BR-008: Secret leaks into logs or audit

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A configuration value — a password, an API key, signing material — appears in an audit record, a gate request, an event, a log, an error message or a snapshot. Trigger: any reconfigure, decode failure or diagnostic output. |
| Effect on GMP data / processes | A secret enters a retained trail that cannot be purged without altering it, and is readable by everyone with access to the store; the GMP system's security is compromised. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Configuration values never observable (BEH-BR-103); audit records carry configuration paths, never values (BEH-BR-197); the gate request carries paths only (BEH-BR-219); `inspect` returns names and counts only (BEH-BR-118); events, spans, logs and metrics carry identities, not values (BEH-BR-114, BEH-BR-116, BEH-BR-117); snapshots omit values (BEH-BR-028); `ConfigInvalid` carries paths and expected forms only (BEH-BR-103); attribution reaches only the gate and the sink (BEH-BR-192). Invariants INV-BR-013, INV-BR-028. |
| Risks introduced by controls | The trail cannot answer "what was the value at time T"; the configuration source must keep value history under its own controls (ADR-BR-033). A path name reveals that a secret changed, not its value (accepted). |
| Verification | Planned — property test with a `Redacted` canary and generated configurations asserting that no value reaches any record, request, event, log or snapshot (acceptance check 37 of BEH-BR-184); mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A plugin that logs its own configuration is outside core's control; code review of plugins is the consumer's. Acceptable. |
| Owner | Core (residual: Consumer — plugin code review, configuration-source history) |

<a id="rsk-br-009"></a>
### RSK-BR-009: Silent resource leak on cleanup failure

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin's finalizer fails — a connection not closed, a file lock or equipment session held — and the host reports success or hides the failure. Trigger: any stop, remove, replace or shutdown of a plugin with fragile teardown. |
| Effect on GMP data / processes | A resource stays held without anyone knowing; a later start cannot acquire it, or a second writer appears. Effect is mainly on availability, but a hidden open session to an instrument or store can corrupt a later run. |
| Initial scoring | S 2 · P 2 · D 3 → class **Medium** (4) · priority **High** (6) |
| Controls | A cleanup failure is reported, never hidden (BEH-BR-046), and a stop that fails cleanup ends in `failed` with phase `cleanup` and `CleanupError` (BEH-BR-055); removing such a plugin records the leak as acknowledged rather than claiming recovery (BEH-BR-047); the legality table refuses other operations on it (BEH-BR-071); shutdown reports every failure, including through scope close (BEH-BR-106, BEH-BR-108); revertibility limits are stated (BEH-BR-161). Invariants INV-BR-007, INV-BR-018, INV-BR-011. |
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
| Failure mode | A callback holding a lease waits, through another fiber, for an operation that must drain that same lease. Detection uses a carried reference, which another fiber does not carry, so the wait is not recognised. Trigger: plugin code that hands work to a separate fiber and awaits it inside `use`. |
| Effect on GMP data / processes | The operation and the call hang until the drain limit; the GMP process stalls. No data is altered. |
| Initial scoring | S 2 · P 2 · D 2 → class **Medium** (4) · priority **Medium** (4) |
| Controls | A re-entrant wait in the same fiber lineage fails fast with `WouldDeadlock` (BEH-BR-088), including inside optional and reactive use (BEH-BR-136); builds are bounded (BEH-BR-040); every drain is bounded unless declared forever (BEH-BR-085); a stalled plugin is reported (BEH-BR-120). Invariants INV-BR-016, INV-BR-017. |
| Risks introduced by controls | None material; `WouldDeadlock` fails a call that would otherwise have hung. |
| Verification | Planned — scripted unit tests for `WouldDeadlock` (acceptance check 3 of BEH-BR-183) and for drain bounds. |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | The cross-fiber case remains undetectable ([URS](../urs.md#7-known-gaps-and-open-items) gap G6) and is bounded by `drainTimeout`, which surfaces as `DrainTimeout`. Acceptable. |
| Owner | Core |

<a id="rsk-br-012"></a>
### RSK-BR-012: Lossy event feed mistaken for audit trail

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer builds its trail by subscribing to `Host.events` or `Host.changes`. The events feed is a sliding buffer that drops the oldest entries for a slow subscriber; the state feed is latest-wins. Trigger: a dashboard-style integration reused for compliance. |
| Effect on GMP data / processes | A trail that silently loses entries under load, believed complete. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | `Host.events` is specified and documented as a diagnostic feed, not an audit trail (BEH-BR-113), and loss shows as a gap in `seq` (BEH-BR-115); `changes` is latest-wins by specification (BEH-BR-030); the audit trail is a separate channel (BEH-BR-207); attribution reaches only the gate and sink (BEH-BR-192). Invariant INV-BR-008. Claims this library does not make, item 12 ([compliance matrix](./02-compliance-matrix.md) §5). |
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
| Failure mode | Approval is checked only by a wrapper, and a change reaches the host another way: a plugin or base service resolving `Bridger.Host`, a `PluginHandle`, a reconcile entry, a group operation. Or a gate that crashes or hangs is treated as approval. Trigger: any code path that holds the raw host. |
| Effect on GMP data / processes | An unapproved change to the configuration of a GMP system (21 CFR 11.10(g), Annex 11 §10). |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | The gate is a port inside the host, with no default implementation (BEH-BR-217), consulted after attribution and validation and before any record (BEH-BR-218); it cannot be bypassed through the host it guards (BEH-BR-222), because every route uses the same tables (BEH-BR-077) and each reconcile entry is gated (BEH-BR-158); a gate that fails, hangs or is abandoned is a refusal (BEH-BR-221); events carry no veto over host operations (BEH-BR-144); optional ports are resolved once, at construction (BEH-BR-015); the test gate fixture makes no implicit decision (BEH-BR-182). Invariants INV-BR-027, INV-BR-026. |
| Risks introduced by controls | An unavailable approval service blocks every operator change; a gate call can hold an operation for up to `gateTimeout` (60 s, or forever only when declared). Approval should be obtained before the call so the gate only checks it ([ADR-BR-032](../decisions/032-operation-gate.md)). Shutdown is not gated. |
| Verification | Planned — property test that every route to every mutating operation consults the gate exactly once per action; REQ-BR scenarios for acceptance check 32 of BEH-BR-184 (refusal, gate defect, `gateTimeout`); mutation testing. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Outside the guarantee: an unwired gate (no approval at all), a second host built by consumer code, and direct access to plugin stores. These are the consumer's configuration and access control; approval capture is the companion's. Acceptable on that allocation. |
| Owner | Core (residual: Consumer + Companion) |

<a id="rsk-br-015"></a>
### RSK-BR-015: Forced revocation interrupts a GMP write

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A drain reaches its limit and is forced — by an operator's `force`, by the host revoking at the drain limit after a runtime failure, or by shutdown's overall limit — and a callback is interrupted in the middle of a GMP write. Trigger: a slow call during removal, failure or shutdown. |
| Effect on GMP data / processes | A partial write in an external store; ALCOA+ *Complete* and *Accurate* at risk for that record. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | A leased provider does not close under its lease except by explicit force or at a declared limit (BEH-BR-085, BEH-BR-045); force interrupts with `LeaseRevoked`, waits for the callback's finalizers, and is reported and audited as `lease-revoked` (BEH-BR-086, BEH-BR-199); the host revokes only at the drain limit when there is no caller (BEH-BR-095); shutdown forces only after its overall limit (BEH-BR-107); the same rules hold for generations and registries (BEH-BR-174, BEH-BR-167). Invariants INV-BR-017, INV-BR-006. |
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
| Residual risk and acceptability | A plugin that hangs without failing, and declares no health check, stays `active`. Declaring health checks and monitoring state are the plugin author's and the consumer's. Acceptable. |
| Owner | Core (residual: Consumer) |

<a id="rsk-br-017"></a>
### RSK-BR-017: Unverified dynamically loaded code

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A plugin definition produced by a dynamic import comes from the wrong source, an unapproved version, or has been altered; the host installs it. `meta.digest` is a label the host compares, not a verification it performs. Trigger: any dynamic installation. |
| Effect on GMP data / processes | Unapproved or altered code runs inside a GMP system. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Entries have no import-time side effects, so importing alone changes nothing (BEH-BR-008); a definition is an inert record (BEH-BR-001); `meta` is opaque except where named (BEH-BR-104); the gate request carries the definition's `version` and `digest`, so a consumer gate can refuse anything not on an approved list (BEH-BR-219); records carry `version` and `digest` before and after (BEH-BR-196); removal releases behaviour, not imported code (BEH-BR-048). |
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
| Residual risk and acceptability | During a sink outage, operator changes stop by design; shutdown stays available. The regulated user's business-continuity planning (Annex 11 §16) must cover sink outages, and a sink that needs longer than `auditTimeout` should buffer with its own durability rather than hold the host. Acceptable as a deliberate trade-off. |
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
| Controls | No host-wide operation order; waits run only from a provider to its dependents (BEH-BR-078); a cascade waits for a dependent's step, never its operation, and never overrules an operator operation with a waiting caller (BEH-BR-079); a cascade resumes a parked stop and ends the parked intent rather than completing it (BEH-BR-080); `WouldDeadlock` is decided before any wait (BEH-BR-088). Invariants INV-BR-030, INV-BR-002, INV-BR-016. |
| Risks introduced by controls | An operator whose parked `remove` or `disable` was ended by a provider's removal must issue it again; a cascade's wait is bounded by two drain limits in sequence, not one. |
| Verification | Planned — the property test of INV-BR-030 over random histories on random acyclic graphs; REQ-BR scenarios for acceptance checks 43–45 of BEH-BR-184; mutation testing. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | A wait closed through a fiber that does not carry the held-plugin reference remains undetectable ([RSK-BR-011](#rsk-br-011)) and is bounded by the drain limit. Acceptable. |
| Owner | Core |

## §4 Summary

| ID | Title | Class before | Priority | Residual (class / priority) | Owner |
| -- | ----- | ------------ | -------- | --------------------------- | ----- |
| [RSK-BR-001](#rsk-br-001) | Provider closed mid-call | High | High | Medium / Low | Core |
| [RSK-BR-002](#rsk-br-002) | Stale build published | High | High | Medium / Medium | Core |
| [RSK-BR-003](#rsk-br-003) | Silent retry repeats side effects | High | High | Medium / Low | Core |
| [RSK-BR-004](#rsk-br-004) | Unaudited lifecycle change | High | High | Medium / Medium | Core |
| [RSK-BR-005](#rsk-br-005) | Unattributed change | High | High | Medium / Medium | Core; Consumer for identity binding |
| [RSK-BR-006](#rsk-br-006) | Undetected audit gap | High | High | Medium / Medium | Core; Companion and Consumer for store continuity |
| [RSK-BR-007](#rsk-br-007) | Non-reproducible or wrong time | Medium | Medium | Low / Low | Core |
| [RSK-BR-008](#rsk-br-008) | Secret leaks into logs or audit | High | High | Medium / Medium | Core |
| [RSK-BR-009](#rsk-br-009) | Silent resource leak on cleanup failure | Medium | High | Medium / Low | Core |
| [RSK-BR-010](#rsk-br-010) | Changed service shape under unchanged ServiceId | High | High | High / High (core alone); Medium / Medium with consumer controls | Consumer |
| [RSK-BR-011](#rsk-br-011) | Re-entrant deadlock via another fiber | Medium | Medium | Medium / Low | Core |
| [RSK-BR-012](#rsk-br-012) | Lossy event feed mistaken for audit trail | High | High | Medium / Medium | Core |
| [RSK-BR-013](#rsk-br-013) | Realm mistaken for security boundary | High | High | Medium / Medium | Consumer |
| [RSK-BR-014](#rsk-br-014) | Approval bypass through the raw Host | High | High | Medium / Medium | Core |
| [RSK-BR-015](#rsk-br-015) | Forced revocation interrupts a GMP write | High | High | High / Medium (core alone); Low / Low with consumer controls | Core + Consumer |
| [RSK-BR-016](#rsk-br-016) | Hidden runtime failure | High | High | Medium / Medium | Core |
| [RSK-BR-017](#rsk-br-017) | Unverified dynamically loaded code | High | High | High / High (core alone); Medium / Medium with consumer controls | Consumer |
| [RSK-BR-018](#rsk-br-018) | Over-claiming qualification evidence | High | High | Medium / Medium | Core + Companion |
| [RSK-BR-019](#rsk-br-019) | Conflicting concurrent operator actions | High | High | Medium / Low | Core |
| [RSK-BR-020](#rsk-br-020) | Slow audit sink blocks the host | High | High | Medium / Low | Core + Consumer |
| [RSK-BR-021](#rsk-br-021) | Wall-clock step reorders records | Medium | Medium | Low / Low | Core |
| [RSK-BR-022](#rsk-br-022) | Defect in the Effect runtime | High | High | Medium / Medium | Core |
| [RSK-BR-023](#rsk-br-023) | Host transitions stall each other or complete under the wrong call | High | High | Medium / Low | Core |

**Residuals the regulated user must carry into their own assessment:** identity binding and enabling required attribution (RSK-BR-005); wiring a sink and the store's completeness and continuity (RSK-BR-004, RSK-BR-006); clock synchronisation (RSK-BR-007, RSK-BR-021); plugin version control and regression testing (RSK-BR-010); deployment-level isolation (RSK-BR-013); wiring a gate and its availability (RSK-BR-014); atomic external writes and drain sizing (RSK-BR-015); health checks and state monitoring (RSK-BR-016); code provenance (RSK-BR-017); supplier assessment and independent review (RSK-BR-018); business continuity during sink outages (RSK-BR-020); re-qualification on upgrade (RSK-BR-022).

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
