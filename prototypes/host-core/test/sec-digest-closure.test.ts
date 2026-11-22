// Report 06 R7 (S9): module resolution stays inside the verified package and the application's externals (BEH-LD-011).
import { describe, expect, it } from "vitest"
import { EvaluationFailed, checkExternals, resolveSpecifier, unallowedBuiltins } from "../src/loader.js"

const files = new Map<string, Uint8Array>(["index.js", "lib/a.js", "lib/b.mjs", "lib/sub/index.js"].map((p) => [p, new Uint8Array()]))
const externals = new Map<string, unknown>([["effect", {}], ["@bridger/core", {}]])
const resolve = (from: string, spec: string) => resolveSpecifier("sha256:d", files, from, spec, externals)
const reason = (f: () => unknown) => { try { f(); return "resolved" } catch (e) { return e instanceof EvaluationFailed ? `${e.reason}: ${e.message}` : String(e) } }

describe("import resolution (BEH-LD-011)", () => {
  it("relative imports resolve to files of the package, with the usual extensions and index files", () => {
    expect(resolve("index.js", "./lib/a.js")).toEqual({ kind: "file", path: "lib/a.js" })
    expect(resolve("index.js", "./lib/a")).toEqual({ kind: "file", path: "lib/a.js" })
    expect(resolve("lib/a.js", "./b")).toEqual({ kind: "file", path: "lib/b.mjs" })
    expect(resolve("lib/a.js", "./sub")).toEqual({ kind: "file", path: "lib/sub/index.js" })
    expect(resolve("lib/sub/index.js", "../a.js")).toEqual({ kind: "file", path: "lib/a.js" })
  })
  it("bare specifiers resolve only through externals", () => {
    expect(resolve("index.js", "effect")).toEqual({ kind: "external", name: "effect" })
    expect(reason(() => resolve("index.js", "left-pad"))).toContain("unresolved-import")
  })
  it("a sibling path outside the package, a missing file, a URL, a path and an unlisted node: specifier all fail unresolved-import", () => {
    for (const [from, spec] of [["index.js", "../x"], ["index.js", "../index.js"], ["lib/a.js", "../../index.js"], ["lib/a.js", "../../x"], ["index.js", "./nope"], ["index.js", "https://cdn.example/x.js"], ["index.js", "file:///etc/passwd"], ["index.js", "/etc/passwd"], ["index.js", "node:fs"], ["index.js", "data:text/javascript,1"]] as const)
      expect(reason(() => resolve(from, spec)), `${from} ${spec}`).toContain("unresolved-import")
  })
  it("node: specifiers resolve only when the application put them in externals, and putting a built-in there needs an explicit allow", () => {
    const withFs = new Map<string, unknown>([...externals, ["node:fs", {}], ["path", {}]])
    expect(resolveSpecifier("d", files, "index.js", "node:fs", withFs)).toEqual({ kind: "external", name: "node:fs" })
    expect(unallowedBuiltins(withFs)).toEqual(["node:fs", "path"])
    expect(unallowedBuiltins(withFs, ["node:fs"])).toEqual(["path"])
    expect(() => checkExternals(withFs, ["node:fs"])).toThrow("path")
    expect(() => checkExternals(withFs, ["node:fs", "path"])).not.toThrow()
    expect(() => checkExternals(externals)).not.toThrow()
  })
})
