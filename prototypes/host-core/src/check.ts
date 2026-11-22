// `bridger check` (kit BEH-KT-028): plain cross-boundary keys, and contract releases against the recorded lock.
// The package under check is a module exporting `{ contracts, manifests, definitions }`; the lock is a JSON array of ContractSnapshot.
import { readdir, readFile, realpath, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { Contract } from "./contract.js"
import { checkRelease, snapshotOf, type Change, type ContractSnapshot } from "./contractcheck.js"
import { disagreement, plainKeyProblems, plainKeysOfDefinition, type PluginManifest } from "./manifest.js"
import { undeclaredCallTimeUse, type UndeclaredCallTimeUse } from "./lint.js"
import type { AnyPlugin } from "./plugin.js"

export interface Package { readonly contracts?: ReadonlyArray<Contract>; readonly manifests?: ReadonlyArray<PluginManifest>; readonly sources?: ReadonlyArray<{ readonly file: string; readonly text: string }>; readonly definitions?: ReadonlyArray<AnyPlugin> }
export type Finding =
  | UndeclaredCallTimeUse
  | { readonly _tag: "PlainCrossBoundaryKey"; readonly plugin: string; readonly serviceId: string; readonly path: string }
  | { readonly _tag: "ManifestMismatch"; readonly plugin: string; readonly field: string }
  | { readonly _tag: "DuplicateDependencyCopy"; readonly package: string; readonly copies: ReadonlyArray<{ readonly path: string; readonly version: string }> }
  | { readonly _tag: "ContractBreakingChange" | "ContractVersionNotBumped"; readonly serviceId: string; readonly from: string; readonly to: string; readonly changes: ReadonlyArray<Change> }

/** Every finding for a package, in a stable order: plain keys by plugin, then contracts by ServiceId. */
export const check = (pkg: Package, lock: ReadonlyArray<ContractSnapshot>): ReadonlyArray<Finding> => {
  const out: Array<Finding> = []
  for (const src of pkg.sources ?? []) out.push(...undeclaredCallTimeUse(src.text, src.file))
  const withManifest = new Set((pkg.manifests ?? []).map((m) => m.id))
  for (const m of pkg.manifests ?? []) for (const p of plainKeyProblems(m)) out.push({ _tag: "PlainCrossBoundaryKey", plugin: m.id, serviceId: p.serviceId, path: p.path })
  // A definition without a manifest: every plain key it names (BEH-KT-028).
  for (const d of pkg.definitions ?? []) if (!withManifest.has(d.id)) for (const k of plainKeysOfDefinition(d)) out.push({ _tag: "PlainCrossBoundaryKey", plugin: d.id, serviceId: k, path: "definition" })
  // A manifest, when present, declares what its definition does (BEH-KT-028).
  const byId = new Map((pkg.definitions ?? []).map((d) => [d.id, d]))
  for (const m of pkg.manifests ?? []) { const d = byId.get(m.id); const field = d && disagreement(d, m, "manifest"); if (field) out.push({ _tag: "ManifestMismatch", plugin: m.id, field }) }
  const released = new Map(lock.map((s) => [s.serviceId, s]))
  for (const c of [...(pkg.contracts ?? [])].sort((a, b) => a.descriptor.serviceId < b.descriptor.serviceId ? -1 : 1)) {
    const prev = released.get(c.descriptor.serviceId)
    if (!prev) continue                                          // never released: nothing to compare
    const v = checkRelease(prev, snapshotOf(c))
    if (!v.ok) out.push({ _tag: v._tag, serviceId: v.serviceId, from: v.from, to: v.to, changes: v.changes })
  }
  return out
}

const COPIES = ["effect", "@bridger/core"] as const
/**
 * Every physical copy of `effect` and `@bridger/core` reachable below `root/node_modules`, however deeply nested (BEH-KT-028):
 * copies are told apart by real path, so a symlinked, hoisted package counts once.
 */
export const findDuplicateCopies = async (root: string): Promise<ReadonlyArray<Finding>> => {
  const found = new Map<string, Map<string, string>>(COPIES.map((n) => [n, new Map()]))
  const seen = new Set<string>()
  const walk = async (nm: string): Promise<void> => {
    const real = await realpath(nm).catch(() => undefined)
    if (!real || seen.has(real)) return
    seen.add(real)
    for (const e of await readdir(nm, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith(".")) continue
      const dirs = e.name.startsWith("@") ? (await readdir(join(nm, e.name)).catch(() => [])).map((x) => join(nm, e.name, x)) : [join(nm, e.name)]
      for (const d of dirs) {
        const pj = await readFile(join(d, "package.json"), "utf8").then((t) => JSON.parse(t) as { name?: string; version?: string }, () => undefined)
        const name = pj?.name
        if (name && found.has(name)) { const r = await realpath(d).catch(() => d); found.get(name)!.set(r, pj!.version ?? "?") }
        await walk(join(d, "node_modules"))
      }
    }
  }
  await walk(join(root, "node_modules"))
  return [...found].filter(([, c]) => c.size > 1).map(([name, c]) => ({ _tag: "DuplicateDependencyCopy" as const, package: name, copies: [...c].map(([path, version]) => ({ path, version })).sort((a, b) => a.path < b.path ? -1 : 1) }))
}

const line = (f: Finding): string => f._tag === "UndeclaredCallTimeUse"
  ? `${f._tag} ${f.pluginId} ${f.serviceId} (${f.file}:${f.line}): use ctx.use or ctx.useOptional and declare it in requires or optional`
  : f._tag === "PlainCrossBoundaryKey"
  ? `${f._tag} ${f.plugin} ${f.serviceId} (${f.path})`
  : f._tag === "ManifestMismatch" ? `${f._tag} ${f.plugin} (${f.field})`
  : f._tag === "DuplicateDependencyCopy" ? `${f._tag} ${f.package}: ${f.copies.map((c) => `${c.version} at ${c.path}`).join(", ")}`
  : `${f._tag} ${f.serviceId} ${f.from} -> ${f.to}: ${f.changes.map((c) => `${c.method} ${c.detail}`).join("; ")}`

/** `bridger check <package-module> <lockfile> [--write-lock] [--root <dir>]`: exit 0 when clean, 1 with findings, 2 on a usage error. */
let loads = 0
export const main = async (argv: ReadonlyArray<string>, io: { readonly out: (s: string) => void } = { out: (s) => console.log(s) }): Promise<number> => {
  const [modPath, lockPath, ...flags] = argv
  if (!modPath || !lockPath) { io.out("usage: bridger check <package-module> <lockfile> [--write-lock] [--root <dir>]"); return 2 }
  const pkg = (await import(pathToFileURL(resolve(modPath)).href + `?t=${++loads}`)) as Package   // a fresh module each run: a long-lived process must not check stale code
  const lock: ReadonlyArray<ContractSnapshot> = await readFile(lockPath, "utf8").then((s) => JSON.parse(s), () => [])
  const rootAt = flags.indexOf("--root")
  const root = rootAt >= 0 && flags[rootAt + 1] ? flags[rootAt + 1]! : process.cwd()
  const findings = [...(await findDuplicateCopies(root)), ...check(pkg, lock)]
  for (const f of findings) io.out(line(f))
  if (flags.includes("--write-lock") && findings.length === 0) {
    const next = new Map(lock.map((s) => [s.serviceId, s])); for (const c of pkg.contracts ?? []) next.set(c.descriptor.serviceId, snapshotOf(c))
    await writeFile(lockPath, JSON.stringify([...next.values()], null, 2) + "\n")
  }
  if (findings.length === 0) io.out("bridger check: ok")
  return findings.length === 0 ? 0 : 1
}
