// Report 02 R1 (D-01): BEH-BR-228 clause 3b, a method both sides name must have the same schema digest.
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract, at } from "../src/contract.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import * as Registry from "../src/registry.js"
import { as, run } from "./p4fixtures.js"
import { errorOf, failedWith } from "./p7fixtures.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string>; readonly list: Effect.Effect<number> }>()("example/Board@1") {}
const post = (payload: Schema.Top, extra: { stream?: boolean; digest?: string } = {}) => Contract.method({ payload, success: Schema.String, ...extra })
const make = (version: string, methods: Record<string, ReturnType<typeof Contract.method>>) => Contract.make(Board, { version, methods })
const impl: Board["Service"] = { post: (s) => Effect.succeed(s), list: Effect.succeed(1) }
const prov = (ref: any) => define({ id: "board", requires: [] as const, provides: [ref] as const, build: Layer.succeed(Board, impl) as any }) as unknown as AnyPlugin
const dep = (ref: any) => define({ id: "reader", requires: [ref] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as any }) as unknown as AnyPlugin
const Text = Schema.Struct({ text: Schema.String })
const Rich = Schema.Struct({ text: Schema.String, mood: Schema.String })

describe("report 02 R1: schema digests", () => {
  it("two separately built copies of an identical contract bind; documentation annotations never matter", async () => {
    const a = make("1.0.0", { post: post(Text), list: Contract.method({}) })
    const b = make("1.0.0", { post: post(Text.annotate({ description: "a post" })), list: Contract.method({}) })
    expect(a.descriptor.schemas).toHaveLength(2)
    expect(a.descriptor.schemas).toEqual(b.descriptor.schemas)
    await run((host) => Effect.gen(function* () {
      yield* host.install(prov(a), as())
      expect(failedWith(yield* Effect.exit(host.install(dep(b.range("^1.0")), as())), "IncompatibleContract")).toBe(false)
    }))
  })

  it("a changed payload under the same names and range is refused, naming the method, from both sides", async () => {
    const old = make("1.2.0", { post: post(Text), list: Contract.method({}) })
    const changed = make("1.3.0", { post: post(Rich), list: Contract.method({}) })
    expect(old.descriptor.schemas.find((x) => x.method === "post")!.digest).not.toBe(changed.descriptor.schemas.find((x) => x.method === "post")!.digest)
    await run((host) => Effect.gen(function* () {
      yield* host.install(prov(changed), as())
      const e = errorOf(yield* Effect.exit(host.install(dep(old.range("^1.0")), as())))
      expect(e).toMatchObject({ _tag: "IncompatibleContract", providerId: "board", dependentId: "reader", mismatchedMethods: ["post"], missingMethods: [] })
    }))
    await run((host) => Effect.gen(function* () {
      yield* host.install(dep(old.range("^1.0")), as())
      const e = errorOf(yield* Effect.exit(host.install(prov(changed), as())))
      expect(e).toMatchObject({ _tag: "IncompatibleContract", providerId: "board", mismatchedMethods: ["post"] })
    }))
  })

  it("a flipped stream flag changes the digest; an add-only higher provision binds, a higher one that edits an existing method does not", async () => {
    const base = make("1.0.0", { post: post(Text), list: Contract.method({}) })
    expect(make("1.0.0", { post: post(Text, { stream: true }), list: Contract.method({}) }).descriptor.schemas.find((x) => x.method === "post")!.digest).not.toBe(base.descriptor.schemas.find((x) => x.method === "post")!.digest)
    class Board2 extends Context.Service<Board2, Board["Service"]>()("example/Board@1") {}
    const addOnly = Contract.make(Board2, { version: "1.1.0", methods: { post: post(Text), list: Contract.method({}), purge: Contract.method({}) } })
    const editing = Contract.make(Board2, { version: "1.1.0", methods: { post: post(Rich), list: Contract.method({}), purge: Contract.method({}) } })
    await run((host) => Effect.gen(function* () {
      yield* host.install(prov(addOnly), as())
      expect(failedWith(yield* Effect.exit(host.install(dep(base.range("^1.0")), as())), "IncompatibleContract")).toBe(false)
    }))
    await run((host) => Effect.gen(function* () {
      yield* host.install(prov(editing), as())
      expect(errorOf(yield* Effect.exit(host.install(dep(base.range("^1.0")), as())))).toMatchObject({ mismatchedMethods: ["post"] })
    }))
  })

  it("an explicit digest decides for a method without a canonical schema; a method with none is not compared", () => {
    const opaque = { not: "a schema" }
    const a = make("1.0.0", { post: Contract.method({ payload: opaque, digest: "v1" }), list: Contract.method({ payload: opaque }) })
    const b = make("1.0.0", { post: Contract.method({ payload: opaque, digest: "v2" }), list: Contract.method({ payload: { other: 1 } }) })
    expect(a.descriptor.schemas.map((x) => x.method)).toEqual(["post"])        // `list` has no digest: skipped
    expect(a.descriptor.schemas.find((x) => x.method === "post")!.digest).toBe("v1")
    expect(b.descriptor.schemas.find((x) => x.method === "post")!.digest).toBe("v2")
  })

  it("a contract registry compares a Contract.at provision's copy against its own contract", async () => {
    const reg = make("1.0.0", { post: post(Text), list: Contract.method({}) })
    const same = make("1.0.0", { post: post(Text), list: Contract.method({}) })
    const drifted = make("1.0.0", { post: post(Rich), list: Contract.method({}) })
    await run((host) => Effect.gen(function* () {
      const r = yield* Registry.make<Board["Service"]>({ name: "boards", contract: reg })
      yield* r.add("ok", impl, { implements: at(same, "1.0.0", { methods: ["post", "list"] }) })
      const e = errorOf(yield* Effect.exit(r.add("bad", impl, { implements: at(drifted, "1.0.0", { methods: ["post", "list"] }) })))
      expect(e).toMatchObject({ _tag: "IncompatibleContract", dependentId: "registry:boards", mismatchedMethods: ["post"] })
      expect((yield* r.view).entries.map((x) => x.id)).toEqual(["ok"])
      void host
    }))
  })
})
