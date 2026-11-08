# ADR-AG-004: A subagent is an ephemeral realm and a narrowed actor, never wider

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-ADR-004                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-AG-001)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

## Context

An agent delegates parts of a task to subagents with fewer tools, a smaller
budget and a shorter life. Delegation must not become a way around the
parent's toolset, budget or attribution. Core file 33 adds `Realm.ephemeral`
(a realm created for a bounded job and closed with lease drain) and
`Actor.narrow`.

## Decision

- **`spawnSubagent` creates an ephemeral realm** bound to the parent turn,
  closed with lease drain when the subagent ends (BEH-AG-025).
- **The subagent acts as `Actor.narrow` of the parent actor** (BEH-AG-026).
- **Its toolset is a subset of the parent's pinned toolset**, empty by
  default (BEH-AG-027); **its budget is carved from the parent's
  reservation** (BEH-AG-028).
- **Taint flows both ways** (BEH-AG-029); subagent tasks appear under the
  parent in the feed (BEH-AG-030).
- **The realm is not isolation.** Subagent code runs in the same process;
  realms change resolution only (ADR-BR-019).

## Alternatives considered

- **Subagents as separate hosts or processes.** Possible for an application
  through `@bridger/remote`; not the default, since most subagents are the same
  trusted loop with a narrower view.
- **Subagents sharing the parent realm.** Rejected: their providers (a
  narrowed tool runner) would collide with the parent's (one provider per key
  per realm).

## Consequences

**Positive**:

- Delegation narrows by construction and cleans up through core's drain.

**Negative**:

- Depends on [core file 33](../../core/behaviors/33-realm-families.md) semantics not yet settled.

**Trade-off accepted**: same-process subagents with narrowing, stated plainly
as not isolated.

## References

- Behaviours: [04 — Subagents](../behaviors/04-subagents.md)
- Invariants: [INV-AG-003](../invariants.md#inv-ag-003-a-subagent-is-never-wider-than-its-parent)
- Core: [33 — Realm families](../../core/behaviors/33-realm-families.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
- Companion: [entitlement](../../entitlement/README.md)
