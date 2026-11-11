# 04 — Subagents

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-04                                            |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-11): BEH-AG-030: the subagent's loop settles `SubagentHandle.result` with `Deferred` by calling `spawn.settleDeferred` through `TaskRegistry.settle`, ordered with the task's cancels under the registration's lock, and a false answer leaves the draft to the cancel that came first (H5); BEH-AG-025: the scope close fails an unsettled result "parent-ended" through `TaskRegistry.settle` before it cancels, and a result another cancel reached first fails "cancelled" (A1); `spawnSubagent` requires `TaskRegistry` (SPEC-AUDIT-07) (CCR-AG-010)<br>0.7 (2026-11-11): BEH-AG-025: `request.parent.pendingDraft`, supplied by every `AgentLoop` provider; the hand-off marker and `heldByParent` derive from it (H10); BEH-AG-030: a subagent's `Deferred` result and a cancel are decided by the first to reach the handle, and a cancel that wins makes the result `SubagentFailed` "cancelled" (A5) (SPEC-AUDIT-06) (CCR-AG-009)<br>0.6 (2026-11-11): BEH-AG-025: `SubagentError` gains `HostClosed`, which `Realm.ephemeral` raises (PL5); the loop is started with `spawn.heldByParent`, answering as the hand-off marker is decided; only `spawnSubagent` passes the marker (PL3); BEH-AG-030: a cancel without the marker while the subagent's draft is pending on its parent ends it "handed-to-parent", and the first cancel to reach the task decides (A2) (SPEC-AUDIT-05) (CCR-AG-008)<br>0.5 (2026-11-10): BEH-AG-025: `isolate` never lists `Tasks`, a base service no plugin provides, so the subagent's task is in its parent's table (02, BEH-AG-011) (T1); BEH-AG-025 and BEH-AG-030: the scope-close cancel passes the hand-off marker `handedDraftId` only for the subagent whose draft is the parent task's pending draft, and a subagent's task ends "handed-to-parent" only under that marker, otherwise it withdraws (H2); BEH-AG-030: the parent's own `Deferred` wins over a subagent's not yet published, and a subagent draft still pending when the turn ends with an answer, `needs-input` or the parent's own deferral is withdrawn by the subagent's own task (T2) (CCR-AG-007)<br>0.4 (2026-11-10): A subagent that defers ends its turn holding nothing, its `SubagentResult` is the deferral, the parent waits on it and is the task the application resumes; the subagent's task then ends `cancelled` with its draft "handed-to-parent", and only an unsettled result fails `parent-ended`; when several subagents of a turn defer, the parent takes the first to settle and the others withdraw their own drafts; from the moment the result settles the draft is pending on the parent, which reports it if cancelled or failed before publishing it (BEH-AG-025, BEH-AG-030, BEH-AG-016) (H3); the ephemeral realm isolates `AgentLoop`, `ModelAdapter` and every key its plugins provide, which are passed as `DesiredPlugin` entries (BEH-AG-025) (M9); the subagent starts a new session `${parent.sessionId}/sub/${segment}` (BEH-AG-025) (M10) (CCR-AG-006)<br>0.3 (2026-11-10): Round 2 findings of the specification audit of 2026-11-09 — installs run under the parent's context as core `Realm.ephemeral` specifies, the subagent acts with `EphemeralRealm.context`, and `SubagentError` uses core's error unions (BEH-AG-025, BEH-AG-026, P21); the loop is started with `StartRequest.spawn` carrying the restricted toolset, taint and parent task (BEH-AG-025, 027, 029, H10); gate exemption question settled by the loader's wiring (P23) (CCR-AG-005)<br>0.2 (2026-11-08): Parent relation via `Actor.narrow` (BEH-BR-337), not `onBehalfOf`; `SubagentParentUnattributed`; error classes declared (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

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
  readonly parent: {
    readonly taskId: string; readonly sessionId: string
    readonly toolset: PinnedToolset; readonly context: OperationContext
    // The parent task's pending draft id now (02, BEH-AG-016), supplied by the parent's loop.
    readonly pendingDraft: Effect.Effect<Option.Option<string>>
  }
  readonly plugins: ReadonlyArray<Plugin.Any>      // e.g. a ModelAdapter and an AgentLoop for the subagent
  readonly tools?: ReadonlyArray<string>           // requested subset of the parent's pinned toolset; default: none
  readonly budget?: BudgetShare                    // entitlement companion's sub-reservation request
  readonly input: string
}): Effect.Effect<SubagentHandle, SubagentError, Scope.Scope | TaskRegistry>   // TaskRegistry: the parent loop's (02, BEH-AG-011)

