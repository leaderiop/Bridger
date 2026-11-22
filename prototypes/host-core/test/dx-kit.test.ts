// Report 05 R1 (DX-01): the definePlugin facade, executable (kit BEH-KT-001..006).
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { definePlugin } from "../src/kit.js"
import { as, run } from "./p4fixtures.js"
import { idle, stateOf } from "./fixtures.js"
import type { AnyPlugin } from "../src/plugin.js"

class Db extends Context.Service<Db, { readonly url: string }>()("example/Db") {}
class Mail extends Context.Service<Mail, { readonly send: (m: string) => Effect.Effect<string> }>()("example/Mail") {}
class Extra extends Context.Service<Extra, { readonly x: number }>()("example/Extra") {}
class Audit extends Context.Service<Audit, { readonly note: string }>()("example/Audit") {}
const asAny = (p: unknown) => p as AnyPlugin

describe("definePlugin (report 05 R1, kit BEH-KT-001..006)", () => {
  it("BEH-KT-001: forms 1 to 4 each return a core definition that installs and activates", async () => {
    const seen: Array<string> = []
    const one = definePlugin({ id: "db", provides: Db, make: Effect.succeed({ url: "pg://x" }) })
    const two = definePlugin({ id: "svc", requires: [Db], provides: { mail: Mail, audit: Audit },
      make: Effect.gen(function* () { const db = yield* Db; return { mail: { send: (m: string) => Effect.succeed(`${db.url}:${m}`) }, audit: { note: "n" } } }) })
    const three = definePlugin({ id: "user", requires: [Mail, Audit], run: Effect.gen(function* () { seen.push(yield* (yield* Mail).send(`hi${(yield* Audit).note}`)) }) })
    const four = definePlugin({ id: "raw", provides: [Db], build: Layer.succeed(Db, { url: "raw" }) })
    expect(Object.keys(one).sort()).toEqual(["build", "id", "provides", "requires"])         // nothing added (INV-KT-001)
    expect(one.requires).toEqual([])                                                            // omitted requires is []
    await run((host) => Effect.gen(function* () {
      yield* host.install(asAny(one), as()); yield* host.install(asAny(two), as()); yield* host.install(asAny(three), as()); yield* idle(host)
      expect(seen).toEqual(["pg://x:hin"])
      expect(yield* stateOf(host, "svc")).toBe("active")
      yield* host.install(asAny(definePlugin({ id: "raw2", provides: [Extra], build: Layer.succeed(Extra, { x: 1 }) })), as()); yield* idle(host)
      expect(yield* stateOf(host, "raw2")).toBe("active")
      expect(four.provides).toEqual([Db])
    }))
  })

  it("BEH-KT-001: make receives the decoded config of the activation", async () => {
    const Cfg = Schema.Struct({ level: Schema.String })
    const p = definePlugin({ id: "cfg", provides: Db, config: Cfg, volatile: ["level"], make: ({ config }) => Effect.succeed({ url: config.level }) })
    await run((host) => Effect.gen(function* () {
      yield* host.install(asAny(p), { ...as(), config: { level: "debug" } } as never); yield* idle(host)
      expect(yield* stateOf(host, "cfg")).toBe("active")
    }))
  })

  it("BEH-KT-003: a service the build uses but requires does not declare is a compile error naming the plugin", () => {
    // @ts-expect-error user: make uses a service that requires does not declare
    definePlugin({ id: "user", provides: Mail, make: Effect.gen(function* () { yield* Db; return { send: () => Effect.succeed("") } }) })
    // @ts-expect-error a key both required and provided
    definePlugin({ id: "loop", requires: [Db], provides: Db, make: Effect.succeed({ url: "" }) })
    // @ts-expect-error make does not return what provides declares
    definePlugin({ id: "wrong", provides: Db, make: Effect.succeed({ nope: 1 }) })
    // @ts-expect-error volatile names a field the config schema lacks
    definePlugin({ id: "v", provides: Db, config: Schema.Struct({ a: Schema.String }), volatile: ["b"], make: Effect.succeed({ url: "" }) })
    // @ts-expect-error a non-literal id
    definePlugin({ id: ("a" + Math.random()) as string, provides: Db, make: Effect.succeed({ url: "" }) })
  })

  it("BEH-KT-002: requires and provides are inferred as tuples without as const", () => {
    const p = definePlugin({ id: "t", requires: [Db, Mail], provides: Audit, make: Effect.succeed({ note: "" }) })
    const _tuple: readonly [typeof Db, typeof Mail] = p.requires
    expect(_tuple).toHaveLength(2)
  })
})
