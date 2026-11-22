// Repro tests for four spec-versus-prototype divergences found by the improvement reports (01 L1, 02 realm family).
// Each test asserts what the SPECIFICATION says and is expected to FAIL against the current prototype.
// Prototype only; evidences no requirement (CCR-BR-004). Delete or flip to passing once the divergence is resolved.
import { Context, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { lazy, type PluginManifest } from "../src/manifest.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Realm } from "../src/realms.js"
import { Logger, drive, idle, journal, loggerPlugin, stateOf, withHost } from "./fixtures.js"
import { alice, settleWriter } from "./p4fixtures.js"
import { onHost } from "./p7fixtures.js"

class Svc extends Context.Service<Svc, { readonly n: number }>()("example/ReproSvc") {}
const svcPlugin = define({ id: "svc", requires: [] as const, provides: [Svc] as const, meta: { version: "1", digest: "svc-1" }, build: Layer.succeed(Svc, { n: 1 }) }) as unknown as AnyPlugin
const ctx = { actor: alice }

describe("repro L1 (report 01): BEH-BR-039 stale build after provider loss", () => {
  it("a stale build that FAILS after the loss of a captured provider is discarded (`waiting`)", async () => {
    const j = journal()
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(loggerPlugin(j))
      yield* host.install(define({
        id: "repro/dependent", requires: [Logger] as const, provides: [] as const,
        build: Layer.effectDiscard(Effect.gen(function* () { yield* Effect.sleep(400); return yield* Effect.fail("late build failure") })) as never
      }) as unknown as AnyPlugin)
      expect(yield* host.stepPlugin("example/logger")).toBe(true)               // the provider is active
      expect(yield* host.stepPlugin("repro/dependent")).toBe(true)              // the dependent's build begins and sleeps
      expect(yield* stateOf(host, "repro/dependent")).toBe("starting")
      yield* drive(host, host.remove("example/logger", { drain: 5000 }))              // target change: the captured provider is lost
      yield* idle(host)
      // BEH-BR-039 (report 01 R1): a stale outcome is always discarded, so the plugin is `waiting`, not `failed`.
      expect(yield* stateOf(host, "repro/dependent")).toBe("waiting")
    }))
  })
})

describe("repro 02 (realms.ts): BEH-BR-330 / 331 family members", () => {
  it("options-changed is detected when an interceptor is swapped for another of the same count", async () => {
    let tag = "a"
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const mk = (t: string) => ({ key: Svc, wrap: (s: { n: number }) => ({ n: s.n + t.length }) })
      const fam = yield* Realm.family<string>(host, { id: "fam", context: ctx, realm: () => ({ isolate: [Svc], interceptors: [mk(tag) as never] }), plugins: () => [{ id: "svc", plugin: svcPlugin }], activationTimeout: 2000 })
      yield* drive(host, fam.use("k", [Svc] as const, () => Effect.void))
      tag = "bb"                                                                   // a different interceptor object, same count
      const changed = yield* Effect.exit(fam.use("k", [Svc] as const, () => Effect.void))
      // BEH-BR-330: "the same interceptor objects in the same order"; realms.ts:48 compares only interceptors.length.
      expect(JSON.stringify(changed)).toContain("options-changed")
    })))
  })

  it("a key the spec allows (not empty, no '/', no 'bridger:' prefix) is accepted", async () => {
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const fam = yield* Realm.family<string>(host, { id: "fam", context: ctx, realm: () => ({ isolate: [Svc] }), plugins: () => [{ id: "svc", plugin: svcPlugin }], activationTimeout: 2000 })
      // BEH-BR-330 refuses only empty keys, keys containing "/" and keys beginning "bridger:"; realms.ts:46 also
      // refuses anything outside [A-Za-z0-9._-]{1,64}, so "tenant:1" is wrongly "invalid-key".
      const exit = yield* Effect.exit(drive(host, fam.use("tenant:1", [Svc] as const, ([s]) => Effect.succeed(s.n))))
      expect(JSON.stringify(exit)).not.toContain("invalid-key")
    })))
  })

  it("a member whose only other plugin is `dormant` (lazy) is ready", async () => {
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const manifest: PluginManifest = { manifestVersion: 1, id: "lazy-one", version: "1.0.0", provides: [{ serviceId: "example/ReproLazy" }], requires: [], activation: [{ _tag: "OnEvent", eventId: "never/fires" }] }
      class LazySvc extends Context.Service<LazySvc, {}>()("example/ReproLazy") {}
      const lz = lazy({ manifest, digest: "sha-1", load: Effect.succeed(define({ id: "lazy-one", requires: [] as const, provides: [LazySvc] as const, meta: { version: "1.0.0", digest: "sha-1" }, build: Layer.succeed(LazySvc, {}) }) as unknown as AnyPlugin) })
      const fam = yield* Realm.family<string>(host, { id: "fam", context: ctx, realm: () => ({ isolate: [Svc] }), plugins: () => [{ id: "svc", plugin: svcPlugin }, { id: "lazy-one", plugin: lz as unknown as AnyPlugin }], activationTimeout: 300 })
      yield* settleWriter
      // BEH-BR-331 / REQ-BR-084: ready when every plugin is active, dormant or operator-disabled; awaitActive
      // (realms.ts:17) requires "active", so the member times out as "activation-timeout".
      const exit = yield* Effect.exit(drive(host, fam.use("k", [Svc] as const, ([s]) => Effect.succeed(s.n))))
      expect(JSON.stringify(exit)).not.toContain("activation-timeout")
    })))
  })
})
