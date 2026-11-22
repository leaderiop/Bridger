// Report 05 R5 (DX-06): one manifest schema; type, decoder and JSON Schema derive from it (BEH-BR-241).
import { describe, expect, it } from "vitest"
import { decodeProblem, manifestJsonSchema, ManifestSchema, type PluginManifest } from "../src/manifest.js"
import { reportsManifest } from "./p7fixtures.js"

describe("manifest schema (report 05 R5)", () => {
  it("DX-06: a manifest the type accepts decodes, and the decoder names the path of a bad one, never a value", () => {
    const ok: PluginManifest = { manifestVersion: 1, id: "a", version: "1.0.0", provides: [{ serviceId: "s", version: "1.0.0", methods: ["m"] }], requires: [] }
    expect(decodeProblem(ok)).toBeUndefined()
    expect(decodeProblem(reportsManifest)).toBeUndefined()                         // unknown properties are kept, not an error
    const secret = "s3cr3t-value"
    const bad = { ...ok, provides: [{ serviceId: secret }, { serviceId: 3 }] }
    const problem = decodeProblem(bad)!
    expect(problem).toBe("manifest: provides[1].serviceId")
    expect(problem).not.toContain(secret)
    expect(decodeProblem({ ...ok, provides: [{ serviceId: 3 }] })).toBe("manifest: provides[0].serviceId")
    expect(decodeProblem({ ...ok, contributions: [{ registry: "r", id: "i", role: "nope" }] })).toBe("manifest: contributions[0].role")
    expect(decodeProblem({ ...ok, manifestVersion: 2 })).toBe("manifest: manifestVersion")
    expect(decodeProblem(null)).toBe("manifest: <root> is not an object")
  })
  it("the JSON Schema is derived from the same declaration and lists every known field", () => {
    const doc = JSON.stringify(manifestJsonSchema())
    for (const f of ["manifestVersion", "provides", "requires", "optional", "engines", "activation", "contributions", "listens", "requested", "extensions"]) expect(doc).toContain(`"${f}"`)
    expect(ManifestSchema.fields.id).toBeDefined()
  })
})
