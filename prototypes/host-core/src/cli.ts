// The `bridger` command line of @bridger/kit (references/kit behaviours 04, BEH-KT-025..032): a dispatcher with extension commands, and
// `create`, `check`, `test`, `sdk generate`, `inspect`, `dev`, `pack`, `publish`, `countersign` and `verify-chain`; the last four call the prototype's
// loader kernel (loader.ts) and audit-chain verifier (audit-chain.ts), so the kit implements no digest (BEH-KT-029).
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Effect, type Layer } from "effect"
import { main as check } from "./check.js"
import { catalogOf, renderCatalog } from "./catalog.js"
import { CONTRACT, type Contract } from "./contract.js"
import * as Host from "./host.js"
import type { AnyPlugin } from "./plugin.js"
import { countersign, pack, publish, verifyChain } from "./kit-release.js"
import { generateSdk } from "./sdk.js"

export interface Io { readonly out: (s: string) => void; readonly err: (s: string) => void; readonly cwd: string }
export interface Extension { readonly name: string; readonly synopsis: string; readonly run: (args: ReadonlyArray<string>, io: Io) => Promise<number> | number }
const KIT_COMMANDS = ["create", "dev", "test", "check", "pack", "publish", "countersign", "verify-chain", "inspect", "sdk"] as const
const SYNOPSIS: Readonly<Record<string, string>> = {
  create: "create <name> [--template plugin|contract|app|partner]", dev: "dev [--entry <module>] [--plan] [--cold]", test: "test [--conformance] [--reporter <name>]",
  check: "check <package-module> <lockfile> [--write-lock]", pack: "pack [--out <dir>]", publish: "publish <package> --target <name> [--signer <adapter>]",
  countersign: "countersign <package> [--signer <adapter>]", "verify-chain": "verify-chain <bundle>", inspect: "inspect [--json] [--entry <module>]", sdk: "sdk generate <contract-module> [--out <dir>]"
}

/** BEH-KT-025: an application registers commands; one named like a kit command is refused. */
export const makeCli = (extensions: ReadonlyArray<Extension> = []) => {
  for (const e of extensions) if ((KIT_COMMANDS as ReadonlyArray<string>).includes(e.name)) throw new Error(`extension \`${e.name}\` shadows a kit command (BEH-KT-025)`)
  const help = (io: Io) => { io.out("bridger <command>\n" + KIT_COMMANDS.map((c) => `  ${SYNOPSIS[c]}`).join("\n") + (extensions.length ? "\n" + extensions.map((e) => `  ${e.synopsis}   [extension]`).join("\n") : "")); return 0 }
  return async (argv: ReadonlyArray<string>, io: Io): Promise<number> => {
    const [cmd, ...rest] = argv
    if (!cmd || cmd === "--help" || cmd === "help") return help(io)
    const ext = extensions.find((e) => e.name === cmd)
    if (ext) return ext.run(rest, io)
    switch (cmd) {
      case "create": return create(rest, io)
      case "check": return check(rest, { out: io.out })
      case "test": return test(rest, io)
      case "sdk": return sdk(rest, io)
      case "verify-chain": return verifyChain(rest, io, load)
      case "pack": return pack(rest, io)
      case "publish": return publish(rest, io)
      case "countersign": return countersign(rest, io)
      case "inspect": return inspect(rest, io)
      case "dev": return dev(rest, io)
      default: io.err(`bridger: unknown command \`${cmd}\``); return 2
    }
  }
}

const flag = (args: ReadonlyArray<string>, name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const write = (root: string, rel: string, text: string) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text) }

