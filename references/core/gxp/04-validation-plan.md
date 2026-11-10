# 04 — Validation Plan

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GXP-04                                               |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.9 (2026-11-10): The GxP companion is cited as a Draft with its own validation plan (C20); only the acceptance scenarios run against the installed package, coverage and mutation testing on the source tree (C25) (CCR-BR-034)<br>0.8 (2026-11-09): §5.1 check 8: identifier uniqueness of a provided `IdGenerator`, by design review and an executed draw across the hosts that share a store (F-03, RSK-BR-007); checks 4–8 examine the user's assembly; rigour table unchanged (no score changed); §12 status row covers installation checks 1–8; check 8 names the two conforming designs of BEH-BR-210 and treats any other design as a deviation (CCR-BR-033)<br>0.7 (2026-11-09): §4 rigour table extended from RSK-BR-024 to the whole register (RSK-BR-001–070) by the stated rule, and enforced by verifier check 4; §6 item 5 links the companion that produces the evidence (gap G35 closed) (CCR-BR-031)<br>0.6 (2026-11-08): Link into references/gxp/ turned into a plain-text citation; the companion Draft is recorded as not present in this repository (gap G35) (CCR-BR-016)<br>0.5 (2026-10-03): Companion described as specified in Draft (references/gxp/, CCR-GX-001), not implemented (gap G8 closed) (CCR-BR-015)<br>0.4 (2026-10-03): §5.1 checks 5–6 executable through `Host.controls` (BEH-BR-212); check 7 "fingerprinter wired as required" added; RSK-BR-024 added to the High rigour row; `ConfigFingerprinter` out of scope like the other consumer ports; `fingerprintTimeout` added to the revalidation defaults (CCR-BR-014)<br>0.3 (2026-10-03): Known-gaps list no longer cites the Effect 4.x items closed by CCR-BR-003 (consistency pass) (CCR-BR-013)<br>0.2 (2026-10-02): RSK-BR-023 added to the High rigour row (CCR-BR-006)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

This is the **library-side verification strategy** for `@bridger/core`: how the library's specified behaviour is to be verified, what evidence that verification is to produce, and how that evidence is meant to feed a regulated user's validation of their own computerized system. It is **not** a validation of the library. A library is not validated on its own; validation is what a regulated user does to a system, in its intended use, under their quality system ([regulatory scope](./01-regulatory-scope.md) §2–§3, [ADR-BR-028](../decisions/028-gxp-scope.md)).

## §1 Status

**Nothing has been executed. All evidence is Planned.** There is no code, so there is no test, no test result and no evidence record. Every activity below is a plan; every command named is *Not yet runnable* except the documentation gate, which checks only that the specification documents agree with one another ([Definitions of Done](../process/definitions-of-done.md)). Passing the documentation gate says nothing about how the library would behave.

## §2 Scope and roles

| In scope of this plan | Out of scope of this plan |
| --------------------- | ------------------------- |
| Verification that `@bridger/core` behaves as its behaviours (`BEH-BR`) and invariants (`INV-BR`) specify | Validation of any regulated user's system |
| Library-side installation checks that a regulated user can run in their environment | Performance qualification (PQ) |
| The rules evidence must follow to be offered to a regulated user | Qualification of the regulated user's `AuditSink`, `OperationGate`, `ConfigFingerprinter`, store, identity provider, clock or plugins |
| The supplier inputs to a regulated user's periodic review and change assessment | The `@bridger/gxp` companion's own verification, planned in its [validation plan](../../gxp/gxp/04-validation-plan.md) |

Roles: the Bridger maintainers plan and execute the library's verification and publish its results; the `@bridger/gxp` companion (specified as a Draft in [`references/gxp/`](../../gxp/README.md)) is to turn executed test output into IQ/OQ evidence records ([ADR-BR-034](../decisions/034-gxp-companion-scope.md)); the regulated user decides how much of that evidence to leverage, executes their own IQ and OQ in their environment, and performs PQ.

