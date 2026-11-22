# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-AG-INV

`agent/invariants.md`

- 0.6 (2026-11-09): INV-AG-008: a task never ends with its pending draft unreported; INV-AG-004 Related (audit U-12) (CCR-AG-004)
- 0.5 (2026-11-08): INV-AG-001 scoped to commands not declared `readOnly` and retitled (round-2 agent review A-05) (CCR-AG-003)
- 0.4 (2026-11-08): INV-AG-007 added (untrusted output only inside an envelope) (CCR-AG-003, round 2: recheck item 8)
- 0.3 (2026-11-08): INV-AG-001 backed by the command catalog's taint floor (INV-CM-006) (CCR-AG-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-AG-001)
- 0.1 (2026-11-08): Initial draft (CCR-AG-001)                

## BRIDGER-AG-BEH-01

`agent/behaviors/01-agent-seams.md`

- 0.12 (2026-11-11): BEH-AG-003: the loop offers spawning as one reserved tool, `Agent.spawnTool` ("@bridger/agent/spawn"), appended to every request's `tools` when the loop is built with `subagents`, intercepted by `callId` before any dispatch, never a command and never run by `ToolRunner`, its outcome recorded as that call's tool outcome in the messages and the transcript; the `ToolRunner`-only exception and BEH-AG-002's adapter and `ToolCall` rules name it (A2); `SpawnStart.spawnedBy`, carried on every dispatch of a spawned task under `Agent.SpawnedBy` (A1); BEH-AG-005 Settled (3): the parent of a call-path plugin, transitively, and a subagent's ancestor loops (PL1, A1); BEH-AG-007: option `subagents` (SPEC-AUDIT-08) (CCR-AG-011)
- 0.11 (2026-11-11): BEH-AG-003: `SpawnStart.settleDeferred`, which a subagent's loop calls through `TaskRegistry.settle` after publishing `awaiting-approval` (H5); the loop's own `spawnSubagent` call is the named exception to the `ToolRunner`-only rule (A2) (SPEC-AUDIT-07) (CCR-AG-010)
- 0.10 (2026-11-11): BEH-AG-003: `start` registers the task and publishes `queued` before returning its id (A1); `resume` of a task the provider did not register fails `TaskNotFound` or `TaskNotResumable` (PL21); `AgentLoop.cancel` without context resolves its actor as `Tasks.cancel` does, never `Actor.system` (A2); `SpawnStart.heldByParent` derives from the parent loop's `pendingDraft` (H10) (SPEC-AUDIT-06) (CCR-AG-009)
- 0.9 (2026-11-11): BEH-AG-003: the loop registers each task with `TaskRegistry` in its plugin's activation scope and reports through the returned `TaskWriter`; `AgentLoop.cancel` takes `(taskId, context?, options?)` and delegates to `Tasks.cancel`, a cancel without context being by `Actor.system`; `SpawnStart.heldByParent`; the trusted-input documentation rule covers the hand-off marker; BEH-AG-001: `TaskRegistry` is a base service, not a key; BEH-AG-005 Settled (3) and BEH-AG-006: a stopped loop's tasks end `failed` "LoopStopped", and a replacement loop keeps the task rules (SPEC-AUDIT-05 H3, A1, PL3, PL4) (CCR-AG-008)
- 0.8 (2026-11-10): BEH-AG-003: `AgentLoop.cancel` takes the hand-off marker `handedDraftId` as `Tasks.cancel` does (02, BEH-AG-016) (H2); BEH-AG-001: `Tasks` is a base service, not one of the five keys (02, BEH-AG-011) (T1) (CCR-AG-007)
- 0.7 (2026-11-10): Each turn runs under the loop plugin's own principal through `Plugin.Runtime.asSelf`, so a tool call's `onBehalfOf` names the loop (BEH-AG-003, BEH-AG-005, core BEH-BR-258) (H4); `AgentLoop.start` with an unknown session id starts a new session, created by its first `append`, and `AgentStartError` loses `SessionNotFound` (BEH-AG-003, BEH-AG-004) (M10); a tool withdrawn mid-turn never runs a different definition under the same id, while an identical descriptor contributed by another plugin runs (BEH-AG-003, command INV-CM-003) (M12) (CCR-AG-006)
- 0.6 (2026-11-10): Round 2 findings of the specification audit of 2026-11-09 — `StartRequest.spawn` carries a subagent's restricted toolset, taint and parent task, and forbids pinning (BEH-AG-003, H10); a tool withdrawn mid-turn fails with `CommandNotFound`, `ContributionUnavailable` or `ToolChanged` as command dispatch decides (low finding); `onBehalfOf` of a tool call names the loop's plugin, and a tool call that would stop its own loop is settled (BEH-AG-005, core BEH-BR-258; P24); `spawn` is trusted input, set by `spawnSubagent` (review of the round) (CCR-AG-005)
- 0.5 (2026-11-09): The `AgentLoop.plugin` options of BEH-AG-007 and the example of BEH-AG-008 carry the required `draftWithdrawal` (BEH-AG-016, audit U-12) (CCR-AG-004)
- 0.4 (2026-11-08): Resolutions of the round-2 agent review (A-05, A-08, A-09, A-16): `Started` chosen by the descriptor's `long`, never by the output's shape; the idempotency key covers a resubmission within the process, not crash recovery of the run; a step with a long call is not batched; a batch of declared reads from a tainted session runs on the gate's decision, other batches need an approval that also covers their compensations (CCR-AG-003)
- 0.3 (2026-11-08): Steps run under core `CurrentCorrelation`; tool calls carry an idempotency key; tool results reach the model as envelopes; long commands and batches in `ToolOutcome`; `ResumeInput.Approved` carries one outcome per drafted command; BEH-AG-007 model adapter per session through a realm family; BEH-AG-008 a step's tool calls as one batch (CCR-AG-003, round 2: recheck items 1, 5, 7, 8, 9)
- 0.2 (2026-11-08): `ResumeInput`, `taintedSelector`, error classes declared; memory entries keep taint labels; `onBehalfOf` taken by dispatch (CCR-AG-002)
- 0.1 (2026-11-08): Initial draft (CCR-AG-001)                

