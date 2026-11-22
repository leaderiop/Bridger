// Report 06 S11: a lookalike provider satisfies `requires` by key and version, so an application that cares allow-lists providers by identity
// in `CapabilityPolicy.resolve`, which receives the provider's id, realm, version and digest (core BEH-BR-273).
import { Context, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { CapabilityPolicy, Grant, ResolutionRefused, type ResolutionRequest } from "../src/policy.js"
import { drive, idle } from "./fixtures.js"
import { as } from "./p4fixtures.js"
import { onHost } from "./p7fixtures.js"

class Pay extends Context.Service<Pay, { readonly pay: Effect.Effect<string> }>()("example/Pay")  {}
const provider = (id: string, digest: string) => define({ id, requires: [] as const, provides: [Pay] as const, meta: { version: "1", digest },
  build: Layer.succeed(Pay, { pay: Effect.succeed(id) }) }) as unknown as AnyPlugin
const consumer = define({ id: "shop", requires: [Pay] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const allowOnly = (digests: ReadonlySet<string>) => Layer.succeed(CapabilityPolicy, {
  resolve: (r: ResolutionRequest) => r.provider.kind === "base" || (r.provider.digest !== undefined && digests.has(r.provider.digest))
    ? Effect.succeed(Grant.all(Pay)) : Effect.fail(new ResolutionRefused({ serviceId: r.serviceId, consumer: "shop", reason: "provider not allowed" }))
})

describe("a provider allow-list in CapabilityPolicy.resolve", () => {
  it("the real provider is resolved; a lookalike with the same key and version is refused by its digest and the consumer does not activate", async () => {
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(provider("pay-real", "sha256:real"), as()))
      yield* drive(host, host.install(consumer, as())); yield* idle(host)
      expect((yield* host.snapshot).plugins.find((p) => p.id === "shop")?.state).toBe("active")
    }), { layers: [allowOnly(new Set(["sha256:real"]))] })
    await onHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(provider("pay-lookalike", "sha256:evil"), as()))
      yield* drive(host, host.install(consumer, as())); yield* idle(host)
      const row = (yield* host.snapshot).plugins.find((p) => p.id === "shop")
      expect(row?.state === "failed" ? row.failure.message : row?.state).toContain("ResolutionRefused")
    }), { layers: [allowOnly(new Set(["sha256:real"]))] })
  })
})