interface SubagentHandle {
  readonly taskId: string                          // a Tasks entry of its own (02)
  readonly result: Effect.Effect<SubagentResult, SubagentFailed>
}
type SubagentResult =
  | { readonly _tag: "Done"; readonly answer?: string; readonly tainted: boolean }
  | { readonly _tag: "Deferred"; readonly draftId: string            // the subagent's awaiting-approval (BEH-AG-030)
      readonly commands: ReadonlyArray<string>; readonly tainted: boolean }

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
  | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected | HostClosed
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
REQUIREMENT: `spawnSubagent` MUST take a `segment` from the host's
             `IdGenerator`, pass it as the `Realm.ephemeral` option
             `segment`, and pass the realm option `isolate` listing
             `AgentLoop`, `ModelAdapter` and every other key in the
             `provides` of `plugins`, so that the subagent's providers
             occupy the realm's own slots and never collide with the
             parent's (core BEH-BR-146), and the subagent never resolves
             the parent's loop or model: one it does not bring fails with
             `ServiceUnavailable`. `isolate` MUST NOT list `Tasks`, a base
             service that no plugin provides (02, BEH-AG-011): the
             subagent's loop resolves the host's one table, so its task is
             in the same table as its parent's. Each plugin MUST be passed as the `DesiredPlugin`
             `{ id: plugin.id, plugin, realm: "ephemeral/" + segment }`
             (core BEH-BR-153, BEH-BR-336).
```

```
REQUIREMENT: The subagent MUST NOT outlive its parent turn. When the scope
             closes, `spawnSubagent` MUST first fail a
             `SubagentHandle.result` that has not settled with
             `SubagentFailed { reason: "parent-ended" }`, through
             `TaskRegistry.settle` on the subagent's task (02, BEH-AG-011),
             so that this, the scope close's cancel, takes its place in the
             order of the task's handle: it fails the result only when no
             other cancel and not the registration's close reached the
             handle first. It MUST then cancel the subagent's task
             with `Tasks.cancel(taskId, parent.context, { handedDraftId })`
             (a no-op when the task has ended, BEH-AG-010), then let the
             realm be removed. `handedDraftId` MUST be set, to the
             subagent's `draftId`, only when `parent.pendingDraft` answers
             that draft id at that moment (02, BEH-AG-016), and MUST be
             absent for every other subagent. Only
             `spawnSubagent` passes the marker (02, BEH-AG-016). A result
             that another cancel or the registration's close reached first
             fails from the task's terminal snapshot: "cancelled" for
             `cancelled`, "failed" for `failed` (BEH-AG-030); a result
             already settled — an answer, or a deferral the parent now
             waits on (BEH-AG-030) — is unchanged.
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
             whose `actor` is the actor of `EphemeralRealm.context`, whose
             `sessionId` is `${parent.sessionId}/sub/${segment}` — a new
             session, created as BEH-AG-004 says, that names its parent's —
             whose `input` is `input`, and whose `spawn` carries
             `parent.taskId`, the restricted toolset (BEH-AG-027) and the
             parent session's taint labels (BEH-AG-029) (01, BEH-AG-003),
             and `heldByParent`, which MUST answer for a `draftId` exactly
             as this behaviour decides the hand-off marker: true when
             `parent.pendingDraft` answers that draft id (02, BEH-AG-016).
             Every provider of `AgentLoop` that calls `spawnSubagent` MUST
             supply `parent.pendingDraft`, answering its task's pending
             draft id at the moment it is read — the subagent draft it
             took from the moment that result settled, whether or not the
             loop has read the result, or its own draft — and
             `Option.none()` when it has none. A
             failure of `Realm.ephemeral`,
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
REQUIREMENT: A subagent whose tool call is deferred ends its turn as any
             loop does (02, BEH-AG-012): its task publishes
             `awaiting-approval` and holds nothing. After publishing it, its
             loop MUST call
             `TaskRegistry.settle(taskId, spawn.settleDeferred({ draftId, commands, tainted }))`
             (01, BEH-AG-003; 02, BEH-AG-011), and the `settleDeferred`
             that `spawnSubagent` supplies MUST succeed its
             `SubagentHandle.result` with
             `Deferred { draftId, commands, tainted }` by completing the
             result's `Deferred`, answering true when it completed it and
             false when the result had already settled. That settlement and
             the cancels of the subagent's task are thereby decided in one
             order, the first to take the registration's lock deciding:
             when a cancel, the registration's close, or the scope close's
             failing of the result (BEH-AG-025) came first, the call
             answers false, the result is not settled `Deferred` — it fails
             "parent-ended" when the scope close came first, otherwise
             "cancelled" (or "failed" after the registration's close) —
             the parent never takes that draft, and that cancel, or the
             scope close's cancel that follows, ends the task under
             BEH-AG-016 as a task whose draft is not pending on its parent,
             withdrawing it; the loop MUST NOT withdraw it otherwise. The
             parent's loop
             MUST treat the first such result of its turn to settle as a
             `Deferred` tool outcome of its own step: it ends the step and
             the turn, holding nothing, and publishes `awaiting-approval`
             with that subagent's `draftId` and `commands` (BEH-AG-012),
             unless the parent's own tool call defers first or in the same
             step: the parent's own `Deferred` wins over a subagent's draft
             not yet published (02, BEH-AG-016).
             From the moment that result settles, the draft is the parent
             task's pending draft (BEH-AG-016): a parent cancelled or failed
             before it publishes `awaiting-approval` reports the draft for
             withdrawal. While it is, a cancel of the subagent's task that
             carries no marker — an MCP `tasks/cancel`, an operator's —
             ends it "handed-to-parent" without a withdrawal and leaves the
             draft to the parent's task; the first cancel to reach the
             subagent's task decides, and a later one changes nothing (02,
             BEH-AG-011, BEH-AG-016).
