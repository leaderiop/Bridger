# Readiness spike 03: Schema, contracts, config, data primitives

## 1. Purpose and scope

This area asks whether Effect 4.1.4 supplies what Bridger needs for value contracts, configuration and data primitives, and where Bridger must build its own pieces. Spec references it answers:

- `docs/knowledge/EFFECT-SCHEMA-MODEL.md` and `docs/ERP-SCHEMA-DESIGN.md`: field catalog persistence, Model/VariantSchema variants, plugin field contribution to a shared table.
- `docs/ERP-MODELS.md`: money and date handling in ERP records.
- `references/core` (contracts, schemaVersion, Sensitive fields), `references/kit` (config, manifests), `references/gxp` (zone-aware timestamps), `references/audit-chain` (BEH-AC-003 canonical encoding, INV-AC-007 one canonicaliser).
- `docs/resources/effect-cluster/schema-and-other-modules.md` for the module inventory.

Eleven spikes: versioned upcasting (01), SchemaRepresentation (02), JSON Schema (03), Model/VariantSchema (04), SchemaBinary (05), Brand/Redacted (06), Config (07), DateTime and BigDecimal money (08), Graph (09), canonical JSON (10), Schema AOT/JIT (11).

## 2. Environment and method

- effect 4.1.4 (installed in `spikes/node_modules`), vitest 5.1.0, Node 22+, `@effect/platform-node` 4.1.4 for `fromDir`.
- Run: from `spikes/`, `npx vitest run 03-schema-config`. Result at time of writing: 11 files, 106 tests, all green. `npx tsc --noEmit` reports no errors in this directory. Per-test observed values are printed with `--reporter=verbose` (lines prefixed `[NNx]`).
- Method: characterization tests. Each test asserts what happened, including negative behaviour. Source reading (`../../effect/packages/effect/src`) was used to find APIs and to explain observed behaviour; such points are marked "source".

File map (all under `spikes/03-schema-config/`):

| File | Content |
|---|---|
| `01-upcast.spike.test.ts` | decodeTo upcast chain, union of versions, hand-rolled registry, excess-property handling |
| `02-representation.spike.test.ts` | toRepresentation/toJson/fromJson/fromRepresentation with and without revivers, custom check |
| `03-jsonschema.spike.test.ts` | JSON Schema export, import rejection list, draft-07 and OpenAPI inputs |
| `04-model.spike.test.ts` | Model.Class variants, Sensitive, GeneratedByDb, plugin extension, fieldEvolve |
| `05-binary.spike.test.ts` | SchemaBinary default vs fingerprint, fieldId evolution, Int32/Number |
| `06-brand-redacted.spike.test.ts` | brand without runtime check, Redacted leakage, equality, wipeUnsafe |
| `07-config.spike.test.ts` | fromDir secret mount (temp dir), fromEnv, Config.Redacted, orElse vs withDefault, empty strings |
| `08-datetime-money.spike.test.ts` | DST disambiguation, BigDecimal money operations and pitfalls |
| `09-graph.spike.test.ts` | topo sort, cycle detection, mermaid, reverse and dependents |
| `10-canonical-json.spike.test.ts` | gap proof and a minimal RFC 8785 implementation with vectors |
| `11-aot-jit.spike.test.ts` | JIT enable, blocked-Function simulation, AOT module output |

## 3. Findings

### SPK-03-01 Versioned payload upcasting. Verdict: PARTIAL

Need: stored and wire payloads carry a version; readers upcast old versions to the latest (core schemaVersion, audit-chain BEH-AC-003 `schemaVersion`).

Tested (observed): a v1 `{name}` to v2 `{firstName,lastName}` to v3 `{fullName,locale}` chain.

```ts
const V1toV2 = V1.pipe(Schema.decodeTo(V2, {
  decode: SchemaGetter.transform((a) => ({ v: 2, firstName, lastName })),
  encode: SchemaGetter.transform((b) => ({ v: 1, name: `${b.firstName} ${b.lastName}` }))
}))
const Latest = Schema.Union([V3, V2toV3, V1toV3 /* V1toV2 then decodeTo(V3) */])
```

