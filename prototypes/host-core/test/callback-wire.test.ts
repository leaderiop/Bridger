// A guest handler calls back into the host over the session, on the in-memory wire and over loopback TCP (BEH-RM-046, 011).
import { Context, Effect, Schema } from "effect"
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

describe("callbacks over the session", () => {
  it("a served call calls back into a granted host service and returns what it gave, in memory", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      yield* Effect.forkChild(serveGuest(b, guest({ post: (p, ctx) => ctx.callback("stock/Query", "count", p).pipe(Effect.map((r) => `got:${JSON.stringify(r.exit)}`)) })))
      const s = (yield* openSession(a, { ...base("e-1"), callbacks: hostSide(ran) })) as Session
      expect(yield* s.call("post", "x")).toBe('got:{"ok":42}')
      expect(ran).toEqual(["count:x"])
      yield* s.close
    }))
  })
  it("refuses a callback outside the grants without running host code", async () => {
    await Effect.runPromise(Effect.gen(function* () {
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
    await Effect.runPromise(Effect.gen(function* () {
      const ran: string[] = []
      const [a, b] = yield* duplex
      const seen: Array<{ t: string; exit?: unknown }> = []
      yield* Effect.forkChild(serveGuest({ send: b.send, receive: Effect.tap(b.receive, (f) => Effect.sync(() => { seen.push(JSON.parse(f)) })) }, guest({ post: () => Effect.succeed("done") })))
      const s = (yield* openSession(a, { ...base("e-1"), callbacks: hostSide(ran) })) as Session
      const result = (n: number) => Effect.gen(function* () { for (let i = 0; i < 200; i++) { const r = seen.filter((x) => x.t === "callback-result"); if (r.length >= n) return r[n - 1]!.exit; yield* Effect.sleep(5) } return undefined })
      yield* b.send(JSON.stringify({ t: "callback", epoch: "old", callId: "z", parent: "c-1", token: "t", contract: "stock/Query", method: "count", payload: 1 }))
      expect(yield* result(1)).toEqual({ refused: { reason: "stale-epoch", tag: "StaleEpoch" } })
      yield* b.send(JSON.stringify({ t: "callback", epoch: "e-1", callId: "y", parent: "c-1", token: "forged", contract: "stock/Query", method: "count", payload: 1 }))
      expect(yield* result(2)).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
      expect(ran).toEqual([]); expect(yield* s.refusals).toBe(1)
      yield* s.close
    }))
  })
  it("works over loopback TCP too", async () => {
    await Effect.runPromise(Effect.gen(function* () {
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
      for (let i = 0; i < 200 && entries.length < 3; i++) yield* Effect.sleep(5)
      yield* s.close
      const kinds = entries.map((e) => `${e.kind}:${e.crossing?.direction ?? e.refusal?.stage}:${e.member}:${e.outcome}`).sort()
      expect(kinds).toEqual(["crossing:inbound:count:success", "crossing:outbound:post:success", "refusal:boundary:drop:refused"])
      expect(entries.every((e) => e.origin !== "core" && (e.origin as { companion: string }).companion === "@bridger/remote")).toBe(true)
      expect(entries.find((e) => e.kind === "crossing" && e.crossing?.direction === "outbound")!.crossing).toEqual({ direction: "outbound", link: "link-1", epoch: "e-9" })
      expect(JSON.stringify(entries)).not.toMatch(/secret-payload|tok-/)
    }), { layers: [layer] })
  })
})
