// Regenerates src/legality.table.ts from the transition ledger: `node scripts/gen-legality.mjs`.
import { writeFileSync } from "node:fs"
import { readTransitions, render } from "./transitions.mjs"
writeFileSync(new URL("../src/legality.table.ts", import.meta.url), render(readTransitions()))
