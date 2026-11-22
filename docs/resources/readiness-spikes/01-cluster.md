# Spike 01: Effect Cluster readiness for Bridger

## 1. Purpose and scope

This document records what was actually run against Effect Cluster to decide whether Bridger can build its durable-execution needs on it. The questions come from the readiness check brief and from `docs/knowledge/EFFECT-V4.md` (E37: "rolling upgrades, fencing and message/storage semantics need a failure model") and the notes in `docs/resources/effect-cluster/`.

Bridger needs covered:

- Command receipts (claim, complete, void, 24h retention): spikes 02, 03, 08.
- Atomic business write plus message commit (the key blocker): spike 03.
- Single-flight migration: spike 04.
- `JobSchedule.catchUp` (all, latest, skip): spike 05.
- Durable workflows with version pinning: spike 06.
- Multi-runner failure and takeover: spike 07.
- Caller-visible failure modes: spike 09.

I did not read the exact Bridger spec section numbers for these needs; the mapping above is by topic. Cloudflare is out of scope.

## 2. Environment and method

- `effect@4.1.4` (installed in `spikes/node_modules`), `@effect/sql-sqlite-node@4.1.4`, `@effect/sql-pglite@4.1.4`, `@effect/platform-node-shared` (for `NodeCrypto.layerDigest`), vitest 5.1.0, Node 22+, macOS.
- The `../../effect` checkout is 4.0.1 and differs from the installed package. Observed: the installed package needs `Digest` rather than `Crypto` for SQL message storage, and `ClusterCron` exports `CurrentScheduledTime`. Everything below refers to the installed package.
- Dialects: SQLite (temp-file database per test) and PGlite (in-memory Postgres, a single connection).
- Runner assembly: `harness.ts` builds `Sharding.layer` + `Runners.layerNoop` + `SqlMessageStorage.layer` + `SqlRunnerStorage.layer` (what `SingleRunner.layer` does) with fast polling (100ms message and reply poll, 16 shards, 2s lock expiry). `multiRunnerLayer` gives each in-process runner its own address and adds a crash simulator: after `kill(port)`, that runner's `RunnerStorage.unregister/release/releaseAll` become no-ops and a custom `RunnerHealth` reports it dead. This models a SIGKILL (locks left behind, runner row left registered).
- No network transport was used between runners (`Runners.layerNoop`); runners share state only through SQL storage.
- Tests are characterization tests: they assert what happened.

Run: `cd spikes && npx vitest run 01-cluster`. Result at the end of the work: 8 files, 29 tests passed. Total about 1 minute because cron and runner tests use real clocks.

File map (`spikes/01-cluster/`):

| File | Content |
|---|---|
| `harness.ts` | Layers: `sqlLayer`, `runnerLayer` (SingleRunner), `multiRunnerLayer` + `Cluster` crash simulator, `boot`/`sharedSql` scope helpers, `Receipt` entity |
| `storage.spike.test.ts` | 01/02: dialect smoke, dedupe, replay after restart; 02b: mid-flight stop |
| `tx.spike.test.ts` | 03a-d: `WithTransaction` and outer-transaction behaviour on both dialects |
| `singleton.spike.test.ts` | 04a-d: Singleton single owner, failure, owner death, duplicate name |
| `cron.spike.test.ts` | 05a-d: ClusterCron with a 4s downtime, four option sets |
| `workflow.spike.test.ts` | 06a-c: Activity, DurableClock, DurableDeferred, replay, versioned tags |
| `runners.spike.test.ts` | 07: two runners, hard kill, takeover time |
| `retention.spike.test.ts` | 08a-b: MessageRetention expiry and cron interaction |
| `failure-modes.spike.test.ts` | 09a-d: MailboxFull, in-flight duplicate, remote shard, unregistered entity |
| `RESULT.md` | Verdict table |

## 3. Findings

### SPK-01-01 SQL storage on SQLite and PGlite

- Need: run Cluster over Bridger's SQL store. Docs only name Postgres, MySQL and PGlite.
- Tested: `storage.spike.test.ts`, "SPK-01-01/02 [sqlite]" and "[pglite]". Built the SingleRunner-equivalent over each dialect and sent persisted requests.
- Observed: both dialects migrate and serve requests. Tables created: `cluster_messages`, `cluster_replies`, `cluster_runners`, `cluster_locks`, `cluster_migrations`, `cluster_runner_migrations`. Source (read, not only observed) has explicit `sqlite`, `pg`, `mysql`, `mssql` branches.
- Verdict: READY for SQLite and PGlite.
- Caveats: real Postgres server, MySQL and SQL Server were not run. PGlite is one connection, so Postgres advisory locks in `SqlRunnerStorage` cannot distinguish runners there (inference from source: the pg path uses `pg_advisory_lock` per backend pid). Multi-runner tests therefore use SQLite only.

