// Operation-context annotations (references/core behaviour 30, BEH-BR-289–292), the part the prototype needs:
// keys with flows, an immutable branded bag, combine/monotonic rules, filter, encode. Prototype only.
import { Context, Effect, Option, Schema } from "effect"

export type Flow = "events" | "gate" | "policy" | "callLog" | "audit" | "wire"
export interface AnnotationKey<A> {
  readonly id: string
  readonly schema: Schema.Codec<A, any>
  readonly combine: (current: A, incoming: A) => A
  readonly monotonic: boolean
  readonly flows: ReadonlyArray<Flow>
}
export interface Annotations {
  readonly get: <A>(key: AnnotationKey<A>) => Option.Option<A>
  readonly keys: ReadonlyArray<string>
}
export class DuplicateAnnotationKey extends Schema.TaggedError<DuplicateAnnotationKey>()("DuplicateAnnotationKey", { id: Schema.String }) {}
export class MonotonicAnnotation extends Schema.TaggedError<MonotonicAnnotation>()("MonotonicAnnotation", { id: Schema.String }) {}

const made = new WeakSet<object>()
const bagOf = (entries: ReadonlyMap<string, { key: AnnotationKey<any>; value: unknown }>): Annotations => {
  const b: Annotations & { entries: typeof entries } = Object.freeze({
    entries,
    get: <A>(key: AnnotationKey<A>) => { const e = entries.get(key.id); return e && e.key === key ? Option.some(e.value as A) : Option.none() },
    keys: Object.freeze([...entries.keys()].sort())
  })
  made.add(b)
  return b
}
const entriesOf = (b: Annotations) => (b as unknown as { entries: ReadonlyMap<string, { key: AnnotationKey<any>; value: unknown }> }).entries
/** A bag not made by core is treated as empty (BEH-BR-289). */
export const isBag = (u: unknown): u is Annotations => typeof u === "object" && u !== null && made.has(u)
const CORE_IDS = new Set(["bridger:deadline", "bridger:taint", "bridger:provenance"])

export const empty = bagOf(new Map())
export const add = <A>(bag: Annotations, key: AnnotationKey<A>, value: A): Annotations => {
  const base = isBag(bag) ? entriesOf(bag) : new Map()
  const cur = base.get(key.id)
  if (cur && cur.key !== key) throw new DuplicateAnnotationKey({ id: key.id })
  const next = new Map(base)
  next.set(key.id, { key, value: cur ? key.combine(cur.value as A, value) : value })
  return bagOf(next)
}
export const replace = <A>(bag: Annotations, key: AnnotationKey<A>, value: Option.Option<A>): Annotations => {
  if (key.monotonic) throw new MonotonicAnnotation({ id: key.id })
  const next = new Map(isBag(bag) ? entriesOf(bag) : new Map())
  if (Option.isSome(value)) next.set(key.id, { key, value: value.value }); else next.delete(key.id)
  return bagOf(next)
}
export const filter = (bag: Annotations, flow: Flow): Annotations =>
  bagOf(new Map([...(isBag(bag) ? entriesOf(bag) : new Map())].filter(([, e]) => e.key.flows.includes(flow))))
/** Encoded entries sorted by key; an unencodable value is omitted and named (BEH-BR-293). */
export const encode = (bag: Annotations): { readonly entries: ReadonlyArray<{ readonly key: string; readonly value: unknown }>; readonly omitted: ReadonlyArray<string> } => {
  const entries: Array<{ key: string; value: unknown }> = [], omitted: Array<string> = []
  for (const [id, e] of [...(isBag(bag) ? entriesOf(bag) : new Map())].sort(([a], [b]) => a < b ? -1 : 1)) {
    const r = Schema.encodeUnknownOption(e.key.schema)(e.value)
    if (Option.isSome(r)) entries.push({ key: id, value: r.value }); else omitted.push(id)
  }
  return { entries, omitted }
}
/** Combines a supplied bag into a fiber's: monotonic keys combine, others replace; never removes (BEH-BR-292). */
export const resolve = (fiber: Annotations, supplied: Annotations | undefined): Annotations => {
  let out = isBag(fiber) ? fiber : empty
  if (!supplied || !isBag(supplied)) return out
  for (const [, e] of entriesOf(supplied)) out = e.key.monotonic ? add(out, e.key, e.value) : replace(out, e.key, Option.some(e.value))
  return out
}

export const CurrentAnnotations = Context.Reference<Annotations>("@bridger/core/CurrentAnnotations", { defaultValue: () => empty })
const readCurrent: Effect.Effect<Annotations> = Effect.gen(function* () { return yield* CurrentAnnotations })
export const key = <A>(id: string, options: Omit<AnnotationKey<A>, "id">): AnnotationKey<A> => {
  if (id.startsWith("bridger:") && !CORE_IDS.has(id)) throw new Error(`annotation id ${id}: the bridger: prefix is reserved`)
  return Object.freeze({ id, ...options })
}
export const Annotation = {
  key,
  add: <A>(k: AnnotationKey<A>, value: A) => <X, E, R>(effect: Effect.Effect<X, E, R>) =>
    Effect.flatMap(readCurrent, (cur) => Effect.provideService(effect, CurrentAnnotations, add(isBag(cur) ? cur : empty, k, value))),
  replace: <A>(k: AnnotationKey<A>, value: Option.Option<A>) => <X, E, R>(effect: Effect.Effect<X, E, R>) =>
    Effect.flatMap(readCurrent, (cur) => Effect.provideService(effect, CurrentAnnotations, replace(isBag(cur) ? cur : empty, k, value))),
  current: Effect.map(readCurrent, (b) => isBag(b) ? b : empty),
  Deadline: key<{ readonly at: number }>("bridger:deadline", { schema: Schema.Struct({ at: Schema.Number }), combine: (a, b) => a.at <= b.at ? a : b, monotonic: true, flows: ["events", "gate", "policy", "callLog"] }),
  Taint: key<ReadonlySet<string>>("bridger:taint", { schema: Schema.ReadonlySet(Schema.String) as never, combine: (a, b) => new Set([...a, ...b]), monotonic: true, flows: ["events", "gate", "policy", "callLog", "audit", "wire"] }),
  Provenance: key<ReadonlyArray<{ readonly source: string; readonly ref?: string }>>("bridger:provenance", {
    schema: Schema.Array(Schema.Struct({ source: Schema.String, ref: Schema.optional(Schema.String) })) as never,
    combine: (a, b) => { const out = [...a]; for (const x of b) if (!out.some((y) => y.source === x.source && y.ref === x.ref)) out.push(x); return out.slice(0, 32) },
    monotonic: true, flows: ["events", "gate", "policy", "callLog", "audit", "wire"]
  })
}
export const Annotations = { empty, add, filter, encode, replace, resolve, isBag }
