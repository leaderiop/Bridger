// Throwaway prototype: confirms, against the real effect@4.0.0 runtime, the
// Effect API assumptions that references/core/ records as open (URS §7 G2–G4)
// and the other Effect behaviours the specification relies on.
// Not product code. Each experiment returns PASS/FAIL with the observation.
import { Context, Effect, Exit, Fiber, Layer, ManagedRuntime, PubSub, Schema, Scope, Stream, SubscriptionRef } from "effect"

type Result = { readonly id: string; readonly claim: string; readonly pass: boolean; readonly observed: string }
const results: Array<Result> = []
const record = (id: string, claim: string, pass: boolean, observed: string) =>
  Effect.sync(() => { results.push({ id, claim, pass, observed }) })

// ---------------------------------------------------------------- E1 (G2)
// Sliding PubSub: is lag per subscriber? Does a slow subscriber affect a fast one?
const e1 = Effect.scoped(Effect.gen(function* () {
  const pubsub = yield* PubSub.sliding<number>(4)
  const fast = yield* PubSub.subscribe(pubsub)
  const slow = yield* PubSub.subscribe(pubsub)
  const fastSeen: Array<number> = []
  for (let i = 1; i <= 10; i++) {
    yield* PubSub.publish(pubsub, i)            // must never block (sliding)
    fastSeen.push(...(yield* PubSub.takeUpTo(fast, 100)))   // fast drains after every publish
  }
  const slowSeen = yield* PubSub.takeUpTo(slow, 100)
  yield* record("E1a", "A fast subscriber that keeps up receives every message despite a slow one",
    fastSeen.join(",") === "1,2,3,4,5,6,7,8,9,10", `fast received [${fastSeen.join(",")}]`)
  yield* record("E1b", "A slow subscriber loses the oldest messages and keeps the latest `capacity`",
    slowSeen.join(",") === "7,8,9,10", `slow received [${slowSeen.join(",")}]`)
  yield* record("E1c", "Publishing never blocks on a slow subscriber (sliding strategy)", true,
    "10 publishes completed with an undrained subscriber")
}))

// ---------------------------------------------------------------- E2 (G3)
class Alpha extends Context.Service<Alpha, { readonly a: number }>()("proto/Alpha") {}
class Beta extends Context.Service<Beta, { readonly b: string }>()("proto/Beta") {}
const e2 = Effect.gen(function* () {
  let released = 0
  const layer = Layer.effectContext(Effect.gen(function* () {
    yield* Effect.acquireRelease(Effect.void, () => Effect.sync(() => { released++ }))
    return Context.make(Alpha, { a: 1 }).pipe(Context.add(Beta, { b: "two" }))
  }))
  const scope = yield* Scope.make()
  const ctx = yield* Layer.buildWithScope(layer, scope)
  const both = Context.get(ctx, Alpha).a === 1 && Context.get(ctx, Beta).b === "two"
  const beforeClose = released
  yield* Scope.close(scope, Exit.void)
  yield* record("E2a", "Layer.effectContext exists and builds a Layer providing several services from one Context",
    both, `Alpha.a=${Context.get(ctx, Alpha).a}, Beta.b=${Context.get(ctx, Beta).b}`)
  yield* record("E2b", "Scoped resources acquired in an effectContext layer are released when the build scope closes",
    beforeClose === 0 && released === 1, `released before close=${beforeClose}, after close=${released}`)
})

// ---------------------------------------------------------------- E3 (G4)
const e3 = Effect.promise(async () => {
  let builds = 0
  let released = 0
  const layer = Layer.effect(Alpha, Effect.acquireRelease(
    Effect.sync(() => { builds++; return { a: 42 } }),
    () => Effect.sync(() => { released++ })))
  const runtime = ManagedRuntime.make(layer)
  const lazy = builds === 0
  const ctx = await runtime.context()                       // forces the build, runs no program effect
  const forced = builds === 1 && Context.get(ctx, Alpha).a === 42
  await runtime.runPromise(Effect.void)
  const cached = builds === 1
  await runtime.dispose()
  const disposed = released === 1
  let rejected = "no"
  const failing = ManagedRuntime.make(Layer.effect(Beta, Effect.fail("boom")))
  await failing.context().then(() => { rejected = "resolved" }, () => { rejected = "rejected" })
  await failing.dispose()
  return { lazy, forced, cached, disposed, rejected, builds, released }
}).pipe(Effect.flatMap((r) => Effect.all([
  record("E3a", "ManagedRuntime builds lazily (nothing built at make)", r.lazy, `builds after make=${r.lazy ? 0 : "≥1"}`),
  record("E3b", "runtime.context() forces the layer build without running an effect", r.forced, `builds after context()=${r.builds}`),
  record("E3c", "The built context is cached for later runs", r.cached, `builds after runPromise=${r.builds}`),
  record("E3d", "dispose() releases the layer's resources", r.disposed, `released=${r.released}`),
  record("E3e", "A failing layer makes context() reject (startup failure is observable before use)", r.rejected === "rejected", `context() ${r.rejected}`),
])))

