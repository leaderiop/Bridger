// Phase-P4 scenarios for realms and interception (behaviour 17, BEH-BR-145–152).
import { Context, Effect, Exit, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { PluginRuntime } from "../src/runtime.js"
import { define, type AnyPlugin, type Interception } from "../src/plugin.js"
import { Logger, journal, loggerPlugin, type Journal } from "./fixtures.js"
import { as, find, memorySink, run, scriptedGate, settleWriter, stateIn } from "./p4fixtures.js"

class Database extends Context.Service<Database, { readonly name: string }>()("example/Database") {}
class Repo extends Context.Service<Repo, { readonly db: string }>()("example/Repo") {}

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)

const dbPlugin = (name: string) => define({ id: "db", requires: [] as const, provides: [Database] as const, build: Layer.succeed(Database, { name }) })
const repoPlugin = define({
  id: "repo", requires: [Database] as const, provides: [Repo] as const,
  build: Layer.effect(Repo, Effect.map(Database, (d) => ({ db: d.name })))
})
const tag = (t: string): Interception<Logger["Service"]> => ({ key: Logger, wrap: (s) => ({ log: (m) => s.log(`[${t}] ${m}`) }) })
/** A Logger consumer that logs once as it builds and on demand. */
const writer = (j: Journal, id: string, o: { children?: ReadonlyArray<{ def: AnyPlugin; intercept?: ReadonlyArray<Interception> }> } = {}): AnyPlugin => ({
  id, requires: [Logger], provides: [],
  build: Layer.effectDiscard(Effect.gen(function* () {
    yield* (yield* Logger).log(id)
    const rt = yield* PluginRuntime
    for (const c of o.children ?? []) yield* rt.install(c.def, c.intercept ? { intercept: c.intercept } : {})
  })) as unknown as AnyPlugin["build"]
})

