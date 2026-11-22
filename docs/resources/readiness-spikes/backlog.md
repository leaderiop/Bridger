# Backlog: what to build, fix and improve

Grouped by owner. Priority: **must** (blocks a stage or is a safety hole), **should** (needed for a credible first release), **nice**. The ID is the spike that produced the item; see the area file for evidence.

## bridger-code

| Item | Priority | Spike |
|---|---|---|
| Lease module: gate flag, holder counter, idle signal, revoke broadcast, `WouldDeadlock`, `HeldPlugins`, inherited scoped leases. Do not use `ScopedRef`, `RcRef` or `LayerMap` as leases | must | 07-01..07 |
| `Secret` wrapper that always sets `disallowJsonEncode` (a `Redacted` field encodes plaintext to JSON by default) | must | 03-06 |
| Receipt fencing: owner column and `WHERE owner = me` on complete; claim, complete, void in Bridger tables | must | 02-02, 01 |
| Poison-message policy: set `defectRetryPolicy`, add dead-letter handling for defects in persisted handlers | must | 01-03 |
| Archive entry validator with size and count caps, sorted bundler, `packageDigest` | must | 05-04, 05-06 |
| Symlink-safe path resolve: re-check with `realPath` after `resolveWithin` | must | 05-03d |
| External runtime for untrusted plugins (no sandbox in `ChildProcess` or `new Function`) | must | 05-02e, 05-09b |
| Single effect copy: enforce one copy at install and type level for qadi and awthaq | must | 08, 09-01..02 |
| Safe defaults: Ndjson `maxLineBytes`, `forceKillAfter` on every kill, shutdown timeout, no YAML for untrusted input, reject `__proto__` keys | must | 05-02c, 05-07 |
| Resilient HTTP client factory: `times` on rate limiting, `filterStatusOk`, verified ordering | must | 04-05 |
| Audit sink: redact the resource, RFC 8785 canonical form, deterministic record id, hash chain with gapless sequence, anchor, transactional write; detect tail deletion | must | 06-07, 08-05, 09-19 |
| Canonical JSON (RFC 8785); a ~20-line version passed the RFC 3.2.3 vectors | must | 03-10, 06-08 |
| `@bridger/http` registry: catch-all route, per-plugin scope and auth, drain timeout, merged OpenAPI | should | 04-02b |
| Role and permission registry tied to plugin generations; rebuild the subject on a generation change | should | 08-02 |
| `@bridger/entitlement`: reserve, commit, release, entitled stream, in-flight revocation | should | 08-06 |
| `Money`: currency, allocation, string-only constructor; ban `fromNumber` and `scale()` | should | 03-08 |
| Schema version registry with a typed future-version error | should | 03-01 |
| `defineCheck` helper emitting annotation plus reviver for catalog checks | should | 03-02 |
| Plugin field ownership and collision guard | should | 03-04 |
| `bridger_jobs` as its own table: tenant, priority, per-key serialization, replay of failed rows, cancel, lease extension | should | 02-06 |
| SQL `RateLimiterStore` and `CircuitBreakerStore`; budget reserve, commit, refund ledger | should | 02-07 |
| Tenant-aware repository: tenant predicate and transaction-local setting | should | 02-09 |
| Durable bus with per-(origin, stream) sequence and a hybrid logical clock | should | 06-16..20 |
| Keyring store with rotation and shredding bookkeeping; authenticated key distribution | should | 06-03, 06-09 |
| N-of-M signature aggregator | should | 06-05 |
| RPC deadline wrapper, version negotiation, idempotency key, one unknown-outcome error | should | 06-11..13 |
| Cron job ledger, dynamic registry, `catchUp` (all, latest, skip), `onDstOverlap` per job | should | 01-05, 06-28..29 |
| Latest-wins coalescing for snapshot streams | should | 04-10, 07-12 |
| Per-tenant concurrency cap | should | 07-24 |
| Uniform RFC 9457 error mapper; SSE reconnect helper; tracer layer | should | 04-03, 04-07, 04-06 |
| `@bridger/mcp` auth and visibility policy; tool removal | should | 04-08 |
| `atomicWrite` with startup `.tmp` sweep | should | 05-03a |
| Company, grants, selected-company, key-to-tenant binding tables; offline terminal login; JWKS push; revocation feed | should | 09-21..22, 09-10..12 |
| Shared SQL rate-limit store for awthaq's per-process limiter | should | 02-07, 09-17 |
| Feed `HashRing` sha-derived ids, never plain sequential names | should | 06-21..22 |
| Wrap client calls and Rpc calls in timeouts; tune lock-expiry and health intervals | should | 01-07, 06-11 |
| `BeginTransaction="BEGIN IMMEDIATE"` for SQLite migrations; idempotent migrations | should | 02-04 |
| `afterCommit` for relay and ack | should | 02-01, 02-03 |
| Lint rules: patterns without the `u` flag, `fieldId` reuse | nice | 03-03, 03-05 |
| Explicit `timeToLive` on resolver caches; never share a memo map across activations; new runtime or scope on plugin retry | should | 07-16, 07-22 |
| Real Postgres CI run for transactions, outbox ordering, `SKIP LOCKED`, RLS | must (before release) | 02, 01 |
| Install `@effect/sql-sqlite-node` where awthaq SQL is used; add OTel peer packages | nice | 09-06, 05-08a |

