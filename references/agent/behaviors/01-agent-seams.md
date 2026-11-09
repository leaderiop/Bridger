# 01 — Agent Seams

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-BEH-01                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-09): The `AgentLoop.plugin` options of BEH-AG-007 and the example of BEH-AG-008 carry the required `draftWithdrawal` (BEH-AG-016, audit U-12) (CCR-AG-004)<br>0.4 (2026-11-08): Resolutions of the round-2 agent review (A-05, A-08, A-09, A-16): `Started` chosen by the descriptor's `long`, never by the output's shape; the idempotency key covers a resubmission within the process, not crash recovery of the run; a step with a long call is not batched; a batch of declared reads from a tainted session runs on the gate's decision, other batches need an approval that also covers their compensations (CCR-AG-003)<br>0.3 (2026-11-08): Steps run under core `CurrentCorrelation`; tool calls carry an idempotency key; tool results reach the model as envelopes; long commands and batches in `ToolOutcome`; `ResumeInput.Approved` carries one outcome per drafted command; BEH-AG-007 model adapter per session through a realm family; BEH-AG-008 a step's tool calls as one batch (CCR-AG-003, round 2: recheck items 1, 5, 7, 8, 9)<br>0.2 (2026-11-08): `ResumeInput`, `taintedSelector`, error classes declared; memory entries keep taint labels; `onBehalfOf` taken by dispatch (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

An agent runtime has a few parts every application wants to replace: the
model, the loop, where sessions and memories live, how tools run, and how
spending is bounded. This file names them as ordinary Bridger service keys,
each provided by one plugin per realm
([ADR-BR-003](../../core/decisions/003-one-provider-per-key-per-realm.md)), and
fixes the structure of one turn: one pinned toolset, every tool call through
command dispatch. This file owns BEH-AG-001–008 and uses all eight.

Planned source: `packages/agent/src/Keys.ts`, `packages/agent/src/AgentLoop.ts`,
`packages/agent/src/ToolRunner.ts` *(Planned)*.

## BEH-AG-001: Five agent service keys, each one provider per realm

> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md), [ADR-BR-003](../../core/decisions/003-one-provider-per-key-per-realm.md), [ADR-BR-002](../../core/decisions/002-plugin-build-is-a-layer.md)
> **Core seam:** [17 — Realms and interception](../../core/behaviors/17-realms-and-interception.md), [07 — Replacement and reactivation](../../core/behaviors/07-replacement-and-reactivation.md)

```ts
// illustrative — not type-checked
class ModelAdapter extends Context.Service<ModelAdapter, ModelAdapterShape>()("@bridger/agent/ModelAdapter") {}
class AgentLoop    extends Context.Service<AgentLoop,    AgentLoopShape>()("@bridger/agent/AgentLoop") {}
class SessionStore extends Context.Service<SessionStore, SessionStoreShape>()("@bridger/agent/SessionStore") {}
class MemoryStore  extends Context.Service<MemoryStore,  MemoryStoreShape>()("@bridger/agent/MemoryStore") {}
class ToolRunner   extends Context.Service<ToolRunner,   ToolRunnerShape>()("@bridger/agent/ToolRunner") {}
// Budget: the key and shape of the entitlement companion (references/entitlement/), imported, not redeclared.
```

```
REQUIREMENT: The package MUST declare exactly these five keys with the
             identifiers shown. Each MUST be an ordinary core service key:
             provided by a plugin's `provides`, resolved with `Host.use` or
             a plugin's `requires`, subject to one provider per key per
             realm, leases, drain and `replace` as every other key.
```

```
REQUIREMENT: The package MUST NOT declare a `Budget` key or shape. It MUST
             consume the `Budget` key of the entitlement companion
             (references/entitlement/) and MUST NOT define what a budget
             unit, a limit or a grace rule is.
```

```
REQUIREMENT: The package MUST NOT add any operation to the core `Host`
             interface and MUST NOT require any change to core other than
             the seams named in the overview.
```

Being plain keys is the whole design ([ADR-AG-001](../decisions/001-agent-is-swappable-keys.md)).
Replacing a model adapter is a `replace` of one plugin; a turn holding a lease
on the old adapter finishes on it, and the next turn resolves the new one,
because that is how every Bridger key behaves.

