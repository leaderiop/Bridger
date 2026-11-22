// Report 05 R7 (DX-04): `config` types `volatile`; a name the schema lacks does not compile (BEH-BR-097, 102).
import { Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { define } from "../src/plugin.js"

const Cfg = Schema.Struct({ level: Schema.String, port: Schema.Number })
describe("typed plugin config (report 05 R7)", () => {
  it("DX-04: volatile is limited to the top-level fields of the config schema", () => {
    const ok = define({ id: "a", requires: [], provides: [], build: Layer.empty, config: Cfg, volatile: ["level"] })
    expect(ok.volatile).toEqual(["level"])
    // @ts-expect-error "nope" is not a field of the config schema
    define({ id: "b", requires: [], provides: [], build: Layer.empty, config: Cfg, volatile: ["nope"] })
    // @ts-expect-error volatile without config names nothing
    define({ id: "c", requires: [], provides: [], build: Layer.empty, volatile: ["level"] })
  })
})

import { Context, Effect } from "effect"
import { Contract } from "../src/contract.js"
class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<number> }>()("example/Board@1") {}
describe("typed contract methods (report 05 R7, DX-09)", () => {
  it("DX-09: a method spec must fit the service method it names", () => {
    const ok = Contract.make(Board, { version: "1.0.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.Number }) } })
    expect(Object.keys(ok.methods)).toEqual(["post"])
    // @ts-expect-error the payload decodes to number, the method takes string
    Contract.make(Board, { version: "1.0.0", methods: { post: Contract.method({ payload: Schema.Number, success: Schema.Number }) } })
    // @ts-expect-error the result decodes to string, the method gives number
    Contract.make(Board, { version: "1.0.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String }) } })
    // @ts-expect-error the service has no method `purge`
    Contract.make(Board, { version: "1.0.0", methods: { purge: Contract.method({}) } })
  })
})
