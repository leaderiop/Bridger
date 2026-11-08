// P7 (round 2): reconcile order, Host.plan, expect and atomic apply (behaviours 18, 32; checks 83, 98–100) — prototype.
import { Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { at } from "../src/contract.js"
import type { DesiredPlugin } from "../src/desired.js"
import { OperationGate, OperationRejected, type AuditRecord, type OperationRequest } from "../src/gxp.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import type * as Testing from "../src/testing.js"
import { drive, idle, memorySink, scriptedGate } from "./fixtures.js"
import { alice, as, run, settleWriter, stateIn } from "./p4fixtures.js"
import { Audit21, Audit23, dependent, errorOf, failedWith, provider } from "./p7fixtures.js"

const entry = (plugin: AnyPlugin, extra: Partial<DesiredPlugin> = {}): DesiredPlugin => ({ id: plugin.id, plugin, ...extra })
const v21 = provider("audit", at(Audit23, "2.1.0", { methods: ["append", "query"] }), "2.1")
const v23 = provider("audit", Audit23, "2.3")
const needs23 = dependent("billing", Audit23.range("^2.3"))
const defOf = (host: Testing.TestHost, id: string) => Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === id)?.meta?.version)
const ops = (records: ReadonlyArray<AuditRecord>) => records.filter((r) => r.operation !== "reconcile" && r.actor.id === alice.id).map((r) => `${r.phase} ${r.operation} ${r.target?.id}${r.undoes ? " undoes" : ""}`)

describe("P7 core 18/32: reconcile order (check 98)", () => {
  it("check 98: a provider upgrade and the dependent that needs it converge in one run in either list order; plan shows the same order and loads nothing", async () => {
    for (const order of ["dependent-first", "provider-first"] as const) {
      await run((host) => Effect.gen(function* () {
        yield* drive(host, host.reconcile([entry(v21)], as()))
        const list = order === "dependent-first" ? [entry(needs23), entry(v23)] : [entry(v23), entry(needs23)]
        const p = yield* host.plan(list)
        expect(p.entries.map((e) => `${e.actions.join("+")} ${e.target.id}`)).toEqual(["replace audit", "install billing"])
        const r = yield* drive(host, host.reconcile(list, as()))
        expect(r).toMatchObject({ replaced: ["audit"], installed: ["billing"], rejected: [] })
        yield* idle(host)
        expect(yield* stateIn(host, "billing")).toBe("active")
      }))
    }
  })

  it("check 98: removals run dependents first; disable-first entries are in the removal phase", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      const aDep = dependent("a-dep", Audit23), zDep = dependent("z-dep", Audit23)
      yield* drive(host, host.reconcile([entry(v23), entry(aDep), entry(zDep)], as()))
      yield* idle(host)
      // Prune audit and disable both dependents: the dependents' disables come before the provider's removal.
      const p = yield* host.plan([entry(aDep, { disabled: true }), entry(zDep, { disabled: true })])
      expect(p.entries.map((e) => `${e.actions[0]} ${e.target.id}`)).toEqual(["disable a-dep", "disable z-dep", "remove audit"])
      yield* drive(host, host.reconcile([entry(aDep, { disabled: true }), entry(zDep, { disabled: true })], as()))
      yield* settleWriter
      expect(ops(records).filter((x) => x.startsWith("requested")).slice(-3)).toEqual(["requested disable a-dep", "requested disable z-dep", "requested remove audit"])
    }), { sink })
  })
})

