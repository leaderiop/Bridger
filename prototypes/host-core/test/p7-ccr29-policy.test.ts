// P7 third pass (CCR-BR-029 alignment): held event across a waiting removal (G-P14), mandatory sets on Host.use from
// plugin code (G-P16, BEH-BR-262), idle conditions (G-P17), call-log capacity at the reservation (G-P18).
// Prototype; evidences no requirement.
import { Context, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Event, Events } from "../src/bus.js"
import type { HostEvent } from "../src/events.js"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { CallLog, type CallEntry, type MandatoryInterception } from "../src/policy.js"
import type * as Testing from "../src/testing.js"
import { drive, idle } from "./fixtures.js"
import { as, stateIn } from "./p4fixtures.js"
import { onHost } from "./p7fixtures.js"

const Evt = Event.make<[string], void>()("billing/invoice-posted")
const evManifest = (id: string): PluginManifest => ({ manifestVersion: 1, id, version: "1.0.0", provides: [], requires: [{ serviceId: "@bridger/core/Events" }], activation: [{ _tag: "OnEvent", eventId: Evt.id }] })
const listener = (id: string, heard: Array<string>, run: (x: string) => Effect.Effect<void> = () => Effect.void) => define({
  id, requires: [Events] as const, provides: [] as const, meta: { version: "1.0.0" },
  build: Layer.effectDiscard(Effect.gen(function* () { yield* (yield* Events).on(Evt, (x) => Effect.sync(() => { heard.push(x) }).pipe(Effect.andThen(run(x)))) }))
}) as unknown as AnyPlugin
const emitFrom = (host: Testing.TestHost, v: string) => host.use(Events, (bus) => bus.emit(Evt, v))
const collect = (host: Testing.TestHost) => Effect.gen(function* () {
  const out: Array<HostEvent> = []
  yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { out.push(e) }))))
  yield* Effect.yieldNow
  return out
})
const drops = (events: Array<HostEvent>) => (events.filter((e) => e.type === ("held-event-dropped" as never)) as unknown as Array<{ reason: string }>).map((d) => d.reason)

describe("P7 third pass: a removal that waits for a running load (G-P14, BEH-BR-251)", () => {
  it("G-P14: the load then fails — the held event is dropped 'activation-failed', never 'ended'", async () => {
    await onHost((host) => Effect.gen(function* () {
      const events = yield* collect(host)
      yield* host.install(lazy({ manifest: evManifest("ear"), load: Effect.sleep(30).pipe(Effect.andThen(Effect.die("x"))) }), as())
      yield* emitFrom(host, "v")
      while ((yield* host.snapshot).plugins.find((p) => p.id === "ear")?.state !== "starting") { if (!(yield* host.step)) yield* Effect.yieldNow }
      yield* drive(host, host.remove("ear", as()))
      yield* Effect.sleep(5)
      expect(drops(events)).toEqual(["activation-failed"])
    }))
  })

  it("G-P14: the load then succeeds — the starting row discards the build (no publication), so the event is dropped once, 'ended' (finding G-P19)", async () => {
    const heard: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      const events = yield* collect(host)
      yield* host.install(lazy({ manifest: evManifest("ear"), load: Effect.sleep(30).pipe(Effect.as(listener("ear", heard))) }), as())
      yield* emitFrom(host, "v")
      while ((yield* host.snapshot).plugins.find((p) => p.id === "ear")?.state !== "starting") { if (!(yield* host.step)) yield* Effect.yieldNow }
      yield* drive(host, host.remove("ear", as()))
      yield* Effect.sleep(5)
      expect(heard).toEqual([])
      expect(drops(events)).toEqual(["ended"])
      expect(yield* stateIn(host, "ear")).toBe("uninstalled")
    }))
  })
})

describe("P7 third pass: idle conditions (G-P17, BEH-BR-252)", () => {
  it("G-P17: a running Bridger.Events listener of the plugin keeps it from idling; it idles once the run ends", async () => {
    const heard: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      yield* Effect.forkScoped(Effect.forever(Effect.gen(function* () { if (!(yield* host.step)) yield* Effect.sleep(1) })))
      yield* host.install(lazy({ manifest: evManifest("ear"), load: Effect.succeed(listener("ear", heard, () => Effect.sleep(150))), idle: 20 }), as())
      yield* emitFrom(host, "v")                                                 // wakes it; the held event runs the slow listener
      while (heard.length === 0) yield* Effect.sleep(2)
      yield* Effect.sleep(100)
      expect(yield* stateIn(host, "ear")).toBe("active")                         // idle 20 ms, but a listener is running
      let n = 0
      while ((yield* stateIn(host, "ear")) !== "dormant" && n++ < 200) yield* Effect.sleep(2)
      expect(yield* stateIn(host, "ear")).toBe("dormant")
    }))
  })
})

