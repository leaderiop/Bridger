// P7 (round 2): state handoff (behaviour 34; checks 87, 88 partial, 103) — prototype, evidences no requirement.
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive, idle, memorySink } from "./fixtures.js"
import { as, run, settleWriter, stateIn } from "./p4fixtures.js"

class Counter extends Context.Service<Counter, { readonly count: Ref.Ref<number> }>()("example/Counter") {}
const State = Schema.Struct({ n: Schema.Number })
const SENTINEL = 424242
const counter = (version: string, o: { exportFails?: boolean; importFails?: boolean; accepts?: ReadonlyArray<string>; upgrade?: boolean; buildFails?: boolean; alsoOn?: ReadonlyArray<"restart" | "reconfigure">; noHandoff?: boolean; hv?: string } = {}, journal: Array<string> = []) => define({
  id: "metrics/counter", requires: [] as const, provides: [Counter] as const, meta: { version, digest: `d${version}` },
  build: Layer.effect(Counter, Effect.gen(function* () {
    if (o.buildFails) return yield* Effect.fail("boom")
    journal.push(`build:${version}`)
    yield* Effect.addFinalizer(() => Effect.sync(() => { journal.push(`close:${version}`) }))
    return { count: yield* Ref.make(0) }
  })),
  ...(o.noHandoff ? {} : { handoff: {
    version: o.hv ?? version, schema: State, ...(o.accepts ? { accepts: o.accepts } : {}), ...(o.alsoOn ? { alsoOn: o.alsoOn } : {}),
    export: Effect.gen(function* () { journal.push(`export:${version}`); if (o.exportFails) return yield* Effect.fail("x"); return { n: yield* Ref.get((yield* Counter).count) } }),
    import: (s: { n: number }) => Effect.gen(function* () { journal.push(`import:${version}:${s.n}`); if (o.importFails) return yield* Effect.fail("y"); yield* Ref.set((yield* Counter).count, s.n) }),
    ...(o.upgrade ? { upgrade: ({ encoded }: { encoded: unknown }) => Effect.succeed({ n: (encoded as { n: number }).n + 1 }) } : {})
  } })
}) as unknown as AnyPlugin
const bump = (host: { use: any }) => host.use(Counter, (c: Counter["Service"]) => Ref.set(c.count, SENTINEL)) as Effect.Effect<void>
const read = (host: { use: any }) => host.use(Counter, (c: Counter["Service"]) => Ref.get(c.count)) as Effect.Effect<number>

describe("P7 core 34: state handoff (checks 87, 88, 103)", () => {
  it("check 87: replace of an active plugin exports after the drain, before scope close, imports before publication; one handoff record before system-start; value never recorded", async () => {
    const { records, sink } = memorySink()
    const journal: Array<string> = []
    await run((host) => Effect.gen(function* () {
      yield* host.install(counter("1", {}, journal), as()); yield* idle(host)
      yield* bump(host)
      yield* drive(host, host.replace(counter("1.1", { hv: "1" }, journal), as())); yield* idle(host)
      expect(yield* read(host)).toBe(SENTINEL)
      expect(journal).toEqual(["build:1", "export:1", "close:1", "build:1.1", `import:1.1:${SENTINEL}`])
      yield* settleWriter
      const ops = records.filter((r) => r.target?.id === "metrics/counter").map((r) => r.operation)
      expect(ops.filter((o) => o === "handoff")).toHaveLength(1)
      expect(ops.lastIndexOf("handoff")).toBeLessThan(ops.lastIndexOf("system-start"))
      const rec = records.find((r) => r.operation === "handoff")!
      const replaceReq = records.find((r) => r.operation === "replace" && r.phase === "requested")!
      expect(rec).toMatchObject({ phase: "system", actor: { id: "bridger:system" }, causationId: replaceReq.recordId })
      expect(rec.error).toBeUndefined()
      expect(JSON.stringify(records)).not.toContain(String(SENTINEL))
      expect(JSON.stringify(yield* host.snapshot)).not.toContain(String(SENTINEL))
    }), { sink })
  })

  it("check 88: export failure, unaccepted version, upgrade and import failure; a failed new build abandons", async () => {
    const cases: Array<[AnyPlugin, AnyPlugin, string, string]> = [
      [counter("1", { exportFails: true }), counter("2"), "HandoffExportFailed", "active"],
      [counter("1"), counter("2"), "HandoffVersionUnaccepted", "active"],
      [counter("1"), counter("2", { importFails: true }), "HandoffVersionUnaccepted", "active"],
      [counter("1"), counter("1", { importFails: true }), "HandoffImportFailed", "failed"],
      [counter("1"), counter("1", { buildFails: true }), "HandoffAbandoned", "failed"]
    ]
    for (const [from, to, tag, state] of cases) {
      const { records, sink } = memorySink()
      await run((host) => Effect.gen(function* () {
        yield* host.install(from, as()); yield* idle(host)
        yield* drive(host, host.replace(to, as())); yield* idle(host)
        expect(yield* stateIn(host, "metrics/counter")).toBe(state)
        yield* settleWriter
        const h = records.filter((r) => r.operation === "handoff")
        expect(h.map((r) => r.error?._tag)).toEqual([tag])
        expect(JSON.stringify(h)).not.toMatch(/"x"|"y"|boom/)
      }), { sink })
    }
    // Accepted older version through upgrade.
    await run((host) => Effect.gen(function* () {
      yield* host.install(counter("1"), as()); yield* idle(host); yield* bump(host)
      yield* drive(host, host.replace(counter("2", { accepts: ["1", "2"], upgrade: true }), as())); yield* idle(host)
      expect(yield* read(host)).toBe(SENTINEL + 1)
    }))
  })

  it("check 87/103: no other operation hands off; alsoOn admits restart; cold and an unlisted operation do not", async () => {
    const { records, sink } = memorySink()
    const journal: Array<string> = []
    await run((host) => Effect.gen(function* () {
      yield* host.install(counter("1", { alsoOn: ["restart"] }, journal), as()); yield* idle(host); yield* bump(host)
      yield* drive(host, host.restart("metrics/counter", as())); yield* idle(host)
      expect(yield* read(host)).toBe(SENTINEL)
      yield* drive(host, host.restart("metrics/counter", { ...as(), cold: true } as never)); yield* idle(host)
      expect(yield* read(host)).toBe(0)
      yield* drive(host, host.disable("metrics/counter", as()))
      yield* drive(host, host.enable("metrics/counter", as())); yield* idle(host)
      yield* drive(host, host.replace(counter("1", { noHandoff: true }), as())); yield* idle(host)
      yield* drive(host, host.remove("metrics/counter", as()))
      yield* settleWriter
      expect(records.filter((r) => r.operation === "handoff")).toHaveLength(1)
      expect(journal.filter((j) => j.startsWith("export"))).toEqual(["export:1"])
    }), { sink })
    await run((host) => Effect.gen(function* () {
      const j: Array<string> = []
      yield* host.install(counter("1", {}, j), as()); yield* idle(host)
      yield* drive(host, host.restart("metrics/counter", as())); yield* idle(host)
      expect(j.filter((x) => x.startsWith("export"))).toEqual([])
    }))
  })
})
