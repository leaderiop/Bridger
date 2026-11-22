// The boundary handshakes over an in-memory wire: remote hello/welcome (BEH-RM-009, 011, 033) and federation offers (BEH-FD-018–020).
import { Context, Effect, Fiber, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { agreeProtocol, duplex, guestServe, linkHandshake, offerExchange, type PeerOffer } from "../src/wire.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const Text = Schema.Struct({ text: Schema.String })
const Rich = Schema.Struct({ text: Schema.String, mood: Schema.String })
const make = (version: string, payload: Schema.Top) => Contract.make(Board, { version, methods: { post: Contract.method({ payload, success: Schema.String }) } }).descriptor
const side = (d: ReturnType<typeof make>) => ({ version: d.version, methods: d.methods, schemas: d.schemas })
const hello = (accepts = "^1.2") => ({ wire: [1], epoch: "e-1", contract: { id: "example/Board@1", accepts, ...side(make("1.2.0", Text)) } })

const link = (served: ReturnType<typeof side>[], h = hello(), guest = { wire: [1], maxInFlight: 8 }) => Effect.runPromise(Effect.gen(function* () {
  const [a, b] = yield* duplex
  const [outcome, answered] = yield* Effect.all([linkHandshake(a, h), guestServe(b, { ...guest, served, maxInFlight: guest.maxInFlight })], { concurrency: 2 })
  return { outcome, answered }
}))

describe("remote handshake over frames", () => {
  it("opens a session at the highest compatible version with the agreed wire version and epoch", async () => {
    const r = await link([side(make("1.2.0", Text)), side(make("1.4.0", Text))])
    expect(r.outcome).toEqual({ session: { version: "1.4.0", wire: 1, epoch: "e-1" } })
    expect(r.answered).toEqual({ answered: "welcome", epoch: "e-1", version: "1.4.0" })
  })
  it("refuses a guest whose only compatible-looking version changed a method's schema", async () => {
    const r = await link([side(make("1.5.0", Rich))])
    expect(r.outcome).toMatchObject({ refused: "incompatible-contract" })
    expect(r.answered).toEqual({ answered: "refuse" })
  })
  it("refuses a guest outside the accepted range", async () => {
    expect((await link([side(make("2.0.0", Text))])).outcome).toMatchObject({ refused: "incompatible-contract" })
  })
  it("refuses with reason wire when the ends share no wire version", async () => {
    expect((await link([side(make("1.3.0", Text))], hello(), { wire: [2], maxInFlight: 8 })).outcome).toEqual({ refused: "wire" })
  })
  it("refuses an undecodable frame with reason wire, never throwing", async () => {
    const out = await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      yield* a.send("not json")
      const g = yield* guestServe(b, { wire: [1], served: [], maxInFlight: 1 })
      return { g, reply: yield* a.receive }
    }))
    expect(out.g).toEqual({ answered: "refuse" })
    expect(JSON.parse(out.reply)).toEqual({ t: "refuse", reason: "wire" })
  })
  it("the guest agrees the highest wire version both speak", async () => {
    expect((await link([side(make("1.3.0", Text))], { ...hello(), wire: [1, 2] }, { wire: [1, 2], maxInFlight: 8 })).outcome).toMatchObject({ session: { wire: 2 } })
  })
  it("a link refuses a forged welcome: a wire version it did not offer, or a digest that differs, whatever the guest claims", async () => {
    const forge = (welcome: object) => Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      const f = yield* Effect.forkChild(linkHandshake(a, hello()))
      yield* b.receive
      yield* b.send(JSON.stringify({ t: "welcome", epoch: "e-1", maxInFlight: 1, ...welcome }))
      return yield* Fiber.join(f)
    }))
    expect(await forge({ wire: 9, version: "1.3.0" })).toEqual({ refused: "wire" })
    expect(await forge({ wire: 1, version: "1.3.0", schemas: make("1.3.0", Rich).schemas })).toMatchObject({ refused: "incompatible-contract", cause: { mismatchedMethods: ["post"] } })
  })
  it("a link ignores a welcome that echoes another epoch", async () => {
    const out = await Effect.runPromise(Effect.gen(function* () {
      const [a, b] = yield* duplex
      const linkFiber = yield* Effect.forkChild(linkHandshake(a, hello()))
      yield* b.receive
      yield* b.send(JSON.stringify({ t: "welcome", wire: 1, epoch: "other", version: "1.3.0", maxInFlight: 1 }))
      return yield* Fiber.join(linkFiber)
    }))
    expect(out).toEqual({ refused: "wire" })
  })
})

