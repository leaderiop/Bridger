// `bridger check` (kit BEH-KT-028): plain cross-boundary keys, and contract releases against the recorded lock.
// The package under check is a module exporting `{ contracts, manifests, definitions }`; the lock is a JSON array of ContractSnapshot.
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { Contract } from "./contract.js"
import { checkRelease, snapshotOf, type Change, type ContractSnapshot } from "./contractcheck.js"
import { plainKeyProblems, plainKeysOfDefinition, type PluginManifest } from "./manifest.js"
import type { AnyPlugin } from "./plugin.js"

export interface Package { readonly contracts?: ReadonlyArray<Contract>; readonly manifests?: ReadonlyArray<PluginManifest>; readonly definitions?: ReadonlyArray<AnyPlugin> }
export type Finding =
  | { readonly _tag: "PlainCrossBoundaryKey"; readonly plugin: string; readonly serviceId: string; readonly path: string }
  | { readonly _tag: "ContractBreakingChange" | "ContractVersionNotBumped"; readonly serviceId: string; readonly from: string; readonly to: string; readonly changes: ReadonlyArray<Change> }

/** Every finding for a package, in a stable order: plain keys by plugin, then contracts by ServiceId. */
export const check = (pkg: Package, lock: ReadonlyArray<ContractSnapshot>): ReadonlyArray<Finding> => {
  const out: Array<Finding> = []
  const withManifest = new Set((pkg.manifests ?? []).map((m) => m.id))
  for (const m of pkg.manifests ?? []) for (const p of plainKeyProblems(m)) out.push({ _tag: "PlainCrossBoundaryKey", plugin: m.id, serviceId: p.serviceId, path: p.path })
  // A definition without a manifest: every plain key it names (BEH-KT-028).
  for (const d of pkg.definitions ?? []) if (!withManifest.has(d.id)) for (const k of plainKeysOfDefinition(d)) out.push({ _tag: "PlainCrossBoundaryKey", plugin: d.id, serviceId: k, path: "definition" })
  const released = new Map(lock.map((s) => [s.serviceId, s]))
  for (const c of [...(pkg.contracts ?? [])].sort((a, b) => a.descriptor.serviceId < b.descriptor.serviceId ? -1 : 1)) {
    const prev = released.get(c.descriptor.serviceId)
    if (!prev) continue                                          // never released: nothing to compare
    const v = checkRelease(prev, snapshotOf(c))
    if (!v.ok) out.push({ _tag: v._tag, serviceId: v.serviceId, from: v.from, to: v.to, changes: v.changes })
  }
  return out
}

const line = (f: Finding): string => f._tag === "PlainCrossBoundaryKey"
  ? `${f._tag} ${f.plugin} ${f.serviceId} (${f.path})`
  : `${f._tag} ${f.serviceId} ${f.from} -> ${f.to}: ${f.changes.map((c) => `${c.method} ${c.detail}`).join("; ")}`

/** `bridger check <package-module> <lockfile> [--write-lock]`: exit 0 when clean, 1 with findings, 2 on a usage error. */
export const main = async (argv: ReadonlyArray<string>, io: { readonly out: (s: string) => void } = { out: (s) => console.log(s) }): Promise<number> => {
  const [modPath, lockPath, ...flags] = argv
  if (!modPath || !lockPath) { io.out("usage: bridger check <package-module> <lockfile> [--write-lock]"); return 2 }
  const pkg = (await import(pathToFileURL(resolve(modPath)).href)) as Package
  const lock: ReadonlyArray<ContractSnapshot> = await readFile(lockPath, "utf8").then((s) => JSON.parse(s), () => [])
  const findings = check(pkg, lock)
  for (const f of findings) io.out(line(f))
  if (flags.includes("--write-lock") && findings.length === 0) {
    const next = new Map(lock.map((s) => [s.serviceId, s])); for (const c of pkg.contracts ?? []) next.set(c.descriptor.serviceId, snapshotOf(c))
    await writeFile(lockPath, JSON.stringify([...next.values()], null, 2) + "\n")
  }
  if (findings.length === 0) io.out("bridger check: ok")
  return findings.length === 0 ? 0 : 1
}
