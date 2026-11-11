# 02 — Tasks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-02                                            |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.12 (2026-11-11): BEH-AG-016: a subagent's draft becomes the parent task's pending draft when the parent loop's `onDeferred` answers true under the subagent's registration lock (A4); BEH-AG-011: the `TaskRegistry` comment names `spawnSubagent` among its users (PL2), and `settle`'s effect may include that compare-and-set (SPEC-AUDIT-08) (CCR-AG-011)<br>0.11 (2026-11-11): BEH-AG-011: one lock per registration, under which a cancel reaches a task's handle, the registration's close begins, and the new `TaskRegistry.settle` runs, answering false when a cancel or the close came first; the lock is released before the handle's work; `spawnSubagent` uses `settle` (H5, A1); the `Actor.system` of a registration's close cites core BEH-BR-185's permission (PL1) (SPEC-AUDIT-07) (CCR-AG-010)<br>0.10 (2026-11-11): BEH-AG-011: `start` publishes `queued` before returning (A1); a cancel's actor is `context.actor`, else `CurrentActor`, else `Actor.unattributed`, and `Actor.system` is kept for the withdrawal of a registration's close (A2); a cancel arriving after the registration's close has begun changes nothing (PL23); BEH-AG-016: the marker and `heldByParent` derive from the parent loop's `pendingDraft` (H10); the parent loop's withdrawal of a handed-over draft carries the subagent's task id and its outcome is only logged (A3) (SPEC-AUDIT-06) (CCR-AG-009)<br>0.9 (2026-11-11): BEH-AG-011: the internal write port `TaskRegistry` (provided with `Tasks` by `Tasks.layer()`, used only by providers of `AgentLoop`), `TaskWriter`, and per-task cancel handles that `Tasks.cancel` calls with its context (`Actor.system` when absent); the first cancel to reach a handle decides; a registration's scope is the loop's activation, and when it closes its unfinished tasks end `failed` "LoopStopped" under BEH-AG-016; BEH-AG-010: the cancel is the registered handle, the loop's stop an `error` event; BEH-AG-014: MCP `tasks/cancel` passes no marker; BEH-AG-016: the marker is trusted input passed only by `spawnSubagent`, a cancel without it while a subagent's draft is pending on its parent ends it "handed-to-parent", and the parent's loop withdraws such a draft it does not publish; `DraftWithdrawal.by` defined for a cancel without context (SPEC-AUDIT-05 H3, A1, A2, PL3, PL4) (CCR-AG-008)<br>0.8 (2026-11-10): BEH-AG-011: `Tasks` is a base service built with `Tasks.layer()`, provided by no plugin, so every loop in every realm, a subagent's included, writes the host's one table; `AgentLoop.plugin` requires it (T1); BEH-AG-011 and BEH-AG-016: `Tasks.cancel` takes the hand-off marker `handedDraftId`, set only by `spawnSubagent`, and a task ends "handed-to-parent" only when the marker names its pending draft, otherwise it withdraws (H2); BEH-AG-016: the parent's own `Deferred` takes precedence over a subagent's draft not yet published, and a subagent draft still pending when the turn ends any other way is withdrawn by the subagent's own task (T2); `DraftReport` is present when the task ended with a pending draft, not only while awaiting approval (PL13) (CCR-AG-007)<br>0.7 (2026-11-10): BEH-AG-014 and BEH-AG-015: the bridges list, stream and cancel tasks whose actor is the observer's principal or within it, as the task-id check already did (M7); BEH-AG-014: `McpTaskBridge` is a plugin providing `@bridger/mcp`'s `McpTasks` port, called by the MCP server with the session's info and actor, and pushes `notifications/tasks` for subscribed, admitted task ids through the session's `notify` until `ended` (mcp BEH-MC-008) (M8); BEH-AG-012 and BEH-AG-016: a subagent's deferral is waited on by its parent, and the subagent's task ends with `DraftReport` outcome "handed-to-parent" without a withdrawal; a task's pending draft includes the first subagent `Deferred` of the turn, from the moment it settles until published, so a parent cancelled or failed in that window reports it, and a later subagent `Deferred` of the same turn is withdrawn by its own task; BEH-AG-010 follows (04, BEH-AG-030) (H3) (CCR-AG-006)<br>0.6 (2026-11-10): BEH-AG-014 and BEH-AG-015: a task id from an MCP client is answered as unknown unless the task's actor is the session's principal or within it (round 2 findings of the specification audit of 2026-11-09, low finding) (CCR-AG-005)<br>0.5 (2026-11-09): BEH-AG-016: a task that ends while awaiting approval reports its draft through the loop's required `DraftWithdrawal` option, and the terminal snapshot carries the outcome; BEH-AG-009, 010 and 012 amended (audit U-12) (CCR-AG-004)<br>0.4 (2026-11-08): BEH-AG-011 open question restated: command tasks keep records through the command companion's `CommandTaskStore`, agent runs stay in memory; BEH-AG-015 keyed repeats and lost command tasks (round-2 agent review A-08, A-09) (CCR-AG-003)<br>0.3 (2026-11-08): `awaiting-approval` carries every drafted command; approval of a batch draft resumes with one outcome per command, all or none; BEH-AG-015 command tasks of long commands: the loop's wait, the herdr and MCP bridges (CCR-AG-003, round 2: recheck items 5, 7)<br>0.2 (2026-11-08): Task error classes declared; resumption through `ResumeInput`; MCP bridge exposes agent tasks only (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

