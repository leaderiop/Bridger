// BEH-GX-126, 127 on a throwaway installation: the run counts only against the installed packages.
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"
import { captureRunEnvironment, installedPackage, judgeRun, type CaptureQuery, type RunManifest } from "../src/runenv.js"

const NAMES = ["@bridger/core", "effect"]
const setup = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bridger-run-")))
  const pkg = (name: string, version: string) => { const d = join(root, "node_modules", name); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "package.json"), JSON.stringify({ name, version, main: "index.js" })); writeFileSync(join(d, "index.js"), `exports.v = "${version}"`); return d }
  const core = pkg("@bridger/core", "1.0.0"); pkg("effect", "4.0.0")
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ packages: { "node_modules/@bridger/core": { integrity: "sha512-core" }, "node_modules/effect": { integrity: "sha512-eff" } } }))
  const q = (o: Partial<CaptureQuery> = {}): CaptureQuery => ({ executor: "ci-1", suiteVersion: "s1", packageRoot: root, lockfile: join(root, "package-lock.json"), names: NAMES,
    loaded: [{ name: "@bridger/core", version: "1.0.0", url: pathToFileURL(join(core, "index.js")).href }], now: () => new Date("2026-11-22T00:00:00Z"), machine: "m1", ...o })
  const installed = () => NAMES.map((n) => installedPackage(n, root, JSON.stringify({ packages: { "node_modules/@bridger/core": { integrity: "sha512-core" }, "node_modules/effect": { integrity: "sha512-eff" } } }))!)
  return { root, core, q, installed }
}
const kinds = (r: ReturnType<typeof judgeRun>) => r.deviations.map((d) => `${d.kind}:${d.subject}`)

describe("run manifest and package match (BEH-GX-126, 127)", () => {
  it("records the installed identity and counts a run that loaded the installed package, with one package-unverified for effect", () => {
    const { q, installed } = setup(); const m = captureRunEnvironment(q())
    expect(m.format).toBe("bridger-gx-run/1"); expect(m.lockfileDigest).toMatch(/^sha256:[0-9a-f]{64}$/); expect(m.startedAt).toBe("2026-11-22T00:00:00.000Z")
    expect(m.packages.find((p) => p.name === "effect")!.loaded).toBeNull()
    const claimed = captureRunEnvironment(q({ loaded: [...q().loaded, { name: "effect", version: "4.0.0", url: q().loaded[0]!.url }] }))
    expect(claimed.packages.find((p) => p.name === "effect")!.loaded).toBeNull()      // effect never describes itself: a claim is ignored
    const r = judgeRun(m, installed(), NAMES)
    expect(kinds(r)).toEqual(["package-unverified:effect"]); expect(r.counted).toBe(true)
  })
  it("a run that loaded a source tree or another version is a mismatch and is not counted", () => {
    const { q, installed } = setup()
    const src = join(realpathSync(mkdtempSync(join(tmpdir(), "bridger-src-"))), "index.js"); writeFileSync(src, "")
    const fromSource = judgeRun(captureRunEnvironment(q({ loaded: [{ name: "@bridger/core", version: "1.0.0", url: pathToFileURL(src).href }] })), installed(), NAMES)
    expect(fromSource.counted).toBe(false); expect(kinds(fromSource)).toContain("package-mismatch:@bridger/core")
    const otherVersion = judgeRun(captureRunEnvironment(q({ loaded: [{ name: "@bridger/core", version: "9.9.9", url: q().loaded[0]!.url }] })), installed(), NAMES)
    expect(otherVersion.counted).toBe(false)
    const absent = judgeRun(captureRunEnvironment(q({ loaded: [] })), installed(), NAMES)
    expect(absent.counted).toBe(false)                                                // loaded absent: not provably the installed package
  })
  it("a changed installed file, a missing package and a workspace link each fail the rule", () => {
    const { root, core, q, installed } = setup(); const m = captureRunEnvironment(q()); const inst = installed()
    writeFileSync(join(core, "index.js"), "tampered")
    expect(judgeRun(m, installed(), NAMES).counted).toBe(false)                       // filesDigest differs from what the run recorded
    expect(judgeRun({ ...m, packages: m.packages.filter((p) => p.name !== "@bridger/core") }, inst, NAMES).counted).toBe(false)
    const linked = realpathSync(mkdtempSync(join(tmpdir(), "bridger-ws-"))); writeFileSync(join(linked, "package.json"), JSON.stringify({ name: "@bridger/gxp", version: "1.0.0" }))
    mkdirSync(join(root, "node_modules/@bridger"), { recursive: true }); symlinkSync(linked, join(root, "node_modules/@bridger/gxp"))
    const ws = captureRunEnvironment(q({ names: ["@bridger/gxp"] }))
    expect(ws.packages).toEqual([])                                                  // no lockfile entry, so it is left out, never filled from elsewhere
    const withLock = installedPackage("@bridger/gxp", root, JSON.stringify({ packages: { "node_modules/@bridger/gxp": { integrity: "sha512-x" } } }))!
    expect(withLock.resolvedFrom.split("/").includes("node_modules")).toBe(false)     // the real path is outside node_modules
    expect(judgeRun({ ...m, packages: [{ ...withLock, loaded: { name: "@bridger/gxp", version: "1.0.0", from: join(withLock.resolvedFrom, "index.js") } }] }, [withLock], ["@bridger/gxp"]).counted).toBe(false)   // everything else matches: only the location says it is not installed
  })
  it("a blank field raises environment-incomplete naming it, and the run is still counted", () => {
    const { q, installed } = setup(); const m = captureRunEnvironment(q({ executor: " " }))
    const r = judgeRun(m, installed(), NAMES)
    expect(r.counted).toBe(true); expect(kinds(r)).toContain("environment-incomplete:executor")
  })
  it("holds only the fixed fields: no environment variables, command lines or configuration", () => {
    process.env.BRIDGER_SECRET_FOR_TEST = "hunter2"
    const { q } = setup(); const text = JSON.stringify(captureRunEnvironment(q()))
    expect(text).not.toContain("hunter2"); expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(["clock", "environment", "executor", "format", "lockfileDigest", "machine", "packages", "startedAt", "suiteVersion"])
    delete process.env.BRIDGER_SECRET_FOR_TEST
  })
})
void ({} as RunManifest)
