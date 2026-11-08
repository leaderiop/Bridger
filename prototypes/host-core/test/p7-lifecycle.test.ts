// P7 second pass: children under sub-scopes, Plugin.Any, entitlement, held event, idle return, realm families,
// ephemeral realms, retireRealm, unmount (checks 84–86, 89–91, 96, 97, 110). Prototype; evidences no requirement.
import { Context, Deferred, Effect, Exit, Fiber, Layer, Option, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import { Event, Events } from "../src/bus.js"
import { AuditSink, OperationGate, type AuditRecord } from "../src/gxp.js"
import type { HostEvent } from "../src/events.js"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin, type PluginAny } from "../src/plugin.js"
import { CurrentPlugin, EntitlementView, PrincipalReference, type EntitlementState, type PluginPrincipal } from "../src/policy.js"
import { Realm } from "../src/realms.js"
import { PluginRuntime } from "../src/runtime.js"
import * as Testing from "../src/testing.js"
import { drive, idle, withHost } from "./fixtures.js"
import { alice, as, settleWriter, stateIn } from "./p4fixtures.js"
import { onHost, rec } from "./p7fixtures.js"

class Svc extends Context.Service<Svc, { readonly n: number }>()("example/Svc") {}
const empty = (id: string, extra: Partial<AnyPlugin> = {}) => define({ id, requires: [] as const, provides: [] as const, build: Layer.empty as never, ...extra }) as unknown as AnyPlugin
const typesOf = (events: Array<HostEvent>) => events.map((e) => e.type)
const collect = (host: Testing.TestHost) => Effect.gen(function* () {
  const out: Array<HostEvent> = []
  yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { out.push(e) }))))
  yield* Effect.yieldNow
  return out
})

