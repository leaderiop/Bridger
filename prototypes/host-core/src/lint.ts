// `bridger check` lint (kit BEH-KT-028, report 05 R8): a `yield*` of a service key inside a function a `make` or `run` returns, where the
// definition lists the key in neither `requires` nor `optional`. Syntactic: a key is a bare identifier starting with a capital letter that
// the file does not declare itself. shortcut: names, not ServiceIds, and no cross-file resolution; upgrade when `check` has a type checker.
import ts from "typescript"

export interface UndeclaredCallTimeUse { readonly _tag: "UndeclaredCallTimeUse"; readonly pluginId: string; readonly serviceId: string; readonly file: string; readonly line: number }

const names = (arr: ts.Expression | undefined): ReadonlyArray<string> =>
  arr && ts.isArrayLiteralExpression(arr) ? arr.elements.filter(ts.isIdentifier).map((e) => e.text) : []
const prop = (o: ts.ObjectLiteralExpression, key: string) => o.properties.find((p): p is ts.PropertyAssignment | ts.MethodDeclaration => (ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name.getText() === key)
const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration => ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)

export const undeclaredCallTimeUse = (text: string, file = "source.ts"): ReadonlyArray<UndeclaredCallTimeUse> => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const local = new Set<string>()
  const declare = (n: ts.Node) => {
    if ((ts.isVariableDeclaration(n) || ts.isClassDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name)) local.add(n.name.text)
    ts.forEachChild(n, declare)
  }
  declare(sf)
  const out: Array<UndeclaredCallTimeUse> = []
  const visitCall = (call: ts.CallExpression) => {
    if (!ts.isIdentifier(call.expression) || !["definePlugin", "define"].includes(call.expression.text)) return
    const spec = call.arguments[0]
    if (!spec || !ts.isObjectLiteralExpression(spec)) return
    const declared = new Set([...names((prop(spec, "requires") as ts.PropertyAssignment | undefined)?.initializer), ...names((prop(spec, "optional") as ts.PropertyAssignment | undefined)?.initializer)])
    const idNode = (prop(spec, "id") as ts.PropertyAssignment | undefined)?.initializer
    const pluginId = idNode && ts.isStringLiteralLike(idNode) ? idNode.text : "<unknown>"
    for (const field of ["make", "run"]) {
      const f = prop(spec, field)
      const fn = f && (ts.isMethodDeclaration(f) ? f : f.initializer)
      if (!fn) continue
      // depth 0 is the make function and the generator it hands to Effect.gen; a function nested deeper is call-time
      const walk = (n: ts.Node, depth: number) => {
        if (ts.isYieldExpression(n) && n.asteriskToken && n.expression && ts.isIdentifier(n.expression) && depth > 0) {
          const k = n.expression.text
          if (/^[A-Z]/.test(k) && !local.has(k) && !declared.has(k)) out.push({ _tag: "UndeclaredCallTimeUse", pluginId, serviceId: k, file, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1 })
        }
        const next = (c: ts.Node): number => {
          if (!isFn(c)) return depth
          const gen = c.parent && ts.isCallExpression(c.parent) && ts.isPropertyAccessExpression(c.parent.expression) && c.parent.expression.name.text === "gen"
          return depth === 0 && gen ? 0 : depth + 1
        }
        ts.forEachChild(n, (c) => walk(c, next(c)))
      }
      if (isFn(fn)) ts.forEachChild(fn, (c) => walk(c, 0)); else walk(fn, 0)
    }
  }
  const find = (n: ts.Node) => { if (ts.isCallExpression(n)) visitCall(n); ts.forEachChild(n, find) }
  find(sf)
  return out
}
