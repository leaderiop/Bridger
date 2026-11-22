// Kit 05 over the remote companion's session (BEH-KT-034): the partner SDK guest answers the link handshake; a call crosses the session of its epoch.
import { Context, Effect, Exit, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { serveEntry } from "../src/guest-session.js"
import { remoteProxy } from "../src/remoteproxy.js"
import { ContractError, schemasOf, serveContract } from "../src/sdk.js"
import { duplex } from "../src/wire.js"
import { as, stateIn } from "./p4fixtures.js"
import { withHost } from "./fixtures.js"

class Greeter extends Context.Service<Greeter, { readonly greet: (i: { readonly name: string }) => Effect.Effect<{ readonly text: string }, { readonly _tag: "NotFound"; readonly name: string }> }>()("example/Greeter@1") {}
const spec = { payload: Schema.Struct({ name: Schema.String }), success: Schema.Struct({ text: Schema.String }), error: Schema.Struct({ _tag: Schema.Literal("NotFound"), name: Schema.String }) }
const greeter = Contract.make(Greeter, { version: "1.2.0", methods: { greet: Contract.method(spec) } })
const entry = serveContract(schemasOf(greeter), { async greet(i: { name: string }) { if (i.name === "") throw new ContractError({ name: "" }, "NotFound"); return { text: `hi ${i.name}` } } })

describe("the partner SDK guest over a session", () => {
  it("a host call reaches the SDK handlers through the session child; a typed failure crosses as RemoteError with the failure as detail; the SDK still checks the input", async () => {
    const dial = Effect.gen(function* () { const [a, b] = yield* duplex; yield* Effect.forkChild(serveEntry(b, entry, { schemas: greeter.descriptor.schemas })); return a })
    const proxy = remoteProxy({ id: "greeters", contract: greeter, accepts: "^1.0", dial, heartbeat: { every: 50, missed: 4 }, backoff: 1500 })
    await withHost((host) => Effect.gen(function* () {
      yield* host.install(proxy, as())
      for (let i = 0; i < 3000 && (yield* stateIn(host, "greeters/session")) !== "active"; i++) { while (yield* host.step) { /* drain */ } yield* TestClock.adjust(5); yield* Effect.yieldNow }
      expect(yield* stateIn(host, "greeters/session")).toBe("active")
      const call = (name: unknown) => Effect.exit(host.use(greeter.range("^1.0") as never, (svc: { greet: (i: unknown) => Effect.Effect<unknown, unknown> }) => svc.greet({ name })))
      const drive = <A>(e: Effect.Effect<A>) => Effect.gen(function* () {
        const f = yield* Effect.forkChild(e)
        for (let i = 0; i < 2000 && f.pollUnsafe() === undefined; i++) { while (yield* host.step) { /* drain */ } yield* TestClock.adjust(5); yield* Effect.yieldNow }
        return yield* Fiber.join(f)
      })
      const ok = yield* drive(call("Ada")); expect(JSON.stringify(ok)).toContain("hi Ada")
      const typed = yield* drive(call("")); expect(Exit.isFailure(typed as never) || JSON.stringify(typed)).toBeTruthy(); expect(JSON.stringify(typed)).toContain("NotFound")
      expect(JSON.stringify(yield* drive(call(7)))).toContain("SdkDecodeFailed")
    }), { gateTimeout: 50 }, TestClock.layer())
  }, 30000)

  it("the identity claims a link discloses reach the handler as ctx.claims; a claim it does not list never crosses (INV-RM-012)", async () => {
    const seen: Array<unknown> = []
    const spy = serveContract(schemasOf(greeter), { async greet(i: { name: string }, ctx: { claims: unknown }) { seen.push(ctx.claims); return { text: `hi ${i.name}` } } })
    const go = async (disclose: Array<"actor" | "onBehalfOf" | "org" | "correlationId">) => {
      const dial = Effect.gen(function* () { const [a, b] = yield* duplex; yield* Effect.forkChild(serveEntry(b, spy, { schemas: greeter.descriptor.schemas })); return a })
      const proxy = remoteProxy({ id: "greeters", contract: greeter, accepts: "^1.0", dial, heartbeat: { every: 50, missed: 4 }, backoff: 1500, disclose,
        identity: Effect.succeed({ actor: { kind: "user", id: "u1" }, org: "acme", correlationId: "c-9" }) })
      await withHost((host) => Effect.gen(function* () {
        yield* host.install(proxy, as())
        for (let i = 0; i < 3000 && (yield* stateIn(host, "greeters/session")) !== "active"; i++) { while (yield* host.step) { /* drain */ } yield* TestClock.adjust(5); yield* Effect.yieldNow }
        const f = yield* Effect.forkChild(host.use(greeter.range("^1.0") as never, (svc: { greet: (i: unknown) => Effect.Effect<unknown, unknown> }) => svc.greet({ name: "Ada" })))
        for (let i = 0; i < 2000 && f.pollUnsafe() === undefined; i++) { while (yield* host.step) { /* drain */ } yield* TestClock.adjust(5); yield* Effect.yieldNow }
      }), { gateTimeout: 50 }, TestClock.layer())
    }
    await go([]); await go(["actor", "correlationId", "onBehalfOf"])
    expect(seen[0]).toEqual({})                                                                 // the default discloses nothing
    expect(seen[1]).toEqual({ actor: { kind: "user", id: "u1" }, correlationId: "c-9" })      // listed and present; `org` was not listed, `onBehalfOf` had no value
  }, 30000)
})

