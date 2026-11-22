# Spike area 04: HTTP/API, MCP, CLI, reactive UI

## 1. Purpose and scope

This area asks whether Effect 4.1.4 can carry the Bridger HTTP surface, the MCP surface, the CLI and the React snapshot feed, and what Bridger must build itself.

Needs covered:

- A typed HTTP API with bearer security that gives handlers a principal (ERP-RUNTIME.md, as named in the task brief).
- Plugins contributing and removing endpoints after the server started (the biggest gap in the brief).
- OpenAPI output, error status mapping, graceful shutdown, outbound HttpClient resilience, trace propagation, multipart limits, SSE.
- An MCP server and client, and what an MCP auth story needs.
- A CLI with subcommands, shared flags, validation errors, help and completions (ERP-DX.md).
- Reactive UI snapshots from a host snapshot feed (REACT-API.md section "Core observation seam": `Host.changes`, immutable revisioned snapshots, "slow subscribers may receive the latest snapshot").

Spec refs: I read only `docs/REACT-API.md` (by grep and excerpts). I did not read ERP-RUNTIME.md, ERP-DX.md or `references/mcp|agent|core` line by line, so the mapping of spikes to individual requirement IDs is not done here. Where a spec statement is cited below it comes from REACT-API.md.

Cloudflare and other runtimes are out of scope.

## 2. Environment and method

- effect 4.1.4, @effect/platform-node 4.1.4, vitest 5.1.0, Node 22, macOS. Spike code was written against the installed `node_modules/effect/dist` d.ts and `ai-docs/src` examples.
- Import paths in 4.1.4 (verified in `node_modules/effect/package.json` exports). There is no `effect/unstable/*` layout:
  - `effect/http` (HttpClient, HttpRouter, HttpServer, HttpTraceContext, Multipart, ProblemDetails)
  - `effect/http-api` (HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiMiddleware, HttpApiSecurity, OpenApi)
  - `effect/ai` (McpServer, McpClient, McpTest, McpProtocol, McpSchema, Tool, Toolkit)
  - `effect/cli` (Command, Flag, Argument, Completions)
  - `effect/reactivity` (Atom, AtomRegistry, AsyncResult)
  - `effect/encoding` (Sse), `effect/persistence` (RateLimiter, CircuitBreaker)
- Servers run on `NodeHttpServer.layer(createServer, { port: 0 })` (ephemeral port) with real `fetch` or `HttpClient` over loopback. MCP and Atom tests also use in-memory clients.
- Run: from `spikes/`, `npx vitest run 04-http-mcp-cli`. Add `--silent=false` to see the console.log numbers quoted below. Last full run: 34 tests passed, in about 11 s. One earlier full run had one failure that I did not identify (the next two runs were green); I suspect a timing-sensitive test (shutdown or restart), which is inference.
- Convention: tests assert what happened (characterization). Negative findings are asserted as negatives.

File map (all in `spikes/04-http-mcp-cli/`):

| File | Content |
|---|---|
| `helpers.ts` | `startServer(routesLayer, serveOptions, port, nodeServerOptions)` using `HttpRouter.serve`; `startRaw(httpEffect, port, nodeServerOptions)` using `HttpServer.serve`. Both return `{url, port, scope, close}`; `close` is a scope close, i.e. graceful shutdown. |
| `registry.ts` | The runtime-route registry design (section 3, SPK-04-02b). |
| `httpapi.spike.test.ts` | SPK-04-01, 03a, 03b |
| `runtime-routes.spike.test.ts` | SPK-04-02a, 02b, 02b2, 02c |
| `shutdown.spike.test.ts` | SPK-04-04a to 04e |
| `httpclient.spike.test.ts` | SPK-04-05a to 05e |
| `trace-multipart-sse.spike.test.ts` | SPK-04-06a, 06b, 07a, 07b, 07c |
| `mcp.spike.test.ts` | SPK-04-08a, 08b, 08c |
| `cli.spike.test.ts` | SPK-04-09a to 09d |
| `atom.spike.test.ts` | SPK-04-10a to 10e |
| `RESULT.md` | The verdict table required by the spikes README |

