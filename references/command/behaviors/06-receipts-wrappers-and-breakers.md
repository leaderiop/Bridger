# 06 — Receipts, Wrappers and Breakers

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-06                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Resolutions of the round-2 agent review (A-02, A-04, A-09, A-10, A-13, A-14): receipts compare actor first, carry the dispatch digest (`definition-differs`) and a task id (`mode-differs`; a repeat of a task returns its `CommandTaskRef`); `void` for undone batch items; a `Failure` is completed outside the wrappers, a claim is released when the wrapper chain does not end with the completed outcome, and an in-flight claim expires; one flow list for the key annotation and no inherited key in nested dispatches; a probe slot not used is returned (CCR-CM-003)<br>0.1 (2026-11-08): Initial draft — idempotency key and `CommandReceipts`, handler wrappers, breaker per command or provider (CCR-CM-003, round 2: recheck items 1, 4, 10) |

---

Agents, MCP clients, HTTP clients and job runners retry. A dispatch path that
every caller takes is the right place to recognise a retry, to wrap the
handler in the application's transaction, and to stop calling a handler that
keeps failing. This file adds three things to steps 6 and 7 of dispatch
([02 — Dispatch](./02-dispatch.md), BEH-CM-009): an idempotency key backed by
a receipts port, handler wrappers fixed when the catalog layer is built, and
a circuit breaker per command or per providing plugin. This file owns
BEH-CM-041–048 and uses BEH-CM-041–043; 044–048 are reserved.

Planned source: `packages/command/src/Receipts.ts`,
`packages/command/src/Wrappers.ts`, `packages/command/src/Breaker.ts`
*(Planned)*.

## BEH-CM-041: An idempotency key returns the stored outcome of a completed dispatch

