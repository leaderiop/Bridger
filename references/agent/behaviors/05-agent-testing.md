# 05 — Agent Testing

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-05                                            |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-11): BEH-AG-035: during replay a reserved spawn call runs no subagent — the loop answers it with the outcome recorded for its `callId` through `SpawnReplay`, provided by `ReplayModel.layer`, a missing or different one failing `ReplayDiverged` — reverting revision 0.7's run of `spawnSubagent` during replay; BEH-AG-034: the transcript captures no element of a spawned subagent, whose own run is replayed from its own transcript; `ScriptedModel.plugin` for a subagent's `subagents.plugins`; replayed outcomes in `ToolCall` order, and a recorded `Deferred` spawn outcome replayed as recorded with no hand-off; second pass (cleanest design): BEH-AG-035: the loop's own answer to a spawn call is a `ToolRefused`, compared with the recorded outcome by tag and message (A1) (SPEC-AUDIT-09 H3) (CCR-AG-012)<br>0.7 (2026-11-11): BEH-AG-034: the transcript's `tools` include the reserved spawn call's outcome, which the loop reports under its `callId`; BEH-AG-035: a spawn call runs `spawnSubagent` during replay (SPEC-AUDIT-08 A2) (CCR-AG-011)<br>0.6 (2026-11-10): BEH-AG-034: `ReplayModel` fails a mismatched or unrecorded request as `ScriptedModel` does, with `ModelError` "other" and a recorded `ScriptMismatch` (M11); BEH-AG-037: the paired dispatch of an excluded command ends in `ToolNotInToolset` or `CommandRefused`, not a gate outcome name (low finding) (CCR-AG-006)<br>0.5 (2026-11-10): round 2 follow-up: `UnreachableViolation` declared (BEH-AG-037) (CCR-AG-005)<br>0.4 (2026-11-09): BEH-AG-036's example passes the required `draftWithdrawal` (BEH-AG-016, audit U-12) (CCR-AG-004)<br>0.3 (2026-11-08): `EvalHook` written with core 31's options (no veto codes, an application `who`, advisory registrations, dormant advisers skipped) (CCR-AG-003, round 2: core round 2 alignment)<br>0.2 (2026-11-08): `ReplayDiverged` declared (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

A live model answers differently from one run to the next, so a test that
calls one proves little and cannot serve as evidence. This file specifies the
testing entry point `@bridger/agent/testing`: a scripted model that answers
only what it was told to, a transcript and replay model that reproduce a
recorded run on core's `TestHost`
([21 — Testing host](../../core/behaviors/21-testing-host.md)), an advisory
eval hook point for scoring runs, and a static check that commands an
application excludes are unreachable by an agent. It mirrors core's scripted
gate, which makes no implicit decision
([BEH-BR-182](../../core/behaviors/21-testing-host.md)). This file owns
BEH-AG-033–040 and uses BEH-AG-033–038; 039 and 040 are reserved.

Planned source: `packages/agent/src/testing/*.ts` *(Planned)*.

## BEH-AG-033: ScriptedModel answers only what the script says

> **See:** [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)

```ts
// illustrative — not type-checked
ScriptedModel.layer(script: ReadonlyArray<ScriptStep>): Layer.Layer<ModelAdapter>
ScriptedModel.plugin(script: ReadonlyArray<ScriptStep>): Plugin.Any   // provides ModelAdapter alike, for a subagent's `subagents.plugins` (01, BEH-AG-007)
interface ScriptStep {
  readonly expect?: (request: ModelRequest) => boolean       // optional assertion on the request
  readonly respond: ReadonlyArray<ModelEvent>                // events emitted, in order, ending with Stop
}
class ScriptMismatch extends Schema.TaggedError<ScriptMismatch>()("ScriptMismatch", {
  step: Schema.Number, reason: Schema.Literals(["expect-failed", "script-exhausted"])
}) {}
```

```
REQUIREMENT: The n-th `generate` call MUST emit exactly the events of step
             n. When `expect` returns false, or there is no step n, the call
             MUST fail with `ModelError { kind: "other" }` whose message
             names the step, and the scripted model MUST record a
             `ScriptMismatch` that the test can read; it MUST NOT emit a
             default answer.
```

```
REQUIREMENT: A step whose `respond` does not end with a `Stop` event MUST be
             rejected when the layer is built, as a defect.
```

A scripted model that invents an answer when the script runs out would let a
test pass on behaviour nobody wrote down, as an allow-all gate would.

## BEH-AG-034: Transcript and ReplayModel

