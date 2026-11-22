// Report 06 R1 (S1, S2): plugin code runs in a closed context (BEH-BR-036, ADR-BR-055).
import { Context, Effect, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { Event, Events, type EventBus } from "../src/bus.js"
import { PluginRuntime } from "../src/runtime.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { as, run } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

/** Stands for any host port or application service in the install caller's environment. */
class Ambient extends Context.Service<Ambient, { readonly secret: string }>()("example/Ambient") {}

const prober = (seen: Record<string, boolean>) => {
  const probe = (where: string) => Effect.map(Effect.serviceOption(Ambient), (o) => { seen[where] = Option.isSome(o) })
  return define({
    id: "prober",
    requires: [] as const,
    provides: [] as const,
    build: Layer.effectDiscard(Effect.gen(function* () {
      yield* probe("build")
      yield* Effect.addFinalizer(() => probe("finalizer"))
      const rt = yield* PluginRuntime
      yield* rt.background("probe", probe("background"))
    })) as unknown as AnyPlugin["build"]
  }) as AnyPlugin
}

class Svc extends Context.Service<Svc, { readonly ping: () => number }>()("sec/Svc") {}
const Ping = Event.make<[], void, never>()("sec/ping", { mode: "emit" })

describe("closed plugin context (BEH-BR-036, BEH-BR-130, check 115)", () => {
  it("a service in the install caller's environment is unreachable from build, finalizer and background fibers", async () => {
    const seen: Record<string, boolean> = {}
    await run((host) => Effect.gen(function* () {
      yield* drive(host, host.install(prober(seen), as()).pipe(Effect.provideService(Ambient, { secret: "s" })))
      yield* idle(host)
      yield* drive(host, host.remove("prober", as()))
    }))
    expect(seen).toEqual({ build: false, finalizer: false, background: false })
  })

  it("a listener does not see a service the emitter's environment provides", async () => {
    const seen: Record<string, boolean> = {}
    const listener: AnyPlugin = {
      id: "listener", requires: [Events], provides: [],
      build: Layer.effectDiscard(Effect.gen(function* () {
        const bus: EventBus = yield* Events
        yield* bus.on(Ping, () => Effect.map(Effect.serviceOption(Ambient), (o) => { seen.listener = Option.isSome(o) }))
      })) as unknown as AnyPlugin["build"]
    }
    await run((host) => Effect.gen(function* () {
      yield* drive(host, host.install(listener, as()))
      yield* idle(host)
      const bus = (yield* host.use(Events, (b) => Effect.succeed(b))) as EventBus
      yield* drive(host, bus.emit(Ping).pipe(Effect.provideService(Ambient, { secret: "s" })))
      yield* idle(host)
    }))
    expect(seen).toEqual({ listener: false })
  })

  it("a build that reaches a service it did not declare fails the activation as UndeclaredAccess, naming plugin and key", async () => {
    const greedy: AnyPlugin = {
      id: "greedy", requires: [], provides: [],
      build: Layer.effectDiscard(Effect.service(Ambient)) as unknown as AnyPlugin["build"]
    }
    await run((host) => Effect.gen(function* () {
      yield* drive(host, host.install(greedy, as()).pipe(Effect.provideService(Ambient, { secret: "s" })))
      yield* idle(host)
      const row = (yield* host.snapshot).plugins.find((p) => p.id === "greedy")
      const message = row?.state === "failed" ? row.failure.message : ""
      expect(message).toContain("UndeclaredAccess example/Ambient")
      expect(message).toContain("greedy")
    }))
  })

  it("a service kept past its lease works while its provider is active and throws InactiveAccess once the activation is gone", async () => {
    const provider: AnyPlugin = {
      id: "svc", requires: [], provides: [Svc],
      build: Layer.succeed(Svc, { ping: () => 1 }) as unknown as AnyPlugin["build"]
    }
    await run((host) => Effect.gen(function* () {
      yield* drive(host, host.install(provider, as()))
      yield* idle(host)
      const kept = yield* host.use(Svc, (s) => Effect.succeed(s))
      const detached = kept.ping
      expect(kept.ping()).toBe(1)                                  // lease ended, provider active: still valid
      yield* drive(host, host.remove("svc", as()))
      yield* idle(host)
      expect(() => kept.ping()).toThrow("InactiveAccess sec/Svc")
      expect(() => detached()).toThrow("InactiveAccess sec/Svc")   // a detached method fails too
    }))
  })
})
