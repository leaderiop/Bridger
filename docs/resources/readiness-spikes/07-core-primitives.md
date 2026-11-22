# Spike 07: core primitives and the 4.0.0 to 4.1.4 version gap

## 1. Purpose and scope

This area asks whether the Effect primitives that the Bridger host core needs behave as the spec assumes, and whether the existing host-core prototype (pinned to effect 4.0.0) can move to 4.1.4.

Bridger needs covered, with spec references (taken from `references/core`, `prototypes/host-core/RESULTS.md` and the task brief, not re-derived here):

- Lease semantics: drain, `DrainTimeout`, `force` that revokes holders with `LeaseRevoked`, per-call `LeaseTimeout` (BEH-BR-087), `useAll` all-or-nothing through the same drain path (BEH-BR-082, BEH-BR-083), and "child finalizers before lease release" on caller interruption (acceptance check 12 of BEH-BR-183, "BEH-BR-12 style" in the brief). Invariants INV-BR-006 (revoked callbacks versus interrupted holders), INV-BR-016 and INV-BR-017 (`WouldDeadlock`, `HeldPlugins`), INV-BR-030 (bounded cascade drain).
- Activation and deactivation: a fresh memo map per activation (acceptance check 16), a layer built in a scope that closes independently, finalizer order on stop (check 1, dependents first).
- Background fibers owned by a plugin and cleaned on removal (BEH-BR-034, BEH-BR-039 style cancellation).
- Host snapshot streaming and event delivery under slow subscribers.
- Per-tenant concurrency and request batching (inferred need from the ERP layer; no BEH number cited).
- Deterministic timeouts in tests.

Not in scope: cluster, SQL, HTTP, qadi and awthaq (other spike areas).

## 2. Environment and method

- Spikes workspace: `spikes/`, effect 4.1.4 (verified in `node_modules/effect/package.json` of the copy; the workspace root uses the same version per the brief), vitest 5.1.0 at the root. The host-core copy runs vitest 3.2.7.
- Run: from `spikes/`, `npx vitest run 07-core-primitives`. Observed final result: 7 files, 24 tests, all passing. `npx tsc --noEmit` at the spikes root reports no errors in `07-core-primitives` (one error in `pubsub.spike.test.ts` was fixed during the work).
- Method: characterization tests. Each test asserts what happened; orders are recorded in a `log` array and asserted exactly. Timing tests use `TestClock.layer()` from `effect/testing` and `TestClock.adjust`; scheduling is settled with six `Effect.yieldNow` calls.

File map (all under `spikes/07-core-primitives/`):

| File | Content |
|---|---|
| `refs.spike.test.ts` | SPK-07-01 to 03: ScopedRef, RcRef, RcMap, LayerMap |
| `lease.ts` | the minimal lease primitive (section 3.1) |
| `lease.spike.test.ts` | SPK-07-04 to 07: lease behaviour on TestClock |
| `scope.spike.test.ts` | SPK-07-08, 09: finalizer order, Scope.fork |
| `pubsub.spike.test.ts` | SPK-07-10 to 13: PubSub, SubscriptionRef, Queue |
| `layer.spike.test.ts` | SPK-07-14 to 17: memoization, fresh, ManagedRuntime, scope |
| `fibers.spike.test.ts` | SPK-07-18, 19: FiberSet, FiberHandle |
| `flow.spike.test.ts` | SPK-07-20 to 24: Stream, RequestResolver, semaphores |
| `RESULT.md` | verdict table |
| `host-core-4.1/` | copy of `prototypes/host-core` on effect 4.1.4, with its own `package.json` and `node_modules` (not part of the root vitest run, which only includes `*.spike.test.ts`) |

Source read for orientation (not run): `ScopedRef.set` implementation and `RcRef.make` doc comments in the effect source. Anything below marked "source" comes from there; everything marked "observed" comes from a test.

## 3. Findings

### 3.0 SPK-07-00: upgrade host-core from 4.0.0 to 4.1.4

Need: decide whether the prototype can move to 4.1.4.

