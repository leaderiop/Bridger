# 03 — Client Import

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-BEH-03                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-09): The import is a remote link: build opens nothing, session in the background on the reconnect schedule, commands on a session child withdrawn when the session ends, connect and handshake failures retried and reported, never a build failure (BEH-MC-017); in-flight calls on a lost session fail with `SessionLost` under remote's outcome rule, later calls with `RemoteUnavailable` (BEH-MC-018); identity forwarded only through the `disclose` option in `_meta` "bridger/claims", replacing the undefined `ImportMapping` projection (BEH-MC-022); `owner` is the session child (BEH-MC-020); BEH-MC-022 call-log entries name the claims sent in core's new `CrossingInfo.disclosed`, unconditionally (core CCR-BR-033); BEH-MC-017: the import reconnects after a session ends except when stopping or after a refused mount; its status is its own `McpClientStatus` from `McpClient.layer`, not remote's `RemoteStatus`; BEH-MC-022 disclosure listed there (independent review) (CCR-MC-004)<br>0.3 (2026-11-08): Imported commands declare their whole output untrusted (`jsonSchema.untrusted`, command BEH-CM-030), so every consumer can render it through the model-facing envelope; never `readOnly` (CCR-MC-003, round 2: recheck item 8)<br>0.2 (2026-11-08): Supplied JSON Schema; declared `ImportedToolError`; dispatch's timeout; imported commands marked external instead of tainted values; `externalAnnotations` and `title` (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

A host often needs tools it does not implement: a documentation search, an
issue tracker, a vendor's catalog. MCP servers provide such tools. Importing
them must not open a side door: an imported tool is called through the same
dispatch path and gate as a local command, its output is text written by a
party the host does not control, and its annotations are claims by that
party. This file specifies the import as a link in the sense of the remote
companion: active at once, with the MCP session in the background and the
imported commands mounted and withdrawn with each session
([ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)).
This file owns BEH-MC-017–024 and uses 017–022; 023–024 are reserved.

Planned source: `packages/mcp/src/McpClient.ts` *(Planned)*. The link
mechanics — a build that opens nothing remote, sessions in the background on
a reconnect schedule, one session child per session, epochs, call outcomes,
calls as leases — are those of [`@bridger/remote`](../../remote/README.md)
(BEH-RM-001–003, BEH-RM-010–013, BEH-RM-020, BEH-RM-021), with the MCP
protocol in place of the remote frame protocol; this file adds only what MCP
needs on top.

## BEH-MC-017: An import is a link whose session child carries the imported commands

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [`@bridger/remote`](../../remote/README.md)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)

```ts
// illustrative — not type-checked
McpClient.import(options: {
  readonly id: string
  readonly transport: McpClientTransport            // stdio child process, Streamable HTTP, MessagePort
  readonly prefix: string                           // /^[a-z][a-z0-9-]*$/
  readonly realm?: string
  readonly timeout?: Duration.Input                 // per call; default 30 seconds; "forever" refused
  readonly map?: (tool: ExternalTool) => ImportMapping
  readonly reconnect?: Schedule.Schedule<unknown, unknown>   // as remote's RemoteOptions.reconnect; same default
  readonly handshakeTimeout?: Duration.Input        // bounds connect + `initialize` + first `tools/list`; default 10 seconds
  readonly disclose?: readonly ("actor" | "onBehalfOf" | "correlationId")[]   // BEH-MC-022; default none
}): Plugin<[CommandCatalog, JsonSchemaValidator, Bridger.Host], [], never>

// Context.Service "@bridger/mcp/McpClientStatus", provided as a base service by McpClient.layer;
// an import reads it with Effect.serviceOption
interface McpClientStatus {
  readonly imports: Effect.Effect<ReadonlyArray<McpImportStatus>>
  readonly changes: Stream.Stream<McpImportStatus>
}
interface McpImportStatus {
  readonly id: string; readonly realm: string
  readonly session: "none" | "connecting" | "open" | "lost" | "refused"
  readonly epoch?: string
  readonly server?: { readonly name: string; readonly version: string }   // from `initialize`; untrusted text
  readonly tools: number                    // commands on the current session child
  readonly lastFailure?: { readonly stage: "connect" | "initialize" | "tools/list" | "mount"; readonly tag: string }
  readonly lastEnd?: "transport-closed" | "heartbeat-missed" | "mount-refused" | "stopping"   // the subset of remote's SessionEnd reasons an import has
  readonly disclosed: readonly ("actor" | "onBehalfOf" | "correlationId")[]   // BEH-MC-022; never values
}

interface ExternalTool {                            // as received; every field untrusted
  readonly name: string
  readonly title?: string
  readonly description?: string
  readonly inputSchema: unknown
  readonly outputSchema?: unknown
  readonly annotations?: unknown
}
interface ImportMapping {
  readonly include: boolean                         // default true
  readonly tags?: readonly string[]                 // "external" is always added
  readonly regulated?: boolean                      // default false; set by the application, never by the server
}
```

