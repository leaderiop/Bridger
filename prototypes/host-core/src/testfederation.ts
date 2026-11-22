// TestFederation (federation 05, BEH-FD-033): several TestHosts in one scope, linked in memory, with exports served from one host and
// imports installed on another as remote proxies in their own peer realm. Deterministic ids per host; no ambient network.
import { Effect, Layer, Scope } from "effect"
import type { Contract } from "./contract.js"
import * as Testing from "./testing.js"
import { ensurePeerRealm, FenceTable, isKilledDigest, peerRealmId, checkImportResidency, type Fence, type KillEntry, type OfferVerdict } from "./federation.js"
import type { AnyPlugin } from "./plugin.js"
import { remoteProxy } from "./remoteproxy.js"
import { serveGuest } from "./session.js"
import { duplex, type Connection } from "./wire.js"

export type FederatedHost = Testing.TestHost
export interface Federation {
  readonly hosts: ReadonlyMap<string, FederatedHost>
  readonly host: (name: string) => FederatedHost
  /** Serves `contract` from `name` on a fresh in-memory link; returns the dialler's end. `host.use` runs under the serving host. */
  readonly exportTo: (name: string, contract: Contract<any, any>, version: string) => Effect.Effect<Connection>
}

export const make = (names: ReadonlyArray<string>, options: Parameters<typeof Testing.make>[0] = {}): Effect.Effect<Federation, never, Scope.Scope> => Effect.gen(function* () {
  const hosts = new Map<string, FederatedHost>()
  for (const n of names) hosts.set(n, yield* Testing.make({ ...options }).pipe(Effect.provide(Testing.counterIdGenerator(`${n}-`))))
  const host = (n: string) => { const h = hosts.get(n); if (!h) throw new Error(`unknown host ${n}`); return h }
  const exportTo = (name: string, contract: Contract<any, any>, version: string) => Effect.gen(function* () {
    const d = contract.descriptor; const [a, b] = yield* duplex
    const handlers = Object.fromEntries(d.methods.map((m) => [m, (payload: unknown) => host(name).use(contract.contractKey as never, (svc: Record<string, (p: unknown) => Effect.Effect<unknown>>) => svc[m]!(payload) as never).pipe(Effect.orDie)]))
    yield* Effect.forkChild(serveGuest(b, { wire: [1], served: [{ version, methods: d.methods, schemas: d.schemas }], maxInFlight: 8, handlers: handlers as never }))
    return a
  })
  return { hosts, host, exportTo }
})

export interface ImportRequest {
  readonly peer: string; readonly key: string; readonly major: number; readonly digest?: string
  readonly fence?: Fence; readonly residency?: ReadonlyArray<string>; readonly peerResidency?: ReadonlyArray<string>
}
export type ImportOutcome = { readonly installed: string } | { readonly refused: "killed" | "peer-residency-missing" | "placement-refused" | OfferVerdict }

/**
 * Installs one import as a remote proxy plugin in the import's own peer realm (BEH-FD-026, 022), after the refusals that need no
 * connection: a killed digest (FD-027), a residency the peer does not declare or offer (FD-045), a stale or conflicting fence (FD-029).
 */
export const importFrom = (host: FederatedHost, fences: FenceTable, kills: ReadonlyArray<KillEntry>, req: ImportRequest, o: {
  readonly contract: Contract<any, any>; readonly accepts: string; readonly dial: Effect.Effect<Connection>; readonly attribution: unknown
  readonly heartbeat?: { every: number; missed: number }; readonly backoff?: number
}): Effect.Effect<ImportOutcome, unknown> => Effect.gen(function* () {
  if (isKilledDigest(kills, req.digest)) return { refused: "killed" } as const
  const res = checkImportResidency(req.residency, req.peerResidency === undefined ? undefined : { residency: req.peerResidency })
  if (!res.keep) return { refused: res.reason } as const
  const endpoint = `${req.peer}:${req.key}@${req.major}`
  if (req.fence) { const v = fences.see(req.key, req.fence, endpoint); if (v.outcome !== "accepted") return { refused: v } as const }
  const realm = peerRealmId(req.peer, req.key, req.major)
  yield* (ensurePeerRealm(host as never, req.peer, req.key, req.major, [o.contract.contractKey] as never) as Effect.Effect<unknown, unknown>)
  const proxy: AnyPlugin = remoteProxy({ id: `import:${req.peer}:${req.key}`, contract: o.contract, accepts: o.accepts, dial: o.dial, heartbeat: o.heartbeat ?? { every: 50, missed: 4 }, backoff: o.backoff ?? 100 })
  yield* (host.install(proxy, { ...(o.attribution as object), realm } as never) as Effect.Effect<unknown, unknown>)
  return { installed: realm } as const
})
void Layer
