// The evidence pack (gxp BEH-GX-130–132): canonical JSON files, a manifest naming every file by SHA-256, a pack digest over the manifest's canonical
// text, and a verifier that reports each difference by path; deviation ids and assessments (133), the derived report (134), QA signatures (135) and
// diffPacks (136). The signature port is a function here, not the full SignatureCaptureShape of gxp 10.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
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
  readonly requester: { readonly id: string; readonly kind: "user" | "service" }   // who asked for the pack: recorded in the manifest, so a signature's separation of duties never rests on the signer's word
  readonly oq: unknown; readonly deviations: ReadonlyArray<{ readonly kind: string; readonly source: string; readonly subject: string; readonly detail: string; readonly state: "open" }>; readonly coverage: unknown
  readonly attachments?: ReadonlyArray<{ readonly as: string; readonly bytes: Buffer }>
}
const write = (dir: string, path: string, content: Buffer | string) => { const full = join(dir, path); mkdirSync(join(full, ".."), { recursive: true }); writeFileSync(full, content) }
const jsonFile = (v: unknown) => canonical(v) + "\n"
/** "DEV-" and the first 12 hex digits of SHA-256(JCS({ kind, source, subject })): the same inputs give the same id. */
export const deviationId = (d: { kind: string; source: string; subject: string }) => `DEV-${createHash("sha256").update(canonical({ kind: d.kind, source: d.source, subject: d.subject })).digest("hex").slice(0, 12)}`
const readJson = <T>(dir: string, f: string, fallback: T): T => existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) as T : fallback

/** Writes the pack and returns its digest: the SHA-256 of the manifest's canonical text, the bytes of manifest.json without its final line feed. */
export const writeEvidencePack = (dir: string, p: PackInput): { packDigest: string } => {
  const sorted = p.deviations.map((d) => ({ id: deviationId(d), ...d })).sort((a, b) => (a.id < b.id ? -1 : 1))
  const contents = new Map<string, Buffer | string>([["oq.json", jsonFile(p.oq)], ["deviations.json", jsonFile(sorted)], ["coverage.json", jsonFile(p.coverage)]])
  const names = new Set<string>()
  for (const a of p.attachments ?? []) {                                                              // one plain segment, no duplicates: an attachment never writes outside the pack (S65)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(a.as) || a.as === ".." || names.has(a.as)) throw new Error(`attachment name refused: ${a.as}`)
    names.add(a.as)
  }
  const inputs = (p.attachments ?? []).map((a) => ({ as: a.as, digest: sha(a.bytes) }))
  for (const a of p.attachments ?? []) contents.set(`attachments/${a.as}`, a.bytes)             // byte for byte, no decoding or conversion
  for (const [path, c] of contents) write(dir, path, c)
  const files = [...contents].map(([path, c]) => ({ path, digest: sha(Buffer.from(c)), bytes: Buffer.byteLength(c) })).sort((a, b) => (a.path < b.path ? -1 : 1))
  const manifest = { format: "bridger-gx-evidence/1", package: { name: "@bridger/gxp", version: p.packageVersion }, core: { version: p.coreVersion }, generatedAt: p.generatedAt, requester: { id: p.requester.id, kind: p.requester.kind },
    inputs: inputs.sort((a, b) => (a.as < b.as ? -1 : 1)), files, statement: STATEMENT }
  write(dir, "manifest.json", jsonFile(manifest))
  return { packDigest: sha(canonical(manifest)) }
}

