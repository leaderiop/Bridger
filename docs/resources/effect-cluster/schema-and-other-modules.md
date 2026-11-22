# Schema and the other Effect modules — Bridger fit

Effect **4.1.4** API reference, read 2026-11-14. Back to [README](README.md). Complements [companion-modules.md](companion-modules.md) (SQL, persistence, EventLog, RPC, crypto, observability) and the repo's own `docs/knowledge/EFFECT-SCHEMA-MODEL.md` (Model/VariantSchema field proposal, not repeated here).

Tags: **[V]** verbatim page text, **[S]** model summary of a truncated page tail (unverified), **[inf]** my inference. Many big pages (Schema, SchemaAST, SchemaParser, SchemaIssue, SchemaTransformation, SchemaGetter, Stream, HttpRouter, Tar, Zip…) were cut at ~40k chars, so their tails are [S]. Most modules are unstable.

## 1. Gap → component (new rows)

| Bridger need | Component | Fit |
|---|---|---|
| Contract/field catalog as data, stored and sent between hosts | `SchemaRepresentation.toJson/fromJson` | partial — structure survives; custom checks need matching revivers |
| JSON Schema 2020-12 from a schema (plugin manifests, MCP tools, API docs) | `Schema.toJsonSchemaDocument`, `SchemaRepresentation.toJsonSchemaDocument` | strong [S] |
| Validate foreign JSON Schema docs | `SchemaRepresentation.fromJsonSchemaDocument` | partial — many keywords rejected (below) |
| One field declaration → DB/JSON variants | `Model` / `VariantSchema` / `SqlModel` | strong (already in repo note) |
| Schema evolution on the wire | `SchemaBinary` default mode + `fieldId` | partial |
| Versioned payload upcast | `SchemaTransformation` / `decodeTo` | not found in text — no documented upcast pattern |
| Secrets in config / logs | `Config.Redacted`, `Redacted`, `Redactable` | strong for accidental leaks; not cryptographic |
| Secret mounts as config | `ConfigProvider.fromDir` | strong [V] (K8s ConfigMap/Secret volumes) |
| Money amounts | `BigDecimal` | partial — default division precision and rounding not stated |
| Zoned timestamps | `DateTime` | strong [S] |
| Dependency ordering of modules | `Graph` (topo, cycle detection) | unverified — topo/cycle pages not read |
| Exhaustive event/command handling | `Match`, `Data.taggedEnum` | strong |
| Plugin bundle packaging | `Tar` (+ own hashing) | partial |
| Plugin-contributed HTTP routes | `HttpApi` / `HttpRouter` | **gap** — build-time only |
| OpenAPI 3.1 | `OpenApi.fromApi` | strong, 3.1 only |
| API auth | `HttpApiSecurity` + `HttpApiMiddleware` | strong |
| Trace propagation over HTTP | `HttpTraceContext` | strong (w3c + b3) |
| Spawn external tools | `ChildProcess` | partial — no sandbox options |
| Cloudflare runtime | `platform-cloudflare` | Cluster-on-DO only; no KV/R2/Worker Loader |
| Live-swappable service | `ScopedRef`, `Resource` | partial — reader protection undocumented |
| Fan-out events in-process | `PubSub`, `SubscriptionRef` | strong in-process only |
| OpenAPI → client/HttpApi codegen | `@effect/openapi-generator` | strong tool |

## 2. Schema core