## 3. Findings

Labels: "Observed" is something a test showed. "Source/docs" is taken from d.ts, JSDoc or JS in `node_modules`. "Inference" is my reasoning.

### SPK-04-01 HttpApi bearer middleware and Principal

- Need: authenticated endpoints where handlers read a principal; an unauthenticated call fails with a declared error.
- Test: `httpapi.spike.test.ts`, "SPK-04-01". Defined `Principal` (a `Context.Service`), `Unauthorized` (`Schema.TaggedError` with `httpApiStatus: 401`), and `Auth` as `HttpApiMiddleware.Service` with `security: { bearer: HttpApiSecurity.bearer }`, `provides: Principal`, `error: Unauthorized`. The implementation layer checks `Redacted.value(credential)` and calls `Effect.provideService(effect, Principal, ...)`. Group has `.middleware(Auth)`. Served over real HTTP.
- Observed: `Authorization: Bearer tok-1` gives 200 and the handler returns the principal's id and tenant. `Bearer nope` gives 401 with body `{"_tag":"Unauthorized","message":"bad token"}`. With no Authorization header the middleware still ran and my check produced the same 401 "bad token" body, which means the credential arrives as an empty Redacted string rather than the middleware being skipped.
- Verdict: READY.
- Caveats: the middleware must treat an empty credential as invalid. A handler reads the principal with `Effect.service(Principal)`; `Principal.asEffect()` is not a function in 4.1.4 (my first attempt returned 500, the cause was inferred from the fix).

### SPK-04-02 Runtime routes (a) rebuild, (b) registry, (c) native router

Need: plugin load adds endpoints after the server started; unload removes them; no downtime for other routes.

#### SPK-04-02a Rebuild by restarting the listener

- Test: "SPK-04-02a". Server 1 serves a plugin API v1 (slow endpoint 300 ms). A poller issues a request every 5 ms with `connection: close`. A slow request is started, then server 1 is closed (graceful), and server 2 (v2) is started on the same port.
- Observed: the in-flight slow request completed with 200. The swap took about 252 ms. Poll tally: 37 ok, 40 failed, of which 39 ECONNREFUSED and 1 ECONNRESET. The new server then answered with v2.
- Verdict: GAP (unusable for hot load/unload). In-flight work is safe; new work is refused for the swap window.

#### SPK-04-02b Catch-all route into a mutable registry

- Tests: "SPK-04-02b" and "SPK-04-02b2".
- Design (`registry.ts`, about 50 lines):
  - Data: `Ref<Map<string, Entry>>`. `Entry = { api: HttpApi, app: HttpEffect, scope: Scope.Closeable, inflight: number }`. `inflight` is a plain mutable counter.
  - The one static route is `HttpRouter.add("*", "/*", dispatch)`.
  - Mount: create a fresh `Scope`; build `HttpApiBuilder.layer(pluginApi)` provided with the plugin's handler layer and `HttpServer.layerServices`; convert with `HttpRouter.toHttpEffect(appLayer)` inside that scope, which yields an HttpEffect (request in, response out) holding the plugin's router. Store the entry under the plugin id. If an old entry existed, swap first, then drain the old one.
  - Convention: the plugin's group carries `.prefix("/plugins/<id>")`, so full paths are not rewritten. The dispatcher reads the second path segment as the plugin id.
  - Dispatch: read `HttpServerRequest`; if the path is `/openapi.json` return the merged document; otherwise look up the plugin; missing gives an empty 404; found increments `inflight`, runs the plugin's HttpEffect, and decrements in `Effect.ensuring`.
  - Unmount: remove the map entry first (new requests get 404 immediately), then drain, then close the entry's Scope (which releases the plugin's layer resources).
  - Drain: a loop `while inflight > 0 sleep 5 ms`, then `Scope.close`.
  - OpenAPI merge: per request, `OpenApi.fromApi(entry.api)` for each entry, `paths` object-assigned together under a fixed `openapi: "3.1.0"` header. Components are not merged.
