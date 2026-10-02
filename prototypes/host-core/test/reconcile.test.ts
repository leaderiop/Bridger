// Phase-P4 scenarios for reconciliation (behaviour 18, BEH-BR-153–159; records BEH-BR-201).
import { Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Desired, type DesiredPlugin } from "../src/desired.js"
import { AuditSink, type AuditRecord } from "../src/gxp.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Audit, Logger, auditPlugin, journal, loggerPlugin } from "./fixtures.js"
import { alice, as, find, memorySink, run, scriptedGate, settleWriter, stateIn } from "./p4fixtures.js"

const failed = (exit: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(exit) && JSON.stringify(exit.cause).includes(tag)
const j = journal()
const logger = loggerPlugin(j) as AnyPlugin
const audit = auditPlugin(j) as AnyPlugin
const entry = (plugin: AnyPlugin, extra: Partial<DesiredPlugin> = {}): DesiredPlugin => ({ id: plugin.id, plugin, ...extra })
const versioned = (version: string, digest: string): AnyPlugin =>
  define({ id: "svc", requires: [] as const, provides: [] as const, meta: { version, digest }, build: Layer.empty }) as unknown as AnyPlugin
const entryRecords = (records: ReadonlyArray<AuditRecord>, phase = "requested") =>
  records.filter((r) => r.phase === phase && r.operation !== "reconcile" && r.actor.id === alice.id).map((r) => `${r.operation} ${r.target?.id}`)

describe("reconcile (behaviour 18)", () => {
  it("BEH-BR-153, 159, 201: a list installs what is missing; running it again issues nothing and still leaves a noop parent pair", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      const list = [entry(logger), entry(audit)]
      const first = yield* host.reconcile(list, as("profile"))
      expect(first.installed).toEqual(["example/logger", "example/audit"])
      yield* host.awaitIdle
      expect(yield* stateIn(host, "example/audit")).toBe("active")
      const second = yield* host.reconcile(list, as("profile"))
      expect(second).toMatchObject({ installed: [], unchanged: ["example/logger", "example/audit"], removed: [], rejected: [] })
      yield* settleWriter
      const parents = records.filter((r) => r.operation === "reconcile")
      expect(parents.map((r) => [r.phase, r.children, r.noop])).toEqual([["requested", undefined, undefined], ["completed", 2, undefined], ["requested", undefined, undefined], ["completed", 0, true]])
      // Entry records share the parent's correlation and are caused by the parent `requested` record (BEH-BR-201).
      const install = records.filter((r) => r.operation === "install")
      expect(install.every((r) => r.correlationId === parents[0]!.correlationId && r.causationId === parents[0]!.recordId)).toBe(true)
      expect(install.every((r) => r.actor.id === alice.id && r.reason === "profile")).toBe(true)
    }), { sink })
  })

  it("BEH-BR-154: an entry needing several actions gets them in the fixed order, so it builds at most once", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.reconcile([entry(versioned("1", "a"))], as())
      // Same version and digest on a new object: the same definition (BEH-BR-154).
      expect((yield* host.reconcile([entry(versioned("1", "a"))], as())).unchanged).toEqual(["svc"])
      const toDisabled = yield* host.reconcile([entry(versioned("2", "b"), { config: { level: 1 }, disabled: true })], as())
      expect(toDisabled).toMatchObject({ disabled: ["svc"], replaced: ["svc"], reconfigured: ["svc"] })
      const toEnabled = yield* host.reconcile([entry(versioned("3", "c"), { config: { level: 2 } })], as())
      expect(toEnabled).toMatchObject({ replaced: ["svc"], reconfigured: ["svc"], enabled: ["svc"] })
      yield* settleWriter
      expect(entryRecords(records)).toEqual([
        "install svc",
        "disable svc", "replace svc", "reconfigure svc",
        "replace svc", "reconfigure svc", "enable svc"
      ])
    }), { sink })
  })

  it("BEH-BR-155: a scope prunes only what it installed; an entry naming someone else's plugin is rejected, not adopted", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j), as())                                   // by hand
      const r = yield* host.reconcile([entry(logger), entry(audit)], as())
      expect(r.installed).toEqual(["example/audit"])
      expect(r.rejected.map((x) => [x.id, x.reason._tag])).toEqual([["example/logger", "DuplicatePlugin"]])
      const pruned = yield* host.reconcile([], as())
      expect(pruned.removed).toEqual(["example/audit"])
      expect(yield* stateIn(host, "example/logger")).toBe("active")
      // Another scope cannot touch it either; without prune nothing is removed.
      yield* host.reconcile([entry(audit)], { ...as(), scope: "site" })
      expect((yield* host.reconcile([], { ...as(), scope: "default" })).removed).toEqual([])
      expect((yield* host.reconcile([], { ...as(), scope: "site", prune: false })).removed).toEqual([])
      expect(yield* stateIn(host, "example/audit")).toBe("active")
    }))
  })

  it("BEH-BR-153, 156: invalid and duplicate entries are rejected, their plugin untouched and unpruned; prunes run dependents first", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.reconcile([entry(logger), entry(audit)], as())
      yield* host.awaitIdle
      const r = yield* host.reconcile([entry(logger), entry(logger), { id: "wrong", plugin: audit }], as())
      expect(r.rejected.map((x) => [x.id, x.reason._tag])).toEqual([["example/logger", "InvalidDefinition"], ["example/logger", "InvalidDefinition"], ["wrong", "InvalidDefinition"]])
      expect(r.removed).toEqual(["example/audit"])                               // audit is unlisted; logger is listed (invalidly) and kept
      expect(yield* stateIn(host, "example/logger")).toBe("active")
      const both = yield* host.reconcile([entry(logger), entry(audit)], as())     // re-adds audit
      expect(both.installed).toEqual(["example/audit"])
      yield* host.awaitIdle
      const last = yield* host.reconcile([], as())
      expect(last.removed).toEqual(["example/audit", "example/logger"])          // dependents first (BEH-BR-156)
      yield* settleWriter
      expect(entryRecords(records).slice(-2)).toEqual(["remove example/audit", "remove example/logger"])
    }), { sink })
  })

  it("BEH-BR-157, 158, 201: the gate is consulted per entry action; a refusal rejects that entry only and is counted in children", async () => {
    const { records, sink } = memorySink()
    const { requests, gate } = scriptedGate((r) => r.target?.id === "example/audit" ? "deny" : "allow")
    await run((host) => Effect.gen(function* () {
      const r = yield* host.reconcile([entry(logger), entry(audit)], as())
      expect(r.installed).toEqual(["example/logger"])
      expect(r.rejected.map((x) => [x.id, x.reason._tag])).toEqual([["example/audit", "OperationRejected"]])
      expect(requests.map((q) => `${q.operation} ${q.target?.id}`)).toEqual(["install example/logger", "install example/audit"])   // never the batch
      yield* settleWriter
      const parent = records.find((x) => x.operation === "reconcile" && x.phase === "requested")!
      const refused = records.find((x) => x.phase === "rejected")!
      expect(refused.causationId).toBe(parent.recordId)
      expect(records.find((x) => x.operation === "reconcile" && x.phase === "completed")!.children).toBe(2)
    }), { sink, gate })
  })

  it("BEH-BR-158: requireReason applies to the operations a provisional diff would issue — a prune needs a reason, refused with no record", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      yield* host.reconcile([entry(logger)], as())
      yield* host.awaitIdle
      const exit = yield* Effect.exit(host.reconcile([], as()))                     // would prune: remove needs a reason
      expect(failed(exit, "ReasonRequired")).toBe(true)
      expect(yield* stateIn(host, "example/logger")).toBe("active")
      yield* settleWriter
      expect(records.filter((r) => r.operation === "reconcile").length).toBe(2)     // only the first call's pair
      expect((yield* host.reconcile([], as("decommission"))).removed).toEqual(["example/logger"])
    }), { sink, options: { attribution: { requireReason: ["remove"] } } })
  })

  it("BEH-BR-158, 201: a diff recomputed at the intent that newly needs a reason fails the call with a recorded ReasonRequired and no entry action", async () => {
    const { records, sink } = memorySink()
    const extra = define({ id: "extra", requires: [] as const, provides: [] as const, build: Layer.empty }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j), as())
      yield* host.reconcile([entry(audit)], { ...as("setup"), scope: "s" })
      yield* host.awaitIdle
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* Effect.forkChild(host.use(Audit, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))))
      yield* Deferred.await(entered)
      // A: prunes audit (held up by the lease), then installs extra.
      const a = yield* Effect.forkChild(host.reconcile([entry(extra)], { ...as("swap", "A"), scope: "s" }))
      while ((yield* stateIn(host, "example/audit")) !== "stopping") yield* Effect.yieldNow
      // B, without a reason: against the state now its diff issues nothing; at its intent, after A, it must prune extra.
      const b = yield* Effect.forkChild(host.reconcile([entry(audit)], { ...as(undefined, "B"), scope: "s" }))
      yield* Effect.sleep(5)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(a)
      expect(failed(yield* Fiber.await(b), "ReasonRequired")).toBe(true)
      expect(yield* stateIn(host, "extra")).toBe("active")                     // no entry action ran
      expect(yield* stateIn(host, "example/audit")).toBe("uninstalled")
      yield* settleWriter
      const bRecords = records.filter((r) => r.correlationId === "B").map((r) => [r.operation, r.phase, r.children, r.error?._tag, r.noop])
      expect(bRecords).toEqual([["reconcile", "requested", undefined, undefined, undefined], ["reconcile", "failed", 0, "ReasonRequired", undefined]])
    }), { sink, options: { attribution: { requireReason: ["remove"] } } })
  })

  it("BEH-BR-156: after its intent, an interrupted caller stops waiting; the remaining entries still run and the parent record still closes", async () => {
    const { records, sink } = memorySink()
    const slow = define({ id: "slow", requires: [] as const, provides: [] as const, build: Layer.empty }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j), as())
      const entered = yield* Deferred.make<void>()
      // Hold a lease on a plugin the batch's first action removes, so the batch is mid-flight when the caller leaves.
      yield* host.reconcile([entry(audit)], { ...as(), scope: "s" })
      yield* host.awaitIdle
      yield* Effect.forkChild(host.use(Audit, () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.sleep(60)))))
      yield* Deferred.await(entered)
      const call = yield* Effect.forkChild(host.reconcile([entry(slow)], { ...as(), scope: "s" }))   // prune audit (drains 60 ms), then install slow
      yield* Effect.sleep(20)
      yield* Fiber.interrupt(call)
      yield* Effect.sleep(80)
      yield* host.awaitIdle
      expect(yield* stateIn(host, "example/audit")).toBe("uninstalled")
      expect(yield* stateIn(host, "slow")).toBe("active")
      yield* settleWriter
      const parents = records.filter((r) => r.operation === "reconcile").map((r) => [r.phase, r.children])
      expect(parents.slice(-2)).toEqual([["requested", undefined], ["completed", 2]])
    }), { sink })
  })

  it("BEH-BR-156: reconciles are serialized — the second's entries run only after the first's parent record closes", async () => {
    const { records, sink } = memorySink()
    await run((host) => Effect.gen(function* () {
      const a = yield* Effect.forkChild(host.reconcile([entry(logger)], { ...as(undefined, "first"), scope: "a" }))
      const b = yield* Effect.forkChild(host.reconcile([entry(audit)], { ...as(undefined, "second"), scope: "b" }))
      yield* Fiber.join(a); yield* Fiber.join(b)
      yield* settleWriter
      const seq = records.filter((r) => r.phase !== "system").map((r) => `${r.correlationId}:${r.operation}:${r.phase}`)
      const firstClosed = seq.indexOf("first:reconcile:completed")
      const secondEntry = seq.indexOf("second:install:requested")
      expect(firstClosed).toBeGreaterThan(-1)
      expect(secondEntry).toBeGreaterThan(firstClosed)
    }), { sink })
  })

  it("BEH-BR-157: a requested record that cannot be written stops the batch with AuditUnavailable; completed actions stay", async () => {
    const records: Array<AuditRecord> = []
    const sink: AuditSink["Service"] = {
      record: (r) => r.target?.id === "example/audit" ? Effect.never : Effect.sync(() => { records.push(r) })
    }
    await run((host) => Effect.gen(function* () {
      const exit = yield* Effect.exit(host.reconcile([entry(logger), entry(audit), entry(versioned("1", "a"))], as()))
      expect(failed(exit, "AuditUnavailable")).toBe(true)
      expect(yield* stateIn(host, "example/logger")).toBe("active")
      expect(yield* stateIn(host, "example/audit")).toBe("uninstalled")
      expect(yield* stateIn(host, "svc")).toBe("uninstalled")                    // no further action issued
    }), { sink })
  })

  it("BEH-BR-159: two edit histories that end in one list converge on the same owned set", async () => {
    const settle = (lists: ReadonlyArray<ReadonlyArray<DesiredPlugin>>) => run((host) => Effect.gen(function* () {
      for (const l of lists) { yield* host.reconcile(l, as("x")); yield* host.awaitIdle }
      const s = yield* host.awaitIdle
      return s.plugins.map((p) => [p.id, p.state, p.meta?.version])
    }))
    const target = [entry(logger), entry(versioned("2", "b"), { config: { a: 1 } }), entry(audit, { disabled: true })]
    const a = await settle([target])
    const b = await settle([[entry(audit)], [entry(versioned("1", "a"), { disabled: true }), entry(logger)], [], target])
    const c = await settle([target, [entry(logger)], target, target])
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })
})

