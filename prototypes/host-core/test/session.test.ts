// Remote sessions over the in-memory wire: epochs, stale-epoch refusal, heartbeat, partition and a fresh epoch per session
// (remote BEH-RM-010, 011, 025, 029). Real timers with small intervals.
import { Context, Effect, Exit, Fiber, Logger, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { duplex, guestServe, linkHandshake, type Connection } from "../src/wire.js"
import { openPerCallSession, openSession, serveGuest, startLink, type CallFailure, type Session } from "../src/session.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const d = Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String }) } }).descriptor
const side = { version: d.version, methods: d.methods, schemas: d.schemas }
const contract = { id: "example/Board@1", accepts: "^1.2", ...side }
const hb = { every: 50, missed: 4 }
const opts = (epoch = "e-1") => ({ epoch, wire: [1], contract, heartbeat: hb })
const guest = (handlers = { post: (p: unknown) => Effect.succeed(`posted:${String(p)}`) }) => ({ wire: [1], served: [side], maxInFlight: 4, handlers })
const open = (c: Connection, e = "e-1") => openSession(c, opts(e)).pipe(Effect.map((s) => s as Session))
const fails = <A>(e: Effect.Effect<A, CallFailure>) => Effect.flip(e)

describe("session", () => {
  it("carries calls and results under the session's epoch, and reports an unknown method", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest()))
      const s = yield* open(a)
      expect(s.epoch).toBe("e-1"); expect(s.version).toBe("1.2.0")
      expect(yield* s.call("post", "hi")).toBe("posted:hi")
      expect(yield* fails(s.call("nope", 1))).toMatchObject({ _tag: "MethodNotServed", outcome: "not-executed" })
      yield* s.close
    }))
  })

  it("the guest never executes a call of another epoch: it answers StaleEpoch, not-executed", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      let ran = 0
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest({ post: () => Effect.sync(() => { ran++; return "x" }) })))
      const s = yield* open(a)
      yield* a.send(JSON.stringify({ t: "call", epoch: "old-epoch", callId: "z", method: "post", payload: "p" }))
      yield* Effect.sleep(30)                                                                // the guest's StaleEpoch answer reaches the link's loop: another epoch, dropped and counted
      expect(yield* s.refusals).toBe(1)
      expect(ran).toBe(0)
      yield* s.close
    }))
  })

  it("the link drops a result of another epoch, counts it, and completes no call with it", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      const answer = yield* Effect.forkChild(guestServe(b, guest()))
      const s = yield* open(a)
      yield* Effect.forkChild(Effect.gen(function* () { yield* b.receive; yield* b.send(JSON.stringify({ t: "result", epoch: "old", callId: "c-1", value: "forged" })) }))
      const call = yield* Effect.forkChild(s.call("post", "q"))
      yield* Effect.sleep(30)
      expect(yield* s.refusals).toBe(1)
      yield* s.close
      const exit = yield* Fiber.await(call)
      expect(Exit.isFailure(exit)).toBe(true)                                                // ended by close, never completed by the forged result
      void answer
    }))
  })

  it("a silent guest ends the session with heartbeat-missed and the call in flight fails with outcome unknown", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* Effect.forkChild(guestServe(b, guest()))                      // answers the handshake, then says nothing
      const s = yield* open(a)
      const t0 = Date.now()
      const failure = yield* fails(s.call("post", "x"))
      expect(failure).toMatchObject({ _tag: "SessionLost", outcome: "unknown" })
      expect(yield* s.ended).toBe("heartbeat-missed")
      expect(Date.now() - t0).toBeGreaterThanOrEqual(190)                  // every × missed = 200 ms
      expect(yield* fails(s.call("post", "y"))).toMatchObject({ _tag: "SessionLost", outcome: "not-executed" })
    }))
  })

  it("an answering guest keeps the session alive past every × missed", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest()))
      const s = yield* open(a)
      yield* Effect.sleep(450)
      expect(yield* s.call("post", "still")).toBe("posted:still")
      yield* s.close
    }))
  })

  it("a guest that answers StaleEpoch ends the session with guest-reset at once", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* Effect.forkChild(Effect.gen(function* () {
        yield* guestServe(b, guest())
        while (true) { const f = JSON.parse(yield* b.receive) as { callId?: string; epoch: string }; if (f.callId) yield* b.send(JSON.stringify({ t: "result", epoch: f.epoch, callId: f.callId, error: { _tag: "StaleEpoch", epoch: f.epoch } })) }
      }))
      const s = yield* open(a)
      expect(yield* fails(s.call("post", "x"))).toMatchObject({ _tag: "StaleEpoch", outcome: "not-executed" })
      expect(yield* s.ended).toBe("guest-reset")
    }))
  })
})

