# Core Interface Map

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-APP-01                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Appendix                                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

This appendix lists every core identifier the companion relies on, and what
it relies on each one for. It is the companion's side of the coupling rule
([change control](../process/change-control.md) §7): a core change that touches an
identifier listed here needs a `CCR-GX` that assesses it. The checker fails
when a document of this tree cites a core identifier that is not defined in
`references/core` or not listed here (check 14), and `--strict` fails when an
identifier listed here is cited by no other document of the tree, so that the
list stays exact in both directions.

The appendix is informative about core — core's own documents are normative
for core — and normative for the companion: a behaviour of this tree that
relies on a core property not listed here is a specification defect.

"Used by" names the companion's behaviour files (`behaviors/NN`) and other
documents that rely on the identifier; it is a guide, not a complete index.

## 1. Behaviours

| Core identifier | Title in core | What the companion relies on | Used by |
| --------------- | ------------- | ---------------------------- | ------- |
| [BEH-BR-013](../../core/behaviors/02-host-construction.md) | The Host interface | `Host.controls` (CCR-BR-014): wiring of the audit, gate and fingerprinter ports, `attribution`, `auditTimeout`, `gateTimeout`, `fingerprintTimeout`, `idGenerator`, and `auditPosition.lastWritten`, readable after close | 06, 15 |
| [BEH-BR-015](../../core/behaviors/02-host-construction.md) | Optional GxP ports are resolved once, at construction | The ports the companion provides are read once when the host is built, so `GxpLayer.make` is provided to `Bridger.layer` and never per operation | 01, 15 |
| [BEH-BR-016](../../core/behaviors/02-host-construction.md) | Each host has a distinct hostId | `hostId` keys trail entries, seal chains, anchors and high-water marks; two hosts never share a sequence | 02, 06, 07 |
| [BEH-BR-103](../../core/behaviors/11-configuration.md) | Configuration values are never observable | Values reach the companion only through the `ConfigFingerprinter` port, never through records, requests, events or errors | 13, 14 |
| [BEH-BR-106](../../core/behaviors/12-shutdown-and-hosting.md) | CloseReport reports every failure | `CloseReport.auditLastSeq` (CCR-BR-014) is the highest number the sink had accepted when the report was produced, before the shutdown's own terminal record (finding G34); it is only a lower bound for the close mark, which is read from `Host.controls` after the flush | 06 |
| [BEH-BR-177](../../core/behaviors/21-testing-host.md) | TestHost is a Host with deterministic scheduling | Conformance and acceptance runs drive the production host path through `TestHost`, never a mock of core | 04, 19, 20 |
| [BEH-BR-178](../../core/behaviors/21-testing-host.md) | The reconciler is steppable | Conformance cases order steps and settle with `awaitIdle` deterministically | 04 |
| [BEH-BR-179](../../core/behaviors/21-testing-host.md) | Time comes from TestClock and identifiers from a counter | Deterministic record ids, timestamps and ticket windows in conformance runs and test vectors | 04, 09, 19 |
| [BEH-BR-180](../../core/behaviors/21-testing-host.md) | Faults are injected, scoped and visible as faults | `Fault.*` drives the sink and gate failure cases of the conformance suite | 04 |
| [BEH-BR-181](../../core/behaviors/21-testing-host.md) | An in-memory AuditSink fixture, for tests only | The companion's fixtures follow the same rule: test fixtures live only in a testing entry point and are marked | 19 |
| [BEH-BR-182](../../core/behaviors/21-testing-host.md) | A scripted OperationGate fixture, with no implicit decision | `scriptedSignatureCapture` follows the same rule: the decision function is required | 10, 19 |
| [BEH-BR-183](../../core/behaviors/21-testing-host.md) | Required acceptance checks — the lifecycle core | The numbering style of the companion's acceptance checks; OQ evidence resolves `@REQ-BR` tags of these checks | 16, 20 |
| [BEH-BR-184](../../core/behaviors/21-testing-host.md) | Required acceptance checks — extensions and GxP hooks | Checks 55–58 (CCR-BR-014) cover the core half of fingerprints, `Host.controls` and the presented definition; OQ evidence resolves their tags | 16, 20 |
| [BEH-BR-185](../../core/behaviors/22-attributable-operations.md) | Actor and OperationContext | Actor identifiers and reserved actors used by separation of duties; `correlationId` cites the ticket | 08, 10, 12 |
| [BEH-BR-186](../../core/behaviors/22-attributable-operations.md) | Every mutating operation accepts an OperationContext | The list of mutating operations the policy covers, and `Host.controls` as a read-only call | 08, 12, 15 |
| [BEH-BR-188](../../core/behaviors/22-attributable-operations.md) | The order of a mutating call | Step 4a (fingerprints after validation and decoding, before the gate), the gate's place, and the uninterruptible span after approval | 12, 13 |
| [BEH-BR-189](../../core/behaviors/22-attributable-operations.md) | Required attribution and required reasons | A binding with `bindReason` binds the reason core requires and records; the requester is the attributed actor | 08, 09 |
| [BEH-BR-191](../../core/behaviors/22-attributable-operations.md) | Core does not authenticate, and does not infer identity | Separation of duties compares actor identifiers that only the consumer's identity system can authenticate | 10, 12 |
| [BEH-BR-192](../../core/behaviors/22-attributable-operations.md) | Attribution reaches the gate and the sink only, and defaults change nothing | Attribution is present on every `OperationRequest` and record; the fingerprinter receives no actor, reason or `correlationId` | 08, 12, 13 |
| [BEH-BR-193](../../core/behaviors/23-audit-sink-and-record.md) | The AuditSink port is optional and write-only | `trailSink` provides this port; the sink may not call back into the host | 01, 03 |
| [BEH-BR-194](../../core/behaviors/23-audit-sink-and-record.md) | An unwired sink changes nothing, and nothing claims an audit exists | Without the companion, core claims no audit trail; the companion inherits the non-claim | 01 |
| [BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md) | The AuditRecord | The record shape, `schemaVersion: 1`, `configChange.fingerprints?` and `definition?` (CCR-BR-014) canonicalised by the sink and bound by tickets | 02, 03, 05, 09, 11 |
| [BEH-BR-196](../../core/behaviors/23-audit-sink-and-record.md) | What each field records | Field meanings used by the checks on read and by the human-readable rendering | 05, 18 |
| [BEH-BR-197](../../core/behaviors/23-audit-sink-and-record.md) | Configuration paths, never configuration values | Fingerprints are the one exception, a subset of the paths in the same order; core computes no hash | 09, 13 |
| [BEH-BR-198](../../core/behaviors/23-audit-sink-and-record.md) | Exactly one requested and one terminal record per admitted call | The check for a `requested` record without a terminal record | 05 |
| [BEH-BR-199](../../core/behaviors/23-audit-sink-and-record.md) | System records | System records carry stored fingerprints; system transitions are not gated and need no ticket | 05, 08, 13 |
| [BEH-BR-200](../../core/behaviors/23-audit-sink-and-record.md) | Joins, supersession and no-ops are recorded as such | Joined and superseded calls consume no binding of their own; resumer records carry stored fingerprints | 05, 12 |
| [BEH-BR-201](../../core/behaviors/23-audit-sink-and-record.md) | The records of a reconcile | One binding per `reconcile` entry; the cross-store check of bundles | 09, 11, 12 |
| [BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md) | One writer, in order, retrying in place | The sink sees records one at a time, in sequence order; core retries, the sink does not | 03 |
| [BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md) | A change that cannot be recorded is not made | A sink failure fails the call; the sink must therefore never acknowledge early | 01, 03 |
| [BEH-BR-204](../../core/behaviors/23-audit-sink-and-record.md) | auditTimeout bounds every wait on the sink | An adapter that hangs after commit is a timeout in core; the conformance suite injects it | 04 |
| [BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md) | An unwritten terminal, rejected or system record sets the latch | The latch the policy's rule for `acknowledgeAuditDegraded` governs | 02, 03, 08 |
| [BEH-BR-206](../../core/behaviors/23-audit-sink-and-record.md) | acknowledgeAuditDegraded | The deliberate policy rule for the latch acknowledgement, and the outage risk it carries | 08, 12 |
| [BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md) | Core keeps no copy; storage, retention, durability and review are the consumer's | Storage belongs to the trail store adapter; review stays out of scope for both packages | 02, 18 |
| [BEH-BR-209](../../core/behaviors/24-time-ids-and-sequence.md) | Every timestamp comes from Clock | `signedAt`, ticket events and window checks use the same `Clock` service | 09, 10 |
| [BEH-BR-210](../../core/behaviors/24-time-ids-and-sequence.md) | Every identifier comes from IdGenerator | `recordId` is the idempotency key of `append` | 02 |
| [BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md) | auditSeq starts at 1 per host and is contiguous | Uniqueness per (hostId, auditSeq); the high-water mark compares against it | 02, 05, 06 |
| [BEH-BR-213](../../core/behaviors/24-time-ids-and-sequence.md) | A failed write does not consume its number | A retried record keeps its number, so a repeat append is the same entry | 02, 03 |
| [BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md) | verifyAuditSequence detects gaps, duplicates and disorder — and nothing more | The checks on read are built over it and add their own finding kinds | 05 |
| [BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md) | Clock accuracy is the consumer's responsibility | Ticket windows are only as accurate as the consumer's clock synchronisation | 09, 12 |
| [BEH-BR-217](../../core/behaviors/25-operation-gate.md) | The OperationGate port is optional, and core provides no implementation | `approvalGate` provides this port | 12 |
| [BEH-BR-218](../../core/behaviors/25-operation-gate.md) | The gate is consulted after attribution and validation, before any record | The gate sees decoded values' fingerprints and writes nothing before the `requested` record | 12 |
| [BEH-BR-219](../../core/behaviors/25-operation-gate.md) | The OperationRequest, without configuration values | The fields a binding digest is recomputed from; request and record are equal, fingerprints included | 09, 11, 12 |
| [BEH-BR-220](../../core/behaviors/25-operation-gate.md) | A refusal changes nothing and leaves one record | A gate refusal leaves exactly one `rejected` record carrying the reason | 11, 12 |
| [BEH-BR-221](../../core/behaviors/25-operation-gate.md) | A gate that fails, hangs or is abandoned is a refusal | The gate's internal deadline sits below `gateTimeout`; a store outage refuses | 12 |
| [BEH-BR-222](../../core/behaviors/25-operation-gate.md) | The gate cannot be bypassed through the Host it guards | The gate calls no host operation | 12 |
| [BEH-BR-223](../../core/behaviors/25-operation-gate.md) | System transitions and shutdown are audited, not gated | No ticket is required or consumed for a system transition | 08, 12 |
| [BEH-BR-224](../../core/behaviors/25-operation-gate.md) | The gate is the seam for approvals and electronic signatures | The companion's approvals plug in here and nowhere else | 08, 10, 12 |

