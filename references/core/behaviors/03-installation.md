# 03 — Installation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-03                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-11): BEH-BR-018, BEH-BR-019 `DuplicateProvider` carries `providerRealm`; BEH-BR-018, BEH-BR-020 `DependencyCycle.path` lists `{ id, realm }` records (C2) (SPEC-AUDIT-05) (CCR-BR-037)<br>0.6 (2026-11-10): BEH-BR-017 `install` registers a lazy definition `dormant`, and a start refused after step 4b `disabled` with reason "refused-digest" (C3) (CCR-BR-034)<br>0.5 (2026-11-09): BEH-BR-017 `install` unions add `ConfigFingerprintUnavailable` and BEH-BR-024 `PluginHandle.restart` takes `HandoffCallOptions`, as BEH-BR-013 (C-01); BEH-BR-018 precedence names steps 4a and 4b; BEH-BR-023 a disabled installation also runs `IncompatibleEngine` and defers `IncompatibleContract`, and a `replace` that leaves the plugin disabled runs the same checks and reserves nothing (U-07, U-08) (CCR-BR-032)<br>0.4 (2026-11-08): generic `install` overload takes the branded `Plugin`; `UnknownRealm` at the linearization point after a retirement (CCR-BR-022)<br>0.3 (2026-11-08): BEH-BR-017 non-generic `Plugin.Any` overload (CCR-BR-020); BEH-BR-018 `IncompatibleContract`, `IncompatibleEngine` and precedence, BEH-BR-019/020 lazy definitions read from the manifest (CCR-BR-017); BEH-BR-022 `mandatory`, `allowChildren` (CCR-BR-018)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

This file specifies `install`: what it registers, when it completes, the
definition errors that make it register nothing, why activation outcomes are
state rather than errors, `InstallOptions` (including installing a plugin
`disabled`), and the `PluginHandle` it returns, with `awaitActive`. It
converts the `install` paragraphs of the SPEC.md section "Host interface",
the `InstallError` part of "Errors", the install row of "Operation semantics
and races", and the handle paragraph of "Plugin handles, children and
groups" (children and groups are converted in
[14 — Children and Groups](./14-children-and-groups.md)). This file owns
BEH-BR-017–024 and uses all eight.

`install` is a mutating operation. Like every such operation it is attributed,
gated and audited as specified in
[22 — Attributable Operations](../behaviors/22-attributable-operations.md) and
[23 — Audit Sink and Record](../behaviors/23-audit-sink-and-record.md); those
rules are not repeated here.

## BEH-BR-017: install registers a plugin at once and returns a handle

> **See:** [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-012](../decisions/012-intent-and-linearization.md)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```ts
// illustrative — not type-checked
install<R extends Keys, P extends Keys, E, C>(
  plugin: Plugin<R, P, E, C>,                  // the branded value Plugin.define returns (01)
  options?: InstallOptions
): Effect.Effect<PluginHandle,
  | InstallError | ConfigFingerprintUnavailable | HostClosed
  | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
install(                                   // non-generic overload (01, BEH-BR-001; 27, BEH-BR-244)
  plugin: Plugin.Any | LazyPluginDefinition,
  options?: InstallOptions
): Effect.Effect<PluginHandle,
  | InstallError | ConfigFingerprintUnavailable | HostClosed
  | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
```

The non-generic overload accepts every value of `Plugin.define` without a
cast, for heterogeneous lists; `replace` has the same overload (BEH-BR-013).
A `LazyPluginDefinition` is registered as `dormant` from its manifest
([27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md),
BEH-BR-244, BEH-BR-247).

```
REQUIREMENT: `install` MUST record the definition when it is called and MUST
             register the plugin in the realm named by `options.realm`
             (default "default"), in exactly one of these states:
             `disabled` when `options.disabled` is true; otherwise `dormant`
             for a lazy definition (27 — Manifest and Lazy Activation,
             BEH-BR-244); otherwise `waiting`
             when at least one required key has no active provider in its
             resolution scope; otherwise `starting`. A start that a wired
             `RefusalList` refuses after step 4b registers it `disabled`
             with reason "refused-digest" instead (28 — Plugin Principal and
             Mandatory Policy, BEH-BR-267).
```

```
REQUIREMENT: `install` MUST complete, returning a `PluginHandle`, once the
             snapshot revision that contains the new plugin has been
             published. It MUST NOT wait for the plugin's `build`.
```