Commands (observed), in `spikes/07-core-primitives/`:

1. `rsync -a --exclude node_modules --exclude package-lock.json ../../prototypes/host-core/ host-core-4.1/`
2. In `host-core-4.1`: change `"effect": "4.0.0"` to `"4.1.4"` in `package.json` (copy only; original untouched).
3. `npm install`, then `npm run check` (`tsc --noEmit`), then `npm test` (`vitest run`).

Observed: installed `effect` is 4.1.4. `tsc` produced no output (clean). After the config addition below, `vitest run` reported 32 test files and 340 tests passed. The original RESULTS.md reports 340 tests in 32 files on 4.0.0, so the counts match. No change was made in `src/` or `test/`. The error-log lines printed during `leases.test.ts` ("injected fault: stopFails") are deliberate fault injections, not failures.

The one addition: `host-core-4.1/vitest.config.ts` with `include: ["test/**/*.test.ts"]`. Without it, vitest 3.2.7 found the spikes root config (`**/*.spike.test.ts`) and printed "No test files found". This is a workspace artefact, not an Effect change.

Verdict: READY. Caveat: the 340 tests cover what the prototype covers (behaviours 01 to 21 and parts of P7, per its RESULTS.md); anything outside that is not evidence. I did not diff the 4.0.0 and 4.1.4 API surfaces beyond what compiling and running the prototype exercises.

### 3.1 The lease primitive (`lease.ts`)

Written for SPK-07-04 to 07. About 35 lines on Effect (Deferred, `Effect.raceFirst`, `Effect.timeoutOrElse`, `Effect.acquireUseRelease`).

State:
- `st.open: boolean` (admission gate), `st.holders: number`.
- `idle: Deferred<void>`, re-armed (`Deferred.makeUnsafe`) when the holder count goes 0 to 1 and completed when it returns to 0.
- `revoked: Deferred<void>`, a one-shot broadcast that is completed by `force`.

Errors (tagged): `LeaseClosed`, `LeaseRevoked`, `DrainTimeout({holders})`, `LeaseTimeout`.

Operations:
- `use(body, {timeout?})`: `acquireUseRelease`. Acquire: if closed fail `LeaseClosed`, else increment holders. Use: `Effect.raceFirst(body, Deferred.await(revoked) then fail LeaseRevoked)`, optionally wrapped in `timeoutOrElse` that fails `LeaseTimeout`. Release: decrement; at zero complete `idle`.
- `drain(timeout)`: set `open=false`; if no holders return, else await `idle`; the whole thing wrapped in `timeoutOrElse` that fails `DrainTimeout` carrying the holder count at that moment. A timed-out drain does not touch holders.
- `force`: set `open=false`, complete `revoked`, then await `idle`. So `force` returns only after every holder has unwound.
- `holders`: current count.

How the ordering works (observed, source-supported inference): the body runs as the loser or winner of `raceFirst`. When `revoked` wins, the body fiber is interrupted and `raceFirst` waits for its finalizers before `use` proceeds to release. When the calling fiber is interrupted, the same applies. Release (the decrement and `idle` signal) is therefore after the body's scoped children finalizers. Test SPK-07-06 asserts `["child-finalizer", "lease-released"]`; SPK-07-05 asserts `["child-finalizer", "force-returned"]`.

Not covered by `lease.ts`: `WouldDeadlock` detection and `HeldPlugins` (INV-BR-016, INV-BR-017), scoped leases inherited by fibers forked afterwards, `useAll` over several keys with all-or-nothing admission (BEH-BR-082, 083), per-plugin keying, realm in the key, `CurrentTransition`, reentrancy (a holder calling `drain` on its own lease would wait forever, not tested), and admission racing with `force` beyond the simple flag. A caller who is revoked sees a typed `LeaseRevoked` failure; the spec's distinction in INV-BR-006 between "revoked callbacks" and "interrupted holders" is only approximated (inference: here both look like interruption of the body fiber, the caller sees a typed error).

