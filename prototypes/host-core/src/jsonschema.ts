// The JSON Schema subset the encoded side of a contract uses (what Effect's `toJsonSchemaDocument` emits for structs, arrays, literals,
// unions and primitives): a validator, a seeded sampler and a TypeScript printer. Effect-free, so the partner SDK runtime can embed it
// (kit BEH-KT-033..034). shortcut: no $ref, patternProperties, formats or numeric bounds; upgrade when a contract needs them.
export type Json = null | boolean | number | string | ReadonlyArray<Json> | { readonly [k: string]: Json }
export interface JsonSchema { readonly type?: string; readonly enum?: ReadonlyArray<Json>; readonly const?: Json; readonly properties?: Readonly<Record<string, JsonSchema>>; readonly required?: ReadonlyArray<string>; readonly items?: JsonSchema; readonly anyOf?: ReadonlyArray<JsonSchema> }

/** `undefined` when `value` fits `schema`; otherwise a short path-and-reason message that never quotes the value. Unknown fields are ignored (BEH-BR-231). */
export const validate = (schema: JsonSchema, value: unknown, path = "$"): string | undefined => {
  if (schema.anyOf) {
    const errs = schema.anyOf.map((s) => validate(s, value, path))
    return errs.some((e) => e === undefined) ? undefined : `${path}: matches none of ${schema.anyOf.length} alternatives`
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) return `${path}: not one of the allowed values`
  switch (schema.type) {
    case "string": return typeof value === "string" ? undefined : `${path}: expected a string`
    case "number": return typeof value === "number" ? undefined : `${path}: expected a number`
    case "integer": return Number.isInteger(value) ? undefined : `${path}: expected an integer`
    case "boolean": return typeof value === "boolean" ? undefined : `${path}: expected a boolean`
    case "null": return value === null ? undefined : `${path}: expected null`
    case "array": {
      if (!Array.isArray(value)) return `${path}: expected an array`
      if (!schema.items) return undefined
      for (let i = 0; i < value.length; i++) { const e = validate(schema.items, value[i], `${path}[${i}]`); if (e) return e }
      return undefined
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return `${path}: expected an object`
      for (const k of schema.required ?? []) if (!(k in value)) return `${path}.${k}: missing`
      for (const [k, s] of Object.entries(schema.properties ?? {})) if (k in value) { const e = validate(s, (value as Record<string, unknown>)[k], `${path}.${k}`); if (e) return e }
      return undefined
    }
    default: return undefined
  }
}

/** A small seeded generator (mulberry32): the same seed gives the same samples (BEH-KT-017). */
export const rng = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export const sample = (schema: JsonSchema, next: () => number): Json => {
  const pick = <T>(xs: ReadonlyArray<T>): T => xs[Math.floor(next() * xs.length)]!
  if (schema.anyOf) return sample(pick(schema.anyOf), next)
  if (schema.enum) return pick(schema.enum)
  switch (schema.type) {
    case "string": return Array.from({ length: Math.floor(next() * 8) }, () => String.fromCharCode(97 + Math.floor(next() * 26))).join("")
    case "number": return Math.round(next() * 2000 - 1000) / 10
    case "integer": return Math.floor(next() * 2000 - 1000)
    case "boolean": return next() < 0.5
    case "null": return null
    case "array": return Array.from({ length: Math.floor(next() * 4) }, () => sample(schema.items ?? {}, next))
    case "object": {
      const out: Record<string, Json> = {}
      for (const [k, s] of Object.entries(schema.properties ?? {})) if ((schema.required ?? []).includes(k) || next() < 0.5) out[k] = sample(s, next)
      return out
    }
    default: return null
  }
}

/** The TypeScript type of a schema's values, for generated declarations. */
export const tsOf = (schema: JsonSchema): string => {
  if (schema.anyOf) return schema.anyOf.map(tsOf).join(" | ")
  if (schema.enum) return schema.enum.map((e) => JSON.stringify(e)).join(" | ")
  switch (schema.type) {
    case "string": return "string"
    case "number": case "integer": return "number"
    case "boolean": return "boolean"
    case "null": return "null"
    case "array": return `ReadonlyArray<${schema.items ? tsOf(schema.items) : "unknown"}>`
    case "object": {
      const fields = Object.entries(schema.properties ?? {}).map(([k, s]) => `${JSON.stringify(k)}${(schema.required ?? []).includes(k) ? "" : "?"}: ${tsOf(s)}`)
      return fields.length ? `{ ${fields.join("; ")} }` : "{}"
    }
    default: return "unknown"
  }
}