## §3 V-model mapping

| Specification level | Verified by | Who | Library-side activity |
| ------------------- | ----------- | --- | --------------------- |
| User requirements — the regulated user's system URS, informed by [urs.md](../urs.md) | **PQ** — the system performs as intended in its real use, with real users, data, sink, gate and store | Regulated user | None. Bridger supplies no PQ evidence for any system. |
| Functional specification — behaviours ([behaviors/](../behaviors/01-plugin-definition.md)) and invariants ([invariants.md](../invariants.md)) | **OQ** — the component operates as specified across its normal, boundary and failure paths | Bridger (library tests, §5.2); regulated user (repeats or leverages them in their environment) | `REQ-BR` acceptance scenarios, property tests, type-level tests and mutation testing; the acceptance scenarios **run against the installed package**, not against the source tree (§5.2) |
| Design — architecture decisions (ADRs), package layout and dependency pin | **IQ** — the component is installed as specified and is the component that was tested | Bridger (planned checks, §5.1); regulated user (executes them) | Package checksum and provenance, export resolution, Effect version pin, wiring of production ports |

The arrows run both ways: a failed OQ check traces back to the behaviour and invariant it verifies, and from there to the user requirement and risk ([traceability.md](../traceability.md)).

## §4 Risk-based rigour

Assurance activities are chosen by critical thinking about risk, following the FDA guidance *Computer Software Assurance for Production and Quality System Software* (2025) and GAMP 5 Second Edition (2022): the more a failure of the behaviour could affect GMP data or decisions, the more rigorous and more documented the testing. Rigour is set by the **initial risk class** of the risks a behaviour controls ([risk assessment](./03-risk-assessment.md) §2), because a control matters most where the uncontrolled risk is high. Where a risk's initial priority is High, the High row applies whatever its class.

| Initial risk class (or priority High) | Minimum assurance activity | Record |
| ------------------------------------- | -------------------------- | ------ |
| **High** | Scripted testing: `REQ-BR` acceptance scenarios for each behaviour named as a control; property tests over generated operation scripts that check the related invariants after every step; mutation testing with a score of at least 80% on the code under test, and every surviving mutant in that code reviewed and recorded | Full evidence record (§6.1) per test |
| **Medium** | Scripted unit tests of each behaviour named as a control, with assertions on observable outcomes (snapshots, errors, records, events) | Full evidence record (§6.1) per test |
| **Low** | Unscripted testing — exploratory, ad hoc or error-guessing — recorded with who tested, when, against which version, what was exercised, the outcome and any defect raised | Summary record per session |

Applied to the current register (RSK-BR-001 to RSK-BR-070). A risk's rigour follows from its initial scoring in the [risk assessment](./03-risk-assessment.md): High when its class or its priority is High, otherwise its class. The verifier (check 4) recomputes the level of every registered risk and fails when a risk is missing from this table or listed at another level, so a risk added to the register cannot go without a rigour level:

| Rigour | Risks | Behaviour files mainly exercised |
| ------ | ----- | -------------------------------- |
| High | RSK-BR-001 to RSK-BR-006, RSK-BR-008 to RSK-BR-010, RSK-BR-012 to RSK-BR-020, RSK-BR-022 to RSK-BR-052, RSK-BR-054 to RSK-BR-057, RSK-BR-059 to RSK-BR-062, RSK-BR-064, RSK-BR-066 to RSK-BR-070 | Every behaviour file, [01](../behaviors/01-plugin-definition.md) to [34](../behaviors/34-state-handoff.md); each risk's Controls row in the [risk assessment](./03-risk-assessment.md) names the behaviours to script |
| Medium | RSK-BR-007, RSK-BR-011, RSK-BR-021, RSK-BR-053, RSK-BR-058, RSK-BR-063, RSK-BR-065 | [02](../behaviors/02-host-construction.md), [05](../behaviors/05-activation.md), [09](../behaviors/09-leases.md), [13](../behaviors/13-observability-and-diagnostics.md), [15](../behaviors/15-optional-and-reactive.md), [16](../behaviors/16-event-bus.md), [18](../behaviors/18-reconciliation-and-confluence.md), [21](../behaviors/21-testing-host.md), [22](../behaviors/22-attributable-operations.md), [23](../behaviors/23-audit-sink-and-record.md), [24](../behaviors/24-time-ids-and-sequence.md), [27](../behaviors/27-manifest-and-lazy-activation.md), [29](../behaviors/29-capability-grants-and-call-log.md), [30](../behaviors/30-operation-context-annotations.md) |
| Low | None in the current register. Behaviours that control no listed risk and have no GxP impact may be verified at this level, unless they are among the required checks of BEH-BR-183 and BEH-BR-184, which are always scripted. | — |

