// The run manifest (gxp BEH-GX-127) and the rule that counts a run only against the installed packages (BEH-GX-126). A package is described by
// its own package.json, the lockfile's registry hash, a digest of its installed files and the real path of its directory; what the suite loaded
// is reported only by the loaded code itself (`PackageSelf`), never resolved here. npm's package-lock.json is the lockfile this reads.
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import type { Deviation } from "./evidence.js"

export interface PackageSelf { readonly name: string; readonly version: string; readonly url: string }
export interface InstalledPackage { readonly name: string; readonly version: string; readonly registryHash: string; readonly filesDigest: string; readonly resolvedFrom: string }
export interface RunPackage extends InstalledPackage { readonly loaded: { readonly name: string; readonly version: string; readonly from: string } | null }
export interface RunManifest {
  readonly format: "bridger-gx-run/1"
  readonly packages: ReadonlyArray<RunPackage>
  readonly commit?: string
  readonly lockfileDigest: string
  readonly suiteVersion: string
  readonly environment: { readonly os: string; readonly runtime: string; readonly runtimeVersion: string; readonly arch: string; readonly packageManager: string; readonly packageManagerVersion: string }
  readonly clock: { readonly source: string; readonly testClock: "all" | "some" | "none" }
  readonly executor: string
  readonly machine: string
  readonly startedAt: string
  readonly endedAt?: string
}

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex")
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "node_modules" ? [] : files(join(dir, e.name))) : [join(dir, e.name)]).sort()
/** Digest of the installed files: the sorted relative paths and the bytes of each, so any added, removed or changed file changes it. */
export const filesDigest = (dir: string): string => { const h = createHash("sha256"); for (const f of files(dir)) h.update(relative(dir, f).split(sep).join("/")).update("\0").update(readFileSync(f)).update("\0"); return `sha256:${h.digest("hex")}` }

/** One installed package as module resolution from `packageRoot` finds it; undefined when it does not resolve (the run then raises package-mismatch). */
export const installedPackage = (name: string, packageRoot: string, lockfileText: string): InstalledPackage | undefined => {
  let pkgJson: string
  try { pkgJson = createRequire(join(packageRoot, "noop.js")).resolve(`${name}/package.json`) } catch { return undefined }
  const dir = realpathSync(dirname(pkgJson))
  const version = (JSON.parse(readFileSync(pkgJson, "utf8")) as { version?: string }).version
  const entry = (JSON.parse(lockfileText) as { packages?: Record<string, { integrity?: string }> }).packages?.[`node_modules/${name}`]
  if (!version || !entry?.integrity) return undefined
  return { name, version, registryHash: entry.integrity, filesDigest: filesDigest(dir), resolvedFrom: dir }
}

export interface CaptureQuery {
  readonly executor: string; readonly suiteVersion: string; readonly packageRoot: string; readonly lockfile: string
  readonly names: ReadonlyArray<string>; readonly loaded: ReadonlyArray<PackageSelf>
  readonly now: () => Date; readonly machine: string; readonly commit?: string
  readonly clock?: RunManifest["clock"]
}
const realFile = (url: string): string => { try { return realpathSync(fileURLToPath(url)) } catch { return url } }
/** Fills `packages` from the installation and `loaded` from `q.loaded` alone; `effect` and any package without an entry are `loaded: null`. */
export const captureRunEnvironment = (q: CaptureQuery): RunManifest => {
  const lock = readFileSync(q.lockfile)
  const packages: RunPackage[] = []
  for (const name of q.names) {
    const inst = installedPackage(name, q.packageRoot, lock.toString("utf8")); if (!inst) continue     // left out, never filled from elsewhere
    const self = name === "effect" ? undefined : q.loaded.find((l) => l.name === name)
    packages.push({ ...inst, loaded: self ? { name: self.name, version: self.version, from: realFile(self.url) } : null })
  }
  return {
    format: "bridger-gx-run/1", packages, ...(q.commit ? { commit: q.commit } : {}), lockfileDigest: `sha256:${sha256(lock)}`, suiteVersion: q.suiteVersion,
    environment: { os: process.platform, runtime: "node", runtimeVersion: process.version, arch: process.arch, packageManager: "npm", packageManagerVersion: process.env.npm_config_user_agent?.match(/npm\/([\d.]+)/)?.[1] ?? "" },
    clock: q.clock ?? { source: "effect Clock", testClock: "some" }, executor: q.executor, machine: q.machine, startedAt: q.now().toISOString()
  }
}

const inside = (file: string, dir: string) => file === dir || file.startsWith(dir.endsWith(sep) ? dir : dir + sep)
/**
 * BEH-GX-126: the run counts only when each required package matches the installed identity and loaded from its installed directory; `effect`
 * cannot describe itself, so it counts with one package-unverified deviation. A failing run raises package-mismatch and its results are excluded.
 */
export const judgeRun = (m: RunManifest, installed: ReadonlyArray<InstalledPackage>, required: ReadonlyArray<string>): { counted: boolean; deviations: Deviation[] } => {
  const dev = (kind: Deviation["kind"] | "package-mismatch" | "package-unverified" | "environment-incomplete", subject: string, detail: string): Deviation => ({ kind: kind as Deviation["kind"], source: "run", subject, detail, state: "open" })
  const out: Deviation[] = []; let counted = true
  for (const name of required) {
    const want = installed.find((p) => p.name === name), got = m.packages.find((p) => p.name === name)
    if (!want || !got) { counted = false; out.push(dev("package-mismatch", name, "the run's package is not the installed one")); continue }
    if (got.version !== want.version || got.registryHash !== want.registryHash || got.filesDigest !== want.filesDigest || got.resolvedFrom !== want.resolvedFrom || !got.resolvedFrom.split(sep).includes("node_modules")) {   // a source tree or a workspace link is not an installed dependency
      counted = false; out.push(dev("package-mismatch", name, "the run's package is not the installed one")); continue
    }
    if (name === "effect") { out.push(dev("package-unverified", name, "the loaded location of the package was not reported by the loaded code")); continue }
    const l = got.loaded
    if (!l || l.name !== want.name || l.version !== want.version || !inside(l.from, want.resolvedFrom)) { counted = false; out.push(dev("package-mismatch", name, "the loaded code is not provably the installed package")) }
  }
  const e = m.environment, blank = (v: unknown) => typeof v !== "string" || v.trim() === ""
  const missing = [["lockfileDigest", m.lockfileDigest], ["suiteVersion", m.suiteVersion], ["executor", m.executor], ["machine", m.machine], ["startedAt", m.startedAt], ["clock.source", m.clock?.source], ...Object.entries(e).map(([k, v]) => [`environment.${k}`, v])].filter(([, v]) => blank(v)).map(([k]) => k as string)
  for (const f of missing) out.push(dev("environment-incomplete", f, "a field of the run record is missing or blank"))
  return { counted, deviations: out }
}