describe("realms (BEH-BR-145–150)", () => {
  it("BEH-BR-145, 147: \"default\" always exists; realms are defined once; one definition runs once per realm that isolates its keys", async () => {
    await run((host) => Effect.gen(function* () {
      expect((yield* host.snapshot).realms.map((r) => r.id)).toEqual(["default"])
      expect(failed(yield* Effect.exit(host.defineRealm("default", { isolate: [] }, as())), "DuplicateRealm")).toBe(true)
      yield* host.defineRealm("tenant-a", { isolate: [Database, Repo] }, as())
      yield* host.defineRealm("tenant-b", { isolate: [Database, Repo] }, as())
      expect(failed(yield* Effect.exit(host.defineRealm("tenant-a", { isolate: [] }, as())), "DuplicateRealm")).toBe(true)
      for (const realm of ["tenant-a", "tenant-b"]) {
        yield* host.install({ ...dbPlugin(realm) } as AnyPlugin, { ...as(), realm })
        yield* host.install(repoPlugin as AnyPlugin, { ...as(), realm })
      }
      yield* host.awaitIdle
      expect(yield* host.use(Repo, (r) => Effect.succeed(r.db), { realm: "tenant-a" })).toBe("tenant-a")
      expect(yield* host.use(Repo, (r) => Effect.succeed(r.db), { realm: "tenant-b" })).toBe("tenant-b")
      expect(failed(yield* Effect.exit(host.install(repoPlugin as AnyPlugin, { ...as(), realm: "tenant-a" })), "DuplicatePlugin")).toBe(true)
      const before = (yield* host.snapshot).revision
      expect(failed(yield* Effect.exit(host.install(repoPlugin as AnyPlugin, { ...as(), realm: "nowhere" })), "UnknownRealm")).toBe(true)
      expect((yield* host.snapshot).revision).toBe(before)                     // nothing registered
    }))
  })

  it("BEH-BR-146: isolated keys resolve and stay inside the realm; a non-isolated key provided from a realm takes the default slot", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.defineRealm("tenant-a", { isolate: [Database] }, as())
      yield* host.install(loggerPlugin(j), as())
      yield* host.install(dbPlugin("a") as AnyPlugin, { ...as(), realm: "tenant-a" })
      yield* host.install(writer(j, "w"), { ...as(), realm: "tenant-a" })      // Logger is not isolated: resolves to the default provider
      yield* host.install(repoPlugin as AnyPlugin, as())                       // default realm: tenant-a's Database does not leak out
      yield* host.awaitIdle
      expect(yield* stateIn(host, "w", "tenant-a")).toBe("active")
      const repo = yield* find(host, "repo")
      expect(repo?.state === "waiting" && repo.missingServiceIds).toEqual(["example/Database"])
      // Repo is not isolated by tenant-a: installing it there would take the default slot repo already holds.
      const clash = yield* Effect.exit(host.install(repoPlugin as AnyPlugin, { ...as(), realm: "tenant-a" }))
      expect(failed(clash, "DuplicateProvider")).toBe(true)
    }))
  })

  it("BEH-BR-146: a realm that isolates a base key hides the base service from its plugins", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.defineRealm("tenant-a", { isolate: [Database] }, as())
      yield* host.install(repoPlugin as AnyPlugin, as())
      yield* host.install(repoPlugin as AnyPlugin, { ...as(), realm: "tenant-a" }).pipe(Effect.exit)   // Repo not isolated: DuplicateProvider
      yield* host.defineRealm("tenant-b", { isolate: [Database, Repo] }, as())
      yield* host.install(repoPlugin as AnyPlugin, { ...as(), realm: "tenant-b" })
      yield* host.awaitIdle
      expect(yield* stateIn(host, "repo")).toBe("active")                      // the base Database
      expect(yield* stateIn(host, "repo", "tenant-b")).toBe("waiting")         // base invisible inside tenant-b
      yield* host.install(dbPlugin("b") as AnyPlugin, { ...as(), realm: "tenant-b" })
      yield* host.awaitIdle
      expect(yield* host.use(Repo, (r) => Effect.succeed(r.db), { realm: "tenant-b" })).toBe("b")
      expect(yield* host.use(Repo, (r) => Effect.succeed(r.db))).toBe("base")
    }), { options: { base: [[Database, { name: "base" }]] } })
  })

  it("BEH-BR-148: a default provider serving consumers in several realms stops after all of them", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.defineRealm("tenant-a", { isolate: [] }, as())
      yield* host.install(loggerPlugin(j), as())
      const closer = (id: string): AnyPlugin => ({ id, requires: [Logger], provides: [],
        build: Layer.effectDiscard(Effect.addFinalizer(() => j.push(`${id}:close`))) as unknown as AnyPlugin["build"] })
      yield* host.install(closer("in-default"), as())
      yield* host.install(closer("in-a"), { ...as(), realm: "tenant-a" })
      yield* host.awaitIdle
      j.lines.length = 0
      yield* host.remove("example/logger", as())
      expect(j.lines).toEqual(["in-a:close", "in-default:close", "logger:close"])
      expect([yield* stateIn(host, "in-default"), yield* stateIn(host, "in-a", "tenant-a")]).toEqual(["waiting", "waiting"])
    }))
  })

  it("BEH-BR-149: snapshots record each plugin's realm and every realm's isolated and available ids", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.defineRealm("tenant-a", { isolate: [Database] }, as())
      yield* host.install(loggerPlugin(j), as())
      yield* host.install(dbPlugin("a") as AnyPlugin, { ...as(), realm: "tenant-a" })
      yield* host.awaitIdle
      const s = yield* host.snapshot
      expect(s.plugins.map((p) => [p.id, p.realm])).toEqual([["example/logger", "default"], ["db", "tenant-a"]])
      expect(s.availableServiceIds).toEqual(["@bridger/core/Events", "example/Logger"])
      expect(s.realms).toEqual([
        { id: "default", isolatedServiceIds: [], availableServiceIds: ["@bridger/core/Events", "example/Logger"] },
        { id: "tenant-a", isolatedServiceIds: ["example/Database"], availableServiceIds: ["@bridger/core/Events", "example/Database", "example/Logger"] }
      ])
    }))
  })

  it("BEH-BR-147: use, useAll and lease naming an undefined realm fail with UnknownRealm before any callback", async () => {
    await run((host) => Effect.gen(function* () {
      let ran = false
      const exit = yield* Effect.exit(host.use(Database, () => Effect.sync(() => { ran = true }), { realm: "nowhere" }))
      expect(failed(exit, "UnknownRealm") && !ran).toBe(true)
      expect(failed(yield* Effect.exit(Effect.scoped(host.lease([Database] as const, { realm: "nowhere" }))), "UnknownRealm")).toBe(true)
    }), { options: { base: [[Database, { name: "base" }]] } })
  })

  it("BEH-BR-145, 196: defineRealm is gated and audited, its records naming the realm as { id: R, realm: R }", async () => {
    const { records, sink } = memorySink()
    const { requests, gate } = scriptedGate((r) => r.operation === "defineRealm" && r.target?.id === "blocked" ? "deny" : "allow")
    await run((host) => Effect.gen(function* () {
      yield* host.defineRealm("tenant-a", { isolate: [] }, as("onboarding"))
      expect(failed(yield* Effect.exit(host.defineRealm("blocked", { isolate: [] }, as())), "OperationRejected")).toBe(true)
      expect((yield* host.snapshot).realms.map((r) => r.id)).toEqual(["default", "tenant-a"])
      yield* settleWriter
      expect(requests.map((r) => r.target)).toEqual([{ id: "tenant-a", realm: "tenant-a" }, { id: "blocked", realm: "blocked" }])
      expect(records.map((r) => [r.operation, r.phase, r.target?.id])).toEqual([
        ["defineRealm", "requested", "tenant-a"], ["defineRealm", "completed", "tenant-a"], ["defineRealm", "rejected", "blocked"]
      ])
    }), { sink, gate })
  })
})

