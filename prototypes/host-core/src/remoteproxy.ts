// The remote proxy plugin (remote BEH-RM-026, 027): while a session is open it mounts a session child that provides the contract,
// and a partition withdraws that child, so dependents wait instead of failing. Core's children do the lifecycle.
import { Effect, Exit, Layer, Scope } from "effect"
import { Contract, at, type Contract as ContractT } from "./contract.js"
import { define, type AnyPlugin } from "./plugin.js"
import { PluginRuntime } from "./runtime.js"
import { startLink, type EndReason, type Session } from "./session.js"
import type { Connection } from "./wire.js"

/**
 * `contract` is the local copy of the remote contract; `dial` yields a connection to a started guest.
 * shortcut: a failed call dies the caller's fiber (`orDie`); typed remote errors need the contract's error schemas, not built here.
 */
export const remoteProxy = (o: {
  readonly id: string; readonly contract: ContractT; readonly accepts: string; readonly dial: Effect.Effect<Connection>
  readonly heartbeat: { readonly every: number; readonly missed: number }; readonly backoff: number
  readonly onEnd?: (why: EndReason) => void
}): AnyPlugin => define({
  id: o.id, requires: [] as const, provides: [] as const,
  build: Layer.effectDiscard(Effect.gen(function* () {
    const rt = yield* PluginRuntime
    const d = o.contract.descriptor
    let sub: Scope.Closeable | undefined
    const link = yield* startLink(o.dial, {
      wire: [1], contract: { id: d.serviceId, accepts: o.accepts, version: d.version, methods: d.methods, schemas: d.schemas },
      heartbeat: o.heartbeat, backoff: o.backoff,
      onSession: (s: Session) => Effect.gen(function* () {
        const impl = Object.fromEntries(d.methods.map((m) => [m, (payload: unknown) => s.call(m, payload).pipe(Effect.orDie)]))
        const child = define({ id: "session", requires: [] as const, provides: [at(o.contract, o.contract.version, { methods: d.methods })] as const,
          build: Layer.succeed(o.contract.contractKey as never, impl as never) as never }) as unknown as AnyPlugin
        sub = yield* Scope.make()
        yield* rt.install(child).pipe(Scope.provide(sub), Effect.catch((e) => Effect.logWarning(`session child refused: ${JSON.stringify(e)}`)))
      }),
      onEnd: (_s, why) => Effect.gen(function* () { o.onEnd?.(why); if (sub) { const sc = sub; sub = undefined; yield* Scope.close(sc, Exit.void) } })    // the sub-scope close withdraws the child (BEH-BR-121)
    })
    yield* Effect.addFinalizer(() => link.stop)
  })) as never
}) as unknown as AnyPlugin
void Contract
