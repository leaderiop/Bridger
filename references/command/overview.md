# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-OVW                                               |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-08): Batch wording no longer claims all-or-nothing effects; reads exempt from the taint floor by declaration; API surface: `CommandReceipts.void`, `CommandTaskStore`, options `receiptGrace`, `taintFloor`, `tasks.store`, `TaskStoreUnavailable` (round-2 agent review A-05, A-08, A-15) (CCR-CM-003)<br>0.3 (2026-11-08): API surface: idempotency key and receipts, handler and batch wrappers, breaker, hook options and `attach`, batches, tasks, typed metadata, envelope, new errors; `DispatchCorrelation` withdrawn for core `CurrentCorrelation` (CCR-CM-003, round 2: recheck items 1–5, 7, 8, 10)<br>0.2 (2026-11-08): API surface: catalog options, gate wrappers, taint floor, `GenerationView`, `ApprovalMismatch`, supplied JSON Schema (CCR-CM-002)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

## Mission

Many products built on a plugin host want one path for every state change:
the UI, a public API, scheduled jobs and an AI agent all submit the same typed
commands, and none of them gets a private back door. Bridger's core already
has the pieces such a path needs — an ordered, scope-bound
[contribution registry](../core/behaviors/19-contribution-registry.md),
atomic [generations](../core/behaviors/20-generation.md),
[attribution](../core/behaviors/22-attributable-operations.md), a generic
[gate](../core/behaviors/32-generic-gate-and-plan.md) and
[hook points](../core/behaviors/31-hook-points.md) — but no notion of a
command. `@bridger/command` assembles them into a catalog:

1. **Define** a command as a value: an id, an input and output Schema, an
   optional error Schema, free tags, a `regulated` label and typed metadata
   (`permission`, `compensatedBy`, `costClass`, `readOnly`, `long`).
2. **Contribute** a handler for it from a plugin, for the lifetime of the
   plugin's activation.
3. **Dispatch** through one function that decodes, attributes, gates, runs the
   hook points, recognises a retried idempotency key, runs the handler under a
   lease inside the application's wrappers, encodes and reports — singly, as
   a batch admitted as one (its effects undone only by an atomic batch
   wrapper or by compensations, a partial result reported), or as a task for
   long work.
4. **Project** the catalog into toolsets: per-principal, deterministically
   ordered lists of command descriptors with JSON Schema 2020-12, published
   atomically and pinned for the length of an agent turn.

The companions [`@bridger/mcp`](../mcp/README.md) and
[`@bridger/agent`](../agent/README.md) consume toolsets; neither defines its
own tool list.

## Package boundary