// ------------------------------------------------------------------------------------------------ create (BEH-KT-025)
const idOf = (name: string) => `example/${name}`
const pascal = (s: string) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_m, _a, c: string) => c.toUpperCase())
const templates: Readonly<Record<string, (name: string) => Readonly<Record<string, string>>>> = {
  plugin: (n) => ({
    [`src/${n}.ts`]: `import { Context, Effect } from "effect"\nimport { definePlugin } from "@bridger/kit"\n\nexport class ${pascal(n)} extends Context.Service<${pascal(n)}, { readonly ping: () => Effect.Effect<string> }>()("${idOf(n)}") {}\n\nexport const ${n.replace(/-/g, "_")} = definePlugin({\n  id: "${idOf(n)}",\n  provides: ${pascal(n)},\n  make: Effect.succeed({ ping: () => Effect.succeed("pong") })\n})\n`,
    [`test/${n}.test.ts`]: `import { Effect } from "effect"\nimport { expect } from "vitest"\nimport { it } from "@bridger/kit/testing"\nimport { ${n.replace(/-/g, "_")}, ${pascal(n)} } from "../src/${n}.js"\n\nit.plugin("pings", ${n.replace(/-/g, "_")}, {}, (t) => Effect.gen(function* () {\n  expect(yield* t.use(${pascal(n)}, (s) => s.ping())).toBe("pong")\n}))\n`
  }),
  contract: (n) => ({
    [`src/${n}.contract.ts`]: `import { Context, Effect, Schema } from "effect"\nimport { Contract } from "@bridger/core"\n\nexport class ${pascal(n)} extends Context.Service<${pascal(n)}, { readonly ping: (i: { readonly text: string }) => Effect.Effect<{ readonly text: string }> }>()("${idOf(n)}@1") {}\n\nexport const contract = Contract.make(${pascal(n)}, {\n  version: "1.0.0",\n  methods: { ping: Contract.method({ payload: Schema.Struct({ text: Schema.String }), success: Schema.Struct({ text: Schema.String }) }) }\n})\n`
  }),
  app: (n) => ({
    [`src/${n}.ts`]: `import { Effect } from "effect"\nimport { definePlugin } from "@bridger/kit"\nimport { Dev } from "@bridger/kit/dev"\nimport { Context } from "effect"\n\nexport class Hello extends Context.Service<Hello, { readonly say: () => Effect.Effect<string> }>()("${idOf(n)}/Hello") {}\nconst hello = definePlugin({ id: "${idOf(n)}/hello", provides: Hello, make: Effect.succeed({ say: () => Effect.succeed("hello") }) })\n\nexport default Dev.app({ plugins: [hello] })\n`
  }),
  partner: (n) => ({
    [`src/handlers.ts`]: `import { serve } from "./sdk/${n}.js"\n\nexport default serve({\n  async ping(input) {\n    return { text: input.text }\n  }\n})\n`,
    [`test/conformance.test.ts`]: `// Runs the contract's published suites against the handlers through the in-process test transport (tests only).\nimport { it } from "vitest"\n\nit.todo("Conformance.verify(Conformance.guest(entry, contract), suites)")\n`,
    [`manifest.json`]: JSON.stringify({ manifestVersion: 1, id: idOf(n), version: "1.0.0", provides: [{ serviceId: `${idOf(n)}@1` }], requires: [], optional: [], activation: [], contributions: [], listens: [], requested: { capabilities: [] }, extensions: { "@bridger/loader": { entry: { file: "src/handlers.ts", export: "default" } } } }, null, 2) + "\n"
  })
}
const create = (args: ReadonlyArray<string>, io: Io): number => {
  const name = args[0]
  if (!name || name.startsWith("--")) { io.err("usage: bridger create <name> [--template plugin|contract|app|partner]"); return 2 }
  const template = flag(args, "--template") ?? "plugin"
  const make = templates[template]
  if (!make) { io.err(`unknown template \`${template}\``); return 2 }
  const root = resolve(io.cwd, name)
  if (existsSync(root)) { io.err(`${name} already exists`); return 3 }
  for (const [rel, text] of Object.entries(make(name))) write(root, rel, text)
  write(root, "package.json", JSON.stringify({ name, version: "0.0.0", type: "module", private: true }, null, 2) + "\n")
  io.out(`created ${name} (${template})`)
  return 0
}

let loads = 0
const load = async (file: string, io: Io): Promise<Record<string, unknown>> => import(pathToFileURL(resolve(io.cwd, file)).href + `?t=${++loads}`)

