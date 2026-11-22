// The federation plugin over a real host with an in-memory authority, resolver and signature policy (a TestFederation in miniature).
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ManifestStore } from "../src/federation.js"
import { decodeManifest, makeFederation, projectManifest, type HostManifest, type LocalPatch } from "../src/fedplugin.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import type { Envelope, SyncAnswer } from "../src/sync.js"
import { as, run, stateIn } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const plug = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const catalog: Record<string, AnyPlugin> = { dA: plug("a"), dB: plug("b"), dC: plug("c") }
const manifest = (revision: number, o: Partial<HostManifest> = {}): HostManifest => ({ format: "bridger.host-manifest/1", authority: "auth", host: "h1", revision, issuedAt: 0, plugins: [], ...o })
const envelope = (m: HostManifest): Envelope => ({ statementType: "host-manifest", id: JSON.stringify([m.authority, m.host]), version: String(m.revision), payload: JSON.stringify(m), signatures: ["ok"] })
const resolver = (stale = new Set<string>()) => (digest: string) => stale.has(digest) ? Effect.fail({ reason: "revocation-stale" }) : catalog[digest] ? Effect.succeed(catalog[digest]!) : Effect.fail({ reason: "unknown-digest" })

const rig = (host: Parameters<Parameters<typeof run>[0]>[0], over: { patches?: () => LocalPatch[]; resolver?: ReturnType<typeof resolver>; now?: { t: number }; reasons?: string[] } = {}) => Effect.gen(function* () {
  const answers: SyncAnswer[] = []; const reasons = over.reasons ?? []; const clock = over.now ?? { t: 100 }
  const fed = yield* makeFederation({
    authority: "auth", host: "h1", source: () => Effect.succeed(answers.shift() ?? { kind: "none" }), policy: { verify: () => Effect.void }, store: new ManifestStore(), syncEvery: 100, syncTimeout: 1000,
    reconcile: (d, o) => { reasons.push(o.reason ?? ""); return drive(host, host.reconcile(d, { ...as(o.reason), ...(o.scope ? { scope: o.scope } : {}), ...(o.prune !== undefined ? { prune: o.prune } : {}) } as never)) as never },
    resolver: over.resolver ?? resolver(), patches: over.patches, now: Effect.sync(() => clock.t), freshness: { maxOffline: 1000, skewTolerance: 10 }, firstActivation: 0
  })
  return { fed, answers, reasons, clock, push: (m: HostManifest) => answers.push({ kind: "manifest", envelope: envelope(m) }) }
})

describe("projectManifest", () => {
  it("drops an unresolved entry, and keeps the last definition of one that is pending revocation-stale", async () => {
    const m = manifest(1, { plugins: [{ id: "a", digest: "dA" }, { id: "x", digest: "nope" }] })
    const r = await Effect.runPromise(projectManifest(m, { resolver: resolver(), fresh: true }))
    expect(r.desired.map((d) => d.id)).toEqual(["a"]); expect(r.dropped).toEqual([{ id: "x", reason: "unknown-digest" }])
    const s = await Effect.runPromise(projectManifest(m, { resolver: resolver(new Set(["dA"])), fresh: true }))
    expect(s.desired).toEqual([]); expect(s.pending).toEqual([{ id: "a", reason: "revocation-stale" }])
    const k = await Effect.runPromise(projectManifest(m, { resolver: resolver(new Set(["dA"])), fresh: true, lastResolved: new Map([["a", catalog.dA!]]) }))
    expect(k.desired.map((d) => d.id)).toEqual(["a"]); expect(k.pending).toEqual([{ id: "a", reason: "revocation-stale" }])
  })
  it("lets a patch change only the fields overridable lists, reports the rest, and never adds an entry", async () => {
    const m = manifest(1, { plugins: [{ id: "a", digest: "dA", config: { n: 1 } }], overridable: [{ id: "a", fields: ["config"] }] })
    const patches: LocalPatch[] = [{ id: "a", config: { n: 2 }, disabled: true, actor: "ops" }, { id: "zz", config: 1, actor: "ops" }, { id: "a", plugin: catalog.dB, actor: "ops" }]
    const r = await Effect.runPromise(projectManifest(m, { resolver: resolver(), patches, fresh: true }))
    expect(r.desired).toHaveLength(1); expect(r.desired[0]).toMatchObject({ id: "a", config: { n: 2 } }); expect(r.desired[0]!.disabled).toBeUndefined()
    expect(r.patchReports).toEqual(expect.arrayContaining([{ id: "a", reason: "not-overridable" }, { id: "zz", reason: "not-in-manifest" }, { id: "a", reason: "not-in-manifest" }]))
  })
  it("removes kills last, so a patch cannot resurrect a killed entry; pending kills too", async () => {
    const m = manifest(1, { plugins: [{ id: "a", digest: "dA" }, { id: "b", digest: "dB" }, { id: "c", digest: "dC" }], kill: [{ digest: "dA", reason: "bad" }], overridable: [{ id: "a", fields: ["config"] }] })
    const r = await Effect.runPromise(projectManifest(m, { resolver: resolver(), patches: [{ id: "a", config: 1, actor: "o" }], fresh: true, pendingKills: [{ id: "c" }] }))
    expect(r.desired.map((d) => d.id)).toEqual(["b"])
  })
  it("a stale projection disables exactly the requiresFresh entries", async () => {
    const m = manifest(1, { plugins: [{ id: "a", digest: "dA", requiresFresh: true }, { id: "b", digest: "dB" }] })
    const r = await Effect.runPromise(projectManifest(m, { resolver: resolver(), fresh: false }))
    expect(r.desired.map((d) => [d.id, d.disabled ?? false])).toEqual([["a", true], ["b", false]])
  })
  it("refuses another format and ignores unknown fields", () => {
    expect(decodeManifest({ format: "other/2" })).toEqual({ _tag: "ManifestRejected", reason: "unknown-format" })
    expect((decodeManifest({ ...manifest(1), extra: 1 }) as HostManifest).revision).toBe(1)
  })
})

