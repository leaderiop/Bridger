// Report 06, not-checked item: a binding consumed by a rolled-back forward action is not reused for its undo; each undo needs a binding of its own
// (gxp BEH-GX-093, core BEH-BR-325). A single-use gate models the ticket store: a request is allowed only when an unconsumed binding with its exact shape exists.
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { at } from "../src/contract.js"
import type { DesiredPlugin } from "../src/desired.js"
import { OperationGate, OperationRejected, type OperationRequest } from "../src/gxp.js"
import type { AnyPlugin } from "../src/plugin.js"
import { drive } from "./fixtures.js"
import { as, run, settleWriter } from "./p4fixtures.js"
import { Audit23, dependent, errorOf, provider } from "./p7fixtures.js"

const entry = (plugin: AnyPlugin): DesiredPlugin => ({ id: plugin.id, plugin })
const v21 = provider("audit", at(Audit23, "2.1.0", { methods: ["append", "query"] }), "2.1")
const v23 = provider("audit", Audit23, "2.3")
const needs23 = dependent("billing", Audit23.range("^2.3"))
const shape = (q: OperationRequest) => JSON.stringify([q.operation, q.target?.id, q.undo === true])

/** Approved bindings by shape; each is consumed on first use, as a ticket binding is (INV-GX-002). */
const ticketGate = (approved: ReadonlyArray<string>) => {
  const open = new Set(approved), used: Array<string> = []
  const gate: OperationGate["Service"] = { authorize: (q) => Effect.suspend(() => {
    const s = shape(q)
    if (q.operation === "install" && q.target?.id === "billing") return Effect.fail(new OperationRejected({ operation: q.operation, reason: "not approved" } as never))
    if (!open.delete(s)) return Effect.fail(new OperationRejected({ operation: q.operation, reason: "no-binding" } as never))
    used.push(s)
    return Effect.void
  }) }
  return { gate, used, open }
}

describe("a rolled-back forward action's binding does not cover its undo", () => {
  it("with only the forward bindings approved, the undo is refused, so the apply ends PartialApply; with the undo's own binding it rolls back", async () => {
    const forward = shape({ operation: "replace", target: { id: "audit", realm: "default" } } as OperationRequest)
    const undoOwn = shape({ operation: "replace", target: { id: "audit", realm: "default" }, undo: true } as OperationRequest)
    const seed = shape({ operation: "install", target: { id: "audit", realm: "default" } } as OperationRequest)
    for (const [approved, expectTag, consumedUndo] of [[[seed, forward], "PartialApply", false], [[seed, forward, undoOwn], "ApplyRolledBack", true]] as const) {
      const t = ticketGate(approved)
      await run((host) => Effect.gen(function* () {
        yield* drive(host, host.reconcile([entry(v21)], as()))
        const exit = yield* Effect.exit(drive(host, host.reconcile([entry(v23), entry(needs23)], { ...as(), atomic: true })))
        expect(errorOf(exit)).toMatchObject({ _tag: expectTag })
        yield* settleWriter
        expect(t.used.includes(undoOwn)).toBe(consumedUndo)
        expect(t.used.filter((s) => s === forward)).toHaveLength(1)          // the forward binding was consumed once and is not offered again
      }), { gate: t.gate })
    }
  })
})
