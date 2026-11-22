// `definePlugin`: the facade of @bridger/kit over core `define` (references/kit behaviours 01, BEH-KT-001..006).
// Sugar only: every form returns a core definition and adds no field (INV-KT-001). Report 05 R1 (DX-01).
import { Context, Effect, Layer, type Scope } from "effect"
import { PluginConfig } from "./config.js"
import { define, type IdentifiersOf, type Keys, type PluginDefinition } from "./plugin.js"
import type { PluginRuntime } from "./runtime.js"
import type { Schema } from "effect"

type Key = Context.Key<any, any>
type ShapeOf<K> = K extends Context.Key<any, infer S> ? S : never
type IdOf<K> = K extends Context.Key<infer I, any> ? I : never

/** A compile-time message: the reported type of a wrong call (BEH-KT-003). */
export interface KitTypeError<Message extends string, Detail = never> {
  readonly "~kitTypeError": Message
  readonly detail: Detail
}

type MakeFn<A, E, R, C> = Effect.Effect<A, E, R> | ((ctx: { readonly config: C }) => Effect.Effect<A, E, R>)
type Allowed<R extends Keys> = IdentifiersOf<R> | PluginRuntime | PluginConfig | Scope.Scope
type RequirementOf<F> = F extends (...a: any) => Effect.Effect<any, any, infer R> ? R : F extends Effect.Effect<any, any, infer R> ? R : never
/** `{}` when the requirements fit, else the field's type becomes the message. */
type Guard<Id extends string, What extends string, Field extends string, Used, R extends Keys> =
  [Exclude<Used, Allowed<R>>] extends [never] ? unknown
    : { readonly [F in Field]: KitTypeError<`${Id}: ${What} uses a service that requires does not declare`, Exclude<Used, Allowed<R>>> }
type LiteralId<Id extends string> = string extends Id ? { readonly id: KitTypeError<"plugin id must be a string literal"> } : unknown
type Overlap<Id extends string, R extends Keys, P extends Keys> =
  [Extract<IdentifiersOf<R>, IdentifiersOf<P>>] extends [never] ? unknown
    : { readonly provides: KitTypeError<`${Id}: a key is both required and provided`, Extract<IdentifiersOf<R>, IdentifiersOf<P>>> }

interface Common<Id extends string, R extends Keys, C> {
  readonly id: Id
  readonly requires?: R
  readonly optional?: Keys
  readonly config?: Schema.Codec<C, any>
  readonly volatile?: ReadonlyArray<keyof NoInfer<C> & string>
  readonly meta?: PluginDefinition["meta"]
  readonly health?: PluginDefinition<R>["health"]
  readonly manifest?: PluginDefinition["manifest"]
  readonly handoff?: PluginDefinition["handoff"]
  readonly closeTimeout?: PluginDefinition["closeTimeout"]
}

type Defined<R extends Keys, P extends Keys, E, C> = ReturnType<typeof define<R, P, E, C>>

/** A `make` or `run` function receives the value core decoded for this activation, never an override (BEH-KT-001). */
const configOf = Effect.map(Effect.service(PluginConfig), (c) => c.value)
const run1 = <A, E, R, C>(f: MakeFn<A, E, R, C>): Effect.Effect<A, E, R | PluginConfig> =>
  typeof f === "function" ? Effect.flatMap(configOf, (config) => (f as (c: { config: C }) => Effect.Effect<A, E, R>)({ config: config as C })) as Effect.Effect<A, E, R | PluginConfig> : f

const base = (spec: { readonly id: string; readonly requires?: Keys } & Record<string, any>) => {
  const { make: _m, run: _r, build: _b, provides: _p, ...rest } = spec
  return { ...rest, requires: spec.requires ?? [] }
}

// Form 1: one service.
export function definePlugin<const Id extends string, const R extends Keys = readonly [], K extends Key = never, E = never, MR = never, C = unknown>(
  spec: Common<Id, R, C> & { readonly provides: K; readonly make: MakeFn<ShapeOf<K>, E, MR, C> }
    & LiteralId<Id> & Guard<Id, "make", "make", RequirementOf<MakeFn<ShapeOf<K>, E, MR, C>>, R> & Overlap<Id, R, readonly [K]>
): Defined<R, readonly [K], E, C>
// Form 2: several services, a record of keys; `make` returns a record of implementations.
export function definePlugin<const Id extends string, const R extends Keys = readonly [], const P extends Readonly<Record<string, Key>> = {}, E = never, MR = never, C = unknown>(
  spec: Common<Id, R, C> & { readonly provides: P; readonly make: MakeFn<{ readonly [N in keyof P]: ShapeOf<P[N]> }, E, MR, C> }
    & LiteralId<Id> & Guard<Id, "make", "make", RequirementOf<MakeFn<{ readonly [N in keyof P]: ShapeOf<P[N]> }, E, MR, C>>, R>
): Defined<R, readonly P[keyof P][], E, C>
// Form 3: no service; `run` registers listeners, contributions or background work.
export function definePlugin<const Id extends string, const R extends Keys = readonly [], E = never, MR = never, C = unknown>(
  spec: Common<Id, R, C> & { readonly provides?: never; readonly run: MakeFn<void, E, MR, C> }
    & LiteralId<Id> & Guard<Id, "run", "run", RequirementOf<MakeFn<void, E, MR, C>>, R>
): Defined<R, readonly [], E, C>
// Form 4: the escape hatch, a core build layer checked exactly as `define` checks it.
export function definePlugin<const Id extends string, const R extends Keys = readonly [], const P extends Keys = readonly [], E = never, C = unknown>(
  spec: Common<Id, R, C> & { readonly provides: P; readonly build: Layer.Layer<IdentifiersOf<P>, E, IdentifiersOf<R> | PluginRuntime | PluginConfig> }
    & LiteralId<Id> & Overlap<Id, R, P>
): Defined<R, P, E, C>
export function definePlugin(spec: any): any {
  const head = base(spec)
  if ("build" in spec) return define({ ...head, provides: spec.provides, build: spec.build })
  if ("run" in spec) return define({ ...head, provides: [], build: Layer.effectDiscard(run1(spec.run)) as never })
  const p = spec.provides
  if (Context.isKey(p)) {
    return define({ ...head, provides: [p], build: Layer.effect(p, run1(spec.make)) as never })
  }
  const names = Object.keys(p)
  return define({
    ...head, provides: names.map((n) => p[n]),
    build: Layer.effectContext(Effect.map(run1(spec.make as MakeFn<Record<string, unknown>, unknown, never, unknown>), (impl) => {
      let ctx = Context.empty()
      for (const n of names) ctx = Context.add(ctx, p[n], impl[n])
      return ctx
    })) as never
  })
}

export type { IdOf }
