// Re-bootstrap (federation 02 BEH-FD-014, 06 BEH-FD-044, 048): outbox first, then suspend, fetch, install through the settlement,
// apply the newest manifest, resume. Each step is persisted in the marker before it is acted on; no step starts before the previous one succeeded.
import { Effect } from "effect"

export type Step = "required" | "outbox" | "suspended" | "installing" | "installed" | "applying"
export interface Marker { readonly step: Step; readonly installAttempted: boolean; readonly installedRevision?: number }
export type RebootstrapEvent =
  | { readonly _tag: "rebootstrap-outbox"; readonly pushed: number; readonly kept: number }
  | { readonly _tag: "rebootstrap-suspended" } | { readonly _tag: "rebootstrap-fetched" }
  | { readonly _tag: "rebootstrap-installed"; readonly revision: number } | { readonly _tag: "rebootstrap-applied"; readonly revision: number }
  | { readonly _tag: "rebootstrap-resumed" }
  | { readonly _tag: "rebootstrap-blocked"; readonly reason: string; readonly pending: number }
  | { readonly _tag: "rebootstrap-failed"; readonly step: "outbox" | "fetch" | "install" | "apply"; readonly reason: string }
  | { readonly _tag: "rebootstrap-revision-mismatch"; readonly installed: number; readonly applied: number }
export interface Settlement { readonly pushed: number; readonly kept: number; readonly install: <A, E>(run: Effect.Effect<A, E>) => Effect.Effect<A, E> }
export interface Ports<S> {
  readonly marker: { readonly read: Effect.Effect<Marker | undefined>; readonly write: (m: Marker) => Effect.Effect<void>; readonly clear: Effect.Effect<void> }
  /** Absent: no outbox port, which blocks unless `outbox` is "none". */
  readonly outbox?: { readonly settle: Effect.Effect<Settlement, { readonly reason: string; readonly pending: number }> }
  readonly outboxMode: "required" | "none"
  readonly links: { readonly deliveryOnly: Effect.Effect<void>; readonly suspend: Effect.Effect<void>; readonly resume: Effect.Effect<void> }
  readonly fetch: Effect.Effect<S, { readonly reason: string }>
  readonly install: (s: S) => Effect.Effect<{ readonly revision: number }, { readonly reason: string }>
  /** Step 3b: fetch the latest manifest with `known = installedRevision`, verify, apply in full; returns its revision. */
  readonly applyLatest: (known: number) => Effect.Effect<number, { readonly reason: string }>
  readonly applyRevocations: Effect.Effect<void>
  readonly emit: (e: RebootstrapEvent) => Effect.Effect<void>
}
export type Result = "resumed" | "blocked" | "failed"

type Attempt<A, E> = { readonly ok: A } | { readonly err: E }
const attempt = <A, E>(e: Effect.Effect<A, E>): Effect.Effect<Attempt<A, E>> => e.pipe(Effect.map((ok) => ({ ok }) as Attempt<A, E>), Effect.catch((err) => Effect.succeed({ err } as Attempt<A, E>)))

export const rebootstrap = <S>(p: Ports<S>): Effect.Effect<Result> => Effect.gen(function* () {
  const stored = yield* p.marker.read
  let m: Marker = stored ?? { step: "required", installAttempted: false }
  const persist = (n: Marker) => Effect.suspend(() => { m = n; return p.marker.write(n) })
  const fail = (step: "outbox" | "fetch" | "install" | "apply", reason: string) => p.emit({ _tag: "rebootstrap-failed", step, reason }).pipe(Effect.as("failed" as Result))
  if (!stored) { yield* persist(m); yield* p.applyRevocations }            // (0) marker first, then the newest revocation set
  else if (m.installAttempted) yield* p.links.suspend                       // a restart after an install began resumes with links suspended

  let installedRevision = m.installedRevision
  if (m.step !== "installed" && m.step !== "applying") {
    // (1) the outbox, inside a settlement held until the install ends
    let settlement: Settlement | undefined
    if (p.outboxMode === "required") {
      if (!p.outbox) { yield* p.emit({ _tag: "rebootstrap-blocked", reason: "no-outbox-port", pending: 0 }); return "blocked" as Result }
      if (m.installAttempted) yield* p.links.deliveryOnly                   // only delivery imports open so the outbox can be pushed
      const s = yield* attempt(p.outbox.settle)
      if ("err" in s) { yield* p.emit({ _tag: "rebootstrap-blocked", reason: s.err.reason, pending: s.err.pending }); return "blocked" as Result }    // nothing fetched, nothing installed
      settlement = s.ok
      yield* p.emit({ _tag: "rebootstrap-outbox", pushed: settlement.pushed, kept: settlement.kept })
    }
    // (2) suspend every link, then fetch
    yield* persist({ ...m, step: "suspended" }); yield* p.links.suspend; yield* p.emit({ _tag: "rebootstrap-suspended" })
    const snap = yield* attempt(p.fetch)
    if ("err" in snap) return yield* fail("fetch", snap.err.reason)
    yield* p.emit({ _tag: "rebootstrap-fetched" })
    // (3a) install only through the settlement; installAttempted stays true until the marker is cleared
    yield* persist({ ...m, step: "installing", installAttempted: true })
    const run = p.install(snap.ok)
    const inst = yield* attempt(settlement ? settlement.install(run) : run)
    if ("err" in inst) return yield* fail("install", inst.err.reason)
    installedRevision = inst.ok.revision
    yield* persist({ ...m, step: "installed", installedRevision }); yield* p.emit({ _tag: "rebootstrap-installed", revision: installedRevision })
  }
  // (3b) the latest manifest, known = the installed revision, applied in full
  yield* persist({ ...m, step: "applying" })
  const applied = yield* attempt(p.applyLatest(installedRevision ?? 0))
  if ("err" in applied) return yield* fail("apply", applied.err.reason)
  if (installedRevision !== undefined && applied.ok !== installedRevision) yield* p.emit({ _tag: "rebootstrap-revision-mismatch", installed: installedRevision, applied: applied.ok })   // applied anyway; never repeat the install
  yield* p.emit({ _tag: "rebootstrap-applied", revision: applied.ok })
  // (4) resume: links up, marker cleared
  yield* p.links.resume; yield* p.marker.clear; yield* p.emit({ _tag: "rebootstrap-resumed" })
  return "resumed" as Result
})
