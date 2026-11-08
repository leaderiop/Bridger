# ADR-MC-003: Host self-service is plan-first; applying a plan is a separate regulated command behind both gates

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-ADR-003                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

## Context

An agent that can read the host's state and propose a plugin set is useful to
operators ("why is this plugin waiting?", "install the missing provider").
An agent that can change the plugin set unaided is a self-modifying system.
Core offers `snapshot`, `inspect`, `reconcile` and — in core file 32 — a
read-only `Host.plan`, applied with `reconcile(desired, { expect: plan })`
or not at all (`PlanStale`).

## Decision

- **Host tools are commands contributed by one plugin** (BEH-MC-025):
  `bridger.host.snapshot` and `bridger.host.inspect` pass core's values
  through, which carry no configuration values (BEH-MC-026, BEH-MC-027).
- **`bridger.host.reconcile-plan` changes nothing** and returns core's plan;
  it defaults to `prune: false` in its own ownership scope (BEH-MC-028).
- **`bridger.host.reconcile-apply` exists only when installed with
  `apply: true`**, is always `regulated`, passes the command gate, fails with
  core's `PlanStale` if the host no longer matches the plan, and then each entry action passes
  the host's `OperationGate` and audit as any operator reconcile
  (BEH-MC-029).
- Host tools write nothing core does not already write (BEH-MC-030).

## Alternatives considered

- **One `reconcile` tool with a `plan` flag.** Rejected: one tool could not be
  offered for planning and withheld for applying; the default selector could
  not keep apply out.
- **Apply gated by the command gate only.** Rejected: lifecycle changes keep
  their per-entry `OperationGate` and audit records whatever route reached
  them (BEH-BR-158, BEH-BR-222).

## Consequences

**Positive**:

- An agent proposes, a person approves, the host records each change as for
  an operator.

**Negative**:

- Two gates to configure; a deployment that wires one gets only that one's
  protection, visibly.

**Trade-off accepted**: plan-first with a separate, regulated apply, at the
cost of more configuration.

## References

- Behaviours: [04 — Host tools](../behaviors/04-host-tools.md)
- Invariants: [INV-MC-004](../invariants.md#inv-mc-004-host-tools-never-return-configuration-values)
- Core: [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [18 — Reconciliation and confluence](../../core/behaviors/18-reconciliation-and-confluence.md), [25 — Operation gate](../../core/behaviors/25-operation-gate.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
