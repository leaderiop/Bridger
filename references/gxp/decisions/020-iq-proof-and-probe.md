# ADR-GX-020: Installation checks distinguish proof from probe

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-020                                           |
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

Installation evidence (URS-GX-013) answers "is what was specified installed and wired as intended?". Core's validation plan lists installation checks 1–7 for a host ([core gxp/04](../../core/gxp/04-validation-plan.md)); since CCR-BR-014 most of them can be read from `Host.controls` ([BEH-BR-013](../../core/behaviors/02-host-construction.md)): `hostId`, which ports are wired, the attribution mode, `auditTimeout`, `gateTimeout`, `fingerprintTimeout`, the id generator and `auditPosition`. Some companion checks are of a different nature: whether the anchor store is reachable, or whether the key provider answers, is true at the moment of asking and may be false a minute later; whether the anchor store is under separate custody cannot be observed from code at all. Reporting both kinds as the same "pass" would overstate the second.

## Decision

- **Every IQ result has a kind.** `runInstallationChecks(host, { gxp, expected, packageRoot, lockfile, provenance? })` returns one result per numbered check, each `{ id, title, source, kind: "proof" | "probe", outcome: "pass" | "fail" | "not-applicable" | "not-executed", reason?, expected?, observed?, observedAt? }`.
  - A **proof** is a check whose outcome follows from data that does not change while the installation is unchanged: package name and version, the installed files' digests against the published manifest, version pins against the core range ([ADR-GX-025](../decisions/025-core-version-range.md)), ports wired as declared, no fixture marker on any wired port ([ADR-GX-024](../decisions/024-fixtures-are-marked.md)), the policy digest and eligibility digest, the signature port's manifest, `gateTimeout` finite and at least 1 second above the gate's internal deadline ([ADR-GX-010](../decisions/010-sign-first-then-call.md)), and core's checks 1–7.
  - A **probe** exercises something external and shows only that it answered at that moment: trail store, anchor store and ticket store reachable with a read; key provider returns a current key id; high-water recorder writing marks. Its `observedAt` is read from `Clock`, and every rendering says "observed at <observedAt>".
- **What no check can show is listed, not run.** Separate custody of the anchor store, one identifier per person in the identity system, entropy of eligible values, key custody and store durability are listed as `not-executed` with the reason "not observable from code; Consumer obligation", and the re-authentication behind signatures with "attested, not verified by @bridger/gxp", so they appear in the pack as open items for the user's own procedure.
- **Outcomes are literal.** `fail` is never folded into a warning. A check that could not run (a missing permission, a thrown defect) is `not-executed` with the reason, never `pass`. A non-finite `gateTimeout` is `fail` for its check and is also recorded as a deviation in the evidence pack ([ADR-GX-022](../decisions/022-evidence-pack-format.md)).
- **No key material, no values.** Probes ask the key provider for `current` and record only the key id; they never fingerprint a test value under a production key.
- **Output.** Results go to `iq.json` in the evidence pack, in table order (IQ-01 … IQ-21, then IQ-U1 … IQ-U9), with the `Host.controls` snapshot they were derived from (all fields are non-secret by core's definition).

## Alternatives considered

- **One "pass/fail" per check without a kind.** Rejected: a reachability pass would read like a configuration proof.
- **Skip checks that cannot be observed.** Rejected: they would vanish from the evidence, and the user would not see the obligations they leave.
- **Run probes continuously after installation.** Out of scope: that is monitoring, the user's operational concern; IQ records one observation.

## Consequences

**Positive**:

- A reviewer sees at a glance which results are fixed facts of the installation, for as long as it is unchanged, and which were observations at one moment.
- Unobservable obligations appear in the pack as open items instead of disappearing.

**Negative**:

- Fewer green results than a naive installer would show.
- A probe that passed at IQ says nothing about tomorrow; operational monitoring remains the user's.

**Trade-off accepted**: a two-kind result model, in exchange for installation evidence that never presents a momentary observation as a fixed fact.

## References

- Behaviours: [15 — Installation checks](../behaviors/15-installation-checks.md), [17 — Evidence pack](../behaviors/17-evidence-pack.md)
- Invariants: [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)
- Risks: [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005), [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)
- Decisions: [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-GX-025](../decisions/025-core-version-range.md)
- Core: [BEH-BR-013](../../core/behaviors/02-host-construction.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
- External: GAMP 5 (second edition), installation qualification.
