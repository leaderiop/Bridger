# 04 — Subagents

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-04                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-10): Round 2 findings of the specification audit of 2026-11-09 — installs run under the parent's context as core `Realm.ephemeral` specifies, the subagent acts with `EphemeralRealm.context`, and `SubagentError` uses core's error unions (BEH-AG-025, BEH-AG-026, P21); the loop is started with `StartRequest.spawn` carrying the restricted toolset, taint and parent task (BEH-AG-025, 027, 029, H10); gate exemption question settled by the loader's wiring (P23) (CCR-AG-005)<br>0.2 (2026-11-08): Parent relation via `Actor.narrow` (BEH-BR-337), not `onBehalfOf`; `SubagentParentUnattributed`; error classes declared (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

An agent often delegates part of a task to a subagent with a smaller toolset,
a smaller budget and a different model. The subagent's plugins (its adapter,
its loop) must exist only while it runs and must be cleaned up when it ends,
and it must never be able to do more than its parent. This file builds a
subagent from two core seams — `Realm.ephemeral`, a realm created for a scope
and removed with lease drain when the scope closes, and `Actor.narrow`, a
derived principal that can only be narrower than its parent
([core file 33](../../core/behaviors/33-realm-families.md)) — and fixes the
narrowing rules for tools, budget and taint. This file owns BEH-AG-025–032 and
uses BEH-AG-025–030; 031 and 032 are reserved.

> **A realm is not a boundary.** The subagent's realm changes resolution only
> ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md),
> [BEH-BR-150](../../core/behaviors/17-realms-and-interception.md)). Code in it
> runs in the same process with the same reach as any in-process plugin. What
> keeps a subagent narrower is that its effects go through dispatch with a
> narrowed actor and a narrowed toolset, checked by the gate — not the realm.

Planned source: `packages/agent/src/Subagent.ts` *(Planned)*.

## BEH-AG-025: spawnSubagent creates an ephemeral realm bound to the parent turn

