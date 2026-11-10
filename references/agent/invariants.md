# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-INV                                               |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-10): INV-AG-008: the exception is a subagent's task cancelled with the hand-off marker naming its pending draft; a subagent draft not taken by its parent, including when the parent's turn ends with an answer, `needs-input` or its own deferral, is withdrawn by the subagent's own task (BEH-AG-016, BEH-AG-030) (H2, T2) (CCR-AG-007)<br>0.7 (2026-11-10): INV-AG-008: a subagent's task whose deferral its parent waits on reports its draft as "handed-to-parent", and the parent's task, holding it as pending from the moment the subagent's result settles, reports it if it ends without it (BEH-AG-016, BEH-AG-030) (H3) (CCR-AG-006)<br>0.6 (2026-11-09): INV-AG-008: a task never ends with its pending draft unreported; INV-AG-004 Related (audit U-12) (CCR-AG-004)<br>0.5 (2026-11-08): INV-AG-001 scoped to commands not declared `readOnly` and retitled (round-2 agent review A-05) (CCR-AG-003)<br>0.4 (2026-11-08): INV-AG-007 added (untrusted output only inside an envelope) (CCR-AG-003, round 2: recheck item 8)<br>0.3 (2026-11-08): INV-AG-001 backed by the command catalog's taint floor (INV-CM-006) (CCR-AG-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-AG-001)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

Properties of `@bridger/agent` that hold for every execution. The shape is
that of the [core invariants](../core/invariants.md): statement, **Source**,
**Implication**, **Verification**, **Related**. Nothing below is implemented;
every Source and Verification is *(Planned)*, and no invariant here may be
cited as evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-AG-001: A tainted session is never auto-allowed a change

