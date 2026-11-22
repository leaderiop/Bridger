# Spike 02: SQL and persistence

Findings from running real code against Effect 4.1.4 on SQLite and PGlite. Items marked "Observed" come from a passing characterization test. Items marked "Source" were read from effect source or docs and not executed. Items marked "Inference" are my reading, not tested.

## 1. Purpose and scope

Question: can the transactional and persistence patterns Bridger specifies be built on `effect/sql` and `effect/persistence`, and what must Bridger build itself?

Bridger needs and spec references covered:

- Transactions and savepoints (`docs/ERP-STORAGE.md` transaction model; event-store `StoreTransaction`).
- Command receipts: claim, write, complete, takeover, void (`references/command`, BEH-CM-041, `CommandReceipts`).
- Event store append with expected version, transactional outbox and relay, receiver inbox (`references/event-store`, `references/durable-bus`, `references/sequence`).
- Migrations (`docs/ERP-STORAGE.md` section 7).
- Model repositories (`docs/ERP-MODELS.md`).
- Durable job queue `bridger_jobs` (`docs/ERP-BUSINESS.md`).
- Rate limiting and circuit breaking.
- Dialect matrix, LISTEN/NOTIFY for desired-state push, multi-tenancy (`docs/ERP-STORAGE.md` isolation).

Out of scope: Cloudflare/D1 at runtime.

## 2. Environment and method

- effect 4.1.4, `@effect/sql-sqlite-node` 4.1.4 (node:sqlite), `@effect/sql-pglite` 4.1.4 over `@electric-sql/pglite` 0.5.16, `@effect/sql-pg` 4.1.4 (import only), vitest 5, Node 22+.
- Dialects: sqlite in-memory and file; PGlite in-memory. Most tests run on both via a `for (const d of dialects)` loop.
- Run: `cd spikes && npx vitest run 02-sql-persistence` (8 files, 65 tests, about 11 s; the two-process migrator test is the slowest).
- Method: tests assert actual behaviour. Where Bridger's need is not met the test asserts the negative.

File map (all under `spikes/02-sql-persistence/`):

| File | Content |
|---|---|
| `util.ts` | Dialect layers and a `run` helper (fresh in-memory DB per test) |
| `t1.spike.test.ts` | SPK-02-01 transactions |
| `t2.spike.test.ts` | SPK-02-02 receipts on plain SqlClient; 02b PersistedCache as receipt store |
| `t3.spike.test.ts` | SPK-02-03 event store, outbox, relay, inbox; two sqlite connections |
| `t4.spike.test.ts` | SPK-02-04 Migrator, concurrent runners, guards |
| `mig-runner.ts` | Child process used by t4 (one migrator run against a shared sqlite file) |
| `t5.spike.test.ts` | SPK-02-05 Model and SqlModel |
| `t6.spike.test.ts` | SPK-02-06 PersistedQueue SQL store |
| `t7.spike.test.ts` | SPK-02-07 RateLimiter and CircuitBreaker |
| `t8.spike.test.ts` | SPK-02-08 dialect matrix, LISTEN/NOTIFY, afterCommit; SPK-02-09 tenancy hooks |
| `RESULT.md` | Verdict table |

Limits:

- PGlite has one connection. Its "concurrent" tests show serialization by the connection mutex. They do not test Postgres row locks, `SKIP LOCKED` or lock contention across connections.
- No Postgres server was available, so real multi-connection Postgres behaviour is BLOCKED.
- Six test files start with `// @ts-nocheck` (loose layer typing); runtime assertions are unaffected.
- The installed `effect@4.1.4` dist is newer than the checkout at `../../effect`. Where they differ (queue lock tokens, `delay`), the dist behaviour was tested and reported.

## 3. Findings

### SPK-02-01 withTransaction. Verdict: READY

Need: atomic business write plus receipt/outbox in one transaction; rollback on any failure including interruption.

