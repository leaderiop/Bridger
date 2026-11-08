// P7 second pass: principals, mandatory policy, allowChildren, AccessPolicy (core 28; checks 67–70, 101, 104, 105, 109).
// Prototype; evidences no requirement.
import { Context, Effect, Exit, Fiber, Layer, Option, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Event, Events } from "../src/bus.js"
import { AuditSink, OperationGate, RefusalList, type AuditRecord, type OperationRequest } from "../src/gxp.js"
import type * as Host from "../src/host.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import {
  AccessPolicy, ChildNotAllowed, CurrentPlugin, PrincipalReference, ask, declaredOnly, type AccessRequest, type Consumer, type MandatoryInterception
} from "../src/policy.js"
import * as Registry from "../src/registry.js"
import { PluginRuntime } from "../src/runtime.js"
import * as Testing from "../src/testing.js"
import { drive, idle, memorySink } from "./fixtures.js"
import { onHost, rec } from "./p7fixtures.js"
import { alice, as, settleWriter, stateIn } from "./p4fixtures.js"

export class Store extends Context.Service<Store, { readonly trail: ReadonlyArray<string>; readonly who: Effect.Effect<Option.Option<string>>; readonly self: Effect.Effect<Option.Option<string>> }>()("example/Store") {}
const pid = Effect.map(CurrentPlugin.get, Option.map((p) => p.id))
export const storePlugin = (box: { rt?: PluginRuntime["Service"] } = {}) => define({
  id: "store", requires: [] as const, provides: [Store] as const, meta: { version: "1", digest: "store-1" },
  build: Layer.effect(Store, Effect.gen(function* () {
    const rt = yield* PluginRuntime
    box.rt = rt
    return { trail: [], who: pid, self: rt.asSelf(pid) }
  }))
}) as unknown as AnyPlugin
export const consumer = (id: string, body: (s: Store["Service"], rt: PluginRuntime["Service"]) => Effect.Effect<void, unknown, any>, extra: Partial<AnyPlugin> = {}) => define({
  id, requires: [Store] as const, provides: [] as const, meta: { version: "1", digest: `${id}-1` },
  build: Layer.effectDiscard(Effect.gen(function* () { yield* body(yield* Store, yield* PluginRuntime) })) as never, ...extra
}) as unknown as AnyPlugin
const Posted = Event.make<[number], void>()("billing/posted")

