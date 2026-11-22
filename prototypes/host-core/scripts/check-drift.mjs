// Prototype drift (report 07, R5): a change to a behaviour the prototype names must touch the prototype,
// or a commit in the range must carry a `prototype-exempt: <reason>` line.   node scripts/check-drift.mjs <rev>
import { execFileSync } from "node:child_process"
import { collect, root } from "./gen-correspondence.mjs"

const git = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const sections = (text) => {
  const m = new Map()
  for (const part of text.split(/^(?=## (?:BEH|INV)-[A-Z]+-\d{3}:)/m)) {
    const id = /^## ((?:BEH|INV)-[A-Z]+-\d{3}):/.exec(part)?.[1]
    if (id) m.set(id, part)
  }
  return m
}

export function touched(rev) {
  const files = git("diff", "--name-only", `${rev}..HEAD`, "--", "references").split("\n").filter((f) => /\/(behaviors\/.+|invariants)\.md$/.test(f))
  const ids = []
  for (const f of files) {
    const before = sections(((p) => { try { return git("show", `${rev}:${p}`) } catch { return "" } })(f))
    const after = sections(git("show", `HEAD:${f}`))
    for (const [id, body] of after) if (before.has(id) && before.get(id) !== body) ids.push(id)
  }
  return ids
}

export const decide = (named, protoChanged, exempt) => ({ ok: !named.length || protoChanged || exempt, named })

export function verdict(rev) {
  const { cites } = collect()
  const named = touched(rev).filter((id) => cites.has(id))
  const proto = git("diff", "--name-only", `${rev}..HEAD`, "--", "prototypes/host-core/src", "prototypes/host-core/test").trim()
  const exempt = /^prototype-exempt: \S/m.test(git("log", `${rev}..HEAD`, "--format=%B"))
  return decide(named, Boolean(proto), exempt)
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const rev = process.argv[2]
  if (!rev) { console.error("usage: check-drift.mjs <rev>"); process.exit(2) }
  const v = verdict(rev)
  console.log(`drift: ${v.named.length} prototyped behaviour(s) changed since ${rev}`)
  if (!v.ok) console.log(`FAIL ${v.named.join(", ")} changed with no prototype change and no prototype-exempt line`)
  console.log(`${v.ok ? 0 : 1} failure(s)`)
  process.exit(v.ok ? 0 : 1)
}
