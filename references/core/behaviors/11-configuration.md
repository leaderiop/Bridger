# 11 — Configuration

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-11                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

Configuration is where secrets enter a plugin, and where a bad value most
often turns into a half-started service. This file converts SPEC.md
"Configuration and metadata" and "Volatile configuration": decoding before
`build`, the `ConfigSource`, reading at every activation, the per-plugin
override and its lifetime, `reconfigure`, volatile fields, the rule that
configuration values are never observable, and `meta`. This file owns
BEH-BR-097–104 and uses all eight.

When `reconfigure` is legal in each state is specified in
[08 — Operation Legality](./08-operation-legality.md); its attribution, gate
and audit records follow [22](./22-attributable-operations.md) to
[25](./25-operation-gate.md).

## BEH-BR-097: Configuration is decoded before build

> **Invariant:** [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic)
> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```ts
// illustrative — not type-checked
// PluginDefinition fields (behaviour 01)
readonly config?: Schema.Codec<C, unknown>
readonly volatile?: readonly (keyof C & string)[]

// Context.Service with identifier "@bridger/core/Plugin.Config"
interface PluginConfig<C> {
  readonly value: C                          // decoded at activation
  readonly current: Effect.Effect<C>         // latest decoded value
  readonly changes: Stream.Stream<C>         // SubscriptionRef.changes feed
}
```

```
REQUIREMENT: For a plugin that declares `config`, the host MUST obtain the
             raw value and decode it with the plugin's schema before `build`
             runs, and MUST provide the result to the build layer as the
             `Plugin.Config` service (identifier
             `@bridger/core/Plugin.Config`).
```

```
REQUIREMENT: A decode failure MUST fail the activation with phase
             "activation" and a `ConfigInvalid { id, message }` cause. `build`
             MUST NOT run, and the activation MUST NOT publish anything. A
             `config-rejected` host event MUST be emitted.
```

Decoding first means a plugin's `build` never sees an invalid value, so no
plugin has to defend against one, and a configuration error can never leave
a half-built service published.

**Settled here.** A plugin that declares no `config` still receives a
`Plugin.Config<void>` whose `value` is `undefined` and whose `changes` never
emits; the build layer's input type is uniform.

## BEH-BR-098: The ConfigSource

> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```ts
type ConfigSource =
  | ConfigProvider.ConfigProvider
  | ((id: string) => Effect.Effect<unknown>)

// BridgerOptions.config?: ConfigSource   — default: the ambient ConfigProvider
```

```
REQUIREMENT: When `BridgerOptions.config` is absent, the host MUST read raw
             configuration from the ambient Effect `ConfigProvider`, with the
             plugin's schema, under the path of the plugin ID, so that
             environment variables, files, any provider the application
             installed and `Config.redacted` work unchanged.
```

```
REQUIREMENT: When `BridgerOptions.config` is a `ConfigProvider`, the host MUST
             read from it in the same way. When it is a function, the host
             MUST call it with the plugin ID and decode its result with the
             plugin's schema.
```

```
REQUIREMENT: Schemas MAY use `Redacted` for secrets, and the host MUST keep
             them redacted on every path it controls (BEH-BR-103).
```

A function source covers stores such as a database without Bridger knowing
anything about them.

**Settled here.** (1) A source that fails to produce a value (the function
fails, or the provider cannot read the path) fails the activation exactly as
a decode failure does: phase "activation", `ConfigInvalid { id, message }`.
(2) The path and the function argument are the plugin ID only, not the realm:
SPEC.md says "the path of the plugin ID". A definition installed in two
realms reads the same source value; per-realm values are supplied as an
override (`InstallOptions.config`, `reconfigure`, or a `reconcile` entry's
`config`). A child plugin's path is its prefixed ID (`parent/child`).

## BEH-BR-099: The source is read at every activation, and an override takes precedence

> **Invariant:** [INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map)
> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```
REQUIREMENT: The host MUST read and decode configuration afresh at every
             activation of the plugin: first start, automatic start after a
             dependency returns, `retry`, `restart`, `replace`,
             `reconfigure` and `enable`. It MUST NOT reuse a value decoded
             for an earlier activation.
```

