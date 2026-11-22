# Risks and what was not verified

Cross-cutting hazards found by the spikes, then the list of things the spikes did not establish. Spike IDs refer to the area files.

## Hazards

| Hazard | Why it matters | Source |
|---|---|---|
| Two effect copies | qadi and awthaq load their own effect from their own `node_modules` (4.1.2). With two copies awthaq returns an empty, silent 500 on the first request, and sibling `.d.ts` files bind a different effect so `tsc` mismatches. The spikes avoid it with a vitest `dedupe` setting plus an alias and an `effect-copies.ts` rewrite. `@qadi/audit` loads `@qadi/core` from `lib/`, which imports qadi's own effect | 08-01, 09-01, 09-02 |
| Unstable APIs | Nearly every Effect module used here is marked unstable and can change inside 4.x. Cluster, Workflow, EventLog, HttpApi, Tar, Zip, SchemaBinary and the AI modules are all affected | all |
| Version skew | The prototype pins 4.0.0. The docs and spikes are 4.1.4. Csv, Json5 and Jsonc need 4.1.x. The `../effect` checkout is 4.0.1 and lacks Tar, Zip, Csv, Json5, Xml and crypto. qadi's dev copy is 4.1.2 and awthaq is installed on 4.1.2 | 07, 05, 08, 09 |
| Secret leak by default | A `Redacted` field is hidden from logs but `toCodecJson` encodes the plaintext unless `disallowJsonEncode:true` | 03-06 |
| Silent defaults without limits | Ndjson `maxLineBytes` unbounded; `withRateLimiter` retries 429 forever (1004 hits in 600 ms); `ChildProcess.kill` hangs on a SIGTERM-ignoring child; YAML merge key always on and no limits; Json5 keeps `__proto__` as an own property | 04-05b, 05-02c, 05-07 |
| Hostile archives | Tar and Zip decoders return paths and links as written (absolute, `..`, symlink then file), trust a forged header size until the body is read, and a Zip can expand about 1000 times | 05-04, 05-05 |
| Path confinement | `Path.resolveWithin` is lexical and a symlink bypass is proven | 05-03d |
| No isolation | `ChildProcess` writes outside cwd, reads `/etc` and reaches the network. `new Function` sees `process` and `fetch` | 05-02e, 05-09b |
| Infinite retry on defects | A defect in a transactional persisted handler rolls back and retries forever, and the caller gets no reply | 01-03 |
| Singleton is not run-once | It re-runs when ownership moves; a failure becomes a defect and is not retried | 01-04 |
| Cron collapses missed runs | Default cron turns a missed window into one late run. "All" is capped at one day by default. There is no true "latest" | 01-05 |
| Failover timing | Measured takeover was 2.9 s with 2 s lock expiry and 0.3 s health interval. The defaults imply roughly 35 to 95 s, not measured | 01-07 |
| Fail-open health | `RunnerHealth.layerK8s` treats a failed API check as healthy, so dead runners stay in place during a control-plane outage | Cluster notes |
| Stale receipt owner | After takeover the stale owner can still complete a receipt | 02-02 |
| Two replicas run one handler | `PersistedCache` has no claim or takeover | 02-02b |
| Migration races | On SQLite two real processes: one applied, the other returned nothing. Postgres serializes through a ledger table lock | 02-04 |
| EventLog is not a bus | One remote-assigned sequence, wall-clock ordering with last-writer-wins, upload receipts as acks, no inbox watermark, journal outside Bridger's SQL transaction, per-identity encryption key | 06-16..20 |
| HashRing skew | With plain sequential names one node owned up to 82 percent of tenants and 33 percent moved on an add. With digest-derived ids a ninth node moved about 10 to 12 percent | 06-21..22 |
| Bounded PubSub stalls | One slow subscriber stalls the publisher and the fast subscribers | 07-10 |
| Reader safety on swap | `ScopedRef.set` releases the old scope without waiting for a reader still holding the old value. `RcRef`, `RcMap` and `LayerMap` borrowers are never interrupted | 07-01..03 |
| Failed layer is cached | A `ManagedRuntime` caches a failed build; a run after `dispose` dies with an untyped defect | 07-16 |
| Stale OpenAPI | The generated document is static and goes stale when a plugin mounts | 04-03b |
| Unauthenticated MCP | `McpServer.middleware` reads headers but nothing validates tokens. Tool listing may be exposed | 04-08 |
| Session revocation lag | awthaq JWTs of revoked sessions stay valid for the 900 s ttl; the lite verifier hard-fails after `cacheTtl`; a token signed with a new key cannot be verified offline until the key set is refetched | 09-10..12 |
| Rewritable audit | awthaq's audit table is rewritable by design. qadi audit entries embed the full resource including PII. Deleting the newest chain row verifies clean | 08-05, 09-19..20 |
| Per-process rate limits | awthaq's default rate limiter is per process | 09-17 |
| Mixed exclusive slot | A Bridger `SubjectResolver` override and awthaq's `Roles` plugin fail at build | 09-15 |

## Not verified

| Not verified | To verify |
|---|---|
| Real Postgres: row locking, `SKIP LOCKED`, concurrent commit ordering, row-level security on a non-superuser role | Run areas 01 and 02 against a real server (Docker is installed on this machine; not used) |
| SQL Server, MySQL, D1 at runtime | Install the dialect packages and a server; D1 needs Miniflare or Workers |
| Real `SocketRunner` or `HttpRunner` transports; `RunnerHealth` ping and K8s; default-timing failover | Two-process cluster over a real transport with default settings |
| Cloudflare | Out of scope. Not a Bridger requirement |
| OpenTelemetry SDK bridge | Install the `@opentelemetry/*` peers and rerun 05-08a |
| Linux and Windows behaviour of kill, watch and process groups | Run area 05 on Linux CI; Windows leaves descendants after scope close |
| awthaq's own suite on 4.1.4; `@qadi/http` permission registration; other qadi packages (react, prisma, devtools); PostgreSQL pushdown | Run each suite with `effect` aliased to 4.1.4 |
| EventLog server and remote protocol | Spike the server SQL storage and Ed25519 session auth |
| `McpServer.visibility`, WebSocket, multipart persisted-file paths, `NodeRuntime` exit codes under HTTP | Extend area 04 |
| Durable-bus mismatch list line by line against the spec text | Re-read `references/durable-bus` against the table in 06 |
| Real I/O latency of qadi resolvers | Benchmark with a database-backed resolver |
| Deflate output across zlib versions | Build the same bundle on two runtimes and compare bytes |
| `useAll` and multi-key leases against a new lease module | Port the host-core tests to the new module |

## Evidence quality

- Everything marked READY, PARTIAL or GAP in the area files was produced by a passing characterization test unless the file says it came from docs or source.
- 70 test files, 394 tests, all passing at the time of writing.
- Verdict counts per area differ in how finely rows were split. Read them as a rough shape.
- The 05 agent's claim that no `platform-cloudflare` package exists was wrong: the package is on npm (4.1.4) and simply was not installed.