A person running agents — in an activity panel, a terminal multiplexer, an
MCP client — needs to know, for each task, whether it is working, waiting for
them, or finished. This file specifies the `TaskSnapshot` state feed, the
`Tasks` service with `Tasks.await`, and two bridges that translate the feed
for external observers: herdr's socket and the MCP tasks extension. It follows
core's pattern for plugin state: a discriminated snapshot, monotone revisions,
a state feed that may skip intermediate states
([ADR-BR-014](../../core/decisions/014-discriminated-plugin-snapshot.md),
[ADR-BR-007](../../core/decisions/007-observation-primitives.md)). This file
owns BEH-AG-009–016 and uses all eight.

Planned source: `packages/agent/src/Tasks.ts`, `packages/agent/src/bridges/Herdr.ts`,
`packages/agent/src/bridges/McpTasks.ts` *(Planned)*.

## BEH-AG-009: TaskSnapshot is a discriminated union with a monotone revision

> **Invariant:** [INV-AG-004](../invariants.md#inv-ag-004-task-terminal-states-are-sticky-and-revisions-never-regress)
> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md), [ADR-BR-014](../../core/decisions/014-discriminated-plugin-snapshot.md)

```ts
// illustrative — not type-checked
interface TaskBase {
  readonly taskId: string
  readonly sessionId: string
  readonly actor: Actor
  readonly parentTaskId?: string       // set for a subagent's task (04)
  readonly revision: number            // 0 at creation, +1 per state change
  readonly tainted: boolean            // the session's taint at this revision (03)
  readonly updatedAt: number           // from the host Clock (core 24)
}
type TaskSnapshot = TaskBase & (
  | { readonly state: "queued" }
  | { readonly state: "working"; readonly step: number }
  | { readonly state: "needs-input"; readonly prompt: string }
  | { readonly state: "awaiting-approval"; readonly draftId: string; readonly commands: ReadonlyArray<string> }   // one, or every command of a batch draft
  | { readonly state: "stale"; readonly draftId: string; readonly reason: "expected-version" }
  | { readonly state: "done"; readonly answer?: string }
  | { readonly state: "failed"; readonly error: { readonly _tag: string; readonly message: string }; readonly draft?: DraftReport }
  | { readonly state: "cancelled"; readonly by: Actor; readonly draft?: DraftReport }
)
// present only when the task ended with a pending draft (BEH-AG-016)
interface DraftReport {
  readonly draftId: string
  readonly outcome: "withdrawn" | "already-applied" | "not-withdrawn"
    | "handed-to-parent"                 // a subagent's draft, pending on its parent's task (04, BEH-AG-030)
}
```

```
REQUIREMENT: Every task MUST be in exactly one of the eight states shown.
             Fields that belong to one state MUST NOT appear in another.
```

```
REQUIREMENT: `revision` MUST start at 0 when the task is created in `queued`
             and MUST increase by exactly one on every state change, and
             MUST NOT change otherwise.
```

```
REQUIREMENT: `done`, `failed` and `cancelled` MUST be terminal. A task in a
             terminal state MUST NOT change state again (INV-AG-004).
```

```
REQUIREMENT: Time in a snapshot MUST come from the host's `Clock` and ids
             from its `IdGenerator` (core
             [24 — Time, identifiers and sequence](../../core/behaviors/24-time-ids-and-sequence.md)).
```

**Settled here.** (1) `stale` carries the draft it concerns, so an observer
can show which proposal was overtaken. (2) A `failed` snapshot carries a tag
and a message, never a cause, for the reason given in BEH-AG-005.

## BEH-AG-010: The transition table

> **Invariant:** [INV-AG-004](../invariants.md#inv-ag-004-task-terminal-states-are-sticky-and-revisions-never-regress)
> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md), [ADR-BR-013](../../core/decisions/013-total-operation-legality.md)

| From \ event | step begins | needs input | gate Defer | draft stale | input / approval received | draft refused | answer | error | cancel |
| ------------ | ----------- | ----------- | ---------- | ----------- | ------------------------- | ------------- | ------ | ----- | ------ |
| queued | working | — | — | — | — | — | — | failed | cancelled |
| working | working (step+1) | needs-input | awaiting-approval | stale | — | — | done | failed | cancelled |
| needs-input | — | — | — | — | working | — | — | failed | cancelled |
| awaiting-approval | — | — | — | stale | working | working | — | failed | cancelled |
| stale | working (re-plan) | — | — | — | — | — | — | failed | cancelled |
| done / failed / cancelled | — | — | — | — | — | — | — | — | — (no-op) |