Observed: each step decodes and encodes back (01a). The union decodes v3, v2 and v1 to the v3 type (01b). Encoding the latest through the union writes the v3 wire form because the first matching member is v3 (01c). A v4 payload fails with a generic union parse failure, not a typed "future version" error (01d). A hand-rolled registry (peek `{v}` via an envelope schema, run `registry.filter(s => s.from >= v)` steps, decode with V3) gave a typed `UnknownFutureVersion:9` in about 12 lines (01e).

Pitfall observed (01f): Struct decode silently strips unknown keys. `onExcessProperty` accepts only `"ignore"` and `"error"`; passing `"preserve"` is a silent no-op (the key is still removed). Preserving unknown fields needs `Schema.StructWithRest(V2, [Schema.Record(Schema.String, Schema.Unknown)])`.

Caveat: the union approach grows combinatorially (one member per old version); the registry approach scales linearly. Evidence: `01-upcast.spike.test.ts`, tests 01a to 01f.

### SPK-03-02 SchemaRepresentation round trip. Verdict: PARTIAL

Need: persist a field catalog as JSON and revive it as runtime schemas (ERP-SCHEMA-DESIGN runtime composition from immutable descriptors).

Observed:
- Built-in checks (`isMinLength`, `isPattern`, `isInt`, `isGreaterThanOrEqualTo`) survive `toRepresentation` to `toJson` to `JSON.stringify` to `fromJson` to `fromRepresentation` when all built-in `*Reviver` exports of `SchemaRepresentation` are passed. The revived schema enforces them (02a).
- Revivers are not implicit. With `revivers: []` the call throws `Missing reviver for effect/schema/isMinLength` and names the path (02b).
- An opaque `Schema.makeFilter(...)` with no `representation` annotation passes `toRepresentation` but `toJson` throws `Missing key` at `...checks[0].representation` (02c). It cannot be persisted at all.
- A custom check declaring `representation: { id: "bridger/iban", payload: null }` persists. Reviving without a matching reviver throws `Missing reviver for bridger/iban` (loud, never a silent drop) (02d). With a reviver it is enforced again (02e).
- Brand names do not appear in the JSON (02f). Source docs say TypeScript-only distinctions are absent from the AST.
- `title`, `description` and a free-form key (`x-bridger-field`) survive (02g). Non-JSON annotations are omitted per source docs (not tested).
- `toJson` output is identical across two calls, so it is usable as hash input (02h).

Pattern that worked (the "defineCheck" idea, only the two halves were tested separately):

```ts
const ibanAnnotations = { title: "iban",
  representation: { id: "bridger/iban", payload: null },
  toJsonSchema: () => ({ pattern: ibanRe.source }) }
const Iban = Schema.String.check(Schema.makeFilter(ibanTest, ibanAnnotations))
const ibanReviver = SchemaRepresentation.makeReviverFilter("bridger/iban", Schema.Null,
  ({ annotations }) => Schema.makeFilter(ibanTest, { ...annotations, ...ibanAnnotations }))
```

Caveat: determinism of `toJson` was checked within one process only. Evidence: `02-representation.spike.test.ts`.

### SPK-03-03 JSON Schema import and export. Verdict: PARTIAL

Need: plugin manifest contract as JSON Schema 2020-12; ingest external schemas (draft-07, OpenAPI).

Observed:
- `Schema.toJsonSchemaDocument(Manifest)` yields `type: object`, `required` (optional key excluded), `integer` with `minimum`/`maximum`, array of `enum`, `additionalProperties: true`, and `title` (03a). The `SchemaRepresentation.toJsonSchemaDocument(toRepresentation(ast))` route also works (03b).
- Opaque custom checks export as plain `{ type: "string" }` (03c).
- Pitfall: `Schema.isPattern(/.../)` without the `u` flag is silently omitted from the exported schema. Source (`Schema.ts`): `canExport = /^[dg]*uy?$/.test(flags)`. With `/.../u` the pattern is exported (03c2). The manifest must therefore use `u`.
- Round trip: export then `fromJsonSchemaDocument(doc, { patterns: "apply" })` validates like the original (03d). Without that option, import throws on any pattern (03e).
- Each rejection confirmed with a distinct error, e.g. `Cannot import JSON Schema keyword "contains": Effect has no equivalent constraint.` Rejected: `contains`, `if` (with then/else), `unevaluatedProperties`, `unevaluatedItems`, `$dynamicRef`, `dependentRequired`, `dependentSchemas`, and `not` other than `{}`. Object `const` and array `enum` give `Only primitive values are supported in "const" and "enum".` (03f, 03g). `{ not: {} }` imports as Never.
- draft-07 (`definitions`, tuple `items`, `additionalItems:false`) converts with `JsonSchema.fromSchemaDraft07` and then imports (03h). OpenAPI 3.1 and 3.0 (`nullable`) convert via `fromSchemaOpenApi3_1` and `fromSchemaOpenApi3_0` (03i, 03j). Export to draft-07 and `toMultiDocumentOpenApi3_1` works (03k).
- Imported closed objects strip excess properties by default; they reject only with `onExcessProperty: "error"` (03l).