## BRIDGER-AG-BEH-02

`agent/behaviors/02-tasks.md`

- 0.9 (2026-11-11): BEH-AG-011: the internal write port `TaskRegistry` (provided with `Tasks` by `Tasks.layer()`, used only by providers of `AgentLoop`), `TaskWriter`, and per-task cancel handles that `Tasks.cancel` calls with its context (`Actor.system` when absent); the first cancel to reach a handle decides; a registration's scope is the loop's activation, and when it closes its unfinished tasks end `failed` "LoopStopped" under BEH-AG-016; BEH-AG-010: the cancel is the registered handle, the loop's stop an `error` event; BEH-AG-014: MCP `tasks/cancel` passes no marker; BEH-AG-016: the marker is trusted input passed only by `spawnSubagent`, a cancel without it while a subagent's draft is pending on its parent ends it "handed-to-parent", and the parent's loop withdraws such a draft it does not publish; `DraftWithdrawal.by` defined for a cancel without context (SPEC-AUDIT-05 H3, A1, A2, PL3, PL4) (CCR-AG-008)
- 0.8 (2026-11-10): BEH-AG-011: `Tasks` is a base service built with `Tasks.layer()`, provided by no plugin, so every loop in every realm, a subagent's included, writes the host's one table; `AgentLoop.plugin` requires it (T1); BEH-AG-011 and BEH-AG-016: `Tasks.cancel` takes the hand-off marker `handedDraftId`, set only by `spawnSubagent`, and a task ends "handed-to-parent" only when the marker names its pending draft, otherwise it withdraws (H2); BEH-AG-016: the parent's own `Deferred` takes precedence over a subagent's draft not yet published, and a subagent draft still pending when the turn ends any other way is withdrawn by the subagent's own task (T2); `DraftReport` is present when the task ended with a pending draft, not only while awaiting approval (PL13) (CCR-AG-007)
- 0.7 (2026-11-10): BEH-AG-014 and BEH-AG-015: the bridges list, stream and cancel tasks whose actor is the observer's principal or within it, as the task-id check already did (M7); BEH-AG-014: `McpTaskBridge` is a plugin providing `@bridger/mcp`'s `McpTasks` port, called by the MCP server with the session's info and actor, and pushes `notifications/tasks` for subscribed, admitted task ids through the session's `notify` until `ended` (mcp BEH-MC-008) (M8); BEH-AG-012 and BEH-AG-016: a subagent's deferral is waited on by its parent, and the subagent's task ends with `DraftReport` outcome "handed-to-parent" without a withdrawal; a task's pending draft includes the first subagent `Deferred` of the turn, from the moment it settles until published, so a parent cancelled or failed in that window reports it, and a later subagent `Deferred` of the same turn is withdrawn by its own task; BEH-AG-010 follows (04, BEH-AG-030) (H3) (CCR-AG-006)
- 0.6 (2026-11-10): BEH-AG-014 and BEH-AG-015: a task id from an MCP client is answered as unknown unless the task's actor is the session's principal or within it (round 2 findings of the specification audit of 2026-11-09, low finding) (CCR-AG-005)
- 0.5 (2026-11-09): BEH-AG-016: a task that ends while awaiting approval reports its draft through the loop's required `DraftWithdrawal` option, and the terminal snapshot carries the outcome; BEH-AG-009, 010 and 012 amended (audit U-12) (CCR-AG-004)
- 0.4 (2026-11-08): BEH-AG-011 open question restated: command tasks keep records through the command companion's `CommandTaskStore`, agent runs stay in memory; BEH-AG-015 keyed repeats and lost command tasks (round-2 agent review A-08, A-09) (CCR-AG-003)
- 0.3 (2026-11-08): `awaiting-approval` carries every drafted command; approval of a batch draft resumes with one outcome per command, all or none; BEH-AG-015 command tasks of long commands: the loop's wait, the herdr and MCP bridges (CCR-AG-003, round 2: recheck items 5, 7)
- 0.2 (2026-11-08): Task error classes declared; resumption through `ResumeInput`; MCP bridge exposes agent tasks only (CCR-AG-002)
- 0.1 (2026-11-08): Initial draft (CCR-AG-001)                

