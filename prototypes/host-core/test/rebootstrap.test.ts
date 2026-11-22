// Re-bootstrap step order, persistence and observability (BEH-FD-014, 044, 048).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { rebootstrap, type Marker, type Ports, type RebootstrapEvent } from "../src/rebootstrap.js"

const rig = (o: { marker?: Marker; outbox?: "ok" | "blocked" | "absent"; mode?: "required" | "none"; fetchFails?: boolean; installFails?: boolean; applyRev?: number; applyFails?: boolean; installRev?: number } = {}) => {
  const log: string[] = []; const events: RebootstrapEvent[] = []
  let marker: Marker | undefined = o.marker; const writes: Marker[] = []
  const ports: Ports<string> = {
    marker: { read: Effect.sync(() => marker), write: (m) => Effect.sync(() => { marker = m; writes.push(m) }), clear: Effect.sync(() => { marker = undefined; log.push("clear") }) },
    outbox: o.outbox === "absent" ? undefined : { settle: o.outbox === "blocked" ? Effect.fail({ reason: "outbox-unsettled", pending: 3 }) : Effect.sync(() => { log.push("settle"); return { pushed: 2, kept: 1, install: <A, E>(r: Effect.Effect<A, E>) => Effect.suspend(() => { log.push("settled-install"); return r }) } }) },
    outboxMode: o.mode ?? "required",
    links: { deliveryOnly: Effect.sync(() => { log.push("delivery-only") }), suspend: Effect.sync(() => { log.push("suspend") }), resume: Effect.sync(() => { log.push("resume") }) },
    fetch: Effect.suspend(() => { log.push("fetch"); return o.fetchFails ? Effect.fail({ reason: "net" }) : Effect.succeed("snap") }),
    install: () => Effect.suspend(() => { log.push("install"); return o.installFails ? Effect.fail({ reason: "disk" }) : Effect.succeed({ revision: o.installRev ?? 7 }) }),
    applyLatest: (known) => Effect.suspend(() => { log.push(`apply(known=${known})`); return o.applyFails ? Effect.fail({ reason: "sig" }) : Effect.succeed(o.applyRev ?? 7) }),
    applyRevocations: Effect.sync(() => { log.push("revocations") }),
    emit: (e) => Effect.sync(() => { events.push(e) })
  }
  return { ports, log, events, writes, marker: () => marker, run: () => Effect.runPromise(rebootstrap(ports)) }
}

describe("rebootstrap", () => {
  it("runs the steps in order and emits the events in order; the install goes through the settlement", async () => {
    const r = rig(); expect(await r.run()).toBe("resumed")
    expect(r.log).toEqual(["revocations", "settle", "suspend", "fetch", "settled-install", "install", "apply(known=7)", "resume", "clear"])
    expect(r.events.map((e) => e._tag)).toEqual(["rebootstrap-outbox", "rebootstrap-suspended", "rebootstrap-fetched", "rebootstrap-installed", "rebootstrap-applied", "rebootstrap-resumed"])
    expect(r.events[0]).toEqual({ _tag: "rebootstrap-outbox", pushed: 2, kept: 1 })
    expect(r.marker()).toBeUndefined()
  })
  it("persists each step in the marker before acting on it; installAttempted stays true", async () => {
    const r = rig(); await r.run()
    expect(r.writes.map((w) => w.step)).toEqual(["required", "suspended", "installing", "installed", "applying"])
    expect(r.writes.map((w) => w.installAttempted)).toEqual([false, false, true, true, true])
    expect(r.writes[3]!.installedRevision).toBe(7)
  })
  it("a blocked outbox stops there: nothing is fetched or installed, links are not suspended on a first attempt", async () => {
    const r = rig({ outbox: "blocked" }); expect(await r.run()).toBe("blocked")
    expect(r.log).toEqual(["revocations"]); expect(r.events).toEqual([{ _tag: "rebootstrap-blocked", reason: "outbox-unsettled", pending: 3 }])
    expect(r.marker()?.step).toBe("required")
  })
  it("no outbox port blocks with pending 0, unless outbox is none", async () => {
    expect(await rig({ outbox: "absent" }).run()).toBe("blocked")
    const n = rig({ outbox: "absent", mode: "none" }); expect(await n.run()).toBe("resumed"); expect(n.log).not.toContain("settle")
  })
  it("a failing fetch or install is reported with its step and the later steps do not run", async () => {
    const f = rig({ fetchFails: true }); expect(await f.run()).toBe("failed")
    expect(f.events.at(-1)).toEqual({ _tag: "rebootstrap-failed", step: "fetch", reason: "net" }); expect(f.log).not.toContain("install")
    const i = rig({ installFails: true }); expect(await i.run()).toBe("failed")
    expect(i.events.at(-1)).toEqual({ _tag: "rebootstrap-failed", step: "install", reason: "disk" }); expect(i.log).not.toContain("apply(known=7)")
    expect(i.marker()).toMatchObject({ step: "installing", installAttempted: true })
  })
  it("a retry after an install began starts with links suspended and moves only delivery links to delivery-only to push the outbox", async () => {
    const r = rig({ marker: { step: "installing", installAttempted: true } }); expect(await r.run()).toBe("resumed")
    expect(r.log.slice(0, 3)).toEqual(["suspend", "delivery-only", "settle"])
    expect(r.log).not.toContain("revocations")                                     // the marker exists: step 0 is not repeated
  })
  it("a restart after the install finished does not repeat it: it applies from the installed revision", async () => {
    const r = rig({ marker: { step: "installed", installAttempted: true, installedRevision: 7 } }); await r.run()
    expect(r.log).toEqual(["suspend", "apply(known=7)", "resume", "clear"])
  })
  it("reports a revision mismatch and applies anyway without repeating the install", async () => {
    const r = rig({ applyRev: 9 }); expect(await r.run()).toBe("resumed")
    expect(r.events.map((e) => e._tag)).toContain("rebootstrap-revision-mismatch")
    expect(r.events.find((e) => e._tag === "rebootstrap-revision-mismatch")).toEqual({ _tag: "rebootstrap-revision-mismatch", installed: 7, applied: 9 })
    expect(r.log.filter((l) => l === "install")).toHaveLength(1)
  })
  it("a failed apply leaves the marker and the links suspended", async () => {
    const r = rig({ applyFails: true }); expect(await r.run()).toBe("failed")
    expect(r.events.at(-1)).toMatchObject({ step: "apply" }); expect(r.log).not.toContain("resume"); expect(r.marker()?.step).toBe("applying")
  })
})
