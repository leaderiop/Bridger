// Remote BEH-RM-026, 027, 029 through the host: a session child while a session is open; a partition withdraws it and the
// dependent waits (never fails); a new session restores it under a new epoch.
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { remoteProxy } from "../src/remoteproxy.js"
import { serveGuest } from "../src/session.js"
import { duplex, guestServe } from "../src/wire.js"
import { as, run, stateIn } from "./p4fixtures.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const board = Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String }) } })
const served = { version: "1.4.0", methods: board.descriptor.methods, schemas: board.descriptor.schemas }

describe("remote proxy plugin", () => {
  it("withdraws the session child on a partition so the dependent waits, and restores it under a new epoch", async () => {
    let dials = 0
    const ends: string[] = []
    const dial = Effect.gen(function* () {
      const [a, b] = yield* duplex
      dials++
      const handlers = { post: (p: unknown) => Effect.succeed(`remote:${String(p)}`) }
      yield* Effect.forkChild(dials === 1 ? guestServe(b, { wire: [1], served: [served], maxInFlight: 4 }) : serveGuest(b, { wire: [1], served: [served], maxInFlight: 4, handlers }))
      return a
    })
    const proxy = remoteProxy({ id: "boards", contract: board, accepts: "^1.2", dial, heartbeat: { every: 20, missed: 3 }, backoff: 250, onEnd: (w) => ends.push(w) })
    const reader = define({ id: "reader", requires: [board.range("^1.2")] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      const until = (cond: Effect.Effect<boolean>, label: string) => Effect.gen(function* () {
        for (let i = 0; i < 600; i++) { while (yield* host.step) { /* drain the scheduler */ } if (yield* cond) return; yield* Effect.sleep(5) }
        throw new Error(`timed out waiting for ${label}`)
      })
      yield* host.install(reader, as()); yield* host.install(proxy, as())
      yield* until(Effect.map(stateIn(host, "reader"), (s) => s === "active"), "reader active on the first session")
      expect(yield* stateIn(host, "boards/session")).toBe("active")
      yield* until(Effect.map(stateIn(host, "reader"), (s) => s === "waiting"), "reader waiting after the partition")
      expect(ends).toContain("heartbeat-missed")
      expect(yield* stateIn(host, "boards/session")).toBe("uninstalled")          // withdrawn, not failed
      expect(yield* stateIn(host, "reader")).not.toBe("failed")
      yield* until(Effect.map(stateIn(host, "reader"), (s) => s === "active"), "reader active on the second session")
      expect(dials).toBeGreaterThanOrEqual(2)
      const callFiber = yield* Effect.forkChild(host.use(board.range("^1.2") as never, (svc: { post: (s: string) => Effect.Effect<string> }) => svc.post("hi")))
      yield* until(Effect.sync(() => callFiber.pollUnsafe() !== undefined), "the remote call to return")
      expect(JSON.stringify(callFiber.pollUnsafe())).toContain("remote:hi")                // served by the guest of the new session
    }), { options: { drainTimeout: 200 } })
  }, 15000)
})
