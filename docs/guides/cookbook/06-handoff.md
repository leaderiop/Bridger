# Replace a plugin and keep its state

Use this when: You ship a new version of a running plugin and its in-memory state must survive.

```ts
// type-checked: test test/cookbook/06-handoff.test.ts
class Counter extends Context.Service<Counter, { readonly count: Ref.Ref<number> }>()("example/Counter") {}
const State = Schema.Struct({ n: Schema.Number })

export const counter = (version: string) => definePlugin({
  id: "example/counter",
  provides: Counter,
  meta: { version },
  make: Effect.gen(function* () { return { count: yield* Ref.make(0) } }),
  handoff: {
    version: "1",                                           // the state's version, not the plugin's
    schema: State,
    export: Effect.gen(function* () { return { n: yield* Ref.get((yield* Counter).count) } }),
    import: (state: { n: number }) => Effect.gen(function* () { yield* Ref.set((yield* Counter).count, state.n) })
  }
})
```

`export` runs against the old activation after it drains, `import` against the new one before it is published. The handoff `version` is the state's own, checked against the new definition's `accepts`.

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/06-handoff.test.ts`](../../../prototypes/host-core/test/cookbook/06-handoff.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [core 34](../../../references/core/behaviors/34-state-handoff.md) (BEH-BR-345 to 351).
