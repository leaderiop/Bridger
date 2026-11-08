# 28 — Plugin Principal and Mandatory Policy

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-28                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): `onBehalfOf` defined as the principal of the calling fiber, with the provider case stated; principal retired after the activation's finalizers; `child` access requests carry the parent activation's principal; principal `revision` defined; realms of `Host.use` from plugin code; mandatory interceptions are application-wired and cover host captures only (not base-service reads); `who` before the access check; unwired-sameness reworded (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018); hook calls under the owner's principal and the hook registry's access check (CCR-BR-019) |

---

Files 22–25 answer *who* asked for a change: an `Actor` stated by the caller.
They deliberately do not say *which plugin's code* made the call, because the
only plugin identity core had — `@bridger/core/ActivePlugin` — is a diagnostic
reference that any code can provide, and an identity anyone can provide is
not evidence of anything (13 — Observability and Diagnostics, BEH-BR-119;
22 — Attributable Operations, BEH-BR-190). A host that composes many plugins
needs both answers: "J. Rivera asked" and "the call ran on behalf of the
`billing/export` plugin, version 2.3.1" — the plugin whose principal the
calling code carried (BEH-BR-258 says which code carries which principal). It also needs a few policies that no
plugin can switch off: a wrapper on a sensitive service that a child cannot
replace (BEH-BR-151 lets a child's own `intercept` replace what it inherits),
a rule that a plugin may not mount children, and rules on who may emit or
listen on the event bus and who may contribute to a registry.

This file adds a **plugin principal** (`CurrentPlugin`) that only the host
can create, records it as `onBehalfOf` beside the `Actor` when plugin code
calls a mutating host operation, and adds **mandatory interceptions**, an
**`allowChildren`** install option and an optional **`AccessPolicy`** port.
It has no SPEC.md source section; it extends the interception rules of
[17 — Realms and Interception](./17-realms-and-interception.md) and resolves
the conflict "a child's interception replaces the ones it inherited"
([ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)).
This file owns BEH-BR-257–272 and uses BEH-BR-257–266; numbers 267–272 of the block are
reserved.

> **What this is not**
>
> Everything in this file is **attribution and policy inside one trusted
> process**. It is not isolation and not a sandbox
> ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md),
> [ADR-BR-027](../decisions/027-core-exclusions.md)). In-process plugin code
> can hold references it was never granted, import another plugin's module,
> leak its own `Plugin.Runtime`, or call a provider by a route core never
> sees. The principal tells honest, cooperating code apart in the trail; the
> policies stop honest mistakes and make deliberate circumvention require
> code that a review can find. Third-party code does not run in-process: it
> runs out of process behind a local proxy plugin, where a boundary exists
> ([`references/remote/`](../../remote/README.md), companion `@bridger/remote`).

Planned source: `packages/core/src/Principal.ts` and
`packages/core/src/AccessPolicy.ts` *(Planned)*; the interception changes in
`packages/core/src/Resolver.ts` *(Planned)*. Grants and the call log that
compose with mandatory interceptions are in
[29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md).

## BEH-BR-257: CurrentPlugin is a principal that only the host can create

