# 03 — Risk Assessment

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-GXP-03                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

This document assesses the hazards that `@bridger/gxp` itself could introduce into a regulated user's computerized system, or fail to control where core allocated the control to it, scores them with the GAMP 5 FMEA method under the ICH Q9(R1) process, names the specified behaviours and invariants that control each one, and states the residual risk and who owns it. It defines the risk identifiers `RSK-GX-001` to `RSK-GX-022` that behaviours cite on their `**Risk:**` lines.

It is a **supplier-side** assessment of a component, the companion to core's [risk assessment](../../core/gxp/03-risk-assessment.md), whose method and scoring it reuses unchanged. It does not replace the regulated user's assessment of their system (EU GMP Annex 11 §1). Every control named here is *specified*, not implemented, and every verification is *Planned*: nothing has been executed, so no residual score below is yet supported by evidence ([ADR-GX-026](../decisions/026-prospective-specification.md)). Requirement scenarios (`REQ-GX`) are not yet allocated; until [traceability.md](../traceability.md) §5 allocates them, verification cells name the acceptance checks of [20 — Required acceptance checks](../behaviors/20-required-acceptance-checks.md).

## §1 Method

The assessment follows the quality risk management process of ICH Q9(R1) (2023).

| Step | What is done here |
| ---- | ----------------- |
| Risk identification | Hazards were identified by walking every companion port (`TrailStore`, `AnchorStore`, `TicketStore`, `SignatureCapture`, `FingerprintKeyProvider`), every core port the companion implements (`AuditSink`, `OperationGate`, `ConfigFingerprinter`), every output (check reports, tickets, renderings, evidence packs, archives) and the core interfaces relied on ([core interface map](../appendices/core-interface-map.md)), and asking how each could let a plugin-lifecycle change go unrecorded, unapproved, wrongly approved, misdescribed, or a value or key escape. The residuals core allocates to the companion — [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024) — and the Qadi precedent ([appendix](../appendices/qadi-audit-comparison.md)) were inputs. |
| Risk analysis | Each hazard is described as a failure mode with its trigger and its effect on GMP data and processes, and scored for Severity, Probability and Detectability (§2). |
| Risk evaluation | Severity and Probability give a risk class; class and Detectability give a priority (§2). Initial scores assume core's controls and the companion's general design, but not the companion controls specific to the hazard. |
| Risk control | Each hazard names the behaviours (`BEH-GX`) and invariants (`INV-GX`) that reduce it, the risks those controls themselves introduce, and the residual score once the controls work as specified. A residual the companion cannot reduce further is allocated to the consumer by name. |
| Risk communication | Risk identifiers are cited on the `**Risk:**` line of each controlling behaviour, in the **Implication** of each [invariant](../invariants.md), in [traceability.md](../traceability.md) §7 and in the [compliance matrix](./02-compliance-matrix.md). Consumer-owned residuals are listed in §4. |
| Risk review | The register is reviewed on the triggers of §5 and re-scored under change control ([change control](../process/change-control.md) §3). |

**Formality and subjectivity.** As in core, the whole register uses one FMEA format and the *rigour of verification* scales with risk ([validation plan](./04-validation-plan.md) §4). Every score uses the written anchors of §2; each Probability names its trigger; each Detectability names how the failure would or would not surface; each residual names the control that justifies it; Severity is lowered only by a control that removes the consequence. Scores are a single author's judgement, not independently reviewed ([change control](../process/change-control.md) §5); a regulated user should re-score them for their intended use.

## §2 Scoring

Core's scale is reused unchanged ([core risk assessment](../../core/gxp/03-risk-assessment.md) §2). Each factor is scored 1, 2 or 3.

### Severity (S) — impact if the failure occurs

| Score | Level | Anchor |
| ----- | ----- | ------ |
| 3 | High | A GMP-relevant change could take effect unrecorded, unapproved, approved by the wrong person or for a different change, or with its record lost or misdescribed; or a configuration value or key escapes into a retained output |
| 2 | Medium | Availability or delay only — a change is refused or held — or the missing information can be reconstructed from another system of record |
| 1 | Low | No effect on GMP data or decisions; diagnostic or convenience impact only |

### Probability (P) — likelihood of the failure mode

| Score | Level | Anchor |
| ----- | ----- | ------ |
| 3 | High | Expected in routine operation — every retried write, every approval, every store outage — unless controlled |
| 2 | Medium | Plausible under specific but foreseeable conditions: a particular adapter design, concurrency, misconfiguration, upgrades, operator pressure |
| 1 | Low | Requires a rare combination of conditions, or use contrary to the documented contract |

### Detectability (D) — likelihood that the failure escapes detection

A higher number is worse, as in core.

| Score | Level | Anchor |
| ----- | ----- | ------ |
| 3 | High | Unlikely to be noticed in normal operation; surfaces only through an incident or an investigation |
| 2 | Medium | Noticed by a routine check: checks on read, seal verification, IQ, evidence review, periodic review |
| 1 | Low | Surfaces immediately: a typed error, a refusal with its reason, core's audit-degraded latch, a failed IQ check |

### Risk class and priority

Risk class = S × P: **1–2 Low**, **3–4 Medium**, **6–9 High**. Priority = class weight (Low 1, Medium 2, High 3) × D, with the same bands:

| Risk class \ D | D 1 | D 2 | D 3 |
| -------------- | --- | --- | --- |
| Low (1) | Low (1) | Low (2) | Medium (3) |
| Medium (2) | Low (2) | Medium (4) | High (6) |
| High (3) | Medium (3) | High (6) | High (9) |

Verification rigour follows the **initial** class, or a High initial priority ([validation plan](./04-validation-plan.md) §4).

