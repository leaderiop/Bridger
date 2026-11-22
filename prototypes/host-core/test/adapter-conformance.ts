// The ten framework-neutral scenarios every UI adapter runs (improvement report 05 R9, DX-08;
// references/kit/appendices/c-ui-adapter-scenarios.md). An adapter's test imports `scenarios` and supplies `make`.
import { Context, Effect, Exit, Option, Stream, type Scope } from "effect"
import { expect } from "vitest"
import type { Client } from "../src/adapter.js"
import type { Host } from "../src/host.js"
import { definePlugin } from "../src/kit.js"
import type { AnyPlugin } from "../src/plugin.js"
import type * as Testing from "../src/testing.js"
import { drive, idle } from "./fixtures.js"
import { as } from "./p4fixtures.js"

export class Audit extends Context.Service<Audit, { readonly record: (e: string) => Effect.Effect<void> }>()("example/Audit") {}
export const audit = definePlugin({ id: "example/audit", provides: Audit, make: Effect.succeed({ record: (_e: string) => Effect.void }) }) as unknown as AnyPlugin

export interface Harness {
  readonly host: Testing.TestHost
  /** Creates the adapter's client over a host; the list passes a wrapper of the host to count its subscriptions. */
  readonly make: (host: Pick<Host, "changes" | "use">) => Effect.Effect<Client, never, Scope.Scope>
}
export interface Scenario { readonly id: string; readonly title: string; readonly behaviour: string; readonly run: (h: Harness) => Effect.Effect<void, unknown, Scope.Scope> }

const wait = (h: Harness, c: Client, pred: (n: number) => boolean) => Effect.gen(function* () {
  for (let i = 0; i < 50; i++) {
    yield* idle(h.host); yield* Effect.yieldNow
    const s = yield* c.snapshot
    if (Option.isSome(s) && pred(s.value.revision)) return
  }
})
const stateNow = (c: Client, id: string) => c.pluginState(id)
const settled = (h: Harness, c: Client, id: string, state: string) => Effect.gen(function* () {
  for (let i = 0; i < 50; i++) { yield* idle(h.host); yield* Effect.yieldNow; if ((yield* stateNow(c, id)) === state) return }
})

export const scenarios: ReadonlyArray<Scenario> = [
  { id: "A1", title: "no snapshot before the first one; an empty snapshot is a snapshot", behaviour: "core 04 BEH-BR-028; FoldKit 'Model'",
    run: (h) => Effect.gen(function* () {
      const never_ = { changes: Stream.never, use: h.host.use } as unknown as Pick<Host, "changes" | "use">
      expect(Option.isNone(yield* (yield* h.make(never_)).snapshot)).toBe(true)
      const c = yield* h.make(h.host); yield* wait(h, c, () => true)
      const s = yield* c.snapshot
      expect(Option.isSome(s) && s.value.plugins.length === 0).toBe(true)
    }) },
  { id: "A2", title: "pluginState is a lifecycle state, or uninstalled", behaviour: "FoldKit pluginState; REACT 'Observe plugin lifecycle'",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host); yield* wait(h, c, () => true)
      expect(yield* c.pluginState("example/audit")).toBe("uninstalled")
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      expect(yield* c.pluginState("example/audit")).toBe("active")
    }) },
  { id: "A3", title: "isAvailable is true only while an active provider exists", behaviour: "FoldKit isAvailable; REACT record.available",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host); yield* wait(h, c, () => true)
      expect(yield* c.isAvailable("example/Audit")).toBe(false)
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      expect(yield* c.isAvailable("example/Audit")).toBe(true)
      yield* drive(h.host, h.host.remove("example/audit", as())); yield* settled(h, c, "example/audit", "uninstalled")
      expect(yield* c.isAvailable("example/Audit")).toBe(false)
    }) },
  { id: "A4", title: "availability is a hint: a call after removal fails typed, not as a crash", behaviour: "FoldKit 'An availability check does not reserve'; REACT §2",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host)
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      yield* drive(h.host, h.host.remove("example/audit", as())); yield* idle(h.host)
      const exit = yield* Effect.exit(c.use(Audit, (a) => a.record("x")))
      expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain("ServiceUnavailable")
    }) },
  { id: "A5", title: "a call under the client runs the service and returns its result", behaviour: "REACT §2; FoldKit 'Call a service in a named Command'",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host)
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      expect(yield* c.use(Audit, (a) => a.record("x").pipe(Effect.as(7)))).toBe(7)
    }) },
  { id: "A6", title: "revisions only increase", behaviour: "FoldKit 'Snapshot and lifecycle contracts'",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host); const seen: Array<number> = []
      yield* Effect.forkScoped(c.changes.pipe(Stream.runForEach((s) => Effect.sync(() => { if (Option.isSome(s)) seen.push(s.value.revision) }))))
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      yield* drive(h.host, h.host.remove("example/audit", as())); yield* idle(h.host); yield* Effect.yieldNow
      expect(seen.length).toBeGreaterThan(1)
      expect(seen.every((n, i) => i === 0 || n >= seen[i - 1]!)).toBe(true)
    }) },
  { id: "A7", title: "after a burst of changes the cached snapshot is the host's latest", behaviour: "FoldKit 'intermediate snapshots can be coalesced; the latest is the state'",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host)
      yield* h.host.install(audit, as()); yield* drive(h.host, h.host.disable("example/audit", as())); yield* drive(h.host, h.host.enable("example/audit", as()))
      yield* settled(h, c, "example/audit", "active")
      const cached = yield* c.snapshot, latest = yield* h.host.snapshot
      expect(Option.isSome(cached) && cached.value.revision).toBe(latest.revision)
    }) },
  { id: "A8", title: "hot install and removal reach existing subscribers without recreating the client", behaviour: "REACT §4; FoldKit §6",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host); let updates = 0
      yield* Effect.forkScoped(c.changes.pipe(Stream.runForEach(() => Effect.sync(() => { updates++ }))))
      yield* Effect.yieldNow
      const before = updates
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      expect(updates).toBeGreaterThan(before)
      expect(yield* c.pluginState("example/audit")).toBe("active")
    }) },
  { id: "A9", title: "dispose is idempotent and refuses later calls, without closing the host", behaviour: "REACT §1 dispose; FoldKit 'Shutdown'",
    run: (h) => Effect.gen(function* () {
      const c = yield* h.make(h.host)
      yield* h.host.install(audit, as()); yield* settled(h, c, "example/audit", "active")
      yield* c.dispose; yield* c.dispose
      expect(Exit.isFailure(yield* Effect.exit(c.use(Audit, (a) => a.record("x"))))).toBe(true)
      expect(yield* h.host.snapshot).toBeDefined()                                  // the host is still there
      expect((yield* h.host.snapshot).plugins.map((p) => p.id)).toContain("example/audit")
    }) },
  { id: "A10", title: "one subscription to the host per client, however many consumers read it", behaviour: "REACT 'Core observation seam'",
    run: (h) => Effect.gen(function* () {
      let subscriptions = 0
      const counted = { changes: Stream.suspend(() => { subscriptions++; return h.host.changes }), use: h.host.use } as unknown as Pick<Host, "changes" | "use">
      const c = yield* h.make(counted)
      yield* Effect.forkScoped(c.changes.pipe(Stream.runDrain)); yield* Effect.forkScoped(c.changes.pipe(Stream.runDrain))
      yield* Effect.yieldNow; yield* c.pluginState("x"); yield* c.isAvailable("y")
      expect(subscriptions).toBe(1)
    }) }
]