// ------------------------------------------------------------------------------------------------ test (BEH-KT-027)
const test = (args: ReadonlyArray<string>, io: Io): number => {
  const r = spawnSync("npx", ["vitest", "run", ...(flag(args, "--reporter") ? ["--reporter", flag(args, "--reporter")!] : [])], { cwd: io.cwd, encoding: "utf8" })
  io.out(r.stdout + r.stderr)
  return r.status === 0 ? 0 : 1
}

// ------------------------------------------------------------------------------------------------ sdk generate (BEH-KT-033)
const sdk = async (args: ReadonlyArray<string>, io: Io): Promise<number> => {
  if (args[0] !== "generate" || !args[1]) { io.err("usage: bridger sdk generate <contract-module> [--out <dir>]"); return 2 }
  let mod: Record<string, unknown>
  try { mod = await load(args[1], io) } catch { io.err(`cannot load ${args[1]}`); return 3 }
  const contract = Object.values(mod).find((v): v is Contract => typeof v === "object" && v !== null && (v as { [CONTRACT]?: unknown })[CONTRACT] === "contract")
  if (!contract) { io.err(`${args[1]} exports no contract`); return 3 }
  const out = resolve(io.cwd, flag(args, "--out") ?? "src/sdk")
  let text: string
  try { text = generateSdk(contract) } catch (e) { io.err(String((e as Error).message)); return 3 }
  const file = contract.descriptor.serviceId.split("@")[0]!.split("/").pop()!.toLowerCase() + ".ts"
  write(out, file, text)
  io.out(`generated ${join(flag(args, "--out") ?? "src/sdk", file)} for ${contract.descriptor.serviceId} version ${contract.version}`)
  return 0
}

// ------------------------------------------------------------------------------------------------ inspect (BEH-KT-031, read only)
export interface DevApp { readonly plugins: ReadonlyArray<AnyPlugin>; readonly host?: Host.Options; readonly base?: Layer.Layer<never> }
export const Dev = { app: (app: DevApp): DevApp => app }
const inspect = async (args: ReadonlyArray<string>, io: Io): Promise<number> => {
  const entry = flag(args, "--entry")
  if (!entry) { io.err("usage: bridger inspect [--json] --entry <module>"); return 2 }
  const app = (await load(entry, io)).default as DevApp | undefined
  if (!app?.plugins) { io.err(`${entry} has no default Dev.app`); return 3 }
  const cat = catalogOf(app.plugins)
  io.out(args.includes("--json") ? JSON.stringify(cat, null, 2) : renderCatalog(cat))
  return 0
}

// ------------------------------------------------------------------------------------------------ dev (BEH-KT-026)
const DEV_ACTOR = { id: "bridger-dev", kind: "service" as const }
const REFUSED = ["auditSink", "gate", "operationGate", "configFingerprinter"]
/** The development digest: `dev:` and a hash of the definition's module sources (BEH-KT-026). */
export const devDigest = (sources: string) => "dev:" + createHash("sha256").update(sources).digest("hex").slice(0, 12)

