import { Context, Effect, Schema } from "effect"
import { Contract } from "../../src/contract.js"
class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
export const contracts = [Contract.make(Board, { version: "1.2.0", methods: { post: Contract.method({ payload: Schema.Struct({ text: Schema.String }), success: Schema.String }) } })]
