// The React adapter's client over a borrowed host, run through the ten shared scenarios of kit appendix C (REACT-API.md, "Core observation seam").
import { Effect, Option, Scope, Stream, SubscriptionRef } from "effect"
import { describe, it } from "vitest"
import type { Client } from "../src/adapter.js"
import type { Host } from "../src/host.js"
import { createBridgerClient } from "../src/react.js"
import { scenarios } from "./adapter-conformance.js"
import { run } from "./p4fixtures.js"

const viaReact = (host: Pick<Host, "changes" | "use">): Effect.Effect<Client, never, Scope.Scope> => Effect.gen(function* () {
  const rc = yield* Effect.promise(() => createBridgerClient({ over: host }))
  const cache = yield* SubscriptionRef.make(Option.fromNullishOr(rc.snapshot()))
  const off = rc.subscribe(() => { Effect.runSync(SubscriptionRef.set(cache, Option.fromNullishOr(rc.snapshot()))) })
  yield* Effect.addFinalizer(() => Effect.promise(async () => { off(); await rc.dispose() }))
  return {
    snapshot: SubscriptionRef.get(cache),
    changes: SubscriptionRef.changes(cache),
    pluginState: (id) => Effect.map(SubscriptionRef.get(cache), (s) => Option.match(s, { onNone: () => "uninstalled" as const, onSome: (x) => x.plugins.find((p) => p.id === id)?.state ?? "uninstalled" as const })),
    isAvailable: (id) => Effect.map(SubscriptionRef.get(cache), (s) => Option.isSome(s) && s.value.availableServiceIds.includes(id)),
    use: (key, f) => Effect.tryPromise({ try: () => rc.use(key, f as never), catch: (e) => e }) as never,
    dispose: Effect.promise(() => rc.dispose())
  }
})

describe("@bridger/react client against the shared scenarios (kit appendix C)", () => {
  for (const s of scenarios) it(`${s.id}: ${s.title}`, () => run((host) => s.run({ host, make: viaReact })))
  void Stream
})
