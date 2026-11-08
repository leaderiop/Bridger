# 06 — Required Acceptance Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-06                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Checks 3, 5, 7 and 9 aligned with the taint floor, `ResumeInput` and subagent attribution (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

The checks every implementation of `@bridger/agent` must pass before any
behaviour of this companion may be cited as evidence
([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).
They run on core's `TestHost` with `ScriptedModel` or `ReplayModel`, never a
live model (BEH-AG-038). This file owns BEH-AG-041–048 and uses 041;
042–048 are reserved.

Planned tests: `packages/agent/test/*.test.ts` *(Planned)*.

## BEH-AG-041: Required acceptance checks

> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md), [ADR-AG-002](../decisions/002-task-snapshot-is-a-state-feed.md), [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md), [ADR-AG-004](../decisions/004-subagent-is-ephemeral-realm-and-narrowed-actor.md), [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Core seam:** [21 — Testing host](../../core/behaviors/21-testing-host.md)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package test suite MUST contain at least one test for each
             of the following:
             1. Each of the five keys has one provider per realm and can be
                replaced with `replace` while no turn holds it; a turn in
                flight holds its providers under leases.
             2. The `ModelAdapter` contract: a stream of events ending in
                exactly one stop; usage reported; errors typed.
             3. A turn pins one toolset; a toolset published mid-turn does
                not reach the model or the tool runner; every tool call is
                one dispatch with the pin and the session context; no
                automatic retry; a turn begun while the session is tainted
                pins with `taintedSelector` when given.
             4. `TaskSnapshot`: every transition of the table and no other;
                terminal states sticky; revisions increase by one;
                `Tasks.await` returns on a requested or terminal state and
                times out as specified; `cancel` of a terminal task is a
                no-op.
             5. A gate `Defer` puts the task in `awaiting-approval`; each
                `ResumeInput` case moves the task as the table says and a
                mismatched one fails with `TaskNotResumable`; a stale
                draft puts it in `stale` and re-plans in a new turn; the
                herdr and MCP bridges map every state as their tables say
                and add none; the MCP bridge creates no task for a direct
                `tools/call`; a bridge failure changes no task.
             6. Taint: annotations carried to gate, hooks, call log and
                stores; every listed source taints before the model reads
                it; taint never clears within a session; a failing
                `TaintPolicy` taints; taint does not leave the session.
             7. Taint and approval: with the command catalog's taint floor
                (command BEH-CM-016), a tainted agent call with an
                auto-allowing gate, or with no gate wired, never runs its
                handler; with `TaintGuard.drafts` wired it ends in
                `awaiting-approval` with a well-formed draft whose expected
                version is the descriptor digest; a failing draft store
                refuses ("gate-defect") and fails the tool call; a tainted
                call routed through another command's handler is still
                tainted; an approval by an actor within the agent's actor
                (`Actor.isWithin`) is refused by the scripted gate.
             8. Provenance reaches tool results, the call log and stored
                session and memory entries as references.
             9. Subagents: ephemeral realm closed with lease drain when the
                subagent ends; narrowed actor; toolset a subset of the
                parent pin; budget carved from the parent and released;
                an unattributed or system parent fails with
                `SubagentParentUnattributed` before any realm exists;
                taint flows both ways; subagent tasks appear under the
                parent.
             10. Testing helpers: `ScriptedModel` fails on any unscripted
                 request; a recorded transcript replays identically and a
                 changed gate shows as `ReplayDiverged` at its call;
                 `EvalHook` failures change no outcome; the reachability
                 check reports an excluded command offered to a principal.
             11. Budget: no model call starts without a reservation from the
                 entitlement companion; usage is committed and the remainder
                 released on every turn outcome, including interruption.
             12. The reference `AgentLoop` and `ToolRunner` plugins can be
                 replaced by application plugins without changing any other
                 key.
```

| REQ | Check | Behaviours | Status |
| --- | ----- | ---------- | ------ |
| REQ-AG-001 | 1. Five keys, one provider per realm, replaceable | [BEH-AG-001](./01-agent-seams.md#beh-ag-001-five-agent-service-keys-each-one-provider-per-realm) | Not run |
| REQ-AG-002 | 2. ModelAdapter contract | [BEH-AG-002](./01-agent-seams.md#beh-ag-002-the-modeladapter-shape) | Not run |
| REQ-AG-003 | 3. One toolset per turn; dispatch only | [BEH-AG-003](./01-agent-seams.md#beh-ag-003-a-turn-pins-one-toolset-and-runs-every-tool-call-through-dispatch), [BEH-AG-005](./01-agent-seams.md#beh-ag-005-toolrunner-is-dispatch-with-the-turns-pinned-toolset) | Not run |
| REQ-AG-004 | 4. Task states, table, revisions, await, cancel | [BEH-AG-009](./02-tasks.md#beh-ag-009-tasksnapshot-is-a-discriminated-union-with-a-monotone-revision), [BEH-AG-010](./02-tasks.md#beh-ag-010-the-transition-table), [BEH-AG-011](./02-tasks.md#beh-ag-011-taskschanges-list-await-and-cancel) | Not run |
| REQ-AG-005 | 5. Approval and stale states; bridges | [BEH-AG-012](./02-tasks.md#beh-ag-012-awaiting-approval-follows-a-gate-defer-and-stale-follows-a-stale-draft), [BEH-AG-013](./02-tasks.md#beh-ag-013-the-herdr-bridge-maps-states-and-adds-none), [BEH-AG-014](./02-tasks.md#beh-ag-014-the-mcp-tasks-bridge) | Not run |
| REQ-AG-006 | 6. Taint annotations, sources, monotonicity | [BEH-AG-017](./03-taint-and-provenance.md#beh-ag-017-taint-and-provenance-are-annotations-on-operationcontext), [BEH-AG-018](./03-taint-and-provenance.md#beh-ag-018-taint-is-monotone-per-session), [BEH-AG-019](./03-taint-and-provenance.md#beh-ag-019-sources-of-taint), [BEH-AG-022](./03-taint-and-provenance.md#beh-ag-022-taint-does-not-sanitize-and-does-not-cross-out-of-the-session) | Not run |
| REQ-AG-007 | 7. Taint floor and TaintGuard drafts | [BEH-AG-020](./03-taint-and-provenance.md#beh-ag-020-a-tainted-session-is-never-auto-allowed) | Not run |
| REQ-AG-008 | 8. Provenance | [BEH-AG-004](./01-agent-seams.md#beh-ag-004-sessionstore-and-memorystore-keep-data-with-its-provenance), [BEH-AG-021](./03-taint-and-provenance.md#beh-ag-021-provenance-reaches-tool-results-the-call-log-and-stored-data) | Not run |
| REQ-AG-009 | 9. Subagents | [BEH-AG-025](./04-subagents.md#beh-ag-025-spawnsubagent-creates-an-ephemeral-realm-bound-to-the-parent-turn), [BEH-AG-026](./04-subagents.md#beh-ag-026-the-subagent-acts-as-a-narrowed-actor), [BEH-AG-027](./04-subagents.md#beh-ag-027-the-subagents-toolset-is-a-subset-of-the-parents-pinned-toolset), [BEH-AG-028](./04-subagents.md#beh-ag-028-the-subagents-budget-is-carved-from-the-parents), [BEH-AG-029](./04-subagents.md#beh-ag-029-taint-flows-into-the-subagent-and-back), [BEH-AG-030](./04-subagents.md#beh-ag-030-subagent-tasks-appear-in-the-feed-under-their-parent) | Not run |
| REQ-AG-010 | 10. Scripted model, replay, eval hook, reachability | [BEH-AG-033](./05-agent-testing.md#beh-ag-033-scriptedmodel-answers-only-what-the-script-says), [BEH-AG-034](./05-agent-testing.md#beh-ag-034-transcript-and-replaymodel), [BEH-AG-035](./05-agent-testing.md#beh-ag-035-replay-on-testhost-is-deterministic), [BEH-AG-036](./05-agent-testing.md#beh-ag-036-evalhook-is-an-advisory-hook-point-per-turn), [BEH-AG-037](./05-agent-testing.md#beh-ag-037-excluded-commands-can-be-shown-unreachable), [BEH-AG-038](./05-agent-testing.md#beh-ag-038-the-required-suite-runs-with-no-live-model) | Not run |
| REQ-AG-011 | 11. Budget reservation | [BEH-AG-006](./01-agent-seams.md#beh-ag-006-budgets-are-reserved-through-the-entitlement-companion-and-the-reference-plugins-are-replaceable) | Not run |
| REQ-AG-012 | 12. Reference plugins replaceable | [BEH-AG-006](./01-agent-seams.md#beh-ag-006-budgets-are-reserved-through-the-entitlement-companion-and-the-reference-plugins-are-replaceable), [BEH-AG-001](./01-agent-seams.md#beh-ag-001-five-agent-service-keys-each-one-provider-per-realm) | Not run |

Every `BEH-AG` identifier of this companion appears in at least one row;
BEH-AG-041 is this list itself.

**Settled here.** No required check calls a live model. Evaluations against
live models — quality, injection red-team corpora, judges — are the
application's suites, fed by `EvalHook`; their results are not evidence for
any behaviour here.

**Open.** Whether check 5's herdr mapping can be run against a real herdr
binary in CI, or only against a recorded socket exchange.

---

_Previous: [05 — Agent testing](./05-agent-testing.md)_