Evidence: `03-jsonschema.spike.test.ts`. Caveat: only the listed keywords were probed, not the full dialect.

### SPK-03-04 Model and VariantSchema. Verdict: PARTIAL

Need: one field declaration yields database and JSON variants; plugins contribute fields to a shared table (ERP-SCHEMA-DESIGN).

Observed field sets for `Model.Class` with `GeneratedByDb` id, `Sensitive` apiKey, title, `DateTimeInsertFromDate`, `DateTimeUpdateFromDate`:
- select: apiKey, createdAt, id, title, updatedAt. insert: no id. update: apiKey, title, updatedAt (no id, and no createdAt). json: createdAt, id, title, updatedAt (no apiKey). jsonCreate and jsonUpdate: title only (04a to 04c).
- `Sensitive(Schema.Redacted(String))` rejects a raw string from a row with "Expected Redacted". A DB-facing sensitive field needs `Schema.RedactedFromValue`; the decoded value prints as `<redacted>` (04d).
- Extension by spreading `Model.fields(Task)` into a new `Model.Class`, adding plugin fields including a `Sensitive` one, works; the new class excludes the sensitive field from json variants and the base class is not mutated (04e). `Model.Struct` over a runtime-built field map plus `Model.extract(S, "insert")` also works (04f).
- `Model.fieldEvolve(field, { insert: s => s.check(...) })` tightens one variant only (04g, with a positive control in 04h).
- Nothing prevents a plugin from replacing or dropping another owner's field, and a duplicate name silently takes the last spread (04h, 04i).

Inference: SqlModel repository docs say the id must exist in `update.Type`; since `update` here has no id, the repository key must be supplied separately. Not tested with SqlModel (area 02).

Evidence: `04-model.spike.test.ts`.

### SPK-03-05 SchemaBinary evolution. Verdict: PARTIAL

Need: compact binary frames with schema evolution (stability marked unstable in source).

Observed:
- Default mode with `SchemaBinary.fieldId(n)`: old writer to new reader (added optional field id 3) decodes (05b); new writer to old reader skips the unknown id (05c); a rename with the same id decodes into the renamed key (05d).
- Without ids: an added optional field is tolerated, a rename fails with `Missing key` because names are the keys (05e).
- Fingerprint mode: same schema round trips; any layout change fails with `Expected matching layout fingerprint` (05f); a default-mode frame read by a fingerprint reader is rejected (05h).
- Sizes for 10 numeric fields: default with ids 22 bytes, fingerprint with ids 30, default without ids 62, fingerprint without ids 30. Fingerprint is smaller only when ids are not used (05g). A 2-field frame was 7 bytes default and 14 fingerprint.
- Int32 vs Number: integers have identical bytes (`0320090e` for 7) so a swap is invisible on the wire (05i). A float from a Number writer (`04200d1e01` for 1.5) read by an Int32 reader fails with `Missing key`, which is a misleading message; the tag mismatch is skipped as an unknown field.
- A type change under the same id (string to number) fails with `Missing key` and never coerces (05j). Duplicate ids throw `Binary layout field id collision: 1 (a, b)` at codec build (05k).

Evidence: `05-binary.spike.test.ts`.

### SPK-03-06 Brand and Redacted. Verdict: PARTIAL

