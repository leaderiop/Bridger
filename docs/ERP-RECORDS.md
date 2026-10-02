# Bridger ERP: Records, model logic, relations, queries and platform data services

Status: **proposal for review, not implemented or type-checked**. Date: 2026-10-02. Every name, signature and table below is proposed. This document completes the model layer of [ERP-SPEC.md](ERP-SPEC.md) §3–§4 and [ERP-MODELS.md](ERP-MODELS.md): the `Records` interface, model logic (constraints, computed fields, hooks), relations, queries and aggregates, module data (seeds and data migrations), inter-module services, sequences, settings, money, translatable data and the clock. Storage mechanics are in [ERP-STORAGE.md](ERP-STORAGE.md); the runtime that hosts all of this is in [ERP-RUNTIME.md](ERP-RUNTIME.md). Policy: all packages target the latest stable Effect 4.x (4.0.0 at the time of writing).

## 1. Decision

The **contract / server-binding split** ([ERP-SPEC.md](ERP-SPEC.md) §1) applies to everything here: declarations that clients may need (fields, relations, filters, service and sequence definitions, settings schemas) are pure data in `@bridger/erp/contracts`; code (constraints, hooks, computed functions, service implementations, seeds) lives only in the server entry and is attached with `Model.serve`, `Service.implement` and `Module.define`.

| Concern | Where it is declared | Where the code lives |
| --- | --- | --- |
| Fields, relations, computed field *declarations*, filterable/sortable flags | contract | none (data only) |
| Constraints, hooks, computed functions, server defaults | — | `Model.serve(Model, { … })` |
| Service contracts, sequence and settings definitions | contract | `Service.implement`, platform services |
| Seeds, data migrations, enable hooks | — | `Module.define({ data })` |

All code that runs inside the write pipeline runs in the command's transaction, under the request's tenant, company and subject, and cannot perform external effects.

## 2. The `Records` interface

`Records` is the Effect service plugin code uses for all record access. Every method requires the request environment (`Tx`, request context, current subject, clock) and applies tenant and company scope, the caller's row and field policies, and the active registry generation. It never bypasses them.

```ts
interface Records {
  readonly get: <M extends AnyModel>(model: M, id: string, options?: ReadOptions<M>) =>
    Effect.Effect<Row<M>, RecordNotFound | Forbidden | ExtensionUnavailable, RecordsEnv>

  readonly list: <M extends AnyModel>(model: M, query?: ListQuery<M>) =>
    Effect.Effect<Page<Row<M>>, InvalidQuery | Forbidden | ExtensionUnavailable, RecordsEnv>

  readonly create: <M extends AnyModel>(model: M, input: CreateOf<M>, options?: WriteOptions) =>
    Effect.Effect<Row<M>, WriteError, RecordsEnv>

  readonly update: <M extends AnyModel>(
    model: M, input: { id: string; expectedRevision: number; changes: ChangesOf<M> }, options?: WriteOptions) =>
    Effect.Effect<Row<M>, WriteError | RecordNotFound | RevisionConflict, RecordsEnv>

  readonly delete: <M extends AnyModel>(model: M, input: { id: string; expectedRevision: number }) =>
    Effect.Effect<{ id: string }, RecordNotFound | RevisionConflict | ReferenceInUse | Forbidden | HookFailed | HookTimeout | HookDepthExceeded | ModelFenced | ExtensionUnavailable, RecordsEnv>

  readonly exists: (model: AnyModel, id: string) => Effect.Effect<boolean, Forbidden, RecordsEnv>

  /** Loads the authorized row with a write lock (adapter `rowLocking`) for read-modify-write inside this transaction. */
  readonly lock: <M extends AnyModel>(model: M, id: string) =>
    Effect.Effect<Row<M>, RecordNotFound | Forbidden, RecordsEnv>

  readonly aggregate: <M extends AnyModel>(model: M, def: AggregateDef<M>) =>
    Effect.Effect<readonly Group[], InvalidQuery | Forbidden | CapabilityMissing, RecordsEnv>

  /** Rows reached through a declared inverse relation (one-to-many). */
  readonly related: <M extends AnyModel>(model: M, id: string, relation: string, query?: ListQuery<AnyModel>) =>
    Effect.Effect<Page<Row<AnyModel>>, RecordNotFound | InvalidQuery | Forbidden, RecordsEnv>
}

type WriteError = InvalidInput | Forbidden | ConstraintViolation | UniqueViolation | ReferenceInvalid
                | HookFailed | HookTimeout | HookDepthExceeded | ExtensionUnavailable | ModelFenced

interface ReadOptions<M> {
  readonly projection?: Projection<M>          // base, or a Model.compose projection
  readonly expand?: readonly string[]          // reference fields to expand (§5)
  readonly locale?: string                     // overrides the request locale (§11)
  readonly translations?: "resolved" | "all"
}
interface WriteOptions { readonly projection?: Projection<AnyModel>; readonly locale?: string }
```

