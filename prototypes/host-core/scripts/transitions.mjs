// Reads references/core/transitions.yaml (a restricted shape: `key: value`, `key: [a, b]`, and one `name: {op: outcome, ...}` per line).
import { readFileSync } from "node:fs"
export const YAML_PATH = new URL("../../../references/core/transitions.yaml", import.meta.url)
export const readTransitions = () => {
  const out = { operations: [], edges: [], rows: {}, inFlight: {} }
  let section
  for (const raw of readFileSync(YAML_PATH, "utf8").split("\n")) {
    const line = raw.replace(/\s+$/, "")
    if (!line || line.startsWith("#")) continue
    let m
    if ((m = line.match(/^(operations|edges): \[(.*)\]$/))) { out[m[1]] = m[2].split(",").map((s) => s.trim()); continue }
    if ((m = line.match(/^(rows|in-flight):$/))) { section = m[1] === "rows" ? out.rows : out.inFlight; continue }
    if ((m = line.match(/^  ([\w-]+): \{(.*)\}$/)) && section) {
      section[m[1]] = Object.fromEntries(m[2].split(",").map((kv) => kv.trim().split(/: (.*)/s).slice(0, 2)))
      continue
    }
    throw new Error(`transitions.yaml: cannot read line: ${line}`)
  }
  return out
}
export const render = (t) => {
  const table = (name, rows) => `export const ${name}: Readonly<Record<string, Readonly<Record<string, string>>>> = {\n${Object.entries(rows).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join("\n")}\n}\n`
  return `// GENERATED from references/core/transitions.yaml by scripts/gen-legality.mjs. Do not edit.\n${table("STATE_TABLE", t.rows)}${table("FLIGHT_TABLE", t.inFlight)}`
}