describe("P7 third pass: mandatory sets on Host.use from plugin code (G-P16 not adopted, BEH-BR-262)", () => {
  class Store extends Context.Service<Store, { readonly trail: ReadonlyArray<string> }>()("example/Store") {}
  const tag = (label: string, appliesTo?: "all" | "plugins"): MandatoryInterception<Store["Service"]> => ({ key: Store, ...(appliesTo ? { appliesTo } : {}), wrap: (s) => ({ ...s, trail: [...s.trail, label] }) })
  const store = define({ id: "store", requires: [] as const, provides: [Store] as const, build: Layer.succeed(Store, { trail: [] }) }) as unknown as AnyPlugin
  it("G-P16: a plugin's Host.use keeps its installation and registration-realm sets; a call realm adds its own outside them; 'plugins' layers apply; the application gets 'all' only", async () => {
    const trails: Record<string, ReadonlyArray<string>> = {}
    await onHost((host) => Effect.gen(function* () {
      yield* host.defineRealm("t", { isolate: [], mandatory: [tag("realm-t")] }, as())
      yield* host.defineRealm("u", { isolate: [], mandatory: [tag("realm-u")] }, as())
      yield* host.install(store, as())
      yield* host.install(define({ id: "caller", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        trails.own = yield* host.use(Store, (s) => Effect.succeed(s.trail))
        trails.other = yield* host.use(Store, (s) => Effect.succeed(s.trail), { realm: "u" })
      })) }) as unknown as AnyPlugin, { ...as(), realm: "t", mandatory: [tag("install")] })
      yield* idle(host)
      expect(yield* stateIn(host, "caller", "t")).toBe("active")
      expect(trails.own).toEqual(["install", "realm-t", "host", "host-plugins"])
      expect(trails.other).toEqual(["install", "realm-t", "realm-u", "host", "host-plugins"])
      expect(yield* host.use(Store, (s) => Effect.succeed(s.trail), { realm: "u" })).toEqual(["realm-u", "host"])
    }), { options: { mandatory: [tag("host"), tag("host-plugins", "plugins")] } })
  })
})

describe("P7 third pass: call-log capacity is judged at the reservation (G-P18, BEH-BR-279)", () => {
  class Slow extends Context.Service<Slow, { readonly get: Effect.Effect<number> }>()("example/Slow") {}
  const slow = define({ id: "slow", requires: [] as const, provides: [Slow] as const, build: Layer.succeed(Slow, { get: Effect.sleep(30).pipe(Effect.as(7)) }) }) as unknown as AnyPlugin
  const log = (record: (e: CallEntry) => Effect.Effect<void>) => Layer.succeed(CallLog, { select: (r) => r.serviceId === "example/Slow" ? "refuse" : false, record, queue: 1 })
  it("G-P18: a member that 'refuse' let run never dies queue-full, though the queue fills while it runs; an offered entry is dropped instead", async () => {
    const recorded: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(slow, as()); yield* idle(host)
      const call = yield* Effect.forkChild(host.use(Slow, (s) => s.get))
      yield* Effect.sleep(5)                                                     // the member is running; its slot is reserved
      yield* host.offerCallEntry({ kind: "crossing", companion: "x", serviceId: "s", outcome: "success", crossing: { direction: "outbound", link: "l" } })
      expect(yield* Fiber.join(call)).toBe(7)
      const c = (yield* host.controls).callLog!
      expect(c).toMatchObject({ dropped: 1, refused: 0 })
      expect(recorded).toEqual(["call"])
    }), { layers: [log((e) => Effect.sync(() => { recorded.push(e.kind) }))] })
  })

  it("G-P18: under 'refuse' a record that fails makes the call die record-failed; the value never reaches the consumer", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(slow, as()); yield* idle(host)
      const got: Array<number> = []
      const exit = yield* Effect.exit(host.use(Slow, (s) => Effect.tap(s.get, (n) => Effect.sync(() => { got.push(n) }))))
      expect(Exit.isFailure(exit) && JSON.stringify(exit.cause).includes("record-failed")).toBe(true)
      expect(got).toEqual([])
      expect((yield* host.controls).callLog).toMatchObject({ failed: 1, refused: 1 })
    }), { layers: [log(() => Effect.die("sink down"))] })
  })
})
