import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// `@bridger/kit/sdk` is the package path generated SDK modules import; here it is the prototype's runtime.
// `--experimental-vm-modules` enables `vm.SourceTextModule` for the ES module evaluator (src/evaluator.ts) and nothing else.
export default defineConfig({
  resolve: { alias: { "@bridger/kit/sdk": fileURLToPath(new URL("./src/sdk.ts", import.meta.url)) } },
  test: { poolOptions: { forks: { execArgv: ["--experimental-vm-modules"] } } }
})