const walk = (dir: string, base = dir): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1)])
/** Recomputes every file's digest and the pack digest; reports each difference by path. A pack without differences "matches the manifest" and is not called authentic. */
export const verifyEvidencePack = (dir: string, expectedDigest?: string, expectedHeads?: PackHeads): { matches: boolean; differences: ReadonlyArray<{ path: string; kind: "changed" | "missing" | "unlisted" | "manifest" | "signature" | "chain" }>; packDigest: string; statement: string } => {
  const text = readFileSync(join(dir, "manifest.json"), "utf8")
  const manifest = JSON.parse(text) as { files: Array<{ path: string; digest: string }> }
  const differences: Array<{ path: string; kind: "changed" | "missing" | "unlisted" | "manifest" | "signature" | "chain" }> = []
  const body = text.endsWith("\n") ? text.slice(0, -1) : text
  if (canonical(manifest) !== body) differences.push({ path: "manifest.json", kind: "manifest" })        // not in canonical form: edited or re-serialised
  const listed = new Set(manifest.files.map((f) => f.path))
  for (const f of manifest.files) {
    let bytes: Buffer
    try { bytes = readFileSync(join(dir, f.path)) } catch { differences.push({ path: f.path, kind: "missing" }); continue }
    if (sha(bytes) !== f.digest) differences.push({ path: f.path, kind: "changed" })
  }
  for (const f of walk(dir)) if (!["manifest.json", "signatures.json", "assessments.json", "report.md", "report.html"].includes(f) && !listed.has(f)) differences.push({ path: f, kind: "unlisted" })
  const packDigest = sha(body)
  // The reports are outside the manifest: they are checked by re-rendering them from the JSON files (BEH-GX-130, 134).
  for (const [f, render] of [["report.md", renderReport], ["report.html", renderHtml]] as const)
    if (existsSync(join(dir, f)) && readFileSync(join(dir, f), "utf8") !== render(dir)) differences.push({ path: f, kind: "changed" })
  for (const f of ["assessments.json", "signatures.json"]) if (chainBroken(readJson<Array<{ prev?: string }>>(dir, f, []))) differences.push({ path: f, kind: "chain" })   // an entry inserted, removed or edited outside the appenders
  // BEH-GX-135: a signature whose binding no longer matches the pack and its assessments says so.
  for (const sg of readJson<Array<{ bindingDigest: string }>>(dir, "signatures.json", [])) if (sg.bindingDigest !== bindingDigest(dir, packDigest)) differences.push({ path: "signatures.json", kind: "signature" })
  if (expectedHeads) { const h = packHeads(dir); for (const f of ["assessments", "signatures"] as const) if (expectedHeads[f] !== undefined && h[f] !== expectedHeads[f]) differences.push({ path: `${f}.json`, kind: "chain" }) }   // a removed tail or an edited last entry (S66)
  if (expectedDigest !== undefined && packDigest !== expectedDigest) differences.push({ path: "manifest.json", kind: "manifest" })
  return { matches: differences.length === 0, differences, packDigest, statement: differences.length === 0 ? "every file matches the manifest" : differences.every((d) => d.kind === "signature") ? "signature does not match the current pack" : `${differences.length} difference(s) from the manifest` }
}

// ---- chained appends (improvement report 06, S27): each entry of assessments.json and signatures.json carries `prev`, the digest of the entry before it
const entryDigest = (e: unknown) => sha(canonical(e))
/** The head of each append-only file: the digest of its last entry ("" when empty). The caller records it where the pack's owner keeps evidence (the audit chain) and passes it back to verify, because the files sit outside the manifest. */
export interface PackHeads { readonly assessments?: string; readonly signatures?: string }
export const packHeads = (dir: string): Required<PackHeads> => { const head = (f: string) => { const all = readJson<unknown[]>(dir, f, []); return all.length ? entryDigest(all.at(-1)) : "" }; return { assessments: head("assessments.json"), signatures: head("signatures.json") } }
const chained = (all: ReadonlyArray<unknown>, e: Record<string, unknown>) => [...all, { ...e, prev: all.length ? entryDigest(all.at(-1)) : "" }]
const chainBroken = (all: ReadonlyArray<{ prev?: string }>) => all.some((e, i) => e.prev !== (i === 0 ? "" : entryDigest(all[i - 1])))
// ---- assessments (BEH-GX-133)
export class AssessmentRefused { readonly _tag = "AssessmentRefused"; constructor(readonly deviationId: string, readonly reason: "unknown-deviation" | "reserved-actor" | "blank-assessment") {} }
const reserved = (a: { id: string }) => a.id.trim() === "" || a.id.startsWith("bridger:")
/** Appends an attributed assessment to assessments.json, outside the manifest; changes no other file and never the deviation it assesses. */
export const assessDeviation = (dir: string, a: { deviationId: string; by: { id: string; kind: string }; assessment: string; reference?: string }, now: () => Date): void => {
  const devs = readJson<Array<{ id: string }>>(dir, "deviations.json", [])
  if (!devs.some((d) => d.id === a.deviationId)) throw new AssessmentRefused(a.deviationId, "unknown-deviation")
  if (reserved(a.by)) throw new AssessmentRefused(a.deviationId, "reserved-actor")
  if (a.assessment.trim() === "") throw new AssessmentRefused(a.deviationId, "blank-assessment")
  const all = readJson<unknown[]>(dir, "assessments.json", [])
  write(dir, "assessments.json", jsonFile(chained(all, { deviationId: a.deviationId, actor: { id: a.by.id, kind: a.by.kind }, at: now().toISOString(), assessment: a.assessment, ...(a.reference ? { reference: a.reference } : {}) })))
}

