// Durable federation state: restart re-verification, store-invalid, kills without a manifest, the running loop, the marker.
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Fiber, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { fileState, markerPorts, memoryState } from "../src/durable.js"
import { ManifestStore } from "../src/federation.js"
import { makeFederation, type HostManifest } from "../src/fedplugin.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { rebootstrap } from "../src/rebootstrap.js"
import type { Envelope, SyncAnswer } from "../src/sync.js"
import { as, run, stateIn } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const plug = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const catalog: Record<string, AnyPlugin> = { dA: plug("a"), dB: plug("b") }
const manifest = (revision: number, o: Partial<HostManifest> = {}): HostManifest => ({ format: "bridger.host-manifest/1", authority: "auth", host: "h1", revision, issuedAt: 0, plugins: [], ...o })
const envelope = (m: HostManifest): Envelope => ({ statementType: "host-manifest", id: JSON.stringify([m.authority, m.host]), version: String(m.revision), payload: JSON.stringify(m), signatures: ["ok"] })
const tmp = () => join(mkdtempSync(join(tmpdir(), "bridger-fed-")), "state.json")

const build = (host: Parameters<Parameters<typeof run>[0]>[0], state: ReturnType<typeof fileState>, o: { answers?: SyncAnswer[]; verify?: (r: { reverify?: unknown }) => Effect.Effect<void, unknown>; disabled?: string[]; outside?: { id: string }[]; reasons?: string[]; syncEvery?: number } = {}) => {
  const answers = o.answers ?? []; const seen: unknown[] = []
  return makeFederation({
    authority: "auth", host: "h1", source: () => Effect.succeed(answers.shift() ?? { kind: "none" }), store: new ManifestStore(),
    policy: { verify: (r) => { seen.push(r.reverify); return o.verify ? o.verify(r) : Effect.void } }, syncEvery: o.syncEvery ?? 1000, syncTimeout: 1000,
    reconcile: (d, op) => { o.reasons?.push(op.reason ?? ""); return drive(host, host.reconcile(d, { ...as(op.reason), ...(op.scope ? { scope: op.scope } : {}), ...(op.prune !== undefined ? { prune: op.prune } : {}) } as never)) as never },
    resolver: (digest) => catalog[digest] ? Effect.succeed(catalog[digest]!) : Effect.fail({ reason: "unknown" }), now: Effect.succeed(100),
    freshness: { maxOffline: 1e9, skewTolerance: 10 }, firstActivation: 50, state, outside: () => o.outside ?? [],
    disable: (ref, reason) => Effect.sync(() => { o.disabled?.push(`${ref.id}/${ref.realm}:${reason}`) })
  }).pipe(Effect.map((fed) => ({ fed, seen })))
}