A command not declared `readOnly` that the agent dispatches while its
session is tainted runs its handler only if an application gate is wired, the request re-dispatches an approved
draft (an `ApprovalRef` bound by dispatch to the same descriptor digest and
the same input digest), and that gate allows it; every other outcome is a
deferral (with `TaintGuard.drafts` wired) or a refusal. This holds because
the session's taint is on every agent dispatch before the model reads the
tainted text (BEH-AG-017 to BEH-AG-019) and the command catalog's taint floor
applies to every dispatch, nested or not
([INV-CM-006](../command/invariants.md#inv-cm-006-a-tainted-dispatch-not-declared-read-only-never-runs-on-an-automatic-allow)).

**Source**: `packages/agent/src/Taint.ts`, `packages/agent/src/ToolRunner.ts`
*(Planned)* — labels added before the model call, carried on every dispatch;
`packages/command/src/Commands.ts` *(Planned)* — the taint floor of command
BEH-CM-016; `packages/agent/src/TaintGuard.ts` *(Planned)* — the draft
source.

**Implication**: text from an imported tool, a tagged untrusted output or a
tainted memory can steer what an agent proposes, but cannot make a change
happen through dispatch on an automatic decision. A command declared
`readOnly` keeps the gate's decision (command BEH-CM-016), so a tainted
session can still look things up; the guarantee is then as sound as that
declaration, which is not enforced (command BEH-CM-006). Whether the approval is
genuine, and was not given by the agent itself, is the application gate's
check; a source of untrusted text nobody declared is not covered.

**Verification** *(Planned)*: scenario and property tests over gate answers,
taint states, nested dispatch and draft-store failures (acceptance check 7,
and command acceptance check 13).

**Related**: BEH-AG-005, BEH-AG-012, BEH-AG-020, BEH-AG-029; ADR-AG-003.

## INV-AG-002: A turn sees one toolset

Every model request and every tool call of one turn uses the toolset pinned at
the start of that turn; a re-plan is a new turn with a new pin.

**Source**: `packages/agent/src/AgentLoop.ts` *(Planned)* — `Toolsets.pin`
in the turn's scope; `packages/agent/src/ToolRunner.ts` *(Planned)* — every
dispatch passes the pin.

**Implication**: the model is never offered one list and executed against
another; a changed or removed tool fails with a typed error.

**Verification** *(Planned)*: scenario tests that publish a new toolset
mid-turn on `TestHost` (acceptance check 3).

**Related**: BEH-AG-003, BEH-AG-005, BEH-AG-027; ADR-AG-001.

## INV-AG-003: A subagent is never wider than its parent

A subagent's toolset is a subset of its parent's pinned toolset, its budget is
carved from the parent's reservation, and its actor is a narrowing of the
parent's actor.

**Source**: `packages/agent/src/Subagent.ts` *(Planned)* — intersection of
requested tools with the parent pin; budget sub-reservation through the
entitlement companion; `Actor.narrow` and `Realm.ephemeral` of [core file 33](../core/behaviors/33-realm-families.md).

**Implication**: delegation cannot be used to escape a principal's toolset,
budget or attribution.

**Verification** *(Planned)*: property test over generated subagent requests
(acceptance check 9); the static reachability check of BEH-AG-037.

**Related**: BEH-AG-025, BEH-AG-026, BEH-AG-027, BEH-AG-028, BEH-AG-037; ADR-AG-004.

## INV-AG-004: Task terminal states are sticky and revisions never regress

A task in `done`, `failed` or `cancelled` never changes state again, and each
task's snapshot revision increases by one on every transition.

**Source**: `packages/agent/src/Tasks.ts` *(Planned)* — the transition table
of BEH-AG-010 as the only writer of task state.

**Implication**: an observer — an activity panel, herdr, an MCP client — never
sees a finished task resume, and can detect missed transitions.

**Verification** *(Planned)*: property test over generated event sequences
against the transition table (acceptance checks 4 and 5).

**Related**: BEH-AG-009, BEH-AG-010, BEH-AG-011, BEH-AG-013, BEH-AG-014, BEH-AG-016, BEH-AG-030; INV-AG-008; ADR-AG-002.

## INV-AG-005: Taint is monotone per session

Once a session is tainted it stays tainted for its lifetime, and taint flows
into its subagents and back from them.

**Source**: `packages/agent/src/Taint.ts` *(Planned)* — labels are only ever
added to core's `Annotation.Taint`, which core combines by union and declares
monotonic ([core file 30](../core/behaviors/30-operation-context-annotations.md)).

**Implication**: untrusted text read early in a session cannot be "forgotten"
before a write later in the session.

**Verification** *(Planned)*: property test over generated session histories
(acceptance check 6).

**Related**: BEH-AG-004, BEH-AG-017, BEH-AG-018, BEH-AG-019, BEH-AG-022, BEH-AG-029; ADR-AG-003.

## INV-AG-006: A replayed run is identical to its recording

Replaying a transcript on `TestHost` with the same plugin set, `TestClock` and
counter identifiers yields the same task snapshots and dispatch requests, or
fails with `ReplayDiverged`.

**Source**: `packages/agent/src/testing/ReplayModel.ts` *(Planned)*; time and
ids from the host's `Clock` and `IdGenerator` only.

**Implication**: agent behaviour can be regression-tested without a live
model, and a gate or tool change shows as a divergence at the call it affects.

**Verification** *(Planned)*: record-and-replay tests (acceptance check 10).

**Related**: BEH-AG-033, BEH-AG-034, BEH-AG-035, BEH-AG-038; ADR-AG-005.

## INV-AG-007: Untrusted tool output reaches the model only inside an envelope

Every tool result the reference loop shows to a model, stores or replays is a
`ModelEnvelope` of the command companion, bounded by `maxToolResultBytes`,
with every value at an untrusted output path listed as a numbered untrusted
entry; a result that holds such a value taints the session.

**Source**: `packages/agent/src/AgentLoop.ts` *(Planned)* — the loop renders
each `Ok` with `Command.envelope` before appending the tool message.

**Implication**: untrusted text is marked and bounded in what the model reads,
and the gate's rule for tainted sessions applies to whatever follows. The
guarantee is about presentation and labelling; it does not detect or remove
instructions in the text.

**Verification** *(Planned)*: tests over commands with and without untrusted
paths, an imported command and an oversized output (acceptance check 14).

**Related**: BEH-AG-019, BEH-AG-023; command BEH-CM-030; ADR-AG-003.

## INV-AG-008: A task never ends with its pending draft unreported

A task that is cancelled or fails with a pending draft — while
`awaiting-approval`, or holding a draft a subagent's result handed it that it
has not yet published — asks the application's draft flow to withdraw that
draft before its terminal snapshot
is published, and the terminal snapshot says what the flow answered:
"withdrawn", "already-applied" or "not-withdrawn". The one exception is a
subagent's task whose draft its parent took: its parent cancels it with the
hand-off marker `handedDraftId` naming that draft, and it ends with
"handed-to-parent" and asks nothing, because the draft is pending on the
parent's task, which reports it under this invariant if it ends without it.
A subagent's draft the parent did not take — a later `Deferred`, or any
subagent draft when the parent's turn ends with an answer, `needs-input` or
its own deferral — is withdrawn by the subagent's own task.

**Source**: `packages/agent/src/AgentLoop.ts` *(Planned)* — the loop's end of
task path, which calls the required `DraftWithdrawal` option.

**Implication**: an approver is never left holding a draft whose task has
ended without the application having been told, and an observer of the task
sees whether the change can still happen. The package does not itself stop
the draft from being applied; a "not-withdrawn" outcome means a person must
act on it.

**Verification** *(Planned)*: tests that cancel and fail a task in each state,
with a withdrawal that answers, fails and times out (acceptance check 17).

**Related**: BEH-AG-010, BEH-AG-012, BEH-AG-016, BEH-AG-030; INV-AG-004; ADR-AG-002.
