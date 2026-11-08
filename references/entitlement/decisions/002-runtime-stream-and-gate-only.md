# ADR-EN-002: Entitlement reaches plugins through Plugin.Runtime.entitled and host operations only through the gate

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-ADR-002 |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record |
> | Change History | 0.4 (2026-11-08): Round 2: recheck item 16 — grant narrowing through core `CapabilityPolicy` named as separate from the gate (ADR-EN-004) (CCR-EN-003)<br>0.3 (2026-11-08): Gate consulted for `install` and optionally `replace`; core's `unmetered` mode; seam specified in core (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

## Context

Entitlement has to reach two places: the host, before it grants a plugin
something, and the plugin, while it runs. For the host, core already has one
seam that every operator mutation passes through and that cannot be bypassed
through the `Host` it guards: the gate
([ADR-BR-032](../../core/decisions/032-operation-gate.md)), generalised by
core into `Gate<Req>` with composition (`Gate.all`, BEH-BR-321)
([32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)).
For the plugin, the question is how it reads *its own* entitlement without
being able to read, or claim, another's.

## Decision

- **Host operations: the gate only.** The entitlement gate is a gate piece,
  consulted for `install`, and for `replace` when the application states
  `onReplace: "consult"`, and allowing everything else — `enable` and the
  recovery operations included
  ([02](../behaviors/02-gate-and-runtime.md), BEH-EN-009–012). It never
  defers and is composed with the application's other gate pieces. No other
  host operation consults entitlement. Separately, an application may wire
  `Entitlement.capabilityPolicy`, which narrows a lapsed plugin's grants
  through core's `CapabilityPolicy` without refusing a capture or changing
  any state ([ADR-EN-004](./004-a-lapse-narrows-capability-grants.md)); it is
  a resolution policy, not a gate.
- **Plugins: `Plugin.Runtime.entitled`.** A latest-wins stream on the
  per-activation `Plugin.Runtime`, fed by an optional core port
  (`@bridger/core/EntitlementView`) read with `Effect.serviceOption`. Unwired,
  it emits one state with core's own mode `"unmetered"` (BEH-EN-013; core
  BEH-BR-089, CCR-BR-022). This is a small,
  domain-free core seam, specified in core under CCR-BR-020 and not made by
  this package.
- **No audit records of its own.** A refusal reaches the trail as core's
  `rejected` record; mode changes are diagnostics (BEH-EN-008).

## Alternatives considered

- **A package service keyed by `CurrentPlugin`**
  ([28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)).
  Kept as the fallback (Open (1) of 02 — Gate and runtime): it needs no core change but
  makes every plugin that wants its mode depend on this package.
- **Entitlement checks inside `Host.use`.** Rejected as a refusal: would make
  every resolution a policy decision with no record. Core's
  `CapabilityPolicy` later gave a recorded, state-preserving form (grants and
  the call log, core 29), which ADR-EN-004 uses to narrow, never to refuse.
- **A wrapper around `Host`.** Rejected for the reason core gives for the gate:
  bypassable through the raw host.

## Consequences

**Positive**:

- One path for host decisions, already recorded by core; one per-activation
  stream for plugins, bound to the identity the host assigned.

**Negative**:

- Core gains an optional port and a `Plugin.Runtime` member for a concern it
  otherwise knows nothing about.
- The stream reports a mode; enforcing it remains the plugin's.

**Trade-off accepted**: a small core seam, at the cost of one more optional
port in core, rather than coupling every plugin to this package.

## References

- Behaviours: [02 — Gate and runtime](../behaviors/02-gate-and-runtime.md)
- Core: [25 — Operation gate](../../core/behaviors/25-operation-gate.md), [10 — Runtime failure and health](../../core/behaviors/10-runtime-failure-and-health.md)
- Invariants: [INV-EN-001](../invariants.md#inv-en-001-taking-a-plugin-away-is-never-refused-for-entitlement), [INV-BR-026](../../core/invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)
- Decisions: [ADR-BR-007](../../core/decisions/007-observation-primitives.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