```
REQUIREMENT: `McpClient.import` MUST return a link in the sense of
             `@bridger/remote` (BEH-RM-001, BEH-RM-003): its build MUST
             create only local resources (the transport object, a child
             process handle) and MUST fork the session work — connect,
             `initialize`, the first `tools/list` — with
             `Plugin.Runtime.background` under the policy "restart" with the
             `reconnect` schedule. The build MUST NOT await the external
             server, and the plugin MUST become `active` whether or not the
             server is reachable.
```

```
REQUIREMENT: A session is established when `initialize` and the first
             `tools/list` have completed within `handshakeTimeout`. For each
             established session the link MUST mount exactly one session
             child, child id "session", through `Plugin.Runtime.install`,
             and the child's activation scope MUST hold that session's
             command contributions — one per included tool. At most one
             session child MUST be registered at any revision. When the
             session ends, for any reason, the child MUST be withdrawn as
             remote's BEH-RM-013 and BEH-RM-026 withdraw a session child,
             and with it every imported command. The link MUST then
             reconnect on its schedule, except when the session ended
             because the link is stopping, or because the child's mount was
             refused (below): after a refused mount it opens no further
             session, as remote's BEH-RM-013 states. Stopping the link MUST
             stop the child and close the session without waiting on the
             server (BEH-RM-005).
```

```
REQUIREMENT: `McpClient.layer` MUST provide `McpClientStatus` as a base
             service, and each import MUST keep its entry current: one entry
             per installed import, published on `changes` at every change
             of `session`, `tools`, `lastFailure` or `lastEnd`, and removed
             when the import stops. Entries MUST carry no argument, result,
             credential or claim value. The import's background fiber names
             and counts MUST also appear in core `inspect` (BEH-BR-090). The
             remote companion's `RemoteStatus` lists only links built with
             `Remote.define` and MUST NOT be used for an import.
```

```
REQUIREMENT: A failed connect, `initialize` or first `tools/list` MUST NOT
             fail the link: no session is established, the failure MUST be
             logged and reported in the import's `McpClientStatus` entry
             (`lastFailure`, with the stage and the error's tag) when
             `McpClient.layer` is present (otherwise in the log only), and
             the link MUST try again on its schedule. While no session is
             established, the import provides no command, so a dispatch of
             an imported id fails as the command catalog fails it for an
             absent command.
```

```
REQUIREMENT: When the session child's mount fails — `ChildNotAllowed`
             (core BEH-BR-263) or any other error of
             `Plugin.Runtime.install` — the link MUST behave as remote's
             BEH-RM-002 states: end the session, not retry the mount, and
             call `Plugin.Runtime.reportFailure` naming the tag, and MUST
             record it in its `McpClientStatus` entry (`session` "refused",
             `lastFailure.stage` "mount", `lastEnd` "mount-refused").
             Documentation MUST state that an import needs an effective
             `allowChildren` of true and, where an `AccessPolicy` is wired,
             a policy that allows its `child` request for "session".
```

```
REQUIREMENT: Each imported tool MUST become a command with id
             `${prefix}.${normalized(name)}`, where `normalized` lower-cases
             the name and replaces every character outside `[a-z0-9-]` by
             `-`. Two external names that normalize to one id MUST both be
             excluded and reported as a contribution failure naming both;
             the import MUST NOT pick one.
```

```
REQUIREMENT: Each imported command MUST be made with
             `Command.make(id, spec)` (command BEH-CM-001) where: `input` is
             `Schema.Json` refined by the compiled external input schema
             (BEH-MC-019); `output` is as BEH-MC-019 states; `error` is
             `ImportedToolError`; `jsonSchema` carries the documents of
             BEH-MC-019; `title` and `description` are the external ones,
             bounded (BEH-MC-021); `externalAnnotations` is the external
             `annotations`, as data; `tags` always include "external";
             `regulated` comes from the `ImportMapping` only; and
             `timeout` is the import's `timeout`.
```

