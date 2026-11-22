// Phase-P4 scenarios for children and groups (behaviour 14, BEH-BR-121–128).
import { Context, Deferred, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { PluginRuntime } from "../src/runtime.js"
import { define, group, type AnyPlugin } from "../src/plugin.js"
import { journal, type Journal } from "./fixtures.js"
import { as, find, memorySink, run, scriptedGate, settleWriter, stateIn } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

class Parent extends Context.Service<Parent, { readonly name: string }>()("example/Parent") {}
class Feature extends Context.Service<Feature, { readonly on: boolean }>()("example/Feature") {}
class Other extends Context.Service<Other, { readonly x: number }>()("example/Other") {}

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)

const childDef = (j: Journal, o: { id?: string; requiresParent?: boolean; provides?: boolean; fail?: boolean } = {}): AnyPlugin => define({
  id: o.id ?? "child",
  requires: o.requiresParent ? [Parent] as const : [] as const,
  provides: o.provides ? [Feature] as const : [] as const,
  build: Layer.effectContext(Effect.gen(function* () {
    const name = o.requiresParent ? (yield* Parent).name : "-"
    yield* j.push(`${o.id ?? "child"}:build`)
    if (o.fail) return yield* Effect.fail("child build failed")
    yield* Effect.addFinalizer(() => j.push(`${o.id ?? "child"}:close${o.requiresParent ? ` using ${name}` : ""}`))
    return o.provides ? Context.make(Feature, { on: true }) : Context.empty()
  })) as AnyPlugin["build"]
}) as AnyPlugin

const parentDef = (j: Journal, children: ReadonlyArray<AnyPlugin>, o: { id?: string; requires?: ReadonlyArray<Context.Key<any, any>>; afterMount?: Effect.Effect<void, unknown, PluginRuntime | Scope.Scope> } = {}): AnyPlugin => ({
  id: o.id ?? "app",
  requires: o.requires ?? [],
  provides: [Parent],
  build: Layer.effect(Parent, Effect.gen(function* () {
    const rt = yield* PluginRuntime
    yield* j.push("app:build")
    yield* Effect.addFinalizer(() => j.push("app:close"))
    for (const c of children) yield* rt.install(c)
    if (o.afterMount) yield* o.afterMount
    return { name: "app" }
  })) as AnyPlugin["build"]
})

