// Report 05 R5 (DX-06): the service, configuration and contribution catalogs are generated from the definitions and
// compared with a committed golden file, as verify-cordis-catalog compares its catalog. UPDATE_GOLDEN=1 rewrites it.
import { Context, Effect, Layer, Schema } from "effect"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { catalogOf, renderCatalog } from "../src/catalog.js"
import { Contract } from "../src/contract.js"
import { define, type AnyPlugin } from "../src/plugin.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
class Db extends Context.Service<Db, { readonly url: string }>()("example/Db") {}
const BoardV1 = Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String, timeout: "5 seconds" }) } })
const board = define({ id: "board", requires: [Db], provides: [BoardV1], build: Layer.empty as never, config: Schema.Struct({ title: Schema.String, limit: Schema.optionalKey(Schema.Number) }), volatile: ["limit"],
  manifest: { manifestVersion: 1, id: "board", version: "1.0.0", provides: [], requires: [], contributions: [{ registry: "example/price-change", id: "board/guard", role: "veto" }] } }) as unknown as AnyPlugin
const db = define({ id: "db", requires: [], provides: [Db], build: Layer.empty as never }) as unknown as AnyPlugin

describe("generated catalogs (report 05 R5)", () => {
  const text = renderCatalog(catalogOf([board, db]))
  it("services, configuration and contributions are listed with their sources", () => {
    const c = catalogOf([board, db])
    expect(c.services.map((s) => [s.serviceId, s.kind, s.version])).toEqual([["example/Board@1", "contract", "1.2.0"], ["example/Db", "plain", undefined]])
    expect(c.services[0]!.methods).toEqual([{ name: "post", timeoutMs: 5000 }])
    expect(c.config.map((r) => [r.field, r.required, r.volatile])).toEqual([["limit", false, true], ["title", true, false]])
    expect(c.contributions).toEqual([{ pluginId: "board", registry: "example/price-change", id: "board/guard", role: "veto" }])
  })
  it("the rendered catalog equals the committed golden file (a changed definition changes it in the same commit)", () => {
    const path = resolve(__dirname, "golden/catalog.md")
    if (process.env.UPDATE_GOLDEN === "1" || !existsSync(path)) writeFileSync(path, text)
    expect(text).toBe(readFileSync(path, "utf8"))
  })
})