Observed:
- `Schema.brand` adds no runtime check: `Schema.String.pipe(Schema.brand("LotNumber"))` accepts any string, and `Bare.make("whatever")` returns it (06a, 06d). Two brands over the same base are runtime-identical (06c). Checks must precede `brand` to apply (06b).
- Failure messages do not echo secrets: inner check failure text is "Expected a valid value" or "Expected a value with a length of at least 20"; a raw string given where `Redacted` is expected yields "Expected Redacted" without the value (06e to 06g).
- `String(r)`, template strings and `JSON.stringify` of a wrapper give `<redacted>` or `<redacted:label>` (06h).
- Pitfall (06i): `Schema.encodeUnknownSync(Schema.toCodecJson(Schema.Redacted(Schema.String)))(Redacted.make("s3cret"))` returns the plaintext `"s3cret"`. Only `Schema.Redacted(S, { disallowJsonEncode: true })` makes that encode fail.
- Equality is by wrapped value (`Equal.equals` true for equal secrets); `makeEquivalence` exists. Inference: this is not constant-time (06j).
- `Redacted.wipeUnsafe` returns true once, after which `Redacted.value` throws and a second wipe returns false. The original JS string is unchanged (06k).

Secret wrapper that follows from this (a sketch built from the tested options, not itself tested):

```ts
export const Secret = <S extends Schema.Constraint>(s: S) =>
  Schema.RedactedFromValue(s, { disallowJsonEncode: true })
```

Check that `RedactedFromValue` accepts the same option before relying on it; only `Schema.Redacted` was exercised with the option. Evidence: `06-brand-redacted.spike.test.ts`.

### SPK-03-07 Config. Verdict: READY

Observed (temp dir mount with `DB_PASSWORD`, `EMPTY`, `PORT`, `plugins/acme/apiKey`):
- `ConfigProvider.fromDir({ rootPath })` with `NodeFileSystem.layer` and `NodePath.layer` reads files, trims the trailing newline, and `Config.Redacted` yields a value that prints `<redacted>` (07a). Nested directories via `Config.nested` (07b).
- Empty file and empty env var count as absent by default, so `withDefault` applies; `preserveEmptyStrings: true` keeps `""` (07c, 07g).
- `fromEnv` splits names on a single `_` and is case-sensitive. Lower-case struct keys fail to find `DB_HOST` until `ConfigProvider.constantCase` is applied; `DB__HOST` is not a nesting delimiter (07d, 07e).
- `withDefault` falls back only on absence; an invalid value still fails. `orElse` also catches the invalid value, so a typo silently becomes the default (07f).
- `ConfigProvider.orElse(env, mount)` layers sources (07h). Errors name the path and do not contain the secret value (07i, 07j). `ConfigProvider.layer` swaps the provider for a program; a `Config` is itself an Effect (07k).

Caveat: `fromDir` needs FileSystem and Path services. Evidence: `07-config.spike.test.ts`.

### SPK-03-08 DateTime and BigDecimal money. Verdict: PARTIAL

DateTime observed (America/New_York): repeated 01:30 on 2025-11-02 gives `2025-11-02T05:30:00.000Z` for earlier and compatible, `06:30Z` for later; reject returns `None` (08a). Skipped 02:30 on 2025-03-09: earlier `06:30Z`, later and compatible `07:30Z` (08b). `add({days:1})` across spring-forward is 23 hours of elapsed time, `add({hours:24})` is 24 (08c). Unknown zone: `None` via `zoneMakeNamed`, throws via `zoneMakeNamedUnsafe` (08d). `startOf("day")` is zone aware and `formatIsoZoned` round-trips through `makeZonedFromString` (08e).

Money observed:
- Add and multiply are exact (08f). `BigDecimal.round(x, { scale: 2, mode: "half-even" })` gives banker's rounding: 10.825 to 10.82, 10.835 to 10.84, 2.675 to 2.68, -2.665 to -2.66 (08g). Line total 9.99 x 3 x 1.2 is 35.96 (35.964).
- Pitfall (08h): `BigDecimal.scale(x, 2)` to a lower scale truncates toward zero: 1.999 gives 1.99, -1.999 gives -1.99, 0.005 gives 0. It is silent.
- Pitfall (08i): `divideUnsafe(1, 3)` has scale 100 (source: `DEFAULT_PRECISION = 100`); `q * 3` does not equal 1. Money division needs an explicit round.
- Pitfall (08j): 100.00 / 3 rounded to 2dp three times and summed gives 99.99. Integer-cent largest-remainder allocation sums to the total.
- `equals` is numeric (1.0 equals 1.00) while `scale` differs (08k). `fromNumberUnsafe(0.1 + 0.2)` formats as `3.0000000000000004e-1`; `fromString` returns None for `"1,5"` and `"abc"` (08l).
- `Schema.toCodecJson(Schema.BigDecimal)` encodes 12.50 as the string `"12.5"` (scale not preserved) and decodes back equal (08m).
- No currency type; adding two BigDecimals of different currencies is not prevented (08n). `format` normalizes trailing zeros.

