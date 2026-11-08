// P7 (round 2): hook points (behaviour 31; checks 77–80, 92–95, and the recheck's lazy veto) — prototype.
import { Context, Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { HostLink } from "../src/host.js"
import { HookPoint, type HookBreakerRecord, type HookPointOptions } from "../src/hooks.js"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive } from "./fixtures.js"
import { as, run, stateIn } from "./p4fixtures.js"
import { failedWith } from "./p7fixtures.js"

type Price = { readonly sku: string; readonly price: number; readonly cost: number }
const pass = Effect.succeed({ _tag: "Pass" as const })
const veto = (code: "below-cost" | "frozen") => Effect.succeed({ _tag: "Veto" as const, code })
const anyone = () => true
const base = (extra: Partial<HookPointOptions<Price, number, string, "below-cost" | "frozen", never, never>> = {}): HookPointOptions<Price, number, string, "below-cost" | "frozen", never, never> =>
  ({ codes: ["below-cost", "frozen"], who: anyone, timeout: 50, deadline: 400, onError: "deny", enrichment: Schema.Number, advice: Schema.String, allowNoLink: true, ...extra })
const scoped = <A, E>(e: Effect.Effect<A, E, Scope.Scope>) => Effect.runPromise(Effect.scoped(e))
const withNone = <A, E, R>(e: Effect.Effect<A, E, R>) => e.pipe(Effect.provideService(HostLink.reference, Option.some(HostLink.none)))
const input: Price = { sku: "a", price: 5, cost: 7 }

describe("P7 core 31: registration and order (checks 77, 93, 95)", () => {
  it("check 77: who admits; a refused role registers nothing; veto on empty codes is refused; order is priority then id", () => scoped(Effect.gen(function* () {
    const seen: Array<unknown[]> = []
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base({ who: (c, role, point, req) => { seen.push([role, point, req]); return role !== "advisory" } }))
    expect(failedWith(yield* Effect.exit(p.register("adv", () => pass, { role: "advisory" })), "HookRegistrationRefused")).toBe(true)
    yield* p.register("b", () => pass, { role: "veto" })
    yield* p.register("a", () => pass, { role: "veto" })
    yield* p.register("z", () => pass, { role: "veto", priority: -1 })
    expect((yield* p.view).entries.map((e) => e.id)).toEqual(["z", "a", "b"])
    expect(seen[1]).toEqual(["veto", "p", { onError: "deny", declared: false }])
    const empty = yield* HookPoint.make<Price>("e", { codes: [], who: anyone, timeout: 10, deadline: 20, onError: "skip" })
    expect(failedWith(yield* Effect.exit(empty.register("v", () => pass, { role: "veto" })), "HookRegistrationRefused")).toBe(true)
    expect((yield* empty.view).entries).toEqual([])
    // Option defects.
    expect(Exit.isFailure(yield* Effect.exit(HookPoint.make<Price>("d", { codes: [], who: anyone, timeout: 30, deadline: 20, onError: "skip" })))).toBe(true)
    expect(Exit.isFailure(yield* Effect.exit(HookPoint.make<Price>("d", { codes: [], who: anyone, timeout: 1, deadline: 2, onError: "skip", dormant: "deny" })))).toBe(true)
  })))

  it("check 93: an onError the point does not allow, or deny on enrich/advisory, is refused; who receives the effective onError", () => scoped(Effect.gen(function* () {
    const reqs: Array<unknown> = []
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base({ onError: { default: "skip", allow: ["skip", "deny"] }, who: (_c, _r, _p, req) => { reqs.push(req.onError); return true } }))
    yield* p.register("v1", () => pass, { role: "veto" })
    yield* p.register("v2", () => pass, { role: "veto", onError: "deny" })
    expect(reqs).toEqual(["skip", "deny"])
    expect(failedWith(yield* Effect.exit(p.register("e", () => pass, { role: "enrich", onError: "deny" })), "HookRegistrationRefused")).toBe(true)
    const strict = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("s", base({ onError: "deny" }))
    expect(failedWith(yield* Effect.exit(strict.register("v", () => pass, { role: "veto", onError: "skip" })), "HookRegistrationRefused")).toBe(true)
  })))

  it("check 95: a target that does not decode, or a target on a point without targets, refuses the registration", () => scoped(Effect.gen(function* () {
    const Sel = Schema.Struct({ skus: Schema.Array(Schema.String) })
    const p = yield* HookPoint.make<Price, never, never, "frozen", { sku: string }, { skus: ReadonlyArray<string> }>("t", {
      codes: ["frozen"], who: anyone, timeout: 50, deadline: 200, onError: "deny", allowNoLink: true,
      targets: { descriptor: (x) => ({ sku: x.sku }), selector: Sel as never, matches: (s, t) => s.skus.includes(t.sku) }
    })
    expect(failedWith(yield* Effect.exit(p.register("bad", () => pass, { role: "veto", target: { skus: 3 } })), "HookRegistrationRefused")).toBe(true)
    yield* p.register("only-b", () => veto("frozen") as never, { role: "veto", target: { skus: ["b"] } })
    const out = yield* withNone(p.dispatch(input))
    expect(out.verdict._tag).toBe("Allowed")
    expect(out.record.steps.map((s) => s.outcome)).toEqual(["not-targeted"])
    const plain = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("plain", base())
    expect(failedWith(yield* Effect.exit(plain.register("x", () => pass, { role: "veto", target: {} })), "HookRegistrationRefused")).toBe(true)
  })))
})

