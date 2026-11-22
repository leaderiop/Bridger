# ClusterCron and durable workflows

All modules unstable (Effect 4.1.4). Workflow modules live in the separate `effect/workflow` group (not `cluster`). Back to [README](README.md).

## ClusterCron (`cluster/ClusterCron`)

Turns a `Cron` schedule into a `Layer` coordinating one recurring job across the cluster. A singleton handles initial scheduling; each run is a persisted entity message, so schedules survive restarts and run on one owner.

```ts
ClusterCron.make<E, R>(options: {
  cron: Cron
  execute: Effect<void, E, R>
  name: string
  calculateNextRunFromPrevious?: boolean
  shardGroup?: string
  skipIfOlderThan?: Input        // Input type not defined on the page
}): Layer<never, never, Sharding | Exclude<R, CurrentScheduledTime | Scope>>
```
- With `calculateNextRunFromPrevious`, one entity per job processes every run: no overlap, caught up in order.
- `CurrentScheduledTime` — service whose value is the `Utc` the current run was scheduled for; read it inside `execute`.
- Not documented: how missed runs are replayed, the exact meaning of `skipIfOlderThan`.
- Do not apply `MessageRetention` to the cron entity (it relies on stored replies).

## ClusterWorkflowEngine (`cluster/ClusterWorkflowEngine`)

Adapts `WorkflowEngine` so executions, activities, deferred completions, resumes, interrupts and durable-clock wakeups persist as cluster entity messages. `layer: Layer<WorkflowEngine, never, Sharding | MessageStorage>`; also registers the durable-clock entity. `make` exposes the engine methods listed under WorkflowEngine below.

## Workflow (`workflow/Workflow`) — page truncated, see README

Typed durable workflow: stable tag, payload/success/error schemas, idempotency key → deterministic execution id.
- `make(tag, { payload, success?, error?, idempotencyKey, suspendedRetrySchedule?, annotations? })`
- Instance API: `execute(payload, { detached?, discard? })` (`discard: true` returns the execution id), `executionId`, `idempotencyKey`, `poll`, `resume`, `interrupt`, `toLayer(execute)`, `annotate`, `annotateMerge`.
- `Result<A, E> = Complete<A, E> | Suspended` *(summary)*.
- `intoResult(effect)` — run as a workflow execution and capture the outcome as a `Result` (handles suspension, defects, interruption, scope finalization).
- `withCompensation(compensation)` — saga-style rollback, runs if the whole workflow later fails; **top-level effects only, not nested activities**.
- Annotations *(summary)*: `CaptureDefects` (default true), `SuspendOnFailure`.
- Resources *(summary)*: `scope` closes only when the whole execution completes; `addFinalizer` is skipped when a cluster owner abandons a run for replay, but scope finalizers still run.

## Activity (`workflow/Activity`)

Named effect with success/error schemas; the engine stores its result and replays it on later runs.
- `make({ name, execute, success?, error?, annotations?, interruptRetryPolicy? })`
- `retry` — like `Effect.retry`, updates `CurrentAttempt` (Reference, default 1).
- `idempotencyKey(name, { includeAttempt? })` — deterministic from execution id + name (+ attempt).
- `raceAll(name, [a, b])` — durable race, first completed result wins (return-type text on the page uses unresolved placeholders; check source).
- **Only completed results are memoized. If an activity suspends (child workflow, durable clock), its body re-runs on replay — side effects before the suspension can repeat; make them idempotent.**

## DurableClock (`workflow/DurableClock`)

- `make({ name, duration })`; `sleep({ name, duration, inMemoryThreshold? })` — zero durations ignored; durations ≤ threshold run as an in-memory activity; longer ones are scheduled via `WorkflowEngine` and awaited through the clock's durable deferred.
- `InMemoryThreshold` Reference (since 4.1.3). Engines with always-durable timers (e.g. a Cloudflare Durable Object engine) provide `Duration.zero`. Default when unprovided is not stated.

## DurableDeferred (`workflow/DurableDeferred`) — page truncated, see README

Named wait point: the workflow awaits it, suspends if no result exists, resumes once one is recorded. A `Token` (workflow name + execution id + deferred name) lets external code complete the right wait point.
- Verbatim: `make(name, { success?, error? })`, `token`, `tokenFromExecutionId({ executionId, workflow })`, `done({ exit, token })`, `succeed`, `fail`, `failCause`, `into(effect)`.
- `into` runs an effect and records its Exit into the deferred; the effect plus the write count as one in-flight activity, so parked sibling branches don't suspend the run meanwhile. Completing a deferred the run is waiting on still interrupts and replays it.
- *(summary)* `tokenFromPayload`, `Token` (branded string), `TokenParsed` (`deferredName`, `executionId`, `workflowName`), an await function (exact export name unverified — `await` is reserved), `raceAll` (different shape from `Activity.raceAll`).

## DurableQueue (`workflow/DurableQueue`)

Hands work to persisted background workers and resumes the waiting workflow with the result.
- `make({ name, payload, idempotencyKey, success?, error? })`
- `process(queue, payload, { retrySchedule? })` — offers the item to a named `PersistedQueue`, attaches a deferred token, suspends. Needs `WorkflowEngine`, `WorkflowInstance`, `PersistedQueue.PersistedQueueFactory`.
- `makeWorker(queue, handler, { concurrency? })` (an Effect) and `worker(...)` (a Layer).
- **At-least-once** — handlers must be idempotent.
- **Dead-lettering:** after an item exhausts its persisted-queue attempts its deferred never resolves; the workflow stays parked until the item is requeued out of band. Id-based dedupe stops replays from bringing it back.
- Run `PersistedQueue.layerCleanup` in one instance to prune completed items.
- The page's example only checks that the worker values are layers; it doesn't demonstrate real processing.

## WorkflowEngine (`workflow/WorkflowEngine`)

Service that registers handlers, runs executions, polls results, resumes suspended runs, executes activities, stores deferred results, schedules clocks.
- Methods: `register`, `execute`, `poll`, `resume`, `interrupt`, `interruptUnsafe`, `activityExecute`, `deferredResult`, `deferredDone`, `scheduleClock`.
- `makeUnsafe(encoded)` builds the typed service from a low-level `Encoded` implementation — the implementation must correctly persist/resume/encode state.
- `layerMemory` — in-memory, **tests/local only, not durable**.
- `WorkflowInstance` — per-run state (`executionId`, `suspended`, `interrupted`, `abandoned`, `activityState`, `awaitedDeferreds`, `completedDeferreds`, `scope`, …). `DeferredState` shares deferred state across engines.
