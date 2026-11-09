# 02 — Dispatch

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-02                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-09): Specification audit of 2026-11-09 — step 6 consults the admission policies after the claim and the breaker, and step 8 settles them first (BEH-CM-044, C-10); options `admissions`, `receiptPartition` and `receiptContext` (06, BEH-CM-041, M-04 and the ERP alignment) (CCR-CM-004)<br>0.6 (2026-11-08): Resolutions of the round-2 agent review (A-03, A-05, A-11, A-12, A-13, A-16): the taint floor exempts commands declared `readOnly` (option `taintFloor.readOnly: "floor"` removes the exemption), drafts nothing for batch items and compensations; `CommandRequest.compensation`, `ApprovalRef.compensationOf`; dispatch by string id typed `unknown`; step 7 ends without a handler call offered as "refusal"; one flow list for the key annotation; `IdempotencyConflict` reasons `definition-differs`, `mode-differs`; options `receiptGrace`, `tasks.store` (CCR-CM-003)<br>0.5 (2026-11-08): BEH-CM-015 executed and replayed dispatches offered as call-log kind "dispatch" with core `DispatchInfo` (core G66 closed by CCR-BR-027); outcome mapping; Settled (3) (CCR-CM-003)<br>0.4 (2026-11-08): Steps 6 and 7 split into admission (breaker, receipt) and run (handler wrappers, handler, encode, receipt completion); `idempotencyKey` and `expectDigest` options; correlation from core `CurrentCorrelation`, `DispatchCorrelation` withdrawn; `CommandRequest` carries the typed metadata and the key; command hook points use core 31's phases, targets and policy, with the catalog's `hooks` options and `attach`; `CommandVetoed` gains `cause`; refusals offered to the call log as entries of kind "refusal", dispatch entries pending a core kind; errors `IdempotencyConflict`, `CommandBreakerOpen` (CCR-CM-003, round 2: recheck items 1, 2, 3, 4, 6, 10)<br>0.3 (2026-11-08): BEH-CM-016 taint floor; gate wrappers and draft source in catalog options; `ApprovalRef.inputDigest` and `ApprovalMismatch`; no reliance on mandatory interceptions; correlation through `DispatchCorrelation`; `onBehalfOf` as fiber principal (CCR-CM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-CM-001)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

A catalog is only useful as one path if every caller takes the same steps in
the same order. This file fixes that order — lookup, decode, attribution,
gate, hooks, admission to run, the handler under a lease inside the
application's wrappers, report — and the outcome of each step. It is modelled on the order of a mutating host call
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
  readonly idempotencyKey?: string             // 06, BEH-CM-041: a repeat returns the stored outcome
  readonly expectDigest?: string               // the digest the caller showed (an MCP listing, a UI form); step 1
}