describe("durable federation state", () => {
  it("stores the highest before applying and the last applied after, and a restarted host re-verifies with acceptedAt and applies it", async () => {
    const path = tmp(); const m1 = manifest(1, { plugins: [{ id: "a", digest: "dA" }, { id: "b", digest: "dB" }] })
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, fileState(path), { answers: [{ kind: "manifest", envelope: envelope(m1) }] })
      expect(yield* drive(host, fed.sync)).toEqual({ applied: 1 })
    }))
    const disk = JSON.parse(readFileSync(path, "utf8"))
    expect(disk.highest.revision).toBe(1); expect(disk.lastApplied.revision).toBe(1); expect(disk.lastApplied.acceptedAt).toBe(100); expect(disk.firstActivation).toBeUndefined()
    await run((host) => Effect.gen(function* () {                                  // a new process, a new host
      const { fed, seen } = yield* build(host, fileState(path))
      expect(yield* drive(host, fed.boot)).toBe("applied"); yield* idle(host)
      expect(seen).toEqual([{ acceptedAt: 100 }])                                   // re-verified as received bytes with reverify
      expect([yield* stateIn(host, "a"), yield* stateIn(host, "b")]).toEqual(["active", "active"])
      expect(JSON.parse(readFileSync(path, "utf8")).firstActivation).toBe(50)       // stored once at activation
    }))
  })
  it("a crash after the highest was stored but before the apply re-applies that revision at the next boot", async () => {
    const state = memoryState({ pendingKills: [], highest: { envelope: envelope(manifest(2, { plugins: [{ id: "b", digest: "dB" }] })), acceptedAt: 90, revision: 2 }, lastApplied: { envelope: envelope(manifest(1, { plugins: [{ id: "a", digest: "dA" }] })), acceptedAt: 80, revision: 1, requiresFresh: [] } })
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, state as never)
      expect(yield* drive(host, fed.boot)).toBe("applied"); yield* idle(host)
      expect(yield* stateIn(host, "b")).toBe("active"); expect(yield* stateIn(host, "a")).toBe("uninstalled")
    }))
  })
  it("a stored manifest that fails re-verification reports store-invalid, reconciles nothing, keeps the bytes, and lets pending kills disable", async () => {
    const path = tmp(); const disabled: string[] = []
    const m1 = manifest(1, { plugins: [{ id: "a", digest: "dA" }] })
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, fileState(path), { answers: [{ kind: "manifest", envelope: envelope(m1) }] })
      yield* drive(host, fed.sync)
    }))
    const st = fileState(path)
    await Effect.runPromise(st.update((s) => ({ ...s, pendingKills: [{ digest: "dA", revision: 2 }, { id: "zz", revision: 2 }] })))
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, st, { verify: () => Effect.fail("revoked signer"), disabled })
      expect(yield* drive(host, fed.boot)).toBe("store-invalid"); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("uninstalled")                           // nothing reconciled
      expect(fed.status.events.map((e) => e._tag)).toContain("store-invalid")
    }))
    expect(disabled.sort()).toEqual(["a/default:pending kill of revision 2", "zz/default:pending kill of revision 2"])
    expect(JSON.parse(readFileSync(path, "utf8")).lastApplied.revision).toBe(1)     // not deleted
  })
  it("while a re-bootstrap marker is stored a newer manifest is a kill-only apply: its kills become pending and nothing else changes", async () => {
    const state = memoryState({ pendingKills: [] }); const disabled: string[] = []
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, state as never, { answers: [{ kind: "manifest", envelope: envelope(manifest(1, { plugins: [{ id: "a", digest: "dA" }] })) }, { kind: "manifest", envelope: envelope(manifest(2, { plugins: [{ id: "b", digest: "dB" }], kill: [{ id: "a", reason: "recall" }] })) }], disabled })
      yield* drive(host, fed.sync); yield* idle(host)
      yield* state.update((s) => ({ ...s, marker: { step: "required", installAttempted: false } }))
      expect(yield* drive(host, fed.sync)).toEqual({ applied: 2 }); yield* idle(host)
      expect(yield* stateIn(host, "b")).toBe("uninstalled")                            // not applied in full
      expect((yield* state.read).pendingKills).toEqual([{ id: "a", reason: "recall", revision: 2 }])
      expect((yield* state.read).highest?.revision).toBe(2)
    }))
    expect(disabled).toEqual(["a/default:pending kill of revision 2"])
  })
  it("a full apply of a newer revision clears the pending kills up to it", async () => {
    const state = memoryState({ pendingKills: [{ id: "x", revision: 1 }, { id: "y", revision: 5 }] })
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, state as never, { answers: [{ kind: "manifest", envelope: envelope(manifest(3, { plugins: [{ id: "a", digest: "dA" }] })) }] })
      yield* drive(host, fed.sync)
      expect((yield* state.read).pendingKills).toEqual([{ id: "y", revision: 5 }])
    }))
  })
  it("publishes kill-unowned for a kill that matches a plugin installed outside the scope", async () => {
    await run((host) => Effect.gen(function* () {
      const { fed } = yield* build(host, memoryState() as never, { outside: [{ id: "manual" }], answers: [{ kind: "manifest", envelope: envelope(manifest(1, { plugins: [], kill: [{ id: "manual", reason: "r" }] })) }] })
      yield* drive(host, fed.sync)
      expect(fed.status.events).toEqual([{ _tag: "kill-unowned", id: "manual", realm: "default", reason: expect.any(String) }])
    }))
  })
  it("the re-bootstrap marker lives in the durable state, written before each step", async () => {
    const path = tmp(); const store = fileState(path); const steps: string[] = []
    const ports = markerPorts(store)
    await Effect.runPromise(rebootstrap({ marker: { ...ports, write: (m) => Effect.tap(ports.write(m), () => Effect.sync(() => { steps.push(JSON.parse(readFileSync(path, "utf8")).marker.step) })) }, outboxMode: "none",
      links: { deliveryOnly: Effect.void, suspend: Effect.void, resume: Effect.void }, fetch: Effect.succeed("s"), install: () => Effect.succeed({ revision: 4 }), applyLatest: () => Effect.succeed(4), applyRevocations: Effect.void, emit: () => Effect.void }))
    expect(steps).toEqual(["required", "suspended", "installing", "installed", "applying"])
    expect(JSON.parse(readFileSync(path, "utf8")).marker).toBeUndefined()           // cleared on resume
  })
  it("the loop syncs on its schedule and applies what the authority publishes, until its fiber is interrupted", async () => {
    await run((host) => Effect.gen(function* () {
      const answers: SyncAnswer[] = [{ kind: "manifest", envelope: envelope(manifest(1, { plugins: [{ id: "a", digest: "dA" }] })) }]
      const { fed } = yield* build(host, memoryState() as never, { answers, syncEvery: 20 })
      const fiber = yield* Effect.forkChild(fed.loop)
      for (let i = 0; i < 400 && (yield* stateIn(host, "a")) !== "active"; i++) { if (!(yield* host.step)) yield* Effect.sleep(5) }
      expect(yield* stateIn(host, "a")).toBe("active")
      answers.push({ kind: "manifest", envelope: envelope(manifest(2, { plugins: [{ id: "b", digest: "dB" }] })) })
      for (let i = 0; i < 600 && (yield* stateIn(host, "b")) !== "active"; i++) { if (!(yield* host.step)) yield* Effect.sleep(5) }
      expect(yield* stateIn(host, "b")).toBe("active"); expect(yield* stateIn(host, "a")).toBe("uninstalled")
      yield* Fiber.interrupt(fiber)
    }))
  }, 20000)
})