| Concern | Where it lives |
| ------- | -------------- |
| Registry, generation, attribution, gate, hook points, annotations | `@bridger/core` (seams listed in the [README](./README.md#core-seams-this-package-needs)) |
| Command values, catalog, dispatch path, toolsets, JSON Schema projection | `@bridger/command` (this specification) |
| MCP server and client | [`@bridger/mcp`](../mcp/README.md) |
| Agent loop, tasks, taint | [`@bridger/agent`](../agent/README.md) |
| Which commands are regulated, who may run what, approval and four-eyes rules, the compensating commands and the receipt store, transactions (as wrappers), the meaning of every command | **The application** |

What stays out of this package, deliberately:

- **No command-bus semantics of any product.** Whether a regulated command may
  be drafted by an agent, needs two approvers or is excluded from all tools is
  a rule; rules live in the application's gate and selectors
  ([ADR-CM-002](./decisions/002-catalog-not-rules.md)).
- **No queries as a separate kind.** A read is a command whose author declares
  `readOnly`; the declaration is not enforced. Dispatch treats it differently
  in one place only: the taint floor keeps the gate's decision for a declared
  read (BEH-CM-016).
- **No persistence.** Drafts, approvals and command logs are stored by the
  application or by core's ports; the catalog keeps no history.
- **No isolation.** A handler runs in the dispatcher's process; out-of-process
  handlers are remote proxy plugins of [`@bridger/remote`](../remote/README.md).

## Public API surface

All signatures are illustrative and not type-checked.

| Export | Kind | Behaviour |
| ------ | ---- | --------- |
| `Command.make(id, spec)` | value constructor | [BEH-CM-001](./behaviors/01-command-definition.md#beh-cm-001-a-command-is-a-value-with-an-id-and-schemas) |
| `Command.contribute(command, handler)` | scoped effect | [BEH-CM-003](./behaviors/01-command-definition.md#beh-cm-003-a-handler-is-contributed-for-the-lifetime-of-a-scope) |
| `CommandCatalog` | base service (`@bridger/command/CommandCatalog`) | [BEH-CM-004](./behaviors/01-command-definition.md#beh-cm-004-the-catalog-exposes-descriptors-never-handlers) |
| `CommandCatalog.layer(options?)` | layer for the application's base services; options `drainTimeout`, `gateTimeout`, `gateWrappers`, `drafts`, `hooks`, `receipts`, `receiptGrace`, `handlerWrappers`, `batchWrappers`, `breaker`, `versions`, `tasks` (`retain`, `store`), `taintFloor` | [BEH-CM-004](./behaviors/01-command-definition.md#beh-cm-004-the-catalog-exposes-descriptors-never-handlers), [BEH-CM-011](./behaviors/02-dispatch.md#beh-cm-011-the-command-gate-allow-refuse-or-defer) |
| `CommandCatalog.attach(host)` | effect run once after `Bridger.make`: the host for call-log entries and the `HostLink` for hook dispatches | [BEH-CM-012](./behaviors/02-dispatch.md#beh-cm-012-hook-points-around-the-handler), [BEH-CM-015](./behaviors/02-dispatch.md#beh-cm-015-each-dispatch-is-reported-to-the-call-log-not-to-the-audit-sink) |
| `CommandCatalog.breakers` | feed of `CommandBreakerRecord` | [BEH-CM-043](./behaviors/06-receipts-wrappers-and-breakers.md#beh-cm-043-a-breaker-per-command-or-per-providing-plugin) |
| `Commands.dispatch(command, input, options?)` | effect; options `context`, `toolset`, `approval`, `timeout`, `idempotencyKey`, `expectDigest` | [BEH-CM-009](./behaviors/02-dispatch.md#beh-cm-009-one-dispatch-path-in-a-fixed-order) |
| `Commands.batch(items, options?)`, `BatchApprovalRef`, `CommandBatchWrapper` | effect, types | [BEH-CM-049](./behaviors/07-batches-and-long-commands.md#beh-cm-049-a-batch-is-admitted-whole-before-any-handler-runs)–[BEH-CM-051](./behaviors/07-batches-and-long-commands.md#beh-cm-051-a-batch-draft-is-approved-all-or-none-and-a-stale-draft-is-re-planned) |
| `Commands.start(command, input, options?)`, `CommandTasks`, `CommandTaskRef`, `CommandTaskSnapshot` | effect, base service (`@bridger/command/CommandTasks`), types | [BEH-CM-052](./behaviors/07-batches-and-long-commands.md#beh-cm-052-a-long-command-runs-as-a-task), [BEH-CM-053](./behaviors/07-batches-and-long-commands.md#beh-cm-053-progress-await-and-cancel-of-a-command-task) |
| `CommandTaskStore`, `CommandTaskRecord`, `TaskStoreUnavailable` | port supplied in `tasks.store` (default in memory), type, error | [BEH-CM-054](./behaviors/07-batches-and-long-commands.md#beh-cm-054-task-records-are-kept-through-a-store-port-and-a-task-cut-off-by-a-restart-is-reported-lost) |
| `CommandReceipts` (`claim`, `complete`, `release`, `void`), `CommandAnnotations.IdempotencyKey` | port supplied in the layer options; annotation key | [BEH-CM-041](./behaviors/06-receipts-wrappers-and-breakers.md#beh-cm-041-an-idempotency-key-returns-the-stored-outcome-of-a-completed-dispatch) |
| `CommandHandlerWrapper` | type | [BEH-CM-042](./behaviors/06-receipts-wrappers-and-breakers.md#beh-cm-042-handler-wrappers-are-fixed-when-the-catalog-layer-is-built) |
| `Command.Untrusted`, `Command.envelope(descriptor, output, options?)`, `ModelEnvelope` | annotation key, pure function, type | [BEH-CM-030](./behaviors/04-json-schema-projection.md#beh-cm-030-untrusted-output-fields-and-the-envelope-a-model-reads-them-in) |
| `CommandGate` | optional port, a `Gate<CommandRequest>` | [BEH-CM-011](./behaviors/02-dispatch.md#beh-cm-011-the-command-gate-allow-refuse-or-defer) |
| `CommandGateWrapper`, `ApprovalRef` | types | [BEH-CM-011](./behaviors/02-dispatch.md#beh-cm-011-the-command-gate-allow-refuse-or-defer) |
| Taint floor, `CommandDraftSource` | built-in step of dispatch; port supplied in the layer options | [BEH-CM-016](./behaviors/02-dispatch.md#beh-cm-016-a-tainted-request-not-declared-read-only-is-never-allowed-on-an-automatic-decision) |
| `CommandHooks.before`, `CommandHooks.after`, `CommandTarget`, `CommandHookSelector`, `CommandHookOptions` | hook points (enrich and veto; advisory), types | [BEH-CM-012](./behaviors/02-dispatch.md#beh-cm-012-hook-points-around-the-handler) |
| `Toolsets.forPrincipal(principal, selector?)` | scoped effect returning a `GenerationView<Toolset>` (core BEH-BR-169) | [BEH-CM-018](./behaviors/03-toolsets.md#beh-cm-018-a-toolset-per-principal-is-published-as-a-generation) |
| `Toolsets.pin(principal, selector?)` | scoped effect returning a `PinnedToolset` | [BEH-CM-019](./behaviors/03-toolsets.md#beh-cm-019-pinning-a-toolset-for-a-turn) |
| `ToolsetSelector`, `Toolsets.defaultSelector` | function type, value | [BEH-CM-021](./behaviors/03-toolsets.md#beh-cm-021-selection-is-the-applications-and-the-default-excludes-regulated-commands) |
| `Command.jsonSchema(command)` | pure function | [BEH-CM-025](./behaviors/04-json-schema-projection.md#beh-cm-025-input-and-output-are-projected-to-json-schema-2020-12), [BEH-CM-029](./behaviors/04-json-schema-projection.md#beh-cm-029-a-supplied-json-schema-replaces-the-projection-under-the-same-checks) |
| Errors `CommandNotFound`, `CommandInputInvalid`, `CommandOutputInvalid`, `CommandRefused`, `CommandDeferred`, `CommandVetoed`, `CommandTimeout`, `ToolNotInToolset`, `ToolChanged`, `ApprovalMismatch`, `IdempotencyConflict`, `CommandBreakerOpen`, `CommandWrapperFailed`, `CommandDraftStale`, `CommandSchemaNotProjectable` | `Schema.TaggedError` classes | [BEH-CM-014](./behaviors/02-dispatch.md#beh-cm-014-every-outcome-has-a-tag) |
| Errors `CommandBatchRejected`, `CommandBatchRolledBack`, `CommandBatchPartial`, `CommandTaskNotFound`, `CommandTaskAwaitTimeout`, `ReceiptsUnavailable`, `WrapperError` | `Schema.TaggedError` classes | [BEH-CM-049](./behaviors/07-batches-and-long-commands.md#beh-cm-049-a-batch-is-admitted-whole-before-any-handler-runs), [BEH-CM-050](./behaviors/07-batches-and-long-commands.md#beh-cm-050-items-run-in-order-and-a-failure-undoes-the-items-before-it), [BEH-CM-053](./behaviors/07-batches-and-long-commands.md#beh-cm-053-progress-await-and-cancel-of-a-command-task), [BEH-CM-041](./behaviors/06-receipts-wrappers-and-breakers.md#beh-cm-041-an-idempotency-key-returns-the-stored-outcome-of-a-completed-dispatch), [BEH-CM-042](./behaviors/06-receipts-wrappers-and-breakers.md#beh-cm-042-handler-wrappers-are-fixed-when-the-catalog-layer-is-built) |

Planned source: `packages/command/src/` *(Planned)*.

## Worked example

```ts
// illustrative — not type-checked
import { Command, Commands, CommandCatalog, Toolsets } from "@bridger/command"

// 1. A command is a value. It knows nothing about who runs it.
const RenameItem = Command.make("catalog.rename-item", {
  input: Schema.Struct({ itemId: Schema.String, name: Schema.NonEmptyString, expectedVersion: Schema.Int }),
  output: Schema.Struct({ itemId: Schema.String, version: Schema.Int }),
  error: Schema.Union([ItemNotFound, VersionConflict]),
  description: "Rename a catalog item.",
  tags: ["catalog", "write"],
  regulated: false
})

// 2. A plugin contributes the handler for its activation's lifetime.
const CatalogPlugin = Plugin.define({
  id: "catalog",
  requires: [CommandCatalog, ItemStore],
  provides: [],
  build: Layer.effectDiscard(Effect.gen(function* () {
    const store = yield* ItemStore
    yield* Command.contribute(RenameItem, (input) => store.rename(input))
  }))
})

// 3. Every caller uses the same path: UI, API, job or agent.
const result = yield* Commands.dispatch(RenameItem, { itemId: "i-1", name: "Desk lamp", expectedVersion: 3 }, {
  context: { actor: { id: "u-17", kind: "user" }, reason: "typo" }
})

// 4. An agent turn pins the toolset its principal may see.
yield* Effect.scoped(Effect.gen(function* () {
  const pinned = yield* Toolsets.pin(agentActor)           // ordered by id; JSON Schema 2020-12 per tool
  // ...offer pinned.toolset.tools to a model, then:
  yield* Commands.dispatch("catalog.rename-item", modelInput, { toolset: pinned, context: agentContext })
}))
```

The application's base services include `CommandCatalog.layer()` and,
when it wants approval, a `CommandGate` layer of its own. With no gate wired
every untainted dispatch is allowed by the catalog — which is why the
application, not Bridger, decides whether that is acceptable
([BEH-CM-011](./behaviors/02-dispatch.md#beh-cm-011-the-command-gate-allow-refuse-or-defer)).
A request carrying core's taint annotation is never allowed on an automatic
decision, gate or no gate, unless its command is declared `readOnly`, which
keeps the gate's decision and the taint
([BEH-CM-016](./behaviors/02-dispatch.md#beh-cm-016-a-tainted-request-not-declared-read-only-is-never-allowed-on-an-automatic-decision)).

## Relation to the host's own operations

Host lifecycle operations (`install`, `replace`, `reconcile` …) are not
commands and do not pass through `Commands.dispatch`; they keep their own
call order, gate and audit records
([BEH-BR-188](../core/behaviors/22-attributable-operations.md)). The MCP
companion offers a few host operations as commands; those commands call the
host, and the host's `OperationGate` is still consulted for each mutation
([`@bridger/mcp` host tools](../mcp/behaviors/04-host-tools.md)).

---

_Next: [01 — Command definition](./behaviors/01-command-definition.md)_
