// P7 second pass: CapabilityPolicy, grants, CallLog, annotations, correlation, CallerContext (core 29, 30, 22;
// checks 71–73, 75, 76, 106, 107, 110, 111). Prototype; evidences no requirement.
import { Context, Effect, Exit, Fiber, Layer, Option, PubSub, Schema, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Annotation, Annotations, CurrentAnnotations } from "../src/annotations.js"
import { Event, Events } from "../src/bus.js"
import { OperationGate, type OperationRequest } from "../src/gxp.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import {
  CallLog, CallerContext, CapabilityPolicy, CurrentCall, CurrentCorrelation, CurrentPlugin, Grant, PrincipalRefCodec, ResolutionRefused,
  type CallEntry, type ResolutionRequest, type ResolveAgain
} from "../src/policy.js"
import { PluginRuntime } from "../src/runtime.js"
import { drive, idle } from "./fixtures.js"
import { as, settleWriter, stateIn } from "./p4fixtures.js"
import { onHost, rec } from "./p7fixtures.js"

class Boom extends Schema.TaggedError<Boom>()("Boom", {}) {}
class Bank extends Context.Service<Bank, { readonly balance: Effect.Effect<number>; readonly withdraw: (n: number) => Effect.Effect<number>; readonly fail: Effect.Effect<never, Boom> }>()("example/Bank") {}
const bank = define({ id: "bank", requires: [] as const, provides: [Bank] as const, meta: { version: "1", digest: "bank-1" },
  build: Layer.succeed(Bank, { balance: Effect.succeed(10), withdraw: (n) => Effect.succeed(10 - n), fail: Effect.fail(new Boom()) }) }) as unknown as AnyPlugin
const user = (id: string, body: (b: Bank["Service"]) => Effect.Effect<void, unknown, any> = () => Effect.void, extra: Partial<AnyPlugin> = {}) => define({ id, requires: [Bank] as const, provides: [] as const,
  build: Layer.effectDiscard(Effect.gen(function* () { yield* body(yield* Bank) })) as never, ...extra }) as unknown as AnyPlugin
const policy = (decide: (r: ResolutionRequest) => Effect.Effect<ReturnType<typeof Grant.all>, ResolutionRefused>, changes?: Stream.Stream<ResolveAgain>) => {
  const asked: Array<ResolutionRequest> = []
  return { asked, layer: Layer.succeed(CapabilityPolicy, { resolve: (r) => Effect.suspend(() => { asked.push(r); return decide(r) }), ...(changes ? { changes } : {}) }) }
}
const memLog = (o: { select?: CallLog["Service"]["select"]; record?: (e: CallEntry) => Effect.Effect<void>; onFailure?: "drop" | "refuse"; queue?: number } = {}) => {
  const entries: Array<CallEntry> = []
  return { entries, layer: Layer.succeed(CallLog, { select: o.select ?? (() => true), record: o.record ?? ((e) => Effect.sync(() => { entries.push(e) })), ...(o.onFailure ? { onFailure: o.onFailure } : {}), ...(o.queue ? { queue: o.queue } : {}) }) }
}
const failsWith = (e: Exit.Exit<unknown, unknown>, tag: string) => Exit.isFailure(e) && JSON.stringify(e.cause).includes(tag)

