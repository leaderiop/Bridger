// Federation verification and the sync attempt (BEH-FD-002, 011).
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { ManifestStore } from "../src/federation.js"
import { makeSync, requirePolicy, verifyManifest, type Envelope, type SignaturePolicy, type SyncAnswer } from "../src/sync.js"

const body = (o: object = {}) => ({ authority: "auth", host: "h1", revision: 3, ...o })
const env = (b: object = body(), o: Partial<Envelope> = {}): Envelope => { const x = b as { authority: string; host: string; revision: number }; return { statementType: "host-manifest", id: JSON.stringify([x.authority, x.host]), version: String(x.revision), payload: JSON.stringify(b), signatures: ["sig"], ...o } }
const ok: SignaturePolicy = { verify: () => Effect.void }
const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(Effect.exit(e))
const reason = (x: Exit.Exit<unknown, unknown>) => Exit.isFailure(x) ? (JSON.parse(JSON.stringify(x.cause)).failure ?? JSON.parse(JSON.stringify(x.cause)).error ?? JSON.stringify(x.cause)) : undefined

describe("verifyManifest (BEH-FD-002)", () => {
  it("passes the received bytes, id, version and signatures unchanged to the policy, and decodes only after acceptance", async () => {
    const seen: unknown[] = []; let decodedBefore = false
    const e = env(); 
    const policy: SignaturePolicy = { verify: (r) => Effect.sync(() => { seen.push(r) }) }
    const m = await Effect.runPromise(verifyManifest(policy, e))
    expect(m.revision).toBe(3)
    expect(seen).toEqual([{ subject: { bytes: e.payload }, id: e.id, version: e.version, signatures: ["sig"] }])
    // undecodable bytes are never decoded when the policy refuses
    const bad = await run(verifyManifest({ verify: () => { decodedBefore = true; return Effect.fail("no") } }, { ...e, payload: "{not json" }))
    expect(Exit.isFailure(bad) && JSON.stringify(bad.cause)).toContain("signature")
    expect(decodedBefore).toBe(true)
  })
  it("refuses a foreign statement type before calling verify", async () => {
    let called = false
    const x = await run(verifyManifest({ verify: () => { called = true; return Effect.void } }, env(body(), { statementType: "other" })))
    expect(JSON.stringify(Exit.isFailure(x) && x.cause)).toContain("statement-type"); expect(called).toBe(false)
  })
  it("treats a refusal, a failure, a defect and a timeout-like die of the policy as a signature rejection", async () => {
    for (const p of [{ verify: () => Effect.fail("no") }, { verify: () => Effect.die("boom") }]) {
      const x = await run(verifyManifest(p as SignaturePolicy, env()))
      expect(JSON.stringify(Exit.isFailure(x) && x.cause)).toContain("signature")
    }
  })
  it("refuses a body whose [authority, host] or revision differs from the signed id and version", async () => {
    for (const e of [env(body(), { id: JSON.stringify(["auth", "other"]) }), env(body(), { version: "4" })]) {
      const x = await run(verifyManifest(ok, e)); expect(JSON.stringify(Exit.isFailure(x) && x.cause)).toContain("signature")
    }
  })
  it("passes reverify { acceptedAt } only when asked", async () => {
    const seen: unknown[] = []
    await Effect.runPromise(verifyManifest({ verify: (r) => Effect.sync(() => { seen.push(r.reverify) }) }, env(), { acceptedAt: 42 }))
    expect(seen).toEqual([{ acceptedAt: 42 }])
  })
  it("has no default signature policy", async () => {
    expect(JSON.stringify(Exit.isFailure(await run(requirePolicy(undefined))))).toBe("true")
    expect(await Effect.runPromise(requirePolicy(ok))).toBe(ok)
  })
})

