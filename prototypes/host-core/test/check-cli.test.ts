// `bridger check` (kit BEH-KT-028, acceptance check 30), driven through its entry function with a lock file on disk.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { check, findDuplicateCopies, main } from "../src/check.js"
import { define } from "../src/plugin.js"
import type { PluginManifest } from "../src/manifest.js"
import { Effect, Layer } from "effect"

const fx = (n: string) => join(import.meta.dirname, "fixtures-check", n)
const empty = mkdtempSync(join(tmpdir(), "bridger-root-"))
const run = async (argv: string[]) => { const out: string[] = []; const code = await main([...argv, "--root", empty], { out: (s) => out.push(s) }); return { code, out } }
const lock = () => join(mkdtempSync(join(tmpdir(), "bridger-check-")), "bridger.contracts.lock")

describe("bridger check", () => {
  it("fails with usage when arguments are missing", async () => {
    expect(await main([], { out: () => {} })).toBe(2)
  })
  it("reports a plain key of a manifest-less definition, passes the internal key and the contract key", async () => {
    const r = await run([fx("pkg.ts"), lock()])
    expect(r.code).toBe(1)
    expect(r.out).toEqual(["PlainCrossBoundaryKey bare example/Cache (definition)"])
  })
  it("records the first release, passes the unchanged one, and fails a breaking change under the same major", async () => {
    const l = lock()
    expect(await run([fx("v1.ts"), l, "--write-lock"])).toMatchObject({ code: 0, out: ["bridger check: ok"] })
    expect(JSON.parse(readFileSync(l, "utf8"))).toMatchObject([{ serviceId: "example/Board@1", version: "1.2.0" }])
    expect((await run([fx("v1.ts"), l])).code).toBe(0)
    const r = await run([fx("v2-breaking.ts"), l])
    expect(r.code).toBe(1)
    expect(r.out[0]).toMatch(/^ContractBreakingChange example\/Board@1 1\.2\.0 -> 1\.3\.0: post .*mood added as required/)
  })
  it("does not record a release that has findings", async () => {
    const l = lock()
    await run([fx("pkg.ts"), l, "--write-lock"])
    expect(existsSync(l)).toBe(false)
  })
})

const pkgAt = (root: string, rel: string, name: string, version: string) => {
  const dir = join(root, rel, ...name.split("/")); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }))
  return dir
}

describe("bridger check: duplicate copies (BEH-KT-028)", () => {
  it("passes one copy of effect and @bridger/core, even when hoisted and symlinked from a nested package", async () => {
    const root = mkdtempSync(join(tmpdir(), "bridger-dup-"))
    const effect = pkgAt(root, "node_modules", "effect", "4.0.0"); pkgAt(root, "node_modules", "@bridger/core", "0.3.0")
    mkdirSync(join(root, "node_modules", "other", "node_modules"), { recursive: true }); writeFileSync(join(root, "node_modules", "other", "package.json"), "{}")
    symlinkSync(effect, join(root, "node_modules", "other", "node_modules", "effect"))
    expect(await findDuplicateCopies(root)).toEqual([])
  })
  it("terminates on a symlink cycle between packages", async () => {
    const root = mkdtempSync(join(tmpdir(), "bridger-dup-"))
    pkgAt(root, "node_modules", "effect", "4.0.0")
    const a = join(root, "node_modules", "a"); mkdirSync(join(a, "node_modules"), { recursive: true }); writeFileSync(join(a, "package.json"), "{}")
    symlinkSync(a, join(a, "node_modules", "a"))                                  // a/node_modules/a -> a
    expect(await findDuplicateCopies(root)).toEqual([])
  }, 3000)
  it("fails DuplicateDependencyCopy with both paths and versions when a nested package carries its own copy", async () => {
    const root = mkdtempSync(join(tmpdir(), "bridger-dup-"))
    pkgAt(root, "node_modules", "effect", "4.0.0")
    pkgAt(root, "node_modules/other/node_modules", "effect", "3.9.0"); writeFileSync(join(root, "node_modules", "other", "package.json"), "{}")
    const f = await findDuplicateCopies(root)
    expect(f).toMatchObject([{ _tag: "DuplicateDependencyCopy", package: "effect", copies: [{ version: expect.any(String) }, { version: expect.any(String) }] }])
    expect((f[0] as unknown as { copies: { version: string }[] }).copies.map((c) => c.version).sort()).toEqual(["3.9.0", "4.0.0"])
  })
  it("reports a duplicated @bridger/core separately from effect, through the CLI exit code", async () => {
    const root = mkdtempSync(join(tmpdir(), "bridger-dup-"))
    pkgAt(root, "node_modules", "@bridger/core", "0.3.0"); pkgAt(root, "node_modules/a/node_modules", "@bridger/core", "0.2.0"); writeFileSync(join(root, "node_modules", "a", "package.json"), "{}")
    const out: string[] = []
    expect(await main([fx("v1.ts"), lock(), "--root", root], { out: (s) => out.push(s) })).toBe(1)
    expect(out[0]).toMatch(/^DuplicateDependencyCopy @bridger\/core: /)
  })
})

describe("bridger check: manifest against definition (BEH-KT-028)", () => {
  const def = (id: string, version: string) => define({ id, requires: [] as const, provides: [] as const, meta: { version }, build: Layer.effectDiscard(Effect.void) as never } as never)
  const manifest = (o: Partial<PluginManifest>) => ({ manifestVersion: 1, id: "boards", version: "1.0.0", provides: [], requires: [], ...o }) as PluginManifest
  it("passes a manifest that agrees with its definition", () => {
    expect(check({ manifests: [manifest({})], definitions: [def("boards", "1.0.0")] }, [])).toEqual([])
  })
  it("fails ManifestMismatch naming the first field that disagrees", () => {
    expect(check({ manifests: [manifest({ version: "1.1.0" })], definitions: [def("boards", "1.0.0")] }, [])).toEqual([{ _tag: "ManifestMismatch", plugin: "boards", field: "version" }])
    expect(check({ manifests: [manifest({ requires: [{ serviceId: "example/Db", internal: true }] })], definitions: [def("boards", "1.0.0")] }, [])).toMatchObject([{ _tag: "ManifestMismatch", field: expect.stringContaining("requires") }])
  })
})

