# Effect v4 Cluster — resource notes

Research notes on the `effect/cluster` and `effect/workflow` modules of **Effect 4.1.4**.

- **Source:** the API reference at `https://effect.website/docs/v4/api/effect/cluster/<Module>` (and `/workflow/<Module>`), read 2026-11-14. Source pinned by the docs to Effect-TS/effect commit `289a53f`.
- **Status:** every module is marked **unstable**. Signatures may change between 4.x releases.
- **Not covered:** the YouTube playlist "Effect Module of the Week" (`PLCGIHlTAijhY`) — transcripts could not be downloaded (caption endpoint timed out). Cluster videos: TB145FAQnDM (Part 1), 9QDcO50YriA (Part 2), MQnQ87Nv0gU (Part 3), fNpJ63QjK-k (Idempotency, Part 4), fM5FDXIjlaY (Workflows, Part 5). Also not read: Effect source code.
- **Reliability caveat:** the Entity, Envelope, Workflow, DurableDeferred and MessageStorage pages were truncated at fetch time. Items from those pages that were filled in by a model summary are marked *(summary)*. Verify them in source before relying on them.

## Files

| File | Covers |
|---|---|
| [entities.md](entities.md) | `Entity`, `EntityProxy`, `EntityProxyServer`, `EntityResource`, `ClusterSchema` |
| [sharding.md](sharding.md) | `Sharding`, `Singleton`, `SingletonAddress`, `ShardingConfig` |
| [persistence-and-membership.md](persistence-and-membership.md) | `MessageStorage`, `SqlMessageStorage`, `MessageRetention`, `Runner`, `RunnerStorage`, `SqlRunnerStorage`, `RunnerHealth` |
| [messaging-and-transports.md](messaging-and-transports.md) | `Envelope`, `Reply`, `Runners`, `ClusterError`, `DeliverAt`, `SocketRunner`, `HttpRunner`, `SingleRunner` |
| [cron-and-workflows.md](cron-and-workflows.md) | `ClusterCron`, `ClusterWorkflowEngine`, `Workflow`, `Activity`, `DurableClock`, `DurableDeferred`, `DurableQueue`, `WorkflowEngine` |
| [companion-modules.md](companion-modules.md) | Non-Cluster Effect modules that cover the Bridger gaps: SQL, persistence, eventlog, RPC, crypto/jose, observability, ai/MCP, cli, utilities |
| [schema-and-other-modules.md](schema-and-other-modules.md) | Schema, JSON Schema/SchemaRepresentation, Config/Redacted/DateTime/BigDecimal, streams/queues, HTTP/HttpApi, platform packages, Tar/Zip/encoding |

## Mental model

Cluster is a **sharded actor system with durable mailboxes**.

- An **Entity** is a type with an RPC protocol, addressed by `(type, entityId)`.
- The id hashes to a **shard** within a **shard group**. Each shard is owned by exactly one **Runner** at a time.
- A request is wrapped in an `Envelope` and routed to the owning runner.
- If the RPC is annotated `Persisted`, the request is saved to **MessageStorage** first, so it survives restarts and shard moves.
- Replies (`Reply.Chunk` for streams, `Reply.WithExit` for the final result) are stored too. A duplicate request can resume from stored replies.
- **RunnerStorage** arbitrates shard ownership with locks. **RunnerHealth** decides when a runner is dead so its shards can move.

## Module map

| Layer | Modules |
|---|---|
| Definition | `Entity`, `EntityProxy`, `ClusterSchema` |
| Runtime core | `Sharding`, `Singleton`, `ShardingConfig` |
| Messaging | `Envelope`, `Reply`, `Runners`, `ClusterError`, `DeliverAt` |
| Persistence | `MessageStorage`, `SqlMessageStorage`, `MessageRetention` |
| Membership | `Runner`, `RunnerStorage`, `SqlRunnerStorage`, `RunnerHealth` |
| Transports | `SocketRunner`, `HttpRunner`, `SingleRunner` |
| Higher level | `ClusterCron`, `ClusterWorkflowEngine`, `EntityResource` |

Other modules in the package, not read: `ClusterMetrics`, `EntityAddress`, `EntityId`, `EntityType`, `K8sHttpClient`, `K8sTypes`, `MachineId`, `Message`, `RunnerAddress`, `RunnerServer`, `ShardId`, `ShardingRegistrationEvent`, `Snowflake`, `SqlRunnerStorage` internals, `TestRunner`.

## Typical wiring

```
Entity.toLayer(...)          // handlers
  + Singleton / ClusterCron / MessageRetention layers
  → Sharding.layer
      ← ShardingConfig.layerFromEnv
      ← SqlMessageStorage.layer + SqlRunnerStorage.layer   (need SqlClient)
      ← RunnerHealth.layerK8s | layerPing
      ← SocketRunner.layer | HttpRunner.layerHttp          (multi-node)
        or SingleRunner.layer                              (one process)
```
