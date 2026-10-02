# 01 — Regulatory Scope

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GXP-01                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This document states what `@bridger/core` is for in a regulated setting, where it sits in a regulated user's GAMP 5 life cycle, which regulations and guidance the specification is written against, and what a component library can and cannot claim. It is the first of four GxP documents; the [compliance matrix](./02-compliance-matrix.md) maps each clause, the [risk assessment](./03-risk-assessment.md) scores the hazards, and the [validation plan](./04-validation-plan.md) describes how the library's own verification is meant to feed a regulated user's validation. The scope decision itself is [ADR-BR-028](../decisions/028-gxp-scope.md).

## 1. Status: nothing is implemented

There is no Bridger code. Nothing is implemented, so nothing is verified, and the library is not validated — nor could it be, because validation is not something a library undergoes on its own (§3).

Every statement in the GxP documents is therefore a statement of **intent**: what the library is specified to do and which obligations it is specified to leave to others. None of it is evidence ([ADR-BR-036](../decisions/036-prospective-specification.md)). A requirement becomes evidence only when a test that exercises it has run against the installed package and passed, and the result was recorded under the rules of [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md). Until then every Evidence cell in the compliance matrix reads *Planned*, and every verification entry in the risk register reads *Planned*.

## 2. Intended use

`@bridger/core` is a generic plugin runtime for TypeScript applications built on Effect v4 ([ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)). It installs, activates, replaces, reconfigures, disables and removes plugins at runtime, orders them by their declared service dependencies, and keeps a provider alive while a call is using it.

**Intended use in a regulated setting.** Bridger is a **component library embedded in a regulated user's computerized system**. The regulated user's system — for example the Bridger ERP, or any other application that hosts plugins on it — may support GMP-regulated manufacturing or quality processes. In such a system the set of installed plugins, their versions, their configuration and their enabled state is part of the system's configuration, and changing it is a change to a computerized system. Bridger is specified to make each such change:

- **attributable** — it carries an `Actor`, optionally a reason, and a correlation identifier (generated if not supplied) ([22 — Attributable operations](../behaviors/22-attributable-operations.md));
- **recordable** — an optional `AuditSink` port receives one record when the change is requested and one when it ends, under a fail-closed policy ([23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md));
- **ordered and reproducible** — records carry a contiguous per-host sequence, and time and identifiers come from injectable services ([24 — Time, identifiers and sequence](../behaviors/24-time-ids-and-sequence.md));
- **gateable** — an optional `OperationGate` port can refuse the change before anything happens ([25 — Operation gate](../behaviors/25-operation-gate.md)).

**Bridger is never a computerized system on its own.** It has no user interface, no user accounts, no persistent storage, no network endpoint and no business function. It has no intended use apart from the system that embeds it, and the regulated user's intended use of that system is what determines the GxP relevance of any Bridger behaviour.

**Not intended uses.** Bridger is not intended, and must not be relied on, to:

- authenticate users or bind an `Actor` to a person;
- store, retain, back up or archive audit records, or make them durable — durability is the regulated user's responsibility, through the store behind their `AuditSink`;
- provide tamper evidence — `verifyAuditSequence` detects gaps, duplicates and disorder only, and is not tamper evidence;
- verify, sign or sandbox plugin code — plugins are trusted code in the host's process (URS assumption A1);
- isolate plugins, tenants or sites from one another — a realm is a resolution namespace, not a security boundary ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md));
- serve as an audit trail through `Host.events` or `Host.changes`, which are lossy by design ([ADR-BR-007](../decisions/007-observation-primitives.md)).

The complete list of exclusions is in [ADR-BR-034](../decisions/034-gxp-companion-scope.md) and in §5 of the [compliance matrix](./02-compliance-matrix.md).

## 3. GAMP 5 positioning

The specification follows the life cycle of ISPE GAMP 5 Second Edition (2022): user requirements ([urs.md](../urs.md)), functional specification (the [behaviours](../behaviors/01-plugin-definition.md)), design decisions (the ADRs), risk assessment, verification planning and traceability ([traceability.md](../traceability.md)).

### 3.1 Categorization is the regulated user's decision