declare const Commands: {
  dispatch<I, O, E>(command: Command<I, O, E>, input: unknown, options?: DispatchOptions):
    Effect.Effect<O, E | DispatchError, CommandCatalog>
  // By string id the output type is not known statically: a value, or a CommandTaskRef when the
  // descriptor is `long`, told apart by the descriptor, never by the value (07, BEH-CM-052).
  dispatch(command: string, input: unknown, options?: DispatchOptions):
    Effect.Effect<unknown, unknown, CommandCatalog>     // error: a DispatchError or the handler's typed error
  // a command made with `long: true` returns a task handle after step 6 (07, BEH-CM-052)
}
```

```
REQUIREMENT: `Commands.dispatch` MUST perform these steps in this order, and
             a failure at a step MUST end the dispatch with that step's
             error and run no later step:
             1. Lookup: find the entry by id (`CommandNotFound`); when
                `options.toolset` is given, check membership
                (`ToolNotInToolset`) and digest (`ToolChanged`), BEH-CM-019;
                when `options.expectDigest` is given, check it against the
                entry's digest (`ToolChanged`); when `options.approval` is
                given, check its `digest` (`ToolChanged`), BEH-CM-011.
                Remember the entry's digest as the dispatch digest.
             2. Decode the input with the command's input schema
                (`CommandInputInvalid`); encode it again to compute
                `inputDigest`; when `options.approval` is given, check its
                `inputDigest` (`ApprovalMismatch`), BEH-CM-011, and, when it
                carries expected versions, check them with core
                `Draft.check` (07, BEH-CM-051, `CommandDraftStale`).
             3. Resolve the principal and context (BEH-CM-010); every later
                step runs with the resolved `correlationId` as core's
                `CurrentCorrelation`.
             4. Gate and taint floor (BEH-CM-011, BEH-CM-016):
                `CommandRefused` or `CommandDeferred`.
             5. Before-hooks (BEH-CM-012): `CommandVetoed`.
             6. Admission to run (06): when `options.idempotencyKey` is
                given, the receipt claim (BEH-CM-041,
                `IdempotencyConflict`; a completed receipt for the same
                actor, input and digest ends the dispatch with its stored
                outcome, or its task handle, and skips step 7); then the
                breaker (BEH-CM-043, `CommandBreakerOpen`, which releases
                a fresh claim); then the admission policies (BEH-CM-044,
                `CommandRefused`, which releases a fresh claim and returns
                a probe slot).
             7. Run under a lease on the entry, bounded by the dispatch
                timeout (BEH-CM-013), inside the handler wrappers
                (BEH-CM-042): the handler, the encoding of its output with
                the output schema (`CommandOutputInvalid`) and the receipt
                completion. Errors: `ContributionUnavailable`,
                `ToolChanged`, `LeaseRevoked`, `CommandTimeout`,
                `CommandOutputInvalid`, `CommandWrapperFailed`, or the
                handler's typed error.
             8. The settlement of every admission that admitted
                (BEH-CM-044), then after-hooks and the call-log report
                (BEH-CM-012, BEH-CM-015); none of them MUST change the
                outcome.
```

```
REQUIREMENT: Steps 1–6 MUST NOT run the handler or any code of the
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
never sees a request that the gate refused. Claiming the receipt after the
gate and the hooks means a repeated key is still judged as a new request — a
gate is never bypassed because an earlier attempt was allowed — and running
the wrappers around the handler and the receipt completion lets one
application transaction cover the domain write and the receipt. The order is
the same for every command whatever its labels (BEH-CM-002).

**Settled here.** (1) A handler that dispatches another command does so
through `Commands.dispatch`; the nested dispatch is a separate call with its
own gate decision and its own taint floor. Because the handler runs as a
served call (BEH-CM-003), the nested dispatch resolves the outer call's actor,
annotations and correlation from its fiber — core's `CurrentCorrelation`
(BEH-BR-187), set by `CallerContext.serve` — so a taint cannot be shed and a
correlation is not lost by routing a request through another command, and a
host call the handler makes records the same correlation without the handler
passing it. The package's own `DispatchCorrelation` reference of revision 0.3
is withdrawn: core's reference replaces it (URS gap G58 closed by
CCR-BR-026). (2) Dispatch is not a host lifecycle operation, so none of the
host's legality rules apply to it; a handler that calls a host operation is
subject to those rules as any caller is (core files 08 and 22). (3) An
`expectDigest` is how a caller that showed a description at some earlier
time — an MCP client that listed tools an hour ago, a form rendered from a
descriptor — makes sure the definition it showed is the one that runs
(INV-CM-003); it is checked with the toolset's digest, before the gate, and
again inside the contribution hold (BEH-CM-013).

## BEH-CM-010: The principal and context of a dispatch

> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [22 — Attributable operations](../../core/behaviors/22-attributable-operations.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)

```ts
// illustrative — not type-checked
interface ResolvedDispatchContext {
  readonly actor: Actor                          // options.context.actor, else CurrentActor, else Actor.unattributed
  readonly onBehalfOf?: PrincipalRef             // the dispatching fiber's plugin principal (core file 28, BEH-BR-257/258)
  readonly reason?: string
  readonly correlationId: string                 // supplied, else the fiber's CurrentCorrelation, else generated by IdGenerator (core file 24)
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
REQUIREMENT: The `correlationId` MUST be resolved as core resolves the
             correlation of a host call (BEH-BR-187): the `correlationId` of
             `options.context` when supplied; otherwise the dispatching
             fiber's `CurrentCorrelation` (`@bridger/core/CurrentCorrelation`)
             when set — which a nested dispatch inherits from its handler's
             served call; otherwise one generated by the host's
             `IdGenerator` (core BEH-BR-210), never by ambient randomness.
```

