// P7 (round 2): generic gate, annotations, Actor.narrow, RefusalList and K10 fields (checks 74, 81, 82, 86, 104, 108) — prototype.
import { Effect, Exit, Fiber, Layer, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { isWithin, narrow } from "../src/actor.js"
import { Annotation, Annotations, CurrentAnnotations } from "../src/annotations.js"
import { Draft, Gate, asGate, fromGate, type GateDecision } from "../src/gate.js"
import { Actor, AuditSink, OperationGate, RefusalList, type OperationRequest } from "../src/gxp.js"
import * as Testing from "../src/testing.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { drive, idle, memorySink, withHost } from "./fixtures.js"
import { alice, as, run, settleWriter, stateIn } from "./p4fixtures.js"
import { errorOf, lazyReports, reportsDef } from "./p7fixtures.js"

const Ticket = Annotation.key<string>("example/ticket", { schema: Schema.String, combine: (_a, b) => b, monotonic: false, flows: ["gate", "audit"] })
const Secret = Annotation.key<string>("example/secret", { schema: Schema.String, combine: (_a, b) => b, monotonic: false, flows: ["policy"] })
const req: OperationRequest = { operation: "install", actor: alice, correlationId: "c", target: { id: "x", realm: "default" } }

describe("P7 core 30: annotations (check 74, partial)", () => {
  it("check 74: keys combine as declared; a monotonic key cannot be replaced; a bag not made by core is empty; core keys' shapes", () => {
    const b1 = Annotations.add(Annotations.empty, Annotation.Deadline, { at: 50 })
    const b2 = Annotations.add(b1, Annotation.Deadline, { at: 90 })
    expect(Option.getOrThrow(b2.get(Annotation.Deadline))).toEqual({ at: 50 })            // earlier wins
    const t = Annotations.add(Annotations.add(Annotations.empty, Annotation.Taint, new Set(["a"])), Annotation.Taint, new Set(["b"]))
    expect([...Option.getOrThrow(t.get(Annotation.Taint))].sort()).toEqual(["a", "b"])
    expect(() => Annotations.replace(b2, Annotation.Deadline, Option.none())).toThrow()
    // A supplied context cannot remove a monotonic key the fiber carries.
    const resolved = Annotations.resolve(b2, Annotations.add(Annotations.empty, Annotation.Deadline, { at: 70 }))
    expect(Option.getOrThrow(resolved.get(Annotation.Deadline))).toEqual({ at: 50 })
    const forged = { get: () => Option.some("x"), keys: ["example/ticket"] }
    expect(Annotations.isBag(forged)).toBe(false)
    expect(Annotations.filter(forged as never, "gate").keys).toEqual([])
    expect(() => Annotation.key("bridger:mine", { schema: Schema.String, combine: (a) => a, monotonic: false, flows: [] })).toThrow()
    expect(Annotations.encode(Annotations.add(b2, Ticket, "T-1")).entries).toEqual([{ key: "bridger:deadline", value: { at: 50 } }, { key: "example/ticket", value: "T-1" }])
  })
})

describe("P7 core 32: Gate<Req> (checks 81, 82)", () => {
  it("check 81: Gate.run calls decide once with gate-flow annotations only; defects, timeouts and malformed drafts refuse; drafts returned unchanged", async () => {
    let calls = 0
    const seen: Array<ReadonlyArray<string>> = []
    const g = (d: GateDecision<OperationRequest> | "die" | "hang"): Gate<OperationRequest> => ({
      decide: (_r, ctx) => Effect.suspend(() => { calls++; seen.push(ctx.annotations.keys); return d === "die" ? Effect.die("x") : d === "hang" ? Effect.never : Effect.succeed(d) })
    })
    const withAnn = <A, E>(e: Effect.Effect<A, E>) => e.pipe(Effect.provideService(CurrentAnnotations, Annotations.add(Annotations.add(Annotations.empty, Ticket, "T"), Secret, "s")))
    const draft = { draftId: "d-1", requests: [req], expected: [{ key: "plugin:x", version: "3" }] }
    const r = await Effect.runPromise(withAnn(Effect.all([
      Gate.run(g({ _tag: "Allow" }), req, { name: "a", timeout: 50 }),
      Gate.run(g("die"), req, { name: "b", timeout: 50 }),
      Gate.run(g("hang"), req, { name: "c", timeout: 20 }),
      Gate.run(g({ _tag: "Defer", draft: { draftId: "", requests: [], expected: [] } }), req, { name: "d", timeout: 50 }),
      Gate.run(g({ _tag: "Defer", draft }), req, { name: "e", timeout: 50 })
    ])))
    expect(r.slice(0, 4)).toEqual([{ _tag: "Allow" }, { _tag: "Refuse", reason: "gate-defect" }, { _tag: "Refuse", reason: "gate-timeout" }, { _tag: "Refuse", reason: "gate-defect" }])
    expect((r[4] as { draft: unknown }).draft).toBe(draft)
    expect(calls).toBe(5)
    expect(seen.every((k) => JSON.stringify(k) === JSON.stringify(["example/ticket"]))).toBe(true)
    // The caller's interruption ends it without a decision.
    const fiber = Effect.runFork(Gate.run(g("hang"), req, { name: "f", timeout: "forever" }))
    await Effect.runPromise(Effect.sleep(5))
    const exit = await Effect.runPromise(Fiber.interrupt(fiber).pipe(Effect.andThen(Fiber.await(fiber))))
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it("check 81: Gate.all — in order, first refusal wins with the piece name, a deferral yields to a later refusal; empty list is a defect", async () => {
    const order: Array<string> = []
    const piece = (name: string, d: GateDecision<OperationRequest>) => ({ name, timeout: 50, gate: { decide: () => Effect.sync(() => { order.push(name); return d }) } })
    const draft = { draftId: "d", requests: [req], expected: [] }
    const a = await Effect.runPromise(Gate.all([piece("sig", { _tag: "Allow" }), piece("approval", { _tag: "Defer", draft }), piece("ent", { _tag: "Refuse", reason: "lapsed" }), piece("never", { _tag: "Allow" })]).decide(req, { annotations: Annotations.empty }))
    expect(a).toEqual({ _tag: "Refuse", reason: "ent: lapsed" })
    expect(order).toEqual(["sig", "approval", "ent"])
    const b = await Effect.runPromise(Gate.all([piece("approval", { _tag: "Defer", draft }), piece("x", { _tag: "Allow" })]).decide(req, { annotations: Annotations.empty }))
    expect(b._tag).toBe("Defer")
    expect(() => Gate.all([])).toThrow()
    const check = await Effect.runPromise(Draft.check({ draftId: "d", requests: [1], expected: [{ key: "a", version: "1" }, { key: "b", version: "2" }, { key: "c", version: "3" }] },
      (k) => Effect.succeed(k === "a" ? Option.some("1") : k === "b" ? Option.some("9") : Option.none())))
    expect(check).toEqual({ _tag: "Stale", mismatches: [{ key: "b", expected: "2", actual: Option.some("9") }, { key: "c", expected: "3", actual: Option.none() }] })
  })

  it("check 82: fromGate maps Defer to OperationRejected with the defer reason and one rejected record; asGate never defers", async () => {
    const { records, sink } = memorySink()
    const gate = fromGate({ decide: () => Effect.succeed({ _tag: "Defer", draft: { draftId: "d", requests: [req], expected: [] } }) }, { deferReason: (d) => `awaiting approval ${d.draftId}` })
    await run((host) => Effect.gen(function* () {
      const e = errorOf(yield* Effect.exit(host.install(reportsDef(), as())))
      expect(e).toMatchObject({ _tag: "OperationRejected", reason: "awaiting approval d" })
      yield* settleWriter
      expect(records.map((r) => [r.operation, r.phase, r.error?.message])).toEqual([["install", "rejected", "awaiting approval d"]])
      expect(yield* stateIn(host, "reports")).toBe("uninstalled")
    }), { sink, gate })
    const back = await Effect.runPromise(asGate(gate).decide(req, { annotations: Annotations.empty }))
    expect(back).toEqual({ _tag: "Refuse", reason: "awaiting approval d" })
  })
})

describe("P7 core 33: Actor.narrow (check 86, partial)", () => {
  it("check 86: narrow at every depth, refuses invalid input and reserved actors; isWithin recognises the actor and its narrowings only", () => {
    const user = { id: "u-1042", kind: "user" as const }
    const sub = narrow(user, "task-7f3a", "Research sub-agent")
    expect(sub).toEqual({ id: "u-1042/task-7f3a", kind: "service", display: "Research sub-agent" })
    const subsub = narrow(sub, "step-2")
    expect(subsub).toEqual({ id: "u-1042/task-7f3a/step-2", kind: "service" })
    expect(() => narrow(user, "")).toThrow(); expect(() => narrow(user, "a/b")).toThrow()
    expect(() => narrow(Actor.system, "x")).toThrow(); expect(() => narrow(Actor.unattributed, "x")).toThrow()
    expect([isWithin(user, user), isWithin(sub, user), isWithin(subsub, user), isWithin(user, sub), isWithin({ id: "u-10420", kind: "user" }, user)]).toEqual([true, true, true, false, false])
    // Finding G-P8: an actor whose own id contains "/" is indistinguishable from a narrowing.
    expect(isWithin({ id: "acme/alice", kind: "user" }, { id: "acme", kind: "user" })).toBe(true)
  })
})

describe("P7 K4/K10: RefusalList, auditDropped, sanitized, buildTimeout (checks 104, 108)", () => {
  let refusedDigest = ""
  const refuse = (digest: string) => ({ refused: (s: { digest: string }) => s.digest === digest || s.digest === refusedDigest ? Option.some("kill switch 7") : Option.none() })
  it("check 104: operator calls of a refused digest fail with refused-digest and one rejected record without the gate; system starts land in disabled", async () => {
    const { records, sink } = memorySink()
    const asked: Array<string> = []
    const gate: OperationGate["Service"] = { authorize: (r) => Effect.sync(() => { asked.push(r.operation) }) }
    const ports = Layer.mergeAll(Layer.succeed(RefusalList, refuse("sha-1")), Layer.succeed(OperationGate, gate), Layer.succeed(AuditSink, sink), Testing.counterIdGenerator("id-"))
    await withHost((host) => Effect.gen(function* () {
      const e = errorOf(yield* Effect.exit(host.install(reportsDef(), as())))
      expect(e).toMatchObject({ _tag: "OperationRejected", reason: "refused-digest: kill switch 7" })
      expect(asked).toEqual([])
      yield* settleWriter
      expect(records.map((r) => [r.operation, r.phase])).toEqual([["install", "rejected"]])
      // A lazy registration whose digest the list refuses later: a trigger lands it in disabled with one start-refused record.
      yield* host.install(lazyReports(Effect.die("never loaded"), { digest: "sha-2" }), as())
      refusedDigest = "sha-2"
      const w = yield* host.wake({ _tag: "OnService", serviceId: "example/Reports" })
      expect(w.triggered).toEqual([])
      expect((yield* host.snapshot).plugins[0]).toMatchObject({ state: "disabled", reason: "refused-digest" })
      yield* settleWriter
      expect(records.slice(1).map((r) => [r.operation, r.phase])).toEqual([["install", "requested"], ["install", "completed"], ["start-refused", "system"]])
      expect(records.at(-1)).toMatchObject({ error: { _tag: "DigestRefused" } })
      expect(records.some((r) => r.operation === "lazy-triggered")).toBe(false)
    }), undefined, ports)
  })

  it("check 108: auditDropped on every record; a lone surrogate is replaced on the gate request and records with sanitized; controls report buildTimeout", async () => {
    const { records, sink } = memorySink()
    const asked: Array<OperationRequest> = []
    const gate: OperationGate["Service"] = { authorize: (r) => Effect.sync(() => { asked.push(r) }) }
    await run((host) => Effect.gen(function* () {
      yield* host.install(reportsDef(), { context: { actor: { id: "user-\uD800x", kind: "user" }, reason: "fix \uDC00" } })
      yield* settleWriter
      expect(asked[0]!.actor.id).toBe("user-�x")
      expect(asked[0]!.reason).toBe("fix �")
      expect(records.every((r) => r.auditDropped === 0)).toBe(true)
      expect(records.filter((r) => r.operation === "install").every((r) => r.sanitized === true && r.actor.id === "user-�x")).toBe(true)
      expect((yield* host.controls).buildTimeout).toBe(1234)
    }), { sink, gate, options: { buildTimeout: 1234 } })
  })
})
void define; void idle; void drive
type _A = AnyPlugin