A bug of mine worth recording: the first version used a one-shot `idle` Deferred never re-armed, so a later drain returned immediately and the ordering test failed with `["lease-released","child-finalizer"]`. I first suspected `raceFirst` and tested it separately: `raceFirst` does await the interrupted loser's finalizers (a standalone probe with a 10 ms finalizer logged `fin` before `rel`). The cause was my code, fixed by re-arming.

### 3.2 SPK-07-01: ScopedRef.set versus a reader on the old value

Need: lease drain, where a reader on the old value should keep it alive until done.
Test: `refs.spike.test.ts`, "SPK-07-01". A reader fiber gets the value via `ScopedRef.get`, signals, and waits on a Deferred. Main fiber calls `ScopedRef.set` with a new resource.
Observed log, exact: `acquire:A, reader-got:A, acquire:B, release:A, set-returned, reader-done-using:A, release:B`. So the new value is acquired before the old is released (make-before-break), and `set` releases the old scope without waiting for the reader.
Source: `set` forks a generation scope, acquires, closes the previous scope, then swaps; no reader accounting.
Verdict: GAP for use as a lease. Caveat: values are not revoked or interrupted, they are just finalized under the reader. (Inference: a reader holding a pooled connection would use a closed connection.)

### 3.3 SPK-07-02: RcRef

Test: "SPK-07-02". (a) Borrow in a scope, `RcRef.invalidate`, then close the borrower scope. (b) Borrow, then close the owner scope while the borrower scope is open.
Observed (a): `acquire:R1, invalidated, release:R1, borrower-closed`. Note that `release:R1` is logged between `invalidated` and `borrower-closed`, which is the close of the borrower scope that triggers it. The release happens at the borrower close, not at `invalidate`. (b): `acquire:R2, release:R2, owner-closed-borrower-still-open`: the owner close releases the resource while the borrower scope is still open.
Verdict: PARTIAL. Refcount gives drain without a budget and without force; owner close revokes under borrowers silently. No interruption of the borrower in either case.

### 3.4 SPK-07-03: RcMap and LayerMap

Test: "SPK-07-03". RcMap `invalidate` with a live borrower, then borrower close; then a LayerMap entry built in a borrower scope, owner scope closed first.
Observed: `acquire:p1, rcmap-invalidated, release:p1, rcmap-borrower-closed, acquire:L-t1, release:L-t1, owner-closed-layermap-borrower-open`.
Verdict: PARTIAL, same as RcRef. Caveat: I did not test `idleTimeToLive` or `capacity` eviction with a borrower (docs say finite TTL release is forked and not awaited by the releasing scope; source comment only).

### 3.5 SPK-07-04: drain

Test: `lease.spike.test.ts`, "SPK-07-04". Holder blocks on a Deferred; `drain("1 second")` is forked; a late `use` is attempted; holder is released.
Observed: late `use` fails with `LeaseClosed`; log `["holder-done", "drained"]`; holders back to 0.
Verdict: READY with custom code (3.1).

### 3.6 SPK-07-05: DrainTimeout then force

Test: "SPK-07-05 (TestClock)". Holder runs a scoped body with a finalizer and `Effect.never`. `drain("10 seconds")` forked.
Observed: after `TestClock.adjust("9 seconds")` the drain fiber is not done; after one more second it fails with `DrainTimeout`; holders still 1. Then `force`: holder exits with `LeaseRevoked`, holders 0; log `["child-finalizer", "force-returned"]`.
Verdict: READY with custom code. Caveat: the budget is exact on TestClock; real-time scheduling jitter not measured.

### 3.7 SPK-07-06: LeaseTimeout and interruption order

Test: "SPK-07-06 (TestClock)". `use(never, {timeout:"5 seconds"})` then adjust 5 s: fails with `LeaseTimeout`, holders 0. Then a holder with a scoped child finalizer is interrupted while a drain waits.
Observed: log `["child-finalizer", "lease-released"]`.
Verdict: READY.

### 3.8 SPK-07-07: Semaphore and Latch alone