describe("link", () => {
  it("opens a new session with a new epoch after a partition, never reusing one, and shows the partition in its status", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      let dials = 0
      const dial = Effect.gen(function* () {
        const [a, b] = yield* duplex
        dials++
        yield* Effect.forkChild(dials === 1 ? guestServe(b, guest()) : serveGuest(b, guest()))        // the first guest goes silent after its handshake
        return a
      })
      const link = yield* startLink(dial, { wire: [1], contract, heartbeat: hb, backoff: 20 })
      yield* Effect.sleep(100)
      expect((yield* link.status).state).toBe("active")
      yield* Effect.sleep(500)
      const st = yield* link.status
      expect(st.sessions.map((x) => x.epoch)).toEqual(["epoch-1", "epoch-2"])
      expect(st.sessions[0]!.ended).toBe("heartbeat-missed")
      expect(st.state).toBe("active")
      const cur = yield* link.current
      expect(Option.isSome(cur) && (yield* cur.value.call("post", "again"))).toBe("posted:again")
      yield* link.stop
      expect((yield* link.status).state).toBe("stopped")
    }))
  })

  it("the guest answers a ping of its own epoch only", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest()))
      yield* linkHandshake(a, { wire: [1], epoch: "e-1", contract })
      yield* a.send(JSON.stringify({ t: "ping", epoch: "other", n: 1 }))
      yield* a.send(JSON.stringify({ t: "ping", epoch: "e-1", n: 2 }))
      const reply = JSON.parse(yield* a.receive) as { t: string; epoch: string; n: number }
      expect(reply).toEqual({ t: "pong", epoch: "e-1", n: 2 })                    // the first ping got no pong
    }))
  })

  it("a refusal from the guest after the handshake ends the session with guest-reset", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* Effect.forkChild(Effect.gen(function* () { yield* guestServe(b, guest()); yield* b.send(JSON.stringify({ t: "refuse", epoch: "e-1", reason: "stale-epoch" })) }))
      const s = yield* open(a)
      expect(yield* s.ended).toBe("guest-reset")
    }))
  })

  const silentThenLive = () => { let n = 0; return Effect.gen(function* () { const [a, b] = yield* duplex; n++; yield* Effect.forkChild(n === 1 ? guestServe(b, guest()) : serveGuest(b, guest())); return a }) }

  it("mounts no child for a session that ends before stableFor, and counts withdrawals only for mounted ones (BEH-RM-029)", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const mounted: string[] = [], ended: string[] = []
      const link = yield* startLink(silentThenLive(), { wire: [1], contract, heartbeat: hb, backoff: 20, stableFor: 400,
        onSession: (x) => Effect.sync(() => { mounted.push(x.epoch) }), onEnd: (x) => Effect.sync(() => { ended.push(x.epoch) }) })
      yield* Effect.sleep(330)                                   // session 1 dies at ~200 ms, before stableFor
      expect(mounted).toEqual([]); expect(ended).toEqual([]); expect((yield* link.status).withdrawals).toBe(0)
      yield* Effect.sleep(700)                                   // session 2 is live and stable
      expect(mounted).toEqual(["epoch-2"])
      yield* link.stop
    }))
  })

  it("counts withdrawals and warns past flapWarning within flapWindow", async () => {
    const lines: string[] = []
    await Effect.runPromise(Effect.gen(function* () {
      const dial = Effect.gen(function* () { const [a, b] = yield* duplex; yield* Effect.forkChild(guestServe(b, guest())); return a })   // always silent
      const link = yield* startLink(dial, { wire: [1], contract, heartbeat: { every: 10, missed: 2 }, backoff: 5, flapWarning: 1, flapWindow: 60_000 })
      yield* Effect.sleep(400)
      expect((yield* link.status).withdrawals).toBeGreaterThanOrEqual(2)
      yield* link.stop
      expect(lines.some((l) => /flapping/.test(l))).toBe(true)
    }).pipe(Effect.provide(Logger.layer([Logger.make<unknown, void>(({ message }) => { lines.push(String(message)) })]))))
  })

  it("does not warn when the withdrawals are spread wider than flapWindow", async () => {
    const lines: string[] = []
    await Effect.runPromise(Effect.gen(function* () {
      const dial = Effect.gen(function* () { const [a, b] = yield* duplex; yield* Effect.forkChild(guestServe(b, guest())); return a })
      const link = yield* startLink(dial, { wire: [1], contract, heartbeat: { every: 10, missed: 2 }, backoff: 5, flapWarning: 1, flapWindow: 1 })
      yield* Effect.sleep(400)
      expect((yield* link.status).withdrawals).toBeGreaterThanOrEqual(2)
      yield* link.stop
      expect(lines.some((l) => /flapping/.test(l))).toBe(false)
    }).pipe(Effect.provide(Logger.layer([Logger.make<unknown, void>(({ message }) => { lines.push(String(message)) })]))))
  })
})

