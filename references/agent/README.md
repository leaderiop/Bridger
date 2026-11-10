# Bridger Agent — Companion Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-00                                                |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Master Index                       |
> | Change History | 0.7 (2026-11-10): Register row CCR-AG-006 (round 3 findings of the specification audit of 2026-11-10: H3, H4, M7, M9, M10, M11, M12, agent side of M8, low finding) (CCR-AG-006)<br>0.6 (2026-11-10): Register row CCR-AG-005 (round 2 findings of the specification audit of 2026-11-09: H10, P21, P23, P24, low findings); follow-ups added to row CCR-AG-005 (CCR-AG-005)<br>0.5 (2026-11-09): Register row CCR-AG-004 (audit of 2026-11-09: U-12); CCR-AG-004 row: the examples of BEH-AG-007, 008, 023 and 036 pass the required `draftWithdrawal` (CCR-AG-004)<br>0.4 (2026-11-08): CCR-AG-003 extended with the resolutions of the round-2 agent review (A-03, A-05, A-08, A-09, A-16, agent side); item 7 recorded as partly closed (CCR-AG-003)<br>0.3 (2026-11-08): Register row for CCR-AG-003 (CCR-AG-003, round 2: recheck items 1, 5, 7, 8, 9; X6, X8)<br>0.2 (2026-11-08): Register row for CCR-AG-002 (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/agent`, a companion package of
`@bridger/core`. It gives an application that runs language-model agents on a
Bridger host a small set of replaceable service keys (`ModelAdapter`,
`AgentLoop`, `SessionStore`, `MemoryStore`, `ToolRunner`), a task state feed
(`TaskSnapshot`, `Tasks.await`) with bridges to external observers, taint and
provenance carried in the operation context, subagents in ephemeral realms
with narrowed actors, and helpers for testing agents deterministically.

It sits on top of [`@bridger/command`](../command/README.md), which provides
the command catalog, dispatch and toolsets, and next to
[`@bridger/mcp`](../mcp/README.md), which exposes and imports tools over the
Model Context Protocol. Budgets are defined by the
[entitlement companion](../entitlement/README.md) and only consumed here.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*. The
line `implementation: absent` above has the meaning it has in the
[core README](../core/README.md): while it says `absent`, no document here may
call itself Effective and no decision may call itself Accepted
([ADR-BR-036](../core/decisions/036-prospective-specification.md)).

This specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

The [core rule](../core/README.md#the-honest-claims-rule) applies unchanged.
In particular this package makes **no** claim that an agent built with it is
safe, that its taint tracking catches every untrusted input, that a subagent's
realm isolates anything, or that the package is validated or compliant with
any regulation. Taint is a label the package propagates by the rules stated
here; it is only as complete as the sources the application declares
([03 — Taint and provenance](./behaviors/03-taint-and-provenance.md)). An
ephemeral realm is a resolution namespace, not a boundary
([ADR-BR-019](../core/decisions/019-realms-are-resolution-namespaces.md)).
Model output is never trusted by the package; every effect it causes passes
through command dispatch and its gate.

## What stays in the application

- Which commands an agent may see, and the rules that decide a regulated
  command (the application's toolset selector and gate; see
  [`@bridger/command`](../command/README.md)).
- Model choice, prompts, skills, and any model vendor adapter.
- Which inputs are untrusted beyond the defaults of BEH-AG-019, and how an
  approval is obtained from a person.
- Budget amounts and grace rules (the entitlement companion's ports, the
  application's numbers).
- Personal-data filtering before a model call.

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, public API surface, worked example |
| 2 | [Behaviours](./behaviors/01-agent-seams.md) | What the package must do, as `BEH-AG` requirements |
| 3 | [Invariants](./invariants.md) | Properties that hold for every execution |
| 4 | [Decisions](./decisions/001-agent-is-swappable-keys.md) | Why, as `ADR-AG` records |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Agent seams](./behaviors/01-agent-seams.md) | BEH-AG-001–008 |
| 02 | [Tasks](./behaviors/02-tasks.md) | BEH-AG-009–016 |
| 03 | [Taint and provenance](./behaviors/03-taint-and-provenance.md) | BEH-AG-017–024 |
| 04 | [Subagents](./behaviors/04-subagents.md) | BEH-AG-025–032 |
| 05 | [Agent testing](./behaviors/05-agent-testing.md) | BEH-AG-033–040 |
| 06 | [Required acceptance checks](./behaviors/06-required-acceptance-checks.md) | BEH-AG-041–048 |

Each file owns a block of eight identifiers; unused numbers at the end of a
block are reserved, not gaps, as in core
([identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Title |
| --- | ----- |
| [ADR-AG-001](./decisions/001-agent-is-swappable-keys.md) | The agent is a set of replaceable keys, not a framework |
| [ADR-AG-002](./decisions/002-task-snapshot-is-a-state-feed.md) | `TaskSnapshot` is a state feed; bridges map, never extend |
| [ADR-AG-003](./decisions/003-taint-is-monotone-and-forbids-auto-allow.md) | Taint is monotone per session and forbids automatic allow |
| [ADR-AG-004](./decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md) | A subagent is an ephemeral realm and a narrowed actor, never wider |
| [ADR-AG-005](./decisions/005-agent-tests-replay-deterministically.md) | Agent tests replay deterministically; no live model in the required suite |

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-AG-NNN` | Functional behaviour requirement (blocks of eight per file) |
| `INV-AG-NNN` | Runtime invariant |
| `ADR-AG-NNN` | Architecture decision |
| `REQ-AG-NNN` | Acceptance scenario (planned), defined in [06](./behaviors/06-required-acceptance-checks.md) |
| `CCR-AG-NNN` | Change control record |

Document IDs: `BRIDGER-AG-00` (this file), `BRIDGER-AG-OVW`, `BRIDGER-AG-INV`,
`BRIDGER-AG-BEH-NN`, `BRIDGER-AG-ADR-NNN`. The rules of the
[core identifier scheme](../core/process/requirement-id-scheme.md) apply with
the infix `AG`; changes follow [core change control](../core/process/change-control.md).

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-AG-001 | 2026-11-08 | Initial draft of the `@bridger/agent` companion specification (gap report item 12, roadmap step B6): agent service keys, task state feed and bridges, taint and provenance, subagents, agent testing helpers.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AG-001–006, 009–014, 017–022, 025–030, 033–038, 041; INV-AG-001–006; ADR-AG-001–005; REQ-AG-001–012 added; nothing withdrawn. (2) Risk: new risks proposed for the core register by the integration notes (taint bypass, subagent widening, task state misreported); no core score changed. (3) GxP impact: indirect — an agent's writes reach the host or the application only through command dispatch and its gate; no audit record or core behaviour changes. (4) Revalidation: nothing released or qualified (implementation absent); none. (5) Compatibility: new package, no existing public type changed; depends on core seams of files 28, 29, 30, 32 and 33 and on the entitlement companion's `Budget`. |
| CCR-AG-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (findings R5-01, R5-03, R5-05, R5-12, R5-13, R5-14, R5-15, R5-16, R5-21, R5-23; agent side of R5-04), aligned with core CCR-BR-022: the no-auto-allow rule now rests on the command catalog's taint floor (command BEH-CM-016) and `TaintGuard` is a draft source (`TaintGuard.drafts`), not a plugin installing a mandatory interception (BEH-AG-020, INV-AG-001, ADR-AG-003); approvals bound to digest and input digest; tainted sessions narrow tools only through `StartRequest.taintedSelector` (BEH-AG-022); `ResumeInput` defined (BEH-AG-003, BEH-AG-012); provenance entries `{ source, ref }` (BEH-AG-021); subagent parent relation through `Actor.narrow` and `SubagentParentUnattributed` (BEH-AG-026); MCP bridge exposes agent tasks only (BEH-AG-014); error classes declared; neutral example input.<br>**Impact (PROC-03 §3).** (1) Identifiers: none added or withdrawn; BEH-AG-003, 004, 005, 010–012, 014, 017, 020–022, 025–027, 035 and 041, INV-AG-001 and ADR-AG-003 amended. (2) Risk: the proposed "taint bypass" risk is now mitigated by a stated mechanism; no core score changed. (3) GxP impact: none beyond CCR-AG-001. (4) Revalidation: none (implementation absent). (5) Compatibility: `TaintGuard.plugin` removed in favour of `TaintGuard.drafts`; `MemoryEntry` gains `taint`. |
| CCR-AG-003 | 2026-11-08 | Round 2: recheck items 1, 5, 7, 8 and 9 (agent side) and contradictions X6 and X8 (Bridger recheck of 2026-11-08), aligned with core round 2 (CCR-BR-024–026) and command CCR-CM-003. Closed: (9) `ModelAdapter` resolved per session through an application-owned realm family (BEH-AG-007); (5) a step's tool calls as one `Commands.batch`, batch drafts approved all or none with one outcome per command, `TaintGuard.drafts` drafts batches (BEH-AG-008, BEH-AG-009, BEH-AG-012, BEH-AG-020; X6); (7) long commands' tasks awaited by the loop and exposed by the herdr and MCP bridges (BEH-AG-015); (8) tool results reach the model only as size-capped envelopes, untrusted fields taint the session (BEH-AG-019, BEH-AG-023, INV-AG-007); (1) tool calls carry an idempotency key when enabled (BEH-AG-005); X8 — inbound MCP sessions now arrive tainted (`mcp-inbound:` label, BEH-AG-017; set by `@bridger/mcp`). Also: steps run under core `CurrentCorrelation` (BEH-AG-003); `EvalHook` written with core 31's options (BEH-AG-036). Extended by the round-2 agent review (agent side of A-03, A-05, A-08, A-09, A-16): the taint rule forbids automatic allow of changes — commands declared `readOnly` keep the gate's decision under the command catalog's exemption, the session keeps its taint (BEH-AG-020, INV-AG-001 retitled, ADR-AG-003; A-05), and BEH-AG-008 no longer claims that read-only batches run unchanged without saying why; a tainted batch's approval covers its compensations (command BEH-CM-051; A-03); `Started` chosen by the descriptor's `long`, steps with a long call not batched (BEH-AG-005, BEH-AG-008; A-09, A-16); BEH-AG-005 Settled (2) no longer suggests crash recovery, and item 7 is partly closed — command tasks keep records through the command companion's `CommandTaskStore` (BEH-CM-054), agent runs stay in memory (BEH-AG-011 open question; A-08). Amended: BEH-AG-005, 008, 011, 015, 020, REQ-AG-007, 015, 016, INV-AG-001, ADR-AG-003; no identifier added. Compatibility: Draft-level — none to the API.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AG-007, 008, 015, 023; INV-AG-007; REQ-AG-013–016 added; BEH-AG-002, 003, 005, 009, 012–014, 017, 019–021, 036, 041 amended; nothing withdrawn. (2) Risk: no core score changed; the proposed "taint bypass" risk gains the envelope and inbound-taint controls (integration notes). (3) GxP impact: none beyond CCR-AG-001 — writes still reach state only through command dispatch and its gate. (4) Revalidation: none (implementation absent). (5) Compatibility: Draft-level — `TaskSnapshot` `awaiting-approval` carries `commands` instead of `command`; `ResumeInput.Approved` carries `outcomes`; `ToolOutcome` gains `Started` and `Deferred.commands`, `Ok.output` is the encoded output; `TaintDraftStore.create` takes a list of requests; `ToolCallRequest.context` no longer carries the correlation. |
| CCR-AG-004 | 2026-11-09 | Resolution of the audit of 2026-11-09, finding U-12 (cancelling an agent task left its draft applicable). This is an agent review, not the independent review of PROC-03 §5. New BEH-AG-016: when a task leaves `awaiting-approval` for `cancelled` or `failed`, the loop calls the application's draft flow through the required `AgentLoop.plugin` option `draftWithdrawal` (`DraftWithdrawal.withdraw`, bounded, not interruptible) after the finalizers and before the terminal snapshot, which carries `draft: { draftId, outcome }` with "withdrawn", "already-applied" or "not-withdrawn"; `DraftWithdrawal.none` is an explicit choice; error `DraftWithdrawalFailed`. The package still approves, stores and applies no draft. Chosen over the finding's alternative (every draft flow checks the task's state before applying) so that the approval store does not depend on the agent package. Kit catalog row and `docs/guides/error-catalog.md` entry for `DraftWithdrawalFailed` (kit CCR-KT-004).<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AG-016 (previously reserved), INV-AG-008, REQ-AG-017 added; BEH-AG-009, BEH-AG-010, BEH-AG-012 and INV-AG-004 amended; the examples of BEH-AG-007, BEH-AG-008, BEH-AG-023 and BEH-AG-036 pass the required option; nothing withdrawn. (2) Risk: closes a path by which a change could be applied after the task that proposed it was cancelled, with nothing connecting the two; bears on the approval controls of core file 32; no score changed. (3) GxP impact: yes — what an approver and an observer are told about a pending change when its task ends; the approval decision itself stays the application's. (4) Revalidation: none; nothing is implemented or qualified. (5) Compatibility: draft API change — `AgentLoop.plugin` gains a required option; terminal snapshots `failed` and `cancelled` gain an optional `draft`. |
| CCR-AG-005 | 2026-11-10 | Round 2 findings of the specification audit of 2026-11-09, agent side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H10 (a subagent could not receive the parent's restricted toolset or taint): `StartRequest.spawn` (`SpawnStart`: `parentTaskId`, the restricted `PinnedToolset`, the parent's taint labels), set only by `spawnSubagent`; with it the loop pins nothing, reads no selector, uses the given toolset every turn, adds the taint before its first model call and reports `parentTaskId` (BEH-AG-003, BEH-AG-025, 027, 029). P21 (subagent installs attributed to the narrowed actor, against core): `spawnSubagent` passes the parent's context to `Realm.ephemeral`, which installs and tears down under the owner's context (core BEH-BR-336); the subagent acts with `EphemeralRealm.context`; `SubagentError` uses core's `Realm.ephemeral` and `EphemeralRealm.use` unions instead of `InstallError` (BEH-AG-025, BEH-AG-026). P23 (agent side): the open question on gate exemption is settled by the loader's wiring (loader CCR-LD-005). P24 (agent side): `onBehalfOf` of a tool call names the loop's plugin, since a service method runs under its caller's principal (core BEH-BR-258), so the host tools refuse a plan that would stop the loop running the turn; a Settled note states core's outcome for other commands (BEH-AG-005). Low findings: a task id from an MCP client is answered as unknown unless the task's actor is the session's principal or within it (BEH-AG-014, BEH-AG-015); a tool withdrawn mid-turn fails with `CommandNotFound`, `ContributionUnavailable` or `ToolChanged` as command dispatch decides (BEH-AG-003). Checks 3, 9 and 16 amended.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AG-003, 005, 014, 015, 025, 026, 027, 029 and 041 (checks 3, 9, 16) amended; REQ-AG-016 row amended; type `SpawnStart` added; none withdrawn. (2) Risk: closes a path by which a subagent could act with a wider toolset or untainted (INV-AG-003, INV-AG-005) and one by which an MCP client could read or cancel another principal's task; no core score changed. (3) GxP impact: yes — attribution of subagent installs now follows core (the parent's actor), and task cancellation is limited to the owning principal; no audit record schema changes. (4) Revalidation: none (implementation absent); REQ-AG-003, REQ-AG-009 and REQ-AG-016 cover the change. (5) Compatibility: draft to draft — `StartRequest` gains an optional field; `SubagentError` members change; MCP clients lose access to tasks of other principals. **Follow-ups.** `UnreachableViolation`, the error of `AgentTest.assertUnreachable`, stood in an error position and was never declared; it is declared with the fields BEH-AG-037 names (`principal`, the `Actor`'s id; `command`) (05); no behaviour changed. |
| CCR-AG-006 | 2026-11-10 | Round 3 findings of the specification audit of 2026-11-10 (SPEC-AUDIT-03), agent side. This is an agent review, not the independent review of PROC-03 §5. **Findings resolved.** H3 (a subagent's approval could never be resumed): a subagent that defers ends its turn holding nothing and its `SubagentResult` is the deferral; the parent ends its step and turn with `awaiting-approval` on that draft and is the task the application resumes; the subagent's task then ends `cancelled` with `DraftReport` outcome "handed-to-parent" and no withdrawal; only an unsettled result fails `parent-ended`; a task's pending draft includes one a subagent's result handed it from the moment the result settles, so a parent cancelled or failed before publishing it reports it for withdrawal and no draft is left unreported; when several subagents of one turn defer, the parent takes the first to settle and each other subagent's task withdraws its own draft under BEH-AG-016 (drafts are not merged: the package creates none) (BEH-AG-025, BEH-AG-030, BEH-AG-010, BEH-AG-012, BEH-AG-016, INV-AG-008). H4 (the loop never ran under its own principal): each turn runs under the loop plugin's principal through `Plugin.Runtime.asSelf`, so `onBehalfOf` names the loop and `PlanAffectsCaller` sees it (BEH-AG-003, BEH-AG-005). M7: the bridges' listings and streams admit actors within the observer's principal, as the task-id check did (BEH-AG-014, BEH-AG-015). M8 (agent side): `McpTaskBridge` provides `@bridger/mcp`'s `McpTasks` port and pushes status updates through the session's `notify` until `ended` (BEH-AG-014; mcp CCR-MC-006). M9: the ephemeral realm isolates `AgentLoop`, `ModelAdapter` and every key its plugins provide, passed as `DesiredPlugin` entries (BEH-AG-025). M10: `start` with an unknown session id starts a new session, created by its first `append`; a subagent's session is `${parent.sessionId}/sub/${segment}` (BEH-AG-003, BEH-AG-004, BEH-AG-025). M11: `ReplayModel` fails a mismatch as `ScriptedModel` does (BEH-AG-034). M12: "never a different handler" narrowed to "never a different definition"; an identical descriptor from another plugin runs (BEH-AG-003). Low: the paired dispatch of an excluded command ends in `ToolNotInToolset` or `CommandRefused` (BEH-AG-037). Checks 3, 9, 10, 16 and 17 amended.<br>**Impact (PROC-03 §3).** (1) Identifiers: BEH-AG-003, 004, 005, 010, 012, 014, 015, 016, 025, 030, 034, 037 and 041 (checks 3, 9, 10, 16, 17), INV-AG-008 amended; type `SubagentResult` defined; `DraftReport` outcome "handed-to-parent" added; `AgentStartError` loses `SessionNotFound`; none withdrawn. (2) Risk: a plan that would stop the loop running a turn is now refused as specified; a subagent's draft is no longer orphaned; no core score changed. (3) GxP impact: yes — host mutations made during a turn are recorded `onBehalfOf` the loop plugin instead of the caller's plugin or none; no record schema changes. (4) Revalidation: none (implementation absent); REQ-AG-003, 009, 010, 016 and 017 cover the change. (5) Compatibility: draft to draft — `spawnSubagent`'s `parent` gains `sessionId`; `SessionNotFound` no longer comes from `start`; MCP observers now see their subagents' tasks in listings. |
