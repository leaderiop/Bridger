# 11 — Configuration

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-11                                               |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-10): BEH-BR-104 lists every place `meta` is not opaque: reconcile, plan and `expect`, the manifest and lazy-load checks, the `RefusalList` subject (C4) (CCR-BR-035)<br>0.8 (2026-11-10): BEH-BR-101 `reconfigure` without a value on a registration not yet loaded clears the override without decoding the source (C4); BEH-BR-102 `config-updated { pluginId, paths }` (audit round 2, Low) (CCR-BR-034)<br>0.7 (2026-11-09): BEH-BR-101 the `reconfigure` union adds `ConfigFingerprintUnavailable`, as BEH-BR-013 (C-01) (CCR-BR-032)<br>0.6 (2026-11-08): BEH-BR-101 `reconfigure` takes `HandoffCallOptions`; handoff on a restarting reconfigure when declared (34, BEH-BR-353) (CCR-BR-025)<br>0.5 (2026-11-08): `reconfigure` on any registration not yet loaded recorded as `install` with `config` (CCR-BR-022)<br>0.4 (2026-11-08): BEH-BR-097 decode after load and BEH-BR-101 raw value stored for an unloaded lazy registration; BEH-BR-104 manifest agrees with `version` and `digest` (CCR-BR-017); BEH-BR-104 points to the loader companion (CCR-BR-021)<br>0.3 (2026-10-03): BEH-BR-103 values may leave core only to the optional `ConfigFingerprinter` port at step 4a of BEH-BR-188; `configChange: { paths, fingerprints? }`; Settled paragraph (CCR-BR-014)<br>0.2 (2026-10-02): An ended operator intent reverts every override change made under it, to the override before the first; the paths are recorded on its `intent-ended` record; a resuming `reconfigure` stores its override only when decided (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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

For a lazy registration whose code is not yet loaded, the raw value is read
and decoded after the load and before `build`, since the schema is part of
the loaded definition
([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
BEH-BR-246).

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
             and by `replace`; MUST be kept by `retry`, `restart`,
             `disable` and `enable`; and, when a parked operator intent under
             which it was changed is ended, MUST revert to the override in
             effect before the first change made under that intent
             (BEH-BR-101).
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
reconfigure(ref: PluginRef, config?: unknown, options?: OperationOptions & HandoffCallOptions):   // HandoffCallOptions: 34, BEH-BR-353
  Effect.Effect<void,
    | UnknownPlugin | ConfigInvalid | ConfigFingerprintUnavailable | Conflict | Superseded | DrainTimeout
    | WouldDeadlock | CleanupError | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>   // ConfigFingerprintUnavailable: 22, BEH-BR-188, step 4a
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
             the same `ConfigInvalid` rule — except on a registration not
             yet loaded, whose schema is in code not loaded: there it MUST
             clear the override without reading or decoding the source, and
             the source is decoded at the next build (27 — Manifest and
             Lazy Activation, BEH-BR-247).
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

```
REQUIREMENT: When a parked operator intent (08 — Operation Legality,
             BEH-BR-074) is ended by a cascade, whatever its root, or by
             shutdown (BEH-BR-080; 12 — Shutdown and Hosting, BEH-BR-105),
             every override change made under that intent — by any call: a
             parked `reconfigure`, or a `reconfigure` that joined a parked
             operation — MUST revert, in the same revision in which the
             intent ends, to the override in effect before the first of them
             (the last completed configuration), including to no override.
             The `intent-ended` record that the host writes in that revision
             (23 — Audit Sink and Record) MUST carry `configChange.paths` with
             the paths of every reverted field, and never their values; the
             plugin's later `system-stop` record MUST NOT carry them.
```

```
REQUIREMENT: A `reconfigure` that resumes a parked system stop (08 — Operation
             Legality, BEH-BR-074) MUST store its override only when it is
             decided, after the stop has settled. If its drain expires again,
             it parks as its own parked operation with nothing of it stored,
             and ending that intent MUST revert nothing of it.
```

On a plugin that is not `active`, `reconfigure` stores and validates the
value and then follows the state table: a `failed` plugin starts or waits, a
`waiting` plugin simply carries the new value into its next activation, and a
`disabled` plugin keeps it for the next `enable`
([08 — Operation Legality](./08-operation-legality.md)). On a lazy
registration not yet loaded (`dormant`, or `disabled`, `waiting` or `failed`
with phase "load" before any load succeeded), the value is stored raw and
decoded only after the load, and the call is recorded as an `install` with
`config` would be: top-level keys as paths, form "raw" for a fingerprinter
(27, BEH-BR-247).

A restarting `reconfigure` hands off state when the definition's
`handoff.alsoOn` lists it, unless the call passes `cold: true`
([34 — State Handoff](./34-state-handoff.md), BEH-BR-353); a volatile-only
change keeps the activation and hands off nothing.

**Settled here.** SPEC.md's `reconfigure` signature omitted `DrainTimeout`
and `WouldDeadlock`, although a non-volatile `reconfigure` drains leases like
`restart`. Both are added to the union above, as is `Superseded`, which the
settled legality table produces when a `remove`, `replace` or `disable`
supersedes an in-flight `reconfigure`. `reconfigure` takes no
`drain`/`force` options: it drains under `BridgerOptions.drainTimeout` and
never forces. On `DrainTimeout` the new value is already recorded (intent
survives) and the plugin stays `stopping`, its stop parked; the caller
completes the change with `restart` and a longer `drain` or `force`, which
joins and resumes the parked operation. Never forcing here is the
conservative choice: a configuration change should not, by itself, interrupt
a running write.

**Settled here.** When a cascade ends a parked `reconfigure`'s intent
(CCR-BR-008), keeping the new value would let the plugin's next activation —
started by availability, not by any call — run a configuration whose change
was never completed and whose caller was told `DrainTimeout`. The override
therefore reverts with the intent, and the `intent-ended` record — written
when the intent ends, not when the stop later settles — names the reverted
paths, so the trail shows that the stored configuration changed back and which
fields did. An intent can carry more than one override change: a `reconfigure`
that joins a parked `restart` sets its override under the restart's intent,
on top of any change already made under it. Reverting only the last change
would leave an earlier one standing, so all of them revert together, to the
configuration last completed before the intent. A
`reconfigure` that resumes a parked system stop has stored nothing yet — it is
decided only once the stop settles — so there is nothing of it to revert.

## BEH-BR-102: A volatile-only change does not restart

> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```
REQUIREMENT: `reconfigure` MUST compare the decoded old and new values field
             by field. If every differing field is listed in `volatile`, it
             MUST update the stored value, publish it to
             `Plugin.Config.changes`, emit `config-updated { pluginId, paths }`,
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
> **See:** [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008), [RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)

```
REQUIREMENT: Configuration values — raw, decoded, override or source, secret
             or not — MUST NOT be placed in snapshots, host events, logs,
             spans, metrics, error values, `inspect` results, audit records
             or `OperationRequest`s. The one place a value MAY leave core is
             the consumer's optional `ConfigFingerprinter` port, at step 4a
             of BEH-BR-188, and then only the values of the paths the port
             selected (22 — Attributable Operations).
```

```
REQUIREMENT: `ConfigInvalid.message` MUST describe decode issues by path and
             expectation only and MUST NOT quote the offending value.
```

```
REQUIREMENT: Where an audit record or an `OperationRequest` describes a
             configuration change, it MUST carry only
             `configChange: { paths, fingerprints? }`: the paths of the
             changed fields and, when a `ConfigFingerprinter` is wired, the
             fingerprints its port returned for the selected paths
             (23 — Audit Sink and Record, BEH-BR-197). Core MUST NOT
             compute a fingerprint or hash of a value itself.
```

The only consumer of a configuration value is the plugin it belongs to.
Everything else — operators, dashboards, the audit trail, the approval gate —
needs to know *that* a value changed and *which* field, never *what* it
became. Keeping values out of every observable surface means a secret cannot
leak through a diagnostic channel added later, because no such channel ever
receives one. Audit records carry changed paths only, and at most the
fingerprints a consumer's own port returned
([ADR-BR-033](../decisions/033-no-config-values-in-audit.md),
[ADR-BR-039](../decisions/039-config-fingerprint-port.md)); an approver
who needs to see a proposed value obtains it from the consumer's own
change-control system, not from Bridger.

**Settled here.** SPEC.md says `ConfigInvalid` carries decode issues "with
`Redacted` values omitted". This specification is stricter: no value is
quoted, redacted or not, because a schema that forgot to mark a secret
`Redacted` would otherwise leak it through an error. A plugin's *own* errors
and causes are its author's responsibility; the core never inserts a
configuration value into them.

**Settled here (CCR-BR-014).** An approver who must bind an approval to the
value it covers, and not only to its path, can do so through fingerprints
supplied by the consumer's own `ConfigFingerprinter` port
([ADR-BR-039](../decisions/039-config-fingerprint-port.md)). The port is
asked for a selection by path first and receives only the selected values;
it receives no attribution, and a failure of it fails the call closed with a
message core writes itself
([22 — Attributable Operations](./22-attributable-operations.md),
BEH-BR-188, step 4a). A fingerprint is not a configuration value: it is the
port's string, carried unchanged, and core computes none. With no
fingerprinter wired, `configChange` carries paths only and no value ever
leaves core. The risk that a port passes values on is
[RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024); the port is the
consumer's to review.

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
REQUIREMENT: The core MUST treat `meta` as opaque, except in exactly these
             places, where it compares `version` and `digest` as given or
             tests whether a digest is declared:
             - `reconcile`'s comparison of definitions (behaviour 18,
               BEH-BR-154);
             - a plan's `incoming` and the comparison `expect` makes
               (32 — Generic Gate and Plan, BEH-BR-318, BEH-BR-319);
             - a definition's `manifest`, which MUST agree with them, and
               the loaded definition of a lazy registration, whose digest
               MUST equal the registered one
               ([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
               BEH-BR-242, BEH-BR-246);
             - the `RefusalList`, which is consulted only for a definition
               that declares a digest, with that digest as the subject
               (28 — Plugin Principal and Mandatory Policy, BEH-BR-267).
             Copying `version` and `digest` unchanged into snapshots,
             records, gate requests and the plugin principal is not an
             exception: the core reads nothing into them there.
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
loaded belongs to the loader companion
([references/loader/](../../loader/README.md), BEH-LD-007;
[RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)).

---

_Previous: [10 — Runtime Failure and Health](./10-runtime-failure-and-health.md)_ · _Next: [12 — Shutdown and Hosting](./12-shutdown-and-hosting.md)_