describe("children (behaviour 14)", () => {
  it("BEH-BR-121, 122, 126: a child is mounted by the parent's build, prefixed, ungated, and its mount record is caused by the parent's activation", async () => {
    const j = journal()
    const { records, sink } = memorySink()
    const { requests, gate } = scriptedGate(() => "allow")
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j)]), as())
      yield* idle(host)
      const c = yield* find(host, "app/child")
      expect(c?.state).toBe("active")
      expect(c?.parentId).toEqual({ id: "app", realm: "default" })
      expect(c?.realm).toBe("default")
      expect(requests.map((r) => r.operation)).toEqual(["install"])        // the mount consulted no gate
      yield* settleWriter
      const req = records.find((r) => r.operation === "install" && r.phase === "requested")!
      const childStarts = records.filter((r) => r.operation === "system-start" && r.target?.id === "app/child")
      expect(childStarts[0]!.actor.id).toBe("bridger:system")
      expect(childStarts[0]!.causationId).toBe(req.recordId)               // the record that began the parent's activation
      expect(childStarts[0]!.after?.state).toBe("waiting")                 // the mount ...
      expect(childStarts[1]!.after?.state).toBe("active")                  // ... and the child's activation: both system-start (finding G20)
      expect(childStarts[1]!.causationId).toBe(childStarts[0]!.recordId)
    }), { sink, gate })
  })

  it("BEH-BR-121, 125, 126: removing the parent removes the child first, before the parent's scope begins to close", async () => {
    const j = journal()
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j)]), as())
      yield* idle(host)
      j.lines.length = 0
      yield* drive(host, host.remove("app", as()))
      expect(j.lines).toEqual(["child:close", "app:close"])
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")         // removed, not waiting
      yield* settleWriter
      const req = records.find((r) => r.operation === "remove" && r.phase === "requested")!
      const unmount = records.find((r) => r.operation === "system-stop" && r.target?.id === "app/child")!
      expect(unmount.causationId).toBe(req.recordId)                        // the cascade root (BEH-BR-190)
      expect(unmount.after?.state).toBe("uninstalled")
    }), { sink })
  })

  it("BEH-BR-121: a mount edge closes a cycle only through the parent's own definition — a replace that requires its child's service", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      const child = define({ id: "feature", requires: [] as const, provides: [Feature] as const, build: Layer.succeed(Feature, { on: true }) })
      yield* host.install(parentDef(j, [child]), as())
      yield* idle(host)
      expect(yield* stateIn(host, "app/feature")).toBe("active")
      // The same parent, now requiring what its child provides: app → app/feature (requires) and app/feature → app (mount).
      const next = parentDef(j, [child], { requires: [Feature] })
      const exit = yield* Effect.exit(drive(host, host.replace(next, as())))
      expect(failed(exit, "DependencyCycle")).toBe(true)
      expect(yield* stateIn(host, "app")).toBe("active")                      // nothing stopped (BEH-BR-050)
    }))
  })

  it("BEH-BR-123: a failing child does not fail its parent; its failure shows under its own id", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j, { fail: true })]), as())
      yield* idle(host)
      expect(yield* stateIn(host, "app")).toBe("active")
      const c = yield* find(host, "app/child")
      expect(c?.state === "failed" && c.failure.phase).toBe("build")
    }))
  })

  it("BEH-BR-124: a child requiring its parent's service waits for publication and stops first, using it in its finalizer", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j, { requiresParent: true })]), as())
      yield* idle(host)
      expect(yield* stateIn(host, "app/child")).toBe("active")
      expect(j.lines).toEqual(["app:build", "child:build"])                 // started only after the parent published
      j.lines.length = 0
      yield* drive(host, host.remove("app", as()))
      expect(j.lines).toEqual(["child:close using app", "app:close"])
    }))
  })

  it("BEH-BR-125: a new activation mounts again; a child removed directly stays removed until then", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j)]), as())
      yield* idle(host)
      yield* drive(host, host.remove("app/child", as()))                                 // an ordinary operator call on the child
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
      j.lines.length = 0
      yield* drive(host, host.restart("app", as()))
      yield* idle(host)
      expect(j.lines).toEqual(["app:close", "app:build", "child:build"])     // the parent found it gone; the rebuild mounted it again
      expect(yield* stateIn(host, "app/child")).toBe("active")
    }))
  })

  it("BEH-BR-121, 125: a parent's forced removal ends a parked operation on its child and removes the child", async () => {
    const j = journal()
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j, { provides: true })]), as())
      yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Feature, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const parked = yield* Effect.exit(drive(host, host.restart("app/child", { ...as(), drain: 20 })))
      expect(failed(parked, "DrainTimeout")).toBe(true)
      yield* drive(host, host.remove("app", { ...as(), drain: 20, force: true }))
      expect(failed(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")         // removed, the restart's rebuild never ran
      expect(j.lines.filter((l) => l === "child:build")).toHaveLength(1)
      yield* settleWriter
      const parkedReq = records.find((r) => r.operation === "restart" && r.phase === "requested")!
      const ended = records.find((r) => r.operation === "intent-ended")!
      expect(ended.endsIntentOf).toBe(parkedReq.recordId)
    }), { sink })
  })

  it("BEH-BR-125: a child whose drain expires under the parent's removal parks with next \"gone\" and is removed when resumed", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(parentDef(j, [childDef(j, { provides: true })]), as())
      yield* idle(host)
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Feature, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const first = yield* Effect.exit(drive(host, host.remove("app", { ...as(), drain: 20 })))
      expect(failed(first, `"id":"app/child"`)).toBe(true)                  // DrainTimeout names the child
      const c = yield* find(host, "app/child")
      expect(c?.state === "stopping" && [c.parked, c.next]).toEqual([true, "gone"])
      // Only a removal resumes a parked child removal (prototype choice, finding G19).
      expect(failed(yield* Effect.exit(drive(host, host.restart("app/child", as()))), "Conflict")).toBe(true)
      yield* drive(host, host.remove("app", { ...as(), drain: 20, force: true }))
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
      expect(yield* stateIn(host, "app")).toBe("uninstalled")
    }))
  })

  it("finding G19: a parent whose stop has begun mounts nothing, so no child outlives the activation", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      const go = yield* Deferred.make<void>()
      const attempt = yield* Deferred.make<Exit.Exit<unknown, unknown>>()
      const late = childDef(j, { id: "late" })
      const parent = parentDef(j, [], {
        afterMount: Effect.gen(function* () {
          const rt = yield* PluginRuntime
          yield* rt.background("mounter", Effect.gen(function* () {
            yield* Deferred.await(go)
            yield* Deferred.succeed(attempt, yield* Effect.exit(Effect.scoped(rt.install(late))))
          }))
        })
      })
      yield* host.install(parent, as())
      yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Parent, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const removal = yield* Effect.forkChild(host.remove("app", { ...as(), drain: 5_000 }))
      yield* host.stepPlugin("app")                                             // the removal is draining the parent's lease
      expect(yield* stateIn(host, "app")).toBe("stopping")
      yield* Deferred.succeed(go, undefined)
      expect(failed(yield* Deferred.await(attempt), "Conflict")).toBe(true)
      yield* Deferred.succeed(release, undefined)
      yield* drive(host, Fiber.join(removal))
      expect((yield* host.snapshot).plugins).toEqual([])
    }))
  })

  it("finding G21 (report 01 R9): a parent that awaits its child inside its build gives its slot back, so the child can build", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      const parent: AnyPlugin = {
        id: "app", requires: [], provides: [Parent],
        build: Layer.effect(Parent, Effect.gen(function* () {
          const rt = yield* PluginRuntime
          const h = yield* rt.install(childDef(j))                          // requires nothing of the parent
          yield* h.awaitActive
          return { name: "app" }
        })) as AnyPlugin["build"]
      }
      yield* host.install(parent, as())
      yield* idle(host)
      const app = yield* find(host, "app")
      expect(app?.state).toBe("active")
      expect(yield* stateIn(host, "app/child")).toBe("active")
    }), { options: { concurrency: 1, buildTimeout: 4000 } })
  })
})

