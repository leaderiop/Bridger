// `bridger pack`, `publish` and `countersign` (references/kit behaviours 04, BEH-KT-029, 030, 032). All digest, statement and policy work is the
// loader's (src/loader.ts); the kit holds no key: a signer is a module the person signing names, wired as a StatementSigner (BEH-LD-054).
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"
import { main as check, type Package as CheckPackage } from "./check.js"
import * as AC from "./audit-chain.js"
import * as L from "./loader.js"

interface Io { readonly out: (s: string) => void; readonly err: (s: string) => void; readonly cwd: string }
const flag = (args: ReadonlyArray<string>, name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v
const stable = (v: unknown): string => JSON.stringify(sorted(v), null, 2) + "\n"
const text = (b: L.Bytes) => Buffer.from(b).toString("utf8")

// ---------------------------------------------------------------------------------------------- the package file (.bpkg)
const encode = (p: L.Package): string => stable({ format: "bridger-package/v1", manifest: L.b64u(p.manifest), sbom: { format: p.sbom.format, bytes: L.b64u(p.sbom.bytes) }, files: Object.fromEntries([...p.files].map(([k, v]) => [k, L.b64u(v)])) })
const decode = (file: string): L.Package => {
  const j = JSON.parse(readFileSync(file, "utf8")) as { format?: string; manifest: string; sbom: { format: string; bytes: string }; files: Record<string, string> }
  if (j.format !== "bridger-package/v1") throw new L.PackageMalformed("format", "not a bridger package")
  return { manifest: L.fromB64u(j.manifest), sbom: { format: j.sbom.format, bytes: L.fromB64u(j.sbom.bytes) }, files: new Map(Object.entries(j.files).map(([k, v]) => [k, L.fromB64u(v)])) }
}
interface Signatures { digest: string; package: Array<{ scheme: string; keyHint?: string; bytes: string }>; firstParty: Array<{ scheme: string; keyHint?: string; bytes: string }> }
const sigFile = (pkg: string) => pkg.replace(/\.bpkg$/, "") + ".signatures.json"
const readSigs = (pkg: string): Signatures | undefined => existsSync(sigFile(pkg)) ? JSON.parse(readFileSync(sigFile(pkg), "utf8")) : undefined
const toSig = (s: Signatures["package"][number]): L.Signature => ({ scheme: s.scheme, ...(s.keyHint ? { keyHint: s.keyHint } : {}), bytes: L.fromB64u(s.bytes) })
const fromSig = (s: L.Signature): Signatures["package"][number] => ({ scheme: s.scheme, ...(s.keyHint ? { keyHint: s.keyHint } : {}), bytes: L.b64u(s.bytes) })
const walk = (root: string, dir: string): ReadonlyArray<string> => readdirSync(join(root, dir)).sort().flatMap((n) => { const rel = join(dir, n); return statSync(join(root, rel)).isDirectory() ? walk(root, rel) : [rel] })

// ---------------------------------------------------------------------------------------------- pack (BEH-KT-029)
export const pack = async (args: ReadonlyArray<string>, io: Io): Promise<number> => {
  const [mod, ...rest] = args
  const entry = flag(rest, "--entry")
  if (!mod || !entry) { io.err("usage: bridger pack <package-module> --entry <file> [--export <name>] [--files <dir>] [--lock <file>] [--out <dir>] [--partner]"); return 2 }
  const lines: Array<string> = []
  const status = await check([resolve(io.cwd, mod), resolve(io.cwd, flag(rest, "--lock") ?? "bridger.lock.json")], { out: (s) => lines.push(s) })
  if (status !== 0) { for (const l of lines) io.err(l); io.err("bridger pack: refused while check fails"); return 1 }
  const pkg = (await import(pathToFileURL(resolve(io.cwd, mod)).href)) as CheckPackage
  if ((pkg.manifests ?? []).length !== 1) { io.err("bridger pack: the package module must export exactly one manifest"); return 2 }
  const manifest = JSON.parse(JSON.stringify(pkg.manifests![0])) as Record<string, any>
  if (rest.includes("--partner")) {
    const bad = (manifest.provides?.length ?? 0) !== 1 ? "provides" : (["requires", "optional", "activation", "contributions", "listens"] as const).find((f) => (manifest[f] ?? []).length > 0)
    if (bad) { io.err(`bridger pack: a partner manifest has the guest shape: field \`${bad}\` is not allowed (loader BEH-LD-068)`); return 1 }
  }
  const dir = flag(rest, "--files") ?? "src"
  const files = new Map<string, L.Bytes>()
  for (const rel of walk(io.cwd, dir)) files.set(rel.split("\\").join("/"), new Uint8Array(Buffer.from(readFileSync(join(io.cwd, rel), "utf8").replace(/\r\n/g, "\n"))))   // normalised line endings
  if (!files.has(entry)) { io.err(`bridger pack: PackageMalformed (entry): ${entry} is not one of the package's files`); return 1 }
  manifest.extensions = { ...(manifest.extensions ?? {}), "@bridger/loader": { entry: { file: entry, export: flag(rest, "--export") ?? "default" } } }
  const pj = existsSync(join(io.cwd, "package.json")) ? JSON.parse(readFileSync(join(io.cwd, "package.json"), "utf8")) : {}
  const sbom = { format: "bridger-sbom-lite/v1", bytes: new Uint8Array(Buffer.from(stable({ name: manifest.id, version: manifest.version, dependencies: pj.dependencies ?? {} }))) }
  const built: L.Package = { manifest: new Uint8Array(Buffer.from(stable(manifest))), sbom, files }
  let digest: string
  try { digest = L.packageDigest(built) } catch (e) { io.err(String((e as Error).message)); return 1 }
  const out = resolve(io.cwd, flag(rest, "--out") ?? "dist")
  const name = `${String(manifest.id).split("/").pop()}-${manifest.version}.bpkg`
  mkdirSync(out, { recursive: true }); writeFileSync(join(out, name), encode(built))
  io.out(`packed ${join(flag(rest, "--out") ?? "dist", name)}  ${manifest.id} ${manifest.version}  ${digest}  (${files.size} files)`)
  return 0
}

// ---------------------------------------------------------------------------------------------- shared: signer, rules, revocation (BEH-KT-030)
interface Rules { readonly policy: L.SignaturePolicy }
const config = (io: Io): { signer?: string; rules?: string; revocation?: string } => existsSync(join(io.cwd, "bridger.config.json")) ? JSON.parse(readFileSync(join(io.cwd, "bridger.config.json"), "utf8")) : {}
const loadSigner = async (file: string, io: Io): Promise<L.StatementSigner> => {
  const m = (await import(pathToFileURL(resolve(io.cwd, file)).href)) as { default?: L.StatementSigner; signer?: L.StatementSigner }
  const s = m.default ?? m.signer
  if (!s || typeof s.sign !== "function") throw new Error(`${file} exports no StatementSigner`)
  return s
}
/** The policy line's inputs: the rules, and the revocation source (a saved list, or `unbounded` = an empty set with a warning). */
const policyInputs = (args: ReadonlyArray<string>, io: Io): { rules?: Rules; revocations?: L.Revocations } | { usage: string } => {
  const c = config(io)
  const rulesFile = flag(args, "--rules") ?? c.rules
  if (!rulesFile) return {}
  const rev = flag(args, "--revocation") ?? c.revocation
  if (!rev) return { usage: "the rules are given without --revocation (a saved list, or `unbounded`)" }
  const rules = JSON.parse(readFileSync(resolve(io.cwd, rulesFile), "utf8")) as Rules
  if (rev === "unbounded") { io.out("warning: no revocation was checked (unbounded)"); return { rules, revocations: {} } }
  // shortcut: the saved list is read as `{ issuedAt, digests, identities }` and its own signature is not verified (loader BEH-LD-026), when RevocationSource.verified exists
  const list = JSON.parse(readFileSync(resolve(io.cwd, rev), "utf8")) as L.Revocations
  io.out(`revocation list issued ${list.issuedAt ?? "(undated)"}`)
  return { rules, revocations: list }
}
const sign = async (signer: L.StatementSigner, statement: L.Statement): Promise<{ ok: true; sig: L.Signature } | { ok: false; message: string }> => {
  const exit = await Effect.runPromiseExit(signer.sign(L.Statement.signingInput(statement)))
  if (exit._tag === "Success") return { ok: true, sig: exit.value }
  const err = (exit.cause as unknown as { reasons?: ReadonlyArray<{ error?: Error }>; failures?: ReadonlyArray<{ error?: Error }> })
  return { ok: false, message: (err.failures?.[0]?.error ?? err.reasons?.find((r) => r.error)?.error)?.message ?? "the signer failed" }
}
const manifestOf = (p: L.Package) => JSON.parse(text(p.manifest)) as { id: string; version: string; publisher?: string }
const report = (inputs: ReturnType<typeof policyInputs>, statement: L.Statement, sigs: ReadonlyArray<L.Signature>, publisher: string | undefined, io: Io, label = "policy"): L.Verification | "policy-unknown" | "stop" => {
  if ("usage" in inputs || !inputs.rules) { io.out(`${label}    policy unknown: the deployment's rules were not given`); return "policy-unknown" }
  try {
    const v = L.verifyStatement({ statement, signatures: sigs, policy: inputs.rules.policy, ...(publisher !== undefined ? { publisher } : {}), ...(inputs.revocations ? { revocations: inputs.revocations } : {}) })
    io.out(v.satisfied ? `${label}    ${v.policyId}: satisfied (${v.verified.map((x) => x.signerId).join(", ")})` : `${label}    ${v.policyId}: ${v.missing}${v.missing.includes("role") ? ": run bridger countersign" : ""}`)
    return v
  } catch (e) { io.err(`${(e as { _tag?: string })._tag ?? "Error"}: ${(e as Error).message}`); return "stop" }
}

// ---------------------------------------------------------------------------------------------- publish (BEH-KT-030)
export const publish = async (args: ReadonlyArray<string>, io: Io): Promise<number> => {
  const [file] = args
  const target = flag(args, "--target")
  if (!file || !target) { io.err("usage: bridger publish <package> --target dir:<path> [--signer <module>] [--rules <file>] [--revocation <file>|unbounded] [--partial]"); return 2 }
  if (!target.startsWith("dir:")) { io.err(`unknown target \`${target}\`: the prototype ships the \`dir:<path>\` target`); return 2 }
  const signerFile = flag(args, "--signer") ?? config(io).signer
  if (!signerFile) { io.err("usage: no signer named: give --signer or set `signer` in bridger.config.json"); return 2 }
  const inputs = policyInputs(args, io)
  if ("usage" in inputs) { io.err(`usage: ${inputs.usage}`); return 2 }
  const pkgFile = resolve(io.cwd, file)
  let pkg: L.Package, digest: string
  try { pkg = decode(pkgFile); digest = L.packageDigest(pkg) } catch (e) { io.err(String((e as Error).message)); return 1 }
  const m = manifestOf(pkg)
  io.out(`package   ${m.id} ${m.version}  ${digest} (recomputed)`)
  const statement = L.Statement.make({ statementType: "package", subject: { digest }, id: m.id, version: m.version })
  const signer = await loadSigner(signerFile, io).catch((e: Error) => { io.err(e.message); return undefined })
  if (!signer) return 3
  const s = await sign(signer, statement)
  if (!s.ok) { io.err(`SigningFailed: ${s.message}`); return 1 }
  const existing = readSigs(pkgFile) ?? { digest, package: [], firstParty: [] }
  existing.package.push(fromSig(s.sig)); existing.digest = digest
  writeFileSync(sigFile(pkgFile), stable(existing))
  io.out(`signing   ${signer.scheme}  ok`)
  const r = report(inputs, statement, existing.package.map(toSig), m.publisher, io)
  if (r === "stop") return 1
  const complete = r !== "policy-unknown" && r.satisfied
  if (!complete && !rest(args, "--partial")) { io.err(r === "policy-unknown" ? "nothing uploaded: give --rules, or --partial" : `nothing uploaded: ${r.missing}`); return 1 }
  const dest = resolve(io.cwd, target.slice(4)); mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, basename(pkgFile)), readFileSync(pkgFile)); writeFileSync(join(dest, basename(sigFile(pkgFile))), stable(existing))
  io.out(`uploaded  ${join(target.slice(4), basename(pkgFile))}${complete ? "" : "  (partial)"}`)
  return 0
}
const rest = (args: ReadonlyArray<string>, name: string) => args.includes(name)

