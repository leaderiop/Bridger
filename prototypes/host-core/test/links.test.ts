// Link-up (BEH-FD-017, 018, 043), address dialling, and revocation connected to the federation plugin (BEH-FD-042).
import { Context, Effect, Layer, Schema, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { Contract, at } from "../src/contract.js"
import { memoryState } from "../src/durable.js"
import { FenceTable, ManifestStore, RevocationRelay } from "../src/federation.js"
import { makeFederation, type HostManifest } from "../src/fedplugin.js"
import { dialAddress, linkUp } from "../src/links.js"
import { listen } from "../src/net.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { serveGuest } from "../src/session.js"
import { make } from "../src/testfederation.js"
import { duplex, type PeerOffer } from "../src/wire.js"
import { as } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const board = Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.String, success: Schema.String }) } })
const d = board.descriptor
const key = d.serviceId
const offer = (host: string, o: Partial<PeerOffer> = {}): PeerOffer => ({ host, authority: "auth", protocol: [1, 1], protocolWindow: 1, exports: [], imports: [], ...o })
const exp = { key, major: 1, version: "1.2.0", schemas: d.schemas }
const scoped = <A>(f: () => Effect.Effect<A, unknown, Scope.Scope>) => Effect.runPromise(Effect.scoped(f()))

describe("linkUp", () => {
  it("sends the newest revocation list before the offer, receives the peer's before the answer, and installs only accepted imports", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["hub", "term"]); const term = fed.host("term"); const [a, b] = yield* duplex
      const relayHub = new RevocationRelay(); relayHub.accepted(7, ["bad-digest"], undefined, [])
      const seenByHub: unknown[] = []
      // the hub end: sends its list, then its offer (exporting the board), answers the term's offer
      const hubEnd = Effect.gen(function* () {
        const first = relayHub.onLinkUp("l1"); if (first) yield* b.send(JSON.stringify({ t: "kill", revision: first.revision, list: first.list }))
        yield* b.send(JSON.stringify({ t: "offer", offer: offer("hub", { exports: [exp] }) }))
        const f = JSON.parse(yield* b.receive) as { t: string }; seenByHub.push(f.t)
      })
      yield* Effect.forkChild(hubEnd)
      const base = { key, major: 1, contract: board, accepts: "^1.2" }
      const res = yield* drive(term, linkUp(term, { conn: a, mine: offer("term", { imports: [{ key, version: "1.2.0", methods: d.methods, schemas: d.schemas }, { key: "other/Missing@1", version: "1.0.0" }] }),
        peer: { host: "hub", authority: "auth" }, relay: new RevocationRelay(), linkId: "l1", fences: new FenceTable(), kills: [],
        imports: [base, { ...base, key: "other/Missing@1", contract: board }], dial: () => fed.exportTo("hub", board, "1.2.0"), attribution: as() }))
      expect(res.received).toEqual([{ revision: 7, list: ["bad-digest"] }])
      expect(res.imports.find((i) => i.key === key)!.outcome).toMatchObject({ installed: expect.stringContaining("peer:hub:") })
      expect(res.imports.find((i) => i.key === "other/Missing@1")!.outcome).toMatchObject({ refused: "offer", detail: { accepted: false, reason: "no-export" } })
      expect(seenByHub).toEqual(["offer"])
    }))
  })
  it("sends this end's newest list first on its own link-up, once", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["term"]); const term = fed.host("term"); const [a, b] = yield* duplex
      const relay = new RevocationRelay(); relay.accepted(3, "L3", "other", [])
      yield* Effect.forkChild(Effect.gen(function* () { yield* b.send(JSON.stringify({ t: "offer", offer: offer("hub") })) }))
      yield* drive(term, linkUp(term, { conn: a, mine: offer("term"), peer: { host: "hub", authority: "auth" }, relay, linkId: "l9", fences: new FenceTable(), kills: [], imports: [], dial: () => Effect.die("x") as never, attribution: as() }))
      const frames: string[] = []; for (let i = 0; i < 2; i++) frames.push((JSON.parse(yield* b.receive) as { t: string }).t)
      expect(frames).toEqual(["kill", "offer"])                                    // the list before the offer
      expect(relay.onLinkUp("l9")).toBeUndefined()                                 // not resent
    }))
  })
  it("refuses an incompatible peer without installing anything", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["term"]); const term = fed.host("term"); const [a, b] = yield* duplex
      yield* Effect.forkChild(b.send(JSON.stringify({ t: "offer", offer: offer("impostor") })))
      const res = yield* drive(term, linkUp(term, { conn: a, mine: offer("term"), peer: { host: "hub", authority: "auth" }, relay: new RevocationRelay(), linkId: "l", fences: new FenceTable(), kills: [],
        imports: [{ key, major: 1, contract: board, accepts: "^1.2" }], dial: () => Effect.die("x") as never, attribution: as() }))
      expect(res.agreement).toEqual({ _tag: "IncompatiblePeer", reason: "wrong-host" }); expect(res.imports).toEqual([])
    }))
  })
})

