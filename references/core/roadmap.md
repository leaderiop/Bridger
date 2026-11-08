# Roadmap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ROADMAP                                              |
> | Revision       | 0.13                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Planning Document — Informative                              |
> | Change History | 0.13 (2026-10-03): P6 row: companion specification drafted in references/gxp/ (Draft 0.1, CCR-GX-001), approval before code pending, prerequisite CCR-BR-014 done; non-plan wording without a restricted word (CCR-BR-015)<br>0.12 (2026-10-03): P6 row: prerequisite core change CCR-BR-014 specified and prototyped (CCR-BR-014)<br>0.11 (2026-10-03): P5 row: every settled cell (consistency pass) (CCR-BR-013)<br>0.10 (2026-10-03): P5 exit criterion met in the prototype (CCR-BR-012)<br>0.9 (2026-10-02): P5 prototyped (CCR-BR-011)<br>0.8 (2026-10-02): P4 prototyped (CCR-BR-010)<br>0.7 (2026-10-02): P2 prototyped (CCR-BR-009)<br>0.6 (2026-10-02): Stale G2–G4 exit criterion and blocker removed; review of CCR-BR-003..007, in two passes, noted (CCR-BR-008)<br>0.5 (2026-10-02): In-flight table prototyped (CCR-BR-007)<br>0.4 (2026-10-02): G11 resolved; P1 prototype extended (CCR-BR-006)<br>0.3 (2026-10-02): P3 prototype recorded (CCR-BR-005)<br>0.2 (2026-10-02): P1 prototype recorded (CCR-BR-004)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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
| P1 | Host core: definition, installation, activation, removal, states, legality table, leases — **prototyped** in `prototypes/host-core` (24 scenario tests; findings G10–G12 in the URS; per-plugin ordering of ADR-BR-038 with 3 further tests, closing G11; the in-flight table of BEH-BR-072 with 34 further tests, findings G14–G15; a review of those amendments by three agent reviewers, in two passes, led to CCR-BR-008, URS gap G16, which changed the specification and, to follow it, the prototype) | 01–09 | Every row of the legality table has a passing test |
| P2 | Runtime failure, health, configuration, shutdown, observability, `ManagedRuntime` — **prototyped** in `prototypes/host-core` (18 scenario tests, several under `TestClock`; findings G17–G18) | 10–13 | Shutdown report and drain/force tests pass under `TestClock` |
| P3 | GxP hooks: attribution, `AuditSink`, sequence, `OperationGate` — **prototyped** in `prototypes/host-core` (11 scenario tests; finding G13) | 22–25 | INV-BR-022–029 each have a property test; audit records verified by `verifyAuditSequence` across fault-injected runs |
| P4 | Composition: children and groups, optional and reactive, event bus, realms, reconcile — **prototyped** in `prototypes/host-core` (50 scenario tests, including a confluence property test over 100 seeded random histories; findings G19–G25) | 14–18 | Confluence property test over random operation histories |
| P5 | Helpers and test host as public API — **prototyped** in `prototypes/host-core` (24 scenario tests, including the confluence property driven through `TestHost` with random step orders; findings G26–G32). The suites of P1–P4 then moved onto `TestHost` and the testing entry point's fixtures, except the checks that concern `Bridger.make` itself and one confluence run kept on the production host for comparison; the state × operation table gained a live test of every settled cell (56: seven settled rows × eight operations); finding G33 | 19–21 | `@bridger/core/testing` used by the suites of P1–P4 — met in the prototype |
| P6 | Companion `@bridger/gxp` specification and implementation. The companion specification is **drafted** in [references/gxp/](../gxp/README.md) (Draft 0.1, CCR-GX-001); it is not approved and nothing is implemented. Prerequisite core change CCR-BR-014 (the `ConfigFingerprinter` port, `Host.controls` with the audit position, `CloseReport.auditLastSeq`, the presented definition on `requested` and `rejected` records) is done: specified and **prototyped** in `prototypes/host-core` (11 scenario tests; finding G34) | `references/gxp/`; core prerequisite in 02, 11, 12, 22–25 | Its own specification approved before code (pending) |

## Blocking first release

- An independent reviewer for this specification ([change control](./process/change-control.md) §5).
- The full merge gate of the [Definitions of Done](./process/definitions-of-done.md).

## Deferred

- A loader adapter (fetch, verify signature and digest, evaluate) — outside the core by [ADR-BR-027](./decisions/027-core-exclusions.md).
- Cryptographic chaining or signing of audit records — a companion concern; the core provides only sequence numbering that reveals gaps.
- Hot module replacement policy — an adapter built on `replace` and `restart`.

## Explicitly not planned

- A sandbox for untrusted plugin code in the core.
- Automatic retry of failed plugins.
- Compensation of external effects on removal.
- Any claim of validation, qualification or regulatory compliance for the library itself.