```
REQUIREMENT: When the host holds an override for the plugin, the override
             MUST be decoded instead of the source value. Otherwise the
             source MUST be read.
```

```
REQUIREMENT: An override MUST be set by `InstallOptions.config` (initial
             override) or by `reconfigure(ref, raw)`; MUST be cleared by
             `reconfigure(ref)` without a value; MUST be dropped by `remove`
             and by `replace`; and MUST be kept by `retry`, `restart`,
             `disable` and `enable`.
```

Reading at every activation makes the source the single default: an operator
who corrects an environment variable and calls `retry` gets the corrected
value, with no hidden cache to invalidate. The override is dropped by
`replace` because the new definition may have a different schema, and an old
override decoded against it would either fail or, worse, decode into
something unintended.

## BEH-BR-100: Plugin.Config and volatile fields

> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```
REQUIREMENT: `Plugin.Config.value` MUST be the configuration decoded at the
             start of the activation and MUST NOT change during it.
```

```
REQUIREMENT: `Plugin.Config.current` MUST return the latest decoded value, and
             `Plugin.Config.changes` MUST be a `SubscriptionRef.changes` feed
             of it: the current value first, then every change, latest-wins.
```

```
REQUIREMENT: Fields not listed in `volatile` MUST be equal in `current` and in
             `value` for the whole activation.
```

```
REQUIREMENT: Every name listed in `volatile` MUST be a field of the decoded
             configuration; a definition listing anything else MUST be
             rejected at install with `InvalidDefinition`.
```

Only volatile fields can change under a running plugin, and the plugin
declares which ones they are. A plugin that has not declared a field volatile
can rely on it never moving, which is the property that lets most plugins
ignore `changes` entirely.

**Settled here.** The install-time check of `volatile` names applies to the
schema's top-level fields; a definition that declares `volatile` without
`config` is also `InvalidDefinition`. A misspelt volatile name would
otherwise turn every change to the intended field into a silent restart, or
a correct name into nothing at all.

## BEH-BR-101: reconfigure validates first, then restarts

> **Invariant:** [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption)
> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```ts
reconfigure(ref: PluginRef, config?: unknown, options?: OperationOptions):
  Effect.Effect<void,
    | UnknownPlugin | ConfigInvalid | Conflict | Superseded | DrainTimeout | WouldDeadlock | CleanupError | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
```

```
REQUIREMENT: With `config`, `reconfigure` MUST decode the value before
             anything is stopped. On `ConfigInvalid` it MUST leave the plugin
             and the existing override untouched and MUST emit a
             `config-rejected` event.
```

```
REQUIREMENT: Without `config`, `reconfigure` MUST clear any override and
             re-read and decode the source before anything is stopped, with
             the same `ConfigInvalid` rule.
```

```
REQUIREMENT: Unless the change is confined to volatile fields (BEH-BR-102),
             `reconfigure` of an active plugin MUST restart the plugin and its
             dependents through the same stop/start path as `replace`:
             dependents first, leases drained under the host's
             `drainTimeout`, then a fresh activation.
```

```
REQUIREMENT: `reconfigure` is a restart, not a live mutation. The host MUST
             NOT mutate a running plugin's non-volatile configuration in
             place.
```

On a plugin that is not `active`, `reconfigure` stores and validates the
value and then follows the state table: a `failed` plugin starts or waits, a
`waiting` plugin simply carries the new value into its next activation, and a
`disabled` plugin keeps it for the next `enable`
([08 — Operation Legality](./08-operation-legality.md)).

**Settled here.** SPEC.md's `reconfigure` signature omitted `DrainTimeout`
and `WouldDeadlock`, although a non-volatile `reconfigure` drains leases like
`restart`. Both are added to the union above, as is `Superseded`, which the
settled legality table produces when a `remove`, `replace` or `disable`
supersedes an in-flight `reconfigure`. `reconfigure` takes no
`drain`/`force` options: it drains under `BridgerOptions.drainTimeout` and
never forces. On `DrainTimeout` the new value is already recorded (intent
survives) and the plugin stays `stopping`; the caller completes the change
with `restart` and a longer `drain` or `force`. Never forcing here is the
conservative choice: a configuration change should not, by itself, interrupt
a running write.

