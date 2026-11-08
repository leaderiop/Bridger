// P7 third pass (CCR-BR-029 alignment): hook-point wake step (R1-03..R1-06, R1-08..R1-10) and the "idling" and
// "refused" declarations of BEH-BR-250. Prototype; evidences no requirement.
import { Context, Effect, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { RefusalList } from "../src/gxp.js"
import { HostLink, type HostLinkShape } from "../src/host.js"
import { HookPoint } from "../src/hooks.js"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import type * as Testing from "../src/testing.js"
import { drive } from "./fixtures.js"
import { as, run, settleWriter, stateIn } from "./p4fixtures.js"
import { onHost, rec } from "./p7fixtures.js"

type Price = { readonly sku: string; readonly price: number; readonly cost: number }
type Point = HookPoint<Price, number, never, "below-cost", never, never>
const input: Price = { sku: "a", price: 5, cost: 7 }
const anyone = () => true
const REG = "example/price-change"
class Prices extends Context.Service<Prices, { readonly ok: boolean }>()("example/Prices") {}
const manifest = (extra: Partial<PluginManifest> = {}): PluginManifest => ({ manifestVersion: 1, id: "pricing", version: "1.0.0", provides: [{ serviceId: "example/Prices" }], requires: [],
  contributions: [{ registry: REG, id: "pricing/guard", role: "veto" }], ...extra })
const guard = (point: Point, o: { journal?: Array<string>; stopDelay?: number } = {}) => define({
  id: "pricing", requires: [] as const, provides: [Prices] as const, meta: { version: "1.0.0", digest: "pricing-1" },
  build: Layer.effect(Prices, Effect.gen(function* () {
    o.journal?.push("build")
    // Added before the registration, so it runs after the contribution is withdrawn (LIFO): the stop takes time.
    if (o.stopDelay) yield* Effect.addFinalizer(() => Effect.sleep(o.stopDelay!))
    yield* point.register("pricing/guard", (p) => Effect.succeed(p.price < p.cost ? { _tag: "Veto" as const, code: "below-cost" as const } : { _tag: "Pass" as const }), { role: "veto" })
    return { ok: true }
  }))
}) as unknown as AnyPlugin
const stepper = (host: Testing.TestHost) => Effect.forkScoped(Effect.forever(Effect.gen(function* () { if (!(yield* host.step)) yield* Effect.sleep(1) })))
const linked = (host: Testing.TestHost) => <A>(e: Effect.Effect<A>) => e.pipe(Effect.provideService(HostLink.reference, Option.some(host.link)))
const mk = (o: Partial<Parameters<typeof HookPoint.make<Price, number, never, "below-cost">>[1]> = {}) =>
  HookPoint.make<Price, number, never, "below-cost">(REG, { codes: ["below-cost"], who: anyone, timeout: 100, deadline: 1500, onError: "deny", ...o })

describe("P7 third pass: HostLink and the record's link (R1-06, R1-09)", () => {
  it("R1-06: HostLink.none denies a veto point without allowNoLink; with it, the dispatch runs and records link 'none'; the host link records its hostId", async () => {
    await run((host) => Effect.gen(function* () {
      const p = yield* mk()
      const none = yield* p.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(HostLink.none)))
      expect(none.verdict).toEqual({ _tag: "Denied", cause: "no-host-link" })
      expect(none.record.link).toBe("none")
      const q = yield* HookPoint.make<Price, number, never, "below-cost">("q", { codes: ["below-cost"], who: anyone, timeout: 10, deadline: 100, onError: "deny", allowNoLink: true })
      const ok = yield* q.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(HostLink.none)))
      expect(ok.verdict._tag).toBe("Allowed")
      expect(ok.record).toMatchObject({ link: "none" })
      expect(ok.record.declarations).toBeUndefined()
      expect(host.link.hostId).toBeTruthy()
      expect(HostLink.none.hostId).toBeUndefined()
      const viaHost = yield* linked(host)(p.dispatch(input))
      expect(viaHost.verdict._tag).toBe("Allowed")
      expect(viaHost.record.link).toBe(host.link.hostId)
      // No link at all: no `link` field. A point without codes proceeds, "unseen", under no link and under none.
      const free = yield* HookPoint.make<Price>("free", { codes: [], who: anyone, timeout: 10, deadline: 100, onError: "skip" })
      const bare = yield* free.dispatch(input)
      expect(bare.record.link).toBeUndefined()
      expect((yield* free.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(HostLink.none)))).record).toMatchObject({ declarations: "unseen", link: "none" })
    }))
  })

  it("R1-09: a declarations read that fails, dies or is late denies a veto point (no-host-link) and marks a point without codes 'unseen'", async () => {
    const wake: HostLinkShape["wake"] = () => Effect.succeed({ triggered: [] })
    const links: Array<HostLinkShape> = [
      { hostId: "h", declaredContributions: () => Effect.die("broken"), wake },
      { hostId: "h", declaredContributions: () => Effect.never, wake }
    ]
    await run(() => Effect.gen(function* () {
      const p = yield* mk({ deadline: 200 })
      const free = yield* HookPoint.make<Price>("free", { codes: [], who: anyone, timeout: 10, deadline: 50, onError: "skip" })
      for (const l of links) {
        const t0 = Date.now()
        const out = yield* p.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(l)))
        expect(out.verdict).toEqual({ _tag: "Denied", cause: "no-host-link" })
        expect(Date.now() - t0).toBeLessThan(400)
        expect((yield* free.dispatch(input).pipe(Effect.provideService(HostLink.reference, Option.some(l)))).record.declarations).toBe("unseen")
      }
    }))
  })
})