Tested (t1, both dialects):

- Observed: commit persists; `Effect.fail` and `Effect.die` inside the transaction roll back.
- Observed: interrupting a fiber blocked inside a transaction rolls it back, and the connection is usable afterwards.
- Observed: nested `withTransaction` uses savepoints. A caught inner failure rolls back only the inner work; an outer failure after a committed inner savepoint rolls back both.
- Observed: 10 fibers each doing read, sleep 2 ms, update on one counter finished at exactly 10. Transactions do not interleave on the single connection.
- Observed (t8): `sql.afterCommit(effect)` runs after commit and never on rollback. Source: `SqlClient.BeginTransaction` reference lets a top-level transaction start with another statement (for example `BEGIN IMMEDIATE`).

Evidence: t1 "commit, rollback on failure, rollback on interruption", "nested withTransaction uses savepoints", "concurrent fibers serialize"; t8 "afterCommit runs after commit only".

Caveat: single connection only; a pool (pg) is untested here.

### SPK-02-02 Command receipts on SqlClient. Verdict: PARTIAL

Need: claim, business write and complete in one transaction; expired claim takeover; void; duplicate key returns stored outcome.

Tested (t2): a `receipts(partition, command, key, state, outcome, expires_at)` table keyed on the triple. Claim is `INSERT ... ON CONFLICT DO NOTHING RETURNING`, then an `UPDATE ... WHERE state='claimed' AND expires_at < now` for takeover, then a read for completed or voided.

- Observed: a handler failure inside the same transaction removes the business row and the claim; a retry re-runs cleanly.
- Observed: a second dispatch with the same key returns `Completed` with the stored outcome and does not re-run the handler (one business row).
- Observed: a live claim returns `InFlight`; after expiry the claim is taken over (`takeover: true`); a completed receipt is never taken over; partitions are independent; a voided receipt returns `Voided`.
- Observed (characterized hole): after takeover by B, the stale owner A can still call `complete`, because the UPDATE has no owner predicate. The stored outcome becomes A's.

Caveat: claim time is passed in as a parameter here; production should use DB time. Inside one transaction, a claim held until commit is invisible to others on pg, so cross-replica contention is resolved by the unique key (inference; not tested on real pg).

### SPK-02-02b PersistedCache as receipt store. Verdict: GAP

- Observed: `PersistedCache` over `Persistence.layerSql` caches the Exit by key. A repeat get does not re-run the lookup, and a failure Exit is cached too (lookup ran once for two failing gets).
- Observed: two cache instances over the same SQL store (two replicas), started concurrently, both ran the handler (runs = 2).
- Missing: claim, single-flight across replicas, takeover, void, joining the caller's business transaction, state-based rather than TTL-based expiry.

### SPK-02-03 Event store, outbox, inbox. Verdict: READY as a pattern, PARTIAL as proof

Tested (t3): `events(stream, version, type, PK(stream, version))` and an `outbox` with an identity id, appended in one transaction.

- Observed: append with a wrong expected version fails `WrongExpectedVersion`; the store is unchanged.
- Observed: 20 concurrent writers (read version, sleep, append, retry on `WrongExpectedVersion`) on both dialects produced contiguous versions 1..22, with conflicts occurring.
- Observed: a blind duplicate `(stream, version)` insert is rejected by the database (UniqueViolation/ConstraintError).
- Observed: a rolled-back append leaves no outbox rows. The relay query (`id > cursor ORDER BY id`) returned C1,C2,C3,D1,C4 in commit order.
- Observed: receiver inbox with a per-stream watermark: applied in order; redelivery of an old version is `duplicate`; a jump is `gap` and not applied; a failure before commit leaves the watermark unchanged, so redelivery applies it. This is the durable-bus "ack only after commit" rule.
- Observed (sqlite, two separate connections to one file, 4 racing appenders on expected version 0): exactly one succeeded; the others got `WrongExpectedVersion`. Versions = [1].