// ---- derived report (BEH-GX-134)
/** A pure function of the pack's JSON files: the first line fixed, then the manifest statement, the OQ counts and every deviation. Written outside the manifest, since it names the pack digest. */
export const renderReport = (dir: string): string => {
  const text = readFileSync(join(dir, "manifest.json"), "utf8"), digest = sha(text.slice(0, -1))
  const m = JSON.parse(text) as { statement: string }, oq = readJson<{ counts?: Record<string, number>; statement?: string; runCounted?: boolean }>(dir, "oq.json", {})
  const devs = readJson<Array<{ id: string; kind: string; source: string; subject: string; detail: string; state: string }>>(dir, "deviations.json", [])
  const c = oq.counts ?? {}
  return [`Derived rendering of evidence pack ${digest}; the JSON files are the evidence.`, "", "## Statement", m.statement, "",
    "## OQ outcomes", `run counted: ${oq.runCounted}`, `fail: ${c.fail}, pass: ${c.pass}, skipped: ${c.skipped}, not covered: ${c.notCovered}`, oq.statement ?? "", "",
    `## Deviations (${devs.length})`, ...devs.map((d) => `- ${d.id} ${d.kind} ${d.source} ${d.subject}: ${d.detail} [${d.state}]`), ""].join("\n")
}
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
/** The same lines as report.md as one self-contained page: no script, no external resource, no timestamp of its own. */
export const renderHtml = (dir: string): string => {
  const lines = renderReport(dir).split("\n"); let list = false; const out: string[] = []
  for (const l of lines) {
    const li = l.startsWith("- ")
    if (list && !li) { out.push("</ul>"); list = false }
    if (li) { if (!list) { out.push("<ul>"); list = true } out.push(`<li>${esc(l.slice(2))}</li>`) }
    else if (l.startsWith("## ")) out.push(`<h2>${esc(l.slice(3))}</h2>`)
    else if (l !== "") out.push(`<p>${esc(l)}</p>`)
  }
  if (list) out.push("</ul>")
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Evidence pack report</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:2rem;max-width:60rem}</style></head><body>\n${out.join("\n")}\n</body></html>\n`
}
export const writeReport = (dir: string) => { write(dir, "report.md", renderReport(dir)); write(dir, "report.html", renderHtml(dir)) }

// ---- QA signatures (BEH-GX-135)
const bindingDigest = (dir: string, packDigest: string) => sha(canonical({ assessmentsDigest: sha(readJson<unknown[]>(dir, "assessments.json", []).length ? readFileSync(join(dir, "assessments.json")) : canonical([])), packDigest }))
export class SignatureRefused { readonly _tag = "SignatureRefused"; constructor(readonly reason: "signer-is-requester" | "malformed-answer" | "declined") {} }
export interface SignatureRequest { readonly ticketId: string; readonly bindingDigest: string; readonly rendered: string; readonly meaning: string }
/** The signer comes from the port; the pack stamps `signedAt`, refuses the requester as signer and a malformed answer. Appends outside the manifest. */
export const signEvidencePack = (dir: string, q: { meaning: string }, capture: (r: SignatureRequest) => { signer?: { id: string; kind: string } } | undefined, now: () => Date): void => {
  const packDigest = verifyEvidencePack(dir).packDigest
  writeReport(dir)
  const req: SignatureRequest = { ticketId: `pack:${packDigest}`, bindingDigest: bindingDigest(dir, packDigest), rendered: readFileSync(join(dir, "report.md"), "utf8"), meaning: q.meaning }
  const ans = capture(req)
  if (!ans) throw new SignatureRefused("declined")
  if (!ans.signer || typeof ans.signer.id !== "string" || ans.signer.id.trim() === "") throw new SignatureRefused("malformed-answer")
  const requester = readJson<{ requester?: { id: string } }>(dir, "manifest.json", {}).requester   // from the manifest, never from the caller
  if (!requester) throw new SignatureRefused("malformed-answer")
  if (ans.signer.id === requester.id) throw new SignatureRefused("signer-is-requester")
  write(dir, "signatures.json", jsonFile(chained(readJson<unknown[]>(dir, "signatures.json", []), { ticketId: req.ticketId, bindingDigest: req.bindingDigest, meaning: q.meaning, signer: ans.signer, signedAt: now().toISOString() })))
}

// ---- diff (BEH-GX-136)
export interface PackChange { readonly area: "requirement" | "deviation" | "attachment"; readonly id: string; readonly change: "changed" | "appeared" | "disappeared"; readonly from?: string; readonly to?: string }
export class EvidenceReadFailed { readonly _tag = "EvidenceReadFailed"; constructor(readonly path: string, readonly reason: "unreadable" | "manifest-mismatch") {} }
const facts = (dir: string): { digest: string; req: Map<string, string>; dev: Map<string, string>; att: Map<string, string> } => {
  let v; try { v = verifyEvidencePack(dir) } catch { throw new EvidenceReadFailed(dir, "unreadable") }
  if (v.differences.some((d) => d.kind !== "signature")) throw new EvidenceReadFailed(dir, "manifest-mismatch")
  const m = readJson<{ files: Array<{ path: string; digest: string }> }>(dir, "manifest.json", { files: [] })
  const cov = readJson<{ requirements: Array<{ id: string; outcome: string }> }>(dir, "coverage.json", { requirements: [] })
  return { digest: v.packDigest, req: new Map(cov.requirements.map((r) => [r.id, r.outcome])), dev: new Map(readJson<Array<{ id: string; state: string }>>(dir, "deviations.json", []).map((d) => [d.id, d.state])), att: new Map(m.files.filter((f) => f.path.startsWith("attachments/")).map((f) => [f.path, f.digest])) }
}
/** Lists every requirement, deviation and attachment that changed, appeared or disappeared, sorted by area and id; it never says better, worse or acceptable. */
export const diffPacks = (prev: string, next: string) => {
  const a = facts(prev), b = facts(next), changes: PackChange[] = []
  for (const [area, x, y] of [["requirement", a.req, b.req], ["deviation", a.dev, b.dev], ["attachment", a.att, b.att]] as const)
    for (const id of new Set([...x.keys(), ...y.keys()])) {
      const from = x.get(id), to = y.get(id)
      if (from === undefined) changes.push({ area, id, change: "appeared", to: to! })
      else if (to === undefined) changes.push({ area, id, change: "disappeared", from })
      else if (from !== to) changes.push({ area, id, change: "changed", from, to })
    }
  changes.sort((p, q) => (p.area + "\0" + p.id < q.area + "\0" + q.id ? -1 : 1))
  return { format: "bridger-gx-pack-diff/1" as const, prev: a.digest, next: b.digest, changes }
}