**Settled here.** The key identifiers carry the `@bridger/agent/` prefix, as
core's keys carry `@bridger/core/`.

**Open.** Whether `MemoryStore` should be a contribution registry (several
memory sources per session) rather than one provider; v0.1 keeps one
provider, and an application that needs several composes them in it.

## BEH-AG-002: The ModelAdapter shape

> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md)
> **Core seam:** [command — Toolsets](../../command/behaviors/03-toolsets.md)

```ts
// illustrative — not type-checked
interface ModelAdapterShape {
  readonly generate: (request: ModelRequest) => Stream.Stream<ModelEvent, ModelError>
}

interface ModelRequest {
  readonly messages: ReadonlyArray<Message>              // from SessionStore, each with its Provenance (03); tool results as envelopes (BEH-AG-023)
  readonly tools: ReadonlyArray<CommandDescriptor>       // the turn's pinned Toolset, in Toolset order
  readonly toolsetFingerprint: string
  readonly maxOutputTokens?: number
  readonly signal: { readonly turnId: string; readonly step: number }
}

type ModelEvent =
  | { readonly _tag: "TextDelta"; readonly text: string }
  | { readonly _tag: "ToolCall"; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly _tag: "Usage"; readonly usage: Readonly<Record<string, number>> }   // units named by the adapter
  | { readonly _tag: "Stop"; readonly reason: "end" | "tool-calls" | "max-tokens" | "refused" | "other" }

class ModelError extends Schema.TaggedError<ModelError>()("ModelError", {
  kind: Schema.Literals(["unavailable", "rate-limited", "invalid-request", "timeout", "other"]),
  message: Schema.String
}) {}
```

```
REQUIREMENT: A `ModelAdapter` MUST present `tools` to the model in the order
             given. It MUST NOT add, drop or rename tools.
```

```
REQUIREMENT: A `ToolCall.tool` MUST be treated by every consumer as
             untrusted data: an id that names a command only if dispatch
             (BEH-AG-005) finds it in the pinned toolset.
```

```
REQUIREMENT: The package MUST NOT ship a `ModelAdapter` implementation other
             than the test adapters of 05 — Agent Testing, exported from
             `@bridger/agent/testing`.
```

A vendor adapter is a separate package written by the application or a
third party. Shipping none keeps the package free of vendor dependencies and
means no deployment has a model wired "by default".

**Settled here.** `Usage` is a record of named counters rather than a fixed
token shape, so adapters for models priced in different units fit; the loop
passes it to `Budget` unchanged (BEH-AG-006).

## BEH-AG-003: A turn pins one toolset and runs every tool call through dispatch

> **Invariant:** [INV-AG-002](../invariants.md#inv-ag-002-a-turn-sees-one-toolset)
> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md), [command — Toolsets](../../command/behaviors/03-toolsets.md), [command — Dispatch](../../command/behaviors/02-dispatch.md)

```ts
// illustrative — not type-checked
interface AgentLoopShape {
  readonly start: (request: StartRequest) => Effect.Effect<{ readonly taskId: string }, AgentStartError>
  readonly resume: (taskId: string, input: ResumeInput) => Effect.Effect<void, TaskNotFound | TaskNotResumable>
  readonly cancel: (taskId: string) => Effect.Effect<void, TaskNotFound>
}
interface StartRequest {
  readonly sessionId: string
  readonly actor: Actor                    // the principal the agent acts for
  readonly input: string
  readonly selector?: ToolsetSelector      // @bridger/command; default selector when absent
  readonly taintedSelector?: ToolsetSelector  // used for turns that begin while the session is tainted (03, BEH-AG-022)
  readonly budget?: BudgetScope            // entitlement companion's scope descriptor
  readonly model?: string                  // the model key of BEH-AG-007; default: the session id
}

// How the application tells a waiting task what happened (02, BEH-AG-012).
type ResumeInput =
  | { readonly _tag: "Approved"; readonly draftId: string
      readonly outcomes: ReadonlyArray<ToolOutcome> }          // one per drafted command, in draft order (02, BEH-AG-012)
  | { readonly _tag: "Refused"; readonly draftId: string; readonly reason: string }
  | { readonly _tag: "Stale"; readonly draftId: string            // core Draft.check returned Stale (BEH-BR-316)
      readonly mismatches: ReadonlyArray<{ readonly key: string; readonly expected: string; readonly actual: Option.Option<string> }> }
  | { readonly _tag: "Input"; readonly text: string }                                         // answers needs-input

type AgentStartError = StoreError | SessionNotFound

class AgentStepLimit extends Schema.TaggedError<AgentStepLimit>()("AgentStepLimit", { steps: Schema.Number }) {}
class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", { sessionId: Schema.String }) {}
class StoreError extends Schema.TaggedError<StoreError>()("StoreError", { store: Schema.String, message: Schema.String }) {}
// TaskNotFound and TaskNotResumable: 02 — Tasks (BEH-AG-010, BEH-AG-011)
```

