// Phase-P4 scenarios for children and groups (behaviour 14, BEH-BR-121–128).
import { Context, Deferred, Effect, Exit, Fiber, Layer, type Scope } from "effect"
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
      expect(c?.parentId).toBe("app")
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

  it("finding G21: a parent that awaits its child inside its build starves when the child needs the build slot it holds", async () => {
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
      expect(app?.state === "failed" && app.failure.message).toContain("timeout")
      expect(yield* stateIn(host, "app/child")).toBe("uninstalled")         // unmounted with the failed activation
    }), { options: { concurrency: 1, buildTimeout: 100 } })
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
})
