# ADR-BR-035: Qualification evidence comes only from executed tests

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-035                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-10): Mutation testing runs the acceptance scenarios against packed mutants, so the kill rule can count the OQ suite (C16) (CCR-BR-035)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

A regulated user qualifying a system that embeds Bridger may leverage supplier documentation and testing, as GAMP 5 Second Edition encourages and as the FDA's Computer Software Assurance guidance (2025) allows when the supplier's records are adequate for the risk. That makes Bridger's test evidence an input to someone else's validation. Evidence that asserts more than it tests is therefore not a cosmetic defect: it transfers a false assurance into a regulated decision.

The precedent is specific. Qadi ADR-QD-016 records that its predecessor's IQ/OQ/PQ package consisted mostly of operational-qualification steps that were `typeof x === "function"` checks; one step labelled "signature-related exports are accessible" tested three functions unrelated to signatures, and another was hardcoded to pass. Each step reported "pass". None of them exercised a behaviour. A presence check proves that a name is exported; it says nothing about whether the function does what the requirement says.

## Decision

- **Only executed tests are evidence.** An IQ/OQ evidence item is the recorded outcome of a test that ran the behaviour it names: it drives the component (normally through `TestHost`, [ADR-BR-026](../decisions/026-deterministic-test-host.md)) and asserts on observable outcomes — snapshots, errors, audit records, events.
- **Never presence checks.** `typeof`, export-existence, "module loads" and similar checks are not OQ evidence for any behaviour. Installation qualification may check that the expected package version and files are present; it never stands in for a behaviour.
- **Never hand-written or hardcoded results.** The evidence report is generated from the test runner's machine-readable output. A step whose result is fixed in code, or entered by hand, is not evidence.
- **Traceable.** Each evidence item names the test, the requirement and behaviour IDs it covers (URS, BEH, INV), the result, the package version and commit, the environment, and the time (from `Clock`).
- **Gaps are reported as gaps.** A requirement with no executing test is reported as *not covered*, never as passed. A skipped test is reported as skipped.
- **Tests must be able to fail.** Mutation testing (NFR-BR-008) is the check that the suite's assertions detect changed behaviour; a test that survives every mutant of the code it covers is not counted as evidence for that code. The acceptance scenarios offered as OQ evidence import the installed package, so mutation testing runs them against each mutant built, packed and installed as the release is, and their kills are counted ([validation plan](../gxp/04-validation-plan.md) §5.2).
- **Scope.** Bridger's evidence covers Bridger's specified behaviour. Performance qualification, and qualification of the user's sink, gate, store and integration, are the regulated user's.

## Alternatives considered

- **Presence checks as smoke-level OQ.** Rejected: they are how the predecessor reported passes for behaviour it never exercised; labelling them "smoke" does not stop a reader from counting them.
- **Hand-written qualification protocols executed manually.** Rejected for Bridger's own behaviour: they cost more, drift from the code, and are less reproducible than an automated scripted test. A regulated user may still execute their own protocols.
- **Evidence from code coverage alone.** Rejected: coverage shows that lines ran, not that outcomes were asserted (NFR-BR-003 is a floor, not evidence).
- **Defer evidence to the regulated user entirely.** Rejected: the user would retest the core's races and failure paths with less knowledge of them; deterministic supplier tests are the efficient place for that assurance, as CSA intends.

## Consequences

**Positive**:

- Every evidence item can be re-run and reproduced, under `TestClock` and a counter `IdGenerator`.
- A reviewer can trace each requirement to the test that exercised it, and see uncovered requirements explicitly.

**Negative**:

- Building and maintaining the evidence generator is real work, and it must itself be tested so that it cannot report a pass the runner did not.
- Behaviour that `TestHost` cannot reach deterministically (true parallelism, a real slow store) needs separate tests and may remain partially covered; that is reported, not hidden.
- Running the acceptance scenarios against packed mutants makes a mutation run far slower than one on the source tree alone.
- No evidence exists until code and tests exist ([ADR-BR-036](../decisions/036-prospective-specification.md)).

**Trade-off accepted**: less evidence, all of it real, rather than a complete-looking package in which some passes are not tests.

## References

- Behaviours: [21 — Testing host](../behaviors/21-testing-host.md)
- Invariants: [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome), [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
- Requirements: [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests), [URS-BR-027](../urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
- Risks: [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
- Decisions: [ADR-BR-026](../decisions/026-deterministic-test-host.md), [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md), [ADR-BR-036](../decisions/036-prospective-specification.md)
- GxP documents: [../gxp/04-validation-plan.md](../gxp/04-validation-plan.md)
- Source: `docs/SPEC.md` — "Testing the core"
- Precedent: Qadi ADR-QD-016, *GxP compliance is out of scope* (predecessor's `typeof`-check qualification; cited by name).
- External: ISPE GAMP 5 Second Edition (2022), supplier involvement and leveraging supplier testing; FDA, Computer Software Assurance for Production and Quality System Software (2025).