## 2. Decisions

| Core identifier | Title in core | What the companion relies on | Used by |
| --------------- | ------------- | ---------------------------- | ------- |
| [ADR-BR-008](../../core/decisions/008-error-taxonomy.md) | Schema.TaggedError taxonomy carrying identifiers only | Companion errors follow the same rule: tagged, identifiers only, no values or port text; `ConfigFingerprintUnavailable` is a core error | 01, 03, 13 |
| [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md) | Desired-state reconcile is keyed, owned and idempotent | A `reconcile` is approved as a bundle of per-entry bindings | 09, 11, 12 |
| [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md) | Time and identifiers come from services | The companion stamps `signedAt` and ticket times from `Clock`, never an ambient clock | 04, 09, 10 |
| [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md) | A deterministic test host is part of the core contract | Conformance and evidence runs depend on `TestHost` being part of core's contract | 04, 19 |
| [ADR-BR-028](../../core/decisions/028-gxp-scope.md) | GxP scope: process, core hooks and a companion | The three-part split that leaves storage, approvals and evidence to the companion | 01, README |
| [ADR-BR-029](../../core/decisions/029-attributable-mutations.md) | Every host mutation is attributable | The requester and every approval are tied to attributed calls | 08, 10, 12 |
| [ADR-BR-030](../../core/decisions/030-audit-sink-port.md) | An optional AuditSink port distinct from Host.events | The port `trailSink` provides | 02, 03 |
| [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md) | Audit failure fails closed and latches | The sink's failures fail the call; the latch and its acknowledgement | 01, 03, 08 |
| [ADR-BR-032](../../core/decisions/032-operation-gate.md) | An OperationGate port in core | The port `approvalGate` provides; its fail-closed rule | 01, 12 |
| [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md) | Audit records carry configuration paths, never values | Fingerprints are the narrowed exception; the companion adds no value anywhere | 01, 13 |
| [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) | The @bridger/gxp companion scope and its limits | The companion's scope and every non-claim it inherits, including non-claim 5 as narrowed by CCR-BR-014 and non-claim 12 (no review tool, no PQ) | README, 01, 07, 18 |
| [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md) | Qualification evidence comes only from executed tests | OQ results come only from runner output | 04, 16 |
| [ADR-BR-036](../../core/decisions/036-prospective-specification.md) | This specification is prospective | The companion's own prospective rule follows it | README, decisions |
| [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md) | The audit sequence is separate from the event seq | Trail entries are ordered by `auditSeq`, never by event `seq` | 02, 05 |
| [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md) | Configuration fingerprints come from a consumer port | The `ConfigFingerprinter` port `hmacFingerprinter` implements: `select`, `fingerprint`, step 4a, `fingerprintTimeout`, fail closed | README, 13, 14 |

