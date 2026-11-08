# ADR-CM-002: The catalog carries labels; the application owns the rules

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-002                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): The generic taint floor noted beside the default selector (CCR-CM-002)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

## Context

Consumers of a command catalog have rules about some commands: an agent may
only draft certain writes, some commands need two approvers, some may never be
offered to an agent. These rules differ per product and per jurisdiction. If
the catalog encoded them, Bridger would carry one product's command-bus
semantics; if it carried nothing, every product would invent its own label
and its own place to read it.

## Decision

- **Labels, not rules.** A command carries free `tags` and one boolean
  `regulated`. Both reach the descriptor, the gate request and the hook
  inputs verbatim (BEH-CM-002).
- **One conservative default.** The only behaviour the package attaches to a
  label is that `Toolsets.defaultSelector` leaves out regulated commands
  (BEH-CM-021). Forgetting a selector can never offer a regulated command.
- **One generic floor, not a label rule.** Dispatch never allows a request
  carrying core's taint annotation on an automatic decision (BEH-CM-016,
  [ADR-CM-005](./005-taint-floor-in-dispatch.md)). It reads no label and
  names no command, so it is not a product rule.
- **Decisions belong to the gate and selectors of the application.** The
  package exports no list of regulated commands, no policy and no gate
  implementation (BEH-CM-011). A toolset narrows what is offered and grants
  nothing (BEH-CM-022).

## Alternatives considered

- **No `regulated` label, tags only.** Rejected: without one well-known flag
  the safe default selector is impossible, and every adopter would pick its own
  tag name.
- **A rules engine in the package (levels, approver counts, exclusions).**
  Rejected: that is product semantics; it belongs to the application, which
  wires it as a gate.
- **Exclude regulated commands from dispatch for agent principals.**
  Rejected: the package cannot know which principal is an agent, and "never"
  is a rule some products reverse with approval.

## Consequences

**Positive**:

- Bridger stays domain-free; products express their rules where they are
  reviewed — in their own gate and selectors.

**Negative**:

- With no gate wired, a regulated command offered by a custom selector runs
  without approval when the request is untainted. That is visible in the configuration, as for core's
  unwired `OperationGate`.

**Trade-off accepted**: one label with one safe default, at the cost of
every product writing its own gate, rather than a catalog that decides.

## References

- Behaviours: [01 — Command definition](../behaviors/01-command-definition.md), [02 — Dispatch](../behaviors/02-dispatch.md), [03 — Toolsets](../behaviors/03-toolsets.md)
- Invariants: [INV-CM-005](../invariants.md#inv-cm-005-toolset-membership-grants-nothing)
- Core: [ADR-BR-032](../../core/decisions/032-operation-gate.md) (no default gate), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
- Source: gap analysis of 2026-11-08, §6 ("command bus semantics and regulated-command rules" stay in the application).
