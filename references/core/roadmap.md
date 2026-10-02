# Roadmap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ROADMAP                                              |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Planning Document — Informative                              |
> | Change History | 0.4 (2026-10-02): G11 resolved; P1 prototype extended (CCR-BR-006)<br>0.3 (2026-10-02): P3 prototype recorded (CCR-BR-005)<br>0.2 (2026-10-02): P1 prototype recorded (CCR-BR-004)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Current state

Specification, plus two throwaway prototypes in `prototypes/` (an Effect API
check and a host-core prototype). No product package, no product test and no
example exists. Every decision is Proposed and every source path is Planned;
the prototypes are not the implementation and evidence no requirement.

## Implementation order

The order follows risk: the behaviours with the highest-class risks in the
[risk assessment](./gxp/03-risk-assessment.md) are prototyped first, because
they are the ones most likely to force a change in the specification.

| Phase | Scope | Behaviours | Exit criterion |
| ----- | ----- | ---------- | -------------- |
| P1 | Host core: definition, installation, activation, removal, states, legality table, leases — **prototyped** in `prototypes/host-core` (24 scenario tests; findings G10–G12 in the URS; per-plugin ordering of ADR-BR-038 with 3 further tests, closing G11) | 01–09 | Every row of the legality table has a passing test; the open items G2–G4 of the [URS](./urs.md) are confirmed or the spec is changed |
| P2 | Runtime failure, health, configuration, shutdown, observability, `ManagedRuntime` | 10–13 | Shutdown report and drain/force tests pass under `TestClock` |
| P3 | GxP hooks: attribution, `AuditSink`, sequence, `OperationGate` — **prototyped** in `prototypes/host-core` (11 scenario tests; finding G13) | 22–25 | INV-BR-022–029 each have a property test; audit records verified by `verifyAuditSequence` across fault-injected runs |
| P4 | Composition: children and groups, optional and reactive, event bus, realms, reconcile | 14–18 | Confluence property test over random operation histories |
| P5 | Helpers and test host as public API | 19–21 | `@bridger/core/testing` used by the suites of P1–P4 |
| P6 | Companion `@bridger/gxp` specification and implementation | `references/gxp/` | Its own specification approved before code |

## Blocking first release

- An independent reviewer for this specification ([change control](./process/change-control.md) §5).
- The three prototype confirmations in [URS §7](./urs.md#7-known-gaps-and-open-items).
- The full merge gate of the [Definitions of Done](./process/definitions-of-done.md).

## Deferred

- A loader adapter (fetch, verify signature and digest, evaluate) — outside the core by [ADR-BR-027](./decisions/027-core-exclusions.md).
- Cryptographic chaining or signing of audit records — a companion concern; the core provides sequence integrity only.
- Hot module replacement policy — an adapter built on `replace` and `restart`.

## Explicitly not planned

- A sandbox for untrusted plugin code in the core.
- Automatic retry of failed plugins.
- Compensation of external effects on removal.
- Any claim of validation, qualification or regulatory compliance for the library itself.