## 3. Invariants

| Core identifier | Title in core | What the companion relies on | Used by |
| --------------- | ------------- | ---------------------------- | ------- |
| [INV-BR-013](../../core/invariants.md) | Configuration values are never observable | No value leaves core except to the fingerprinter port | 13 |
| [INV-BR-022](../../core/invariants.md) | One requested and one terminal record per mutating call | The pairing checked on read and in the cross-store approval check | 05, 11 |
| [INV-BR-023](../../core/invariants.md) | The audit sequence is contiguous per host | Gap detection, uniqueness per host sequence and the seal chain over the stored sequence | 02, 05, 07 |
| [INV-BR-026](../../core/invariants.md) | An unwired sink or gate changes nothing | A section of `GxpLayer.make` given as "not-used" leaves core's behaviour unchanged, the fingerprinter included | 01 |
| [INV-BR-028](../../core/invariants.md) | Audit records carry no configuration values | The trail stores no value; fingerprints are not values | 02, 13 |

## 4. Risks

| Core identifier | Title in core | What the companion relies on | Used by |
| --------------- | ------------- | ---------------------------- | ------- |
| [RSK-BR-004](../../core/gxp/03-risk-assessment.md#rsk-br-004) | Unaudited lifecycle change | Core's control; the trail store must not reopen it by acknowledging early | 03 |
| [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006) | Undetected audit gap | Its companion residual is answered by checks on read and high-water anchors | 05, 06 |
| [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008) | Secret leaks into logs or audit | Fingerprints and keys must not reopen it | 13, 14 |
| [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014) | Approval bypass through the raw Host | Owner Core, residual Consumer + Companion; the approval gate carries the companion half | 12 |
| [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017) | Unverified dynamically loaded code | Installation checks record package identity and version pins; verification of loaded code stays with the consumer | 15 |
| [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018) | Over-claiming qualification evidence | Evidence reports pass only from runner output and shows gaps | 16, 17 |
| [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020) | Slow audit sink blocks the host | A slow adapter is a host-wide stall; the manifest states latency limits | 02, 03 |
| [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024) | Value port used to exfiltrate configuration values | Owner Consumer + Companion: `hmacFingerprinter` sends no value anywhere and fingerprints only eligible paths | 13, 14 |

## 5. Acceptance scenarios and user requirements

| Core identifier | Title in core | What the companion relies on | Used by |
| --------------- | ------------- | ---------------------------- | ------- |
| [REQ-BR-055](../../core/traceability.md) | Fingerprints computed at step 4a, before the gate | The core half of fingerprint binding; OQ evidence resolves its tag | 16, 20 |
| [REQ-BR-056](../../core/traceability.md) | A failing fingerprinter fails the call with `ConfigFingerprintUnavailable` | Fail-closed behaviour the companion's fingerprinter relies on | 13, 20 |
| [REQ-BR-057](../../core/traceability.md) | `Host.controls` reports wiring, limits and `auditPosition.lastWritten` | Installation checks and high-water marks read it | 06, 15, 20 |
| [REQ-BR-058](../../core/traceability.md) | Requested and rejected records carry the presented definition | The §11.70 cross-store check of a refused `replace` | 11, 20 |
| [URS-BR-024](../../core/urs.md) | Require approval before a regulated change | Answered in part by URS-GX-006 and the approval files | urs, 08–12 |
| [URS-BR-025](../../core/urs.md) | Generate qualification evidence from executed tests | Answered in part by URS-GX-013 and URS-GX-014 | urs, 15–17 |
| [URS-BR-026](../../core/urs.md) | Know which compliance obligations remain mine | Answered in part by URS-GX-016 | urs, gxp |

## 6. Core document revisions relied on

The companion was specified against these revisions of core documents
(CCR-BR-014 applied). A later revision of any of them is assessed under the
coupling rule.

| Core document | Document ID | Revision |
| ------------- | ----------- | -------- |
| `README.md` | BRIDGER-00 | 0.14 |
| `behaviors/02-host-construction.md` | BRIDGER-BEH-02 | 0.3 |
| `behaviors/11-configuration.md` | BRIDGER-BEH-11 | 0.3 |
| `behaviors/12-shutdown-and-hosting.md` | BRIDGER-BEH-12 | 0.6 |
| `behaviors/21-testing-host.md` | BRIDGER-BEH-21 | 0.9 |
| `behaviors/22-attributable-operations.md` | BRIDGER-BEH-22 | 0.5 |
| `behaviors/23-audit-sink-and-record.md` | BRIDGER-BEH-23 | 0.5 |
| `behaviors/24-time-ids-and-sequence.md` | BRIDGER-BEH-24 | 0.3 |
| `behaviors/25-operation-gate.md` | BRIDGER-BEH-25 | 0.4 |
| `invariants.md` | BRIDGER-INV | 0.7 |
| `urs.md` | BRIDGER-URS | 0.13 |
| `traceability.md` | BRIDGER-TRACE | 0.9 |
| `gxp/02-compliance-matrix.md` | BRIDGER-GXP-02 | 0.3 |
| `gxp/03-risk-assessment.md` | BRIDGER-GXP-03 | 0.6 |
| `gxp/04-validation-plan.md` | BRIDGER-GXP-04 | 0.4 |
| `decisions/034-gxp-companion-scope.md` | BRIDGER-ADR-034 | 0.3 |
| `decisions/039-config-fingerprint-port.md` | BRIDGER-ADR-039 | 0.1 |

## 7. Compatibility matrix

The companion declares a supported range of core versions — one core minor
line — and the audit `schemaVersion` values it reads, and refuses to run
outside them
([ADR-GX-025](../decisions/025-core-version-range.md)). No version of either package has been
released, so the matrix holds one prospective row.

| `@bridger/gxp` | `@bridger/core` | Audit `schemaVersion` | Core changes required | Status |
| -------------- | --------------- | --------------------- | --------------------- | ------ |
| 0.1.x (unreleased) | one minor line (`>=X.Y.Z <X.(Y+1).0`) starting at the first release that includes CCR-BR-014 | 1 | CCR-BR-014: `ConfigFingerprinter`, `Host.controls`, `CloseReport.auditLastSeq`, `AuditRecord.definition` | Prospective — neither package exists |

```
REQUIREMENT: Each released version of `@bridger/gxp` MUST have exactly one
             row here, naming the core version range it was tested against
             and every audit `schemaVersion` it reads. A row MUST NOT name a
             core version against which the companion's acceptance checks
             have not run.
```

```
REQUIREMENT: A core release that changes `schemaVersion`, or any identifier of
             §§1–5, MUST NOT be added to an existing row; it needs a new
             companion version and a new row under a CCR-GX.
```

**Settled here.** The range is one core minor line rather than open-ended, because the companion canonicalises and digests core's record
shape: an added record field changes every digest computed after it, and an
open range would let a core upgrade change bindings and seals silently.
