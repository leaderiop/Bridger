# 01 — Server

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-BEH-01                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-08): Resolutions of the round-2 agent review (A-05, A-06, A-07, A-17): what a default (tainted) session can do — declared reads and resources on the gate's decision, writes only through an approval the client never applies; the model-facing text of a result rendered through `Command.envelope` with `maxResultBytes`, `structuredContent` capped by `maxStructuredBytes`; command tasks are MCP tasks when negotiated, a deferred call never; a long command awaited with `timeout: "forever"` (CCR-MC-003)<br>0.3 (2026-11-08): Inbound sessions tainted unless the application's resolver marks them trusted (BEH-MC-002); the session's listing record and `expectDigest` refuse a call whose definition changed since it was listed, `ToolChanged` mapped (BEH-MC-003–005); `readOnlyHint` from the descriptor; idempotency key from `_meta`; long commands as tasks; new outcomes mapped; MCP resources as projections of read-only commands (BEH-MC-006, BEH-MC-007) (CCR-MC-003, round 2: recheck items 1, 6, 7, 9; X7, X8)<br>0.2 (2026-11-08): `tools/call` pins per call and passes the toolset; deferred direct calls are `isError` results; `onBehalfOf` wording; `Annotations` type (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

An MCP server turns a host's commands into tools a model client can list and
call. The temptation is to give it its own tool table; that table would drift
from the command catalog, skip the command gate, and order tools however the
server happened to build them. This file specifies the server as a projection
of a `@bridger/command` toolset and nothing more
([ADR-MC-001](../decisions/001-server-projects-a-toolset.md)). This file owns
BEH-MC-001–008 and uses 001–007; 008 is reserved.

Planned source: `packages/mcp/src/McpServer.ts`, `packages/mcp/src/Session.ts`
*(Planned)*. Toolsets, their order and pinning are in the command companion
([03 — Toolsets](../../command/behaviors/03-toolsets.md)); dispatch is in
[02 — Dispatch](../../command/behaviors/02-dispatch.md).

## BEH-MC-001: The MCP server is an ordinary plugin

> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-BR-002](../../core/decisions/002-plugin-build-is-a-layer.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [20 — Generation](../../core/behaviors/20-generation.md)

```ts
// illustrative — not type-checked
McpServer.plugin(options: McpServerOptions):
  Plugin<[CommandCatalog, McpSessionPrincipal], [], never>

interface McpServerOptions {
  readonly id: string
  readonly transport: McpServerTransport
  readonly serverInfo: { readonly name: string; readonly version: string }
  readonly selector?: ToolsetSelector        // passed to Toolsets.forPrincipal; default excludes regulated
  readonly pageSize?: number                 // default 100, integer 1..1000
  readonly instructions?: string
  readonly resources?: { readonly scheme: string }   // BEH-MC-007; absent: no resources capability
}
```

```
REQUIREMENT: `McpServer.plugin` MUST return an ordinary plugin definition. Its
             build MUST open the transport listener in the activation scope,
             and the listener MUST close when that scope closes. The package
             MUST NOT add an operation to the `Host` interface.
```

```
REQUIREMENT: Removing, restarting or replacing the server plugin MUST end
             every MCP session it holds: in-flight `tools/call` requests are
             leases on the commands they dispatch (command companion,
             02 — Dispatch) and drain under the host's rules; once the scope
             closes, the transport MUST answer new requests with a
             JSON-RPC error and close.
```

```
REQUIREMENT: The server MUST keep no list of tools of its own. Every tool it
             lists and every tool it calls MUST come from a `Toolset` of the
             command catalog.
```

A server that is a plugin inherits everything the host already says about
plugins: it is installed, attributed, gated (core `OperationGate`) and
audited as a plugin; it can wait for its requirements; `inspect` shows it.

**Settled here.** Session ending on removal is the drain of the server's
activation scope, not a separate shutdown protocol: an MCP client loses its
connection exactly when the plugin stops serving.

**Open.** Whether one server plugin may serve several transports at once, or
one plugin per transport is required. This draft assumes one transport per
plugin.

## BEH-MC-002: A session has one principal, supplied by the application

> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Core seam:** [22 — Attributable operations](../../core/behaviors/22-attributable-operations.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)
> **Risk:** [RSK-BR-005](../../core/gxp/03-risk-assessment.md#rsk-br-005)

```ts
// illustrative — not type-checked
interface McpSessionInfo {
  readonly sessionId: string                 // from the transport
  readonly clientInfo?: { readonly name: string; readonly version: string }
  readonly auth?: { readonly subject: string; readonly claims: Readonly<Record<string, unknown>> }  // set by the transport adapter
}
interface McpSessionPrincipalShape {
  readonly resolve: (session: McpSessionInfo) =>
    Effect.Effect<{
      readonly actor: Actor
      readonly annotations?: Annotations       // core file 30
      readonly trusted?: boolean               // default false: the session is tainted (below)
    }, McpSessionRefused>
}
class McpSessionPrincipal extends Context.Service<McpSessionPrincipal, McpSessionPrincipalShape>()(
  "@bridger/mcp/McpSessionPrincipal") {}

class McpSessionRefused extends Schema.TaggedError<McpSessionRefused>()("McpSessionRefused", {
  reason: Schema.String
}) {}
```

```
REQUIREMENT: At `initialize`, the server MUST call
             `McpSessionPrincipal.resolve` exactly once and bind the returned
             `actor` to the session for its lifetime. On `McpSessionRefused`,
             or on any failure or defect of `resolve`, the server MUST refuse
             the session with a JSON-RPC error and MUST NOT list or call any
             tool for it.
```

```
REQUIREMENT: Unless `resolve` returned `trusted: true`, the session MUST be
             tainted: every dispatch it makes MUST carry core's
             `Annotation.Taint` with the label "mcp-inbound:" followed by
             the server plugin's id, added to the session's annotations at
             `initialize`. Because the key is monotonic (core BEH-BR-290),
             nothing later in the session can remove it. `trusted` MUST be
             read only from the resolver's answer; no client field, tool
             argument or `_meta` value MAY set or clear it.
```

```
REQUIREMENT: Documentation MUST state what a tainted session — the default —
             can do. Because the command catalog's taint floor keeps the
             gate's decision for a command declared `readOnly` (command
             BEH-CM-016), a tainted session can call declared reads and
             read resources (BEH-MC-007) as the gate decides, and with no
             gate wired it can read whatever its toolset lists. Every
             other call ends `CommandDeferred` (with a draft source) or
             `CommandRefused`: the server never passes an approval
             (BEH-MC-004), and an approved draft is applied by the
             application, never returned to the client. A deployment
             whose reads must be released by a person builds the catalog
             with `taintFloor.readOnly: "floor"` and accepts that such a
             session then reads nothing.
```

```
REQUIREMENT: The package MUST NOT provide a `McpSessionPrincipal`
             implementation other than the test fixture of the testing entry
             point. It MUST NOT derive an actor from `clientInfo`, from a tool
             argument, or from any field the client controls without the
             transport adapter's authentication.
```

```
REQUIREMENT: Every `tools/call` and `resources/read` of a session MUST be
             dispatched with an `OperationContext` whose `actor` is the
             session's actor and whose annotations include the session's
             annotations and a provenance entry naming the MCP session
             (core file 30). Because the server
             plugin's code dispatches, dispatch records the server plugin as
             `onBehalfOf` (the dispatching fiber's principal, core
             BEH-BR-258) and the session's actor as the actor; the server
             MUST NOT put the actor anywhere else.
```

Attribution matters most at the edge where a model's request enters the host.
The rule follows core [BEH-BR-191](../../core/behaviors/22-attributable-operations.md):
core does not authenticate and does not infer identity; neither does this
package. A deployment with no authentication supplies a resolver that refuses,
or one that maps every session to a named service actor — visibly.

**Settled here.** (1) No permissive default resolver is shipped, for the
reason core ships no permissive gate (BEH-BR-217): a default that admits
everyone would look like an access decision. (2) Inbound sessions are tainted
by default (recheck X8): an MCP client is usually a model acting on text the
host never saw, so its requests reach the command catalog's taint floor
(command BEH-CM-016) and are never allowed on an automatic decision. An
application marks a client trusted — its own UI, a test harness — in its
resolver, after its own authentication, and the choice is visible there.

**Open.** Whether a session's principal may change during the session (token
refresh with a different subject). This draft refuses: a new subject needs a
new session.

## BEH-MC-003: tools/list follows the toolset order and binds cursors to its revision

> **Invariant:** [INV-MC-001](../invariants.md#inv-mc-001-toolslist-order-is-the-toolset-order)
> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-MC-004](../decisions/004-target-mcp-2026-07-28.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md)

```ts
// illustrative — not type-checked
// tools/list result element, derived from a CommandDescriptor (command companion, 04)
interface McpTool {
  readonly name: string                       // = CommandDescriptor.id
  readonly title?: string
  readonly description?: string
  readonly inputSchema: JsonSchema            // JSON Schema 2020-12, encoded side
  readonly outputSchema: JsonSchema
  readonly annotations?: McpToolAnnotations   // only from an application mapping; see below
}
// opaque cursor: base64url of { r: toolsetRevision, o: offset, f: fingerprint }
```

```
REQUIREMENT: For each session the server MUST obtain the session's toolset
             through `Toolsets.forPrincipal(actor, selector)`, which returns
             a read-only `GenerationView<Toolset>` (command BEH-CM-018), and MUST answer
             `tools/list` from the toolset value current when the request is
             admitted. The listed tools MUST appear in the toolset's order
             (command id, code-unit order) and MUST NOT be re-sorted,
             filtered or extended by the server.
```

```
REQUIREMENT: Pagination MUST split that order into pages of `pageSize`.
             A `nextCursor` MUST bind the toolset revision and fingerprint it
             was issued against. A request whose cursor names a revision or
             fingerprint other than the current one MUST fail with JSON-RPC
             error -32602 and data `{ reason: "toolset-changed" }`; the
             server MUST NOT serve a page that mixes two toolset revisions.
```

```
REQUIREMENT: Two `tools/list` requests answered from the same toolset revision
             MUST return byte-identical tool arrays, whatever the order in
             which commands were contributed or plugins activated.
```

```
REQUIREMENT: `annotations` (`destructiveHint`, `idempotentHint` and the
             rest) MUST be absent unless the application supplies a mapping
             from command tags to annotations. The server MUST NOT infer
             them. The one exception is `readOnlyHint`, which MUST be `true`
             exactly when the descriptor's `readOnly` is true (command
             BEH-CM-006) and absent otherwise; it carries the command
             author's declaration, not a guarantee.
```

```
REQUIREMENT: For each session the server MUST keep a *listing record*:
             for every tool name it has served in a `tools/list` page, the
             descriptor digest of that page's toolset, replaced when a later
             page lists the name again and kept for the life of the
             session. The record MUST NOT be shared between sessions.
```

MCP's 2026-07-28 revision requires a deterministic `tools/list` order so that
a client can cache and compare lists, and so that prompt caches over a tool
list stay warm. Ordering by command id gives that without depending on
activation history ([18 — Reconciliation and confluence](../../core/behaviors/18-reconciliation-and-confluence.md)
exists to remove exactly that dependency).

**Settled here.** (1) A stale cursor fails rather than silently restarting:
a client that receives the error re-lists from the start, which is what a
list-changed notification would have told it to do anyway. (2) Annotations
are hints the MCP specification itself calls untrusted; inventing them from
tags would turn a label into a safety claim.

**Settled here (listing record).** The record is what lets a call be checked
against what the client was shown, however long ago (BEH-MC-004), without
holding a toolset pin between requests: a pin held from `tools/list` to the
next would let one idle client keep a retired toolset alive.

## BEH-MC-004: tools/call is a command dispatch

> **Invariant:** [INV-MC-005](../invariants.md#inv-mc-005-every-toolscall-is-a-command-dispatch)
> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [31 — Hook points](../../core/behaviors/31-hook-points.md), [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```
REQUIREMENT: `tools/call { name, arguments }` MUST be served by pinning the
             session's current toolset for that one request —
             `Toolsets.pin(actor, selector)` in the request's scope (command
             BEH-CM-019) — and then by exactly one
             `Commands.dispatch(name, arguments, { context, toolset,
             expectDigest, idempotencyKey })`, with the session's context of
             BEH-MC-002, that pin, `expectDigest` the digest the session's
             listing record holds for `name` (BEH-MC-003) and
             `idempotencyKey` the request's `_meta["bridger/idempotency-key"]`
             when present (command BEH-CM-041). The pin MUST
             be released when the request ends. The server MUST NOT call a
             command handler any other way, MUST NOT pass
             `options.approval`, and MUST NOT decode, default or rewrite
             `arguments` before dispatch; decoding is dispatch's step 2.
```

```
REQUIREMENT: A `tools/call` for a name absent from the session's listing
             record MUST be answered with JSON-RPC error -32602 and data
             `{ reason: "unlisted-tool" }` without dispatching: a client
             calls only what it was shown.
```

```
REQUIREMENT: Membership and definition MUST be checked by dispatch's step 1
             against the pin and the listed digest (`ToolNotInToolset`,
             `ToolChanged`), which fails before the gate, the hooks and the
             call log; the server MUST NOT keep
             a separate membership check of its own. A pin refused with
             `AdmissionClosed` (the server is stopping) MUST be answered
             with JSON-RPC error -32603 and data
             `{ reason: "server-stopping" }`.
```

```
REQUIREMENT: Cancellation of a request by the client
             (`notifications/cancelled`) and loss of the session MUST
             interrupt the dispatching fiber. The command companion's
             dispatch rules then apply: the handler's child fiber is
             interrupted and its finalizers awaited before the contribution
             lease is released.
```

```
REQUIREMENT: The server MUST NOT apply a timeout longer than the command's
             own (command companion, 02 — Dispatch). A `_meta` deadline sent
             by the client MAY shorten it and MUST then be carried as the
             deadline annotation of core file 30.
```

Pinning the *current* toolset at call time, rather than a toolset pinned at
`tools/list`, is deliberate: MCP clients may hold a list for hours, and a
command withdrawn in the meantime must not stay callable because a client
cached it. Passing the *listed* digest closes the other half (recheck X7): a
command whose definition changed since the client listed it is refused with
`ToolChanged` instead of running a description the model never saw, which is
what the command companion's INV-CM-003 promises. The pin and the digest make
the check and the use one step: dispatch checks membership and digest at
step 1 and compares the digest again inside the contribution hold, so there is
no window in which the toolset is republished between a server-side check and
the dispatch ([INV-MC-005](../invariants.md#inv-mc-005-every-toolscall-is-a-command-dispatch),
[INV-MC-007](../invariants.md#inv-mc-007-a-toolscall-runs-the-definition-the-session-listed)).

**Settled here.** (1) One membership check, dispatch's own. It runs at step 1,
before the gate, so a name the session was never offered still costs no
authorization request and no `CallLog` entry. (2) A long command (command
BEH-CM-052) dispatched for a session that negotiated the tasks extension is
answered as an MCP task through `@bridger/agent`'s bridge
([BEH-AG-015](../../agent/behaviors/02-tasks.md#beh-ag-015-command-tasks-in-the-bridges));
otherwise the server awaits the task with `CommandTasks.await(taskId, {
timeout: "forever" })`, bounded only by the command's own timeout and by the
request: a cancellation of the request or loss of the session interrupts the
wait and cancels the task, and the terminal snapshot is mapped as a dispatch
outcome (BEH-MC-005). A keyed repeat of the call gets the same task
(command BEH-CM-041).

**Open.** Whether a client that lost its listing record (a new session after a
reconnect) should be allowed to call without listing again; this draft
refuses with "unlisted-tool".

## BEH-MC-005: Outcomes map to results and errors one way

> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-MC-004](../decisions/004-target-mcp-2026-07-28.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

| Dispatch outcome | MCP answer |
| ---------------- | ---------- |
| success `O` | result `{ structuredContent: encode(O), content: [{ type: "text", text: canonical JSON of Command.envelope(descriptor, encode(O), { maxBytes: maxResultBytes }) }], isError: false }`, with `_meta["bridger/untrusted"] = descriptor.untrustedOutput` when that list is non-empty (command BEH-CM-030) |
| success `O` whose encoded output exceeds `maxStructuredBytes` | result `{ isError: true, content: [{ type: "text", text: "result too large" }] }` with `_meta["bridger/too-large"] = { succeeded: true, bytes, max }`: the command ran, and its output is not sent |
| success of a long command (a terminal `done` task, or an MCP task when negotiated) | as success, from the task's encoded output; `failed` and `cancelled` tasks as the error they carry |
| handler error `E` (declared `error` schema) | result `{ isError: true, structuredContent: { error: encode(E) }, content: [text] }` |
| `CommandInputInvalid` | result `{ isError: true }` with the decode issues as text (the model can correct its arguments) |
| `CommandRefused`, `CommandVetoed` | result `{ isError: true }` with `_meta["bridger/refused"] = { by: "gate" \| "hook", reason }`; for a veto, `reason` is the verdict's cause and code (command BEH-CM-012) |
| `CommandDeferred { draftId }` (a gate's deferral or the taint floor's) | result `{ isError: true }` with `_meta["bridger/deferred"] = { draftId }`, whether or not the session negotiated the tasks extension |
| `ToolChanged` | result `{ isError: true }` with `_meta["bridger/changed"] = { expected, actual }`: the definition differs from the one the session listed; the client lists again |
| `IdempotencyConflict` | result `{ isError: true }` with `_meta["bridger/idempotency"] = { reason }` |
| `CommandTimeout`, `LeaseRevoked`, `ContributionUnavailable`, `CommandBreakerOpen`, `CommandWrapperFailed` | result `{ isError: true }` with `_meta["bridger/unavailable"] = { _tag }` |
| `ApprovalMismatch`, `CommandDraftStale` | cannot occur: the server never passes an approval (BEH-MC-004); treated as a defect if it does |
| `CommandOutputInvalid`, defect | JSON-RPC error -32603; the cause is logged, never sent |
| `CommandNotFound`, `ToolNotInToolset` | JSON-RPC error -32602 `{ reason: "unknown-tool" }` |

```
REQUIREMENT: The server MUST map every dispatch outcome as in the table above,
             and no outcome in any other way. `structuredContent` MUST be the
             encoded output and MUST conform to the tool's `outputSchema`.
```

```ts
// illustrative — not type-checked
// McpServerOptions gains:
//   readonly maxResultBytes?: number       // the envelope's maxBytes for `content` text; default 32768 (command BEH-CM-030)
//   readonly maxStructuredBytes?: number   // bound on structuredContent's canonical JSON; default 1048576
```

```
REQUIREMENT: The text the server puts in `content` for a successful call,
             and the `text` of a resource read (BEH-MC-007), MUST be the
             canonical JSON of `Command.envelope(descriptor, encoded,
             { maxBytes: maxResultBytes })`, never the raw output: that is
             the part of a result a client's model reads, and the envelope
             keeps untrusted values out of the data under numbered
             references and bounds their size. `structuredContent` MUST
             stay the raw encoded output, because it must conform to the
             output schema; when its canonical JSON exceeds
             `maxStructuredBytes`, the server MUST answer with the
             "too-large" row of the table and MUST NOT truncate it.
             Documentation MUST state that a client that hands
             `structuredContent` to a model bypasses the envelope.
```

```
REQUIREMENT: A defect's cause, a stack trace, a configuration value or a
             service object MUST NOT appear in any result or error sent to
             the client.
```

```
REQUIREMENT: A deferred call MUST NOT be reported as a success. Its draft
             MUST be applied, if ever, only through the gate's draft path
             (core file 32), never by repeating the `tools/call`.
```

The split follows MCP's own rule: errors a model can act on — wrong
arguments, a refusal, a handler's declared failure — are tool results with
`isError: true`, so the model sees them; protocol faults are JSON-RPC errors.
A deferred call is neither success nor failure; the `isError` result with
the draft id says "not done, waiting for a person" without inventing a task
that nothing would complete.

**Settled here.** (1) A deferred direct call is an `isError` result, not a
success with an empty body: a model that reads "success" would assume the
change happened. (2) A *deferred* direct `tools/call` never becomes an MCP
task: nothing runs behind it that would complete, and the approved draft is
applied by the application re-dispatching it, not by the client. MCP tasks
are offered for agent runs and for command tasks — a long command the call
started, when the session negotiated the tasks extension (BEH-MC-004) —
through `@bridger/agent`'s bridge
([BEH-AG-014](../../agent/behaviors/02-tasks.md#beh-ag-014-the-mcp-tasks-bridge),
[BEH-AG-015](../../agent/behaviors/02-tasks.md#beh-ag-015-command-tasks-in-the-bridges)).
(3) The model-facing text goes through the same envelope the agent loop
uses (agent BEH-AG-023), so a command's untrusted fields reach an external
model marked and bounded as they reach an in-process one (recheck item 8).

**Open.** Whether `content` should carry a text rendering at all when the
client declares it reads `structuredContent`. Kept for older clients.

## BEH-MC-006: The server never widens what the command companion allows

> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
> **Core seam:** [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)

```
REQUIREMENT: The server MUST NOT offer an operation that the command
             catalog does not: no `resources/*` or `prompts/*` capability
             that reaches host state other than the projection of
             BEH-MC-007, no raw `Host` method, no direct service call.
             Prompts, if added later, MUST be projections of contributions
             with the same gate path.
```

```
REQUIREMENT: Being listed in a toolset MUST NOT be treated as permission.
             The command gate is consulted on every call, whatever the
             session saw in `tools/list`.
```

```
REQUIREMENT: The server MUST NOT describe a realm, a session or a toolset as
             an isolation boundary. Code that shares the host's process can
             reach what the host can reach.
```

**Settled here.** Tools, and resources as projections of read-only commands
(BEH-MC-007), are served; prompts are excluded until they can be specified as
catalog projections with the same path. Serving anything ad hoc would be the
back door the single dispatch path exists to close.

## BEH-MC-007: Read models are served as resources, each read a dispatch

> **Invariant:** [INV-MC-005](../invariants.md#inv-mc-005-every-toolscall-is-a-command-dispatch)
> **See:** [ADR-MC-001](../decisions/001-server-projects-a-toolset.md), [ADR-MC-005](../decisions/005-inbound-sessions-are-tainted-and-calls-pinned-to-the-listed-digest.md)
> **Core seam:** [20 — Generation](../../core/behaviors/20-generation.md)

```ts
// illustrative — not type-checked
// McpServerOptions gains:
//   readonly resources?: { readonly scheme: string }    // e.g. "app"; absent: no resources capability
// A read-only command opts in with the tag "mcp-resource"; its URI template is derived from its id and
// the required string fields of its input, in schema order:
//   catalog.item-view { itemId }  →  app://catalog.item-view/{itemId}
interface McpResourceTemplate {
  readonly uriTemplate: string
  readonly name: string                     // = CommandDescriptor.id
  readonly title?: string
  readonly description?: string
  readonly mimeType: "application/json"
}
```

```
REQUIREMENT: When `resources` is given, the server MUST advertise the
             resources capability and MUST answer
             `resources/templates/list` with one template per command of the
             session's current toolset that is `readOnly` (command
             BEH-CM-006), carries the tag "mcp-resource", is not `long`,
             and whose input schema's required properties are all strings;
             in toolset order, paginated and bound to the toolset revision
             as `tools/list` is (BEH-MC-003). Each listed name MUST enter
             the session's listing record with its digest.
```

```
REQUIREMENT: `resources/read { uri }` MUST parse the URI against the
             listed templates; an unknown scheme, name or shape MUST be
             answered with JSON-RPC error -32602 and data
             `{ reason: "unknown-resource" }`. A matching read MUST be served
             exactly as a `tools/call` of that command with the URI's
             variables as `arguments` (BEH-MC-004): one pin, one
             `Commands.dispatch` with the session's context, `toolset` and
             `expectDigest`. Its success MUST be returned as one
             `contents` entry `{ uri, mimeType: "application/json", text:
             canonical JSON of the envelope of the encoded output }`
             (BEH-MC-005, `maxResultBytes`); every other outcome MUST be a
             JSON-RPC error carrying the `_meta` of BEH-MC-005 as data.
```

```
REQUIREMENT: The server MUST NOT serve `resources/subscribe` in this
             revision, and MUST NOT describe a resource as a snapshot of
             host state: it is the output of a command, read at request
             time, under the command gate.
```

A model that must look something up — a product, a stock level, a search
result — reads better from a resource than from a tool it has to decide to
call, and MCP clients treat resources as context. Projecting resources from
read-only commands keeps them inside the one dispatch path: the gate, the
taint floor, the hooks and the call log see every read, and a resource is
listed only when the session's toolset already offers its command. Because
the floor keeps the gate's decision for a declared read (command
BEH-CM-016), a default (tainted) session can read resources; under
`taintFloor.readOnly: "floor"` it cannot.

**Settled here.** (1) Opt-in by tag and declaration, never inferred: a command
author declares `readOnly`, the application tags what it wants as a resource.
(2) No subscriptions: an update feed for a read model would need a change
signal the catalog does not have.

**Open.** A `prompts` projection of contributed prompt templates (a second
registry in the command companion) is a candidate for a later revision.

---

_Next: [02 — List-changed notifications](./02-list-changed.md)_
