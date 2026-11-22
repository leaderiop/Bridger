# Readiness spike 08: qadi authorization

Date: 2026-11-14. Code: `spikes/08-qadi/`. Summary table: `spikes/08-qadi/RESULT.md`.

Convention in this document: "Observed" means a test in `spikes/08-qadi/` ran and asserted it. "Source" means read from qadi's code or specs without a dedicated test. "Inference" means my reasoning, not tested.

## 1. Purpose and scope

This area asks whether qadi can be the authorization layer of Bridger, as proposed in `docs/ERP-ACCESS.md`, and where the boundary with `references/entitlement` lies. It answers eight questions:

1. Does qadi run on effect 4.1.4 (ERP-ACCESS section 9, decision D13)?
2. Can ERP-ACCESS sections 2 to 5 (roles, permissions per module, tenant and company scope, record-level and field-level access) be expressed in qadi, including plugin-contributed permissions that change at runtime?
3. What does evaluation cost, is it deterministic, are tracing spans emitted?
4. Field-level filtering (ERP-RECORDS) and policy-to-SQL pushdown (ERP-ACCESS section 5) on SQLite.
5. Can qadi decisions become `references/audit-chain` entries (ERP-ACCESS section 7)?
6. Where does authorization end and entitlement (quota, budget, licence) begin?
7. Can qadi be provided as a plugin service through a Layer, with lifecycle, error mapping to commands, and offline evaluation?
8. Health of qadi's own test suite and the gaps in its own roadmap.

qadi (`/Users/mohammadalmechkor/Projects/Perso/qadi`, npm `@qadi/*`) is an Effect-native authorization library: permission tokens (`resource:action`), a role DAG, a schema-derived policy ADT (16 variants), one Effect evaluator returning `Allow`/`Deny` with a trace, field visibility, and compilers from policy to a row predicate and then SQL. Packages: core, audit, devtools, http, predicate-prisma, predicate-sql, promise, react, testing. Version 0.12.0 (source and `npm view`).

## 2. Environment and method

- qadi 0.12.0. Peer dependency `effect@^4.0.0` (source `packages/core/package.json`, confirmed by `npm view @qadi/core peerDependencies`). It has no runtime dependencies on effect.
- Spikes workspace: `effect@4.1.4`, vitest 5.1.0, Node 26.
- qadi's own dev copy of effect: 4.1.2 (`packages/*/node_modules/effect`). The dev catalog is `effect: latest` and floats; only the `^4.0.0` peer range is a promise to consumers (source `pnpm-workspace.yaml`).

Single-copy aliasing. The spikes import qadi source by relative path (`../../../qadi/packages/core/src/index.ts`). Those files import `effect/...`, and a plain Node resolution would find qadi's own 4.1.2 copy. Observed: with the spikes root config (`resolve.dedupe: ["effect"]`), vite's `resolveId("effect/Effect", <qadi file>)` returns the spikes copy for core and audit files (checked once with a throwaway script, since removed). `@qadi/audit` imports `@qadi/core` by package name, which resolves through a symlink to `packages/core/lib/` (the `exports` map has `import: ./lib/index.js`). Dual-copy hazard (inference from this resolution path, plus the observed dedupe result): `lib/` code imports effect from qadi's tree, so any runner without dedupe or alias loads two effect copies. qadi's README says a second copy is "a silent type mismatch". At runtime, tags are string-keyed so mixed copies may appear to work, which makes the hazard quiet.

I could not prove at runtime that exactly one copy was loaded; the evidence is the resolver output and the 4.1.4 suite run in SPK-08-08.

Run: `cd spikes && npx vitest run 08-qadi` (35 tests, 8 files, about 6 s).

File map (all in `spikes/08-qadi/`):