describe("P7 core 31: phases, failure policy, breaker, settle (checks 78, 79, 80, 94)", () => {
  it("check 78/80/94: first veto decides; later vetoes not run; enrich before veto, namespaced, schema-checked; denied returns enrichments, no advice", () => scoped(Effect.gen(function* () {
    const order: Array<string> = []
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base())
    yield* p.register("e2", () => Effect.sync(() => { order.push("e2"); return { _tag: "Enrich" as const, value: 2 } }), { role: "enrich" })
    yield* p.register("e1", () => Effect.sync(() => { order.push("e1"); return { _tag: "Enrich" as const, value: "not a number" as never } }), { role: "enrich" })
    yield* p.register("v1", (_i, ctx) => Effect.sync(() => { order.push(`v1:${ctx.enrichments.map((e) => e.id)}:${ctx.missing}`); return { _tag: "Veto" as const, code: "below-cost" as const, params: { margin: -2 } } }), { role: "veto" })
    yield* p.register("v2", () => Effect.sync(() => { order.push("v2"); return { _tag: "Pass" as const } }), { role: "veto" })
    yield* p.register("adv", () => Effect.sync(() => { order.push("adv"); return { _tag: "Advise" as const, value: "x" } }), { role: "advisory" })
    const out = yield* withNone(p.dispatch(input))
    expect(out.verdict).toEqual({ _tag: "Denied", by: "v1", cause: "veto", code: "below-cost", params: { margin: -2 } })
    expect(out.enrichments).toEqual([{ id: "e2", value: 2 }])
    expect(out.advice).toEqual([])
    expect(order.slice(0, 2).sort()).toEqual(["e1", "e2"])
    expect(order.slice(2)).toEqual(["v1:e2:e1"])
    expect(out.record.steps.map((s) => [s.id, s.outcome])).toEqual([["adv", "not-run"], ["e1", "failed"], ["e2", "enrich"], ["v1", "veto"], ["v2", "not-run"]])
    expect(out.record.decidedBy).toEqual({ id: "v1", cause: "veto", code: "below-cost" })
    expect(JSON.stringify(out.record)).not.toContain("margin")       // no params, no input in the record
    // A code outside the set and a non-primitive param are errors, never vetoes.
    const q = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("q", base({ onError: "skip" }))
    yield* q.register("bad", () => Effect.succeed({ _tag: "Veto", code: "other" } as never), { role: "veto" })
    yield* q.register("obj", () => Effect.succeed({ _tag: "Veto", code: "frozen", params: { o: {} } } as never), { role: "veto" })
    const o2 = yield* withNone(q.dispatch(input))
    expect(o2.verdict._tag).toBe("Allowed")
    expect(o2.record.steps.map((s) => s.outcome)).toEqual(["failed", "failed"])
  })))

  it("check 79: timeout and onError, policy Skip never denies nor counts, breaker opens/half-opens/closes, settle once per run call", () => scoped(Effect.gen(function* () {
    const settled: Array<string> = []
    let fail = true
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base({
      onError: "skip", breaker: { failures: 2, window: 10_000, cooldown: 200 },
      policy: (step) => Effect.succeed(step.id === "skipped" ? { _tag: "Skip", reason: "no budget" } : { _tag: "Run" }),
      settle: (step) => Effect.sync(() => { settled.push(`${step.id}:${step.outcome}`) })
    }))
    const breaker: Array<string> = []
    yield* Effect.forkScoped(p.decisions.pipe(Stream.runForEach((r) => Effect.sync(() => { if (r.type === "breaker") breaker.push((r as HookBreakerRecord).state) }))))
    yield* Effect.yieldNow
    yield* p.register("flaky", () => Effect.suspend(() => fail ? Effect.fail({ _tag: "Boom" }) : pass), { role: "veto" })
    yield* p.register("slow", () => Effect.sleep(200).pipe(Effect.as({ _tag: "Pass" as const })), { role: "veto" })
    yield* p.register("skipped", () => veto("frozen"), { role: "veto" })
    const r1 = yield* withNone(p.dispatch(input))
    expect(r1.verdict._tag).toBe("Allowed")
    expect(r1.record.steps.map((s) => [s.id, s.outcome, s.errorTag ?? s.skipReason])).toEqual([["flaky", "failed", "Boom"], ["skipped", "skipped-policy", "no budget"], ["slow", "timeout", undefined]])
    const r2 = yield* withNone(p.dispatch(input))
    expect(r2.record.steps.map((s) => s.outcome)).toEqual(["failed", "skipped-policy", "timeout"])       // both reach 2 errors: both open
    yield* Effect.sleep(5)
    expect(breaker.slice(0, 2)).toEqual(["open", "open"])
    const r3 = yield* withNone(p.dispatch(input))
    expect(r3.record.steps.map((s) => s.outcome)).toEqual(["breaker-open", "skipped-policy", "breaker-open"])
    yield* Effect.sleep(220)                                        // cooldown → half-open, one probe
    fail = false
    const r4 = yield* withNone(p.dispatch(input))
    expect(r4.record.steps[0]!.outcome).toBe("pass")
    yield* Effect.sleep(5)
    expect(breaker).toContain("half-open"); expect(breaker).toContain("closed")
    // settle: once per call the policy let run, never for the skipped contribution or an open breaker.
    expect(settled.filter((s) => s.startsWith("skipped"))).toEqual([])
    expect(settled.filter((s) => s.startsWith("flaky"))).toEqual(["flaky:failed", "flaky:failed", "flaky:passed"])
    expect(settled.filter((s) => s.startsWith("slow")).every((s) => s === "slow:timeout")).toBe(true)
  })))

  it("check 79/94: the dispatch returns within its deadline; a deadline-interrupted hook is recorded deadline and denies only under onError deny", () => scoped(Effect.gen(function* () {
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base({ timeout: 100, deadline: 120, onError: { default: "skip", allow: ["skip", "deny"] } }))
    yield* p.register("a", () => Effect.sleep(80).pipe(Effect.as({ _tag: "Pass" as const })), { role: "veto" })
    yield* p.register("b", () => Effect.sleep(80).pipe(Effect.as({ _tag: "Pass" as const })), { role: "veto" })
    yield* p.register("c", () => pass, { role: "veto", onError: "deny" })
    const t0 = Date.now()
    const out = yield* withNone(p.dispatch(input))
    expect(Date.now() - t0).toBeLessThan(200)
    expect(out.record.steps.map((s) => s.outcome)).toEqual(["pass", "deadline", "skipped-deadline"])
    expect(out.verdict).toEqual({ _tag: "Denied", by: "c", cause: "deadline" })
  })))

  it("check 80: every dispatch yields one decision record; no host link on a point with codes denies no-host-link", () => scoped(Effect.gen(function* () {
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base())
    yield* p.register("v", () => pass, { role: "veto" })
    const out = yield* p.dispatch(input)                                 // no HostLink in this fiber
    expect(out.verdict).toEqual({ _tag: "Denied", cause: "no-host-link" })
    expect(out.record.decidedBy).toEqual({ cause: "no-host-link" })
    const q = yield* HookPoint.make<Price>("q", { codes: [], who: anyone, timeout: 10, deadline: 20, onError: "skip" })
    expect((yield* q.dispatch(input)).record.declarations).toBe("unseen")
  })))
})

