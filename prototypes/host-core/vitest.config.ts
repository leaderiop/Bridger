import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// `@bridger/kit/sdk` is the package path generated SDK modules import; here it is the prototype's runtime.
export default defineConfig({ resolve: { alias: { "@bridger/kit/sdk": fileURLToPath(new URL("./src/sdk.ts", import.meta.url)) } } })
