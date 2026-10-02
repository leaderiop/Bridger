# ADR-BR-028: GxP scope: process, core hooks and a companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-028                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

Bridger is intended as the plugin runtime under an ERP that may be used in GMP-regulated manufacturing and quality processes. In such a system the set of installed plugins, their versions, their configuration and their enabled state *are* the configuration of a computerised system. Installing, replacing, reconfiguring or disabling a plugin is a change that a regulated user must be able to attribute to a person, justify, record in an audit trail, and in some cases approve before it happens.

Those facts are only fully known inside the host. `Host.events` is a lossy diagnostic feed. Whether an operation joined another, was superseded, was a no-op, or failed after partly running is decided inside the per-plugin linearisation ([ADR-BR-012](../decisions/012-intent-and-linearization.md)). Runtime failures, dependency-loss stops and forced lease revocations happen with no operator call at all. A wrapper outside the host cannot see these, so it cannot produce a complete record of them.

There is a precedent for getting this wrong, in Qadi. Qadi ADR-QD-016 (GxP compliance is out of scope) records a predecessor that carried a write-ahead log, a circuit breaker, a completeness monitor, hash-chained entries, electronic signatures and an IQ/OQ/PQ package, almost none of it wired together: the one real audit write bypassed all of it, and qualification steps were `typeof x === "function"` checks, one hardcoded to pass. Qadi ADR-QD-056 (the `@qadi/audit` companion package) later narrowed that exclusion: the domain was not out of scope, the unassembled and over-claiming implementation was. It placed the regulated capability in an optional companion that hangs off one core seam, with no shipped default signature service because an always-valid default is a false compliance affordance.

## Decision

GxP support in Bridger has three parts.

**1. Process.** The Bridger specification documents follow the GAMP 5 Second Edition (ISPE, 2022) life cycle for a **Category 5 custom component**: user requirements, functional specification (behaviours), design decisions (these ADRs), a risk assessment, a validation plan and traceability. The regulatory frame they are written against is:

- 21 CFR Part 11 (electronic records; electronic signatures);
- EU GMP Annex 11, Computerised Systems (2011 version, in force); the 2025 draft revision is tracked and assessed when finalised;
- ALCOA+ data-integrity principles as set out in PIC/S PI 041 and the MHRA "GXP" Data Integrity Guidance and Definitions;
- ICH Q9(R1) Quality Risk Management, for the risk assessment;
- the FDA guidance Computer Software Assurance for Production and Quality System Software (final, 2025), for a risk-based, critical-thinking approach to assurance activities.

The mapping of each clause to a requirement, behaviour or consumer obligation is in [../gxp/01-regulatory-scope.md](../gxp/01-regulatory-scope.md) and [../gxp/02-compliance-matrix.md](../gxp/02-compliance-matrix.md).

**2. Core hooks.** `@bridger/core` supplies the hooks that can only exist inside the host, and nothing more:

- **Attributable** — every mutating operation carries an `Actor` and optional reason and correlation ([ADR-BR-029](../decisions/029-attributable-mutations.md)).
- **Auditable** — an optional `AuditSink` port receives one `requested` and one terminal record per mutating call, plus records for system transitions ([ADR-BR-030](../decisions/030-audit-sink-port.md)), under a fail-closed policy with a latch ([ADR-BR-031](../decisions/031-audit-failure-policy.md)) and a contiguous audit sequence ([ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md)).
- **Gateable** — an optional `OperationGate` port is consulted before any change ([ADR-BR-032](../decisions/032-operation-gate.md)).
- **Reproducible and safe to record** — time and identifiers from services ([ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)); configuration paths, never values ([ADR-BR-033](../decisions/033-no-config-values-in-audit.md)).

