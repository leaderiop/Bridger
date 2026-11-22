// Federation rules: manifest revisions (BEH-FD-004), kill entries (007, 027), fences (028-030) and peer realms (022).
import { Context, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { applyKills, ensurePeerRealm, FenceTable, isKilledDigest, ManifestStore, mayServe, peerRealmId, retirePeerRealm } from "../src/federation.js"
import { define } from "../src/plugin.js"
import { Layer } from "effect"
import { as, run } from "./p4fixtures.js"
import { drive, idle } from "./fixtures.js"

const m = (revision: number, digest = `d${revision}`) => ({ authority: "auth", host: "h1", revision, digest, acceptedAt: 0 })

describe("manifest store (BEH-FD-004)", () => {
  it("accepts a higher revision, treats the same bytes as unchanged, refuses a lower one", () => {
    const s = new ManifestStore()
    expect(s.accept(m(3))).toEqual({ outcome: "accepted" })
    expect(s.accept(m(4))).toEqual({ outcome: "accepted", previous: 3 })
    expect(s.accept(m(4))).toEqual({ outcome: "unchanged" })
    expect(s.accept(m(2))).toEqual({ outcome: "stale", highest: 4 })
    expect(s.current("auth", "h1")?.revision).toBe(4)
  })
  it("refuses a reused revision with other content, reports equivocation, and keeps what runs", () => {
    const s = new ManifestStore(); s.accept(m(5, "A"))
    expect(s.accept(m(5, "B"))).toEqual({ outcome: "revision-reused", revision: 5 })
    expect(s.events).toEqual([{ _tag: "manifest-equivocation", revision: 5 }])
    expect(s.current("auth", "h1")?.digest).toBe("A")
  })
  it("keeps one highest per (authority, host)", () => {
    const s = new ManifestStore(); s.accept(m(9)); s.accept({ ...m(1), host: "h2" })
    expect(s.accept({ ...m(2), host: "h2" })).toEqual({ outcome: "accepted", previous: 1 })
  })
})

describe("kill entries (BEH-FD-007, 027)", () => {
  const list = [{ id: "a", digest: "da" }, { id: "b", realm: "tenant", digest: "db" }, { id: "c", digest: "dc" }]
  it("removes by digest, and by id with the realm defaulting to default", () => {
    expect(applyKills(list, [{ digest: "da" }]).desired.map((x) => x.id)).toEqual(["b", "c"])
    expect(applyKills(list, [{ id: "c" }]).desired.map((x) => x.id)).toEqual(["a", "b"])
    expect(applyKills(list, [{ id: "b" }]).desired.map((x) => x.id)).toEqual(["a", "b", "c"])           // b is in realm tenant, not default
    expect(applyKills(list, [{ id: "b", realm: "tenant" }]).desired.map((x) => x.id)).toEqual(["a", "c"])
  })
  it("reports kill-unowned for a match outside the federation scope and touches nothing", () => {
    const r = applyKills(list, [{ id: "z" }], [{ id: "z" }])
    expect(r.events).toEqual([{ _tag: "kill-unowned", id: "z", realm: "default", reason: expect.any(String) }])
    expect(r.desired).toHaveLength(3)
  })
  it("a killed digest is neither imported nor exported", () => {
    expect(isKilledDigest([{ digest: "x" }], "x")).toBe(true)
    expect(isKilledDigest([{ digest: "x" }], "y")).toBe(false)
    expect(isKilledDigest([{ digest: "x" }], undefined)).toBe(false)
  })
})

describe("fences (BEH-FD-028..030)", () => {
  const f = (token: number, owner: string, scope = "s") => ({ scope, token, owner })
  it("refuses an offer below the highest seen with StaleExport, and never lowers the highest", () => {
    const t = new FenceTable()
    expect(t.see("stock", f(5, "hubA"), "ep1")).toEqual({ outcome: "accepted", close: [] })
    expect(t.see("stock", f(4, "hubB"))).toEqual({ outcome: "StaleExport", key: "stock", fence: 4, highest: 5 })
    expect(t.see("stock", f(3, "hubB"))).toMatchObject({ outcome: "StaleExport", highest: 5 })
  })
  it("a higher token closes every endpoint agreed under a lower one, and stops delivering their frames", () => {
    const t = new FenceTable()
    t.see("stock", f(5, "hubA"), "ep1"); t.see("stock", f(5, "hubA"), "ep2"); t.see("other", f(1, "x"), "ep3")
    expect(t.deliverable("ep1")).toBe(true)
    expect(t.see("stock", f(6, "hubB"), "ep4")).toEqual({ outcome: "accepted", close: ["ep1", "ep2"] })
    expect(t.deliverable("ep1")).toBe(false); expect(t.deliverable("ep2")).toBe(false)
    expect(t.deliverable("ep4")).toBe(true); expect(t.deliverable("ep3")).toBe(true)      // another key is untouched
  })
  it("a higher token seen from a manifest before any import honours it: the old owner is then refused", () => {
    const t = new FenceTable()
    t.see("stock", f(7, "hubB"))                                                          // from a manifest entry, no endpoint
    expect(t.see("stock", f(6, "hubA"), "ep1")).toMatchObject({ outcome: "StaleExport", highest: 7 })
  })
  it("equal tokens with two owners raise ExportConflict, persist, and end at a higher token", () => {
    const t = new FenceTable()
    t.see("stock", f(5, "hubA"), "ep1")
    expect(t.see("stock", f(5, "hubB"), "ep2")).toEqual({ outcome: "ExportConflict", key: "stock", owners: ["hubA", "hubB"] })
    expect(t.conflictOf("stock", "s")).toEqual(["hubA", "hubB"])
    expect(t.deliverable("ep1")).toBe(false)                                              // every import provides nothing while the conflict stands
    t.see("stock", f(6, "hubA"), "ep3")
    expect(t.conflictOf("stock", "s")).toBeUndefined()
    expect(t.deliverable("ep3")).toBe(true)
  })
  it("keeps scopes apart", () => {
    const t = new FenceTable(); t.see("stock", f(5, "a", "s1"))
    expect(t.see("stock", f(1, "b", "s2"))).toEqual({ outcome: "accepted", close: [] })
  })
  it("only the host the fence names may serve; an unfenced export is served by anyone", () => {
    expect(mayServe({ scope: "s", token: 1, owner: "h1" }, "h1")).toEqual({ serve: true })
    expect(mayServe({ scope: "s", token: 1, owner: "h1" }, "h2")).toEqual({ serve: false, report: "fence-not-owner" })
    expect(mayServe(undefined, "h2")).toEqual({ serve: true })
  })
})

describe("peer realms (BEH-FD-022)", () => {
  class Stock extends Context.Service<Stock, { readonly n: number }>()("stock/StockQuery") {}
  it("names the realm peer:<peer>:<key>@<major>", () => expect(peerRealmId("hubA", "stock/StockQuery", 2)).toBe("peer:hubA:stock/StockQuery@2"))
  it("defines one realm per import, so two peers can both provide the key; defining again is a no-op; retiring an empty realm succeeds", async () => {
    await run((host) => Effect.gen(function* () {
      yield* drive(host, ensurePeerRealm(host as never, "hubA", "stock/StockQuery", 1, [Stock] as never))
      yield* drive(host, ensurePeerRealm(host as never, "hubB", "stock/StockQuery", 1, [Stock] as never))
      yield* drive(host, ensurePeerRealm(host as never, "hubA", "stock/StockQuery", 1, [Stock] as never))
      const p = (id: string, n: number) => define({ id, requires: [] as const, provides: [Stock] as const, build: Layer.succeed(Stock, { n }) }) as never
      yield* drive(host, host.install(p("proxyA", 1), { ...as(), realm: peerRealmId("hubA", "stock/StockQuery", 1) } as never))
      yield* drive(host, host.install(p("proxyB", 2), { ...as(), realm: peerRealmId("hubB", "stock/StockQuery", 1) } as never))
      yield* idle(host)
      expect(yield* drive(host, retirePeerRealm(host as never, "hubA", "stock/StockQuery", 1))).toBe("realm-in-use")      // reported, left defined, retried at the next apply
      yield* drive(host, host.remove({ id: "proxyA", realm: peerRealmId("hubA", "stock/StockQuery", 1) }, as()))
      expect(yield* drive(host, retirePeerRealm(host as never, "hubA", "stock/StockQuery", 1))).toBe("retired")
      expect(yield* drive(host, retirePeerRealm(host as never, "hubA", "stock/StockQuery", 1))).toBe("unknown-realm")
    }))
    void Exit
  })
})

import { applyFreshness, DEFAULT_MAX_OFFLINE, firstActivationOf, freshness, needsRebootstrap } from "../src/federation.js"

describe("freshness, offline cap and clock (BEH-FD-012, 013, 016)", () => {
  const base = { now: 1000, issuedAt: 500, firstActivation: 0, lastContact: 900, maxOffline: 500, skewTolerance: 10 }
  it("is fresh while before validUntil (or without one) and inside the cap", () => {
    expect(freshness(base)).toEqual({ fresh: true, reasons: [] })
    expect(freshness({ ...base, validUntil: 1001 }).fresh).toBe(true)
    expect(freshness({ ...base, validUntil: 1000 })).toEqual({ fresh: false, reasons: ["expired"] })
  })
  it("is offline-capped past maxOffline after lastContact, or after firstActivation when there was no contact", () => {
    expect(freshness({ ...base, lastContact: 499 })).toEqual({ fresh: false, reasons: ["offline-capped"] })
    expect(freshness({ ...base, lastContact: 500 }).fresh).toBe(true)                          // exactly at the cap is not past it
    expect(freshness({ ...base, lastContact: undefined, firstActivation: 400 })).toEqual({ fresh: false, reasons: ["offline-capped"] })
    expect(freshness({ ...base, lastContact: undefined, firstActivation: 500 }).fresh).toBe(true)
  })
  it("never caps with maxOffline forever, and defaults to 72 hours", () => {
    expect(freshness({ ...base, lastContact: -1e12, maxOffline: "forever" }).fresh).toBe(true)
    expect(DEFAULT_MAX_OFFLINE).toBe(259_200_000)
  })
  it("treats a clock earlier than issuedAt or lastContact by more than the tolerance as stale", () => {
    expect(freshness({ ...base, now: 489, lastContact: undefined, firstActivation: 480 })).toEqual({ fresh: false, reasons: ["clock-skew"] })   // 489 < 500 - 10, issuedAt alone
    expect(freshness({ ...base, now: 490, lastContact: 480 }).fresh).toBe(true)                            // within the tolerance
    expect(freshness({ ...base, now: 905, issuedAt: 0, lastContact: 920 })).toMatchObject({ fresh: false, reasons: expect.arrayContaining(["clock-skew"]) })
  })
  it("stores firstActivation once", () => { expect(firstActivationOf(undefined, 7)).toBe(7); expect(firstActivationOf(3, 7)).toBe(3) })
  it("a stale host disables only requiresFresh entries; a fresh one changes nothing", () => {
    const d = [{ id: "a", requiresFresh: true }, { id: "b" }, { id: "c", requiresFresh: false, disabled: false }]
    expect(applyFreshness(d, false)).toEqual([{ id: "a", requiresFresh: true, disabled: true }, { id: "b" }, { id: "c", requiresFresh: false, disabled: false }])
    expect(applyFreshness(d, true)).toBe(d)
  })
  it("contact after the cap needs a re-bootstrap unless the host is current", () => {
    expect(needsRebootstrap(true, 4, 9, false)).toBe(true)
    expect(needsRebootstrap(true, 9, 9, false)).toBe(false)
    expect(needsRebootstrap(true, 9, 9, true)).toBe(true)
    expect(needsRebootstrap(false, 4, 9, false)).toBe(false)
  })
})

import { checkImportResidency, exportOffered, RevocationRelay } from "../src/federation.js"

describe("revocation relay (BEH-FD-043)", () => {
  it("relays an accepted list once per link and revision, never back to its source, and never a stale one", () => {
    const r = new RevocationRelay()
    expect(r.accepted(5, "L5", "a", ["a", "b", "c"])).toEqual(["b", "c"])
    expect(r.accepted(5, "L5", "b", ["a", "b", "c"])).toEqual([])            // the same revision again: nothing
    expect(r.accepted(4, "L4", undefined, ["a", "b"])).toEqual([])           // stale
    expect(r.accepted(6, "L6", undefined, ["a", "b"])).toEqual(["a", "b"])
  })
  it("a new link gets the newest list first, once; a link already sent it gets nothing", () => {
    const r = new RevocationRelay()
    expect(r.onLinkUp("a")).toBeUndefined()                                  // nothing accepted yet
    r.accepted(5, "L5", "src", ["b"])
    expect(r.onLinkUp("a")).toEqual({ revision: 5, list: "L5" })
    expect(r.onLinkUp("a")).toBeUndefined()
    expect(r.onLinkUp("b")).toBeUndefined()                                  // b already received it by the relay
  })
})

describe("residency on a route (BEH-FD-045)", () => {
  it("drops an import with a residency whose peer declares none", () => {
    expect(checkImportResidency(["eu"], {})).toEqual({ keep: false, reason: "peer-residency-missing" })
    expect(checkImportResidency(["eu"], undefined)).toEqual({ keep: false, reason: "peer-residency-missing" })
  })
  it("refuses a route that does not offer every required label, and offers the peer's labels otherwise", () => {
    expect(checkImportResidency(["eu", "gdpr"], { residency: ["eu"] })).toEqual({ keep: false, reason: "placement-refused" })
    expect(checkImportResidency(["eu"], { residency: ["eu", "gdpr"] })).toEqual({ keep: true, offered: ["eu", "gdpr"] })
  })
  it("an import without a residency is kept and offers the peer's labels or none", () => {
    expect(checkImportResidency(undefined, { residency: ["eu"] })).toEqual({ keep: true, offered: ["eu"] })
    expect(checkImportResidency([], undefined)).toEqual({ keep: true, offered: [] })
  })
  it("an export offers the peer's labels, else the profile's, else none", () => {
    expect(exportOffered({ residency: ["a"] }, { residency: ["b"] })).toEqual(["a"])
    expect(exportOffered({}, { residency: ["b"] })).toEqual(["b"])
    expect(exportOffered(undefined, undefined)).toEqual([])
  })
})

describe("offers and the fence table (BEH-FD-029, improvement report 06 S12)", () => {
  const f = (token: number, owner = "b") => ({ scope: "s", token, owner })
  const link = (o: { authenticatedPeer?: string; host?: string } = {}) => ({ host: o.host ?? "b", maxJump: 8, ...(o.authenticatedPeer !== undefined ? { authenticatedPeer: o.authenticatedPeer } : {}) })
  it("an unauthenticated offer cannot raise the stored highest; an authenticated one within the window can; a huge token is advisory; a stale one is refused either way", async () => {
    const { FenceTable } = await import("../src/federation.js")
    const t = new FenceTable()
    t.see("k", f(3, "b"))                                            // a manifest entry: persists
    expect(t.offer("k", f(2 ** 53 - 1, "evil"), "e1", link({ host: "evil" }))).toEqual({ outcome: "advisory", key: "k", reason: "unauthenticated" })
    expect(t.offer("k", f(2 ** 53 - 1, "b"), "e2", link({ authenticatedPeer: "b" }))).toEqual({ outcome: "advisory", key: "k", reason: "out-of-window" })
    expect(t.offer("k", f(2, "b"), "e3", link({ authenticatedPeer: "b" }))).toMatchObject({ outcome: "StaleExport", highest: 3 })
    expect(t.offer("k", f(2, "x"), "e4", link({ host: "x" }))).toMatchObject({ outcome: "StaleExport", highest: 3 })
    expect(t.offer("k", f(4, "b"), "e5", link({ authenticatedPeer: "b" }))).toMatchObject({ outcome: "accepted" })
    expect(t.see("k", f(3, "b"))).toMatchObject({ outcome: "StaleExport", highest: 4 })   // the real owner still works at 4, not locked out at 2**53
  })
  it("an offer naming a host other than the one the transport authenticated is refused as PeerMismatch", async () => {
    const { FenceTable } = await import("../src/federation.js")
    expect(new FenceTable().offer("k", f(1, "b"), "e", link({ authenticatedPeer: "c", host: "b" }))).toEqual({ outcome: "PeerMismatch", key: "k", offered: "b", authenticated: "c" })
  })
  it("an authenticated peer cannot raise the fence for an owner other than itself (S59)", async () => {
    const { FenceTable } = await import("../src/federation.js")
    const t = new FenceTable(); t.see("k", { scope: "s", token: 3, owner: "a" })
    const mallory = { host: "m", authenticatedPeer: "m", maxJump: 8 }
    expect(t.offer("k", { scope: "s", token: 4, owner: "m" }, "e1", mallory)).toEqual({ outcome: "advisory", key: "k", reason: "not-owner" })   // the manifest names a, not m
    expect(t.offer("k", { scope: "s", token: 4, owner: "a" }, "e0", { host: "a", authenticatedPeer: "a", maxJump: 8 })).toMatchObject({ outcome: "accepted" })
    expect(t.offer("k", { scope: "s", token: 5, owner: "a" }, "e2", mallory)).toEqual({ outcome: "advisory", key: "k", reason: "not-owner" })
  })
  it("a first offer is bounded by maxJump from zero, so the first authenticated peer cannot claim an enormous token (S65)", async () => {
    const { FenceTable } = await import("../src/federation.js")
    const t = new FenceTable(), a = { host: "a", authenticatedPeer: "a", maxJump: 8 }
    expect(t.offer("k", { scope: "s", token: 2 ** 40, owner: "a" }, "e", a)).toEqual({ outcome: "advisory", key: "k", reason: "out-of-window" })
    expect(t.offer("k", { scope: "s", token: 3, owner: "a" }, "e", a)).toMatchObject({ outcome: "accepted" })
  })
})