- Observed (02b): before mount `/plugins/a/hello` was 404; after mount 200 with `"hello from a v1"`; merged doc listed `/plugins/a/hello` and `/plugins/a/slow`. With a 300 ms slow request started and unmount called 80 ms later, unmount returned after 225 ms, the request completed 200, then `/plugins/a/hello` was 404 and the merged doc had no paths. Replacing v1 by v2 under the same id served v2 with the listener untouched. `/openapi.json` over HTTP contained the plugin path.
- Observed (02b2): continuous polling (5 ms) through mount, 5 replaces at 30 ms spacing, then unmount: 33 requests, 0 failures, 28 x 200, 5 x 404 (the 404s only after unmount).
- Verdict: READY as a Bridger-built design; Effect provides the parts but no such primitive.
- Known limits:
  1. The drain loop has no timeout; a stuck handler blocks unmount (and replace) forever. Needs a Deferred or Latch plus a timeout, then a forced scope close (inference on the fix).
  2. `inflight` is incremented after the lookup in separate steps from the map read; a request between map read and increment could race with unmount (inference; not tested, the window is small because it is synchronous JS between yields, but treat as unproven).
  3. Auth: the registry does not apply security; each plugin API would need its own middleware, or a host middleware before dispatch.
  4. The merged OpenAPI document ignores `components` (schemas, securitySchemes), so refs would dangle for plugin schemas that use them. Not tested; observed only that `paths` merge.
  5. The host's own static API cannot appear in the same merged document without also including its `fromApi` output.
  6. Plugin path prefix is a convention nobody enforces; a plugin API with other paths simply would not be reachable (inference: the dispatcher only forwards `/plugins/<id>/*`).
  7. Route matching inside each plugin uses its own FindMyWay router, so path conflicts across plugins are impossible by construction.
  8. The per-plugin scope close happens after drain; `Effect.interruptible` interplay with server shutdown was not tested for registry entries.

#### SPK-04-02c Native HttpRouter add and remove

- Test: "SPK-04-02c". Captured the `HttpRouter` service with `HttpRouter.use` and called `router.add("GET", "/late", ...)` after the server started.
- Observed: `/late` was 404 before and 200 after; the router object exposes no key matching remove, delete or off.
- Source: `HttpRouter.make` registers into a FindMyWay instance with `on`/`all` only (read in `HttpRouter.js`).
- Verdict: GAP for removal. Late addition works.

### SPK-04-03 Error mapping and OpenAPI

#### SPK-04-03a Status mapping

- Test: "SPK-04-03a".
- Observed:
  - `HttpApiError.NotFound` returned 404, content-type `application/json`, body `{"_tag":"NotFound"}`.
  - A class made with `HttpApiError.Problem<Teapot>()("Teapot", { type, status: 418, title }, { reason })` returned 418, `application/problem+json`, body `{"reason":"short and stout","type":"https://bridger.dev/probs/teapot","status":418,"title":"I am a teapot"}`.
  - A JSON payload that fails schema decoding (qty as string) returned 400 with no content-type and an empty body.
  - An unknown route returned 404 with an empty body.
- Verdict: READY for typed errors; PARTIAL overall because the four responses use three shapes.
- Caveat: the `HttpApiError` module also exports `BadRequestProblem`, `InternalServerErrorProblem`, `HttpApiSchemaError` and `HttpApiPayloadTooLarge` (source), which look like the building blocks for a uniform mapper; I did not try to wire them.

#### SPK-04-03b Generated OpenAPI