## BRIDGER-AG-BEH-04

`agent/behaviors/04-subagents.md`

- 0.8 (2026-11-11): BEH-AG-030: the subagent's loop settles `SubagentHandle.result` with `Deferred` by calling `spawn.settleDeferred` through `TaskRegistry.settle`, ordered with the task's cancels under the registration's lock, and a false answer leaves the draft to the cancel that came first (H5); BEH-AG-025: the scope close fails an unsettled result "parent-ended" through `TaskRegistry.settle` before it cancels, and a result another cancel reached first fails "cancelled" (A1); `spawnSubagent` requires `TaskRegistry` (SPEC-AUDIT-07) (CCR-AG-010)
- 0.7 (2026-11-11): BEH-AG-025: `request.parent.pendingDraft`, supplied by every `AgentLoop` provider; the hand-off marker and `heldByParent` derive from it (H10); BEH-AG-030: a subagent's `Deferred` result and a cancel are decided by the first to reach the handle, and a cancel that wins makes the result `SubagentFailed` "cancelled" (A5) (SPEC-AUDIT-06) (CCR-AG-009)
- 0.6 (2026-11-11): BEH-AG-025: `SubagentError` gains `HostClosed`, which `Realm.ephemeral` raises (PL5); the loop is started with `spawn.heldByParent`, answering as the hand-off marker is decided; only `spawnSubagent` passes the marker (PL3); BEH-AG-030: a cancel without the marker while the subagent's draft is pending on its parent ends it "handed-to-parent", and the first cancel to reach the task decides (A2) (SPEC-AUDIT-05) (CCR-AG-008)
- 0.5 (2026-11-10): BEH-AG-025: `isolate` never lists `Tasks`, a base service no plugin provides, so the subagent's task is in its parent's table (02, BEH-AG-011) (T1); BEH-AG-025 and BEH-AG-030: the scope-close cancel passes the hand-off marker `handedDraftId` only for the subagent whose draft is the parent task's pending draft, and a subagent's task ends "handed-to-parent" only under that marker, otherwise it withdraws (H2); BEH-AG-030: the parent's own `Deferred` wins over a subagent's not yet published, and a subagent draft still pending when the turn ends with an answer, `needs-input` or the parent's own deferral is withdrawn by the subagent's own task (T2) (CCR-AG-007)
- 0.4 (2026-11-10): A subagent that defers ends its turn holding nothing, its `SubagentResult` is the deferral, the parent waits on it and is the task the application resumes; the subagent's task then ends `cancelled` with its draft "handed-to-parent", and only an unsettled result fails `parent-ended`; when several subagents of a turn defer, the parent takes the first to settle and the others withdraw their own drafts; from the moment the result settles the draft is pending on the parent, which reports it if cancelled or failed before publishing it (BEH-AG-025, BEH-AG-030, BEH-AG-016) (H3); the ephemeral realm isolates `AgentLoop`, `ModelAdapter` and every key its plugins provide, which are passed as `DesiredPlugin` entries (BEH-AG-025) (M9); the subagent starts a new session `${parent.sessionId}/sub/${segment}` (BEH-AG-025) (M10) (CCR-AG-006)
- 0.3 (2026-11-10): Round 2 findings of the specification audit of 2026-11-09 — installs run under the parent's context as core `Realm.ephemeral` specifies, the subagent acts with `EphemeralRealm.context`, and `SubagentError` uses core's error unions (BEH-AG-025, BEH-AG-026, P21); the loop is started with `StartRequest.spawn` carrying the restricted toolset, taint and parent task (BEH-AG-025, 027, 029, H10); gate exemption question settled by the loader's wiring (P23) (CCR-AG-005)
- 0.2 (2026-11-08): Parent relation via `Actor.narrow` (BEH-BR-337), not `onBehalfOf`; `SubagentParentUnattributed`; error classes declared (CCR-AG-002)
- 0.1 (2026-11-08): Initial draft (CCR-AG-001)                

