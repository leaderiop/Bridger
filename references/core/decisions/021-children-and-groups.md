# ADR-BR-021: Children and groups are scope-owned plugins

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-021                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

A plugin often needs sub-plugins that exist only while it runs: a module that mounts its own page providers, a connector that installs one worker per configured endpoint. If the parent installs them through the ordinary `Host.install` and tries to remove them in a finalizer, three failures follow. A parent that fails mid-build leaves its children installed. A finalizer that calls `remove` on a child can deadlock against the drain the parent's own removal is waiting on. And nothing in the snapshot says the children belong to anything, so an operator cannot tell an orphan from a deliberate install.

Cordis disposes child plugins with their parent. Applications also want to treat several plugins as one unit (one switch for "the billing module"), which Cordis expresses with loader groups.

## Decision

**Children** are installed with `Plugin.Runtime.install(child, options)`, which requires the parent's activation `Scope`. The child is an ordinary plugin with its own state, requirements, leases and failures, plus four rules:

- Its ID is prefixed with the parent's (`parent/child`) and its snapshot records `parentId`. It installs into the parent's realm and inherits the parent's interceptions unless `options` say otherwise.
- It is removed when the parent's activation scope closes, dependents first and in last-in-first-out order with the parent's other finalizers. Removing, replacing, disabling or restarting the parent therefore removes its children, and the next activation mounts them again.
- A failing child does not fail its parent; the failure is visible in the snapshot. A parent that must not run without a child awaits `handle.awaitActive` and reports the failure itself through `Plugin.Runtime.reportFailure`.
- A child may require services its parent provides. The parent publishes only after its `build` succeeds, so such a child waits until then, and dependents-first removal keeps the parent's services alive for the child's teardown.

**Groups** are `Plugin.group(id, members)`: a plugin that mounts `members` as children and provides nothing. It is removed, disabled, enabled and restarted as one unit, and its handle's `awaitActive` waits for every member. A group is sugar over children, not a second mechanism.

**Audit.** Mounting a child and removing it with its parent are consequences of the parent's activation, not operator decisions. With an `AuditSink` wired they are recorded as `system-start` and `system-stop` records whose target is the child and whose `causationId` is the record that triggered the parent's transition; they are not gated, because approval of a child is approval of the parent's definition ([23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)).

`install` returns a `PluginHandle` (`state`, `changes`, `awaitActive`, `remove`, `restart`) for children and top-level plugins alike. `PluginHandle.restart` has the same error union as `Host.restart`, including `DrainTimeout | WouldDeadlock` and the GxP errors; this corrects SPEC.md, which listed a narrower union for the handle.

## Alternatives considered

- **Children managed by application code through `Host.install` and finalizers.** Rejected for the three failures above: orphans on a failed build, re-entrant drains, and no ownership in the snapshot.
- **A failing child fails its parent.** Rejected: it couples an optional sub-feature to the parent's availability and turns one bad worker into a cascade. The parent opts into that coupling explicitly with `awaitActive`.
- **Unprefixed child IDs.** Rejected: two parents mounting a child with the same local ID would collide (`DuplicatePlugin`), and the ID would not say who owns it.
- **Groups as a separate transactional unit.** Rejected: a group with its own lifecycle machine would duplicate the plugin state machine and its operation table. Mounting members as children of a provider-less plugin reuses both.

## Consequences

**Positive**:

- A parent's teardown removes everything it mounted, in dependency order, with no bookkeeping in the parent.
- Ownership is visible: `parentId` in snapshots and `children` in `inspect`.
- One switch (remove, disable, enable, restart) acts on a whole group through the ordinary legality table ([ADR-BR-013](../decisions/013-total-operation-legality.md)).

**Negative**:

- A child's lifetime is bounded by the parent's activation: restarting the parent restarts every child, even an unaffected one.
- A child's private state does not survive the parent's restart; there is no migration of child state.
- Child mounts are driven by plugin code rather than by an operator call, so they are not in the `Operation` list and are not gated. How a child mount and its scope-driven removal appear in the audit trail is a consequence of the parent's operation and is settled by [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md); this ADR adds no operation.

**Trade-off accepted**: children restart with their parent, at the cost of unnecessary restarts of unaffected children, in exchange for a single ownership rule with no orphans and no re-entrant drains.

## References

- Behaviours: [14 — Children and groups](../behaviors/14-children-and-groups.md), [03 — Installation](../behaviors/03-installation.md), [06 — Removal](../behaviors/06-removal.md)
- Invariants: [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map)
- Requirements: [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)
- Decisions: [ADR-BR-010](../decisions/010-cordis-parity.md), [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)
- Source: `docs/SPEC.md` — "Plugin handles, children and groups"
