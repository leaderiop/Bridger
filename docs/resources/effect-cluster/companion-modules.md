# Effect modules that complement Cluster for Bridger

Which other `effect` v4.1.4 modules cover the partial fits and gaps found when mapping Cluster onto Bridger. Back to [README](README.md). Read 2026-11-14 from `https://effect.website/docs/v4/api/effect/<group>/<Module>`; all modules are **unstable**.

Tags: **[V]** verbatim page text, **[S]** model summary of a truncated page tail (verify in source), **[inf]** my inference, not stated by any page. Many long pages were truncated at ~40k characters.

Package inventory: `effect` has 416 modules. Separate packages exist for SQL dialects (`sql-pg`, `sql-pglite`, `sql-sqlite-node`, `sql-sqlite-bun`, `sql-sqlite-do`, `sql-sqlite-wasm`, `sql-sqlite-react-native`, `sql-mysql2`, `sql-mssql`, `sql-libsql`, `sql-d1`, `sql-clickhouse`), platforms (`platform-node`, `-bun`, `-deno`, `-browser`, `-cloudflare`), `opentelemetry`, `vitest`, `atom-react/solid/vue`, and AI providers.

## Gap → component summary

| Bridger gap (from the Cluster mapping) | Covering component | Coverage |
|---|---|---|
| Receipt completion + business write in one transaction | `sql/SqlClient.withTransaction` (+ sharing one `SqlClient` with Cluster storage) | **Likely, unverified** |
| Four SQL dialects (PG, SQLite, MySQL/MariaDB, SQL Server) | `sql-pg`, `sql-sqlite-node`, `sql-mysql2`, `sql-mssql` | Clients exist; Cluster storage support per dialect unstated |
| `NOTIFY` accelerator for desired state | `PgClient.listen / notify` | Covered (Postgres only) |
| Storage `namedLock` (scheduler, migrations) | Cluster `Singleton`; `effect/sql` has no advisory-lock API | Covered by Cluster |
| Job queue with retries, dead state, DB clock | `persistence/PersistedQueue` (SQL store) | Strong, simpler than entities |
| Completed-receipt replay | `PersistedCache` + `Persistable` / `PrimaryKey` | Partial |
| Offline-first sync POS ↔ hub ↔ cloud | `eventlog/*` | Candidate, overlaps durable-bus |
| Per-principal / connector quotas | `persistence/RateLimiter` | Needs Redis to be distributed |
| Hook circuit breakers | `persistence/CircuitBreaker` | Memory store fits in-process use |
| Tenant → stream/shard mapping (open in ERP-STORAGE §12) | `HashRing` | Covered |
| Remote transports (worker, WebSocket, MessagePort) | `rpc/*`, `socket/*`, `workers/*` | Covered, no timeout/version negotiation |
| Per-call capability tokens | `rpc/RpcMiddleware` (client + server) | Covered |
| Keyring: AEAD, key wrapping | `crypto/Aead`, `KeyWrap`, `Kdf` | Covered, nonce handling is yours |
| Audit chain hashing, HMAC fingerprints | `crypto/Digest`, `Mac` | Covered; **no canonical JSON** |
| Loader signatures, N-of-M | `crypto/Signature`, `jose/*` | Single signer only; N-of-M is yours |
| Contract version ranges "within one major" | `SemVer`, `SemVerRange` | Covered |
| Consent diff | `TextDiff.unified`, `JsonPatch` | Covered |
| Telemetry | `observability/*`, `Metric`, `Tracer`, `ClusterMetrics` | Covered |
| Entity/cluster tests | `cluster/TestRunner`, `testing/TestClock` | Covered |
| MCP server/client, tool schemas | `ai/McpServer`, `McpClient`, `Tool`, `Toolkit` | Strong candidate |
| `bridger` CLI | `cli/Command`, `Flag`, `Argument` | Covered |
| Host snapshots to UI | `reactivity/Atom`, `AtomRegistry`, `atom-react` | Candidate |

## 1. SQL: transactions, dialects, migrations