GAMP 5 software categories classify the software of a **system**, as configured and used by the regulated user. A library does not categorize itself; this document only supplies input to the regulated user's categorization.

That input is:

| Consideration | Input from this specification |
| ------------- | ----------------------------- |
| Nature of the software | A source-level library that the regulated user's developers call from their own code. It is not a configurable product with a fixed function, and it is not infrastructure software in the GAMP sense. |
| How it is normally used | Compiled into, and executed as part of, an application the regulated user (or their supplier) writes. The plugins it runs are also custom code. |
| Normal outcome | When built into a regulated user's system, the system — including Bridger's behaviour inside it — is normally treated as **Category 5 (custom software)**, and assured as such. |
| What changes that outcome | Only the regulated user's assessment of their own system. A different categorization (for example treating Bridger as a well-established component whose supplier testing is leveraged) is theirs to justify and record. |

The specification is written to Category 5 depth — full functional specification, invariants, design rationale and a planned scripted test suite — so that a regulated user who treats it as custom software has the supplier-side material they need, and a regulated user who leverages supplier testing has records adequate for that decision.

### 3.2 Supplier and regulated user

GAMP 5 distinguishes the **supplier**, who develops and maintains a product under their own quality practices, from the **regulated user**, who is accountable for the computerized system and its compliance. For Bridger:

| Role | Who | Responsible for |
| ---- | --- | --------------- |
| Supplier — core | Bridger maintainers (`@bridger/core`) | The specification, its change control ([PROC-03](../process/change-control.md)), the behaviours and invariants, the planned automated test suite, honest documentation of limits |
| Supplier — companion | Bridger maintainers (`@bridger/gxp`, specified later under `references/gxp/`) | A trail adapter contract with conformance tests, approval and e-signature capture through the gate seam, IQ/OQ evidence generated from executed tests ([ADR-BR-034](../decisions/034-gxp-companion-scope.md)) |
| Regulated user | The organisation operating the computerized system | Intended use, system categorization, risk assessment of the system, supplier assessment, authentication and identity binding, audit storage, retention, review and archiving, clock synchronisation, IQ/OQ/PQ of the system, procedures, training, periodic review, security of the process |

Supplier documentation and testing may reduce the regulated user's effort; GAMP 5 and the FDA's CSA guidance both encourage leveraging them where they are adequate for the risk. They never transfer the regulated user's accountability. The supplier side currently has one maintainer and no independent reviewer ([change control](../process/change-control.md) §5); a regulated user must weigh that in supplier assessment ([validation plan](./04-validation-plan.md) §10).

## 4. Regulations and guidance cited

The specification is written against the following instruments. Each is cited by edition; where the exact date of an edition is not certain to the authors, only the year is given.

| Instrument | Edition and status | How it is used here |
| ---------- | ------------------ | ------------------- |
| 21 CFR Part 11, *Electronic Records; Electronic Signatures* (US FDA) | Current codified text (rule of 1997). Read together with FDA's guidance *Part 11, Electronic Records; Electronic Signatures — Scope and Application* (2003). | Clause-by-clause mapping in [compliance matrix](./02-compliance-matrix.md) §1, Subparts B and C |
| EU GMP Annex 11, *Computerised Systems* (EudraLex Volume 4) | 2011 revision — **in force** | Clause-by-clause mapping in [compliance matrix](./02-compliance-matrix.md) §2 |
| EU GMP Annex 11, draft revision | 2025 draft published for public consultation — **not in force**. Tracked only. | Not mapped. When the revision is finalised, the matrix is re-assessed under a CCR ([validation plan](./04-validation-plan.md) §9). Nothing in these documents relies on the draft text. |
| PIC/S PI 041-1, *Good Practices for Data Management and Integrity in Regulated GMP/GDP Environments* | 2021 | Source of the ALCOA+ principles mapped in [compliance matrix](./02-compliance-matrix.md) §3 |
| MHRA, *'GXP' Data Integrity Guidance and Definitions* | Revision 1, 2018 | ALCOA+ definitions; the expectation that audit trails are reviewed and that data governance is proportionate to risk |
| ICH Q9(R1), *Quality Risk Management* | 2023 | The risk-management process of the [risk assessment](./03-risk-assessment.md) §1: identification, analysis, evaluation, control, communication, review; formality proportional to risk; reduction of subjectivity |
| ISPE GAMP 5, *A Risk-Based Approach to Compliant GxP Computerized Systems*, Second Edition | 2022 | Life cycle, software categories, supplier and regulated-user responsibilities, FMEA scoring (Severity, Probability, Detectability) in the [risk assessment](./03-risk-assessment.md) §2 |
| US FDA, *Computer Software Assurance for Production and Quality System Software* | Final guidance, 2025 | Risk-based choice of assurance activities and their rigour (scripted versus unscripted testing) in the [validation plan](./04-validation-plan.md) §4 |

