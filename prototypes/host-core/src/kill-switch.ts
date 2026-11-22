// Kill switch kernel (loader BEH-LD-029, BEH-LD-031, BEH-LD-032; improvement report 06 R5): the scope's one reconciler for revoked digests. It removes
// through the host (never around it), reports what it cannot reach, and exposes `status` for `restartGate`. Prototype: ids and digests are strings.
import { Effect } from "effect"
import { residentRevoked } from "./loader.js"

export interface Installed { readonly id: string; readonly realm: string; readonly digest: string }
export interface KillSwitchStatus {
  readonly residentRevoked: ReadonlyArray<string>     // revoked digests whose code is still in memory (BEH-LD-031)
  readonly restartRequired: boolean                   // residentRevoked is not empty; true until a new process incarnation (BEH-LD-031)
  readonly outsideScope: ReadonlyArray<{ readonly id: string; readonly realm: string; readonly digest: string }>
  readonly held: ReadonlyArray<{ readonly run: number; readonly ids: ReadonlyArray<string> }>
}
export interface KillSwitchOptions {
  readonly revoked: () => ReadonlySet<string>
  readonly installed: () => Effect.Effect<ReadonlyArray<Installed>>
  readonly resident: () => Iterable<string>           // `Loader.resident`
  readonly remove: (p: Installed) => Effect.Effect<void, unknown>   // the host's gated `remove`: a refusal leaves the plugin pending, never forced
  readonly inScope?: (p: Installed) => boolean        // the realms and ids the application delegated; default all
  readonly maxDroppedPerRun: number                   // blast-radius guard
}

export const makeKillSwitch = (o: KillSwitchOptions) => {
  let runs = 0
  const held: Array<{ run: number; ids: Array<string> }> = []
  let outside: KillSwitchStatus["outsideScope"] = []
  const dropped = Effect.map(o.installed(), (all) => all.filter((p) => o.revoked().has(p.digest)))
  const status: Effect.Effect<KillSwitchStatus> = Effect.sync(() => {
    const rr = residentRevoked(o.resident(), o.revoked())
    return { residentRevoked: rr, restartRequired: rr.length > 0, outsideScope: outside, held: held.map((h) => ({ run: h.run, ids: [...h.ids] })) }
  })
  /** One run: removes the in-scope plugins whose digest is revoked, unless more than `maxDroppedPerRun` would go (then the run is held until `release`). */
  const run = Effect.gen(function* () {
    const all = yield* dropped
    const scope = o.inScope ?? (() => true)
    outside = all.filter((p) => !scope(p)).map(({ id, realm, digest }) => ({ id, realm, digest }))
    const mine = all.filter(scope)
    const n = ++runs
    if (mine.length > o.maxDroppedPerRun) { held.push({ run: n, ids: mine.map((p) => p.id) }); return { run: n, removed: [] as string[], pending: [] as string[], held: true } }
    const removed: string[] = [], pending: string[] = []
    for (const p of mine) {
      const ok = yield* Effect.exit(o.remove(p))
      ;(ok._tag === "Success" ? removed : pending).push(p.id)          // a refusal, a drain timeout or a latch leaves it pending, to be retried
    }
    return { run: n, removed, pending, held: false }
  })
  /** Removes only the held run's plugins that are still dropped. */
  const release = (n: number) => Effect.gen(function* () {
    const h = held.find((x) => x.run === n); if (!h) return [] as string[]
    held.splice(held.indexOf(h), 1)
    const still = (yield* dropped).filter((p) => h.ids.includes(p.id))
    const removed: string[] = []
    for (const p of still) if ((yield* Effect.exit(o.remove(p)))._tag === "Success") removed.push(p.id)
    return removed
  })
  return { run, release, status }
}