```ts
// illustrative — not type-checked
class TaskNotFound extends Schema.TaggedError<TaskNotFound>()("TaskNotFound", { taskId: Schema.String }) {}
class TaskNotResumable extends Schema.TaggedError<TaskNotResumable>()("TaskNotResumable", {
  taskId: Schema.String,
  state: Schema.String                         // the TaskState the event found
}) {}
```

The events "input / approval received", "draft refused" and "draft stale"
are delivered by `AgentLoop.resume` with the `Input`, `Approved`, `Refused`
and `Stale` cases of `ResumeInput` (01 — Agent seams, BEH-AG-003).

```
REQUIREMENT: Every (state, event) pair MUST have the outcome of the table.
             A "—" cell MUST leave the task unchanged and MUST be reported
             to the caller that produced the event as
             `TaskNotResumable { taskId, state }`, except `cancel` on a
             terminal task, which MUST be a no-op that succeeds.
```

```
REQUIREMENT: A refused draft MUST return the task to `working` so the loop
             can tell the model the proposal was refused; it MUST NOT end
             the task by itself.
```

```
REQUIREMENT: `cancel` — the cancel handle the task's loop registered
             (BEH-AG-011) — MUST interrupt the running turn, await its
             finalizers (releasing the pinned toolset, budget reservations
             and any subagent realms, 04 — Subagents), report a pending
             draft for withdrawal when the task had one
             ([BEH-AG-016](#beh-ag-016-a-task-that-ends-while-awaiting-approval-reports-its-draft-for-withdrawal)),
             and only then publish `cancelled`.
```

The end of the loop's registration (BEH-AG-011) is an `error` event: it
ends the task `failed` "LoopStopped" from any state that is not terminal.
Like core's legality table, the table is total, so no concurrent event leaves
a task in an undefined state. A late approval for a cancelled task is refused
with `TaskNotResumable`; it does not revive the task, and the draft it
approves was reported for withdrawal when the task ended (BEH-AG-016).

**Settled here.** Cancelling a terminal task succeeds as a no-op, as
`remove` of an absent plugin's handle does not, because the caller's intent
(the task is no longer running) already holds.

## BEH-AG-011: Tasks.changes, list, await and cancel

> **Invariant:** [INV-AG-004](../invariants.md#inv-ag-004-task-terminal-states-are-sticky-and-revisions-never-regress)
> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md), [ADR-BR-007](../../core/decisions/007-observation-primitives.md)

```ts
// illustrative — not type-checked
class Tasks extends Context.Service<Tasks, {
  readonly get: (taskId: string) => Effect.Effect<TaskSnapshot, TaskNotFound>
  readonly list: (filter?: { readonly sessionId?: string; readonly states?: ReadonlyArray<TaskState> }) =>
    Effect.Effect<ReadonlyArray<TaskSnapshot>>
  readonly changes: (taskId: string) => Stream.Stream<TaskSnapshot, TaskNotFound>
  readonly all: Stream.Stream<TaskSnapshot>
  readonly await: (taskId: string, options?: {
    readonly until?: ReadonlyArray<TaskState>          // default: the three terminal states
    readonly timeout?: Duration.Input | "forever"      // default 30 seconds
  }) => Effect.Effect<TaskSnapshot, TaskNotFound | TaskAwaitTimeout>
  readonly cancel: (taskId: string, context?: OperationContext, options?: {
    readonly handedDraftId?: string                    // the hand-off marker, passed only by spawnSubagent (BEH-AG-016)
  }) => Effect.Effect<void, TaskNotFound>              // calls the task's registered cancel handle (below)
}>()("@bridger/agent/Tasks") {}
declare const Tasks: { readonly layer: () => Layer.Layer<Tasks | TaskRegistry> }   // a base service (below)

// The internal write port: used only by providers of AgentLoop (a subagent's loop included) and spawnSubagent (for settle), never by application code.
class TaskRegistry extends Context.Service<TaskRegistry, {
  readonly register: (task: { readonly taskId: string; readonly sessionId: string },
                      cancel: (context: OperationContext, options?: { readonly handedDraftId?: string }) => Effect.Effect<void>)
    => Effect.Effect<TaskWriter, never, Scope.Scope>   // scoped to the registering loop's activation
  // Runs `settle` under the task's registration lock, ordered with the cancels that reach its handle (below).
  readonly settle: (taskId: string, settle: Effect.Effect<boolean>) => Effect.Effect<boolean>
}>()("@bridger/agent/TaskRegistry") {}
interface TaskWriter { readonly publish: (snapshot: TaskSnapshot) => Effect.Effect<void> }

class TaskAwaitTimeout extends Schema.TaggedError<TaskAwaitTimeout>()("TaskAwaitTimeout", {
  taskId: Schema.String,
  last: TaskSnapshotSchema                     // the last snapshot seen
}) {}
```

```
REQUIREMENT: `Tasks` MUST be a base service of the host (core BEH-BR-012),
             built by the application with `Tasks.layer()` into `base`; no
             plugin provides it, and it is not one of the five swappable
             keys of BEH-AG-001. `AgentLoop.plugin` MUST list `Tasks` in
             its `requires`. Because no realm's plugins provide it, a loop
             in any realm — a subagent's ephemeral realm included (04,
             BEH-AG-025) — resolves the host's one table, so a subagent's
             task sits beside its parent's and the bridges see both.
             `Tasks.layer()` MUST provide `Tasks` and `TaskRegistry` over
             that one table; `AgentLoop.plugin` MUST also list
             `TaskRegistry` in its `requires`.
```