describe("sync attempt (BEH-FD-011)", () => {
  const setup = (answers: Array<SyncAnswer | "fail" | "hang">, o: { pending?: boolean } = {}) => {
    const store = new ManifestStore(); const applied: number[] = []; let resyncs = 0, calls = 0; const knowns: number[] = []
    const source = ({ known }: { known: number }) => { knowns.push(known); calls++; const a = answers.shift()!; return a === "fail" ? Effect.fail("down") : a === "hang" ? Effect.never : Effect.succeed(a).pipe(Effect.delay(5)) }
    return { store, applied, knowns, get resyncs() { return resyncs }, get calls() { return calls },
      make: () => makeSync({ host: "h1", authority: "auth", source, policy: ok, store, syncEvery: 100, syncTimeout: 30, apply: (m) => Effect.sync(() => { applied.push(m.revision) }), onResync: Effect.sync(() => { resyncs++ }), rebootstrapPending: () => !!o.pending }) }
  }
  it("applies a verified higher manifest, reports unchanged for the same one, sends known, and refuses a lower revision", async () => {
    const t = setup([{ kind: "manifest", envelope: env(body({ revision: 5 })) }, { kind: "manifest", envelope: env(body({ revision: 5 })) }, { kind: "manifest", envelope: env(body({ revision: 2 })) }, { kind: "none" }])
    const s = await Effect.runPromise(t.make())
    expect(await Effect.runPromise(s.sync)).toEqual({ applied: 5 })
    expect(await Effect.runPromise(s.sync)).toEqual({ unchanged: true })
    expect(await Effect.runPromise(s.sync)).toEqual({ _tag: "ManifestRejected", reason: "stale-revision" })
    expect(await Effect.runPromise(s.sync)).toEqual({ unchanged: true })
    expect(t.applied).toEqual([5]); expect(t.knowns).toEqual([0, 5, 5, 5])
  })
  it("refuses a reused revision with other content and a manifest for another host", async () => {
    const t = setup([{ kind: "manifest", envelope: env(body({ revision: 5, n: 1 })) }, { kind: "manifest", envelope: env(body({ revision: 5, n: 2 })) }, { kind: "manifest", envelope: env(body({ host: "h2", revision: 9 })) }])
    const s = await Effect.runPromise(t.make())
    await Effect.runPromise(s.sync)
    expect(await Effect.runPromise(s.sync)).toEqual({ _tag: "ManifestRejected", reason: "revision-reused" })
    expect(await Effect.runPromise(s.sync)).toEqual({ _tag: "ManifestRejected", reason: "wrong-host" })
    expect(t.applied).toEqual([5])
  })
  it("a timeout or failure is ManifestUnavailable and does not update lastContact; any answer does", async () => {
    const t = setup(["hang", "fail", { kind: "none" }])
    const s = await Effect.runPromise(t.make())
    expect(await Effect.runPromise(s.sync)).toEqual({ _tag: "ManifestUnavailable" }); expect(s.lastContact()).toBeUndefined()
    expect(await Effect.runPromise(s.sync)).toEqual({ _tag: "ManifestUnavailable" }); expect(s.lastContact()).toBeUndefined()
    await Effect.runPromise(s.sync); expect(s.lastContact()).toBeGreaterThan(0)
  })
  it("ResyncRequired starts the re-bootstrap unless a marker is stored; both update lastContact", async () => {
    const a = setup([{ kind: "resync" }]); const sa = await Effect.runPromise(a.make())
    expect(await Effect.runPromise(sa.sync)).toEqual({ _tag: "ResyncRequired" }); expect(a.resyncs).toBe(1); expect(sa.lastContact()).toBeGreaterThan(0)
    const b = setup([{ kind: "resync" }], { pending: true }); const sb = await Effect.runPromise(b.make())
    await Effect.runPromise(sb.sync); expect(b.resyncs).toBe(0)
  })
  it("two concurrent syncs share one attempt", async () => {
    const t = setup([{ kind: "none" }, { kind: "none" }])
    const s = await Effect.runPromise(t.make())
    const [x, y] = await Effect.runPromise(Effect.all([s.sync, s.sync], { concurrency: 2 }))
    expect(x).toEqual(y); expect(t.calls).toBe(1)
  })
  it("backs off from syncEvery up to ten times with jitter, and resets on success", async () => {
    const t = setup(["fail", "fail", "fail", "fail", "fail", "fail", { kind: "none" }])
    const s = await Effect.runPromise(t.make())
    const seen: number[] = []
    for (let i = 0; i < 6; i++) { await Effect.runPromise(s.sync); seen.push(await Effect.runPromise(s.nextInterval)) }
    expect(seen[0]!).toBeGreaterThanOrEqual(200); expect(seen[0]!).toBeLessThan(220)
    expect(seen[5]!).toBeGreaterThanOrEqual(1000); expect(seen[5]!).toBeLessThan(1100)       // capped at 10 × syncEvery
    await Effect.runPromise(s.sync)
    const reset = await Effect.runPromise(s.nextInterval); expect(reset).toBeGreaterThanOrEqual(100); expect(reset).toBeLessThan(110)
  })
})
void reason