Caveat: PGlite cannot show real pg concurrency. Inference: on pg with several connections, outbox identity ids can commit out of order, so a cursor `id > last` can skip a row that commits later. See section 5.

### SPK-02-04 Migrator. Verdict: PARTIAL

Tested (t4):

- Observed: migrations run in id order, ledger rows recorded, a second run returns `[]`, a newly added migration id 3 runs alone.
- Observed: a failing migration (id 2) rolls back the whole run including migration 1's DDL and the ledger rows, on both dialects (transactional DDL). The failure surfaces as a defect containing `MigrationError` kind `Failed`.
- Observed: two runners on one client: one applied 2, the other 0; each body ran once.
- Observed: two runners on two sqlite connections in ONE process: the loser failed with `SqlError` `LockTimeoutError` (errcode 5) after the 5 s busy timeout, and the body ran once. Cause (inference): the synchronous node:sqlite driver blocks the thread while waiting, so the lock holder in the same thread cannot finish. This is a test artifact of one process, not product behaviour.
- Observed: two OS processes on one sqlite file (`mig-runner.ts`), with and without `SqlClient.BeginTransaction = "BEGIN IMMEDIATE"`: exactly one reported `ok:1`, the other `ok:0` (treated as already done). Note the value must be the full statement; `"IMMEDIATE"` alone gave a SQL syntax error.
- Source: on pg, the run transaction executes `LOCK TABLE <ledger> IN ACCESS EXCLUSIVE MODE`. A concurrent insert conflict is mapped to `MigrationError` kind `Locked` and swallowed as "nothing to do". `docs` saying "no advisory lock" is accurate, but pg is serialized by a table lock. Not run on a real server.
- Observed (in-process guard): a `Semaphore(1)` around `run` gave results [2,0,0] for three callers.

Missing: per-module ledger, checksums, expand/contract rules, resume and journal per ERP-STORAGE section 7; Effect's Migrator records only id and name.

### SPK-02-05 Model and SqlModel. Verdict: PARTIAL

Tested (t5):

- Observed: `Model.Class` variants: insert omits `GeneratedByDb` fields; json omits `Sensitive` fields.
- Observed: `makeRepository` insert/update/findById/delete work on both dialects; insert and update return the row via `RETURNING *`. Source: mysql uses a second select.
- Observed: with `softDeleteColumn`, `delete` writes `CURRENT_TIMESTAMP`; afterwards `findById` and `update` treat the row as missing while the row stays. The stored value is a text string `2026-11-14 04:49:21` on sqlite and a `Date` on pg.
- Observed (SPK-02-05b): if the id is `Model.GeneratedByDb(...)`, the update variant has no id and `repo.update` fails (NoSuchElementError). The working declaration is `Model.Field({ select, update, json })`.
- Observed: `update` of a missing or soft-deleted row dies (defect), not a typed error.
- Observed: the repository exposes only insert, insertVoid, update, updateVoid, findById, delete. No list, query, count, tenant filter or version predicate.

### SPK-02-06 PersistedQueue SQL store. Verdict: PARTIAL

Tested (t6, `layerStoreSql` with `PersistedQueue.layer`):

- Observed: offer with an existing id is ignored; take completes the row to state `completed`.
- Observed: with `maxAttempts: 2` and `Schedule.spaced("1 second")`, two failing takes leave state `failed`, attempts 2, `last_failure` containing the error text. The retry waits on `visible_at` using the database clock in whole seconds.
- Observed (crash simulation by writing an old `acquired_at` and a foreign `acquired_by` directly): the row is re-taken with attempts incremented (1 to 2). A row with a fresh foreign lock is not taken.
- Observed: a row with attempts at max and an expired lock is flipped to `failed` by a sweep. The sweep runs on `lockRefreshInterval` (default 30 s); with 100 ms it ran within 500 ms.
- Observed: `delay: "1 hour"` is honoured (not taken within 700 ms; row stays pending).
- Observed: a re-offer of an id after its first element completed did not create a second row (count 1), on both dialects.
- Observed: `offer` inside `sql.withTransaction` joins the caller's transaction: rolled back with it (0 rows), committed with it (1 row).
- Source: pg poll is `UPDATE ... WHERE sequence IN (SELECT ... FOR UPDATE SKIP LOCKED)`; sqlite is a single `UPDATE ... RETURNING`; the installed dist claims rows with a per-poll lock UUID and acks match on that token (fencing); time comes from the DB (`NOW()` / `CURRENT_TIMESTAMP`). Not exercised on a real pg.