A **turn** is one run of the loop from a person's input (or a resumption) to
the next point where the loop stops: an answer, a request for input, a
deferral, a failure or a cancellation. A turn has one or more **steps**; a step
is one `ModelAdapter.generate` call followed by the tool calls it requested.

```
REQUIREMENT: At the start of each turn the loop MUST take one pinned toolset
             with `Toolsets.pin(actor, selector)` in the turn's scope and
             MUST use that toolset, and only it, for every step of the turn:
             the same `tools` and `toolsetFingerprint` in every
             `ModelRequest`, and the same pinned toolset in every dispatch.
             The pin MUST be released when the turn ends.
```

```
REQUIREMENT: Every tool call of a turn MUST be run by `ToolRunner`
             (BEH-AG-005). The loop MUST NOT call a command handler, a
             plugin service or a host mutation on the model's behalf by any
             other path.
```

```
REQUIREMENT: The loop MUST bound a turn by `maxSteps` (default 20) and fail
             the task with `AgentStepLimit { steps }` when it is reached.
             It MUST NOT retry a failed model call or tool call
             automatically.
```

```
REQUIREMENT: The loop MUST report every state change of a task through
             `Tasks` (02 — Tasks) in the order it happens.
```

```
REQUIREMENT: The loop MUST take one correlation id per task from the host's
             `IdGenerator` and MUST run every step inside core's
             `CurrentCorrelation.with(id)` (BEH-BR-187), so that model
             calls, tool dispatches, their hooks and handlers, and any host
             call they cause carry it. The loop MUST NOT pass a
             `correlationId` in `OperationContext` for that purpose.
```

```
REQUIREMENT: `resume` MUST accept `Approved`, `Refused` and `Stale` only for
             a task in `awaiting-approval` whose `draftId` matches, and
             `Input` only for a task in `needs-input`; any other
             combination MUST fail with `TaskNotResumable { taskId, state }`
             and change nothing (02 — Tasks, BEH-AG-012).
```

Pinning per turn means the model never sees one list of tools and has its
calls checked against another: a catalog change in the middle of a turn is
seen at the next turn. A tool withdrawn mid-turn fails at dispatch with
`ContributionUnavailable` or `ToolChanged`; it is never resolved to a
different handler under the same id (command BEH on toolsets).

**Settled here.** (1) No automatic retry, for the reason core gives in
[ADR-BR-005](../../core/decisions/005-failure-is-sticky.md): a retried tool
call can repeat a side effect. A model may choose to call a tool again; that
is a new call, gated again. (2) The default `maxSteps` of 20 is a bound, not
a recommendation.

**Open.** Whether a long turn should re-pin at a step boundary when the
toolset changes, with the change shown to the model; v0.1 does not.

## BEH-AG-004: SessionStore and MemoryStore keep data with its provenance

> **Invariant:** [INV-AG-005](../invariants.md#inv-ag-005-taint-is-monotone-per-session)
> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)

