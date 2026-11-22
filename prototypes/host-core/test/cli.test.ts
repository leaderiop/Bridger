// Kit 04 (BEH-KT-025..027, 026): the bridger dispatcher, create, sdk generate, inspect and dev.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Context, Effect, Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { devDigest, devSession, main, type Extension } from "../src/cli.js"
import { Contract } from "../src/contract.js"
import { definePlugin } from "../src/kit.js"

let dirs: Array<string> = []
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "bridger-cli-")); dirs.push(d); return d }
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = [] })
const cli = async (cwd: string, args: Array<string>, ext: Array<Extension> = []) => {
  const out: Array<string> = [], err: Array<string> = []
  const code = await main(args, ext, { out: (s) => out.push(s), err: (s) => err.push(s), cwd })
  return { code, out: out.join("\n"), err: err.join("\n") }
}

describe("bridger CLI (kit 04)", () => {
  it("BEH-KT-025: extension commands are listed tagged `extension`; one that shadows a kit command is refused", async () => {
    const ext: Extension = { name: "doctor", synopsis: "doctor   environment checks", run: (_a, io) => { io.out("ok"); return 0 } }
    expect((await cli(tmp(), ["help"], [ext])).out).toContain("doctor   environment checks   [extension]")
    expect((await cli(tmp(), ["doctor"], [ext])).out).toBe("ok")
    await expect(cli(tmp(), ["help"], [{ ...ext, name: "check" }])).rejects.toThrow("shadows a kit command")
  })
  it("an unknown command is a usage error (2); verify-chain without a bundle is a usage error (2)", async () => {
    expect((await cli(tmp(), ["frobnicate"])).code).toBe(2)
    expect((await cli(tmp(), ["verify-chain"])).code).toBe(2)
  })
  it("BEH-KT-025: create writes each template's files, with no `as` and no `any` in generated code", async () => {
    const d = tmp()
    for (const t of ["plugin", "contract", "app", "partner"]) {
      const r = await cli(d, ["create", `demo-${t}`, "--template", t]); expect(r.code).toBe(0)
      const root = join(d, `demo-${t}`)
      const files = [...readdirSync(join(root, "src"))].map((f) => readFileSync(join(root, "src", f), "utf8"))
      for (const f of files) { expect(f).not.toMatch(/\bas\s+(const|\w+)\b/); expect(f).not.toMatch(/:\s*any\b/) }
    }
    expect((await cli(d, ["create", "demo-plugin"])).code).toBe(3)           // exists
    expect(JSON.parse(readFileSync(join(d, "demo-partner", "manifest.json"), "utf8")).requires).toEqual([])
  })
  it("BEH-KT-033: sdk generate writes the module next to the contract and reports it", async () => {
    const d = tmp()
    writeFileSync(join(d, "greeter.contract.ts"), `import { Context, Effect, Schema } from "effect"
import { Contract } from "${join(process.cwd(), "src/contract.js")}"
class Greeter extends Context.Service<Greeter, { readonly greet: (i: { readonly name: string }) => Effect.Effect<{ readonly text: string }> }>()("example/Greeter@1") {}
export const contract = Contract.make(Greeter, { version: "1.2.0", methods: { greet: Contract.method({ payload: Schema.Struct({ name: Schema.String }), success: Schema.Struct({ text: Schema.String }) }) } })
`)
    const r = await cli(d, ["sdk", "generate", "greeter.contract.ts"])
    expect(r.out).toBe("generated src/sdk/greeter.ts for example/Greeter@1 version 1.2.0")
    expect(readFileSync(join(d, "src/sdk/greeter.ts"), "utf8")).toContain("export interface GreeterHandlers")
  })
})

class Hello extends Context.Service<Hello, { readonly say: () => Effect.Effect<string> }>()("example/Hello") {}
const hello = (text: string) => definePlugin({ id: "example/hello", provides: Hello, make: Effect.succeed({ say: () => Effect.succeed(text) }) })