- **Data**: only `Class`, `Error`, `TaggedClass`, `TaggedError`, `taggedEnum` [V]. No `Data.case/tagged/struct`. `taggedEnum` constructors make plain objects and the page says to validate untrusted input with Schema first [V].
- **Brand**: `Schema.brand(id)` is type-only, **no runtime check**, and must be reapplied after a schema is rebuilt [V]. `Brand.make` / `Brand.check` give runtime validation [V]. `Newtype` is compile-time only, unstable [V].
- **Annotations**: common keys `title`, `description`, `examples`, `message`, `identifier` [V]. `annotateKey` targets the field slot, `annotateEncoded` the encoded side [V].
- **Class**: `Class<Self>(identifier)`; extend with `Base.extend`, plain `extends` unsupported [S].
- **Defaults**: `withConstructorDefault` applies to `make*` only, not decoding [S]. `optionalKey` (absent only) vs `optional` (= with `undefined`) [S].
- **Parsing** [V]: `decodeEffect`, `decodeExit`, `decodePromise`; `make` throws an Error with message "Schema validation failed" and the Issue as `cause`. `ParseOptions` `errors`, `onExcessProperty`, `disableChecks`, `reportInput` [S].
- **Issues**: formatters `makeFormatterDefault`, `makeFormatterStandardSchemaV1` ({path, message}) [V/S]. `reportInput: true` stores the rejected value, so formatted messages can leak input into logs [S].
- **Transformations** [V]: `composeTransformation`, `makeTransformation({decode, encode})`, `passthrough`. Getters see `Option` (None = missing key). Gotchas [S]: `trim` not round-trippable; `numberFromString` accepts non-finite.
- **StandardSchema** vendored from spec 1.1.0 [V]; `Schema.toStandardSchemaV1` [S]. Useful for MCP/tool interop.
- **Not found in any text read**: `Redacted` as a schema field, field renaming/evolution helpers, `isMinLength`-style filters by name, versioned-upcast examples, perf notes. Do not assume them.

**Bridger take [inf]:** upcasting plugin payloads is plain composition: one Schema per version, `decodeTo` into the latest. No built-in version registry exists; that stays Bridger's job.

## 3. JSON Schema, representation, compilers

- **JsonSchema** module consumes Draft-07, 2020-12, OpenAPI 3.0 and 3.1; canonical internal form is `Document<"draft-2020-12">`; emits Draft-04, Draft-07, OpenAPI 3.1 [S]. Round trip is **not** guaranteed lossless [V].
- **Import rejections** [V]: `$dynamicRef`, `contains`, `dependentRequired`, `dependentSchemas`, active `if/then/else`, `unevaluatedItems/Properties`, object/array `const`/`enum`. Only local `#/$defs/<token>` refs. `not` only as `{ not: {} }`. Patterns error by default.
- **SchemaRepresentation**: AST ↔ plain data. `toJson`/`fromJson` then `fromRepresentation(doc, { revivers })` [S]. Revivers resolve by id and none are implicit; built-ins (Date, Option, Redacted, isInt, isPattern…) must be passed [S]. Lost: `brand`, callbacks, non-JSON annotations [S].
- **Model** variants: `select`, `insert`, `update`, `json`, `jsonCreate`, `jsonUpdate` [V]. Helpers include `GeneratedByDb`, `GeneratedByApp`, `Sensitive` (omitted from all JSON), `DateTimeInsert/Update`, `UuidV7Insert` [S]. `UuidV7WithGenerate` takes time from Clock, never backwards [S].
- **SqlModel** [V]: `makeRepository` (insert, update, findById, delete, optional soft-delete column), `makeResolvers` (no update resolver).
- **Compilers**: `SchemaJITCompiler.enable` compiles lazily and falls back to interpretation if `new Function` is blocked [V]. `SchemaAOTCompiler.compile(targets)` emits ES module source for environments that disallow dynamic function construction [V]; must be regenerated when schema or Effect version changes [V]. **No page mentions CSP, eval or workerd** — verify before relying on JIT on Workers.
- `Differ` is an interface only, no implementations [V]. `Arbitrary`, `TestSchema` (`verifyRoundTrip`), `Optic`, `JsonPointer`, `Formatter` exist and are small [V].

## 4. Config, secrets, time, money, graph

- **Config** [V]: `Config.all` is absent when any child is absent; `nested` joins with `_`; `orElse` covers any ConfigError, `withDefault` absence only. Schema configs reject opaque types (Any/Unknown/Json) [S].
- **ConfigProvider** sources: env, `.env` (needs FileSystem), `fromDir` (each file a leaf; trimmed, so trailing newline stripped), `fromUnknown`, custom `make`, `layer`/`layerAdd` [S; fromDir description V]. Empty strings count as missing unless `preserveEmptyStrings` [S].
- **Redacted** [V]: hides from `String()`, JSON, inspect. The value stays in memory and `Redacted.value` recovers it. `wipeUnsafe` removes it from an internal registry, **does not zero memory**. **Redactable** is a separate protocol for log masking [V]. Equality semantics unclear; use `makeEquivalence`.
- **DateTime**: absolute instant plus optional zone; `makeZoned` with `disambiguation` for DST gaps/overlaps [S].
- **Duration**: `fromIso` rejects years and month-length M [V].
- **BigDecimal**: bigint + scale, parsed scale limit ±10,000 [V]. Reducing scale truncates, not rounds [S]. Parse decimal strings, never floats [V]. **[inf]** pin scale and rounding mode at every money boundary.
- **Clock/Random** [V]: wall clock can go backwards; monotonic is not serializable; `Random` is `Math.random`-based, not secure. Hex.random also not secure [V].
- **Equal/Hash** [V]: results cached per object, so objects must not be mutated after first compare/hash; hash is not cryptographic.
- **Layer/ManagedRuntime** [V]: a failed layer build is cached in a `ManagedRuntime`; disposal is final. `Layer.fresh` opts out of memoization [S].
- **Graph** [V partial]: unstable; `bellmanFord`, `astar`, `articulationPoints` read. `topo`, `isAcyclic`, `findCycle`, `toMermaid` **not read** — verify before designing around them.