Minimal Bridger operations used: `BD.sum`, `BD.multiply`, `round2 = x => BD.round(x, { scale: 2, mode: "half-even" })`. Evidence: `08-datetime-money.spike.test.ts`.

### SPK-03-09 Graph. Verdict: READY

Observed: with edges drawn dependency to dependent, `Graph.topo` returns every dependency before its dependents and is stable for identical input; one run gave `bridger.core > kit > audit-chain > erp.records > erp.inventory > gxp` (09a, 09b). A three-node cycle: `isAcyclic` false, `topo` throws `GraphError` containing "cyclic", `findCycle` returns `a -> b -> c -> a`; a self dependency is a one-edge cycle (09c, 09d). `toMermaid` starts with `flowchart TD`, labels edges, and escapes `"`, `<`, `>` (09e). Reversing requires a mutable graph: `Graph.mutate(g, m => { Graph.reverse(m) })` (calling `reverse` on an immutable graph throws "Graph is not mutable"); `dfs` from a node gives the transitive dependents (09f). Graph has no version or resolve functions, and `addEdge` to a missing node throws, so the registry must validate dependencies first (09g, 09h). Source: topo is Kahn's algorithm with index tie-breaks (inference from reading, determinism observed). Evidence: `09-graph.spike.test.ts`. Stability is unstable per source.

### SPK-03-10 Canonical JSON (RFC 8785). Verdict: GAP

Need: BEH-AC-003 requires the record hash input to be the RFC 8785 serialization, with lone surrogates written as lower-case `\uXXXX` and `canonical: "jcs-escaped"`.

Observed: scanning every `.ts` in effect `src` for `jcs`, `rfc 8785`, `canonicalJson`, `stableStringify` found nothing; `sortKeys` appears for the XML encoder (and a swagger helper), `canonicalize` is a BigDecimal normalizer (10a). `JSON.stringify({a,b})` differs from `{b,a}`, and `Schema.toCodecJson` output keeps schema field order (10b).

Minimal implementation (observed to pass tests 10c to 10i):

```ts
export const canonicalize = (v: unknown): string => {
  if (v === null) return "null"
  switch (typeof v) {
    case "boolean": return v ? "true" : "false"
    case "number":
      if (!Number.isFinite(v)) throw new TypeError("not I-JSON")
      return Object.is(v, -0) ? "0" : String(v)
    case "string": return JSON.stringify(v)
    case "object":
      if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]"
      const o = v as Record<string, unknown>
      return "{" + Object.keys(o).filter(k => o[k] !== undefined).sort()
        .map(k => JSON.stringify(k) + ":" + canonicalize(o[k])).join(",") + "}"
    default: throw new TypeError("not JSON")
  }
}
```

Verified: the RFC 8785 section 3.2.3 example output (10c); key order by UTF-16 code units, with the astral key before U+FB33 (10d, checked on the output string because `Object.keys` of a parsed object reorders integer-like keys); `-0` gives `0`, `1e21` gives `1e+21`, `1e-7` gives `1e-7`, NaN and Infinity throw (10e); undefined fields stay absent (10f); a lone surrogate gives `"a\ud800b"` with a lower-case escape (10g); construction order does not change output (10i). Bigint throws; `2**53 + 1` prints as `9007199254740992`, a silent precision loss, so ids and money must be strings (10h). `toCodecJson` turned a BigDecimal into `"1.5"` and a DateTime into an ISO string, producing I-JSON-compatible input (10h).

Caveat: only the RFC example and the listed cases were run, not the full RFC 8785 conformance suite. Reliance on ECMAScript number formatting matching RFC 8785 section 3.2.2.3 is from the RFC text (inference), supported by the vectors passed. Evidence: `10-canonical-json.spike.test.ts`.