- **Request environment** `RecordsEnv = Tx | RequestContext | CurrentSubject | ErpClock | RegistryLease`. Inside a command, the gateway provides all of it. A plugin cannot obtain `Records` without a request or an explicit system scope.
- **System scope.** Workers, seeds and data migrations run through `Records.asSystem({ tenantId, companyId?, module, reason })`, which provides a subject named `system:<module>` holding only the permissions the module declared for system use (reviewed at approval, [ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §3). Scope (tenant, company) still comes from the call and still filters every statement; system scope never widens it. Audit rows record the system subject and `reason`.
- **Row type.** `Row<M, P>` follows the projection (base row plus the named extensions). Fields the caller may not read are rejected with `Forbidden`, not silently omitted ([ERP-MODELS.md](ERP-MODELS.md) §3).
- **Transactions.** `Records` never opens a transaction; it requires the gateway's `Tx`. Nested calls share it.

## 3. The write pipeline, constraints, computed fields and hooks

### Order of execution for `create` and `update`

1. Scope and operation gate (`check`), field policy on supplied keys.
2. Decode input strictly; `update` loads the authorized row with `rowLocking` when active constraints, computed fields or hooks need the merged record, otherwise uses the single-statement path ([ERP-STORAGE.md](ERP-STORAGE.md) §9).
3. Apply create defaults (`createDefault`, then server defaults, §3.4).
4. **`before` hooks** in order, each may return field changes (§3.3).
5. Resolve and validate **references** (§4).
6. Compute **stored computed fields** in dependency order (§3.2).
7. Evaluate **constraints** on the merged record (§3.1).
8. Persist (scope, row policy, revision compare), standard audit, standard model events, receipt.
9. **`after` hooks** in order; events emitted by hooks go to the outbox.

`delete` runs: gate, `lock`, `beforeDelete` hooks, reference checks (`restrict`/`cascade`/`setNull`, §4), delete, audit/outbox, `afterDelete` hooks.

Order among contributors: base module first, then extensions by module dependency order, then module ID. A failure at any step aborts the transaction and returns a typed error.

### 3.1 Constraints

```ts
Model.serve(Task, {
  access,
  constraints: [
    Constraint.define("task.title-not-reserved", {
      fields: ["title"],                               // used for error paths and to skip when untouched
      check: (record, ctx) => /* Effect<void, ConstraintViolation> */
    }),
  ],
})
```

- A constraint is a **deterministic, side-effect-free check** over the merged record. It may read other records through `ctx.records` (read-only, same authorization), but it must not write, emit events or call external services.
- Constraints combine with logical AND; none can override another ([ERP-MODELS.md](ERP-MODELS.md) §4). A failure returns `ConstraintViolation { constraint, fields, message }`; `fields` map to input paths for UI error placement.
- A constraint declares `fields`; on `update`, it is evaluated when any declared field is in the changes, or always if `fields` is omitted.
- Database-enforceable invariants (uniqueness, not-null) are declared as such in migrations; constraints are for application rules.

### 3.2 Computed fields

The **declaration** is contract data; the **function** is server code.

```ts
// contract
total: Field.computed(Field.decimal({ precision: 18, scale: 2 }), { dependsOn: ["subtotal", "tax"], stored: true })
// server
Model.serve(Invoice, { computed: { total: ({ subtotal, tax }) => Money.add(subtotal, tax) } })
```

- `dependsOn` lists fields of the same record and single-valued reference fields (one level, `"customer.country"`). The compiler orders computations topologically and rejects cycles ([ERP-MODELS.md](ERP-MODELS.md) §4).
- **Stored** computed fields are recomputed in the write pipeline whenever a dependency is in the write; their value is persisted and can be filtered and sorted. **Non-stored** ones are computed after fetch from the projected row and cannot be filtered or sorted.
- Only the owner module computes a field; clients cannot write it (it is not in `Create`/`Changes`).
- Aggregation over child records (a parent total from lines) is not a dependency expression in the first release: it is done in the child model's `after` hooks by updating the parent through `Records.lock` and `update`.
- Dormant stored values of a disabled extension are recomputed on re-enable before exposure ([ERP-MODELS.md](ERP-MODELS.md) §6).

### 3.3 Hooks

```ts
hooks: {
  beforeCreate: (draft, ctx) => /* Effect<Partial<Changes>, HookFailed> */,
  afterCreate:  (row, ctx)   => /* Effect<void, HookFailed> */,
  beforeUpdate: (change: { before, after }, ctx) => /* Effect<Partial<Changes>, HookFailed> */,
  afterUpdate, beforeDelete, afterDelete
}
```

- `ctx` provides `records` (same transaction and authorization), `emit(event, payload)` (outbox), `sequences`, `clock`, `settings`, `services` and the request context. It provides no network, file system or other external capability; the hook environment type excludes them.
- `before` hooks may only return changes to **writable** fields. Reserved fields cannot be changed. Changes are merged before constraints run.
- A hook that writes the same record it is running for does not re-trigger the same hook (re-entrancy guard); hooks of other models run normally. Nested write depth is limited (default 5, `HookDepthExceeded`).
- Each hook has a time budget (default 5 seconds, `HookTimeout`). A hook failure aborts the whole command.
- External effects are never performed in a hook: record an intent event and let a subscriber perform it ([ERP-BUSINESS.md](ERP-BUSINESS.md) §6).
- Extensions attach their own with `Model.serveExtension(TaskPlanning, { constraints, hooks, computed })`; they cannot weaken base constraints.

### 3.4 Server-derived defaults

```ts
serverDefaults: { createdTeam: ({ actor, company, now, settings }) => /* Effect<value> */ }
```

Evaluated once at creation inside the transaction, for fields declared with `Field.make(schema, { serverDefault: true })`. They are never exposed to clients as writable and are not part of `Create`.

## 4. Relations

### Declaration (contract)

```ts
customer: Field.reference(Model.ref("sales.customer"), {
  label: "Customer", required: true, onDelete: "restrict",   // "restrict" | "cascade" | "setNull"
})
lines: Model.hasMany(OrderLine, "order")                       // inverse side: read-only, no column
```

`Model.ref("<model id>")` names the target by ID so the contract does not import the target module's code; an optional type parameter gives static typing when the target contract is available. The field's value is the target record ID (decoded as a branded id).

### Rules

- **Scope compatibility.** A reference never crosses tenants. A company-scoped record may reference a company-scoped target only in the same company, and a tenant-scoped target from any of its companies. Records enforces this; the database enforces the tenant part with a composite foreign key `(tenant_id, target_id)` where the dialect supports it.
- **Authorization.** On create and update, the target must be visible to the caller under the target model's read policy. Otherwise the write fails with `ReferenceInvalid { field }` using the same generic message as a nonexistent target (no existence leak).
- **Declared dependency.** A reference to another module's model requires that module in `dependsOn` (checked at module compile time).
- **Delete behavior.** \1 The error is generic and names no referencing rows, so it does not reveal records the caller cannot read. `setNull` requires an optional field. `cascade` is allowed only when both models belong to the **same module**; it deletes dependents inside the same transaction as the system subject of that module, audited, and is rejected at compile time across modules (use `restrict` or `setNull` plus an event).
- **Disabled target module.** Stored ids remain and the foreign key remains; `expand` and relation-path filters fail with `ModuleUnavailable`; plain reads return the id.
- **Inverse relations** (`hasMany`) have no column; they are read through `Records.related` or `expand`. Many-to-many uses an owned join model ([ERP-MODELS.md](ERP-MODELS.md) §6).

### Reading through relations

- `expand: ["customer"]` returns `customer` as the full target row when readable by the caller and as `{ id }` otherwise.
- Filters and sorts may follow single-valued reference paths to depth 2 (`"customer.country"`). A condition over a relation path matches only rows whose target is visible to the caller. Joins are rendered by the storage adapter with the target's row policy applied to the joined table ([ERP-STORAGE.md](ERP-STORAGE.md) §4).

## 5. Queries, search and aggregates

### Filter language (contract, JSON-serializable)

```ts
type Filter =
  | { readonly and: readonly Filter[] }
  | { readonly or: readonly Filter[] }
  | { readonly not: Filter }
  | { readonly field: string                       // "title", "customer.country" (depth <= 2)
      readonly op: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "notIn" | "isNull"
                 | "between" | "contains" | "startsWith" | "endsWith"
      readonly value?: unknown; readonly values?: readonly unknown[]; readonly caseSensitive?: boolean }

interface ListQuery<M> {
  readonly where?: Filter
  readonly search?: { readonly text: string; readonly fields?: readonly string[] }
  readonly orderBy?: readonly { readonly field: string; readonly direction: "asc" | "desc" }[]   // at most 3, id tie-break appended
  readonly limit?: number                          // <= 200
  readonly cursor?: string
  readonly count?: boolean                         // bounded count, "10000+" above the cap
  readonly expand?: readonly string[]
}
```

This replaces the equality-only `filter` of the first `list` sketch in [ERP-SPEC.md](ERP-SPEC.md) §3; the operation reference `Model.queries.list` takes `ListQuery`.

- **Allowed fields.** Only fields marked filterable/sortable in the contract are accepted (`Field.make(schema, { filter: true | ops[], sort: boolean })`; scalar fields default to true, long text defaults to `contains` only when also `searchable`). Unauthorized or non-filterable fields give `InvalidQuery`.
- **Operators.** Comparison operators apply to numbers, decimals, dates and instants; text operators are case-insensitive by default, escape their wildcards, and use binary or collated comparison per the adapter's declared behavior. Instants are compared as UTC; date-only fields compare as dates.
- **Search.** `search.text` runs over the fields marked `searchable` (or the supplied subset): native full text when the adapter has `fullText`, otherwise case-insensitive `contains` OR-ed over at most 5 fields. Results are always re-authorized as rows; no index result bypasses scope or policy ([ERP-BUSINESS.md](ERP-BUSINESS.md) §8).
- **Indexes.** Migrations create indexes for fields declared `indexed: true`. A statement timeout (default 10 seconds) and the page limit bound unindexed queries; slow queries are reported in metrics.
- **Counts.** Not returned by default. `count: true` runs a bounded count (cap 10,000).
- **Cursors** are opaque, signed, and tied to scope, order and filter shape.

### Aggregates

```ts
interface AggregateDef<M> {
  readonly groupBy?: readonly (string | { field: string; bucket: "day" | "week" | "month" | "year" })[]  // <= 3
  readonly measures: readonly ({ kind: "count" } | { kind: "sum" | "avg" | "min" | "max"; field: string })[]
  readonly where?: Filter
  readonly orderBy?: readonly { by: "group" | "measure"; key: string; direction: "asc" | "desc" }[]
  readonly limit?: number                          // <= 1,000 groups
}
```

- The row policy is applied before aggregation (as SQL predicates); every field used in `groupBy`, `measures` and `where` must be readable/filterable by the caller, otherwise `Forbidden`.
- `sum` and `avg` apply to numeric and decimal fields; on decimals they require the adapter capability `exactDecimal`, else `CapabilityMissing` ([ERP-STORAGE.md](ERP-STORAGE.md) §3.2).
- Date buckets of instants use the company's timezone; date-only fields bucket as dates.
- Aggregates are for reports and dashboards; large exports use jobs ([ERP-BUSINESS.md](ERP-BUSINESS.md) §10).

## 6. Module data: seeds, enable hooks and data migrations

```ts
Module.define({
  data: {
    seeds: [
      Seed.records(Country, [{ externalId: "country.fr", values: { code: "FR", name: "France" } }],
                   { updatePolicy: "update-unmodified", required: true }),
    ],
    demo: [ /* Seed.records … only when the tenant was created with demo data */ ],
    onEnable: [ ({ tenant }) => /* Effect: idempotent setup */ ],
    migrations: [ DataMigration.define("002-backfill-priority", { scope: "company", run: backfillPriority }) ],
  },
})
```

### Seeds

- Seeds are records identified by a stable `externalId` unique within the module. They are applied by `Records` under the module's system subject, in batches of one transaction each, resumable and idempotent.
- `bridger_external_ids (tenant_id, module_id, external_id, model_id, record_id, seed_hash, scope_company)` maps external ids to records and stores the hash of what the seed last wrote.
- `updatePolicy` on re-run (for example after an upgrade): `create-only` (never touch an existing record; default), `update-unmodified` (update only if the record's current content still equals the last seed hash, i.e. nobody edited it), `overwrite` (always; reviewed at approval).
- `required: true` seeds must complete **before** the tenant generation is published (install phase `data`); other seeds run after enable as a job.
- Company-scoped seeds (`scope: "company"`) run for every existing company at enable and for each company created later (`onCompanyCreated`).
- Dependency modules' seeds run first. Demo data is off by default, enabled only for tenants created with `demoData: true`, and refused in production mode unless configured.

### Enable hooks

`onEnable` runs once per tenant enablement (after schema and required seeds, before publication) as the system subject; it must be idempotent. Failure blocks activation with phase `data`.

### Data migrations

- Data migrations transform existing data when a new build needs it (backfills, restructuring). They are separate from schema migrations: schema steps change structure ([ERP-STORAGE.md](ERP-STORAGE.md) §7); data migrations change values.
- Each has an ID and checksum (immutable once released), a scope (`tenant` or `company`), and a `run` that processes in batches with a resumable cursor, using `Records.asSystem`.
- State is recorded in `bridger_data_migrations (tenant_id, module_id, migration_id, company_id, state, cursor, error, started_at, finished_at)`. A migration runs once per tenant (and company); re-running a finished one is a no-op; a crashed one resumes from its cursor.
- Install phases become `artifact → schema → data → catalog → runtime → ui` ([ERP-DISTRIBUTION.md](ERP-DISTRIBUTION.md) §7). A failed data migration leaves the module `failed` with phase `data`, the previous generation active, and an explicit `resume`.
- Data migrations are idempotent by contract and must not call external services.

## 7. Inter-module services

Modules call each other through **typed service contracts**, not by importing each other's server code.

```ts
// contract (browser-safe schemas only)
export const NextPriority = Service.contract("planning.next-priority", {
  input: Schema.Struct({ taskId: Task.Id }),
  output: Schema.Struct({ priority: Priority }),
})

// planning server
Service.implement(NextPriority, {
  permission: PlanningPerms.read,                  // checked against the CALLER's subject
  execute: ({ taskId }) => /* Effect<Output, Err, RecordsEnv> */,
})

// todo server (module with dependsOn planning)
const { priority } = yield* Services.call(NextPriority, { taskId })
```

- **Resolution.** The call is resolved from the caller's tenant registry. The providing module must be in the caller's declared `dependsOn` closure (compile-time check) and enabled for the tenant; otherwise `ModuleUnavailable`. `dependsOn` may mark a dependency `optional: true`, in which case the caller uses `Services.callOptional` (returns `Option`).
- **Execution.** In the caller's transaction, request context and subject. The callee's `permission` is checked against that subject, so a call can never elevate privilege. A service that must act with module authority declares `elevated: { reason }`; it is listed in the manifest for approval and audited.
- **Contracts.** The service contract carries the providing module's `apiVersion`; an incompatible dependency fails module compilation (`ServiceContractIncompatible`). Call depth is limited (default 8) and cycles cannot form because calls only follow declared dependencies.
- **Asynchronous coordination** between modules uses events and workflows ([ERP-BUSINESS.md](ERP-BUSINESS.md)).

## 8. Sequences

```ts
// contract
export const InvoiceNumber = Sequence.define("sales.invoice-number", {
  scope: "company",
  format: "INV/{yyyy}/{seq:6}",       // tokens: {yyyy} {yy} {mm} {seq:n} {company}
  reset: "year",                      // "never" | "year" | "month"
  gapless: true,
})
// in a command or hook
const number = yield* Sequences.next(InvoiceNumber, { date: invoice.date })
```

- State: `bridger_sequences (tenant_id, company_id, sequence_id, period, next_value)`. `period` is derived from the supplied date in the company's fiscal calendar/timezone (`reset`).
- **Gapless** sequences allocate inside the caller's transaction by locking the sequence row (`rowLocking`) and incrementing it, so a rollback gives the number back; concurrent allocations on one sequence serialize. They require the adapter capability `rowLocking` and are documented as a throughput limit.
- **Non-gapless** sequences may allocate blocks outside the caller's transaction for throughput; numbers can have gaps after rollbacks.
- The assigned number is stored in an ordinary field with a unique index; the command's idempotency receipt returns the same number on retry (a retried command does not consume another).
- Format tokens are a closed set; a bad format fails at module compilation.

## 9. Settings

```ts
// contract
export const SalesSettings = Settings.define("sales.settings", {
  scope: "company",                                 // or "tenant"
  schema: Schema.Struct({ defaultTerms: Schema.String, apiKey: Schema.optionalKey(Schema.Redacted(Schema.String)) }),
  defaults: { defaultTerms: "30 days" },
  permission: { read: SalesPerms.read, write: SalesPerms.configure },
})
// use
const s = yield* Settings.get(SalesSettings)
```

- State: `bridger_settings (tenant_id, company_id, key, revision, value, updated_by, updated_at)`; company-scoped values fall back to tenant-wide values, then to `defaults`.
- Reads are cached per resident tenant and invalidated by revision (settings are not part of the tenant generation, so changing them never republishes it).
- Writes go through a built-in command `settings.update { key, expectedRevision, changes }`: schema-validated, permission-checked, audited, optimistic-concurrency, emitting `settings.changed`.
- `Redacted` fields are stored encrypted (awthaq `Encryption`/`KeyProvider` ports) and are returned to clients only as masked placeholders; a write supplying the placeholder leaves the secret unchanged.
- The browser renders a generic settings form from the schema (`View.settings`, [ERP-BROWSER.md](ERP-BROWSER.md) §5).

## 10. Decimal and money fields

```ts
amount:   Field.decimal({ precision: 18, scale: 4, rounding: "half-even", min: "0" })
price:    Field.money({ currency: { field: "currency" } })        // currency stored in a sibling field
fee:      Field.money({ currency: { fixed: "EUR" } })
currency: Field.reference(Model.ref("bridger.currency"), { required: true, onDelete: "restrict" })
```

- Decimals travel as **strings** (never JSON numbers) and are decoded as `BigDecimal`. A value with more digits than `scale` is `InvalidInput`; storage is `decimal(precision, scale)` ([ERP-STORAGE.md](ERP-STORAGE.md) §5).
- `Field.money` is a decimal bound to a currency, taken from a sibling field of the same record or fixed. The currency's decimal places (from the platform `bridger.currency` model: code, decimals, symbol) set the default scale and the rounding unit.
- `Money` helpers: `Money.of(amount, currency)`, `add`/`subtract` (different currencies fail with `CurrencyMismatch`), `multiply(by, rounding)`, `allocate(total, ratios)` (distributes without losing minor units), `convert(money, to, rate, rounding)` (the **caller supplies the rate**; the platform owns no exchange-rate data).
- Each company has a `functional_currency` ([ERP-IDENTITY.md](ERP-IDENTITY.md) §4). Rounding stage and mode are declared by the owning domain module; the platform default is half-even at the currency's decimals.
- SQL sums and averages of decimals need the adapter capability `exactDecimal`; without it they fail with `CapabilityMissing` and modules that depend on them refuse to install ([ERP-STORAGE.md](ERP-STORAGE.md) §3.2).

## 11. Translatable data and the clock

### Translatable fields

- `Field.text({ translatable: true })` stores the **source-locale value** in the model's column (the company's default locale unless `writeLocale` is given) and other locales in `bridger_translations (tenant_id, model_id, record_id, field_id, locale, value)`.
- Writes: ordinary keys write the source value. Translations are supplied in a reserved envelope key `i18n` of `Create`/`Changes`: `{ i18n: { fr: { title: "…" } } }`. A translation write is a write to the record: it bumps the revision, is audited and obeys field policy.
- Reads resolve the value with the request locale through a fallback chain (requested locale → language only → company default locale → source value). `translations: "all"` returns every locale.
- Limits in the first release: filtering and sorting on translatable fields use the source-locale column only; identifiers and codes must not be translatable.
- The model contract's reserved names gain `i18n` ([ERP-SPEC.md](ERP-SPEC.md) §3).

### The clock

- The platform provides an **`ErpClock`** service. `now` is **fixed per command**: the gateway captures one instant and every hook, constraint, default and audit row in the command sees the same value. `today(companyId)` returns the company-local calendar date from the company's timezone (IANA name stored on `bridger_companies`).
- Business dates (`date` fields, fiscal periods, due dates) are always derived from `today(company)` or from user input, **never** from the UTC date of an instant. User time zones affect display only.
- The database clock is used only for cross-node comparisons of leases and heartbeats (adapter `now`), never for business timestamps.
- Tests use the test clock; schedules and retention jobs use the same service.

## 12. Platform tables introduced here

`bridger_external_ids`, `bridger_data_migrations`, `bridger_sequences`, `bridger_settings`, `bridger_translations`, plus the platform model `bridger.currency`. Tenant-scoped rows in tables whose key includes `company_id` use the `'*'` sentinel ([ERP-STORAGE.md](ERP-STORAGE.md) §3.3). They follow the portable types and tenant-scope rules of [ERP-STORAGE.md](ERP-STORAGE.md) and are created by platform migrations.

## 13. Errors

| Error | Meaning | Public mapping |
| --- | --- | --- |
| `ConstraintViolation` | An application constraint failed | `InvalidInput` with field paths. |
| `ReferenceInvalid` | Target missing, out of scope or not visible | `InvalidInput` (generic). |
| `ReferenceInUse` | Delete blocked by referencing rows | `InvalidInput`-class with a clear message. |
| `InvalidQuery` | Unknown/unauthorized field, bad operator, limit exceeded | `InvalidInput`. |
| `CapabilityMissing` | The adapter lacks a required capability | Administrative error at compile time; `InternalError` at runtime. |
| `HookFailed`, `HookTimeout`, `HookDepthExceeded` | Hook failure | `InternalError` unless the hook raised a typed domain error. |
| `CurrencyMismatch` | Mixed-currency arithmetic | Domain error (`InvalidInput` when from user data). |
| `ModuleUnavailable` | Service or relation target module disabled | Retryable after catalog refresh. |
| `SeedFailed`, `DataMigrationFailed` | Install phase `data` failed | Administrative status with resume. |

## 14. Acceptance checks

- A constraint violation aborts the command, leaves no row, receipt, audit or outbox entry, and reports the offending input paths.
- Stored computed fields are recomputed in dependency order and cycles fail module compilation.
- A `before` hook cannot set a reserved field; a hook recursion beyond the depth limit fails the command; a hook that exceeds its budget aborts it.
- A reference to a row the caller cannot read is indistinguishable from a missing reference; `restrict` blocks deletion; cross-module `cascade` fails compilation.
- A relation-path filter excludes rows whose target is invisible to the caller.
- Filter and sort on non-filterable fields are rejected; a list above the page limit is rejected; cursors from another filter are rejected.
- An aggregate over a field the caller cannot read is `Forbidden`; decimal sums fail with `CapabilityMissing` on adapters without exact decimal.
- Seeds are idempotent; `update-unmodified` leaves a user-edited seeded record untouched; a crashed data migration resumes from its cursor and never runs twice.
- A service call checks the callee permission against the caller; calling a module that is not a declared dependency fails compilation.
- Gapless sequences give no gaps after rollbacks under concurrent load; a retried command returns the same number.
- Settings secrets never leave the server unmasked; a stale settings write returns `RevisionConflict`.
- Money arithmetic across currencies fails; `allocate` preserves the total exactly.
- A translated field resolves with the fallback chain; writing a translation bumps the revision.
- Within one command `now` is constant; the business date follows the company timezone across midnight UTC.

These are design acceptance scenarios, not tests already executed.

## 15. Decisions and remaining items

| # | Item | Decision |
| --- | --- | --- |
| 1 | Where model logic lives | **Server binding** (`Model.serve`), declarations in the contract (§1). |
| 2 | Aggregates over child rows as computed fields | **Not in the first release;** use child hooks (§3.2). |
| 3 | Cross-module cascade | **Rejected;** use restrict or setNull plus events (§4). |
| 4 | Filter/sort on translated values | **Source locale only** in the first release (§11). |
| 5 | Exchange rates and fiscal calendars | **Not platform data.** Money conversion takes a caller-supplied rate; fiscal calendars belong to the accounting domain. |
| 6 | Rich view definition language | **Deferred** ([ERP-BROWSER.md](ERP-BROWSER.md) §13). |
