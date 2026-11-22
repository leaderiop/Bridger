// A guest handler calls back into the host over the session, on the in-memory wire and over loopback TCP (BEH-RM-046, 011).
import { Context, Effect, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { dialSocket, listen } from "../src/net.js"
import { openSession, serveGuest, type Session } from "../src/session.js"
import { duplex } from "../src/wire.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const d = Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String }) } }).descriptor
const side = { version: d.version, methods: d.methods, schemas: d.schemas }
const contract = { id: "example/Board@1", accepts: "^1.2", ...side }
const base = (epoch: string) => ({ epoch, wire: [1], contract, heartbeat: { every: 100, missed: 5 } })
const hostSide = (ran: string[]) => ({ offeredLabels: ["eu"], grants: [{ contract: "stock/Query", methods: ["count"] }], decode: (_c: string, _m: string, p: unknown) => Effect.succeed(p),
  run: (_cl: unknown, _c: string, m: string, p: unknown) => Effect.sync(() => { ran.push(`${m}:${String(p)}`); return 42 }) })
const guest = (handlers: Parameters<typeof serveGuest>[1]["handlers"]) => ({ wire: [1], served: [side], maxInFlight: 4, handlers })

const runVirtual = <A, E>(e: Effect.Effect<A, E, import("effect").Scope.Scope>) => Effect.runPromise(Effect.scoped(e).pipe(Effect.provide(TestClock.layer())))
const tick = Effect.gen(function* () { yield* TestClock.adjust(5); for (let i = 0; i < 20; i++) yield* Effect.yieldNow })

describe("callbacks over the session", () => {
  it("a served call calls back into a granted host service and returns what it gave, in memory", async () => {
    await runVirtual(Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest({ post: (p, ctx) => ctx.callback("stock/Query", "count", p).pipe(Effect.map((r) => `got:${JSON.stringify(r.exit)}`)) })))
      const s = (yield* openSession(a, { ...base("e-1"), callbacks: hostSide(ran) })) as Session
      expect(yield* s.call("post", "x")).toBe('got:{"ok":42}')
      expect(ran).toEqual(["count:x"])
      yield* s.close
    }))
  })
  it("a second callback of one call is refused CallbackLimit through the session when maxCallbacks is 1, and the guest's token is not a counter (S63)", async () => {
    await runVirtual(Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest({ post: (p, ctx) => Effect.gen(function* () { const r1 = yield* ctx.callback("stock/Query", "count", p), r2 = yield* ctx.callback("stock/Query", "count", p); return JSON.stringify([r1.exit, r2.exit]) }) })))
      const s = (yield* openSession(a, { ...base("e-1"), callbacks: { ...hostSide(ran), maxCallbacks: 1 } })) as Session
      const out = yield* s.call("post", "x")
      expect(out).toContain('"ok":42'); expect(out).toContain("CallbackLimit"); expect(ran).toEqual(["count:x"])
      yield* s.close
    }))
  })
  it("a call has a deadline and a limit on calls in flight, and a duplicated call frame runs the handler once (S68)", async () => {
    await runVirtual(Effect.gen(function* () {
      const [a, b] = yield* duplex
      const sent: string[] = []; let runs = 0
      yield* Effect.forkChild(serveGuest(b, guest({ post: (p) => Effect.sync(() => { runs++; return `ok:${String(p)}` }), hang: () => Effect.never as never })))
      const s = (yield* openSession({ send: (f) => { sent.push(f); return a.send(f) }, receive: a.receive }, { ...base("e-1"), maxInFlight: 1, callTimeout: 50 })) as Session
      expect(yield* s.call("post", "x")).toBe("ok:x")
      const dup = sent.find((f) => f.includes('"t":"call"'))!; yield* a.send(dup); yield* tick; expect(runs).toBe(1)   // the same callId again
      const hung = yield* Effect.forkChild(Effect.flip(s.call("hang", "y")))
      yield* tick
      expect(yield* Effect.flip(s.call("post", "z"))).toMatchObject({ _tag: "Overloaded", outcome: "not-executed" })
      yield* TestClock.adjust(60); yield* tick
      expect(yield* Fiber.join(hung)).toMatchObject({ _tag: "RemoteTimeout", outcome: "unknown" })
      yield* s.close
    }))
  })
  it("refuses a callback outside the grants without running host code", async () => {
    await runVirtual(Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest({ post: (p, ctx) => ctx.callback("stock/Query", "drop", p).pipe(Effect.map((r) => JSON.stringify(r.exit))) })))
      const s = (yield* openSession(a, { ...base("e-1"), callbacks: hostSide(ran) })) as Session
      expect(yield* s.call("post", "x")).toBe('{"refused":{"reason":"denied","tag":"CallbackDenied"}}')
      expect(ran).toEqual([])
      yield* s.close
    }))
  })
  it("refuses a callback of another epoch with StaleEpoch, and one carrying a token that is not live", async () => {
    await runVirtual(Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      const seen: Array<{ t: string; exit?: unknown }> = []
      yield* Effect.forkChild(serveGuest({ send: b.send, receive: Effect.tap(b.receive, (f) => Effect.sync(() => { seen.push(JSON.parse(f)) })) }, guest({ post: () => Effect.succeed("done") })))
      const s = (yield* openSession(a, { ...base("e-1"), callbacks: hostSide(ran) })) as Session
      const result = (n: number) => Effect.gen(function* () { for (let i = 0; i < 200; i++) { const r = seen.filter((x) => x.t === "callback-result"); if (r.length >= n) return r[n - 1]!.exit; yield* tick } return undefined })
      yield* b.send(JSON.stringify({ t: "callback", epoch: "old", callId: "z", parent: "c-1", token: "t", contract: "stock/Query", method: "count", payload: 1 }))
      expect(yield* result(1)).toEqual({ refused: { reason: "stale-epoch", tag: "StaleEpoch" } })
      yield* b.send(JSON.stringify({ t: "callback", epoch: "e-1", callId: "y", parent: "c-1", token: "forged", contract: "stock/Query", method: "count", payload: 1 }))
      expect(yield* result(2)).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
      expect(ran).toEqual([]); expect(yield* s.refusals).toBe(1)
      yield* s.close
    }))
  })
  it("works over loopback TCP too", async () => {
    await runVirtual(Effect.gen(function* () {
      const ran: string[] = []
      const l = yield* listen((c) => serveGuest(c, guest({ post: (p, ctx) => ctx.callback("stock/Query", "count", p).pipe(Effect.map((r) => JSON.stringify(r.exit))) })).pipe(Effect.asVoid))
      const s = (yield* openSession(yield* dialSocket(l.port), { ...base("tcp-1"), callbacks: hostSide(ran) })) as Session
      expect(yield* s.call("post", "net")).toBe('{"ok":42}')
      expect(ran).toEqual(["count:net"])
      yield* s.close; yield* l.close
    }))
  })
})