**3. Companion.** `@bridger/gxp`, specified separately under `references/gxp/`, supplies what the core must not: the contract for a durable-storage trail adapter that the regulated user implements against their own store, approval and electronic-signature capture through the `OperationGate` seam, and IQ/OQ evidence generated from executed tests ([ADR-BR-034](../decisions/034-gxp-companion-scope.md), [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).

**The lesson carried over from Qadi.** Bridger never ships, documents or claims a compliance property that is not assembled and tested end to end. A library is not a validated system: validation is an activity the regulated user performs on their computerised system, in its intended use, under their quality system. Bridger is to supply specified components and, once tests have been executed, evidence that those components behave as specified; it makes no claim to be Part 11 compliant, Annex 11 compliant or validated.

## Alternatives considered

- **GxP out of scope entirely (Qadi ADR-QD-016's original position).** Rejected: the plugin-set changes a regulated user must record are decided inside the host and cannot be reconstructed from outside, so leaving the hooks out forces every regulated user to fork the core.
- **Everything in core** (storage, signatures, evidence). Rejected: storage, identity and cryptography differ per deployment, would add runtime dependencies beyond `effect`, and would put unassembled parts in core, which is exactly the predecessor failure.
- **Hooks only in a companion that wraps the `Host`.** Rejected: a wrapper sees only calls made through it, not joins, supersessions, system transitions or calls made through the raw `Host`, plugin handles or `reconcile` entries ([ADR-BR-032](../decisions/032-operation-gate.md)).
- **Describe Bridger as "Part 11 ready" or "GxP compliant".** Rejected: compliance is a property of a regulated user's system and procedures. A component claim of compliance is the over-claim this ADR exists to prevent.

## Consequences

**Positive**:

- The changes a regulated user must control are attributable, auditable and gateable at the one place they are all visible.
- Non-regulated users pay nothing: with no sink and no gate wired, behaviour is identical ([INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)).
- The boundary between core, companion and consumer obligations is written down, so a regulated user can see what remains theirs.

**Negative**:

- The core's mutating error unions grow by `Unattributed | ReasonRequired | AuditUnavailable | OperationRejected` for every user, regulated or not.
- The specification carries a GxP document set that a single maintainer must keep consistent; independent review is not yet available (PROC-03 §5).
- Nothing in this ADR reduces the regulated user's own validation effort to zero; it reduces the part concerning Bridger's behaviour.

**Trade-off accepted**: a larger core error surface and a GxP document set, in exchange for hooks at the only place the facts exist, while the claims stay limited to what is assembled and tested.

## References

- Behaviours: [22 — Attributable operations](../behaviors/22-attributable-operations.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [24 — Time, ids and sequence](../behaviors/24-time-ids-and-sequence.md), [25 — Operation gate](../behaviors/25-operation-gate.md)
- Invariants: [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution), [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
- Requirements: [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
- GxP documents: [../gxp/01-regulatory-scope.md](../gxp/01-regulatory-scope.md), [../gxp/02-compliance-matrix.md](../gxp/02-compliance-matrix.md), [../gxp/03-risk-assessment.md](../gxp/03-risk-assessment.md), [../gxp/04-validation-plan.md](../gxp/04-validation-plan.md)
- Decisions: [ADR-BR-029](../decisions/029-attributable-mutations.md) through [ADR-BR-037](../decisions/037-audit-sequence-separate-from-event-seq.md); [ADR-BR-027](../decisions/027-core-exclusions.md)
- Source: `docs/SPEC.md` — "Observability" (SPEC.md contains no GxP design; this ADR is new)
- Precedent: Qadi ADR-QD-016, *GxP compliance is out of scope*; Qadi ADR-QD-056, *`@qadi/audit`: a companion package narrows ADR-QD-016* (precedents; cited by name).
- External: ISPE GAMP 5 Second Edition (2022); 21 CFR Part 11; EU GMP Annex 11 (2011) and its 2025 draft revision; PIC/S PI 041; MHRA "GXP" Data Integrity Guidance and Definitions (2018); ICH Q9(R1) (2023); FDA, Computer Software Assurance for Production and Quality System Software (2025).
