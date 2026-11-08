// P7 third pass (CCR-BR-029 alignment): atomic undo per entry (R1-01, R1-02), RefusalList in reconcile, plan and
// atomic validation (R1-07, R1-12), undo removals with the prune options (R1-11). Prototype; evidences no requirement.
import { Context, Effect, Layer, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { PluginConfig } from "../src/config.js"
import type { DesiredPlugin } from "../src/desired.js"
import { OperationGate, OperationRejected, RefusalList, type OperationRequest } from "../src/gxp.js"
import { lazy } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import type * as Testing from "../src/testing.js"
import { drive, idle, memorySink } from "./fixtures.js"
import { as, settleWriter, stateIn } from "./p4fixtures.js"
import { errorOf, onHost } from "./p7fixtures.js"

const entry = (plugin: AnyPlugin, extra: Partial<DesiredPlugin> = {}): DesiredPlugin => ({ id: plugin.id, plugin, ...extra })
class Knob extends Context.Service<Knob, { readonly n: number }>()("example/Knob") {}
/** A plugin whose build journals the decoded config it got. */
const knob = (version: string, journal: Array<string>) => define({
  id: "knob", requires: [] as const, provides: [Knob] as const, meta: { version, digest: `knob-${version}` },
  config: Schema.Struct({ n: Schema.Number }),
  build: Layer.effect(Knob, Effect.gen(function* () { const c = (yield* PluginConfig).value as { n: number }; journal.push(`${version}:${c.n}`); return { n: c.n } }))
}) as unknown as AnyPlugin
const plain = (id: string, digest = `${id}-1`) => define({ id, requires: [] as const, provides: [] as const, meta: { version: "1", digest }, build: Layer.empty as never }) as unknown as AnyPlugin
/** A gate that refuses the install of `id` (the failure that starts the undo). */
const refuseInstallOf = (id: string): OperationGate["Service"] => ({
  authorize: (q: OperationRequest) => q.operation === "install" && q.target?.id === id ? Effect.fail(new OperationRejected({ operation: q.operation, reason: "not approved" })) : Effect.void
})

describe("P7 third pass: undo restores per entry (R1-01, R1-02)", () => {
  it("R1-01 regression: the undo of a replace re-issues reconfigure with the entry's previous override; the plan lists both", async () => {
    const journal: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(knob("1", journal), { config: { n: 1 } })], as()))
      yield* idle(host)
      // [replace] only: the list gives no config, so replace drops the override and nothing restores it but the undo.
      const list = [entry(knob("2", journal)), entry(plain("x"))]
      const p = yield* host.plan(list, { atomic: true })
      expect(p.entries.find((e) => e.target.id === "knob")!.undo).toEqual(["replace", "reconfigure"])
      const exit = yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), atomic: true })))
      expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", undone: [{ id: "knob", action: "replace" }] })
      yield* idle(host)
      expect(yield* stateIn(host, "knob")).toBe("active")
      expect(journal.at(-1)).toBe("1:1")                                         // the previous definition, with its override
      expect(yield* host.use(Knob, (k) => Effect.succeed(k.n))).toBe(1)
    }), { gate: refuseInstallOf("x") })
  })

  it("R1-02 regression: a multi-action entry [replace, reconfigure] is undone in full, each check against the revision the previous undo produced", async () => {
    const journal: Array<string> = []
    const { records, sink } = memorySink()
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.reconcile([entry(knob("1", journal), { config: { n: 1 } })], as()))
      yield* idle(host)
      const list = [entry(knob("2", journal), { config: { n: 2 } }), entry(plain("x"))]
      const p = yield* host.plan(list, { atomic: true })
      expect(p.entries.find((e) => e.target.id === "knob")).toMatchObject({ actions: ["replace", "reconfigure"], undo: ["reconfigure", "replace", "reconfigure"] })
      const exit = yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), atomic: true })))
      const e = errorOf(exit)
      expect(e._tag).toBe("ApplyRolledBack")                                     // was PartialApply / ChangedSinceApply
      expect(e.undone).toEqual([{ id: "knob", realm: "default", action: "reconfigure" }, { id: "knob", realm: "default", action: "replace" }])
      yield* idle(host)
      expect(yield* host.use(Knob, (k) => Effect.succeed(k.n))).toBe(1)
      yield* settleWriter
      const undo = records.filter((r) => r.undoes && r.phase === "requested").map((r) => r.operation)
      expect(undo).toEqual(["reconfigure", "replace", "reconfigure"])
    }), { gate: refuseInstallOf("x"), sink })
  })
})