> **Invariant:** [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-016](../decisions/016-reentrancy-detection.md)
> **Satisfies:** [URS-BR-032](../urs.md#urs-br-032-know-which-plugin-made-a-change-and-for-whom)
> **Risk:** [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)

```ts
// illustrative — not type-checked
interface PluginPrincipal {
  readonly id: string                 // the plugin's id, "parent/child" for a child (14)
  readonly realm: string
  readonly version?: string           // the installed definition's meta.version, when declared
  readonly digest?: string            // the installed definition's meta.digest, when declared
  readonly revision: number           // the activation revision: the HostSnapshot.revision (04, BEH-BR-029)
                                      // of the snapshot in which this activation entered `starting`
}

declare const CurrentPlugin: {
  // reads the principal of the calling fiber; none outside plugin code
  readonly get: Effect.Effect<Option.Option<PluginPrincipal>>
  readonly require: Effect.Effect<PluginPrincipal, NoPluginPrincipal>
}
class NoPluginPrincipal extends Schema.TaggedError<NoPluginPrincipal>()("NoPluginPrincipal", {}) {}

// defects, never typed errors:
//   PrincipalForged  { id }   — a principal value the host did not mint
//   PrincipalRetired { id }   — a principal whose activation has ended, used to act
```

```
REQUIREMENT: The host MUST mint exactly one `PluginPrincipal` per activation
             of a plugin, when the activation begins, as a frozen value
             recorded in a registry of minted principals private to
             `@bridger/core`. No exported function other than the host's
             activation path MAY mint one.
```

```
REQUIREMENT: The principal of a fiber MUST be carried in a fiber reference
             whose key `@bridger/core` does not export for providing.
             `CurrentPlugin.get` and `CurrentPlugin.require` are the only
             exported ways to read it.
```

```
REQUIREMENT: Whenever core reads a principal — `CurrentPlugin.get`, a
             mutating host call (BEH-BR-259), an access decision
             (BEH-BR-264), a capture (BEH-BR-262; 29 — Capability Grants and
             Call Log) — it MUST check the value against its registry of
             minted principals. A value that was not minted (for example one
             provided through a reference built with the same identifier
             string) MUST make the reading operation die with
             `PrincipalForged`, logged at error level with the claimed id.
             It MUST NOT be treated as absent.
```

```
REQUIREMENT: The host MUST mark a principal retired when the activation
             that minted it has ended: after every finalizer of the
             activation's scope has completed and every fiber of the
             activation (background fibers and their restarts included)
             has been interrupted and has finished, that is at the end of
             the stop step, not when closing begins. Until then the
             principal is live: a finalizer, or the interruption handler of
             a background fiber, MAY emit and listen on the bus, add or
             remove contributions, remove its children and call host
             operations under it, each subject to the same decisions as
             during the activation. A mutating host call, an access decision
             or `Plugin.Runtime.asSelf` (BEH-BR-258) made under a retired
             principal MUST die with `PrincipalRetired`. `CurrentPlugin.get`
             MUST still return a retired principal, so diagnostics can name
             their plugin.
```

```
REQUIREMENT: The activation revision of a principal MUST be the
             `HostSnapshot.revision` (04 — States and Snapshots,
             BEH-BR-029) of the snapshot in which that activation entered
             `starting`. It is unique per activation of a registration and
             is the value written as `PrincipalRef.revision`.
```

```
REQUIREMENT: `PluginPrincipal` MUST NOT be used as an `Actor`, and MUST NOT
             replace or derive the `Actor` of any call (22 — Attributable
             Operations, BEH-BR-190, BEH-BR-191). `ActivePlugin` keeps its
             diagnostic role and MUST NOT be read as a principal.
```

A principal that is forged is treated as an attack or a defect, never as
"no plugin": falling back to "application code" would hand a forger whatever
rights application code has, which is usually more than any plugin's. Dying
is the fail-closed reading.

**Settled here.** (0) Retirement waits for the finalizers because a
finalizer is part of the activation it cleans up: retiring at the start of
closing would make any finalizer that emits under a wired `AccessPolicy`, or
removes a child, die — and a defect in a finalizer is the sticky
`failed(cleanup)` of 08, a far worse outcome than the one retirement exists to
prevent (a leaked runtime acting after its plugin is gone). (1) `ActivePlugin` is kept unchanged and is not upgraded
into the principal: it is a provided reference that helpers read, and its
contract is diagnostic (BEH-BR-119). A second reference with a different
contract keeps both honest. (2) The principal carries `version` and `digest`
because the questions it answers are those of URS-BR-028 — which code, at
which version, made the call — and `revision` so that two activations of the
same definition are distinguishable in a record. (3) The minted-value check
works within one copy of `@bridger/core`; a second copy in the same process
has its own registry and sees no principal at all. That is one more reason
the single-copy check belongs to the toolchain ([`references/kit/`](../../kit/README.md)).

## BEH-BR-258: Which code runs under which principal

> **Invariant:** [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-032](../urs.md#urs-br-032-know-which-plugin-made-a-change-and-for-whom)
> **Risk:** [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)

```ts
// Plugin.Runtime, added (illustrative)
interface PluginRuntimeShape {
  // ...
  readonly principal: PluginPrincipal
  // runs `effect` under this activation's principal, whatever the calling fiber carries
  readonly asSelf: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}
```

```
REQUIREMENT: The host MUST run under the plugin's principal every piece of
             code it starts on a plugin's behalf: the build, the
             activation's finalizers, `Plugin.Runtime.background` fibers and
             their restarts, `whenAvailable` runs, health checks, each
             event listener the plugin registered — a listener under its
             owner's principal, not the dispatcher's — and each hook a
             plugin contributed to a hook point, under the contribution
             owner's principal (31 — Hook Points, BEH-BR-306).
```

```
REQUIREMENT: A service method called by a consumer runs in the consumer's
             fiber. Core MUST NOT change the principal on entry to a
             provider's method: the method runs under the caller's
             principal, or none for application code.
```

```
REQUIREMENT: `Plugin.Runtime.asSelf(effect)` MUST run `effect` under the
             activation's own principal. It is the only way for plugin code
             to act under its own principal from a fiber that carries
             another one, and it is available only to code holding that
             activation's `Plugin.Runtime`.
```

```
REQUIREMENT: Code the host runs with no plugin behind it — application
             code, `Host.use` callbacks from application code, the
             `OperationGate`, the `AuditSink`, the `ConfigFingerprinter`, the
             `AccessPolicy` and the ports of 29 — Capability Grants and
             Call Log (BEH-BR-273, BEH-BR-276) — MUST run with no
             principal set by core.
```

```
REQUIREMENT: The `CurrentActor` rules of BEH-BR-187 are unchanged: plugin
             code still runs with `CurrentActor` reset to
             `Actor.unattributed`, and a plugin that mutates the host states
             its own actor.
```

A provider serving a consumer acts for that consumer, exactly as a
function acts for its caller; if it wants to act on its own account — say,
to restart one of its own children — it says so with `asSelf`, which leaves a
visible line in its code. Setting the provider's principal implicitly on
every call would need core to see every method entry, which it does not.

The consequence for the trail is stated plainly, because it is the edge of
what `onBehalfOf` means (BEH-BR-259): a host mutation that provider P's
method makes while serving consumer A, without `asSelf`, is recorded
`onBehalfOf` A; the same method run from an application `Host.use` callback
is recorded with no `onBehalfOf`. Core records *on whose behalf the code
ran*, not *whose module the code came from*. A provider that mutates the
host on its own account MUST use `asSelf`; that is a rule for plugin authors
which core cannot enforce, and its residual is recorded in
[RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028).

**Settled here.** (1) Listeners run under their owner's principal, not the
emitter's, because a listener is code the host invokes for the plugin that
registered it, like a background fiber. (2) A plugin that hands its
`Plugin.Runtime` to other code lets that code act as it: within one trusted
process core cannot prevent this, and the principal records what the code
did, not what it should have done ([RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)).

## BEH-BR-259: Host mutations from plugin code record onBehalfOf

> **Invariant:** [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-032](../urs.md#urs-br-032-know-which-plugin-made-a-change-and-for-whom), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005), [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §12.4; ALCOA+ Attributable

```ts
// illustrative — not type-checked
interface PrincipalRef {
  readonly id: string
  readonly realm: string
  readonly version?: string
  readonly digest?: string
  readonly revision: number
}

interface OperationRequest { /* 25, BEH-BR-219 */ readonly onBehalfOf?: PrincipalRef }
interface AuditRecord      { /* 23, BEH-BR-195 */ readonly onBehalfOf?: PrincipalRef }
```

```
REQUIREMENT: `onBehalfOf` MUST name the principal of the calling fiber —
             the plugin on whose behalf the calling code runs under the
             rules of BEH-BR-258 — and nothing else. At step 2 of
             BEH-BR-188 (attribution), the host MUST read the calling
             fiber's principal. When one is present and minted, the
             call's resolved context MUST carry `onBehalfOf`: the
             principal's `id`, `realm`, `version`, `digest` and `revision`,
             each optional field absent when the principal lacks it.
```

```
REQUIREMENT: `onBehalfOf` MUST be passed to the `OperationGate` as
             `OperationRequest.onBehalfOf` and MUST be written on every
             record of the call — `requested`, `rejected` and terminal — and
             on the records of each entry of a `reconcile` made under it. It
             MUST be absent when the call has no principal.
```

```
REQUIREMENT: `OperationContext` MUST NOT have an `onBehalfOf` field. A
             caller MUST NOT be able to set, override or remove it through
             `options.context`, `CurrentActor` or any option.
```

```
REQUIREMENT: `onBehalfOf` MUST NOT count as an actor. A call from plugin
             code with no stated actor is attributed to
             `Actor.unattributed` and, under `attribution.require`, MUST
             fail with `Unattributed` exactly as before (BEH-BR-189).
```

```
REQUIREMENT: System records (BEH-BR-199) MUST NOT carry `onBehalfOf`. A
             child's mount and removal are system transitions whose target
             already names the parent by its prefixed id (14 — Children and
             Groups, BEH-BR-122, BEH-BR-126).
```

```
REQUIREMENT: Like the actor, `onBehalfOf` MUST reach the gate and the sink
             only. It MUST NOT appear in `Host.events`, logs, spans or
             metrics (BEH-BR-192), and MUST NOT reach the
             `ConfigFingerprinter`.
```

A record that says actor `u-1042`, `onBehalfOf: billing/export@2.3.1` says
both what the trail could not say before: the person on whose request the
change happened, and the plugin on whose behalf the calling code ran — the
plugin itself for its build, finalizers, background fibers, listeners, hooks
and `asSelf` blocks, and the consumer for a provider's method serving that
consumer (BEH-BR-258). A gate can use the field
to refuse plugin-initiated changes outright, or only those from plugins at a
withdrawn version.

**Settled here.** (1) `onBehalfOf` is a new optional field of the version-1
`AuditRecord` shape, on the same pre-release ground on which revision 0.5 of
23 — Audit Sink and Record added `definition` without changing
`schemaVersion` (BEH-BR-195, Settled (4)); after a release it would require a
new `schemaVersion`. (2) The field is not merged into `Actor`: an actor is a
claim the caller makes and core never infers
([ADR-BR-029](../decisions/029-attributable-mutations.md)); a principal is a
fact the host establishes. Mixing them would make every record ambiguous
about which kind of identity it carries.

## BEH-BR-260: Mandatory interceptions cannot be replaced or removed

> **Invariant:** [INV-BR-036](../invariants.md#inv-br-036-a-mandatory-interception-reaches-every-capture-in-its-scope)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
type Consumer =
  | { readonly kind: "plugin"; readonly pluginId: string; readonly realm: string; readonly principal: PrincipalRef }
  | { readonly kind: "application"; readonly realm: string }

interface MandatoryInterception<S> {
  readonly key: Context.Key<any, S>
  readonly wrap: (service: S, consumer: Consumer) => S
  readonly appliesTo?: "plugins" | "all"          // default "all": also Host.use from application code (BEH-BR-262)
}

interface BridgerOptions { /* ... */ readonly mandatory?: readonly MandatoryInterception<any>[] }
interface RealmOptions   { /* ... */ readonly mandatory?: readonly MandatoryInterception<any>[] }
interface InstallOptions { /* ... */ readonly mandatory?: readonly MandatoryInterception<any>[] }
```

```
REQUIREMENT: Mandatory interceptions MUST come from three places only, each
             fixed when it is given: `BridgerOptions.mandatory` (every
             consumer of the host), `RealmOptions.mandatory` (every consumer
             in that realm), and `InstallOptions.mandatory` (that plugin and
             every descendant). No operation MAY change or remove them; a
             registration's `InstallOptions.mandatory` persists through
             `replace`, `restart`, `reconfigure`, `disable`, `enable` and
             `retry`, and ends only with `remove`.
```

```
REQUIREMENT: A child MUST inherit every mandatory interception of its
             parent's `InstallOptions.mandatory` and those the parent
             inherited, whatever its own install options say. A child's own
             `intercept` (BEH-BR-151) MUST replace only the ordinary
             interceptions it inherits, never a mandatory one. A child MAY
             add mandatory interceptions through its own `mandatory` option;
             it MUST NOT be able to remove one.
```

```
REQUIREMENT: A child installed into another realm MUST keep the mandatory
             interceptions it inherits by installation and MUST receive its
             own realm's `RealmOptions.mandatory`, not its parent's realm's
             (consistent with BEH-BR-151 for ordinary realm interceptors).
```

```
REQUIREMENT: A mandatory `wrap` that throws or dies MUST fail the consumer's
             activation with phase `activation`, exactly as BEH-BR-152
             states for ordinary interceptions; for `Host.use`, `useAll` and
             `lease` (BEH-BR-262) the call MUST die and MUST NOT run its
             callback. A consumer MUST never receive the service without a
             mandatory interception that applies to it.
```

```
REQUIREMENT: Mandatory interceptions MUST obey BEH-BR-152: leases are on the
             provider, a wrapper is per consumer and per capture, and
             wrapping changes nothing for other consumers.
```

The conflict this closes is the one recorded against BEH-BR-151: an
operator who installs a plugin with an access-logging wrapper on `Database`
expects every line of that plugin's code to go through it, and the plugin's
children are part of its code. Under ordinary interceptions, a child mounted
with `intercept: []` would escape the wrapper. Under a mandatory one, it
cannot, and the only way to be rid of the wrapper is to remove the plugin —
an operator call, attributed, gated and recorded.

```
REQUIREMENT: A mandatory interception MUST be given by the code that
             constructs the host, defines the realm or makes the install
             call; no plugin code path — a build, `Plugin.Runtime`, a
             contribution, a bus listener — MAY add one to any scope other
             than through the `mandatory` option of an install it makes
             (a child mount, which covers only that child's subtree).
             A companion that ships a policy ships it as a
             `MandatoryInterception` value that the application places in
             `BridgerOptions.mandatory` or `RealmOptions.mandatory`.
```

```
REQUIREMENT: Mandatory interceptions MUST apply to host captures only:
             activation captures, optional and reactive captures, and
             `Host.use`, `useAll` and `lease` (BEH-BR-262). A service read
             directly from an environment the host does not resolve — a
             base service or a service read with `Effect.service` or
             `Effect.serviceOption` while a layer the application built is
             being built — is not a capture, and core MUST NOT claim that
             any interception of 17 or of this file applies to it.
             `Host.controls` (BEH-BR-265) reports the keys covered; it MUST
             NOT list a key as covered for reads that are not captures.
```

**Settled here.** (1) Ordinary interceptions keep their replace-on-child
rule: it remains useful for decorations such as a logger label that a child
should be free to choose. (2) `RealmOptions.mandatory` is fixed at
`defineRealm`, like the rest of a realm (BEH-BR-145). (3) A plugin cannot
install a policy over other plugins: a policy that the policed code can add
is one that the policed code can also decline to add, and an install of
`SomeGuard.plugin()` that silently covers nothing would be worse than no
guard. (4) A base service, or a service that one application layer reads
from another while the application builds them, is wired by the
application, which can wrap it where it builds the layer (for example by
providing the wrapped service in place of the original); core sees no
capture there and adds no seam for it. A companion that needs a policy on
such a read — a command catalog reading its gate, say — offers it as an
option of its own layer, which the application wires
([`references/command/`](../../command/README.md),
[`references/agent/`](../../agent/README.md)).

**Open.** How a `Desired` entry of `reconcile` declares `mandatory`, and
whether a change to that list is a `replace` or a refusal, is left to the
revision of 18 — Reconciliation and Confluence that adopts this file.

## BEH-BR-261: The composition order of policy layers

> **Invariant:** [INV-BR-036](../invariants.md#inv-br-036-a-mandatory-interception-reaches-every-capture-in-its-scope), [INV-BR-038](../invariants.md#inv-br-038-a-grant-never-widens-what-a-consumer-receives)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```
applied first (innermost) ─────────────────────────────────► applied last (outermost)

 service
   1. realm interceptors (RealmOptions.interceptors, list order)         ordinary (17)
   2. own or inherited intercept (list order)                            ordinary (17)
   3. installation-mandatory: root ancestor's first, own last            mandatory
   4. RealmOptions.mandatory of the consumer's realm (list order)        mandatory
   5. BridgerOptions.mandatory (list order)                              mandatory
   6. grant narrowing, when a CapabilityPolicy is wired (29)             capability
   7. call recorder, when a CallLog selects the capture (29)             capability
 → consumer
```

```
REQUIREMENT: When several layers apply to one key for one consumer, they
             MUST compose in the order above, each wrapping the result of
             the previous. Steps 1 and 2 are exactly the order of
             BEH-BR-151.
```

```
REQUIREMENT: Every mandatory layer MUST be outside every ordinary one, so
             that the object an ordinary interception returns is still
             wrapped by every mandatory interception before the consumer
             receives it.
```

```
REQUIREMENT: The order MUST be the same on every host for the same
             configuration, and MUST NOT depend on activation order.
```

Host-level mandatory interceptions are outermost of the policy layers so
that they see what the consumer actually calls, after every decoration a
plugin's installer chose. The capability layers sit outside them for the
reasons given in [29](./29-capability-grants-and-call-log.md): a grant
narrows what any wrapper below it can be asked to do, and the call recorder
records attempts the grant denies.

## BEH-BR-262: Mandatory interceptions also cover Host.use, useAll and lease

> **Invariant:** [INV-BR-036](../invariants.md#inv-br-036-a-mandatory-interception-reaches-every-capture-in-its-scope)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```
REQUIREMENT: Each call of `Host.use`, `Host.useAll` and `Host.lease` is a
             capture. Every mandatory interception for the key whose
             `appliesTo` is "all" MUST wrap the service it delivers, with
             `consumer` set to `{ kind: "plugin", ... }` when the calling
             fiber carries a minted principal and to
             `{ kind: "application", realm }` otherwise, `realm` being the
             call's `realm` option.
```

```
REQUIREMENT: For a plugin consumer, the installation-mandatory
             interceptions of that plugin's registration, the
             `RealmOptions.mandatory` of the registration's realm and, when
             the call's `realm` option names another realm, the
             `RealmOptions.mandatory` of that realm as well (applied
             outside the registration realm's, in step 4 of BEH-BR-261),
             and `BridgerOptions.mandatory` MUST apply. Resolution uses the
             call's realm (17 — Realms and Interception);
             `Consumer.realm` and the principal carry the registration's
             realm. For an application consumer, the
             `RealmOptions.mandatory` of the call's realm and
             `BridgerOptions.mandatory` MUST apply, and `Consumer.realm` is
             the call's realm.
```

```
REQUIREMENT: `appliesTo: "plugins"` MUST restrict an interception to plugin
             consumers: activation captures, optional and reactive captures,
             and `Host.use` calls made under a principal.
```

```
REQUIREMENT: Ordinary interceptions keep BEH-BR-151: they apply to
             activation, optional and reactive captures only, and not to
             `Host.use`, `useAll` or `lease`.
```

```
REQUIREMENT: The wrap MUST happen inside the lease, after admission and
             before the callback runs, once per call. A wrap failure MUST
             release the lease and die (BEH-BR-260).
```

This amends the last requirement of BEH-BR-151, which exempted application
callers of `Host.use` from interception. That exemption is right for
decorations and wrong for policy: a data-access wrapper that application
code can step around by calling `host.use(Database, ...)` is not a policy.

**Settled here.** `useAll` wraps each service it delivers separately, once
per call. The per-call cost is the price of covering this route; a consumer
that finds it too high can capture the service once in a plugin, where the
wrap happens once per activation.

## BEH-BR-263: allowChildren — whether a plugin may mount children

> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove), [URS-BR-017](../urs.md#urs-br-017-bind-sub-plugins-to-the-lifetime-of-a-parent)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
interface InstallOptions { /* ... */ readonly allowChildren?: boolean }   // default true

class ChildNotAllowed extends Schema.TaggedError<ChildNotAllowed>()("ChildNotAllowed", {
  parentId: Schema.String,
  childId: Schema.String,      // the prefixed id the child would have had
  reason: Schema.String        // "allowChildren: false" or the AccessPolicy's reason
}) {}

// Plugin.Runtime.install(child, options) — error union gains ChildNotAllowed
```

```
REQUIREMENT: When a plugin's registration has `allowChildren: false`,
             `Plugin.Runtime.install` MUST fail with `ChildNotAllowed`,
             MUST register nothing and MUST write no record. The plugin
             whose `allowChildren` is read, and whose principal a `child`
             access request carries (BEH-BR-264), MUST be the activation
             that owns the `Plugin.Runtime`, whichever fiber calls
             `install`.
```

```
REQUIREMENT: A child's effective `allowChildren` MUST be its parent's
             effective value AND its own option: a child may narrow it,
             never widen it. A group (BEH-BR-127) installed with
             `allowChildren: false` MUST fail its own build, since a group
             mounts its members as children; the failure is reported with
             phase `build`.
```

```
REQUIREMENT: When `allowChildren` permits the mount and an `AccessPolicy`
             is wired, the host MUST consult it with a `child` request
             (BEH-BR-264) before registering the child. A denial MUST fail
             `Plugin.Runtime.install` with `ChildNotAllowed` carrying the
             policy's reason.
```

```
REQUIREMENT: A refused mount MUST be logged at warning level naming the
             parent and the child id, and MUST publish a `child-refused
             { id, childId }` host event. It is not an audit record: nothing
             changed.
```

```
REQUIREMENT: `PluginCommon` MUST report `allowChildren` for every plugin,
             so that an operator can see the effective value.
```

Children are the one way plugin code installs plugins without an operator
call: the mount is a system transition, never gated (BEH-BR-190, BEH-BR-223).
That is correct for code the operator approved with its parent, and it is
exactly why an operator approving a plugin must be able to say "and nothing
else".

**Open.** Whether `OperationRequest` for `install` should carry the
registration's `allowChildren` and the service ids of its `mandatory`
interceptions, so a gate can require them, is open; it would add fields to
the request of 25 — Operation Gate.

## BEH-BR-264: The AccessPolicy port — bus, registries and children

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove), [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins), [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
type AccessRequest =
  | { readonly kind: "listen";     readonly principal?: PrincipalRef; readonly event: string; readonly style: "on" | "around" }
  | { readonly kind: "emit";       readonly principal?: PrincipalRef; readonly event: string;
      readonly mode: "emit" | "parallel" | "serial" | "waterfall" }
  | { readonly kind: "contribute"; readonly principal?: PrincipalRef; readonly registry: string; readonly id: string }
  | { readonly kind: "child";      readonly principal: PrincipalRef;  readonly childId: string;   // principal: the parent activation's
      readonly definition: { readonly version?: string; readonly digest?: string } }

type AccessDecision = "allow" | { readonly deny: string }

class AccessPolicy extends Context.Service<AccessPolicy, {
  readonly decide: (request: AccessRequest) => AccessDecision     // synchronous and pure
}>()("@bridger/core/AccessPolicy") {}

// defect: AccessDenied { kind, subject, principal?: string, reason }
```

```
REQUIREMENT: The host MUST read `AccessPolicy` with `Effect.serviceOption`
             at construction; it MUST NOT appear in the requirements of
             `Bridger.layer` or `Bridger.make`. `ContributionRegistry.make`
             MUST read it the same way from its own environment. Core MUST
             NOT export an implementation, permissive or otherwise; the only
             helper is a scripted fixture in `@bridger/core/testing`.
```

```
REQUIREMENT: When wired, `decide` MUST be called:
             - once per `on` or `around` registration, before the listener
               is added (`listen`);
             - once per dispatch of `emit`, `parallel`, `serial` or
               `waterfall`, before any listener runs (`emit`);
             - once per `ContributionRegistry.add`, before the id is
               reserved (`contribute`);
             - once per child mount that `allowChildren` permits (`child`,
               BEH-BR-263).
             For `listen`, `emit` and `contribute`, `principal` MUST be
             the calling fiber's minted principal, or absent for code with
             none. For `child`, `principal` MUST be the principal of the
             activation that owns the `Plugin.Runtime` whose `install` was
             called (the parent), whatever principal the calling fiber
             carries, and MUST always be present.
```

```
REQUIREMENT: A denial of `listen`, `emit` or `contribute` MUST die with
             `AccessDenied` in the caller's fiber, MUST register nothing and
             MUST run no listener. A denial inside a build therefore fails
             the activation with phase `build`.
```

```
REQUIREMENT: `decide` MUST be total. A `decide` that throws, or returns a
             value that is neither "allow" nor `{ deny }` with a non-empty
             string, MUST be treated as a denial with reason
             "policy-defect".
```

```
REQUIREMENT: Every denial MUST be logged at warning level with the request's
             kind, subject (event id, registry name and id, or child id) and
             principal id, and nothing else.
```

The bus and the registries are where one plugin's code reaches many others
without a service key, so key-based interception cannot see them. The policy
is synchronous because it sits on the dispatch path of every event: a
decision that needs I/O belongs in a precomputed table the policy reads, not
on the hot path.

**Settled here.** (1) Denials are defects, not typed errors, so that the
signatures of `on`, `emit` and `add` in files 16 and 19 are unchanged and an
unwired host has no new error to handle; a denial means a plugin's declared
needs and the deployment's policy disagree, which is a configuration defect
to fix, not a condition to recover from. (2) A registry made by the
application reads the policy from its own environment at `make`; the
application must provide the same `AccessPolicy` to the registry and to the
host. A registry made without one is unpoliced, which `inspect` does not
hide (BEH-BR-265). (3) Listener access is decided at registration, not per
dispatch, so a dispatch costs one decision, not one per listener. (4) A hook
point ([31 — Hook Points](./31-hook-points.md), BEH-BR-298) calls its own
`who` rule first and then `add`s the contribution to its registry, whose
`add` consults a wired `AccessPolicy` (`contribute`); both must allow, the
hook point adds nothing when either refuses, and `who` therefore also sees
contributors that the policy would deny.

## BEH-BR-265: Host.controls reports the policy wiring

> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove), [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// HostControls (24, BEH-BR-212), added — illustrative
readonly policy: {
  readonly access: "wired" | "unwired"
  readonly capability: "wired" | "unwired"          // 29
  readonly callLog: "wired" | "unwired"             // 29
  readonly mandatory: readonly { readonly scope: "host" | `realm:${string}`; readonly serviceIds: readonly ServiceId[] }[]
}
// RegistryInspection / PluginInspection.contributions[]: policed: boolean
```

```
REQUIREMENT: `Host.controls` MUST report whether `AccessPolicy`,
             `CapabilityPolicy` and `CallLog` are wired and the service ids
             covered by host and realm mandatory interceptions, and
             `PluginCommon.mandatoryServiceIds` (04 — States and
             Snapshots, BEH-BR-027) MUST list the service ids of each
             plugin's installation-mandatory interceptions, own and
             inherited.
```

```
REQUIREMENT: Each contribution `inspect` reports MUST state whether its
             registry was made with an `AccessPolicy`.
```

A policy that is not wired must be visible as not wired, for the same
reason an unwired audit sink must be (BEH-BR-194): the dangerous state is
the one in which a reviewer believes a control exists.

## BEH-BR-266: Unwired policy changes nothing, and nothing claims isolation

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing), [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028), [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)

```
REQUIREMENT: With no mandatory interception, no `AccessPolicy` and every
             `allowChildren` at its default, every operation MUST behave
             exactly as files 02–25 specify: the same outcomes, errors,
             states and events. Snapshots, requests and records gain only
             additive fields: `allowChildren` and `mandatoryServiceIds` on
             `PluginCommon` (04, BEH-BR-263, BEH-BR-265), `annotations` on
             `OperationRequest` and records (30 — Operation-Context
             Annotations, BEH-BR-293, BEH-BR-295), and `onBehalfOf` on the
             `OperationRequest` a wired gate sees and on the records a wired
             sink sees, for calls made under a principal (BEH-BR-259).
```

```
REQUIREMENT: Core documentation, types, errors and events MUST NOT describe
             the principal, mandatory interceptions, `allowChildren` or the
             `AccessPolicy` as isolation, sandboxing, authentication or
             access control against untrusted code.
```

```
REQUIREMENT: Core documentation MUST state that in-process plugins are
             trusted code; that code holding a reference, a leaked
             `Plugin.Runtime` or a module import is outside what these
             policies can stop; and that third-party code is to run out of
             process behind a proxy plugin (`references/remote/`).
```

The word that matters is *mandatory*: it means "no plugin can remove this
through Bridger's API", not "no code can get around it". That narrower
promise is testable — every route through the host can be exercised and
shown to carry the wrapper — and it is the promise a reviewer needs to know
the exact edges of.

## Acceptance checks

These extend the required acceptance checks of
[21 — Testing Host](./21-testing-host.md) (BEH-BR-184) and are allocated to
`REQ-BR` scenarios in traceability §5. They run on `TestHost` through the
`Host`, as a consumer would wire the ports.

```
REQUIREMENT: The following checks MUST pass before this file's behaviours
             are claimed:
             67. A principal is minted per activation and read by plugin
                 code; a reference provided with the same identifier makes
                 the reader die with `PrincipalForged`; a principal used
                 after its activation ends dies with `PrincipalRetired`; a
                 finalizer that emits under a wired `AccessPolicy`, or
                 removes a child, does not die (retirement follows the
                 finalizers); a
                 listener runs under its owner's principal and a provider's
                 method under its caller's; `asSelf` switches to the
                 activation's own (BEH-BR-257, BEH-BR-258).
             68. A mutating call from plugin code carries `onBehalfOf` on
                 the `OperationRequest` and on its `requested`, `rejected`
                 or terminal record, and on each `reconcile` entry's
                 records; a call from application code carries none; no
                 option sets it; under `attribution.require` a plugin call
                 with no actor still fails with `Unattributed`; system
                 records carry none; a provider method serving consumer A
                 that mutates the host records `onBehalfOf` A, and records
                 the provider only inside `asSelf` (BEH-BR-258,
                 BEH-BR-259).
             69. Mandatory interceptions: a child mounted with
                 `intercept: []` still receives every inherited mandatory
                 wrapper; a child in another realm receives its own realm's;
                 the composition order of BEH-BR-261 holds; `Host.use`,
                 `useAll` and `lease` from application code and from plugin
                 code are wrapped by "all" interceptions and not by ordinary
                 ones; a throwing mandatory wrap fails the activation or
                 kills the call with the lease released (BEH-BR-260 to
                 BEH-BR-262).
             70. `allowChildren: false` refuses `Plugin.Runtime.install`
                 with `ChildNotAllowed`, registers nothing, writes no record
                 and publishes `child-refused`; a child cannot widen it; an
                 `AccessPolicy` denies listen, emit, contribute and child
                 requests as specified, a `child` request from a provider
                 method serving another plugin carries the parent
                 activation's principal, a throwing `decide` denies with
                 "policy-defect", and `Host.controls` reports the wiring;
                 with nothing wired, the suites of files 02–25 pass with
                 only the additive fields of BEH-BR-266 added to the values
                 they compare (BEH-BR-263 to BEH-BR-266).
```

---

_Previous: [27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)_ · _Next: [29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md)_
