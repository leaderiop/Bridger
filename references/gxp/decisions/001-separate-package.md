# ADR-GX-001: The companion is a separate package; core never depends on it

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-001                                           |
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

[ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) fixes the scope of `@bridger/gxp`: a trail adapter contract with conformance tests, checks on read, optional trail sealing, approval and electronic-signature capture through the gate, optional value fingerprints and IQ/OQ evidence. It states that the companion depends on `@bridger/core` and that core never depends on it.

Core already exposes every seam the companion needs, as optional ports with no implementation: `AuditSink` ([ADR-BR-030](../../core/decisions/030-audit-sink-port.md)), `OperationGate` ([ADR-BR-032](../../core/decisions/032-operation-gate.md)), `ConfigFingerprinter` ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)), plus the read-only `Host.controls` call of [BEH-BR-013](../../core/behaviors/02-host-construction.md) and the test host of [BEH-BR-177](../../core/behaviors/21-testing-host.md). A host with none of them wired behaves as an unregulated host ([BEH-BR-194](../../core/behaviors/23-audit-sink-and-record.md)).

The question is where the regulated machinery lives: in core behind flags, in core as a sub-path export, or in its own package.

## Decision

- **One package, one direction.** The companion is the package `@bridger/gxp`, source planned at `packages/gxp/src/` *(Planned)*. It imports `@bridger/core` and `effect`; `@bridger/core` imports nothing from it, at runtime or in types. A core build, test run or type check never needs the companion to be present.
- **Runtime dependencies are exactly two.** `dependencies` hold `@bridger/core` (a range of one core minor line, [ADR-GX-025](../decisions/025-core-version-range.md)) and `effect` (the version core pins). Hashing and HMAC use the platform's Web Crypto (`crypto.subtle`), which is not a package dependency. Anything else is a CCR-GX change, measured by NFR-GX-002.
- **Only public core API.** The companion uses only what core exports from its public entry points and its documented testing entry point. It never reaches into core internals, never patches core objects and never relies on undocumented record fields. Every core identifier the companion relies on is listed in `appendices/core-interface-map.md`.
- **Plugs in as a consumer would.** Each companion part is a `Layer` that provides one of core's ports (`trailSink` provides `AuditSink`, `approvalGate` provides `OperationGate`, `hmacFingerprinter` provides `ConfigFingerprinter`) or a function over stored data. A consumer wires them like any port they wrote themselves; core cannot tell the difference.
- **Coupling is recorded, not implicit.** A core change that alters any interface listed in the core-interface map needs a CCR-GX cross-reference, and a companion change that needs a core change needs a CCR-BR cross-reference (PROC-GX-03).

## Alternatives considered

- **Regulated features inside core behind options.** Rejected: core would carry key handling, signature capture and storage contracts that most users never wire, and the claims lint of core would have to tolerate wording that belongs only to the companion. It would also tie every core release to the companion's review cycle.
- **A sub-path export of `@bridger/core` (`@bridger/core/gxp`).** Rejected: one version number for two review cycles, and a reader of the core package could not tell which code is under the stricter companion process.
- **Several companion packages (trail, approvals, evidence).** Deferred: the parts share the canonical form ([ADR-GX-005](../decisions/005-jcs-and-sha256.md)), the testing entry point and the evidence format. Splitting now would multiply version pins without a user who needs only one part. A later CCR-GX may split the package if one appears.

## Consequences

**Positive**:

- Core's behaviour, tests and claims are unchanged by anything specified here; a core user who never installs the companion pays nothing.
- The companion's reliance on core is explicit and checkable: one map, one version range, public API only.
- A regulated user can review the companion as a unit with its own specification, risks and evidence.

**Negative**:

- Two packages to version and release together; a core release can break the companion, which the version range and the compatibility matrix exist to catch.
- Anything the companion needs from core has to go through a core CCR first, as `ConfigFingerprinter` and `Host.controls` did (CCR-BR-014).

**Trade-off accepted**: a second package and an explicit coupling procedure, in exchange for a core that stays small and a companion whose stricter process covers exactly its own code.

## References

- Behaviours: [01 — Companion boundary](../behaviors/01-companion-boundary.md)
- Invariants: [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
- Risks: [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
- Decisions: [ADR-GX-002](../decisions/002-own-tree-and-gx-series.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-025](../decisions/025-core-version-range.md)
- Core: [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [BEH-BR-177](../../core/behaviors/21-testing-host.md), [BEH-BR-013](../../core/behaviors/02-host-construction.md), [BEH-BR-194](../../core/behaviors/23-audit-sink-and-record.md)
