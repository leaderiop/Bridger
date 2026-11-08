# 02 — Tasks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-02                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-08): BEH-AG-011 open question restated: command tasks keep records through the command companion's `CommandTaskStore`, agent runs stay in memory; BEH-AG-015 keyed repeats and lost command tasks (round-2 agent review A-08, A-09) (CCR-AG-003)<br>0.3 (2026-11-08): `awaiting-approval` carries every drafted command; approval of a batch draft resumes with one outcome per command, all or none; BEH-AG-015 command tasks of long commands: the loop's wait, the herdr and MCP bridges (CCR-AG-003, round 2: recheck items 5, 7)<br>0.2 (2026-11-08): Task error classes declared; resumption through `ResumeInput`; MCP bridge exposes agent tasks only (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

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
owns BEH-AG-009–016 and uses BEH-AG-009–015; 016 is reserved.

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
  | { readonly state: "failed"; readonly error: { readonly _tag: string; readonly message: string } }
  | { readonly state: "cancelled"; readonly by: Actor }
)
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
REQUIREMENT: `cancel` MUST interrupt the running turn, await its
             finalizers (releasing the pinned toolset, budget reservations
             and any subagent realms, 04 — Subagents), and only then publish
             `cancelled`.
```

Like core's legality table, the table is total, so no concurrent event leaves
a task in an undefined state. A late approval for a cancelled task is refused
with `TaskNotResumable`; it does not revive the task.

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
  readonly cancel: (taskId: string, context?: OperationContext) => Effect.Effect<void, TaskNotFound>
}>()("@bridger/agent/Tasks") {}

class TaskAwaitTimeout extends Schema.TaggedError<TaskAwaitTimeout>()("TaskAwaitTimeout", {
  taskId: Schema.String,
  last: TaskSnapshotSchema                     // the last snapshot seen
}) {}
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
drain bound; `"forever"` must be stated.

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
             application's draft flow (core file 32).
```

A turn that waits for a person holds nothing: the pin is released, so the
re-planned turn sees the current toolset, and no reservation is held across
an approval that may take a day.

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
REQUIREMENT: `McpTaskBridge` MUST expose a task to an MCP client that
             negotiated the tasks extension using exactly this mapping, and
             MUST serve `tasks/get` from `Tasks.get` and status updates
             from `Tasks.changes`.
```

```
REQUIREMENT: The bridge MUST expose only tasks that exist in `Tasks` — runs
             of an `AgentLoop` started for the MCP session's principal — or
             in `CommandTasks` (BEH-AG-015). It MUST NOT create a task for a
             direct MCP `tools/call` that a gate or the taint floor
             deferred: such a call is a plain dispatch with nothing behind
             it that would complete, and the MCP server answers it as an
             `isError` result carrying the draft id
             (`@bridger/mcp`, [server](../../mcp/behaviors/01-server.md),
             BEH-MC-005).
```

```
REQUIREMENT: An MCP `tasks/cancel` MUST call `Tasks.cancel` with the MCP
             session's principal as the context actor. The bridge MUST NOT
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
             only tasks whose `actor` is the observer's principal (the MCP
             session's actor, or the actor the application names for a
             herdr connection). `tasks/cancel` on a command task MUST call
             `CommandTasks.cancel` with the MCP session's principal as the
             context actor.
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

---

_Previous: [01 — Agent seams](./01-agent-seams.md)_ · _Next: [03 — Taint and provenance](./03-taint-and-provenance.md)_