- Test: "SPK-04-03b".
- Observed: `OpenApi.fromApi(Api).openapi === "3.1.0"`; `info` carried title, version, description from `OpenApi.annotations`; `components.securitySchemes.bearer` was `{"type":"http","scheme":"Bearer"}` (capital B; the test compares case-insensitively); the whoami operation had `security: [{bearer: []}]` and responses 200 and 401 (401 refs `#/components/schemas/UnauthorizedEncoded`); the tea operation listed 200, 401, 418. `/openapi.json` served by `HttpApiBuilder.layer(Api, { openapiPath })` had the same path set as the generated document.
- Source: no option to emit 3.0.
- Verdict: PARTIAL. The document is a pure function of the static `HttpApi` value, so it cannot reflect plugins mounted later; that is what 02b's merged document addresses.

### SPK-04-04 Graceful shutdown

Need: stop the host while requests are in flight; know the drain window.

- Tests: `shutdown.spike.test.ts`. Each scenario starts a server, issues a slow request, waits for the handler to start, closes the server scope, and records close duration, client result and whether the handler completed or was interrupted.
- SPK-04-04a (raw `HttpServer.serve`, uninterruptible default). Observed: client got 200 "done", handler completed, close took 3406 ms for a 400 ms handler. The extra ~3 s was not present when `gracefulShutdownTimeout` was 100 ms (close 103 ms), so I attribute it to the client's idle keep-alive connection holding `server.close` (inference; I did not isolate it).
- SPK-04-04b (`Effect.interruptible` handler, default options). Observed: handler completed (not interrupted), close 3400 ms. Interruptible handlers are not interrupted when shutdown starts.
- SPK-04-04c (`gracefulShutdownTimeout: 100`). Interruptible 2000 ms handler: interrupted after about 100 ms, client received 503 with empty body, handler never completed. Uninterruptible 700 ms handler: completed, 200, close 699 ms.
- SPK-04-04d (HttpRouter route, same 100 ms window). Default route (interruptible): interrupted at 102 ms, client 503. Route with `{ uninterruptible: true }`: completed, 200, close 698 ms.
- SPK-04-04e (`disablePreemptiveShutdown: true`, router route, 3000 ms handler). Interrupted, close 1 ms, client 503.
- Source/docs: `NodeHttpServer.Options` documents `gracefulShutdownTimeout` (default 20 s) as the time before request fibers are interrupted, states that uninterruptible handlers still run to completion afterwards, and that `HttpServer.serve` handlers are uninterruptible by default while HttpRouter routes are interruptible unless `uninterruptible: true`. The observed behaviour matches.
- Verdict: READY for waiting; PARTIAL for bounding. There is no hard cap for an uninterruptible handler. An earlier attempt to test a stuck handler with an outer `Effect.timeoutOption` around close hung the test, because the close finalizer is not interruptible; I removed that test, so "stuck handler blocks close indefinitely" is inference from that hang and from the docs, not a passing assertion.
- Caveats: client sees an empty 503 on interruption.

### SPK-04-05 Outbound HttpClient

Test file: `httpclient.spike.test.ts`. A scripted local server returns a chosen response per hit number and records hit times. Layers: `FetchHttpClient`, `RateLimiter.layer` over `layerStoreMemory`, `CircuitBreaker.layer({ tripPolicy: consecutive(3), openDuration: "10 seconds" })` over `layerStoreMemory()`.

