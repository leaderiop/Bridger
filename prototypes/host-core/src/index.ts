// The package surface the guides import (`@bridger/core`), for the doc-typecheck gate (report 05 R2). A prototype shim: the
// real packaging is the kit's, see references/kit.
import { Event, Events } from "./bus.js"
export { Event }
export const Bridger = { Events, Event } as const
export { define as Plugin_define, type PluginDefinition } from "./plugin.js"
export { Contract } from "./contract.js"