// ---------------------------------------------------------------------------------------------- countersign (BEH-KT-032)
export const countersign = async (args: ReadonlyArray<string>, io: Io): Promise<number> => {
  const [file] = args
  if (!file) { io.err("usage: bridger countersign <package> [--statement package|first-party] [--signer <module>] [--rules <file>] [--revocation <file>|unbounded]"); return 2 }
  const signerFile = flag(args, "--signer") ?? config(io).signer
  if (!signerFile) { io.err("usage: no signer named: give --signer or set `signer` in bridger.config.json"); return 2 }
  const kind = flag(args, "--statement") ?? "package"
  if (kind !== "package" && kind !== "first-party") { io.err("usage: --statement is package or first-party"); return 2 }
  const inputs = policyInputs(args, io)
  if ("usage" in inputs) { io.err(`usage: ${inputs.usage}`); return 2 }
  const pkgFile = resolve(io.cwd, file)
  let pkg: L.Package, digest: string
  try { pkg = decode(pkgFile); digest = L.packageDigest(pkg) } catch (e) { io.err(String((e as Error).message)); return 1 }
  const sigs = readSigs(pkgFile)
  if (!sigs) { io.err("no signatures beside the package: publish it first"); return 1 }
  if (sigs.digest !== digest) { io.err(`the package digest ${digest} differs from the one its signatures name (${sigs.digest})`); return 1 }
  const m = manifestOf(pkg)
  io.out(`package   ${m.id} ${m.version}  ${digest} (recomputed)`)
  const stmt = (t: "package" | "first-party") => L.Statement.make({ statementType: t, subject: { digest }, id: m.id, version: m.version })
  const pkgStatement = stmt("package")
  if (kind === "first-party") { if (report(inputs, pkgStatement, sigs.package.map(toSig), m.publisher, io, "package  ") === "stop") return 1 }
  else if (inputs.rules && "rules" in inputs) {
    const before = report(inputs, pkgStatement, sigs.package.map(toSig), m.publisher, io, "verified ")
    if (before === "stop") return 1
  } else io.out("policy    policy unknown: the deployment's rules were not given")
  const signer = await loadSigner(signerFile, io).catch((e: Error) => { io.err(e.message); return undefined })
  if (!signer) return 3
  const statement = stmt(kind)
  const s = await sign(signer, statement)
  if (!s.ok) { io.err(`SigningFailed: ${s.message}`); return 1 }
  const list = kind === "package" ? sigs.package : sigs.firstParty
  const known = inputs.rules ? L.verifyStatement({ statement, signatures: list.map(toSig), policy: inputs.rules.policy, ...(inputs.revocations ? { revocations: inputs.revocations } : {}) }).verified.map((v) => v.signerId) : []
  const now = inputs.rules ? L.verifyStatement({ statement, signatures: [s.sig], policy: inputs.rules.policy }).verified.map((v) => v.signerId) : []
  if (now.length > 0 && known.includes(now[0]!)) { io.out(`signer ${now[0]} already signed this statement: nothing added`); return 0 }
  list.push(fromSig(s.sig)); writeFileSync(sigFile(pkgFile), stable(sigs))
  io.out(`signing   ${signer.scheme}  ok${now[0] ? ` (signer entry ${now[0]})` : ""}`)
  if (report(inputs, pkgStatement, sigs.package.map(toSig), m.publisher, io) === "stop") return 1
  if (kind === "first-party") report(inputs, statement, sigs.firstParty.map(toSig), undefined, io, "first-party")
  return 0
}