Comparison with `bridger_jobs` (spec in ERP-BUSINESS; need list from that document and the task brief):

| Aspect | Bridger `bridger_jobs` need | Effect SQL `PersistedQueue` (observed unless marked) |
|---|---|---|
| Enqueue in caller's transaction | Required | Yes, joins ambient transaction |
| Table and columns | `bridger_jobs`, `lease_owner`, `lease_expires_at` | `effect_queue`; `acquired_by`, `acquired_at` (expiry derived from a global `lockExpiration`); own migrations table |
| Claim | skip locked | pg `FOR UPDATE SKIP LOCKED` (source); sqlite single UPDATE |
| Clock | DB clock | DB clock (observed on retry and expiry) |
| Lease length | per job (inference) | one global value per store |
| Lease renewal | worker heartbeat | automatic refresh on an interval for held rows (source) |
| Fencing of stale workers | needed | per-poll lock token in the installed dist (source); not observed with two live workers |
| Retry | `Schedule`-based | Schedule, delay rounded up to whole seconds |
| Dead state | `dead` | `failed` with `last_failure`; no replay API, no dead-letter queue |
| Crash on final attempt | must not loop | swept to `failed`, but only every `lockRefreshInterval` |
| Idempotent enqueue | by key | by id, and also blocks re-offer after completion |
| Tenant or company scope | required | none |
| Priority, per-key ordering | likely (inference) | order is `visible_at, sequence`; no priority, no per-key serialization |
| Cancel, reschedule, extend lease | likely (inference) | not in the API |
| Status/result for UI | likely (inference) | rows queryable by raw SQL only; completed rows removed by `layerCleanup` (source) |

### SPK-02-07 RateLimiter and CircuitBreaker. Verdict: GAP

Tested (t7):

- Observed: fixed-window `consume` with `onExceeded: "fail"`: tokens deducted, an over-limit request fails, the window resets after its duration, keys are independent.
- Observed: `consume` returns `remaining`, `delay`, `resetAfter`, `limit`. The service has only `consume`, `adaptiveConsume`, `adaptiveFeedback`. Source: adaptive feedback learns server rate limits from responses; it is not a cost settlement.
- Observed: reserving 3 of 3 tokens then needing 1 fails; there is no way to return unused tokens. No reserve, commit or release.
- Observed: two independently built limiters on the memory store each granted the same key's single token; the effective limit is N times the limit across replicas.
- Observed: export names show stores `layerStoreMemory`, `layerStoreRedis`, `layerStoreRedisConfig` and `makeStoreRedis` for the limiter, and `layerStoreMemory`, `layerStoreRedis`, `layerStoreRedisConfig` for the breaker. No SQL store.
- Observed: breaker `consecutive(2)` opens after two failures, rejects without running the effect, after `openDuration` a probe success closes it; other keys unaffected.
- Source: both stores are Context services, so a custom store is possible. Its interface was not implemented in this spike.

### SPK-02-08 Dialect matrix and LISTEN/NOTIFY. Verdict: PARTIAL