Test: "SPK-07-07" is a documentation test that only asserts `Layer` is defined; it observes nothing. The conclusion (no budgeted drain, no typed revoke from Semaphore alone) is my inference from building `lease.ts` out of Deferred and `raceFirst` instead, not a measured negative. Verdict: GAP, with the lowest confidence of the set. A reviewer may prefer to downgrade this row to "not tested".

### 3.9 SPK-07-08: finalizer order

Test: `scope.spike.test.ts`. Observed: sequential scope with a, b, c gives `c, b, a`; parallel scope with finalizers of 30 ms and 1 ms completes `fast, slow`. Verdict: READY.

### 3.10 SPK-07-09: Scope.fork

Observed log: `child2, --parent-close--, parent-last-registered, child, parent-first-registered`. A child forked between two parent finalizers closes at its LIFO position in the parent; a child closed alone leaves the parent working. Verdict: READY. Caveat: the "parent close order of children" is by registration position, which may differ from a mental model of "children first".

### 3.11 SPK-07-10: PubSub strategies

Observed: bounded(2): the third publish suspended (poll undefined) until a take, then `takeAll` gave `[2,3]`. dropping(2): publish results `[true,true,false]`, subscriber got `[1,2]` (newest dropped). sliding(2): 1..4 published, subscriber got `[3,4]`. Verdict: PARTIAL, a choice per stream is needed.

### 3.12 SPK-07-11: slow subscriber isolation

Observed: bounded(1) with two subscribers: publish of 2 blocked; the fast subscriber taking 1 did not unblock it; it unblocked only after the slow subscriber took. Sliding(1): publish never blocked; both subscribers read 2. Verdict: PARTIAL; one slow plugin can stall a bounded host bus.

### 3.13 SPK-07-12: SubscriptionRef.changes

Observed with a 5 ms-per-item consumer and updates 1..4 set in a burst: `seen = [0,1,2,3,4]`; a late subscriber got `[4]`. Source: the pubsub is unbounded with `replay: 1`. So the stream emits the current value first, delivers every update, and is not latest-wins; memory grows with a stalled consumer (inference from "unbounded"). Verdict: READY for completeness; coalescing is not built in.

### 3.14 SPK-07-13: Queue

Observed: dropping(1) offers `[true,false]`; sliding(2) after 1..3 `takeAll` gives `[2,3]`; bounded offer suspends until a take; after `Queue.end`, `Stream.fromQueue` yields the remaining `[2]`. Verdict: READY.

### 3.15 SPK-07-14: Layer memoization

Observed: a Db layer shared by Api and Other built once (`["db-up","db-down"]`, both see id 1). With `Layer.fresh(db)` for one branch: two `db-up`, ids differ. `provideMerge` output exposes both Db and Api. Verdict: READY.

### 3.16 SPK-07-15: memo map per activation

Observed: two `Layer.buildWithScope` calls with default memo maps gave ids 1 and 2. With a shared `Layer.makeMemoMap`, both scopes saw the same instance; closing the first logged nothing more (`["db-up"]`), closing the second logged `db-down`. Verdict: READY. Caveat: this answers "fresh memo map per activation" only for the default build path; the prototype's own use is covered by its 340 tests.

### 3.17 SPK-07-16: ManagedRuntime

Observed: a failing layer: two `runPromiseExit` calls both failed and the acquire ran once (`tries === 1`), so failure is cached. A good runtime: `dispose` logged `["db-up","db-down"]`; a later run returned a failure whose cause is a `Die` with defect "ManagedRuntime disposed", and the layer was not rebuilt. Verdict: PARTIAL.

### 3.18 SPK-07-17: independent scope

Observed: `["up:A","up:B","down:A","A-deactivated","down:B"]`. Verdict: READY.

### 3.19 SPK-07-18: FiberSet

Observed: two background fibers with 5 ms interrupt finalizers; `Scope.close` of the owner returned only after both ran (log `fin:a, fin:b` in either order, then `scope-closed`). A failing fiber made `FiberSet.join` fail. Verdict: READY.

### 3.20 SPK-07-19: FiberHandle

