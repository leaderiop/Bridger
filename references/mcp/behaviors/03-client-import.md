# 03 — Client Import

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-BEH-03                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): Imported commands declare their whole output untrusted (`jsonSchema.untrusted`, command BEH-CM-030), so every consumer can render it through the model-facing envelope; never `readOnly` (CCR-MC-003, round 2: recheck item 8)<br>0.2 (2026-11-08): Supplied JSON Schema; declared `ImportedToolError`; dispatch's timeout; imported commands marked external instead of tainted values; `externalAnnotations` and `title` (CCR-MC-002)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

A host often needs tools it does not implement: a documentation search, an
issue tracker, a vendor's catalog. MCP servers provide such tools. Importing
them must not open a side door: an imported tool is called through the same
dispatch path and gate as a local command, its output is text written by a
party the host does not control, and its annotations are claims by that
party. This file specifies the import as a remote proxy plugin
([ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)).
This file owns BEH-MC-017–024 and uses 017–022; 023–024 are reserved.

Planned source: `packages/mcp/src/McpClient.ts` *(Planned)*. The proxy
mechanics — sessions over a `Transport`, epochs, heartbeats, calls as leases —
are those of [`@bridger/remote`](../../remote/README.md); this file adds only
what MCP needs on top.

## BEH-MC-017: An import is a remote proxy plugin

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
}): Plugin<[CommandCatalog, JsonSchemaValidator, Bridger.Host], [], never>

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
REQUIREMENT: `McpClient.import` MUST return a proxy plugin in the sense of
             `@bridger/remote`: its build opens an MCP session over the
             transport, performs `initialize` and the first `tools/list`, and
             contributes one command per included tool in its activation
             scope. Stopping the plugin MUST remove every contribution and
             close the session.
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
const ImportedToolError = Schema.Union([RemoteUnavailable, RemoteTimeout, SessionLost, StaleEpoch, ImportedToolFailed])
class ImportedToolFailed extends Schema.TaggedError<ImportedToolFailed>()("ImportedToolFailed", {
  tool: Schema.String,
  message: Schema.String                         // the external error text, bounded; untrusted
}) {}
```

```
REQUIREMENT: A failed `initialize` or first `tools/list` MUST fail the
             proxy's build with the remote companion's error, so that the
             plugin is `failed` with phase "build" and its sticky-failure and
             `retry` rules apply (core 10 — Runtime failure and health).
```

```
REQUIREMENT: The package MUST NOT describe an imported server as isolated,
             confined or inspected. It runs wherever its transport runs, as
             the deployment arranged.
```

Being a plugin gives the import everything the host already guarantees:
the operator installs it under attribution and the `OperationGate`, removal
drains the calls in flight, and `inspect` lists its contributions by name.

**Settled here.** Name collisions after normalization exclude both tools.
Keeping one would make the outcome depend on the order the external server
listed them in.

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
REQUIREMENT: A lost session (transport closed, missed heartbeat under the
             remote companion's rule) MUST fail calls in flight with
             `RemoteUnavailable` from the remote companion, declared in
             `ImportedToolError`, and MUST NOT be retried by this package. An
             external `isError` result MUST fail the handler with
             `ImportedToolFailed`. Reconnection follows the remote
             companion's epoch rule; a response that arrives under a stale
             epoch MUST be discarded.
```

```
REQUIREMENT: `timeout: "forever"` MUST be refused at plugin definition time.
```

**Settled here.** No retry: an external tool may have side effects the host
cannot see, and core never retries silently ([ADR-BR-005](../../core/decisions/005-failure-is-sticky.md)).

**Open.** Whether the proxy should go `waiting` (dependents wait) rather than
`failed` when the external server is unreachable after activation; this
follows whatever the remote companion settles for partitions.

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
             "external" and `owner` the proxy plugin (command BEH-CM-003,
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
             `{ source: "mcp-import", ref: "<proxy id>/<tool name>" }` to
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

## BEH-MC-022: The proxy never forwards the host's identity or annotations

> **See:** [ADR-MC-002](../decisions/002-imported-tools-are-tainted-remote-proxies.md)
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)
> **Risk:** [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: The proxy MUST send the external server only the decoded
             arguments and the credentials its transport was configured
             with. It MUST NOT forward the caller's `Actor`, the
             `OperationContext` annotations, the correlation id or any
             configuration value, unless the application's `ImportMapping`
             adds an explicit `_meta` projection.
```

```
REQUIREMENT: When a `CallLog` port is wired (core file 29), each call the
             proxy sends to the external server MUST be offered once with
             `Host.offerCallEntry` (core BEH-BR-280) as an entry of kind
             "crossing", `crossing: { direction: "outbound", link: <proxy
             plugin id> }`, `companion` "@bridger/mcp", `serviceId` the
             `CommandCatalog` key, `member` the command id, and the outcome
             and duration of the external call. The entry is offered from
             the handler's fiber, so core records the dispatch's actor,
             correlation (`CurrentCorrelation`) and "callLog" annotations
             with it; none of them is sent to the external server.
```

**Settled here.** Forwarding identity is opt-in: an external server that
receives user identities becomes a processor of them, which is a decision
for the application, not a default of a library.

**Open.** None.

---

_Previous: [02 — List-changed notifications](./02-list-changed.md)_ · _Next: [04 — Host tools](./04-host-tools.md)_