```
REQUIREMENT: The host MUST emit a `plugin-installed` event for every
             successful `install`, and no such event for a failed one.
```

The caller does not order providers. Installing `audit` before `logger`
records `audit` as `waiting`; installing `logger` then starts both, provider
first ([05 — Activation](./05-activation.md)). Completing on publication of
the snapshot rather than on build means a caller who reads `snapshot()` right
after `install` returns always sees the plugin, and a caller who wants the
build outcome asks the handle (BEH-BR-024).

**Settled here.** SPEC.md's state diagram enters every plugin through
`waiting`, while the settled `PluginSnapshot` of
[04 — States and Snapshots](./04-states-and-snapshots.md) requires a
`waiting` entry to have at least one missing service. A plugin whose
requirements are all available at install is therefore registered directly in
`starting` (queued for a build slot), never as a `waiting` entry with nothing
missing.

## BEH-BR-018: A definition error fails the call and registers nothing

> **Invariant:** [INV-BR-012](../invariants.md#inv-br-012-a-definition-error-registers-nothing)
> **See:** [ADR-BR-008](../decisions/008-error-taxonomy.md)
> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers)

```ts
// illustrative — not type-checked
type InstallError = DuplicatePlugin | DuplicateProvider | DependencyCycle | InvalidDefinition | UnknownRealm
  | IncompatibleContract | IncompatibleEngine                         // 26, 27
// UnknownRealm is also raised at the linearization point when the realm was retired after
// validation (08 — Operation Legality, BEH-BR-065; 33 — Realm Families, BEH-BR-335).

class DuplicatePlugin   extends Schema.TaggedError<DuplicatePlugin>()("DuplicatePlugin", { id: Schema.String }) {}
class DuplicateProvider extends Schema.TaggedError<DuplicateProvider>()("DuplicateProvider",
  { serviceId: Schema.String, providerId: Schema.String,               // providerId: plugin ID or "base"
    providerRealm: Schema.optional(Schema.String) }) {}                // the provider's realm; absent for "base"
class DependencyCycle   extends Schema.TaggedError<DependencyCycle>()("DependencyCycle",
  { path: Schema.Array(Schema.Struct({ id: Schema.String, realm: Schema.String })) }) {}   // plugins, as { id, realm }
class InvalidDefinition extends Schema.TaggedError<InvalidDefinition>()("InvalidDefinition",
  { id: Schema.String, reason: Schema.String }) {}
class UnknownRealm      extends Schema.TaggedError<UnknownRealm>()("UnknownRealm", { id: Schema.String }) {}
```

```
REQUIREMENT: `install` MUST fail with:
             - `UnknownRealm` when `options.realm` names a realm that was
               never defined;
             - `InvalidDefinition` when the definition breaks a rule of
               BEH-BR-003 (01 — Plugin Definition), or its manifest fails
               to decode or disagrees with it (27 — Manifest and Lazy
               Activation, BEH-BR-241, BEH-BR-242); manifest decoding runs
               first within this check;
             - `IncompatibleEngine` when the manifest's
               `engines["@bridger/core"]` is not satisfied (BEH-BR-241);
             - `DuplicatePlugin` when the ID is already known in the realm,
               in any state (BEH-BR-005);
             - `DuplicateProvider` per BEH-BR-019;
             - `DependencyCycle` per BEH-BR-020;
             - `IncompatibleContract` when a registered contract pair it
               takes part in is incompatible (26 — Versioned Contracts,
               BEH-BR-228);
             - `HostClosed` once shutdown has started.
```

```
REQUIREMENT: When `install` fails, the host MUST NOT register anything: no
             snapshot entry, no revision increment, no reserved provider
             slot, no stored configuration override, and no
             `plugin-installed` event.
```

```
REQUIREMENT: When more than one check would fail, `install` MUST report the
             first in this order: `HostClosed`; the attribution and latch
             checks (22, 23); `UnknownRealm`, `InvalidDefinition`,
             `IncompatibleEngine`, `DuplicatePlugin`, `DuplicateProvider`,
             `DependencyCycle`, `IncompatibleContract`; then
             `ConfigFingerprintUnavailable` (22, BEH-BR-188, step 4a), the
             refusal list (step 4b) and the gate (25). The definition
             checks run before the gate is consulted and before any
             `requested` record is written.
```

