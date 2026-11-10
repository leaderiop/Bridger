# 16 — OQ Evidence

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-16                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-10): BEH-GX-126 the installed identity a run must match includes `@bridger/audit-chain` when sealing is on (M3) (CCR-GX-006)<br>0.2 (2026-11-10): BEH-GX-121: `RunnerOutputUnreadable` declared as `Schema.TaggedError`, raised but never declared before (CCR-GX-005)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Operational evidence says which required behaviours were exercised by tests
that ran, against which installed packages, in which environment, with which
result — and, as importantly, which were not. Core decided that only executed
tests are evidence and that the generator turning runner output into
evidence records belongs to the companion ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md), [core gxp/04](../../core/gxp/04-validation-plan.md)
§6.1). This file specifies that generator, `collectOqEvidence`: the runner
formats it reads, how it resolves requirement tags against both
specification trees, the literal outcome rules, deviations, the
installed-package and environment rules, and its own self-test
([ADR-GX-021](../decisions/021-oq-from-runner-output.md)). This file owns BEH-GX-121–128 and uses all eight.

> **What OQ evidence does not do — and who does**
>
> The generator reports what a test runner reported. It does not run tests,
> judge whether a test is adequate for its requirement, or turn a result
> into a qualification. Choosing which results to leverage, executing the
> suites in the consumer's own environment, and deciding acceptance are the
> consumer's obligation.

Planned source: `packages/gxp/src/evidence/collectOqEvidence.ts`,
`packages/gxp/src/evidence/runners/` and
`packages/gxp/src/evidence/captureRunEnvironment.ts` *(Planned)*.

## BEH-GX-121: collectOqEvidence builds results only from test-runner output

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [URS-BR-025](../../core/urs.md)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports EU GMP Annex 11 §4.7; 21 CFR 11.10(a) (as evidence the consumer evaluates)

```ts
// illustrative — not type-checked
declare function collectOqEvidence(q: {
  readonly runnerOutputs: readonly {
    readonly format: "vitest-json" | "junit-xml" | "cucumber-ndjson"
    readonly path: string                            // the file exactly as the runner wrote it
    readonly run: string                             // path of its run manifest (BEH-GX-127)
  }[]
  readonly traceability: { readonly core: string; readonly gx: string }   // the two traceability.md files
  readonly installed: InstalledIdentity              // from the IQ report (BEH-GX-117)
  readonly conformance?: readonly string[]           // conformance-manifest.json files (BEH-GX-031)
}): Effect.Effect<OqReport, RunnerOutputUnreadable>

class RunnerOutputUnreadable extends Schema.TaggedError<RunnerOutputUnreadable>()("RunnerOutputUnreadable", {
  path: Schema.String,                    // the runner output file
  reason: Schema.Literal("unparseable", "truncated", "no-end-marker", "duplicate-test")   // BEH-GX-122
}) {}

interface OqReport {
  readonly format: "bridger-gx-oq/1"
  readonly requirements: readonly { readonly id: string; readonly outcome: OqOutcome
                                    readonly tests: readonly TestRef[] }[]      // every REQ-BR and REQ-GX defined
  readonly conformanceCases: readonly { readonly number: number; readonly testName: string
                                        readonly outcome: "pass" | "fail" | "not executed" }[]
  readonly deviations: readonly Deviation[]          // BEH-GX-125
  readonly statement: string
}
type OqOutcome = "pass" | "fail" | "skipped" | "not covered"
```

```
REQUIREMENT: `collectOqEvidence` MUST take every result from the runner
             output files it is given and from nothing else: it MUST NOT read
             test source files, run a test, accept a result typed in by hand,
             or infer a result from a file's presence.
```

```
REQUIREMENT: For each conformance manifest given, every case it lists MUST
             appear in `conformanceCases`: "pass" or "fail" as the runner
             reported the test of that exact name, "not executed" when no
             test of that name is in any output. A run marked as a self-test
             of the suite MUST NOT be counted for any production adapter
             (BEH-GX-032).
```

