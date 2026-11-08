# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AG-OVW                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): `TaintGuard.drafts` wired through the command catalog layer; neutral example input; seams updated (CCR-AG-002)<br>0.1 (2026-11-08): Initial draft (CCR-AG-001)                 |

---

## Mission

An agent is a loop: a model reads a conversation and a list of tools, asks for
tool calls, sees their results and continues until it answers or stops. Every
part of that loop is something an application wants to replace — the model
vendor, the loop's policy, where sessions and memories are kept, how tools run
— and every tool call is a change some reviewer may want to approve.

`@bridger/agent` does not build an agent framework. It names the parts as
Bridger service keys, so each is one plugin's provider and can be replaced
with `replace` under the host's lease and drain rules; it routes every tool
call through [`@bridger/command`](../command/README.md) dispatch, so the gate,
hook points and call log see agent calls exactly as they see any other caller;
and it adds the three things an agent needs that a plain command caller does
not: a task state feed, taint tracking, and subagents.

## Package boundary

| Concern | Where it lives |
| ------- | -------------- |
| Service keys `ModelAdapter`, `AgentLoop`, `SessionStore`, `MemoryStore`, `ToolRunner`; turn structure | this package ([01](./behaviors/01-agent-seams.md)) |
| `TaskSnapshot`, `Tasks`, herdr and MCP task bridges | this package ([02](./behaviors/02-tasks.md)) |
| Taint and provenance annotations, `TaintGuard.drafts` | this package ([03](./behaviors/03-taint-and-provenance.md)) |
| Taint floor (no automatic allow for a tainted request) | [`@bridger/command`](../command/behaviors/02-dispatch.md) (BEH-CM-016) |
| Subagents | this package ([04](./behaviors/04-subagents.md)), on core's `Realm.ephemeral` and `Actor.narrow` ([core file 33](../core/behaviors/33-realm-families.md)) |
| Scripted and replayed models, eval hooks, reachability check | this package, entry point `@bridger/agent/testing` ([05](./behaviors/05-agent-testing.md)) |
| Command catalog, dispatch, `CommandGate`, toolsets and pinning | [`@bridger/command`](../command/README.md) |
| MCP server, client, imported tools | [`@bridger/mcp`](../mcp/README.md) |
| `Budget` (reserve, commit, release) | [entitlement companion](../entitlement/README.md) — cited, not redefined |
| Operation-context annotation bag | core, [file 30](../core/behaviors/30-operation-context-annotations.md) |
| Plugin principal | core, [file 28](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) |
| `CallLog` port | core, [file 29](../core/behaviors/29-capability-grants-and-call-log.md) |
| Hook points | core, [file 31](../core/behaviors/31-hook-points.md) |
| Generic gate with `Defer`, drafts with expected versions | core, [file 32](../core/behaviors/32-generic-gate-and-plan.md) |
| Model vendor adapters, prompts, skills, approval UI, which inputs are untrusted beyond the defaults, regulated-command rules | the application |

The package's only runtime dependencies are `effect`, `@bridger/core` and
`@bridger/command`. It ships no `ModelAdapter` implementation.

## Public API surface

