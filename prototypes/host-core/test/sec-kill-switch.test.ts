// Report 06 R5: the kill switch removes through the host and, with restartGate, a revoked resident module blocks operator changes until a new incarnation.
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Gate } from "../src/gate.js"
import { makeKillSwitch } from "../src/kill-switch.js"
import { restartGate } from "../src/loader.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive, idle } from "./fixtures.js"
import { alice, as } from "./p4fixtures.js"
import { onHost } from "./p7fixtures.js"

const p = (id: string, digest: string) => define({ id, requires: [] as const, provides: [] as const, meta: { version: "1", digest }, build: Layer.effectDiscard(Effect.void) }) as unknown as AnyPlugin

describe("kill switch with restartGate", () => {
  it("revoking a digest removes the plugin, leaves the code resident, and a strict restartGate refuses installs until the process restarts", async () => {
    const revoked = new Set<string>(), resident = new Set<string>(["d-bad", "d-ok"])
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(p("bad", "d-bad"), as())); yield* drive(host, host.install(p("ok", "d-ok"), as())); yield* idle(host)
      const ks = makeKillSwitch({
        revoked: () => revoked, resident: () => resident, maxDroppedPerRun: 5,
        installed: () => Effect.map(host.snapshot, (s) => s.plugins.map((x) => ({ id: x.id, realm: x.realm, digest: x.meta?.digest ?? "" }))),
        remove: (x) => drive(host, host.remove(x.id, as())).pipe(Effect.asVoid)
      })
      expect((yield* ks.status).restartRequired).toBe(false)
      revoked.add("d-bad")
      const r = yield* ks.run
      expect(r).toMatchObject({ removed: ["bad"], pending: [], held: false })
      yield* idle(host)
      expect((yield* host.snapshot).plugins.map((x) => x.id)).toEqual(["ok"])
      expect(yield* ks.status).toMatchObject({ residentRevoked: ["d-bad"], restartRequired: true })
      const gate = Gate.all([{ name: "restart", gate: restartGate({ current: ks.status }, { policy: "strict", allow: ["remove"] }), timeout: 1000 }])
      expect(JSON.stringify(yield* Effect.exit(gate.decide({ operation: "install", actor: alice, correlationId: "c" } as never, { annotations: undefined as never })))).toContain("resident-revoked")
      resident.delete("d-bad")                                    // a new incarnation: the code is gone
      expect((yield* ks.status).restartRequired).toBe(false)
    }))
  })
  it("a run above maxDroppedPerRun is held until release, which removes only plugins still dropped", async () => {
    const revoked = new Set<string>(["d1", "d2", "d3"])
    await onHost((host) => Effect.gen(function* () {
      for (const n of ["a", "b", "c"]) yield* drive(host, host.install(p(n, `d${["a", "b", "c"].indexOf(n) + 1}`), as()))
      yield* idle(host)
      const ks = makeKillSwitch({ revoked: () => revoked, resident: () => [], maxDroppedPerRun: 2,
        installed: () => Effect.map(host.snapshot, (s) => s.plugins.map((x) => ({ id: x.id, realm: x.realm, digest: x.meta?.digest ?? "" }))),
        remove: (x) => drive(host, host.remove(x.id, as())).pipe(Effect.asVoid) })
      const r = yield* ks.run
      expect(r).toMatchObject({ held: true, removed: [] })
      expect((yield* host.snapshot).plugins).toHaveLength(3)
      revoked.delete("d3")                                         // un-revoked while held
      expect(yield* ks.release(r.run)).toEqual(["a", "b"])
      yield* idle(host)
      expect((yield* host.snapshot).plugins.map((x) => x.id)).toEqual(["c"])
    }))
  })
  it("a plugin outside the delegated scope is reported, not removed, and not counted", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(p("mine", "d1"), as())); yield* drive(host, host.install(p("theirs", "d2"), as())); yield* idle(host)
      const ks = makeKillSwitch({ revoked: () => new Set(["d1", "d2"]), resident: () => [], maxDroppedPerRun: 1, inScope: (x) => x.id === "mine",
        installed: () => Effect.map(host.snapshot, (s) => s.plugins.map((x) => ({ id: x.id, realm: x.realm, digest: x.meta?.digest ?? "" }))),
        remove: (x) => drive(host, host.remove(x.id, as())).pipe(Effect.asVoid) })
      expect(yield* ks.run).toMatchObject({ removed: ["mine"], held: false })
      expect((yield* ks.status).outsideScope).toEqual([{ id: "theirs", realm: "default", digest: "d2" }])
    }))
  })
})

describe("kill switch loop (BEH-LD-029)", () => {
  it("runs on start, on every change, and retries a refused removal on the clock until the gate allows it", async () => {
    const { Fiber, Queue, Duration } = await import("effect")
    const { TestClock } = await import("effect/testing")
    const { makeKillSwitch: make } = await import("../src/kill-switch.js")
    const revoked = new Set<string>(), present = new Map([["a", "d1"], ["b", "d2"]])
    let allow = false
    const removed: Array<string> = []
    const program = Effect.gen(function* () {
      const ks = make({
        revoked: () => revoked, resident: () => [], maxDroppedPerRun: 5,
        installed: () => Effect.sync(() => [...present].map(([id, digest]) => ({ id, realm: "default", digest }))),
        remove: (x) => allow ? Effect.sync(() => { present.delete(x.id); removed.push(x.id) }) : Effect.fail("refused")
      })
      const changes = yield* Queue.unbounded<unknown>()
      const f = yield* Effect.forkChild(ks.loop(changes, Duration.seconds(10)))
      yield* Effect.yieldNow
      expect(removed).toEqual([])                                   // nothing revoked at start
      revoked.add("d1"); yield* Queue.offer(changes, 1); yield* Effect.yieldNow; yield* Effect.yieldNow
      expect(removed).toEqual([])                                   // refused: pending, not forced
      allow = true
      yield* TestClock.adjust(Duration.seconds(10)); yield* Effect.yieldNow; yield* Effect.yieldNow
      expect(removed).toEqual(["a"])                                // retried on the clock
      revoked.add("d2"); yield* Queue.offer(changes, 2); yield* Effect.yieldNow; yield* Effect.yieldNow
      expect(removed).toEqual(["a", "b"])
      yield* Fiber.interrupt(f)
    })
    await Effect.runPromise(Effect.scoped(program).pipe(Effect.provide(TestClock.layer())))
  })
})
