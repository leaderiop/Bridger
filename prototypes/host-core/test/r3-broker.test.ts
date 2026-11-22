// Report 02 R3 (D-03): Broker, a stable facade over a contract registry (BEH-BR-168). Prototype; evidences no requirement.
import { Context, Deferred, Effect, Exit, Fiber, Layer, Schema, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { Broker } from "../src/broker.js"
import { Contract } from "../src/contract.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import type { CallEntry } from "../src/policy.js"
import { CallLog } from "../src/policy.js"
import { drive, idle } from "./fixtures.js"
import { as, stateIn } from "./p4fixtures.js"
import { errorOf, failedWith, onHost } from "./p7fixtures.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string>; readonly size: () => Effect.Effect<number> }>()("example/Board@1") {}
type Shape = Board["Service"]
const spec = (s: Schema.Top) => Contract.method({ payload: s, success: Schema.String })
const BoardV1 = Contract.make(Board, { version: "1.0.0", methods: { post: spec(Schema.String), size: spec(Schema.Void) } })
const impl = (tag: string, gate?: Deferred.Deferred<void>): Shape => ({ post: (s) => (gate ? Deferred.await(gate) : Effect.void).pipe(Effect.as(`${tag}:${s}`)), size: () => Effect.succeed(tag.length) })
const boardPlugin = (facade: Shape) => define({ id: "board", requires: [] as const, provides: [Board] as const, build: Layer.succeed(Board, facade) }) as unknown as AnyPlugin
const consumer = (seen: Array<string>) => define({ id: "reader", requires: [Board] as const, provides: [] as const,
  build: Layer.effectDiscard(Effect.gen(function* () { seen.push(yield* (yield* Board).post("hi")) })) as never }) as unknown as AnyPlugin
const idleReader = define({ id: "reader", requires: [Board] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin

describe("report 02 R3: broker (BEH-BR-168)", () => {
  it("delegates to the first contribution, selects by key, and fails typed when none is left", async () => {
    await onHost((host) => Effect.gen(function* () {
      const b = yield* Broker.make(BoardV1, { select: Broker.byKey((c) => (typeof c.args[0] === "string" && c.args[0].startsWith("b:") ? "beta" : undefined) ?? "acme") })
      yield* b.registry.add("acme", impl("acme"), { implements: "1.0.0" })
      const beta = yield* Scope.make()
      yield* b.registry.add("beta", impl("beta"), { implements: "1.0.0" }).pipe(Scope.provide(beta))
      expect(yield* b.service.post("x")).toBe("acme:x")
      expect(yield* b.service.post("b:x")).toBe("beta:b:x")
      yield* Scope.close(beta, Exit.void)
      expect(failedWith(yield* Effect.exit(b.service.post("b:x")), "ContributionUnavailable")).toBe(true)      // selected id gone, reselection finds none
      const first = yield* Broker.make(BoardV1, { name: "empty" })
      expect(failedWith(yield* Effect.exit(first.service.size()), "ContributionUnavailable")).toBe(true)
      void host
    }))
  })

  it("swaps an implementation under an in-flight call: the old one drains, new calls go to the new one, no consumer restarts", async () => {
    await onHost((host) => Effect.gen(function* () {
      const b = yield* Broker.make(BoardV1)
      const gate = yield* Deferred.make<void>()
      const v1 = yield* Scope.make()
      yield* b.registry.add("v1", impl("v1", gate), { implements: "1.0.0", priority: 1 }).pipe(Scope.provide(v1))
      yield* host.install(boardPlugin(b.service), as())
      yield* host.install(idleReader, as())
      yield* idle(host)
      expect(yield* stateIn(host, "reader")).toBe("active")
      const inflight = yield* Effect.forkChild(b.service.post("slow"))               // held on v1
      yield* Effect.yieldNow
      yield* b.registry.add("v2", impl("v2"), { implements: "1.0.0", priority: 0 }).pipe(Scope.provide(yield* Scope.make()))
      const closing = yield* Effect.forkChild(Scope.close(v1, Exit.void))            // v1 withdraws: hidden, drains behind the call
      yield* Effect.yieldNow
      expect(yield* b.service.post("fresh")).toBe("v2:fresh")                         // new calls already use v2
      expect(closing.pollUnsafe()).toBeUndefined()                                    // still draining
      yield* Deferred.succeed(gate, undefined)
      expect(yield* Fiber.join(inflight)).toBe("v1:slow")                             // the in-flight call finished on v1
      yield* Fiber.join(closing)
      expect(yield* stateIn(host, "reader")).toBe("active")
      expect((yield* host.snapshot).plugins.map((p) => p.state)).toEqual(["active", "active"])   // nothing restarted
    }))
  })

  it("refuses a contract-mismatched contribution at add, and the call log names the chosen contribution", async () => {
    const entries: Array<CallEntry> = []
    const layer = Layer.succeed(CallLog, { select: () => true, record: (e: CallEntry) => Effect.sync(() => { entries.push(e) }) })
    const seen: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      const b = yield* Broker.make(BoardV1)
      expect(errorOf(yield* Effect.exit(b.registry.add("old", impl("old"), { implements: "0.9.0" })))).toMatchObject({ _tag: "IncompatibleContract", dependentId: "registry:example/Board@1" })
      yield* b.registry.add("acme", impl("acme"), { implements: "1.0.0" })
      yield* host.install(boardPlugin(b.service), as())
      yield* host.install(consumer(seen), as())
      yield* idle(host)
      yield* drive(host, host.use(Board, (x) => x.post("y")))
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && entries.filter((e) => e.serviceId === "example/Board@1").length < 2;) yield* Effect.sleep(2)
      const calls = entries.filter((e) => e.serviceId === "example/Board@1")
      expect(calls.length).toBeGreaterThanOrEqual(1)
      expect(calls.every((e) => e.member === "post" && e.contribution === "acme")).toBe(true)
      expect(seen).toEqual(["acme:hi"])
    }), { layers: [layer] })
  })
})
