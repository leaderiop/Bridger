// Kit 03 (BEH-KT-017..020): suites, verify over a plugin, a guest entry and an HTTP endpoint.
import { createServer } from "node:http"
import { Context, Effect, Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Conformance, ConformanceFailed, SuiteVersionMismatch } from "../src/conformance.js"
import { Contract } from "../src/contract.js"
import { definePlugin } from "../src/kit.js"
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
