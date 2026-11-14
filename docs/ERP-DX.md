# Bridger ERP: developer experience, test kit and CI

Status: **proposal for review, not implemented or type-checked**. Date: 2026-10-02. CLI commands, packages, helpers and file layouts are proposed. Effect testing facts (`effect/testing`, `TestClock`, `Arbitrary` which is unstable) and Alchemy/FoldKit test facilities are cited from the [knowledge catalog](knowledge/README.md) entries E44, A18–A20, F11–F12, R30; awthaq's `TestAuth.layer`, `CookieAssertions`, BDD suite and repository scripts were read in `/Users/mohammadalmechkor/Projects/Perso/effect-auth` (README and file names; not executed). Policy: all packages target the latest stable Effect 4.x (4.1 at the time of the 2026-11-08 revision; this replaces the earlier 4.0 target). This document turns the acceptance sections of the other specs into a testable structure.

> **Status banner (2026-11-08): example application, not normative.** This document describes an example ERP application built on Bridger with a server CRUD design: a database row is the source of truth and one server transaction commits each write. It is **not normative** for `@bridger/core` or any companion package, and it is **not the domain layer for local-first or event-sourced systems**; its row-as-truth write path conflicts with event-sourced, offline-first write paths. Such systems build on the [core specification](../references/core/README.md) and the companion specs ([command](../references/command/README.md), [durable-bus](../references/durable-bus/README.md), [federation](../references/federation/README.md), [loader](../references/loader/README.md), [audit-chain](../references/audit-chain/README.md)), and on the event-sourcing companions ([event-store](../references/event-store/README.md), [sequence](../references/sequence/README.md), [keyring](../references/keyring/README.md); Drafts like the others). Where this document and a spec disagree, the spec governs; the [supersession table](ERP-INDEX.md#supersession-table) maps each ERP concept to the spec that now governs it. Nothing here is implemented.

## 1. Decision

| Concern | Decision |
| --- | --- |
| Authoring | A `bridger` CLI scaffolds and checks plugins; generated code follows the contract/server split ([ERP-SPEC.md](ERP-SPEC.md) §1). |
| Testing | A test kit with an **in-memory storage** for fast logic tests and the **storage conformance suite run against a real database of each supported dialect** for everything involving isolation, races, locks and crash recovery. In-memory results are never evidence for those. |
| Source of truth | The specs' acceptance checks become named scenarios in the test kit; a traceability check fails CI if one is unmapped. |
| Local loop | `bridger dev` runs the server in development mode with inline modules and hot replacement through the normal upgrade path. |
| Repo hygiene | Boundary, cycle, checksum, contract-diff and docs-example checks run in CI (§7). |

## 2. CLI

```text
bridger new plugin <name>          scaffold a plugin (contract, server, ui, migrations, tests)
bridger add model <id>             model contract + served binding + initial migration
bridger add migration <module>     frozen snapshot migration from the current model diff
bridger add view|command|query|event|subscriber|job|workflow|approval|report
bridger add widget <id> --framework foldkit|react|neutral   scaffold a UI plugin (custom field widget or view renderer)
bridger check                      validate definitions, boundaries, contracts (no database)
bridger test [--db]                run unit/scenario tests (memory), or with --db the conformance suite against the configured database
bridger dev                        local server + shell with hot module replacement
bridger db plan|apply|status       show or run the DDL plan against a database
bridger contract diff <a> <b>      contract differences between two builds
bridger build | sign | publish     artifact pipeline ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §4)
bridger storage certify            run the storage conformance suite against a configured adapter and database
bridger doctor                     environment checks (versions, database connectivity and dialect, ports, keys)
```

### Generated layout

```text
plugins/<name>/
  contract.ts            browser-safe: models, fields, permission tokens, command/query contracts
  server.ts              Model.serve, Access, Command.implement, Module.define
  ui.ts                  declarative views
  migrations/NNN-*.ts    frozen snapshots (never import live fields)
  events.ts              Event.define / Subscriber.define (when added)
  test/                  scenarios using the test kit
  bridger.json           module id, apiVersion, publisher key id, externals override (rare)
```

Rules enforced by the generators:

- `add migration` snapshots the **current** model definition into a literal, immutable migration. It refuses to run if the working tree changes an already merged migration (§7).
- Generated files carry a `// @bridger-generated` header and a stable region marker so regeneration never overwrites user code.
- No generated file imports `@qadi/*` or `@awthaq/*` from the contract; those belong to the server entry.

## 3. Test kit

`@bridger/erp-testkit` provides layers and scenario helpers.

```ts
ErpTest.layer({
  storage: "memory" | { adapter: StorageAdapter; url: string }, // e.g. postgres, mysql, mssql, sqlite
  identity: TestIdentity,              // wraps awthaq TestAuth.layer (memory backends)
  clock: "test" | "real",
  modules: [TodoModule],               // inline modules (development identity rules)
}): Layer.Layer<ErpTest>
```

### In-memory storage

- Implements the `Storage` interface ([ERP-STORAGE.md](ERP-STORAGE.md) §3): tables as maps with the same catalog, receipts, audit, outbox and job tables.
- Row policies are evaluated with qadi's reference interpreter `evaluatePredicate` over rows, so authorization semantics are shared with the SQL path; a **differential test** runs the same generated policies against memory and every rendered dialect and fails on any disagreement (qadi uses the same technique for `predicate-sql`).
- Single mutex per physical model simulates serialization. It does **not** model MVCC, lock waits, named locks, skip-locked leasing or partial failure; scenarios that depend on them are tagged `@db` and skipped in memory runs.

### Identity helpers

```ts
TestIdentity.as({ actor: "alice", tenant: "demo", company: "main", grants: [TodoUser] })
TestIdentity.cookieSession(...)     // goes through awthaq sign-in + CSRF for HTTP-level tests
```

Grants are written through the real `Grants` service, so grant resolution is exercised, not mocked.

### Scenario helpers

| Helper | Purpose |
| --- | --- |
| `Scenario.twoActorsTwoCompanies()` | Alice and Bob in company A, Alice in company B; standard isolation fixture ([ERP-TODO-WALKTHROUGH.md](ERP-TODO-WALKTHROUGH.md) §13). |
| `Gateway.call(op, input, { key })` | Calls the real gateway path (decode, authorize, lease, transaction). |
| `race(n, effect)` | Runs *n* concurrent copies on the conformance suite's real database and returns all outcomes. |
| `Fault.at("schema/done")` | Injects a crash/failure at a named point (planner steps, manager phases, outbox delivery, transaction commit). |
| `Outbox.drain()`, `Jobs.runDue()`, `Workflow.advance()` | Deterministic driving of durable work with `TestClock`. |
| `Catalog.snapshot(as)` | Fetches the authorized catalog for an identity. |
| `Generation.inspect()` | Reads generation revisions, admission state and lease counts. |
| `Sql.captured()` | Records executed SQL for assertions (scope, predicate, revision in one statement). |

### UI tests

UI logic is tested once as pure machines, then through each renderer with the same recorded event sequences: FoldKit Story/Scene tests and React Testing Library ([ERP-BROWSER.md](ERP-BROWSER.md) §11). A `FakeWidget` implements the Port contract to test the teardown handshake including timeout.

## 4. Acceptance traceability

Every acceptance check in the specs gets a stable ID and a test.

| Spec | Section | Scenario ID prefix |
| --- | --- | --- |
| Core runtime: [21 — Testing host](../references/core/behaviors/21-testing-host.md) (BEH-BR-183, BEH-BR-184) | [traceability §5](../references/core/traceability.md#5-acceptance-scenario-traceability) | the core's own `REQ-BR-` IDs (not renumbered here) |
| [ERP-RUNTIME.md](ERP-RUNTIME.md) | §11 | `RUN-` |
| [ERP-RECORDS.md](ERP-RECORDS.md) | §14 | `REC-` |
| [ERP-STORAGE.md](ERP-STORAGE.md) | §15 | `STO-` |
| [ERP-SCHEMA-DESIGN.md](ERP-SCHEMA-DESIGN.md) | §7 | `SCH-` |
| [ERP-IDENTITY.md](ERP-IDENTITY.md) | §9, §11 | `IDN-` |
| [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) | §11 | `DST-` |
| [ERP-BROWSER.md](ERP-BROWSER.md) | §12 | `BRW-` |
| [ERP-BUSINESS.md](ERP-BUSINESS.md) | §16 | `BIZ-` |
| [ERP-OPERATIONS.md](ERP-OPERATIONS.md) | §11 | `OPS-` |
| [ERP-SPEC.md](ERP-SPEC.md), [ERP-MODELS.md](ERP-MODELS.md), [ERP-ACCESS.md](ERP-ACCESS.md) | review gates | `ERP-`, `MDL-`, `ACC-` |

`pnpm spec:verify` (modeled on awthaq's `spec:verify:strict`) parses the numbered checks in the docs and fails if a check has no scenario or a scenario references a missing check. Checks that cannot run in memory are marked `@db` or `@infra`. The first milestone is the Todo vertical slice: it must pass all `ERP-`, `STO-`, `IDN-`, `ACC-` checks that apply to Todo.

### Suites

| Suite | Storage | Runs when |
| --- | --- | --- |
| Unit | none | every change |
| Scenario (memory) | in-memory | every change |
| Conformance (per dialect) | real database of that dialect (container) | every PR for the reference adapter (PostgreSQL); every adapter's own CI for its dialect; the only suite that can claim race, lock and recovery behavior |
| Differential | memory interpreter vs each rendered dialect | every PR |
| Property | generated policies/fields (`Arbitrary`, unstable) | every PR |
| Upgrade fixtures | reference database + historical artifacts | before release |
| Infrastructure | Alchemy stages, real providers | scheduled; isolated stages and cost limits |

## 5. Local development

`bridger dev`:

1. Starts (or connects to) the configured database (PostgreSQL by default, or SQLite in Tier 2 mode) via a compose file the CLI writes; waits for readiness.
2. Runs platform migrations, creates a demo tenant, company and development identity (`Identity.development`, loopback only).
3. Loads the plugin's inline module in dev mode, serves `/auth`, `/erp` and the FoldKit shell with Vite hot reload.
4. On server-side plugin change: rebuilds, then performs `ensure({ dev: { replace: true } })`, which goes through the normal upgrade path (close admission, drain, publish new generation). The CLI shows phase progress and failures. Local hot reload is a development aid, not production install semantics.
5. `bridger dev seed` loads fixtures; `bridger dev reset` drops and recreates the dev database.

Preview of the diagnostics page (`/erp/diagnostics`) is on by default in dev.

## 6. Authoring documentation outline

1. Concepts: tenant, company, module, model, contract vs server binding, generation.
2. Tutorial: Todo in 15 minutes (the walkthrough), then the Planning extension.
3. Cookbook: custom command, query, event/subscriber, job, approval, report, attachment field, import, connector.
4. Access guide: permissions, roles, owner rule, field policy, why a request was denied.
5. Migrations guide: frozen snapshots, expansion rules, backfills, what the planner refuses.
6. Testing guide: memory vs conformance suites, faults, races, and how to certify a new storage adapter.
7. Publishing guide: build, sign, publish, approval, compatibility windows.
8. Reference: API pages generated from the typed definitions, error catalog.

Docs examples are extracted and type-checked in CI once the packages exist (§7).

## 7. CI checks

Modeled on awthaq's root `check` script (workspace sync, typecheck, package smoke, lint, knip, format, cycles, README status, error-tag check, coverage, BDD, spec traceability):

| Check | Purpose |
| --- | --- |
| Workspace sync / typecheck | Project references and strict types. |
| **Package-export boundary check** | `contracts`, `ui`, `client` have no dependency edge to server entries, `@bridger/qadi`'s evaluator, `@qadi/core` policy modules or database types ([ERP-SPEC.md](ERP-SPEC.md) §1). Implemented as a script over the package graph and each package's built `exports` and `.d.ts` imports. |
| Cycle check | No circular imports (awthaq `circular` script pattern). |
| Error-tag check | Every typed error has a unique tag and is in the error catalog (awthaq `check:error-tags` pattern). |
| **Migration immutability** | Hash of every migration file compared with the recorded baseline; changed merged migration fails. |
| **Contract diff gate** | `bridger contract diff` against the last released build; breaking diffs require an `apiVersion` bump or a reviewed waiver file. |
| Artifact dry run | `bridger build` + dry evaluation (no side effects) + external-only check ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §6). |
| Install test | Loads two builds with different versions into one host; asserts one Effect instance and the identity brand check ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §5). |
| Docs examples | Extract TypeScript from the specs/docs, type-check against the packages. |
| Spec traceability | §4. |
| Lint / knip / format / coverage | Style and dead-code control. |
| Security | Dependency audit, secret scan, SBOM generation on publish. |

Release: changesets with lockstep versions for `@bridger/*`; `release:dry-run` before publishing. Packages from other repositories (awthaq, qadi) are consumed by workspace or git link until published ([ERP-IDENTITY.md](ERP-IDENTITY.md) §1).

## 7a. Tooling from the Effect ecosystem and beyond

Checked against npm and project documentation on 2026-10-02; none of it has been tried in this repository. Versions: Effect and its `@effect/*` packages were published at 4.0.0 when checked on 2026-10-02; the target is now Effect 4.1 (2026-11-08 revision), and these versions are to be re-checked against 4.1.

| Need | Tool | Notes |
| --- | --- | --- |
| Database drivers for storage adapters | `@effect/sql-pg`, `-mysql2`, `-mssql`, `-sqlite-node`, `-libsql` (also `-d1`, `-clickhouse`) | One per adapter ([ERP-STORAGE.md](ERP-STORAGE.md) §3.5). |
| Server hosting, file system, HTTP | `@effect/platform-node` (or `-bun`) | Gateway and loader runtime. |
| Browser runtime for the shell | `@effect/platform-browser`, FoldKit | FoldKit pins its own Effect version ([ERP-BROWSER.md](ERP-BROWSER.md) §1). |
| Public and internal HTTP API | `effect/httpapi` (OpenAPI), `effect/rpc` | [ERP-BUSINESS.md](ERP-BUSINESS.md) §9. |
| Workflows, durable queues, multi-node coordination | `effect/workflow`, `effect/persistence`, `effect/eventlog`, `effect/cluster` | [ERP-BUSINESS.md](ERP-BUSINESS.md) §4; cluster only if LISTEN/NOTIFY polling proves insufficient. |
| Observability | `@effect/opentelemetry` | [ERP-OPERATIONS.md](ERP-OPERATIONS.md) §4. |
| The `bridger` CLI | `effect/cli` | Prompts, subcommands, help. |
| Editor and compiler diagnostics | `@effect/language-service`, `@effect/tsgo` | Effect-specific diagnostics (awthaq enforces many as errors); pin the TypeScript pairing exactly. |
| Tests | `@effect/vitest`, `vitest`, `@vitest/coverage-v8`, fast-check, `effect-cucumber` (optional) | Gherkin could back the acceptance-check traceability (§4). |
| Linting, API docs, packaging | `@effect/eslint-plugin` or oxlint, `@effect/docgen`, `@effect/build-utils`, `@effect/dtslint` | `@effect/dtslint` checks published declaration files. |
| Repository hygiene | oxfmt, knip, madge, publint, `@arethetypeswrong/cli`, changesets | Already used by awthaq; mirrors the CI checks in §7. |
| Browser app tooling | `create-foldkit-app`, FoldKit DevTools, Story and Scene tests, Vite plugin, MCP server for agents (FoldKit renderer); React with `@testing-library/react`, happy-dom and the React DevTools (React renderer) | [ERP-BROWSER.md](ERP-BROWSER.md) §11. |
| Infrastructure | Alchemy (providers for Cloudflare, AWS, Neon, PlanetScale, Docker; custom providers are Layers) | [ERP-OPERATIONS.md](ERP-OPERATIONS.md) §2; Alchemy is a 2.0 beta. |
| Auth and authorization | awthaq, qadi (`@qadi/core`, `predicate-sql`, `audit`, `devtools`) | [ERP-IDENTITY.md](ERP-IDENTITY.md), [ERP-ACCESS.md](ERP-ACCESS.md). |
| State machines (candidate) | `effect-machine` | Possible fit for approval and lifecycle flows; not evaluated. |
| Local-first client (candidate) | LiveStore with Effect Atom | Only if a local-first browser client becomes a requirement. |

Notes:

- The old standalone `@effect/cli`, `@effect/rpc`, `@effect/workflow` and `@effect/cluster` packages (0.x versions) are the v3 lineage; in v4 the same functionality is in the core `effect` package, and some import paths are under `unstable` ([knowledge/README.md](knowledge/README.md)).
- The Effect version policy for all packages is the latest stable 4.x, 4.1 as of the 2026-11-08 revision. awthaq and qadi currently pin `4.0.0-rc.116` exactly and need a version bump before they can share one Effect copy with Bridger packages on the server.

## 8. Acceptance checks

- `bridger new plugin todo` followed by `bridger check` passes with no manual edits; the contract entry's import graph contains no server code.
- `bridger add migration` after changing a field produces a frozen snapshot and `bridger db plan` shows only additive steps.
- Editing a merged migration fails CI.
- The same scenario run on memory and on each certified dialect produces identical results except those tagged `@db`.
- The differential test finds no disagreement between the interpreter and every rendered predicate (`predicate-sql` and adapter renderers) on generated policies.
- A scenario with `Fault.at("schema/done")` followed by restart completes without duplicate migration.
- `bridger dev` hot-replaces a changed command without restarting the server and without dropping an in-flight request.
- `spec:verify` fails when an acceptance check has no scenario.

These are design acceptance scenarios, not tests already executed.

## 9. Decisions and remaining items

| # | Item | Decision |
| --- | --- | --- |
| 1 | Databases for tests | **One container per CI job per dialect under test**, started by a helper script (the same compose file used by `bridger dev`), with a separate **database per test worker** created from a template database. No in-process database substitute for Tier 1 claims. A new adapter is certified by running `bridger storage certify` (the conformance suite) against its target versions. |
| 2 | Property-test generator | **fast-check is primary** (stable, already used by qadi). Effect `Arbitrary` is allowed for schema-derived values but is not required. |
| 3 | CLI generation | **Templates are hand-written; derived artifacts are generated from the definitions:** migration snapshots, contract diffs, the manifest and API documentation pages. |
| 4 | "Why was this denied" tool | **Adopt `@qadi/devtools`** in the `bridger dev` diagnostics page, opt-in, never enabled in production builds. |
| 5 | Mutation testing | **Deferred.** Before general availability of the access wrapper, run a mutation tool (for example Stryker) over the policy compiler and column mapping. |

**Status (2026-11-08): open items remain.** The decisions above date from October 2026. Open: the test kit and CLI overlap with the `@bridger/kit` companion ([references/kit/](../references/kit/README.md)) and are to be reconciled with it; tool versions are to be re-checked against the Effect 4.1 target; nothing here is implemented or run.

**Decision D5 (2026-11-11, [ERP-APOTHEKA-DECISIONS.md](ERP-APOTHEKA-DECISIONS.md)).** The overlap with `@bridger/kit` is resolved in the kit's favour: there is one CLI, the kit's (`bridger create`, `dev`, `test`, `check`, `pack`, `publish`, `countersign`), and the ERP scaffolds in this document become templates of `bridger create`. `ErpTest.layer` is built as a layer over `PluginTest` and remains the ERP's contract-test entry. Proposed; not implemented.

Change log: 2026-11-08, round-2 agent review fixes — status banner links the event-store, sequence and keyring companions instead of calling event-store "planned, not yet drafted" (R5-20).

Change log: 2026-11-09, audit fixes — §4: the core row cites the core reference's required acceptance checks (BEH-BR-183, BEH-BR-184) and their `REQ-BR-` IDs instead of the superseded SPEC.md and a `COR-` prefix (E-04).
