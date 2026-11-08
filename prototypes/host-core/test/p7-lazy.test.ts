// P7 (round 2): manifests and lazy activation (behaviour 27; checks 62–66) — prototype, evidences no requirement.
import { Context, Effect, Exit, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { consentDiff, lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive, idle, memorySink } from "./fixtures.js"
import { as, run, settleWriter, stateIn } from "./p4fixtures.js"
import { errorOf, failedWith } from "./p7fixtures.js"

import { Reports, lazyReports, reportsDef, reportsManifest } from "./p7fixtures.js"
const consumer = define({ id: "dash", requires: [Reports] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) }) as unknown as AnyPlugin

describe("P7 core 27: manifests (check 62)", () => {
  it("check 62: a manifest that fails to decode or disagrees fails with InvalidDefinition naming the path; unknown properties are kept; engines", async () => {
    await run((host) => Effect.gen(function* () {
      const withManifest = (m: unknown) => reportsDef([], { manifest: m as PluginManifest })
      const e1 = errorOf(yield* Effect.exit(host.install(withManifest({ ...reportsManifest, provides: [{ serviceId: 7 }] }), as())))
      expect(e1).toMatchObject({ _tag: "InvalidDefinition", reason: "manifest: provides[0].serviceId" })
      const e2 = errorOf(yield* Effect.exit(host.install(withManifest({ ...reportsManifest, requires: [{ serviceId: "a@1", version: "1.0.0" }] }), as())))
      expect(e2.reason).toContain("manifest: requires[0].methods")
      const e3 = errorOf(yield* Effect.exit(host.install(withManifest({ ...reportsManifest, version: "9.9.9" }), as())))
      expect(e3.reason).toContain("disagrees")
      const e4 = errorOf(yield* Effect.exit(host.install(withManifest({ ...reportsManifest, engines: { "@bridger/core": "^1" } }), as())))
      expect(e4).toMatchObject({ _tag: "IncompatibleEngine", engine: "@bridger/core", range: "^1", actual: "0.3.0" })
      const e5 = errorOf(yield* Effect.exit(host.install(withManifest({ ...reportsManifest, engines: { "@bridger/core": ">=0" } }), as())))
      expect(e5._tag).toBe("InvalidDefinition")
      yield* host.install(withManifest({ ...reportsManifest, engines: { "@bridger/core": "^0.3", other: "anything" } }), as())
      expect(yield* stateIn(host, "reports")).not.toBe("uninstalled")          // other engines keys are ignored
    }))
  })

  it("check 62: consentDiff classifies the table, reports others as unclassified, is deterministic and non-mutating", () => {
    const prev: PluginManifest = { ...reportsManifest, publisher: "acme", requested: { capabilities: [{ serviceId: "a@1", methods: ["x"] }], permissions: ["read"], egress: [{ host: "a.example" }] } }
    const next: PluginManifest = { ...reportsManifest, version: "1.1.0", publisher: "acme-2", requires: [{ serviceId: "example/Store" }],
      requested: { capabilities: [{ serviceId: "a@1" }, { serviceId: "b@1" }], permissions: [], egress: [{ host: "b.example" }] }, extensions: { "kit/x": 1 } }
    const frozen = JSON.stringify([prev, next])
    const d = consentDiff(prev, next)
    expect(JSON.stringify([prev, next])).toBe(frozen)
    expect(d).toEqual(consentDiff(prev, next))
    expect(d.widened.map((c) => c.path)).toEqual(["requested.capabilities", "requested.capabilities[a@1].methods", "requested.egress", "requires"])
    expect(d.narrowed.map((c) => c.path)).toEqual(["requested.egress", "requested.permissions"])
    expect(d.relabelled).toEqual([{ path: "publisher", from: "acme", to: "acme-2" }])
    expect(d.unclassified.map((c) => c.path)).toEqual(["extensions"])
    expect(d.requiresConsent).toBe(true)
    const first = consentDiff(undefined, prev)
    expect(first.widened.map((c) => c.path)).toEqual(["requested.capabilities", "requested.egress", "requested.permissions"])
    expect(first.relabelled.map((c) => c.path)).toEqual(["publisher"])
  })
})