```
REQUIREMENT: `Tasks` MUST have no write operation. A task MUST enter the
             table only through `TaskRegistry.register`, and its snapshots
             MUST change only through the `TaskWriter` that registration
             returned: the writer's first `publish` MUST be the task's
             `queued` snapshot with revision 0 and the registered `taskId`
             and `sessionId`, and every later `publish` MUST follow the
             table of BEH-AG-010. A snapshot the table does not allow, a
             snapshot of another task, or a `taskId` already registered,
             MUST be a defect. Until the first `publish`, `Tasks` does not
             show the task; a provider of `AgentLoop` MUST therefore
             register the task and publish its `queued` snapshot before
             `start` returns its task id (01, BEH-AG-003). Documentation MUST state that `TaskRegistry` is
             internal: only providers of `AgentLoop` use it — the loop
             `spawnSubagent` starts for a subagent included (04) — and
             `spawnSubagent` itself, for `settle` (04, BEH-AG-025), and
             application code MUST NOT.
```

```
REQUIREMENT: `register` MUST tie the registration to the `Scope` it runs
             in, and a provider of `AgentLoop` MUST register each task it
             runs in its plugin's activation scope (core
             [06 — Removal](../../core/behaviors/06-removal.md)), never a
             turn's scope. When that scope closes — the loop's plugin is
             stopped, replaced, restarted or removed, or its realm removed
             — every task of the registration not yet terminal MUST be
             ended before the scope finishes closing: its running turn
             interrupted and its finalizers awaited as for a cancel
             (BEH-AG-010), then `failed` with error
             `{ _tag: "LoopStopped", message: "loop-stopped" }`, its
             pending draft handled under BEH-AG-016 with reason
             "task-failed" and `by` `Actor.system`, the host having caused
             this end by stopping the loop's plugin, as core BEH-BR-185
             permits a companion to attribute such an end — except a subagent's draft pending on its
             parent, which ends "handed-to-parent" and calls nothing, as
             for a cancel without the marker. The writer MUST then refuse
             further snapshots as a defect.
```

```
REQUIREMENT: `Tasks.cancel(taskId, context?, options?)` MUST fail with
             `TaskNotFound` for a task id the table does not show, MUST
             succeed as a no-op for a terminal task (BEH-AG-010), and
             otherwise MUST call the cancel handle registered for the task
             with `context` and `options`, completing when the handle
             completes. The cancel's actor MUST be resolved as command
             dispatch resolves it (command BEH-CM-010): `context.actor`,
             else the fiber's `CurrentActor`, else `Actor.unattributed`
             (core BEH-BR-185); it is never `Actor.system`, which is kept
             for the end a registration's close causes. The handle
             MUST end the task as BEH-AG-010 says, with `cancelled.by` and
             the withdrawal's `by` (BEH-AG-016) set to that resolved
             actor. The first cancel to reach a handle decides how the
             task ends; a later cancel, or the registration's close, MUST
             change nothing and complete once the task is terminal. Once
             the registration's close has begun ending the task, a cancel
             that reaches the handle MUST likewise change nothing and
             complete once the task is terminal (`failed` "LoopStopped").
```

```
REQUIREMENT: Each registration MUST have one lock. A cancel MUST reach a
             task's handle — be recorded as first or found later — and the
             registration's close MUST begin ending a task, while holding
             that lock; a subagent task's `spawn.heldByParent` (BEH-AG-016)
             is read then. The lock MUST be released before the handle's
             work — interrupting the turn, awaiting finalizers, the
             withdrawal — runs, so nothing waits on that work under it.
             `TaskRegistry.settle(taskId, settle)` MUST run `settle` while
             holding the same lock and answer its result, and MUST answer
             false without running it when a cancel or the registration's
             close has reached the task's handle first, or when the table
             does not show the task or shows it terminal. Its callers pass
             an effect that does not wait — completing a `Deferred`, after
             the parent's compare-and-set `onDeferred` for a subagent's
             deferral — and are the subagent's loop and `spawnSubagent` (04,
             BEH-AG-025, BEH-AG-030). A `settle` that runs records nothing on the
             handle: a cancel that reaches it afterwards is still the first
             cancel, and sees what `settle` did.
```

```
REQUIREMENT: `changes(taskId)` MUST follow the rules of `Host.changes`: the
             current snapshot first, no gap at registration, later
             snapshots after; a slow subscriber MAY skip intermediate
             revisions; revisions MUST never regress; the stream MUST end
             after the terminal snapshot.
```

```
REQUIREMENT: `await` MUST complete with the first snapshot whose state is in
             `until`, checking the current snapshot first. When the task
             reaches a terminal state not in `until`, `await` MUST complete
             with that snapshot rather than wait for a state that cannot
             come. After `timeout` it MUST fail with
             `TaskAwaitTimeout { taskId, last }` carrying the last snapshot
             seen; the task MUST be unaffected.
```

