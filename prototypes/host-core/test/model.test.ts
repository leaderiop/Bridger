// Report 07, R1: the reference model (references/core/formal/model.ts) agrees with the ledger and with the audit it names.
import { describe, expect, it } from "vitest"
import { flight, inv017, inv022, inv023, inv030, legal, quiescent, takeOverWaits, waitCycle, type Ledger } from "../../../references/core/formal/model.js"
import { FLIGHT_TABLE, STATE_TABLE } from "../src/legality.table.js"
import { legality, inFlight, OPS, ROWS, FLIGHT_OPS } from "../src/legality.js"

const ledger: Ledger = { rows: STATE_TABLE, inFlight: FLIGHT_TABLE }

describe("model: the operation tables are the ledger", () => {
  it("answers every settled and in-flight cell with what the generated tables hold", () => {
    for (const row of ROWS) for (const op of OPS) expect(legal(ledger, row, op)).toBe(STATE_TABLE[row]![op])
    for (const f of FLIGHT_OPS) for (const op of OPS) expect(flight(ledger, f, op)).toBe(FLIGHT_TABLE[f]![op])
    // and the prototype's pure functions are built from the same cells
    expect(legality("active", "remove")).toEqual({ kind: "proceed" })
    expect(inFlight("remove", "remove")).toEqual({ kind: "join" })
    expect(() => legal(ledger, "nowhere", "install")).toThrow()
  })
})

describe("model: quiescent (BEH-BR-160)", () => {
  const a = { id: "a", realm: "default", requires: [], provides: ["S"] }
  const b = { id: "b", realm: "default", requires: ["S"], provides: ["T"] }
  const c = { id: "c", realm: "default", requires: ["T"], provides: [] }
  it("is a function of the installed set: any order of the same set gives the same answer", () => {
    const all = [{ reg: a, enabled: true }, { reg: b, enabled: true }, { reg: c, enabled: true }]
    const want = quiescent(all, {})
    expect(want.map((s) => s.state)).toEqual(["active", "active", "active"])
    for (const perm of [[0, 2, 1], [1, 0, 2], [2, 1, 0]]) expect(quiescent(perm.map((i) => all[i]!), {})).toEqual(want)
  })
  it("waits with the missing services, and disables on the flag", () => {
    expect(quiescent([{ reg: b, enabled: true }], {})).toEqual([{ id: "b", realm: "default", state: "waiting", missing: ["S"] }])
    expect(quiescent([{ reg: a, enabled: false }, { reg: b, enabled: true }], {}).map((s) => [s.id, s.state])).toEqual([["a", "disabled"], ["b", "waiting"]])
  })
  it("a child exists while its parent is active, in the parent's realm", () => {
    const parent = { id: "p", realm: "default", requires: [], provides: [], children: [{ id: "kid", realm: "default", requires: ["S"], provides: [] }] }
    expect(quiescent([{ reg: parent, enabled: true }], {}).map((s) => [s.id, s.state])).toEqual([["kid", "waiting"], ["p", "active"]])
    expect(quiescent([{ reg: parent, enabled: false }], {}).map((s) => s.id)).toEqual(["p"])
  })
  it("an isolated service resolves inside its realm", () => {
    const inT = { ...b, realm: "t" }
    expect(quiescent([{ reg: a, enabled: true }, { reg: inT, enabled: true }], { t: new Set(["S"]) })[1]).toMatchObject({ state: "waiting", missing: ["S"] })
    expect(quiescent([{ reg: a, enabled: true }, { reg: inT, enabled: true }], {})[1]).toMatchObject({ state: "active" })
  })
})

describe("model: INV-BR-030 and SPEC-AUDIT-09 H1", () => {
  it("the round-8 take-over rule closes a wait-for cycle through the slot; the fixed rule does not", () => {
    expect(waitCycle(takeOverWaits("round-8"))).toEqual(["build:parent", "take-over:child", "build:child", "slot", "build:parent"])
    expect(inv030(takeOverWaits("round-8"))).toBe(false)
    expect(inv030(takeOverWaits("fixed"))).toBe(true)
  })
})

describe("model: trace predicates", () => {
  it("INV-BR-017 bounds a drain by its limit unless declared forever", () => {
    expect(inv017([{ start: 0, end: 30, limit: 30 }, { start: 5, limit: "forever" }], 1_000_000)).toBe(true)
    expect(inv017([{ start: 0, end: 31, limit: 30 }], 100)).toBe(false)
    expect(inv017([{ start: 0, limit: 30 }], 31)).toBe(false)
  })
  it("INV-BR-023 wants 1, 2, 3, … and INV-BR-022 one requested and one terminal per call", () => {
    expect(inv023([{ auditSeq: 1 }, { auditSeq: 2 }])).toBe(true)
    expect(inv023([{ auditSeq: 1 }, { auditSeq: 3 }])).toBe(false)
    const r = (phase: string, n: number) => ({ auditSeq: n, phase, correlationId: "c", operation: "install", target: { id: "a", realm: "default" } })
    expect(inv022([r("requested", 1), r("completed", 2)])).toBe(true)
    expect(inv022([r("rejected", 1)])).toBe(true)
    expect(inv022([r("requested", 1)])).toBe(false)
    expect(inv022([r("requested", 1), r("completed", 2), r("failed", 3)])).toBe(false)
    expect(inv022([r("requested", 1), r("rejected", 2)])).toBe(false)
  })
})
