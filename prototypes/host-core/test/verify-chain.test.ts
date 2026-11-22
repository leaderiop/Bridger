// Kit 06 BEH-KT-047: `bridger verify-chain` reads a bundle and calls the audit-chain verifier; exit 0, 1, 2, 3, 4.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { chainEntries, exportBundle } from "../src/audit-chain.js"
import { main } from "../src/cli.js"

let dirs: Array<string> = []
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = [] })
const cli = async (cwd: string, args: Array<string>) => {
  const out: Array<string> = [], err: Array<string> = []
  const code = await main(args, [], { out: (s) => out.push(s), err: (s) => err.push(s), cwd })
  return { code, out: out.join("\n"), err: err.join("\n") }
}
const rec = (n: number) => ({ hostId: "h1", auditSeq: n, recordId: `r${n}`, kind: "x", auditDropped: 0 })
const setup = (mutate: (b: any) => void = () => {}) => {
  const d = mkdtempSync(join(tmpdir(), "bridger-chain-")); dirs.push(d)
  const b = JSON.parse(JSON.stringify(exportBundle({ createdAt: "2026-01-01T00:00:00.000Z", series: [{ seriesId: "h1", entries: chainEntries({ seriesId: "h1", records: [1, 2, 3].map(rec) }) }], trustRoots: [] })))
  mutate(b); writeFileSync(join(d, "b.json"), JSON.stringify(b)); return d
}

it("an intact bundle exits 0 and prints what was checked, with no overall verdict", async () => {
  const r = await cli(setup(), ["verify-chain", "b.json"])
  expect(r.code).toBe(0); expect(r.out).toContain("digest matches"); expect(r.out).not.toMatch(/verified:? ok|all good/i)
})
it("a tampered bundle exits 1; an expected head the bundle does not reach exits 1; --json prints the report", async () => {
  expect((await cli(setup((b) => { b.segments[0].entries[1].record.kind = "tampered" }), ["verify-chain", "b.json"])).code).toBe(1)
  expect((await cli(setup(), ["verify-chain", "b.json", "--expect-head", "h1=9"])).code).toBe(1)
  expect(JSON.parse((await cli(setup(), ["verify-chain", "b.json", "--json"])).out).format).toBe("bridger-chain-bundle-report/v1")
})
it("usage 2 without a bundle, environment 3 for an unreadable bundle; a loaded module is listed by path and digest", async () => {
  expect((await cli(setup(), ["verify-chain"])).code).toBe(2)
  expect((await cli(setup(), ["verify-chain", "missing.json"])).code).toBe(3)
  const d = setup(); writeFileSync(join(d, "v.mjs"), "export default { anchorKind: 'x', confirm: () => ({ _tag: 'NeedsOnline' }) }\n")
  expect((await cli(d, ["verify-chain", "b.json", "--verifier", "v.mjs"])).out).toMatch(/loaded\s+verifier v\.mjs \(sha256:[0-9a-f]{4,}…/)
})
