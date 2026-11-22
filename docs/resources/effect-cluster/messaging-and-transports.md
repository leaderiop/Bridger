# Messaging, errors, transports

All modules unstable (Effect 4.1.4). Back to [README](README.md).

## Envelope (`cluster/Envelope`) — page truncated, see README

Transport envelopes: requests, acks for streamed chunks, interrupts; partial-decode schemas; primary-key helpers.
- `makeRequest({ address, headers, payload, requestId, tag, sampled?, spanId?, traceId? })` — `sampled`/`spanId` are only carried when `traceId` is given.
- `primaryKeyByAddress({ address, id, tag })`, `primaryKey(envelope): string | null`, `isEnvelope`.
- `AckChunk` (`address`, `id`, `replyId`, `requestId`) acknowledges one streamed reply chunk. `Interrupt` interrupts an in-flight request. `PartialRequest` has `payload: unknown` until the RPC's payload schema decodes it (two-stage decoding).
- `Envelope<R> = Request<R> | AckChunk | Interrupt`; `Encoded` = string-id forms.
- *(summary)* `PartialRequestEncoded`, `OpaqueHole`, `Partial*` schemas, `RequestTransform`, `TypeId`. `Partial` shadows TS's `Partial` if imported by name; `Request`/`Envelope` are each type + namespace + schema.

## Reply (`cluster/Reply`)

`Reply<R> = WithExit<R> | Chunk<R>`.
- `Chunk`: `id`, `requestId`, `sequence`, `values` (documented as non-empty; typed as a 2-tuple).
- `WithExit`: terminal reply with the RPC `Exit` (success, typed failure, defect, interruption).
- `ReplyWithContext`: reply + RPC + services needed to encode; `fromDefect`, `interrupt` constructors.
- `serialize` (can fail `MalformedMessage`), `serializeLastReceived` (None if no reply yet), `serializeOrDefect` (never fails; substitutes a defect reply).
- `Reply` and `Encoded` are each both a type and a value.

## Runners (`cluster/Runners`)

Runner-to-runner communication.
- Service methods: `send`, `notify` (persisted work exists), `ping`, `onRunnerUnavailable`, plus local `sendLocal`, `notifyLocal`. `send`/`notify` fail with `EntityNotAssignedToRunner | PersistenceError | RunnerUnavailable | MailboxFull | AlreadyProcessingMessage`; `sendLocal` cannot fail `RunnerUnavailable`.
- `make({ ping, send, notify, onRunnerUnavailable, codecFor })` adds local persistence, duplicate handling, optional serialization simulation, and polling of persisted replies at `entityReplyPollInterval`.
- `makeRpc` / `layerRpc` — one cached RPC client per runner address; needs `RpcClientProtocol` (`codecFor` + `make(address)`).
- `makeNoop` / `layerNoop` — **rejects every send** with `EntityNotAssignedToRunner`.
- `Rpcs` — RPC group for ping, notify, effect, stream, envelope.
- The meaning of `discard` and `Option<RunnerAddress>` in `notify` is not documented.

## ClusterError (`cluster/ClusterError`)

| Error | Fields | Meaning |
|---|---|---|
| `EntityNotAssignedToRunner` | `address` | Runner doesn't own that entity's shard. |
| `MailboxFull` | `address` | Bounded mailbox at capacity, or `maxResidentEntities` reached. Volatile requests fail immediately; persisted ones retry/resume from storage. |
| `AlreadyProcessingMessage` | `address`, `envelopeId` | Same envelope already in flight. |
| `MalformedMessage` | `cause` | Encode/decode failure; `static refail`. |
| `PersistenceError` | `cause` | Storage write failed; `static refail`. |
| `RunnerNotRegistered` | `address` | Runner not registered with the shard manager. |
| `RunnerUnavailable` | `address` | Runner didn't respond. |

`is` guards exist on most but not all (none listed for `PersistenceError`, `RunnerNotRegistered`).

## DeliverAt (`cluster/DeliverAt`)

Protocol for payloads carrying their own delivery time: implement `[DeliverAt.symbol](): DateTime`. `isDeliverAt(u)`, `toMillis(u): number | null`. The docs do not say what consumes it, or what happens for a time in the past — check source.

## Transports

- **SocketRunner** — `layer` serves runner RPC handlers on a `SocketServer` and provides `Sharding` + `Runners`; still needs `Runners.RpcClientProtocol` for outgoing calls. `layerClientOnly` can send but starts no server and receives no shards.
- **HttpRunner** — client protocols: `layerClientProtocolHttp({ https?, path })`, `...HttpDefault`, `layerClientProtocolWebsocket`, `...WebsocketDefault`. Full layers: `layerHttp`, `layerHttpClientOnly`, `layerWebsocket`, `layerWebsocketClientOnly`, `layerClient`. Route-adding: `layerHttpOptions({ path })`, `layerWebsocketOptions({ path })`. Handlers: `toHttpEffect`, `toHttpEffectWebsocket` (nested Effect: run the outer one to get the request handler). Fixed-path layers always use `"/"`.
- **SingleRunner** — `layer({ runnerStorage?: "memory" | "sql", shardingConfig? })`: one process, no-op runner communication and health, SQL message storage always, config from env overlaid with `shardingConfig`. Needs `SqlClient` and `Digest` even in memory mode. Not for multi-node.
