// Report 06 R5 (S5): resident revoked code is visible to the gate (loader BEH-LD-031).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { Gate, fromGate } from "../src/gate.js"
import type { OperationRequest } from "../src/gxp.js"
import { residentRevoked, restartGate } from "../src/loader.js"
import { alice, as } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"
import { onHost } from "./p7fixtures.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Layer } from "effect"

const req = (operation: OperationRequest["operation"]): OperationRequest => ({ operation, actor: alice, correlationId: "c" })
const ctx = { annotations: undefined as never }
const statusOf = (resident: ReadonlyArray<string>) => ({ current: Effect.succeed({ residentRevoked: residentRevoked(resident, new Set(["sha256:bad"])) }) })

describe("residentRevoked and restartGate (BEH-LD-031)", () => {
  it("lists the revoked digests that are resident, installed or not, once and sorted", () => {
    expect(residentRevoked(["sha256:ok", "sha256:bad", "sha256:bad"], new Set(["sha256:bad", "sha256:gone"]))).toEqual(["sha256:bad"])
    expect(residentRevoked([], new Set(["sha256:bad"]))).toEqual([])
  })

  it("strict: operator calls outside `allow` are refused while a revoked module is resident; `remove` still goes through; off lets everything through", async () => {
    const strict = restartGate(statusOf(["sha256:bad"]), { policy: "strict", allow: ["remove", "disable"] })
    expect(await Effect.runPromise(strict.decide(req("install"), ctx))).toEqual({ _tag: "Refuse", reason: "resident-revoked" })
    expect(await Effect.runPromise(strict.decide(req("remove"), ctx))).toEqual({ _tag: "Allow" })
    expect(await Effect.runPromise(restartGate(statusOf(["sha256:bad"]), { policy: "off", allow: [] }).decide(req("install"), ctx))).toEqual({ _tag: "Allow" })
    expect(await Effect.runPromise(restartGate(statusOf(["sha256:ok"]), { policy: "strict", allow: [] }).decide(req("install"), ctx))).toEqual({ _tag: "Allow" })
  })

  it("through Gate.all and the host, the refusal is `restart: resident-revoked` and no plugin is installed", async () => {
    const all = Gate.all([{ name: "restart", gate: restartGate(statusOf(["sha256:bad"]), { policy: "strict", allow: ["remove"] }), timeout: 1000 }])
    const p = define({ id: "p", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      const exit = yield* Effect.exit(drive(host, host.install(p, as())))
      expect(JSON.stringify(exit)).toContain("restart: resident-revoked")
      yield* idle(host)
      expect((yield* host.snapshot).plugins).toEqual([])
    }), { gate: fromGate(all) })
  })
})