describe("P7 third pass: declarations matched by id, owner and role (R1-05)", () => {
  it("R1-05 regression: another plugin's advisory contribution under the declared id hides nothing; the declaration is kept, tagged DuplicateContribution, and its wake cannot complete", async () => {
    await run((host) => Effect.gen(function* () {
      const point = yield* mk()
      // An eager plugin registers an advisory hook under the veto's declared id.
      yield* host.install(define({ id: "squatter", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(
        point.register("pricing/guard", () => Effect.succeed({ _tag: "Pass" as const }), { role: "advisory" })) }) as unknown as AnyPlugin, as())
      yield* drive(host, host.awaitIdle)
      yield* host.install(lazy({ manifest: manifest(), load: Effect.sync(() => guard(point)), digest: "pricing-1" }), as())
      const out = yield* drive(host, linked(host)(point.dispatch(input)))
      expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "wake-failed" })
      expect(out.record.steps.find((s) => s.declared)).toMatchObject({ id: "pricing/guard", owner: { pluginId: "pricing" }, outcome: "wake-failed", errorTag: "DuplicateContribution" })
    }))
  })
})

describe("P7 third pass: 'refused' and 'idling' declarations (R1-03, R1-04)", () => {
  it("R1-04: a registration the RefusalList disabled is declared 'refused' and resolved by onError without a wake", async () => {
    for (const onError of ["deny", "skip"] as const) {
      const { records, sink } = rec()
      const listed = new Set<string>()
      await onHost((host) => Effect.gen(function* () {
        const point = yield* mk({ onError })
        yield* host.install(lazy({ manifest: manifest(), load: Effect.sync(() => guard(point)), digest: "pricing-1" }), as())
        listed.add("pricing-1")
        yield* host.wake({ _tag: "OnContribution", registry: REG, id: "pricing/guard" })
        expect(yield* host.declaredContributions(REG)).toEqual([{ registry: REG, id: "pricing/guard", role: "veto", pluginId: "pricing", realm: "default", status: "refused" }])
        yield* settleWriter
        const triggered = records.filter((r) => r.operation === "lazy-triggered").length
        const out = yield* linked(host)(point.dispatch(input))
        if (onError === "deny") expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "wake-failed" })
        else expect(out.verdict._tag).toBe("Allowed")
        expect(out.record.steps).toEqual([{ id: "pricing/guard", owner: { pluginId: "pricing", realm: "default" }, role: "veto", declared: true, outcome: "wake-failed" }])
        yield* settleWriter
        expect(records.filter((r) => r.operation === "lazy-triggered").length).toBe(triggered)   // no wake
        // An operator's disable is not reported.
        yield* drive(host, host.disable("pricing", as()))
        expect(yield* host.declaredContributions(REG)).toEqual([])
      }), { sink, layers: [Layer.succeed(RefusalList, { refused: (s) => listed.has(s.digest) ? Option.some("revoked") : Option.none() })] })
    }
  })

  it("R1-03: during an idle stop the declaration is 'idling'; a dispatch wakes it (the trigger is kept and applied at dormant) and waits for it", async () => {
    const journal: Array<string> = []
    await run((host) => Effect.gen(function* () {
      const point = yield* mk({ deadline: 3000, timeout: 300 })
      yield* host.install(lazy({ manifest: manifest(), load: Effect.sync(() => guard(point, { journal, stopDelay: 150 })), digest: "pricing-1", idle: 40 }), as())
      yield* stepper(host)                                                         // the TestHost steps in the background (real clock)
      yield* host.wake({ _tag: "OnContribution", registry: REG, id: "pricing/guard" })
      const seen: Array<string> = []
      for (let i = 0; i < 200 && (yield* stateIn(host, "pricing")) !== "stopping"; i++) { const st = yield* stateIn(host, "pricing"); if (seen.at(-1) !== st) seen.push(st); yield* Effect.sleep(2) }
      expect(seen).toContain("active")
      expect(yield* stateIn(host, "pricing")).toBe("stopping")
      expect(yield* host.declaredContributions(REG)).toEqual([expect.objectContaining({ id: "pricing/guard", status: "idling" })])
      const out = yield* linked(host)(point.dispatch(input))
      expect(out.verdict).toEqual({ _tag: "Denied", by: "pricing/guard", cause: "veto", code: "below-cost" })
      expect(out.record.steps).toEqual([expect.objectContaining({ id: "pricing/guard", woken: true, outcome: "veto" })])
      expect(journal).toEqual(["build", "build"])                                  // loaded again after dormant
    }))
  })
})

