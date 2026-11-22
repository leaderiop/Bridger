// Report 07, R2: the spec-to-code table is generated, deterministic, and fails on drift.
import { describe, expect, it } from "vitest"
// @ts-expect-error plain .mjs script, no declarations
import { check, collect, dangling, render } from "../scripts/gen-correspondence.mjs"

describe("correspondence table", () => {
  it("is deterministic and matches the committed file", () => {
    const a = collect()
    expect(render(a)).toBe(render(collect()))
    expect(check().fails).toEqual([])
  })
  it("names a citation of an undefined id as dangling", () => {
    const data = collect()
    data.cites.set("BEH-BR-999", { src: "src/x.ts:1" }) // fixture-id
    expect(dangling(data)).toEqual(["dangling id BEH-BR-999 (src/x.ts:1)"]) // fixture-id
  })
  it("a rendered status follows where the id is named", () => {
    const data = collect()
    const id: string = [...data.defined].sort()[0]!
    data.cites.set(id, { src: "src/a.ts:1" })
    expect(render(data)).toContain(`| ${id} | Prototyped |`)
    data.cites.set(id, { src: "src/a.ts:1", test: "test/a.ts:2" })
    expect(render(data)).toContain(`| ${id} | Tested |`)
    data.cites.delete(id)
    expect(render(data)).toContain(`| ${id} | Specified |`)
  })
})