// ---------------------------------------------------------------------------------------------- verify-chain (BEH-KT-047)
/** Reads the bundle and the named modules, calls the audit-chain verifyBundle and prints; verifies nothing itself. Exit 0, 1 (inconsistent), 2 (usage), 3 (environment), 4 (incomplete). */
export const verifyChain = async (args: ReadonlyArray<string>, io: Io, load: (file: string, io: Io) => Promise<Record<string, unknown>>): Promise<number> => {
  const [file] = args
  if (!file) { io.err("usage: bridger verify-chain <bundle> [--trust-roots <file>] [--verifier <module>]... [--profile <name>=<module>]... [--expect-head <seriesId>=<seq>[:<hash>]]... [--json]"); return 2 }
  const all = (name: string) => args.flatMap((a, i) => a === name && args[i + 1] ? [args[i + 1]!] : [])
  let bundle: unknown
  try { bundle = JSON.parse(readFileSync(resolve(io.cwd, file), "utf8")) } catch { io.err(`cannot read ${file} as JSON`); return 3 }
  const loaded: Array<string> = []
  const digestOf = (f: string) => { const d = "sha256:" + createHash("sha256").update(readFileSync(resolve(io.cwd, f))).digest("hex"); loaded.push(`${f} (${d.slice(0, 11)}…${d.slice(-2)})`); return d }
  try {
    const roots = flag(args, "--trust-roots")
    const receiptVerifiers: Array<AC.OfflineReceiptVerifier> = [], profiles = new Map<string, AC.ChainProfile>()
    const lines: Array<string> = []
    for (const m of all("--verifier")) { digestOf(m); receiptVerifiers.push((await load(m, io)).default as AC.OfflineReceiptVerifier); lines.push(`loaded    verifier ${loaded.at(-1)}`) }
    for (const p of all("--profile")) { const [name, mod] = p.split("="); digestOf(mod!); profiles.set(name!, (await load(mod!, io)).default as AC.ChainProfile); lines.push(`loaded    profile ${name} ${loaded.at(-1)}`) }
    const expectedHeads = new Map<string, { seq: number; hash?: string }>()
    for (const h of all("--expect-head")) { const [id, rest] = h.split("="); const [seq, hash] = rest!.split(":"); expectedHeads.set(id!, { seq: Number(seq), ...(hash ? { hash } : {}) }) }
    let keyed: AC.VerifyOptions["keyed"]
    const km = flag(args, "--keyed"); if (km) { digestOf(km); keyed = (await load(km, io)).default as AC.VerifyOptions["keyed"]; lines.push(`loaded    keyed ${loaded.at(-1)}`) }
    const ek = args.flatMap((a, i) => a === "--expect-keyed" ? [args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]! : ""] : [])
    const expectKeyed = ek.includes("") ? true : ek.length > 0 ? new Set(ek) : undefined
    const report = AC.verifyBundle(bundle, { ...(keyed ? { keyed } : {}), ...(expectKeyed ? { expectKeyed } : {}), ...(roots ? { pinnedTrustRoots: JSON.parse(readFileSync(resolve(io.cwd, roots), "utf8")) } : {}), expectedHeads, profiles, receiptVerifiers })
    if (args.includes("--json")) io.out(JSON.stringify(report))
    else { for (const l of AC.renderReport(report)) io.out(l); for (const l of lines) io.out(l) }
    if (report.inconsistent) { if (!args.includes("--json")) io.out("exit 1: something checked was found inconsistent"); return 1 }
    if (report.incomplete) { if (!args.includes("--json")) io.out("exit 4: nothing checked was found inconsistent; the check is incomplete"); return 4 }
    return 0
  } catch (e) { io.err(`verify-chain: ${(e as Error).message}`); return 3 }
}
