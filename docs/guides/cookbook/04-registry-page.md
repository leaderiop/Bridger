# Contribute a page to a registry

Use this when: Another plugin owns a slot (routes, settings pages, menu entries) and you add an entry to it.

```ts
// type-checked: test test/cookbook/04-registry-page.test.ts
export interface Page { readonly title: string; readonly path: string }
export class Pages extends Context.Service<Pages, Registry.Registry<Page>>()("example/Pages") {}

// a plugin adds its page: removed with the plugin, listed in `inspect` by id only
export const settings = definePlugin({
  id: "billing/settings",
  requires: [Pages],
  run: Effect.gen(function* () {
    const pages = yield* Pages
    yield* pages.add("billing/settings", { title: "Billing", path: "/settings/billing" }, { priority: 10 })
  })
})
```

The registry is a base service. `add` ties the contribution to the plugin's scope: it leaves with the plugin. `inspect` lists contributions by id only, never the value.

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/04-registry-page.test.ts`](../../../prototypes/host-core/test/cookbook/04-registry-page.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [core 19](../../../references/core/behaviors/19-contribution-registry.md) (BEH-BR-161 to 168), [REACT-UI-PLUGINS](../../REACT-UI-PLUGINS.md).
