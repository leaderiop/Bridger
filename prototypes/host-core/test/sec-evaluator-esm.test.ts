// Report 06 R7: the ES module evaluator holds the same closed world as the CommonJS one (BEH-LD-011).
import { describe, expect, it } from "vitest"
import { EvaluationFailed, type Package } from "../src/loader.js"
import { makeEsmEvaluator } from "../src/evaluator.js"

const enc = new TextEncoder()
const pkg = (files: Record<string, string>): Package => ({
  manifest: enc.encode(JSON.stringify({ extensions: { "@bridger/loader": { entry: { file: "index.js", export: "plugin" } } } })),
  sbom: { format: "none", bytes: new Uint8Array() }, files: new Map(Object.entries(files).map(([k, v]) => [k, enc.encode(v)]))
})
const ev = () => makeEsmEvaluator({ externals: new Map<string, unknown>([["effect", { tag: "effect" }]]), timeoutMs: 200 })
const reason = async (p: Promise<unknown>) => { try { await p; return "ok" } catch (e) { return e instanceof EvaluationFailed ? e.reason : `other:${e}` } }

describe("ES module evaluator (BEH-LD-011)", () => {
  it("import and export work across package files and externals", async () => {
    const v = await ev().evaluate("d1", pkg({ "index.js": `import { id } from "./lib/h.js"; import { tag } from "effect"; import fx from "effect"; export const plugin = { id, tag, same: fx.tag }`, "lib/h.js": `export const id = "hello"` }))
    expect(v).toEqual({ id: "hello", tag: "effect", same: "effect" })
  })
  it("a bare name, URL, node: specifier and a sibling escape fail unresolved-import; dynamic import() rejects; globals are absent", async () => {
    const e = ev()
    for (const [i, spec] of ["left-pad", "https://x.example/a.js", "node:fs", "../x"].entries())
      expect(await reason(e.evaluate(`d${i}`, pkg({ "index.js": `import "${spec}"; export const plugin = 1` }))), spec).toBe("unresolved-import")
    const v = await e.evaluate("dyn", pkg({ "index.js": `export const plugin = { g: typeof process + typeof fetch, d: import("node:fs").then(() => "reached", () => "refused") }` })) as { g: string; d: Promise<string> }
    expect(v.g).toBe("undefinedundefined")
    expect(await v.d).toBe("refused")
  })
  it("a syntax error and a throw are `threw`, a loop is `timeout`, a missing export is `no-entry`, and a digest evaluates once", async () => {
    const e = ev()
    expect(await reason(e.evaluate("s", pkg({ "index.js": `export const = ` })))).toBe("threw")
    expect(await reason(e.evaluate("t", pkg({ "index.js": `throw new Error("boom")` })))).toBe("threw")
    expect(await reason(e.evaluate("l", pkg({ "index.js": `while (true) {}` })))).toBe("timeout")
    expect(await reason(e.evaluate("x", pkg({ "index.js": `export const other = 1` })))).toBe("no-entry")
    const first = await e.evaluate("once", pkg({ "index.js": `export const plugin = {}` }))
    expect(await e.evaluate("once", pkg({ "index.js": `export const plugin = {}` }))).toBe(first)
  })
})
