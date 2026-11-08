// Plugin definition (references/core behaviour 01). The build is an Effect Layer whose
// input may not exceed the declared requirements and whose output must cover the
// declared provisions — both checked by the compiler through `define`.
import { Effect, Layer, type Context, type Schema } from "effect"
import type { ActivationFailed, PluginRemoved } from "./errors.js"
import type { OperationOptions } from "./gxp.js"
import type { PluginConfig } from "./config.js"
import { PluginRuntime } from "./runtime.js"

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
  /** Services used if present; never gate activation (BEH-BR-129). */
  readonly optional?: Keys
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
  /** State handoff (BEH-BR-345): export/import run against the activation's own services. */
  readonly handoff?: {
    readonly version: string
    readonly schema: Schema.Codec<any, any>
    readonly export: Effect.Effect<unknown, unknown, any>
    readonly import: (state: any) => Effect.Effect<void, unknown, any>
    readonly accepts?: ReadonlyArray<string>
    readonly upgrade?: (from: { readonly version: string; readonly encoded: unknown }) => Effect.Effect<unknown, unknown>
    readonly alsoOn?: ReadonlyArray<"restart" | "reconfigure">
  }
  /** Optional on an eager definition (BEH-BR-242); kept as given. */
  readonly manifest?: import("./manifest.js").PluginManifest
  /** Set by `group` only: the handle's awaitActive waits for every member (BEH-BR-127). */
  readonly group?: true
}

/** `Plugin.Any` (BEH-BR-001): a compile-time brand only; `define` adds no property at run time. */
declare const PluginBrand: unique symbol
// The build is erased here. G-P15 was not adopted (CCR-BR-029): effect 4.0.0 declares `Layer<in ROut, out E, out RIn>`,
// and the spec's `build: Layer<never, unknown, any>` accepts every defined build; the erased type also conforms.
export type PluginAny = Omit<PluginDefinition<Keys, Keys, unknown>, "build"> & { readonly build: unknown; readonly [PluginBrand]: true }
export const define = <const R extends Keys, const P extends Keys, E>(
  definition: PluginDefinition<R, P, E>
): PluginDefinition<R, P, E> & { readonly [PluginBrand]: true } => definition as PluginDefinition<R, P, E> & { readonly [PluginBrand]: true }

export type AnyPlugin = PluginDefinition<Keys, Keys, unknown>

/** A consumer-side decoration of one key (BEH-BR-151). */
export interface Interception<S = any> {
  readonly key: Context.Key<any, S>
  readonly wrap: (service: S, consumer: { readonly pluginId: string; readonly realm: string }) => S
}

export interface InstallOptions extends OperationOptions {
  readonly realm?: string
  readonly config?: unknown
  readonly disabled?: boolean
  readonly intercept?: ReadonlyArray<Interception>
  readonly mandatory?: ReadonlyArray<import("./policy.js").MandatoryInterception>   // BEH-BR-260
  readonly allowChildren?: boolean                                                 // BEH-BR-263; default true
}

export interface PluginHandle {
  readonly id: string
  readonly realm: string
  readonly awaitActive: Effect.Effect<void, ActivationFailed | PluginRemoved>
}

/** `Plugin.group` (BEH-BR-127): sugar over children — provides nothing, mounts each member as a child. */
export const group = (id: string, members: ReadonlyArray<AnyPlugin>): AnyPlugin => ({
  id, requires: [], provides: [], group: true,
  build: Layer.effectDiscard(Effect.gen(function* () {
    const runtime = yield* PluginRuntime
    for (const m of members) yield* runtime.install(m)
  })) as AnyPlugin["build"]
})