## BRIDGER-AG-BEH-06

`agent/behaviors/06-required-acceptance-checks.md`

- 0.10 (2026-11-11): Check 17: withdrawal unless the draft is pending on its parent (A4), result/cancel race (A5), `pendingDraft` (H10), the parent loop's logged withdrawal (A3), cancel actor resolution (A2); check 18: "LoopStopped" withdrawal by `Actor.system` unless pending on the parent (A4, A2), a cancel after the close began (PL23), `start` before return (A1), `resume` on another provider (PL21) (SPEC-AUDIT-06) (CCR-AG-009)
- 0.9 (2026-11-11): Check 6: a session starts with exactly the labels of `spawn.taint` (PL7); check 9: `heldByParent` and `HostClosed` (PL3, PL5); check 16: MCP `tasks/cancel` of an agent task passes the session's principal and no marker; check 17: unmarked cancel of a subagent's task whose draft is pending on its parent, the parent's withdrawal of a handed draft it does not publish, precedence of racing cancels, `by` from the cancel's context (A2, PL4); new check 18 and REQ-AG-018: the task registry, cancel handles and tasks of a stopped loop (H3, A1) (SPEC-AUDIT-05) (CCR-AG-008)
- 0.8 (2026-11-10): Check 9: `isolate` never lists `Tasks`, so a subagent's task is in its parent's table (T1); check 17: "handed-to-parent" only under the hand-off marker naming the task's pending draft, a marker naming another draft or none withdraws, the parent's own `Deferred` wins over a subagent's not yet published, and a subagent draft pending when the parent's turn ends with an answer, `needs-input` or its own deferral is withdrawn by the subagent's task (H2, T2) (CCR-AG-007)
- 0.7 (2026-11-10): Check 3: turns run under the loop's principal, and an unknown session id starts a new session (H4, M10); check 9: realm isolation and `DesiredPlugin` entries, the derived session id, a deferral waited on by the parent and "handed-to-parent" (M9, M10, H3); check 10: a replay mismatch is a `ModelError` (M11); check 16: listings and streams admit actors within the session's principal, the server reaches the bridge through `McpTasks`, and status updates go through the session's `notify` (M7, M8); check 17: the subagent exception, a parent cancelled before publishing a subagent's draft, and two subagents deferring in one turn (H3) (CCR-AG-006)
- 0.6 (2026-11-10): Check 3 covers `StartRequest.spawn` (H10); check 9 the attribution and errors of `Realm.ephemeral` (P21); check 16 the actor rule for task ids from MCP clients (low finding) (CCR-AG-005)
- 0.5 (2026-11-09): Check 17 and REQ-AG-017: draft withdrawal when a task ends awaiting approval (audit U-12) (CCR-AG-004)
- 0.4 (2026-11-08): Checks 7, 15 and 16 follow the round-2 agent review: declared reads from a tainted session, steps with long calls not batched, compensations covered by the batch approval, `Started` by descriptor (CCR-AG-003)
- 0.3 (2026-11-08): Checks 3, 5 and 10 extended; checks 13–16 for model families, batches, envelopes and command tasks (CCR-AG-003, round 2: recheck items 1, 5, 7, 8, 9)
- 0.2 (2026-11-08): Checks 3, 5, 7 and 9 aligned with the taint floor, `ResumeInput` and subagent attribution (CCR-AG-002)
- 0.1 (2026-11-08): Initial draft (CCR-AG-001)                