describe("groups (BEH-BR-127, 128)", () => {
  const member = (id: string, provides?: Context.Key<any, any>, fail = false): AnyPlugin => ({
    id, requires: [], provides: provides ? [provides] : [],
    build: (fail ? Layer.effectDiscard(Effect.fail(`${id} failed`)) : provides ? Layer.succeed(provides, {} as never) : Layer.empty) as unknown as AnyPlugin["build"]
  })

  it("BEH-BR-127: awaitActive resolves when every member is active and fails fast naming a failed member", async () => {
    await run((host) => Effect.gen(function* () {
      const ok = yield* host.install(group("bundle", [member("a", Feature), member("b", Other)]), as())
      yield* drive(host, ok.awaitActive)
      expect(yield* stateIn(host, "bundle/a")).toBe("active")
      expect(yield* stateIn(host, "bundle/b")).toBe("active")
      const bad = yield* host.install(group("broken", [member("x"), member("y", undefined, true)]), as())
      const exit = yield* Effect.exit(drive(host, bad.awaitActive))
      expect(failed(exit, `"id":"broken/y"`)).toBe(true)
      expect(yield* stateIn(host, "broken")).toBe("active")                  // a failed member does not fail the group (BEH-BR-123)
    }))
  })

  it("BEH-BR-128: a member that fails its install checks fails the group's activation and leaves no member mounted", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "owner", requires: [] as const, provides: [Other] as const, build: Layer.succeed(Other, { x: 1 }) }), as())
      const h = yield* host.install(group("bundle", [member("a", Feature), member("b", Other)]), as())   // b: DuplicateProvider
      yield* idle(host)
      const g = yield* find(host, "bundle")
      // BEH-BR-128 says phase "activation"; the member's InstallError fails the build Layer, which BEH-BR-037 calls phase "build" (finding G22).
      expect(g?.state === "failed" && [g.failure.phase, g.failure.message.includes("DuplicateProvider")]).toEqual(["build", true])
      expect(yield* stateIn(host, "bundle/a")).toBe("uninstalled")
      expect(failed(yield* Effect.exit(drive(host, h.awaitActive)), "ActivationFailed")).toBe(true)
      // The group acts as one unit: restart mounts all members again (BEH-BR-128).
      yield* drive(host, host.remove("owner", as()))
      yield* drive(host, host.retry("bundle", as()))
      yield* drive(host, h.awaitActive)
      expect(yield* stateIn(host, "bundle/b")).toBe("active")
    }))
  })

  it("BEH-BR-121, 047: a child whose cleanup fails is recorded failed, then unregistered by a leak-acknowledged record caused by its system-stop; the parent's removal completes", async () => {
    const { records, sink } = memorySink()
    const bad = define({ id: "kid", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.addFinalizer(() => Effect.die(new Error("sink close failed")))) as never }) as unknown as AnyPlugin
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { yield* (yield* PluginRuntime).install(bad) })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(parent, as()); yield* idle(host)
      expect(yield* stateIn(host, "app/kid")).toBe("active")
      yield* drive(host, host.remove("app", as())); yield* idle(host); yield* settleWriter
      expect((yield* host.snapshot).plugins).toEqual([])                         // the child did not outlive its parent
      const stop = records.find((r) => r.operation === "system-stop" && r.target?.id === "app/kid" && r.error?._tag === "CleanupError")
      const ack = records.find((r) => r.operation === "leak-acknowledged")
      expect(stop).toBeDefined()
      expect(ack).toMatchObject({ target: { id: "app/kid" }, causationId: stop!.recordId, before: { state: "failed" }, error: { _tag: "CleanupError" } })
      expect(ack!.actor).toMatchObject({ kind: "system" })
    }), { sink })
  })

  it("BEH-BR-126: unmount fails UnknownPlugin for a non-child and for a repeat, CleanupError with a leak-acknowledged record, and HostClosed once the host has closed", async () => {
    const { records, sink } = memorySink()
    let rt: PluginRuntime["Service"] | undefined
    let kid: { id: string; realm: string } | undefined
    const bad = define({ id: "kid", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.addFinalizer(() => Effect.die(new Error("sink close failed")))) as never }) as unknown as AnyPlugin
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { rt = yield* PluginRuntime; kid = yield* rt.install(bad) })) as never }) as unknown as AnyPlugin
    const other = define({ id: "other", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
    const ctx = { context: as().context }
    await run((host) => Effect.gen(function* () {
      yield* host.install(parent, as()); yield* host.install(other, as()); yield* idle(host)
      expect(failed(yield* Effect.exit(drive(host, rt!.unmount({ id: "other", realm: "default" } as never, ctx))), "UnknownPlugin")).toBe(true)   // not a child of this activation
      const exit = yield* Effect.exit(drive(host, rt!.unmount(kid as never, ctx)))
      expect(failed(exit, "CleanupError")).toBe(true)
      yield* settleWriter
      expect(records.some((r) => r.operation === "leak-acknowledged" && r.target?.id === "app/kid")).toBe(true)
      expect((yield* host.snapshot).plugins.map((p) => p.id)).toEqual(["app", "other"])   // the child is unregistered, not left failed
      expect(failed(yield* Effect.exit(drive(host, rt!.unmount(kid as never, ctx))), "UnknownPlugin")).toBe(true)   // a retry finds no child
      yield* drive(host, host.shutdown(as()))
      expect(failed(yield* Effect.exit(rt!.unmount(kid as never, ctx)), "HostClosed")).toBe(true)
    }), { sink })
  })

  it("BEH-BR-126: unmount fails WouldDeadlock, writing no record, when the caller holds a lease on the child", async () => {
    const { records, sink } = memorySink()
    let rt: PluginRuntime["Service"] | undefined
    let kid: { id: string; realm: string } | undefined
    const j = journal()
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { rt = yield* PluginRuntime; kid = yield* rt.install(childDef(j, { provides: true })) })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(parent, as()); yield* idle(host); yield* settleWriter
      const before = records.length
      const exit = yield* Effect.exit(host.use(Feature, () => rt!.unmount(kid as never, { context: as().context })))   // a lease on the child's service
      expect(failed(exit, "WouldDeadlock")).toBe(true)
      yield* settleWriter
      expect(records.slice(before).some((r) => r.operation === "unmount-requested")).toBe(false)
      expect(yield* stateIn(host, "app/child")).toBe("active")
    }), { sink })
  })

  it("BEH-BR-121: closing a sub-scope takes over a child stop parked outside the parent's stop, emits stop-resumed by sub-scope, and a held lease is revoked", async () => {
    const j = journal()
    let sub: Scope.Closeable | undefined
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { const rt = yield* PluginRuntime; sub = yield* Scope.make(); yield* rt.install(childDef(j, { provides: true })).pipe(Scope.provide(sub)) })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      const resumed: Array<string> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((ev) => Effect.sync(() => { if (ev.type === "stop-resumed") resumed.push(ev.by) }))))
      yield* Effect.yieldNow
      yield* host.install(parent, as()); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Feature, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      expect(failed(yield* Effect.exit(drive(host, host.restart("app/child", { ...as(), drain: 20 }))), "DrainTimeout")).toBe(true)   // parked by an operator call on the child
      const close = yield* Effect.forkChild(Scope.close(sub!, Exit.void))
      while (close.pollUnsafe() === undefined) if (!(yield* host.step)) yield* Effect.yieldNow
      yield* Fiber.join(close)
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
      expect(failed(yield* Fiber.await(holder), "LeaseRevoked")).toBe(true)
      expect(resumed).toContain("sub-scope")
      expect(yield* stateIn(host, "app")).toBe("active")                           // only the child went
    }))
  })

  it("BEH-BR-121: under shutdown a child whose cleanup fails is reported failed (cleanup) and is not acknowledged by the system", async () => {
    const { records, sink } = memorySink()
    const bad = define({ id: "kid", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.addFinalizer(() => Effect.die(new Error("sink close failed")))) as never }) as unknown as AnyPlugin
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { yield* (yield* PluginRuntime).install(bad) })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(parent, as()); yield* idle(host)
      const rep = yield* drive(host, host.shutdown(as())); yield* settleWriter
      expect(rep.failed).toEqual([{ id: "app/kid", cause: "cleanup", message: "sink close failed" }])
      expect(records.some((r) => r.operation === "leak-acknowledged")).toBe(false)   // shutdown does not acknowledge the leak
      expect((yield* host.snapshot).plugins.find((p) => p.id === "app/kid")).toMatchObject({ state: "failed" })   // and the child stays registered
    }), { sink })
  })

  const subParent = (j: Journal, out: { sub?: Scope.Closeable; rt?: PluginRuntime["Service"] }, closeWithParent: boolean) => define({ id: "app", requires: [] as const, provides: [] as const,
    build: Layer.effectDiscard(Effect.gen(function* () {
      const rt = yield* PluginRuntime; out.rt = rt
      const sub = yield* Scope.make(); out.sub = sub
      if (closeWithParent) yield* Effect.addFinalizer(() => Scope.close(sub, Exit.void))
      yield* rt.install(childDef(j, { provides: true })).pipe(Scope.provide(sub))
    })) as never }) as unknown as AnyPlugin
  const stepAll = (host: Parameters<typeof drive>[0], fibers: ReadonlyArray<Fiber.Fiber<unknown, unknown>>) => Effect.gen(function* () {
    while (fibers.some((f) => f.pollUnsafe() === undefined)) if (!(yield* host.step)) yield* Effect.yieldNow
  })

  it("BEH-BR-121: a sub-scope that closes after the parent's stop has begun starts no second removal of the child", async () => {
    const j = journal(); const { records, sink } = memorySink()
    const out: { sub?: Scope.Closeable } = {}
    await run((host) => Effect.gen(function* () {
      yield* host.install(subParent(j, out, true), as()); yield* idle(host)
      yield* drive(host, host.remove("app", as())); yield* settleWriter
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
      expect(records.filter((r) => r.operation === "system-stop" && r.target?.id === "app/child")).toHaveLength(1)
      expect(j.lines.filter((l) => l === "child:close")).toHaveLength(1)
    }), { sink })
  })

  it("BEH-BR-121: a sub-scope closed by a fiber that holds a lease in the child's removal set does not wait, and the child is removed once the lease ends", async () => {
    const j = journal()
    const out: { sub?: Scope.Closeable } = {}
    await run((host) => Effect.gen(function* () {
      yield* host.install(subParent(j, out, false), as()); yield* idle(host)
      const closed = yield* Deferred.make<void>()
      const user = yield* Effect.forkChild(host.use(Feature, () => Scope.close(out.sub!, Exit.void).pipe(Effect.andThen(Deferred.succeed(closed, undefined)))))
      yield* stepAll(host, [user])
      expect(Exit.isSuccess(yield* Fiber.await(user))).toBe(true)                 // the close returned: it did not wait on its own lease
      yield* idle(host)
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
    }))
  })

  it("BEH-BR-121: a sub-scope close takes over a draining stop of the child begun outside the parent: one stop, no rebuild", async () => {
    const j = journal()
    const out: { sub?: Scope.Closeable } = {}
    await run((host) => Effect.gen(function* () {
      yield* host.install(subParent(j, out, false), as()); yield* idle(host)
      const entered = yield* Deferred.make<void>(); const release = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Feature, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const restart = yield* Effect.forkChild(host.restart("app/child", { ...as(), drain: 5000 }))     // draining: the lease is held
      for (let i = 0; i < 500 && (yield* stateIn(host, "app/child")) !== "stopping"; i++) { if (!(yield* host.step)) yield* Effect.sleep(2) }   // wait for the stop to begin; a fixed count of yields is load-dependent
      expect(yield* stateIn(host, "app/child")).toBe("stopping")
      const close = yield* Effect.forkChild(Scope.close(out.sub!, Exit.void))
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      expect(close.pollUnsafe()).toBeUndefined()                                  // waiting for the stop step it took over
      yield* Deferred.succeed(release, undefined)
      yield* stepAll(host, [holder, restart, close])
      expect(failed(yield* Fiber.await(restart), "UnknownPlugin")).toBe(true)      // the owning operation is decided against the removal (BEH-BR-073)
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
      expect(j.lines.filter((l) => l === "child:build")).toHaveLength(1)           // the restart's rebuild never ran
      expect(j.lines.filter((l) => l === "child:close")).toHaveLength(1)
    }))
  })

  it("BEH-BR-121, 126: unmounting a child still queued for a build slot abandons the build and removes it at once", async () => {
    const j = journal()
    const out: { rt?: PluginRuntime["Service"] } = {}
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { out.rt = yield* PluginRuntime })) as never }) as unknown as AnyPlugin
    const gate = Effect.runSync(Deferred.make<void>())
    const slow = define({ id: "slow", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Deferred.await(gate)) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(parent, as()); yield* idle(host)
      const sub = yield* Scope.make()
      const slowInstall = yield* Effect.forkChild(host.install(slow, as()))                 // takes the only build slot
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      const mount = yield* Effect.forkChild(out.rt!.install(childDef(j)).pipe(Scope.provide(sub)))
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      expect(yield* stateIn(host, "app/child")).toBe("starting")                          // queued, no build begun
      yield* drive(host, out.rt!.unmount({ id: "app/child", realm: "default" } as never, { context: as().context }))
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
      yield* Deferred.succeed(gate, undefined)
      yield* stepAll(host, [slowInstall, mount])
      expect(j.lines.filter((l) => l === "child:build")).toHaveLength(0)                  // the queued build never ran
    }), { options: { concurrency: 1 } })
  })

  it("ADR-BR-038 items 4, 7: a cascade whose dependent will not drain parks the dependent's stop under the named target, emits stop-parked, and a parked stop does not hold awaitIdle", async () => {
    const base = define({ id: "base", requires: [] as const, provides: [Parent] as const, build: Layer.succeed(Parent, { name: "base" }) as never }) as unknown as AnyPlugin
    const mid = define({ id: "mid", requires: [Parent] as const, provides: [Feature] as const,
      build: Layer.effect(Feature, Effect.gen(function* () { yield* Parent; return { on: true } })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      const parked: Array<unknown> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((ev) => Effect.sync(() => { if (ev.type === "stop-parked") parked.push(ev) }))))
      yield* Effect.yieldNow
      yield* host.install(base, as()); yield* host.install(mid, as()); yield* idle(host)
      const entered = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Feature, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))))
      yield* Deferred.await(entered)
      const exit = yield* Effect.exit(drive(host, host.remove("base", { ...as(), drain: 20 })))
      expect(failed(exit, "DrainTimeout")).toBe(true)
      expect(failed(exit, `"id":"mid"`)).toBe(true)                                        // names the plugin that did not drain
      const m = yield* find(host, "mid")
      expect(m?.state === "stopping" && [m.parked, m.reason]).toEqual([true, "dependency-loss"])
      expect(parked).toContainEqual(expect.objectContaining({ type: "stop-parked", target: "base" }))
      yield* idle(host)                                                                    // returns: a parked stop is not a running transition
    }))
  })

  it("ADR-BR-038 item 2: a stop takes no build slot, so it completes while another plugin's build holds the only slot", async () => {
    const gate = Effect.runSync(Deferred.make<void>())
    const other = define({ id: "other", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
    const slow = define({ id: "slow", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Deferred.await(gate)) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(other, as()); yield* idle(host)
      const building = yield* Effect.forkChild(host.install(slow, as()))                   // holds the only slot
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      expect(yield* stateIn(host, "slow")).toBe("starting")
      yield* drive(host, host.remove("other", as()))                                        // must not wait for the slot
      expect(yield* stateIn(host, "other")).toBe("uninstalled")
      yield* Deferred.succeed(gate, undefined)
      yield* stepAll(host, [building])
    }), { options: { concurrency: 1 } })
  })

  it("ADR-BR-038 item 3: a cascade waiting for a dependent's running build fails DrainTimeout (id the dependent, leases 0) when its own drain expires, and the build goes on", async () => {
    const gate = Effect.runSync(Deferred.make<void>())
    const base = define({ id: "base", requires: [] as const, provides: [Parent] as const, build: Layer.succeed(Parent, { name: "base" }) as never }) as unknown as AnyPlugin
    const mid = define({ id: "mid", requires: [Parent] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { yield* Parent; yield* Deferred.await(gate) })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(base, as()); yield* idle(host)
      const building = yield* Effect.forkChild(host.install(mid, as()))
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      expect(yield* stateIn(host, "mid")).toBe("starting")
      const rm = yield* Effect.forkChild(host.remove("base", { ...as(), drain: 20 }))
      for (let i = 0; i < 200; i++) { if (!(yield* host.step)) yield* Effect.sleep(1) }
      const exit = yield* Fiber.await(rm)
      expect(failed(exit, "DrainTimeout")).toBe(true)
      expect(failed(exit, `"id":"mid"`) && failed(exit, `"leases":0`)).toBe(true)
      yield* Deferred.succeed(gate, undefined)
      yield* stepAll(host, [building])
      yield* idle(host)
      yield* drive(host, host.remove("base", { ...as(), drain: 200 }))                    // the retry resumes the parked stop and completes
      expect(yield* stateIn(host, "base")).toBe("uninstalled")
      expect(["waiting", "failed"]).toContain(yield* stateIn(host, "mid"))                 // the discarded build never activates
    }))
  })

  it("ADR-BR-038 item 1: an operation on an unrelated plugin is not delayed by another plugin's drain", async () => {
    const a = define({ id: "a", requires: [] as const, provides: [Feature] as const, build: Layer.succeed(Feature, { on: true }) as never }) as unknown as AnyPlugin
    const b = define({ id: "b", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(a, as()); yield* host.install(b, as()); yield* idle(host)
      const entered = yield* Deferred.make<void>(); const release = yield* Deferred.make<void>()
      const holder = yield* Effect.forkChild(host.use(Feature, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      const slow = yield* Effect.forkChild(host.remove("a", { ...as(), drain: 5000 }))     // draining for as long as the lease is held
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      expect(slow.pollUnsafe()).toBeUndefined()
      yield* drive(host, host.restart("b", as()))                                           // not queued behind a's drain
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }     // its rebuild too
      expect(yield* stateIn(host, "b")).toBe("active")
      yield* Deferred.succeed(release, undefined)
      yield* stepAll(host, [holder, slow])
      expect(yield* stateIn(host, "a")).toBe("uninstalled")
    }))
  })

  it("ADR-BR-038 item 4: a no-caller removal waiting for a dependent's running build keeps waiting past drainTimeout, never parks, and completes when the build ends", async () => {
    const j = journal()
    const out: { rt?: PluginRuntime["Service"]; kid?: { id: string; realm: string } } = {}
    const gate = Effect.runSync(Deferred.make<void>())
    const parent = define({ id: "app", requires: [] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { out.rt = yield* PluginRuntime; out.kid = yield* out.rt.install(childDef(j, { provides: true })) })) as never }) as unknown as AnyPlugin
    const dep = define({ id: "dep", requires: [Feature] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () { yield* Feature; yield* Deferred.await(gate) })) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(parent, as()); yield* idle(host)
      const building = yield* Effect.forkChild(host.install(dep, as()))
      for (let i = 0; i < 20; i++) { if (!(yield* host.step)) yield* Effect.yieldNow }
      expect(yield* stateIn(host, "dep")).toBe("starting")
      const unmount = yield* Effect.forkChild(out.rt!.unmount(out.kid as never, { context: as().context }))
      for (let i = 0; i < 60; i++) { if (!(yield* host.step)) yield* Effect.sleep(5) }     // well past drainTimeout (50 ms)
      expect(unmount.pollUnsafe()).toBeUndefined()                                          // still waiting: no DrainTimeout, no parking
      yield* Deferred.succeed(gate, undefined)
      yield* stepAll(host, [building, unmount])
      expect(Exit.isSuccess(yield* Fiber.await(unmount))).toBe(true)
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")
    }), { options: { drainTimeout: 50 } })
  })
})