describe("P7 core 32: Host.plan and expect (check 83)", () => {
  it("check 83: plan writes no record, consults no gate, emits nothing, and is plain data; expect applies or fails PlanStale with no record", async () => {
    const { records, sink } = memorySink()
    const { requests, gate } = scriptedGate(() => "allow")
    await run((host) => Effect.gen(function* () {
      const events: Array<string> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { events.push(e.type) }))))
      yield* Effect.yieldNow
      const list = [entry(v21, { config: { level: 1, mode: "x" } })]
      const p = yield* host.plan(list)
      yield* settleWriter
      expect(records).toEqual([]); expect(requests).toEqual([]); expect(events).toEqual([])
      expect(JSON.parse(JSON.stringify(p))).toEqual(p)
      expect(p.entries[0]).toMatchObject({ actions: ["install"], expected: { installed: false }, incoming: { version: "2.1", digest: "audit2.1" }, configChange: { paths: ["level", "mode"] } })
      expect(JSON.stringify(p)).not.toContain("\"x\"")                       // no configuration value
      // Stale at the call: another change in between; no record at all.
      yield* host.install(dependent("other", Audit21), as())
      const before = records.length
      const stale = yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), expect: { ...p, scope: "elsewhere" } })))
      expect(failedWith(stale, "PlanStale")).toBe(true)
      yield* settleWriter
      expect(records.length).toBe(before)
      // Prune options differ: stale too.
      expect(failedWith(yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), prune: false, expect: p }))), "PlanStale")).toBe(true)
      // Fresh: applies, with every entry gated.
      const fresh = yield* host.plan(list)
      const g0 = requests.length
      const r = yield* drive(host, host.reconcile(list, { ...as(), expect: fresh }))
      expect(r.installed).toEqual(["audit"])
      expect(requests.slice(g0).map((q) => q.operation)).toEqual(["install"])
      // The recorded configChange.paths equal the plan's.
      yield* settleWriter
      expect(records.find((x) => x.operation === "install" && x.target?.id === "audit")?.configChange?.paths).toEqual(fresh.entries[0]!.configChange!.paths)
    }), { sink, gate })
  })

  it("check 83: stale at the intent writes a parent failed record and issues nothing", async () => {
    const { records, sink } = memorySink()
    const reached = Effect.runSync(Deferred.make<void>()), release = Effect.runSync(Deferred.make<void>())
    const gate: OperationGate["Service"] = {
      authorize: (q) => q.correlationId === "c1" ? Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release))) : Effect.void
    }
    await run((host) => Effect.gen(function* () {
      const p = yield* host.plan([entry(v21)])
      // The first reconcile holds the turn while its install waits at the gate…
      const first = yield* Effect.forkChild(drive(host, host.reconcile([entry(v23)], { ...as(undefined, "c1"), scope: "other" })))
      yield* Deferred.await(reached)
      // …the second passes step 4 (fresh at the call) and waits for its turn; then the first installs `audit`.
      const second = yield* Effect.forkChild(Effect.exit(drive(host, host.reconcile([entry(v21)], { ...as(undefined, "c2"), expect: p }))))
      while (!records.some((x) => x.correlationId === "c2")) yield* Effect.sleep(1)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)
      const exit = yield* Fiber.join(second)
      expect(failedWith(exit, "PlanStale")).toBe(true)
      yield* settleWriter
      const mine = records.filter((x) => x.correlationId === "c2")
      expect(mine.map((x) => [x.operation, x.phase, x.children, x.error?._tag])).toEqual([["reconcile", "requested", undefined, undefined], ["reconcile", "failed", 0, "PlanStale"]])
    }), { sink, gate })
  })
})