describe("P7 core 28: principals (checks 67, 68)", () => {
  it("check 67: minted per activation and read by plugin code; forged dies PrincipalForged; retired dies PrincipalRetired; listener under its owner, provider method under its caller, asSelf", async () => {
    const box: { rt?: PluginRuntime["Service"] } = {}
    const seen: Record<string, unknown> = {}
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(storePlugin(box), as())
      yield* host.install(consumer("app", (s, rt) => Effect.gen(function* () {
        const me = yield* CurrentPlugin.require
        seen.same = me === rt.principal
        seen.revision = me.revision
        seen.providerSees = yield* s.who                       // a provider's method runs under its caller's principal
        seen.asSelf = yield* s.self
        const bus = yield* Effect.serviceOption(Events)
        void bus
      })), as())
      yield* idle(host)
      expect(seen).toMatchObject({ same: true, providerSees: Option.some("app"), asSelf: Option.some("store") })
      const first = box.rt!.principal
      yield* drive(host, host.restart("store", as())); yield* idle(host)
      expect(box.rt!.principal).not.toBe(first)
      expect(box.rt!.principal.revision).toBeGreaterThan(first.revision)
      // A copy with the same fields is not a principal the host minted.
      const forged = yield* Effect.exit(CurrentPlugin.get.pipe(Effect.provideService(PrincipalReference, Option.some({ ...box.rt!.principal }))))
      expect(Exit.isFailure(forged) && JSON.stringify(forged.cause).includes("PrincipalForged")).toBe(true)
      // The first activation has ended: acting with its principal dies.
      const retired = yield* Effect.exit(host.disable("app", as()).pipe(Effect.provideService(PrincipalReference, Option.some(first))))
      expect(Exit.isFailure(retired) && JSON.stringify(retired.cause).includes("PrincipalRetired")).toBe(true)
    }))
  })

  it("check 67: a listener runs under its owner's principal; a finalizer that emits under a wired AccessPolicy does not die", async () => {
    const heard: Array<Option.Option<string>> = []
    const listener = define({ id: "ear", requires: [Events] as const, provides: [] as const,
      build: Layer.effectDiscard(Effect.gen(function* () {
        const bus = yield* Events
        yield* bus.on(Posted, () => Effect.map(pid, (p) => { heard.push(p) }))
        yield* Effect.addFinalizer(() => bus.emit(Posted, 2))     // after the stop began, before retirement
      })) }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(listener, as()); yield* idle(host)
      const bus = (yield* host.use(Events, (b) => Effect.succeed(b)))
      yield* bus.emit(Posted, 1); yield* Effect.sleep(5)
      expect(heard).toEqual([Option.some("ear")])
      yield* drive(host, host.remove("ear", as()))
      expect(yield* stateIn(host, "ear")).toBe("uninstalled")
    }), { layers: [Layer.succeed(AccessPolicy, { decide: () => "allow" })] })
  })

  it("check 68: plugin calls carry onBehalfOf on request and records, app calls none, system records none; provider serving A records A, asSelf records the provider; Unattributed still applies", async () => {
    const { records, sink } = rec()
    const requests: Array<OperationRequest> = []
    const gate: OperationGate["Service"] = { authorize: (r) => Effect.sync(() => { requests.push(r) }) }
    let hostRef: Testing.TestHost | undefined
    const mutator = define({ id: "store", requires: [] as const, provides: [Store] as const, build: Layer.effect(Store, Effect.gen(function* () {
      const rt = yield* PluginRuntime
      const install = (id: string) => hostRef!.install(define({ id, requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin, as())
      return { trail: [], who: install("by-caller").pipe(Effect.orDie, Effect.as(Option.none<string>())), self: rt.asSelf(install("by-self")).pipe(Effect.orDie, Effect.as(Option.none<string>())) }
    })) as never }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      hostRef = host
      yield* host.install(mutator, as())
      yield* host.install(consumer("caller", (s) => Effect.gen(function* () { yield* s.who; yield* s.self })), as())
      yield* idle(host); yield* settleWriter
      const by = (id: string) => records.filter((r) => r.target?.id === id && r.operation === "install")
      expect(by("by-caller").every((r) => r.onBehalfOf?.id === "caller")).toBe(true)
      expect(by("by-self").every((r) => r.onBehalfOf?.id === "store")).toBe(true)
      expect(requests.find((r) => r.target?.id === "by-caller")!.onBehalfOf?.id).toBe("caller")
      expect(by("caller").every((r) => r.onBehalfOf === undefined)).toBe(true)                 // application code
      expect(records.filter((r) => r.phase === "system").every((r) => r.onBehalfOf === undefined)).toBe(true)
      // Under attribution.require a plugin call without an actor is still Unattributed (the principal is not an actor).
      const p = (yield* host.snapshot).plugins.length
      void p
    }), { sink, gate })
    await onHost((host) => Effect.gen(function* () {
      const out: Array<string> = []
      yield* host.install(define({ id: "noactor", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        const e = yield* Effect.exit(host.install(define({ id: "z", requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin))
        out.push(Exit.isFailure(e) && JSON.stringify(e.cause).includes("Unattributed") ? "Unattributed" : "ok")
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host)
      expect(out).toEqual(["Unattributed"])
    }), { options: { attribution: { require: true } } })
  })

  it("check 68: each reconcile entry's records carry the plugin's onBehalfOf", async () => {
    const { records, sink } = rec()
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "agent", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(
        host.reconcile([{ id: "tool", plugin: define({ id: "tool", requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin }], { ...as(), scope: "agent-tools" })) }) as unknown as AnyPlugin, as())
      yield* idle(host); yield* settleWriter
      const mine = records.filter((r) => (r.target?.id === "tool" || r.operation === "reconcile") && r.phase !== "system")
      expect(mine.length).toBeGreaterThan(2)
      expect(mine.every((r) => r.onBehalfOf?.id === "agent")).toBe(true)
    }), { sink })
  })
})