describe("P7 third pass: RefusalList in plan, reconcile and atomic apply (R1-07, R1-12)", () => {
  const listed = new Set<string>()
  const refusal = Layer.succeed(RefusalList, { refused: (s) => listed.has(s.digest) ? Option.some("revoked") : Option.none() })

  it("R1-07: plan and atomic validation list a refused action as OperationRejected 'refused-digest: …'; without atomic step 4b refuses it once", async () => {
    listed.clear(); listed.add("bad-1")
    const { records, sink } = memorySink()
    await onHost((host) => Effect.gen(function* () {
      const list = [entry(plain("ok")), entry(plain("bad"))]
      const p = yield* host.plan(list)
      expect(p.entries.map((e) => e.target.id)).toEqual(["ok"])
      expect(p.rejected).toEqual([{ id: "bad", realm: "default", reason: { _tag: "OperationRejected", message: "refused-digest: revoked" } }])
      // atomic: a validation-stage rejection, nothing applied, no record.
      const exit = yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), atomic: true })))
      expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", undone: [], failed: [{ id: "bad", action: "install", reason: { _tag: "OperationRejected", message: "refused-digest: revoked" } }] })
      yield* settleWriter
      expect(records).toEqual([])
      expect(yield* stateIn(host, "ok")).toBe("uninstalled")
      // without atomic: the actions are issued; step 4b writes one rejected record; expect with the plan applies.
      const r = yield* drive(host, host.reconcile(list, { ...as(), expect: p }))
      expect(r.installed).toEqual(["ok"])
      expect(r.rejected.map((x) => [x.id, x.reason._tag])).toEqual([["bad", "OperationRejected"]])
      yield* settleWriter
      expect(records.filter((x) => x.target?.id === "bad").map((x) => x.phase)).toEqual(["rejected"])
      // The plan's rejected set goes stale when the list changes.
      listed.clear()
      const stale = yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), expect: p })))
      expect(errorOf(stale)?._tag).toBe("PlanStale")
    }), { sink, layers: [refusal] })
  })

  it("R1-07: a registration the list disabled ('refused-digest') issues no enable, keeps registeredAt, and an operator disable takes it over", async () => {
    listed.clear()
    await onHost((host) => Effect.gen(function* () {
      const lz = lazy({ manifest: { manifestVersion: 1, id: "rep", version: "1.0.0", provides: [], requires: [], activation: [{ _tag: "OnContribution", registry: "r", id: "c" }] }, load: Effect.succeed(plain("rep", "rep-d")), digest: "rep-d" })
      const list: Array<DesiredPlugin> = [{ id: "rep", plugin: lz as unknown as AnyPlugin }]
      yield* drive(host, host.reconcile(list, as()))
      const before = (yield* host.plan(list)).unchanged
      expect(before).toEqual([{ id: "rep", realm: "default" }])
      const p0 = yield* host.plan([...list, entry(plain("other"))])
      listed.add("rep-d")
      yield* host.wake({ _tag: "OnContribution", registry: "r", id: "c" })
      expect((yield* host.snapshot).plugins.find((x) => x.id === "rep")).toMatchObject({ state: "disabled", reason: "refused-digest" })
      const again = yield* drive(host, host.reconcile(list, as()))
      expect(again).toMatchObject({ unchanged: ["rep"], enabled: [], disabled: [] })
      // registeredAt did not move: a plan taken before the refusal still applies.
      const p1 = yield* host.plan([...list, entry(plain("other"))])
      expect(p1.entries).toEqual(p0.entries)
      // An operator disable takes the registration over: reason cleared, registeredAt moves, the next run is unchanged.
      const toDisabled = yield* drive(host, host.reconcile([{ ...list[0]!, disabled: true }], as()))
      expect(toDisabled.disabled).toEqual(["rep"])
      expect((yield* host.snapshot).plugins.find((x) => x.id === "rep")).toEqual(expect.not.objectContaining({ reason: "refused-digest" }))
      expect((yield* drive(host, host.reconcile([{ ...list[0]!, disabled: true }], as()))).unchanged).toEqual(["rep"])
    }), { layers: [refusal] })
  })

  it("R1-12: a digest listed after validation is refused at step 4b and stops the atomic apply (OperationRejected 'refused-digest: …')", async () => {
    listed.clear()
    const gate: OperationGate["Service"] = { authorize: (q) => Effect.sync(() => { if (q.target?.id === "a" && !q.undo) listed.add("b-1") }) }
    await onHost((host) => Effect.gen(function* () {
      const exit = yield* Effect.exit(drive(host, host.reconcile([entry(plain("a")), entry(plain("b"))], { ...as(), atomic: true })))
      expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", failed: [{ id: "b", action: "install", reason: { _tag: "OperationRejected", message: "refused-digest: revoked" } }], undone: [{ id: "a", action: "install" }] })
      expect(yield* stateIn(host, "a")).toBe("uninstalled")
    }), { gate, layers: [refusal] })
  })
})

describe("P7 third pass: undo removals use the prune options whatever prune is (R1-11)", () => {
  class Svc extends Context.Service<Svc, { readonly n: number }>()("example/Svc") {}
  const held = define({ id: "held", requires: [] as const, provides: [Svc] as const, meta: { version: "1", digest: "held-1" }, build: Layer.succeed(Svc, { n: 1 }) }) as unknown as AnyPlugin
  for (const force of [true, false]) {
    it(`R1-11: with prune false, the undo of an install removes with pruneForce ${force} (a held lease ${force ? "is forced" : "parks it: PartialApply DrainTimeout"})`, async () => {
      let hostRef: Testing.TestHost | undefined
      const gate: OperationGate["Service"] = {
        authorize: (q) => q.operation === "install" && q.target?.id === "x" && !q.undo
          ? Effect.gen(function* () {
              while ((yield* stateIn(hostRef!, "held")) !== "active") yield* Effect.sleep(1)
              yield* Effect.forkDetach(hostRef!.use(Svc, () => Effect.never))
              yield* Effect.sleep(5)
              return yield* Effect.fail(new OperationRejected({ operation: q.operation, reason: "no" }))
            })
          : Effect.void
      }
      await onHost((host) => Effect.gen(function* () {
        hostRef = host
        const exit = yield* Effect.exit(drive(host, host.reconcile([entry(held), entry(plain("x"))], { ...as(), atomic: true, prune: false, pruneDrain: 20, pruneForce: force })))
        const e = errorOf(exit)
        if (force) { expect(e._tag).toBe("ApplyRolledBack"); expect(yield* stateIn(host, "held")).toBe("uninstalled") }
        else { expect(e._tag).toBe("PartialApply"); expect(e.notUndone.map((n: { reason: { _tag: string } }) => n.reason._tag)).toEqual(["DrainTimeout"]) }
      }), { gate, options: { drainTimeout: 100, shutdownTimeout: 200 } })
    })
  }
})
