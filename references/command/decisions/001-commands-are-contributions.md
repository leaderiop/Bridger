# ADR-CM-001: Commands are registry contributions, not a core primitive

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-001                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

## Context

Products built on Bridger want one path for every state change, shared by the
UI, APIs, jobs and agents. Core deliberately knows nothing about domains
([ADR-BR-027](../../core/decisions/027-core-exclusions.md)) and already says
that a registry must not interpret contributed values: "Bridger MUST NOT
define what a route, command, menu item or handler means" (BEH-BR-162). A
command catalog could be added to core as a new primitive, or assembled in a
companion from the registry, generation, attribution, gate and hook seams.

## Decision

- **A companion, built on core seams.** `@bridger/command` stores handlers in
  a private `ContributionRegistry`, so contribution lifetime, collision,
  removal order, leases and drain are core's (BEH-BR-163–167). Core gains no
  command type and no new `Host` method.
- **A command is a value; a handler is a contribution.** `Command.make` is
  pure; `Command.contribute` registers a handler for a scope and captures the
  contributor's context.
- **One dispatch path in a fixed order**: lookup, decode, attribution, gate,
  before-hooks, handler under a contribution lease with a timeout, encode,
  after-hooks and call-log report (BEH-CM-009). The catalog exposes
  descriptors, never handlers (BEH-CM-004).
- **Dispatch is not a host operation.** It writes no `AuditSink` record and
  does not pass the `OperationGate`; it consults its own optional
  `CommandGate`, an instance of core's generic gate, and reports to core's
  `CallLog` port.

## Alternatives considered

- **Commands in core.** Rejected: it would give core a domain-shaped concept
  and a second gate inside the host, against ADR-BR-027.
- **Commands as events on the bus.** Rejected for the reasons core rejects
  veto by event (ADR-BR-020): plural, prioritised, failure-isolated listeners
  cannot express one handler and one accountable decision.
- **Commands as service keys (one key per command).** Rejected: one provider
  per key (ADR-BR-003) would force an install per command and gives no
  listing; multiplexing belongs in a registry (BEH-BR-168).
- **Dispatch through the host's `OperationGate` and audit trail.** Rejected:
  the audit trail is for host lifecycle operations; mixing domain commands
  into it would change its meaning and its `schemaVersion`.

## Consequences

**Positive**:

- Everything core says about removal under load applies to handlers unchanged.
- MCP, agents and UIs share one catalog and one dispatch path.

**Negative**:

- The "one path" guarantee covers the package only: the handler's author can
  call the handler directly; there is no isolation in one process.
- Applications that need a reliable command log write it themselves, or wire
  a `CallLog` implementation; dispatch is not audited by core.

**Trade-off accepted**: a companion that composes core seams, at the cost of
a guarantee scoped to the package, rather than a core primitive that would
widen the host.

## References

- Behaviours: [01 — Command definition](../behaviors/01-command-definition.md), [02 — Dispatch](../behaviors/02-dispatch.md)
- Invariants: [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch)
- Core: [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [ADR-BR-003](../../core/decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-020](../../core/decisions/020-typed-event-bus.md), [ADR-BR-024](../../core/decisions/024-shared-state-helpers.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)
- Source: gap analysis of 2026-11-08, item 11.