> **Invariant:** [INV-AG-003](../invariants.md#inv-ag-003-a-subagent-is-never-wider-than-its-parent)
> **See:** [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md)
> **Core seam:** [33 — Realm families](../../core/behaviors/33-realm-families.md)

```ts
// illustrative — not type-checked
Agent.spawnSubagent(request: {
  readonly parent: { readonly taskId: string; readonly toolset: PinnedToolset; readonly context: OperationContext }
  readonly plugins: ReadonlyArray<Plugin.Any>      // e.g. a ModelAdapter and an AgentLoop for the subagent
  readonly tools?: ReadonlyArray<string>           // requested subset of the parent's pinned toolset; default: none
  readonly budget?: BudgetShare                    // entitlement companion's sub-reservation request
  readonly input: string
}): Effect.Effect<SubagentHandle, SubagentError, Scope.Scope>

interface SubagentHandle {
  readonly taskId: string                          // a Tasks entry of its own (02)
  readonly result: Effect.Effect<SubagentResult, SubagentFailed>
}

class SubagentFailed extends Schema.TaggedError<SubagentFailed>()("SubagentFailed", {
  taskId: Schema.String,
  reason: Schema.Literals(["parent-ended", "failed", "cancelled"])
}) {}
class SubagentToolNotInParent extends Schema.TaggedError<SubagentToolNotInParent>()("SubagentToolNotInParent", {
  tool: Schema.String
}) {}
class SubagentParentUnattributed extends Schema.TaggedError<SubagentParentUnattributed>()("SubagentParentUnattributed", {
  actorKind: Schema.String                         // the parent actor's kind ("unattributed", "system")
}) {}

type SubagentError =
  | SubagentToolNotInParent | SubagentParentUnattributed
  | InvalidRealm | DuplicateRealm | FamilyMemberUnavailable          // core Realm.ephemeral (BEH-BR-336)
  | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
  | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout   // core EphemeralRealm.use (BEH-BR-336)
  | ResolutionRefused | AgentStartError                               // the subagent loop's start (01, BEH-AG-003)
  | BudgetExhausted | BudgetUnavailable                               // entitlement companion
```

```
REQUIREMENT: `spawnSubagent` MUST create the subagent's realm with
             `Realm.ephemeral` in the caller's scope and install
             `plugins` into it. When the scope closes — the parent turn
             ends, the parent task is cancelled, or the subagent ends — the
             realm MUST be removed under core's drain rules: dependents
             first, leases drained up to the drain bound, then revoked.
```

```
REQUIREMENT: The subagent MUST NOT outlive its parent turn. The
             `SubagentHandle.result` of a subagent whose realm was removed
             before it finished MUST fail with
             `SubagentFailed { reason: "parent-ended" }`.
```

```
REQUIREMENT: `spawnSubagent` MUST pass `parent.context` as the
             `Realm.ephemeral` option `context`, so that defining the
             realm, installing `plugins` and tearing them down are
             attributed to the parent's actor, as core specifies for the
             owner of an ephemeral realm (core BEH-BR-336), and pass
             through the `OperationGate` when one is wired. The narrowed
             actor of `EphemeralRealm.context` is the subagent's own
             (BEH-AG-026); it MUST NOT be used for those operations.
```

```
REQUIREMENT: `spawnSubagent` MUST start the subagent's loop through
             `EphemeralRealm.use([AgentLoop], …)` with a `StartRequest`
             whose `actor` is the actor of `EphemeralRealm.context` and
             whose `spawn` carries `parent.taskId`, the restricted toolset
             (BEH-AG-027) and the parent session's taint labels
             (BEH-AG-029) (01, BEH-AG-003). A failure of `Realm.ephemeral`,
             of that `use` or of `start` MUST fail `spawnSubagent` with
             that error.
```

**Settled here.** The default `tools` is empty: a subagent that needs tools
names them, so widening by omission cannot happen.

**Settled here (gate).** Installing the subagent's plugins is not exempt
from the `OperationGate`: they are ordinary installs by the parent's actor.
With the loader's gate piece wired, they are allowed only when loaded
through the loader or exempt by digest (loader
[BEH-LD-015](../../loader/behaviors/02-load-pipeline.md#beh-ld-015-a-gate-piece-refuses-definitions-that-did-not-come-through-the-loader)).

## BEH-AG-026: The subagent acts as a narrowed actor

> **Invariant:** [INV-AG-003](../invariants.md#inv-ag-003-a-subagent-is-never-wider-than-its-parent)
> **See:** [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md)
> **Core seam:** [33 — Realm families](../../core/behaviors/33-realm-families.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)

```
REQUIREMENT: Every dispatch and host call of the subagent MUST carry the
             actor of `EphemeralRealm.context`, obtained by core with
             `Actor.narrow` from the parent's actor (core BEH-BR-336,
             BEH-BR-337), so that records and gate requests show the
             subagent, and — through the narrowed actor's id — the actor it
             acts for. The parent relation MUST NOT be expressed through
             `onBehalfOf`, which names a plugin principal, never an actor
             (core BEH-BR-258, BEH-BR-259).
```

```
REQUIREMENT: When the parent's actor is `Actor.unattributed`,
             `Actor.system` or any actor whose id begins with "bridger:",
             which `Actor.narrow` does not accept (core BEH-BR-337),
             `spawnSubagent` MUST fail with
             `SubagentParentUnattributed { actorKind }` before any realm is
             created or any plugin installed.
```

```
REQUIREMENT: The package MUST NOT construct a subagent actor by any other
             means, and MUST NOT give a subagent the parent's actor
             unchanged.
```

**Settled here.** A gate that sees the narrowed actor can apply its own rules
to subagents (for example, refusing every regulated command from one); the
package does not decide that.

## BEH-AG-027: The subagent's toolset is a subset of the parent's pinned toolset

> **Invariant:** [INV-AG-003](../invariants.md#inv-ag-003-a-subagent-is-never-wider-than-its-parent), [INV-AG-002](../invariants.md#inv-ag-002-a-turn-sees-one-toolset)
> **See:** [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md)
> **Core seam:** [command — Toolsets](../../command/behaviors/03-toolsets.md)

```
REQUIREMENT: The subagent's toolset MUST be the parent's pinned toolset
             restricted to `tools`, keeping the parent's order and digests.
             A name in `tools` that is not in the parent's pinned toolset
             MUST fail `spawnSubagent` with
             `SubagentToolNotInParent { tool }` before any realm is created.
```

```
REQUIREMENT: The subagent MUST use that one restricted toolset for its whole
             life; it MUST NOT pin a toolset of its own from the catalog.
             It receives the toolset as `StartRequest.spawn.toolset`
             (BEH-AG-025, BEH-AG-003).
```

```
REQUIREMENT: A dispatch by the subagent MUST also pass the parent toolset's
             membership and digest checks; a tool withdrawn from the
             catalog after the parent pinned fails for the subagent as for
             the parent.
```

**Settled here.** The subset is taken from the parent's *pinned* toolset, not
from the parent's selector re-evaluated against the narrowed actor: the
parent's turn defines what is reachable, and a later catalog change cannot
widen a subagent.

## BEH-AG-028: The subagent's budget is carved from the parent's

> **Invariant:** [INV-AG-003](../invariants.md#inv-ag-003-a-subagent-is-never-wider-than-its-parent)
> **See:** [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md)
> **Core seam:** [entitlement companion](../../entitlement/README.md)

```
REQUIREMENT: When a `Budget` provider is resolvable, `spawnSubagent` MUST
             obtain the subagent's allowance as a sub-reservation of the
             parent's (entitlement companion), never as a new top-level
             reservation, and MUST fail with the companion's refusal when
             the parent's remaining allowance cannot cover it.
```

```
REQUIREMENT: When the subagent ends, its unused sub-reservation MUST be
             released back to the parent before the parent's next step.
```

**Open.** Sub-reservation semantics (nesting, release order, what a revoked
parent reservation does to a child) are the entitlement companion's; this
behaviour depends on them and does not define them.

## BEH-AG-029: Taint flows into the subagent and back

> **Invariant:** [INV-AG-005](../invariants.md#inv-ag-005-taint-is-monotone-per-session), [INV-AG-001](../invariants.md#inv-ag-001-a-tainted-session-is-never-auto-allowed-a-change)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md), [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md)

```
REQUIREMENT: A subagent's session MUST start with the parent session's
             taint, passed as `StartRequest.spawn.taint` (BEH-AG-003). A
             subagent of a tainted parent is tainted from its first step.
```

```
REQUIREMENT: When the parent's loop receives a result from a tainted
             subagent, the parent session MUST become tainted
             (source kind "subagent") before the result reaches the parent's
             model.
```

**Settled here.** Taint flows both ways because both carry text: the parent's
instructions into the subagent, the subagent's findings back.

## BEH-AG-030: Subagent tasks appear in the feed under their parent

> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md), [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md)

```
REQUIREMENT: A subagent MUST have its own task in `Tasks`, with a
             `parentTaskId` field on its snapshots. Cancelling the parent
             MUST cancel the subagent first (BEH-AG-010).
```

```
REQUIREMENT: A subagent's `awaiting-approval` MUST also be reflected in the
             parent: the parent's step waits and the parent publishes
             `awaiting-approval` with the subagent's draft id.
```

**Open.** Whether a herdr observer should see subagents as separate agents or
only the parent; the herdr bridge (BEH-AG-013) reports every task in v0.1.

---

_Previous: [03 — Taint and provenance](./03-taint-and-provenance.md)_ · _Next: [05 — Agent testing](./05-agent-testing.md)_
