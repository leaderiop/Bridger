// Report 07, R4: BEH-BR-160 as a property with shrinking. Any history over the operation alphabet settles to the
// states of a fresh host given only the plugin set the history left installed. The alphabet and universe are those
// of the hand-written suites (test/universe.ts); the walk is chosen and shrunk by fast-check. Seeds are pinned in
// test/pbt/config.ts; a failure prints the seed and the shrunk history.
import { Effect } from "effect"
import * as fc from "fast-check"
import { describe, expect, it } from "vitest"
import * as Testing from "../../src/testing.js"
import { drive, idle } from "../fixtures.js"
import { as } from "../p4fixtures.js"
import { normal, plugins, present, refOf, setup, stalePairs, universe } from "../universe.js"
import { assertProperty, onTestHost } from "./config.js"

type Op = { readonly kind: "install" | "remove" | "disable" | "enable" | "restart"; readonly at: number; readonly off: boolean; readonly settle: boolean }
const op = fc.record({
  kind: fc.constantFrom("install", "remove", "disable", "enable", "restart"),
  at: fc.nat({ max: universe.length - 1 }), off: fc.boolean(), settle: fc.boolean()
}) as fc.Arbitrary<Op>

/** What the history intends to be installed: the model the host is compared with (not read back from the host). */
type Intent = Map<number, "on" | "off">

const apply = (t: Testing.TestHost, o: Op, intent: Intent) => Effect.gen(function* () {
  const u = universe[o.at]!
  const ref = refOf(u)
  const here = yield* present(t, u)
  const call = {
    install: () => t.install(plugins[u.name]!, { ...as(), realm: u.realm, ...(o.off ? { disabled: true } : {}) }),
    remove: () => t.remove(ref, as()), disable: () => t.disable(ref, as()), enable: () => t.enable(ref, as()), restart: () => t.restart(ref, as())
  }[o.kind]
  // A call the legality table refuses (install on a present plugin, enable of an enabled one, ...) is part of the history too.
  if (o.kind === "install" ? here : !here) return
  yield* Effect.exit(drive(t, call() as Effect.Effect<unknown, unknown>))
  const now = intent.get(o.at)
  if (o.kind === "install") intent.set(o.at, o.off ? "off" : "on")
  else if (o.kind === "remove") intent.delete(o.at)
  else if (o.kind === "disable" && now === "on") intent.set(o.at, "off")
  else if (o.kind === "enable" && now === "off") intent.set(o.at, "on")
  if (o.settle) yield* idle(t)
})

describe("confluence as a property (BEH-BR-160)", () => {
  it("any history settles like a fresh install of the set it left behind", async () => {
    await assertProperty(fc.asyncProperty(fc.array(op, { maxLength: 24 }), async (history) => {
      const settled = await onTestHost((t) => Effect.gen(function* () {
        yield* setup(t)
        const intent: Intent = new Map()
        for (const o of history) {
          yield* apply(t, o, intent)
          expect(stalePairs(yield* t.snapshot)).toEqual([])
        }
        yield* idle(t)
        const snap = yield* t.snapshot
        return { states: normal(snap), left: [...intent].map(([at, v]) => ({ name: universe[at]!, off: v === "off" })) }
      }))
      const fresh = await onTestHost((t) => Effect.gen(function* () {
        yield* setup(t)
        for (const x of settled.left) yield* t.install(plugins[x.name.name]!, { ...as(), realm: x.name.realm, ...(x.off ? { disabled: true } : {}) })
        yield* idle(t)
        return normal(yield* t.snapshot)
      }))
      expect(settled.states).toEqual(fresh)
    }), 60)
  }, 300_000)
})
