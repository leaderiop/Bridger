// Report 05 R9 (DX-08): the reference client runs the shared UI-adapter scenarios. A real adapter's test does the same with its own `make`.
import { describe, it } from "vitest"
import { makeClient } from "../src/adapter.js"
import { scenarios } from "./adapter-conformance.js"
import { run } from "./p4fixtures.js"

describe("UI adapter conformance (report 05 R9, kit appendix C)", () => {
  for (const s of scenarios) it(`${s.id}: ${s.title}`, () => run((host) => s.run({ host, make: makeClient })))
})