```ts
// illustrative — not type-checked
// The declared error schema of every imported command, so that a remote failure is a typed
// handler error (command BEH-CM-014), not a defect.
// SessionLost: the session ended with the call in flight ("unknown" or "not-executed");
// RemoteUnavailable: the call was made after its session ended ("not-executed").
const ImportedToolError = Schema.Union([RemoteUnavailable, RemoteTimeout, SessionLost, StaleEpoch, ImportedToolFailed])
class ImportedToolFailed extends Schema.TaggedError<ImportedToolFailed>()("ImportedToolFailed", {
  tool: Schema.String,
  message: Schema.String                         // the external error text, bounded; untrusted
}) {}
```

```
REQUIREMENT: The package MUST NOT describe an imported server as isolated,
             confined or inspected. It runs wherever its transport runs, as
             the deployment arranged.
```

Being a plugin gives the import everything the host already guarantees:
the operator installs it under attribution and the `OperationGate`, removal
drains the calls in flight, and `inspect` lists its contributions by name.

**Settled here.** (1) Name collisions after normalization exclude both tools.
Keeping one would make the outcome depend on the order the external server
listed them in. (2) The import follows remote's lifecycle, not one of its
own (CCR-MC-004). Revision 0.3 opened the session in the build, so an
unreachable server failed the plugin with phase "build" — a sticky failure
for an availability condition, and a build slot held on the network, which
remote's BEH-RM-003 forbids for every link. Carrying the commands on a
session child means a lost server withdraws the commands, as a partition
withdraws a remote contract, and a returning server mounts them again with
no operator call.

**Open.** Import of external resources and prompts is out of scope with the
server's own exclusion (BEH-MC-006).

## BEH-MC-018: An imported call is a lease on the proxy and always has a timeout

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md), [ADR-BR-015](../../core/decisions/015-leases-one-primitive.md)
> **Core seam:** [09 — Leases](../../core/behaviors/09-leases.md), [`@bridger/remote`](../../remote/README.md)
> **Risk:** [RSK-BR-001](../../core/gxp/03-risk-assessment.md#rsk-br-001)

```
REQUIREMENT: The handler of an imported command MUST send one `tools/call`
             to the external server and runs, for its duration, under the
             contribution lease that dispatch takes (command companion,
             02 — Dispatch). Its bound is dispatch's: the import's `timeout`
             is the command's `CommandSpec.timeout`, narrowed by a deadline
             annotation or `options.timeout` (command BEH-CM-013), and on
             expiry dispatch interrupts the handler and fails with
             `CommandTimeout`. The handler MUST NOT race a timer of its own;
             its interruption finalizer MUST send `notifications/cancelled`
             for the request in flight.
```

```
REQUIREMENT: When a session ends (transport closed, missed heartbeat under
             the remote companion's rule, server shutdown), every call in
             flight on it MUST fail at once, before the session child's
             withdrawal begins, with the remote companion's
             `SessionLost { reason, outcome }` under its outcome rule
             (BEH-RM-020, BEH-RM-021): `outcome` "not-executed" only when
             the `tools/call` request was never handed to the transport,
             and "unknown" otherwise. A call made after its session ended —
             through a handler reference that outlived its contribution —
             MUST fail at once with `RemoteUnavailable` ("not-executed") and
             send nothing. Neither MUST be retried by this package.
```

```
REQUIREMENT: An external `isError` result MUST fail the handler with
             `ImportedToolFailed`. Reconnection follows the remote
             companion's epoch rule: each session has a fresh epoch, and a
             response that arrives under another session's epoch MUST be
             discarded and logged.
```

```
REQUIREMENT: `timeout: "forever"` MUST be refused at plugin definition time.
```

**Settled here.** (1) No retry: an external tool may have side effects the
host cannot see, and core never retries silently ([ADR-BR-005](../../core/decisions/005-failure-is-sticky.md)).
(2) A lost session reports "unknown" for a request that left the host: an
external tool that ran is never reported as not run, which would invite an
unsafe retry (remote ADR-RM-008). (3) An unreachable server leaves the
import `active` with no commands, never `failed`: the remote companion
settled partitions as withdrawal (ADR-RM-002), and BEH-MC-017 follows it.

## BEH-MC-019: Input is checked against the external JSON Schema before it leaves

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)

```ts
// illustrative — not type-checked
interface JsonSchemaValidatorShape {
  readonly compile: (schema: unknown) =>
    Effect.Effect<(value: unknown) => ReadonlyArray<JsonSchemaIssue>, JsonSchemaUnsupported>
}
class JsonSchemaValidator extends Context.Service<JsonSchemaValidator, JsonSchemaValidatorShape>()(
  "@bridger/mcp/JsonSchemaValidator") {}

class JsonSchemaUnsupported extends Schema.TaggedError<JsonSchemaUnsupported>()("JsonSchemaUnsupported", {
  tool: Schema.String,
  reason: Schema.String                          // e.g. "dialect", "root-not-object", or the validator's message
}) {}
```