import { Layer } from "effect"
import { CallLog, type CallEntry } from "../src/policy.js"
import { callLogTo } from "../src/session.js"
import { onHost } from "./p7fixtures.js"

describe("call log entries through Host.offerCallEntry (BEH-RM-047)", () => {
  it("offers one crossing per outbound call, one per granted callback, a refusal per refused one, and no payload, token or message", async () => {
    const entries: CallEntry[] = []
    const layer = Layer.succeed(CallLog, { select: () => true, record: (e: CallEntry) => Effect.sync(() => { entries.push(e) }) })
    await onHost((host) => Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest({ post: (p, ctx) => Effect.gen(function* () { yield* ctx.callback("stock/Query", "count", p); yield* ctx.callback("stock/Query", "drop", p); return "done" }) })))
      const s = (yield* openSession(a, { ...base("e-9"), callbacks: hostSide(ran), log: callLogTo(host as never, "link-1", "example/Board@1") })) as Session
      yield* s.call("post", "secret-payload")
      for (const t0 = Date.now(); Date.now() - t0 < 30_000 && entries.length < 3;) yield* tick
      yield* s.close
      const kinds = entries.map((e) => `${e.kind}:${e.crossing?.direction ?? e.refusal?.stage}:${e.member}:${e.outcome}`).sort()
      expect(kinds).toEqual(["crossing:inbound:count:success", "crossing:outbound:post:success", "refusal:boundary:drop:refused"])
      expect(entries.every((e) => e.origin !== "core" && (e.origin as { companion: string }).companion === "@bridger/remote")).toBe(true)
      expect(entries.find((e) => e.kind === "crossing" && e.crossing?.direction === "outbound")!.crossing).toEqual({ direction: "outbound", link: "link-1", epoch: "e-9" })
      expect(JSON.stringify(entries)).not.toMatch(/secret-payload|tok-/)
    }), { layers: [layer, TestClock.layer()] })
  })
})
