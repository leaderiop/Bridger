// Report 02 R2 (D-02): `internal` on a plain-key manifest reference decodes; core does not act on it (BEH-BR-241).
import { describe, expect, it } from "vitest"
import { Context, Effect, Layer } from "effect"
import { decodeProblem, plainKeyProblems, plainKeysOfDefinition, type PluginManifest } from "../src/manifest.js"
import { Contract } from "../src/contract.js"
import { define } from "../src/plugin.js"

const manifest = (requires: unknown): unknown => ({ manifestVersion: 1, id: "p", version: "1.0.0", provides: [], requires })

describe("report 02 R2: manifest internal flag", () => {
  it("is accepted on a plain key, rejected on a contract key and when not a boolean", () => {
    expect(decodeProblem(manifest([{ serviceId: "example/Db", internal: true }]))).toBeUndefined()
    expect(decodeProblem(manifest([{ serviceId: "example/Db" }]))).toBeUndefined()                       // core never refuses a plain key
    expect(decodeProblem(manifest([{ serviceId: "example/Db@1", range: "^1.0", version: "1.0.0", methods: ["a"], internal: true }]))).toBe("manifest: requires[0].internal (on a contract key)")
    expect(decodeProblem(manifest([{ serviceId: "example/Db", internal: "yes" }]))).toBe("manifest: requires[0].internal")
  })
})

describe("report 02 R2: plain-cross-boundary-key (loader BEH-LD-014, kit BEH-KT-028)", () => {
  const m = (o: Partial<PluginManifest>) => ({ manifestVersion: 1, id: "p", version: "1.0.0", provides: [], requires: [], ...o }) as PluginManifest
  it("reports every plain key not marked internal, by path, in provides/requires/optional order", () => {
    const found = plainKeyProblems(m({
      provides: [{ serviceId: "example/Out" }],
      requires: [{ serviceId: "example/A@1", version: "1.0.0", methods: ["x"], range: "^1.0" }, { serviceId: "example/Db", internal: true }, { serviceId: "example/Cache" }],
      optional: [{ serviceId: "example/Log" }]
    }))
    expect(found).toEqual([{ serviceId: "example/Out", path: "provides[0]" }, { serviceId: "example/Cache", path: "requires[2]" }, { serviceId: "example/Log", path: "optional[0]" }])
  })
  it("passes a manifest of contract keys and internal plain keys", () => {
    expect(plainKeyProblems(m({ requires: [{ serviceId: "example/Db", internal: true }, { serviceId: "example/A@1", version: "1.0.0", methods: ["x"], range: "^1.0" }] }))).toEqual([])
  })
  it("a definition without a manifest names every plain key and no contract key", () => {
    class Plain extends Context.Service<Plain, { readonly n: number }>()("example/Plain") {}
    class Svc extends Context.Service<Svc, { readonly go: Effect.Effect<void> }>()("example/Svc@1") {}
    const c = Contract.make(Svc, { version: "1.0.0", methods: { go: Contract.method({}) } })
    const d = define({ id: "d", requires: [c.range("^1.0"), Plain] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never })
    expect(plainKeysOfDefinition(d as never)).toEqual(["example/Plain"])
  })
})
