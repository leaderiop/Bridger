// `bridger check` (kit BEH-KT-028, acceptance check 30), driven through its entry function with a lock file on disk.
import { mkdtempSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { main } from "../src/check.js"

const fx = (n: string) => join(import.meta.dirname, "fixtures-check", n)
const run = async (argv: string[]) => { const out: string[] = []; const code = await main(argv, { out: (s) => out.push(s) }); return { code, out } }
const lock = () => join(mkdtempSync(join(tmpdir(), "bridger-check-")), "bridger.contracts.lock")

describe("bridger check", () => {
  it("fails with usage when arguments are missing", async () => {
    expect(await run([])).toMatchObject({ code: 2 })
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
