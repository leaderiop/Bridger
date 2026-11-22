// `@bridger/kit/testing` (kit 02): the entry the guides import. `it` is the runner's `it` with `plugin` added (BEH-KT-011).
import { it as vitestIt } from "vitest"
import { PluginTest, plugin } from "./plugin-test.js"

export { PluginTest }
export const it: typeof vitestIt & { readonly plugin: typeof plugin } = Object.assign(((...a: Parameters<typeof vitestIt>) => vitestIt(...a)) as unknown as typeof vitestIt, vitestIt, { plugin })
