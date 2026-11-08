# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-OVW                                               |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-08): Server options `maxResultBytes` and `maxStructuredBytes` (round-2 agent review A-07) (CCR-MC-003)<br>0.4 (2026-11-08): Resources, trusted sessions, listing record and `resources` option in the API surface; worked example shows the inbound taint (CCR-MC-003, round 2: recheck items 6, 9)<br>0.3 (2026-11-08): Branded `Plugin` return types; per-call pin; external mark; plan store options (CCR-MC-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-MC-001)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

## Mission

Let a Bridger host speak the Model Context Protocol in both directions without
adding a second tool model. Tools served are commands of
[`@bridger/command`](../command/README.md); tools imported become commands of
that catalog. Every tool call, served or imported, passes the same dispatch
path, the same command gate and the same hook points as any other command.

## Package boundary

| Concern | Where it lives |
| ------- | -------------- |
| Command definition, catalog, dispatch, toolsets, JSON Schema projection | `@bridger/command` ([behaviours](../command/behaviors/01-command-definition.md)) |
| MCP wire protocol: JSON-RPC framing, `initialize`, `tools/list`, `tools/call`, `resources/templates/list`, `resources/read`, `subscriptions/listen` | **`@bridger/mcp`** (this package) |
| Transports (stdio, Streamable HTTP, MessagePort) | adapter layers of this package, over the `Transport` of [`@bridger/remote`](../remote/README.md) where a session crosses a process |
| Authentication of a client or of an external server, OAuth flows | the transport adapter and the application; Bridger never authenticates |
| Which principal a session acts as | the application's `McpSessionPrincipal` port |
| Which commands a principal may see | the application's `ToolsetSelector` (command companion) |
| Whether a call is allowed | the application's `CommandGate` (core file [32](../core/behaviors/32-generic-gate-and-plan.md)) and, for host lifecycle operations, the core `OperationGate` |
| Tasks, taint policy, approval of deferred calls | `@bridger/agent` ([tasks](../agent/behaviors/02-tasks.md), [taint](../agent/behaviors/03-taint-and-provenance.md)) and the application |
| Resolving a plugin definition by name and version for a reconcile plan | the application's `DefinitionResolver` port (the manifest registry of [`@bridger/loader`](../loader/README.md) may provide one) |

