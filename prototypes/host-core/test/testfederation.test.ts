// Two and three hosts in one scope: an export served by one host, imported by another into its own peer realm (BEH-FD-022, 025-029, 033, 045).
import { Context, Effect, Layer, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract, at } from "../src/contract.js"
import { FenceTable, peerRealmId } from "../src/federation.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { importFrom, make } from "../src/testfederation.js"
import { as } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"
import { Effect as E } from "effect"
import { Scope } from "effect"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const board = Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String }) } })
const provider = (tag: string) => define({ id: "boards", requires: [] as const, provides: [at(board, "1.2.0", { methods: ["post"] })] as const,
  build: Layer.succeed(board.contractKey as never, { post: (s: string) => Effect.succeed(`${tag}:${s}`) } as never) as never }) as unknown as AnyPlugin
const scoped = <A>(f: () => Effect.Effect<A, unknown, Scope.Scope>) => E.runPromise(E.scoped(f()))
const until = (host: { step: Effect.Effect<boolean> }, cond: Effect.Effect<boolean>) => Effect.gen(function* () { for (let i = 0; i < 1000; i++) { while (yield* host.step) { /* drain */ } if (yield* cond) return true; yield* Effect.sleep(5) } return false })
const callThrough = (host: Parameters<typeof drive>[0], realm: string, arg: string) => Effect.gen(function* () {
  const f = yield* Effect.forkChild(host.use(board.contractKey as never, (svc: { post: (s: string) => Effect.Effect<string> }) => svc.post(arg), { realm } as never))
  yield* until(host, Effect.sync(() => f.pollUnsafe() !== undefined))
  return JSON.stringify(f.pollUnsafe())
})

describe("TestFederation", () => {
  it("serves an export from one host and imports it into another host's peer realm; two peers exporting one key coexist in their own realms", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["hubA", "hubB", "term"])
      for (const [n, tag] of [["hubA", "A"], ["hubB", "B"]] as const) { yield* drive(fed.host(n), fed.host(n).install(provider(tag), as())) }
      const term = fed.host("term"); const fences = new FenceTable()
      for (const peer of ["hubA", "hubB"]) {
        const out = yield* drive(term, importFrom(term, fences, [], { peer, key: board.descriptor.serviceId, major: 1 }, { contract: board, accepts: "^1.2", dial: fed.exportTo(peer, board, "1.2.0"), attribution: as() }))
        expect(out).toEqual({ installed: peerRealmId(peer, board.descriptor.serviceId, 1) })
      }
      const ra = peerRealmId("hubA", board.descriptor.serviceId, 1), rb = peerRealmId("hubB", board.descriptor.serviceId, 1)
      expect(yield* until(term, Effect.map(callThrough(term, ra, "x"), (r) => r.includes("A:x")))).toBe(true)
      expect(yield* callThrough(term, rb, "y")).toContain("B:y")
    }))
  }, 30000)
  it("refuses an import before any connection: a killed digest, a residency the peer does not declare, a stale fence, a conflicting fence", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["hub", "term"]); const term = fed.host("term"); const fences = new FenceTable()
      const base = { peer: "hub", key: board.descriptor.serviceId, major: 1 }
      const o = { contract: board, accepts: "^1.2", dial: Effect.die("never dialled") as never, attribution: as() }
      expect(yield* drive(term, importFrom(term, fences, [{ digest: "bad" }], { ...base, digest: "bad" }, o))).toEqual({ refused: "killed" })
      expect(yield* drive(term, importFrom(term, fences, [], { ...base, residency: ["eu"] }, o))).toEqual({ refused: "peer-residency-missing" })
      expect(yield* drive(term, importFrom(term, fences, [], { ...base, residency: ["eu", "gdpr"], peerResidency: ["eu"] }, o))).toEqual({ refused: "placement-refused" })
      fences.see(base.key, { scope: "s", token: 5, owner: "hubA" })
      expect(yield* drive(term, importFrom(term, fences, [], { ...base, fence: { scope: "s", token: 4, owner: "hubB" } }, o))).toMatchObject({ refused: { outcome: "StaleExport", highest: 5 } })
      expect(yield* drive(term, importFrom(term, fences, [], { ...base, fence: { scope: "s", token: 5, owner: "hubB" } }, o))).toMatchObject({ refused: { outcome: "ExportConflict", owners: ["hubA", "hubB"] } })
      expect((yield* idle(term).pipe(Effect.as(0)))).toBe(0)
      expect((yield* term.snapshot).plugins.filter((p) => p.id.startsWith("import:"))).toEqual([])          // nothing installed
    }))
  })
  it("an import answers calls through its peer realm and, once removed, its realm is retired", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["hub", "term"]); const hub = fed.host("hub"), term = fed.host("term")
      yield* drive(hub, hub.install(provider("H"), as()))
      const realm = peerRealmId("hub", board.descriptor.serviceId, 1)
      let dials = 0
      const dial = Effect.suspend(() => ++dials === 1 ? fed.exportTo("hub", board, "1.2.0") : Effect.never as never)           // the second dial never completes: the link stays down
      yield* drive(term, importFrom(term, new FenceTable(), [], { peer: "hub", key: board.descriptor.serviceId, major: 1 }, { contract: board, accepts: "^1.2", dial, attribution: as(), heartbeat: { every: 30, missed: 2 }, backoff: 20 }))
      expect(yield* until(term, Effect.map(callThrough(term, realm, "a"), (r) => r.includes("H:a")))).toBe(true)
      yield* drive(term, term.remove({ id: `import:hub:${board.descriptor.serviceId}`, realm }, as()))
      yield* idle(term)
      expect(yield* drive(term, (term as never as { retireRealm: (id: string, o?: unknown) => Effect.Effect<unknown, unknown> }).retireRealm(realm, as()).pipe(Effect.as("retired")))).toBe("retired")
    }))
  }, 30000)
})
void Layer