describe("P7 core 27: lazy activation (checks 63–66)", () => {
  it("check 63: a lazy definition installs dormant, load never called; slots reserved; snapshot lists triggers and lazy.loaded false", async () => {
    let loads = 0
    await run((host) => Effect.gen(function* () {
      yield* host.install(lazyReports(Effect.sync(() => { loads++; return reportsDef() })), as())
      yield* idle(host)
      const snap = (yield* host.snapshot).plugins[0] as any
      expect(snap).toMatchObject({ id: "reports", state: "dormant", lazy: { loaded: false }, meta: { version: "1.0.0", digest: "sha-1", description: "Reports" } })
      expect(snap.triggers).toEqual([
        { _tag: "OnService", serviceId: "example/Reports" },
        { _tag: "OnContribution", registry: "example/price-change", id: "reports/guard" },
        { _tag: "OnEvent", eventId: "billing/invoice-posted" }])
      expect((yield* host.snapshot).availableServiceIds).not.toContain("example/Reports")
      expect(errorOf(yield* Effect.exit(host.install(define({ id: "dup", requires: [] as const, provides: [Reports] as const, build: Layer.succeed(Reports, { run: Effect.succeed("") }) }) as unknown as AnyPlugin, as()))))
        .toMatchObject({ _tag: "DuplicateProvider", providerId: "reports" })
      // Dormant row: retry/restart/enable are no-ops; disable → disabled; enable → dormant again; remove at once.
      yield* drive(host, host.retry("reports", as())); yield* drive(host, host.restart("reports", as())); yield* drive(host, host.enable("reports", as()))
      expect(yield* stateIn(host, "reports")).toBe("dormant")
      yield* drive(host, host.disable("reports", as()))
      expect(yield* stateIn(host, "reports")).toBe("disabled")
      yield* drive(host, host.enable("reports", as()))
      expect(yield* stateIn(host, "reports")).toBe("dormant")
      yield* drive(host, host.reconfigure("reports", { level: 3 }, as()))
      expect(yield* stateIn(host, "reports")).toBe("dormant")
      yield* drive(host, host.remove("reports", as()))
      expect(yield* stateIn(host, "reports")).toBe("uninstalled")
      expect(loads).toBe(0)
      // A reference with version and no methods fails with InvalidDefinition.
      const e = errorOf(yield* Effect.exit(host.install(lazyReports(Effect.die("x"), { manifest: { ...reportsManifest, provides: [{ serviceId: "example/Reports", version: "1.0.0" }] } }), as())))
      expect(e.reason).toContain("manifest: provides[0].methods")
      // A digest beside the manifest that differs from the manifest's own.
      const e2 = errorOf(yield* Effect.exit(host.install(lazyReports(Effect.die("x"), { manifest: { ...reportsManifest, digest: "sha-0" } }), as())))
      expect(e2.reason).toContain("manifest: digest")
    }))
  })

  it("check 64/65: an eager dependent wakes its dormant provider; load runs in the build slot; lazy-triggered precedes system-start", async () => {
    const { records, sink } = memorySink()
    const journal: Array<string> = []
    await run((host) => Effect.gen(function* () {
      yield* host.install(lazyReports(Effect.sync(() => { journal.push("load"); return reportsDef(journal) })), as())
      // use/useOptional wake nothing.
      expect(failedWith(yield* Effect.exit(host.use(Reports, (r) => r.run)), "ServiceUnavailable")).toBe(true)
      expect(yield* stateIn(host, "reports")).toBe("dormant")
      yield* host.install(consumer, as())
      yield* idle(host)
      expect(journal).toEqual(["load", "reports:build"])
      expect(yield* stateIn(host, "reports")).toBe("active")
      expect(yield* stateIn(host, "dash")).toBe("active")
      expect(((yield* host.snapshot).plugins[0] as any).lazy).toEqual({ loaded: true })
      yield* settleWriter
      const mine = records.filter((r) => r.target?.id === "reports").map((r) => r.operation)
      expect(mine.indexOf("lazy-triggered")).toBeGreaterThanOrEqual(0)
      expect(mine.indexOf("lazy-triggered")).toBeLessThan(mine.indexOf("system-start"))
      const lt = records.find((r) => r.operation === "lazy-triggered")!
      const install = records.find((r) => r.operation === "install" && r.target?.id === "dash" && r.phase === "requested")!
      expect(lt).toMatchObject({ trigger: { _tag: "OnService", serviceId: "example/Reports" }, before: { state: "dormant" }, after: { state: "waiting" }, causationId: install.recordId })
      expect(records.find((r) => r.operation === "system-start" && r.target?.id === "reports")!.causationId).toBe(lt.recordId)
    }), { sink })
  })

  it("check 64: wake with OnContribution and OnEvent reports the plugins it woke; a second wake reports none", async () => {
    await run((host) => Effect.gen(function* () {
      yield* host.install(lazyReports(Effect.sync(() => reportsDef())), as())
      expect((yield* host.wake({ _tag: "OnEvent", eventId: "other" })).triggered).toEqual([])
      expect((yield* host.wake({ _tag: "OnContribution", registry: "example/price-change", id: "reports/guard" })).triggered).toEqual([{ id: "reports", realm: "default" }])
      expect((yield* host.wake({ _tag: "OnEvent", eventId: "billing/invoice-posted" })).triggered).toEqual([])
      yield* idle(host)
      expect(yield* stateIn(host, "reports")).toBe("active")
    }))
  })

  it("check 65: failing, dying, timed-out or mismatching loads leave failed phase load, sticky; retry reloads; message from the kind only", async () => {
    const cases: Array<[string, Effect.Effect<AnyPlugin, unknown>, string]> = [
      ["fails", Effect.fail("secret text from the loader"), "LoadFailed: load failed"],
      ["dies", Effect.die(new Error("secret")), "LoadFailed: load died"],
      ["times out", Effect.never, "LoadFailed: load timeout"],
      ["mismatches version", Effect.sync(() => define({ ...(reportsDef() as any), meta: { version: "2.0.0", digest: "sha-1" } }) as AnyPlugin), "ManifestMismatch: version"],
      ["mismatches digest", Effect.sync(() => define({ ...(reportsDef() as any), meta: { version: "1.0.0", digest: "sha-2" } }) as AnyPlugin), "ManifestMismatch: digest"],
      ["is lazy", Effect.sync(() => lazyReports(Effect.die("x")) as unknown as AnyPlugin), "ManifestMismatch: lazy"]
    ]
    for (const [, load, message] of cases) {
      await run((host) => Effect.gen(function* () {
        yield* host.install(lazyReports(load), as())
        yield* host.wake({ _tag: "OnService", serviceId: "example/Reports" })
        yield* idle(host)
        const s = (yield* host.snapshot).plugins[0] as any
        expect(s).toMatchObject({ state: "failed", failure: { phase: "load", message } })
        expect(JSON.stringify(s)).not.toContain("secret")
        expect((yield* host.snapshot).availableServiceIds).not.toContain("example/Reports")
        const decl = yield* host.declaredContributions("example/price-change")
        expect(decl.map((d) => d.status)).toEqual(["load-failed"])
      }), { options: { buildTimeout: 30 } })
    }
    // retry after a load failure reloads.
    let n = 0
    await run((host) => Effect.gen(function* () {
      yield* host.install(lazyReports(Effect.suspend(() => ++n === 1 ? Effect.fail("first") : Effect.succeed(reportsDef()))), as())
      yield* host.wake({ _tag: "OnService", serviceId: "example/Reports" }); yield* idle(host)
      expect(yield* stateIn(host, "reports")).toBe("failed")
      yield* drive(host, host.retry("reports", as())); yield* idle(host)
      expect(yield* stateIn(host, "reports")).toBe("active")
      expect(n).toBe(2)
    }))
  })

  it("check 66: reconcile of lazy entries calls no load and compares identity meta; shutdown lists dormant plugins nowhere", async () => {
    let loads = 0
    const load = Effect.sync(() => { loads++; return reportsDef() })
    await run((host) => Effect.gen(function* () {
      const r1 = yield* drive(host, host.reconcile([{ id: "reports", plugin: lazyReports(load) as never }], as()))
      expect(r1.installed).toEqual(["reports"])
      // A new object with the same version and digest is the same definition; a different digest is not.
      const r2 = yield* drive(host, host.reconcile([{ id: "reports", plugin: lazyReports(load) as never }], as()))
      expect(r2.unchanged).toEqual(["reports"])
      const p = yield* host.plan([{ id: "reports", plugin: lazyReports(load, { digest: "sha-9" }) as never }])
      expect(p.entries.map((e) => e.actions)).toEqual([["replace"]])
      // A signed manifest without digest, with the digest supplied beside it, matches the loaded definition.
      const noDigest = lazy({ manifest: { ...reportsManifest, id: "reports2", provides: [], contributions: [], activation: [{ _tag: "OnEvent", eventId: "r2" }] }, digest: "sha-1", load: Effect.sync(() => define({ ...(reportsDef() as any), id: "reports2", provides: [] }) as AnyPlugin) })
      yield* host.install(noDigest, as())
      yield* host.wake({ _tag: "OnEvent", eventId: "r2" }, { realm: "default" })
      yield* idle(host)
      expect(yield* stateIn(host, "reports2")).toBe("active")
      expect(loads).toBe(0)
      const report = yield* drive(host, host.shutdown(as()))
      expect(report.stopped).toEqual(["reports2"])
    }))
  })
})