// ---------------------------------------------------------------- dormant declarations with a real host (check 92, recheck K1)
class Prices extends Context.Service<Prices, { readonly ok: Effect.Effect<boolean> }>()("example/Prices") {}
const guardManifest: PluginManifest = { manifestVersion: 1, id: "pricing", version: "1.0.0", provides: [{ serviceId: "example/Prices" }], requires: [],
  contributions: [{ registry: "example/price-change", id: "pricing/guard", role: "veto" }] }
const guardPlugin = (point: HookPoint<Price, never, never, "below-cost", never, never>, journal: Array<string>) => define({
  id: "pricing", requires: [] as const, provides: [Prices] as const, meta: { version: "1.0.0" },
  build: Layer.effect(Prices, Effect.gen(function* () {
    journal.push("build")
    yield* point.register("pricing/guard", (p) => Effect.succeed(p.price < p.cost ? { _tag: "Veto" as const, code: "below-cost" as const } : { _tag: "Pass" as const }), { role: "veto" })
    return { ok: Effect.succeed(true) }
  }))
}) as unknown as AnyPlugin

describe("P7 core 31 + 27: a lazy veto plugin (check 92; recheck)", () => {
  it("recheck: a lazy veto plugin denies on its first dispatch (woken from the dispatcher's fiber within the window)", async () => {
    await run((host) => Effect.gen(function* () {
      const journal: Array<string> = []
      const point = yield* HookPoint.make<Price, never, never, "below-cost">("example/price-change", { codes: ["below-cost"], who: anyone, timeout: 300, deadline: 2000, onError: "deny" })
      yield* host.install(lazy({ manifest: guardManifest, load: Effect.sync(() => guardPlugin(point, journal)) }), as())
      expect(yield* stateIn(host, "pricing")).toBe("dormant")
      const decl = yield* host.declaredContributions("example/price-change")
      expect(decl).toEqual([{ registry: "example/price-change", id: "pricing/guard", role: "veto", pluginId: "pricing", realm: "default", status: "dormant" }])
      const out = yield* drive(host, point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link))))
      expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "veto", code: "below-cost" })
      expect(out.record.steps).toEqual([{ id: "pricing/guard", owner: { pluginId: "pricing", realm: "default" }, role: "veto", woken: true, outcome: "veto" }])
      expect(journal).toEqual(["build"])
      // Later dispatches use the registered contribution; declarations are gone once loaded.
      expect(yield* host.declaredContributions("example/price-change")).toEqual([])
      const ok = yield* point.dispatch({ ...input, price: 9 }).pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
      expect(ok.verdict._tag).toBe("Allowed")
    }))
  })

  it("recheck: a failing wake denies (wake-failed under onError deny; recorded and skipped under skip)", async () => {
    for (const onError of ["deny", "skip"] as const) {
      await run((host) => Effect.gen(function* () {
        const point = yield* HookPoint.make<Price, never, never, "below-cost">("example/price-change", { codes: ["below-cost"], who: anyone, timeout: 300, deadline: 2000, onError })
        yield* host.install(lazy({ manifest: guardManifest, load: Effect.fail("cannot fetch package") }), as())
        const out = yield* drive(host, point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link))))
        if (onError === "deny") expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "wake-failed" })
        else expect(out.verdict._tag).toBe("Allowed")
        expect(out.record.steps).toEqual([{ id: "pricing/guard", owner: { pluginId: "pricing", realm: "default" }, role: "veto", declared: true, outcome: "wake-failed" }])
        // The registration stays failed with phase load; the next dispatch does not wake it again and is resolved the same way.
        expect(yield* stateIn(host, "pricing")).toBe("failed")
        const again = yield* point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
        expect(again.record.steps[0]!.outcome).toBe("wake-failed")
      }))
    }
  })

  it("check 92: dormant 'deny' denies with cause dormant and still wakes; a refused declaration wakes nothing; a late wake is wake-timeout", async () => {
    await run((host) => Effect.gen(function* () {
      const point = yield* HookPoint.make<Price, never, never, "below-cost">("example/price-change", { codes: ["below-cost"], who: anyone, timeout: 300, deadline: 2000, onError: "deny", dormant: "deny" })
      yield* host.install(lazy({ manifest: guardManifest, load: Effect.sync(() => guardPlugin(point, [])) }), as())
      const out = yield* point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
      expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "dormant" })
      expect(yield* stateIn(host, "pricing")).not.toBe("dormant")       // woken, not waited for
    }))
    await run((host) => Effect.gen(function* () {
      const point = yield* HookPoint.make<Price, never, never, "below-cost">("example/price-change", { codes: ["below-cost"], who: (_c, _r, _p, req) => !req.declared, timeout: 300, deadline: 2000, onError: "deny" })
      yield* host.install(lazy({ manifest: guardManifest, load: Effect.sync(() => guardPlugin(point, [])) }), as())
      const out = yield* point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
      expect(out.verdict._tag).toBe("Allowed")
      expect(out.record.steps.map((s) => s.outcome)).toEqual(["declared-refused"])
      expect(yield* stateIn(host, "pricing")).toBe("dormant")
    }))
    await run((host) => Effect.gen(function* () {
      // timeout 300 and deadline 400: the wake window is 100 ms; the load takes longer.
      const point = yield* HookPoint.make<Price, never, never, "below-cost">("example/price-change", { codes: ["below-cost"], who: anyone, timeout: 300, deadline: 400, onError: "deny" })
      yield* host.install(lazy({ manifest: guardManifest, load: Effect.sleep(250).pipe(Effect.as(guardPlugin(point, []))) }), as())
      const out = yield* drive(host, point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link))))
      expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "wake-timeout" })
    }))
  })

  it("finding G-P3 (CCR-BR-028): make refuses timeout equal to deadline when a veto may be woken; dormant deny or no codes may", () => scoped(Effect.gen(function* () {
    expect(Exit.isFailure(yield* Effect.exit(HookPoint.make<Price, never, never, "below-cost">("x", { codes: ["below-cost"], who: anyone, timeout: 500, deadline: 500, onError: "deny" })))).toBe(true)
    expect(Exit.isSuccess(yield* Effect.exit(HookPoint.make<Price, never, never, "below-cost">("y", { codes: ["below-cost"], who: anyone, timeout: 500, deadline: 500, onError: "deny", dormant: "deny" })))).toBe(true)
    expect(Exit.isSuccess(yield* Effect.exit(HookPoint.make<Price>("z", { codes: [], who: anyone, timeout: 500, deadline: 500, onError: "skip" })))).toBe(true)
  })))
})

