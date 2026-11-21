// Report 01 R10: the transition ledger (references/core/transitions.yaml) is the source of legality.table.ts and of the
// tables of BEH-BR-071 and BEH-BR-072. Prototype only; evidences no requirement (CCR-BR-004).
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { OPS } from "../src/legality.js"
// @ts-expect-error plain .mjs helper without types
import { readTransitions, render } from "../scripts/transitions.mjs"

type Ledger = { operations: string[]; edges: string[]; rows: Record<string, Record<string, string>>; inFlight: Record<string, Record<string, string>> }
const ledger = readTransitions() as Ledger
const spec = readFileSync(new URL("../../../references/core/behaviors/08-operation-legality.md", import.meta.url), "utf8")

/** The rows of the markdown table that follows `## <heading>`: first cell (bold stripped) -> cells by column header. */
const tableOf = (heading: string) => {
  const from = spec.indexOf(`## ${heading}`)
  const lines = spec.slice(from, spec.indexOf("\n## ", from + 5)).split("\n").filter((l) => l.startsWith("| "))
  const cells = (l: string) => l.split("|").slice(1, -1).map((c) => c.trim())
  const [head, , ...body] = lines.map(cells)
  return Object.fromEntries(body.map((r) => [r[0]!.replace(/\*/g, ""), Object.fromEntries(head!.slice(1).map((h, i) => [h, r[i + 1]!]))]))
}
/** What a prose cell must say for a ledger outcome; `proceed`-like outcomes are prose and are not checked. */
const says = (cell: string, outcome: string) =>
  outcome === "noop" ? /no-op/.test(cell) : outcome === "unknown-plugin" ? cell.includes("UnknownPlugin") : outcome === "duplicate-plugin" ? cell.includes("DuplicatePlugin")
  : outcome.startsWith("conflict:") ? cell.includes(`Conflict (${outcome.slice(9)})`) : outcome === "proceed" ? !/Conflict|UnknownPlugin|DuplicatePlugin|^no-op/.test(cell)
  : outcome === "join" ? /joins/.test(cell) : outcome === "supersede" ? /supersedes/.test(cell) : outcome === "join-if-equal" ? /equal value: joins/.test(cell) : /aborts the parked stop/.test(cell)

const states = readFileSync(new URL("../../../references/core/behaviors/04-states-and-snapshots.md", import.meta.url), "utf8")

describe("transition ledger", () => {
  it("the state diagram of BEH-BR-026 has exactly the ledger's edges", () => {
    const drawn = new Set([...states.matchAll(/^\s+(\[\*\]|\w+) --> (\[\*\]|\w+)(?::|$)/gm)].map((m) => `${m[1]}>${m[2]}`))
    expect([...drawn].sort()).toEqual([...ledger.edges].sort())
  })
  it("legality.table.ts is the generated form of the ledger", () => {
    expect(readFileSync(new URL("../src/legality.table.ts", import.meta.url), "utf8")).toBe(render(ledger))
  })
  it("the ledger's operations are the host's operations, and every table is total over them", () => {
    expect(ledger.operations).toEqual([...OPS])
    for (const t of [ledger.rows, ledger.inFlight]) for (const [k, r] of Object.entries(t)) expect(Object.keys(r), k).toEqual(ledger.operations)
  })
  it("the state table of BEH-BR-071 says what the ledger says", () => {
    const md = tableOf("BEH-BR-071")
    const name = (r: string) => r === "failed-cleanup" ? "failed(cleanup)" : r
    for (const [row, cellsByOp] of Object.entries(ledger.rows)) {
      if (row === "stopping") continue                                         // the stopping row defers to BEH-BR-072..074, 080
      const mdRow = Object.entries(md).find(([k]) => k === name(row) || k.startsWith(`${name(row)} (`))?.[1]
      expect(mdRow, `row ${row}`).toBeDefined()
      for (const [op, outcome] of Object.entries(cellsByOp)) expect(says(mdRow![op]!, outcome), `${row}/${op}=${outcome}: ${mdRow![op]}`).toBe(true)
    }
  })
  it("the in-flight table of BEH-BR-072 says what the ledger says", () => {
    const md = tableOf("BEH-BR-072")
    for (const [flight, cellsByOp] of Object.entries(ledger.inFlight)) {
      for (const [op, outcome] of Object.entries(cellsByOp)) expect(says(md[flight]![op]!, outcome), `${flight}/${op}=${outcome}: ${md[flight]![op]}`).toBe(true)
    }
  })
})