Regulation text is paraphrased throughout these documents, never quoted at length. The paraphrase is an aid to reading; the regulated user works from the official text.

## 5. The honest-claims rule

The specification never claims a property that has not been assembled and tested end to end. The rule is inherited from the sibling `qadi` specification, whose ADR-QD-016 (*GxP compliance is out of scope*) recorded a predecessor whose audit machinery was never wired together and whose qualification steps were `typeof` checks, one hardcoded to pass, and whose ADR-QD-056 (*`@qadi/audit`: a companion package narrows ADR-QD-016*) reintroduced audit support only as a narrow companion that hangs off one core seam and ships no no-op signature service. Both are cited by name, as precedent, in [ADR-BR-028](../decisions/028-gxp-scope.md).

Applied to Bridger, the rule means:

1. **The verb is "supports".** A library behaviour *supports* a regulated user's compliance with a clause; it does not satisfy the clause. Compliance is a property of the regulated user's system and procedures.
2. **No status claims.** Bridger makes no claim to be validated, qualified, Part 11 compliant or Annex 11 compliant, and no claim that it provides a durable or tamper-evident audit trail. These words appear in the specification only negated or scoped to the consumer or companion; `scripts/verify-traceability.sh` check 11 enforces this line by line.
3. **No control in name only.** Core ships no default `OperationGate` (not even an allow-all one) and no default `AuditSink` (not even an in-memory one outside tests), because a default that does nothing would appear in configuration as a control ([ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md)).
4. **An unwired port says so.** A host with no sink wired reports `HostSnapshot.audit` as `"unwired"` and nothing in it implies an audit trail exists ([23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)).
5. **Evidence is executed tests only.** Presence checks, hand-entered results and coverage figures are not evidence of behaviour ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).
6. **Limits are enumerated.** What Bridger does not do is listed, numbered, in [ADR-BR-034](../decisions/034-gxp-companion-scope.md), so that documentation and release notes can be checked against it.

## 6. Allocation vocabulary

The compliance matrix allocates each clause to one or more of:

| Allocation | Meaning |
| ---------- | ------- |
| Core | `@bridger/core` has a specified behaviour that supports the clause. The behaviour is unverified until its tests have run. |
| Companion | `@bridger/gxp` is intended to support the clause. The companion is not yet specified ([URS](../urs.md#7-known-gaps-and-open-items) gap G8); nothing allocated to it may be relied on yet. |
| Consumer | The regulated user's system, infrastructure or procedures must meet the clause. |
| N/A | The clause does not apply to anything Bridger or its companion does. |

A combination (for example `Core + Consumer`) means each named party carries part of the obligation; the Notes column says which part. Any clause that names the Consumer remains the regulated user's to demonstrate in their own validation, whatever the core and companion contribute.

## 7. Open items

| # | Item | Status |
| - | ---- | ------ |
| 1 | No implementation; no evidence | Open by design of this phase ([ADR-BR-036](../decisions/036-prospective-specification.md)) |
| 2 | Annex 11 2025 draft revision | Tracked; re-assessment under a CCR when the final text is published |
| 3 | `@bridger/gxp` companion | Not yet specified; every Companion allocation is a plan, not a capability |
| 4 | Independent review of this specification | Not available (single maintainer); see [change control](../process/change-control.md) §5 and [URS](../urs.md#7-known-gaps-and-open-items) gap G7 |

---

_Next: [Compliance matrix](./02-compliance-matrix.md)_