describe("P7 core 31: policy deny, descriptor failure, plugin-scoped breaker, declaration order (checks 92, 93, 95)", () => {
  it("check 95: policy Deny on a veto ends the dispatch denied-policy at its turn without calling it; on enrich it is skipped-policy; a throwing descriptor denies target-failed", () => scoped(Effect.gen(function* () {
    const called: Array<string> = []
    const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen", { sku: string }, never>("p", {
      ...(base() as object), targets: { descriptor: (x: Price) => { if (x.sku === "boom") throw new Error("x"); return { sku: x.sku } }, selector: Schema.Never as never, matches: () => true },
      policy: (step: { id: string }) => Effect.succeed(step.id === "v2" || step.id === "e" ? { _tag: "Deny", reason: "unlicensed" } : { _tag: "Run" })
    } as never)
    yield* p.register("e", () => Effect.sync(() => { called.push("e"); return { _tag: "Enrich" as const, value: 1 } }), { role: "enrich" })
    yield* p.register("v1", () => Effect.sync(() => { called.push("v1"); return { _tag: "Pass" as const } }), { role: "veto" })
    yield* p.register("v2", () => Effect.sync(() => { called.push("v2"); return { _tag: "Pass" as const } }), { role: "veto" })
    const out = yield* withNone(p.dispatch(input))
    expect(out.verdict).toEqual({ _tag: "Denied", by: "v2", cause: "denied-policy", reason: "unlicensed" })
    expect(called).toEqual(["v1"])
    expect(out.record.steps.map((x) => [x.id, x.outcome, x.skipReason])).toEqual([["e", "skipped-policy", "unlicensed"], ["v1", "pass", undefined], ["v2", "denied-policy", "unlicensed"]])
    const boom = yield* withNone(p.dispatch({ ...input, sku: "boom" }))
    expect(boom.verdict).toEqual({ _tag: "Denied", cause: "target-failed" })
    expect(called).toEqual(["v1"])
  })))

  it("check 93: under breakerScope plugin one owner's errors open one breaker for all its contributions; an unowned contribution keeps its own", async () => {
    await run((host) => Effect.gen(function* () {
      const p = yield* HookPoint.make<Price, number, string, "below-cost" | "frozen">("p", base({ onError: "skip", breakerScope: "plugin", breaker: { failures: 2, window: 10_000, cooldown: 10_000 } }))
      const records: Array<HookBreakerRecord> = []
      yield* Effect.forkScoped(p.decisions.pipe(Stream.runForEach((r) => Effect.sync(() => { if (r.type === "breaker") records.push(r as HookBreakerRecord) }))))
      yield* Effect.yieldNow
      const owner = define({ id: "vendor", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        yield* p.register("vendor/a", () => Effect.fail("x"), { role: "veto" })
        yield* p.register("vendor/b", () => pass, { role: "veto" })
      })) }) as unknown as AnyPlugin
      yield* host.install(owner, as()); yield* drive(host, host.awaitIdle)
      yield* p.register("app/c", () => pass, { role: "veto" })
      yield* withNone(p.dispatch(input)); yield* withNone(p.dispatch(input))
      const third = yield* withNone(p.dispatch(input))
      expect(third.record.steps.map((x) => [x.id, x.outcome])).toEqual([["app/c", "pass"], ["vendor/a", "breaker-open"], ["vendor/b", "breaker-open"]])
      yield* Effect.sleep(5)
      expect(records.map((r) => [r.scope, r.contribution, r.state, r.owner?.pluginId])).toEqual([["plugin", "vendor/a", "open", "vendor"]])
    }))
  })

  it("check 92: with several denying declarations `by` is the first by id, whatever order the wakes settle in", async () => {
    await run((host) => Effect.gen(function* () {
      const point = yield* HookPoint.make<Price, never, never, "below-cost">("example/price-change", { codes: ["below-cost"], who: anyone, timeout: 100, deadline: 1000, onError: "deny" })
      const m = (id: string, cid: string): PluginManifest => ({ manifestVersion: 1, id, version: "1.0.0", provides: [], requires: [], contributions: [{ registry: "example/price-change", id: cid, role: "veto" }] })
      yield* host.install(lazy({ manifest: m("zz", "b/guard"), load: Effect.fail("fast") }), as())
      yield* host.install(lazy({ manifest: m("aa", "a/guard"), load: Effect.sleep(30).pipe(Effect.andThen(Effect.fail("slow"))) }), as())
      const out = yield* drive(host, point.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(host.link))))
      expect(out.verdict).toEqual({ _tag: "Denied", by: "a/guard", cause: "wake-failed" })
      expect(out.record.steps.map((x) => x.id)).toEqual(["a/guard", "b/guard"])
    }))
  })
})
void Fiber
