// Report 06 S13: shred and a received notice go through a mandatory gate before anything is written (keyring BEH-KR-017, BEH-KR-020).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { Gate } from "../src/gate.js"
import { ShredRefused, gatedShred, receiveNotice, subjectDigest, type ShredRequest } from "../src/shred.js"
import { alice } from "./p4fixtures.js"

const gateOf = (f: (r: ShredRequest) => "allow" | string) => { const seen: ShredRequest[] = []; const gate: Gate<ShredRequest> = { decide: (r) => Effect.sync(() => { seen.push(r); const d = f(r); return d === "allow" ? { _tag: "Allow" } as const : { _tag: "Refuse", reason: d } as const }) }; return { gate, seen } }
const req = (): ShredRequest => ({ operation: "shred", subjectDigest: subjectDigest("patient-7"), actor: alice, reason: "erasure request", reversibility: "irreversible" })

describe("gated shred", () => {
  it("a refusal writes nothing; an allow runs step 1; the request is irreversible and carries a digest, not the subject", async () => {
    const wrote: string[] = []
    const { gate, seen } = gateOf((r) => r.actor.id === alice.id ? "no-approval" : "allow")
    const exit = await Effect.runPromise(Effect.exit(gatedShred(gate, req(), Effect.sync(() => { wrote.push("tombstone") }))))
    expect(JSON.stringify(exit)).toContain("no-approval"); expect(wrote).toEqual([])
    const ok = gateOf(() => "allow")
    await Effect.runPromise(gatedShred(ok.gate, req(), Effect.sync(() => { wrote.push("tombstone") })))
    expect(wrote).toEqual(["tombstone"])
    expect(ok.seen[0]).toMatchObject({ operation: "shred", reversibility: "irreversible" }); expect(JSON.stringify(ok.seen[0])).not.toContain("patient-7")
    expect(seen).toHaveLength(1)
  })
  it("a Defer or a throwing gate refuses too", async () => {
    const defer: Gate<ShredRequest> = { decide: () => Effect.succeed({ _tag: "Defer", draft: { draftId: "d", requests: [], expected: [] } } as never) }
    const boom: Gate<ShredRequest> = { decide: () => Effect.die("x") }
    for (const g of [defer, boom]) expect(await Effect.runPromise(Effect.flip(gatedShred(g, req(), Effect.void)))).toBeInstanceOf(ShredRefused)
  })
  it("a received notice is applied once, under keyring-notice:<origin>, only when the gate allows; a refused one stays pending and unacknowledged", async () => {
    const applied: string[] = []
    const refuse = gateOf(() => "origin-not-trusted"), allow = gateOf(() => "allow")
    const n = { subject: "patient-7", shredId: "s1", reason: "erasure", origin: "node-b", actor: alice }
    const seen = new Set<string>()
    const apply = () => Effect.sync(() => { applied.push("s1") })
    expect(await Effect.runPromise(receiveNotice({ gate: refuse.gate, seen, apply })(n))).toBe("pending")
    expect(applied).toEqual([])
    const ok = receiveNotice({ gate: allow.gate, seen, apply })
    expect(await Effect.runPromise(ok(n))).toBe("applied")
    expect(await Effect.runPromise(ok(n))).toBe("duplicate")
    expect(applied).toEqual(["s1"])
    expect(allow.seen[0]).toMatchObject({ operation: "apply-shred-notice", actor: { id: "keyring-notice:node-b" }, origin: "node-b" })
  })
})
