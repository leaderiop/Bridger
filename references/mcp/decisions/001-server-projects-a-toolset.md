# ADR-MC-001: The MCP server projects a command toolset; it keeps no tool registry of its own

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-ADR-001                                           |
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

An MCP server must list tools in a deterministic order, notify clients when
the list changes and execute calls. A host already has a command catalog with
toolsets per principal, a dispatch path through the gate and hook points, and
generation-based publication ([`@bridger/command`](../../command/README.md)).
A second tool table in the MCP package would be a second path to handlers.

## Decision

- **The server is an ordinary plugin** whose sessions end when its activation
  scope drains (BEH-MC-001).
- **Each session has one principal**, resolved by an application port; no
  permissive default resolver is shipped; Bridger does not authenticate
  (BEH-MC-002).
- **`tools/list` is the session principal's toolset**, in toolset order, with
  cursors bound to the toolset revision; a stale cursor fails with -32602 and
  the client re-lists (BEH-MC-003).
- **`tools/call` is one `Commands.dispatch`** with the session's toolset and
  context; outcomes map one way to results and errors (BEH-MC-004,
  BEH-MC-005). Tools only: no resources or prompts until they can be
  specified as catalog projections (BEH-MC-006).

## Alternatives considered

- **A tool registry in the MCP package.** Rejected: a second path to
  handlers, outside the gate's single dispatch path.
- **Annotations derived from tags.** Rejected: MCP calls annotations
  untrusted hints; deriving `readOnlyHint` from a label would turn a label
  into a safety claim.
- **Restart pagination silently on revision change.** Rejected: a client could
  merge pages of two lists.

## Consequences

**Positive**:

- One order, one gate and one call log for UI, agent and MCP callers.

**Negative**:

- MCP features with no catalog projection (resources, prompts) are not
  served in this version.

**Trade-off accepted**: a narrower MCP surface in exchange for no second path
to handlers.

## References

- Behaviours: [01 — Server](../behaviors/01-server.md), [02 — List-changed notifications](../behaviors/02-list-changed.md)
- Invariants: [INV-MC-001](../invariants.md#inv-mc-001-toolslist-order-is-the-toolset-order), [INV-MC-005](../invariants.md#inv-mc-005-every-toolscall-is-a-command-dispatch)
- Companion: [`@bridger/command` toolsets](../../command/behaviors/03-toolsets.md), [dispatch](../../command/behaviors/02-dispatch.md)
