// Plugin definition (references/core behaviour 01). The build is an Effect Layer whose
// input may not exceed the declared requirements and whose output must cover the
// declared provisions — both checked by the compiler through `define`.
import type { Context, Layer } from "effect"

export type Keys = ReadonlyArray<Context.Key<any, any>>
// Distributive form. The form written in references/core (`K[number] extends Context.Key<infer I, any> ? I : never`)
// is non-distributive: for an empty tuple `K[number]` is `never`, the check infers `I = unknown`, and a plugin
// that provides nothing would have to build a Layer providing `unknown` (prototype finding G10).
export type IdentifiersOf<K extends Keys> = K[number] extends infer X ? (X extends Context.Key<infer I, any> ? I : never) : never
export type ServicesOf<K extends Keys> = { readonly [I in keyof K]: K[I] extends Context.Key<any, infer S> ? S : never }

export interface PluginDefinition<R extends Keys = Keys, P extends Keys = Keys, E = unknown> {
  readonly id: string
  readonly requires: R
  readonly provides: P
  readonly build: Layer.Layer<IdentifiersOf<P>, E, IdentifiersOf<R>>
  readonly meta?: { readonly version?: string; readonly digest?: string }
}

export const define = <const R extends Keys, const P extends Keys, E>(
  definition: PluginDefinition<R, P, E>
): PluginDefinition<R, P, E> => definition

export type AnyPlugin = PluginDefinition<Keys, Keys, unknown>