- SPK-04-05a, Retry-After with `retryTransient({ times: 3, schedule: exponential("1 millis") })`. Server: 503 with `Retry-After: 1` first, then 200. Observed: 200 after 1017 ms, 2 hits. Retry-After overrides the tiny schedule (source says it sets a minimum delay). READY.
- SPK-04-05b, `withRateLimiter` on an always-429 server. Without `times`: no result within a 600 ms timeout and 1004 requests received in that time, so it hot-loops with no backoff when no Retry-After is present. With `times: 2`: exactly 3 hits, and the call returned the 429 response (not a failure; no `filterStatusOk`). Source/docs state "automatic HTTP 429 retries are unlimited unless `times` is specified". GAP (footgun): the safe behaviour needs an explicit option.
- SPK-04-05c, 429 with `Retry-After: 1` then 200 under `withRateLimiter(times: 2)`: 200 after 1003 ms, 2 hits. READY.
- SPK-04-05d, ordering. Breaker outermost (docs order: limiter, retry, breaker last): six calls against an always-500 server (with `filterStatusOk`, `retryTransient(times: 2)`) gave HttpClientError x3 then CircuitBreakerError x3; server saw 9 hits (3 calls x 3 attempts), and 0 after the circuit opened. Breaker inside retry: first call HttpClientError, calls 2 and 3 CircuitBreakerError, server saw 3 hits (the breaker tripped on attempts within one logical call, so the retry loop was cut short; `retryTransient` does not retry a `CircuitBreakerError` per source docs). READY, but ordering is convention only.
- SPK-04-05e, per-attempt timeout: `HttpClient.timeout("150 millis")` placed before `retryTransient({ times: 3, schedule: spaced("10 millis") })`; server hangs the first two hits for 2 s. Observed: 200 on the third hit after 326 ms. READY. (The server was started with a 50 ms graceful timeout so the hung requests would not stall close.)

### SPK-04-06 Trace propagation

- SPK-04-06a: client inside `Effect.withSpan("outer")` calls a server route. Observed request headers: `traceparent=00-<traceId>-<spanId>-01` and `b3=<traceId>-<spanId>-1-<parentSpanId>`. The server-side parent span's traceId equalled the client's. This only worked after installing a non-native tracer on the server's context (`Tracer.make({ span: o => new Tracer.NativeSpan(o) })`). With the default tracer the route handler saw no parent span at all (first attempt gave "NO-SPAN"). Source: `HttpEffect.js` skips tracing when the current tracer is the native tracer ("The native tracer has no backend"). The tracer must be present in the context in which the server is built (it is captured when the handler is created); installing it per request was not tried. A first attempt that supplied a `context` hook to `Tracer.make` hung the test; I did not diagnose it.
- SPK-04-06b: `HttpTraceContext.w3c`, `.b3`, `.xb3` parse the three header formats into spans with the expected trace and span ids. READY.
- Verdict: PARTIAL (depends on a real tracer layer, which belongs to area 05).

### SPK-04-07 Multipart and SSE

- SPK-04-07a (`Multipart.limitsServices` provided to the handler, `req.multipart`): default allows a 100-byte file (200, parts `a,f`); `maxFileSize: 1024` rejects a 4096-byte file with 413 and an empty body, accepts 512 bytes; `maxParts: 1` rejects a two-part form with 413. READY. The limits are context services, so forgetting to provide them silently uses defaults (inference from the Reference defaults in the d.ts; defaults for size were not measured).
- SPK-04-07b (`Sse.decode`): `retry: 2500` is emitted as a stream failure of tag `Retry` (fields `duration`, `lastEventId`). When all text arrives in one chunk, events before and after the directive in the same chunk are still emitted (a, b) and the failure follows. When the text arrives in separate chunks (the realistic case), `Stream.catchIf(Sse.Retry.is, () => Stream.empty)` yields only the events before the directive (`["a"]`), so later events are lost unless the caller reconnects. PARTIAL: Bridger must write the reconnect loop.
- SPK-04-07c: `Sse.encode` plus `HttpServerResponse.stream` with content-type `text/event-stream`, consumed with `res.stream` and `Sse.decode`: 2 events with ids and event names intact. Events must carry `_tag: "Event"`; plain objects without it produced an empty result in my first run. READY.

### SPK-04-08 MCP

File: `mcp.spike.test.ts`.