```
REQUIREMENT: Every input file MUST be copied, byte for byte, into the
             evidence pack's `attachments/`, so that the generator can be
             re-run on the pack and give the same report (BEH-GX-130).
```

A generator that computed or accepted a verdict would make the companion the
witness to its own tests ([RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)). Reading the runner's own output, and
keeping it unmodified beside the result, lets anyone repeat the derivation.
The conformance manifest lists what should have run before the runner
starts ([BEH-GX-031](./04-conformance-suite.md#beh-gx-031-the-output-of-a-run-is-evidence-for-the-pack-not-a-verdict)), so a case that vanished — filtered out, renamed, never
reached after a crash — surfaces as "not executed" rather than not at all.

## BEH-GX-122: Three runner formats are read, completely or not at all

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.7

| Format | Test identity | Result | Requirement tags |
| --- | --- | --- | --- |
| vitest JSON reporter output | file + `fullName` of each assertion result | `status`: "passed" → pass; "failed" → fail; "skipped", "pending", "todo" → skipped | `@REQ-…` tokens in `fullName` |
| JUnit XML | `classname` + `name` of each `testcase` | a `failure` or `error` child → fail; `skipped` child → skipped; otherwise pass | `@REQ-…` tokens in `name` |
| Cucumber NDJSON messages | `pickle` id and name | the worst `testStepFinished` status of the test case: "FAILED", "UNDEFINED", "AMBIGUOUS" → fail; "SKIPPED", "PENDING" only → skipped; all "PASSED" → pass | the pickle's tags |

```
REQUIREMENT: Each file MUST be parsed completely before any result from it is
             used. A file that does not parse, is truncated, lacks the
             format's end marker (vitest `success` field, the closing
             `testsuites` element, a `testRunFinished` message), or holds two
             tests with the same identity MUST fail the whole collection with
             `RunnerOutputUnreadable { path, reason }`; no report MUST be
             produced from the other files.
```

```
REQUIREMENT: A test case started but without a result entry — a runner crash
             mid-test — MUST be counted as "fail" for every requirement it
             claims.
```

Refusing a damaged file outright is deliberate: a truncated report is
exactly what a crashed run leaves behind, and reading the half that exists
would present an incomplete run as a smaller complete one.

## BEH-GX-123: Requirement tags are resolved against both specification trees

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-002](../decisions/002-own-tree-and-gx-series.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-005](../urs.md#nfr-gx-005-specification-integrity)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.7 (traceability of test to requirement)

```
REQUIREMENT: A tag MUST match `@REQ-(BR|GX)-\d{3}` exactly. `@REQ-BR-nnn`
             MUST be resolved against the `REQ-BR` rows of core's
             `traceability.md` §5 and `@REQ-GX-nnn` against this tree's; the
             set of requirements in the report MUST be every requirement
             defined in either file, including those no test claims.
```

```
REQUIREMENT: A tag that names no defined requirement, and a token that looks
             like a requirement tag but does not match the pattern (for
             example `@REQ-GX-12`), MUST each be reported as a deviation
             "unknown-requirement" naming the test and the token. It MUST NOT
             be dropped, corrected or mapped to a nearby requirement.
```

```
REQUIREMENT: Both traceability files MUST be attached to the pack, and the
             report MUST record their digests, so that a reader can see which
             revision of each tree the tags were resolved against.
```

Core's checks 55–58 ([BEH-BR-184](../../core/behaviors/21-testing-host.md), REQ-BR-055–058) and the companion's checks
([20 — Required Acceptance Checks](./20-required-acceptance-checks.md)) together cover the
fingerprint, `Host.controls` and definition paths that cross the boundary,
so one report must resolve both series. A typo in a tag is the commonest way
a test silently stops counting; reporting it as a deviation makes the
requirement show "not covered" and the typo show where it is.

## BEH-GX-124: A requirement's outcome follows literally from its tests: fail, skipped, pass or not covered

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports EU GMP Annex 11 §4.7; 21 CFR 11.10(a)

```
REQUIREMENT: Over all tests that claim a requirement, in all inputs counted
             (BEH-GX-126), the outcome MUST be: "fail" when any test failed;
             otherwise "pass" when at least one test passed; otherwise
             "skipped" when at least one test was skipped; otherwise "not
             covered". No other rule, weighting or threshold MAY apply.
```

```
REQUIREMENT: The generator MUST offer no option to exclude a requirement,
             accept a failure, ignore a skip or relabel an outcome. The
             report's `statement` MUST give the four counts and say: "Results
             are the test runner's. A requirement with no executed test is not
             covered."
```

```
REQUIREMENT: Every test MUST be listed under every requirement it claims,
             with its identity, its outcome and the attachment it came from,
             so that each outcome can be traced to the runner's own line.
```

"Gaps are gaps" ([core gxp/04](../../core/gxp/04-validation-plan.md) §6.1, rule 3): a requirement that nothing
exercised is reported as such, never filled by a test of something nearby,
and a skipped test is never a pass. One failed test among many passing ones
fails the requirement, because the failing case is usually the one that
mattered.

## BEH-GX-125: Every departure the generator finds is a deviation, kept with the evidence and never resolved by the generator

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.7; GAMP 5 deviation handling (as input to the consumer's procedure)

| Deviation kind | Raised when |
| --- | --- |
| `unknown-requirement` | BEH-GX-123, second requirement |
| `requirement-failed` | a requirement's outcome is "fail" |
| `requirement-not-covered` | a requirement's outcome is "not covered" or "skipped" |
| `conformance-not-executed` | a conformance case is "not executed" |
| `conformance-failed` | a conformance case is "fail", including the deliberate failure "not executed: reopen not supported by the adapter" (BEH-GX-025) |
| `package-mismatch` | BEH-GX-126 |
| `environment-incomplete` | BEH-GX-127 |

```
REQUIREMENT: The generator MUST raise one deviation per occurrence, of the
             kinds above, each `{ kind, source, subject, detail }` with a
             fixed-template `detail` and no free text taken from a test's
             output. Each MUST be written to `deviations.json` with state
             "open" (BEH-GX-133).
```

```
REQUIREMENT: The generator MUST NOT close, justify or downgrade a deviation.
             A justification is the consumer's, added to the pack's
             deviations as a separate, attributed entry that refers to the
             deviation and leaves it unchanged. This is the consumer's
             obligation.
```

A deviation is a fact about the run; what it means is a judgment. Keeping
the two apart — the generator records, a person assesses — is what lets a
reviewer later see both the raw departure and who decided it was acceptable.
A conformance case that could not run because the adapter cannot reopen is
reported as a failed case on purpose ([BEH-GX-025](./04-conformance-suite.md#beh-gx-025-runtrailstoreconformance-registers-the-numbered-cases-with-the-callers-test-runner)); its deviation is
where the consumer records why that is acceptable for their store, if it is.

## BEH-GX-126: Only runs against the installed packages are counted

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-025](../decisions/025-core-version-range.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports EU GMP Annex 11 §4.4, §4.7

```ts
// illustrative — not type-checked
interface InstalledIdentity {
  readonly packages: readonly { readonly name: string; readonly version: string; readonly registryHash: string
                                readonly filesDigest: string; readonly resolvedFrom: string }[]  // @bridger/core, @bridger/gxp, effect; @bridger/audit-chain with sealing on
}
```

```
REQUIREMENT: A runner output MUST be counted only when its run manifest
             records, for `@bridger/core`, `@bridger/gxp` and `effect`, and
             for `@bridger/audit-chain` when the assembly has sealing on, the
             same name, version, registry hash and installed-files digest as
             `installed`, and a resolved location inside an installed
             dependency directory, not a source tree or a workspace link.
```

```
REQUIREMENT: An output that fails the rule above MUST raise
             `package-mismatch`, MUST still be attached to the pack, and its
             results MUST NOT contribute to any requirement's outcome.
```

A suite that imports from the source tree verifies the source, not what the
consumer installed ([core gxp/04](../../core/gxp/04-validation-plan.md) §5.2). Matching each run to the identity IQ
recorded (BEH-GX-117) is what lets installation and operational evidence be
read as one statement about one set of packages.

## BEH-GX-127: Every run carries the environment record of core gxp/04 §6.1

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)
> **Regulatory:** supports EU GMP Annex 11 §4.7; ALCOA+ Attributable, Contemporaneous

```ts
// illustrative — not type-checked
declare function captureRunEnvironment(q: { readonly executor: string; readonly suiteVersion: string }):
  Effect.Effect<RunManifest>                          // called by the consumer's test setup, before the run
interface RunManifest {
  readonly format: "bridger-gx-run/1"
  readonly packages: InstalledIdentity["packages"]
  readonly commit?: string                            // source commit of the release, when published
  readonly lockfileDigest: string
  readonly suiteVersion: string
  readonly environment: { readonly os: string; readonly runtime: string; readonly runtimeVersion: string
                          readonly arch: string; readonly packageManager: string; readonly packageManagerVersion: string }
  readonly clock: { readonly source: string; readonly testClock: "all" | "some" | "none" }
  readonly executor: string                           // CI job id or the person who started the run
  readonly machine: string
  readonly startedAt: string
  readonly endedAt?: string                           // written when the run ends
}
```

```
REQUIREMENT: A run manifest MUST hold every field above except `commit`; a
             missing or blank field MUST raise `environment-incomplete` for
             that run. The run's results MUST still be counted, and the
             deviation MUST name the missing field.
```

```
REQUIREMENT: The run manifest MUST NOT contain environment variables,
             command lines, file contents or any configuration value; the
             fields are fixed.
```

These are the fields core's validation plan requires of every evidence
record ([core gxp/04](../../core/gxp/04-validation-plan.md) §6.1, rule 4). An incomplete record still
reports what ran — discarding it would hide results — but the gap in its
description is itself a deviation the consumer must assess.

## BEH-GX-128: The generator is tested against a known-bad corpus with exact expected outcomes

> **Invariant:** [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps)
> **See:** [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-GX-014](../urs.md#urs-gx-014-produce-operational-evidence-that-shows-gaps), [NFR-GX-004](../urs.md#nfr-gx-004-mutation-testing)
> **Risk:** [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016)
> **Regulatory:** supports EU GMP Annex 11 §4.7 (adequacy of test tools)

| Corpus item | Expected outcome |
| --- | --- |
| one failed test among passing tests of a requirement | requirement "fail"; `requirement-failed` |
| a requirement whose only tests are skipped, pending or todo | "skipped"; `requirement-not-covered` |
| a defined requirement with no test | "not covered"; `requirement-not-covered` |
| a well-formed tag naming no defined requirement, and a malformed `@REQ-GX-12` | two `unknown-requirement`; neither counted |
| two tests with the same identity in one file | `RunnerOutputUnreadable` |
| a run manifest with a different `@bridger/core` version | `package-mismatch`; its results not counted |
| a truncated file of each format | `RunnerOutputUnreadable` |
| a run manifest without `machine` | `environment-incomplete`; results counted |
| a conformance case missing from the runner output | "not executed"; `conformance-not-executed` |

```
REQUIREMENT: The companion's test suite MUST run `collectOqEvidence` over a
             corpus containing at least the items of the table, each in the
             three formats where the format allows it, and MUST assert the
             exact outcome shown. The corpus MUST ship in the companion's
             repository as fixed files.
```

```
REQUIREMENT: Mutation testing of the generator (NFR-GX-004) MUST include the
             outcome rule of BEH-GX-124; a mutant that turns a "fail" or
             "skipped" into a "pass" and is not killed by the corpus MUST be
             recorded as a defect of the corpus.
```

The generator is a test tool whose failure mode is a false pass, the one
error an evidence reader cannot see ([core gxp/04](../../core/gxp/04-validation-plan.md) §5.4). A corpus of
deliberately bad inputs, with the exact answers they must produce, is how
the tool shows it reports what it was given and nothing better.

---

_Previous: [15 — Installation Checks](./15-installation-checks.md)_ · _Next: [17 — Evidence Pack](./17-evidence-pack.md)_
