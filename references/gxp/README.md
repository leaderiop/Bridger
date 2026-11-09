# Bridger GxP Companion — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-00                                                |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification — Master Index                      |
> | Change History | 0.4 (2026-11-09): CCR-GX-004 registered (coupling answer to core CCR-BR-033: installation check 8 packaged as IQ-22 and IQ-U10; interface map re-pinned); CCR-GX-004 extended with the independent review fixes (check 26 generator types, IQ-22 reason, two more pins) (CCR-GX-004)<br>0.3 (2026-11-09): CCR-GX-003 registered (coupling answer to core CCR-BR-032; interface map re-pinned) (CCR-GX-003)<br>0.2 (2026-11-09): Re-baseline against core through CCR-BR-031: contents rows for files 20 (to BEH-GX-169), 21 and 22, 07 withdrawn; sealing through `@bridger/audit-chain`; eighteen checks; register row (F-01, F-02, C-08, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/gxp`, the optional companion package
that plugs into the ports of `@bridger/core` — `AuditSink`, `OperationGate`
and `ConfigFingerprinter` — and adds a trail-store contract with a conformance
suite, checks on read, high-water anchors, optional sealing through
`@bridger/audit-chain`, a gate piece over the trail sink's status, approval
tickets with captured signatures, keyed configuration fingerprints, and
installation and operational evidence. Its scope is fixed by core's
[ADR-BR-034](../core/decisions/034-gxp-companion-scope.md); the core change it depends on,
CCR-BR-014 (the `ConfigFingerprinter` port of [ADR-BR-039](../core/decisions/039-config-fingerprint-port.md),
`Host.controls` with the audit position, `CloseReport.auditLastSeq` and the
presented definition on `requested` and `rejected` records), is complete in
`references/core`.

## Status: prospective

Nothing described here is implemented. No package `packages/gxp` exists. Every
document is a `Draft` at revision 0.x, every decision is `Proposed`, and every
source or test path is marked *Planned*. The line `implementation: absent`
above is read by `scripts/verify-traceability.sh`; while it says `absent`, the
script refuses any document that calls itself Effective and any decision that
calls itself Accepted ([ADR-GX-026](./decisions/026-prospective-specification.md)).

**This specification is not evidence that the companion behaves as
described.** It is the input to development and, later, to a regulated user's
validation. A requirement becomes evidence only when a test that exercises it
has run against the installed package and passed.

## The honest-claims rule

The companion assembles controls and tests them; it never makes a system
compliant or validated. This specification makes **no** claim that the
companion, core or a system built on them is validated, qualified or compliant
with 21 CFR Part 11 or EU GMP Annex 11, and no claim that a trail is durable,
tamper-proof or tamper-evident. In particular:

- Checks on read report "no findings of the checked kinds"; they do not say a
  trail is complete or intact ([ADR-GX-007](./decisions/007-checks-never-claim-integrity.md)).
- Optional sealing is `@bridger/audit-chain`'s, adopted as the companion's
  only sealing mechanism, and is called "seal verification". It detects
  alteration, insertion, removal or reordering of sealed records up to the
  last verified anchor, and only against a party that cannot also rewrite the
  separately held anchor store ([ADR-GX-029](./decisions/029-sealing-through-audit-chain.md)).
- The trail sink never refuses a record for a condition of its own: what it
  cannot handle exactly is stored and marked, and operator changes are refused
  by a gate piece instead ([ADR-GX-030](./decisions/030-sink-marks-and-gate-refuses.md)).
- A captured signature records what the caller's signature port attested;
  re-authentication and the controls of 21 CFR 11.200 remain the implementer's
  obligations, which the companion does not verify ([ADR-GX-016](./decisions/016-signature-port-and-manifestation.md)).
- Installation and operational evidence reports only what executed checks and
  test-runner output show; a requirement with no executed test is reported as
  not covered ([ADR-GX-021](./decisions/021-oq-from-runner-output.md)).

The full list of claims and non-claims is [ADR-GX-027](./decisions/027-claims-and-non-claims.md); it
inherits every non-claim of [ADR-BR-034](../core/decisions/034-gxp-companion-scope.md).
`scripts/verify-traceability.sh` enforces the rule with a stricter lint than
core's ([PROC-GX-01](./process/requirement-id-scheme.md) §5, check 11).

## Relation to core

The companion is a separate package; core never depends on it
([ADR-GX-001](./decisions/001-separate-package.md)). This tree is a sibling of `references/core`
with its own process, its own `GX` identifier series and its own change
register ([ADR-GX-002](./decisions/002-own-tree-and-gx-series.md)). Core identifiers (`BEH-BR`, `ADR-BR`,
`INV-BR`, `RSK-BR`, `REQ-BR`, `URS-BR`) are cited across the trees as links,
and every one cited here is listed, with what the companion relies on, in the
[core interface map](./appendices/core-interface-map.md).

**Coupling rule** ([change control](./process/change-control.md) §7). A core change (`CCR-BR`)
that alters a core identifier listed in the interface map needs a `CCR-GX`
that assesses it, and the two records cite each other; a companion change that
needs a core change cites the `CCR-BR` that makes it. The checker enforces the
mechanical half: every `CCR-BR` cited here must be in core's register, every
`*-BR` identifier cited here must be defined in core and listed in the map,
and core's own checker must pass (checks 13–15).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, public API surface, worked example |
| 2 | [Glossary](./glossary.md) | Terms of the companion |
| 3 | [User requirements](./urs.md) | What users need, scope and allocation, known gaps |
| 4 | [Behaviours](./behaviors/01-companion-boundary.md) | What the companion must do, as `BEH-GX` requirements |
| 5 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 6 | [Decisions](./decisions/001-separate-package.md) | Why, as `ADR-GX` records |
| 7 | [GxP documents](./gxp/01-regulatory-scope.md) | Regulatory scope, compliance matrix, risk assessment, validation plan |
| 8 | [Traceability](./traceability.md) | URS → BEH → INV → ADR → REQ → RSK → test |
| 9 | [Process](./process/requirement-id-scheme.md) | Identifier scheme, Definitions of Done, change control |
| 10 | [Core interface map](./appendices/core-interface-map.md) | Every core identifier relied on, and compatibility |
| 11 | [Roadmap](./roadmap.md) | Implementation order and what is not planned |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Companion boundary](./behaviors/01-companion-boundary.md) | BEH-GX-001–008 |
| 02 | [Trail store port](./behaviors/02-trail-store-port.md) | BEH-GX-009–016 |
| 03 | [Trail sink](./behaviors/03-trail-sink.md) | BEH-GX-017–024 |
| 04 | [Conformance suite](./behaviors/04-conformance-suite.md) | BEH-GX-025–032 |
| 05 | [Checks on read](./behaviors/05-checks-on-read.md) | BEH-GX-033–040 |
| 06 | [High-water marks and anchors](./behaviors/06-high-water-marks-and-anchors.md) | BEH-GX-041–048 |
| 07 | [Optional sealing](./behaviors/07-optional-sealing.md) (withdrawn by CCR-GX-002; see 21) | BEH-GX-049–056 (withdrawn, reserved) |
| 08 | [Approval policy](./behaviors/08-approval-policy.md) | BEH-GX-057–064 |
| 09 | [Approval tickets](./behaviors/09-approval-tickets.md) | BEH-GX-065–072 |
| 10 | [Signature capture port](./behaviors/10-signature-capture-port.md) | BEH-GX-073–080 |
| 11 | [Signature linking](./behaviors/11-signature-linking.md) | BEH-GX-081–088 |
| 12 | [Approval gate](./behaviors/12-approval-gate.md) | BEH-GX-089–096 |
| 13 | [Config fingerprints](./behaviors/13-config-fingerprints.md) | BEH-GX-097–104 |
| 14 | [Fingerprint keys](./behaviors/14-fingerprint-keys.md) | BEH-GX-105–112 |
| 15 | [Installation checks](./behaviors/15-installation-checks.md) | BEH-GX-113–120 |
| 16 | [OQ evidence](./behaviors/16-oq-evidence.md) | BEH-GX-121–128 |
| 17 | [Evidence pack](./behaviors/17-evidence-pack.md) | BEH-GX-129–136 |
| 18 | [Archive and export](./behaviors/18-archive-and-export.md) | BEH-GX-137–144 |
| 19 | [Testing entry point](./behaviors/19-testing-entry-point.md) | BEH-GX-145–152 |
| 20 | [Required acceptance checks](./behaviors/20-required-acceptance-checks.md) | BEH-GX-153–169 |
| 21 | [Sealing through audit-chain](./behaviors/21-sealing-through-audit-chain.md) | BEH-GX-170–175 |
| 22 | [Trail status and gate](./behaviors/22-trail-status-and-gate.md) | BEH-GX-176–179 |

Each file owns a block of identifiers; unused numbers at the end of a block
are reserved, not gaps ([identifier scheme](./process/requirement-id-scheme.md) §3).

### GxP documents

| Document | Purpose |
| -------- | ------- |
| [Regulatory scope](./gxp/01-regulatory-scope.md) | Intended use of the companion, GAMP 5 positioning, what it can and cannot claim |
| [Compliance matrix](./gxp/02-compliance-matrix.md) | Answers every "Companion" allocation of core's matrix with `GX` identifiers and the Consumer remainder |
| [Risk assessment](./gxp/03-risk-assessment.md) | ICH Q9(R1) / GAMP 5 FMEA, `RSK-GX` risks, controls and residual risk |
| [Validation plan](./gxp/04-validation-plan.md) | How the companion and its evidence generator are themselves verified |

### Process

| Document | Purpose |
| -------- | ------- |
| [Requirement identifier scheme](./process/requirement-id-scheme.md) | `GX` series, Document Control, the eighteen mechanical checks |
| [Definitions of Done](./process/definitions-of-done.md) | Documentation gate (runnable now) and merge gate (planned) |
| [Change control](./process/change-control.md) | `CCR-GX` lifecycle, impact assessment, single maintainer, coupling with core |

### Appendices (informative)

| Appendix | Purpose |
| -------- | ------- |
| [Core interface map](./appendices/core-interface-map.md) | Every core identifier the companion relies on, core document revisions, compatibility matrix |
| [Qadi audit comparison](./appendices/qadi-audit-comparison.md) | What `@qadi/audit` (ADR-QD-056–058) contributes, and what is designed fresh here |

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `URS-GX-NNN` / `NFR-GX-NNN` | User / non-functional requirement |
| `BEH-GX-NNN` | Functional behaviour requirement |
| `INV-GX-NNN` | Runtime invariant |
| `ADR-GX-NNN` | Architecture decision |
| `REQ-GX-NNN` | Acceptance scenario (planned) |
| `RSK-GX-NNN` | Risk |
| `CCR-GX-NNN` | Change control record |
| `BRIDGER-GX-*` | Document ID |

The infix `GX` keeps these identifiers apart from core's `BR` and from core's
own GxP documents, whose document IDs are `BRIDGER-GXP-NN`. Full rules in
[the identifier scheme](./process/requirement-id-scheme.md). Changes follow
[change control](./process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-GX-001 | 2026-10-03 | Initial draft of the companion specification: master index, overview with the public API surface, glossary, URS-GX-001–016 and NFR-GX-001–008, behaviours BEH-GX-001–168 in twenty files, INV-GX-001–015, ADR-GX-001–028 (all Proposed), the four GxP documents with RSK-GX-001–022, traceability with the REQ-GX acceptance scenarios of file 20, own process documents (PROC-GX-01–03), the core interface map and the Qadi audit comparison, and the checker `scripts/verify-traceability.sh` copied and adapted from core's (ADR-GX-028). Depends on CCR-BR-014, complete in core: the `ConfigFingerprinter` port (ADR-BR-039), `Host.controls` with `auditPosition`, `CloseReport.auditLastSeq`, `AuditRecord.definition` on `requested` and `rejected` records, RSK-BR-024, REQ-BR-055–058 and the narrowed non-claim 5 of ADR-BR-034. Drafted by agents from one design; the consistency review that follows is an agent review, not the independent review of PROC-GX-03 §5.<br>**Impact (PROC-GX-03 §3).** (1) Identifiers: every `GX` identifier above added; nothing changed or withdrawn; no core identifier changed by this record (the core identifiers relied on are listed in the core interface map). (2) Risk: RSK-GX-001–022 introduced and scored for the first time; no `RSK-BR` entry re-scored here — RSK-BR-014 and RSK-BR-024, whose residual names the companion, were re-scored under CCR-BR-014. (3) GxP impact: yes — the companion is the package that answers the "Companion" allocations of core's compliance matrix (audit trail storage and checks, approvals and signatures, value fingerprints, installation and operational evidence). (4) Revalidation: no version has been released or qualified (implementation absent); nothing is to be re-executed; the REQ-GX scenarios of file 20 will cover the first implementation. (5) Compatibility: no released interface exists; the companion requires a core version that includes CCR-BR-014 and audit `schemaVersion: 1` (ADR-GX-025, compatibility matrix in the core interface map). |
| CCR-GX-002 | 2026-11-09 | Phase 1 of the specification audit of 2026-11-09, paired with core CCR-BR-031: re-baseline of the companion against core as changed by CCR-BR-015 to CCR-BR-031, which the companion's change control (§7) had not assessed. This is an agent review, not the independent review of PROC-GX-03 §5. **Findings resolved.** F-01 (pinned core revisions stale; the record shape, request fields and canonical domain the companion relied on had moved): the core interface map is re-pinned to every linked core and `@bridger/audit-chain` document, with a coupling assessment of CCR-BR-015–031 (§8 of the map); the canonical domain is I-JSON numbers, not integers only (BEH-GX-002, ADR-GX-005), with a record vector in file 03; binding version 2 binds `onBehalfOf`, `undo` and the request-only `manifestDigest`, `allowChildren` and `mandatoryInterceptions` (BEH-GX-065, 066, 082, 083, ADR-GX-012); the checker gains check 18, which fails when a pinned revision differs from the current Document Control revision or a linked core document has no pin, and check 17 checks the full RFC 8785 number form and every vector block. F-02 (the trail sink refused records for conditions of its own, which core latches as an audit failure): the sink stores every record the store can keep and marks an unsupported `schemaVersion` or a record that is not I-JSON instead of refusing it, fails a write only when the store did not store the record (BEH-GX-017–024, INV-GX-016, ADR-GX-030); a different record under a stored `recordId` or host sequence number is kept beside the primary as a collision entry and answered "stored-collision", the reason "conflict" is withdrawn (BEH-GX-009–015, INV-GX-006, ADR-GX-004); marked and colliding entries are counted in `TrailSinkStatus`, and `trailGate` refuses operator changes while any are present (file 22, BEH-GX-176–179), composed with audit-chain's `ChainGate` and the approval gate into one host gate. C-08: `checkTrail` pairs `requested` with its outcome by phase; a `superseded` record pairs without `causationId` (BEH-GX-037); finding kinds `nonCanonical`, `collision`, `auditDropped` and `headMismatch` added (BEH-GX-033, 034, 038). C-09: the companion adopts `@bridger/audit-chain` as its only sealing mechanism, an optional peer dependency (file 21, BEH-GX-170–175, ADR-GX-029); its own seal chain (file 07, ADR-GX-009, INV-GX-013) is withdrawn; high-water marks become audit-chain's expected heads (BEH-GX-042, 048, ADR-GX-008); archive format 2 carries marks, collisions, links and audit-chain's verification bundle (file 18, ADR-GX-023). Acceptance checks 1, 2, 3, 8, 11, 12 and 42 amended and 43–47 added (BEH-GX-169, REQ-GX-043–047).<br>**Impact (PROC-GX-03 §3).** (1) Identifiers: added BEH-GX-169–179, INV-GX-016, ADR-GX-029 and ADR-GX-030, RSK-GX-023, REQ-GX-043–047; withdrawn and reserved BEH-GX-049–056 and INV-GX-013; ADR-GX-009 superseded by ADR-GX-029; amended BEH-GX-001, 002, 004, 007–012, 014, 015, 017–024, 028, 029, 033, 034, 036–038, 042, 048, 065, 066, 082, 083, 089–096, 153, 154, 168, INV-GX-006, 007, 008, 009, 012, ADR-GX-004, 005, 007, 008, 012, 023, 025, 027, URS-GX-001, 003, 005, NFR-GX-002, RSK-GX-002, 004, 005, 019; no core identifier changed by this record (core CCR-BR-031 is its pair). (2) Risk: RSK-GX-023 (marked or colliding entries accumulate unnoticed) added at High, controlled by `TrailSinkStatus`, `trailGate` and the IQ report; the controls of RSK-GX-002, 004, 005 and 019 re-baselined without a change of score. (3) GxP impact: yes — audit trail storage, the failure modes of the trail write path, seal verification and the approval binding (compliance-matrix rows 11.10(a), 11.10(b), 11.10(e), §9, §17). (4) Revalidation: none; nothing is implemented, released or qualified (implementation absent); a change of the adopted `@bridger/audit-chain` version is added as a revalidation trigger (validation plan). (5) Compatibility: draft to draft only, no released interface exists — `TrailWriteFailed` reason "conflict" withdrawn and `append` result "stored-collision" added; `TrailEntry.seal` withdrawn and `marks`, `collision` and audit-chain `link` added; `HighWaterMark.seal` withdrawn; binding version 2; archive format "bridger-gx-archive/2"; recorded approval refusal reasons carry the prefix "approval: ". Core's pre-release rule for `schemaVersion` holds: the record schema stays version 1 (BEH-BR-195), and the companion requires a core that includes CCR-BR-031 (compatibility matrix in the core interface map). |
| CCR-GX-003 | 2026-11-09 | Coupling answer to core CCR-BR-032 (phase 2 of the specification audit of 2026-11-09), under change control §7. This is an agent review, not the independent review of PROC-GX-03 §5. CCR-BR-032 amended core identifiers listed in the core interface map — BEH-BR-013 (single source of host signatures; `HandoffCallOptions` on `restart` and `reconfigure`, `ApplyRolledBack` and `PartialApply` on `reconcile`, `InvalidRealm` on `defineRealm`), BEH-BR-183 and BEH-BR-184 (check text), BEH-BR-199 (a mount record's `after.state` may be "starting") and ADR-BR-008 (`InvalidRealm`; unions aligned) — and changed thirteen pinned core documents. Each is assessed in §8 of the map: none changes what the companion relies on (`Host.controls`, `CloseReport.auditLastSeq`, the record fields, check numbers), so no companion behaviour, decision or check changes. The map re-pins the thirteen documents, and its compatibility row starts at the first core release that includes CCR-BR-032.<br>**Impact (PROC-GX-03 §3).** (1) Identifiers: none added, amended or withdrawn; the core interface map (appendix) revised. (2) Risk: no companion risk added or re-scored. (3) GxP impact: none for the companion; no record field and no `schemaVersion` change in core. (4) Revalidation trigger: none; nothing is implemented, released or qualified. (5) Compatibility: the supported core range now starts at the first core release that includes CCR-BR-032; no companion API change. |
| CCR-GX-004 | 2026-11-09 | Coupling answer to core CCR-BR-033 (remaining core findings of the specification audit of 2026-11-09), under change control §7. This is an agent review, not the independent review of PROC-GX-03 §5. CCR-BR-033 amended core identifiers listed in the core interface map — BEH-BR-016 and BEH-BR-210 (every `IdGenerator` value unique within the host and across hosts sharing a store), BEH-BR-193 (a different record under a stored `recordId` is a breach of that requirement) — added installation check 8 to core's validation plan §5.1 (design review and executed draw for a provided generator) and acceptance check 114, retitled RSK-BR-007, and changed fifteen pinned core documents; each is assessed in §8 of the map. The companion packages core's §5.1 checks, so check 8 is packaged: IQ-22, a probe that draws `count` values from each of the consumer's per-host generator instances given in the new optional `idDraw` of `runInstallationChecks` and fails on any repeat, "not-applicable" under core's default generator and "not-executed" when no instances are supplied; and IQ-U10, the generator's design review, always listed as not executed (BEH-GX-113, BEH-GX-114, BEH-GX-116 retitled to core's eight checks; ADR-GX-020; acceptance check 26; glossary; validation plan §6.1). After independent review: check 26 draws from the `IdGenerator` services built from `TestHost.counterIdGenerator` layers (the layers themselves are not generators), `idDraw.generators` is documented as service values, and IQ-22's "not-applicable" reason names the random bound core's BEH-BR-210 now states (122 bits per value); the map also re-pins core file 12 and ADR-BR-008, which the folded-in core fixes changed (a queued build under shutdown writes no `system-stop`; nothing on read changes). The draw was made a probe and the design an unobservable item because no finite draw proves uniqueness and the collision it looks for is between hosts the companion does not see. The trail store already keeps a repeated `recordId` beside the primary ("stored-collision", BEH-GX-012), so nothing changes on read; no other companion behaviour changes.<br>**Impact (PROC-GX-03 §3).** (1) Identifiers: installation items IQ-22 and IQ-U10 added (ids not reused or renumbered); BEH-GX-113, 114 and 116 (title and anchor) amended; ADR-GX-020 amended; acceptance check 26 and REQ-GX-026 (text) amended; the interface map gains an RSK-BR-007 row and re-pins seventeen documents. (2) Risk: no companion risk added or re-scored; core's RSK-BR-007 gains packaged installation controls. (3) GxP impact: yes, limited — installation evidence gains a check of identifier uniqueness across hosts sharing the trail store, and a "not-executed" IQ-22 under a provided generator is a deviation in the evidence pack; no record field and no `schemaVersion` change in core. (4) Revalidation trigger: none; nothing is implemented, released or qualified. (5) Compatibility: `runInstallationChecks` gains an optional `idDraw`; `iq.json` gains two items; a consumer with a provided generator must supply `idDraw` or record IQ-22's deviation; the supported core range now starts at the first core release that includes CCR-BR-033. |
