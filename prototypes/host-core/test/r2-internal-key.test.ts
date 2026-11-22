// Report 02 R2 (D-02): `internal` on a plain-key manifest reference decodes; core does not act on it (BEH-BR-241).
import { describe, expect, it } from "vitest"
import { decodeProblem } from "../src/manifest.js"

const manifest = (requires: unknown): unknown => ({ manifestVersion: 1, id: "p", version: "1.0.0", provides: [], requires })

describe("report 02 R2: manifest internal flag", () => {
  it("is accepted on a plain key, rejected on a contract key and when not a boolean", () => {
    expect(decodeProblem(manifest([{ serviceId: "example/Db", internal: true }]))).toBeUndefined()
    expect(decodeProblem(manifest([{ serviceId: "example/Db" }]))).toBeUndefined()                       // core never refuses a plain key
    expect(decodeProblem(manifest([{ serviceId: "example/Db@1", range: "^1.0", version: "1.0.0", methods: ["a"], internal: true }]))).toBe("manifest: requires[0].internal (on a contract key)")
    expect(decodeProblem(manifest([{ serviceId: "example/Db", internal: "yes" }]))).toBe("manifest: requires[0].internal")
  })
})