```
REQUIREMENT: Steps 4–8 MUST run inside `CurrentCorrelation.with(correlationId)`
             with the resolved value, so that the gate, every hook call
             (core BEH-BR-306), the handler, its wrappers and every host call
             or captured service call they make carry it, and every
             call-log entry they cause records it (core BEH-BR-276). The
             package MUST NOT keep a correlation reference of its own.
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
  readonly permission?: string                   // typed metadata, BEH-CM-006
  readonly compensatedBy?: string
  readonly costClass?: string
  readonly readOnly: boolean
  readonly long: boolean
  readonly owner?: { readonly pluginId: string; readonly realm: string; readonly version?: string }
  readonly input: Json                           // the encoded input
  readonly inputDigest: string                   // "sha256:" + hex of JCS(input)
  readonly actor: Actor
  readonly onBehalfOf?: PrincipalRef
  readonly reason?: string
  readonly correlationId: string
  readonly annotations: Annotations              // filtered to flow "gate" (core BEH-BR-292)
  readonly approval?: ApprovalRef                // present when re-dispatching an approved draft
  readonly idempotencyKey?: string               // DispatchOptions.idempotencyKey (06, BEH-CM-041)
  readonly batch?: { readonly batchId: string; readonly index: number; readonly size: number }   // 07, BEH-CM-049
  readonly compensates?: { readonly batchId: string; readonly index: number; readonly command: string }   // 07, BEH-CM-050
  readonly compensation?: { readonly command: string; readonly digest: string }   // a batch item's planned undo, 07, BEH-CM-050
}

// Issued by the application's approval store; core file 32 stores no draft and no approval.
interface ApprovalRef {
  readonly draftId: string                       // from CommandDeferred.draftId
  readonly approvalId: string                    // the application's identifier of the approval
  readonly digest: string                        // the dispatch digest the draft was created for
  readonly inputDigest: string                   // the CommandRequest.inputDigest the draft was created for
  readonly expected?: ReadonlyArray<Expectation> // core BEH-BR-316; checked with Draft.check before the gate (07, BEH-CM-051)
  readonly compensationOf?: { readonly batchId: string; readonly index: number }   // set only by the package for the
                                                 // compensation of an approved batch (07, BEH-CM-051)
}

// The port: one instance of core's generic gate.
class CommandGate extends Context.Service<CommandGate, Gate<CommandRequest>>()("@bridger/command/CommandGate") {}

// Fixed when the application builds the catalog layer; no plugin can reach these options.
interface CommandCatalogOptions {
  readonly drainTimeout?: Duration.Input | "forever"   // default 30 seconds (BEH-CM-013)
  readonly gateTimeout?: Duration.Input | "forever"    // default 60 seconds
  readonly gateWrappers?: ReadonlyArray<CommandGateWrapper>
  readonly drafts?: CommandDraftSource                  // used by the taint floor (BEH-CM-016) and batches (07)
  readonly hooks?: CommandHookOptions                   // BEH-CM-012; absent: no command hook points
  readonly receipts?: CommandReceipts                   // 06, BEH-CM-041; absent: a key is refused
  readonly handlerWrappers?: ReadonlyArray<CommandHandlerWrapper>   // 06, BEH-CM-042
  readonly batchWrappers?: ReadonlyArray<CommandBatchWrapper>       // 07, BEH-CM-050
  readonly breaker?: CommandBreakerOptions | "off"      // 06, BEH-CM-043; default "off"
  readonly versions?: (key: string) => Effect.Effect<Option.Option<string>>   // 07, BEH-CM-051: Draft.check's reader
  readonly receiptGrace?: Duration.Input                // 06, BEH-CM-041: added to a claim's expiry; default 60 seconds
  readonly receiptPartition?: (request: CommandRequest) => string   // 06, BEH-CM-041: receipt scope; default ""
  readonly receiptContext?: ReadonlyArray<Context.Key<any, any>>    // 06, BEH-CM-041: dispatching-fiber keys the port receives
  readonly admissions?: ReadonlyArray<CommandAdmission>             // 06, BEH-CM-044: consulted at step 6, settled at step 8
  readonly tasks?: { readonly retain?: number; readonly store?: CommandTaskStore }   // 07, BEH-CM-052, BEH-CM-054
  readonly taintFloor?: { readonly readOnly?: "exempt" | "floor" }   // BEH-CM-016; default "exempt"; can only tighten
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
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md), [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md)

```ts
// illustrative — not type-checked
// What a dispatch is about, computed by the package for core's `targets.descriptor` (BEH-BR-312).
interface CommandTarget {
  readonly commandId: string
  readonly tags: ReadonlyArray<string>
  readonly regulated: boolean
  readonly permission?: string
  readonly owner?: { readonly pluginId: string; readonly realm: string }
}
// What a contribution may name at registration (`register(..., { target })`); absent fields match all.
interface CommandHookSelector {
  readonly commandIds?: ReadonlyArray<string>   // the target's id is one of these
  readonly tags?: ReadonlyArray<string>         // every listed tag is on the target
  readonly tagPrefixes?: ReadonlyArray<string>  // each prefix begins at least one tag ("stock:" matches "stock:write")
}