## bridger-spec

| Item | Priority | Spike |
|---|---|---|
| Receipts live in Bridger tables with fencing; Cluster only dedupes and delivers. State the same-`SqlClient` rule for `WithTransaction` | must | 01-03, 02-02 |
| Write the Cluster failure model (E37): lock expiry, rolling upgrades, slow-runner overlap, config drift. Record measured takeover (2.9 s with 2 s expiry; defaults imply roughly 35 to 95 s, not measured) | must | 01-07 |
| `bridger_jobs` is its own table; note that "no advisory lock" is accurate but Postgres serializes migrations through the ledger table lock | should | 02-04, 02-06 |
| Host bus uses sliding or dropping, never bounded | should | 07-10 |
| Specify `WouldDeadlock` and `HeldPlugins` on a Context key | should | 07-07 |
| Config rules: `withDefault` not `orElse`; always `constantCase` for env; `SchemaBinary` default mode with `fieldId` for durable frames; `StructWithRest` to keep unknown fields; a `Model` update variant has no id | should | 03-05, 03-07 |
| Money rules: ban `BigDecimal.fromNumber` and `scale()` | should | 03-08 |
| HTTP: `/plugins/<id>` prefix rule; OpenAPI 3.1.0 only; meaning of an empty credential; MCP auth contract | should | 04 |
| Versioned workflow tags (`Order@1`); state which cron catch-up modes are native (all, skip) and which are built (latest) | should | 01-05, 01-06 |
| Choose `onDstOverlap` per job | should | 06-28 |
| Durable bus: per-(origin, stream) sequence; EventLog is for offline sync only | should | 06 |
| Identity: awthaq is one plugin per `Auth.make` tuple; keys travel in the signed manifest; entitlement depends on qadi one way only | should | 09-03, 08-06 |
| Refresh stale facts: `ERP-ACCESS` §9 (qadi pin), `ERP-IDENTITY` (says 2FA, magic link and SAML unavailable; cites old `effect-auth` path), prototype pin 4.0.0 to 4.1.4 | should | 08-01, 09 |
| Untrusted plugins run in an external runtime; loader ADR-005 stands | must | 05-02e |

## effect-upstream

| Item | Priority | Spike |
|---|---|---|
| `Redacted` JSON encoding deny-by-default | must | 03-06 |
| `HttpRouter` and `McpServer` remove API; duplicate-route detection at `HttpRouter.add` | should | 04-02c, 04-08, 09-08 |
| Default cap on 429 retries in `withRateLimiter` | should | 04-05b |
| Cron `latest` option; poison-message handling in Cluster | should | 01-05, 01-03 |
| Typed missing-row error in `SqlModel`; document that the id must be in the update variant | should | 02-05 |
| Reserve and refund in `RateLimiter`; SQL stores for it and `CircuitBreaker` | should | 02-07 |
| HPKE in the crypto modules; a stronger `HashRing` hash | nice | 06-09, 06-22 |
| Fix the misleading "Missing key" error in `SchemaBinary` on a type mismatch | nice | 03-05 |

## qadi

| Item | Priority | Spike |
|---|---|---|
| Validate `:` in permission segments at runtime (type-only today) | should | 08-02 |
| Resource redaction option on the audit sink | should | 08-05 |
| Column-alias map for `compileSql`; a way to take a row predicate from a policy that also has fields | should | 08-04 |
| Document `x.*` over arrays (the field drops) | should | 08-02 |
| Publish a 4.1.4 test matrix; load a single effect copy from `@qadi/audit` | should | 08-01 |
| Make `vitest` run inside `packages/core`; newer `lib` target (the `toSorted` type errors) | nice | 08-08 |

## awthaq

| Item | Priority | Spike |
|---|---|---|
| Boot-time check that fails loudly on a second effect copy (today the first request returns an empty silent 500) | must | 09-01 |
| Chainable `SubjectResolver` (a Bridger override and the `Roles` plugin cannot be installed together) | should | 09-15 |
| Route prefix option; startup duplicate-route detection | should | 09-08 |
| Stale-if-error in the lite verifier; `jti` revoke on session end | should | 09-10..12 |
| Monotonic sequence on audit events; export the host ports | should | 09-19 |
| API keys bound to tenant and company, not scopes only | should | 09-22 |