Observed: `run` v2 over v1 logged `fin:v1` and did not fail anything; `onlyIfMissing: true` did not start v3 (no log), v2's fiber still running; scope close logged `fin:v2`. Verdict: READY.

### 3.21 SPK-07-20: Stream backpressure

Observed: with `rechunk(1)` and a consumer that never finishes, the producer had produced at most 2 elements without buffer; with `Stream.buffer({capacity:4})` it produced more than that and fewer than 20 (observed 9 in one run). `rechunk(3)` on 1..7 gave chunk sizes `[3,3,1]`. Verdict: READY. Caveat: the exact run-ahead count is not a stable contract; I asserted only a range.

### 3.22 SPK-07-21: RequestResolver batching

Observed: three concurrent `Effect.request` calls produced one resolver call `[1,2,3]`; a later sequential request for id 1 produced a second call `[1]` (no cache). Verdict: READY. The title says de-duplication of equal ids is not implied; no test of duplicate ids was run.

### 3.23 SPK-07-22: resolver cache expiry

Observed on TestClock: `RequestResolver.asCache(resolver, {capacity:10})` returned the same value after `adjust("365 days")`; with `timeToLive: () => "1 minute"` the value changed after 2 minutes. Verdict: PARTIAL.

### 3.24 SPK-07-23: Semaphore

Observed: permits 1, four tasks with `withPermits(1)`: order `[1,2,3,4]`, max concurrency 1. Verdict: READY.

### 3.25 SPK-07-24: PartitionedSemaphore

Observed: permits 1, one noisy holder, then noisy 1 to 4 and quiet 1 queued: `quiet1` ran at an index below 4 (not last). The exact order was not recorded in the assertion. Total permits are shared; there is no per-partition cap. Verdict: PARTIAL.

### 3.26 SPK-07-25: TestClock-driven timeouts

Covered by 3.6, 3.7, 3.23: `TestClock.layer()` plus `adjust` made DrainTimeout, LeaseTimeout and TTL deterministic with no real waiting. Verdict: READY. Note that tests with real `Effect.sleep` (3.19, 3.21, 3.22 resolver) use short real sleeps and are timing-dependent in principle.

## 4. Surprises and gotchas

- Vitest resolves the nearest ancestor config; a nested project without its own config silently picks up the parent's include pattern.
- `Effect.repeatN` does not exist in this version; `Effect.forEach` over an array with `yieldNow` was used to settle fibers.
- Services are yieldable directly (`yield* Db`, `Effect.map(Db, ...)`); `Db.asEffect()` is not a function.
- `Queue.end` needs a queue typed with `Cause.Done` as error; a plain `Queue.bounded<number>` fails type checking.
- `ScopedRef.set` is make-before-break and does not wait for readers.
- `RcRef`/`RcMap`/`LayerMap` owner close releases under borrowers without signalling them.
- `SubscriptionRef.changes` is unbounded; a stalled consumer grows memory (inference from `replay:1` unbounded pubsub in source).
- `ManagedRuntime` caches failed builds and reports use after dispose as a defect, not a typed error.
- A one-shot Deferred used as an idle signal must be re-armed; mine was not and produced a plausible but wrong ordering result.
- Bounded PubSub: one slow subscriber stalls the publisher and every other subscriber.

## 5. Missing pieces

Product Lease module (bridger-code). Sketch from `lease.ts`: per-plugin keyed registry of leases; each holds `open`, a holder set (not just a count) keyed by fiber and by plugin `JSON.stringify([realm,id])` (the canonical key INV-BR-016 names); `use` adds the current plugin to a `HeldPlugins` set in a Context/FiberRef for the scope of the body so forked fibers inherit it; `use` checks `HeldPlugins` against the target's removal set and fails `WouldDeadlock` before waiting; `useAll(keys)` takes leases in a canonical order and releases all on any failure; `drain`/`force` as in `lease.ts`, with the timeout taken from `drainTimeout`. The prototype `host-core/src` already contains an implementation of these on 4.0.0; it is the reference to port from.