| File | Purpose |
|---|---|
| `01-compat.spike.test.ts` | SPK-08-01 |
| `02-access-model.spike.test.ts` | SPK-08-02 |
| `03-eval-perf.spike.test.ts` | SPK-08-03 |
| `04-sql-fields.spike.test.ts` | SPK-08-04 |
| `05-audit.spike.test.ts` | SPK-08-05 |
| `06-entitlement.spike.test.ts` | SPK-08-06 |
| `07-plugin-host.spike.test.ts` | SPK-08-07 |
| `08-health.spike.test.ts` | SPK-08-08 |
| `q.ts`, `q-sql.ts`, `q-audit.ts` | Re-export qadi core, predicate-sql, audit sources by relative path; `q.ts` also exports the `QADI` path constant |
| `vitest.config.ts` | Optional local config: dedupe plus alias of `effect/*` and `@qadi/core` to source |
| `qadi-core-on-4.1.4.config.ts` | Runs qadi's own core tests (root = qadi/packages/core) with `effect` and `@effect/vitest` aliased to the spikes copies |
| `RESULT.md` | Verdict table |

All test files start with `// @ts-nocheck`: qadi source is typed against its own effect copy and my helper wrappers use `any`. `tsc --noEmit` reports nothing for 08-qadi.

## 3. Findings

### SPK-08-01: qadi on effect 4.1.4. Verdict READY

Need: ERP-ACCESS section 9 and D13 require one exact Effect pin per deployment, with qadi moving to it.
Tested: the README quickstart (`enforceProjected` with a role and a field restriction), `decide` deny as a value, `enforce` deny as an `AccessDenied` failure, plus a read of qadi's dependency declarations.
Observed: all pass on 4.1.4 with no source change. Workspace effect resolves to 4.1.4; qadi's own copy is 4.1.2; `@qadi/core` has `peerDependencies.effect = "catalog:peer"` and no dependencies. See also SPK-08-08, where qadi's 2170 core tests pass on 4.1.4.
Evidence: `01-compat`, all three tests.
Caveats: the dual-copy hazard in section 2. ERP-ACCESS section 9 says `@qadi/core@0.8.0` pins `effect@4.0.0-rc.116` exactly; that is stale (0.12.0 uses a peer range, no pin).

### SPK-08-02: model ERP-ACCESS in qadi. Verdict PARTIAL

Need: ERP-ACCESS sections 2 to 5 and 10.
Tested: permission groups per module, a three-role DAG, an owner-plus-scope policy against loaded rows, the same actor in two companies, field projection, a plugin registry that changes at runtime, by-name role graph with a cycle, and translating a scope policy to a predicate.
Observed:
- `createPermissionGroup("sales.order", ["read","write"])` and `role({inherits})` work; `fromRoles` flattens inherited permissions and role names into the subject.
- Owner rule `hasResourceAttribute("createdBy", eq(subjectId()))` ANDed with `companyId`/`tenantId` equal to subject attributes allows own rows and denies others' rows and other companies' rows.
- One subject per (actor, company). With the same subject id for both companies and a `decisionCacheLayer`, results stayed correct (true, false): the cache key is the whole Question (source of this: `DecisionCache` uses a `HashMap<Question, Trace>`; the test shows no leak).
- Field level: `hasPermission(read, {fields:["id","number","lines"]})` then `project` returns exactly those keys. `"lines.*"` over an array of objects returned only `{id}`: the array was dropped.
- Plugin registry: roles are immutable values; a `Ref` of roles that Bridger mutates works if the subject is rebuilt per request. A subject built before deactivation still allows the revoked permission. qadi exports nothing matching register, unregister or RoleRegistry.
- `resolveRoleGraph` on a by-name cycle fails; by-value roles cannot cycle.
- `createPermissionGroup("bad:res", ...)` does not throw at runtime; the colon is rejected only by the `NoColon` type.
- `toPredicate` of the owner-plus-scope policy gives `And[Compare companyId = c1, Compare tenantId = t1, Compare createdBy = alice@c1]` (subject-side parts folded to literals).

Mapping of ERP-ACCESS concepts:

| ERP-ACCESS concept | qadi concept | Fit |
|---|---|---|
| `Access.permissions("todo.task", [...])` | `createPermissionGroup` / `permission` | Clean (wrapper name is proposed; `:` check is type-only) |
| `Access.role` with inherits | `role({permissions, inherits})` | Clean |
| Role DAG | by-value `inherits`, `resolveRoleGraph` | Clean |
| Subject with tenant and company | `fromRoles({attributes})`, `currentSubjectLayer` | Clean (subject id must differ per company for audit clarity; inference) |
| `Access.owner` | `hasResourceAttribute("createdBy", eq(subjectId()))` | Clean (helper is Bridger's) |
| Operation gate | `hasPermission`, `enforce`/`check` | Clean |
| Row policy to SQL | `toPredicate` + `compileSql` | Partial (SPK-08-04) |
| Field policy | `hasPermission(..., {fields})`, `project` | Partial (array wildcard, no query-side guard) |
| Tenant/company scope kept out of qadi | storage adapter | Not qadi; qadi can express it but ERP-ACCESS keeps it in storage |
| Plugin permissions at activation/deactivation | none | None: no registry, no revocation of built subjects |
| Segment `:` rejected at declaration | type-only | Partial |
| Generation-based cache invalidation (ERP-ACCESS section 10) | `decisionCacheLayer()` per build, no invalidate API | None (source: no invalidation method on the cache shape) |
| Error mapping (section 6) | `classifyEnforcementError`, `errorCode` | Clean (SPK-08-07) |

Evidence: `02-access-model` tests "module permissions...", "record-level...", "same actor in two companies...", "field-level...", "plugin-contributed permissions at runtime...", "role DAG...", "scope as a policy translates...".
Caveats: tenant scope as a qadi policy is possible but not what ERP-ACCESS proposes; I only showed it works.

### SPK-08-03: cost, determinism, tracing. Verdict READY

Need: a decision per list row, per command, per catalog entry must be cheap and reproducible; observability via spans.
Tested: 40 modules x 6 permissions, role DAG of depth 3, a five-node policy (tenant, company, role-or-owner, subject attribute exists, not permission), 1k and 10k sequential `decide` calls against distinct rows, after a 500-call warm-up. Determinism: 200 decisions twice, compared on verdict, visible fields and trace, then on evaluation ids with `evaluationIdSequential`. Tracing: a custom `Tracer` capturing span names and attributes, with an attribute resolver port.
Observed: 1000 decisions in 19 ms (about 19 us each); 10 000 in 128 ms (about 13 us each); 3334 of 10 000 allowed. Same inputs give identical verdict, `visibleFields`, trace; with the sequential id layer the ids match as well. Spans: `qadi.evaluate` with `qadi.decision`, `qadi.subject_id`, `qadi.evaluation_id`, `qadi.policy_tag`; `qadi.attribute` with `qadi.attribute`, `qadi.resolved`.
Evidence: `03-eval-perf`, three tests.
Caveats: in-memory ports only, one machine, no concurrency, no real resolver latency; treat the numbers as an upper bound on library overhead, not an SLA. `at` and `durationMillis` are wall-clock and differ between runs.

### SPK-08-04: field filtering and SQL pushdown. Verdict PARTIAL

Need: ERP-ACCESS section 5 (list pushdown, `InvalidQuery{field-not-allowed}`), ERP-RECORDS projection.
Tested: policy to `toPredicate` to `compileSql({dialect:"sqlite"})`, executed on `@effect/sql-sqlite-node` (`:memory:`, 4 rows) and compared with `evaluatePredicate` and with per-row `decide`.
Observed:
- Accepted: `hasPermission` (folds to constant for the subject), `hasRole`, resource attribute comparisons (`eq`, `in`), `not`, `allOf`, `anyOf`, subject-ref values (folded into bound params). Generated text: `("companyId" = ? AND ("createdBy" = ? OR "status" IN (?)) AND CASE WHEN ("status" = ?) THEN FALSE ELSE TRUE END)` with params `["c1","alice","open","archived"]`. DB ids equal the in-memory interpreter and per-row `decide` (ids 1, 2, 4; row 4 passes because that policy scopes company only).
- NULL status row under `not(eq)` agrees between DB and interpreter.
- A policy whose subject-side part is false folds to `False`.
- Refused with `PolicyNotTranslatable` and a reason: any policy with a `fields` restriction ("a predicate selects rows rather than columns"), `hasRelationship` ("keyed by the row's id and cannot fold"), `hasActed` (resource-scoped history), `hasCustom` (opaque logic).
- Hostile column name `id; DROP TABLE orders` refused (`PredicateNotRenderable`); a hostile value is bound as a parameter.
- Dotted column `planning.task.priority` is refused as `UnsafeColumn`. Column names are the resource attribute names verbatim, so there is no mapping to physical columns or joins.
- `visibleFields` is available on the decision (`["id","status","amount"]` in the test) and `project` hides the rest per row. Nothing in qadi checks a filter or sort over a hidden field.
Evidence: `04-sql-fields`, seven tests.
Caveats: SQLite only. `FALSE` literal in the output needs SQLite 3.23 or newer (inference; worked here). A policy mixing row rules and field restriction must be split by the caller.

### SPK-08-05: audit. Verdict PARTIAL

Need: ERP-ACCESS section 7 and `references/audit-chain` (hashable, canonical entries, chain and anchor are audit-chain's).
Tested: `AuditDecisionSinkLive` over `AuditTrailPortTest`, decisions with `evaluationIdSequential`; my own canonicalization (sorted keys) plus SHA-256; a failing trail port.
Observed:
- Entry shape: `{ record, sequenceNumber? }` where `record` has `_tag:"Decision"`, `version:2`, `evaluationId`, `at` (epoch ms number), `subjectId`, `policy` (full policy JSON), `resource` (the full object passed in), `action`, `outcome` (`Decided` with the decision and its trace, or `Failed`).
- The full resource was embedded, including a field `salary: 99`.
- With sequential ids and `at`/`durationMillis` removed, hashes are identical across runs; with default ids (random UUIDs) the records differ.
- `sequenceNumber` is undefined; the package exports no hash, chain, Merkle or anchor symbol (checked by name pattern). It has `verifySequenceIntegrity` (gaps only), retention planning, archive, and a signature ledger.
- A failing port: the decision is still returned (`Allow`), the outcome hook receives `WriteFailed`, and a WARN "audit entry dropped: trail write failed and no staging port wired" is logged.
Evidence: `05-audit`, five tests.
Caveats: my canonicalization is not RFC 8785 (no number normalization). A staging port (`AuditStagingPort`) exists in source and was not exercised, so I cannot say it gives the transactional guarantee ERP-ACCESS wants (inference: it is intended for stage-then-commit).

### SPK-08-06: entitlement vs authorization. Verdict GAP (by design)

Need: `references/entitlement` (Entitlement port with full/grace/read-only/none, gate, entitled stream, `Budget.reserve`, grant narrowing).
Tested: entitlement tier as a live attribute read by a policy; a `remaining >= 1` counter policy; `enforce` over a long effect while the attribute changes; qadi exports and spec text.
Observed:
- State maps: `inArray(["full","grace"])` gates install; `hasAction("read")` with `read-only` allows reads; a lapse is visible on the next decision because the resolver is read per evaluation.
- Quotas do not map: two sequential and two concurrent decisions on `remaining = 1` all allow; nothing decrements. No reserve, commit, release, idempotency.
- `enforce` checks once at start; changing the attribute while the guarded effect runs does not interrupt it (the effect finished).
- Source: qadi's `spec/models/32-ucon.md` calls usage control "the deepest mismatch" and "a second execution model"; core has no Budget, Quota, Licence, Entitle or Meter symbol; the roadmap lists policy storage as not planned.
Evidence: `06-entitlement`, four tests.
Boundary (inference, consistent with qadi's spec): qadi answers "may this subject do this now" from state it reads. Entitlement state can feed it as an attribute. Anything that writes (meters), watches over time (streams, revocation), or narrows captured services belongs to Bridger.

### SPK-08-07: plugin-host integration. Verdict READY

Need: qadi as a Layer-provided service of a Bridger plugin; lifecycle; mapping to command refusal (BEH-CM-011) and `InternalError`; offline and federation.
Tested: a test-local `Authz` service built with `Layer.effect` that adds a finalizer and wraps `enforce`; `Scope` close; two `decisionCacheLayer` builds; error mapping via `classifyEnforcementError`; 200 concurrent requests with alternating subjects; evaluation with `fetch` replaced by a throwing spy.
Observed: acquire logged on build, release on scope close. Two cache builds give distinct instances. Deny maps to `CommandRefused{reason:"access-denied"}`; an `AttributeResolveError` maps to `InternalError`, not a denial; wiring errors (missing action, resource, too-deep policy) classify as `wiringMistake`. 200 concurrent decisions with alternating permissions matched expectations. Core evaluation made no network call. No export matches federat, replicat, syncRoles or RoleStore.
Evidence: `07-plugin-host`, four tests.
Caveats: the `Authz` service and its error classes are my own test code, not qadi's. qadi's own layers hold little scoped state (source: the audit circuit breaker is the main stateful piece), so "release" is mostly Bridger's finalizers.

### SPK-08-08: suite health and roadmap gaps. Verdict READY

Observed: from the qadi repo root, `vitest run` passes 202 files, 4954 tests in about 31 s; `--project core` alone: 65 files, 2170 tests in about 6 s. These ran on qadi's own effect 4.1.2. Running `vitest` from inside `packages/core` fails all 64 files with "Cannot read properties of undefined (reading 'config')"; I did not investigate the cause. With `effect` and `@effect/vitest` aliased to the spikes copies (4.1.4), the 2170 core tests pass. The spike test runs this config as a child process.
Source (roadmap, `spec/roadmap.md`, revision 1.33 dated 2026-10-05, which lags the repo): no blocking items; one planned item (a devtools CLI); not planned: GxP / 21 CFR Part 11, policy storage and administration UI, authentication. The git status of qadi showed untracked and modified `.planning` files before I ran anything; I did not touch the repo.
Evidence: `08-health`, two tests.
Caveats: qadi's mutation, coverage and BDD gates were not run.

## 4. Surprises and gotchas

- A built subject is a frozen snapshot. Revoking a role or deactivating a plugin changes nothing for existing subjects (SPK-08-02).
- `:` in a segment is rejected only at compile time; plugin-supplied strings bypass it (SPK-08-02).
- `fields: ["lines.*"]` on an array drops the array; use `"lines"` (SPK-08-02). Non-terminal `*` is a literal key (source, `FieldPath.ts`).
- `toPredicate` refuses any policy with `fields`; the row and field parts must be separate policies (SPK-08-04).
- Predicate column names are the attribute names verbatim; dotted paths are refused (SPK-08-04).
- Audit records embed the full resource (SPK-08-05).
- A failed audit write never fails the decision and drops the entry unless a staging port is wired (SPK-08-05).
- `evaluationId` defaults to a random UUID, so identical decisions are not byte-identical unless the id layer is replaced (SPK-08-05).
- `enforce` is start-only; no in-flight revocation (SPK-08-06).
- The decision cache has no invalidation call; a new layer build is the only reset. Source (roadmap): piping the cache onto a single `evaluate` caches nothing, since `Effect.provide` builds per execution.
- qadi's tests must be run from the repo root (SPK-08-08).
- Two effect copies are easy to create (section 2).

## 5. Missing pieces and design sketches

All items below are Bridger work; the sketches are proposals, untested except where noted.

1. Role and permission registry tied to plugin generations. A host service holding `Ref<{generation, roles, permissions}>`. Plugin activation adds the plugin's roles and bumps the generation; deactivation removes them and bumps it. A subject is built per request from the registry snapshot and carries the generation as a subject attribute, which makes it part of the decision cache key (the key is the whole Question, observed in SPK-08-02), so cached decisions cannot outlive a generation change as ERP-ACCESS section 10 requires (inference). Provide the registry in the plugin scope so deactivation closes it. Segment validation (`isValidSegment`, exported from core source) runs at load.
2. `@bridger/entitlement`. Entitlement port and adapters, gate on install and replace, `Plugin.Runtime.entitled` stream, `Budget.reserve/commit/release` with idempotent commits, grant narrowing. Integration to qadi is one-way: an `AttributeResolver` exposes the entitlement state, so policies can read it. Nothing in qadi depends on it.
3. Audit adapter. A `DecisionSink` (or `AuditDecisionSinkLive` plus a custom `AuditTrailPort`) that: redacts or hashes `resource` before encode, replaces the evaluation id with Bridger's recordId, chooses which fields are covered (drop `at`, `durationMillis`), canonicalizes per RFC 8785, hands the entry to `HashChainSink`, and writes in the command's transaction. Whether `AuditStagingPort` can carry the transactional part needs a follow-up spike.
4. Query layer. A column mapper from resource attribute path to a physical column or extension-table expression (with `COALESCE` for absent extension rows, ERP-ACCESS section 5 open point 1); a guard that rejects filter, sort, search and aggregate over a field not in `visibleFields` with `InvalidQuery{field-not-allowed}`; the `rowFallback: "load-and-enforce"` path for refused policies; scope and `revision = ?` composed with the predicate fragment (the fragment is plain text plus params, so composition is mechanical, inference).
5. Policy and role distribution for federation and offline. Policies are JSON-codable (source: `toJson`/`fromJson`, depth-guarded), so shipping them over the durable bus is possible; versioning, signing and conflict handling are not provided.

## 6. Fix and improve list by owner

bridger-spec
- should: refresh ERP-ACCESS section 9 and the header (0.12.0, peer range, no pin) (SPK-08-01, 08-08).
- should: state in the entitlement spec that entitlement feeds qadi as an attribute and qadi never depends on it (SPK-08-06).
- must: specify the plugin-generation behaviour for subjects and caches, since qadi offers none (SPK-08-02).
- should: state that the audit entry hashes a redacted record and name the covered fields (SPK-08-05).

bridger-code
- must: registry plus per-request subject build (SPK-08-02).
- must: audit adapter with redaction and canonicalization (SPK-08-05).
- must: query layer with column mapping and hidden-field guard (SPK-08-04).
- must: `@bridger/entitlement` (SPK-08-06).
- must: assert a single effect copy at host start (SPK-08-01).
- should: policy and role distribution (SPK-08-07).
- should: benchmark with real resolvers (SPK-08-03).

effect-upstream
- none found. Nothing in this area failed because of effect 4.1.4.

qadi
- should: validate `:` and empty segments at runtime in `permission` and `createPermissionGroup` (SPK-08-02).
- should: redaction option for `resource` in audit records (SPK-08-05).
- should: column alias map in `compileSql`, or a documented path for dotted columns (SPK-08-04).
- should: an API that returns the row predicate and the field set separately from one policy (SPK-08-04).
- nice: document `"x.*"` on arrays (SPK-08-02).
- nice: publish a tested-on effect version matrix including 4.1.4 (SPK-08-01).
- nice: make `vitest` work from `packages/core` (SPK-08-08).
- nice: cache invalidation or generation hook (SPK-08-02).

awthaq
- none from this area. The subject builder takes the principal and tenant from awthaq's side; I did not test that boundary (see section 7).

## 7. Not verified

- Other qadi packages: http, react, promise, prisma, devtools, testing. Would need a spike each; http fits the gateway question and is the most relevant.
- PostgreSQL and MySQL pushdown: only SQLite ran. A pglite or pg area exists in the workspace (`@effect/sql-pglite`); the same differential test could run there.
- Real I/O latency: attribute and relationship resolvers backed by SQL. Needs a resolver on SQLite or pglite and a concurrent load test.
- `AuditStagingPort` transactional behaviour, and chaining into the real `@bridger/audit-chain` (not implemented, spec only).
- Multi-process and federation behaviour, signed policy bundles.
- qadi's mutation, coverage, BDD gates.
- awthaq integration (principal to subject).
- Correctness of a mixed-copy effect load: not forced, only the hazard reasoned.

## 8. Reproduction notes

- `cd /Users/mohammadalmechkor/Projects/Perso/Bridger/spikes && npx vitest run 08-qadi` runs all 35 tests. Verbose output prints the SQL text, refusal reasons, spans and audit entry keys via `console.log`.
- qadi's own core suite on 4.1.4: `npx vitest run --config 08-qadi/qadi-core-on-4.1.4.config.ts` from `spikes/`.
- qadi's full suite: from `/Users/mohammadalmechkor/Projects/Perso/qadi`, `node_modules/.bin/vitest run --reporter=dot` (read-only on source; may create caches).
- Optional local config with aliases: `npx vitest run --config 08-qadi/vitest.config.ts`. I did not run this config; only the root config and the 4.1.4 suite config were run.
- The spikes root config must keep `resolve.dedupe: ["effect"]`. Nothing was installed or edited outside `spikes/08-qadi/` and this file.