## §3 Risk register

Controls cite behaviours ([behaviors/](../behaviors/01-companion-boundary.md)) and invariants ([invariants.md](../invariants.md)). Behaviours of files 11–20 are cited by their block.

<a id="rsk-gx-001"></a>
### RSK-GX-001: Adapter acknowledges before commit

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A trail adapter answers `"stored"` before the entry is committed — a write-behind cache, asynchronous replication, a file write without flush — or the sink completes core's `write` before `append` returns. A crash, failover or power loss then loses entries core counts as written, so core neither retries nor latches. Trigger: any adapter whose commit point is later than its answer. |
| Effect on GMP data / processes | Records of admitted changes vanish; if the lost entries are the newest, the trail still numbers contiguously and looks complete. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | `append` answers `"stored"` only after commit (BEH-GX-011); the sink acknowledges only `"stored"` or a verified `"already-stored"` (BEH-GX-019), with no queue, buffer or background retry (BEH-GX-020); each adapter publishes its commit semantics in a manifest (BEH-GX-016); conformance cases drive the real core through `TestHost` with commit-then-hang, commit-then-fail, fail-before-commit and die (BEH-GX-025–032); loss of the newest entries is reported against high-water marks (BEH-GX-041–048). Invariants INV-GX-007, INV-GX-011. |
| Risks introduced by controls | Each write waits for the store's commit, so a slow store holds core's single writer and, past `auditTimeout`, latches the host ([RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020)). The suite cannot observe a remote store's real commit point; it shows only what the executed cases show. |
| Verification | Planned — acceptance scenarios REQ-GX-001, REQ-GX-002, REQ-GX-004 (conformance and sink cases; [traceability](../traceability.md) §7); conformance run against each `faultyTrailStore` mode with the expected failing case; mutation testing of the sink's acknowledgement. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | An adapter whose manifest misstates its commit point and whose fault cases happen to pass. Acceptable with the consumer's review of the adapter and its conformance run, and with high-water marks wired so tail loss is reported. |
| Owner | Companion + Consumer (adapter) |

<a id="rsk-gx-002"></a>
### RSK-GX-002: Duplicate or overwrite on retry

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Core retries a write whose acknowledgement was lost ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)); the adapter inserts a second copy, or upserts and replaces the stored entry; or a different record arrives under the same `recordId` or the same (`hostId`, `auditSeq`), for example from two host instances sharing a host id, and replaces the first. Trigger: every lost acknowledgement; every misconfigured host id. |
| Effect on GMP data / processes | Duplicates distort review; an overwrite replaces the original record with another, and the change it recorded is no longer shown as it happened. |
| Initial scoring | S 3 · P 3 · D 2 → class **High** (9) · priority **High** (6) |
| Controls | `append` is idempotent on `recordId` and fails with `reason: "conflict"` for a different entry under either key, never overwriting (BEH-GX-011, BEH-GX-012); the port has no update or delete (BEH-GX-013); the sink verifies an `"already-stored"` answer against the entry it offered (BEH-GX-021); conformance cases for retry after commit, conflicting content and two hosts (BEH-GX-028). Invariants INV-GX-006, INV-GX-008. |
| Risks introduced by controls | A conflict is a failed write: core retries, then latches the host, so a misconfigured duplicate host id stops changes until resolved — an availability cost that surfaces at once. |
| Verification | Planned — acceptance scenarios REQ-GX-001, REQ-GX-002, REQ-GX-004 ([traceability](../traceability.md) §7); property test of the sink over generated retry sequences; conformance retry and conflict cases. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | An adapter that enforces uniqueness in its tests but not under its production concurrency. Acceptable with the consumer's adapter review. |
| Owner | Companion (residual: Consumer for the adapter) |