```ts
// illustrative — not type-checked
interface SessionStoreShape {
  readonly append: (sessionId: string, message: Message) => Effect.Effect<void, StoreError>
  readonly read: (sessionId: string) => Effect.Effect<SessionState, SessionNotFound | StoreError>
}
interface SessionState {
  readonly messages: ReadonlyArray<Message>
  readonly taint: TaintState                    // 03 — derived from Annotation.Taint (core file 30)
}
interface Message {
  readonly role: "user" | "assistant" | "tool"
  readonly content: string | unknown
  readonly provenance: Provenance               // 03
}
interface MemoryStoreShape {
  readonly put: (scope: string, entry: MemoryEntry) => Effect.Effect<void, StoreError>
  readonly query: (scope: string, query: string, limit: number) =>
    Effect.Effect<ReadonlyArray<MemoryEntry>, StoreError>
}
interface MemoryEntry {
  readonly id: string
  readonly text: string
  readonly provenance: Provenance
  readonly taint: ReadonlySet<string>          // the session's Annotation.Taint labels when it was stored (BEH-AG-019)
}
```

```
REQUIREMENT: Every stored message and memory entry MUST carry its
             `Provenance`, and every memory entry the taint labels of the
             session that stored it. A store MUST return both unchanged on
             read.
```

```
REQUIREMENT: `SessionState.taint` MUST be stored with the session and MUST
             never be lowered by a store (INV-AG-005).
```

```
REQUIREMENT: The package MUST ship in-memory `SessionStore` and `MemoryStore`
             providers only in `@bridger/agent/testing`. It MUST NOT
             describe them as retaining anything beyond the life of their
             scope.
```

Provenance travels with data so that a memory written in a tainted session
taints whatever session reads it later (BEH-AG-019). Persistence, retention
and erasure of session data are the application's stores.

**Open.** Whether a `SessionStore` must support concurrent turns on one
session; v0.1 assumes one turn at a time per session and the loop serializes.

## BEH-AG-005: ToolRunner is dispatch with the turn's pinned toolset

> **Invariant:** [INV-AG-001](../invariants.md#inv-ag-001-a-tainted-session-is-never-auto-allowed-a-change), [INV-AG-002](../invariants.md#inv-ag-002-a-turn-sees-one-toolset)
> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md)
> **Core seam:** [command — Dispatch](../../command/behaviors/02-dispatch.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)

```ts
// illustrative — not type-checked
interface ToolRunnerShape {
  readonly run: (call: ToolCallRequest) => Effect.Effect<ToolOutcome>
}
interface ToolCallRequest {
  readonly callId: string
  readonly tool: string
  readonly input: unknown
  readonly toolset: PinnedToolset
  readonly context: OperationContext            // actor and annotations incl. Taint and Provenance; correlation from the fiber
  readonly idempotencyKey?: string              // "agent:" + taskId + ":" + step + ":" + callId, when enabled
}
type ToolOutcome =
  | { readonly _tag: "Ok"; readonly output: Json; readonly provenance: Provenance }   // the encoded output; rendered by the loop (BEH-AG-023)
  | { readonly _tag: "Started"; readonly taskId: string; readonly command: string }   // a long command (02, BEH-AG-015)
  | { readonly _tag: "Deferred"; readonly draftId: string; readonly commands: ReadonlyArray<string> }
  | { readonly _tag: "Failed"; readonly error: { readonly _tag: string; readonly message: string } }
```

```
REQUIREMENT: `ToolRunner.plugin()` MUST run each call as
             `Commands.dispatch(call.tool, call.input, { context, toolset,
             idempotencyKey })` and MUST map the result: success to `Ok`
             with the output encoded by the command's output schema (the
             loop renders it as an envelope, BEH-AG-023), the
             `CommandTaskRef` of a command whose descriptor in the pinned
             toolset is `long` to `Started` (decided by the descriptor,
             never by the shape of the output, command BEH-CM-052),
             `CommandDeferred` to `Deferred` with its draft id and the
             command id, and every other failure to `Failed` with its tag
             and a message.
```

```
REQUIREMENT: The `context` passed to dispatch MUST carry the session's
             current `Taint` and the call's `Provenance` annotations
             (03 — Taint and provenance) and MUST name the agent's actor.
             The runner MUST NOT set or imitate `onBehalfOf`: dispatch takes
             it from the dispatching fiber's plugin principal (core
             BEH-BR-258; command BEH-CM-010), which names the runner's
             plugin, never an actor.
```

