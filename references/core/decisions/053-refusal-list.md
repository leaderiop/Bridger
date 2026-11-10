# ADR-BR-053: A refusal list consulted on every start

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-053                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-014, ADR-BR-017, ADR-BR-029, ADR-BR-030, ADR-BR-032 and ADR-BR-043 |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-10): Status names the ADRs this one amends (ADR-BR-014, ADR-BR-017, ADR-BR-029, ADR-BR-030, ADR-BR-032 and ADR-BR-043), pairing their "amended by" (C22) (CCR-BR-034)<br>0.1 (2026-11-08): Initial draft (CCR-BR-026)                 |

---

## Context

A revocation companion (the loader's kill switch) can refuse, through the `OperationGate`, every operator call that would start a plugin of a revoked digest. System transitions are never gated ([ADR-BR-032](./032-operation-gate.md)), so an installed plugin of that digest still starts again when its dependencies return, when a lazy trigger applies, when a background fiber restarts or when its parent mounts it again (URS gap G60; Bridger recheck 2026-11-08, item K4). Gating system transitions would put an approval in the middle of transitions that were already decided, and a refusal there could only leave the host half-way.

## Decision

- **`RefusalList` port.** Optional, read once at construction. `refused({ id, realm, version?, digest })` is synchronous and pure and returns `Option<string>`. Only definitions that declare a digest are submitted.
- **Consulted on every start**: each move into `starting`, whatever its cause; each background restart; each child mount; and, for operator calls, at a new step 4b of the call order, before the gate.
- **Operator calls** refused at step 4b fail with `OperationRejected` ("refused-digest: …") and write one `rejected` record; the gate is not asked. No error union changes.
- **System starts** refused land the plugin in `disabled` with reason `refused-digest` in the same revision; no code is loaded or built; one `start-refused` system record is written, caused as the refused start would have been. A refused background restart stops the plugin into that state. A refused mount fails with `ChildNotAllowed`.
- **Running activations are not stopped by the list.** A `disable` or `remove` stops them; the list keeps them from starting again.
- **Totality.** A throwing or malformed answer refuses with "policy-defect".
- **No implementation shipped** beyond a test fixture.
- This **amends ADR-BR-032** in one respect: a refusal of an operator call can come from the list as well as from the gate, recorded the same way.

## Alternatives considered

- **Gate system transitions.** Rejected: a gate consulted in the middle of a cascade it already approved can only leave the host half-way (BEH-BR-223).
- **Revocation always disables or removes.** Kept as the way to stop what runs, but on its own it leaves an operator `enable`, a `replace` with the same digest or a parent's remount able to start the code again.
- **Land a refused start in `failed`.** Rejected: failure is sticky and means code ran and failed ([ADR-BR-005](./005-failure-is-sticky.md)); refused code never ran.
- **Stop running plugins when the list changes.** Rejected: a pure lookup would become a mutating operation with no caller, reason or drain decision.

## Consequences

**Positive**:

- A revoked digest cannot start again through any route the host takes, and each refusal is in the trail.
- Unwired, nothing changes.

**Negative**:

- One lookup per start; the list must answer without I/O.
- A plugin running when its digest is revoked keeps running until a `disable` or `remove` ([RSK-BR-061](../gxp/03-risk-assessment.md#rsk-br-061)).
- A definition without a digest is never refused.

**Trade-off accepted**: a small synchronous port and a new disabled reason, in exchange for revocation that holds across system starts.

## References

- Behaviours: [28 — Plugin principal and mandatory policy](../behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-267), [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-188, BEH-BR-190), [25 — Operation gate](../behaviors/25-operation-gate.md), [05 — Activation](../behaviors/05-activation.md), [08 — Operation legality](../behaviors/08-operation-legality.md)
- Invariants: [INV-BR-050](../invariants.md#inv-br-050-a-refused-digest-never-enters-starting)
- Requirements: [URS-BR-053](../urs.md#urs-br-053-keep-a-revoked-plugin-version-from-running-again-whatever-starts-it)
- Risks: [RSK-BR-061](../gxp/03-risk-assessment.md#rsk-br-061), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)
- Decisions: [ADR-BR-005](./005-failure-is-sticky.md), [ADR-BR-032](./032-operation-gate.md), [ADR-BR-043](./043-plugin-principal-and-mandatory-policy.md)
