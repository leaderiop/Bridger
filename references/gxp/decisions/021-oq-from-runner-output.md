# ADR-GX-021: OQ results come only from test-runner output

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-021                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

Core decided that qualification evidence comes only from executed tests ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)). An evidence generator can still produce a false pass in quieter ways: counting a requirement as covered because a test file mentions it, treating a skipped test as passed, mapping an unknown tag silently, or reporting a run against the source tree as if it ran against the installed package (RSK-GX-016). OQ evidence for the companion (URS-GX-014) must show what ran, against what, and where nothing ran.

## Decision

- **Runner output is the only input.** `collectOqEvidence(q)` reads only machine-readable runner output: vitest JSON reporter output, JUnit XML, or Cucumber NDJSON messages. It never parses test source files, never runs tests itself and never accepts results typed in by hand.
- **Against the installed package.** Each input must be accompanied by a run manifest recording the package name, version and installed-file digest it ran against, and the environment fields of [core gxp/04 §6.1](../../core/gxp/04-validation-plan.md). An input whose package identity differs from the IQ result's is a deviation, and its results are not counted.
- **Tags resolved against both trees.** A test claims requirements through tags `@REQ-BR-nnn` and `@REQ-GX-nnn` (in the test name or Cucumber tags). Tags are resolved against core's and the companion's traceability. A tag that resolves to no defined requirement is a deviation `unknown-requirement`; it is never dropped and never mapped by guess.
- **Literal outcomes.**
  - A requirement with any failed test is **fail**.
  - A requirement whose tests are all skipped (or pending, or todo) is **skipped**; skipped is never pass.
  - A requirement with at least one passed test and no failed test is **pass**.
  - A requirement with no test at all is **not covered**. It stays in the output as a gap ([INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)).
  - A test that crashed the runner or produced no result entry is **fail** for every requirement it claims.
- **Self-test against a known-bad corpus.** The generator's own test suite runs it over a fixed corpus of runner outputs containing a failed test, a skipped-only requirement, an unknown tag, a duplicate test id, a run against a different package version and a truncated file, and asserts the exact outcome for each. The corpus ships in the companion's repository as fixed files.
- **No suppression.** The generator has no option to exclude a requirement, accept a failure or relabel an outcome. Deviations are acted on in the user's deviation procedure, outside the generator.

## Alternatives considered

- **Coverage from static analysis of test files.** Rejected: a test that exists is not a test that ran or passed.
- **Treat skipped as pass when the skip is "expected".** Rejected: the decision that a skip is acceptable belongs in a recorded deviation, not in the generator.
- **Accept only one runner format.** Rejected: users run vitest for unit tests and Cucumber for scenarios, and CI systems emit JUnit. Three formats, each parsed strictly, cover them.

## Consequences

**Positive**:

- Every pass in the evidence traces to a passed test in a named run against the installed package.
- Gaps, skips and unknown tags are visible in the output rather than absorbed by it.

**Negative**:

- Requirements tested only by inspection or analysis show as not covered until the user records that verification elsewhere; the generator does not accept such results.
- Tests must carry tags, which is extra discipline in the test code.

**Trade-off accepted**: stricter, less flattering evidence, in exchange for evidence in which a pass always means a test passed.

## References

- Behaviours: [16 — OQ evidence](../behaviors/16-oq-evidence.md), [17 — Evidence pack](../behaviors/17-evidence-pack.md)
- Invariants: [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
- Risks: [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
- Decisions: [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
- Core: [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
- External: GAMP 5 (second edition), operational qualification; Cucumber Messages (NDJSON).