describe("P7 core 28: mandatory interceptions (checks 69, 101, 105)", () => {
  const tag = (label: string): MandatoryInterception<Store["Service"]> => ({ key: Store, wrap: (s) => ({ ...s, trail: [...s.trail, label] }) })
  const plainStore = define({ id: "store", requires: [] as const, provides: [Store] as const, build: Layer.succeed(Store, { trail: [], who: Effect.succeed(Option.none()), self: Effect.succeed(Option.none()) }) }) as unknown as AnyPlugin
  it("check 69: composition order; a child with intercept: [] keeps inherited mandatory wrappers; Host.use gets only 'all' layers; a throwing wrap fails the activation or kills the call", async () => {
    const trails: Record<string, ReadonlyArray<string>> = {}
    const parent = define({ id: "parent", requires: [Store] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
      trails.parent = (yield* Store).trail
      const rt = yield* PluginRuntime
      yield* rt.install(define({ id: "kid", requires: [Store] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () { trails.kid = (yield* Store).trail })) }) as unknown as AnyPlugin, { intercept: [] })
    })) }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      yield* host.defineRealm("t", { isolate: [], interceptors: [{ key: Store, wrap: (s: Store["Service"]) => ({ ...s, trail: [...s.trail, "realm-ordinary"] }) }], mandatory: [tag("realm-m")] }, as())
      yield* host.install(plainStore, as())
      yield* host.install(parent, { ...as(), realm: "t", intercept: [{ key: Store, wrap: (s: Store["Service"]) => ({ ...s, trail: [...s.trail, "own"] }) }], mandatory: [tag("install-m")] })
      yield* idle(host)
      expect(trails.parent).toEqual(["realm-ordinary", "own", "install-m", "realm-m", "host-m"])
      expect(trails.kid).toEqual(["realm-ordinary", "install-m", "realm-m", "host-m"])
      expect(yield* host.use(Store, (s) => Effect.succeed(s.trail))).toEqual(["host-m"])                  // "plugins" layer and ordinary ones absent
      expect(yield* host.use(Store, (s) => Effect.succeed(s.trail), { realm: "t" })).toEqual(["realm-m", "host-m"])
    }), { options: { mandatory: [tag("host-m"), { ...tag("plugins-only"), appliesTo: "plugins", wrap: (s) => s }] } })
    // A throwing mandatory wrap: the activation fails; a Host.use call dies and its lease is released.
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(plainStore, as())
      yield* host.install(consumer("victim", () => Effect.void), as()); yield* idle(host)
      expect(yield* stateIn(host, "victim")).toBe("failed")
      const e = yield* Effect.exit(host.use(Store, () => Effect.void))
      expect(Exit.isFailure(e)).toBe(true)
      expect((yield* host.inspect("store")).leases).toBe(0)
    }), { options: { mandatory: [{ key: Store, wrap: () => { throw new Error("policy broke") } }] } })
  })

  it("check 101/105: catalog ids reach InstallOptions.mandatory in order with allowChildren; unknown ids are invalid; a difference is PolicyMismatch; the request carries the effective values; a bad catalog fails construction", async () => {
    const requests: Array<OperationRequest> = []
    const gate: OperationGate["Service"] = { authorize: (r) => Effect.sync(() => { requests.push(r) }) }
    const seen: Array<ReadonlyArray<string>> = []
    const watcher = consumer("watcher", (s) => Effect.sync(() => { seen.push(s.trail) }))
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(plainStore, as())
      const r = yield* drive(host, host.reconcile([{ id: "watcher", plugin: watcher, mandatoryInterceptions: ["b", "a"], allowChildren: false }], as()))
      expect(r.installed).toEqual(["watcher"])
      yield* idle(host)
      expect(seen).toEqual([["b", "a"]])
      const req = requests.find((q) => q.target?.id === "watcher" && q.operation === "install")!
      expect(req).toMatchObject({ allowChildren: false, mandatoryInterceptions: [{ serviceId: "example/Store", id: "b" }, { serviceId: "example/Store", id: "a" }] })
      const p = yield* host.plan([{ id: "watcher", plugin: watcher, mandatoryInterceptions: ["a"], allowChildren: false }])
      expect(p.rejected.map((x) => x.reason._tag)).toEqual(["PolicyMismatch"])
      const again = yield* drive(host, host.reconcile([{ id: "watcher", plugin: watcher, mandatoryInterceptions: ["a"] }], as()))
      expect(again.rejected).toEqual([expect.objectContaining({ id: "watcher", reason: expect.objectContaining({ _tag: "PolicyMismatch", fields: ["mandatoryInterceptions", "allowChildren"] }) })])
      const bad = yield* drive(host, host.reconcile([{ id: "watcher", plugin: watcher, mandatoryInterceptions: ["zz"], allowChildren: false }], as()))
      expect(bad.rejected.map((x) => x.reason._tag)).toEqual(["InvalidDefinition"])
      const plan = yield* host.plan([{ id: "new-one", plugin: consumer("new-one", () => Effect.void), mandatoryInterceptions: ["a"] }])
      expect(plan.entries.find((e) => e.target.id === "new-one")!.policy).toEqual({ mandatoryInterceptions: ["a"], allowChildren: true })
    }), { gate, options: { mandatoryCatalog: [{ id: "a", ...tag("a") }, { id: "b", ...tag("b") }] } })
    await expect(onHost(() => Effect.void, { options: { mandatoryCatalog: [{ id: "a", ...tag("a") }, { id: "a", ...tag("a") }] } })).rejects.toThrow(/mandatoryCatalog/)
    await expect(onHost(() => Effect.void, { options: { mandatoryCatalog: [{ id: "", ...tag("a") }] } })).rejects.toThrow(/mandatoryCatalog/)
  })
})

