// The callback checks in order (remote BEH-RM-046): the first refusal stops, and nothing runs before step 8.
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { handleCallback, type CallbackContext, type CallbackRequest } from "../src/callback.js"
import { inProcess } from "../src/tokens.js"

const none = { pluginIds: new Set<string>(), digests: new Set<string>() }
const make = async (o: Partial<CallbackContext> & { annotations?: unknown } = {}) => {
  const authority = inProcess(() => "t1"); const calls: string[] = []
  const ref = await Effect.runPromise(authority.mint({ pluginId: "link", realm: "app", epoch: "e1", callId: "c1", contractVersion: "1.0.0", issuedAt: 0, expires: 1000, annotations: o.annotations }))
  const ctx: CallbackContext = { epoch: "e1", revoked: false, rev: none, now: Effect.succeed(10), inFlight: (id) => id === "c1", seen: new Set(), authority, offeredLabels: ["eu"],
    grants: [{ contract: "stock/Query", methods: ["count"] }], decode: (_c, _m, p) => Effect.sync(() => { calls.push("decode"); return p }),
    run: (_cl, _c, _m, p) => Effect.sync(() => { calls.push("run"); return `ran:${String(p)}` }), ...o }
  const f = (x: Partial<CallbackRequest> = {}): CallbackRequest => ({ epoch: "e1", callId: "cb1", parent: "c1", token: ref, contract: "stock/Query", method: "count", payload: "p", ...x })
  return { ctx, calls, f, h: (x: Partial<CallbackRequest> = {}) => Effect.runPromise(handleCallback(ctx, f(x))) }
}

describe("handleCallback", () => {
  it("runs a fully admitted callback through the service", async () => {
    const t = await make(); expect(await t.h()).toEqual({ ok: "ran:p" }); expect(t.calls).toEqual(["decode", "run"])
  })
  it("refuses a stale epoch, a revoked link and a bad token before anything else, running nothing", async () => {
    const t = await make({ revoked: true })
    expect(await t.h({ epoch: "old" })).toEqual({ refused: { reason: "stale-epoch", tag: "StaleEpoch" } })
    expect(await t.h()).toEqual({ refused: { reason: "denied", tag: "RemoteRevoked" } })
    expect(await (await make()).h({ token: "x" })).toEqual({ refused: { reason: "denied", tag: "TokenInvalid" } })
    expect(t.calls).toEqual([])
  })
  it("answers a duplicate without running the callback again", async () => {
    const t = await make(); await t.h(); expect(await t.h()).toEqual({ duplicate: true }); expect(t.calls).toEqual(["decode", "run"])
  })
  it("refuses a residency label the transport does not offer (4a)", async () => {
    const t = await make({ annotations: { residency: ["us"] } })
    expect(await t.h()).toEqual({ refused: { reason: "placement-refused", tag: "PlacementRefused" } }); expect(t.calls).toEqual([])
    expect(await (await make({ annotations: { residency: ["eu"] } })).h()).toEqual({ ok: "ran:p" })
  })
  it("refuses when the principal budget does not admit it (4b), only when a budget is provided", async () => {
    const t = await make({ budget: () => Effect.succeed(false) })
    expect(await t.h()).toEqual({ refused: { reason: "budget-exceeded", tag: "RemoteBudgetExceeded" } }); expect(t.calls).toEqual([])
  })
  it("denies a contract or method the grants do not cover, and a local contract (5)", async () => {
    const t = await make()
    expect(await t.h({ method: "other" })).toEqual({ refused: { reason: "denied", tag: "CallbackDenied" } })
    expect(await (await make()).h({ contract: "x/Y" })).toEqual({ refused: { reason: "denied", tag: "CallbackDenied" } })
    const l = await make({ grants: [{ contract: "stock/Query", methods: ["count"], local: true }] })
    expect(await l.h()).toEqual({ refused: { reason: "denied", tag: "CallbackDenied" } }); expect(l.calls).toEqual([])
  })
  it("denies when the CallbackAdmission refuses (6)", async () => {
    const t = await make({ admission: () => Effect.fail({ _tag: "CallbackDenied", reason: "no" }) })
    expect(await t.h()).toEqual({ refused: { reason: "denied", tag: "CallbackDenied" } }); expect(t.calls).toEqual([])
  })
  it("fails with WireDecodeError when the payload does not decode, running nothing (7)", async () => {
    const t = await make({ decode: () => Effect.fail("bad") })
    expect(await t.h()).toEqual({ failed: { _tag: "WireDecodeError" } })
  })
  it("sends a ResolutionRefused as a denied exit, and ServiceUnavailable as a failure (8)", async () => {
    expect(await (await make({ run: () => Effect.fail({ _tag: "ResolutionRefused" }) })).h()).toEqual({ refused: { reason: "denied", tag: "ResolutionRefused" } })
    expect(await (await make({ run: () => Effect.fail({ _tag: "ServiceUnavailable" }) })).h()).toEqual({ failed: { _tag: "ServiceUnavailable" } })
  })
})
