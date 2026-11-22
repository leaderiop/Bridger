// Report 04 R2 (EV-02): verify-events.sh fails on a mode-less declaration, a mismatched call site and a stale catalog; the tree passes.
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const script = resolve(__dirname, "../../../references/core/scripts/verify-events.sh")
// the fixtures are assembled so that the script, which scans this directory too, does not read them as declarations
const MK = "Event" + ".make", WF = "bus" + ".waterfall"
const check = (fixture?: string) => spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, ...(fixture ? { VERIFY_EVENTS_EXTRA: fixture } : {}) } })
const withFixture = (files: Record<string, string>, f: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "events-"))
  try { for (const [n, t] of Object.entries(files)) writeFileSync(join(dir, n), t); f(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe("event catalog (improvement report 04, R2)", { timeout: 60_000 }, () => {
  it("the tree is consistent: every event declares a mode, call sites match, the catalog is current", () => {
    const r = check()
    expect(r.stdout).toContain("0 failure(s)")
    expect(r.status).toBe(0)
  })
  it("a declaration without a mode fails", () => {
    withFixture({ "a.ts": `const Bad = ${MK}<[], void>()("x/unmoded")\n` }, (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("x/unmoded")
    })
  })
  it("a call site of another mode fails, and one id with two modes fails", () => {
    withFixture({ "a.ts": `const A = ${MK}<[], void>()("x/a", { mode: "emit" })\nconst B = ${MK}<[], void>()("x/a", { mode: "serial" })\n${WF}(A, [], z)\n` }, (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("A is a 'emit' event used with .waterfall()")
      expect(r.stdout).toContain("more than one mode")
    })
  })
  it("a key imported from another file is call-site checked too", () => {
    withFixture({ "keys.ts": `export const K = ${MK}<[], void>()("x/k", { mode: "emit" })\n`, "use.ts": `import { K } from "./keys.js"\n${WF}(K, [], z)\n` }, (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("K is a 'emit' event used with .waterfall()")
    })
  })
  it("a key reached through a re-export or a namespace import is call-site checked too", () => {
    withFixture({
      "keys.ts": `export const K = ${MK}<[], void>()("x/k", { mode: "emit" })\n`,
      "index.ts": `export { K as Renamed } from "./keys.js"\n`,
      "use.ts": `import { Renamed } from "./index.js"\nimport * as ns from "./keys.js"\n${WF}(Renamed, [], z)\n${WF}(ns.K, [], z)\n`,
    }, (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("Renamed is a 'emit' event used with .waterfall()")
      expect(r.stdout).toContain("ns.K is a 'emit' event used with .waterfall()")
    })
  })
  it("a helper-built key and a dispatch through an undeclared key fail", () => {
    withFixture({ "a.ts": `const make = (id: string) => ${MK}<[], void>()(id, { mode: "emit" })\n`, "b.ts": `${WF.replace("waterfall", "emit")}(Nowhere)\n` }, (dir) => {
      const r = check(dir)
      expect(r.status).toBe(1)
      expect(r.stdout).toContain("not a declaration with a literal id and mode")
      expect(r.stdout).toContain("uses a key nothing in the file declares or imports")
    })
  })
})