<a id="rsk-gx-003"></a>
### RSK-GX-003: Undetected tail loss

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The newest entries of a host disappear — a store rolled back, restored from an older backup, truncated, or never flushed — and the remaining trail is contiguous from 1, so sequence checks find nothing. Trigger: any restore, failover or crash of the trail store. |
| Effect on GMP data / processes | The last changes made to the system have no record, and review does not show that anything is missing ([RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | `recordHighWater` writes high-water marks from `Host.controls.auditPosition` on a schedule and, at close, from `Host.controls` read after the final flush, never from `CloseReport.auditLastSeq` alone, into a separate `AnchorStore` (BEH-GX-041–044); `tailLoss` is reported when the store holds less than a mark says was written, and `unanchoredTail` for entries no mark covers (BEH-GX-045, BEH-GX-046); an unclean close is a finding (BEH-GX-037); findings are never suppressed (INV-GX-009). |
| Risks introduced by controls | Loss inside the last mark interval is not detectable, only reported as an unanchored tail. The anchor store is another port to operate; held with the trail it adds nothing ([RSK-GX-005](#rsk-gx-005)). |
| Verification | Planned — acceptance scenarios REQ-GX-008, REQ-GX-010 (anchors; [traceability](../traceability.md) §7); scenarios truncating the store below and above the last mark under `TestHost` and `TestClock`; mutation testing of the comparison. |
| Residual scoring | Anchors not used: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9). With anchors wired under separate custody: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Loss within one mark interval, and any loss when the anchors are lost with the trail. Acceptable only with anchors wired, a mark interval chosen by the consumer's risk assessment, and anchor custody apart from the trail. |
| Owner | Companion + Consumer |

<a id="rsk-gx-004"></a>
### RSK-GX-004: Over-claiming checks or sealing

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A report, document, release note or derived rendering describes "no findings" as a whole or unaltered trail, sealing as preventing tampering, an attested signature as verified, or an evidence pack as validation; the user relies on it and drops a control of their own. Trigger: every document and output the companion produces. |
| Effect on GMP data / processes | A responsibility moves from the regulated user to a library that cannot carry it; the missing control is discovered only at inspection or after an incident. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | A check report carries `checked` and `range` and claims only the absence of the checked kinds (BEH-GX-033); seal verification is described in exactly one way and a chain without a matching anchor shows only consistency (BEH-GX-054, BEH-GX-055); the companion inherits core's non-claims and adds its own (BEH-GX-008); conformance output is evidence, not a verdict (BEH-GX-031); the claims lint and the "supports" check of the documentation gate ([ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)). Invariants INV-GX-009, INV-GX-013. |
| Risks introduced by controls | Plain wording may read as weakness and invite users to restate results more strongly in their own documents, which the lint does not reach. |
| Verification | Planned — documentation gate D1 with `--strict` on every change; golden tests of report and rendering wording; acceptance scenarios REQ-GX-005, REQ-GX-008, REQ-GX-011, REQ-GX-040 ([traceability](../traceability.md) §7). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Over-claiming in the user's own documents or user interface built on companion output. Acceptable: those are the consumer's, and ADR-GX-027 gives them the list to check against. |
| Owner | Companion (residual: Consumer) |

<a id="rsk-gx-005"></a>
### RSK-GX-005: Anchors held with the trail

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The anchor store sits in the same database, account or administrative domain as the trail store, so whoever can rewrite or roll back the trail can rewrite the anchors to match; high-water checks and seal verification then report nothing. Trigger: the convenient deployment, one store for both. |
| Effect on GMP data / processes | Tail loss, and alteration of sealed records, go unreported while the user believes detection is in place. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Anchors go to their own port, append-only, with no default (BEH-GX-041); the adapter manifest names a custodian, which reports show, and custody is declared rather than verified (BEH-GX-047); IQ lists anchor custody as `not-executed`, a consumer obligation, so it appears in the pack as open (BEH-GX-113–120); seal verification is described only against a party that cannot also rewrite the anchor store (BEH-GX-054, BEH-GX-055). Invariant INV-GX-013. |
| Risks introduced by controls | A second store to provision, monitor and retain; an anchor-store outage leaves marks unwritten and the unanchored tail grows. |
| Verification | Planned — acceptance scenarios REQ-GX-011, REQ-GX-026, REQ-GX-040 (anchor and seal cases, including an anchor store rewritten together with the trail, asserting no finding and the stated limit in the report; [traceability](../traceability.md) §7). |
| Residual scoring | Companion controls alone: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9). With the anchor store under separate custody: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | The companion cannot observe custody. Acceptable **only** with the consumer's separation of custody, documented and reviewed in their procedures. |
| Owner | Consumer (the companion declares and shows custody) |

<a id="rsk-gx-006"></a>
### RSK-GX-006: Ticket replay or transfer

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | One approval is used for more than the change approved: a ticket cited by a second call, by two concurrent calls, or again after a failed call; a binding presented for a different target, plugin version, configuration value or requester; a signature copied onto another ticket. Trigger: any caller holding a ticket id. |
| Effect on GMP data / processes | A change takes effect under an approval given for a different change (21 CFR 11.10(g), 11.70). |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | The binding digest covers operation, target, definition, configuration paths and fingerprints, requester and, where bound, reason (BEH-GX-065, BEH-GX-066); the gate recomputes it from the request core passes (BEH-GX-089–096); consumption is by compare-and-set and a failed call burns the binding (BEH-GX-068, BEH-GX-071); signature linking by ticket id, digest and consumption (BEH-GX-081–088); the gate never caches. Invariants INV-GX-002, INV-GX-003. |
| Risks introduced by controls | Burning on failure costs re-approval ([RSK-GX-007](#rsk-gx-007)); concurrent calls on one ticket refuse all but one. |
| Verification | Planned — acceptance scenarios REQ-GX-009, REQ-GX-012, REQ-GX-017, REQ-GX-018, REQ-GX-021, REQ-GX-035, REQ-GX-038 ([traceability](../traceability.md) §7); property test over concurrent gated calls citing one ticket; one-field-different binding property test; mutation testing of the compare-and-set and digest steps. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A ticket-store adapter whose compare-and-set is not atomic under its production concurrency. Acceptable with the consumer's adapter review; the cross-store check reports a binding consumed twice (BEH-GX-039). |
| Owner | Companion (residual: Consumer for the ticket-store adapter) |

<a id="rsk-gx-007"></a>
### RSK-GX-007: Burned tickets drive exemption creep

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Because a failed call burns its ticket and re-approval needs new signatures, operators under time pressure widen target patterns or add exemptions, until regulated changes pass without approval. Trigger: frequent failing changes, scarce approvers. |
| Effect on GMP data / processes | Approval control erodes through configuration, each step individually justified. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Deny by default: with no matching rule a ticket is required (BEH-GX-057, BEH-GX-058); exemptions are explicit rules with a justification (BEH-GX-059); the policy is identified by its digest, which IQ records and against which tickets are checked (BEH-GX-061, BEH-GX-113–120); the policy is checked once and fixed for the gate's life (BEH-GX-064). Invariant INV-GX-003. |
| Risks introduced by controls | A fixed policy means every policy change is a restart of the assembly, which some users will avoid by writing broad rules up front. |
| Verification | Planned — acceptance scenarios REQ-GX-026, REQ-GX-034 (policy cases; [traceability](../traceability.md) §7); scenario showing a policy change alters the digest and invalidates outstanding tickets. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | The content of the policy. Acceptable with the policy under the consumer's change control and its digest reviewed at periodic review. |
| Owner | Consumer + Companion |

<a id="rsk-gx-008"></a>
### RSK-GX-008: Separation of duties bypassed by unauthenticated actor ids

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Actor and signer identifiers are strings the companion compares but cannot authenticate: a requester calls under another identifier than the one bound, one person holds two identifiers and approves their own change under the second, or a caller supplies a signer identifier. Trigger: any deployment where identifiers are not bound to authenticated people ([BEH-BR-191](../../core/behaviors/22-attributable-operations.md)). |
| Effect on GMP data / processes | A person approves their own change; the record shows two names for one decision-maker. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Signers are distinct, never the requester and never a reserved actor (BEH-GX-078); the signer identifier comes from the signature port's answer, never from the caller (BEH-GX-075); the requester is part of the binding digest and is compared with `request.actor.id` at the gate (BEH-GX-066, BEH-GX-089–096). Invariant INV-GX-004. |
| Risks introduced by controls | Requiring distinct signers can stall changes where few approvers exist, which pushes toward exemptions ([RSK-GX-007](#rsk-gx-007)). |
| Verification | Planned — acceptance scenarios REQ-GX-012, REQ-GX-014, REQ-GX-018, REQ-GX-038 (separation-of-duties cases; [traceability](../traceability.md) §7); property test over generated signer sets. |
| Residual scoring | Companion controls alone: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9). With the consumer's identity binding and alias control: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Two identifiers for one person, and identifiers not bound to authentication. Acceptable **only** with the consumer's identity management; transferred to the regulated user's assessment ([ADR-GX-015](../decisions/015-separation-of-duties.md)). |
| Owner | Consumer |

<a id="rsk-gx-009"></a>
### RSK-GX-009: Signature without re-authentication or with the wrong meaning

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The signature port returns a signature from a cached session with no re-authentication, signs automatically, or records a meaning other than the one the signer saw; or a scripted or no-op capture is wired. Trigger: a convenience implementation of the port. |
| Effect on GMP data / processes | An approval whose signer did not act, or did not mean what the record says (21 CFR 11.50, 11.200). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | No default capture, not even a no-op (BEH-GX-073, BEH-GX-080); the request shows the rendered binding and the meaning (BEH-GX-074); a captured signature must echo the requested meaning and attest `reauthenticated: true` with method, event and components, and is refused otherwise (BEH-GX-075, BEH-GX-079); declining and failing leave the ticket unsigned (BEH-GX-077); the scripted fixture is marked and fails IQ (BEH-GX-145–152). Invariants INV-GX-001, INV-GX-014, INV-GX-015. |
| Risks introduced by controls | An attestation field can be set to `true` by an implementation that did nothing; recording it may be mistaken for verification ([RSK-GX-004](#rsk-gx-004)). |
| Verification | Planned — acceptance scenarios REQ-GX-013, REQ-GX-014, REQ-GX-015, REQ-GX-041 (signature cases: wrong meaning, missing printed name, missing attestation, decline, failure; [traceability](../traceability.md) §7); IQ scenario with the scripted capture wired. |
| Residual scoring | Companion controls alone: S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9). With the consumer's assured signature port: S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4). |
| Residual risk and acceptability | Whatever the port attests without doing. Acceptable **only** with the consumer's assurance of their signature port and its §11.200 controls. |
| Owner | Consumer |

<a id="rsk-gx-010"></a>
### RSK-GX-010: Ticket-store outage blocks every change

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The ticket store is unavailable, so the gate refuses every gated operation — including `acknowledgeAuditDegraded` when the policy requires a ticket for it, leaving a latched host unable to resume changes. Trigger: any ticket-store outage. |
| Effect on GMP data / processes | No configuration change can be made, including corrective ones, until the store returns; no change is made unapproved. |
| Initial scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Controls | A store failure or a missed internal deadline is the precise refusal `ticket-store-unavailable` (BEH-GX-089–096); `acknowledgeAuditDegraded` must have its own deliberate rule (BEH-GX-062); shutdown and system transitions are outside the policy (BEH-GX-063). Invariant INV-GX-011. |
| Risks introduced by controls | An exemption chosen for `acknowledgeAuditDegraded` lets that one operation through unapproved; its justification and the policy digest are recorded. |
| Verification | Planned — acceptance scenarios REQ-GX-018, REQ-GX-034 (store outage, latch acknowledgement under each rule kind; [traceability](../traceability.md) §7). |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | Unavailability during an outage. Acceptable: fail closed is intended; continuity of the store is the consumer's (Annex 11 §16). |
| Owner | Consumer (store availability) + Companion |

<a id="rsk-gx-011"></a>
### RSK-GX-011: Policy exempts regulated operations

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A broad target pattern, an exempt rule placed before a required one, or an operation left out lets a regulated change through the gate without a ticket. Trigger: writing or changing the policy. |
| Effect on GMP data / processes | Unapproved changes to a GMP system that the record shows as allowed (Annex 11 §10). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Deny by default; the first matching rule decides and with no match a ticket is required (BEH-GX-057, BEH-GX-058); exemptions explicit and justified (BEH-GX-059); a contradictory rule set, or one leaving an operation without a decision, fails with `PolicyInvalid` at construction (BEH-GX-064); the policy digest is recorded and checked (BEH-GX-061); approvals and records are checked against each other, so gated records without an approval are a finding (BEH-GX-039). Invariant INV-GX-003. |
| Risks introduced by controls | Construction-time validation can only find structural faults; an exemption that is well-formed but wrong passes it. |
| Verification | Planned — acceptance scenarios REQ-GX-009, REQ-GX-034 (policy cases: no match, overlapping rules, exempt before required, invalid sets; [traceability](../traceability.md) §7). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A deliberate but wrong exemption. Acceptable with the policy under the consumer's change control and review. |
| Owner | Consumer + Companion |

<a id="rsk-gx-012"></a>
### RSK-GX-012: Low-entropy values enumerated through the fingerprint oracle

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A fingerprinted value with few possible values — a flag, an enumeration, a short number or PIN — is recovered by computing fingerprints of every candidate and comparing; anyone who can call the fingerprinter, `proposeFingerprints` or `matchesFingerprint` with the key available has such an oracle. Trigger: a low-entropy path made eligible. |
| Effect on GMP data / processes | A configuration value, possibly a secret, is recoverable from fingerprints in every record and ticket that carries them, which cannot be purged. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Fingerprints are HMAC-SHA256 under a caller-supplied key, never an unkeyed hash, with domain separation by scope, plugin, path and form (BEH-GX-097–104); eligibility is an allow-list, deny by default, and low-entropy secrets are never eligible (BEH-GX-097–104, [ADR-GX-018](../decisions/018-eligibility-allow-list.md)); comparison needs the key provider (BEH-GX-105–112). Invariant INV-GX-005. |
| Risks introduced by controls | Paths not eligible are approved by path only, without binding the value; the eligibility list is configuration the consumer must keep correct. |
| Verification | Planned — acceptance scenarios REQ-GX-022 (eligibility and fingerprint cases; [traceability](../traceability.md) §7); test vectors recomputed by check 17. |
| Residual scoring | S 3 · P 1 · D 3 → class Medium (3) · priority **High** (6) |
| Residual risk and acceptability | Enumeration by a key holder leaves no trace. Acceptable **only** with consumer controls: eligibility reviewed for entropy, key access restricted to the fingerprinter, the oracle functions not exposed to operators. Transferred to the regulated user's assessment, as core's [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024) residual. |
| Owner | Consumer + Companion |

<a id="rsk-gx-013"></a>
### RSK-GX-013: Key compromise or loss

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The fingerprint key leaks — letting its holder test guesses against every stored fingerprint offline — or is lost, so stored fingerprints can no longer be compared and tickets binding them cannot be re-checked. Trigger: key handling outside the provider; provider without backup. |
| Effect on GMP data / processes | Eligible values become guessable; or approvals bound to values can no longer be shown to match the change. |
| Initial scoring | S 3 · P 1 · D 3 → class Medium (3) · priority **High** (6) |
| Controls | Keys come only from a caller-supplied provider, as WebCrypto `CryptoKey` objects; only the key id appears in a fingerprint or output (BEH-GX-105–112, INV-GX-005); retired keys stay usable for comparison and rotation makes outstanding tickets stale, so they are re-issued (BEH-GX-105–112, [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)); `test:` keys are refused in production (INV-GX-014); a provider failure refuses (INV-GX-011). |
| Risks introduced by controls | Rotation invalidates outstanding tickets and causes re-approval work; keeping retired keys extends the exposure window of each key. |
| Verification | Planned — acceptance scenarios REQ-GX-023, REQ-GX-024, REQ-GX-025, REQ-GX-031 (key cases: rotation, retired key comparison, provider failure, `test:` key refused; [traceability](../traceability.md) §7); canary test that no key material appears in any output. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Key custody, backup and access. Acceptable **only** with the consumer's key management; the companion manages no key ([ADR-GX-027](../decisions/027-claims-and-non-claims.md) non-claim 18). |
| Owner | Consumer |

<a id="rsk-gx-014"></a>
### RSK-GX-014: A fingerprint that leaks its value

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The fingerprint function itself reveals the value: an unkeyed or truncated hash, the value or its length embedded, one key reused across domains, or an error message quoting the value. Trigger: a defect in the fingerprinter or its error mapping. |
| Effect on GMP data / processes | As [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008): a secret enters retained records and tickets. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | The fixed construction `HMAC-SHA256(key, JCS({v:1, scope, pluginId, path, form, value}))` in the format `fp1:hmac-sha256:<keyId>:<b64url>`, with test vectors (BEH-GX-097–104); platform cryptography only (BEH-GX-002); no value or port text in any output (BEH-GX-006). Invariants INV-GX-005, INV-GX-012. |
| Risks introduced by controls | A fixed format means a weakness found in the construction affects every stored fingerprint; a format version change is a CCR-GX and a revalidation trigger. |
| Verification | Planned — acceptance scenarios REQ-GX-022, REQ-GX-031, REQ-GX-038 ([traceability](../traceability.md) §7); test vectors recomputed by the documentation gate (check 17) and merge-gate row 10; canary scan of outputs; mutation testing of the construction. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A defect not caught by vectors and canaries. Acceptable under the verification above. |
| Owner | Companion |

<a id="rsk-gx-015"></a>
### RSK-GX-015: Issuer and gate canonicalise differently

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The issuer digests a binding built from a proposed request and the gate digests one built from core's actual request, and the two differ in form — field order, an absent versus `undefined` field, number formatting, raw versus decoded configuration — so valid approvals are refused; or the canonical form drops a distinction, so two different changes share a digest. Trigger: any divergence between the two construction paths or platforms. |
| Effect on GMP data / processes | Refused valid changes (availability), or, in the second case, an approval valid for a change it does not describe. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | One canonicalisation module and one binding constructor used by issuer and gate (BEH-GX-066, BEH-GX-089–096); values JCS cannot represent are rejected, not coerced; `proposeFingerprints` decodes and selects as the call will (BEH-GX-097–104); test vectors for bindings and fingerprints. Invariants INV-GX-012, INV-GX-003. |
| Risks introduced by controls | Strict rejection of non-JCS values refuses some proposals that a lenient form would accept. |
| Verification | Planned — acceptance scenarios REQ-GX-012, REQ-GX-018, REQ-GX-022, REQ-GX-038 ([traceability](../traceability.md) §7); property test that a binding built from a proposal and from the resulting request digest equally; vectors on every supported runtime. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | A divergence introduced by a core change to `OperationRequest`, covered by the version range of [RSK-GX-019](#rsk-gx-019). Acceptable. |
| Owner | Companion |

<a id="rsk-gx-016"></a>
### RSK-GX-016: Evidence reports a pass for an unexecuted or failed test

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The evidence generator reports pass for a requirement whose test failed, was skipped, never ran, ran against a different package version, or does not exist; or a result is typed in, read from source, or relabelled; or an unknown requirement tag is silently dropped. Trigger: any defect or option in the generator; any hand edit of a pack. |
| Effect on GMP data / processes | A regulated user leverages evidence that a behaviour was tested when it was not, and qualifies a system on it ([RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Results come only from vitest JSON, JUnit XML or Cucumber NDJSON of a run against the installed package; fail beats pass, all-skipped is skipped, no test is not covered; unknown tags and package mismatches are deviations (BEH-GX-121–128); the pack records SHA-256 of every attachment and a pack digest, and derived reports are marked as derived (BEH-GX-129–136); the generator has no option to exclude or relabel; it is self-tested on a known-bad corpus ([validation plan](./04-validation-plan.md) §5.4). Invariant INV-GX-010. |
| Risks introduced by controls | Literal outcomes surface many "not covered" and deviation entries, which may tempt users to discount the pack as noise. |
| Verification | Planned — the generator's self-test (merge-gate row 11); acceptance scenarios REQ-GX-027, REQ-GX-042 (evidence cases; [traceability](../traceability.md) §7); mutation score of at least 80% on the generator. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Runner output that is itself wrong (a runner defect), and a pack altered after its digest was recorded but before the user stores it. Acceptable with the consumer's review of the pack, re-execution in their environment, and storage of the pack digest apart from the pack. |
| Owner | Companion (residual: Consumer) |

<a id="rsk-gx-017"></a>
### RSK-GX-017: Test fixtures wired in production

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | `memoryTrailStore`, `memoryTicketStore`, `memoryAnchorStore`, `scriptedSignatureCapture` or `testKeyProvider` is wired into a production assembly — copied from an example or left from a test. Trigger: assembly code shared between tests and production. |
| Effect on GMP data / processes | Records and approvals live in memory and vanish at restart; signatures are scripted; fingerprints use a known key. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | No port has a default outside the testing entry point (BEH-GX-003, BEH-GX-004); fixtures carry `fixture: true` in their manifests, their key ids start with `test:` and their signatures carry the method "test-fixture" (BEH-GX-145–152); IQ fails on any marked port, `test:` key or scripted capture, with a deviation (BEH-GX-113–120). Invariants INV-GX-001, INV-GX-014. |
| Risks introduced by controls | None beyond the build check that keeps the marker off main-entry implementations. |
| Verification | Planned — acceptance scenarios REQ-GX-026, REQ-GX-029, REQ-GX-030, REQ-GX-041 (IQ with each fixture wired; [traceability](../traceability.md) §7); build check of the main entry point. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | An assembly never put through IQ. Acceptable: running IQ is the consumer's. |
| Owner | Companion + Consumer |

<a id="rsk-gx-018"></a>
### RSK-GX-018: Clock skew on ticket expiry

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The issuer's clock, the signature time and the gate's clock disagree, so a ticket is accepted after its intended `notAfter`, refused before `notBefore`, or signatures carry wrong times. Trigger: unsynchronised clocks across processes. |
| Effect on GMP data / processes | An approval used slightly outside its window, or a manifestation with a wrong time. |
| Initial scoring | S 2 · P 2 · D 2 → class Medium (4) · priority Medium (4) |
| Controls | Every timestamp comes from Effect `Clock` (BEH-GX-076); the window is half-open and checked at the gate with the gate's clock, with no grace period (BEH-GX-065, BEH-GX-089–096); tickets carry their issue and signing times for review. Invariant INV-GX-003. |
| Risks introduced by controls | No grace period means a skewed gate refuses valid tickets near the window's edges. |
| Verification | Planned — acceptance scenarios REQ-GX-014, REQ-GX-018 (window boundaries under `TestClock`; [traceability](../traceability.md) §7). |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Clock accuracy. Acceptable with the consumer's clock synchronisation, as for core ([BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md)). |
| Owner | Consumer |

<a id="rsk-gx-019"></a>
### RSK-GX-019: schemaVersion drift between core and companion

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A core upgrade adds a record or request field or changes `schemaVersion`, and the companion keeps running: it canonicalises a shape it was not built for, digests and bindings change silently, checks misread entries, archives are interpreted under the wrong version. Trigger: a core upgrade outside the pinned minor line, or any change to a core identifier listed in the [core interface map](../appendices/core-interface-map.md). |
| Effect on GMP data / processes | Valid approvals refused or, worse, bindings that no longer cover a new field; stored records unreadable by the checks. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | A core version range of one minor line and a compatibility matrix, with a pair added only by evidence ([ADR-GX-025](../decisions/025-core-version-range.md)); `GxpLayer.make` refuses an unsupported core (BEH-GX-007); the sink refuses an unsupported `schemaVersion` so core latches rather than storing it (BEH-GX-018); unknown schema versions are reported on read, never skipped (BEH-GX-036); IQ records the version pair as a proof (BEH-GX-113–120); the coupling rule ([change control](../process/change-control.md) §7). Invariant INV-GX-012. |
| Risks introduced by controls | Every new core minor line needs a companion release, so fixes released in a new core minor can wait on the companion. |
| Verification | Planned — acceptance scenarios REQ-GX-001, REQ-GX-003, REQ-GX-008, REQ-GX-026, REQ-GX-033 (unsupported core, unsupported schema version on write and on read; [traceability](../traceability.md) §7). |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | A core change that alters behaviour without changing version or shape. Acceptable under the coupling rule and the re-run of the full suite for each pair. |
| Owner | Companion |

<a id="rsk-gx-020"></a>
### RSK-GX-020: Inaccurate human-readable copy

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | The rendering a signer sees, or the human-readable export, differs from the canonical binding or record: a field omitted, a value truncated, a time in the wrong zone, a meaning reworded. Trigger: rendering code that formats separately from the canonical form. |
| Effect on GMP data / processes | A signer approves something other than what is bound; an inspector reads a copy that misstates the record (21 CFR 11.10(b), 11.50). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | The rendered text is generated from the binding itself and shown with the meaning (BEH-GX-074); every signed binding renders printed name, UTC time and meaning (BEH-GX-081–088); archives keep the original canonical bytes and mark renderings as derived (BEH-GX-137–144). Invariants INV-GX-008, INV-GX-015. |
| Risks introduced by controls | A rendering that shows every field verbatim can be long and is skimmed by signers. |
| Verification | Planned — acceptance scenarios REQ-GX-015, REQ-GX-021, REQ-GX-028, REQ-GX-039 (rendering and export cases; [traceability](../traceability.md) §7); golden-file tests under `TestClock`; a property test that every bound field appears in the rendering. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | How the consumer's user interface presents the rendered text. Acceptable with the consumer's assurance of that presentation. |
| Owner | Companion (residual: Consumer) |

<a id="rsk-gx-021"></a>
### RSK-GX-021: A slow store causes gate-timeout refusals

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Ticket-store reads or the compare-and-set take longer than core's `gateTimeout`, so core abandons the gate and refuses without a precise reason; or a hang holds every gated call for the full timeout. Trigger: a slow or overloaded ticket store. |
| Effect on GMP data / processes | Changes refused or delayed; refusals that do not say why slow diagnosis. No change is made unapproved. |
| Initial scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Controls | An internal deadline below `gateTimeout` turns a slow store into the precise refusal `ticket-store-unavailable` (BEH-GX-089–096); the gate never caches, so no stale state is used to save time; IQ fails a non-finite `gateTimeout` or one that does not exceed the internal deadline by at least 1 second (BEH-GX-113–120). Invariant INV-GX-011. |
| Risks introduced by controls | A deadline too tight refuses calls a slightly slower store could have served. |
| Verification | Planned — acceptance scenarios REQ-GX-018, REQ-GX-026 (slow store under `TestClock`, refusal reason, `gateTimeout` checks in IQ; [traceability](../traceability.md) §7). |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | Store performance. Acceptable: fail closed is intended; sizing the store is the consumer's. |
| Owner | Consumer + Companion |

<a id="rsk-gx-022"></a>
### RSK-GX-022: A reconcile partially applied against a bundle

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A `reconcile` cites one bundle ticket; some entry actions are allowed and applied, a later one fails or is refused, and the system is left part-way; or an entry outside the bundle is applied under it; or the unconsumed remainder is reused for a different reconcile. Trigger: any reconcile that does not complete. |
| Effect on GMP data / processes | A configuration in a state nobody approved as a whole, with approvals partly used. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | One binding per entry action, each consumed by its own gate decision since core gates each entry (BEH-GX-072, BEH-GX-089–096, [BEH-BR-222](../../core/behaviors/25-operation-gate.md)); an entry with no binding in the bundle is refused; each binding covers exactly its entry (BEH-GX-066); approvals and records are checked against each other, so a partly consumed bundle is a finding (BEH-GX-039). Invariants INV-GX-002, INV-GX-003. |
| Risks introduced by controls | Per-entry consumption makes partial application visible but does not prevent it: core's reconcile is not a transaction. |
| Verification | Planned — acceptance scenarios REQ-GX-009, REQ-GX-012, REQ-GX-018, REQ-GX-019, REQ-GX-038 (bundle cases: entry outside the bundle, failure mid-way, reuse of the remainder; [traceability](../traceability.md) §7). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | The part-applied state. Acceptable with the consumer's procedure for reviewing and re-approving the remainder. |
| Owner | Companion + Consumer |

## §4 Summary

| ID | Title | Class before | Priority | Residual (class / priority) | Owner |
| -- | ----- | ------------ | -------- | --------------------------- | ----- |
| [RSK-GX-001](#rsk-gx-001) | Adapter acknowledges before commit | High | High | Medium / Medium | Companion + Consumer |
| [RSK-GX-002](#rsk-gx-002) | Duplicate or overwrite on retry | High | High | Medium / Low | Companion; Consumer for the adapter |
| [RSK-GX-003](#rsk-gx-003) | Undetected tail loss | High | High | High / High (no anchors); Medium / Medium with anchors under separate custody | Companion + Consumer |
| [RSK-GX-004](#rsk-gx-004) | Over-claiming checks or sealing | High | High | Medium / Medium | Companion; Consumer for their own documents |
| [RSK-GX-005](#rsk-gx-005) | Anchors held with the trail | High | High | High / High (companion alone); Medium / Medium with consumer custody | Consumer |
| [RSK-GX-006](#rsk-gx-006) | Ticket replay or transfer | High | High | Medium / Medium | Companion; Consumer for the ticket-store adapter |
| [RSK-GX-007](#rsk-gx-007) | Burned tickets drive exemption creep | High | High | Medium / Medium | Consumer + Companion |
| [RSK-GX-008](#rsk-gx-008) | Separation of duties bypassed by unauthenticated actor ids | High | High | High / High (companion alone); Medium / Medium with consumer identity binding | Consumer |
| [RSK-GX-009](#rsk-gx-009) | Signature without re-authentication or with the wrong meaning | High | High | High / High (companion alone); Medium / Medium with an assured port | Consumer |
| [RSK-GX-010](#rsk-gx-010) | Ticket-store outage blocks every change | Medium | Low | Low / Low | Consumer + Companion |
| [RSK-GX-011](#rsk-gx-011) | Policy exempts regulated operations | High | High | Medium / Medium | Consumer + Companion |
| [RSK-GX-012](#rsk-gx-012) | Low-entropy values enumerated through the fingerprint oracle | High | High | Medium / High | Consumer + Companion |
| [RSK-GX-013](#rsk-gx-013) | Key compromise or loss | Medium | High | Medium / Medium | Consumer |
| [RSK-GX-014](#rsk-gx-014) | A fingerprint that leaks its value | High | High | Medium / Medium | Companion |
| [RSK-GX-015](#rsk-gx-015) | Issuer and gate canonicalise differently | High | High | Medium / Low | Companion |
| [RSK-GX-016](#rsk-gx-016) | Evidence reports a pass for an unexecuted or failed test | High | High | Medium / Medium | Companion; Consumer for pack review |
| [RSK-GX-017](#rsk-gx-017) | Test fixtures wired in production | High | High | Medium / Low | Companion + Consumer |
| [RSK-GX-018](#rsk-gx-018) | Clock skew on ticket expiry | Medium | Medium | Low / Low | Consumer |
| [RSK-GX-019](#rsk-gx-019) | schemaVersion drift between core and companion | High | High | Medium / Low | Companion |
| [RSK-GX-020](#rsk-gx-020) | Inaccurate human-readable copy | High | High | Medium / Medium | Companion; Consumer for presentation |
| [RSK-GX-021](#rsk-gx-021) | A slow store causes gate-timeout refusals | Medium | Low | Low / Low | Consumer + Companion |
| [RSK-GX-022](#rsk-gx-022) | A reconcile partially applied against a bundle | High | High | Medium / Medium | Companion + Consumer |

**Risks introduced by controls.** The companion's controls are fail-closed, so their main cost is availability: a slow or failing trail store latches core (RSK-GX-001, RSK-GX-002), a ticket-store outage or slowness refuses changes (RSK-GX-010, RSK-GX-021), burned tickets and key rotation force re-approval (RSK-GX-006, RSK-GX-013) and so press toward exemptions (RSK-GX-007), and a core range of one minor line delays upgrades to a new core minor (RSK-GX-019). Detective controls bring a second store to operate (RSK-GX-003, RSK-GX-005), and attested fields can be mistaken for verified ones (RSK-GX-009). Each is scored in its own entry.

**Residuals the regulated user must carry into their own assessment:** reviewing each adapter and its conformance run (RSK-GX-001, RSK-GX-002, RSK-GX-006); wiring anchors with an interval set by risk, under custody apart from the trail (RSK-GX-003, RSK-GX-005); their own documents and user interfaces built on companion output (RSK-GX-004, RSK-GX-020); the approval policy under change control (RSK-GX-007, RSK-GX-011); identity binding and alias control (RSK-GX-008); the signature port and its §11.200 controls (RSK-GX-009); ticket-store availability and performance (RSK-GX-010, RSK-GX-021); the eligibility list, key custody and access to the fingerprint oracle (RSK-GX-012, RSK-GX-013); reviewing and re-executing evidence (RSK-GX-016); running IQ (RSK-GX-017); clock synchronisation (RSK-GX-018); reviewing a partly applied reconcile (RSK-GX-022).

No residual score is yet supported by evidence; each becomes supportable only when the verification named in its entry has been executed and passed ([validation plan](./04-validation-plan.md)).

## §5 Review triggers

The register is reviewed, and affected entries re-scored, under a CCR-GX when any of the following occurs:

1. **A CCR-GX with GxP impact** ([change control](../process/change-control.md) §3) — any change to a port shape, the canonical form, a digest or fingerprint construction, the gate's steps or refusal reasons, the policy format, the evidence rules, or a compliance-matrix row.
2. **A core change under the coupling rule** — any CCR-BR touching an identifier of the [core interface map](../appendices/core-interface-map.md), and any new core version added to the compatibility matrix (RSK-GX-019).
3. **Key or policy events reported by a user** — a key compromise, a change of key provider, or a policy change pattern that suggests exemption creep (RSK-GX-007, RSK-GX-011, RSK-GX-013).
4. **Any incident** — a defect report, a failed scenario, a surviving mutant in a control's code, a self-test failure of the evidence generator, or a user-reported incident that touches a hazard here or reveals a missing one.
5. **Regulatory change** — finalisation of the EU GMP Annex 11 revision, or a change to any instrument of the [regulatory scope](./01-regulatory-scope.md) §5.
6. **Transition from prospective** — when code first exists, every residual is re-examined against executed evidence before any document leaves Draft ([ADR-GX-026](../decisions/026-prospective-specification.md)).
7. **Periodic review** — at the periodic review of the [validation plan](./04-validation-plan.md) §8.

---

_Previous: [Compliance matrix](./02-compliance-matrix.md)_ · _Next: [Validation plan](./04-validation-plan.md)_