> **Invariant:** [INV-CM-007](../invariants.md#inv-cm-007-a-completed-receipt-never-runs-its-handler-again)
> **See:** [ADR-CM-006](../decisions/006-receipts-and-wrappers-are-fixed-in-the-catalog-layer.md)
> **Core seam:** [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)

```ts
// illustrative — not type-checked
// The port: supplied by the application in CommandCatalogOptions.receipts (02, BEH-CM-011).
interface CommandReceipts {
  readonly claim: (claim: ReceiptClaim) => Effect.Effect<ReceiptState, ReceiptsUnavailable>
  readonly complete: (ticket: ReceiptTicket, outcome: StoredOutcome) => Effect.Effect<void, ReceiptsUnavailable>
  readonly release: (ticket: ReceiptTicket, reason: string) => Effect.Effect<void>
  // The receipt's effect was undone (a batch rollback or compensation, 07, BEH-CM-050): forget it,
  // so that the next claim for (command, key) answers Fresh. A ticket the port no longer knows is a no-op.
  readonly void: (ticket: ReceiptTicket, reason: "rolled-back" | "compensated") => Effect.Effect<void, ReceiptsUnavailable>
}
interface ReceiptClaim {
  readonly command: string            // the receipt scope is (command, key)
  readonly key: string
  readonly inputDigest: string        // BEH-CM-011
  readonly digest: string             // the dispatch digest, BEH-CM-005
  readonly actorId: string
  readonly correlationId: string
  readonly taskId?: string            // present when the dispatch runs as a task (07, BEH-CM-052)
  readonly expiresAt?: number         // Clock, epoch ms; absent when the dispatch timeout is "forever"
}
type ReceiptState =
  | { readonly _tag: "Fresh"; readonly ticket: ReceiptTicket }
  | { readonly _tag: "Completed"; readonly inputDigest: string; readonly digest: string; readonly actorId: string
      readonly taskId?: string; readonly outcome: StoredOutcome }
  | { readonly _tag: "InFlight"; readonly inputDigest: string; readonly digest: string; readonly actorId: string
      readonly taskId?: string }
interface ReceiptTicket { readonly command: string; readonly key: string; readonly token: string }
type StoredOutcome =
  | { readonly _tag: "Success"; readonly output: Json }        // the encoded output
  | { readonly _tag: "Failure"; readonly error: Json }         // the encoded typed error (the command's `error` schema)
class ReceiptsUnavailable extends Schema.TaggedError<ReceiptsUnavailable>()("ReceiptsUnavailable", { message: Schema.String }) {}

// The label every call the handler makes carries to core's call log (flow "callLog" only; the gate
// reads the key from CommandRequest.idempotencyKey, not from this annotation).
declare const CommandAnnotations: {
  readonly IdempotencyKey: AnnotationKey<string>   // id "bridger-command/idempotency-key"; combine: incoming wins;
                                                   // monotonic: false; flows: ["callLog"]
}
```

```
REQUIREMENT: `DispatchOptions.idempotencyKey`, when given, MUST be 1 to 128
             characters from U+0021 to U+007E; any other value MUST fail
             dispatch at step 2 with `CommandInputInvalid` naming
             "idempotencyKey". A valid key MUST reach the `CommandRequest`
             (`idempotencyKey`), the hook inputs, `HandlerContext`
             (BEH-CM-003) and, through `CommandAnnotations.IdempotencyKey`
             added with core's `Annotation.add` for step 7, every call-log
             entry core produces for the calls the handler makes (core
             BEH-BR-276, BEH-BR-293).
```

```
REQUIREMENT: With a key and no `receipts` port, dispatch MUST fail at step 6
             with `IdempotencyConflict { id, key, reason: "no-receipts" }`
             and run no handler: a key the caller relies on is never
             ignored.
```

```
REQUIREMENT: With a key and a port, step 6 MUST call `claim` exactly once
             and act on its answer:
             - `Fresh`: continue; the ticket is completed or released as
               below.
             - `Completed` or `InFlight` whose `actorId` differs from the
               claim's: `IdempotencyConflict { reason: "actor-differs" }`,
               whatever the input, digest or mode. The actor is compared
               first, so that a foreign actor learns only that the key is
               in use for the command, never whether its input equals
               another actor's.
             - Same actor, `Completed` or `InFlight` with another
               `inputDigest`: `reason: "input-differs"`.
             - Same actor and input, `Completed` or `InFlight` with
               another `digest`: `reason: "definition-differs"` — a
               receipt never answers for a definition other than the one
               the dispatch checked at step 1 (INV-CM-003).
             - Same actor, input and digest, where exactly one of the
               claim and the receipt carries a `taskId`:
               `reason: "mode-differs"` (a key used for a value is not
               reused for a task, nor the reverse).
             - Same actor, input and digest, both with a `taskId`
               (`Completed` or `InFlight`): end the dispatch with the
               existing task's `CommandTaskRef { taskId: receipt.taskId }`
               without creating a task (07, BEH-CM-052), reported as
               replayed.
             - Same actor, input and digest, neither with a `taskId`:
               `Completed` ends the dispatch without running step 7, with
               the stored outcome — `Success` decoded with the output
               schema (a value that no longer decodes fails with
               `CommandOutputInvalid`), `Failure` decoded with the error
               schema as the handler's typed error — reported as replayed
               (BEH-CM-012, `CommandOutcome.replayed`); `InFlight` fails
               with `reason: "in-flight"`.
             A `claim` that fails, dies or exceeds `gateTimeout` MUST end
             the dispatch with `CommandRefused { id, reason:
             "receipts-unavailable" }`.
```

```
REQUIREMENT: For a `Fresh` claim, the package MUST complete the receipt
             once the handler returned and its output or typed error was
             encoded. A `Success` MUST be completed inside the handler
             wrappers (BEH-CM-042), innermost, so that a transaction
             wrapper commits or rolls back the receipt with the domain
             write. A `Failure` (the handler's typed error) MUST be
             completed after the handler wrapper chain returned it, outside
             every handler wrapper, so that a wrapper that rolls back on a failure does
             not roll the receipt back with it. A `complete` that fails
             MUST fail the dispatch with `CommandWrapperFailed { wrapper:
             "receipts" }` — inside the wrappers for a `Success`, so that
             a transaction wrapper rolls back with it.
```

```
REQUIREMENT: The package MUST call `release` with the error's tag,
             uninterruptibly, on every end of a fresh claim other than
             the outcome it completed: `CommandBreakerOpen` at step 6;
             `CommandTimeout`, `LeaseRevoked`, `ContributionUnavailable`,
             `ToolChanged`, a wrapper failure or a defect at step 7, also
             when it happens after `complete` returned (the wrapper chain
             then did not end with the completed outcome, and a
             transaction may have rolled the receipt back); an
             interruption; and a batch that ends before the item's step 7
             (07, BEH-CM-049). The port MUST make `release` remove the
             receipt held under that ticket, `InFlight` or `Completed`.
```

```
REQUIREMENT: The claim MUST carry `expiresAt`: the `Clock` time of the
             claim plus the dispatch's effective timeout (BEH-CM-013) plus
             `CommandCatalogOptions.receiptGrace` (default 60 seconds),
             or no `expiresAt` when the effective timeout is "forever".
             The port MUST answer a claim that meets an `InFlight` receipt
             past its `expiresAt` as `Fresh`, with a new ticket, and MUST
             then fail a `complete` of the superseded ticket with
             `ReceiptsUnavailable` and ignore its `release`.
             Documentation MUST state that a process that stops between
             claim and completion leaves the key `InFlight` until
             `expiresAt`, and for ever under a "forever" timeout unless
             the application clears it.
```

```
REQUIREMENT: The package MUST NOT claim exactly-once effects. Its guarantee
             is narrower: a dispatch whose receipt the port reports
             `Completed` never runs its handler again (INV-CM-007). Whether
             a released claim's effects happened is the handler's and the
             wrappers' concern; documentation MUST state that the receipt
             and the domain write are atomic only when the port writes
             receipts inside the same transaction a handler wrapper opens.
```

A retry carries the same key and the same input. Recognising it after the
gate and the hooks — not before — keeps every repeat a request that is
judged: the gate is consulted again (it never caches, core BEH-BR-314), a
taint floor still applies, and a receipt cannot be used to obtain an outcome
the gate would now refuse. Scoping receipts by command and binding them to
the input digest and the actor means a key reused by mistake for other data,
or presented by another actor, fails visibly instead of returning someone
else's result.

**Settled here.** (1) The receipt store is the application's: it decides
retention, and whether receipts live in the same database as the domain
writes. (2) Dispatch errors raised before step 6 — a refusal, a deferral, a
veto — create no claim, so a retry after an approval is a new request.
(3) A claim that is `InFlight` is refused, not awaited: waiting would hold a
caller for the length of another caller's handler, and the caller can retry.
A task is the exception: its handle already exists, so a repeat gets it.
(4) Nested dispatches do not inherit a key as their own: a handler that wants
an idempotent nested dispatch passes a key derived from its
`HandlerContext.idempotencyKey`. A nested dispatch without a key MUST run
its step 7 under `Annotation.replace(CommandAnnotations.IdempotencyKey,
Option.none())` (core file 30; the key is not monotonic), so that the
handler's calls are not logged under the outer key; with a key, the key
replaces the outer one. (5) `CommandAnnotations.IdempotencyKey` has one
flow list, `["callLog"]`; the gate and the hooks read the key from the
request. (6) A receipt whose effect a batch undid is voided (07,
BEH-CM-050), so that a retry of the batch runs the item again instead of
replaying an effect that no longer exists.

**Open.** Whether the port should also scope receipts by actor (command,
actor, key), which would remove even the "key in use" signal of
"actor-differs" at the cost of letting two actors run the same key; v0.1
keeps one scope and compares the actor first. Whether the package should ship an in-memory `CommandReceipts` for
tests only (as core ships a call-log fixture); v0.1 leaves it to
`@bridger/kit`'s test helpers.

## BEH-CM-042: Handler wrappers are fixed when the catalog layer is built

> **Invariant:** [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch)
> **See:** [ADR-CM-006](../decisions/006-receipts-and-wrappers-are-fixed-in-the-catalog-layer.md), [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md), [22 — Attributable operations](../../core/behaviors/22-attributable-operations.md)

```ts
// illustrative — not type-checked
type WrappedOutcome =
  | { readonly _tag: "Success"; readonly output: Json }      // the encoded output
  | { readonly _tag: "Failure"; readonly error: Json }       // the encoded typed error
interface CommandHandlerWrapper {
  readonly name: string
  readonly applies?: (descriptor: CommandDescriptor) => boolean            // pure; default: every command
  readonly provides?: ReadonlyArray<Context.Key<any, any>>                  // keys the wrapper hands to the handler
  readonly wrap: (
    request: CommandRequest,
    run: (services: Context.Context<never>) => Effect.Effect<WrappedOutcome, DispatchRunError>
  ) => Effect.Effect<WrappedOutcome, DispatchRunError | WrapperError>
}
class WrapperError extends Schema.TaggedError<WrapperError>()("WrapperError", { message: Schema.String }) {}

// The application's base layers:
CommandCatalog.layer({
  handlerWrappers: [transaction, auditRow, outbox],   // outermost first; receipts completed innermost (BEH-CM-041)
  receipts: receiptsInTheSameDatabase
})
// Every adapter is a thin caller of one path:
//   HTTP:  POST /commands/:id  →  Commands.dispatch(id, body, { idempotencyKey: header("Idempotency-Key"), context })
//   UI:    form submit         →  Commands.dispatch(command, values, { expectDigest: form.digest, context })
//   Job:   scheduled run       →  Commands.dispatch(command, input, { idempotencyKey: `${jobId}:${runAt}`, context })
```

```
REQUIREMENT: `handlerWrappers` MUST be read once, when the catalog layer is
             built, and MUST NOT change afterwards; the package MUST NOT
             offer any API through which a plugin adds, removes or
             reorders a wrapper. Wrapper names MUST be non-empty and unique
             ("receipts" is reserved); a violation MUST fail the layer with
             a defect naming the wrapper.
```

```
REQUIREMENT: Step 7 MUST run, inside the contribution hold and the dispatch
             timeout (BEH-CM-013), `handlerWrappers[0]` around
             `handlerWrappers[1]` around … around the core, keeping only the
             wrappers whose `applies` returns true for the descriptor. The
             core MUST run the handler, encode its output or typed error,
             and complete the receipt (BEH-CM-041). Each wrapper MUST
             receive the gate's request and MUST call `run` at most once;
             a wrapper that returns without calling `run` MUST fail the
             dispatch with `CommandWrapperFailed { id, wrapper, message:
             "run-not-called" }` unless it fails itself.
```

```
REQUIREMENT: The services a wrapper passes to `run` MUST be restricted to
             the keys in its `provides`, and MUST be added over the
             handler's captured context for those keys only (BEH-CM-003);
             no other key of the dispatcher's or the wrapper's context MAY
             reach the handler. Wrappers MUST run in the dispatching fiber,
             with the dispatch's `CurrentCorrelation` and with the resolved
             actor and annotations served as for the handler, and with no
             plugin principal (the application's code is not a plugin).
```

```
REQUIREMENT: A `WrapperError`, a failure of a wrapper other than a
             `DispatchRunError` returned by `run`, or a wrapper's defect
             MUST end the dispatch with `CommandWrapperFailed { id,
             wrapper, message }`, the message carrying no cause or stack.
             A wrapper MUST NOT turn a failed `run` into a success: a
             `Failure` or a `DispatchRunError` returned by `run` MUST reach
             the caller as the handler's typed error or that error, even
             when the wrapper returns another value; the package MUST
             compare and use `run`'s outcome.
```

```
REQUIREMENT: The package MUST NOT ship a wrapper and MUST NOT describe a
             wrapper as making a command atomic, logged or exactly-once;
             those properties are the application's wrappers' and stores'.
```

A product that requires "one path for every state change" also requires that
the path carries the same transaction, the same business audit row and the
same outbox message whoever called. Fixing those as wrappers in the catalog
layer gives them the property the gate wrappers have (BEH-CM-011): the code
that builds the application decides them once, and no plugin can step around
them. A UI gateway, an HTTP API and a job runner then differ only in how they
turn their input into a call of `Commands.dispatch`.

**Settled here.** (1) The order is outermost first: a transaction listed first
encloses the audit row and the outbox message listed after it, and the
receipt completion the package performs innermost. (2) `run` returns the
encoded outcome, not the decoded value, so an audit or outbox wrapper writes
what the call log and the receipt store would see, never a live object.
(3) Wrappers see a handler's typed error as `Failure` and decide what to do
with their transaction; the caller still receives the typed error.

**Open.** The type-level form of `provides` — how a handler states at
`contribute` that it requires a key a wrapper supplies — is left to the
prototype; the runtime rule above is fixed.

## BEH-CM-043: A breaker per command or per providing plugin

> **Invariant:** [INV-CM-001](../invariants.md#inv-cm-001-the-catalog-runs-a-handler-only-through-dispatch)
> **See:** [ADR-CM-006](../decisions/006-receipts-and-wrappers-are-fixed-in-the-catalog-layer.md)
> **Core seam:** [31 — Hook points](../../core/behaviors/31-hook-points.md), [24 — Time, identifiers and sequence](../../core/behaviors/24-time-ids-and-sequence.md)

```ts
// illustrative — not type-checked
interface CommandBreakerOptions {
  readonly scope: "command" | "provider"     // key: the command id, or the owner `${pluginId}@${realm}`
  readonly failures: number                  // errors within `window` that open the breaker (≥ 1)
  readonly window: Duration.Input
  readonly cooldown: Duration.Input          // open → half-open after this long
  readonly counts?: ReadonlyArray<"timeout" | "revoked" | "defect" | "wrapper">   // default ["timeout", "revoked", "defect"]
}
interface CommandBreakerRecord {
  readonly scope: "command" | "provider"
  readonly key: string
  readonly command: string                   // the dispatch whose result caused the transition
  readonly state: "closed" | "open" | "half-open"
  readonly at: string                        // Clock, ISO-8601 UTC with ms
}
// CommandCatalog gains: readonly breakers: Stream.Stream<CommandBreakerRecord>   — a feed, not a log
```

```
REQUIREMENT: With `breaker` other than "off" (the default), the catalog MUST
             keep one breaker per key, starting "closed", with the
             semantics of core's hook breaker (BEH-BR-304): it MUST open
             after `failures` counted errors within `window`, measured with
             the `Clock` service; while "open", step 6 MUST end the
             dispatch with `CommandBreakerOpen { id, scope, key }` and run
             no handler; after `cooldown` it MUST become "half-open", and
             the next dispatch MUST run once as the probe — a success or an
             uncounted outcome closes it and clears its count, a counted
             error reopens it — while concurrent dispatches meet
             `CommandBreakerOpen`. A probe slot taken at step 6 by a
             dispatch that then does not reach step 7 (a batch that ends
             before the item runs, 07, BEH-CM-049; an interruption) MUST be
             returned: the breaker stays "half-open" and the next dispatch
             probes.
```

```
REQUIREMENT: The counted errors MUST be those listed in `counts`, mapped
             from step 7: "timeout" `CommandTimeout`, "revoked"
             `LeaseRevoked`, "defect" a handler defect, "wrapper"
             `CommandWrapperFailed`. A handler's typed error, every failure
             before step 7, a replayed outcome and an interruption by the
             caller MUST NOT count.
```

```
REQUIREMENT: Under scope "provider", the key MUST be the descriptor's owner;
             a command without an owner MUST keep a breaker under its own
             id. A breaker MUST be discarded when its command leaves the
             catalog (scope "command") or when the owner's last command
             leaves it (scope "provider"); a later contribution starts
             "closed".
```

```
REQUIREMENT: Every transition MUST be published on `CommandCatalog.breakers`
             and logged at warning level. It MUST NOT change plugin state,
             MUST NOT be written to the `AuditSink` and MUST NOT be
             described as a plugin failure.
```

A handler that times out on every call costs every caller a full timeout and
holds a contribution lease for each. A breaker answers at once instead, for
the command, or for every command of a plugin whose backend is down — the
same reasoning core applies to hook contributions, and the same semantics,
so an operator reads one kind of breaker everywhere.

**Settled here.** (1) Off by default: whether failing fast is better than
trying is a deployment's choice. (2) A breaker answers after the gate and the
hooks, so a refused request never probes a half-open breaker and the gate's
decision is never replaced by the breaker's. (3) Domain failures (the
handler's declared errors) never open a breaker: a command that correctly
refuses most inputs is healthy.

**Open.** Per-command breaker options (a different window for one command)
are not offered in v0.1; an application that needs them uses scope "command"
with the strictest common values.

---

_Previous: [05 — Required acceptance checks](./05-required-acceptance-checks.md)_ · _Next: [07 — Batches and long commands](./07-batches-and-long-commands.md)_
