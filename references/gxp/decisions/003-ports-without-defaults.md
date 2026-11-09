# ADR-GX-003: Every store, identity, signature and key is a caller-supplied port with no default

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-003                                           |
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

The companion's parts each depend on something only the regulated user can provide: a store for the trail, a store for anchors kept apart from it, a store for approval tickets, a way to capture a signature from a re-authenticated person, and keys for fingerprints. A library default for any of these would decide, on the user's behalf, where records live, who a person is or which key protects a value. Core takes the same line for its own ports: no default sink, gate or fingerprinter ([ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)), and its fixtures exist only in the testing entry point ([BEH-BR-181](../../core/behaviors/21-testing-host.md), [BEH-BR-182](../../core/behaviors/21-testing-host.md)).

A default that "just works" in development is the commonest way a test double reaches production (RSK-GX-017).

## Decision

- **Ports, all required.** The decision and custody ports are `TrailStore`, `AnchorStore`, `TicketStore`, `SignatureCapture`, `FingerprintKeyProvider`, plus the `ApprovalPolicy` the caller writes as data. `GxpLayer.make({...})` takes each port the selected parts need as a required field; the type has no optional port field and the function no fallback.
- **No default, not even a no-op.** The main entry point exports no implementation of any of these ports: no in-memory store, no "allow all" policy, no signature capture that returns a fixed signer, no key derived from a constant.
- **Fixtures only from the testing entry point.** In-memory and scripted implementations live in `packages/gxp/src/testing/` *(Planned)* and are reachable only through `@bridger/gxp/testing`. Each carries a fixture marker that the installation checks refuse ([ADR-GX-024](../decisions/024-fixtures-are-marked.md)). `scriptedSignatureCapture(decide)` requires `decide`; it has no implicit decision, mirroring core's scripted gate.
- **Fail closed.** Every port failure on a decision path (gate, signature, ticket consume, fingerprint, key lookup) is a refusal or a failed call, never an allow and never a skipped check ([INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)). A store failure on the write path is reported to core, which fails closed and latches ([ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)).
- **Pure functions need no port.** Checks on read, seal verification, canonicalisation and binding digests are pure functions over data the caller passes; they need no port and have none.

## Alternatives considered

- **Ship in-memory defaults with a warning.** Rejected: a warning is a log line, and a log line does not stop a deployment. The marker plus IQ refusal is a check that can fail.
- **A "development mode" flag that enables defaults.** Rejected: a flag is one configuration value away from production.
- **Defaults for low-risk ports only (for example the anchor store).** Rejected: the anchor store's value is entirely its separate custody ([ADR-GX-008](../decisions/008-high-water-anchors.md)); a default would sit beside the trail and detect nothing.

## Consequences

**Positive**:

- Every custody and identity decision is visibly the user's, in code they wrote and can review.
- A fixture in production is detectable by IQ, not merely discouraged.

**Negative**:

- More wiring before a first run; a user must write or choose an adapter for every port the parts they use need.
- The companion cannot offer a working example without the testing entry point; examples import from `@bridger/gxp/testing` and say so.

**Trade-off accepted**: a heavier first setup, in exchange for no path on which a library default decides custody, identity or keys.

## References

- Behaviours: [01 — Companion boundary](../behaviors/01-companion-boundary.md), [19 — Testing entry point](../behaviors/19-testing-entry-point.md)
- Invariants: [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)
- Risks: [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
- Decisions: [ADR-GX-008](../decisions/008-high-water-anchors.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md)
- Core: [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [BEH-BR-181](../../core/behaviors/21-testing-host.md), [BEH-BR-182](../../core/behaviors/21-testing-host.md)
