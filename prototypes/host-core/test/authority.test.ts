// A manifest authority over real sockets, TCP and TLS, with HMAC signatures verified by a real SignaturePolicy.
import { execFileSync } from "node:child_process"
import { createHmac, timingSafeEqual } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { remoteSnapshot, remoteSource, serveAuthority } from "../src/authority.js"
import { ManifestStore } from "../src/federation.js"
import { makeFederation, type HostManifest } from "../src/fedplugin.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { rebootstrap } from "../src/rebootstrap.js"
import type { Envelope, SignaturePolicy } from "../src/sync.js"
import { as, run, stateIn } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const SECRET = "authority-secret"
const sign = (payload: string) => createHmac("sha256", SECRET).update(payload).digest("hex")
const hmacPolicy: SignaturePolicy = { verify: (r) => Effect.suspend(() => {
  const want = Buffer.from(sign(r.subject.bytes)), got = Buffer.from(String(r.signatures[0] ?? ""))
  return want.length === got.length && timingSafeEqual(want, got) ? Effect.void : Effect.fail("bad signature")
}) }
const manifest = (revision: number, ids: string[]): HostManifest => ({ format: "bridger.host-manifest/1", authority: "auth", host: "h1", revision, issuedAt: 0, plugins: ids.map((id) => ({ id, digest: `d-${id}` })) })
const envelope = (m: HostManifest, tamper = false): Envelope => { const payload = JSON.stringify(m); return { statementType: "host-manifest", id: JSON.stringify([m.authority, m.host]), version: String(m.revision), payload: tamper ? payload.replace('"a"', '"evil"') : payload, signatures: [sign(payload)] } }
const plug = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never }) as unknown as AnyPlugin
const catalog = (digest: string) => Effect.succeed(plug(digest.slice(2)))
const cert = () => { const dir = mkdtempSync(join(tmpdir(), "bridger-auth-")); execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" }); return { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) } }

const fedFor = (host: Parameters<Parameters<typeof run>[0]>[0], source: ReturnType<typeof remoteSource>) => makeFederation({
  authority: "auth", host: "h1", source, policy: hmacPolicy, store: new ManifestStore(), syncEvery: 100, syncTimeout: 2000,
  reconcile: (d, o) => drive(host, host.reconcile(d, { ...as(o.reason), ...(o.scope ? { scope: o.scope } : {}), prune: true } as never)) as never,
  resolver: catalog, now: Effect.succeed(1), freshness: { maxOffline: "forever", skewTolerance: 1 }, firstActivation: 0 })

describe("authority over sockets", () => {
  it("serves signed manifests over TCP; the host verifies the HMAC, applies, and sees none newer", async () => {
    let current = envelope(manifest(1, ["a", "b"]))
    await run((host) => Effect.gen(function* () {
      const srv = yield* serveAuthority({ latest: () => ({ revision: Number(current.version), envelope: current }), snapshot: () => undefined })
      const fed = yield* fedFor(host, remoteSource(`127.0.0.1:${srv.port}`))
      expect(yield* drive(host, fed.sync)).toEqual({ applied: 1 }); yield* idle(host)
      expect([yield* stateIn(host, "a"), yield* stateIn(host, "b")]).toEqual(["active", "active"])
      expect(yield* drive(host, fed.sync)).toEqual({ unchanged: true })
      current = envelope(manifest(2, ["b"]))
      expect(yield* drive(host, fed.sync)).toEqual({ applied: 2 }); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("uninstalled")
      yield* srv.close
    }))
  })
  it("refuses a tampered manifest (signature does not match the bytes) and applies nothing", async () => {
    await run((host) => Effect.gen(function* () {
      const srv = yield* serveAuthority({ latest: () => ({ revision: 1, envelope: envelope(manifest(1, ["a"]), true) }), snapshot: () => undefined })
      const fed = yield* fedFor(host, remoteSource(`127.0.0.1:${srv.port}`))
      expect(yield* drive(host, fed.sync)).toEqual({ _tag: "ManifestRejected", reason: "signature" }); yield* idle(host)
      expect(yield* stateIn(host, "a")).toBe("uninstalled")
      yield* srv.close
    }))
  })
  it("an unreachable authority is ManifestUnavailable", async () => {
    await run((host) => Effect.gen(function* () {
      const srv = yield* serveAuthority({ latest: () => undefined, snapshot: () => undefined }); const port = srv.port; yield* srv.close
      const fed = yield* fedFor(host, remoteSource(`127.0.0.1:${port}`))
      expect(yield* drive(host, fed.sync)).toEqual({ _tag: "ManifestUnavailable" })
    }))
  })
  it("answers ResyncRequired when the host is too far behind, and serves the snapshot the re-bootstrap installs", async () => {
    await run((host) => Effect.gen(function* () {
      const srv = yield* serveAuthority({ latest: () => ({ revision: 9, envelope: envelope(manifest(9, ["c"])) }), snapshot: () => ({ revision: 8, snapshot: "SNAP-8" }), resyncBelow: () => 5 })
      const addr = `127.0.0.1:${srv.port}`
      expect(yield* remoteSource(addr)({ host: "h1", known: 2 })).toEqual({ kind: "resync" })
      const installed: unknown[] = []; let marker: unknown
      const result = yield* rebootstrap<unknown>({ marker: { read: Effect.sync(() => marker as never), write: (m) => Effect.sync(() => { marker = m }), clear: Effect.sync(() => { marker = undefined }) }, outboxMode: "none",
        links: { deliveryOnly: Effect.void, suspend: Effect.void, resume: Effect.void },
        fetch: remoteSnapshot(addr)({ host: "h1", since: "2" }).pipe(Effect.map((s) => s.snapshot)), install: (s) => Effect.sync(() => { installed.push(s); return { revision: 8 } }),
        applyLatest: (known) => remoteSource(addr)({ host: "h1", known }).pipe(Effect.map(() => 9), Effect.orDie), applyRevocations: Effect.void, emit: () => Effect.void })
      expect(result).toBe("resumed"); expect(installed).toEqual(["SNAP-8"])
      yield* srv.close
    }))
  })
  it("speaks TLS: a client that trusts the certificate gets the manifest; one that does not, ManifestUnavailable", async () => {
    const { key, cert: c } = cert()
    await run((host) => Effect.gen(function* () {
      const srv = yield* serveAuthority({ latest: () => ({ revision: 1, envelope: envelope(manifest(1, ["a"])) }), snapshot: () => undefined }, { key, cert: c })
      const trusting = yield* fedFor(host, remoteSource(`127.0.0.1:${srv.port}`, { ca: c }))
      expect(yield* drive(host, trusting.sync)).toEqual({ applied: 1 })
      const strangers = yield* fedFor(host, remoteSource(`127.0.0.1:${srv.port}`, {}))
      expect(yield* drive(host, strangers.sync)).toEqual({ _tag: "ManifestUnavailable" })
      yield* srv.close
    }))
  }, 30000)

  it("answers none when the host already knows the latest revision, and fails a snapshot the authority does not have", async () => {
    await run((host) => Effect.gen(function* () {
      void host
      const srv = yield* serveAuthority({ latest: () => ({ revision: 4, envelope: envelope(manifest(4, ["a"])) }), snapshot: () => undefined })
      const addr = `127.0.0.1:${srv.port}`
      expect(yield* remoteSource(addr)({ host: "h1", known: 4 })).toEqual({ kind: "none" })
      expect((yield* remoteSource(addr)({ host: "h1", known: 3 })).kind).toBe("manifest")
      expect(yield* Effect.flip(remoteSnapshot(addr)({ host: "h1", since: "1" }))).toEqual({ reason: "snapshot-unavailable" })
      yield* srv.close
    }))
  })
})
