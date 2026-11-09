# ADR-GX-025: A core minor-line range and a compatibility matrix

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-025                                           |
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

The companion relies on specific core behaviour: the `AuditRecord` fields and `schemaVersion` ([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)), the writer's retry and latch ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md)), the gate's request and timeout ([BEH-BR-219](../../core/behaviors/25-operation-gate.md), [BEH-BR-221](../../core/behaviors/25-operation-gate.md)), step 4a and the fingerprinter's checks ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)), `Host.controls` and `CloseReport.auditLastSeq`, and the test host ([BEH-BR-177](../../core/behaviors/21-testing-host.md)). A caret range (`^1.2.0`) would admit a core minor release that changes any of these in a way core considers compatible but the companion's evidence does not cover (RSK-GX-019). A regulated user also needs to know which pairs of versions were tested together.

## Decision

- **One core minor line.** `@bridger/core` and `effect` are the companion's only runtime dependencies, both peer dependencies. The `@bridger/core` peer range is one core minor line, written `>=X.Y.Z <X.(Y+1).0`, equal to the range in the compatibility matrix; no caret, tilde, `x` or open bound, and no widening to another minor line without a CCR-GX that records the core revisions re-checked ([BEH-GX-001](../behaviors/01-companion-boundary.md)).
- **The compatibility matrix.** `appendices/core-interface-map.md` holds, for each companion release, the core versions it was tested against, the revision of each core document it relies on, and every core identifier it cites (BEH-BR, ADR-BR, INV-BR, RSK-BR, REQ-BR). Check 14 fails if a cited `*-BR-nnn` is missing from the map ([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)).
- **A pair is added only by evidence.** A core version is listed in the compatibility matrix only after the companion's full test suite, including conformance and the cross-tree requirement tags, has run against it and produced an evidence pack ([ADR-GX-022](../decisions/022-evidence-pack-format.md)). The matrix row cites the pack digest.
- **Checked at runtime and at IQ.** `GxpLayer.make` reads the version `@bridger/core` exports and fails construction with `GxpCoreVersionUnsupported { found, supported }` if it is outside the peer range. IQ-09 passes only for a core version listed in the compiled compatibility row and records the version pair as a proof ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)).
- **`schemaVersion` is pinned too.** The companion lists the `AuditRecord.schemaVersion`s it understands. The sink refuses a record with any other version with `AuditWriteFailed`, without calling `append`, so core latches instead of filling the store with records the checks cannot read; checks on read report such records as `unknownSchemaVersion` ([ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)).
- **Coupled changes.** A core CCR touching any interface in the map carries a CCR-GX cross-reference, and a companion change requiring a core change carries a CCR-BR cross-reference (PROC-GX-03).

## Alternatives considered

- **Semver caret range.** Rejected: core's notion of compatible is about its API, not about the companion's evidence.
- **Pin exact core versions only.** Rejected: it would force a companion release for every core patch, which changes no BEH-BR requirement under core's change control; each tested version is still listed individually in the matrix.
- **Detect drift by feature tests at runtime.** Rejected: runtime probing cannot establish what the tests established.

## Consequences

**Positive**:

- An installation builds only within the tested core minor line, IQ fails on a core version the matrix does not list, and the matrix says which pack shows it.
- A `schemaVersion` change in core cannot silently fill a trail with records the checks do not understand.

**Negative**:

- Every core release, even a patch, needs a companion test run and a matrix entry before an installation using it passes IQ.
- Package managers may warn about the narrow peer range; that is intended friction.

**Trade-off accepted**: slower uptake of core releases, in exchange for never passing IQ on a version pair that has no evidence.

## References

- Behaviours: [01 — Companion boundary](../behaviors/01-companion-boundary.md), [15 — Installation checks](../behaviors/15-installation-checks.md)
- Risks: [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
- Decisions: [ADR-GX-001](../decisions/001-separate-package.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
- Core: [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [BEH-BR-177](../../core/behaviors/21-testing-host.md), [BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-205](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-219](../../core/behaviors/25-operation-gate.md), [BEH-BR-221](../../core/behaviors/25-operation-gate.md)
- Appendix: [Core interface map](../appendices/core-interface-map.md)