describe("bridger dev (BEH-KT-026)", () => {
  it("start reconciles under the dev scope; a changed digest is a replace, an unchanged one is not; the digest is dev:<hash>", async () => {
    const r = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const s = yield* devSession({ plugins: [hello("a")] })
      const first = yield* s.start([hello("a")], { "example/hello": "v1" })
      const same = yield* s.reload([hello("a")], { "example/hello": "v1" }, ["a.ts"])
      const changed = yield* s.reload([hello("b")], { "example/hello": "v2" }, ["a.ts"])
      return { first: first!.installed, same: same!.unchanged, changed: changed!.replaced, digest: devDigest("v2") }
    })))
    expect(r.first).toEqual(["example/hello"]); expect(r.same).toEqual(["example/hello"]); expect(r.changed).toEqual(["example/hello"])
    expect(r.digest).toMatch(/^dev:[0-9a-f]{12}$/)
  })
  it("refuses to start when the entry wires an audit sink or a gate", async () => {
    const exit = await Effect.runPromiseExit(Effect.scoped(devSession({ plugins: [], host: { auditSink: {} } as never })))
    expect(exit._tag).toBe("Failure")
  })
  it("`dev --once` starts the entry's host and exits 0", async () => {
    const d = tmp()
    writeFileSync(join(d, "app.ts"), `import { Effect, Context } from "effect"
import { definePlugin } from "${join(process.cwd(), "src/kit.js")}"
import { Dev } from "${join(process.cwd(), "src/cli.js")}"
class Hello extends Context.Service<Hello, { readonly say: () => Effect.Effect<string> }>()("example/Hello") {}
export default Dev.app({ plugins: [definePlugin({ id: "example/hello", provides: Hello, make: Effect.succeed({ say: () => Effect.succeed("hi") }) })] })
`)
    const r = await cli(d, ["dev", "--entry", "app.ts", "--once"])
    expect(r.code).toBe(0); expect(r.out).toContain("dev host started: 1 plugin(s) active")
    const i = await cli(d, ["inspect", "--entry", "app.ts", "--json"]); expect(i.code).toBe(0); expect(i.out).toContain("example/Hello")
  })

  it("--plan: the plan is read-only, applied with `expect`; a host that changed meanwhile fails PlanStale and applies nothing; a declined plan changes nothing", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const seen: Array<string> = []
      const s = yield* devSession({ plugins: [] }, { plan: true, confirm: (p) => Effect.sync(() => { seen.push(p.entries.map((e) => `${e.target.id}:${e.actions.join("+")}`).join(",")); return true }) })
      yield* s.start([hello("a")], { "example/hello": "v1" })
      yield* s.reload([hello("b")], { "example/hello": "v2" }, ["a.ts"])
      expect(seen).toEqual(["example/hello:install", "example/hello:replace"])

      // the host changes between the plan and the apply: the apply fails PlanStale and nothing is applied
      const state: { race: boolean; session?: { readonly host: import("./../src/host.js").Host } } = { race: false }
      const racing = yield* devSession({ plugins: [] }, { plan: true, confirm: () => state.race ? state.session!.host.remove("example/hello", { context: { actor: { id: "someone", kind: "user" } } }).pipe(Effect.as(true), Effect.orDie) : Effect.succeed(true) })
      state.session = racing
      yield* racing.start([hello("a")], { "example/hello": "v1" })
      state.race = true
      const exit = yield* Effect.exit(racing.reload([hello("c")], { "example/hello": "v3" }, ["a.ts"]))
      expect(JSON.stringify(exit)).toContain("PlanStale")

      const declining = yield* devSession({ plugins: [] }, { plan: true, confirm: () => Effect.succeed(false) })
      expect(yield* declining.start([hello("a")], {})).toBeUndefined()
      expect((yield* declining.host.snapshot).plugins).toEqual([])
      expect(declining.log).toContain("plan declined")
    })))
  })

  it("BEH-KT-026: the 100th reload warns once that earlier module instances are not released, and suggests a restart", async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const s = yield* devSession({ plugins: [] })
      yield* s.start([hello("a")], { "example/hello": "v0" })
      for (let i = 1; i <= 101; i++) yield* s.reload([hello("a")], { "example/hello": `v${i}` }, ["a.ts"])
      const warnings = s.log.filter((l) => l.startsWith("warning: 100 reloads"))
      expect(warnings).toHaveLength(1); expect(warnings[0]).toContain("restart")
    })))
  })
})