/** A dev session over a host the session creates; `reload` re-reconciles with fresh development digests. Returns exit code 3 on a refused option. */
export const devSession = (app: DevApp, options: { readonly cold?: boolean; readonly plan?: boolean; readonly confirm?: (plan: Host.ReconcilePlan) => Effect.Effect<boolean> } = {}) => Effect.gen(function* () {
  for (const k of REFUSED) if ((app.host as Record<string, unknown> | undefined)?.[k] !== undefined) return yield* Effect.fail(new Error(`dev refuses to start: the entry wires ${k}`))
  const host = yield* Host.make({ ...app.host })
  let reloads = 0
  const apply = (plugins: ReadonlyArray<AnyPlugin>, sources: Readonly<Record<string, string>>, reason: string) => Effect.gen(function* () {
    const desired = plugins.map((p) => { const digest = devDigest(sources[p.id] ?? ""); return { id: p.id, plugin: { ...p, meta: { version: p.meta?.version ?? "0.0.0-dev", ...p.meta, digest } } as AnyPlugin } })
    const ro = { scope: "bridger:dev", ...(options.cold ? { cold: true } : {}) } as Host.ReconcileOptions
    // --plan: show the read-only plan, and after confirmation apply it with `expect`, so a host that changed meanwhile fails PlanStale and applies nothing (BEH-KT-026)
    const plan = options.plan ? yield* host.plan(desired, ro) : undefined
    if (plan && options.confirm && !(yield* options.confirm(plan))) { io0.push("plan declined"); return undefined }
    const report = yield* host.reconcile(desired, { ...ro, context: { actor: DEV_ACTOR, reason }, ...(plan ? { expect: plan } : {}) } as never)
    for (const r of report.replaced) io0.push(`replaced ${r}`)
    return report
  })
  const io0: Array<string> = []
  return {
    host, log: io0,
    start: (plugins: ReadonlyArray<AnyPlugin>, sources: Readonly<Record<string, string>>) => apply(plugins, sources, "dev start"),
    reload: (plugins: ReadonlyArray<AnyPlugin>, sources: Readonly<Record<string, string>>, files: ReadonlyArray<string>) => { reloads++; if (reloads === 100) io0.push("warning: 100 reloads in this process; earlier module instances are not reclaimed, restart"); return apply(plugins, sources, `dev reload: ${files.join(", ")}`) }
  }
})

/** shortcut: a plugin's "module sources" are the entry file's text; a per-definition import graph needs the bundler the loader companion owns. */
const sourcesOf = (entry: string, plugins: ReadonlyArray<AnyPlugin>, io: Io) => Object.fromEntries(plugins.map((p) => [p.id, readFileSync(resolve(io.cwd, entry), "utf8")]))
const dev = async (args: ReadonlyArray<string>, io: Io): Promise<number> => {
  const entry = flag(args, "--entry") ?? "src/app.ts"
  const app = (await load(entry, io)).default as DevApp | undefined
  if (!app?.plugins) { io.err(`${entry} has no default Dev.app`); return 3 }
  const program = Effect.scoped(Effect.gen(function* () {
    const s = yield* devSession(app, { cold: args.includes("--cold"), plan: args.includes("--plan"), confirm: (plan) => Effect.sync(() => { io.out(`plan: ${plan.entries.map((e) => `${e.target.id} ${e.actions.join("+") || "unchanged"}`).join(", ") || "nothing to do"}`); return true }) })   // shortcut: no interactive prompt; the plan is printed and applied
    yield* s.start(app.plugins, sourcesOf(entry, app.plugins, io))
    io.out(`dev host started: ${app.plugins.length} plugin(s) active`)
    if (args.includes("--once")) return
    yield* Effect.callback<void>((resume) => {
      const w = watch(dirname(resolve(io.cwd, entry)), { recursive: true }, (_ev, file) => {
        void (async () => {
          const next = (await load(entry, io)).default as DevApp
          const r = await Effect.runPromiseExit(s.reload(next.plugins, sourcesOf(entry, next.plugins, io), [String(file)]))
          if (r._tag === "Failure") io.err(`reload failed: ${String((r.cause as { failures?: Array<{ error?: { _tag?: string } }> }).failures?.[0]?.error?._tag ?? "error")}; still watching`)
          else for (const x of s.log.splice(0)) io.out(x)
        })()
      })
      return Effect.sync(() => { w.close(); resume(Effect.void) })
    })
  }))
  const r = await Effect.runPromiseExit(program)
  if (r._tag === "Failure") { io.err(String((r.cause as { failures?: Array<{ error?: Error }> }).failures?.[0]?.error?.message ?? "dev failed")); return 3 }
  return 0
}

export const main = async (argv: ReadonlyArray<string>, extensions: ReadonlyArray<Extension> = [], io: Io = { out: (s) => console.log(s), err: (s) => console.error(s), cwd: process.cwd() }) => makeCli(extensions)(argv, io)