These are minimums. Every required acceptance check of BEH-BR-183 and BEH-BR-184 is scripted regardless of the table, and NFR-BR-008 (mutation score at least 80% on `packages/core` *(Planned)*) applies to the whole package.

## §5 Verification activities

### §5.1 Installation checks (feeding IQ)

Planned checks, to be packaged by the companion so that a regulated user can execute them in their own environment. They establish that the installed component is the component that was tested; they never stand in for a behaviour test ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).

| # | Check | Expected result |
| - | ----- | --------------- |
| 1 | Package identity and integrity: the installed `@bridger/core` name, version and registry integrity hash match the released artifact; the release's provenance attestation is verified where the registry provides one | Match; any mismatch is a deviation |
| 2 | Export resolution: every public entry point documented in the [overview](../overview.md) resolves from the installed package under the module conditions the user's build uses | All resolve |
| 3 | Effect version pin: the installed `effect` version is the one the release's OQ evidence was produced with, and `effect` is the only runtime dependency (NFR-BR-006) | Exact match; a different version invalidates leveraged OQ evidence (§9) |
| 4 | Audit port wiring: in the user's assembled host, `HostSnapshot.audit` reports `"wired"` where the user's risk assessment requires a trail | As required by the user |
| 5 | Production time and identifier sources: the host is not running on `TestClock` or a counter `IdGenerator` ([RSK-BR-007](./03-risk-assessment.md#rsk-br-007)); `Host.controls` reports `idGenerator` as `"default"` or `"provided"` (BEH-BR-212) | Production sources wired |
| 6 | Attribution and gate configuration: `attribution.require`, `attribution.requireReason`, `auditTimeout` and `gateTimeout` are set as the user's risk assessment requires, and a gate is wired where approval is required; read from `Host.controls` (`attribution`, `auditTimeout`, `gateTimeout`, `wired.gate`; BEH-BR-212) | As required by the user |
| 7 | Fingerprinter wired as required: `Host.controls` reports `wired.fingerprinter` and `fingerprintTimeout` (BEH-BR-212) as the user's risk assessment requires; where a `ConfigFingerprinter` is wired, it is the implementation the user reviewed ([RSK-BR-024](./03-risk-assessment.md#rsk-br-024), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)) | As required by the user |
| 8 | Identifier uniqueness of a provided generator: where `Host.controls` reports `idGenerator` as `"provided"` (BEH-BR-212), (a) the generator's documented design gives every value it returns to one host, and to every other host whose records or other identified outputs reach the same store, a value no other draw returns — for example a per-host prefix assigned outside the hosts, followed by a counter that survives restarts, or at least 122 bits per value drawn independently and uniformly from a cryptographically secure source — and (b) an executed draw, from one generator instance per host of the deployment configured as in production, of at least as many values as one host is expected to draw between restarts, finds no repeated value within or across the instances ([RSK-BR-007](./03-risk-assessment.md#rsk-br-007), BEH-BR-210, BEH-BR-016) | Design reviewed and recorded; no repeat. A repeat, or a design that is neither unique by construction nor random with at least 122 such bits per value (BEH-BR-210), is a deviation |

Checks 4–8 examine the user's assembly, not the library; they are listed because they are the configuration points through which the library's controls take effect or are bypassed. Checks 6 and 7, and the identifier source of check 5, are executable through the read-only `Host.controls` (BEH-BR-212); `Host.controls` does not report the clock source, so that part of check 5 remains an inspection of the assembly. Check 8 is a design review and an executed draw: no draw of finite length proves uniqueness, and part (b) catches a misassembled generator, such as two hosts given one prefix, rather than proving the design; core itself checks no identifier for repeats (BEH-BR-210).

### §5.2 Behaviour verification (feeding OQ)

The `REQ-BR` acceptance scenarios, the suite offered as OQ evidence, run against the **installed package**: the release is packed, installed into a clean workspace with a lockfile, and the scenarios import it by its package name (merge gate row 8). A suite that imports from the source tree verifies the source, not what the user installs. Property, type-level and unit tests, coverage and mutation testing run on the source tree: coverage and mutation testing measure the strength of the tests and cannot be taken against an installed artifact. They support the acceptance evidence and are not offered as OQ evidence of the installed package; the installation checks (§5.1) tie that package to the tested source.

| Test type | What it shows | Planned tool (merge gate row) |
| --------- | ------------- | ----------------------------- |
| `REQ-BR` acceptance scenarios | Each behaviour's observable outcomes, including every cell of the legality tables and every numbered required check of BEH-BR-183 and BEH-BR-184 | Feature runner (row 8) |
| Property tests | Invariants hold across generated operation scripts, interleavings and injected faults, stepped deterministically under `TestHost` | Unit runner (row 7) |
| Type-level tests | Compile-time guarantees: undeclared dependencies fail to compile, every mutating method accepts `OperationOptions`, event keys are typed | `tstyche` (row 6) |
| Unit tests | Individual behaviours and pure functions such as `verifyAuditSequence` | Unit runner (row 7) |
| Mutation testing | The suite fails when the behaviour changes; a test that kills no mutant of the code it covers is not counted as evidence for that code | `stryker` (row 13) |
| Coverage | A floor (95%, NFR-BR-003), never evidence on its own | Unit runner (row 7) |

The rows refer to the planned merge gate in [Definitions of Done](../process/definitions-of-done.md); none is runnable yet.

### §5.3 PQ

Performance qualification is the regulated user's alone. It exercises the system that embeds Bridger, with the user's real sink, gate, store, identity binding, clock and plugins, in their intended use. Nothing in this plan, and nothing the companion is to produce, is PQ evidence.

### §5.4 Adequacy of the test tools

EU GMP Annex 11 §4.7 expects automated test tools and test environments to be assessed for adequacy. The central tool here is `TestHost` ([21 — Testing host](../behaviors/21-testing-host.md)). Its planned assessment:

- `TestHost` is a `Host` with deterministic scheduling (BEH-BR-177), not a separate implementation; the assessment confirms that scenarios run on `TestHost` exercise the same host code as production.
- Time and identifiers come from `TestClock` and a counter (BEH-BR-179), so a run is reproducible; the assessment confirms that a repeated run produces identical records.
- Faults are injected through `Fault.*` and are visible as faults (BEH-BR-180); the in-memory sink and scripted gate are test fixtures only (BEH-BR-181, BEH-BR-182).
- Limits are recorded, not hidden: true parallelism and a real slow store are not reached deterministically by `TestHost`; behaviours that depend on them get separate, non-deterministic tests and are reported as partially covered where that is the case ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).
- The evidence generator is itself tested, so that it cannot report a pass the runner did not.

## §6 Evidence and acceptance

### §6.1 Evidence rules

Evidence follows [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md):

1. **Only executed tests are evidence.** Presence checks (`typeof`, export existence, "module loads") are never evidence for a behaviour.
2. **Generated, never hand-written.** Evidence records are generated from the test runner's machine-readable output. A result fixed in code or entered by hand is not evidence.
3. **Gaps are gaps.** A behaviour with no executed test is reported as *not covered*; a skipped test as *skipped*; never as passed.
4. **Each evidence record carries:**
   - the test identifier and the `REQ-BR`, `BEH-BR`, `INV-BR` and `URS-BR` identifiers it covers;
   - the result per `REQ-BR` scenario: pass, fail, skipped or not covered;
   - versions: `@bridger/core` version and commit, the installed `effect` version, the lockfile hash, and the test-suite version;
   - environment: operating system, runtime and its version, CPU architecture, package manager and its version;
   - clock: the time source of the run itself, and whether the test ran under `TestClock`;
   - executor: the CI job or the person who started the run, and the machine;
   - start and end times of the run;
   - the raw runner logs and the mutation report, attached unmodified.
5. **Produced by the companion.** The generator that turns runner output into IQ/OQ evidence records belongs to the `@bridger/gxp` companion, which is specified only as a Draft ([`references/gxp/`](../../gxp/README.md), CCR-GX-001 and CCR-GX-002) and not implemented. Until it exists, test runs (once there is code) produce runner output only, and nothing is presented as qualification evidence.

### §6.2 Acceptance criteria

The library's verification of a release is acceptable as supplier evidence when all of the following hold:

1. Every `REQ-BR` scenario was executed against the installed package and passed; no scenario linked to a High-rigour risk (§4) is skipped.
2. Every `BEH-BR` is covered by at least one executed test, or is listed as not covered with a reason.
3. Every required check of BEH-BR-183 and BEH-BR-184 has at least one executed, passing test.
4. Mutation score is at least 80% on `packages/core` *(Planned)* (NFR-BR-008), and surviving mutants in code that controls a High-class risk are reviewed and recorded.
5. Line and branch coverage are at least 95% (NFR-BR-003), as a floor.
6. Type-level tests pass, and the documentation gate passes with `--strict` (NFR-BR-005).
7. Installation checks 1–3 of §5.1 pass for the released artifact.
8. No deviation (§7) affecting a High-class risk is open; any other open deviation is disclosed with the evidence.
9. Every evidence record is complete under §6.1.

Meeting these criteria makes the evidence usable as supplier input. It does not make the library, or any system, qualified; that remains the regulated user's decision.

## §7 Deviation handling

A deviation is any executed result that differs from the expected result, any evidence record that fails §6.1, or any installation check that fails.

1. **Record.** The raw result is kept unmodified with the evidence. A deviation is never resolved by editing a result or an expected value without a change control record.
2. **Classify.** Impact is assessed through the risks of the affected behaviours ([risk assessment](./03-risk-assessment.md)); a deviation touching a High-class risk blocks acceptance (§6.2).
3. **Investigate.** The root cause is identified as a defect in the code, the test, the specification, the tool or the environment.
4. **Correct.** The correction is made under a CCR ([change control](../process/change-control.md)), including corrections to tests and to this specification; the CCR's impact assessment states the GxP impact and the scenarios to re-execute.
5. **Re-execute.** The affected scenarios, and the regression scope the CCR names, are re-executed and new evidence is generated.
6. **Close.** The deviation is closed with a reference to the CCR and the new evidence. Deviations still open at release are listed in the release's evidence.

## §8 Periodic review

At each release, and at least every twelve months while the library is maintained, the maintainers review and publish:

- open deviations and their status;
- the [risk register](./03-risk-assessment.md), re-scored where §5 of that document requires;
- the CCR history since the last review;
- Effect releases since the pinned version, and whether an upgrade is due;
- regulatory changes, including the status of the EU GMP Annex 11 revision ([regulatory scope](./01-regulatory-scope.md) §4);
- the supplier situation of §10, including whether independent review has become available.

This is an input to the regulated user's own periodic evaluation (Annex 11 §11); it does not replace it.

## §9 Revalidation triggers

The following changes require the library's affected verification to be re-executed and new evidence generated, and are flagged in the CCR and release notes so that a regulated user can decide whether to re-qualify their system:

1. **Any change with GxP impact** to a `BEH-BR`, `INV-BR` or `ADR-BR` — as defined in [change control](../process/change-control.md) §3: attribution, the audit record, the audit sequence, the operation gate, time or identifier sources, the legality table, or any compliance-matrix row.
2. **Any Effect version change**, including patch releases: the full suite is re-executed against the new pin ([RSK-BR-022](./03-risk-assessment.md#rsk-br-022)).
3. **Any change to the audit record's `schemaVersion`**, or to the shape of `OperationRequest`, which also affects the regulated user's store, migration (Annex 11 §4.8) and archived records.
4. **Any change to a default** that a control depends on: `auditTimeout`, `gateTimeout`, `fingerprintTimeout`, `drainTimeout`, `attribution`.
5. **Finalisation of a regulatory instrument** listed in the regulatory scope, where re-assessment changes a compliance-matrix allocation.

The CCR names the `REQ-BR` scenarios that cover each change. The decision to re-qualify a system is always the regulated user's.

## §10 Supplier-assessment notes

These notes are for a regulated user's supplier assessment (GAMP 5 supplier involvement; Annex 11 §3 and §4.5). They state the supplier's situation as it is.

| Topic | Situation |
| ----- | --------- |
| Nature of supply | Open-source library, consumed from a package registry. The source, the specification and its change history are inspectable in the repository. |
| Organisation | A **single maintainer**, who writes and approves the specification. There is **no independent review** yet; every document says so in its Reviewed by and Approved by rows ([change control](../process/change-control.md) §5). |
| Agreements and support | **No service-level agreement**, no support contract, no formal supplier agreement, and no commitment to response times for defects. |
| Quality system | The development process is the specification's process documents: [identifier scheme](../process/requirement-id-scheme.md), [Definitions of Done](../process/definitions-of-done.md) and [change control](../process/change-control.md). There is no certified quality management system. |
| Status | Prospective: no implementation, no executed tests, no evidence ([ADR-BR-036](../decisions/036-prospective-specification.md)). |
| Known gaps | Listed in [urs.md](../urs.md#7-known-gaps-and-open-items) §7: unverified requirements, undetectable changed service shapes, cross-fiber re-entrancy, single maintainer; the companion gap G8 is closed by a Draft specification, not by an implementation. |
| Sub-supplier | Effect 4.x is the only runtime dependency; Bridger's guarantees are no stronger than Effect's (URS assumption A5). A regulated user should include Effect in their assessment. |

**Suggested actions for a regulated user** who adopts Bridger: review this specification independently, as part of supplier assessment, since the supplier has not had it reviewed; re-execute the library's suites in their own environment rather than relying only on published results; carry the consumer-owned residual risks of the [risk assessment](./03-risk-assessment.md) §4 into their own; and plan for the absence of supplier support in their business-continuity and change processes.

## §11 Traceability

The chain URS → BEH → INV → ADR → REQ → RSK → test is maintained in [traceability.md](../traceability.md). Each `REQ-BR` scenario is defined there and cites the behaviours it verifies; each risk has a row linking it to its controls. When code exists, each evidence record's identifiers (§6.1) must resolve in that matrix; an identifier that does not is a deviation.

## §12 Current status

| Activity | Status |
| -------- | ------ |
| Documentation gate D1 (specification consistency) | Runnable; not evidence of behaviour |
| Installation checks 1–8 (§5.1) | Planned — no package exists |
| `REQ-BR` acceptance scenarios | Planned — not yet runnable |
| Property tests | Planned — not yet runnable |
| Type-level tests | Planned — not yet runnable |
| Mutation testing | Planned — not yet runnable |
| `TestHost` adequacy assessment | Planned — no `TestHost` exists |
| Evidence generation (`@bridger/gxp`) | Planned — companion specified as a Draft (CCR-GX-001), not implemented |
| PQ | Regulated user's; not in this plan |

Nothing has been executed. All evidence is Planned.

---

_Previous: [Risk assessment](./03-risk-assessment.md)_