declare const CommandHooks: {
  // core file 31: HookPoint<In, Enrich, Advice, Code, Target, Sel>
  readonly before: HookPoint<CommandRequest, unknown, never, string, CommandTarget, CommandHookSelector>  // roles enrich, veto
  readonly after: HookPoint<CommandOutcome, never, unknown, never, CommandTarget, CommandHookSelector>    // role advisory
}

// Fixed when the application builds the catalog layer (BEH-CM-011); core 31's options without `targets`,
// which the package supplies.
interface CommandHookOptions {
  readonly codes: ReadonlyArray<string>                          // veto codes of `before`
  readonly enrichment?: Schema.Schema<unknown>
  readonly advice?: Schema.Schema<unknown>
  readonly who: AdmissionRule<CommandHookSelector>               // core BEH-BR-298: (contributor, role, point, request)
  readonly labelsOf?: (owner: HookOwner) => Labels
  readonly policy?: ContributionPolicy<CommandRequest | CommandOutcome, CommandTarget, CommandHookSelector>  // BEH-BR-312
  readonly settle?: SettleStep<CommandRequest | CommandOutcome, CommandTarget>                               // BEH-BR-302
  readonly before: { readonly timeout: Duration.Input; readonly deadline: Duration.Input
                     readonly onError: OnErrorPolicy                                  // default "deny"
                     readonly breaker?: BreakerOptions | "off"; readonly breakerScope?: "contribution" | "plugin"
                     readonly dormant?: DormantPolicy }                               // default: core's
  readonly after:  { readonly timeout: Duration.Input; readonly deadline: Duration.Input
                     readonly breaker?: BreakerOptions | "off"; readonly breakerScope?: "contribution" | "plugin" }
}

interface CommandOutcome {
  readonly request: CommandRequest
  readonly result: { readonly _tag: "Success" } | { readonly _tag: "Failure"; readonly errorTag: string }
  readonly replayed: boolean                     // true when a receipt supplied the outcome (06, BEH-CM-041)
  readonly durationMillis: number
}

declare const CommandCatalog: {
  // Gives the catalog the host it reports to and the `HostLink` its hook dispatches run with
  // (core BEH-BR-250, BEH-BR-280). Called once by the application after `Bridger.make`.
  attach(host: Bridger.Host): Effect.Effect<void, never, CommandCatalog>
}
```

```
REQUIREMENT: When `CommandCatalogOptions.hooks` is given, the catalog layer
             MUST make the two hook points with core `HookPoint.make` in the
             layer's scope, with ids "@bridger/command/before" and
             "@bridger/command/after", the application's options, and
             `targets` = { `descriptor`: the request's `CommandTarget`,
             `selector`: the `CommandHookSelector` schema, `matches`: every
             given field of the selector holds for the target }. When
             `hooks` is absent, the package MUST make no hook point, steps 5
             and 8 MUST dispatch none, and `CommandHooks` MUST fail every
             `register` with core's `HookRegistrationRefused`.
