# ADR-AG-002: TaskSnapshot is a state feed; bridges map, never extend

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-ADR-002                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

## Context

People and tools watch agents: an activity panel, a terminal multiplexer such
as herdr (which exposes blocked, working, done and idle over a socket, with
`herdr wait`), MCP clients through the tasks extension. Each has its own state
vocabulary. If each bridge added states, the meaning of a task would depend on
who was watching.

## Decision

- **One discriminated union** — queued, working, needs-input,
  awaiting-approval, stale, done, failed, cancelled — with a transition table,
  sticky terminal states and a revision that increases by one per transition
  (BEH-AG-009, BEH-AG-010).
- **A state feed, not a log**: `Tasks.changes`, `list`, `await`, `cancel`
  (BEH-AG-011), with `awaiting-approval` tied to a gate `Defer` and `stale`
  to a stale draft (BEH-AG-012).
- **Bridges map and add nothing**: herdr gets a fixed many-to-one mapping
  and its protocol stays herdr's (BEH-AG-013); MCP tasks get a fixed mapping
  and approval through MCP task input is refused (BEH-AG-014).

## Alternatives considered

- **Per-bridge states.** Rejected: observers would disagree about a task.
- **An event log of task changes.** Rejected for this package: a slow
  observer needs the latest state, not every step; a log is the application's
  if it needs one.

## Consequences

**Positive**:

- Every observer sees the same task; terminal states never resume.

**Negative**:

- Bridges lose detail (a failed task shows as herdr `done`).

**Trade-off accepted**: one vocabulary with lossy bridges, rather than
bridges that redefine it.

## References

- Behaviours: [02 — Tasks](../behaviors/02-tasks.md), [04 — Subagents](../behaviors/04-subagents.md)
- Invariants: [INV-AG-004](../invariants.md#inv-ag-004-task-terminal-states-are-sticky-and-revisions-never-regress)
- Core: [ADR-BR-014](../../core/decisions/014-discriminated-plugin-snapshot.md), [ADR-BR-007](../../core/decisions/007-observation-primitives.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
- Companion: [`@bridger/mcp`](../../mcp/README.md)