## BEH-BR-102: A volatile-only change does not restart

> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```
REQUIREMENT: `reconfigure` MUST compare the decoded old and new values field
             by field. If every differing field is listed in `volatile`, it
             MUST update the stored value, publish it to
             `Plugin.Config.changes`, emit `config-updated { id, paths }`,
             and MUST NOT change plugin state or restart anything.
```

```
REQUIREMENT: Any difference in a non-volatile field MUST restart the plugin
             and its dependents as in BEH-BR-101.
```

```
REQUIREMENT: `ConfigInvalid` MUST reject the change in both cases and leave
             the plugin untouched.
```

```
REQUIREMENT: `paths` in `config-updated` MUST name the changed fields only and
             MUST NOT carry their values.
```

**Settled here.** (1) Fields are compared with Effect structural equality
(`Equal.equals`) on decoded values; a field whose equality cannot be
established is treated as changed. Erring toward "changed" can at worst
cause an unnecessary restart for a non-volatile field, never a missed one.
(2) When no field differs, nothing restarts and no `config-updated` event is
emitted; the operation completes as a no-op success (audited with
`noop: true`, behaviour 23) unless the override bookkeeping itself changed.

## BEH-BR-103: Configuration values are never observable

> **Invariant:** [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values)
> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: Configuration values — raw, decoded, override or source, secret
             or not — MUST NOT be placed in snapshots, host events, logs,
             spans, metrics, error values, `inspect` results, audit records
             or `OperationRequest`s.
```

```
REQUIREMENT: `ConfigInvalid.message` MUST describe decode issues by path and
             expectation only and MUST NOT quote the offending value.
```

```
REQUIREMENT: Where an audit record or an `OperationRequest` describes a
             configuration change, it MUST carry only
             `configChange: { paths }`, the paths of the changed fields.
```

The only consumer of a configuration value is the plugin it belongs to.
Everything else — operators, dashboards, the audit trail, the approval gate —
needs to know *that* a value changed and *which* field, never *what* it
became. Keeping values out of every observable surface means a secret cannot
leak through a diagnostic channel added later, because no such channel ever
receives one. Audit records carry changed paths only
([ADR-BR-033](../decisions/033-no-config-values-in-audit.md)); an approver
who needs to see a proposed value obtains it from the consumer's own
change-control system, not from Bridger.

**Settled here.** SPEC.md says `ConfigInvalid` carries decode issues "with
`Redacted` values omitted". This specification is stricter: no value is
quoted, redacted or not, because a schema that forgot to mark a secret
`Redacted` would otherwise leak it through an error. A plugin's *own* errors
and causes are its author's responsibility; the core never inserts a
configuration value into them.

## BEH-BR-104: meta is opaque except where named

> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)

```ts
readonly meta?: {
  readonly version?: string
  readonly digest?: string
  readonly description?: string
  readonly tags?: readonly string[]
}
```

```
REQUIREMENT: The core MUST treat `meta` as opaque, except that `reconcile`
             compares `version` and `digest` (behaviour 18).
```

```
REQUIREMENT: Snapshots MUST expose `meta.version`, `meta.digest` and
             `meta.description` when present, so that adapters and admin
             screens can display them. When an `AuditSink` is wired, audit
             `before` and `after` states MUST carry `version` and `digest`
             when present.
```

```
REQUIREMENT: The core MUST NOT verify `meta.digest` against the loaded code
             and MUST NOT describe it as verified.
```

`version` and `digest` in audit records are what let a reader answer "which
version of this plugin was active at that time". They are only as truthful
as whoever set them: verifying that a digest matches the code actually
loaded belongs to the loader adapter
([RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)).

---

_Previous: [10 — Runtime Failure and Health](./10-runtime-failure-and-health.md)_ · _Next: [12 — Shutdown and Hosting](./12-shutdown-and-hosting.md)_