```

```
REQUIREMENT: `before` MUST admit the roles "enrich" and "veto" only and
             `after` the role "advisory" only: the package MUST refuse any
             other role with `HookRegistrationRefused` before the
             application's `who` is called. `who` MUST receive core's four
             arguments, its `request` carrying the contribution's effective
             `onError` and decoded selector (core BEH-BR-298, BEH-BR-310,
             BEH-BR-312), so that a rule such as "only a command's owner may
             veto it" or "a selector must name commands" is the
             application's to write.
```

```
REQUIREMENT: `before` MUST be dispatched at step 5 with the gate's request;
             core runs its phases in the order of BEH-BR-311 — the enrich
             contributions on the request alone, then the veto
             contributions on the request and the enrichments. A `Denied`
             verdict MUST end the dispatch with
             `CommandVetoed { id, cause, hook?, code?, reason? }`: `cause`
             the verdict's cause (core BEH-BR-300: "veto", "hook-failed",
             "hook-timeout", "breaker-open", "deadline", "denied-policy",
             "dormant", "wake-failed", "wake-timeout", "no-host-link",
             "target-failed"), `hook` the verdict's `by` when present,
             `code` the veto code when the cause is "veto", and `reason` the
             policy's reason when the cause is "denied-policy". On
             `Allowed`, the outcome's enrichments MUST be passed to the
             handler as `HandlerContext.enrichments` (BEH-CM-003),
             unchanged and in view order.
```

```
REQUIREMENT: `after` MUST be dispatched at step 8 for every dispatch that
             reached step 3, whatever its outcome, with the
             `CommandOutcome`. Its results and failures MUST NOT change the
             outcome; failures MUST be logged.
```

```
REQUIREMENT: Hook dispatches MUST run with the `HostLink` of the attached
             host (`host.link`, core BEH-BR-250) as `HostLink.reference`, so
             that a veto declared by a plugin not yet loaded is woken or
             decides (core BEH-BR-309) whatever fiber dispatches. Before
             `attach`, the reference MUST be the dispatching fiber's; a
             dispatch from a fiber with no link then ends, on a `before`
             point with codes, as core specifies: `Denied { cause:
             "no-host-link" }`.
```

```
REQUIREMENT: Hook inputs MUST NOT carry the handler's output value. They
             MAY carry the encoded input, as the gate request does. The
             package MUST NOT merge an enrichment into the input passed to
             the handler, and MUST NOT let a hook change that input.
```

A veto hook is the place for checks that are cheap, local and plural — a
plugin that refuses a command while its device is offline — whereas the gate
is the single accountable decision. Enrichment is the place for values other
plugins propose for a command — a loyalty line, a hint for the operator — and
the veto phase sees them, so a plugin that must have the final say over a
proposed value can refuse it (core BEH-BR-311). Targets let one pair of
points serve every command: a plugin hooks its own commands by id, a family
of commands by tag prefix (`stock:`), and the application's `who` decides who
may ask for what. Keeping the output out of hook inputs keeps the after-hook a
place for metrics and evaluation, not a second channel through which data
leaves.

**Settled here.** (1) Revision 0.3 made `before` veto-only and `after`
advisory-only, which contradicted core 31's roles (recheck X5); `before` now
takes enrich and veto in core's phase order, and the enrichments reach the
handler beside the input, never inside it. (2) Advisory contributions sit on
`after` only: advice about a command that may still be refused by the
handler belongs with the outcome. (3) A verdict's cause is passed through as
data: a dispatcher can tell a contributor's veto from a policy deny, an
outage or a dormant veto that could not be woken, which an operator must
treat differently. (4) A `before` dispatch denied by core's "no-host-link"
rule fails closed; `attach` exists so that an adapter fiber outside the host
— an HTTP handler, a job runner — dispatches with the host's link
(G64 still applies: a loaded but inactive veto plugin has no hook; an
application that relies on a veto owner keeps it active or monitored).
(5) A lazy plugin declares its command hooks in its manifest as contributions
to the registries "@bridger/command/before" or "@bridger/command/after", with
`role` and a `target` that decodes as a `CommandHookSelector` (core
BEH-BR-241); a declared veto is woken or decides as core specifies, and a
target that does not decode hooks every command (core BEH-BR-312), so a
malformed manifest cannot hide a veto.

**Open.** Whether `before` hooks should run before the gate instead, so that a
locally impossible command never reaches an approver, is open; the order
above follows core, where the gate is consulted after validation.

## BEH-CM-013: The handler runs under a lease, bounded by a timeout

> **Invariant:** [INV-CM-003](../invariants.md#inv-cm-003-a-pinned-tool-never-runs-a-different-definition)
> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)
> **Risk:** [RSK-BR-001](../../core/gxp/03-risk-assessment.md#rsk-br-001), [RSK-BR-015](../../core/gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: Step 7 MUST run the handler through the private registry's
             `use(id, …)` (core BEH-BR-166), so that the contribution is held
             against removal while the handler runs. An id no longer in the
             view MUST fail with `ContributionUnavailable { id }`.
```

