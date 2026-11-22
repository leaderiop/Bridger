# Readiness spikes: Effect v4.1.4, qadi and awthaq against Bridger

Detailed findings from the readiness spikes in `spikes/` (repo root). Run on 2026-11-14. Back to [docs/resources](../effect-cluster/README.md) for the earlier Effect research notes.

The question: **is Effect v4.1.4, together with qadi and awthaq, ready to build the Bridger ecosystem on, and what is missing?** The spikes are throwaway code. They evidence nothing in the specification and are not product code.

## Result

**Start, in stages.** Nothing found blocks the Bridger core or the ERP layer. Several pieces must be built before the layers that depend on them, and Cluster should wait for its failure model (E37).

The check that mattered most passed: Cluster's message transaction joins a caller's outer `SqlClient.withTransaction` (SQLite and PGlite), so a business write and a persisted message commit or roll back together.

| Stage | Start | Gate before moving on |
|---|---|---|
| 1. Core | Move the prototype pin to 4.1.4 (340 of 340 tests pass unchanged). Build the lease module. | Lease module with `WouldDeadlock` and `HeldPlugins` |
| 2. Foundations | Canonical JSON, `Secret`, `Money`, schema version registry, SQL stores, receipt fencing, tenant-aware repository | Conformance vectors; fencing test |
| 3. HTTP and trust | `@bridger/http` registry, audit sink, role and company tables, N-of-M signing | Drain timeout; chain with gapless sequence and anchor |
| 4. Cluster | Scheduler first | Failure model ADR and a real Postgres run |

## Files

| File | Contents |
|---|---|
| [01-cluster.md](01-cluster.md) | Entities, Singleton, ClusterCron, workflows, SQL storage, failover, transaction join |
| [02-sql-persistence.md](02-sql-persistence.md) | Transactions, receipts, event-store pattern, Migrator, SqlModel, PersistedQueue, rate limiter |
| [03-schema-config.md](03-schema-config.md) | Upcasting, SchemaRepresentation, JSON Schema, Model, SchemaBinary, Redacted, Config, money, canonical JSON |
| [04-http-mcp-cli.md](04-http-mcp-cli.md) | HttpApi, runtime route registry, shutdown, HttpClient, MCP, CLI, Atom |
| [05-platform-packaging.md](05-platform-packaging.md) | Signals, ChildProcess, FileSystem, Tar and Zip, hostile input, parsers, OpenTelemetry |
| [06-crypto-rpc-eventlog.md](06-crypto-rpc-eventlog.md) | Keyring, signatures, audit chain, Rpc, EventLog against the durable bus, HashRing, Cron |
| [07-core-primitives.md](07-core-primitives.md) | Prototype upgrade, ScopedRef, leases, PubSub, Layer, Scope, fibers |
| [08-qadi.md](08-qadi.md) | qadi against Bridger access and entitlement |
| [09-awthaq.md](09-awthaq.md) | awthaq against Bridger identity and the plugin model |
| [backlog.md](backlog.md) | Everything to build, fix or improve, grouped by owner with priority |
| [risks.md](risks.md) | Cross-cutting hazards and what was not verified |
| [decisions.md](decisions.md) | Decisions the findings force, with a recommendation each |

The code and the short per-area tables live in `spikes/NN-*/` (`RESULT.md` and `*.spike.test.ts`). `spikes/FINDINGS.md` is the one-page summary.

## Method

- **Workspace.** `spikes/` is one npm package on `effect@4.1.4` with `@effect/platform-node`, `@effect/sql-sqlite-node`, `@effect/sql-pglite`, `@effect/sql-pg`, `@effect/opentelemetry` and `vitest@5`.
- **Source of truth.** The installed npm package, not the `../effect` checkout (4.0.1, which lacks Tar, Zip, Csv, Json5, Xml and the crypto modules).
- **Characterization tests.** A spike asserts what actually happens. A capability that does not exist is recorded as a GAP with a test asserting the negative behaviour.
- **Verdicts.** READY (works as needed), PARTIAL (works with a written-down caveat), GAP (Bridger must build it), BLOCKED (could not be tested here).
- **Owners.** `bridger-spec`, `bridger-code`, `effect-upstream`, `qadi`, `awthaq`.
- **Sibling repos.** `../qadi` and `../awthaq` were read only. Spikes import their sources by path and alias `effect` to the workspace copy.
- **Suite.** 70 files, 394 tests, all passing. `tsc --noEmit` reports 19 errors, all in `../qadi` sources (a `toSorted` lib target), none in the spikes.

## Scope notes

- Cloudflare is not a Bridger requirement and is out of scope. It was never tested. `@effect/platform-cloudflare@4.1.4` exists on npm but was not installed.
- A real Postgres server was not available. PGlite has a single connection, so row locking, `SKIP LOCKED` and concurrent commit ordering are untested.
- Several spike files carry `@ts-nocheck` where sibling-repo types bind a second effect copy or layer typing was too noisy. Their assertions are real.