### SPK-01-02 Persisted RPC, dedupe, restart (command receipts)

- Need: claim/complete/void receipts keyed by command id, surviving restart.
- Tested: entity `Receipt.claim` with `Persisted` and `primaryKey: key`. Sent `cmd-1` twice, `cmd-2` once, stopped the runner, started a new Sharding over the same storage, sent `cmd-1` again.
- Observed: handler ran twice in total (cmd-1, cmd-2). Duplicate returned `{handled: 1}`, the stored reply. After restart the duplicate still returned `{handled: 1}`. `cluster_messages` held 2 rows.
- 02b (sqlite): handler blocked forever, runner scope closed, new runner started. The message was re-run by the second runner (handler started 2 times) and the reply `{handled: 2}` was stored. This is at-least-once delivery.
- 09b (see below): a duplicate sent while the first is still running waits about 1.1s and returns the same reply.
- Verdict: READY for dedupe and replay; at-least-once means handlers must be idempotent.
- Caveat: there is no claim, complete or void state, only "reply stored or not".

### SPK-01-03 Message-storage transaction joins the business transaction

- Need (key blocker): a business write and the message/reply commit atomically.
- Tested (`tx.spike.test.ts`, both dialects):
  - 03a: RPC annotated `ClusterSchema.WithTransaction` inserts a row via the same `SqlClient`, then succeeds or fails with a typed error.
  - 03b: same handler dies (`Effect.die`).
  - 03c: control, non-transactional handler that dies after a write.
  - 03d: caller opens `sql.withTransaction`, inserts a business row and sends a persisted message with `{discard: true}`, once with a failing transaction, once committing.
- Observed:
  - 03a: success: row present and reply stored. Typed failure (`Boom`): row absent (rolled back), caller gets `Boom`, and a duplicate of that key replays `Boom`.
  - 03b: row absent after each attempt; the handler was retried (3 attempts in 1.5s, each logging "Defect in entity, restarting"); the caller got no reply within 1.5s (timeout). Infinite retry by default (the test passed no retry policy).
  - 03c: row stays committed after the defect.
  - 03d: rollback leaves 0 business rows and 0 message rows. Commit leaves 1 row and 1 message; the runner then processed it (business row from the handler appeared).
- Verdict: PARTIAL. The atomicity mechanism works on both dialects. The caveat is defect behaviour.
- Caveats: it only works when business writes go through the same `SqlClient` as the message storage. Handlers must tolerate retries (documented). A warm-up call was needed before 03d, because the first send before runner registration logged "No healthy runners available" (observed warning).

### SPK-01-04 Singleton

- Need: single-flight migration.
- Tested (`singleton.spike.test.ts`): 04a two runners, same singleton, 200ms body. 04b body fails. 04c owner hard-killed. 04d duplicate registration.
- Observed:
  - 04a: max concurrent 1; ran once in that run.
  - 04c: runs were A at 9ms, B at 2012ms (ownership moved to B when B joined and shards rebalanced), then A at 5032ms after B was killed at 3008ms. So it re-ran on rebalance and again about 2.0s after the kill.
  - 04b: `Effect.fail` ran exactly once over 2.5s, not retried; the runner kept working.
  - 04d: registering the same name twice dies with `Singleton 'dup' is already registered`.
- Source says (not separately tested): failures are converted to defects via `orDie`; a normally completing run stays alive until ownership moves.
- Verdict: PARTIAL. One active owner, not run-once.
- Caveat: a migration singleton can run again at any rebalance.

### SPK-01-05 ClusterCron and catch-up

- Need: `JobSchedule.catchUp` of all, latest, skip.
- Tested (`cron.spike.test.ts`): six-field cron `* * * * * *`, runner up about 3s, stopped, about 4s downtime (restart aligned to wall-clock phase .5s), restarted. `execute` records wall time and `ClusterCron.CurrentScheduledTime`.
- Observed (burst = runs in the first 0.45s after restart):
  - 05a default: 1 late run for the oldest missed slot (scheduled slot 82, others 83-85 never ran), then normal ticks. Not skip, not latest.
  - 05b `calculateNextRunFromPrevious: true`: 4 runs within about 15ms at restart, slots consecutive (all missed slots, in order).
  - 05c `calculateNextRunFromPrevious: true`, `skipIfOlderThan: "1 second"`: 1 run at restart (the slot within the window), stale ones skipped.
  - 05d `skipIfOlderThan: 250` ms: no catch-up run, schedule resumed at the next tick.
  - No duplicated chains appeared after restart in any variant.