```

```
REQUIREMENT: A parent waits on one draft. When several subagents of one
             turn defer, only the first `Deferred` to settle is the
             parent's; the loop MUST decide which is first atomically, and
             MUST NOT merge drafts, since the package creates none
             (BEH-AG-012). Every other subagent of the turn is cancelled
             without the hand-off marker when the turn ends (BEH-AG-025):
             one still running fails `parent-ended`, and one in
             `awaiting-approval` whose draft is not the parent's — a later
             `Deferred`, or any subagent draft when the turn ends with an
             answer, `needs-input` or the parent's own deferral — MUST end
             under BEH-AG-016 like any task with a pending draft — it calls `draftWithdrawal.withdraw` with
             reason "task-cancelled" and its own `DraftReport` carries the
             answer. The parent's model learns of those drafts only as
             subagents that did not finish.
```

```
REQUIREMENT: The application MUST resume the parent task, never the
             subagent's: `Approved`, `Refused` or `Stale` with the
             subagent's `draftId` goes to the parent (BEH-AG-012), and the
             outcomes or the refusal reach the parent's model as the
             subagent's result. When the parent turn ends, the task of the
             subagent whose draft the parent took, still
             `awaiting-approval`, is cancelled with `handedDraftId` naming
             that draft (BEH-AG-025) and MUST end
             `cancelled` with `draft: { draftId, outcome:
             "handed-to-parent" }`, without calling `draftWithdrawal.withdraw`:
             the draft is pending on the parent's task, which reports it if
             it ends without it (BEH-AG-016). A resume sent to the subagent's
             task then fails with `TaskNotResumable`.
```

**Settled here.** A subagent is not resumed after an approval. Its realm and
loop end with the parent turn that waits, as a turn that waits holds nothing
(BEH-AG-012); keeping them would hold the parent's pin and scope for as long
as a person takes. The parent receives the outcome and, if it needs more of
the subagent's work, spawns a new subagent in its next turn.

**Open.** Whether a herdr observer should see subagents as separate agents or
only the parent; the herdr bridge (BEH-AG-013) reports every task in v0.1.

---

_Previous: [03 — Taint and provenance](./03-taint-and-provenance.md)_ · _Next: [05 — Agent testing](./05-agent-testing.md)_