describe("federation over a host", () => {
  it("applies a synced manifest as one attributed reconcile, then prunes what a newer revision drops, and a kill removes a plugin", async () => {
    await run((host) => Effect.gen(function* () {
      const t = yield* rig(host)
      t.push(manifest(1, { plugins: [{ id: "a", digest: "dA" }, { id: "b", digest: "dB" }] }))
      expect(yield* drive(host, t.fed.sync)).toEqual({ applied: 1 }); yield* idle(host)
      expect([yield* stateIn(host, "a"), yield* stateIn(host, "b")]).toEqual(["active", "active"])
      expect(t.reasons[0]).toMatch(/federation apply revision 1/)
      t.push(manifest(2, { plugins: [{ id: "a", digest: "dA" }, { id: "b", digest: "dB" }], kill: [{ id: "b", reason: "recall" }] }))
      expect(yield* drive(host, t.fed.sync)).toEqual({ applied: 2 }); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("active"); expect(yield* stateIn(host, "b")).toBe("uninstalled")
    }))
  })
  it("refuses a lower revision, and leaves what runs unchanged", async () => {
    await run((host) => Effect.gen(function* () {
      const t = yield* rig(host)
      t.push(manifest(5, { plugins: [{ id: "a", digest: "dA" }] })); yield* drive(host, t.fed.sync); yield* idle(host)
      t.push(manifest(3, { plugins: [] }))
      expect(yield* drive(host, t.fed.sync)).toEqual({ _tag: "ManifestRejected", reason: "stale-revision" }); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("active")
    }))
  })
  it("carries the patch author in the reconcile reason", async () => {
    await run((host) => Effect.gen(function* () {
      const t = yield* rig(host, { patches: () => [{ id: "a", config: undefined, actor: "site-op", disabled: undefined }] })
      t.push(manifest(1, { plugins: [{ id: "a", digest: "dA" }] })); yield* drive(host, t.fed.sync)
      expect(t.reasons[0]).toMatch(/patches by site-op/)
    }))
  })
  it("a host gone stale disables only requiresFresh entries, restores them on fresh, and removes nothing (BEH-FD-012)", async () => {
    await run((host) => Effect.gen(function* () {
      const t = yield* rig(host)
      t.push(manifest(1, { validUntil: 500, plugins: [{ id: "a", digest: "dA", requiresFresh: true }, { id: "b", digest: "dB" }] }))
      yield* drive(host, t.fed.sync); yield* idle(host)
      expect(yield* drive(host, t.fed.checkFreshness)).toBe("unchanged")
      t.clock.t = 600
      expect(yield* drive(host, t.fed.checkFreshness)).toBe("stale"); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("disabled"); expect(yield* stateIn(host, "b")).toBe("active")
      expect(t.reasons.at(-1)).toMatch(/freshness lost/)
      t.push(manifest(2, { validUntil: 5000, plugins: [{ id: "a", digest: "dA", requiresFresh: true }, { id: "b", digest: "dB" }] }))
      yield* drive(host, t.fed.sync); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("active")
    }))
  })
  it("the offline cap makes the manifest stale and publishes offline-capped once", async () => {
    await run((host) => Effect.gen(function* () {
      const t = yield* rig(host)
      t.push(manifest(1, { plugins: [{ id: "a", digest: "dA", requiresFresh: true }] })); yield* drive(host, t.fed.sync)
      t.clock.t = 5000
      yield* drive(host, t.fed.checkFreshness); yield* drive(host, t.fed.checkFreshness)
      expect(t.fed.status.stale).toEqual(["offline-capped"]); expect(t.fed.status.events.filter((e) => e._tag === "offline-capped")).toHaveLength(1)
    }))
  })
})