describe("dialAddress", () => {
  it("dials a manifest peer's host:port over TCP and carries a session call", async () => {
    await scoped(() => Effect.gen(function* () {
      const l = yield* listen((c) => serveGuest(c, { wire: [1], served: [{ version: "1.2.0", methods: d.methods, schemas: d.schemas }], maxInFlight: 2, handlers: { post: (p) => Effect.succeed(`tcp:${String(p)}`) } }).pipe(Effect.asVoid))
      const conn = yield* dialAddress(`127.0.0.1:${l.port}`)
      const { openSession } = yield* Effect.promise(() => import("../src/session.js"))
      const s = yield* openSession(conn, { epoch: "x", wire: [1], contract: { id: key, accepts: "^1.2", version: "1.2.0", methods: d.methods, schemas: d.schemas }, heartbeat: { every: 100, missed: 5 } })
      expect("call" in s && (yield* s.call("post", "q"))).toBe("tcp:q")
      yield* l.close
    }))
  })
})

describe("revocation connected to the federation plugin (BEH-FD-042)", () => {
  const plug = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
  it("a revoked digest is removed at once, stays removed at every later apply even when a manifest lists it, and survives a restart", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["h"]); const host = fed.host("h"); const state = memoryState()
      const m = (rev: number): HostManifest => ({ format: "bridger.host-manifest/1", authority: "auth", host: "h", revision: rev, issuedAt: 0, plugins: [{ id: "a", digest: "dA" }, { id: "b", digest: "dB" }] })
      const env = (x: HostManifest) => ({ statementType: "host-manifest", id: JSON.stringify([x.authority, x.host]), version: String(x.revision), payload: JSON.stringify(x), signatures: [] })
      const answers = [{ kind: "manifest" as const, envelope: env(m(1)) }, { kind: "manifest" as const, envelope: env(m(2)) }]
      const f = yield* makeFederation({ authority: "auth", host: "h", source: () => Effect.succeed(answers.shift() ?? { kind: "none" as const }), store: new ManifestStore(), policy: { verify: () => Effect.void }, syncEvery: 100, syncTimeout: 1000,
        reconcile: (dl, op) => drive(host, host.reconcile(dl, { ...as(op.reason), ...(op.scope ? { scope: op.scope } : {}), prune: true } as never)) as never,
        resolver: (g) => Effect.succeed(plug(g === "dA" ? "a" : "b")), now: Effect.succeed(1), freshness: { maxOffline: "forever", skewTolerance: 1 }, firstActivation: 0, state })
      yield* drive(host, f.sync); yield* idle(host)
      yield* drive(host, f.revoke(["dA"])); yield* idle(host)
      expect((yield* host.snapshot).plugins.map((p) => p.id).sort()).toEqual(["b"])
      yield* drive(host, f.sync); yield* idle(host)                                // revision 2 lists "a" again: still revoked
      expect((yield* host.snapshot).plugins.map((p) => p.id).sort()).toEqual(["b"])
      expect((yield* state.read).revoked).toEqual(["dA"])
    }))
  })

  it("with no usable applied manifest a revoked digest still acts, by disabling what the stored manifest lists", async () => {
    await scoped(() => Effect.gen(function* () {
      const fed = yield* make(["h"]); const host = fed.host("h"); const disabled: string[] = []
      const state = memoryState({ pendingKills: [], lastApplied: { envelope: { statementType: "host-manifest", id: "[]", version: "1", payload: "{}", signatures: [] }, acceptedAt: 0, revision: 1, requiresFresh: [], plugins: [{ id: "a", realm: "default", digest: "dA" }] } })
      const f = yield* makeFederation({ authority: "auth", host: "h", source: () => Effect.succeed({ kind: "none" as const }), store: new ManifestStore(), policy: { verify: () => Effect.void }, syncEvery: 100, syncTimeout: 1000,
        reconcile: () => Effect.die("no manifest applied") as never, resolver: () => Effect.die("x") as never, now: Effect.succeed(1), freshness: { maxOffline: "forever", skewTolerance: 1 }, firstActivation: 0, state,
        disable: (ref, why) => Effect.sync(() => { disabled.push(`${ref.id}:${why}`) }) })
      yield* drive(host, f.revoke(["dA"]))
      expect(disabled).toEqual(["a:revoked digest"])
    }))
  })
})
