// Reference evaluator (loader BEH-LD-011, BEH-LD-012; improvement report 06 R7): evaluates a verified package from the bytes it holds, in a fresh vm
// context with no globals of the host, resolving every import through `resolveSpecifier`. CommonJS-shaped sources only: ESM `import` statements fail
// as a syntax error ("threw"); a production evaluator for ES modules would use `vm.SourceTextModule` with the same resolver. Prototype.
import vm from "node:vm"
import { EvaluationFailed, type Package, resolveSpecifier, checkExternals } from "./loader.js"

export interface EvaluatorOptions { readonly externals: ReadonlyMap<string, unknown>; readonly allowBuiltins?: ReadonlyArray<string>; readonly timeoutMs?: number }
const text = new TextDecoder()

/** The set of digests evaluated in this process, readable as `Loader.resident` (BEH-LD-012). */
export const makeEvaluator = (options: EvaluatorOptions) => {
  checkExternals(options.externals, options.allowBuiltins)
  const resident = new Map<string, unknown>()
  const evaluate = (digest: string, pkg: Package): unknown => {
    if (resident.has(digest)) return resident.get(digest)
    const ext = (JSON.parse(text.decode(pkg.manifest)).extensions ?? {})["@bridger/loader"]?.entry as { file?: string; export?: string } | undefined
    if (!ext?.file || !pkg.files.has(ext.file)) throw new EvaluationFailed(digest, "no-entry", "the manifest names no entry file of the package")
    const context = vm.createContext(Object.create(null))   // no process, require, fetch, console or import(): a dynamic import() rejects
    const cache = new Map<string, { exports: unknown }>()
    const load = (path: string): unknown => {
      const hit = cache.get(path); if (hit) return hit.exports
      const module = { exports: {} as unknown }; cache.set(path, module)
      const source = text.decode(pkg.files.get(path)!)
      let fn: (...a: Array<unknown>) => void
      try { fn = new vm.Script(`(function (exports, require, module) {${source}\n})`, { filename: `${digest}:${path}` }).runInContext(context) }
      catch (e) { throw new EvaluationFailed(digest, "threw", `${path}: ${(e as Error).message}`) }
      const req = (spec: string): unknown => {
        const r = resolveSpecifier(digest, pkg.files, path, spec, options.externals)
        return r.kind === "file" ? load(r.path) : options.externals.get(r.name)
      }
      try { (context as { __run?: () => void }).__run = () => fn.call(undefined, module.exports, req, module); new vm.Script("__run()").runInContext(context, { timeout: options.timeoutMs ?? 1000 }) }
      catch (e) {
        if (e instanceof EvaluationFailed) throw e
        const m = (e as Error).message ?? String(e)
        throw new EvaluationFailed(digest, /timed out/i.test(m) ? "timeout" : "threw", `${path}: ${m}`)
      }
      return module.exports
    }
    const ns = load(ext.file) as Record<string, unknown>
    const value = ext.export ? ns[ext.export] : ns
    if (value === undefined) throw new EvaluationFailed(digest, "no-entry", `the entry file exports no "${ext.export}"`)
    resident.set(digest, value)
    return value
  }
  return { evaluate, resident: () => [...resident.keys()].sort() }
}