- SPK-04-08a: `Toolkit.make(Add)`, `McpServer.toolkit`, `McpServer.resource({uri, name, content})`, `McpTest.makeClient(..., { protocols: [McpProtocol.v2025_11_25] })`. `listTools` returned `["Add"]`, `callTool` returned content containing 5, `readResource` returned the "ok" content. READY.
- SPK-04-08b: server `McpServer.layerHttp({ path: "/mcp", protocols: [v2025_11_25], registrations })` under `HttpRouter.serve`; client `McpClient.layerHttp({ url, protocol, headers })` over `FetchHttpClient`. With `McpServer.middleware<{ provides: CurrentUser }>()` reading `headers["authorization"]`:
  - header `tok-bridger`: `listTools` gave Add and WhoAmI; `callTool` WhoAmI returned the text `tok-bridger`, so the service reached the tool.
  - no header: `callTool` failed with `McpClientError` reason `ProtocolError`, code -32001, description "Missing credentials".
  - no header, `listTools`: succeeded. The middleware wraps tool handlers; listing is not protected unless the middleware is applied through `McpServer.visibility` (source: list requests run middleware only when it wraps a visibility; not tested).
  - Source: `MiddlewareOptions` provides `method`, `target`, `payload`, `headers`, `sessionId`. `layerHttp` also takes `allowedOrigins`, `allowSessionTermination`, `allowSubscriptions`.
  - In memory (`McpTest`) headers are empty, so an auth middleware rejects every call there; the first version of 08a failed for that reason (observed) so tests of authenticated tools need another harness.
  - Verdict: PARTIAL. Hook exists; there is no token validation, OAuth or per-tenant visibility policy.
- SPK-04-08c: after the in-memory server started, `McpServer.registerToolkit` with a new toolkit made `Late` appear in `listTools`. The server object exposes `addTool`, `addResource`, `addPrompt` etc. but no key matching remove, delete or unregister. GAP for unload. A hide-by-policy alternative via visibility is inference only.

### SPK-04-09 CLI

File: `cli.spike.test.ts`; `Command.runWith(app, { version })(args)` with `NodeServices.layer`, console captured with spies.

- 09a: root `bridger` with `withSharedFlags({ profile, json })` and subcommands `install` (argument with `Schema.NonEmptyString`, `Flag.Literals`, optional `Flag.Int`) and `list` (alias `ls`). Parent flags were read in the child handler with `yield* bridger`. Output: `install acme.crm beta profile=prod json=true port=8080` and `list`. READY. (`Flag.Integer` does not exist; it is `Flag.Int`.)
- 09b: invalid literal, non-integer, missing argument, unknown flag, unknown subcommand all fail with a CliError whose `_tag` is `ShowHelp`. Output contains the help text and an `ERROR` section, for example `Invalid value for flag --channel: "nightly". Expected: "stable" | "beta"`. The error carries `errors: [{_tag: "InvalidValue"}]`, `commandPath`, and the symbols `~effect/Runtime/errorExitCode` and `errorReported`. I did not run it under `NodeRuntime` so the real process exit code is unverified.
- 09c: `--help` and `<sub> --help` print DESCRIPTION, USAGE, FLAGS, INHERITED FLAGS, GLOBAL FLAGS, SUBCOMMANDS; `--version` prints `bridger v9.9.9`. Global flags: `--help`, `--version`, `--wizard`, `--completions <bash|zsh|fish|powershell|sh|pwsh>`, `--log-level`. `Completions.generate("bridger", "bash"|"zsh", Completions.fromCommand(app))` output contains `install`; `--completions bash` printed a "Static completion script for Bash". Completions are static (the script says so), so dynamic plugin subcommands would not complete (inference from "static").
- 09d: a handler `Effect.fail("kaput")` stays in the error channel with the raw value. READY.

### SPK-04-10 Atom over a host snapshot

File: `atom.spike.test.ts`; `Snap = { revision, plugins }` in a `SubscriptionRef`, `AtomRegistry.make()`.

