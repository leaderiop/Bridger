// Report 06 S24: a child's mount is gated by the entitlement mount policy (BEH-EN-009).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { childMountPolicy } from "../src/entitlement-mount.js"
import { journal } from "./fixtures.js"
import { as, run, stateIn } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"
import { Layer } from "effect"
import { define, type AnyPlugin } from "../src/plugin.js"
import { PluginRuntime } from "../src/runtime.js"

const kid = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin
const parent = (children: string[]) => define({ id: "app", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
  const rt = yield* PluginRuntime
  for (const c of children) yield* Effect.exit(rt.install(kid(c)))
})) as never }) as unknown as AnyPlugin

const states = (policy: ReturnType<typeof childMountPolicy>) => run((host) => Effect.gen(function* () {
  yield* drive(host, host.install(parent(["licensed", "unlicensed"]), as())); yield* idle(host)
  return [yield* stateIn(host, "app/licensed"), yield* stateIn(host, "app/unlicensed")]
}), { options: { mountPolicy: policy } })

describe("child mount entitlement", () => {
  it("own subject: only the licensed child mounts; none refuses all; a throwing entitlement fails closed", async () => {
    void journal
    expect(await states(childMountPolicy({ childSubject: "own", entitled: (s) => s === "app/licensed" }))).toEqual(["active", "uninstalled"])
    expect(await states(childMountPolicy({ childSubject: "none", entitled: () => true }))).toEqual(["uninstalled", "uninstalled"])
    expect(await states(childMountPolicy({ childSubject: "parent", entitled: (s) => s === "app" }))).toEqual(["active", "active"])
    expect(await states(childMountPolicy({ childSubject: "own", entitled: () => { throw new Error("x") } }))).toEqual(["uninstalled", "uninstalled"])
  })
})
