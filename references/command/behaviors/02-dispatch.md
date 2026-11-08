# 02 — Dispatch

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-02                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-CM-016 taint floor; gate wrappers and draft source in catalog options; `ApprovalRef.inputDigest` and `ApprovalMismatch`; no reliance on mandatory interceptions; correlation through `DispatchCorrelation`; `onBehalfOf` as fiber principal (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

A catalog is only useful as one path if every caller takes the same steps in
the same order. This file fixes that order — lookup, decode, attribution,
gate, hooks, handler under a lease, encode, report — and the outcome of each
step. It is modelled on the order of a mutating host call
([BEH-BR-188](../../core/behaviors/22-attributable-operations.md)), but it is
not a host operation: dispatch writes no `AuditSink` record and does not pass
the host's `OperationGate`. This file owns BEH-CM-009–016 and uses all
eight.

Planned source: `packages/command/src/Commands.ts`,
`packages/command/src/CommandGate.ts` *(Planned)*.

## BEH-CM-009: One dispatch path in a fixed order

> **Invariant:** [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch)
> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

```ts
// illustrative — not type-checked
interface DispatchOptions {
  readonly context?: OperationContext          // core file 22, with annotations of core file 30
  readonly toolset?: PinnedToolset             // 03, BEH-CM-019
  readonly approval?: ApprovalRef              // a reference to an approval held by the application (BEH-CM-011)
  readonly timeout?: Duration.Input            // narrows the command's own timeout, never widens it
}

declare const Commands: {
  dispatch<I, O, E>(command: Command<I, O, E> | string, input: unknown, options?: DispatchOptions):
    Effect.Effect<O, E | DispatchError, CommandCatalog>
}
```

```
REQUIREMENT: `Commands.dispatch` MUST perform these steps in this order, and
             a failure at a step MUST end the dispatch with that step's
             error and run no later step:
             1. Lookup: find the entry by id (`CommandNotFound`); when
                `options.toolset` is given, check membership
                (`ToolNotInToolset`) and digest (`ToolChanged`), BEH-CM-019;
                when `options.approval` is given, check its `digest`
                (`ToolChanged`), BEH-CM-011. Remember the entry's digest as
                the dispatch digest.
             2. Decode the input with the command's input schema
                (`CommandInputInvalid`); encode it again to compute
                `inputDigest`; when `options.approval` is given, check its
                `inputDigest` (`ApprovalMismatch`), BEH-CM-011.
             3. Resolve the principal and context (BEH-CM-010).
             4. Gate and taint floor (BEH-CM-011, BEH-CM-016):
                `CommandRefused` or `CommandDeferred`.
             5. Before-hooks (BEH-CM-012): `CommandVetoed`.
             6. Run the handler under a lease on the entry, bounded by the
                dispatch timeout (BEH-CM-013): `ContributionUnavailable`,
                `ToolChanged`, `LeaseRevoked`, `CommandTimeout`, or the
                handler's typed error.
             7. Encode the output with the output schema
                (`CommandOutputInvalid`).
             8. After-hooks and the call-log report (BEH-CM-012,
                BEH-CM-015), which MUST NOT change the outcome.
```

```
REQUIREMENT: Steps 1–5 MUST NOT run the handler or any code of the
             contributing plugin other than its schemas' decode functions.
```

```
REQUIREMENT: Every caller — UI adapter, API adapter, job, agent tool runner,
             MCP server, or another plugin — MUST reach a handler through
             `Commands.dispatch`. The package MUST NOT offer a second entry
             point that skips any step.
```

Decoding before the gate means the gate is asked only about requests that
are well formed; resolving the principal before the gate means it always
knows who is asking; running the hooks after the gate means a vetoing hook
never sees a request that the gate refused. The order is the same for every
command whatever its labels (BEH-CM-002).

**Settled here.** (1) A handler that dispatches another command does so
through `Commands.dispatch`; the nested dispatch is a separate call with its
own gate decision and its own taint floor. Because the handler runs as a
served call (BEH-CM-003), the nested dispatch resolves the outer call's actor
and annotations from its fiber, so a taint cannot be shed by routing a
request through another command. The outer `correlationId` reaches the nested
dispatch through the package's own fiber reference `DispatchCorrelation`
(`@bridger/command/DispatchCorrelation`, set for the duration of step 6),
which BEH-CM-010 reads when no `correlationId` is supplied. Core keeps no
correlation id in the fiber, so a host call made by the handler carries the
outer id only when the handler passes it in `options.context.correlationId`
(core gap G58). (2) Dispatch is not a host lifecycle operation, so
none of the host's legality rules apply to it; a handler that calls a host
operation is subject to those rules as any caller is (core files 08 and 22).

## BEH-CM-010: The principal and context of a dispatch

> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [22 — Attributable operations](../../core/behaviors/22-attributable-operations.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)

```ts
// illustrative — not type-checked
interface ResolvedDispatchContext {
  readonly actor: Actor                          // options.context.actor, else CurrentActor, else Actor.unattributed
  readonly onBehalfOf?: PrincipalRef             // the dispatching fiber's plugin principal (core file 28, BEH-BR-257/258)
  readonly reason?: string
  readonly correlationId: string                 // supplied, else DispatchCorrelation, else generated by IdGenerator (core file 24)
  readonly annotations: Annotations              // core file 30 (BEH-BR-292), carried unchanged
}
```

```
REQUIREMENT: The actor MUST be resolved as core resolves the actor of a host
             call (BEH-BR-187): `options.context.actor`, otherwise the
             fiber's `CurrentActor`, otherwise `Actor.unattributed`. The
             package MUST NOT authenticate the actor or infer it from
             anything else.
```

```
REQUIREMENT: When the dispatching fiber carries a plugin principal,
             `onBehalfOf` MUST be that principal (`CurrentPlugin` of core
             file 28, BEH-BR-258), which the caller cannot set; otherwise it
             MUST be absent. It names the plugin on whose behalf the code
             ran, never an actor: for a dispatch made by a handler, it is
             the handler's contributor (BEH-CM-003).
```

```
REQUIREMENT: The annotations MUST be resolved as core resolves those of a
             host call (BEH-BR-292): the dispatching fiber's
             `CurrentAnnotations`, to which each value supplied in
             `options.context.annotations` is added — combined for a
             monotonic key, replacing for any other; a supplied context
             MUST NOT remove a monotonic key the fiber carries. They MUST
             be carried to the gate request (filtered to flow "gate"), the
             hook inputs, the handler (through `CallerContext.serve` and
             `HandlerContext`) and the call-log report without being
             removed or rewritten. The package MUST NOT add an annotation
             of its own except through core file 30's API.
```

```
REQUIREMENT: When `correlationId` is not supplied, it MUST be the value of
             `DispatchCorrelation` when the dispatching fiber carries one
             (a nested dispatch), and otherwise MUST be generated by the
             host's `IdGenerator` (core BEH-BR-210), never by ambient
             randomness.
```

Carrying annotations unchanged is what lets `@bridger/agent` mark a request
as tainted and have every later step — gate, hooks, call log — see the mark
([taint and provenance](../../agent/behaviors/03-taint-and-provenance.md)).

**Settled here.** An unattributed dispatch is not refused by this package.
Whether an unattributed command may run is a rule, and rules are the
gate's; a gate refuses `Actor.unattributed` if the application wants that.

## BEH-CM-011: The command gate: allow, refuse or defer

> **Invariant:** [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch), [INV-CM-005](../invariants.md#inv-cm-005-toolset-membership-grants-nothing)
> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md), [25 — Operation gate](../../core/behaviors/25-operation-gate.md)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
interface CommandRequest {
  readonly command: string                       // id
  readonly digest: string                        // the dispatch digest, BEH-CM-005
  readonly tags: ReadonlyArray<string>
  readonly regulated: boolean
  readonly owner?: { readonly pluginId: string; readonly realm: string; readonly version?: string }
  readonly input: Json                           // the encoded input
  readonly inputDigest: string                   // "sha256:" + hex of JCS(input)
  readonly actor: Actor
  readonly onBehalfOf?: PrincipalRef
  readonly reason?: string
  readonly correlationId: string
  readonly annotations: Annotations              // filtered to flow "gate" (core BEH-BR-292)
  readonly approval?: ApprovalRef                // present when re-dispatching an approved draft
}

// Issued by the application's approval store; core file 32 stores no draft and no approval.
interface ApprovalRef {
  readonly draftId: string                       // from CommandDeferred.draftId
  readonly approvalId: string                    // the application's identifier of the approval
  readonly digest: string                        // the dispatch digest the draft was created for
  readonly inputDigest: string                   // the CommandRequest.inputDigest the draft was created for
}

// The port: one instance of core's generic gate.
class CommandGate extends Context.Service<CommandGate, Gate<CommandRequest>>()("@bridger/command/CommandGate") {}

// Fixed when the application builds the catalog layer; no plugin can reach these options.
interface CommandCatalogOptions {
  readonly drainTimeout?: Duration.Input | "forever"   // default 30 seconds (BEH-CM-013)
  readonly gateTimeout?: Duration.Input | "forever"    // default 60 seconds
  readonly gateWrappers?: ReadonlyArray<CommandGateWrapper>
  readonly drafts?: CommandDraftSource                  // used by the taint floor (BEH-CM-016)
}

// A policy the application layers over its gate (for example a product-wide refusal rule).
interface CommandGateWrapper {
  readonly name: string
  // `inner` is the gate built so far: CommandGate (or none), wrapped by the earlier wrappers.
  readonly wrap: (inner: Option.Option<Gate<CommandRequest>>) => Gate<CommandRequest>
}
```

```
REQUIREMENT: `CommandGate` MUST be optional: it MUST be read with
             `Effect.serviceOption` when the catalog is built, and the
             package MUST NOT export any implementation of it — no default,
             no "allow all", no "log only".
```

```
REQUIREMENT: The *effective gate* MUST be computed once, when the catalog
             layer is built: the `CommandGate` read there (or none), passed
             to `gateWrappers[0].wrap`, whose result is passed to
             `gateWrappers[1].wrap`, and so on; with no wrapper it is the
             `CommandGate`, or none. Neither the wrappers nor their order
             MAY change afterwards, and the package MUST NOT offer any API
             through which a plugin adds, removes or reorders a wrapper.
```

```
REQUIREMENT: When there is an effective gate, it MUST be consulted exactly
             once per dispatch, at step 4, through core `Gate.run` (BEH-BR-313,
             BEH-BR-314) run inside `CallerContext.serve` with the
             resolved context, so that `GateContext.annotations` and
             `CommandRequest.annotations` agree, and its decision MUST NOT be cached,
             reused or inferred. Allow MUST continue to the taint floor
             (BEH-CM-016) and, when the floor lets it pass, to step 5. Refuse MUST
             end the dispatch with `CommandRefused { id, reason }`. Defer
             MUST end the dispatch with `CommandDeferred { id, draftId }`
             after the draft is created as core file 32 specifies; the
             handler MUST NOT run.
```

```
REQUIREMENT: A gate that fails other than by a decision, dies, or exceeds
             its timeout MUST be treated as a refusal with reason
             "gate-defect" or "gate-timeout", as core treats the
             `OperationGate` (BEH-BR-221). The bound is the catalog's
             `gateTimeout` (default 60 seconds; "forever" only when stated).
```

```
REQUIREMENT: An approved draft MUST be applied by dispatching the command
             again, as core file 32 applies an approved draft by issuing the
             operation again, with an `ApprovalRef` in `options.approval`.
             The dispatch MUST run every step again, including the gate,
             which receives the reference in `CommandRequest.approval`.
             When `ApprovalRef.digest` differs from the dispatch digest, the
             dispatch MUST fail at step 1 with `ToolChanged`; when
             `ApprovalRef.inputDigest` differs from the request's
             `inputDigest`, it MUST fail at step 2 with
             `ApprovalMismatch { id, expected, actual }`. The package
             MUST NOT apply a draft by any other route, and MUST NOT decide
             whether the approval exists or is sufficient; that is the
             application gate's check against its own approval store.
```

```
REQUIREMENT: The package MUST NOT rely on mandatory interceptions of core
             file 28 for the gate: `CommandGate` is read with
             `Effect.serviceOption` while a base layer is built, which is
             not a host capture, so no mandatory interception reaches it
             (core BEH-BR-260, BEH-BR-262). A policy that no plugin may
             remove is given as a `gateWrappers` entry by the code that
             builds the catalog layer.
```

Defer is the outcome an agent-facing product needs most: the agent proposes,
the gate turns the proposal into a draft, a person approves it, and the
approved draft is dispatched again through the same steps. Expected versions,
stale drafts and re-planning belong to the draft model of [core file 32](../../core/behaviors/32-generic-gate-and-plan.md) and
are not restated here.

**Settled here.** (1) The request carries the encoded input, unlike core's
`OperationRequest`, which carries no configuration values (BEH-BR-219): an
approver of a command must see what it will do, and the input is the
application's own domain data, not a host secret. A product that must keep
some fields from the gate removes them in its own wrapper; the
`inputDigest` lets a gate bind an approval to the exact input without
storing it. (2) No gate means no gate for an untainted request: it passes
step 4 as if allowed, the same choice core makes for the `OperationGate`
(BEH-BR-217), for the same reason. A tainted request is never allowed that
way; the taint floor of BEH-CM-016 applies whether or not a gate is wired.
(3) Binding the approval to `inputDigest` as well as to the descriptor digest
means an approval for one input cannot be presented with another: the
reference is checked by dispatch itself, before any gate, so even a gate that
does not inspect approvals cannot be handed a reference for different data.

## BEH-CM-012: Hook points around the handler

> **See:** [ADR-CM-002](../decisions/002-catalog-not-rules.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md)

```ts
// illustrative — not type-checked
declare const CommandHooks: {
  // core file 31: HookPoint<In, Enrich, Advice, Code>; contributions declare a role
  readonly before: HookPoint<CommandRequest, never, never, string>   // "veto" role only; onError "deny"
  readonly after: HookPoint<CommandOutcome, never, unknown, never>   // "advisory" role only; onError "skip"
}

interface CommandOutcome {
  readonly request: CommandRequest
  readonly result: { readonly _tag: "Success" } | { readonly _tag: "Failure"; readonly errorTag: string }
  readonly durationMillis: number
}
```

```
REQUIREMENT: `CommandHooks.before` MUST be dispatched at step 5 with the
             gate's request. A veto MUST end the dispatch with
             `CommandVetoed { id, hook, reason }`, where `hook` names the
             contribution that decided, as core file 31's decision record
             gives it, and `reason` is the veto's `code`. A hook failure,
             timeout or open breaker MUST follow the point's failure policy,
             which for `before` MUST be "deny".
```

```
REQUIREMENT: `CommandHooks.after` MUST be dispatched at step 8 for every
             dispatch that reached step 2, whatever its outcome. Its
             results and failures MUST NOT change the outcome; failures
             MUST be logged.
```

```
REQUIREMENT: Hook inputs MUST NOT carry the handler's output value. They
             MAY carry the encoded input, as the gate request does.
```

```
REQUIREMENT: Who may contribute to either hook point MUST be decided by the
             access rules of core file 31 configured by the application.
             The package MUST NOT allow a hook contribution to change the
             input passed to the handler.
```

A veto hook is the place for checks that are cheap, local and plural — a
plugin that refuses a command while its device is offline — whereas the gate
is the single accountable decision. Keeping the output out of hook inputs
keeps the after-hook a place for metrics and evaluation, not a second channel
through which data leaves.

**Open.** Whether `before` hooks should run before the gate instead, so that a
locally impossible command never reaches an approver, is open; the order
above follows core, where the gate is consulted after validation.

## BEH-CM-013: The handler runs under a lease, bounded by a timeout

> **Invariant:** [INV-CM-003](../invariants.md#inv-cm-003-a-pinned-tool-never-runs-a-different-definition)
> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)
> **Risk:** [RSK-BR-001](../../core/gxp/03-risk-assessment.md#rsk-br-001), [RSK-BR-015](../../core/gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: Step 6 MUST run the handler through the private registry's
             `use(id, …)` (core BEH-BR-166), so that the contribution is held
             against removal while the handler runs. An id no longer in the
             view MUST fail with `ContributionUnavailable { id }`.
```

```
REQUIREMENT: Inside the hold, the entry's digest MUST be compared with the
             dispatch digest of step 1. When they differ — the id was
             removed and contributed again between steps 1 and 6 — the
             dispatch MUST fail with `ToolChanged { id, expected, actual }`
             and MUST NOT run the handler.
```

```
REQUIREMENT: The handler MUST be bounded by the smallest of the command's
             `timeout`, `options.timeout` and the deadline annotation of
             core file 30 when present. When the bound expires, the handler
             MUST be interrupted, its finalizers awaited, and the dispatch
             MUST fail with `CommandTimeout { id, after }`.
```

```
REQUIREMENT: A removal of the contributing plugin MUST follow core
             BEH-BR-167: the entry is hidden first, then the hold is awaited
             up to the catalog's `drainTimeout`; a handler still running at
             the limit MUST be interrupted and the dispatch MUST fail with
             `LeaseRevoked`.
```

Comparing the digest inside the hold closes the window between the gate's
decision and the handler's run: the gate approved one definition, and no
other can run under its approval.

**Settled here.** Interruption does not undo a handler's external effects —
a write half done stays as the external system leaves it — so the package
never retries a timed-out or revoked handler. Retry is the caller's decision
(core [ADR-BR-005](../../core/decisions/005-failure-is-sticky.md) applies by
analogy).

## BEH-CM-014: Every outcome has a tag

> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

```ts
// illustrative — not type-checked
class CommandNotFound      extends Schema.TaggedError<CommandNotFound>()("CommandNotFound", { id: Schema.String }) {}
class CommandInputInvalid  extends Schema.TaggedError<CommandInputInvalid>()("CommandInputInvalid", { id: Schema.String, issues: Schema.String }) {}
class CommandOutputInvalid extends Schema.TaggedError<CommandOutputInvalid>()("CommandOutputInvalid", { id: Schema.String, issues: Schema.String }) {}
class CommandRefused       extends Schema.TaggedError<CommandRefused>()("CommandRefused", { id: Schema.String, reason: Schema.String }) {}
class CommandDeferred      extends Schema.TaggedError<CommandDeferred>()("CommandDeferred", { id: Schema.String, draftId: Schema.String }) {}
class CommandVetoed        extends Schema.TaggedError<CommandVetoed>()("CommandVetoed", { id: Schema.String, hook: Schema.String, reason: Schema.String }) {}
class CommandTimeout       extends Schema.TaggedError<CommandTimeout>()("CommandTimeout", { id: Schema.String, after: Schema.String }) {}
class ToolNotInToolset     extends Schema.TaggedError<ToolNotInToolset>()("ToolNotInToolset", { id: Schema.String, toolsetRevision: Schema.Number }) {}
class ToolChanged          extends Schema.TaggedError<ToolChanged>()("ToolChanged", { id: Schema.String, expected: Schema.String, actual: Schema.String }) {}
class ApprovalMismatch     extends Schema.TaggedError<ApprovalMismatch>()("ApprovalMismatch", { id: Schema.String, expected: Schema.String, actual: Schema.String }) {}

type DispatchError =
  | CommandNotFound | CommandInputInvalid | CommandOutputInvalid | CommandRefused | CommandDeferred
  | CommandVetoed | CommandTimeout | ToolNotInToolset | ToolChanged | ApprovalMismatch
  | ContributionUnavailable | LeaseRevoked
```

```
REQUIREMENT: Every dispatch MUST end in exactly one of: the handler's output,
             the handler's typed error (declared by the command's `error`
             schema), or one `DispatchError`. A handler failure not
             described by the `error` schema MUST be reported as a defect.
```

```
REQUIREMENT: `CommandInputInvalid.issues` and `CommandOutputInvalid.issues`
             MUST be the formatted Schema issues. They MUST NOT be rendered
             into a gate request, a hook input or a call-log report.
```

```
REQUIREMENT: `CommandDeferred` MUST be a typed failure, not a success, so
             that a caller that ignores it cannot mistake a draft for an
             executed command.
```

`CommandOutputInvalid` is a handler bug, not a caller error; it is still
typed, so that an agent loop or an MCP server can report it without treating
the dispatcher as broken.

## BEH-CM-015: Each dispatch is reported to the call log, not to the audit sink

> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md), [23 — Audit sink and record](../../core/behaviors/23-audit-sink-and-record.md)