describe("P7 core 14/01/10: children, Plugin.Any, entitlement, unmount (checks 89, 90, 91, 110)", () => {
  it("check 89: a child mounted under a sub-scope is removed when it closes, ungated, with a system-stop by Actor.system caused by the mount record", async () => {
    const { records, sink } = rec()
    let gated = 0
    const gate: OperationGate["Service"] = { authorize: () => Effect.sync(() => { gated++ }) }
    let sub: Scope.Closeable | undefined
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "parent", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        const rt = yield* PluginRuntime
        sub = yield* Scope.make()
        yield* rt.install(empty("session")).pipe(Scope.provide(sub))
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host)
      expect(yield* stateIn(host, "parent/session")).toBe("active")
      const g = gated
      yield* drive(host, Scope.close(sub!, Exit.void))
      expect(yield* stateIn(host, "parent/session")).toBe("uninstalled")
      expect(yield* stateIn(host, "parent")).toBe("active")
      expect(gated).toBe(g)
      yield* settleWriter
      const mount = records.find((r) => r.operation === "system-start" && r.target?.id === "parent/session" && r.after?.state === "waiting")!
      const stop = records.find((r) => r.operation === "system-stop" && r.target?.id === "parent/session")!
      expect(stop).toMatchObject({ actor: { id: "bridger:system" }, causationId: mount.recordId })
    }), { sink, gate })
  })

  it("check 90: every Plugin.define value is a Plugin.Any; an object literal is not; define adds no property", () => {
    const literal = { id: "x", requires: [] as const, provides: [] as const, build: Layer.empty as never }
    const ok: PluginAny = define({ ...literal })
    const none: PluginAny = define({ id: "y", requires: [] as const, provides: [] as const, build: Layer.empty as never })
    // @ts-expect-error — an object literal not produced by Plugin.define is not a Plugin.Any
    const bad: PluginAny = literal
    void bad
    expect(Object.keys(define(literal)).sort()).toEqual(Object.keys(literal).sort())
    expect(define(literal)).toBe(literal)
    expect([ok.id, none.id]).toEqual(["x", "y"])
    // accepted by install without a cast (type-checked; not run)
    const _typeOnly = (h: Testing.TestHost) => h.install(define({ id: "z", requires: [] as const, provides: [] as const, build: Layer.empty as never }), as())
    void _typeOnly
  })

  it("check 91: entitled — unwired emits one unmetered state and stays open; wired: one watch per activation, shared, ends with the scope; an ended watch yields one stale state", async () => {
    const got: Array<EntitlementState> = []
    let rt: PluginRuntime["Service"] | undefined
    const holder = define({ id: "metered", requires: [] as const, provides: [] as const, meta: { version: "3" }, build: Layer.effectDiscard(Effect.gen(function* () { rt = yield* PluginRuntime })) as never }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(holder, as()); yield* idle(host)
      const first = yield* Stream.runHead(rt!.entitled)
      expect(Option.getOrThrow(first)).toMatchObject({ mode: "unmetered" })
      const more = yield* rt!.entitled.pipe(Stream.take(2), Stream.runCollect, Effect.timeoutOption(30))
      expect(Option.isNone(more)).toBe(true)                                       // stays open
    }))
    const watches: Array<unknown> = []
    let feed: Deferred.Deferred<void> | undefined
    const view = { watch: (t: unknown) => { watches.push(t); return Stream.make({ mode: "full" as const, asOf: "t1" }).pipe(Stream.concat(Stream.fromEffect(Effect.flatMap(Effect.suspend(() => Deferred.await(feed!)), () => Effect.succeed({ mode: "grace" as const, asOf: "t2" }))))) } }
    await onHost((host) => Effect.gen(function* () {
      feed = yield* Deferred.make<void>()
      yield* host.install(holder, as()); yield* idle(host)
      const a = yield* Effect.forkChild(rt!.entitled.pipe(Stream.runForEach((s) => Effect.sync(() => { got.push(s) }))))
      const b = yield* Effect.forkChild(Stream.runCollect(rt!.entitled))
      yield* Effect.sleep(5)
      yield* Deferred.succeed(feed, undefined)
      yield* Effect.sleep(5)
      expect(watches).toEqual([{ id: "metered", realm: "default", version: "3" }])
      expect(got.map((s) => [s.mode, s.stale ?? false])).toEqual([["full", false], ["grace", false], ["grace", true]])
      expect(got.at(-1)!.reason).toBe("entitlement-view-ended")
      yield* drive(host, host.remove("metered", as()))
      yield* Fiber.join(a); yield* Fiber.join(b)                                  // both streams end with the activation
    }), { layers: [Layer.succeed(EntitlementView, view)] })
  })

  it("check 110: Plugin.Runtime.unmount writes unmount-requested with requestedBy before the removal's records, which it causes", async () => {
    const { records, sink } = rec()
    let rt: PluginRuntime["Service"] | undefined
    let handle: { id: string; realm: string } | undefined
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "gw", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        rt = yield* PluginRuntime
        handle = yield* rt.install(empty("sess"))
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host)
      yield* drive(host, rt!.unmount(handle as never, { context: { actor: { id: "user-bob", kind: "user" } } }))
      yield* settleWriter
      const mine = records.filter((r) => r.target?.id === "gw/sess")
      const req = mine.find((r) => r.operation === "unmount-requested")!
      expect(req.requestedBy).toEqual({ id: "user-bob", kind: "user" })
      const stop = mine.find((r) => r.operation === "system-stop")!
      expect(stop.causationId).toBe(req.recordId)
      expect(mine.indexOf(req)).toBeLessThan(mine.indexOf(stop))
    }), { sink })
  })
})

