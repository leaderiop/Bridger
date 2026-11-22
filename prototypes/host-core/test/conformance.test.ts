// Kit 03 (BEH-KT-017..020): suites, verify over a plugin, a guest entry and an HTTP endpoint.
import { createServer } from "node:http"
import { Context, Effect, Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Conformance, ConformanceFailed, SuiteVersionMismatch } from "../src/conformance.js"
import { Contract } from "../src/contract.js"
import { definePlugin } from "../src/kit.js"
import { listen } from "../src/guest-http.js"
import { serveContract, schemasOf } from "../src/sdk.js"

type NotFoundErr = { readonly _tag: "NotFound"; readonly name: string }
class Greeter extends Context.Service<Greeter, { readonly greet: (i: { readonly name: string }) => Effect.Effect<{ readonly text: string }, NotFoundErr> }>()("example/Greeter@1") {}
const NotFound = Schema.Struct({ _tag: Schema.Literal("NotFound"), name: Schema.String })
const spec = { payload: Schema.Struct({ name: Schema.String }), success: Schema.Struct({ text: Schema.String }), error: NotFound }
const v10 = Contract.make(Greeter, { version: "1.0.0", methods: { greet: Contract.method(spec) } })
const v12 = Contract.make(Greeter, { version: "1.2.0", methods: { greet: Contract.method(spec) } })
const run = <A, E>(e: Effect.Effect<A, E, import("effect").Scope.Scope>) => Effect.runPromise(Effect.scoped(e))

const good = (version: string, c: typeof v10) => definePlugin({ id: "example/greeter", provides: Contract.at(c, version, { methods: ["greet"] }), make: Effect.succeed({
  greet: (i: { readonly name: string }) => i.name === "" ? Effect.fail({ _tag: "NotFound" as const, name: "" }) : Effect.succeed({ text: `hi ${i.name}` })
}) })
const broken = definePlugin({ id: "example/greeter", provides: Contract.at(v12, "1.2.0", { methods: ["greet"] }), make: Effect.succeed({ greet: (_i: { readonly name: string }) => Effect.succeed({ text: 1 as unknown as string }) }) })

describe("Conformance (kit 03)", () => {
  const s10 = Conformance.suite(v10, { generated: { samples: 10 } })
  const s12 = Conformance.suite(v12, { generated: { samples: 10 }, cases: [{ id: "greets", since: "1.0.0", run: (c) => Effect.gen(function* () {
    const r = yield* c.greet({ name: "Ada" }).pipe(Effect.mapError((e) => ({ _tag: "CaseFailed", id: "greets", message: String(e) }) as never))
    if (r.text !== "hi Ada") return yield* Effect.fail({ _tag: "CaseFailed", id: "greets", message: "wrong text" } as never)
  }) }] })

  it("BEH-KT-018: a plugin subject runs every suite of its major up to its version; the report carries the seed and each case", () => run(Effect.gen(function* () {
    const r = yield* Conformance.verify(good("1.2.0", v12), [s10, s12], { seed: 7 })
    expect(r.seed).toBe(7)
    expect(r.cases.map((c) => `${c.suite}:${c.id}:${c.outcome}`)).toEqual(["1.0.0:generated:greet:passed", "1.2.0:generated:greet:passed", "1.2.0:greets:passed"])
  })))
  it("BEH-KT-018: a suite above the provided version is not run; none at all is SuiteVersionMismatch", () => run(Effect.gen(function* () {
    const r = yield* Conformance.verify(good("1.0.0", v10), [s10, s12])
    expect(r.cases.map((c) => c.suite)).toEqual(["1.0.0"])
    const exit = yield* Effect.exit(Conformance.verify(good("1.0.0", v10), [Conformance.suite(Contract.make(Greeter, { version: "2.0.0", methods: { greet: Contract.method(spec) } }) as never)]))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("SuiteVersionMismatch")
  })))
  it("BEH-KT-018: a failing case fails verify with ConformanceFailed naming it, and the report stays reachable", () => run(Effect.gen(function* () {
    const exit = yield* Effect.exit(Conformance.verify(broken, [s12]))
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ConformanceFailed")
    expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("generated:greet")
  })))
  it("BEH-KT-020: a guest entry served by the SDK runtime passes; one returning a wrong shape fails", () => run(Effect.gen(function* () {
    const ok = serveContract(schemasOf(v12), { async greet(i: { name: string }) { return { text: `hi ${i.name}` } } })
    expect((yield* Conformance.verify(Conformance.guest(ok, v12), [s12])).subject.kind).toBe("guest")
    const bad = serveContract(schemasOf(v12), { async greet() { return { text: 1 } } })
    expect(Exit.isFailure(yield* Effect.exit(Conformance.verify(Conformance.guest(bad, v12), [s12])))).toBe(true)
  })))
  it("BEH-KT-020: an HTTP subject is called with JSON per method and the given timeout", async () => {
    const server = createServer((req, res) => { let b = ""; req.on("data", (d) => b += d); req.on("end", () => { const n = JSON.parse(b).name; res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ text: `hi ${n}` })) }) })
    await new Promise<void>((r) => server.listen(0, r))
    const port = (server.address() as { port: number }).port
    try {
      const r = await run(Conformance.verify(Conformance.http(`http://127.0.0.1:${port}`, { contract: v12, timeout: "5 seconds" }), [s12]))
      expect(r.subject.kind).toBe("http")
      expect(r.cases.every((c) => c.outcome === "passed")).toBe(true)
    } finally { server.close() }
  })
})

