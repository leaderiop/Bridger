// The package surface the guides import (`@bridger/core`), for the doc-typecheck gate (report 05 R2). A prototype shim: the
// real packaging is the kit's, see references/kit.
import { Event, Events } from "./bus.js"
import * as Host from "./host.js"
export { Event }
export const Bridger = { Events, Event, make: Host.make } as const
export type { Actor } from "./gxp.js"
export { define as Plugin_define, type PluginDefinition } from "./plugin.js"
export { Contract } from "./contract.js"
export { CurrentCorrelation } from "./policy.js"
export { HookPoint } from "./hooks.js"
import { lazy } from "./manifest.js"
import { define } from "./plugin.js"
export const Plugin = { lazy, define } as const