describe("Desired.overlay (BEH-BR-153)", () => {
  it("is pure, matches by (id, realm), merges config deeply, keeps base order and appends only entries with a plugin", () => {
    const base: ReadonlyArray<DesiredPlugin> = [
      { id: "example/logger", plugin: logger, config: { level: "info", sinks: ["a"], nested: { x: 1, y: 2 } } },
      { id: "example/audit", plugin: audit },
      { id: "example/audit", plugin: audit, realm: "t" }
    ]
    const frozen = JSON.stringify(base)
    const out = Desired.overlay(base, [
      { id: "example/logger", config: { sinks: ["b"], nested: { y: 3 } } },
      { id: "example/logger", config: { level: "debug" } },
      { id: "example/audit", realm: "t", disabled: true },
      { id: "ghost", disabled: true },
      { id: "extra", plugin: logger }
    ])
    expect(JSON.stringify(base)).toBe(frozen)
    expect(out.map((e) => [e.id, e.realm ?? "default", e.disabled ?? false])).toEqual([
      ["example/logger", "default", false], ["example/audit", "default", false], ["example/audit", "t", true], ["extra", "default", false]
    ])
    expect(out[0]!.config).toEqual({ level: "debug", sinks: ["b"], nested: { x: 1, y: 3 } })
    void Logger
  })
})
