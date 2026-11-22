// S72: a fiber holding two leases stays a holder until the last one ends, so a force revoke still interrupts it.
import { describe, expect, it } from "vitest"
import { holdRef, unholdRef } from "../src/host.js"

describe("lease holders are reference counted", () => {
  it("one release of two leases keeps the fiber a holder; the second removes it; another fiber is unaffected", () => {
    const set = new Set<string>()
    holdRef(set, "f1"); holdRef(set, "f1"); holdRef(set, "f2")
    unholdRef(set, "f1"); expect([...set].sort()).toEqual(["f1", "f2"])
    unholdRef(set, "f1"); expect([...set]).toEqual(["f2"])
    unholdRef(set, "f2"); expect(set.size).toBe(0)
  })
})
