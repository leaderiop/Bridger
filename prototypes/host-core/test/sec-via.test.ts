// Report 06 R6 (S8): a host mutation made by a provider's method names the provider as `via`, beside the principal it acted for (BEH-BR-282).
import { Context, Effect, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { Annotation } from "../src/annotations.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { CurrentPlugin } from "../src/policy.js"
import { PluginRuntime } from "../src/runtime.js"
import type * as Testing from "../src/testing.js"
import { idle } from "./fixtures.js"
import { as, settleWriter } from "./p4fixtures.js"
import { onHost, rec } from "./p7fixtures.js"

class Mutator extends Context.Service<Mutator, { readonly mutate: (id: string) => Effect.Effect<void>; readonly mutateAsSelf: (id: string) => Effect.Effect<void>; readonly seen: Effect.Effect<ReadonlyArray<string>> }>()("sec/Mutator") {}
const child = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin

describe("via: provider attribution on host mutations (BEH-BR-282)", () => {
  it("a mutation a provider's method makes records onBehalfOf the consumer and via the provider; asSelf records the provider as principal, still with via; application calls have none", async () => {
    const { records, sink } = rec()
    let hostRef: Testing.TestHost | undefined
    const provider = define({ id: "store", requires: [] as const, provides: [Mutator] as const, meta: { version: "1", digest: "store-1" }, build: Layer.effect(Mutator, Effect.gen(function* () {
      const rt = yield* PluginRuntime
      const install = (id: string) => hostRef!.install(child(id), as()).pipe(Effect.orDie, Effect.asVoid)
      return { mutate: install, mutateAsSelf: (id: string) => rt.asSelf(install(id)), seen: Effect.map(Annotation.current, (a) => a.keys) }
    })) as never }) as unknown as AnyPlugin
    const caller = define({ id: "caller", requires: [Mutator] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
      const m = yield* Mutator
      yield* m.mutate("by-caller"); yield* m.mutateAsSelf("by-self")
    })) as never }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      hostRef = host
      yield* host.install(provider, as())
      yield* host.install(caller, as())
      yield* idle(host); yield* settleWriter
      const by = (id: string) => records.filter((r) => r.target?.id === id && r.operation === "install")
      const via = (id: string) => by(id).map((r) => r.annotations?.find((a) => a.key === "bridger:via")?.value)
      expect(by("by-caller").every((r) => r.onBehalfOf?.id === "caller")).toBe(true)     // the principal is unchanged (BEH-BR-258)
      expect(via("by-caller")[0]).toEqual([{ id: "store", realm: "default", version: "1", digest: "store-1" }])
      expect(by("by-self").every((r) => r.onBehalfOf?.id === "store")).toBe(true)
      expect(via("by-self")[0]).toEqual([{ id: "store", realm: "default", version: "1", digest: "store-1" }])
      // Application code calling the provider's method through Host.use: no principal, `via` still names the module.
      yield* host.use(Mutator, (m) => m.mutate("by-app"))
      yield* settleWriter
      expect(by("by-app").every((r) => r.onBehalfOf === undefined)).toBe(true)
      expect(via("by-app")[0]).toEqual([{ id: "store", realm: "default", version: "1", digest: "store-1" }])
      // Not a provider's method: no `via`.
      yield* host.install(child("plain"), as()); yield* settleWriter
      expect(via("plain").every((v) => v === undefined)).toBe(true)
      expect(Option.isNone(yield* CurrentPlugin.get)).toBe(true)
    }), { sink })
  })

  it("nested providers accumulate outermost first, once each", async () => {
    const seen: Array<ReadonlyArray<string>> = []
    const ids = Effect.map(Annotation.current, (a) => Option.getOrElse(Option.map(a.get(Annotation.Via), (v) => v.map((p) => p.id)), () => [] as ReadonlyArray<string>))
    class Inner extends Context.Service<Inner, { readonly run: Effect.Effect<void> }>()("sec/Inner") {}
    const inner = define({ id: "inner", requires: [] as const, provides: [Inner] as const, build: Layer.succeed(Inner, { run: Effect.flatMap(ids, (v) => Effect.sync(() => { seen.push(v) })) }) as never }) as unknown as AnyPlugin
    const outer = define({ id: "outer", requires: [Inner] as const, provides: [Mutator] as const, build: Layer.effect(Mutator, Effect.gen(function* () {
      const i = yield* Inner
      return { mutate: () => i.run, mutateAsSelf: () => i.run, seen: ids }
    })) as never }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(inner, as()); yield* host.install(outer, as()); yield* idle(host)
      const keys = yield* host.use(Mutator, (m) => Effect.flatMap(m.mutate("x"), () => m.seen))
      expect(keys).toEqual(["outer"])                       // inside outer's own method
      expect(seen).toEqual([["outer", "inner"]])            // outer called inner: outermost first, once each
    }))
  })
})