### SPK-03-11 Schema AOT and JIT. Verdict: PARTIAL

Observed:
- JIT is opt-in: `import "effect/schema/SchemaJITCompiler/enable"`. With it, a first decode of a fresh schema in Node called `Function` 4 times (11a). Vitest isolates modules per file, so the import does not affect other spikes (inference from vitest defaults; not cross-checked).
- With `globalThis.Function` replaced by a proxy that throws `EvalError`, a fresh schema still decodes and fails with the same message ("at least 3") as before; `Schema.is` also works (11b). Source (`SchemaJITCompiler.ts`) probes `Function("return true")` and returns undefined from the compiler when it throws, so the interpreter is used. The probe re-runs when `globalThis.Function` changes; restoring it re-enables JIT (11c).
- `SchemaAOTCompiler.compile([{ ast, operations: ["decode","is"] }])` returns an ES module source (about 4.4 kB for a three-field struct) that starts with a "Generated by SchemaAOTCompiler" comment, imports `runtime` from `effect/schema/SchemaCompiler/runtime`, and exports `install`. It contains no `new Function` or `eval` (11d).
- After writing the source to a `.mjs`, importing it and calling `install([S.ast])`, decoding `S` under a spy made 0 `Function` calls; a structurally identical schema `S2` was not covered and made 2 calls, so registration is keyed by AST identity (11e).
- A schema revived at runtime with `fromRepresentation` decodes under the blocked `Function` via the interpreter (11g).

Caveat: the blocking is a simulation. `Function` is replaced after the module is loaded; real workerd blocks at the engine level. Evidence: `11-aot-jit.spike.test.ts`.

## 4. Surprises and gotchas

1. `Schema.toCodecJson` of a `Redacted` field emits the plaintext secret (06i). Naive `JSON.stringify` of the wrapper does not, which hides the problem in simple tests.
2. `isPattern` without the `u` flag disappears from JSON Schema output with no warning (03c2).
3. `onExcessProperty: "preserve"` is accepted and ignored (01f).
4. `BigDecimal.scale(n)` truncates; `BigDecimal.round` rounds. Both look like "set the scale" (08h).
5. `Config.orElse` hides typos; `Config.withDefault` does not (07f).
6. Env lookups are case-sensitive and use only `_`; camelCase struct keys need `constantCase` (07d, 07e).
7. A schema with an opaque custom check can be turned into a representation object but cannot be serialized (02c); failure appears at `toJson`, not at `toRepresentation`.
8. `GeneratedByDb` id is absent from `update` as well as `insert` (04a).
9. SchemaBinary fingerprint mode is bigger than default mode when `fieldId`s are used (05g); Int32 and Number are wire-identical (05i); a type mismatch reports `Missing key` (05i, 05j).
10. `Sensitive(Schema.Redacted(String))` cannot decode a DB string; use `RedactedFromValue` (04d).
11. `BigDecimal.fromNumberUnsafe` captures float noise and formats in exponent notation (08l).
12. `Graph.reverse` works only inside `Graph.mutate` (09f).
13. AOT registration is by AST identity; a twin schema is not covered (11e).

## 5. Missing pieces and design sketches

1. **Canonical JSON module** (audit-chain `Canonical.ts`): the `canonicalize` above, plus the RFC 8785 conformance vectors and an I-JSON check that returns the `jcs-escaped` marker when a lone surrogate is seen. Sketch: `canonicalize(record): { text: string; escaped: boolean }`.
2. **Money value**: branded `{ amount: BigDecimal, currency }` with `fromString` only, `add` that rejects a currency mismatch, `mul(rate)` followed by an explicit `round2` half-even, `allocate(total, n)` in integer cents by largest remainder, and a string JSON codec that fixes scale to the currency's minor units.
3. **Secret schema**: `Schema.Redacted`/`RedactedFromValue` with `disallowJsonEncode: true` fixed, and a constant-time compare helper.
4. **Version registry**: map `version -> { schema, up }`, an envelope peek, a typed `UnknownFutureVersion` error, and `StructWithRest` or `onExcessProperty: "error"` on stored payloads.
5. **`defineCheck(id, payloadSchema, make)`**: one call returns both the check (with `representation` and `toJsonSchema` set) and the reviver, and registers the reviver in a catalog-wide list passed to `fromRepresentation`.
6. **Field ownership guard** over Model fields: reject a plugin spread that replaces or drops a field owned by another module, and reject duplicate names.
7. **fieldId ledger**: a checked-in list of `(struct, field, id)` with a CI test that ids are never reused or reassigned.
8. **Manifest lint**: every `isPattern` carries `u`; manifest dialect limited to what import accepts (see 03f).