## 5. Streams, queues, ownership

- **Queue** strategies bounded/dropping/sliding/unbounded [V/S]. `end` drains then stops [V].
- **PubSub**: each subscriber gets every message; bounded slows publisher, dropping/sliding lose messages for slow subscribers; `replay` for late subscribers [V].
- **SubscriptionRef** `changes` emits current value first [S]. Slow-subscriber behavior unverified (likely PubSub strategy [inf]).
- **Stream** is pull-based; `buffer` drops chunking, `aggregateWithin`, `paginate`, `share` [S]. `runForEach` concurrency and `groupBy` not covered.
- **ScopedRef.set** acquires the replacement in a new scope, releases the old, and is serialized [V]. **Whether readers still holding the old value are protected is not documented.** This is the live-swap risk for Bridger's reconcile/generation model.
- **Resource**: `manual`/`auto(schedule)` refresh; failed refresh keeps the old result readable [V].
- **FiberHandle/FiberSet**: replacing a fiber interrupts the old one silently [V]; closing the scope interrupts all [V].
- **Scope**: finalizers LIFO in sequential scopes [V]. `Scope.fork` child closes with parent [V].
- **RequestResolver** batching; `withCache` never expires by time and skips interrupted results [V]. Caller context does not split batches [S].
- **Scheduler**: `MaxOpsBeforeYield` 2048; on Cloudflare Workers request-owned timers can be discarded [V].

## 6. HTTP and HttpApi

- **Routes are contributed as Layers and the router is built when the app layer is built. No runtime removal API is documented** [V/S]. Dynamic plugin routes means rebuilding an `HttpApi` value and its layer, or a single catch-all route that dispatches by Bridger's own table [inf]. This is a real gap for plugins contributing endpoints at runtime.
- `HttpApiBuilder.layer` rejects two endpoints with same method+path [V].
- **OpenAPI**: 3.1.0 only [V]. Cached by API instance and options identity [V].
- **Security** [V]: `bearer`/`http` decode to `Redacted<string>`; `basic` to `{username, password: Redacted}`; `apiKey` in header/query/cookie. `HttpApiMiddleware.Service` declares `provides` and `security`; handlers see provided services (runtime wiring inferred from types).
- **Errors**: ProblemDetails gives 400 decode / 500 encode; multipart 400/413/500; unsupported decompression 415 [V]. Generic mapping lives on unread `HttpApiError`/`HttpApiSchema`.
- **Headers gotcha** [V]: with `onExcessProperty: "error"` real requests fail unless `HeadersParseOptions` is set.
- **Shutdown** [V]: handlers run **uninterruptibly** by default; shutdown waits for them; no drain timeout or signal handling documented on HttpServer. Node's `gracefulShutdownTimeout` option exists but is unexplained.
- **HttpClient** [V]: `withCircuitBreaker` goes after `withRateLimiter` and `retryTransient`; the breaker sees headers only. `withRateLimiter` retries 429 unbounded unless `times` set. `retryTransient` honors Retry-After [S].
- **Trace headers** [V]: emits both `b3` and `traceparent`; reads traceparent v00 first. `tracestate` not mentioned.
- Multipart limits are references; `maxFileSize` and `maxParts` default to unlimited [S]. Decompression cap defaults to 10 MiB [V/S]. Compression has BREACH caveat [V].
- On Workers, build `toWebHandler` at module scope [V].

## 7. Platform packages