describe("P7 third pass: the wake window (R1-08, R1-10)", () => {
  for (const withEnrich of [false, true]) {
    it(`R1-08: ${withEnrich ? "an enrich contribution takes one more timeout off the window: the late veto is wake-timeout" : "without enrich work the same load arrives within the window"}`, async () => {
      await run((host) => Effect.gen(function* () {
        // deadline 400, timeout 100: window 300 without enrich work, 200 with it; the load takes 250.
        const point = yield* mk({ deadline: 400, timeout: 100, enrichment: undefined })
        if (withEnrich) yield* point.register("app/enrich", () => Effect.succeed({ _tag: "Pass" as const }), { role: "enrich" })
        yield* host.install(lazy({ manifest: manifest(), load: Effect.sleep(250).pipe(Effect.as(guard(point))), digest: "pricing-1" }), as())
        const out = yield* drive(host, linked(host)(point.dispatch(input)))
        expect(out.verdict).toEqual(withEnrich ? { _tag: "Denied", by: "pricing/guard", cause: "wake-timeout" } : { _tag: "Denied", by: "pricing/guard", cause: "veto", code: "below-cost" })
      }))
    })
  }

  it("R1-10: a declaration 'waking' for a whole window (its provider never comes) is not waited for again", async () => {
    await run((host) => Effect.gen(function* () {
      const point = yield* mk({ deadline: 300, timeout: 100 })
      yield* host.install(lazy({ manifest: manifest({ requires: [{ serviceId: "example/Missing" }] }), load: Effect.die("never loaded"), digest: "pricing-1" }), as())
      const first = yield* drive(host, linked(host)(point.dispatch(input)))
      expect(first.verdict).toMatchObject({ cause: "wake-timeout" })
      expect(first.record.elapsedMs).toBeGreaterThanOrEqual(190)
      expect((yield* host.declaredContributions(REG))[0]!.status).toBe("waking")
      const second = yield* linked(host)(point.dispatch(input))
      expect(second.verdict).toMatchObject({ cause: "wake-timeout" })
      expect(second.record.elapsedMs).toBeLessThan(50)
    }))
  })
})
