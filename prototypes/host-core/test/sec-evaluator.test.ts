// Report 06 R7: the reference evaluator runs only the verified bytes; a fixture package tries dynamic import of node:fs, a sibling escape, a URL and an unlisted bare name.
import { describe, expect, it } from "vitest"
import { EvaluationFailed, type Package } from "../src/loader.js"
import { makeEvaluator } from "../src/evaluator.js"

const enc = new TextEncoder()
const pkg = (files: Record<string, string>, entry = { file: "index.js", export: "plugin" }): Package => ({
  manifest: enc.encode(JSON.stringify({ extensions: { "@bridger/loader": { entry } } })),
  sbom: { format: "none", bytes: new Uint8Array() },
  files: new Map(Object.entries(files).map(([k, v]) => [k, enc.encode(v)]))
})
const externals = new Map<string, unknown>([["effect", { tag: "effect" }]])
const ev = () => makeEvaluator({ externals, timeoutMs: 200 })
const reason = (f: () => unknown) => { try { f(); return "ok" } catch (e) { return e instanceof EvaluationFailed ? e.reason : `other:${e}` } }

describe("reference evaluator (BEH-LD-011, BEH-LD-012)", () => {
  it("evaluates relative imports inside the package and externals the application supplied", () => {
    const e = ev()
    const v = e.evaluate("d1", pkg({ "index.js": `const h = require("./lib/h.js"); exports.plugin = { id: h.id, fx: require("effect").tag }`, "lib/h.js": `exports.id = "hello"` })) as { id: string; fx: string }
    expect(v).toEqual({ id: "hello", fx: "effect" })
  })
  it("every route outside the package fails: bare name, URL, node:fs, sibling escape, dynamic import and host globals", () => {
    const e = ev()
    for (const [i, src] of ["require('left-pad')", "require('https://x.example/a.js')", "require('node:fs')", "require('../x')"].entries())
      expect(reason(() => e.evaluate(`d${i}`, pkg({ "index.js": `${src}; exports.plugin = 1` }))), src).toBe("unresolved-import")
    expect(reason(() => e.evaluate("dyn", pkg({ "index.js": `exports.plugin = typeof process + typeof fetch + typeof require + typeof globalThis.process` })))).toBe("ok")
    expect(e.evaluate("dyn", pkg({ "index.js": "" }))).toBe("undefinedundefinedfunctionundefined")                      // resident: the first evaluation is returned
    const dyn = e.evaluate("dyn2", pkg({ "index.js": `exports.plugin = import("node:fs").then(() => "reached", () => "refused")` })) as Promise<string>
    return expect(dyn).resolves.toBe("refused")
  })
  it("syntax errors and throws are `threw`, a missing entry is `no-entry`, a loop is `timeout`, and one digest evaluates once", () => {
    const e = ev()
    expect(reason(() => e.evaluate("s", pkg({ "index.js": `import x from "y"` })))).toBe("threw")
    expect(reason(() => e.evaluate("t", pkg({ "index.js": `throw new Error("boom")` })))).toBe("threw")
    expect(reason(() => e.evaluate("n", pkg({ "other.js": "" })))).toBe("no-entry")
    expect(reason(() => e.evaluate("x", pkg({ "index.js": `exports.nope = 1` })))).toBe("no-entry")
    expect(reason(() => e.evaluate("l", pkg({ "index.js": `while (true) {}` })))).toBe("timeout")
    const first = e.evaluate("once", pkg({ "index.js": `exports.plugin = {}` }))
    expect(e.evaluate("once", pkg({ "index.js": `exports.plugin = {}` }))).toBe(first)
    expect(e.resident()).toContain("once")
  })
  it("constructing an evaluator whose externals name a Node built-in without an allow fails", () => {
    expect(() => makeEvaluator({ externals: new Map([["node:fs", {}]]) })).toThrow("node:fs")
    expect(() => makeEvaluator({ externals: new Map([["node:fs", {}]]), allowBuiltins: ["node:fs"] })).not.toThrow()
  })
})
