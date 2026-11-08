# ADR-CM-003: A toolset is a generation per principal, pinned per turn

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-ADR-003                                           |
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

An agent turn shows a model a list of tools and then executes the model's
choices, possibly seconds or minutes later. Plugins may be installed, removed
or replaced meanwhile. If the list changed under the turn, the model could
choose a tool that is gone, or — worse — one whose id now names a different
definition. MCP clients also need a list in a deterministic order, and a
notification when it changes.

## Decision

- **A toolset is an immutable value** built from one catalog view by a
  selector, ordered by command id, with a fingerprint over the tools'
  digests (BEH-CM-017, BEH-CM-020).
- **Published per principal as a core `Generation`**, republished only when
  the fingerprint changes; retired toolsets drain as their pins end, never
  by force (BEH-CM-018).
- **Pinned per turn by a generation lease** (BEH-CM-019). A pinned dispatch
  checks membership and the descriptor digest; a changed definition fails
  with `ToolChanged` and a removed one with `CommandNotFound`. The pin does
  not hold contributions; the handler is held only while it runs.

## Alternatives considered

- **Compute the list on every request.** Rejected: a turn could see two lists,
  and no revision would tell an MCP client what changed.
- **Pin holds every contribution of the toolset.** Rejected: a long turn
  would block removal of every plugin it might call.
- **Order by registry priority.** Rejected: priority is author-chosen and
  carries no meaning for commands; id order needs no tie-break.

## Consequences

**Positive**:

- What a model was shown is what can run, or the call fails with a typed
  error; prompt tool blocks are byte-stable across turns.
- MCP list-changed notifications follow from generation publications.

**Negative**:

- A tool removed mid-turn fails rather than being silently replaced; agent
  loops must handle `CommandNotFound` and `ToolChanged`.
- One generation per (principal, selector) costs memory for hosts with many
  principals; generations are released when unreferenced.

**Trade-off accepted**: stability per turn and typed failure on change, at
the cost of failed calls when plugins change during a turn.

## References

- Behaviours: [03 — Toolsets](../behaviors/03-toolsets.md), [02 — Dispatch](../behaviors/02-dispatch.md)
- Invariants: [INV-CM-002](../invariants.md#inv-cm-002-a-toolsets-order-depends-only-on-its-contents), [INV-CM-003](../invariants.md#inv-cm-003-a-pinned-tool-never-runs-a-different-definition)
- Core: [20 — Generation](../../core/behaviors/20-generation.md), [ADR-BR-024](../../core/decisions/024-shared-state-helpers.md)
- Consumers: [`@bridger/mcp`](../../mcp/README.md), [`@bridger/agent`](../../agent/README.md)
