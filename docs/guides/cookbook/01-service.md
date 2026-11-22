# Add a service plugin

Use this when: You have something other plugins should be able to call: a clock, a mailer, a repository.

```ts
// type-checked: test test/cookbook/01-service.test.ts
class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => Effect.Effect<string> }>()("example/Greeter") {}

export const greeter = definePlugin({
  id: "example/greeter",
  provides: Greeter,
  make: Effect.succeed({ greet: (name: string) => Effect.succeed(`Hello, ${name}!`) })
})
```

`definePlugin` with a key in `provides` and an effect in `make` writes the Layer. The host starts the plugin when what it requires is available; consumers reach the service through `host.use` or by requiring the key.

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/01-service.test.ts`](../../../prototypes/host-core/test/cookbook/01-service.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [kit BEH-KT-001](../../../references/kit/behaviors/01-plugin-facade.md), core [01](../../../references/core/behaviors/01-plugin-definition.md).