// ---------------------------------------------------------------- held event (check 96) and idle return (check 97)
const Evt = Event.make<[string], void>()("billing/invoice-posted")
const manifest = (id: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({ manifestVersion: 1, id, version: "1.0.0", provides: [], requires: [], activation: [{ _tag: "OnEvent", eventId: Evt.id }], ...extra })
const lazyListener = (id: string, heard: Array<string>, o: { listen?: boolean; load?: Effect.Effect<void>; journal?: Array<string>; idle?: number; holdTimeout?: number } = {}) => {
  let loads = 0
  const def = define({ id, requires: [Events] as const, provides: [] as const, meta: { version: "1.0.0" }, build: Layer.effectDiscard(Effect.gen(function* () {
    const bus = yield* Events
    if (o.listen !== false) {
      yield* bus.on(Evt, (x) => Effect.sync(() => { heard.push(`on:${x}`) }))
      yield* bus.around(Evt, (_a, next) => Effect.sync(() => { heard.push("around") }).pipe(Effect.andThen(next)))
    }
    yield* Effect.addFinalizer(() => Effect.sync(() => { o.journal?.push(`close:${id}`) }))
  })) }) as unknown as AnyPlugin
  const lz = lazy({ manifest: manifest(id, { requires: [{ serviceId: "@bridger/core/Events" }] }), load: Effect.suspend(() => { loads++; return (o.load ?? Effect.void).pipe(Effect.as(def)) }), ...(o.idle !== undefined ? { idle: o.idle } : {}), ...(o.holdTimeout !== undefined ? { holdTimeout: o.holdTimeout } : {}) })
  return { lz, loads: () => loads }
}
const emitFrom = (host: Testing.TestHost, value: string) => host.use(Events, (bus) => bus.emit(Evt, value))

describe("P7 core 27: held event (check 96)", () => {
  it("check 96: the dispatch returns without waiting; once active, the plugin's on listeners get the event exactly once, around listeners and others never; the value appears nowhere", async () => {
    const { records, sink } = rec()
    const heard: Array<string> = [], app: Array<string> = []
    const SENTINEL = "sentinel-77b"
    await onHost((host) => Effect.gen(function* () {
      const events = yield* collect(host)
      const bus = yield* host.use(Events, (b) => Effect.succeed(b))
      yield* bus.on(Evt, (x) => Effect.sync(() => { app.push(x) }))                // an application listener, in the test's scope
      const { lz } = lazyListener("ear", heard)
      yield* host.install(lz, as())
      yield* emitFrom(host, SENTINEL)
      expect(yield* stateIn(host, "ear")).not.toBe("dormant")                     // woken; the emit did not wait
      yield* idle(host); yield* Effect.sleep(5)
      expect(heard).toEqual([`on:${SENTINEL}`])
      expect(app).toEqual([SENTINEL])                                             // the ordinary emit only, never the held delivery
      yield* emitFrom(host, "next"); yield* Effect.sleep(5)
      expect(heard).toEqual([`on:${SENTINEL}`, "on:next"])
      yield* settleWriter
      expect(JSON.stringify([records, events, yield* host.snapshot, yield* host.inspect("ear")])).not.toContain(SENTINEL)
    }), { sink })
  })

  for (const [reason, setup] of [
    ["no-listener", (h: Testing.TestHost) => Effect.gen(function* () { yield* h.install(lazyListener("ear", [], { listen: false }).lz, as()); yield* emitFrom(h, "v"); yield* idle(h) })],
    ["activation-failed", (h: Testing.TestHost) => Effect.gen(function* () { yield* h.install(lazyListener("ear", [], { load: Effect.die("x") }).lz, as()); yield* emitFrom(h, "v"); yield* idle(h) })],
    ["ended", (h: Testing.TestHost) => Effect.gen(function* () { yield* h.install(lazy({ manifest: manifest("ear", { requires: [{ serviceId: "example/Missing" }] }), load: Effect.die("never") }), as()); yield* emitFrom(h, "v"); yield* drive(h, h.remove("ear", as())) })]
  ] as const) {
    it(`check 96: the held event is dropped and reported with reason ${reason}`, async () => {
      await onHost((host) => Effect.gen(function* () {
        const events = yield* collect(host)
        yield* setup(host); yield* Effect.sleep(5)
        const drops = events.filter((e) => e.type === ("held-event-dropped" as never)) as unknown as Array<{ event: string; reason: string }>
        expect(drops.map((d) => [d.event, d.reason])).toEqual([[Evt.id, reason]])
      }))
    })
  }

  it("check 96: holdTimeout under TestClock drops with timeout; a wake naming OnEvent holds nothing", async () => {
    const heard: Array<string> = []
    await withHost((host) => Effect.gen(function* () {
      const events = yield* collect(host)
      yield* host.install(lazyListener("slow", heard, { load: Effect.sleep(1000), holdTimeout: 50 }).lz, as())
      yield* emitFrom(host, "v")
      const f = yield* Effect.forkChild(idle(host))
      yield* TestClock.adjust(60)

      expect(events.some((e) => e.type === ("held-event-dropped" as never) && (e as unknown as { reason: string }).reason === "timeout")).toBe(true)
      while (f.pollUnsafe() === undefined) { yield* TestClock.adjust(200); yield* Effect.yieldNow }
      yield* Fiber.join(f)
      yield* host.install(lazyListener("woken", heard).lz, as())
      yield* host.wake({ _tag: "OnEvent", eventId: Evt.id }); yield* idle(host)
      expect(heard.filter((h) => h.startsWith("on"))).toEqual([])
    }), undefined, Layer.mergeAll(TestClock.layer(), Testing.counterIdGenerator("id-")))
  })
})

describe("P7 core 27: idle return and wake attribution (check 97)", () => {
  it("check 97: with idle set, an idle active plugin returns to dormant through a stop (finalizers run) with one lazy-idle record and plugin-idled; a lease resets the idle time; the next wake loads again", async () => {
    const { records, sink } = rec()
    const journal: Array<string> = []
    class Lz extends Context.Service<Lz, {}>()("example/LzIdle") {}
    let loads = 0
    const def = define({ id: "idler", requires: [] as const, provides: [Lz] as const, meta: { version: "1.0.0" }, build: Layer.effect(Lz, Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => { journal.push("close") })); return {} })) }) as unknown as AnyPlugin
    const lz = lazy({ manifest: { manifestVersion: 1, id: "idler", version: "1.0.0", provides: [{ serviceId: "example/LzIdle" }], requires: [] }, load: Effect.sync(() => { loads++; return def }), idle: 100 })
    await withHost((host) => Effect.gen(function* () {
      const events = yield* collect(host)
      yield* host.install(lz, as())
      yield* host.wake({ _tag: "OnService", serviceId: "example/LzIdle" }); yield* idle(host)
      expect(yield* stateIn(host, "idler")).toBe("active")
      // A lease held across the idle period resets it.
      const held = yield* Effect.forkChild(Effect.scoped(Effect.andThen(host.lease([Lz] as const), Effect.sleep(150))))
      yield* TestClock.adjust(120); yield* idle(host)
      expect(yield* stateIn(host, "idler")).toBe("active")
      yield* TestClock.adjust(60); yield* Fiber.join(held)
      for (let i = 0; i < 8; i++) { yield* TestClock.adjust(30); yield* drive(host, host.awaitIdle) }
      expect(yield* stateIn(host, "idler")).toBe("dormant")
      expect(journal).toEqual(["close"])
      expect(typesOf(events)).toContain("plugin-idled")
      yield* host.wake({ _tag: "OnService", serviceId: "example/LzIdle" }); yield* idle(host)
      expect(loads).toBe(2)
    }), undefined, Layer.mergeAll(TestClock.layer(), Testing.counterIdGenerator("id-"), Layer.succeed(AuditSink, sink)))
    const mine = records.filter((r) => r.target?.id === "idler")
    expect(mine.filter((r) => r.operation === "lazy-idle")).toHaveLength(1)
    expect(mine.filter((r) => r.operation === "system-stop")).toHaveLength(0)
  })

  it("check 97: a wake from plugin code writes a root lazy-triggered record with its principal as onBehalfOf and Actor.system; caused records carry none; a forged principal dies", async () => {
    const { records, sink } = rec()
    let principal: PluginPrincipal | undefined
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(lazyListener("target", []).lz, as())
      yield* host.install(define({ id: "waker", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        principal = (yield* CurrentPlugin.require)
        yield* host.wake({ _tag: "OnEvent", eventId: Evt.id })
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host); yield* settleWriter
      const lt = records.find((r) => r.operation === "lazy-triggered")!
      expect(lt).toMatchObject({ actor: { id: "bridger:system" }, onBehalfOf: { id: "waker" } })
      expect(lt.causationId).toBeUndefined()
      const forged = yield* Effect.exit(host.wake({ _tag: "OnEvent", eventId: "x" }).pipe(Effect.provideService(PrincipalReference, Option.some({ ...principal! }))))
      expect(Exit.isFailure(forged) && JSON.stringify(forged.cause).includes("PrincipalForged")).toBe(true)
    }), { sink })
    // A caused lazy-triggered record (an install of a dependent) carries no onBehalfOf.
    const r2 = rec()
    await onHost((host) => Effect.gen(function* () {
      class P extends Context.Service<P, {}>()("example/P97") {}
      const prov = lazy({ manifest: { manifestVersion: 1, id: "prov", version: "1.0.0", provides: [{ serviceId: "example/P97" }], requires: [] }, load: Effect.succeed(define({ id: "prov", requires: [] as const, provides: [P] as const, meta: { version: "1.0.0" }, build: Layer.succeed(P, {}) }) as unknown as AnyPlugin) })
      yield* host.install(prov, as())
      yield* host.install(define({ id: "dep", requires: [P] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin, as())
      yield* idle(host); yield* settleWriter
      const lt = r2.records.find((r) => r.operation === "lazy-triggered")!
      expect(lt.causationId).toBeDefined(); expect(lt.onBehalfOf).toBeUndefined()
    }), { sink: r2.sink })
  })
})