```
REQUIREMENT: An imported command's `input` MUST be `Schema.Json` refined by
             the external `inputSchema` compiled through `JsonSchemaValidator`.
             A tool whose schema the validator cannot compile
             (`JsonSchemaUnsupported`) MUST be excluded and reported; it MUST
             NOT be imported with an unchecked input.
```

```
REQUIREMENT: The command's descriptor schemas MUST be supplied, not
             projected: `CommandSpec.jsonSchema.input` MUST be the external
             `inputSchema` as received (command BEH-CM-029), so that a
             served session sees what the external server declared and
             nothing invented. An external schema without `$schema` is
             taken as 2020-12, the MCP default, and the command companion
             adds the keyword; a schema that declares another dialect, or
             whose root does not describe an object, MUST exclude the tool
             with `JsonSchemaUnsupported` (reason "dialect" or
             "root-not-object") and be reported. The package MUST NOT
             convert between dialects.
```

```
REQUIREMENT: When the external tool declares an `outputSchema`, it MUST be
             `jsonSchema.output` under the same checks, the command's
             `output` codec MUST be `Schema.Json` refined by that compiled
             schema, and `structuredContent` that does not conform MUST
             fail dispatch's step 7 with `CommandOutputInvalid`. Without an
             `outputSchema`, the output MUST be typed as
             `{ content: Json, structuredContent?: Json }` and
             `jsonSchema.output` MUST be the fixed 2020-12 object document
             of that shape published with the package.
```

Effect Schema cannot be derived from an arbitrary JSON Schema at run time;
a validator port keeps the choice of JSON Schema engine with the deployment
and keeps the package's own dependencies to `effect`.

**Settled here.** Unsupported schemas exclude the tool rather than admitting
any input: a tool whose input cannot be checked would carry whatever a model
produced to a third party unchecked.

**Open.** Whether the package should offer an application-supplied dialect
converter for external schemas in older dialects; v0.1 excludes them.

## BEH-MC-020: Imported commands are always marked external, and consumers taint by descriptor

> **Invariant:** [INV-MC-003](../invariants.md#inv-mc-003-every-imported-command-is-marked-external)
> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)
> **Core seam:** [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)

```
REQUIREMENT: Every imported command's descriptor MUST carry the tag
             "external" and `owner` the session child that contributes it,
             `<import id>/session` (core BEH-BR-122; command BEH-CM-003,
             BEH-CM-004), and its spec MUST set `jsonSchema.untrusted: true`,
             so that `untrustedOutput` is the root pointer "" (command
             BEH-CM-030). No `ImportMapping` and no option of
             `McpClient.import` MAY remove the tag, clear the untrusted
             mark or set `readOnly`: the external `readOnlyHint` stays in
             `externalAnnotations`, as data.
```

```
REQUIREMENT: The package MUST NOT describe a dispatch result as carrying
             a taint annotation: core annotations belong to a fiber's
             context (core BEH-BR-289, BEH-BR-292), and a result value has
             no annotation slot. A consumer that must treat the output as
             untrusted MUST decide so from the descriptor (the "external"
             tag, or `owner`), as `@bridger/agent` does when it taints a
             session with the label `imported-tool:<prefix>`
             ([03 — Taint and provenance](../../agent/behaviors/03-taint-and-provenance.md), BEH-AG-019).
```

```
REQUIREMENT: While the handler runs, it MAY add `Annotation.Provenance`
             `{ source: "mcp-import", ref: "<import id>/<tool name>" }` to
             its own fiber for the call-log report; it MUST NOT be
             described as marking the returned value.
```

What a model reads from a tool result can steer what it does next. The rule
"tainted session ⇒ never auto-allowed" is enforced by the command catalog's
taint floor (command BEH-CM-016) for any request that carries the taint;
this package's duty is to make every imported command recognisable as
external, so that a consumer that hands its output to a model or to a later
dispatch can add the taint.

**Settled here.** (1) The mark is unconditional for imports. A per-server
"trusted" flag would be the first thing set to make a demo work. (2) The mark
is on the descriptor, not the value: a UI, another plugin or an MCP server
re-serving the tool sees the same descriptor and can apply the same rule. A
consumer that ignores the tag receives untrusted text with no mark; that is
stated in [INV-MC-003](../invariants.md#inv-mc-003-every-imported-command-is-marked-external) and is the reason
the agent package taints by descriptor.

**Settled here (envelope).** The result envelope asked for in revision 0.2 is
the command companion's `Command.envelope` (BEH-CM-030): with the whole output
marked untrusted, any consumer — not only `@bridger/agent` — can hand an
imported result to a model as one numbered, size-capped untrusted value.

## BEH-MC-021: External annotations and descriptions are data, never policy

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md), [ADR-MC-004](../decisions/004-target-mcp-2026-07-28.md)

