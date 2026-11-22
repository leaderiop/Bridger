// Report 06 S10: a token's lifetime is bounded by the checker, not only by the minting side (remote BEH-RM-043).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { admitCallback, inProcess, type TokenAuthority, type TokenClaims } from "../src/tokens.js"

const claims = (issuedAt: number, expires: number): Omit<TokenClaims, "tokenId"> => ({ pluginId: "link", realm: "", epoch: "e1", callId: "c1", contractVersion: "1.0.0", issuedAt, expires })
const st = (maxLifetime?: number) => ({ ...(maxLifetime !== undefined ? { maxLifetime } : {}), epoch: "e1", revoked: false, now: Effect.succeed(10), inFlight: (id: string) => id === "c1", seen: new Set<string>(), rev: { pluginIds: new Set<string>(), digests: new Set<string>() } })
const admit = async (a: TokenAuthority, ref: string, max?: number) => Effect.runPromise(admitCallback(a, { epoch: "e1", callId: "k1", parent: "c1", token: ref }, st(max)))

describe("token lifetime cap (BEH-RM-043)", () => {
  it("a token within tokenTtl is admitted; one minted by a custom authority beyond it is refused TokenInvalid; without a cap nothing changes", async () => {
    const a = inProcess(() => "t1"), b = inProcess(() => "t2"), c = inProcess(() => "t3")
    const ok = await Effect.runPromise(a.mint(claims(0, 30_000))), long = await Effect.runPromise(b.mint(claims(0, 900_000))), free = await Effect.runPromise(c.mint(claims(0, 900_000)))
    expect(await admit(a, ok, 30_000)).toHaveProperty("admitted")
    expect(await admit(b, long, 30_000)).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
    expect(await admit(c, free)).toHaveProperty("admitted")
  })
  it("a non-finite lifetime is refused too", async () => {
    const a = inProcess(() => "t1")
    const ref = await Effect.runPromise(a.mint(claims(0, Number.POSITIVE_INFINITY)))
    expect(await admit(a, ref, 30_000)).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
  })
})
