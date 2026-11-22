import { Context, Effect, Schema } from "effect"
import { Contract } from "../../src/contract.js"
class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
export const contracts = [Contract.make(Board, { version: "1.3.0", methods: { post: Contract.method({ payload: Schema.Struct({ text: Schema.String, mood: Schema.String }), success: Schema.String }) } })]
