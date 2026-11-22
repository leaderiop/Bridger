// Entry point: `npx tsx bin/check.ts <package-module> <lockfile> [--write-lock]`.
import { main } from "../src/check.js"
process.exitCode = await main(process.argv.slice(2))
