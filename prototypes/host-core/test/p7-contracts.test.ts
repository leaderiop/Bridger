// P7 (round 2): versioned contracts (behaviour 26, checks 59–61, 102) — prototype, evidences no requirement.
import { Context, Effect, Exit, Layer, Option, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { Contract, at } from "../src/contract.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import * as Registry from "../src/registry.js"
import { PluginRuntime } from "../src/runtime.js"
import { drive, idle } from "./fixtures.js"
import { as, run, stateIn } from "./p4fixtures.js"

import { Audit21, Audit23, AuditKey, dependent, errorOf, failedWith, m, provider } from "./p7fixtures.js"
type AuditShape = AuditKey["Service"]
const impl: AuditShape = { append: (s) => Effect.succeed(s), query: Effect.succeed(1), tail: Effect.succeed("t") }

describe("P7 core 26: contracts", () => {
  it("check 59: grammar, satisfies and maxSatisfying follow BEH-BR-226; out-of-grammar input is false/None", () => {
    const table: Array<[string, string, boolean]> = [
      ["2.3.1", "2.3.1", true], ["2.3.2", "2.3.1", false],
      ["2.0.0", "^2", true], ["2.9.9", "^2", true], ["3.0.0", "^2", false], ["2.2.9", "^2.3", false], ["2.3.0", "^2.3", true],
      ["0.3.5", "^0.3", true], ["0.4.0", "^0.3", false], ["0.0.9", "^0.0.3", true], ["0.1.0", "^0.0.3", false],   // ^0.0.p deliberately ≠ npm
      ["2.3.9", "~2.3", true], ["2.4.0", "~2.3", false], ["2.3.0", "~2.3.1", false],
      ["02.3.1", "^2", false], ["2.3", "^2", false], ["2.3.1-rc.1", "^2", false], ["2.3.1", "^0", false], ["2.3.1", ">=2", false], ["2.3.1", "~2", false]
    ]
    for (const [v, r, want] of table) expect([v, r, Contract.satisfies(v, r)]).toEqual([v, r, want])
    expect(Contract.maxSatisfying(["2.1.0", "2.10.0", "2.9.0", "3.0.0", "x"], "^2")).toEqual(Option.some("2.10.0"))
    expect(Contract.maxSatisfying(["1.0.0"], "nonsense")).toEqual(Option.none())
    expect(Contract.satisfies(42 as never, "^2")).toBe(false)
  })

  it("check 59: an invalid contract or a range leaving the major makes install, replace and enable fail with InvalidDefinition", async () => {
    class Bare extends Context.Service<Bare, AuditShape>()("example/Bare") {}
    class Two extends Context.Service<Two, AuditShape>()("example/Two@2") {}
    const bad = [
      Contract.make(Bare, { version: "1.0.0", methods: { append: m } }),        // no @major
      Contract.make(Two, { version: "3.0.0", methods: { append: m } }),         // suffix ≠ major
      Contract.make(Two, { version: "2.0", methods: { append: m } }),           // grammar
      Contract.make(Two, { version: "2.0.0", methods: {} }),                    // empty methods
      Contract.make(Two, { version: "2.0.0", methods: { a: Contract.method({ timeout: -5 }) } })   // check 102: invalid timeout
    ]
    for (const c of bad) expect(c.invalid).toBeDefined()
    await run((host) => Effect.gen(function* () {
      for (const c of bad) {
        const e = errorOf(yield* Effect.exit(host.install(dependent("d", c), as())))
        expect(e._tag).toBe("InvalidDefinition")
        expect(e.reason).toContain(c.key)
      }
      expect(errorOf(yield* Effect.exit(host.install(dependent("d", Audit23.range("^3")), as()))).reason).toContain("leaves major")
      expect(errorOf(yield* Effect.exit(host.install(dependent("d", Audit23.range("^1.9")), as()))).reason).toContain("leaves major")
      expect(errorOf(yield* Effect.exit(host.install(dependent("d", Audit23.range(">=2")), as()))).reason).toContain("grammar")
      expect(errorOf(yield* Effect.exit(host.install(provider("p", Audit23.range("^2")), as()))).reason).toContain("requirement in provides")
      expect(errorOf(yield* Effect.exit(host.install(dependent("d", at(Audit23, "2.1.0", { methods: ["append"] })), as()))).reason).toContain("provision in requires")
      expect(errorOf(yield* Effect.exit(host.install(provider("p", at(Audit23, "2.4.0", { methods: ["append"] })), as()))).reason).toContain("above")
      expect(errorOf(yield* Effect.exit(host.install(provider("p", at(Audit23, "2.1.0", { methods: ["nope"] })), as()))).reason).toContain("subset")
      // replace and enable go through the same check.
      yield* host.install(provider("p", Audit23), as())
      const r = yield* Effect.exit(drive(host, host.replace(provider("p", bad[1]), as())))
      expect(failedWith(r, "InvalidDefinition")).toBe(true)
      expect((yield* host.snapshot).plugins.map((p) => p.id)).toEqual(["p"])
    }))
  })

  it("check 59/102: descriptor is plain data with sorted methods and timeouts; timeouts never enforced", async () => {
    class Pay extends Context.Service<Pay, { readonly authorize: Effect.Effect<string>; readonly status: Effect.Effect<string> }>()("example/Payments@1") {}
    const Payments = Contract.make(Pay, { version: "1.2.0", methods: { status: Contract.method({ timeout: "2 seconds" }), authorize: Contract.method({ timeout: 20 }) } })
    expect(Payments.descriptor).toEqual({ serviceId: "example/Payments@1", name: "example/Payments", version: "1.2.0", methods: ["authorize", "status"], timeouts: [{ method: "authorize", millis: 20 }, { method: "status", millis: 2000 }] })
    expect(JSON.parse(JSON.stringify(Payments.descriptor))).toEqual(Payments.descriptor)
    // A provider whose method takes far longer than the declared 20 ms is not bounded in-process.
    const slow = define({ id: "pay", requires: [] as const, provides: [Payments] as const,
      build: Layer.succeed(Pay, { authorize: Effect.sleep(60).pipe(Effect.as("ok")), status: Effect.succeed("s") }) as any }) as unknown as AnyPlugin
    await run((host) => Effect.gen(function* () {
      yield* host.install(slow, as()); yield* idle(host)
      expect(yield* host.use(Payments, (p) => p.authorize)).toBe("ok")
    }))
  })

  it("check 60: IncompatibleContract on either side, the first pair named, check order, nothing registered", async () => {
    await run((host) => Effect.gen(function* () {
      // Dependent installed against a registered provider whose version does not satisfy.
      yield* host.install(provider("audit", at(Audit23, "2.1.0", { methods: ["append", "query"] })), as())
      const e1 = errorOf(yield* Effect.exit(host.install(dependent("d1", Audit23.range("^2.3")), as())))
      expect(e1).toMatchObject({ _tag: "IncompatibleContract", serviceId: "example/Audit@2", dependentId: "d1", providerId: "audit", required: "^2.3", provided: "2.1.0", missingMethods: [] })
      // A dependent with an older copy is satisfied by a provider missing a method of a newer copy (Settled 2)…
      yield* host.install(dependent("d2", Audit21), as())
      // …but a provider at or above the dependent's copy must carry every method of that copy.
      const narrowed = provider("audit", at(Audit23, "2.3.0", { methods: ["append", "query"] }), "2")
      yield* drive(host, host.replace(narrowed, as()))                    // d2's copy (2.1.0) lists only append, query
      // A dependent whose copy lists `tail` cannot bind to a 2.3.0 provision without it (condition 3).
      const e2 = errorOf(yield* Effect.exit(host.install(dependent("d3", Audit23.range("^2.1")), as())))
      expect(e2).toMatchObject({ _tag: "IncompatibleContract", dependentId: "d3", provided: "2.3.0", missingMethods: ["tail"] })
      // Back to 2.1.0: below d3's copy, so no method check, and d3 installs; replacing with the narrowed 2.3.0 is refused.
      yield* drive(host, host.replace(provider("audit", at(Audit23, "2.1.0", { methods: ["append", "query"] }), "3"), as()))
      yield* host.install(dependent("d3", Audit23.range("^2.1")), as())
      const e3 = yield* Effect.exit(drive(host, host.replace(narrowed, as())))
      expect(failedWith(e3, "IncompatibleContract")).toBe(true)
      expect((yield* host.snapshot).plugins.map((p) => p.id).sort()).toEqual(["audit", "d2", "d3"])
      yield* drive(host, host.remove("d2", as()))
      // A plain-key provider is incompatible (`provided` absent).
      yield* drive(host, host.remove("d3", as())); yield* drive(host, host.remove("audit", as()))
      yield* host.install(provider("plain", AuditKey), as())
      const e4 = errorOf(yield* Effect.exit(host.install(dependent("d4", Audit23), as())))
      expect(e4).toMatchObject({ _tag: "IncompatibleContract", providerId: "plain", missingMethods: [] })
      expect(e4.provided).toBeUndefined()
      // Check order: DuplicateProvider is reported before IncompatibleContract.
      const e5 = errorOf(yield* Effect.exit(host.install(provider("other", Audit21), as())))
      expect(e5._tag).toBe("DuplicateProvider")
    }))
  })

  it("check 60: provider side by dependent id; enable re-checks; no provider means no check", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(dependent("zeta", Audit23.range("^2.3")), as())
      yield* host.install(dependent("alpha", Audit23.range("^2.2")), as())   // both wait: no provider, not checked
      const e = errorOf(yield* Effect.exit(host.install(provider("audit", Audit21), as())))
      expect(e).toMatchObject({ _tag: "IncompatibleContract", dependentId: "alpha", providerId: "audit" })
      yield* host.install(provider("audit", Audit21), { ...as(), disabled: true })   // lands disabled: forms no pair
      const en = yield* Effect.exit(drive(host, host.enable("audit", as())))
      expect(failedWith(en, "IncompatibleContract")).toBe(true)
    }))
  })

  it("check 60: a base service with and without a baseContracts entry", async () => {
    await run((host) => Effect.gen(function* () {
      expect(failedWith(yield* Effect.exit(host.install(dependent("d", Audit23), as())), "IncompatibleContract")).toBe(true)
    }), { options: { base: [[AuditKey, impl]] } })
    await run((host) => Effect.gen(function* () {
      const seen: Array<string> = []
      yield* host.install(dependent("d", Audit21, seen), as()); yield* idle(host)
      expect(seen).toEqual(["d"])
    }), { options: { base: [[AuditKey, impl]], baseContracts: [Audit23] } })
    await expect(run(() => Effect.void, { options: { baseContracts: [Audit23] } })).rejects.toThrow(/baseContracts/)
  })

  it("check 61: two copies bind without KeyMismatch; a plain key against another object still mismatches; optional incompatible is absent", async () => {
    await run((host) => Effect.gen(function* () {
      const seen: Array<string> = []
      yield* host.install(provider("audit", Audit23), as())
      yield* host.install(dependent("old", Audit21, seen), as())
      yield* idle(host)
      expect(yield* stateIn(host, "old")).toBe("active")
      class Other extends Context.Service<Other, AuditShape>()("example/Audit@2") {}
      yield* host.install(dependent("plain", Other), as()); yield* idle(host)
      const snap = (yield* host.snapshot).plugins.find((p) => p.id === "plain") as any
      expect(snap.state).toBe("failed"); expect(snap.failure.message).toContain("KeyMismatch")
      // optional: incompatible provider is absent to useOptional and fails nothing.
      const got: Array<string> = []
      const opt = define({ id: "opt", requires: [] as const, provides: [] as const, optional: [Audit23.range("^2.4")] as any,
        build: Layer.effectDiscard(Effect.gen(function* () {
          const rt = yield* PluginRuntime
          got.push(Option.isSome(yield* rt.optional(AuditKey)) ? "some" : "none")
          got.push(Option.isSome(yield* rt.useOptional(AuditKey, () => Effect.succeed(1))) ? "some" : "none")
        })) }) as unknown as AnyPlugin
      yield* host.install(opt, as()); yield* idle(host)
      expect(got).toEqual(["none", "none"])
      expect(yield* stateIn(host, "opt")).toBe("active")
    }))
  })

  it("check 102: a contract registry refuses add without implements, below range or missing a method; within hides; implements on a plain registry is a defect", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const r = yield* Registry.make<AuditShape>({ name: "audits", contract: Audit23, range: "^2.1" })
      yield* r.add("acme", impl, { implements: "2.3.0" })
      yield* r.add("beta", impl, { implements: { version: "2.1.4", methods: ["append", "query"] } })   // below 2.3: no method check
      const none = errorOf(yield* Effect.exit(r.add("gamma", impl)))
      expect(none).toMatchObject({ _tag: "IncompatibleContract", dependentId: "registry:audits", providerId: "application", required: "^2.1", missingMethods: [] })
      expect(none.provided).toBeUndefined()
      expect(errorOf(yield* Effect.exit(r.add("old", impl, { implements: "2.0.0" })))).toMatchObject({ provided: "2.0.0" })
      expect(errorOf(yield* Effect.exit(r.add("thin", impl, { implements: { version: "2.3.0", methods: ["append"] } })))).toMatchObject({ missingMethods: ["query", "tail"] })
      expect((yield* r.view).entries.map((e) => [e.id, e.version])).toEqual([["acme", "2.3.0"], ["beta", "2.1.4"]])
      const w = r.within("^2.3")
      expect((yield* w.view).entries.map((e) => e.id)).toEqual(["acme"])
      expect(Option.isNone(yield* w.get("beta"))).toBe(true)
      expect(failedWith(yield* Effect.exit(w.use("beta", () => Effect.void)), "ContributionUnavailable")).toBe(true)
      expect(() => r.within("^3")).toThrow()
      const plain = yield* Registry.make<AuditShape>({ name: "plain" })
      const d = yield* Effect.exit(plain.add("x", impl, { implements: "2.3.0" }))
      expect(Exit.isFailure(d) && !failedWith(d, "IncompatibleContract")).toBe(true)
      expect((yield* plain.view).entries).toEqual([])
      expect(Exit.isFailure(yield* Effect.exit(Registry.make({ name: "bad", range: "^2" })))).toBe(true)
      expect(Exit.isFailure(yield* Effect.exit(Registry.make({ name: "bad", contract: Audit23, range: "^3" })))).toBe(true)
      yield* Scope.Scope
    }))))
})