```
REQUIREMENT: An external tool's `annotations` (`readOnlyHint`,
             `destructiveHint`, `idempotentHint`, `openWorldHint` and any
             other) MUST be carried on the descriptor as
             `externalAnnotations` (command BEH-CM-001, BEH-CM-004), as
             untrusted data that enters the digest, and MUST NOT set
             `regulated`, tags, the selector's result, the gate's input
             fields other than as data, or the import's timeout.
```

```
REQUIREMENT: `regulated` on an imported command MUST come only from the
             application's `ImportMapping`. The default MUST be `false`, and
             the default selector's exclusion of regulated commands
             (command companion, 03 — Toolsets) then applies only to tools
             the application marked.
```

```
REQUIREMENT: An external `description` and `title` MUST be carried as
             the descriptor's `description` and `title` (command BEH-CM-004),
             as received, bounded in length (default 4 096 code units each,
             truncated with a marker); a consumer recognises them as
             untrusted by the "external" tag (BEH-MC-020).
```

A tool that says "read-only" about itself is making a claim the host cannot
check. The MCP specification itself tells clients to treat annotations as
untrusted unless the server is trusted, and this package has no notion of a
trusted server.

**Settled here.** Descriptions are bounded: an external server could
otherwise place an arbitrarily long instruction in every prompt that lists
its tools.

**Open.** Whether the default for an unmapped imported tool should instead
be `regulated: true`, so that imported tools are never listed until the
application reviews them. Raised for the application slice; this draft keeps
`false` with the mandatory "external" mark of BEH-MC-020.

## BEH-MC-022: The proxy forwards no identity unless the import discloses it, and never annotations

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)
> **Risk:** [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: The import MUST send the external server only the decoded
             arguments, the credentials its transport was configured with,
             and the identity claims the import lists in `disclose`. It MUST
             NOT forward the `OperationContext` annotations or any
             configuration value. With `disclose` empty — the default — it
             MUST NOT forward the caller's `Actor`, principal or
             correlation id.
```

```
REQUIREMENT: Each disclosed claim MUST be sent in the `tools/call`
             request's `_meta`, under the key "bridger/claims", as an object
             with exactly the disclosed fields that the dispatching fiber
             has: `actor` (`{ kind, id }`), `onBehalfOf` (core
             `PrincipalRef.encode`) and `correlationId`
             (`CurrentCorrelation`). An import whose `disclose` is not empty
             MUST be recorded as a data transfer to the server as the remote
             companion records a disclosing link (BEH-RM-024): the claim
             names in its `McpClientStatus` entry (`disclosed`) and in an
             info log line at each
             session open, never their values; documentation MUST state
             that the server becomes a processor of what it receives.
```

```
REQUIREMENT: When a `CallLog` port is wired (core file 29), each call the
             import sends to the external server MUST be offered once with
             `Host.offerCallEntry` (core BEH-BR-280) as an entry of kind
             "crossing", `crossing: { direction: "outbound", link: <import
             id> }`, `companion` "@bridger/mcp", `serviceId` the
             `CommandCatalog` key, `member` the command id, and the outcome
             and duration of the external call. The entry is offered from
             the handler's fiber, so core records the dispatch's actor,
             correlation (`CurrentCorrelation`) and "callLog" annotations
             with it; none of them is sent to the external server except
             the claims the import discloses. The entry MUST name in
             `crossing.disclosed` (core BEH-BR-280) the claims sent with
             that call — those of `disclose` that the dispatching fiber
             had — once each, in the order "actor", "onBehalfOf",
             "correlationId", never their values, and MUST omit
             `disclosed` when none was sent, as remote BEH-RM-024 states.
```

**Settled here.** Forwarding identity is opt-in: an external server that
receives user identities becomes a processor of them, which is a decision
for the application, not a default of a library. The remote companion
adopted the same rule for every link (CCR-RM-004), and the option has the
same name and meaning here, without "org", which this package does not
mint. Revision 0.3 named an `ImportMapping` projection that `ImportMapping`
did not define; the per-import `disclose` replaces it, because identity is a
property of the connection to one server, not of one tool.

**Open.** None.

---

_Previous: [02 — List-changed notifications](./02-list-changed.md)_ · _Next: [04 — Host tools](./04-host-tools.md)_
