// Report 06 R4 (S7): ChainGate, and the anchor condition for irreversible operations (BEH-AC-013, BEH-AC-013).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { ChainGate, type ChainStatus } from "../src/audit-chain.js"
import { Gate } from "../src/gate.js"
import type { OperationRequest } from "../src/gxp.js"
import { alice } from "./p4fixtures.js"

const status = (s: Partial<ChainStatus> = {}) => ({ current: Effect.succeed({ head: { auditSeq: 10, hash: "h" }, unanchored: { records: 0 }, chainBreaks: 0, ...s } as ChainStatus) })
const req = (operation: OperationRequest["operation"], extra: Partial<OperationRequest> = {}): OperationRequest => ({ operation, actor: alice, correlationId: "c", ...extra })
const decide = (gate: ReturnType<typeof ChainGate.make>, r: OperationRequest) => Effect.runPromise(gate.decide(r, { annotations: undefined as never })).then((d) => d._tag === "Refuse" ? d.reason : d._tag)

describe("ChainGate (BEH-AC-013)", () => {
  it("refuses an operation outside `allow` while unanchored records exceed the limit, and on a chain break; never Defer", async () => {
    const gate = ChainGate.make(status({ unanchored: { records: 600 } }), { maxUnanchoredRecords: 500, allow: ["remove"] })
    expect(await decide(gate, req("install"))).toBe("anchor-overdue")
    expect(await decide(gate, req("remove"))).toBe("Allow")
    expect(await decide(ChainGate.make(status({ chainBreaks: 1 }), { maxUnanchoredRecords: 500, allow: [] }), req("install"))).toBe("chain-break")
    expect(await decide(ChainGate.make(status({ unanchored: { records: 5 } }), { maxUnanchoredRecords: 500, allow: [] }), req("install"))).toBe("Allow")
  })

  it("a configuration that gives no rule, or a limit not above anchorEvery, is refused when the piece is made", () => {
    expect(() => ChainGate.make(status(), { refuseOnBreak: false, allow: [] })).toThrow("no limit")
    expect(() => ChainGate.make(status(), { maxUnanchoredRecords: 100, anchorEvery: { records: 500 }, allow: [] })).toThrow("must exceed")
  })
})

describe("anchor before an irreversible operation (BEH-AC-013)", () => {
  const gate = (s: Partial<ChainStatus>) => ChainGate.make(status(s), { anchorBeforeIrreversible: true, allow: [] })
  it("an irreversible request is refused `anchor-behind` while any record is unanchored, and allowed once the head is anchored; others pass", async () => {
    const irreversible = req("remove", { reversibility: "irreversible" })
    expect(await decide(gate({ unanchored: { records: 3 } }), irreversible)).toBe("anchor-behind")
    expect(await decide(gate({ unanchored: { records: 0 }, lastAnchored: { toSeq: 10, statementHash: "s", at: "t" } }), irreversible)).toBe("Allow")
    expect(await decide(gate({ unanchored: { records: 3 } }), req("remove"))).toBe("Allow")        // a reversible call is not held
  })
  it("composes with Gate.all: the refusal names the piece", async () => {
    const all = Gate.all([{ name: "anchoring", gate: gate({ unanchored: { records: 3 } }), timeout: 1000 }])
    const d = await Effect.runPromise(all.decide(req("remove", { reversibility: "irreversible" }), { annotations: undefined as never }))
    expect(d).toMatchObject({ _tag: "Refuse" })
    expect((d as { reason: string }).reason).toContain("anchor-behind")
  })
})
