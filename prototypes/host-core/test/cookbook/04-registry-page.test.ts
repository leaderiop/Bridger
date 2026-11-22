// Cookbook 4: contribute a settings page to a registry another plugin hosts (the slot a UI adapter renders).
import { Context, Effect, Scope } from "effect"
import { describe, expect, it } from "vitest"
import { definePlugin } from "../../src/kit.js"
import * as Registry from "../../src/registry.js"
import type { AnyPlugin } from "../../src/plugin.js"
import { drive, idle } from "../fixtures.js"
import { as, run } from "../p4fixtures.js"

// #region recipe
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
// #endregion

describe("cookbook 4: a page in a registry", () => {
  it("the page is in the view while the plugin is active and gone after it is removed", async () => {
    const registry = Effect.runSync(Effect.scoped(Registry.make<Page>({ name: "pages" })))
    await run((host) => Effect.gen(function* () {
      yield* host.install(settings as unknown as AnyPlugin, as()); yield* idle(host)
      expect((yield* registry.view).entries.map((e) => e.id)).toEqual(["billing/settings"])
      expect((yield* host.inspect("billing/settings")).contributions.map((c) => c.id)).toEqual(["billing/settings"])
      yield* drive(host, host.remove("billing/settings", as())); yield* idle(host)
      expect((yield* registry.view).entries).toEqual([])
    }), { options: { base: [[Pages, registry]] } })
  })
})