describe("P7 core 32: atomic apply (checks 99, 100)", () => {
  it("recheck: an atomic bundle switch applies in either order, or not at all with ApplyRolledBack", async () => {
    for (const order of ["dependent-first", "provider-first"] as const) {
      // Applies.
      await run((host) => Effect.gen(function* () {
        yield* drive(host, host.reconcile([entry(v21)], as()))
        const list = order === "dependent-first" ? [entry(needs23), entry(v23)] : [entry(v23), entry(needs23)]
        const r = yield* drive(host, host.reconcile(list, { ...as(), atomic: true }))
        expect(r).toMatchObject({ replaced: ["audit"], installed: ["billing"], rejected: [] })
        expect(yield* defOf(host, "audit")).toBe("2.3")
      }))
      // Not at all: the gate refuses the dependent's install, so the provider replace is undone.
      const { records, sink } = memorySink()
      const { requests, gate } = scriptedGate((q) => q.operation === "install" && q.target?.id === "billing" ? { refuse: "not approved" } : "allow")
      await run((host) => Effect.gen(function* () {
        yield* drive(host, host.reconcile([entry(v21)], as()))
        const list = order === "dependent-first" ? [entry(needs23), entry(v23)] : [entry(v23), entry(needs23)]
        const p = yield* host.plan(list, { atomic: true })
        expect(p.atomic).toBe(true)
        expect(p.entries.map((e) => e.undo)).toEqual([["replace"], ["remove"]])
        const exit = yield* Effect.exit(drive(host, host.reconcile(list, { ...as(), atomic: true, expect: p })))
        expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", failed: [{ id: "billing", action: "install", reason: { _tag: "OperationRejected" } }], undone: [{ id: "audit", action: "replace" }] })
        expect(yield* defOf(host, "audit")).toBe("2.1")
        expect(yield* stateIn(host, "billing")).toBe("uninstalled")
        yield* settleWriter
        // The undo is gated with undo: true and recorded with `undoes` the forward requested record.
        const undoReq = requests.filter((q: OperationRequest) => q.undo)
        expect(undoReq.map((q) => [q.operation, q.target?.id])).toEqual([["replace", "audit"]])
        const fwd = records.find((x) => x.operation === "replace" && x.phase === "requested" && !x.undoes)!
        const undo = records.filter((x) => x.undoes)
        expect(undo.length).toBeGreaterThan(0)
        expect(undo.every((x) => x.undoes === fwd.recordId && x.correlationId === fwd.correlationId && x.causationId === fwd.causationId)).toBe(true)
        const parent = records.filter((x) => x.operation === "reconcile").at(-1)!
        expect(parent).toMatchObject({ phase: "failed", children: 3, error: { _tag: "ApplyRolledBack" } })
      }), { sink, gate })
    }
  })

  it("check 99: a validation-stage rejection applies nothing and writes no record; an activation failure starts no undo", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      const bad = { ...entry(v21), id: "not-audit" }
      const exit = yield* Effect.exit(drive(host, host.reconcile([entry(needs23), bad], { ...as(), atomic: true })))
      expect(errorOf(exit)).toMatchObject({ _tag: "ApplyRolledBack", undone: [], failed: [{ id: "not-audit", reason: { _tag: "InvalidDefinition" } }] })
      yield* settleWriter
      expect(records).toEqual([])
      // A build that fails after a completed install is plugin state, not an apply failure.
      const boom = define({ id: "boom", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.fail("nope")) }) as unknown as AnyPlugin
      const r = yield* drive(host, host.reconcile([entry(boom)], { ...as(), atomic: true }))
      expect(r.installed).toEqual(["boom"])
      yield* idle(host)
      expect(yield* stateIn(host, "boom")).toBe("failed")
    }), { sink })
  })

  it("check 100: an undo skipped by ChangedSinceApply ends in PartialApply with a reconcile-partial event and no retry", async () => {
    let hostRef: Testing.TestHost | undefined
    const { records, sink } = memorySink()
    const gate: OperationGate["Service"] = {
      authorize: (q) => q.operation === "install" && q.target?.id === "billing"
        // Another caller changes `audit` between its forward action and the undo, then the gate refuses.
        ? hostRef!.disable("audit", { context: { actor: { id: "user-bob", kind: "user" } } }).pipe(Effect.ignore,
            Effect.andThen(Effect.fail(new OperationRejected({ operation: q.operation, reason: "not approved" }))))
        : Effect.void
    }
    await run((host) => Effect.gen(function* () {
      hostRef = host
      const events: Array<unknown> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { if (e.type === "reconcile-partial") events.push(e) }))))
      yield* Effect.yieldNow
      const exit = yield* Effect.exit(drive(host, host.reconcile([entry(dependent("needs-none", Audit21)), entry(needs23), entry(v23)], { ...as(), atomic: true })))
      const e = errorOf(exit)
      expect(e._tag).toBe("PartialApply")
      expect(e.notUndone).toEqual([{ id: "audit", realm: "default", action: "install", reason: { _tag: "ChangedSinceApply", message: "ChangedSinceApply" } }])
      expect(events).toHaveLength(1)
      yield* settleWriter
      expect(records.some((x) => x.undoes && x.target?.id === "audit")).toBe(false)      // ChangedSinceApply writes no record
    }), { sink, gate })
  })
})
