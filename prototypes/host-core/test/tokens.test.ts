// Per-call capability tokens and callback admission (remote BEH-RM-044, 046).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { admitCallback, inProcess, TokenInvalid, type TokenAuthority, type TokenClaims } from "../src/tokens.js"

const claims = (o: Partial<TokenClaims> = {}): Omit<TokenClaims, "tokenId"> => ({ pluginId: "link", realm: "app", epoch: "e1", callId: "c1", contractVersion: "1.0.0", issuedAt: 0, expires: 1000, ...o })
const none = { pluginIds: new Set<string>(), digests: new Set<string>() }
const st = (o: Partial<Parameters<typeof admitCallback>[2]> = {}) => ({ epoch: "e1", revoked: false, now: Effect.succeed(10), inFlight: (id: string) => id === "c1", seen: new Set<string>(), rev: none, ...o })
const run = <A>(e: Effect.Effect<A>) => Effect.runPromise(e)
let n = 0
const auth = () => inProcess(() => `t-${++n}`)
const frame = (token: string, o = {}) => ({ epoch: "e1", callId: "cb1", parent: "c1", token, ...o })

describe("token authority and callback admission", () => {
  it("admits a callback whose epoch, token, expiry and call all hold", async () => {
    const a = auth(); const ref = await run(a.mint(claims()))
    expect(await run(admitCallback(a, frame(ref), st()))).toMatchObject({ admitted: { callId: "c1", pluginId: "link" } })
  })
  it("refuses in order: epoch first, then revoked link, then the token", async () => {
    const a = auth(); const ref = await run(a.mint(claims()))
    expect(await run(admitCallback(a, frame(ref, { epoch: "old" }), st({ revoked: true })))).toEqual({ refused: { reason: "stale-epoch", tag: "StaleEpoch" } })
    expect(await run(admitCallback(a, frame("nope"), st({ revoked: true })))).toEqual({ refused: { reason: "denied", tag: "RemoteRevoked" } })
    expect(await run(admitCallback(a, frame("nope"), st()))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
  })
  it("refuses a token past expires on the host clock, a token of another call, and one whose call has ended", async () => {
    const a = auth(); const ref = await run(a.mint(claims({ expires: 10 })))
    expect(await run(admitCallback(a, frame(ref), st()))).toEqual({ refused: { reason: "denied", tag: "TokenExpired" } })
    const r2 = await run(a.mint(claims({ callId: "c2" })))
    expect(await run(admitCallback(a, frame(r2), st({ inFlight: () => true })))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })   // parent c1 ≠ token's c2
    const r3 = await run(a.mint(claims()))
    expect(await run(admitCallback(a, frame(r3), st({ inFlight: () => false })))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
  })
  it("refuses a token minted under another epoch even when the frame carries the open one", async () => {
    const a = auth(); const ref = await run(a.mint(claims({ epoch: "e0" })))
    expect(await run(admitCallback(a, frame(ref), st()))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
  })
  it("a token dies when its call ends", async () => {
    const a = auth(); const ref = await run(a.mint(claims()))
    await run(a.end(ref))
    expect(await run(admitCallback(a, frame(ref), st()))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
  })
  it("a revocation selector matching the plugin id or digest refuses", async () => {
    const a = auth(); const r1 = await run(a.mint(claims())); const r2 = await run(a.mint(claims({ digest: "d1" })))
    expect(await run(admitCallback(a, frame(r1), st({ rev: { pluginIds: new Set(["link"]), digests: new Set() } })))).toMatchObject({ refused: { tag: "TokenInvalid" } })
    expect(await run(admitCallback(a, frame(r2), st({ rev: { pluginIds: new Set(), digests: new Set(["d1"]) } })))).toMatchObject({ refused: { tag: "TokenInvalid" } })
  })
  it("a duplicate callback is reported as a duplicate, not admitted again", async () => {
    const a = auth(); const ref = await run(a.mint(claims())); const s = st()
    expect(await run(admitCallback(a, frame(ref), s))).toHaveProperty("admitted")
    expect(await run(admitCallback(a, frame(ref), s))).toEqual({ duplicate: true })
  })
  it("an authority that fails or dies refuses, never allows", async () => {
    const dying: TokenAuthority = { mint: () => Effect.succeed("x"), check: () => Effect.die("boom"), end: () => Effect.void }
    const failing: TokenAuthority = { ...dying, check: () => Effect.fail(new TokenInvalid()) }
    expect(await run(admitCallback(dying, frame("x"), st()))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
    expect(await run(admitCallback(failing, frame("x"), st()))).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
  })
})
