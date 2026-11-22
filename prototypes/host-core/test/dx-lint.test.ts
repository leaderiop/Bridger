// Report 05 R8 follow-up: `check` reports UndeclaredCallTimeUse (BEH-KT-028).
import { describe, expect, it } from "vitest"
import { check } from "../src/check.js"
import { undeclaredCallTimeUse as lint } from "../src/lint.js"

const plugin = (requires: string, body: string) => `
import { Effect } from "effect"
const p = definePlugin({ id: "example/greeter", requires: [${requires}], provides: Greeter,
  make: Effect.gen(function* () {
    const l = yield* Logger
    return { greet: (n: string) => Effect.gen(function* () { ${body} }) }
  }) })`

describe("UndeclaredCallTimeUse lint (BEH-KT-028)", () => {
  it("flags a yield* of an undeclared key inside a returned closure, with plugin id, service and line", () => {
    const f = lint(plugin("Logger", "yield* Audit"), "p.ts")
    expect(f).toEqual([{ _tag: "UndeclaredCallTimeUse", pluginId: "example/greeter", serviceId: "Audit", file: "p.ts", line: 6 }])
  })
  it("does not flag a declared key, a build-time yield*, or a lower-case local", () => {
    expect(lint(plugin("Logger, Audit", "yield* Audit"))).toEqual([])
    expect(lint(plugin("Logger", "const x = yield* helper"))).toEqual([])
    expect(lint(plugin("", "return 1"))).toEqual([])                    // `yield* Logger` at build time is the compiler's business
  })
  it("a key listed in optional is declared; a key the file declares itself is not a service", () => {
    expect(lint(plugin("Logger", "yield* Audit").replace("requires:", "optional: [Audit], requires:"))).toEqual([])
    expect(lint(plugin("Logger", "yield* Audit") + "\nclass Audit {}")).toEqual([])
  })
  it("check() runs it over a package's sources", () => {
    const fs = check({ sources: [{ file: "p.ts", text: plugin("Logger", "yield* Audit") }] }, [])
    expect(fs.map((f) => f._tag)).toEqual(["UndeclaredCallTimeUse"])
  })
})