> **Invariant:** [INV-AG-006](../invariants.md#inv-ag-006-a-replayed-run-is-identical-to-its-recording)
> **See:** [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md)

```ts
// illustrative — not type-checked
interface Transcript {
  readonly version: 1
  readonly toolsetFingerprints: ReadonlyArray<string>          // per turn
  readonly model: ReadonlyArray<{ readonly request: RequestDigest; readonly events: ReadonlyArray<ModelEvent> }>
  readonly tools: ReadonlyArray<{ readonly callId: string; readonly tool: string; readonly outcome: ToolOutcome
                                  readonly tainted?: boolean }>   // a spawn call's: the subagent result's `tainted` (04, BEH-AG-029)
  readonly tasks: ReadonlyArray<TaskSnapshot>                  // every published snapshot, in order
}
Transcript.record: Layer.Layer<TranscriptRecorder>             // wraps ModelAdapter and ToolRunner providers; the loop reports spawn-call outcomes to it (01, BEH-AG-003)
ReplayModel.layer(transcript: Transcript): Layer.Layer<ModelAdapter | SpawnReplay>
// The recorded outcomes of reserved spawn calls; the loop resolves it when provided, as it does TranscriptRecorder (BEH-AG-035).
interface SpawnReplay {
  readonly outcome: (callId: string) =>
    Effect.Effect<Option.Option<{ readonly tool: string; readonly outcome: ToolOutcome; readonly tainted?: boolean }>>
}
```

```
REQUIREMENT: `Transcript.record` MUST capture, in order, every model request
             digest and the events returned, every tool outcome — the
             outcome of a reserved spawn call, which the loop reports under
             its `callId` (01, BEH-AG-003), included, with the subagent
             result's `tainted` — and every
             published `TaskSnapshot`. It MUST NOT capture configuration
             values, and MUST capture message content only when the test
             passes `{ content: true }`. It MUST NOT capture a model
             request, tool outcome or snapshot of a subagent spawned during
             the recorded run: the run's transcript holds each spawn call's
             outcome only (01, BEH-AG-003). A subagent's own run is
             recorded and replayed from its own transcript, as a run of its
             loop that the test starts with a `StartRequest.spawn` it
             builds — test code being code the application trusts with
             `spawn` (01, BEH-AG-003).
```

```
REQUIREMENT: `ReplayModel` MUST answer the n-th request with the n-th
             recorded events. When the digest of the n-th request differs
             from the recorded one, or there is no n-th recording, the call
             MUST fail as a `ScriptedModel` call does (BEH-AG-033): with
             `ModelError { kind: "other" }` whose message names n, and a
             recorded `ScriptMismatch` with reason "expect-failed" or
             "script-exhausted" that the test can read.
```

**Settled here.** Requests are compared by digest (canonical JSON of the
request, SHA-256), so a transcript can be kept without storing prompts that a
test author would not want in a repository.

## BEH-AG-035: Replay on TestHost is deterministic

> **Invariant:** [INV-AG-006](../invariants.md#inv-ag-006-a-replayed-run-is-identical-to-its-recording)
> **See:** [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Core seam:** [21 — Testing host](../../core/behaviors/21-testing-host.md)

```
REQUIREMENT: Replaying a transcript on a `TestHost` with `TestClock`, the
             counter `IdGenerator` and the same plugin set MUST produce the
             same sequence of `TaskSnapshot`s and the same sequence of
             dispatch requests (command id, input digest, annotations) as
             the recording. A difference MUST fail the replay with
             `ReplayDiverged { index, expected, actual }`.
```

```ts
// illustrative — not type-checked
class ReplayDiverged extends Schema.TaggedError<ReplayDiverged>()("ReplayDiverged", {
  index: Schema.Number,
  expected: Schema.String,                     // digest of the recorded element
  actual: Schema.String
}) {}
```

```
REQUIREMENT: Tool calls during replay MUST run through the real
             `ToolRunner` and dispatch, against the commands installed in
             the `TestHost`; only the model and the reserved spawn calls are
             replayed. A test MAY replace command handlers with fixtures,
             which the transcript then compares by outcome.
```

```
REQUIREMENT: During replay — when `SpawnReplay` is provided — a reserved
             spawn call MUST run no subagent: the loop MUST NOT call
             `spawnSubagent`, and in its place answers the call with
             `SpawnReplay.outcome(callId)`, the tool outcome the transcript
             recorded for that `callId`, as a fixture command is compared
             by outcome, and taints the session from the recorded
             `tainted` as BEH-AG-029 says for a tainted subagent's result
             (04). When no outcome is recorded for that `callId`, the
             recorded entry names another tool, or the loop's own answer
             before that call — a `ToolRefused` for the taint floor or an
             undecodable input (01, BEH-AG-003), compared with the
             recorded outcome by tag and message, so a recorded "tainted-session"
             refusal never matches an "input-invalid" one — differs from
             the recorded outcome, or the recorded outcome is a
             `ToolRefused` and the loop refuses nothing, the replay MUST
             fail with `ReplayDiverged`. INV-AG-006 covers the replayed
             loop's snapshots and dispatch requests; a subagent's own run is
             replayed from its own transcript (BEH-AG-034). The replayed
             outcomes take their place in the next request in `ToolCall`
             order, as live ones do (01, BEH-AG-003). A recorded `Deferred`
             is replayed as recorded: it becomes the task's pending draft
             when the loop reads it, under BEH-AG-016's precedence (the
             task's own `Deferred` wins), and the task publishes
             `awaiting-approval` with its `draftId` and `commands` as in
             the recording. No subagent task exists, so no hand-off, no
             "handed-to-parent" end and no withdrawal of that draft by the
             parent's loop happens; BEH-AG-016's hand-off rules apply to a
             live spawn only. The replayed loop's snapshots still match the
             recording's: the recording's hand-off touched only the
             subagent's task, which the transcript does not hold
             (BEH-AG-034), and its withdrawal is carried by no snapshot
             and is no dispatch request (02, BEH-AG-016).
```

```
REQUIREMENT: The package's own time and identifiers (task ids, call ids,
             `updatedAt`) MUST come from the host's `Clock` and
             `IdGenerator`, so replay is reproducible.
```

Replaying through the real dispatch is what makes a replay a test of the
application: a gate change that now defers a call the recording allowed shows
as a divergence at that call.

## BEH-AG-036: EvalHook is an advisory hook point per turn

> **See:** [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md)

```ts
// illustrative — not type-checked
// core 31: HookPoint.make<In, Enrich, Advice, Code>; no codes, so only "advisory" (and "enrich") roles can register
const EvalHook = HookPoint.make<TurnRecord, never, unknown, never>("@bridger/agent/eval", {
  codes: [], who: options.evalWho,                     // the application's admission rule (BEH-BR-298); no default
  timeout: "2 seconds", deadline: "10 seconds", onError: "skip",
  dormant: { advisory: "skip" }                        // core's default for advisers (BEH-BR-309), stated
})
// contributions: EvalHook.register(id, score, { role: "advisory" })
interface TurnRecord {
  readonly taskId: string
  readonly turn: number
  readonly toolsetFingerprint: string
  readonly calls: ReadonlyArray<{ readonly tool: string; readonly outcome: ToolOutcome["_tag"] }>
  readonly final: TaskSnapshot
  readonly usage: Readonly<Record<string, number>>
}
```

```
REQUIREMENT: The reference loop MUST dispatch `EvalHook` once at the end of
             each turn with that turn's `TurnRecord`. The hook point MUST be
             made with an empty `codes` list, so that core refuses every
             veto registration (BEH-BR-297) and its verdict is always
             `Allowed`; its advice MUST NOT change the task's state, and a
             failing contribution is skipped. The admission rule is the
             application's (`AgentLoop.plugin({ draftWithdrawal, evalWho })`); without one
             the loop MUST NOT make the hook point.
```

```
REQUIREMENT: The package MUST NOT ship a scoring function or a judge; it
             provides the hook point only.
```

Evaluation suites (exact-draft assertions, judges, red-team corpora) are the
application's; the hook gives them a stable record to score.

## BEH-AG-037: Excluded commands can be shown unreachable

> **Invariant:** [INV-AG-003](../invariants.md#inv-ag-003-a-subagent-is-never-wider-than-its-parent)
> **See:** [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md)
> **Core seam:** [command — Toolsets](../../command/behaviors/03-toolsets.md)

```ts
// illustrative — not type-checked
AgentTest.assertUnreachable(options: {
  readonly principals: ReadonlyArray<Actor>
  readonly selector?: ToolsetSelector
  readonly excluded: ReadonlyArray<string | ((d: CommandDescriptor) => boolean)>
}): Effect.Effect<void, UnreachableViolation, CommandCatalog>
class UnreachableViolation extends Schema.TaggedError<UnreachableViolation>()("UnreachableViolation", {
  principal: Schema.String,                    // the Actor's id
  command: Schema.String                       // the excluded command's name
}) {}
```

```
REQUIREMENT: `assertUnreachable` MUST compute, for every principal given,
             the toolset the selector yields against the current catalog,
             and MUST fail with `UnreachableViolation { principal, command }`
             naming every excluded command found in any of them.
```

```
REQUIREMENT: The check MUST NOT be described as proving that an excluded
             command cannot run: it shows the command is not offered to the
             model. Whether it would be refused if called is the gate's, and
             is tested by dispatching it.
```

**Settled here.** The check is stated as "not offered", because the toolset is
not an authorization (command companion); a full test pairs it with a
dispatch of each excluded command that must fail with `ToolNotInToolset` or
`CommandRefused`.

## BEH-AG-038: The required suite runs with no live model

> **See:** [ADR-AG-005](../decisions/005-agent-tests-replay-deterministically.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)

```
REQUIREMENT: The package's own test suite, including every acceptance check
             of 06, MUST run with `ScriptedModel` or `ReplayModel` only. It
             MUST NOT need network access or a model vendor's credentials.
```

```
REQUIREMENT: The testing entry point MUST NOT be importable from the main
             entry point, as core's testing fixtures are not
             ([BEH-BR-181](../../core/behaviors/21-testing-host.md)).
```

**Open.** Whether to provide a recorder that captures a live run into a
transcript for later replay in CI; it would be useful and is deferred.

---

_Previous: [04 — Subagents](./04-subagents.md)_ · _Next: [06 — Required acceptance checks](./06-required-acceptance-checks.md)_