What stays in core: nothing new. The package uses the contribution registry,
`Generation`, `inspect`, `reconcile` and the gates as they are, plus the
core seams of files 28–33 listed in the [README](./README.md#core-seams-this-package-needs).

What stays in the application: which tools are exposed to whom, what a
regulated command is, approval rules, and every product meaning of a tool.

## Public API surface

| API | Kind | Behaviour |
| --- | ---- | --------- |
| `McpServer.plugin(options)` | plugin definition | [BEH-MC-001](./behaviors/01-server.md#beh-mc-001-the-mcp-server-is-an-ordinary-plugin) |
| `McpSessionPrincipal` (answer `{ actor, annotations?, trusted? }`) | port (`Context.Service`) | [BEH-MC-002](./behaviors/01-server.md#beh-mc-002-a-session-has-one-principal-supplied-by-the-application) |
| `tools/list` projection, cursors, listing record | protocol | [BEH-MC-003](./behaviors/01-server.md#beh-mc-003-toolslist-follows-the-toolset-order-and-binds-cursors-to-its-revision) |
| `resources/templates/list`, `resources/read` → `Commands.dispatch` | protocol | [BEH-MC-007](./behaviors/01-server.md#beh-mc-007-read-models-are-served-as-resources-each-read-a-dispatch) |
| `tools/call` → `Commands.dispatch` | protocol | [BEH-MC-004](./behaviors/01-server.md#beh-mc-004-toolscall-is-a-command-dispatch), [BEH-MC-005](./behaviors/01-server.md#beh-mc-005-outcomes-map-to-results-and-errors-one-way) |
| list-changed notifications | protocol | [BEH-MC-009](./behaviors/02-list-changed.md#beh-mc-009-the-server-advertises-listchanged-and-serves-subscriptionslisten)–[BEH-MC-013](./behaviors/02-list-changed.md#beh-mc-013-a-session-subscription-ends-with-its-session) |
| `McpClient.import(options)` | plugin definition (remote proxy) | [BEH-MC-017](./behaviors/03-client-import.md#beh-mc-017-an-import-is-a-remote-proxy-plugin) |
| `JsonSchemaValidator` | port | [BEH-MC-019](./behaviors/03-client-import.md#beh-mc-019-input-is-checked-against-the-external-json-schema-before-it-leaves) |
| `HostTools.plugin(options)` | plugin definition | [BEH-MC-025](./behaviors/04-host-tools.md#beh-mc-025-host-tools-are-commands-contributed-by-one-plugin) |
| `DefinitionResolver` | port | [BEH-MC-028](./behaviors/04-host-tools.md#beh-mc-028-reconcile-plan-returns-a-plan-and-changes-nothing) |
| `PlanStore` (inside the host-tools plugin), `PlanUnknown` | internal store, error | [BEH-MC-028](./behaviors/04-host-tools.md#beh-mc-028-reconcile-plan-returns-a-plan-and-changes-nothing), [BEH-MC-029](./behaviors/04-host-tools.md#beh-mc-029-reconcile-apply-applies-a-plan-only-through-both-gates) |

```ts
// illustrative — not type-checked
declare const McpServer: {
  plugin(options: {
    readonly id: string                                   // plugin id, e.g. "mcp-server"
    readonly transport: McpServerTransport                // stdio | streamable-http | message-port adapter
    readonly serverInfo: { readonly name: string; readonly version: string }
    readonly selector?: ToolsetSelector                   // command companion; default excludes regulated
    readonly pageSize?: number                            // tools/list page size, default 100
    readonly instructions?: string
    readonly resources?: { readonly scheme: string }     // read-only commands tagged "mcp-resource" as resources
    readonly maxResultBytes?: number                      // envelope cap of a result's model-facing text, default 32768
    readonly maxStructuredBytes?: number                  // cap of structuredContent, default 1048576
  }): Plugin<[CommandCatalog, McpSessionPrincipal], [], never>
}

declare const McpClient: {
  import(options: {
    readonly id: string                                   // proxy plugin id
    readonly transport: McpClientTransport
    readonly prefix: string                               // command id prefix, e.g. "docs"
    readonly realm?: string
    readonly timeout?: Duration.Input                     // per call, default 30 seconds; never "forever"
    readonly map?: (tool: ExternalTool) => ImportMapping  // tags, regulated, include/exclude; default: include, tags ["external"]
  }): Plugin<[CommandCatalog, JsonSchemaValidator, Bridger.Host], [], never>
}

declare const HostTools: {
  plugin(options?: { readonly id?: string; readonly apply?: boolean; readonly maxPlans?: number; readonly planTtl?: Duration.Input }): Plugin<
    [Bridger.Host, CommandCatalog, DefinitionResolver], [], never>
}
```

## Worked example

```ts
// illustrative — not type-checked
// 1. The application supplies who a session is. Bridger does not authenticate.
const principals = Layer.succeed(McpSessionPrincipal, {
  resolve: (session) => session.auth?.subject
    ? Effect.succeed({ actor: { id: session.auth.subject, kind: "user" as const } })
    : Effect.fail(new McpSessionRefused({ reason: "unauthenticated" }))
})

// 2. Serve the catalog, import an external documentation server, expose the host.
yield* host.install(McpServer.plugin({ id: "mcp-server", transport: streamableHttp({ port: 8711 }),
  serverInfo: { name: "pos-terminal", version: "1.4.0" } }))
yield* host.install(McpClient.import({ id: "docs-mcp", prefix: "docs", transport: stdio(["docs-server"]) }))
yield* host.install(HostTools.plugin())

// 3. A client lists tools. The order is the toolset order: by command id.
//    → bridger.host.inspect, bridger.host.reconcile-plan, bridger.host.snapshot, docs.search, sales.quote
// 4. The client calls docs.search. The call pins the session's toolset for that
//    call and is one Commands.dispatch with the digest the client listed. The
//    session is tainted ("mcp-inbound:mcp-server") because the resolver did not
//    answer `trusted: true`, so any write it asks for is deferred or refused by
//    the taint floor (BEH-MC-002). docs.search is tagged "external" and its whole
//    output is untrusted, so an agent session that reads its result is tainted
//    too (BEH-MC-020, BEH-AG-019).
// 5. The client calls bridger.host.reconcile-plan with a desired list. It receives a
//    plan; nothing changes. reconcile-apply is regulated, so the default selector
//    never lists it; an application that opts in still faces the command gate and,
//    per entry, the host's OperationGate.
```

## Relation to the MCP specification

The package targets the MCP revision of 2026-07-28
([ADR-MC-004](./decisions/004-target-mcp-2026-07-28.md)): `tools/list` in a
deterministic order, list changes pushed through `subscriptions/listen`,
`outputSchema` with `structuredContent`, annotations treated as untrusted, and
tasks as an extension. Wire field names in this specification follow that
revision; where a later revision renames them, the adapter follows and the
behaviours here are unchanged.

---

_Next: [01 — Server](./behaviors/01-server.md)_