describe("the SDK guest served over HTTP (kit 05 transport, prototype binding)", () => {
  it("Conformance.http passes a served guest and fails one that returns the wrong shape; a typed failure crosses as 422", async () => {
    const s12 = Conformance.suite(v12, { generated: { samples: 5 } })
    const ok = await listen(serveContract(schemasOf(v12), { async greet(i: { name: string }) { if (i.name === "") throw new (await import("../src/sdk.js")).ContractError({ name: "" }, "NotFound"); return { text: `hi ${i.name}` } } }))
    const bad = await listen(serveContract(schemasOf(v12), { async greet() { return { text: 1 } } }))
    try {
      expect((await run(Conformance.verify(Conformance.http(ok.url, { contract: v12, timeout: "5 seconds" }), [s12]))).cases.every((c) => c.outcome === "passed")).toBe(true)
      expect(JSON.stringify(await Effect.runPromiseExit(Effect.scoped(Conformance.verify(Conformance.http(bad.url, { contract: v12, timeout: "5 seconds" }), [s12]))))).toContain("ConformanceFailed")
      const res = await fetch(`${ok.url}/greet`, { method: "POST", body: JSON.stringify({ name: "" }) })
      expect([res.status, await res.json()]).toEqual([422, { _tag: "NotFound", name: "" }])
    } finally { await ok.close(); await bad.close() }
  })
})

describe("local contracts (BEH-BR-225, kit 03 and 05)", () => {
  class Ledger extends Context.Service<Ledger, { readonly post: (n: number) => Effect.Effect<void>; readonly cursors: { readonly get: (n: string) => Effect.Effect<number> } }>()("example/Ledger@1") {}
  const L = Contract.local(Ledger, { version: "1.0.0", members: ["post", "cursors"] })
  it("Contract.local names members without codecs: descriptor.local true, no timeouts or schemas; make gives false", () => {
    expect(L.descriptor).toMatchObject({ local: true, methods: ["cursors", "post"], timeouts: [], schemas: [] })
    expect(v10.descriptor.local).toBe(false)
    expect(Contract.local(Ledger, { version: "1.0.0", members: ["post", "post", "cursors"] }).invalid).toContain("twice")
    // @ts-expect-error a member of the shape is omitted
    Contract.local(Ledger, { version: "1.0.0", members: ["post"] })
  })
  it("a local contract is refused at sdk generate, at Conformance.http, and for generated or wire conformance", async () => {
    const { generateSdk } = await import("../src/sdk.js")
    expect(() => generateSdk(L)).toThrow("sdk-generate")
    expect(() => Conformance.http("http://x", { contract: L, timeout: 1000 })).toThrow("conformance-wire")
    const withGenerated = Conformance.suite(L, { generated: { samples: 1 } })
    const plugin = definePlugin({ id: "example/ledger", provides: Contract.at(L, "1.0.0", { methods: ["post", "cursors"] }), make: Effect.succeed({ post: () => Effect.void, cursors: { get: () => Effect.succeed(0) } }) })
    const exit = await Effect.runPromiseExit(Effect.scoped(Conformance.verify(plugin, [withGenerated])))
    expect(JSON.stringify(exit)).toContain("conformance-generated")
    const ok = await Effect.runPromise(Effect.scoped(Conformance.verify(plugin, [Conformance.suite(L, { cases: [{ id: "posts", since: "1.0.0", run: () => Effect.void }] })])))
    expect(ok.cases.map((c) => c.id)).toEqual(["posts"])
  })
})