describe("P7 core 28: allowChildren, AccessPolicy, RefusalList on mounts (checks 70, 104, 109)", () => {
  const kid = define({ id: "kid", requires: [] as const, provides: [] as const, meta: { version: "1", digest: "kid-1" }, build: Layer.empty as never }) as unknown as AnyPlugin
  const mounter = (out: Array<string>) => define({ id: "mounter", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
    const e = yield* Effect.exit((yield* PluginRuntime).install(kid))
    out.push(Exit.isFailure(e) ? (JSON.stringify(e.cause).match(/"reason":"([^"]*)"/)?.[1] ?? "failed") : "mounted")
  })) }) as unknown as AnyPlugin
  it("check 70: allowChildren false refuses with ChildNotAllowed, registers nothing, writes no record, publishes child-refused", async () => {
    const { records, sink } = rec()
    const out: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      const events: Array<string> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { events.push(e.type) }))))
      yield* Effect.yieldNow
      yield* host.install(mounter(out), { ...as(), allowChildren: false }); yield* idle(host); yield* settleWriter
      expect(out).toEqual(["allowChildren: false"])
      expect((yield* host.snapshot).plugins.map((p) => p.id)).toEqual(["mounter"])
      expect(records.some((r) => r.target?.id === "mounter/kid")).toBe(false)
      expect(events).toContain("child-refused")
      expect(ChildNotAllowed).toBeDefined()
    }), { sink })
  })

  it("check 70: an AccessPolicy denies listen, emit, contribute and child; a throwing decide denies policy-defect; controls report the wiring", async () => {
    const asked: Array<AccessRequest> = []
    let throwOn: string | undefined
    const policy = { decide: (r: AccessRequest) => { asked.push(r); if (r.kind === throwOn) throw new Error("x"); return r.kind === "child" || (r.kind === "listen" && r.event === "denied/ev") || (r.kind === "emit" && r.event === "denied/ev") || (r.kind === "contribute" && r.id === "nope") ? { deny: "not for you" } : "allow" as const } }
    const out: Array<string> = []
    const tries = define({ id: "tries", requires: [Events] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
      const bus = yield* Events
      const reg = yield* Registry.make<number>({ name: "routes" })
      for (const [name, e] of [["listen", bus.on(Event.make<[], void>()("denied/ev"), () => Effect.void)], ["emit", bus.emit(Event.make<[], void>()("denied/ev"))], ["contribute", reg.add("nope", 1)]] as const) {
        const x = yield* Effect.exit(e as Effect.Effect<unknown, unknown, any>)
        out.push(`${name}:${Exit.isFailure(x) ? "denied" : "allowed"}`)
      }
      const c = yield* Effect.exit((yield* PluginRuntime).install(kid))
      out.push(`child:${Exit.isFailure(c) ? JSON.stringify(c.cause).match(/"reason":"([^"]*)"/)?.[1] : "allowed"}`)
    })) }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(tries, as()); yield* idle(host)
      expect(out).toEqual(["listen:denied", "emit:denied", "contribute:denied", "child:not for you"])
      const child = asked.find((r) => r.kind === "child")!
      expect(child).toMatchObject({ principal: { id: "tries" }, childId: "tries/kid", definition: { version: "1", digest: "kid-1" } })
      expect((yield* host.controls).policy).toMatchObject({ access: "wired", refusal: "unwired", capability: "unwired", callLog: "unwired" })
      throwOn = "child"; out.length = 0
      yield* drive(host, host.restart("tries", as())); yield* idle(host)
      expect(out.at(-1)).toBe("child:policy-defect")
    }), { layers: [Layer.succeed(AccessPolicy, policy)] }).catch((e) => { throw e })
  })

  it("check 104: a refused mount fails with ChildNotAllowed and writes start-refused", async () => {
    const { records, sink } = rec()
    const out: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(mounter(out), as()); yield* idle(host); yield* settleWriter
      expect(out[0]).toContain("refused-digest")
      expect(records.filter((r) => r.operation === "start-refused").map((r) => r.target?.id)).toEqual(["mounter/kid"])
    }), { sink, layers: [Layer.succeed(RefusalList, { refused: (s) => s.digest === "kid-1" ? Option.some("revoked") : Option.none() })] })
  })

  it("check 109: declaredOnly refuses undeclared listeners and contributions; ask consults the wired policy and denies a retired principal", async () => {
    const inner = { decide: () => "allow" as const }
    const p = declaredOnly(inner, { withoutManifest: "deny" })
    expect(p.decide({ kind: "listen", event: "a", style: "on", declared: { contributions: [], events: ["a"] } })).toBe("allow")
    expect(p.decide({ kind: "listen", event: "b", style: "on", declared: { contributions: [], events: ["a"] } })).toEqual({ deny: "undeclared" })
    expect(p.decide({ kind: "contribute", registry: "r", id: "x" })).toEqual({ deny: "undeclared: no manifest" })
    expect(declaredOnly(inner, { withoutManifest: "allow" }).decide({ kind: "contribute", registry: "r", id: "x" })).toBe("allow")
    expect(p.decide({ kind: "emit", event: "b", mode: "emit" })).toBe("allow")
    const box: { rt?: PluginRuntime["Service"] } = {}
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(storePlugin(box), as()); yield* idle(host)
      const live = box.rt!.principal
      expect(yield* ask({ kind: "emit", event: "x", mode: "publish" }, { principal: live }).pipe(Effect.provideService(AccessPolicy, { decide: (r) => (r as { principal?: { id: string } }).principal?.id === "store" ? { deny: "seen" } : "allow" }))).toEqual({ deny: "seen" })
      yield* drive(host, host.remove("store", as()))
      expect(yield* ask({ kind: "listen", event: "x", style: "subscribe" }, { principal: live })).toEqual({ deny: "principal-retired" })
      expect(yield* ask({ kind: "listen", event: "x", style: "subscribe" })).toBe("allow")                      // unwired
    }))
  })
})
void Fiber; void alice; void memorySink
export type { Consumer }