- Observed: `sqlite-node` and `pglite` clients run in-process (driver names `sqlite-node`, `pglite`).
- Observed: `@effect/sql-pg` `PgClient` imports; connecting to a closed port fails as a typed `SqlError` within the 1 s timeout. No server run.
- Observed: `@effect/sql-d1` is not installed; the dynamic import fails. D1 is BLOCKED at runtime and out of scope.
- Observed: PGlite `listen(channel)` returns a queue; `notify` delivers payload `v1`. `pg_notify` inside a rolled-back transaction is not delivered; inside a committed one, `v2` is delivered.
- Observed: the sqlite client has no `listen`.
- Note: the PGlite listener must be scoped inside the client's scope, otherwise the unlisten on release fails with "PGlite is closed".

### SPK-02-09 Multi-tenant. Verdict: GAP

- Observed: `Statement.CurrentTransformer` (a Context reference) receives each statement and may return a replacement; a transformer recorded both statements run, and another wrapped a select and still returned the right row.
- Observed (pglite): schema-per-tenant isolation works with `select set_config('search_path', t, true)` as the first statement in a transaction; identical table names in `t1` and `t2` held separate rows.
- Source: `SqlClient` offers `withoutTransforms` and name transforms only; no tenant filter, no RLS helper.
- Not tested: Postgres row-level security (PGlite runs as superuser).

## 4. Surprises and gotchas

1. `Model.GeneratedByDb(id)` drops the id from the update variant, so `makeRepository.update` fails; this is only visible by running it.
2. `SqlModel.update` on a missing row is a defect, not a typed error.
3. Installed dist and the sibling source checkout differ for the queue; read `node_modules/effect/dist`, not `../../effect`.
4. The Effect queue's `delay` and lock tokens exist in 4.1.4, but retry delays and expiry are rounded to whole seconds.
5. Completed ids block re-offer of the same id.
6. Orphaned-lock sweep for exhausted rows defaults to 30 s.
7. `BeginTransaction` takes the whole statement (`"BEGIN IMMEDIATE"`).
8. Two sqlite connections in one Node process cannot wait on each other's lock; use separate processes to test.
9. Soft delete writes a string on sqlite and a timestamp on pg.
10. The stale-owner `complete` hole in a naive receipt table.
11. `Migrator` run failure is a defect, not a typed failure.
12. The vitest console output for passing tests is hidden unless `--disable-console-intercept` is passed.

## 5. Missing pieces and design sketches

- Receipt fencing. Add `owner` (uuid per claim) and `attempt` columns. Claim and takeover return the owner. `complete`, `release`, `void` use `WHERE ... AND owner = :me`, and zero rows updated means `ClaimLost`. Use DB time for `expires_at`. Keep claim and complete in the business transaction. A takeover that finds `claimed` but expired must also decide whether the previous attempt may have committed; with claim, write and complete in one transaction that cannot happen (inference).
- SQL stores for RateLimiter and CircuitBreaker. Implement the store Context service on one table keyed by `(key)` with window start, counters, and breaker state plus generation, updated with one conditional UPDATE per call. Add a budget ledger table (`reserved`, `committed`, `expires_at`) with `reserve`, `commit(actual)`, `release` for agent budgets.
- Tenant-aware repository. Generate repositories from the Bridger model compiler on `SqlClient` and `SqlSchema`: always add `tenant_id = :t` to reads and writes, set a transaction-local setting (`set_config('bridger.tenant', t, true)`) in `withTransaction` for pg, and back it with RLS in production. Optional `CurrentTransformer` as a safety net that rejects statements without the tenant predicate (inference).
- Outbox relay ordering. Do not trust identity order across concurrent commits on pg. Options: relay only rows older than the oldest in-flight transaction (`pg_snapshot_xmin`), or assign a per-stream version and let the relay track per-stream watermarks, or take a short advisory lock when allocating outbox sequence numbers. Pick one in the spec.
- `bridger_jobs`. Either implement the table as specified in ERP-BUSINESS with a claim query modelled on the Effect SQL store, or wrap `PersistedQueue` and add the missing columns; use `PersistedQueue` only for fan-out.
- Migrator single-flight: sqlite `BEGIN IMMEDIATE`, pg ledger lock (exists), one connection per process for sqlite.