**`sql/SqlClient`** [V]
- `withTransaction(effect)`: top level issues `BEGIN`, nested calls use **savepoints**. Rollback on failure **or interruption**.
- The active connection travels in a per-client context service (`TransactionConnection(clientId)`, a `[connection, level]` tuple). `activeTransactionConnection` fails with `SqlError` if the transaction ended, so call it right before use.
- `afterCommit` exists; its semantics are not described.
- `SqlClient.BeginTransaction` reference sets isolation for one transaction (e.g. `BEGIN ISOLATION LEVEL SERIALIZABLE` on PG). It is raw SQL: never build it from untrusted input. Ignored by libsql, mssql and sqlite-do; MySQL runs `SET TRANSACTION` first.
- `SqlResolver` requests inside a transaction do not batch with requests outside it.
- `SqlError` reasons: retryable `ConnectionError`, `DeadlockError`, `LockTimeoutError`, `SerializationError`; non-retryable auth/constraint/syntax errors. `isRetryable` is exposed.
- [inf] **Transaction-boundary answer:** Cluster's SQL storages require `SqlClient`. If Bridger's store and Cluster storage are built from the *same* `SqlClient`, a handler under `withTransaction` shares one connection. The pages do not say whether Cluster's `WithTransaction` joins an outer transaction. Spike this first.

**`sql/Migrator`** [V]: `fromRecord`, `fromGlob` (`<id>_<name>.{js,ts,mjs,mts}`); runs pending migrations in a transaction; `MigrationError` kinds `Locked | BadState | ImportError | Failed | Duplicates`. **No advisory lock is documented**; concurrent runs just report `Locked`. Cluster's own `layerMigrations` handle Cluster tables separately.

**Advisory/named locks:** none in `effect/sql` [V]. Cluster's `SqlRunnerStorage` uses them internally. Use `Cluster.Singleton` where the ERP docs say "named lock".

**Dialect packages**
| Package | Notes |
|---|---|
| `sql-pg` [V] | `PgClient` pool; `listen(channel)` → `Dequeue<Notification>`, `notify(channel, payload)`; pool options; no explicit limitations. |
| `sql-sqlite-node` [V] | `node:sqlite`; **single serialized connection**; WAL on, 5 s busy timeout; writable transactions use `BEGIN IMMEDIATE` (even read-only ones serialize behind writers); busy waits block the event loop; no streaming queries. |
| `sql-mysql2` [V] | pooled; supports streaming; `?` placeholders. |
| `sql-mssql` [V] | tedious; transactions via savepoints; no streaming; `isolation` ignored. |
| `sql-d1` [V] | Workers binding; **transactions not supported**. Not usable for Cluster/EventLog storage that needs them [inf]. |
| `sql-sqlite-do`, `sql-libsql`, `sql-pglite` | only module lists read. |

Not checked: whether `SqlMessageStorage` / `SqlRunnerStorage` work on SQLite or SQL Server. Cluster's pages mention PostgreSQL, MySQL/MariaDB and PGlite only.

## 2. Persistence: queue, cache, rate limit, breaker

**`persistence/PersistedQueue`** (18 exports; first 5 [V], rest [S])
- At-least-once; "handlers must be idempotent". `make({ name, schema, maxAttempts = 10, retrySchedule })`; default retry is exponential from 1 s capped at 5 min.
- Stores: memory, Redis, **SQL** (`layerStoreSql`; `makeStoreSql({ lockExpiration, lockRefreshInterval, pollInterval, tableName })`).
- SQL: delays use the **database clock**, rounded up to whole seconds. An `"untilExecuted"` offer inside a transaction checks that transaction's snapshot; under MySQL repeatable read a finished element can look in flight, so the offer is ignored.
- [S] Completed elements kept `timeToLive` (default 30 days) for dedupe; failed elements kept forever unless `failedTimeToLive`; dead-letter (undecodable payload) fails immediately; run `layerCleanup` in one instance.
- [inf] This is closer to `bridger_jobs` (DB clock, `Schedule` retry, `dead` state) than persisted entity messages are. Combine: `PersistedQueue` for the queue, `Singleton`/`ClusterCron` for the scheduler, an entity only where per-key serialization is needed.

**`persistence/PersistedCache` + `Persistable` + `PrimaryKey`** [V]
- Layered cache: in-process `Cache` → named `Persistence` store → lookup. Stores the lookup's **Exit**. `timeToLive: (exit, request) => Duration` so failures can get zero TTL.
- Identity comes from `PrimaryKey` (`[PrimaryKey.symbol]()` returns a string); `Persistable.Class` builds a request class with `primaryKey(payload)`.
- Backends via `Persistence`: memory, KeyValueStore, Redis, **SQL** (`effect_persistence` table partitioned by `store_id`; `layerSqlMultiTable` one table per store).
- Not documented: stale-while-revalidate, coalescing of concurrent in-flight gets, key collision handling.
- [inf] Resembles "completed receipt returns the stored outcome". It has no claim / in-flight takeover and does not commit with your business write, so it does not replace `CommandReceipts`.

**`persistence/RateLimiter`** (truncated; [S] tail): `fixed-window` and `token-bucket`; `onExceeded: "delay" | "fail"`; `RateLimitExceeded { key, limit, remaining, retryAfter }`. Stores: memory (process-local) and **Redis only** for distributed. No SQL store.

