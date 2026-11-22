// Entry point: `npx tsx src/bin/check.ts <package-module> <lockfile> [--write-lock]`.
import { main } from "../check.js"
process.exitCode = await main(process.argv.slice(2))