```
REQUIREMENT: Because `changes` may skip revisions, `await` MUST NOT be
             documented as observing every state; an `until` state that is
             entered and left between two observations MAY be missed,
             except the terminal states, which are never left.
```

`changes` is a state feed, not a log ([ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md)).
An application that must keep every transition records them from the loop's
own reporting into its store; the feed is for showing state.

**Settled here.** (1) `await` returns on an unrequested terminal state,
otherwise awaiting `awaiting-approval` on a task that fails would wait until
its timeout. (2) The default timeout of 30 seconds matches core's default
drain bound; `"forever"` must be stated. (3) `Tasks` outlives every plugin, so a
task is tied to the activation of the loop that runs it: a loop that stops
or is replaced ends its unfinished tasks `failed` "LoopStopped", reporting a
pending draft, rather than leaving them `working` or `awaiting-approval` with
nothing behind them. A replacement loop does not take them over; an
application resumes the work by starting a new task. (4) The write side is a
separate port so that every reader of `Tasks` — the bridges, application
code — cannot write a task; the alternative, `create` and `publish` on
`Tasks`, has fewer types and no such limit.

**Open.** Whether the `Tasks` table should be held by a store port so that an
agent run's record survives a host restart, as command tasks' records can
(command BEH-CM-054, `CommandTaskStore`); v0.1 keeps agent runs in memory for
the host's life, and recheck item 7 is closed for agent runs only within the
process. A run cut off by a restart is not resumed and leaves no record.

## BEH-AG-012: awaiting-approval follows a gate Defer, and stale follows a stale draft

> **Invariant:** [INV-AG-001](../invariants.md#inv-ag-001-a-tainted-session-is-never-auto-allowed-a-change)
> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md), [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [command — Dispatch](../../command/behaviors/02-dispatch.md)

```
REQUIREMENT: When `ToolRunner` returns `Deferred { draftId, commands }` — for
             one call, or for every call of a batch (01, BEH-AG-008) — the
             loop MUST end the current step without calling the model
             again, MUST publish `awaiting-approval` once with that
             `draftId` and the command ids, and MUST hold no pinned
             toolset, model call or budget reservation while it waits.
```

```
REQUIREMENT: When the application has applied the approved draft — by
             dispatching the command again with an `ApprovalRef` (command
             BEH-CM-011), or the whole batch again with a
             `BatchApprovalRef` (command BEH-CM-051) — it resumes the task
             with `ResumeInput.Approved { draftId, outcomes }`, one outcome
             per drafted command in draft order, each mapped as
             `ToolRunner` maps a dispatch (BEH-AG-005, BEH-AG-008). The loop
             MUST accept `Approved` only when the number of outcomes equals
             the number of drafted commands (`TaskNotResumable` otherwise),
             MUST then publish `working`, and the outcomes MUST reach the
             model as the tool results of the deferred calls. `Refused { draftId, reason }` MUST return the
             task to `working` with the refusal as that tool result.
```

```
REQUIREMENT: When the application's `Draft.check` (core BEH-BR-316) finds
             the draft stale before applying it, it resumes the task with
             `ResumeInput.Stale { draftId, mismatches }`. The loop MUST
             publish `stale` with the draft id and then begin a new turn
             that re-plans from current state, publishing `working`. It
             MUST NOT apply the stale draft and MUST NOT resubmit it
             unchanged. A re-dispatch that fails because the command's
             definition changed (`ToolChanged`, command BEH-CM-011) or
             because dispatch's own `Draft.check` found the draft stale
             (`CommandDraftStale`, command BEH-CM-051) MUST be treated as
             stale in the same way.
```

```
REQUIREMENT: The package MUST NOT approve, store or apply drafts itself. It
             MUST only react to the outcomes reported to it by the
             application's draft flow (core file 32), and MUST report a
             pending draft to that flow when the task ends without it
             ([BEH-AG-016](#beh-ag-016-a-task-that-ends-while-awaiting-approval-reports-its-draft-for-withdrawal)).
```

A turn that waits for a person holds nothing: the pin is released, so the
re-planned turn sees the current toolset, and no reservation is held across
an approval that may take a day. A subagent's deferral is the parent's to
wait on: the parent publishes `awaiting-approval` with the subagent's draft
and is the task the application resumes (04, BEH-AG-030).

**Settled here.** (1) Re-planning is a new turn (a new pin), not a
continuation of the old one, because the state the old plan assumed is gone.
(2) A batch draft is approved all or none (recheck X6): the loop has no
outcome for "part of the plan approved", and an approval store that wants
partial approval asks the agent to propose a smaller plan.

## BEH-AG-013: The herdr bridge maps states and adds none

> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md)

| TaskSnapshot state | herdr state |
| ------------------ | ----------- |
| queued | idle |
| working | working |
| stale | working |
| needs-input | blocked |
| awaiting-approval | blocked |
| done | done |
| failed | done |
| cancelled | done |

