// A `Layer.MemoMap` that records the entry scope of every layer built through it (report 03 R8). `Layer.MemoMap` is a public
// interface (`get`, `getOrElseMemoize`): `getOrElseMemoize` hands each layer's entry scope to `build`, and passing this map down
// keeps nested layers inside it. The host uses the record to keep a failed finalizer so that `retryCleanup` can run it again.
import { Effect, Exit, Layer, Scope } from "effect"

type Fin = (exit: Exit.Exit<any, any>) => Effect.Effect<void>
const isScope = (x: unknown): x is Scope.Scope => typeof x === "object" && x !== null && "~effect/Scope" in x
const finalizersOf = (scope: Scope.Scope): ReadonlyArray<Fin> => {
  const st = scope.state
  return st._tag !== "Open" ? [] : [st.finalizer, ...(st.finalizers?.values() ?? [])].filter((f): f is Fin => f !== undefined)
}

/** A finalizer that failed at close: its first cause, and the effect that runs it again. */
export interface Retained<C> { readonly cause: C; readonly run: Effect.Effect<void, unknown> }

export interface TrackedMemo {
  readonly memo: Layer.MemoMap
  /**
   * Wraps the finalizers the layers registered themselves, so that one that fails is pushed to `sink` while `live.open`.
   * The finalizers a memo map registers to count its observers are left alone: they close a scope once and cannot be run again.
   */
  readonly capture: <C>(sink: Array<Retained<C>>, live: { open: boolean }, causeOf: (cause: any) => C) => void
}

export const trackedMemo = (): TrackedMemo => {
  const inner = Layer.makeMemoMapUnsafe()
  const entries: Array<Scope.Scope> = []
  const observers = new Set<unknown>()                         // finalizers registered by the memo map, not by a layer
  const note = (scope: Scope.Scope, before: ReadonlySet<Fin>): void => { for (const f of finalizersOf(scope)) if (!before.has(f)) observers.add(f) }
  const memo: Layer.MemoMap = Object.assign(Object.create(inner) as Layer.MemoMap, {
    get: (layer: Layer.Layer<any, any, any>, scope: Scope.Scope) => {
      const before = new Set(finalizersOf(scope))
      // A child memo map (made by `Layer.provide`, `Effect.provide`) asks its parent for a layer before it builds one itself. Answering
      // with a build through this map keeps those layers, and the scopes they build in, inside the record.
      const r = inner.get(layer, scope) ?? Layer.buildWithMemoMap(layer, memo, scope)
      note(scope, before)
      return r
    },
    getOrElseMemoize: (layer: Layer.Layer<any, any, any>, scope: Scope.Scope, build: (m: Layer.MemoMap, s: Scope.Scope) => Effect.Effect<any, any, any>) =>
      Effect.suspend(() => {
        const before = new Set(finalizersOf(scope))
        return inner.getOrElseMemoize(layer, scope, (_, entry) => { note(scope, before); entries.push(entry); return build(memo, entry) }).pipe(
          Effect.ensuring(Effect.sync(() => note(scope, before))))
      })
  })
  const capture: TrackedMemo["capture"] = (sink, live, causeOf) => {
    for (const scope of entries) {
      const st = scope.state
      if (st._tag !== "Open") continue
      const wrap = (key: {} | undefined, f: Fin): Fin =>
        isScope(key) || observers.has(f) ? f
          : (exit) => Effect.suspend(() => f(exit)).pipe(Effect.onExit((x) => Exit.isFailure(x) && live.open
            ? Effect.sync(() => { sink.push({ cause: causeOf(x.cause), run: Effect.suspend(() => f(Exit.void)) }) })
            : Effect.void))
      if (st.finalizer !== undefined) st.finalizer = wrap(st.finalizerKey, st.finalizer)
      if (st.finalizers !== undefined) for (const [k, f] of st.finalizers) st.finalizers.set(k, wrap(k, f))
    }
  }
  return { memo, capture }
}
