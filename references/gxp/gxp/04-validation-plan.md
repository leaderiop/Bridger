# 04 — Validation Plan

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-GXP-04                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | GxP Compliance Document                                      |
> | Change History | 0.2 (2026-11-09): RSK-GX-023 in the High rigour row; files 21 and 22 in place of 07; scenarios REQ-GX-001–047 (BEH-GX-153–169); a change of the adopted `@bridger/audit-chain` version is a revalidation trigger (F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

This is the **supplier-side verification strategy** for `@bridger/gxp`. It states how the companion's specified behaviour is to be verified — including the conformance suite and the evidence generator, which are themselves tools whose output others rely on — and how the companion is to produce IQ/OQ evidence that a regulated user can feed into the validation of their own system. It is **not** a validation of the companion: a library is not validated on its own ([regulatory scope](./01-regulatory-scope.md) §3). It is the plan core's [validation plan](../../core/gxp/04-validation-plan.md) §2 defers to the companion's specification, and it follows core's structure.

## §1 Status

**Nothing has been executed. All evidence is Planned.** There is no `packages/gxp`, so there is no test, no result and no evidence pack. Every command named here is *Not yet runnable* except documentation gate D1 (`bash references/gxp/scripts/verify-traceability.sh --strict`), which checks only that the specification agrees with itself and with core ([Definitions of Done](../process/definitions-of-done.md)). Passing it says nothing about how the companion would behave.

## §2 Scope and roles

| In scope of this plan | Out of scope of this plan |
| --------------------- | ------------------------- |
| Verification that `@bridger/gxp` behaves as its behaviours (`BEH-GX`) and invariants (`INV-GX`) specify, against the real core | Validation of any regulated user's system |
| Verification of the companion's own tools: the conformance suite, the installation checks, the OQ evidence generator, the pack builder | PQ |
| The IQ/OQ evidence the companion produces for a user's installation, and the rules it follows | Qualification of the user's adapters, stores, signature port, key provider, identity provider or clock — beyond running the conformance suite against an adapter the user supplies |
| Supplier inputs to a user's periodic review and change assessment | Verification of `@bridger/core`, which core's plan covers |

Roles: the Bridger maintainers plan and execute the companion's verification and publish its evidence packs; the regulated user executes the installation checks and the OQ suites in their environment with their adapters, decides how much supplier evidence to leverage, and performs PQ.

## §3 V-model mapping

| Specification level | Verified by | Who | Companion-side activity |
| ------------------- | ----------- | --- | ----------------------- |
| User requirements — the user's system URS, informed by [urs.md](../urs.md) | **PQ** | Regulated user | None. The companion supplies no PQ evidence. |
| Functional specification — [behaviours](../behaviors/01-companion-boundary.md), [invariants](../invariants.md), the acceptance checks of [20](../behaviors/20-required-acceptance-checks.md) | **OQ** | Bridger (§5); regulated user (repeats with their adapters, §6.2) | Acceptance scenarios for BEH-GX-153–169, property tests, conformance runs, test vectors, mutation testing — **against the installed package and the real core**, never the source tree or a mock of core |
| Design — ADRs, package layout, core version range (one minor line), port shapes | **IQ** | Bridger (checks defined, §6.1); regulated user (executes them) | Package identity, version pins, ports wired, fixtures absent, stores reachable, policy and eligibility digests, timeouts |

A failed OQ result traces back to its behaviour and invariant, and from there to the user requirement and risk ([traceability.md](../traceability.md)).

## §4 Risk-based rigour

Rigour follows the **initial** class of the risks a behaviour controls, or a High initial priority, as in core ([core validation plan](../../core/gxp/04-validation-plan.md) §4; FDA CSA guidance, 2025; GAMP 5, 2022).

| Initial risk class (or priority High) | Minimum assurance activity | Record |
| ------------------------------------- | -------------------------- | ------ |
| **High** | Scripted acceptance scenarios for each controlling behaviour; property tests over generated inputs, interleavings and injected faults asserting the related invariants; mutation score of at least 80% on the code under test with every surviving mutant there reviewed and recorded | Full evidence record (§6.4) per test |
| **Medium** | Scripted unit tests with assertions on observable outcomes (refusal reasons, findings, records, ticket events) | Full evidence record per test |
| **Low** | Recorded unscripted testing | Summary record per session |

Applied to the [risk register](./03-risk-assessment.md):

| Rigour | Risks | Behaviour files mainly exercised |
| ------ | ----- | -------------------------------- |
| High | RSK-GX-001 to RSK-GX-009, RSK-GX-011 to RSK-GX-017, RSK-GX-019, RSK-GX-020, RSK-GX-022, RSK-GX-023 | [01](../behaviors/01-companion-boundary.md), [02](../behaviors/02-trail-store-port.md)–[06](../behaviors/06-high-water-marks-and-anchors.md), [08](../behaviors/08-approval-policy.md)–[12](../behaviors/12-approval-gate.md), [13](../behaviors/13-config-fingerprints.md), [14](../behaviors/14-fingerprint-keys.md), [15](../behaviors/15-installation-checks.md)–[18](../behaviors/18-archive-and-export.md), [19](../behaviors/19-testing-entry-point.md), [21](../behaviors/21-sealing-through-audit-chain.md), [22](../behaviors/22-trail-status-and-gate.md) |
| Medium | RSK-GX-010, RSK-GX-018, RSK-GX-021 | [12](../behaviors/12-approval-gate.md), [09](../behaviors/09-approval-tickets.md) |
| Low | None in the current register | — |

These are minimums. Every numbered check of BEH-GX-153–169 (REQ-GX-001–047, [traceability](../traceability.md) §5) is scripted regardless of the table; [NFR-GX-003](../urs.md#nfr-gx-003-coverage) (coverage at least 95%) and [NFR-GX-004](../urs.md#nfr-gx-004-mutation-testing) (mutation score at least 80%) apply to the whole of `packages/gxp`.

## §5 Verification of the companion

### §5.1 Behaviour verification

All suites run against the **packed and installed** `@bridger/gxp`, beside the packed `@bridger/core` of the supported range, in a clean workspace with a lockfile (merge-gate row 14). Rows refer to the merge gate in [Definitions of Done](../process/definitions-of-done.md).

| Test type | What it shows | Merge-gate row |
| --------- | ------------- | -------------- |
| Acceptance scenarios REQ-GX-001–047, for the numbered checks of BEH-GX-153–169 | Each behaviour's observable outcomes, including every refusal reason, finding kind and error tag | 8 |
| Property tests | Invariants INV-GX-001–015 over generated trails, tickets, signer sets, interleavings and faults, stepped deterministically under core's `TestHost` | 7 |
| Type-level tests | Port shapes; `GxpLayer.make` with a missing member fails to compile; no mutating member besides `append` and `put` | 6 |
| Fault-injection matrix | Every port × {fail, die, hang past the deadline, malformed answer, interruption} refuses or fails the write (INV-GX-011) | 8 |
| Canary scan | No configuration value, key material or port text in any output (INV-GX-005) | 7 |
| Coverage | Line and branch at least 95%, as a floor and never as evidence on its own | 7 |
| Mutation testing | At least 80% on `packages/gxp`; a test that kills no mutant of the code it covers is not counted as evidence for that code | 15 |

### §5.2 The conformance suite

The suite ([04](../behaviors/04-conformance-suite.md)) is the companion's test tool for other people's adapters, so it is verified in both directions:

1. **It passes a conforming store.** Every numbered case passes against `memoryTrailStore` with several seeds, and two runs with one seed produce identical output (BEH-GX-030).
2. **It fails a non-conforming store, at the right case.** Against each `brokenTrailStore` variant — duplicate on repeat, unchecked already-stored, overwrite on collision, drop on collision, no sequence check, acknowledge without storing — every case listed for the variant fails, and every case from 3 to 9 fails against at least one variant ([BEH-GX-147](../behaviors/19-testing-entry-point.md); merge-gate row 9). The fault cases inject commit-then-hang, commit-then-fail, fail-before-commit and die through `faultyTrailStore` (BEH-GX-027).
3. **It drives the real core.** A test asserts the suite resolves core's `TestHost` from the installed core and never a stand-in (BEH-GX-026).
4. **Its limits are in its output.** The stated limits of BEH-GX-032 appear in every run's output and are checked by a golden test.

### §5.3 Test vectors and determinism

The binding-digest vectors of [09](../behaviors/09-approval-tickets.md) and the fingerprint vectors of [13](../behaviors/13-config-fingerprints.md) are recomputed by documentation check 17 now and by merge-gate row 10 once code exists, on every supported runtime. Determinism ([NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)) is tested by producing check reports, archives and evidence packs twice from the same inputs under `TestClock` and asserting byte-identical files and equal pack digests (INV-GX-012).

### §5.4 The evidence generator's own verification

The OQ generator and the pack builder decide what a user will read as test evidence, so they are held to the highest rigour regardless of the table in §4 ([RSK-GX-016](./03-risk-assessment.md#rsk-gx-016)):

1. **Self-test on a known-bad corpus** (merge-gate row 11). A fixed corpus of runner outputs ships in the companion's repository and contains at least the items of [BEH-GX-128](../behaviors/16-oq-evidence.md), in each supported format where the format allows: a failed test; a requirement whose tests are all skipped; a requirement with no test; a well-formed tag naming no defined requirement and a malformed tag; a duplicate test identity; a run against a different `@bridger/core` version; a truncated file; a run manifest without `machine`; a conformance case missing from the output. A test started without a result, as a runner crash leaves it, counts as fail (BEH-GX-122). The self-test asserts the exact outcome and deviation for each, and fails if any outcome is pass where the corpus says otherwise ([ADR-GX-021](../decisions/021-oq-from-runner-output.md)).
2. **A known-good corpus** — the same requirements all passing — must produce pass for each, so the generator cannot satisfy the self-test by never reporting pass.
3. **Property test of the outcome table**: for any multiset of results for a requirement, the outcome is fail if any result is fail, skipped if all are skipped, not covered if there are none, and pass otherwise (INV-GX-010).
4. **No override surface.** A type-level test that the generator's options contain no member that excludes a requirement or relabels an outcome.
5. **Pack verification.** A pack is rebuilt from its inputs and compared byte for byte; every attachment's SHA-256 is recomputed by `diffPacks` and by a test independent of the builder ([17](../behaviors/17-evidence-pack.md)).
6. **Installation checks against fixtures.** The IQ runner is exercised with every fixture wired, with a non-finite `gateTimeout`, with an unsupported core version and with a failing probe, asserting `fail` or `not-executed` as specified and never `pass` ([15](../behaviors/15-installation-checks.md)).
7. **Mutation score of at least 80%** on the generator, the pack builder and the installation checks, with every surviving mutant reviewed.

### §5.5 Adequacy of the test tools

Annex 11 §4.7 expects automated test tools to be assessed for adequacy. The companion relies on core's `TestHost`, whose assessment is core's ([core validation plan](../../core/gxp/04-validation-plan.md) §5.4); it adds:

- **Fixtures** ([19](../behaviors/19-testing-entry-point.md)) are assessed for being marked (INV-GX-014) and for behaving as the port contracts require, by running the conformance suite against `memoryTrailStore` and the ticket-store acceptance cases against `memoryTicketStore`.
- **Limits are recorded, not hidden.** A real remote store's commit point, true parallelism in a ticket store, and real signature devices are not reached deterministically; behaviours depending on them get separate, non-deterministic tests and are reported as partially covered where that is the case.
- **The evidence generator** is assessed by §5.4.

## §6 Evidence the companion produces for regulated users

The companion is specified to turn executed checks and executed tests into evidence records for a user's installation. The behaviours are normative; this section states how they fit the user's IQ and OQ.

### §6.1 Installation checks (feeding IQ)

`runInstallationChecks` ([15 — Installation checks](../behaviors/15-installation-checks.md), BEH-GX-113–120) executes, in the user's assembled host:

- **core's installation checks** of [core validation plan](../../core/gxp/04-validation-plan.md) §5.1, now executable through the read-only `Host.controls` ([BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md)): package identity, export resolution, the Effect pin, audit wiring, identifier source, attribution and gate settings, fingerprinter wiring;
- **the companion's checks**: package identity and installed-file digests; the installed core version and supported `schemaVersion`s against the compiled compatibility row ([ADR-GX-025](../decisions/025-core-version-range.md)); every section of `GxpLayer.make` wired as declared; no fixture marker, `test:` key id or scripted capture on any wired port ([ADR-GX-024](../decisions/024-fixtures-are-marked.md)); trail, anchor and ticket stores reachable and the key provider answering with a current key id; the policy and eligibility digests; a finite `gateTimeout` exceeding the gate's attached deadline by at least 1 second; the approval gate attached to this host; the signature port's manifest; a recent high-water mark.

Each result is `pass`, `fail`, `not-applicable` or `not-executed`, and is marked **proof** (follows from data that does not change while the installation is unchanged) or **probe** (an external answer at one moment, with its time) ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)). What no code can observe — anchor-store custody, alias resolution in the identity system, entropy of eligible values, the re-authentication behind signatures — is listed as `not-executed` with the reason "not observable from code; Consumer obligation". The normative list and numbering are in file 15.

### §6.2 Operational evidence (feeding OQ)

`collectOqEvidence` ([16 — OQ evidence](../behaviors/16-oq-evidence.md), BEH-GX-121–128) reads only runner output from runs of core's and the companion's suites against the installed packages in the user's environment, resolves `@REQ-BR-nnn` and `@REQ-GX-nnn` tags against both trees, and reports per requirement pass, fail, skipped or not covered; unknown tags and package mismatches are deviations. The user runs the conformance suite against their own trail adapter as part of OQ; its output enters the pack like any other runner output.

### §6.3 The evidence pack

`buildEvidencePack` ([17 — Evidence pack](../behaviors/17-evidence-pack.md), BEH-GX-129–136) writes `manifest.json` (`bridger-gx-evidence/1`, with the SHA-256 of each file), `iq.json`, `oq.json`, `coverage.json`, `checks.json`, `deviations.json`, `adapters.json` and the raw runner output under `attachments/`, plus deterministic `report.html` and `report.md` marked as derived, and a pack digest. `diffPacks` compares two packs, for example before and after an upgrade. The pack is test evidence for the companion's components in one installation; it is not a qualification of the system ([ADR-GX-027](../decisions/027-claims-and-non-claims.md) non-claim 19).

### §6.4 Evidence rules and acceptance criteria

Evidence follows core's rules ([core validation plan](../../core/gxp/04-validation-plan.md) §6.1, [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)) and [ADR-GX-021](../decisions/021-oq-from-runner-output.md): executed tests only; generated, never hand-written; gaps are gaps; each record carries the requirement identifiers, the result, package versions and installed-file digests of both packages, environment, clock, executor, start and end times, and the raw runner output unmodified.

The companion's verification of a release is acceptable as supplier evidence when all of the following hold:

1. Every acceptance scenario REQ-GX-001–047 (the checks of BEH-GX-153–169) was executed against the installed packages and passed; none linked to a High-rigour risk (§4) is skipped.
2. Every `BEH-GX` is covered by at least one executed test, or is listed as not covered with a reason.
3. The conformance suite passes against `memoryTrailStore` and fails at the expected cases for each `faultyTrailStore` mode and each broken adapter (§5.2).
4. The evidence generator's self-test passes on both corpora (§5.4).
5. Every test vector reproduces on every supported runtime (§5.3).
6. Mutation score is at least 80% on `packages/gxp`, and surviving mutants in code controlling a High-class risk are reviewed and recorded.
7. Line and branch coverage are at least 95%, as a floor.
8. Documentation gate D1 passes with `--strict`, including core's checker (check 15).
9. Core's own release evidence for the paired core version meets core's acceptance criteria.
10. No deviation affecting a High-class risk is open; any other open deviation is disclosed in the pack.

Meeting these criteria makes the evidence usable as supplier input. It does not make the companion, or any system, qualified; that remains the regulated user's decision.

## §7 Deviation handling

A deviation is any executed result that differs from its expected result, any evidence record that breaks §6.4, any installation check that fails, an unknown requirement tag, or a package mismatch between IQ and OQ. Deviations are written to `deviations.json` by the generator and are never removed by it.

1. **Record.** The raw result stays unmodified in the pack. A deviation is never resolved by editing a result, an expected value or a vector without a CCR-GX.
2. **Classify.** Impact is assessed through the risks of the affected behaviours ([risk assessment](./03-risk-assessment.md)); a deviation touching a High-class risk blocks acceptance (§6.4).
3. **Investigate.** The root cause is placed in the code, the test, the specification, the tool (including the generator and the conformance suite), the environment, or core.
4. **Correct.** Under a CCR-GX ([change control](../process/change-control.md)); a cause in core is raised as a CCR-BR under the coupling rule ([change control](../process/change-control.md) §7).
5. **Re-execute.** The affected scenarios and the CCR's regression scope are re-executed and a new pack is generated.
6. **Close.** With a reference to the CCR and the new pack digest. Deviations open at release are listed in the release's pack.

A user's own deviations — from IQ or OQ in their installation — follow their deviation procedure; the pack gives them the raw material, not the procedure (non-claim 21).

## §8 Periodic review

At each release, and at least every twelve months while the companion is maintained, the maintainers review and publish:

- open deviations and their status;
- the [risk register](./03-risk-assessment.md), re-scored where its §5 requires;
- the CCR-GX history, and every CCR-BR assessed under the coupling rule, since the last review;
- core releases since the supported range, and whether a new pair in the compatibility matrix is due;
- the platform cryptography and runtime versions the vectors were last reproduced on;
- regulatory changes, including the status of the Annex 11 revision ([regulatory scope](./01-regulatory-scope.md) §5);
- the supplier situation of §10.

This is an input to the user's own periodic evaluation (Annex 11 §11). A user's periodic review should include, on their side, the policy and eligibility digests in force, key rotations since the last review, anchor custody, and a fresh IQ run.

## §9 Revalidation triggers

The following require the affected verification to be re-executed and new evidence generated, and are flagged in the CCR and release notes so that a user can decide whether to re-qualify:

1. **A core version change.** Any new core version, patch releases included, is added to the [compatibility matrix](../appendices/core-interface-map.md) only after the full suite, including conformance and cross-tree tags, has run against it and produced a pack ([ADR-GX-025](../decisions/025-core-version-range.md)). A core change to `schemaVersion` or to any identifier in the interface map needs a new companion version (core interface map §7).
2. **Any GxP-impacting change to the companion** — a port shape, the canonical form, the binding contents, the fingerprint construction, the adopted `@bridger/audit-chain` version or format version, the gate's steps or refusal reasons, the policy format, the evidence rules, or a compliance-matrix row ([change control](../process/change-control.md) §3).
3. **Key rotation or a change of key provider** in a user's installation. Outstanding tickets become stale and are re-issued ([ADR-GX-019](../decisions/019-key-provider-and-rotation.md)); the IQ probe of the key provider and the fingerprint OQ cases are re-executed against the new key id.
4. **A policy or eligibility change** in a user's installation. The digest changes, outstanding tickets issued under the old policy are no longer valid, and IQ and the policy OQ cases are re-executed ([BEH-GX-061](../behaviors/08-approval-policy.md)).
5. **A change of adapter** — a new trail, anchor or ticket store, or a new version of one: the conformance suite and the store-related OQ cases are re-run against it.
6. **A change to a default** a control depends on: the gate's internal deadline, the high-water schedule, the anchoring interval, streaming page sizes and memory bounds.
7. **A runtime or platform change** that alters the cryptography or JSON behaviour the vectors depend on.
8. **Finalisation of a regulatory instrument** in the regulatory scope, where re-assessment changes a matrix row.

The decision to re-qualify a system is always the regulated user's.

## §10 Supplier-assessment notes

For a regulated user's supplier assessment (GAMP 5; Annex 11 §3 and §4.5), stated as the situation is:

| Topic | Situation |
| ----- | --------- |
| Nature of supply | Open-source library, consumed from a package registry with `@bridger/core` as its peer. Source, specification and change history are inspectable. |
| Organisation | A **single maintainer**, who writes and approves the specification; **no independent review** yet ([change control](../process/change-control.md) §5). The same maintainer supplies core, so a core defect and a companion defect may share a cause. |
| Agreements and support | No service-level agreement, support contract or formal supplier agreement. |
| Quality system | The specification's process documents: [identifier scheme](../process/requirement-id-scheme.md), [Definitions of Done](../process/definitions-of-done.md), [change control](../process/change-control.md) with its coupling rule. No certified quality management system. |
| Status | Prospective: no implementation, no executed test, no evidence ([ADR-GX-026](../decisions/026-prospective-specification.md)). |
| Sub-suppliers | `@bridger/core` (one minor line, each tested version listed in the compatibility matrix), Effect, and the platform's cryptography; the companion's behaviour is no stronger than theirs. |
| Dependence on the user | Every store, the signature port and the key provider are the user's; the companion's evidence covers the companion's components and the adapters the user ran the suites against, nothing else. |

**Suggested actions for a regulated user:** review this specification independently, since the supplier has not; run the conformance suite against each of their adapters and keep the output; execute IQ and the OQ suites in their own environment rather than relying only on published packs; carry the consumer-owned residuals of the [risk assessment](./03-risk-assessment.md) §4 into their own; keep the policy, eligibility list and adapters under their change control.

## §11 Traceability

The chain URS-GX → BEH-GX → INV-GX → ADR-GX → REQ-GX → RSK-GX → test is to be maintained in [traceability.md](../traceability.md), with `REQ-GX` scenarios allocated from the numbered checks of [20](../behaviors/20-required-acceptance-checks.md). Each evidence record's identifiers, from either tree, must resolve there or in core's traceability; an identifier that does not is a deviation.

## §12 Current status

| Activity | Status |
| -------- | ------ |
| Documentation gate D1, including core's checker and the test vectors | Runnable; not evidence of behaviour |
| Acceptance scenarios REQ-GX-001–047 (BEH-GX-153–169) | Planned — not yet runnable; see [traceability](../traceability.md) §5 |
| Property, type-level, canary and fault-injection tests | Planned — not yet runnable |
| Conformance suite verification (§5.2) | Planned — no suite exists |
| Evidence generator self-test (§5.4) | Planned — the corpus is specified, no generator exists |
| Mutation testing and coverage | Planned — not yet runnable |
| Installation checks and OQ evidence for users (§6) | Planned — no package exists |
| PQ | Regulated user's; not in this plan |

Nothing has been executed. All evidence is Planned.

---

_Previous: [Risk assessment](./03-risk-assessment.md)_
