// Plugin definition (references/core behaviour 01). The build is an Effect Layer whose
// input may not exceed the declared requirements and whose output must cover the
// declared provisions — both checked by the compiler through `define`.
import type { Context, Effect, Layer, Schema } from "effect"
import type { PluginConfig } from "./config.js"
import type { PluginRuntime } from "./runtime.js"

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
  /** The build sees its requirements plus the per-activation Plugin.Runtime and Plugin.Config (BEH-BR-089, 097). */
  readonly build: Layer.Layer<IdentifiersOf<P>, E, IdentifiersOf<R> | PluginRuntime | PluginConfig>
  readonly meta?: { readonly version?: string; readonly digest?: string; readonly description?: string }
  /** Decoded before build (BEH-BR-097); top-level fields named in `volatile` may change in place (BEH-BR-102). */
  readonly config?: Schema.Codec<any, any>
  readonly volatile?: ReadonlyArray<string>
  /** Health checks while active (BEH-BR-092); durations in ms in this prototype. */
  readonly health?: {
    readonly check: Effect.Effect<void, unknown, IdentifiersOf<R>>
    readonly every: number
    readonly timeout: number
    readonly failureThreshold: number
  }
}

export const define = <const R extends Keys, const P extends Keys, E>(
  definition: PluginDefinition<R, P, E>
): PluginDefinition<R, P, E> => definition

export type AnyPlugin = PluginDefinition<Keys, Keys, unknown>
