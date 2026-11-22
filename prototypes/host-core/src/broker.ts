// Broker (references/core behaviour 19, BEH-BR-168): one stable base service whose every call is leased on a chosen
// contribution of a contract registry. Prototype; built only from Registry and the CurrentCall seam.
import { Effect, Option, Stream, type Scope } from "effect"
import { ContributionUnavailable } from "./errors.js"
import { CurrentCall } from "./policy.js"
import * as Registry from "./registry.js"
import type { Contract } from "./contract.js"

/** `"first"`: the first entry of the view (priority ascending, then id, BEH-BR-165); or a function choosing an id per call, `undefined` for none. */
export type Select<A> = "first" | ((view: Registry.RegistryView<A>, call: { readonly method: string; readonly args: ReadonlyArray<unknown> }) => string | undefined)
/** Chooses by a key the call carries: the contribution whose id `keyOf` returns. */
export const byKey = <A>(keyOf: (call: { readonly method: string; readonly args: ReadonlyArray<unknown> }) => string | undefined): Select<A> => (_view, call) => keyOf(call)

export interface Broker<Shape> {
  /** The registry implementations contribute to: `add(id, impl, { implements })`, checked by BEH-BR-233. */
  readonly registry: Registry.Registry<Shape>
  /** The stable facade; provide it as a base service or from one plugin. */
  readonly service: Shape
}
export const make = <Self, Shape extends object>(contract: Contract<Self, Shape>, options: {
  readonly name?: string; readonly range?: string; readonly select?: Select<Shape>; readonly drainTimeout?: number | "forever"
} = {}): Effect.Effect<Broker<Shape>, never, Scope.Scope> => Effect.gen(function* () {
  const name = options.name ?? contract.key
  const registry = yield* Registry.make<Shape>({ name, contract, ...(options.range !== undefined ? { range: options.range } : {}), ...(options.drainTimeout !== undefined ? { drainTimeout: options.drainTimeout } : {}) })
  const select = options.select ?? "first"
  const choose = (method: string, args: ReadonlyArray<unknown>) => Effect.map(registry.view, (view) => select === "first" ? view.entries[0]?.id : select(view, { method, args }))
  // One reselection when the chosen contribution is withdrawn between choice and lease (BEH-BR-168).
  const call = <B, E, R>(method: string, args: ReadonlyArray<unknown>, run: (value: Shape) => Effect.Effect<B, E, R>) => {
    const attempt = (left: number): Effect.Effect<B, E | ContributionUnavailable | import("./errors.js").LeaseRevoked | import("./errors.js").LeaseTimeout, R> => Effect.gen(function* () {
      const id = yield* choose(method, args)
      if (id === undefined) return yield* Effect.fail(new ContributionUnavailable({ id: name }))
      const info = yield* CurrentCall.get
      if (Option.isSome(info)) info.value.contributed(id)
      return yield* registry.use(id, run).pipe(Effect.catchIf((e): e is ContributionUnavailable => (e as { _tag?: string })?._tag === "ContributionUnavailable" && left > 0, () => attempt(left - 1)))
    })
    return attempt(1)
  }
  // shortcut: a stream method is leased while the Stream value is produced, not while it is consumed; hold it for its lifetime when Registry grows a scoped hold.
  const service = Object.fromEntries(contract.descriptor.methods.map((m) => [m, (...args: Array<unknown>) => {
    const member = (value: Shape): unknown => {
      const f = (value as Record<string, unknown>)[m]
      if (typeof f !== "function") throw new Error(`broker ${name}: contribution member ${m} is not a function`)
      return f.apply(value, args)
    }
    // The member's effect runs inside the lease; a stream's lease covers producing it only (see shortcut).
    return contract.methods[m]?.stream === true
      ? Stream.unwrap(call(m, args, (v) => Effect.sync(() => member(v) as Stream.Stream<unknown, unknown, unknown>)))
      : call(m, args, (v) => Effect.suspend(() => member(v) as Effect.Effect<unknown, unknown, unknown>))
  }])) as unknown as Shape
  return { registry, service }
})
export const Broker = { make, byKey }
