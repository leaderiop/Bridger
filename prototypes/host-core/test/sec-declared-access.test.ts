// Report 06 R2 (S3): the load-time review covers emits and child mounts, and the plan carries the consent diff (BEH-BR-268, BEH-BR-318).
import { Context, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Event, Events, type EventBus } from "../src/bus.js"
import { consentDiff, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { AccessPolicy, declaredOnly } from "../src/policy.js"
import { PluginRuntime } from "../src/runtime.js"
import type { DesiredPlugin } from "../src/desired.js"
import { drive, idle } from "./fixtures.js"
import { as } from "./p4fixtures.js"
import { onHost, reportsManifest } from "./p7fixtures.js"

const Note = Event.make<[], void, never>()("sec/note", { mode: "emit" })
const base: PluginManifest = { manifestVersion: 1, id: "a", version: "1.0.0", provides: [], requires: [] }
const policy = Layer.succeed(AccessPolicy, declaredOnly({ decide: () => "allow" }, { withoutManifest: "allow" }))

/** A plugin that emits `sec/note` and mounts `kid` from its build, with the manifest it is given. */
const actor = (manifest: PluginManifest): AnyPlugin => ({
  id: "a", requires: [Events], provides: [], meta: { version: "1.0.0" }, manifest: { ...manifest, requires: [{ serviceId: "@bridger/core/Events" }] },
  build: Layer.effectDiscard(Effect.gen(function* () {
    const bus: EventBus = yield* Events
    yield* bus.emit(Note)
    const rt = yield* PluginRuntime
    yield* rt.install(define({ id: "kid", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) }) as unknown as AnyPlugin)
  })) as unknown as AnyPlugin["build"]
})
const stateOf = (host: { snapshot: Effect.Effect<{ plugins: ReadonlyArray<{ id: string; state: string }> }> }, id: string) =>
  Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === id)?.state)

describe("declared emits, mounts and hostOps (BEH-BR-268)", () => {
  it("consentDiff widens on an added emit, mount or hostOp, narrows on a removed one, and does not call them unclassified", () => {
    const prev: PluginManifest = { ...base, emits: ["x"], mounts: ["k"], hostOps: ["install"] }
    const next: PluginManifest = { ...base, emits: ["x", "y"], mounts: [], hostOps: ["install", "unmount"] }
    const d = consentDiff(prev, next)
    expect(d.widened).toEqual([{ path: "emits", added: ["y"] }, { path: "hostOps", added: ["unmount"] }])
    expect(d.narrowed).toEqual([{ path: "mounts", removed: ["k"] }])
    expect(d.unclassified).toEqual([])
    expect(consentDiff(undefined, { ...base, emits: ["x"] }).widened).toEqual([{ path: "emits", added: ["x"] }])
  })

  it("an emit or a child mount the manifest does not declare is refused; declared ones pass", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(actor({ ...base, emits: ["sec/note"], mounts: ["kid"] }), as()))
      yield* idle(host)
      const row = (yield* host.snapshot).plugins.find((p) => p.id === "a")
      expect(row?.state === "failed" ? row.failure.message : row?.state).toBe("active")
      expect(yield* stateOf(host, "a/kid")).toBe("active")
    }), { layers: [policy] })
    for (const [label, m] of [["emit", { ...base, mounts: ["kid"] }], ["mount", { ...base, emits: ["sec/note"] }]] as const) {
      await onHost((host) => Effect.gen(function* () {
        yield* drive(host, host.install(actor(m as PluginManifest), as()))
        yield* idle(host)
        expect(yield* stateOf(host, "a"), label).toBe("failed")
      }), { layers: [policy] })
    }
  })
})

describe("the plan carries the consent diff (BEH-BR-318)", () => {
  const entry = (plugin: AnyPlugin): DesiredPlugin => ({ id: plugin.id, plugin })
  const v = (m: Partial<PluginManifest>): AnyPlugin => ({ id: "a", requires: [], provides: [], meta: { version: m.version ?? "1.0.0", digest: m.version ?? "1.0.0" }, manifest: { ...base, ...m }, build: Layer.effectDiscard(Effect.void) as unknown as AnyPlugin["build"] })

  it("an install entry carries the diff from nothing, a replace entry installed against incoming; a manifest-less definition carries none", async () => {
    await onHost((host) => Effect.gen(function* () {
      const first = yield* host.plan([entry(v({ emits: ["x"] }))])
      expect(first.entries[0]?.consentDiff?.widened).toEqual([{ path: "emits", added: ["x"] }])
      yield* drive(host, host.reconcile([entry(v({ emits: ["x"] }))], as()))
      const second = yield* host.plan([entry(v({ version: "1.1.0", emits: ["x", "y"] }))])
      expect(second.entries[0]?.actions).toEqual(["replace"])
      expect(second.entries[0]?.consentDiff?.widened).toEqual([{ path: "emits", added: ["y"] }])
      const bare = yield* host.plan([entry({ ...v({ version: "1.2.0" }), manifest: undefined } as AnyPlugin)])
      expect(bare.entries[0]?.consentDiff).toBeUndefined()
    }))
  })

  it("a plan taken before a manifest widened is stale: apply with `expect` fails with PlanStale", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(v({ emits: ["x"] }))], as()))
      const planned = yield* host.plan([entry(v({ version: "1.1.0", emits: ["x"] }))])
      const exit = yield* Effect.exit(drive(host, host.reconcile([entry(v({ version: "1.1.0", emits: ["x", "y"] }))], { ...as(), expect: planned } as never)))
      expect(JSON.stringify(exit)).toContain("PlanStale")
    }))
  })
})