- 10a: `Atom.subscriptionRef(ref)`, ref updated to revision 1 before anyone subscribed, then `registry.subscribe(atom, f, { immediate: true })` immediately delivered revision 1 (no gap); a later set to revision 2 was delivered. READY.
- 10b: 100 sets inside one synchronous `Effect.runSync` run: subscriber received 101 values (initial plus all 100), monotonic. 100 sets with `yieldNow` between: 100 of 100. A stream-backed atom (`Atom.make(SubscriptionRef.changes(ref))`) under a sync burst: 101 values, last 100. So atoms do not coalesce to "latest"; every revision is delivered. REACT-API.md allows latest-wins but does not require it; PARTIAL only in that the "latest" wording is not what Atom does. React batching is what limits renders (inference; no React in the spikes).
- 10c: stream atom states were `S0` then `S5`: the first value was synchronous, so no `Initial` state appeared.
- 10d: subscribe, unsubscribe, subscribe again on a `keepAlive` atom: value 7 kept, constructor ran once.
- 10e: `Atom.map(base, s => s.plugins.a)` notified only on changes of that slice: saw `["active","stopping"]` when plugin b changed in between. READY.
- Not tested: AsyncResult failure/termination of the host stream (the 10c test title mentions it; the test only checks Initial/Success).

## 4. Surprises and gotchas

1. HttpRouter has no remove; `McpServer` has no remove. Both only grow (SPK 02c, 08c).
2. `withRateLimiter` without `times` retries 429 forever and fast (1004 hits in 600 ms) (05b).
3. With `times` set, an exhausted 429 returns a normal response, not a failure, unless `filterStatusOk` is applied (05b).
4. Server spans exist only with a non-native tracer (06a).
5. Schema-decode failures and unknown routes return empty bodies (03a); multipart limit failures return an empty 413 (07a).
6. Shutdown close time included a ~3 s tail with a keep-alive client; interruptible handlers are not interrupted until `gracefulShutdownTimeout` (default 20 s) (04).
7. A scope close finalizer is uninterruptible, so `Effect.timeout` around close cannot cut it short (observed as a hung test).
8. MCP auth middleware runs on tool calls, not on list calls, unless wrapped with visibility (08b). In-memory MCP tests have no headers (08a).
9. Missing Authorization header reaches a bearer middleware as an empty credential (01).
10. SSE `retry:` terminates the decoded stream with a failure (07b).
11. `Context.Service` values and `HttpServer.HttpServer` are not yieldable with `.asEffect()` in 4.1.4; use `Effect.service(tag)` or `Context.get`.
12. OpenAPI bearer scheme is `"Bearer"` with a capital letter (03b).
13. CLI validation failures all carry the tag `ShowHelp` (09b).
14. Native HttpRouter serves `HttpRouter.serve(layer)` with a forked MemoMap: "calling serve twice builds the same layer twice" (source JSDoc); I did not hit this.
15. `HttpServer.serve` typed overloads confuse inference when the app is `any`; the helper casts.

## 5. Missing pieces and design sketches

1. Dynamic route registry (`@bridger/http`). Start from `registry.ts`. Add: a Deferred or Latch per entry plus a timeout for drain; a host middleware before dispatch for auth and tenant resolution; a per-plugin prefix check at mount; a mount error if two plugins claim one id; metrics for in-flight counts. Emit events on mount and unmount for the host snapshot feed.
2. Live OpenAPI. Per-request merge as in `registry.ts`, extended to merge `components.schemas` and `securitySchemes` with namespacing by plugin id; optionally cache by registry revision.
3. Resilient client factory. One function building `retryTransient` plus `withRateLimiter(times)` plus `filterStatusOk` plus `timeout` plus `withCircuitBreaker` in the verified order, with a default `times`.
4. Error mapper. A global middleware turning schema-decode errors, payload-too-large, unknown routes and untyped failures into `ProblemDetails` (`application/problem+json`), reusing `HttpApiError.Problem` for typed errors.
5. MCP auth and visibility package. Bearer middleware using awthaq, visibility filter using qadi decisions keyed on the principal and the registry; remove-by-visibility for unloaded plugins.
6. SSE reconnect helper using `Retry.duration` and Last-Event-ID.
7. Tracer layer in the host so server spans and context propagation exist (area 05).
8. CLI exit-code mapping (invalid input to code 2) and dynamic completions if plugins add subcommands.

## 6. Fix and improve list by owner