```
REQUIREMENT: Inside the hold, the entry's digest MUST be compared with the
             dispatch digest of step 1. When they differ — the id was
             removed and contributed again between steps 1 and 7 — the
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
class CommandVetoed        extends Schema.TaggedError<CommandVetoed>()("CommandVetoed", {
  id: Schema.String, cause: Schema.String,                 // core HookVerdict cause (BEH-BR-300)
  hook: Schema.optional(Schema.String), code: Schema.optional(Schema.String), reason: Schema.optional(Schema.String) }) {}
class CommandTimeout       extends Schema.TaggedError<CommandTimeout>()("CommandTimeout", { id: Schema.String, after: Schema.String }) {}
class ToolNotInToolset     extends Schema.TaggedError<ToolNotInToolset>()("ToolNotInToolset", { id: Schema.String, toolsetRevision: Schema.Number }) {}
class ToolChanged          extends Schema.TaggedError<ToolChanged>()("ToolChanged", { id: Schema.String, expected: Schema.String, actual: Schema.String }) {}
class ApprovalMismatch     extends Schema.TaggedError<ApprovalMismatch>()("ApprovalMismatch", { id: Schema.String, expected: Schema.String, actual: Schema.String }) {}
class IdempotencyConflict  extends Schema.TaggedError<IdempotencyConflict>()("IdempotencyConflict", {       // 06, BEH-CM-041
  id: Schema.String, key: Schema.String, reason: Schema.Literals(["actor-differs", "input-differs", "definition-differs", "mode-differs", "in-flight", "no-receipts"]) }) {}
class CommandWrapperFailed extends Schema.TaggedError<CommandWrapperFailed>()("CommandWrapperFailed", {     // 06, BEH-CM-042
  id: Schema.String, wrapper: Schema.String, message: Schema.String }) {}
class CommandBreakerOpen   extends Schema.TaggedError<CommandBreakerOpen>()("CommandBreakerOpen", {         // 06, BEH-CM-043
  id: Schema.String, scope: Schema.Literals(["command", "provider"]), key: Schema.String }) {}
class CommandDraftStale    extends Schema.TaggedError<CommandDraftStale>()("CommandDraftStale", {           // 07, BEH-CM-051
  draftId: Schema.String,
  mismatches: Schema.Array(Schema.Struct({ key: Schema.String, expected: Schema.String, actual: Schema.optional(Schema.String) })) }) {}

type DispatchError =
  | CommandNotFound | CommandInputInvalid | CommandOutputInvalid | CommandRefused | CommandDeferred
  | CommandVetoed | CommandTimeout | ToolNotInToolset | ToolChanged | ApprovalMismatch
  | IdempotencyConflict | CommandBreakerOpen | CommandDraftStale | CommandWrapperFailed
  | ContributionUnavailable | LeaseRevoked
// Batch outcomes (CommandBatchRejected, CommandBatchRolledBack, CommandBatchPartial): 07, BEH-CM-050
```

