# 07 — Batches and Long Commands

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-07                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): BEH-CM-052: the task's fiber carries the dispatching fiber's plugin principal unchanged (none for application code); when that principal's activation ends while the task runs, the task keeps running, a mutating host call, access decision or `asSelf` under the retired principal dies with `PrincipalRetired` (core BEH-BR-257), and the task then ends `failed` with error tag "PrincipalRetired" after its finalizers (T3) (CCR-CM-007)<br>0.3 (2026-11-09): Specification audit of 2026-11-09 (C-10) — phase C of batch admission consults the admission policies per item; items that never run, and items admitted before a phase-C failure, are settled `NotRun`; a task settles its admissions when it ends (BEH-CM-044) (CCR-CM-004)<br>0.2 (2026-11-08): Resolutions of the round-2 agent review (A-01, A-02, A-03, A-08, A-09, A-11, A-15, A-16): batch admission in three phases, so that no receipt claim or probe slot is taken before every item passed the gate, the floor and the hooks; receipts of undone items voided and replayed items never compensated; each item's request carries its planned compensation, bound by digest in the batch draft and approval, and compensations of an approved batch carry an `ApprovalRef` derived from it; the floor drafts nothing for an item of a batch; `long` items refused in a batch; a repeated keyed task returns its handle; BEH-CM-054 `CommandTaskStore` port, in memory by default, with lost tasks reported (CCR-CM-003)<br>0.1 (2026-11-08): Initial draft — batch dispatch admitted whole, run in order and undone by compensation; batch drafts approved all or none and re-planned when stale; long commands run as tasks with progress, await and cancel (CCR-CM-003, round 2: recheck items 5, 7) |

---

Two shapes of work do not fit one dispatch returning one value. A **batch** is
several commands that must happen together or not at all — an agent's plan of
three edits, an operator's bulk change — and that a person approves as one
proposal; core's drafts already hold several requests
([32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md),
BEH-BR-316). A **long command** runs for minutes — an import, a report — and
its caller wants a handle, progress and a way to wait. This file specifies
both on top of the dispatch steps of [02 — Dispatch](./02-dispatch.md). This
file owns BEH-CM-049–056 and uses BEH-CM-049–054; 055–056 are reserved.

Planned source: `packages/command/src/Batch.ts`,
`packages/command/src/CommandTasks.ts` *(Planned)*.

## BEH-CM-049: A batch is admitted whole before any handler runs

