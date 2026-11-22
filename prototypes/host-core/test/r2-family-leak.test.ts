// Report 02 R6: a family member refuses a provide its realm does not isolate (BEH-BR-146, 331); "allow" restores the old behaviour.
import { Context, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Realm } from "../src/realms.js"
import { drive } from "./fixtures.js"
import { alice } from "./p4fixtures.js"
import { onHost } from "./p7fixtures.js"

class Svc extends Context.Service<Svc, { readonly n: number }>()("example/LeakSvc") {}
const svc = define({ id: "svc", requires: [] as const, provides: [Svc] as const, build: Layer.succeed(Svc, { n: 1 }) }) as unknown as AnyPlugin
const ctx = { actor: alice }

describe("report 02 R6: family default refuses non-isolated provides", () => {
  it("a member whose plugin provides a key its realm does not isolate is rejected, never published into the default slot", async () => {
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const fam = yield* Realm.family<string>(host, { id: "fam", context: ctx, realm: () => ({ isolate: [] }), plugins: () => [{ id: "svc", plugin: svc }], activationTimeout: 500 })
      const exit = yield* Effect.exit(drive(host, fam.use("k", [Svc] as const, () => Effect.void)))
      expect(JSON.stringify(exit)).toContain("rejected")
      expect((yield* host.snapshot).availableServiceIds).not.toContain("example/LeakSvc")
    })))
  })

  it("the same member is accepted when the realm isolates the key", async () => {
    await onHost((host) => Effect.scoped(Effect.gen(function* () {
      const fam = yield* Realm.family<string>(host, { id: "fam", context: ctx, realm: () => ({ isolate: [Svc] }), plugins: () => [{ id: "svc", plugin: svc }], activationTimeout: 2000 })
      expect(yield* drive(host, fam.use("k", [Svc] as const, ([s]) => Effect.succeed(s.n)))).toBe(1)
    })))
  })
})