```
REQUIREMENT: Every dispatch MUST end in exactly one of: the handler's output
             (for a long command, a `CommandTaskRef`, 07, BEH-CM-052), the
             handler's typed error (declared by the command's `error`
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
> **Core seam:** [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md), [23 — Audit sink and record](../../core/behaviors/23-audit-sink-and-record.md), [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md)

```ts
// illustrative — not type-checked
// Offered at step 8 through the attached host (BEH-CM-012) for a dispatch ended at steps 4–6:
host.offerCallEntry({
  kind: "refusal", companion: "@bridger/command",
  serviceId: CommandCatalog.serviceId, member: request.command,     // the catalog's key; the command id as member
  outcome: "refused", errorTag: "CommandRefused",                     // or CommandDeferred, CommandVetoed, ...
  refusal: { stage: "boundary", reason: "CommandRefused: tainted-session" },
  durationMs
})
// Offered at step 8 for a dispatch that called its handler at step 7 or replayed a stored outcome at step 6:
host.offerCallEntry({
  kind: "dispatch", companion: "@bridger/command",
  serviceId: CommandCatalog.serviceId, member: request.command,
  outcome: "failure", errorTag: "StockTooLow",                        // or "success", "defect", "interrupted"
  dispatch: { command: request.command, digest: descriptor.digest,    // core DispatchInfo (BEH-BR-280)
              inputDigest, idempotencyKey: options.idempotencyKey },  // replayed: true when no handler ran
  durationMs
})
// The idempotency key reaches core's own entries as an annotation (06, BEH-CM-041):
//   CommandAnnotations.IdempotencyKey — id "bridger-command/idempotency-key", flows ["callLog"]
```

```
REQUIREMENT: When a host is attached (BEH-CM-012), every dispatch that
             reached step 3 and ended at step 4, 5 or 6 with
             `CommandRefused`, `CommandDeferred`, `CommandVetoed`,
             `CommandBreakerOpen` or `IdempotencyConflict`, or ended at
             step 7 before its handler was called (`ContributionUnavailable`,
             `ToolChanged` in the contribution hold, a wrapper that failed
             or returned before calling `run`, or an interruption before
             the handler call), MUST be offered once, at step 8, with `Host.offerCallEntry` (core BEH-BR-280)
             as an entry of kind "refusal", stage "boundary", `companion`
             "@bridger/command", `serviceId` the `CommandCatalog` key,
             `member` the command id, `outcome` "refused", `errorTag` the
             error's tag and `reason` the tag followed by ": " and the
             error's reason, cause or `reason` field. Core completes the
             actor, the correlation and the "callLog" annotations from the
             dispatching fiber.
```

```
REQUIREMENT: When a host is attached, a dispatch whose handler was called at
             step 7, or that ended with a replayed outcome at step 6, MUST
             be offered once,
             at step 8, with `Host.offerCallEntry` as an entry of kind
             "dispatch" (core BEH-BR-280, `DispatchInfo`): `companion`
             "@bridger/command", `serviceId` the `CommandCatalog` key,
             `member` the command id, `dispatch.command` the command id,
             `dispatch.digest` the descriptor digest (BEH-CM-005),
             `dispatch.inputDigest` the input digest (BEH-CM-011),
             `dispatch.idempotencyKey` when one was given,
             `dispatch.replayed: true` for a replayed outcome and absent
             otherwise, and `durationMs`. `outcome` MUST be "success" for a
             successful result, "failure" with `errorTag` for a typed
             error (the handler's, `CommandTimeout`, `CommandOutputInvalid`,
             `LeaseRevoked`, or `CommandWrapperFailed` of a wrapper that
             failed after `run` returned), "defect" for a defect and
             "interrupted" for an interruption; a replayed outcome takes
             the outcome of the stored one. The package MUST NOT offer
             these dispatches under any other kind. The calls their
             handlers make through captured services are logged by core
             with the dispatch's correlation and "callLog" annotations, the
             idempotency key among them.
```

```
REQUIREMENT: No entry MAY carry the input or output values, a cause or a
             configuration value (core BEH-BR-276, BEH-BR-280).
```

```
REQUIREMENT: The package MUST NOT write `AuditSink` records and MUST NOT
             describe dispatch as audited. The audit trail of core covers
             host lifecycle operations only (BEH-BR-193).
```

```
REQUIREMENT: The entry MUST be offered under the port's own failure policy
             (core BEH-BR-279). Because every entry the package offers
             describes a dispatch whose outcome is already decided —
             refused, deferred, vetoed, run or replayed — a
             `CallLogUnavailable` or `InvalidCallEntry` from
             `offerCallEntry` MUST NOT change the dispatch outcome; it MUST
             be logged at warning level. With no host attached, or no
             `CallLog` wired, nothing is offered.