```
REQUIREMENT: When core's `CallLog` port (core file 29) is wired, every
             dispatch that reached step 3 MUST be reported to it once, at
             step 8, with the command id, dispatch digest, `inputDigest`,
             actor, `onBehalfOf`, `correlationId`, annotations, outcome tag
             and duration. The report MUST NOT carry the input or output
             values.
```

```
REQUIREMENT: The package MUST NOT write `AuditSink` records and MUST NOT
             describe dispatch as audited. The audit trail of core covers
             host lifecycle operations only (BEH-BR-193).
```

```
REQUIREMENT: A `CallLog` failure MUST NOT change the dispatch outcome; it
             MUST be logged at warning level.
```

A command log that a regulated user can rely on — retained, reviewed,
protected — is the application's: it is written by the handler, inside the
transaction that changes state, or by a call-log implementation the
application chooses. The package's report is a hook for it, not a record.

**Open.** Whether a `CallLog` failure should be able to fail the dispatch
closed (as the audit-degraded latch does for host operations, BEH-BR-205) is
open; it depends on the failure policy [core file 29](../../core/behaviors/29-capability-grants-and-call-log.md) settles for the port.

## BEH-CM-016: A tainted request is never allowed on an automatic decision

> **Invariant:** [INV-CM-006](../invariants.md#inv-cm-006-a-tainted-dispatch-never-runs-on-an-automatic-allow)
> **See:** [ADR-CM-005](../decisions/005-taint-floor-in-dispatch.md), [ADR-CM-002](../decisions/002-catalog-not-rules.md)
> **Core seam:** [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-031](../../core/gxp/03-risk-assessment.md#rsk-br-031)

```ts
// illustrative — not type-checked
// Supplied by the application (for example through @bridger/agent's TaintGuard.drafts):
// creates a draft in the application's approval store for a request the floor will not allow.
interface CommandDraftSource {
  readonly draftFor: (request: CommandRequest, reason: "tainted-session") =>
    Effect.Effect<Draft<CommandRequest>>               // core BEH-BR-316
}

// The floor, applied at step 4 to request r after the effective gate's decision d.
// tainted(r) = r.annotations holds a non-empty core Annotation.Taint set.
//   not tainted(r)                                   → d   (no effective gate: Allow)
//   tainted(r), d = Refuse                           → Refuse
//   tainted(r), d = Defer                            → Defer   (the gate's own draft)
//   tainted(r), effective gate, d = Allow, r.approval present → Allow
//   tainted(r), d = Allow, no r.approval             → Defer(draftFor(r)) when `drafts` is set,
//                                                       else Refuse { reason: "tainted-session" }
//   tainted(r), no effective gate (approval or not)  → as the row above
```

```
REQUIREMENT: Step 4 MUST apply the floor above to every dispatch, after the
             effective gate (BEH-CM-011) has decided or when there is none.
             The floor MUST NOT be optional: no option, wrapper, selector,
             label or caller can turn it off, and the package MUST NOT
             offer a dispatch path that skips it.
```

```
REQUIREMENT: A request MUST count as tainted exactly when the core
             `Annotation.Taint` value in `CommandRequest.annotations` is a
             non-empty set (core BEH-BR-290). The floor MUST NOT read
             labels, tags, `regulated` or any other field to decide it.
```

```
REQUIREMENT: For a tainted request, an `Allow` MUST pass only when there is
             an effective gate and the request carries an `ApprovalRef`
             already bound to it by steps 1 and 2 (digest and
             `inputDigest`). Whether the approval exists, and who gave it,
             is the effective gate's check (BEH-CM-011); with no effective
             gate nobody can make that check, so a tainted request MUST NOT
             be allowed, approval or not.
```

```
REQUIREMENT: Where the floor withholds an `Allow`, it MUST end the dispatch
             with `CommandDeferred { id, draftId }` carrying the draft
             returned by `drafts.draftFor(r, "tainted-session")` when
             `CommandCatalogOptions.drafts` is set, and with
             `CommandRefused { id, reason: "tainted-session" }` when it is
             not. A draft source that fails, dies or exceeds `gateTimeout`,
             or returns a draft that is malformed under core BEH-BR-316,
             MUST end the dispatch with
             `CommandRefused { id, reason: "gate-defect" }` or
             `"gate-timeout"`. The handler MUST NOT run in any of these
             cases.
```

A taint says "this request may have been steered by text nobody trusts".
Every gate an application writes would have to remember that an automatic
allow is then wrong; the floor remembers it once, in the one path every
caller takes, so that a forgotten wrapper, an unwired gate or a nested
dispatch cannot let a tainted request through on an automatic decision. The
floor reads only core's own key, so it carries no product rule: what is
tainted, and why, is decided by whoever adds the label
([`@bridger/agent` taint and provenance](../../agent/behaviors/03-taint-and-provenance.md)).

**Settled here.** (1) The floor is part of dispatch, not an interception: core
mandatory interceptions do not reach a service read while a base layer is
built (core BEH-BR-260, BEH-BR-262), and an interception cannot act when no
gate is wired. (2) Without a draft source the floor refuses rather than
defers: a `Defer` needs a well-formed draft that some store knows
(core BEH-BR-313, BEH-BR-316), and a draft id invented by the package could
never be approved. (3) An untainted request is unaffected.

**Open.** Whether the floor's refusal reason should distinguish "no draft
source" from "no effective gate" for operators; v0.1 uses one reason,
"tainted-session".

---

_Previous: [01 — Command definition](./01-command-definition.md)_ · _Next: [03 — Toolsets](./03-toolsets.md)_