| Export | Kind | Specified in |
| ------ | ---- | ------------ |
| `ModelAdapter`, `ModelRequest`, `ModelEvent`, `ModelError` | service key, types | [BEH-AG-001](./behaviors/01-agent-seams.md#beh-ag-001-five-agent-service-keys-each-one-provider-per-realm) |
| `AgentLoop`, `AgentLoop.plugin` | service key, reference plugin | [BEH-AG-003](./behaviors/01-agent-seams.md#beh-ag-003-a-turn-pins-one-toolset-and-runs-every-tool-call-through-dispatch) |
| `SessionStore`, `MemoryStore` | service keys | [BEH-AG-004](./behaviors/01-agent-seams.md#beh-ag-004-sessionstore-and-memorystore-keep-data-with-its-provenance) |
| `ToolRunner`, `ToolRunner.plugin` | service key, reference plugin | [BEH-AG-005](./behaviors/01-agent-seams.md#beh-ag-005-toolrunner-is-dispatch-with-the-turns-pinned-toolset) |
| `TaskSnapshot`, `Tasks`, `Tasks.await` | types, service | [02 — Tasks](./behaviors/02-tasks.md) |
| `HerdrBridge.plugin`, `McpTaskBridge` | adapters | [BEH-AG-013](./behaviors/02-tasks.md#beh-ag-013-the-herdr-bridge-maps-states-and-adds-none), [BEH-AG-014](./behaviors/02-tasks.md#beh-ag-014-the-mcp-tasks-bridge) |
| `Taint`, `Provenance`, `TaintPolicy`, `TaintGuard.drafts` | read view over core keys, port, draft source for the command catalog | [03 — Taint and provenance](./behaviors/03-taint-and-provenance.md) |
| `Agent.spawnSubagent` | function | [04 — Subagents](./behaviors/04-subagents.md) |
| `ScriptedModel`, `ReplayModel`, `Transcript`, `EvalHook`, `Toolsets.reachable` assertion helper | testing entry point | [05 — Agent testing](./behaviors/05-agent-testing.md) |

## Worked example

```ts
// illustrative — not type-checked
import { Bridger } from "@bridger/core"
import { CommandCatalog, Commands, Toolsets } from "@bridger/command"
import { AgentLoop, ToolRunner, Tasks, TaintGuard } from "@bridger/agent"

// Base services, built by the application: the catalog's taint floor takes its
// drafts from the application's approval store through TaintGuard.drafts.
const base = Layer.mergeAll(
  CommandCatalog.layer({ drafts: TaintGuard.drafts(myApprovalStore) }),
  myCommandGateLayer                       // the application's CommandGate
)

const program = Effect.gen(function* () {
  const host = yield* Bridger.Host
  // A vendor adapter plugin provides ModelAdapter; the application writes it.
  yield* host.install(myModelAdapterPlugin)
  yield* host.install(ToolRunner.plugin())
  yield* host.install(AgentLoop.plugin({ maxSteps: 20 }))

  const tasks = yield* Tasks
  const loop  = yield* host.use(AgentLoop, (loop) =>
    loop.start({ sessionId: "s-1", actor: alice, input: "Summarise yesterday's failed jobs" }))

  // Wait until the task needs a person, or ends.
  const snap = yield* tasks.await(loop.taskId, {
    until: ["awaiting-approval", "needs-input", "done", "failed", "cancelled"],
    timeout: "10 minutes"
  })
  if (snap.state === "awaiting-approval") {
    // The draft id comes from the gate's Defer (core file 32). Approval is the application's.
    yield* showApproval(snap.draftId)
  }
})
```

What the example relies on: each step's tool calls go through
`Commands.dispatch` with the turn's pinned toolset; a gate `Defer` turns the
task to `awaiting-approval` rather than failing it; if the session has read
an imported tool's output, the command catalog's taint floor withholds any
automatic allow and `TaintGuard.drafts` turns it into a draft, so a person
approves before anything changes through dispatch.

## What stays in core, and what stays in the application

Core gains nothing from this package. It needs core seams that are specified
in core: the annotation bag and `CallerContext` ([file 30](../core/behaviors/30-operation-context-annotations.md)),
the plugin principal ([file 28](../core/behaviors/28-plugin-principal-and-mandatory-policy.md)),
the generic gate with `Defer` and drafts ([file 32](../core/behaviors/32-generic-gate-and-plan.md)),
and `Realm.ephemeral` with `Actor.narrow` ([file 33](../core/behaviors/33-realm-families.md)).
The application keeps every domain rule: which commands an agent may see,
which ones are regulated and how they are approved, which texts are untrusted
beyond the defaults, how much an agent may spend.

---

_Next: [01 — Agent seams](./behaviors/01-agent-seams.md)_