- Source (not tested): `skipIfOlderThan` defaults to 1 day; `execute` errors are logged and the chain continues; with `calculateNextRunFromPrevious` a single "executor" entity serialises runs.
- Verdict: PARTIAL. Mapping (inference): all = fromPrevious with a large window; skip = a tiny window (which also skips slightly delayed normal runs); latest = not available exactly. A wrapper could read `CurrentScheduledTime` and drop all but the newest.
- Caveats: configuration is fixed at layer build; exports are only `make` and `CurrentScheduledTime` (observed in 08b); no pause, status or run ledger. Removing a cron layer leaves its pending persisted message in storage (inference from design, not tested).

### SPK-01-06 Workflow on ClusterWorkflowEngine

- Need: durable steps, timers, human-wait signals, version safety.
- Tested (`workflow.spike.test.ts`, SQLite, real clock):
  - 06a: workflow with Activity `step1`, durable clock (3s, `inMemoryThreshold: 0`), `DurableDeferred` gate, Activity `step2`. Run until suspended, close the runner, wait 3.5s (longer than the clock), start a new runner, complete the deferred with a token.
  - 06b: an Activity that calls `DurableClock.sleep` inside its body.
  - 06c: two workflow tags `Order@1` and `Order@2`.
- Observed:
  - 06a: step1 ran once, step2 once, body executed 3 times. Result `w1:1:1:go`. Re-executing with the same idempotency key returned the stored result without rerunning.
  - 06b: body ran twice (`n=2`); the first run's side effects repeated.
  - 06c: with a v1 execution suspended, a runner restart that registered both versions let v1 complete on the v1 body (`v1:x`) and v2 on v2 (`v2:y`).
- Source says: execution id derives from tag and idempotency key; there is no version field.
- Verdict: PARTIAL.
- Caveats: workflow on PGlite, with two runners, and v1 execution with no v1 handler deployed were not tested.

### SPK-01-07 Runner failure and takeover

- Need: what happens when a runner dies.
- Tested (`runners.spike.test.ts`): two runners on shared SQLite, 12 entities with persisted sends, runner A hard-killed (crash simulator), sends re-issued for A's entities via B.
- Observed: before the kill A owned 8, B owned 4. After the kill all 8 re-sent entities were handled by B; the last completed 2944ms after the kill, with `shardLockExpiration` 2s and `runnerHealthCheckInterval` 300ms.
- Source (defaults read from `ShardingConfig.js`): lock expiry 35s, health check interval 1 minute. Inference: default takeover is on the order of 35 to 95 seconds. Not measured.
- Verdict: PARTIAL. Takeover works through storage alone; production health detection was not exercised.
- Caveat: source also shows the health check never marks the last healthy runner unhealthy.

### SPK-01-08 MessageRetention

- Need: 24h receipt retention.
- Tested (`retention.spike.test.ts`): `MessageRetention.make({entity: Receipt, retention: 1500, interval: 300})`.
- Observed: duplicate within retention replayed `{handled: 1}`; one message row before, 0 rows after 2.5s; duplicate after expiry ran the handler again (`{handled: 2}`). So the dedupe window equals retention.
- 08b: `Object.keys(ClusterCron)` is `["CurrentScheduledTime", "make"]`, so no cron entity to point retention at. Docs (source comment) say not to use retention on workflow or cron entities because they rely on stored replies.
- Verdict: PARTIAL (works for receipts; no void/claim states).

### SPK-01-09 Failure modes

- Tested (`failure-modes.spike.test.ts`, SQLite):
  - 09a: capacity 1, concurrency 1, handler busy 1.5s, 5 concurrent non-persisted calls: 1 succeeded, 4 failed with `MailboxFull`.
  - 09b: duplicate persisted primaryKey during the first run: no `AlreadyProcessingMessage` to the caller; second call returned `ok:k` after about 1.1s.
  - 09c: two runners with `Runners.layerNoop`, non-persisted sends from B for 10 entities: 6 succeeded, 4 timed out at 1.5s (no error). These were remote shards.
  - 09d: persisted send for an entity type no runner registered: no error, timed out after 2s, 1 unprocessed row remained in `cluster_messages`.
- Source (not tested directly): `Runners.makeNoop` fails sends with `EntityNotAssignedToRunner`, and the client retries internally. This is consistent with 09c (inference that the hang is that retry loop).
- Verdict: PARTIAL. Only `MailboxFull` was observed at the caller. `EntityNotAssignedToRunner` and `AlreadyProcessingMessage` were not provoked as caller-visible errors.

## 4. Surprises and gotchas