```

A command log that a regulated user can rely on — retained, reviewed,
protected — is the application's: it is written by the handler, inside the
transaction that changes state, or by a handler wrapper the application
fixes in the catalog layer (06, BEH-CM-042). The package's entries are a
hook for it, not a record.

**Settled here.** (1) A deployment that needs the data a handler reads to be
logged or not delivered sets core's "refuse" policy on the captures the
handler uses (core BEH-BR-279); that answers the fail-closed question left
open in revision 0.3, at the level where data is actually accessed. (2) A
refusal is a boundary refusal in core's vocabulary: the request was stopped
at the catalog's boundary before any provider ran. (3) Core's URS gap G43 was
closed with entry kinds for remote crossings but none for a command
dispatch; revision 0.4 left executed dispatches unoffered rather than misuse
"crossing". Core then added kind "dispatch" with `DispatchInfo` (core URS gap
G66, closed by CCR-BR-027), and executed and replayed dispatches are offered
under it; core never produces that kind itself. (4) A dispatch that reached
step 7 but never called its handler is a refusal at the boundary in core's
terms (BEH-BR-280: "dispatch" describes a dispatch whose handler was called
or that was answered with a stored outcome), so it is offered as one.

## BEH-CM-016: A tainted request not declared read-only is never allowed on an automatic decision

> **Invariant:** [INV-CM-006](../invariants.md#inv-cm-006-a-tainted-dispatch-not-declared-read-only-never-runs-on-an-automatic-allow)
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
// exempt(r)  = r.readOnly and taintFloor.readOnly is "exempt" (the default).
//   not tainted(r), or exempt(r)                     → d   (no effective gate: Allow)
//   tainted(r), d = Refuse                           → Refuse
//   tainted(r), d = Defer                            → Defer   (the gate's own draft)
//   tainted(r), effective gate, d = Allow, r.approval present → Allow
//   tainted(r), d = Allow, no r.approval             → Defer(draftFor(r)) when `drafts` is set,
//                                                       else Refuse { reason: "tainted-session" }
//   tainted(r), no effective gate (approval or not)  → as the row above
// (rows for tainted(r) apply only when not exempt(r); a batch item or a compensation never calls
//  draftFor: 07, BEH-CM-049, BEH-CM-051)
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
             labels, tags, `regulated` or any field other than the taint
             and `readOnly` to decide its row.
```

```
REQUIREMENT: A tainted request whose descriptor declares `readOnly: true`
             (BEH-CM-006) MUST be treated by the floor as untainted —
             the effective gate's decision stands, and with no effective
             gate it is allowed — unless the application built the catalog
             with `taintFloor: { readOnly: "floor" }`, which applies the
             floor to it as to any request. The exemption MUST NOT remove
             or narrow the taint: the handler runs with the same
             annotations, so a dispatch nested inside it is tainted and
             meets the floor, and the caller keeps its taint for whatever
             it does with the output. `taintFloor` can only tighten the
             floor; no option can relax it further.
```

```
REQUIREMENT: Documentation MUST state that the exemption relies on the
             command author's declaration, which the package does not
             enforce (BEH-CM-006): a command wrongly declared `readOnly`
             lets a tainted session reach its effect on an automatic
             decision. Imported commands cannot be declared `readOnly`
             (`@bridger/mcp`, BEH-MC-020); the declaration is made only by
             in-process code, which is trusted
             ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)).
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
             `CommandCatalogOptions.drafts` is set and `r` is neither a
             batch item nor a compensation (07, BEH-CM-049, BEH-CM-051), and with
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
never be approved. (3) An untainted request is unaffected. (4) Reads are
exempt by default because a tainted session that cannot read is useless —
an untrusted MCP client could get no result at all, and an agent that has
read one supplier note could look nothing else up — while a read, by its
declaration, changes nothing a person would need to approve. The taint
stays on the session, so what the read returns cannot lead to an automatic
change. An application whose reads expose data it would rather have a
person release sets `taintFloor.readOnly: "floor"`, or refuses them in its
gate.

**Open.** Whether the floor's refusal reason should distinguish "no draft
source" from "no effective gate" for operators; v0.1 uses one reason,
"tainted-session".

---

_Previous: [01 — Command definition](./01-command-definition.md)_ · _Next: [03 — Toolsets](./03-toolsets.md)_