```
REQUIREMENT: `HerdrBridge.plugin({ connect })` MUST report each task's state
             to herdr using exactly this mapping, from the `Tasks.all`
             feed (and command tasks by the mapping of BEH-AG-015), and MUST
             report nothing herdr would read as a state not in these
             tables.
```

```
REQUIREMENT: The bridge MUST treat herdr's socket protocol, including what
             `herdr wait` observes, as herdr's. The socket connection MUST
             be supplied by the application (`connect`); the package MUST
             NOT choose a socket path or define message framing beyond
             what herdr documents.
```

```
REQUIREMENT: A herdr connection failure MUST NOT change any task's state.
             The bridge MUST log it and reconnect with the application's
             schedule; it MUST report the current state of every live task
             after reconnecting.
```

herdr distinguishes fewer states than the task feed. The mapping loses
information on purpose (a failed task shows as `done`); an observer that needs
the distinction reads the feed itself or the MCP bridge. herdr's own
`unknown` is never sent: every task has a known state.

**Open.** Which herdr protocol revision the bridge targets, and whether the
terminal reason can be carried in a free-text field herdr shows; to be fixed
against herdr's documentation when the bridge is prototyped.

## BEH-AG-014: The MCP tasks bridge

> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md)
> **Core seam:** [mcp — Client import and server](../../mcp/README.md)

| TaskSnapshot state | MCP task status | `statusMessage` |
| ------------------ | --------------- | --------------- |
| queued | working | "queued" |
| working | working | — |
| stale | working | "re-planning" |
| needs-input | input_required | the prompt |
| awaiting-approval | input_required | "awaiting approval" |
| done | completed | — |
| failed | failed | the error tag |
| cancelled | cancelled | — |