bridger-spec
- must: state the plugin route prefix rule and the unload and drain semantics (02b).
- must: state the MCP auth contract (token source, list protection) (08b).
- should: state OpenAPI is 3.1.0 only and that the document is merged live (03b).
- should: state that an empty credential is invalid (01).
- should: decide whether snapshot delivery is every-revision or latest-wins, since Atom delivers every revision (10b).
- nice: state the drain budget and exit policy (04).

bridger-code
- must: runtime registry with timed drain (02b, 04).
- must: resilient client factory (05b, 05d).
- must: uniform ProblemDetails error mapping (03a, 07a).
- must: MCP unload via visibility or an equivalent (08c).
- must: real tracer layer in the host (06a).
- should: live merged OpenAPI with components (03b).
- should: SSE reconnect helper (07b).
- should: explicit `gracefulShutdownTimeout`, short keep-alive on drain, own outer timeout and process exit for stuck handlers (04).
- should: CLI exit-code mapping (09b).
- nice: sampler or debounce for the React feed if every revision proves too chatty (10b).

effect-upstream
- should: `HttpRouter` remove or unmount API (02c).
- should: `McpServer` remove or unregister API (08c).
- should: a default cap or backoff for 429 retries in `withRateLimiter` (05b).
- nice: ProblemDetails for decode failures out of the box (03a).
- nice: interruptible server close (04).

qadi
- should: provide the decision input shape for MCP visibility filtering per principal and tool (08b). Not exercised in this area.

awthaq
- must: bearer credential validation that yields the Principal used by both HttpApi and MCP middleware (01, 08b). Not exercised in this area; the spikes used a stub token check.

## 7. Not verified

| Item | What it would take |
|---|---|
| `McpServer.visibility` (list protection, hiding unloaded plugin tools) | A test wrapping a toolkit with `visibility` and a registry-driven predicate; check `tools/list` for two principals. |
| WebSocket handling at shutdown and upgraded connections | A WS client test against `NodeHttpServer` with open sockets during close; source docs say a close frame 1001 is sent. |
| Multipart persisted file paths (`toPersisted`, `PersistedFileSchema`) | Handler persisting to the real filesystem, check temp path cleanup and size limits with `maxTotalSize`. |
| Process exit codes under `NodeRuntime.runMain` for CLI errors | Spawn a built script as a child process and read the exit code (area 05 has ChildProcess). |
| Registry race between lookup and unmount | A stress test with many concurrent requests and repeated unmount and mount. |
| Stuck uninterruptible handler blocking close | A child-process test that kills the process after a deadline rather than an in-process timeout. |
| Per-request tracer installation and OTel exporter interop | Depends on area 05's OpenTelemetry layer. |
| Merged OpenAPI with components and two plugins | Two plugin APIs with shared schema names; validate the document with an OpenAPI validator. |
| Atom behaviour when the host stream fails or ends | Failing and completing streams through `Atom.make(stream)`. |
| React itself (`useSyncExternalStore`) | A jsdom and React test; spikes did not include React. |

## 8. Reproduction notes

- From `Bridger/spikes`: `npx vitest run 04-http-mcp-cli` (about 11 s). One file: `npx vitest run 04-http-mcp-cli/shutdown`. One test: add `-t "SPK-04-02a"`. See measured numbers with `--silent=false`.
- Typecheck: `npx tsc --noEmit` reported no errors in `04-http-mcp-cli` at the end of the work; helpers use `any` for the route layer parameter because `Layer<any, any, any>` was not assignable.
- Timing-based assertions (drain ms, close ms, retry counts in a fixed window) can vary with machine load. The 02a failure count (39 ECONNREFUSED) and the 1004 hits in 600 ms are single runs; the tests assert only inequalities (more than 0 failures, more than 3 hits).
- Ports are ephemeral except 02a, which rebinds the port freed by the first server.
- Do not edit `package.json`, `tsconfig` or `node_modules`; nothing in this area needed new dependencies.
