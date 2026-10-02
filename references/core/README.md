# Bridger Core — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-00                                                   |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Master Index                      |
> | Change History | 0.7 (2026-10-02): CCR-BR-007 registered (CCR-BR-007)<br>0.6 (2026-10-02): CCR-BR-006 registered (CCR-BR-006)<br>0.5 (2026-10-02): CCR-BR-005 registered (CCR-BR-005)<br>0.4 (2026-10-02): CCR-BR-004 registered (CCR-BR-004)<br>0.3 (2026-10-02): CCR-BR-003 registered (CCR-BR-003)<br>0.2 (2026-10-02): CCR-BR-002 registered (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
| CCR-BR-006 | 2026-10-02 | Cross-plugin stop ordering; closes URS gap G11. ADR-BR-038 (no host-wide operation order; waits run only from a provider to its dependents; a cascade waits for a dependent's step, never its operation; a cascade resumes a parked stop and ends the parked intent; `WouldDeadlock` before any wait); BEH-BR-078–080 (reserved IDs of file 08 now used), BEH-BR-074, BEH-BR-045, BEH-BR-088 amended; INV-BR-030; RSK-BR-023; acceptance checks 43–45 (REQ-BR-043–045). Host-core prototype: host-wide lock replaced by per-plugin admission and step locks; 3 scenario tests, which fail against the previous prototype. The prototype evidences no requirement. |
| CCR-BR-007 | 2026-10-02 | In-flight operation table prototyped (`prototypes/host-core`: per-plugin flights run by host fibers; join, supersede, conflict and parked resumption; 34 scenario tests including all 28 live cells of BEH-BR-072 without `reconfigure`). Findings: G14 — a caller interrupted after its `requested` record and before its intent changes nothing and ends with a `failed` (`Interrupted`) record, replacing the uninterruptible span of BEH-BR-188 (BEH-BR-067, BEH-BR-188, INV-BR-010 amended); G15 — a parked call's terminal record is final (BEH-BR-074). The prototype evidences no requirement. |