```
REQUIREMENT: `McpTaskBridge.plugin()` MUST be a plugin providing the
             `McpTasks` port of `@bridger/mcp`, through which the MCP server
             passes it every `tasks/*` request of a session that negotiated
             the tasks extension, and every long command's task, with the
             session's `McpSessionInfo` and the actor the server bound at
             `initialize` (mcp
             [BEH-MC-008](../../mcp/behaviors/01-server.md#beh-mc-008-the-server-passes-the-tasks-extension-to-the-mcptasks-port)).
             The bridge MUST take the session's principal from that actor
             only, never from a client field.
```

```
REQUIREMENT: `McpTaskBridge` MUST expose a task to an MCP client that
             negotiated the tasks extension using exactly this mapping, and
             MUST serve `tasks/get` from `Tasks.get` and status updates
             from `Tasks.changes`, each sent as the extension's
             `notifications/tasks` (params: the full task) through the
             session's `McpTaskSession.notify` (mcp BEH-MC-008), only for a
             task id the session subscribed to through
             `subscriptions/listen` and the actor rule below admits, and
             ended when `McpTaskSession.ended` completes or the task
             reaches a terminal state.
```

```
REQUIREMENT: The bridge MUST expose only tasks that exist in `Tasks` — runs
             of an `AgentLoop` whose `actor` is the MCP session's principal
             or within it (`Actor.isWithin`, core BEH-BR-337) — or in
             `CommandTasks` (BEH-AG-015), in every listing and status
             stream as in the task-id check below. It MUST NOT create a task for a
             direct MCP `tools/call` that a gate or the taint floor
             deferred: such a call is a plain dispatch with nothing behind
             it that would complete, and the MCP server answers it as an
             `isError` result carrying the draft id
             (`@bridger/mcp`, [server](../../mcp/behaviors/01-server.md),
             BEH-MC-005).
```

```
REQUIREMENT: A task id received from the client — in `tasks/get`,
             `tasks/cancel` or a status subscription — MUST be answered as
             an unknown task, with nothing read beyond the check and
             nothing cancelled, unless the task's `actor` is the MCP
             session's principal or within it (`Actor.isWithin`, core
             BEH-BR-337, which admits the session's subagents). The same
             rule MUST apply to command tasks (BEH-AG-015).
```

```
REQUIREMENT: An MCP `tasks/cancel` MUST call `Tasks.cancel` with the MCP
             session's principal as the context actor and MUST NOT pass
             `handedDraftId`. A subagent's task whose draft is pending on
             its parent then ends "handed-to-parent" and leaves the draft
             to the parent's task (BEH-AG-016). The bridge MUST NOT
             accept an approval through MCP task input; approvals reach a
             draft only through the application's draft flow (core file 32).
```

```
REQUIREMENT: When the client did not negotiate the tasks extension, the
             bridge MUST expose nothing; the MCP server's handling of a
             deferred call applies (references/mcp/).
```

**Settled here.** Approval through MCP task input is refused: an MCP client
is often the agent's own host, and accepting approval from it would let the
agent approve its own drafts.

## BEH-AG-015: Command tasks in the bridges

> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md)
> **Core seam:** [command — Batches and long commands](../../command/behaviors/07-batches-and-long-commands.md)

| CommandTaskSnapshot state | herdr state | MCP task status | `statusMessage` |
| ------------------------- | ----------- | --------------- | --------------- |
| running | working | working | the progress note, when present |
| done | done | completed | — |
| failed | done | failed | the error tag |
| cancelled | done | cancelled | — |

```
REQUIREMENT: When `ToolRunner` returns `Started { taskId, command }` for a
             long command (command BEH-CM-052), the loop MUST wait with
             `CommandTasks.await(taskId, { timeout: longToolWait })` (default
             30 seconds) inside the step, keeping the turn's pin. A terminal
             snapshot MUST become the call's tool result: `done` as `Ok`
             with the envelope of its encoded output (BEH-AG-023), `failed`
             and `cancelled` as `Failed`. A wait that times out MUST give
             the model the result `{ "taskId": …, "state": "running" }`
             and MUST NOT cancel the command task.
```

```
REQUIREMENT: `HerdrBridge` and `McpTaskBridge` MUST also expose command
             tasks from `CommandTasks.all` when a `CommandCatalog` is
             resolvable, mapped by the table above, each bridge exposing
             only tasks whose `actor` is the observer's principal or within
             it (`Actor.isWithin`, core BEH-BR-337) — the MCP session's
             actor, or the actor the application names for a herdr
             connection. `tasks/cancel` on a command task MUST call
             `CommandTasks.cancel` with the MCP session's principal as the
             context actor, and only for a task the actor rule of
             BEH-AG-014 admits.
```

```
REQUIREMENT: A long command dispatched by an MCP `tools/call` from a session
             that negotiated the tasks extension MUST be answered with an
             MCP task for its `taskId` (`@bridger/mcp`,
             [server](../../mcp/behaviors/01-server.md), BEH-MC-004); the
             bridge MUST NOT create a task for anything that is not an
             agent run or a command task.
```

herdr's `wait` and an MCP client's task view observe what a person is waiting
for. An agent run and a long import started from a UI are both that, so both
appear through the same bridges, with the same mapping style: fewer states
than the feed, nothing added.

**Settled here.** (1) The bridges filter by actor because `CommandTasks`
itself does not (command BEH-CM-053): the package that exposes a task to
another party is the one that decides who sees it. A command task found
running when the catalog layer was rebuilt is shown as `failed` with
`TaskLost` (command BEH-CM-054), and a keyed repeat of the call that started
a task returns that same task (command BEH-CM-041). (2) The loop does not hold
a turn open until a long command ends; after `longToolWait` the model is told
the command is still running and the command continues on its own.

**Open.** How a later turn learns that a command it started has finished:
v0.1 relies on the application to post the outcome into the session (a user
or system message); a built-in "await task" tool is a candidate.

## BEH-AG-016: A task that ends while awaiting approval reports its draft for withdrawal

> **Invariant:** [INV-AG-008](../invariants.md#inv-ag-008-a-task-never-ends-with-its-pending-draft-unreported), [INV-AG-004](../invariants.md#inv-ag-004-task-terminal-states-are-sticky-and-revisions-never-regress)
> **See:** [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [command — Dispatch](../../command/behaviors/02-dispatch.md)

```ts
// illustrative — not type-checked
// The application's draft flow, as the loop needs it when a task ends with a draft pending.
interface DraftWithdrawal {
  readonly withdraw: (request: {
    readonly draftId: string
    readonly taskId: string
    readonly commands: ReadonlyArray<string>          // the command ids of the awaiting-approval snapshot
    readonly by: Actor                                // the cancel's resolved actor (BEH-AG-011); when it failed, Actor.system for "LoopStopped" (core BEH-BR-185), else the task's actor
    readonly reason: "task-cancelled" | "task-failed"
  }) => Effect.Effect<"withdrawn" | "already-applied", DraftWithdrawalFailed>
  readonly timeout?: Duration.Input                   // default 10 seconds
}
declare const DraftWithdrawal: {
  // for an application whose gates never defer a tool call: withdraw is never expected to run
  readonly none: DraftWithdrawal
}
class DraftWithdrawalFailed extends Schema.TaggedError<DraftWithdrawalFailed>()("DraftWithdrawalFailed", {
  draftId: Schema.String,
  message: Schema.String
}) {}

AgentLoop.plugin({ draftWithdrawal: myApprovalStore.withdrawal, maxSteps: 20 })   // draftWithdrawal is required
```

```
REQUIREMENT: `AgentLoop.plugin` MUST require a `draftWithdrawal` option and
             MUST NOT supply a default. Any provider of `AgentLoop` that can
             publish `awaiting-approval` MUST be constructed with one.
             `DraftWithdrawal.none` MUST be an explicit value whose
             `withdraw` fails with `DraftWithdrawalFailed { message:
             "no draft withdrawal configured" }`.
```

```
REQUIREMENT: A task's *pending draft* is the draft of its
             `awaiting-approval` snapshot, or — from the moment its loop's
             `onDeferred` answers true for a subagent's draft (04,
             BEH-AG-025, BEH-AG-030) until the task publishes
             `awaiting-approval` with it — that subagent's `draftId` and
             `commands`, whether or not the loop has yet read the result.
             A task has at most one pending draft: `onDeferred` answers
             false for a later subagent `Deferred` of the same turn, which
             is not the parent's and is withdrawn by its own subagent's
             task (04, BEH-AG-030).
```

```
REQUIREMENT: The task's own `Deferred` (BEH-AG-012) MUST take precedence
             over a subagent's draft it has not yet published: from the
             moment its own `ToolRunner` returns `Deferred`, its own draft
             is its pending draft and the subagent's is not. When the turn
             ends any way other than publishing `awaiting-approval` with a
             subagent's draft — an answer, `needs-input`, or the task's
             own deferral — no subagent draft is the task's, and each
             subagent of the turn still holding one MUST withdraw it
             through its own task under this behaviour (04, BEH-AG-030). A
             subagent whose task already ended "handed-to-parent" (next
             rule) holds none: when the parent's turn ends without
             publishing that draft, and the draft is not the pending draft
             the parent's own terminal snapshot reports, the parent's loop
             MUST call `draftWithdrawal.withdraw` for it once, with that
             subagent's task id as `taskId`, that task's `cancelled.by` as
             `by` and reason "task-cancelled" (when it failed, reason
             "task-failed" and `by` as `DraftWithdrawal` gives for a
             failed task), under the bounds of this behaviour. No snapshot
             carries the outcome of this withdrawal: the subagent's task
             has already ended "handed-to-parent" and the draft is not the
             parent's pending draft. The loop MUST log the outcome with
             the draft id, a failure or timeout at error level.
```

```
REQUIREMENT: `Tasks.cancel` and `AgentLoop.cancel` (01, BEH-AG-003) MUST
             accept the option `handedDraftId`, the hand-off marker. Only
             `spawnSubagent` passes it, and only for the subagent whose
             draft is its parent task's pending draft (04, BEH-AG-025). The
             marker is trusted input, as `StartRequest.spawn` is (01,
             BEH-AG-003): the cancel handle does not check where it came
             from, and documentation MUST state that an application lets
             no code other than `spawnSubagent` pass it; the MCP bridge
             never does (BEH-AG-014). A cancelled task ends with outcome
             "handed-to-parent" if and only if `handedDraftId` equals its
             pending draft's `draftId`, or the cancel carries no marker
             while that draft is *pending on its parent*: the task is a
             subagent's and `spawn.heldByParent(draftId)` (01, BEH-AG-003)
             answers true when the cancel reaches the handle. Both the
             marker and `heldByParent` derive from one source, the parent
             loop's `pendingDraft` (04, BEH-AG-025), which every provider
             of `AgentLoop` supplies to `spawnSubagent`. A task
             cancelled with a marker that names another draft, or without
             one while its draft is not pending on its parent, ends under
             the next rule. The marker MUST have no other effect.
```

```
REQUIREMENT: When a task with a pending draft ends `cancelled` or `failed`
             — except a task the previous rule ends with outcome
             "handed-to-parent", or a task of a stopped loop whose draft is
             pending on its parent (BEH-AG-011), which calls nothing (04,
             BEH-AG-030) — the
             loop MUST, after the finalizers of
             BEH-AG-010 and before publishing the terminal snapshot, call
             `draftWithdrawal.withdraw` once with the pending draft's
             `draftId` and `commands`, the task id, `by` and `reason`. The call MUST
             be bounded by `timeout` and MUST NOT be interrupted before it
             ends or times out.
```

```
REQUIREMENT: The terminal snapshot MUST carry `draft: { draftId, outcome }`,
             where `outcome` is the answer of `withdraw`, or
             "not-withdrawn" when it failed or timed out. A
             "not-withdrawn" outcome MUST be logged at error level with the
             draft id and the failure's tag, and MUST NOT change the
             terminal state. A task that ends with no pending draft MUST
             NOT carry `draft` and MUST NOT call `withdraw`.
```

```
REQUIREMENT: Documentation MUST state that the package neither withdraws nor
             refuses a draft itself: `withdraw` asks the application's draft
             flow to stop the draft from being applied, and the outcome
             reports what that flow answered. "already-applied" means the
             change was made before the task ended; "not-withdrawn" means
             the draft may still be applied and a person must act on it.
             BEH-AG-012's rule holds: the package MUST NOT approve, store
             or apply drafts.
```

A cancelled task cannot take a late approval (BEH-AG-010), but the draft it
was waiting on lives in the application's approval store, outside the task.
Without a report, an approver could still apply a change that no task is
waiting for and no observer would connect to the cancellation. The loop
cannot remove the draft itself — it stores none — so it tells the party that
holds it, and the terminal snapshot says what that party answered.

**Settled here.** (1) The port is a required option of the loop, not a sixth
service key: BEH-AG-001 fixes the five keys, and the withdrawal belongs with
the application's approval store that `TaintGuard.drafts` already receives
(03, BEH-AG-020). (2) It is required, with `none` as an explicit choice,
because a default that does nothing would reproduce the gap silently. (3) The
alternative — every draft flow checking the task's state before applying —
couples the approval store to the agent package for every draft, agent or
not; reporting at the end of the task keeps the dependency one way.

---

_Previous: [01 — Agent seams](./01-agent-seams.md)_ · _Next: [03 — Taint and provenance](./03-taint-and-provenance.md)_
