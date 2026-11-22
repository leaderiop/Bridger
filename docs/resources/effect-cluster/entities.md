# Entities, proxies, resources, annotations

All modules unstable (Effect 4.1.4). Back to [README](README.md).

## Entity (`cluster/Entity`)

An entity gives a stable name and RPC protocol to a group of values addressed by id. The cluster hashes the id to a shard and routes each request to the runner owning it.

**Constructors**
- `make<Type, Rpcs>(type, protocol: Rpcs[]): Entity<Type, Rpcs[number]>` — duplicate RPC tags: later definition wins.
- `fromRpcGroup(type, group: RpcGroup)` — same, from an existing group.
- `isEntity(u)` — type guard.

**`Entity` interface**
- `client: Effect<(entityId) => RpcClient.From<Rpcs, MailboxFull | AlreadyProcessingMessage | PersistenceError | EntityNotAssignedToRunner>, never, Sharding>`
- `protocol: RpcGroup`, `type: string & Brand<"~effect/cluster/EntityType">`
- `annotate`, `annotateMerge`, `annotateRpcs`, `annotateRpcsMerge` — attach `Context` annotations to the entity or to its RPCs.
- `getShardGroup(entityId): string`, `getShardId(entityId): Effect<ShardId, never, Sharding>`
- `of(handlers)` — typing helper, returns its input.
- `toLayer(build, options?)` — `build` is a handlers object or an Effect producing one. Options: `concurrency`, `defectRetryPolicy`, `disableFatalDefects`, `mailboxCapacity` (number | `"unbounded"`), `mailboxMetrics`, `maxIdleTime`, `spanAttributes`.
- `toLayerQueue(build, options?)` — same options; `build` receives `(queue: Dequeue<Request<Rpcs>>, replier: Replier<Rpcs>)`.
- `Replier`: `complete`, `fail`, `failCause` (a `succeed` member appears in the summary only).

**Keep-alive**
- `keepAlive(enabled: boolean): Effect<void, never, Sharding | CurrentAddress>` — sends the internal `KeepAliveRpc` (persisted, uninterruptible). Does nothing unless a `KeepAliveHandler` service (since 4.1.3) is provided.
- `KeepAliveLatch` — a `Latch` closed while keep-alive is active.

**Services:** `CurrentAddress` (`EntityAddress`), `CurrentRunnerAddress` (`RunnerAddress`).

**Request** *(summary)*: `Entity.Request<Rpc>` extends `Envelope.Request` and adds `lastSentChunk: Option<Reply.Chunk>` so a stream handler can resume sequencing after a restart.

**Testing:** `makeTestClient(entity, layer)` — no-serialization client per entity id, backed by a test sharding service. Needs `ShardingConfig`.

## ClusterSchema (`cluster/ClusterSchema`)

Annotations (`Reference` values) that add cluster behaviour to RPCs/entities without changing their schemas.

| Annotation | Default | Effect |
|---|---|---|
| `Persisted` | `false` | Store the request in mailbox storage. |
| `WithTransaction` | `false` | Wrap server handling in the storage transaction. |
| `Uninterruptible` | — | `true` \| `"server"` \| `"client"` \| `false`. |
| `InterruptOnTermination` | `false` | Interrupt the request when entity termination starts. |
| `ClientTracingEnabled` | `true` | Client-side tracing. |
| `Dynamic` | — | `(annotations, request) => annotations`; derives server-side annotations from the decoded request. |
| `ShardGroup` | `"default"` | `(entityId) => string`. |
| `Abandon` | — | Set when a persisted request was abandoned by its runner and continues under another owner. |

Helpers: `isUninterruptibleForClient`, `isUninterruptibleForServer`.

**`WithTransaction` semantics**
- Persisted requests deliver the terminal reply and mark processed only after commit or clean rollback.
- Success replies are saved inside the transaction; failures after rollback.
- If commit reports failure, a stored success reply is recovered; otherwise commit/rollback failures retry the request with no reply. **Handlers must tolerate retries.**
- Only effective if the `MessageStorage` implements transactions.
- Stream chunks are saved/delivered immediately, even if the transaction later rolls back.
- A handler returning a Deferred commits before its reply is saved.

**Other gotchas**
- Non-persisted requests save no reply; success is delivered when the handler exits.
- `InterruptOnTermination`: a persisted request resumes under the next owner without saving the interruption; a non-persisted one receives an interrupt exit. Server-side `Uninterruptible` wins.
- `Dynamic` applies server-side only, not to the generated client.

## EntityProxy (`cluster/EntityProxy`)

Derives RPC/HTTP surfaces from an entity; callers use normal RPC/HTTP clients and the cluster routes by `entityId`.
- `toRpcGroup(entity)` — per RPC: `<Type>.<Tag>` (payload `{ entityId, payload }`) and `<Type>.<Tag>Discard` (fire-and-forget, returns void).
- `toHttpApiGroup(name, entity)` — `POST /<tag lowercase>/:entityId` and `POST /<tag lowercase>/:entityId/discard`.
- Types `ConvertRpcs`, `ConvertHttpApi`. Discard errors: `MailboxFull | AlreadyProcessingMessage | PersistenceError`; HTTP also adds `EntityNotAssignedToRunner`.

## EntityProxyServer (`cluster/EntityProxyServer`)

- `layerHttpApi(api, identifier, entity)` — handlers for groups from `toHttpApiGroup`; reads the `entityId` path param.
- `layerRpcHandlers(entity)` — handlers for groups from `toRpcGroup`; reads `entityId` from the payload.
- Both require `Sharding` plus RPC client/server services. Discard handlers are included automatically.

## EntityResource (`cluster/EntityResource`)

Keeps a long-lived resource (external process, network client, Kubernetes pod) alive across entity restarts, tied to the entity address.
- `make({ acquire, acquireEagerly?, idleTimeToLive? })` — shared lazily across messages. **`idleTimeToLive` defaults to infinite**, so release happens only via `close`. `acquireEagerly` is not explained.
- `makeK8sPod(spec, { idleTimeToLive? })` — creates the pod via `K8sHttpClient` and waits for it.
- `EntityResource<A, E>`: `get: Effect<A, E, Scope>`, `close: Effect<void>`.
- `CloseScope` service — a scope that closes only on explicit close, **not** on restarts from shard movement or node shutdown.
