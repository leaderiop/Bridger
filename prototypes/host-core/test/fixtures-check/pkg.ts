import { Context, Effect, Layer, Schema } from "effect"
import { Contract } from "../../src/contract.js"
import { define } from "../../src/plugin.js"
import type { PluginManifest } from "../../src/manifest.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
class Db extends Context.Service<Db, { readonly n: number }>()("example/Db") {}
class Cache extends Context.Service<Cache, { readonly n: number }>()("example/Cache") {}
export const contracts = [Contract.makeUnchecked(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.Struct({ text: Schema.String }), success: Schema.String }) } })]
export const manifests: PluginManifest[] = [{ manifestVersion: 1, id: "boards", version: "1.0.0", provides: [], requires: [{ serviceId: "example/Db", internal: true }] } as PluginManifest]
export const definitions = [define({ id: "boards", requires: [Db] as const, provides: [] as const, meta: { version: "1.0.0" }, build: Layer.effectDiscard(Effect.void) as never }), define({ id: "bare", requires: [Cache] as const, provides: [] as const, build: Layer.effectDiscard(Effect.void) as never })]