## 6. Fix and improve list by owner

bridger-spec
- must: state that canonical form is produced by a Bridger-owned function, and add the lone-surrogate and number rules as test vectors (SPK-03-10).
- must: state that stored versioned payloads decode with `StructWithRest` or `onExcessProperty: "error"` (SPK-03-01).
- must: require `withDefault` rather than `orElse` for optional config and `constantCase` for env (SPK-03-07).
- should: forbid `BigDecimal.fromNumber` and `scale()` for money, and require explicit rounding mode and scale (SPK-03-08).
- should: note that `Model.update` has no id and `Model.Sensitive` + `RedactedFromValue` is the DB pairing (SPK-03-04).
- should: choose default-mode SchemaBinary with `fieldId` for durable or cross-version frames; fingerprint only for same-build peers (SPK-03-05).
- nice: document the supported manifest dialect as the import rejection list (SPK-03-03).
- nice: say that wipe is best effort (SPK-03-06).

bridger-code
- must: `Canonical.ts` (SPK-03-10).
- must: Secret schema with `disallowJsonEncode` (SPK-03-06).
- must: Money type and allocation (SPK-03-08).
- should: version registry (SPK-03-01); `defineCheck` (SPK-03-02); field ownership guard (SPK-03-04); manifest lint for `u` flag (SPK-03-03); validate module dependencies before Graph construction (SPK-03-09).
- nice: fieldId ledger test (SPK-03-05).

effect-upstream
- should: Redacted JSON codec deny-by-default or documented warning (SPK-03-06).
- should: `SchemaBinary` type-mismatch error should not read `Missing key` (SPK-03-05).
- nice: reject or warn on unknown `onExcessProperty` values (SPK-03-01); warn when `isPattern` is dropped from JSON Schema because of missing `u` (SPK-03-03); a built-in JCS serializer (SPK-03-10).

qadi, awthaq
- None from this area.

## 7. Not verified

- Real workerd or any non-Node runtime: only a `Function` proxy was used. Verifying needs running the same tests under workerd (`wrangler dev` or Miniflare); Cloudflare itself is out of scope.
- JSON Schema import of the full 2020-12 dialect and large real-world documents; only the keywords listed in 03f and 03g were probed.
- SchemaBinary across processes and large or nested structures (arrays, unions, recursive types), stream parser and duplex APIs.
- `Model` with `SqlModel.makeRepository` against a database (area 02 covers SQL).
- Revived schemas with non-built-in declarations (e.g. DateTime, BigDecimal declarations) through `fromRepresentation`.
- Whether the Secret sketch with `RedactedFromValue` and `disallowJsonEncode` behaves as intended; only `Schema.Redacted` was tested with that option.
- Full RFC 8785 conformance suite and non-BMP property names beyond the single vector.
- `fromDir` on a real Kubernetes projected volume (symlinked `..data` directories); only a plain temp directory was used.
- DateTime for zones other than America/New_York and for historic tz-database changes.

## 8. Reproduction notes

- From `/Users/mohammadalmechkor/Projects/Perso/Bridger/spikes`: `npx vitest run 03-schema-config` (add `--reporter=verbose` to see the `[NNx]` observations). `npx tsc --noEmit` for the type check.
- Test 07 creates temp directories under the OS temp dir with `fs.mkdtempSync`; test 11e writes `.aot-<pid>.mjs` into `03-schema-config/` and removes it in `afterAll`.
- Test 10a reads effect source at `../../effect/packages/effect/src` relative to the spikes workspace (`/Users/mohammadalmechkor/Projects/Perso/effect`); it fails if that path is missing.
- Tests assert present behaviour of 4.1.4; several modules (SchemaBinary, Model, Graph, compilers, `fromJsonSchemaDocument`) are marked unstable in source, so re-run after any Effect upgrade.
- Test 11 imports the JIT enable module at file level; keep it in its own file so the global registry change does not affect other tests.