**`persistence/CircuitBreaker`**: keyed; states Closed / Open / HalfOpen (one probe); trip policies `consecutive(n)`, `rate(...)`. Stores: memory (per layer) and Redis (shared). No metrics or spans emitted. [V] Calls admitted before a trip still complete and their outcomes change nothing.

**`persistence/KeyValueStore`** [V]: memory, filesystem, SQL (`layerSql({table})`), `Storage` (localStorage-like); `prefix` view scans every key. **`persistence/Redis`** [V]: service shell, you supply the client.

**Coordination primitives** (truncated; [S] tails)
- `HashRing` [V]: weighted consistent hashing; `add(node, {weight})`, `get(input)`, `getShards(count)`; nodes match by `PrimaryKey`; **no migration/handoff API**.
- `PartitionedSemaphore`: one shared pool, waiters grouped by key, round-robin release: fairness, **not** a per-key cap. (Bridger's ERP spec already names it.)
- `Semaphore`, `Pool` (concurrency is per item), `RcMap` (`capacity` does not evict; new key fails `ExceededCapacityError` when full): per-key hard limits need one semaphore per key [inf].

## 3. EventLog: offline-first journals and sync (`effect/eventlog`)

The closest Effect analogue to Bridger's event-store + durable-bus + keyring for local-first devices.

- **Event / EventGroup** [V/S]: tag, payload/success/error schemas, `primaryKey(payload)`.
- **EventJournal** (partly [S]): entries with **UUID v7** ids, id order = replay order; `write`, `writeMany` (**exactly two entries**), `writeFromRemote` (returns `duplicateEntries`), `writeRemoteAcks`, `withLock(storeId)`. Backends: memory, IndexedDB, **SQL** (`SqlEventJournal`, same shape).
- **EventLog** (tail [S]): the handler runs first; the journal entry commits only after the handler succeeds. `HandlerTransaction` batches replays; remote replays retry with backoff up to 10 s and later batches wait; local writes fail without retry. "Replay handlers must tolerate running more than once for the same entry."
- **EventRow** [V]: last-writer-wins per top-level field, converging in id order; schema-evolution rules; cascading-delete caveats. Never use `groupCompaction` on row events.
- **Remote sync** [V/S]: RPC over a `Protocol` (no WebSocket named). `Hello` → `Authenticate` → `Changes` / `Write`; large writes chunked. Writes return `{ entryId, sequence }` acks; a connection's own writes are not echoed.
- **Encryption** [V]: AES-256-GCM per batch, random 12-byte nonce, per-identity key derived with `Digest`. Server sees `publicKey`, `storeId`, plaintext `entryIds`, remote sequences, IVs, batch structure and timing, never payloads. Key rotation, recovery and multi-device sharing are **not covered**.
- **Session auth** [V]: Ed25519 challenge-response (32-byte challenge, 30 s TTL); the server binds the first verified signing key to each `publicKey`; `authorizeIdentity` is optional.
- **Server storage** [V]: SQL encrypted/unencrypted, or memory. Caveats: no retry of sequence conflicts between instances; live notifications stay local to each instance; concurrent caller transactions can reach live readers out of order. Encrypted compaction exists.
- [inf] **Fit with Bridger:** a candidate backing for the POS → hub → cloud path. It does not match Bridger's durable-bus contract (contiguous per-(origin, stream) sequence, ack-after-commit, inbox watermark, HLC). Treat it as an adapter option needing its own ADR, not a drop-in. `docs/knowledge/EFFECT-V4.md` E38 already warns it is not a legally sufficient audit ledger.

## 4. RPC, sockets, workers (remote / federation transports)

- **Transports** [V/S]: HTTP (`layerProtocolHttp`, optional batching), WebSocket, raw `SocketServer`, stdio (server), worker threads / web workers (`layerProtocolWorker`, `WorkerRunner`).
- **Socket client** [V]: `pingInterval` default 5 s; `retryPolicy` retries after socket errors; `Socket` is pull-based so backpressure is end-to-end; every termination is a `SocketError`, so reconnect is `Effect.retry` around the scoped loop. No heartbeat built into the bare `Socket`.
- **RpcMiddleware** [V]: server middleware gets `{ client, headers, payload, requestId, rpc }` and can provide services; client middleware can modify the outgoing request; `requiredForClient: true` forces the client layer. [inf] This is the natural home for per-call capability tokens (`TokenAuthority`).
- **Serialization** [V]: json, ndjson, JSON-RPC, `schemaBinary` (default 16 MiB frame cap, payload fingerprints off by default). No msgpack.
- **Not provided:** per-call timeouts (no option documented; wrap with `Effect.timeout`), version negotiation or skew handling, epochs or partition modes, unknown-outcome reporting. Bridger's `Remote` sessions (epoch, heartbeat, `executed | not-executed | unknown`) stay custom.

## 5. Crypto and JOSE

- **`crypto/Aead`** [V]: AES-128/256-GCM, ChaCha20-Poly1305, XChaCha20-Poly1305 (24-byte nonce, the page's recommendation for random nonces). Nonce is **caller-supplied**, nothing tracks reuse. ChaCha is pure TypeScript (vendored noble).
- **`crypto/KeyWrap`** [S tail]: AES-KW, RSA-OAEP. `wrap` takes a typed key, never raw bytes. No combined envelope recipe, **no HPKE**.
- **`crypto/Digest`** [V]: md5/sha1/sha256/384/512. **No canonical JSON** (RFC 8785 is yours).
- **`crypto/Mac`** [V]: HMAC-SHA-1/256/384/512; `verify` is the safe path (`timingSafeEqual` is not constant-time in JS).
- **`crypto/Signature`** [S tail]: Ed25519, ECDSA P-256/384/521, RSA-PSS, RSASSA-PKCS1-v1_5. **Single signer only**; no N-of-M. Count verified signatures yourself for `SignaturePolicy`.
- **`crypto/Kdf`** [V]: HKDF, PBKDF2, Argon2id (Argon2id fails `Unsupported` on the Web Crypto layer; needs `NodeCrypto.layerKdf` on Node 24.7+).
- **`crypto/KeyAgreement`** [S]: X25519, ECDH P-256/384/521. Pass the shared secret through `Kdf`.
- **`jose`** [V]: `Jwt` (sign/verify with policy: audience, issuer, `clockTolerance`, `maxTokenAge`, `requiredClaims`), `Jws` (compact only), `Jwks` (remote fetch with TTL cache, request cooldown, no expired-set fallback), `Jwe` (`dir` + A256GCM only).
- Runtime: no runtime matrix; **workerd is not mentioned**; Ed25519 needs Chrome 137 / Firefox 129 / Safari 17.
- [inf] Maps onto keyring (`Aead` + `KeyWrap` + `SecureRandom`), audit-chain (`Digest`, `Signature`), loader (`Signature`, `Digest`), federation manifest verification (`Jws`/`Signature`). Open decision D12 (key distribution across hosts) can be composed from `KeyAgreement` + `Kdf` + `KeyWrap` but no ready protocol exists.

## 6. Observability and testing

- **`cluster/ClusterMetrics`** [V]: `effect_cluster_entities` (by type), `effect_cluster_entity_mailbox_size` (per type/id/shard, **off by default**, cardinality warning), `effect_cluster_entity_mailbox_size_max`, `effect_cluster_runners_healthy`, `effect_cluster_shards`, `effect_cluster_shards_releasing`, `effect_cluster_shard_release` (histogram). No runner label: runners sharing a registry overwrite each other unless you add attributes.
- **OTLP** [V]: `Otlp.layer({ baseUrl, ... })` → logs, metrics, traces; `Flusher` for serverless; `OtlpMetrics` cumulative (default) or delta; `PrometheusMetrics.layerHttp()` serves `/metrics`.
- **Trace propagation across messages:** `Tracer.externalSpan({ traceId, spanId })` lets you carry context yourself [V]; the observability pages do not describe automatic propagation across RPC/cluster messages. `Envelope.makeRequest` carries `traceId`/`spanId`/`sampled` [V, see messaging file].
- **Testing:** `cluster/TestRunner.layer` (in-memory storage, no-op transport, always-healthy runners) [V]; `TestClock` (`adjust`, `setTime`; Cron not covered); `Entity.makeTestClient`; `RpcTest.makeClient`. `@effect/vitest` helpers (`it.effect`, etc.) could not be verified.
- **`devtools/DevTools`** [V]: streams spans and metrics to an external process; URL must be passed explicitly.

## 7. AI, MCP, CLI, UI

- **MCP** [V/S]: `McpServer.registerToolkit(toolkit)`; transports `layerStdio`, `layerHttp` (Streamable HTTP), `layerHttpRequestScoped`; **no built-in auth** (use middleware, `allowedOrigins` blocks listed browser origins only); `elicit(...)`. `McpClient` supports only **static headers** (no OAuth); `trustAnnotations` copies server hints but never sets approval.
- **Tools** [S]: annotations `Readonly`, `Destructive`, `Idempotent`, `OpenWorld`; approval is a separate `needsApproval` property taking params and context. `Tool.getJsonSchemaFromSchema` projects Schema to JSON Schema; the dialect version is not stated, so check against Bridger's 2020-12 requirement.
- **Chat** [S]: `makePersisted({storeId})`, `export`/`fromExport`; depends on `BackingPersistence`.
- **CLI** [V/S]: `Command.make`, `withSubcommands`, shared and global flags, `validate`, `withFallbackConfig`/`withFallbackPrompt`, help via `CliOutput`; completions not read.
- **UI** [V/S]: `Reactivity.invalidate/mutation/query`, `Atom` + `AtomRegistry.subscribe`, `atom-react` hooks (`useAtomValue`, `useAtomSet`, ...). `Atom.subscriptionRef` is **[S] only**; whether writing a `SubscriptionRef` invalidates dependents automatically is unconfirmed. `EventLog.groupReactivity` ties event tags to invalidation keys.
- [inf] `@bridger/mcp` and the `bridger` CLI could be thin layers over these; `@bridger/agent` stays Bridger's (taint, subagent narrowing, no model adapter). E42 already says: pick one owner for each piece of UI state.

## 8. Core utilities

- **`SemVer` / `SemVerRange`** [V/S]: strict SemVer 2.0 parsing (rejects `v` prefix, `1.2`, leading zeros); `SemVerRange.matches(range, version)`; `^1.2.3` = `>=1.2.3 <2.0.0-0`. `*` excludes prereleases unless `includePrerelease`. Fits "ranges within one major" for `Contract.make`.
- **`Cron`** [V/S]: `next`/`prev`/`match`/`sequence`; optional `tz`; `onDstOverlap` ("earlier" default, "later", "both"). **No missed-run or catch-up logic**: Bridger's `catchUp: all | latest | skip` is still yours (ClusterCron's `calculateNextRunFromPrevious` helps; semantics unverified).
- **`Schedule`** [V/S]: `exponential`, `jittered` (×0.8–1.2), `upTo`, `max`/`min`, `cron`. `fixed` does not replay missed intervals. `exponential` has no cap or jitter built in.
- **`Cache` / `ScopedCache`** [S tails]: concurrent gets share one lookup; failed lookups are cached as an Exit until TTL, refresh or invalidation.
- **`LayerRef` / `LayerMap` / `RcRef`** [V]: `invalidate` makes the next use build a fresh context; **borrowed contexts stay usable until their scope closes; no API waits for or revokes old borrowers**. Confirms core's lease, bounded drain and `LeaseRevoked` machinery is still needed.
- **`ExecutionPlan`** [V]: ordered fallback steps with attempts and schedule. Whether interruption advances to the next step is not stated.
- **`TextDiff`** [V]: `unified(lines(before, after))` for a consent diff; set `maxEdits` for untrusted text. **`JsonPatch`** [V]: `get`/`apply` support add, replace, remove only (no move/copy/test); `apply` throws on bad paths.
- **`Latch`** [V]: open/closed gate; [inf] a fit for in-process admission/fence gates (`admission = fenced`, durable-bus `whenReadable`).
- **`FiberMap`** [S], **`TxRef`/`TxReentrantLock`** [V]: in-memory only. Neither mentions SQL; they do not coordinate with database transactions.

## Still uncovered (no Effect component found)

1. Offline failover between sites (G53) and any consensus or election across a partition.
2. A canonical JSON implementation (RFC 8785) for gxp hashing.
3. N-of-M signature policy, revocation sets and the kill switch protocol.
4. Key distribution across hosts (D12) and crypto-shredding.
5. Audit-chain anchoring to an external system.
6. HA design for the durable-bus relay (no spec text; `Singleton` is an inference).
7. Lease revocation with bounded drain (`LayerRef`/`RcRef` borrowers are never revoked).
8. Per-call RPC timeouts, version skew negotiation, epochs, unknown-outcome reporting.
9. Distributed rate limiting or circuit breaking without Redis.
10. Missed-run catch-up policy for schedules.
11. Whether Cluster SQL storage runs on SQLite and SQL Server.

## Not read

`EventLog` handler internals past truncation, `Persistence.BackingPersistence`, `Prompt`/`DecisionModel`, `cli/Completions`, `rpc/RpcClientError`/`RpcMessage`/`OpenRpc`, per-dialect migrators (`PgMigrator`, `SqliteMigrator`, ...), `OtlpExporter`/`OtlpLogger`, the `workers/` platform adapters, `platform-*` packages, and `graphql/`, `http-api/`, `net/`, `encoding/`, `process/`. Effect source code was not read.