describe("interception (BEH-BR-151, 152)", () => {
  it("BEH-BR-151: interceptions compose realm → inherited → own, per consumer; a child's own intercept replaces inheritance", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.defineRealm("r", { isolate: [], interceptors: [tag("R")] }, as())
      yield* host.install(loggerPlugin(j), as())
      yield* host.install(writer(j, "parent", { children: [{ def: writer(j, "kid") }, { def: writer(j, "own-kid"), intercept: [tag("O")] }] }), { ...as(), realm: "r", intercept: [tag("P")] })
      yield* host.install(writer(j, "plain"), as())
      yield* host.awaitIdle
      expect(j.lines.filter((l) => l.startsWith("log:")).sort()).toEqual([
        "log:[R] [O] own-kid",                                                 // realm, then its own: inheritance replaced (finding G24)
        "log:[R] [P] kid",                                                     // realm, then inherited from the parent
        "log:[R] [P] parent",                                                  // realm, then the parent's own
        "log:plain"                                                            // default realm, no interception
      ])
      // Host.use from application code is never wrapped.
      yield* host.use(Logger, (l) => l.log("app"))
      expect(j.lines.at(-1)).toBe("log:app")
    }))
  })

  it("BEH-BR-151: optional captures are intercepted too", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      class Out extends Context.Service<Out, { readonly logOpt: (m: string) => Effect.Effect<void> }>()("example/Out") {}
      const opt: AnyPlugin = { id: "opt", requires: [], provides: [Out], optional: [Logger],
        build: Layer.effect(Out, Effect.gen(function* () {
          const rt = yield* PluginRuntime
          return { logOpt: (m: string) => rt.optional(Logger).pipe(Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: (l) => l.log(m) }))) }
        })) as unknown as AnyPlugin["build"] }
      yield* host.install(loggerPlugin(j), as())
      yield* host.install(opt, { ...as(), intercept: [tag("O")] })
      yield* host.awaitIdle
      yield* host.use(Out, (o) => o.logOpt("hello"))
      expect(j.lines.at(-1)).toBe("log:[O] hello")
    }))
  })

  it("BEH-BR-152: a wrap that throws fails only the consumer's activation, with phase activation", async () => {
    const j = journal()
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j), as())
      const broken: Interception<Logger["Service"]> = { key: Logger, wrap: () => { throw new Error("wrapper crashed") } }
      yield* host.install(writer(j, "w"), { ...as(), intercept: [broken] })
      yield* host.awaitIdle
      const w = yield* find(host, "w")
      expect(w?.state === "failed" && [w.failure.phase, w.failure.message]).toEqual(["activation", "interception of example/Logger failed: wrapper crashed"])
      expect(yield* stateIn(host, "example/logger")).toBe("active")
      expect((yield* host.inspect("example/logger")).leases).toBe(0)          // wrapping created no lease
    }))
  })
})