- **Node**: `NodeRuntime.runMain` handles SIGINT/SIGTERM by interrupting the main fiber [V]; exit code on signal not stated. `NodeHttpServer`, `NodeWorker`, `NodeSocket`, `NodeFileSystem`, `NodeStdio` Node-only.
- **FileSystem**: no documented atomic write; temp file + rename is the usual pattern [inf]. `watch` ordering/coalescing undocumented. `Path.resolveWithin` is lexical and "not a sandbox on its own" [V].
- **ChildProcess**: options are cwd/env/shell/detached/stdio; **no uid/gid, chroot or seccomp** [V]. Kill/exit semantics undocumented. `setEnv` accepts Redacted. Not a sandbox for untrusted plugins.
- **Cloudflare package** is the Cluster-on-Durable-Objects adapter (`CloudflareCluster.layer`, four DO classes, DO-backed workflow engine/persisted queue) [V]. Per-row 2 MB cap; storage transaction blocks input gate [V]. **No KV, R2, Cloudflare Queues or Worker Loader** here.
- **Browser**: IndexedDb, BrowserWorker, Geolocation; `BrowserWorker` does not terminate dedicated workers on scope close [V].
- **OpenTelemetry**: `NodeSdk.layer`, `OtelTracer` (Effect parents take precedence), `OtelMetrics` (cumulative default) [V].
- **Not read**: Bun/Deno modules, D1Client, NodeChildProcessSpawner, WebSdk.

## 8. Encoding and packaging

- **Tar** [V/S]: streaming; no compression; paths/link targets returned as written (absolute, `..`, symlinks) so **validate before writing to disk**; no content checksum; PAX/GNU long names >1 MiB fail; GNU sparse unsupported. Fixed-field USTAR output with defaults mode 0o644, uid/gid 0, mtime epoch is deterministic as long as you control stream order and avoid custom `pax` [V/S].
- **Zip** (experimental): CRC checked; deflate via runtime `CompressionStream` so **deflated bytes can differ by runtime**; Store-only is byte-identical [S]. Decode skips the central directory; decompression bombs possible (~1000x) [V]. Streamed stored entries use data descriptors some readers reject [V].
- **[inf] reproducible plugin digest**: Tar with fixed headers, or Zip Store-only; hash the final bytes yourself.
- **SchemaBinary**: default mode supports compatible evolution; `fieldId(n)` pins a wire id across rename; fingerprint mode rejects any layout change; int32/uint32/Number swaps are incompatible and may decode silently different values [V/S]. No versioning policy stated.
- **Ndjson**: `maxLineBytes` unbounded by default [V]. **Csv**: `maxRecordSize` 1 MiB default [S]. **Xml**: DOCTYPE entities never expanded, depth 1024, token 10 MiB [S]. **Yaml**: `<<` merge always on, no limits [S]. **Json5**: `__proto__` kept as own property [V]; guard deep merges. **Jsonc/Json5/Toml**: return `Result`.
- **Sse**: `retry:` surfaces as a failure to handle [V].
- **openapi-generator**: emits TS source for `httpclient`, `httpclient-type-only`, `httpapi`; RFC 6902 patches before generation; warning codes list; cookies mostly dropped [V/S].
- **graphql**: `GraphQL`, `GraphQLGroup`, `GraphQLResolver` (batch via `ordered`/`findById`/`aliased`) [V/S]. Probably not needed for Bridger [inf].

## 9. Open questions for spikes

1. Can a plugin-contributed route set be swapped at runtime without a full layer rebuild? (HttpRouter has no removal API.)
2. Does `ScopedRef.set` protect in-flight readers of the old value? Test before using it for generation swaps.
3. Does workerd allow `new Function` for `SchemaJITCompiler`, or must builds use AOT?
4. Do custom checks (e.g. Bridger field rules) round-trip through `SchemaRepresentation.toJson` with revivers?
5. `Graph.topo` / cycle detection API shape (unread).
6. Default division precision and rounding of `BigDecimal` for money.
7. Version gap: Csv 4.1.0, Json5/Jsonc 4.1.2, NdjsonErrorReason 4.0.6 are newer than the prototype's pinned `effect@4.0.0`.

## 10. Still not read

`Graph.topo/toMermaid`, `TestClock`, `SecureRandom`, `HttpApiError`, `HttpApiSchema`, `Base64Url`, `Ini`, `JsonPatch`, `SchemaAOTCompiler/Build`, Bun/Deno/D1 modules, docgen/doctest/graphql-generator module pages.