```
REQUIREMENT: The duplicate, provider and cycle checks MUST run within the
             plugin's resolution scope (its realm, per 17 — Realms and
             Interception) and against the definitions installed at the
             moment the call is linearized (08 — Operation Legality).
```

Definition errors are things wrong with the *definition* relative to what is
installed: an ID already taken, a key already provided, a cycle closed. They
are known at the call and they are the caller's to fix, so they fail the call.
A half-registered plugin — present in the snapshot but holding no provider
slot, or holding a slot with no entry — would be an inconsistency every later
operation would have to reason about. Registering nothing keeps the rule
simple: a failed `install` leaves the host exactly as it was.

Because the checks run against what is installed now, their result can depend
on install order: of two plugins that provide one key, whichever installs
second is rejected. That is accepted; the alternative would be to defer the
conflict to activation time, where it would surface as a race.

The definition checks are evaluated before the gate and the `requested`
record, per the common check order of [22 — Attributable
Operations](./22-attributable-operations.md) (BEH-BR-188); they are evaluated
again at the moment the call
is linearized, because another call on the same realm may have changed the
installed set in between ([08 — Operation Legality](./08-operation-legality.md)).

**Settled here.** SPEC.md lists the five errors but no precedence. A fixed
order makes the error for a given definition and installed set deterministic,
so the same inputs always produce the same rejection and the same audit
record.

## BEH-BR-019: One provider per key per resolution scope