```
REQUIREMENT: A replacement `ToolRunner` MUST keep the two rules above. The
             acceptance checks of 06 MUST be runnable against any provider.
```

```
REQUIREMENT: A `Failed` outcome MUST NOT carry a cause, a stack or a
             service; only the error tag and message reach the model.
```

The runner is a thin wrapper by design: the gate, hook points, timeouts and
the call log belong to dispatch, so an agent call and a UI call are judged by
the same rules. A tool error goes back to the model as data rather than
failing the task, because the model may recover from it; a `Deferred` stops
the turn (02 — Tasks).

**Settled here.** (1) Tool errors are returned to the model with their tag,
not their cause: a cause can contain internal detail an application would not
send to a model vendor. (2) The idempotency key names the task, the step and
the model's call id, so that a runner or loop that resubmits the same call
within the life of the task — a retry after a transport failure, a resumed
step after an approval — meets the stored outcome (command BEH-CM-041)
instead of a second run; a model that calls the tool again makes a new call
with a new id, judged again. It is not crash recovery: the `Tasks` table is
in memory (02, BEH-AG-011), so after a restart the task and its id are gone
and nothing resubmits under its key; a command task the call started keeps
its record only when the catalog has a persistent `CommandTaskStore`
(command BEH-CM-054). The key is passed only with
`ToolRunner.plugin({ idempotency: true })`: a keyed dispatch is refused when
the catalog has no `CommandReceipts` (`IdempotencyConflict`, "no-receipts"),
so enabling it is the application's choice once receipts are wired.

## BEH-AG-006: Budgets are reserved through the entitlement companion, and the reference plugins are replaceable

> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md)
> **Core seam:** [entitlement companion](../../entitlement/README.md), [07 — Replacement and reactivation](../../core/behaviors/07-replacement-and-reactivation.md)

```
REQUIREMENT: When a `Budget` provider is resolvable, the reference loop MUST
             reserve against it before each `ModelAdapter.generate` call,
             MUST commit the `Usage` reported by the adapter when the step
             ends, and MUST release any unused reservation when the step
             ends by failure, interruption or cancellation. A refused
             reservation MUST fail the task with the entitlement
             companion's typed refusal, not retry it.
```

```
REQUIREMENT: With no `Budget` provider resolvable, the loop MUST run without
             one and MUST NOT describe the turn as bounded by a budget.
```

```
REQUIREMENT: `AgentLoop.plugin` and `ToolRunner.plugin` MUST be ordinary
             plugins providing their keys. An application MAY replace
             either with its own provider; nothing in the package MAY
             depend on the reference implementation being installed.
```

The reservation verbs (`reserve`, `commit`, `release`) and their errors are
the entitlement companion's; this behaviour fixes only when the loop calls
them. A budget of tool-call side effects (money a command moves) is not a
model budget and is the application's command rule.

**Open.** Whether tool calls should also reserve against `Budget` (some
commands cost money); left to the entitlement companion's scope model.

## BEH-AG-007: The model adapter is resolved per session through a realm family

> **See:** [ADR-AG-001](../decisions/001-agent-is-swappable-keys.md)
> **Core seam:** [33 — Realm families](../../core/behaviors/33-realm-families.md)

```ts
// illustrative — not type-checked
AgentLoop.plugin(options: {
  readonly draftWithdrawal: DraftWithdrawal  // 02, BEH-AG-016; required, no default
  readonly models?: RealmFamily<string>     // core Realm.family, owned by the application; members provide ModelAdapter
  readonly maxSteps?: number
  readonly evalWho?: AdmissionRule          // 05, BEH-AG-036
})
// The application decides what a model key means: one realm per session, or per model profile.
const models = yield* Realm.family(host, {
  id: "agent-models",
  realm: () => ({}),
  plugins: (key) => [modelPluginFor(key)],          // e.g. a vendor adapter configured for that profile
  context: { actor: serviceActor, reason: "agent model per session" },
  idleEvict: { after: "15 minutes" }
})
```