describe("per-call transport (BEH-RM-025)", () => {
  const stub = () => Effect.gen(function* () {
    const [a, b] = yield* duplex
    yield* Effect.forkChild(serveGuest(b, guest()))
    const ctl = { down: false, sent: [] as string[] }
    const invoke = (frame: string) => Effect.gen(function* () {
      ctl.sent.push(frame)
      if (ctl.down) return yield* Effect.fail("unreachable")
      yield* a.send(frame); return yield* a.receive
    })
    return { invoke, ctl }
  })
  const po = { epoch: "p-1", wire: [1], contract, unavailableAfter: 3 }

  it("calls with the epoch and version on every invocation, sends no ping, and ends after unavailableAfter consecutive transport failures", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const { invoke, ctl } = yield* stub()
      const s = (yield* openPerCallSession(invoke, po)) as Session
      expect(yield* s.call("post", "a")).toBe("posted:a")
      expect(JSON.parse(ctl.sent.at(-1)!)).toMatchObject({ t: "call", epoch: "p-1", version: "1.2.0" })
      yield* Effect.sleep(120)
      expect(ctl.sent.some((f) => JSON.parse(f).t === "ping")).toBe(false)
      ctl.down = true
      expect(yield* fails(s.call("post", "b"))).toMatchObject({ _tag: "SessionLost", outcome: "unknown" })
      ctl.down = false
      expect(yield* s.call("post", "c")).toBe("posted:c")                          // a success resets the count
      ctl.down = true
      yield* fails(s.call("post", "x1")); yield* fails(s.call("post", "x2"))        // two since the success: still open
      ctl.down = false
      expect(yield* s.call("post", "d")).toBe("posted:d")
      ctl.down = true
      for (let i = 0; i < 3; i++) yield* fails(s.call("post", "x"))
      expect(yield* s.ended).toBe("unavailable")
      expect(yield* fails(s.call("post", "y"))).toMatchObject({ _tag: "SessionLost", outcome: "not-executed" })
    }))
  })

  it("a StaleEpoch answer ends the session at once, whatever the count", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const { invoke } = yield* stub()
      const s = (yield* openPerCallSession((f) => invoke(f.includes('"t":"call"') ? f.replace('"p-1"', '"old"') : f), po)) as Session
      expect(yield* fails(s.call("post", "a"))).toMatchObject({ _tag: "StaleEpoch" })
      expect(yield* s.ended).toBe("guest-reset")
    }))
  })
})