> **Invariant:** [INV-CM-008](../invariants.md#inv-cm-008-no-handler-of-a-batch-runs-before-every-item-is-admitted)
> **See:** [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

```ts
// illustrative — not type-checked
interface BatchItem {
  readonly command: Command<any, any, any> | string
  readonly input: unknown
  readonly expectDigest?: string
  readonly idempotencyKey?: string
}
interface BatchOptions {
  readonly context?: OperationContext
  readonly toolset?: PinnedToolset
  readonly approval?: BatchApprovalRef          // BEH-CM-051
  readonly timeout?: Duration.Input             // narrows each item's timeout
}
declare const Commands: {
  // ...dispatch, start
  batch(items: readonly [BatchItem, ...BatchItem[]], options?: BatchOptions):
    Effect.Effect<ReadonlyArray<unknown>, BatchError, CommandCatalog>   // outputs in item order
}

class CommandBatchRejected extends Schema.TaggedError<CommandBatchRejected>()("CommandBatchRejected", {
  batchId: Schema.String, index: Schema.Number,
  error: Schema.Struct({ _tag: Schema.String, message: Schema.String })   // the item's dispatch error
}) {}
type BatchError = CommandBatchRejected | CommandDeferred | CommandDraftStale
                | CommandBatchRolledBack | CommandBatchPartial            // BEH-CM-050
```

```
REQUIREMENT: `Commands.batch` MUST take a `batchId` from the host's
             `IdGenerator`, resolve one context for the batch (BEH-CM-010)
             and admit the items in three phases, each in item order,
             before running step 7 for any item:
             (A) steps 1–4 of BEH-CM-009 for every item;
             (B) only when phase A ended with no rejection and no
                 deferral, step 5 (before-hooks) for every item;
             (C) only when phase B ended with no veto, step 6 (receipt
                 claim, breaker and admission policies, BEH-CM-044) for
                 every item.
             Each item's `CommandRequest` MUST carry `batch: { batchId,
             index, size }` and, when its descriptor names `compensatedBy`,
             `compensation` (BEH-CM-050). The effective gate MUST be
             consulted once per item (BEH-CM-011) and the taint floor
             (BEH-CM-016) applied per item, except that the floor MUST NOT
             call `drafts.draftFor` for an item of a batch: it records the
             item as deferred ("tainted-session") and the batch's one draft
             comes from `draftForBatch` (BEH-CM-051).
```

```
REQUIREMENT: An item whose descriptor is `long` MUST end the batch at step
             1 with `CommandBatchRejected` carrying `CommandRefused` with
             reason "long-in-batch": a batch returns values, and a task
             handle is not one.
```

```
REQUIREMENT: The first item that fails a step of 1–6 with any error other
             than a deferral MUST end the batch with
             `CommandBatchRejected { batchId, index, error }`; no later item
             MUST be admitted, and no handler MUST run. A failure at
             phase C MUST release every fresh receipt claim already taken
             by the earlier items (BEH-CM-041), return every breaker
             probe slot they took (BEH-CM-043) and settle every admission
             that admitted them with `NotRun` (BEH-CM-044).
```

```
REQUIREMENT: When an item is deferred — by the gate or by the taint floor —
             the remaining items MUST still pass steps 1–4, so that a later
             refusal wins over an earlier deferral (as core's `Gate.all`,
             BEH-BR-321); phases B and C MUST NOT run, so a deferred batch
             holds no receipt claim and no probe slot. When no item was
             rejected and at least one was deferred, the batch MUST end
             with `CommandDeferred { id: "batch:" + batchId, draftId }` for
             one draft covering every item (BEH-CM-051).
```

Admitting every item first is what makes "all or nothing" mean something
before any effect happens: a batch whose third item the gate refuses never
runs its first. A deferral of any item defers the whole batch, because a
person approving part of a plan approves a different plan.

**Settled here.** (1) One gate decision per item, not one per batch: the gate
type stays `Gate<CommandRequest>`, every request is judged on its own data,
and `batch` tells the gate which batch an item belongs to. (2) Items of one
batch share one context and one correlation; their idempotency keys are
their own. (3) The phases put every judgement — gate, floor, hooks — before
any claim or probe, so a batch that is refused, vetoed or deferred leaves
nothing behind in the receipt store or the breakers, and its approved
re-dispatch with the same keys starts from fresh claims. Before-hooks run
only for a batch that the gate and the floor admitted whole.

## BEH-CM-050: Items run in order, and a failure undoes the items before it

> **Invariant:** [INV-CM-008](../invariants.md#inv-cm-008-no-handler-of-a-batch-runs-before-every-item-is-admitted)
> **See:** [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md) (atomic apply, BEH-BR-322–BEH-BR-325, as a model)

```ts
// illustrative — not type-checked
interface CommandBatchWrapper {
  readonly name: string
  readonly atomic: boolean        // true: a failed run rolls back everything the items did (e.g. one transaction)
  readonly wrap: (requests: ReadonlyArray<CommandRequest>,
                  run: Effect.Effect<BatchRunResult>) => Effect.Effect<BatchRunResult, WrapperError>
}
// CommandCatalogOptions gains: readonly batchWrappers?: ReadonlyArray<CommandBatchWrapper>   (fixed at layer build)

// CommandRequest (02, BEH-CM-011) gains the planned undo of an item, as core's PlannedEntry.undo (BEH-BR-325):
//   readonly compensation?: { readonly command: string; readonly digest: string }   // the compensatedBy command's
//                                                                                  // descriptor digest at admission
class CommandBatchRolledBack extends Schema.TaggedError<CommandBatchRolledBack>()("CommandBatchRolledBack", {
  batchId: Schema.String,
  failed: Schema.Struct({ index: Schema.Number, command: Schema.String, error: Schema.Struct({ _tag: Schema.String, message: Schema.String }) }),
  undone: Schema.Array(Schema.Struct({ index: Schema.Number, command: Schema.String,
    by: Schema.Literals(["wrapper", "compensation", "read-only"]),
    receiptVoided: Schema.optional(Schema.Boolean) }))     // present for an item that had a fresh receipt
}) {}
class CommandBatchPartial extends Schema.TaggedError<CommandBatchPartial>()("CommandBatchPartial", {
  batchId: Schema.String,
  failed: /* as above */ Schema.Unknown,
  undone: /* as above */ Schema.Unknown,
  notUndone: Schema.Array(Schema.Struct({ index: Schema.Number, command: Schema.String,
    reason: Schema.Struct({ _tag: Schema.String, message: Schema.String }) }))   // "NoCompensation", "Replayed" or the compensation's error
}) {}
```

```
REQUIREMENT: After admission, the package MUST run step 7 of each admitted
             item in item order, one at a time, inside the `batchWrappers`
             (outermost first, fixed when the layer is built, as handler
             wrappers are, BEH-CM-042); each item keeps its own lease,
             timeout, handler wrappers and receipt. An item whose receipt
             was replayed at step 6 MUST NOT run and counts as succeeded.
             When every item succeeds, the batch MUST succeed with the
             outputs in item order, and step 8 MUST run per item.
```

```
REQUIREMENT: When an item's descriptor names `compensatedBy`, phase A MUST
             look the named command up in the catalog and set the item's
             `CommandRequest.compensation` to its id and current
             descriptor digest before the gate, so that the gate, the
             draft and the approval see the planned undo with the forward
             request. When the named command is absent, `compensation`
             MUST be absent; the item can then only be listed in
             `notUndone`.
```

```
REQUIREMENT: When item k fails at step 7, no item after k MUST run, and each
             item after k MUST have its fresh receipt claim released, its
             breaker probe slot returned and its admissions settled with
             `NotRun` (BEH-CM-041, BEH-CM-043, BEH-CM-044); each item that
             ran is settled after its own step 7. When an
             applying batch wrapper declares `atomic: true`, the package
             MUST treat every item before k as undone by that wrapper and
             MUST end with `CommandBatchRolledBack` listing them with `by:
             "wrapper"`. Otherwise it MUST undo the items before k that
             ran their handler in this batch, in reverse order: an item
             whose descriptor is `readOnly` is listed with `by:
             "read-only"` and nothing is dispatched; for an item whose
             request carries `compensation`, one `Commands.dispatch` of
             that command with input `{ input, output }` (the item's
             encoded input and output), the batch's context,
             `expectDigest` the planned `compensation.digest`, the
             idempotency key `batchId + ":undo:" + index`, a request
             carrying `compensates: { batchId, index, command }`, and,
             when the batch was dispatched with a `BatchApprovalRef`, the
             derived `ApprovalRef` of BEH-CM-051. An item without
             `compensation`, or whose compensation ends in any error, MUST
             be listed in `notUndone` and MUST NOT be retried.
```

```
REQUIREMENT: An item whose outcome was replayed at step 6 MUST NOT be
             compensated: its effect belongs to an earlier run under the
             same key. On a failure it MUST be listed in `notUndone` with
             reason `{ _tag: "Replayed" }`.
```

```
REQUIREMENT: For every item listed in `undone` that took a fresh receipt
             claim, the package MUST call `CommandReceipts.void(ticket,
             "rolled-back")` (by an atomic wrapper) or `void(ticket,
             "compensated")` (by compensation), uninterruptibly, so that a
             retry of the batch with the same keys runs the item again
             rather than replaying an effect that was undone (BEH-CM-041).
             Under an atomic batch wrapper the failed item k's own receipt
             MUST be voided as "rolled-back" as well: the wrapper's
             transaction may have rolled back its completion, and a retry
             of the rolled-back batch runs every item again.
             A `void` that fails MUST be reported as `receiptVoided:
             false` on that entry and logged at error level; documentation
             MUST state that a retry with the same key then replays the
             undone item's outcome.
```

```
REQUIREMENT: The result MUST be `CommandBatchRolledBack { batchId, failed,
             undone }` when every succeeded item was undone, and
             `CommandBatchPartial { batchId, failed, undone, notUndone }`
             otherwise; a partial batch MUST also be logged at error level
             with the batch id and the correlation. Compensations pass
             every dispatch step, the gate included: a gate MAY recognise
             them by `CommandRequest.compensates`, as core's gates
             recognise undo requests (BEH-BR-325).
```

```
REQUIREMENT: The package MUST NOT describe a batch as atomic. Documentation
             MUST state that a batch is all-or-nothing in its admission,
             and in its effects only to the extent that an atomic batch
             wrapper or the compensating commands undo them.
```

A batch cannot be made atomic by a library that runs handlers it does not
control. What the package can do is what core does for an atomic apply
(BEH-BR-322–BEH-BR-324): run in a fixed order, stop at the first failure,
undo what was done in reverse — through the application's transaction when
one encloses the batch, through each command's declared compensation when
not — and report exactly what was and was not undone, never retrying an undo.

**Settled here.** (1) A compensation is a command, dispatched through the
same path, so it is gated, hooked, logged and idempotent like any other.
`compensates` lets a gate recognise the undo of a batch it allowed. For an
untainted batch that is enough for a gate to allow it without a second
approval. For a tainted batch the floor allows nothing without an approval
(BEH-CM-016), so the approval of the batch must cover its undo: the
compensating commands are bound into the batch draft by digest (BEH-CM-051)
and each compensation carries an `ApprovalRef` derived from the batch's,
which the gate checks as it checks any approval. A tainted batch that was
not approved as a batch — possible only when every item is `readOnly`
(BEH-CM-016) — has nothing to compensate. (2) A compensating command's input schema must accept
`{ input, output }`; one that does not fails at decode and is reported in
`notUndone`. (3) An interruption of the caller during step 7 interrupts the
running item and then runs the undo uninterruptibly, as core does for an
interrupted atomic apply. (4) The undo key `batchId + ":undo:" + index` is
per run on purpose: a retried batch has a new `batchId`, runs again the
items whose receipts were voided, and undoes its own effects, never an
earlier run's.

**Open.** Whether the batch should offer a dry run (steps 1–4 only) for a UI
that wants to show which items a gate would defer; v0.1 does not.

## BEH-CM-051: A batch draft is approved all or none, and a stale draft is re-planned

> **See:** [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

```ts
// illustrative — not type-checked
interface CommandDraftSource {
  readonly draftFor: (request: CommandRequest, reason: "tainted-session") => Effect.Effect<Draft<CommandRequest>>  // BEH-CM-016
  // A batch with at least one deferred item; `parts` are the gate's own drafts for its deferrals, if any.
  readonly draftForBatch?: (requests: readonly [CommandRequest, ...CommandRequest[]],
                            parts: ReadonlyArray<Draft<CommandRequest>>,
                            reason: "batch-deferred" | "tainted-session") => Effect.Effect<Draft<CommandRequest>>
}
interface BatchApprovalRef {
  readonly draftId: string
  readonly approvalId: string
  readonly items: ReadonlyArray<{
    readonly digest: string; readonly inputDigest: string
    readonly compensationDigest?: string                    // the item request's compensation.digest, when planned
  }>                                                         // in item order
  readonly expected?: ReadonlyArray<Expectation>             // core BEH-BR-316
}
// ApprovalRef (02, BEH-CM-011) gains the same optional `expected`, and
//   readonly compensationOf?: { readonly batchId: string; readonly index: number }   // set only by the package (below)
```

```
REQUIREMENT: The draft of a deferred batch MUST come from
             `drafts.draftForBatch` with every item's request in order and
             the gate's drafts for its deferrals; its `requests` MUST be
             exactly those requests (without `approval`), and a draft that
             is malformed under core BEH-BR-316, or a source that fails,
             dies or exceeds `gateTimeout`, MUST end the batch with
             `CommandBatchRejected` carrying `CommandRefused` with reason
             "gate-defect" or "gate-timeout". With no `draftForBatch`, the
             batch MUST end with `CommandBatchRejected` carrying
             `CommandRefused` with reason "no-batch-draft-source". Because
             the requests carry `compensation`, the draft binds each item's
             planned undo by command and digest.
```

```
REQUIREMENT: Documentation MUST state that the gate's own drafts passed as
             `parts` are not approvable on their own: `draftForBatch` MUST
             supersede them in the application's store (the package cannot
             see the store), and a gate SHOULD refuse an `ApprovalRef`
             whose draft's requests carry `batch` when it arrives on a
             single dispatch. The taint floor creates no draft for a batch
             item (BEH-CM-049).
```

```
REQUIREMENT: An approved batch draft MUST be applied by calling
             `Commands.batch` again with the same items and
             `options.approval` set to a `BatchApprovalRef`. Before any
             gate, the package MUST check that the number of items equals
             `approval.items.length` and that each item's dispatch digest
             and `inputDigest` equal the reference's (`ToolChanged` or
             `ApprovalMismatch` for the first item that differs, carried by
             `CommandBatchRejected`), and that each item's
             `compensationDigest` equals the digest phase A computes for
             its `compensation` (`ToolChanged` naming the compensating
             command when it differs or the command is gone); each item's
             request MUST then carry the per-item `ApprovalRef { draftId,
             approvalId, digest, inputDigest }`. Every item passes every
             step again, so the approval applies to all items or, if any
             item is refused on re-dispatch, to none.
```

```
REQUIREMENT: A compensation of a batch dispatched with a `BatchApprovalRef`
             MUST carry the derived `ApprovalRef { draftId, approvalId,
             digest: compensationDigest, inputDigest: the compensation's
             own input digest, compensationOf: { batchId, index } }`. The
             package MUST set `compensationOf` only on such a dispatch and
             MUST refuse a caller-supplied `ApprovalRef` that carries it
             (step 2, `ApprovalMismatch`). Steps 1 and 2 bind the
             reference to the approved compensating definition and to the
             input actually sent; the effective gate decides whether the
             approval of the batch covers the undo, as for any approval
             (BEH-CM-011), and the floor passes its `Allow` (BEH-CM-016).
             For a compensation, the floor MUST NOT call `draftFor`: where
             it withholds an `Allow`, it refuses with "tainted-session"
             and the item is listed in `notUndone`.
```

```
REQUIREMENT: When an `ApprovalRef` or a `BatchApprovalRef` carries
             `expected`, the package MUST run core `Draft.check` once,
             before any gate, with a reader that answers a key
             "bridger-command:<id>" with that command's current digest in
             the catalog (none when absent) and every other key with
             `CommandCatalogOptions.versions`. `Stale` MUST end the dispatch
             or batch with `CommandDraftStale { draftId, mismatches }` and
             run nothing; a draft with keys the package cannot read because
             `versions` is absent MUST be refused with `CommandRefused`
             reason "no-version-reader".
```

```
REQUIREMENT: The package MUST NOT re-plan a stale draft itself. Documentation
             MUST state, as core does (BEH-BR-316), that a check followed by
             an apply is not atomic: a handler or batch wrapper that must
             not apply over moved state re-checks the versions inside its
             own transaction.
```

Core gives drafts several requests and a check; this behaviour fixes how a
batch uses them. The approval binds every item's definition and input, the
versions the plan was made against are checked before anything runs, and a
stale draft is refused with the mismatches so that the proposer — a person,
or `@bridger/agent`'s loop ([tasks](../../agent/behaviors/02-tasks.md),
BEH-AG-012) — plans again and asks again.

**Settled here.** (1) The key "bridger-command:<id>" with the descriptor
digest as version is the expectation `@bridger/agent`'s draft source already
writes (BEH-AG-020); answering it from the catalog makes an approval for one
definition stale for another without any application code. (2) A refusal of
any item on re-dispatch refuses the batch: an approval of a plan does not
authorise a part of it. (3) An approver approves the compensating command
and that it will receive the item's input and output; the output is not
known when the plan is approved, so the approval binds the compensation's
definition, not its input value — as core's approver approves the undo of a
plan before it runs (BEH-BR-325).

## BEH-CM-052: A long command runs as a task

> **See:** [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md), [ADR-CM-001](../decisions/001-commands-are-contributions.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [22 — Attributable operations](../../core/behaviors/22-attributable-operations.md), [24 — Time, identifiers and sequence](../../core/behaviors/24-time-ids-and-sequence.md)

```ts
// illustrative — not type-checked
interface CommandTaskRef { readonly _tag: "CommandTaskRef"; readonly taskId: string; readonly command: string }

declare const Commands: {
  // For a command made with `long: true`, dispatch ends after step 6 with a task handle.
  dispatch<I, O, E>(command: Command<I, O, E, true>, input: unknown, options?: DispatchOptions):
    Effect.Effect<CommandTaskRef, DispatchError, CommandCatalog>
  // Runs any command as a task.
  start<I, O, E>(command: Command<I, O, E> | string, input: unknown, options?: DispatchOptions):
    Effect.Effect<CommandTaskRef, DispatchError, CommandCatalog>
  // By string id, the success type is `unknown`: a value, or a CommandTaskRef when the descriptor is `long`.
  dispatch(command: string, input: unknown, options?: DispatchOptions):
    Effect.Effect<unknown, DispatchError, CommandCatalog>
}

type CommandTaskSnapshot = {
  readonly taskId: string
  readonly command: string
  readonly digest: string
  readonly actor: Actor
  readonly correlationId: string
  readonly revision: number                // 0 at creation, +1 per change
  readonly updatedAt: number               // Clock, epoch ms
} & (
  | { readonly state: "running"; readonly progress?: { readonly done?: number; readonly total?: number; readonly note?: string } }
  | { readonly state: "done"; readonly output: Json }                                    // the encoded output
  | { readonly state: "failed"; readonly error: { readonly _tag: string; readonly message: string } }
  | { readonly state: "cancelled"; readonly by: Actor }
)
```

```
REQUIREMENT: `Command.make` MUST reject as a defect a spec with `long: true`
             and no `timeout`; `timeout` MAY then be "forever", stated.
             `Commands.dispatch` of a long command, and `Commands.start` of
             any command, MUST run steps 1–6 in the caller's fiber — so
             every error of those steps, a deferral included, reaches the
             caller as for a dispatch — and then MUST create the task in
             `running` with a `taskId` from the host's `IdGenerator`, fork
             steps 7 and 8 into the catalog layer's scope with the
             dispatch's served context, `CurrentCorrelation` and the
             dispatching fiber's plugin principal, unchanged (none when
             application code dispatched; core BEH-BR-257), and return
             the `CommandTaskRef`. The admissions that admitted at step 6
             MUST be settled in the task's fiber when the task ends, and
             their scopes MUST stay open until then (BEH-CM-044). With an idempotency key, the `taskId`
             MUST be taken before step 6 and sent in the claim, so that a
             repeat with the same key, actor, input and digest returns the
             same `CommandTaskRef`, running or terminal, and creates no
             task (BEH-CM-041).
```

```
REQUIREMENT: A caller that dispatches by string id MUST tell a task handle
             from a value by the descriptor's `long` field (BEH-CM-006),
             read from the same toolset or digest it dispatched against,
             and MUST NOT infer it from the shape of the result: an output
             may itself carry `_tag: "CommandTaskRef"`. The handle's
             runtime value MUST carry `_tag: "CommandTaskRef"`.
```

```
REQUIREMENT: The task's fiber MUST hold the contribution lease, apply the
             timeout, wrappers and receipt of steps 6–7, and publish the
             terminal snapshot when step 7 ends: `done` with the encoded
             output, `failed` with the error's tag and a message (never a
             cause), or `cancelled`. `done`, `failed` and `cancelled` MUST
             be terminal; `revision` MUST increase by one on each change
             and never regress.
```

```
REQUIREMENT: The task MUST NOT be tied to the activation that minted its
             fiber's principal: when that activation ends while the task
             runs, the task MUST keep running. A mutating host call, an
             access decision or `Plugin.Runtime.asSelf` that the handler,
             a wrapper or an admission's settlement makes in the task's
             fiber after then dies with `PrincipalRetired` (core
             BEH-BR-257); unless the handler recovers, the task MUST then
             end `failed` with error tag "PrincipalRetired", after its
             finalizers and the settlement of its admissions. A task that
             makes no such call is unaffected.
```

```
REQUIREMENT: The task table MUST be held through the `CommandTaskStore`
             port (BEH-CM-054), in memory in the catalog layer's scope by
             default. It MUST keep every running task and at most
             `tasks.retain` (default 1024) terminal tasks, forgetting the
             oldest first. When the layer's scope closes, running tasks
             MUST be interrupted, their finalizers awaited and their
             snapshots published as `cancelled` with `by: Actor.system`.
             The package MUST NOT describe a task's work as surviving the
             process: a fiber does not survive it, and BEH-CM-054 reports
             such a task as lost.
```

A caller that starts a long command keeps nothing open: the gate and the
hooks answered while it waited, and the work continues in the catalog's scope
under the same attribution, correlation, lease and timeout it would have had
in the caller's fiber. A handler does not know whether it runs as a task: the
same handler serves `dispatch` and `start`.

**Settled here.** (1) `long` is a property of the definition, digested, so a
caller and an approver know whether to expect a value or a handle, and a
caller by string id reads it from the descriptor it dispatched against. (2) The
lease is held by the task, so removing the plugin waits for running tasks
and revokes them at `drainTimeout` as for any dispatch (BEH-CM-013); a
revoked task ends `failed` with `LeaseRevoked`. (3) Interrupting the caller
after `start` returned does not cancel the task; cancellation is explicit
(BEH-CM-053).

## BEH-CM-053: Progress, await and cancel of a command task

> **See:** [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md)
> **Core seam:** [04 — States and snapshots](../../core/behaviors/04-states-and-snapshots.md), [24 — Time, identifiers and sequence](../../core/behaviors/24-time-ids-and-sequence.md)

```ts
// illustrative — not type-checked
class CommandTasks extends Context.Service<CommandTasks, {
  readonly get: (taskId: string) => Effect.Effect<CommandTaskSnapshot, CommandTaskNotFound>
  readonly list: (filter?: { readonly actorId?: string; readonly states?: ReadonlyArray<CommandTaskSnapshot["state"]> }) =>
    Effect.Effect<ReadonlyArray<CommandTaskSnapshot>>
  readonly changes: (taskId: string) => Stream.Stream<CommandTaskSnapshot, CommandTaskNotFound>
  readonly all: Stream.Stream<CommandTaskSnapshot>
  readonly await: (taskId: string, options?: { readonly timeout?: Duration.Input | "forever" }) =>   // default 30 seconds
    Effect.Effect<CommandTaskSnapshot, CommandTaskNotFound | CommandTaskAwaitTimeout>
  readonly cancel: (taskId: string, context?: OperationContext) => Effect.Effect<void, CommandTaskNotFound>
}>()("@bridger/command/CommandTasks") {}   // provided by CommandCatalog.layer

class CommandTaskNotFound extends Schema.TaggedError<CommandTaskNotFound>()("CommandTaskNotFound", { taskId: Schema.String }) {}
class CommandTaskAwaitTimeout extends Schema.TaggedError<CommandTaskAwaitTimeout>()("CommandTaskAwaitTimeout", {
  taskId: Schema.String, last: CommandTaskSnapshotSchema }) {}
```

```
REQUIREMENT: `HandlerContext.progress` (BEH-CM-003) MUST, in a task, publish
             a `running` snapshot with the reported values, at most one per
             handler call per `Clock` millisecond (later reports within the
             same millisecond replace the pending one), and MUST be a no-op
             outside a task or after the task is terminal. A report MUST
             NOT carry output values beyond the three fields.
```

```
REQUIREMENT: `changes` and `all` MUST be state feeds as core's `changes`:
             the current snapshot first, later snapshots after, a slow
             subscriber MAY skip revisions, revisions never regress, and
             `changes` ends after the terminal snapshot. `await` MUST
             complete with the first terminal snapshot, checking the current
             one first, and MUST fail after `timeout` with
             `CommandTaskAwaitTimeout { taskId, last }` leaving the task
             unaffected.
```

```
REQUIREMENT: `cancel` MUST interrupt the task's fiber, await its finalizers
             (releasing the lease and a fresh receipt claim), and only then
             publish `cancelled` with `by` the resolved actor of `context`
             (BEH-CM-010). Cancelling a terminal task MUST succeed and
             change nothing.
```

```
REQUIREMENT: The package MUST NOT decide who may read or cancel a task: the
             service is held by in-process code, which is trusted
             ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)).
             Adapters that expose tasks to other parties — the MCP tasks
             bridge, a herdr bridge, an HTTP endpoint — MUST filter by the
             requesting actor themselves (`@bridger/agent`,
             [tasks](../../agent/behaviors/02-tasks.md), BEH-AG-015).
```

`Tasks.await` in `@bridger/agent` waits for an agent run; `CommandTasks.await`
waits for any command started as a task, with the same rules, so that an
observer such as herdr's `wait` can be given either through one bridge.

**Settled here.** (1) The feed carries the encoded output of a `done` task:
whoever can read the task could have dispatched the command. (2) Progress is
rate-limited per millisecond of the host clock, so a handler reporting in a
tight loop cannot flood the feed, and a `TestClock` makes the rate
deterministic.

## BEH-CM-054: Task records are kept through a store port, and a task cut off by a restart is reported lost

> **See:** [ADR-CM-007](../decisions/007-batches-are-admitted-whole-and-undone-by-compensation.md)
> **Core seam:** [24 — Time, identifiers and sequence](../../core/behaviors/24-time-ids-and-sequence.md), [04 — States and snapshots](../../core/behaviors/04-states-and-snapshots.md)

```ts
// illustrative — not type-checked
// The port: supplied by the application in CommandCatalogOptions.tasks.store; default: in memory.
interface CommandTaskStore {
  readonly put: (record: CommandTaskRecord) => Effect.Effect<void, TaskStoreUnavailable>    // replaces by taskId
  readonly get: (taskId: string) => Effect.Effect<Option.Option<CommandTaskRecord>, TaskStoreUnavailable>
  readonly list: (filter: { readonly states?: ReadonlyArray<CommandTaskSnapshot["state"]>; readonly limit?: number }) =>
    Effect.Effect<ReadonlyArray<CommandTaskRecord>, TaskStoreUnavailable>
  readonly remove: (taskId: string) => Effect.Effect<void, TaskStoreUnavailable>
}
interface CommandTaskRecord {
  readonly snapshot: CommandTaskSnapshot
  readonly receipt?: ReceiptTicket          // the task's fresh receipt claim (06, BEH-CM-041), while running
}
class TaskStoreUnavailable extends Schema.TaggedError<TaskStoreUnavailable>()("TaskStoreUnavailable", { message: Schema.String }) {}
// CommandCatalogOptions.tasks becomes: { readonly retain?: number; readonly store?: CommandTaskStore }
// CommandTaskSnapshot "failed" gains the error tag "TaskLost" for a task found running at layer build.
```

```
REQUIREMENT: The catalog MUST write every snapshot it publishes for a task
             to the store with `put` before publishing it on the feeds,
             and MUST serve `CommandTasks.get` and `list` from the store.
             With no `tasks.store`, the package MUST use an in-memory store
             held in the catalog layer's scope. A `put` that fails MUST be
             logged at error level and MUST NOT change the task's outcome;
             the feeds still publish the snapshot.
```

```
REQUIREMENT: When the catalog layer is built, the package MUST read the
             store's `running` records: no fiber of this process runs
             them, so each MUST be completed as `failed` with `{ _tag:
             "TaskLost", message }`, written with `put` and published, and
             its `receipt`, when present, MUST be released with reason
             "TaskLost" (BEH-CM-041), so that a retry with the same key
             runs the command again. A store that fails at this read MUST
             fail the layer.
```

```
REQUIREMENT: The package MUST NOT resume, re-run or describe as resumed a
             task's work after a restart, and MUST NOT describe the
             in-memory store as surviving the process. Documentation MUST
             state that a persistent store keeps task records — state,
             progress, outcome — across a restart, and that whether a
             lost task's effects happened is the handler's and the
             wrappers' concern, as for a released receipt.
```

A caller that started an import, then lost its process or the host's, can
ask after a restart what became of it: done with its output, failed, or cut
off. That is what a store port gives, and it is all the package can give —
the handler's fiber ended with the process, and re-running half of an
import is a domain decision. Releasing the lost task's receipt makes the
caller's retry with the same key a fresh run, judged again by the gate.

**Settled here.** (1) Records, not execution: the store keeps what was
observed; resumption would need checkpoints inside handlers, which the
package does not define. (2) The in-memory default keeps v0.1 deployable
without a database; durability across a restart is the application's
choice of store.

**Open.** Resuming a task's work after a restart (handler checkpoints, or a
re-dispatch policy per command) is not specified; a candidate for a later
revision, possibly through `@bridger/durable-bus`.

---

_Previous: [06 — Receipts, wrappers and breakers](./06-receipts-wrappers-and-breakers.md)_