// ---------------------------------------------------------------- E4 memo maps and forked scopes
const e4 = Effect.gen(function* () {
  let builds = 0
  const layer = Layer.effect(Alpha, Effect.sync(() => { builds++; return { a: builds } }))
  const host = yield* Scope.make()
  const shared = yield* Layer.makeMemoMap
  const s1 = yield* Scope.fork(host, "sequential")
  yield* Layer.buildWithMemoMap(layer, shared, s1)
  const s2 = yield* Scope.fork(host, "sequential")
  yield* Layer.buildWithMemoMap(layer, shared, s2)
  const sharedBuilds = builds
  builds = 0
  for (let i = 0; i < 2; i++) {
    const s = yield* Scope.fork(host, "sequential")
    yield* Layer.buildWithMemoMap(layer, yield* Layer.makeMemoMap, s)
  }
  const freshBuilds = builds
  let childClosed = false
  const child = yield* Scope.fork(host, "sequential")
  yield* Scope.addFinalizer(child, Effect.sync(() => { childClosed = true }))
  yield* Scope.close(host, Exit.void)
  yield* record("E4a", "Reusing one MemoMap across activations reuses the first build (the trap the spec avoids)",
    sharedBuilds === 1, `builds with a shared memo map across two activations=${sharedBuilds}`)
  yield* record("E4b", "A fresh MemoMap per activation rebuilds the layer every time",
    freshBuilds === 2, `builds with fresh memo maps=${freshBuilds}`)
  yield* record("E4c", "Closing the host scope closes activation scopes forked from it", childClosed, `child finalizer ran=${childClosed}`)
})

// ---------------------------------------------------------------- E5 SubscriptionRef.changes
const e5 = Effect.gen(function* () {
  const ref = yield* SubscriptionRef.make(0)
  yield* SubscriptionRef.set(ref, 1)
  const first = yield* Stream.runHead(SubscriptionRef.changes(ref))
  const fiber = yield* Effect.forkChild(Stream.runCollect(Stream.take(SubscriptionRef.changes(ref), 3)))
  yield* Effect.sleep("10 millis")
  yield* SubscriptionRef.set(ref, 2)
  yield* SubscriptionRef.set(ref, 3)
  const seen = yield* Fiber.join(fiber)
  const arr = Array.from(seen)
  yield* record("E5a", "SubscriptionRef.changes emits the current value first", String(first) === "Some(1)" || JSON.stringify(first).includes("1"),
    `head of changes after set(1)=${JSON.stringify(first)}`)
  yield* record("E5b", "A subscriber sees the current value then later changes, without a gap", arr.join(",") === "1,2,3", `collected [${arr.join(",")}]`)
})

// ---------------------------------------------------------------- E6 Context.Reference
const Held = Context.Reference<ReadonlySet<string>>("proto/HeldPlugins", { defaultValue: () => new Set<string>() })
const e6 = Effect.gen(function* () {
  const dflt = yield* Held
  const inherited = yield* Effect.gen(function* () {
    const f = yield* Effect.forkChild(Effect.gen(function* () { return yield* Held }))
    return yield* Fiber.join(f)
  }).pipe(Effect.provideService(Held, new Set(["example/audit"])))
  yield* record("E6a", "A Context.Reference yields its default when not provided", dflt.size === 0, `default size=${dflt.size}`)
  yield* record("E6b", "A forked child fiber inherits the provided reference (re-entrancy detection relies on this)",
    inherited.has("example/audit"), `child saw [${Array.from(inherited).join(",")}]`)
})