- A defect in a persisted handler restarts the entity and retries indefinitely with the default policy; the caller waits forever (03b).
- A defect in a non-transactional handler keeps earlier writes and retries them (03c).
- Singleton re-runs on rebalance, not only on owner death (04c).
- Default cron after downtime runs the oldest missed slot only (05a), which is neither skip nor latest.
- `skipIfOlderThan` also applies to normal runs that are delayed.
- Persisted sends right after boot can log "No healthy runners available" before registration finishes.
- Non-persisted sends to a remote shard without a real transport hang silently (09c).
- Sends for an unregistered entity type hang silently and leave a pending row (09d).
- Activities that suspend re-run their body (06b).
- Workflow bodies replay several times; non-activity code in the body must be deterministic and cheap (06a: 3 executions).
- Several API names differ from the source checkout (`Digest` vs `Crypto`; `Schema.TaggedError`, not `TaggedErrorClass`, in 4.1.4).

## 5. Missing pieces (what Bridger must build)

1. Receipt state machine. Keep claim/complete/void in a Bridger table written in the same `WithTransaction` handler; use Cluster for delivery and dedupe only (design sketch, inference).
2. Poison and dead-letter handling. Set a bounded `defectRetryPolicy` on entities, and record attempts in a Bridger table, so the caller sees a failure instead of hanging.
3. Cron wrapper. A job registry from the database (one `ClusterCron.make` layer per job at startup, rebuilt on change), a run ledger written inside `execute`, and a "latest" mode that reads `CurrentScheduledTime`, compares with a stored last-run and drops stale slots.
4. Idempotent migration singleton guarded by a migration table, with its own error handling.
5. Failure model and operations: timeouts on every client call, tuned lock expiry and health interval, a real `Runners` transport and `RunnerHealth`.
6. Workflow version convention: version in the tag, keep old handlers until their executions drain, and a check that no suspended execution exists for a tag before removing it.

## 6. Fix and improve list

bridger-spec
- must: define claim/complete/void receipts on top of stored-reply dedupe (02, 08).
- must: write the cluster failure model, including takeover timing and at-least-once handlers (07, 02b; EFFECT-V4 E37).
- must: state that transactional commands require business writes through the same `SqlClient` (03).
- should: workflow version-in-tag convention and drain rule (06c).
- should: map `catchUp` all/latest/skip to concrete cron options (05).

bridger-code
- must: bounded defect retry plus dead-letter for persisted handlers (03b).
- must: timeouts on all entity client calls (09c, 09d).
- must: idempotent, DB-guarded migration singleton (04).
- must: re-run these spikes on a real Postgres server with a real runner transport (01, 07).
- should: cron registry, run ledger and "latest" wrapper (05).
- should: tune `shardLockExpiration` and `runnerHealthCheckInterval` (07).
- nice: retention only on receipt entities (08).

effect-upstream
- should: cron "latest" catch-up option and a way to pause or remove a cron (05).
- should: surface a caller-visible error or cap for repeated defects (03b).
- nice: surface unroutable or unregistered entity errors instead of silent waits (09c, 09d).

qadi, awthaq: none from this area.

## 7. Not verified

- Real Postgres, MySQL, SQL Server: needs a server and the same suite pointed at it. This is the most important gap because advisory-lock behaviour differs from PGlite.
- `SocketRunner` or `HttpRunner` transport, `RunnerHealth.layerPing` and K8s health: needs real sockets between processes.
- Default-timing takeover (35s lock, 60s health): needs a 2-minute test with default config.
- Workflow on PGlite or Postgres, with two runners, and a v1 execution with no v1 handler.
- Defect retry with an explicit `defectRetryPolicy` limit, and what the caller then sees.
- `EntityNotAssignedToRunner` and `AlreadyProcessingMessage` as raw errors: needs direct `Sharding.notify` calls with hand-built incoming messages.
- Cron removal while a message is pending; cron with timezone; cron on two runners at once.
- Retention interaction with workflow entities (only documented).
- Load, throughput and large payloads.

## 8. Reproduction notes

- `cd spikes && npx vitest run 01-cluster` (add `--reporter=verbose` to see the printed JSON for each ID, for example lines starting `05b` or `07`).
- Tests use real clocks and ports as labels only (34431, 34432); no sockets are opened.
- Timing-sensitive tests: cron (aligned to wall-clock phase), takeover (about 3s), singleton 04c (about 10s). A heavily loaded machine may need larger sleeps.
- `tx.spike.test.ts` and `workflow.spike.test.ts` carry `@ts-nocheck` for loose Effect environment types; runtime assertions are unaffected.
- Do not run `npm install` in the spikes root; dependencies are already installed.
