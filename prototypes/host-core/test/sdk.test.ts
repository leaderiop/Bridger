// Kit 05 (BEH-KT-033..038): the promise SDK runtime and generator.
import { Context, Effect, Schema } from "effect"
import { readFileSync, writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { ContractError, generateSdk, inProcess, schemasOf, serveContract } from "../src/sdk.js"

class Greeter extends Context.Service<Greeter, { readonly greet: (i: { name: string; locale?: string }) => Effect.Effect<{ text: string }, { _tag: "NotFound"; name: string }> }>()("example/Greeter@1") {}
const NotFound = Schema.Struct({ _tag: Schema.Literal("NotFound"), name: Schema.String })
const contract = Contract.make(Greeter, { version: "1.2.0", methods: {
  greet: Contract.method({ payload: Schema.Struct({ name: Schema.String, locale: Schema.optionalKey(Schema.String) }), success: Schema.Struct({ text: Schema.String }), error: NotFound })
} })
class GreeterNotFound extends ContractError<"NotFound", { name: string }> { constructor(f: { name: string }) { super(f, "NotFound") } }

describe("promise SDK runtime (BEH-KT-034)", () => {
  const thrown: Array<unknown> = []
  const entry = serveContract(schemasOf(contract), {
    async greet(input: { name: string }, ctx) {
      if (input.name === "") throw new GreeterNotFound({ name: input.name })
      if (input.name === "boom") throw new Error("customer data: ada@example.com")
      if (input.name === "bad") return { text: 1 }
      return { text: `Hello, ${input.name}! ${JSON.stringify(ctx.claims)}` }
    }
  }, { onUnexpected: (_m, t) => thrown.push(t) })
  const call = inProcess(entry)

  it("calls the handler on a valid payload and returns the result", async () => {
    expect(await call("greet", { name: "Ada" })).toEqual({ ok: true, value: { text: "Hello, Ada! {}" } })
  })
  it("refuses a bad payload without calling the handler, and a bad result", async () => {
    expect(await call("greet", { name: 3 })).toMatchObject({ ok: false, failure: { _tag: "SdkDecodeFailed", method: "greet", side: "input" } })
    expect(await call("greet", { name: "bad" })).toMatchObject({ ok: false, failure: { _tag: "SdkDecodeFailed", side: "output" } })
    expect(JSON.stringify(await call("greet", { name: 3 }))).not.toContain("3,")      // the message never quotes the value
  })
  it("a declared error is a typed failure; anything else is the fixed undeclared message and reaches only onUnexpected", async () => {
    expect(await call("greet", { name: "" })).toEqual({ ok: false, failure: { _tag: "NotFound", name: "" } })
    const r = await call("greet", { name: "boom" })
    expect(r).toEqual({ ok: false, failure: { _tag: "SdkUndeclaredFailure", method: "greet", message: "handler failed with an undeclared error" } })
    expect(JSON.stringify(r)).not.toContain("ada@example.com")
    expect((thrown[0] as Error).message).toContain("ada@example.com")
  })
  it("claims are exactly the disclosed ones; none by default", async () => {
    expect(await call("greet", { name: "x" }, { claims: { actor: { kind: "user", id: "u1" }, secret: "no" } })).toEqual({ ok: true, value: { text: `Hello, x! ${JSON.stringify({ actor: { kind: "user", id: "u1" } })}` } })
  })
  it("a client exists only for a requested capability, and a denied callback is typed", async () => {
    const seen: Array<string> = []
    const e = serveContract(schemasOf(contract), { async greet(_i: unknown, ctx) {
      expect(() => ctx.client({ serviceId: "example/Other@1", methods: ["x"] })).toThrow("not in requested.capabilities")
      const clock = ctx.client({ serviceId: "example/Clock@1", methods: ["now", "secret"] } as const)
      expect("secret" in clock).toBe(false)
      seen.push(JSON.stringify(await clock.now({})))
      return { text: "ok" }
    } }, { requested: [{ serviceId: "example/Clock@1", methods: ["now"] }] })
    await e.call("greet", { name: "a" }, { callback: async () => ({ ok: true, value: 42 }) })
    expect(seen).toEqual(["42"])
    const denied = await e.call("greet", { name: "a" }, { callback: async () => ({ ok: false, failure: { _tag: "CallbackDenied", reason: "not-granted" } }) })
    expect(denied).toMatchObject({ ok: false, failure: { _tag: "SdkUndeclaredFailure" } })
  })
})

describe("SDK generator (BEH-KT-033)", () => {
  it("is deterministic and plain: no effect import, encoded types, a subclass per declared error", () => {
    const a = generateSdk(contract, { requested: [{ serviceId: "example/Clock@1", methods: ["now"] }] }), b = generateSdk(contract, { requested: [{ serviceId: "example/Clock@1", methods: ["now"] }] })
    expect(a).toBe(b)
    expect(a).not.toMatch(/from "effect"/)
    expect(a).toContain("greet(input: { \"name\": string; \"locale\"?: string }, ctx: CallContext): Promise<{ \"text\": string }>")
    expect(a).toContain('export class GreeterNotFound extends ContractError<"NotFound", { "name": string }> {}')
    expect(a).toContain("export const ClockClient")
    expect(a).toContain('"serviceId": "example/Greeter@1"')
  })
  it("the generated module for example/Greeter@1 is the golden file the partner guide compiles against", () => {
    const path = new URL("./golden/greeter-sdk.ts", import.meta.url)
    const text = generateSdk(contract, { requested: [{ serviceId: "example/Clock@1", methods: ["now"] }] })
    if (process.env.UPDATE_GOLDEN) writeFileSync(path, text)
    expect(readFileSync(path, "utf8")).toBe(text)
  })
})