describe("P7 core 29: CapabilityPolicy and grants (checks 71, 72, 111)", () => {
  it("check 71: consulted once per capture on every route, never cached; refusals by route; a dying or slow policy is a refusal", async () => {
    const p = policy((r) => r.consumer.kind === "plugin" && r.consumer.pluginId === "denied" || (r.consumer.kind === "application" && r.route === "lease")
      ? Effect.fail(new ResolutionRefused({ serviceId: r.serviceId, consumer: "x", reason: "no" })) : Effect.succeed(Grant.all(Bank)))
    const optSeen: Array<string> = []
    const optional = define({ id: "denied", requires: [] as const, provides: [] as const, optional: [Bank] as never, build: Layer.effectDiscard(Effect.gen(function* () {
      const rt = yield* PluginRuntime
      optSeen.push(Option.isSome(yield* rt.optional(Bank)) ? "some" : "none")
      yield* rt.whenAvailable([Bank] as const, () => Effect.sync(() => { optSeen.push("ran") }))
    })) }) as unknown as AnyPlugin
    await onHost((host) => Effect.gen(function* () {
      const events: Array<string> = []
      yield* Effect.forkScoped(host.events.pipe(Stream.runForEach((e) => Effect.sync(() => { events.push(e.type) }))))
      yield* Effect.yieldNow
      yield* host.install(bank, as())
      yield* host.install(user("ok"), as())
      yield* host.install(define({ ...(user("denied") as object), id: "denied" } as never) as AnyPlugin, as()).pipe(Effect.ignore)
      yield* idle(host)
      expect(yield* stateIn(host, "ok")).toBe("active")
      const d = (yield* host.snapshot).plugins.find((x) => x.id === "denied") as { state: string; failure?: { phase: string; message: string } }
      expect(d).toMatchObject({ state: "failed", failure: { phase: "activation" } })
      yield* drive(host, host.remove("denied", as()))
      yield* host.install(optional, as()); yield* idle(host); yield* Effect.sleep(5)
      expect(optSeen).toEqual(["none"])                                           // optional none, whenAvailable held back
      expect(events.filter((t) => t === "resolution-refused").length).toBe(2)
      const n = p.asked.length
      expect(yield* host.use(Bank, (b) => b.balance)).toBe(10)
      expect(yield* host.use(Bank, (b) => b.balance)).toBe(10)
      expect(p.asked.length).toBe(n + 2)                                         // never cached
      expect(p.asked.slice(n).map((r) => r.route)).toEqual(["use", "use"])
      expect(failsWith(yield* Effect.exit(Effect.scoped(host.lease([Bank] as const))), "ResolutionRefused")).toBe(true)
      expect((yield* host.inspect("bank")).leases).toBe(0)                      // the lease is released
    }), { layers: [p.layer] })
    for (const bad of [Effect.die("x"), Effect.never]) {
      await onHost((host) => Effect.gen(function* () {
        yield* host.install(bank, as()); yield* idle(host)
        expect(failsWith(yield* Effect.exit(host.use(Bank, (b) => b.balance)), "ResolutionRefused")).toBe(true)
      }), { layers: [policy(() => bad as never).layer], options: { resolutionTimeout: 20 } })
    }
  })

  it("check 72: a grant naming members — ungranted members die CapabilityDenied; Grant.all adds no layer; leases unaffected", async () => {
    let raw: unknown
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()); yield* idle(host)
      raw = yield* host.use(Bank, (b) => Effect.succeed(b))
      const e = yield* Effect.exit(host.use(Bank, (b) => b.withdraw(1)))
      expect(Exit.isFailure(e) && JSON.stringify(Exit.isFailure(e) ? e.cause : "")).toBeTruthy()
      expect(failsWith(e, "CapabilityDenied") || (Exit.isFailure(e) && String((e.cause as any)?.reasons?.[0]?.defect?.message).includes("CapabilityDenied"))).toBe(true)
      expect(yield* host.use(Bank, (b) => b.balance)).toBe(10)
      expect((yield* host.inspect("bank")).leases).toBe(0)
    }), { layers: [policy(() => Effect.succeed(Grant.of(Bank, { methods: ["balance"] }))).layer] })
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()); yield* idle(host)
      const a = yield* host.use(Bank, (b) => Effect.succeed(b)), b2 = yield* host.use(Bank, (b) => Effect.succeed(b))
      expect(a).toBe(b2)                                                        // no layer: the provider's own object
    }), { layers: [policy(() => Effect.succeed(Grant.all(Bank))).layer] })
    expect(raw).toBeDefined()
  })

  it("check 111: changes re-resolves live captures, narrowing later calls without changing plugin state", async () => {
    const changes = Effect.runSync(PubSub.unbounded<ResolveAgain>())
    let narrow = false
    const results: Array<string> = []
    const p = policy(() => Effect.succeed(narrow ? Grant.of(Bank, { methods: ["balance"] }) : Grant.all(Bank)), Stream.fromPubSub(changes))
    const holder = user("holder", (b) => Effect.gen(function* () {
      const rt = yield* PluginRuntime
      yield* rt.background("caller", Effect.forever(Effect.gen(function* () {
        const r = yield* Effect.exit(b.withdraw(1))
        results.push(Exit.isSuccess(r) ? "ok" : "denied")
        yield* Effect.sleep(5)
      })), { onFailure: "ignore" })
    }))
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()); yield* host.install(holder, as()); yield* idle(host)
      yield* Effect.sleep(15)
      narrow = true
      yield* PubSub.publish(changes, { consumers: ["plugin:holder@default"] })
      yield* Effect.sleep(20)
      expect(results[0]).toBe("ok")
      expect(results.at(-1)).toBe("denied")
      expect(yield* stateIn(host, "holder")).toBe("active")
    }), { layers: [p.layer] })
  })
})

