// The universe of the confluence property tests (BEH-BR-160): two realms, optional consumers, a parent with a child.
import { Context, Effect, Layer } from "effect"
import type * as Host from "../src/host.js"
import { PluginRuntime } from "../src/runtime.js"
import type { AnyPlugin } from "../src/plugin.js"
import { Audit, Logger, Report, auditPlugin, journal, loggerPlugin, reportPlugin } from "./fixtures.js"
import { as } from "./p4fixtures.js"

class Clock2 extends Context.Service<Clock2, {}>()("example/Clock") {}
class Parent extends Context.Service<Parent, {}>()("example/Parent") {}

const j = journal()
export const plugins: Record<string, AnyPlugin> = {
  logger: loggerPlugin(j) as AnyPlugin,
  audit: auditPlugin(j) as AnyPlugin,
  report: reportPlugin(j) as AnyPlugin,
  clock: { id: "clock", requires: [], provides: [Clock2], build: Layer.succeed(Clock2, {}) as unknown as AnyPlugin["build"] },
  ui: { id: "ui", requires: [], provides: [], optional: [Logger, Audit], build: Layer.empty as unknown as AnyPlugin["build"] },
  app: {
    id: "app", requires: [Clock2], provides: [Parent],
    build: Layer.effect(Parent, Effect.gen(function* () {
      const rt = yield* PluginRuntime
      yield* rt.install({ id: "kid", requires: [Parent, Report], provides: [], build: Layer.empty as unknown as AnyPlugin["build"] })
      return {}
    })) as unknown as AnyPlugin["build"]
  }
}
/** The universe: (plugin, realm). Realm "t" isolates Logger and Audit, so logger and audit run once per realm. */
export const universe: ReadonlyArray<{ readonly name: string; readonly realm: string }> = [
  ...Object.keys(plugins).map((name) => ({ name, realm: "default" })),
  { name: "logger", realm: "t" }, { name: "audit", realm: "t" }, { name: "ui", realm: "t" }
]
export const refOf = (u: { name: string; realm: string }) => ({ id: plugins[u.name]!.id, realm: u.realm })

export const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const setup = (host: Pick<Host.Host, "defineRealm">) => host.defineRealm("t", { isolate: [Logger, Audit] }, as())
export const present = (host: Pick<Host.Host, "snapshot">, u: { name: string; realm: string }) =>
  Effect.map(host.snapshot, (s) => s.plugins.find((p) => p.id === plugins[u.name]!.id && p.realm === u.realm))
/** Compared modulo revision numbers and timing (BEH-BR-160): ids, realms, parents, states, missing keys. */
export const normal = (s: Host.HostSnapshot) => s.plugins
  .map((p) => JSON.stringify([p.id, p.realm, p.parentId ?? null, p.state, p.state === "waiting" ? [...p.missingServiceIds].sort() : null]))
  .sort()