Latest-wins snapshot coalescer (bridger-code): wrap `SubscriptionRef.changes` in `Stream.buffer({capacity:1, strategy:"sliding"})` per subscriber. Not run in a test; inference from the `buffer` signature that accepts `"sliding"` (source) and the sliding behaviour observed on PubSub and Queue.

Per-tenant cap (bridger-code): a `Map<tenant, Semaphore(cap)>` inside a `PartitionedSemaphore.withPermits`, so fairness comes from the partitioned semaphore and the cap from the per-tenant one. Not built or tested; the ordering of acquisition (cap first, then shared) would need a deadlock-free choice.

Typed handling of runtime-disposed defect (bridger-code): map `Die("ManagedRuntime disposed")` to a host error at the boundary.

## 6. Fix and improve list by owner

bridger-code
- must: port the lease from host-core into the product module, including `WouldDeadlock`, `HeldPlugins`, `useAll` (SPK-07-04, 05, 07).
- must: bump the effect pin to 4.1.4 (SPK-07-00).
- must: do not use `ScopedRef`, `RcRef`, `RcMap`, `LayerMap` as leases; wrap borrowed values in the lease (SPK-07-01 to 03).
- must: never share a `MemoMap` across plugin activations (SPK-07-15).
- should: set explicit `timeToLive` on any resolver cache (SPK-07-22).
- should: plugin retry builds a new runtime or scope; map the dispose defect (SPK-07-16).
- should: latest-wins coalescer for snapshot streams (SPK-07-12).
- should: per-tenant cap on top of `PartitionedSemaphore` (SPK-07-24).
- nice: keep `host-core-4.1` vitest config note in any CI copy (SPK-07-00).

bridger-spec
- must: choose sliding or dropping for the host bus; forbid bounded with unbounded subscribers (SPK-07-10, 11).
- should: state that revocation of a holder is interruption of its body with a typed error to the caller, so implementers do not rely on the lease being "released first" (SPK-07-05).
- should: state the ScopedRef/RcRef semantics are not lease semantics (SPK-07-01 to 03).

effect-upstream
- nice: document that `ScopedRef.set` does not wait for readers, and that `ManagedRuntime` reports use after dispose as a defect (SPK-07-01, 16). No bug claimed.

qadi, awthaq: nothing from this area.

## 7. Not verified

- Differences between 4.0.0 and 4.1.4 outside what the prototype exercises. Would need an API diff of the two package versions.
- `WouldDeadlock`, `HeldPlugins`, inherited scoped leases, `useAll` in `lease.ts`. Would need extending the primitive or running the prototype's `leases.test.ts` against the product module.
- Behaviour under real concurrency and load (many holders, force racing admission). Would need property or stress tests.
- `RcMap` TTL and capacity eviction with borrowers; LayerMap `idleTimeToLive`.
- Request de-duplication of equal ids; PartitionedSemaphore exact order and permit sizes above 1.
- `SubscriptionRef` memory growth with a stalled consumer (inferred, not measured).
- SPK-07-07 negative claim about Semaphore/Latch (see 3.8).
- Memory and timing of `Stream.buffer` run-ahead beyond the asserted range.

## 8. Reproduction notes

- Spikes: `cd spikes && npx vitest run 07-core-primitives` (24 tests expected). Type check: `npx tsc --noEmit` from `spikes/`, filtered for `07-core-primitives` (the root check also compiles the files in `host-core-4.1/`, whose own `node_modules` hold effect 4.1.4; no errors were reported there).
- Host-core copy: `cd spikes/07-core-primitives/host-core-4.1 && npm install && npm run check && npm test` (expect clean tsc, 32 files, 340 tests). `npm install` printed an audit notice and an esbuild install-script notice; neither affected the run.
- TestClock usage: `Effect.provide(TestClock.layer())` on the effect, then `TestClock.adjust(duration)` followed by a settle of yields.
- Tests using real sleeps: SPK-07-18 (5 ms), SPK-07-12 (5 ms per item), SPK-07-20 (20 ms), SPK-07-23 (1 ms), SPK-07-24 (20 ms). Rerun if flaky on a loaded machine.