describe("P7 core 29: CallLog (checks 73, 107, 110)", () => {
  it("check 73: one entry per call, denied ones included, with Clock timing, actor and principal, no arguments or results; CurrentCall only around intercepted calls; a provided one dies", async () => {
    const log = memLog()
    const inside: Array<string> = []
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "bank", requires: [] as const, provides: [Bank] as const, build: Layer.succeed(Bank, {
        balance: Effect.map(CurrentCall.get, (c) => { inside.push(Option.isSome(c) ? c.value.member : "none"); return 10 }), withdraw: (n) => Effect.succeed(n * 1000 + 7), fail: Effect.fail(new Boom()) }) }) as unknown as AnyPlugin, as())
      yield* host.install(user("spender", (b) => Effect.gen(function* () { yield* b.balance; yield* b.withdraw(3); yield* Effect.exit(b.fail) })), as())
      yield* idle(host)
      yield* Effect.sleep(5)
      expect(log.entries.map((e) => [e.kind, e.member, e.outcome, e.consumer.kind])).toEqual([["call", "balance", "success", "plugin"], ["call", "withdraw", "success", "plugin"], ["call", "fail", "failure", "plugin"]])
      expect(log.entries[2]!.errorTag).toBe("Boom")
      expect(log.entries.every((e) => e.origin === "core" && typeof e.durationMs === "number" && e.startedAt.endsWith("Z"))).toBe(true)
      expect(JSON.stringify(log.entries)).not.toContain("3007")
      expect(inside).toEqual(["balance"])
      expect(Option.isNone(yield* CurrentCall.get)).toBe(true)
      const forged = yield* Effect.exit(CurrentCall.get.pipe(Effect.provideService(CurrentCall.reference, Option.some({ callId: "x" } as never))))
      expect(failsWith(forged, "PrincipalForged")).toBe(true)
    }), { layers: [log.layer] })
  })

  it("check 107: drop and refuse, a bounded queue, CallLogUnavailable, counters; a failing record changes no outcome and is counted", async () => {
    // CCR-BR-029 (G-P18): under "refuse" the call waits for its record; a record that never finishes holds the one
    // slot, so a concurrent call is refused "queue-full" before its member runs, and the waiting call dies
    // "record-timeout" without delivering its value.
    const slow = memLog({ record: () => Effect.never, queue: 1, onFailure: "refuse" })
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()); yield* idle(host)
      const first = yield* Effect.forkChild(Effect.exit(host.use(Bank, (b) => b.balance)))
      yield* Effect.sleep(5)
      const second = yield* Effect.exit(host.use(Bank, (b) => b.balance))
      expect(failsWith(second, "queue-full")).toBe(true)
      const one = yield* Fiber.join(first)
      expect(failsWith(one, "record-timeout")).toBe(true)
      const c = (yield* host.controls).callLog!
      expect(c).toMatchObject({ onFailure: "refuse", queue: 1 })
      expect(c.refused).toBe(2)
    }), { layers: [slow.layer], options: { callLogTimeout: 30 } })
    const dropping = memLog({ record: () => Effect.die("sink down"), select: () => "drop" })
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()); yield* idle(host)
      expect(yield* host.use(Bank, (b) => b.balance)).toBe(10)
      yield* Effect.sleep(5)
      expect((yield* host.controls).callLog!.failed).toBe(1)
    }), { layers: [dropping.layer] })
  })

  it("check 110: offerCallEntry validates and queues entries of the other kinds; PrincipalRef encoding round-trips exactly", async () => {
    const log = memLog()
    await onHost((host) => Effect.gen(function* () {
      yield* host.offerCallEntry({ kind: "crossing", companion: "@bridger/remote", serviceId: "example/Bank@1", member: "balance", outcome: "success", crossing: { direction: "outbound", link: "l1" } })
      expect(failsWith(yield* Effect.exit(host.offerCallEntry({ kind: "call" as never, companion: "x", serviceId: "s", outcome: "success" })), "InvalidCallEntry")).toBe(true)
      expect(failsWith(yield* Effect.exit(host.offerCallEntry({ kind: "refusal", companion: "", serviceId: "s", outcome: "refused", refusal: { stage: "boundary", reason: "r" } })), "InvalidCallEntry")).toBe(true)
      yield* Effect.sleep(5)
      expect(log.entries.map((e) => [e.kind, e.origin])).toEqual([["crossing", { companion: "@bridger/remote" }]])
    }), { layers: [log.layer] })
    const ref = { id: "a/b;c", realm: "default", digest: "sha:1", revision: 7 }
    const enc = PrincipalRefCodec.encode(ref)
    expect(enc).toBe("p1;a%2Fb%3Bc;default;;sha%3A1;7")
    expect(PrincipalRefCodec.decode(enc)).toEqual(Option.some(ref))
    for (const bad of ["p2;a;b;;;1", "p1;a;b;;;-1", "p1;;b;;;1", "p1;a;b;;1", "p1;a;b;;;01"]) expect(PrincipalRefCodec.decode(bad)).toEqual(Option.none())
  })
})

