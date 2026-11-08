# ADR-EN-001: Entitlement changes a plugin's mode, never its lifecycle state

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-ADR-001 |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record |
> | Change History | 0.2 (2026-11-08): Round 2: recheck item 16 — the rejected interception alternative is distinguished from grant narrowing (ADR-EN-004) (CCR-EN-003)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

## Context

A plugin whose entitlement lapses — a subscription ended, a trial expired, a
token could not be renewed offline — must do less. The obvious mechanism is
the host's own: disable or remove the plugin when the lapse is detected. That
mechanism is wrong in three ways. It interrupts calls in flight at a moment
nobody chose, defeating the lease and drain guarantees of core
([ADR-BR-015](../../core/decisions/015-leases-one-primitive.md)). It makes a
plugin-set change that no operator decided, so the trail shows a system
removal with no accountable call behind it
([ADR-BR-029](../../core/decisions/029-attributable-mutations.md)). And it
stops everything the plugin does, including work the system owes whatever was
paid — the generic form of "a lapsed licence never blocks a legal duty".

## Decision

- Entitlement is expressed as a **mode** — `full`, `grace`, `read-only`,
  `none` — not as a lifecycle state. No mode causes the package to call a
  host operation, `reportFailure`, or to interrupt anything
  ([01](../behaviors/01-entitlement-port.md), BEH-EN-003;
  [02](../behaviors/02-gate-and-runtime.md), BEH-EN-015).
- A running plugin learns its mode and adapts itself (read-only); helpers make
  the common case one call but cannot force it (BEH-EN-014).
- Operations that take a plugin away or recover it are never refused for
  entitlement (BEH-EN-012); only granting operations are gated (BEH-EN-009).
- The application names **essential** uses with opaque labels; no component
  of the package refuses them (BEH-EN-007, BEH-EN-020).
- Expiry is derived from `Clock`; unavailability never raises a mode, and the
  policy for it has no default (BEH-EN-004, BEH-EN-005).
- An application that wants lapsed plugins removed does it through its own
  `reconcile`, gated and audited by core.

## Alternatives considered

- **Disable on lapse.** Rejected: unattributed plugin-set changes, interrupted
  work, and essential work stopped.
- **A boolean entitled / not entitled.** Rejected: hides the grace period from
  the plugin and the user, and conflates "read-only" with "nothing".
- **Enforce read-only by intercepting services.** Rejected for in-process
  code as an isolation claim: interceptions change resolution only and are
  not isolation
  ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md));
  code that must be stopped from writing runs out of process. Revision 0.2
  adds, without that claim, the narrowing of a lapsed plugin's grants through
  core's `CapabilityPolicy.changes`
  ([ADR-EN-004](./004-a-lapse-narrows-capability-grants.md)): it changes no
  state and is stated as narrowing, not enforcement.

## Consequences

**Positive**:

- A lapse never breaks a call in flight and never produces an unexplained
  removal.
- Essential work is protected by one rule in one package.

**Negative**:

- A plugin that ignores its mode keeps working fully; the package can count
  refusals of `guard` but cannot prevent a bypass.
- Applications must decide and document which uses are essential.

**Trade-off accepted**: cooperative read-only for in-process plugins — for
what they serve, and, beyond the services they captured (ADR-EN-004), for
what they call — at the cost of trusting plugin code to honour it, rather than a host-driven stop that
breaks the lease guarantees and the record.

## References

- Behaviours: [01 — Entitlement port](../behaviors/01-entitlement-port.md), [02 — Gate and runtime](../behaviors/02-gate-and-runtime.md), [03 — Budgets](../behaviors/03-budgets.md)
- Invariants: [INV-EN-001](../invariants.md#inv-en-001-taking-a-plugin-away-is-never-refused-for-entitlement), [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself), [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
- Decisions: [ADR-BR-005](../../core/decisions/005-failure-is-sticky.md), [ADR-BR-015](../../core/decisions/015-leases-one-primitive.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-029](../../core/decisions/029-attributable-mutations.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