```
REQUIREMENT: When `models` is given, the reference loop MUST resolve the
             `ModelAdapter` of every step through
             `models.use(key, [ModelAdapter], …)` (core BEH-BR-329–332),
             with `key` = `StartRequest.model` when given and the session id
             otherwise, holding the member for the length of the model call
             only. Without `models`, it MUST resolve `ModelAdapter` in the
             loop plugin's own realm, as revision 0.2 did.
```

```
REQUIREMENT: A `FamilyMemberUnavailable` or other resolution failure MUST
             fail the step with `ModelError { kind: "unavailable" }` and
             MUST NOT fall back to another key or to the loop's realm.
```

```
REQUIREMENT: The package MUST NOT create the family or choose its plugins:
             the family's owner is the application (core BEH-BR-329), and
             the members' plugins are its model adapters. The package MUST
             NOT describe a member realm as isolating one session's model
             from another's.
```

Different sessions want different models — a cheaper one for a summary, a
customer's own deployment for another — and a model adapter often carries
per-session configuration. A realm family gives each key its own
`ModelAdapter` provider, created on first use and evicted when idle, through
public host operations that are attributed, gated and audited. The loop only
names the key.

**Settled here.** (1) The member is held per model call, not per turn, so an
idle eviction never waits for a turn that is waiting on a person. (2) Keying
by session id is the default because it needs no extra input; an application
that has profiles passes `model` and keeps the number of members small.

## BEH-AG-008: The tool calls of one step may be dispatched as one batch

> **See:** [ADR-AG-003](../decisions/003-taint-is-monotone-and-forbids-auto-allow.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [command — Batches and long commands](../../command/behaviors/07-batches-and-long-commands.md)

```ts
// illustrative — not type-checked
AgentLoop.plugin({ draftWithdrawal, batchToolCalls: true })   // batchToolCalls defaults to false
// ToolRunnerShape gains:
//   readonly runBatch: (calls: readonly [ToolCallRequest, ...ToolCallRequest[]]) => Effect.Effect<ReadonlyArray<ToolOutcome>>
```

```
REQUIREMENT: With `batchToolCalls: true`, when a step's model call requests
             two or more tool calls, the loop MUST run them through
             `ToolRunner.runBatch`, which MUST make exactly one
             `Commands.batch` (command BEH-CM-049) of the calls in the order
             the model gave them, with the turn's pinned toolset and each
             call's idempotency key. With `batchToolCalls: false`, a
             single call, or a step in which any call names a command whose
             descriptor in the pinned toolset is `long` (a batch refuses
             long items, command BEH-CM-049), the loop MUST run each call
             through `run`, in the model's order.
```

```
REQUIREMENT: `runBatch` MUST map the batch's outcome to one `ToolOutcome`
             per call: on success, `Ok` for each; on `CommandDeferred`, the
             same `Deferred { draftId, commands }` for each, `commands`
             being every call's command id; on `CommandBatchRejected`,
             `Failed` for the rejected call and `Failed` with tag
             "NotRun" for the others; on `CommandBatchRolledBack` or
             `CommandBatchPartial`, `Failed` for each call with that tag and
             a message naming whether the call's effects were undone.
```

```
REQUIREMENT: A deferred batch MUST put the task in `awaiting-approval` once,
             with the draft id and all command ids (02, BEH-AG-012); the
             approval applies all calls or none.
```

A model that plans three edits in one step means them together. Dispatching
them as one batch lets the gate see all three before any runs, defers them as
one proposal when any needs a person, and applies the approval to all or none
(recheck X6). A model that issues independent lookups in one step loses
nothing: a batch of commands declared `readOnly` is admitted and run like
separate calls, also in a tainted session, because the command catalog's
taint floor keeps the gate's decision for declared reads (command
BEH-CM-016). A batch with any other command, in a tainted session, is
deferred as one draft; its approval also covers the compensations planned
for its items (command BEH-CM-051), so its undo does not need a second
approval.

**Settled here.** Off by default, because a batch changes what a model sees
when one call fails: the others are reported as not run or undone, which a
prompt must be written to understand.

---

_Next: [02 — Tasks](./02-tasks.md)_