describe("P7 core 30/22: annotations, correlation, CallerContext (checks 75, 76, 106)", () => {
  const Ticket = Annotation.key<string>("example/ticket", { schema: Schema.String, combine: (_a, b) => b, monotonic: false, flows: ["gate", "audit", "callLog"] })
  const Private = Annotation.key<string>("example/private", { schema: Schema.String, combine: (_a, b) => b, monotonic: false, flows: ["policy"] })
  const Ev = Annotation.key<string>("example/ev", { schema: Schema.String, combine: (_a, b) => b, monotonic: false, flows: ["events"] })
  const Weird = Annotation.key<bigint>("example/weird", { schema: Schema.Number as never, combine: (_a, b) => b, monotonic: false, flows: ["audit"] })
  const withAnn = <A, E, R>(e: Effect.Effect<A, E, R>) => e.pipe(Annotation.add(Ticket, "T-7"), Annotation.add(Private, "p"), Annotation.add(Ev, "e"))
  it("check 75: a provider sees its caller's annotations; builds start empty; listeners see only events keys; the gate only gate keys; a Deadline shortens use with a timeout and the gate, not use without one", async () => {
    const requests: Array<OperationRequest> = []
    const gate: OperationGate["Service"] = { authorize: (r) => Effect.sync(() => { requests.push(r) }) }
    const seen: Record<string, unknown> = {}
    const Ping = Event.make<[], void>()("x/ping")
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "bank", requires: [Events] as const, provides: [Bank] as const, build: Layer.effect(Bank, Effect.gen(function* () {
        seen.build = (yield* Annotation.current).keys
        yield* (yield* Events).on(Ping, () => Effect.map(Annotation.current, (a) => { seen.listener = a.keys }))
        return { balance: Effect.map(Annotation.current, (a) => { seen.provider = a.keys; return 1 }), withdraw: () => Effect.sleep(50).pipe(Effect.as(0)), fail: Effect.fail(new Boom()) }
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host)
      yield* withAnn(Effect.gen(function* () {
        yield* host.use(Bank, (b) => b.balance)
        yield* host.use(Events, (bus) => bus.emit(Ping))
        yield* drive(host, host.disable("bank", as())).pipe(Effect.ignore)
      }))
      yield* Effect.sleep(5)
      expect(seen.build).toEqual([])
      expect(seen.provider).toEqual(["example/ev", "example/private", "example/ticket"])
      expect(seen.listener).toEqual(["example/ev"])
      expect(Annotations.isBag(requests.at(-1)!.annotations) && (requests.at(-1)!.annotations as { keys: Array<string> }).keys).toEqual(["example/ticket"])
    }), { gate })
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()); yield* host.install(define({ id: "slowbank", requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin, as())
      yield* idle(host)
      const soon = Annotation.add(Annotation.Deadline, { at: Date.now() + 10 })
      const t = yield* Effect.exit(host.use(Bank, () => Effect.sleep(60), { timeout: 1000 }).pipe(soon))
      expect(failsWith(t, "LeaseTimeout")).toBe(true)
      expect(Exit.isSuccess(yield* Effect.exit(host.use(Bank, () => Effect.sleep(30)).pipe(Annotation.add(Annotation.Deadline, { at: Date.now() + 5 }))))).toBe(true)
    }))
  })

  it("check 75: a call served inside CallerContext.serve sees the invoker's actor, annotations and correlation and keeps the contributor's principal; a nested host call records both", async () => {
    const { records, sink } = rec()
    let handler: ((ctx: Parameters<typeof CallerContext.serve>[0]) => Effect.Effect<void, unknown>) | undefined
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "contrib", requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.gen(function* () {
        const ctxAtBuild = yield* Effect.context<never>()
        handler = (ctx) => CallerContext.serve(ctx)(Effect.gen(function* () {
          yield* host.install(define({ id: "nested", requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin)
        })).pipe(Effect.provideContext(ctxAtBuild))
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host)
      const ctx = yield* CallerContext.current.pipe(Effect.provideService(CurrentAnnotations, Annotations.add(Annotations.empty, Ticket, "T-9")), CurrentCorrelation.with("corr-inv"))
      yield* handler!({ ...ctx, actor: { id: "user-invoker", kind: "user" } })
      yield* settleWriter
      const nested = records.filter((r) => r.target?.id === "nested" && r.operation === "install")
      expect(nested[0]).toMatchObject({ actor: { id: "user-invoker" }, correlationId: "corr-inv", onBehalfOf: { id: "contrib" }, annotations: [{ key: "example/ticket", value: "T-9" }] })
    }), { sink })
  })

  it("check 76: mutating records carry the audit keys, encoded, sorted and equal on every record; system records none; an unencodable value is omitted and named; reconcile entries carry the parent's; call-log entries carry callLog keys", async () => {
    const { records, sink } = rec()
    const log = memLog()
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(bank, as()).pipe(Annotation.add(Ticket, "T-1"), Annotation.add(Weird, 10n))
      yield* idle(host)
      yield* host.reconcile([{ id: "r1", plugin: define({ id: "r1", requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin }], { ...as(), scope: "s" }).pipe(Annotation.add(Ticket, "T-2"), (e) => drive(host, e))
      yield* host.use(Bank, (b) => b.balance).pipe(Annotation.add(Ticket, "T-3"))
      yield* settleWriter
      const inst = records.filter((r) => r.target?.id === "bank" && r.phase !== "system")
      expect(inst.every((r) => JSON.stringify(r.annotations) === JSON.stringify([{ key: "example/ticket", value: "T-1" }]))).toBe(true)
      expect(inst.every((r) => JSON.stringify(r.annotationsOmitted) === JSON.stringify(["example/weird"]))).toBe(true)
      expect(records.filter((r) => r.phase === "system").every((r) => r.annotations === undefined)).toBe(true)
      expect(records.filter((r) => r.target?.id === "r1" && r.phase !== "system").every((r) => r.annotations?.[0]?.value === "T-2")).toBe(true)
      yield* Effect.sleep(5)
      expect(log.entries.at(-1)!.annotations).toEqual([{ key: "example/ticket", value: "T-3" }])
      expect(JSON.stringify(yield* host.snapshot)).not.toContain("T-1")
    }), { sink, layers: [log.layer] })
  })

  it("check 106: CurrentCorrelation — context, else fiber, else generated; listeners follow; call entries and root system records carry it", async () => {
    const { records, sink } = rec()
    const log = memLog()
    const heard: Array<Option.Option<string>> = []
    const Ping = Event.make<[], void>()("x/ping2")
    await onHost((host) => Effect.gen(function* () {
      yield* host.install(define({ id: "bank", requires: [Events] as const, provides: [Bank] as const, build: Layer.effect(Bank, Effect.gen(function* () {
        yield* (yield* Events).on(Ping, () => Effect.map(CurrentCorrelation.get, (c) => { heard.push(c) }))
        return { balance: Effect.succeed(1), withdraw: () => Effect.succeed(0), fail: Effect.fail(new Boom()) }
      })) }) as unknown as AnyPlugin, as())
      yield* idle(host)
      yield* drive(host, host.disable("bank", as())).pipe(CurrentCorrelation.with("fiber-c"))
      yield* drive(host, host.enable("bank", { context: { ...as().context, correlationId: "ctx-c" } })).pipe(CurrentCorrelation.with("fiber-c"))
      yield* idle(host)
      yield* host.use(Events, (bus) => bus.emit(Ping)).pipe(CurrentCorrelation.with("emit-c"))
      yield* host.use(Bank, (b) => b.balance).pipe(CurrentCorrelation.with("use-c"))
      yield* settleWriter
      expect(records.filter((r) => r.operation === "disable").every((r) => r.correlationId === "fiber-c")).toBe(true)
      expect(records.filter((r) => r.operation === "enable").every((r) => r.correlationId === "ctx-c")).toBe(true)
      expect(heard).toEqual([Option.some("emit-c")])
      expect(log.entries.find((e) => e.member === "balance")!.correlationId).toBe("use-c")
      expect(Option.isNone(yield* CurrentCorrelation.get)).toBe(true)
    }), { sink, layers: [log.layer] })
  })
})
void Fiber
