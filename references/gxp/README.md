# Bridger GxP Companion — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-00                                                |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification — Master Index                      |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/gxp`, the optional companion package
that plugs into the ports of `@bridger/core` — `AuditSink`, `OperationGate`
and `ConfigFingerprinter` — and adds a trail-store contract with a conformance
suite, checks on read, high-water anchors and optional sealing, approval
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
- Optional sealing is called "seal verification". It detects alteration,
  insertion, removal or reordering of sealed records up to the last verified
  anchor, and only against a party that cannot also rewrite the separately
  held anchor store ([ADR-GX-009](./decisions/009-optional-sealing.md)).
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
| 07 | [Optional sealing](./behaviors/07-optional-sealing.md) | BEH-GX-049–056 |
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
| 20 | [Required acceptance checks](./behaviors/20-required-acceptance-checks.md) | BEH-GX-153–168 |

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
| [Requirement identifier scheme](./process/requirement-id-scheme.md) | `GX` series, Document Control, the seventeen mechanical checks |
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