## 6. Fix and improve list by owner

bridger-spec

- must: receipt claims carry an owner and completion is fenced (SPK-02-02).
- must: state the outbox relay ordering rule for concurrent commits (SPK-02-03).
- must: keep `bridger_jobs` as its own table with Bridger columns; do not equate it with `effect_queue` (SPK-02-06).
- should: note that the Migrator is pg-serialized by a table lock and needs `BEGIN IMMEDIATE` on sqlite (SPK-02-04).
- should: state the LISTEN/NOTIFY fallback (poll) for sqlite (SPK-02-08).
- should: define tenancy enforcement (predicate plus tx-local setting plus RLS) (SPK-02-09).

bridger-code

- must: dedicated receipt table via SqlClient, not `PersistedCache` (SPK-02-02b).
- must: shared SQL store for RateLimiter and CircuitBreaker; budget reserve/commit ledger (SPK-02-07).
- must: tenant-aware repository layer (SPK-02-05, 02-09).
- should: use `afterCommit` for relay nudge and bus ack (SPK-02-01).
- should: use `Model.Field({select,update,json})` for ids; add list and optimistic version predicate (SPK-02-05).
- should: Postgres server integration run in CI covering append races, `SKIP LOCKED` queue, migrator and RLS (SPK-02-03, 04, 06).
- nice: sub-second retry delays by owning the job claim query (SPK-02-06).

effect-upstream

- should: typed error instead of a defect for update of a missing row (SPK-02-05).
- should: document that the id must be in the update variant, or make `GeneratedByDb` ids work with `makeRepository` (SPK-02-05).
- nice: reserve/refund on RateLimiter (SPK-02-07); a SQL store for RateLimiter and CircuitBreaker (SPK-02-07).
- nice: let completed ids be re-offered, or document it; per-queue sweep interval separate from lock refresh (SPK-02-06).

qadi

- nice: none required by this area. Inference: a tenant predicate could be emitted through `@qadi/predicate-sql` for the repository layer; not tested here.

awthaq

- nice: none required by this area. Tenant identity for the transaction-local setting would come from the identity layer (inference; not tested).

## 7. Not verified

| Item | What it would take |
|---|---|
| Real Postgres concurrency (OCC races, `SKIP LOCKED` fairness, pool behaviour) | A Postgres server in CI and the same tests pointed at `PgClient` |
| Migrator pg table lock under two connections | Same server; two `PgClient` runners |
| Outbox ordering anomaly on pg | Two connections committing interleaved transactions and a relay reading by id |
| Two live queue workers with fencing | Two processes on one sqlite file or a pg server; check an expired worker's ack is rejected |
| RLS | A non-superuser pg role and policies |
| SQL RateLimiter/CircuitBreaker store | Implementing the store interface and running t7 against it |
| D1 | Out of scope |
| mysql/mssql branches | Not installed; source only |
| Behaviour under pool size above 1 for nested `withTransaction` | pg server |

## 8. Reproduction notes

- `cd /Users/mohammadalmechkor/Projects/Perso/Bridger/spikes && npx vitest run 02-sql-persistence` runs all 65 tests.
- Add `--disable-console-intercept` to see the `[SPK-02-nn ...]` characterization lines (soft-delete value, 2-process migrator output, notification payloads).
- One file: `npx vitest run 02-sql-persistence/t6`.
- t4's two-process tests spawn `npx tsx 02-sql-persistence/mig-runner.ts <file> <default|immediate>` and take about 10 s each.
- t6 retry test waits about 1 to 2 s real time because the DB retry clock has whole-second resolution.
- Timing-based assertions (sleep 400 to 700 ms) can be flaky on a heavily loaded machine.
