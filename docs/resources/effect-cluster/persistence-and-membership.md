# Persistence and membership

All modules unstable (Effect 4.1.4). Back to [README](README.md).

## MessageStorage (`cluster/MessageStorage`)

Boundary between runner logic and storage that keeps mailbox state recoverable: saves requests, control envelopes, replies; finds unprocessed messages for assigned shards; tracks duplicates; manages reply handlers waiting for responses.

- `make(storage)` — wraps a concrete storage and adds reply-handler management. Storage must supply: `clearAddress`, `clearReplies`, `deleteProcessed({ completedBefore, entityType, limit })`, `repliesFor`, `repliesForUnfiltered`, `requestIdForPrimaryKey`, `resetAddress(es)`, `resetRequests`, `resetShards`, `saveEnvelope`, `saveRequest`, `saveReply`, `unprocessedMessages(shardIds, { addresses?, limit? })`, `unprocessedMessagesById`, `withTransaction`.
- `makeEncoded(encoded)` — adapts an encoded driver (encode/decode, primary keys, delayed-delivery checks, duplicate decoding, defect replies for malformed messages).
- `noop` / `layerNoop` — persists nothing; persisted sends defect.
- `SaveResult` (`Success` | `Duplicate<R>`; a duplicate carries the original request id and last reply), `SaveResultEncoded`.
- *(summary)* `layerMemory: Layer<MessageStorage | MemoryDriver, never, ShardingConfig>` for tests; `Encoded` driver contract; `EncodedRepliesOptions` / `EncodedUnprocessedOptions` with a `cursor`.

## SqlMessageStorage (`cluster/SqlMessageStorage`)

Persists envelopes and reply chunks in SQL: redelivery of unprocessed messages, dedupe by primary key, replay of reply chunks until acknowledged.

| Layer / fn | Runs migrations | Notes |
|---|---|---|
| `layer` | yes | prefix `cluster`; needs `SqlClient`, `ShardingConfig`, `Digest`; supplies `Snowflake.layerGenerator`. Connection needs DDL rights; on Postgres the history table gets an exclusive lock. |
| `layerWith({prefix})` | yes | custom prefix |
| `layerMigrations({prefix})` | only | history in `<prefix>_migrations`; errors become defects |
| `layerStorage({prefix})` | no (no DDL) | run `layerMigrations` first |
| `make` / `makeEncoded` / `makeEncodedStorage` | yes / yes / no | effect constructors; `makeEncodedStorage` since 4.1.0 |
| `migrations({prefix})` | — | the `Loader` |

Gotchas
- Dedupe keys longer than the 255-char `message_id` column are hashed with `Digest`; shorter keys stay plaintext (compatible with older rows).
- Changing `prefix` points the runtime at different tables, including migration history.
- Postgres: a schema-qualified prefix (`app.cluster`) gives an invalid index name — use `search_path` instead.
- MySQL: `deleteProcessed` needs 8.0.1+ / MariaDB 10.6+ (`SKIP LOCKED`) at READ COMMITTED, which needs `binlog_format` = `ROW` or `MIXED`.

## MessageRetention (`cluster/MessageRetention`, since 4.1.3)

`make({ entity, retention, interval?, shardGroup? }): Layer<never, never, Sharding | MessageStorage>`.
- Registers a singleton that every `interval` (default 1 minute) batch-deletes the entity's requests whose final reply is older than `retention`, with their acks/interrupts/replies. Running requests and requests reset via `clearReplies` are kept. Failures are logged and retried next interval.
- The singleton runs in `shardGroup` (default `"default"`), not the entity's own group. Include the layer on **every** runner that can be assigned that group.
- **A request re-sent with the same primary key after deletion runs the handler again.** Choose retention longer than any client retry window.
- **Do not use for workflow or `ClusterCron` entities** — they rely on stored replies to know what already ran.
- Example: `entity.annotateRpcs(ClusterSchema.Persisted, true)` + `MessageRetention.make({ entity, retention: "7 days" })`.

## Runner (`cluster/Runner`)

Metadata for a process that can host shards: `{ address: RunnerAddress; groups: string[]; weight: number }`. `Runner.make(props)` does **no** runtime validation. Each group's hash ring gets the address with `weight` as relative weight. Statics `decodeSync`, `encodeSync`, `format`; Equal/Hash implemented.

## RunnerStorage (`cluster/RunnerStorage`)

Stores runner registration, health, machine-id assignment, shard locks.
- Methods: `register(runner, healthy)` → machine id; `unregister`; `getRunners` → `[Runner, healthy][]`; `setRunnerHealth`; `acquire(address, shardIds)`; `refresh(address, shardIds)`; `release`; `releaseAll`. All fail with `PersistenceError`.
- `Encoded` string-level backend (its `acquire` takes a non-empty tuple; empty-input handling is undocumented), `makeEncoded`, `makeMemory`, `layerMemory` (in-process only, lost on restart).

## SqlRunnerStorage (`cluster/SqlRunnerStorage`)

SQL-backed `RunnerStorage`. Default prefix `cluster` → tables `cluster_runners`, `cluster_locks`, `cluster_runner_migrations`.
- Uses **advisory locks** on Postgres/MySQL unless `ShardingConfig.shardLockDisableAdvisory` is set or the client is PGlite; otherwise lock rows.
- Layers: `layer`, `layerWith({prefix})`, `layerMigrations({prefix})` (no `ShardingConfig` needed), `layerStorage({prefix})` (no DDL). `migrations({prefix})` always creates the locks table.
- Changing `prefix` gives runners separate registrations and separate shard locks.

## RunnerHealth (`cluster/RunnerHealth`)

`isAlive(address): Effect<boolean>`; Sharding keeps shards on a responsive runner and reassigns those of an unresponsive one.
- `layerPing` / `makePing` — pings through `Runners`; failed pings retry on a short schedule.
- `layerK8s` / `makeK8s({ labelSelector?, namespace? })` — pod readiness via `K8sHttpClient`. The HTTP client must trust the pod CA; the service account must be allowed to list pods. **Fails open:** if the Kubernetes API check itself fails, the runner is treated as healthy.
- `layerNoop` — always alive; tests/local only.
