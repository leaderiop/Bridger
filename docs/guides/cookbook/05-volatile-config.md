# Add a volatile configuration field

Use this when: A setting should change without restarting the plugin (a retry count, a log level).

```ts
// type-checked: test test/cookbook/05-volatile-config.test.ts
class Mailer extends Context.Service<Mailer, { readonly retries: Effect.Effect<number>; readonly host: string }>()("example/Mailer") {}

export const mailer = definePlugin({
  id: "example/mailer",
  provides: Mailer,
  config: Schema.Struct({ host: Schema.String, retries: Schema.Number }),
  volatile: ["retries"],                                   // a change to `retries` is applied in place; `host` restarts
  make: ({ config }) => Effect.gen(function* () {
    const cfg = yield* PluginConfig                        // `current` follows volatile changes, `value` is the build's
    return { host: config.host, retries: Effect.map(cfg.current, (c) => (c as { retries: number }).retries) }
  })
})
```

Name the field in `volatile`. `value` is what the build saw; `PluginConfig.current` follows changes. A change to any other field restarts the plugin and its dependents.

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/05-volatile-config.test.ts`](../../../prototypes/host-core/test/cookbook/05-volatile-config.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [core 11](../../../references/core/behaviors/11-configuration.md) (BEH-BR-097 to 103).
