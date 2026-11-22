# Sharding, singletons, config

All modules unstable (Effect 4.1.4). Back to [README](README.md).

## Sharding (`cluster/Sharding`)

Owns shard assignment and message routing: decides which shard owns an id, tracks the local runner's shards, sends to local handlers or remote runners, registers entities/singletons, polls storage for persisted work, tracks shutdown.

`Sharding.layer: Layer<Sharding, never, ShardingConfig | Runners | MessageStorage | RunnerStorage | RunnerHealth>` — installs its own snowflake generator and entity reaper.
**Gotcha:** persisted messages need a real `MessageStorage`; `MessageStorage.layerNoop` makes persisted sends defect.

`Sharding` service members:
- `registerEntity(entity, handlers, options?)` — options as `Entity.toLayer`.
- `registerSingleton(name, run, { shardGroup? })`
- `makeClient(entity)`
- `send(message: Incoming)` → `EntityNotAssignedToRunner | MailboxFull | AlreadyProcessingMessage`
- `sendOutgoing(message: Outgoing, discard: boolean)` — adds `PersistenceError`. The `discard` flag is not explained in the docs.
- `notify(message, { waitUntilRead? })`
- `pollStorage`, `getShardId(entityId, group)`, `hasShardId(shardId)`
- `activeEntityCount`, `isShutdown`, `getSnowflake`, `getRegistrationEvents: Stream<ShardingRegistrationEvent>`
- `reset(requestId, { expectedReplyId? }): Effect<boolean>`

## Singleton (`cluster/Singleton`)

`make(name, run: Effect<void, E, R>, { shardGroup? }): Layer<never, never, Sharding | Exclude<R, Scope>>` wraps `registerSingleton`.
- Runs only on the runner owning the shard for the singleton's `(name, shardGroup)`.
- If ownership moves or the layer scope closes: fiber interrupted, registration removed.
- If `run` completes normally it is **restarted** until scope closes or ownership moves.
- Failures in `run` become **defects** — handle expected errors inside.
- Registering the same name in the same group twice dies.

## SingletonAddress (`cluster/SingletonAddress`)

Runtime address of a singleton registration: `{ name: string; shardId: ShardId }` (shardId derived from name + shard group; derivation not documented). Implements Equal/Hash; used for registration events and local fiber tracking.

## ShardingConfig (`cluster/ShardingConfig`)

Service fields:
- Groups: `assignedShardGroups`, `availableShardGroups`, `shardsPerGroup`
- Addresses: `runnerAddress`, `runnerListenAddress` (`Option<RunnerAddress>`), `runnerShardWeight`
- Entities: `entityMailboxCapacity`, `entityMailboxMetrics`, `entityMaxIdleTime`, `entityRegistrationTimeout`, `entityTerminationTimeout`, `maxResidentEntities`
- Polling/timing: `entityMessagePollInterval`, `entityReplyPollInterval`, `refreshAssignmentsInterval`, `runnerHealthCheckInterval`, `runnerJoinDebounce`, `sendRetryInterval`, `shardLockExpiration`, `shardLockRefreshInterval`, `unprocessedMessageBatchSize`
- Flags: `preemptiveShutdown`, `shardLockDisableAdvisory`, `simulateRemoteSerialization`

Constructors: `defaults`, `config` (Config with defaults), `configFromEnv` (constant-case env provider), `layer(partial)` (shallow merge over defaults), `layerDefaults`, `layerFromEnv(partial?)`, `shardGroupConfig(config)`.
**Gotcha:** nothing validates that settings agree across runners — keep `shardsPerGroup` and `availableShardGroups` identical everywhere. The docs do not list the default values.
