// BEH-KT-035: a client generated from the requested contract is typed per method (compile-time assertions).
import { expect, it } from "vitest"
import type { CallContext } from "../src/sdk.js"
import { ClockClient } from "./golden/typed-sdk.js"

it("ctx.client(ClockClient).now takes and returns the contract's types", () => {
  const use = async (ctx: CallContext) => {
    const r = await ctx.client(ClockClient).now({ zone: "UTC" })
    const iso: string = r.iso
    // @ts-expect-error the payload is { zone: string }
    await ctx.client(ClockClient).now({ zone: 1 })
    // @ts-expect-error no such method
    ctx.client(ClockClient).later
    return iso
  }
  expect(typeof use).toBe("function")
})
