// The evidence pack (gxp BEH-GX-130–132): canonical JSON files, a manifest naming every file by SHA-256, a pack digest over the manifest's canonical
// text, and a verifier that reports each difference by path. QA signatures (BEH-GX-135), the rendered reports (134) and diffPacks (136) are not built.
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { OqEvidence, Outcome, TraceRow } from "./evidence.js"
import { rollup } from "./evidence.js"

/** RFC 8785 for the values a pack holds: object keys sorted by UTF-16 code units, no whitespace, ECMAScript number and string forms. */
export const canonical = (v: unknown): string => {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v)
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("not a JSON number"); return JSON.stringify(v) }
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  if (typeof v === "object") return `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
  throw new Error(`not a JSON value: ${typeof v}`)
}
const sha = (b: Buffer | string) => `sha256:${createHash("sha256").update(b).digest("hex")}`
export const STATEMENT = "This pack records executed results and their gaps. It is not a qualification. Results are the test runner's."

const WORST: ReadonlyArray<Outcome | "partial"> = ["fail", "not covered", "skipped", "partial", "pass"]
/** coverage.json (BEH-GX-131): each requirement row's outcome and tests; each behaviour's citing rows and the worst of their outcomes; an uncited behaviour is not covered. */
export const coverage = (ev: OqEvidence, rows: ReadonlyArray<TraceRow>) => {
  const reqs = rollup(ev, rows)
  const requirements = Object.keys(reqs).sort().map((id) => ({ id, ...reqs[id]!, tests: [...new Set(rows.find((r) => r.id === id)!.behaviours.flatMap((b) => (ev.requirements[b]?.tests ?? []).map((t) => t.id)))].sort() }))
  const behaviours = Object.keys(ev.requirements).sort().map((id) => {
    const citing = rows.filter((r) => r.behaviours.includes(id)).map((r) => r.id).sort()
    const outs = citing.map((c) => reqs[c]!.outcome)
    const outcome = citing.length === 0 ? "not covered" : WORST.find((w) => outs.includes(w))!
    return { id, requirements: citing, outcome }
  })
  return { requirements, behaviours }
}

export interface PackInput {
  readonly generatedAt: string; readonly packageVersion: string; readonly coreVersion: string
  readonly oq: unknown; readonly deviations: ReadonlyArray<{ readonly kind: string; readonly subject: string }>; readonly coverage: unknown
  readonly attachments?: ReadonlyArray<{ readonly as: string; readonly bytes: Buffer }>
}
const write = (dir: string, path: string, content: Buffer | string) => { const full = join(dir, path); mkdirSync(join(full, ".."), { recursive: true }); writeFileSync(full, content) }
const jsonFile = (v: unknown) => canonical(v) + "\n"

/** Writes the pack and returns its digest: the SHA-256 of the manifest's canonical text, the bytes of manifest.json without its final line feed. */
export const writeEvidencePack = (dir: string, p: PackInput): { packDigest: string } => {
  const sorted = [...p.deviations].sort((a, b) => (a.kind + "\0" + a.subject < b.kind + "\0" + b.subject ? -1 : 1))
  const contents = new Map<string, Buffer | string>([["oq.json", jsonFile(p.oq)], ["deviations.json", jsonFile(sorted)], ["coverage.json", jsonFile(p.coverage)]])
  const inputs = (p.attachments ?? []).map((a) => ({ as: a.as, digest: sha(a.bytes) }))
  for (const a of p.attachments ?? []) contents.set(`attachments/${a.as}`, a.bytes)             // byte for byte, no decoding or conversion
  for (const [path, c] of contents) write(dir, path, c)
  const files = [...contents].map(([path, c]) => ({ path, digest: sha(Buffer.from(c)), bytes: Buffer.byteLength(c) })).sort((a, b) => (a.path < b.path ? -1 : 1))
  const manifest = { format: "bridger-gx-evidence/1", package: { name: "@bridger/gxp", version: p.packageVersion }, core: { version: p.coreVersion }, generatedAt: p.generatedAt,
    inputs: inputs.sort((a, b) => (a.as < b.as ? -1 : 1)), files, statement: STATEMENT }
  write(dir, "manifest.json", jsonFile(manifest))
  return { packDigest: sha(canonical(manifest)) }
}

const walk = (dir: string, base = dir): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)])
/** Recomputes every file's digest and the pack digest; reports each difference by path. A pack without differences "matches the manifest" and is not called authentic. */
export const verifyEvidencePack = (dir: string, expectedDigest?: string): { matches: boolean; differences: ReadonlyArray<{ path: string; kind: "changed" | "missing" | "unlisted" | "manifest" }>; packDigest: string; statement: string } => {
  const text = readFileSync(join(dir, "manifest.json"), "utf8")
  const manifest = JSON.parse(text) as { files: Array<{ path: string; digest: string }> }
  const differences: Array<{ path: string; kind: "changed" | "missing" | "unlisted" | "manifest" }> = []
  const body = text.endsWith("\n") ? text.slice(0, -1) : text
  if (canonical(manifest) !== body) differences.push({ path: "manifest.json", kind: "manifest" })        // not in canonical form: edited or re-serialised
  const listed = new Set(manifest.files.map((f) => f.path))
  for (const f of manifest.files) {
    let bytes: Buffer
    try { bytes = readFileSync(join(dir, f.path)) } catch { differences.push({ path: f.path, kind: "missing" }); continue }
    if (sha(bytes) !== f.digest) differences.push({ path: f.path, kind: "changed" })
  }
  for (const f of walk(dir)) if (f !== "manifest.json" && f !== "signatures.json" && f !== "assessments.json" && !listed.has(f)) differences.push({ path: f, kind: "unlisted" })
  const packDigest = sha(body)
  if (expectedDigest !== undefined && packDigest !== expectedDigest) differences.push({ path: "manifest.json", kind: "manifest" })
  return { matches: differences.length === 0, differences, packDigest, statement: differences.length === 0 ? "every file matches the manifest" : `${differences.length} difference(s) from the manifest` }
}