describe("federation offers over frames", () => {
  const offer = (host: string, o: Partial<PeerOffer> = {}): PeerOffer => ({ host, authority: "acme", protocol: [3, 4], protocolWindow: 1, exports: [], imports: [], ...o })
  const exchange = (a: PeerOffer, b: PeerOffer, peerOfA = { host: b.host, authority: "acme" }, peerOfB = { host: a.host, authority: "acme" }) => Effect.runPromise(Effect.gen(function* () {
    const [x, y] = yield* duplex
    return yield* Effect.all([offerExchange(x, a, peerOfA), offerExchange(y, b, peerOfB)], { concurrency: 2 })
  }))
  const exp = (d: ReturnType<typeof make>) => ({ key: "example/Board@1", major: 1, version: d.version, schemas: d.schemas })
  const imp = { key: "example/Board@1", ...side(make("1.2.0", Text)) }

  it("both ends agree the same protocol and accept an import with equal digests", async () => {
    const [ra, rb] = await exchange(offer("A", { imports: [imp] }), offer("B", { exports: [exp(make("1.4.0", Text))] }))
    expect(ra).toMatchObject({ protocol: 4, verdicts: [{ key: "example/Board@1", accepted: true, version: "1.4.0" }] })
    expect(rb).toMatchObject({ protocol: 4, verdicts: [] })
  })
  it("refuses that import alone, naming the method, when the peer's digest differs; the link stays up", async () => {
    const [ra] = await exchange(offer("A", { imports: [imp, { key: "example/Other@1", version: "1.0.0" }] }), offer("B", { exports: [exp(make("1.4.0", Rich))] }))
    expect(ra).toMatchObject({ protocol: 4, verdicts: [{ accepted: false, reason: "incompatible-contract", cause: { mismatchedMethods: ["post"] } }, { accepted: false, reason: "no-export" }] })
  })
  it("a peer's window can lower the floor: [3,5] w1 against [3,6] w2 agree 5", () => {
    expect(agreeProtocol(offer("A", { protocol: [3, 5], protocolWindow: 1 }), offer("B", { protocol: [3, 6], protocolWindow: 2 }))).toBe(5)
  })
  it("agrees the highest version inside both windows, and refuses a gap with IncompatiblePeer on both ends", async () => {
    expect(agreeProtocol(offer("A", { protocol: [3, 5], protocolWindow: 1 }), offer("B", { protocol: [4, 5], protocolWindow: 1 }))).toBe(5)
    expect(agreeProtocol(offer("A", { protocol: [1, 2] }), offer("B", { protocol: [4, 5] }))).toBeUndefined()
    const [ra, rb] = await exchange(offer("A", { protocol: [1, 2] }), offer("B", { protocol: [4, 5] }))
    expect([ra, rb]).toEqual([{ _tag: "IncompatiblePeer", reason: "protocol" }, { _tag: "IncompatiblePeer", reason: "protocol" }])
  })
  it("refuses a peer that is not the host the manifest names, or has another authority", async () => {
    const [wrongHost] = await exchange(offer("A"), offer("B"), { host: "C", authority: "acme" })
    expect(wrongHost).toEqual({ _tag: "IncompatiblePeer", reason: "wrong-host" })
    const [wrongAuth] = await exchange(offer("A"), offer("B", { authority: "evil" }))
    expect(wrongAuth).toEqual({ _tag: "IncompatiblePeer", reason: "wrong-authority" })
  })
})
