// Report 06 S46/S47: callbacks per parent are bounded, and a package path cannot hold a control character.
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { checkPaths } from "../src/loader.js"
import { admitCallback, inProcess } from "../src/tokens.js"

describe("remote and loader bounds", () => {
  it("a parent call admits at most maxCallbacks distinct callbacks", async () => {
    let n = 0
    const authority = inProcess(() => `t${++n}`), now = Effect.succeed(1000)
    const ref = await Effect.runPromise(authority.mint({ callId: "p", epoch: "e", pluginId: "x", expires: 5000 } as never))
    const seen = new Set<string>()
    const admit = (callId: string) => Effect.runPromise(admitCallback(authority, { epoch: "e", callId, parent: "p", token: ref } as never, { maxCallbacks: 2, epoch: "e", revoked: false, now, inFlight: () => true, seen, rev: { pluginIds: new Set(), digests: new Set() } } as never))
    expect(await admit("c1")).toHaveProperty("admitted"); expect(await admit("c2")).toHaveProperty("admitted")
    expect(await admit("c3")).toMatchObject({ refused: { tag: "CallbackLimit" } })
    expect(await admit("c1")).toEqual({ duplicate: true })
  })
  it("a path with NUL or LF is malformed, so filesDigest is unambiguous", () => {
    expect(() => checkPaths(["a\nb"])).toThrow(/control/); expect(() => checkPaths(["a\u0000b"])).toThrow(/control/); expect(() => checkPaths(["a/b.js"])).not.toThrow()
  })
})