// ---------------------------------------------------------------- E7 supervised child: caller interruption
// The spec (BEH-BR-084) requires: interrupting the caller interrupts the child, awaits its finalizers,
// and only then releases the lease. Two implementations of `use` are compared.
const runUse = (variant: "naive" | "awaited") => Effect.gen(function* () {
  const log: Array<string> = []
  const use = (run: Effect.Effect<void>) => Effect.acquireUseRelease(
    Effect.sync(() => { log.push("lease-acquired") }),
    () => Effect.gen(function* () {
      const child = yield* Effect.forkChild(run)
      return variant === "naive"
        ? yield* Fiber.join(child)
        // interrupt the child and wait for it (Fiber.interrupt awaits) before the release step runs
        : yield* Fiber.join(child).pipe(Effect.onInterrupt(() => Fiber.interrupt(child)))
    }),
    () => Effect.sync(() => { log.push("lease-released") }))
  const callback = Effect.acquireRelease(Effect.void, () => Effect.sync(() => { log.push("child-finalizer") })).pipe(
    Effect.flatMap(() => Effect.never), Effect.scoped)
  const caller = yield* Effect.forkChild(use(callback))
  yield* Effect.sleep("10 millis")
  yield* Fiber.interrupt(caller)
  yield* Effect.sleep("10 millis")
  return log
})
const e7 = Effect.gen(function* () {
  const naive = yield* runUse("naive")
  const awaited = yield* runUse("awaited")
  const ok = (log: Array<string>) => log.indexOf("child-finalizer") >= 0 && log.indexOf("lease-released") > log.indexOf("child-finalizer")
  yield* record("E7a", "FINDING: forkChild + join alone releases the lease BEFORE the child's finalizers run (so it does not meet BEH-BR-084)",
    !ok(naive), naive.join(" → "))
  yield* record("E7b", "Interrupting and awaiting the child on caller interruption releases the lease only after the child's finalizers",
    ok(awaited), awaited.join(" → "))
  const timed = yield* Effect.never.pipe(Effect.timeoutOrElse({ duration: "5 millis", orElse: () => Effect.succeed("timed-out") }))
  yield* record("E7c", "Effect.timeoutOrElse({ duration, orElse }) maps an overrun to a chosen result (LeaseTimeout mapping)", timed === "timed-out", `result=${timed}`)
})

// ---------------------------------------------------------------- E8 Schema.TaggedError
class DrainTimeout extends Schema.TaggedError<DrainTimeout>()("DrainTimeout", { id: Schema.String, leases: Schema.Number }) {}
class HostClosed extends Schema.TaggedError<HostClosed>()("HostClosed", {}) {}
const e8 = Effect.gen(function* () {
  const failing: Effect.Effect<string, DrainTimeout | HostClosed> = Effect.fail(new DrainTimeout({ id: "example/logger", leases: 2 }))
  const handled = yield* failing.pipe(Effect.catchTag("DrainTimeout", (e) => Effect.succeed(`${e._tag}:${e.id}:${e.leases}`)), Effect.orElseSucceed(() => "other"))
  yield* record("E8a", "Schema.TaggedError errors carry _tag and fields and are narrowed by catchTag", handled === "DrainTimeout:example/logger:2", `handled=${handled}`)
})

// ---------------------------------------------------------------- E9 Context.Service key identity
const e9 = Effect.gen(function* () {
  class LoggerA extends Context.Service<LoggerA, { readonly n: number }>()("proto/Logger") {}
  class LoggerB extends Context.Service<LoggerB, { readonly n: number }>()("proto/Logger") {}  // a second bundled copy
  const ctx = Context.make(LoggerA, { n: 1 })
  const viaB = Context.getOption(ctx, LoggerB as unknown as typeof LoggerA)
  yield* record("E9a", "A service key's string identifier is `key.key`", LoggerA.key === "proto/Logger", `LoggerA.key=${LoggerA.key}`)
  yield* record("E9b", "Two distinct key objects with the same identifier resolve the same Context entry (why KeyMismatch must be checked explicitly)",
    JSON.stringify(viaB).includes("1"), `lookup via second key object=${JSON.stringify(viaB)}; same object=${(LoggerA as unknown) === (LoggerB as unknown)}`)
})

const program = Effect.gen(function* () {
  for (const [name, e] of [["E1", e1], ["E2", e2], ["E3", e3], ["E4", e4], ["E5", e5], ["E6", e6], ["E7", e7], ["E8", e8], ["E9", e9]] as const) {
    yield* (e as Effect.Effect<unknown, unknown>).pipe(
      Effect.catchCause((cause) => record(`${name}!`, `${name} ran to completion`, false, String(cause))))
  }
})

await Effect.runPromise(program)
const width = Math.max(...results.map((r) => r.id.length))
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(width)}  ${r.claim}\n        observed: ${r.observed}`)
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} passed (effect ${(await import("effect/package.json", { with: { type: "json" } })).default.version}, node ${process.version})`)
process.exitCode = failed ? 1 : 0