> **Invariant:** [INV-BR-001](../invariants.md#inv-br-001-one-provider-per-service-key-per-realm)
> **See:** [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)

```
REQUIREMENT: `install` MUST fail with `DuplicateProvider { serviceId,
             providerId, providerRealm? }` when a key in `provides` is
             already provided in the plugin's resolution scope by the base
             services (`providerId` "base", no `providerRealm`) or by an
             installed plugin in any state other than `disabled`
             (`providerId` that plugin's ID, `providerRealm` its realm;
             CCR-BR-037). For a
             lazy definition the keys are read from its manifest
             (27 — Manifest and Lazy Activation, BEH-BR-242).
```

```
REQUIREMENT: A plugin's provider slots MUST be reserved from the revision in
             which it is registered until the revision in which it is
             unregistered or disabled, whether or not it is `active`.
```

Reserving slots at registration, not at activation, is what makes the check
mean something. If only `active` providers counted, two `waiting` plugins
could both claim one key and whichever built first would win — an outcome
decided by timing, invisible at install, and different on the next run. A
`failed` plugin (including one whose cleanup failed) and a `stopping` one keep
their slots for the same reason; a `disabled` plugin frees its slot by design
([07 — Replacement and Reactivation](./07-replacement-and-reactivation.md)).

Which slot a key occupies is fixed by the resolution rules of
[17 — Realms and Interception](./17-realms-and-interception.md): a key that is
isolated in realm R occupies R's slot, and a key that is not isolated in R,
provided by a plugin installed in R, is published in — and checked against —
the default realm's slot.

Several implementations behind one key are an application concern, normally a
`ContributionRegistry` they each register into
([19 — Contribution Registry](./19-contribution-registry.md)).

**Settled here.** SPEC.md says a key "already provided by an installed
plugin" without saying whether a non-active plugin counts. Every registered,
non-disabled plugin counts, for the reason above.

## BEH-BR-020: Dependency cycles are rejected at install

> **Invariant:** [INV-BR-002](../invariants.md#inv-br-002-the-dependency-graph-is-acyclic-per-resolution-scope)

```
REQUIREMENT: `install` MUST fail with `DependencyCycle { path }` when adding
             the definition's `requires` and `provides` edges to the graph
             of installed, non-disabled plugins in its resolution scope
             would close a cycle. `path` MUST list the plugins along the
             cycle, each as the record `{ id, realm }` (17 — Realms and
             Interception, BEH-BR-147; CCR-BR-037), beginning with the
             plugin being installed. For a lazy
             definition the edges are read from its manifest
             (27 — Manifest and Lazy Activation, BEH-BR-242).
```

```
REQUIREMENT: Keys listed in `optional` MUST NOT take part in cycle
             detection (15 — Optional and Reactive Dependencies). Base
             services MUST NOT take part, since they depend on no plugin.
```

A cycle among `requires` can never start: each plugin waits for another that
waits for it. Rejecting it at install turns a silent permanent `waiting` into
an error naming the loop. Optional keys are excluded because they never gate
activation, so a loop through one cannot deadlock.

## BEH-BR-021: Activation outcomes are state, never errors of install

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: Missing requirements MUST leave the plugin `waiting`, and a
             failed activation MUST record it as `failed` with phase "build"
             or "activation". Neither MUST be reported as an error of
             `install`.
```

```
REQUIREMENT: The core MUST NOT offer a mode in which `install` fails because
             its plugin failed to activate. An adapter MAY apply a stricter
             policy to its initial plugin set; later failures MUST remain
             visible in snapshots.
```

Activation happens later, depends on other plugins, and can succeed after the
call has returned, so there is no single moment at which `install` could
report it honestly. Keeping it in state means one place to look — the snapshot
and the handle — whatever triggered the activation. The React and FoldKit
adapters in the source design fail startup after cleanup when an initial
plugin fails; that policy is theirs, built on `changes` and `awaitActive`.

## BEH-BR-022: InstallOptions

> **Satisfies:** [URS-BR-001](../urs.md#urs-br-001-install-plugins-at-runtime-without-ordering-providers), [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)

```ts
// illustrative — not type-checked
interface InstallOptions extends OperationOptions {
  readonly realm?: string                             // default "default" (17)
  readonly config?: unknown                           // initial override, as reconfigure would set (11)
  readonly disabled?: boolean                         // register without activating (BEH-BR-023)
  readonly intercept?: readonly Interception<any>[]   // (17)
  readonly mandatory?: readonly MandatoryInterception<any>[]  // inherited by every descendant (28, BEH-BR-260)
  readonly allowChildren?: boolean                    // default true; may it mount children (28, BEH-BR-263)
}
```

```
REQUIREMENT: `options.config`, when given, MUST be stored as the plugin's
             configuration override, exactly as `reconfigure(ref, raw)`
             would store it, and decoded at each activation
             (11 — Configuration).
```

```
REQUIREMENT: `install` MUST NOT decode `options.config` at the call and MUST
             NOT fail with `ConfigInvalid`. A value that does not decode
             MUST fail the activation with phase "activation" and a
             `ConfigInvalid` cause, like any other activation outcome.
```

```
REQUIREMENT: `options.context` MUST be the operation's attribution context
             (22 — Attributable Operations).
```

**Settled here.** SPEC.md calls `InstallOptions.config` an "initial override
(as reconfigure would set)", and `reconfigure` validates before it acts, yet
`install`'s error union has no `ConfigInvalid`. This specification keeps the
union and treats an undecodable initial override as an activation outcome,
consistent with BEH-BR-021: the decode depends on the source and the schema at
activation time, and the plugin may be installed `disabled` or `waiting` long
before any activation.

## BEH-BR-023: A plugin can be installed disabled

> **See:** [ADR-BR-003](../decisions/003-one-provider-per-key-per-realm.md)

```
REQUIREMENT: `install(plugin, { disabled: true })` MUST register the plugin
             in `disabled`, retaining its definition and any configuration
             override, without building it.
```

```
REQUIREMENT: A disabled installation MUST run the checks that concern the
             definition and its identity — `UnknownRealm`,
             `InvalidDefinition`, `IncompatibleEngine` (27 — Manifest and
             Lazy Activation, BEH-BR-242) and `DuplicatePlugin` — in the
             order of BEH-BR-018. It MUST NOT reserve a provider slot or a
             dependency edge, and the checks that concern slots, edges and
             pairs — `DuplicateProvider`, `DependencyCycle` and
             `IncompatibleContract` (26 — Versioned Contracts,
             BEH-BR-228) — MUST be deferred to `enable` (07 — Replacement
             and Reactivation, BEH-BR-062).
```

```
REQUIREMENT: A `replace` that leaves the plugin disabled MUST run the same
             checks as a disabled installation, MUST reserve nothing and
             MUST defer the same three checks to `enable` (07 — Replacement
             and Reactivation, BEH-BR-050).
```

A disabled plugin provides nothing and reserves nothing, so another plugin may
provide the same key meanwhile; that is the purpose of the state. Running the
provider and cycle checks at install would forbid exactly that. `enable`
re-checks both against the installed set of its own moment, which is the
moment they matter.

**Settled here.** SPEC.md says `install` with `disabled` "registers a plugin
directly in this state" without saying which install checks apply. The checks
that concern the definition and its identity apply at install; the checks
that concern slots and edges, which a disabled plugin does not hold, apply at
`enable`. CCR-BR-032 completes both lists with the checks files 26 and 27
added (`IncompatibleEngine` at install, `IncompatibleContract` at `enable`)
and applies them to a `replace` of a disabled plugin, which had been told to
run every `install` check and reserve both definitions' slots although a
disabled plugin holds none.

## BEH-BR-024: PluginHandle and awaitActive

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-010](../urs.md#urs-br-010-detect-a-plugin-that-waits-forever)

```ts
// illustrative — not type-checked
interface PluginHandle {
  readonly id: string
  readonly realm: string
  readonly state: Effect.Effect<PluginState | "uninstalled">     // "uninstalled" once this installation ends
  readonly changes: Stream.Stream<PluginSnapshot>                // this plugin's entries from Host.changes
  readonly awaitActive: (options?: { readonly timeout?: Duration.Input }) =>
    Effect.Effect<void, ActivationFailed | PluginRemoved | WaitTimeout>
  readonly remove: (options?: RemoveOptions) => Effect.Effect<void,
    | UnknownPlugin | CleanupError | DrainTimeout | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
  readonly restart: (options?: RemoveOptions & HandoffCallOptions) => Effect.Effect<void,   // HandoffCallOptions: 34, BEH-BR-353
    | UnknownPlugin | Conflict | Superseded | CleanupError | DrainTimeout | WouldDeadlock | HostClosed
    | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
}
```

```
REQUIREMENT: A handle MUST be bound to the installation that returned it —
             the plugin from that `install` until it is removed. Once that
             installation has ended, `state` MUST yield "uninstalled", and
             `remove` and `restart` MUST fail with `UnknownPlugin` and MUST
             NOT act on a later installation of the same ID.
```

```
REQUIREMENT: `handle.remove(o)` and `handle.restart(o)` MUST be exactly
             `host.remove(ref, o)` and `host.restart(ref, o)` for the
             handle's installation, with the same error unions, legality and
             audit behaviour.
```

```
REQUIREMENT: `changes` MUST emit the installation's current entry first and
             then each entry that differs from the previous one, and MUST
             end when the installation ends.
```

```
REQUIREMENT: `awaitActive` MUST:
             - succeed when the plugin is or becomes `active`;
             - fail fast with `ActivationFailed { id, phase, message }` when
               the plugin is or becomes `failed`;
             - fail with `PluginRemoved { id }` when the installation ends,
               or its definition is replaced, before it becomes `active`;
             - fail with `WaitTimeout { id, timeout }` when `timeout` passes.
             Without `timeout` it MUST NOT time out while the plugin is
             `waiting` or `disabled`.
```

The handle is the per-plugin view an application keeps after installing: the
Bridger counterpart of Cordis's fiber handle. `awaitActive` fails fast with the
failure's phase and message rather than waiting for a timeout, because a
`failed` plugin will not become active until someone acts
([INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)). It does not time
out on `waiting` by default, because waiting for a provider that has not yet
been installed is a normal condition, not an error; a caller who needs a
bound passes one.

**Settled here.**
(1) SPEC.md typed `PluginHandle.restart` as a bare `Effect` whose error union
lacked `DrainTimeout` and `WouldDeadlock`, although it is `Host.restart`. It is
now a function taking `RemoveOptions` (so it can carry `drain`, `force` and an
`OperationContext`) with exactly `Host.restart`'s union.
(2) SPEC.md did not say what a handle refers to after its plugin is removed
and the same ID installed again. A handle is bound to its own installation: a
stale handle must never remove or restart somebody else's plugin.
(3) "Superseded first" in SPEC.md is read as "its definition replaced before
activation": the caller awaited the activation of the definition it
installed, and resolving on a different definition's activation would tell it
something untrue.
(4) A `disabled` plugin is treated like a `waiting` one: `awaitActive` keeps
waiting (bounded only by `timeout`), since `enable` may follow.

---

_Previous: [02 — Host Construction](./02-host-construction.md)_ · _Next: [04 — States and Snapshots](./04-states-and-snapshots.md)_