// ---------------------------------------------------------------- realm families, ephemeral realms, retireRealm (checks 84–86)
const svcPlugin = (n: number, fail = false) => define({ id: "svc", requires: [] as const, provides: [Svc] as const, meta: { version: "1", digest: `svc-${n}-${fail}` },
  build: fail ? Layer.effect(Svc, Effect.fail("boom")) as never : Layer.succeed(Svc, { n }) }) as unknown as AnyPlugin

describe("P7 core 33: realm families and ephemeral realms (checks 84, 85, 86)", () => {
  it("check 84: one creation per key through attributed, audited defineRealm and reconcile; concurrent uses share it; invalid keys and changed options refused; a failed member stays failed until reset", async () => {
    const { records, sink } = rec()
    let wide = false, failing = true
    const ctx = { actor: { id: "svc-tenancy", kind: "service" as const }, reason: "tenant on demand" }
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const fam = yield* Realm.family<string>(host, { id: "tenant", context: ctx, realm: () => ({ isolate: wide ? [Svc, Events] : [Svc] }), plugins: (k) => [{ id: "svc", plugin: svcPlugin(k.length, k === "bad" && failing) }], activationTimeout: 2000 })
      const both = yield* Effect.all([fam.use("acme", [Svc] as const, ([s]) => Effect.succeed(s.n)), fam.use("acme", [Svc] as const, ([s]) => Effect.succeed(s.n))], { concurrency: "unbounded" }).pipe((e) => drive(host, e))
      expect(both).toEqual([4, 4])
      yield* settleWriter
      expect(records.filter((r) => r.operation === "defineRealm" && r.phase === "requested").map((r) => [r.target?.id, r.actor.id, r.reason])).toEqual([["tenant/acme", "svc-tenancy", "tenant on demand"]])
      expect(records.some((r) => r.operation === "reconcile" && r.actor.id === "svc-tenancy")).toBe(true)
      expect((yield* Effect.exit(fam.use("a/b", [Svc] as const, () => Effect.void)))._tag).toBe("Failure")
      wide = true
      const changed = yield* Effect.exit(fam.use("acme", [Svc] as const, () => Effect.void))
      expect(JSON.stringify(changed)).toContain("options-changed")
      wide = false
      const f1 = yield* Effect.exit(drive(host, fam.use("bad", [Svc] as const, () => Effect.void)))
      expect(JSON.stringify(f1)).toContain("FamilyMemberUnavailable")
      const defines = records.filter((r) => r.operation === "defineRealm" && r.phase === "requested").length
      const f2 = yield* Effect.exit(fam.use("bad", [Svc] as const, () => Effect.void))
      expect(JSON.stringify(f2)).toContain("failed")
      expect(records.filter((r) => r.operation === "defineRealm" && r.phase === "requested").length).toBe(defines)   // not recreated
      failing = false
      yield* drive(host, fam.reset("bad", { context: ctx }))
      expect(yield* drive(host, fam.use("bad", [Svc] as const, ([s]) => Effect.succeed(s.n)))).toBe(3)
    })), { sink })
  })

  it("check 85: idle eviction prunes with pruneDrain and pruneForce false — a held lease leaves it parked (incomplete), retried; outcomes on the family's events only; retireRealm rules", async () => {
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const hostEvents = yield* collect(host)
      const fam = yield* Realm.family<string>(host, { id: "fam", context: { actor: alice }, realm: () => ({ isolate: [Svc] }), plugins: () => [{ id: "svc", plugin: svcPlugin(1) }], idleEvict: { after: 40, drain: 20 } })
      const out: Array<string> = []
      yield* Effect.forkScoped(fam.events.pipe(Stream.runForEach((e) => Effect.sync(() => { out.push(e.outcome) }))))
      yield* drive(host, fam.use("k", [Svc] as const, () => Effect.void))
      const lease = yield* Effect.forkChild(Effect.scoped(Effect.andThen(host.lease([Svc] as const, { realm: "fam/k" }), Effect.sleep(150))))
      yield* drive(host, Effect.sleep(120))
      expect(out[0]).toBe("incomplete")
      yield* Fiber.join(lease)
      yield* drive(host, Effect.sleep(200))
      expect(out).toContain("completed")
      expect((yield* host.snapshot).realms.map((r) => r.id)).not.toContain("fam/k")
      expect(typesOf(hostEvents).some((t) => t.startsWith("family"))).toBe(false)
    })), { options: { drainTimeout: 20 } })
    await onHost((host) => Effect.gen(function* () {
      expect(JSON.stringify(yield* Effect.exit(host.retireRealm("default", as())))).toContain("UnknownRealm")
      yield* host.defineRealm("r", { isolate: [] }, as())
      yield* host.install(empty("occupant"), { ...as(), realm: "r" })
      expect(JSON.stringify(yield* Effect.exit(host.retireRealm("r", as())))).toContain("RealmInUse")
      yield* drive(host, host.remove({ id: "occupant", realm: "r" }, as()))
      const before = (yield* host.snapshot).revision
      yield* host.retireRealm("r", as())
      expect((yield* host.snapshot).revision).toBe(before + 1)
      yield* host.defineRealm("r", { isolate: [] }, as())                         // redefinition allowed
    }))
    // An install into a realm retired between its validation and its linearization fails UnknownRealm.
    let hostRef: Testing.TestHost | undefined
    const gate: OperationGate["Service"] = { authorize: (r) => r.operation === "install" ? hostRef!.retireRealm("gone", as()).pipe(Effect.ignore) : Effect.void }
    await onHost((host) => Effect.gen(function* () {
      hostRef = host
      yield* host.defineRealm("gone", { isolate: [] }, as())
      const e = yield* Effect.exit(host.install(empty("late"), { ...as(), realm: "gone" }))
      expect(JSON.stringify(e)).toContain("UnknownRealm")
      expect((yield* host.snapshot).plugins).toEqual([])
    }), { gate })
  })

  it("check 86: Realm.ephemeral installs under the narrowed owner's context, undoes on failure, tears down and retires at scope close", async () => {
    const { records, sink } = rec()
    await onHost((host) => Effect.gen(function* () {
      const inside = yield* drive(host, Effect.scoped(Effect.gen(function* () {
        const eph = yield* Realm.ephemeral(host, { segment: "task-1", realm: { isolate: [Svc] }, plugins: [{ id: "svc", plugin: svcPlugin(9) }], context: { actor: alice, correlationId: "c-eph" } })
        expect(eph.context.actor).toEqual({ id: "user-alice/task-1", kind: "service" })
        return yield* eph.use([Svc] as const, ([s]) => Effect.succeed(s.n))
      })))
      expect(inside).toBe(9)
      expect((yield* host.snapshot).realms.map((r) => r.id)).not.toContain("ephemeral/task-1")
      yield* settleWriter
      expect(records.filter((r) => r.operation === "install").every((r) => r.actor.id === "user-alice/task-1")).toBe(true)
      const failed = yield* Effect.exit(drive(host, Effect.scoped(Realm.ephemeral(host, { segment: "task-2", realm: { isolate: [Svc] }, plugins: [{ id: "svc", plugin: svcPlugin(1, true) }], context: { actor: alice }, activationTimeout: 500 }))))
      expect(JSON.stringify(failed)).toContain("FamilyMemberUnavailable")
      expect((yield* host.snapshot).realms.map((r) => r.id)).not.toContain("ephemeral/task-2")
      expect((yield* host.snapshot).plugins).toEqual([])
    }), { sink })
  })
})
void Option; void Deferred; void (null as unknown as AuditRecord)
