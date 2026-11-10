# 28 — Plugin Principal and Mandatory Policy

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-28                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-10): BEH-BR-257 a build that supersedes another in `starting` begins a new activation in a new revision, so the principal's revision stays unique (audit round 2, Low); BEH-BR-263 a mount refused by `allowChildren` or the `AccessPolicy` writes no record, one refused by the `RefusalList` writes `start-refused`, and the order of the mount checks (audit round 2, Low); BEH-BR-267 a trigger on a `dormant` plugin is its own consult point, to `waiting` too (C14), and a refused background restart stops with `StopReason` "refused-digest" (C5); the unwired-equivalence statements cover files 02–20 and 22–34 (audit round 2, Low) (CCR-BR-034)<br>0.6 (2026-11-09): BEH-BR-258 a handoff's `export` runs under the old activation's principal, `upgrade` and `import` under the new activation's (U-04) (CCR-BR-033)<br>0.5 (2026-11-09): BEH-BR-260 a failing mandatory `wrap` on an optional or reactive capture has the outcome BEH-BR-152 now states (U-06) (CCR-BR-032)<br>0.4 (2026-11-08): BEH-BR-262 Settled: the call's realm adds to, never replaces, a plugin's own mandatory sets (G-P16 not adopted); BEH-BR-267 only the definition's own digest is submitted, other revocation identifiers are the list's mapping (agent review R3-03), the reconcile diff, `registeredAt` and `plan` with a refused digest (R1-07); BEH-BR-269 `origin` form is the companion's to document (agent review F27); check 104 amended (CCR-BR-029)<br>0.3 (2026-11-08): BEH-BR-267 `RefusalList` port consulted on every start, system transitions included; BEH-BR-268 `AccessPolicy.declaredOnly`; BEH-BR-269 `AccessPolicy.ask` for companion buses and delivery; `AccessRequest` gains `declared`, `origin` and the styles "subscribe", "delivery" and mode "publish"; BEH-BR-263 Open closed (the install request carries `allowChildren` and `mandatoryInterceptions`, 25); BEH-BR-265 reports `refusal`; checks 104, 105 and 109 (CCR-BR-026); BEH-BR-259: root lazy-triggered records carry onBehalfOf (CCR-BR-024); BEH-BR-260 Open settled by the mandatory catalog (CCR-BR-025)<br>0.2 (2026-11-08): `onBehalfOf` defined as the principal of the calling fiber, with the provider case stated; principal retired after the activation's finalizers; `child` access requests carry the parent activation's principal; principal `revision` defined; realms of `Host.use` from plugin code; mandatory interceptions are application-wired and cover host captures only (not base-service reads); `who` before the access check; unwired-sameness reworded (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018); hook calls under the owner's principal and the hook registry's access check (CCR-BR-019) |

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
**`allowChildren`** install option and an optional **`AccessPolicy`** port,
with a helper that compares access with the manifest (BEH-BR-268). It also
adds the optional **`RefusalList`** port, the one policy that is consulted on
system transitions: a definition whose digest it refuses does not start,
whoever or whatever starts it (BEH-BR-267,
[ADR-BR-053](../decisions/053-refusal-list.md)).
It has no SPEC.md source section; it extends the interception rules of
[17 — Realms and Interception](./17-realms-and-interception.md) and resolves
the conflict "a child's interception replaces the ones it inherited"
([ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)).
This file owns BEH-BR-257–272 and uses BEH-BR-257–269; numbers 270–272 of the block are
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
             is the value written as `PrincipalRef.revision`. A build that
             supersedes another while the registration stays `starting` (a
             `replace`, `reconfigure` or `restart` of a starting plugin, 08 —
             Operation Legality, BEH-BR-071) begins a new activation: the
             host MUST publish a new snapshot revision when that build
             begins, even if no other field changed, and that revision is
             the new activation's.
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
             activation's finalizers, a handoff's `export` (under the old
             activation's principal) and its `upgrade` and `import` (under
             the new activation's; 34 — State Handoff, BEH-BR-347,
             BEH-BR-349), `Plugin.Runtime.background` fibers and
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
REQUIREMENT: System records (BEH-BR-199) MUST NOT carry `onBehalfOf`, with
             one exception: a root `lazy-triggered` record — of a plugin
             moved out of `dormant` by `Host.wake` or by an event dispatch —
             carries the caller's principal (27 — Manifest and Lazy
             Activation, BEH-BR-253). A child's mount and removal are system
             transitions whose target already names the parent by its
             prefixed id (14 — Children and Groups, BEH-BR-122, BEH-BR-126).
             `start-refused` and `unmount-requested` records carry none
             (BEH-BR-267; 14, BEH-BR-126).
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
REQUIREMENT: A mandatory `wrap` that throws or dies MUST have exactly the
             outcome BEH-BR-152 states for an ordinary interception on the
             same capture: on a capture at activation it fails the
             consumer's activation with phase `activation`; on an optional
             or reactive capture `optional` and `useOptional` die and a
             `whenAvailable` run fails under its `onFailure` policy. For
             `Host.use`, `useAll` and `lease` (BEH-BR-262) the call MUST die
             and MUST NOT run its callback. A consumer MUST never receive
             the service without a mandatory interception that applies to
             it.
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

**Settled (CCR-BR-025).** A `Desired` entry names its mandatory interceptions
by id from `BridgerOptions.mandatoryCatalog`, never as values, and a
difference from the registration's list (or its `allowChildren`) is a
refusal of the entry, `PolicyMismatch`, not a `replace`
([18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md),
BEH-BR-153, BEH-BR-154). This closes the desired-state half of URS gap G40.

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

**Settled here.** (1) For a plugin consumer the call's realm adds its
`RealmOptions.mandatory`; it never replaces the plugin's own installation
interceptions or its registration realm's, so a plugin cannot step around a
policy meant for it by calling `Host.use` with another `realm` (CCR-BR-029;
the host-core prototype applied the call's realm only, finding G-P16, which
deviates from this requirement and is not adopted). (2) `useAll` wraps each service it delivers separately, once
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
             { id, childId }` host event. A mount refused by `allowChildren`
             or the `AccessPolicy` writes no audit record: nothing changed.
             A mount refused by the `RefusalList` writes the one
             `start-refused` record of BEH-BR-267, the evidence that a
             revoked digest was kept out.
```

```
REQUIREMENT: The checks on a mount MUST run in this order, the first
             refusal winning and no later check being consulted: a lazy
             definition (`InvalidDefinition`, 14 — Children and Groups),
             `allowChildren`, a wired `AccessPolicy`, a wired
             `RefusalList`.
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

**Settled here (CCR-BR-026).** The `OperationRequest` of `install`, and of
every other plugin-addressed operation, carries the registration's effective
`allowChildren` and its installation-mandatory interceptions as
`mandatoryInterceptions` (service id, and the catalog id when the
interception has one), so a gate can require them
([25 — Operation Gate](./25-operation-gate.md), BEH-BR-219). This closes URS
gap G41. The same fields on a `reconcile` entry come from the desired entry
([18 — Reconciliation and Confluence](./18-reconciliation-and-confluence.md)).

## BEH-BR-264: The AccessPolicy port — bus, registries and children

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-020](../decisions/020-typed-event-bus.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove), [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins), [URS-BR-014](../urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
type AccessRequest =
  | { readonly kind: "listen";     readonly principal?: PrincipalRef; readonly event: string;
      readonly style: "on" | "around" | "subscribe" | "delivery";      // the last two: companion buses (BEH-BR-269)
      readonly origin?: string;                                         // companion buses only: opaque id of the
                                                                        // event's source, as the companion defines it (BEH-BR-269)
      readonly declared?: DeclaredAccess }                              // BEH-BR-268
  | { readonly kind: "emit";       readonly principal?: PrincipalRef; readonly event: string;
      readonly mode: "emit" | "parallel" | "serial" | "waterfall" | "publish" }   // "publish": companion buses
  | { readonly kind: "contribute"; readonly principal?: PrincipalRef; readonly registry: string; readonly id: string;
      readonly declared?: DeclaredAccess }                              // BEH-BR-268
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
             NOT export an implementation, permissive or otherwise. The
             only helpers are a scripted fixture in `@bridger/core/testing`,
             the combinator `AccessPolicy.declaredOnly` (BEH-BR-268), which
             requires a policy written by the consumer, and
             `AccessPolicy.ask` (BEH-BR-269), which consults the wired
             policy and decides nothing itself.
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
contributors that the policy would deny. (5) Events that reach a host
through a companion bus rather than `Bridger.Events` — the event delivery
companion's forwarded events, say — are decided by the same policy through
`AccessPolicy.ask` (BEH-BR-269); core consults the policy only on its own
bus, and a companion bus that does not ask is unpoliced, which its own
documentation must say.

## BEH-BR-265: Host.controls reports the policy wiring

> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove), [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// HostControls (24, BEH-BR-212), added — illustrative
readonly policy: {
  readonly access: "wired" | "unwired"
  readonly refusal: "wired" | "unwired"             // RefusalList (BEH-BR-267)
  readonly capability: "wired" | "unwired"          // 29
  readonly callLog: "wired" | "unwired"             // 29
  readonly mandatory: readonly { readonly scope: "host" | `realm:${string}`; readonly serviceIds: readonly ServiceId[] }[]
}
// RegistryInspection / PluginInspection.contributions[]: policed: boolean
```

```
REQUIREMENT: `Host.controls` MUST report whether `AccessPolicy`,
             `RefusalList`, `CapabilityPolicy` and `CallLog` are wired and
             the service ids
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
REQUIREMENT: With no mandatory interception, no `AccessPolicy`, no
             `RefusalList` and every `allowChildren` at its default, every
             operation MUST behave
             exactly as files 02–20 and 22–34 specify: the same outcomes, errors,
             states and events. Snapshots, requests and records gain only
             additive fields: `allowChildren` and `mandatoryServiceIds` on
             `PluginCommon` (04, BEH-BR-263, BEH-BR-265), `annotations` on
             `OperationRequest` and records (30 — Operation-Context
             Annotations, BEH-BR-293, BEH-BR-295), and `onBehalfOf` on the
             `OperationRequest` a wired gate sees and on the records a wired
             sink sees, for calls made under a principal (BEH-BR-259), and
             `allowChildren` and `mandatoryInterceptions` on the
             `OperationRequest` of plugin-addressed operations (25,
             BEH-BR-219).
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

## BEH-BR-267: The RefusalList port — a refused digest does not start, system starts included

> **Invariant:** [INV-BR-050](../invariants.md#inv-br-050-a-refused-digest-never-enters-starting), [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-053](../decisions/053-refusal-list.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-053](../urs.md#urs-br-053-keep-a-revoked-plugin-version-from-running-again-whatever-starts-it)
> **Risk:** [RSK-BR-061](../gxp/03-risk-assessment.md#rsk-br-061), [RSK-BR-017](../gxp/03-risk-assessment.md#rsk-br-017)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f)

```ts
// illustrative — not type-checked
interface RefusalSubject {
  readonly id: string                  // the plugin's id ("parent/child" for a child)
  readonly realm: string
  readonly version?: string            // meta.version, when declared
  readonly digest: string              // meta.digest; for a lazy definition, the digest supplied with it (27, BEH-BR-244)
}

class RefusalList extends Context.Service<RefusalList, {
  // synchronous and pure; Some(reason) refuses the definition
  readonly refused: (subject: RefusalSubject) => Option.Option<string>
}>()("@bridger/core/RefusalList") {}

// PluginSnapshot of a plugin whose start the list refused (04 — States and Snapshots):
//   { state: "disabled"; reason: "refused-digest" }
// SystemTransition gains "start-refused" (22 — Attributable Operations, BEH-BR-185)
```

```
REQUIREMENT: The host MUST read `RefusalList` with `Effect.serviceOption`
             at construction; it MUST NOT appear in the requirements of
             `Bridger.layer` or `Bridger.make`. Core MUST NOT export an
             implementation; the only helper is a scripted fixture in
             `@bridger/core/testing`.
```

```
REQUIREMENT: When wired, the host MUST call `refused` for a definition that
             declares a digest, and only for such a definition, at each of
             these points, and MUST NOT cache or reuse an answer:
             - each time a registration would enter `starting`, for any
               cause — the last requirement of a `waiting` plugin becoming
               available, a stop that ends in `starting`, an operator
               call — before any of its code is loaded or built;
             - each time a trigger applies to a `dormant` plugin, whether
               it would leave for `starting` or for `waiting` (27 —
               Manifest and Lazy Activation, BEH-BR-245), before any of
               its code is loaded;
             - before each restart of a `background` fiber under "restart"
               (10 — Runtime Failure and Health, BEH-BR-090);
             - at each child mount through `Plugin.Runtime.install`
               (14 — Children and Groups, BEH-BR-121), for the child's
               definition;
             - at step 4b of BEH-BR-188 (22 — Attributable Operations),
               for every operator call below.
             A definition without a digest MUST NOT be submitted and is
             never refused.
```

```
REQUIREMENT: The host MUST submit only the definition's own digest
             (`meta.digest`, or the digest supplied with a lazy definition)
             as `RefusalSubject.digest`, and no other identifier. A list
             that refuses by another identifier tied to that digest — the
             digest of a signed statement over the package, a signer, a
             publisher — MUST map the submitted digest to it itself and
             answer from that mapping; core documentation MUST state that
             such a list is the companion's to complete, and that core
             refuses exactly what `refused` answers for the subject it is
             given (CCR-BR-029; the loader companion's `Revocation.refusalList`
             maps a package digest to its accepted statements and signers,
             [`references/loader/`](../../loader/README.md)).
```

```
REQUIREMENT: At step 4b, for each plugin-addressed operator call whose
             outcome in BEH-BR-071 (08 — Operation Legality) leaves the
             registration in `dormant`, `waiting` or `starting`, or
             rebuilds it — `install` without `disabled`, `replace` of a
             registration that is not disabled by an operator, `enable`,
             `retry`, `restart` and a `reconfigure` that restarts — the host
             MUST submit the incoming definition (`install`, `replace`) or
             the installed one (every other operation). A refusal MUST
             fail the call with `OperationRejected` whose `reason` is
             "refused-digest: <reason>", MUST change nothing, MUST NOT call
             the `OperationGate`, and with a sink wired MUST write exactly
             one `rejected` record, as a gate refusal does (25 — Operation
             Gate, BEH-BR-220). A `reconcile` entry is refused alone and
             reported among the entry refusals of its report (18 —
             Reconciliation and Confluence); `Host.plan` lists it in
             `rejected`, and with `atomic` the refusal is found at
             validation and applies nothing (32 — Generic Gate and Plan,
             BEH-BR-317, BEH-BR-322). A registration `disabled` with reason
             "refused-digest" counts as not disabled for the diff of
             `reconcile` and does not change `registeredAt` (18, BEH-BR-154;
             32, BEH-BR-318).
```

```
REQUIREMENT: When the list refuses a start that is not an operator call at
             step 4b — including the start of a call whose step 4b passed
             and whose definition the list refused by the time the start
             came — the registration MUST NOT enter `starting`; nothing of
             its code MUST be loaded or built; and in the same revision it
             MUST move to `disabled` with reason "refused-digest", keeping
             its definition, its configuration override, its
             `allowChildren` and its installation-mandatory interceptions.
             Its dependents MUST see its services as absent. A refused
             start reached from `stopping` MUST end the stop in that
             `disabled` state.
```

```
REQUIREMENT: Before restarting a `background` fiber, a refusal MUST leave
             the fiber stopped and MUST stop the plugin as `disable` stops
             it, with `StopReason` "refused-digest" and `next` "disabled"
             (04 — States and Snapshots, BEH-BR-027; 08, BEH-BR-073) —
             dependents first, drained under
             `BridgerOptions.drainTimeout`, revoked at the limit as on a
             path with no caller (10 — Runtime Failure and Health,
             BEH-BR-095) — ending in `disabled` with reason
             "refused-digest".
```

```
REQUIREMENT: A refused child mount MUST fail `Plugin.Runtime.install` with
             `ChildNotAllowed` whose `reason` is "refused-digest: <reason>",
             MUST register nothing, and MUST publish `child-refused` as
             BEH-BR-263 states.
```

```
REQUIREMENT: With a sink wired, each refusal outside step 4b MUST write one
             record with phase `system`, operation "start-refused", actor
             `Actor.system`, no `reason`, `target` the plugin (the child's
             prefixed id for a refused mount), `before` and `after` as
             BEH-BR-196 of 23 — Audit Sink and Record requires (`after.state`
             "disabled"; neither for a refused mount, whose target never
             existed), and `error` `{ _tag: "DigestRefused", message:
             "digest refused: <reason>" }`. Its `causationId` MUST be the
             cause the refused start would have had under BEH-BR-190 of
             22 — the record of the call, of the system transition or of
             the parent's triggering transition — and it MUST be a root
             when that start had none (a `Host.wake`, an event dispatch,
             a background restart). The records of a stop that follows MUST
             take the `start-refused` record as their cause. Every refusal
             MUST be logged at warning level with the id, realm, digest and
             reason.
```

```
REQUIREMENT: `refused` MUST be total. A call that throws, or returns a value
             that is neither `Option.none()` nor `Option.some` of a
             non-empty string, MUST be treated as a refusal with reason
             "policy-defect".
```

```
REQUIREMENT: The list MUST NOT stop a plugin that is `active` on its own: an
             entry added to the list takes effect at that plugin's next
             start, background restart or mount. Core documentation MUST
             state that making a running digest unusable takes a `disable`
             or `remove` (the loader companion's kill switch,
             [`references/loader/`](../../loader/README.md)), and that the
             list keeps such a plugin from starting again.
```

```
REQUIREMENT: The reason "refused-digest" MUST be cleared by an operator
             `disable` (the plugin stays `disabled`, now by the operator),
             by an `enable` the list no longer refuses, and by a `replace`
             with a definition the list does not refuse, as row
             "disabled (refused-digest)" of BEH-BR-071 states. While it is
             set, `PluginCommon` MUST report it in the snapshot (04 —
             States and Snapshots).
```

A gate can refuse every operator call that would start a revoked digest
([25 — Operation Gate](./25-operation-gate.md), BEH-BR-219), but the starts
that matter most after a revocation are the ones nobody calls: a dependency
returning, a lazy trigger, a background fiber restarting at three in the
morning, a parent mounting the same child again. Those are system
transitions and stay ungated (BEH-BR-223); the list is not a gate, it is a
lookup that the host makes at the one point every start passes through.

**Settled here.** (1) The port is synchronous and pure, like
`AccessPolicy`, because it is consulted inside the revision in which the
host decides to start a plugin; a list fed by a revocation service keeps a
table that the service updates and `refused` reads. (2) A refused start
lands in `disabled`, not `failed`: failure is sticky and says that code ran
and failed (ADR-BR-005), while refused code never ran; `disabled` already
means "registered, provides nothing, deliberately not run", and the reason
says that the host, not an operator, decided it. (3) An operator call is
refused before the gate as `OperationRejected`, so no error union changes
and the `rejected` record states who asked and why it was refused; the gate
is not asked to approve a start that cannot happen. (4) Running activations
are not stopped by the list: a pure lookup that stopped plugins would be a
mutating operation with no caller, no reason and no drain decision. A
revocation companion stops them with an attributed `disable` or `remove`,
and the list keeps them stopped. This closes URS gap G60.

## BEH-BR-268: AccessPolicy.declaredOnly — refuse what the manifest did not declare

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-041](../decisions/041-manifest-as-data.md)
> **Satisfies:** [URS-BR-030](../urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code), [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
interface DeclaredAccess {
  readonly contributions: readonly { readonly registry: string; readonly id: string }[]  // manifest `contributions`
  readonly events: readonly string[]          // the `eventId` of each `OnEvent` trigger in `activation`,
                                              // and each entry of `listens` (27 — Manifest and Lazy Activation)
}

declare const AccessPolicy: {
  readonly declaredOnly: (
    inner: AccessPolicyShape,                                   // the consumer's policy; required
    options: { readonly withoutManifest: "allow" | "deny" }    // no default
  ) => AccessPolicyShape
  // ask: BEH-BR-269
}
```

```
REQUIREMENT: When an `AccessPolicy` is wired, core MUST set `declared` on
             every `listen` and `contribute` request whose principal's
             registration carries a manifest — the registered manifest, for
             an eager or a lazy definition (27, BEH-BR-241, BEH-BR-246) —
             with the manifest's `contributions` and the events it declares;
             and MUST leave it absent when the request has no principal or
             the registration has no manifest. The value MUST be fixed when
             the principal is minted and MUST be the same for every request
             of that activation.
```

```
REQUIREMENT: `AccessPolicy.declaredOnly(inner, options)` MUST return a
             policy whose `decide`:
             - for a `contribute` request that carries `declared`, denies
               with "undeclared contribution: <registry>/<id>" when the
               pair is not in `declared.contributions`;
             - for a `listen` request of any style that carries `declared`,
               denies with "undeclared listener: <event>" when the event is
               not in `declared.events`;
             - for a `listen` or `contribute` request with a principal and
               no `declared`, denies with "no manifest" when
               `withoutManifest` is "deny";
             - otherwise returns `inner.decide(request)`.
             Comparison MUST be exact string equality. The combinator MUST
             NOT turn a denial of `inner` into "allow", and MUST NOT be
             exported in a form that takes no `inner`.
```

A manifest is a plugin's declaration of what it will do, read by consent
screens and agents before its code runs (BEH-BR-241). A loaded plugin that
listens to events or contributes to registries it did not declare makes that
declaration untrue, and core could not tell (URS gap G38). The combinator
makes the comparison for a deployment that asks for it, at the point the
access is decided, without core deciding anything else.

**Settled here.** (1) It is a combinator over the consumer's policy, not a
policy core ships: a deployment that wires it still writes the rest of its
policy, and `declaredOnly` without `inner` does not exist (BEH-BR-264).
(2) `withoutManifest` has no default because both answers are reasonable — a
host of eager plugins without manifests would refuse every listener under
"deny" — and a silent default would be a policy chosen by core. (3) Emits
and child mounts are not compared: the manifest declares no emits, and a
child is approved with its parent's definition (BEH-BR-126). (4) Declared
events come from the `OnEvent` triggers and from the manifest field
`listens` of 27 — Manifest and Lazy Activation; a manifest that declares
neither declares no events, and every listener of its plugin is denied.
This closes URS gap G38 for deployments that wire the combinator.

## BEH-BR-269: AccessPolicy.ask — companion buses consult the same policy

> **Invariant:** [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal), [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md), [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-033](../urs.md#urs-br-033-enforce-a-policy-wrapper-that-no-plugin-can-remove), [URS-BR-013](../urs.md#urs-br-013-exchange-typed-events-between-plugins)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
type CompanionAccessRequest =
  | { readonly kind: "listen"; readonly event: string; readonly style: "subscribe" | "delivery"; readonly origin?: string }
  | { readonly kind: "emit";   readonly event: string; readonly mode: "publish" }

declare const AccessPolicy: {
  readonly ask: (request: CompanionAccessRequest, options?: { readonly principal?: PluginPrincipal })
    => Effect.Effect<AccessDecision>
  // declaredOnly: BEH-BR-268
}

// the typed refusal a companion returns to its own caller
class AccessRefused extends Schema.TaggedError<AccessRefused>()("AccessRefused", {
  kind: Schema.String, subject: Schema.String, reason: Schema.String
}) {}
```

```
REQUIREMENT: `AccessPolicy.ask` MUST read `AccessPolicy` with
             `Effect.serviceOption` from the environment in which it runs,
             as `ContributionRegistry.make` does (BEH-BR-264), and MUST
             return "allow" when none is provided. It MUST complete the
             request with `principal` — `options.principal` when given,
             otherwise the calling fiber's principal, absent for code with
             none — and with `declared` as BEH-BR-268 states, call `decide`
             once, apply the totality rule of BEH-BR-264 ("policy-defect"),
             log a denial as BEH-BR-264 states, and return the decision. It
             MUST NOT die on a denial.
```

```
REQUIREMENT: A principal given in `options.principal`, or read from the
             fiber, MUST be checked against the registry of minted
             principals (BEH-BR-257): one that was not minted MUST make
             `ask` die with `PrincipalForged`. A retired principal MUST
             yield `{ deny: "principal-retired" }` and MUST NOT die: a
             delivery that arrives after its subscriber's activation ended
             is an ordinary race, not a defect.
```

```
REQUIREMENT: A companion that delivers events to plugin subscribers outside
             `Bridger.Events` — the event delivery companion's bus, events
             forwarded from another host — and that claims to apply the
             host's access policy MUST call `ask` with `listen` and style
             "subscribe" in the subscriber's fiber when the subscription is
             made, and with `emit` and mode "publish" before each publish.
             It MAY also call `ask` with style "delivery" before each
             delivery, passing the principal it read with
             `CurrentPlugin.get` at subscription and an `origin` naming the
             event's source; it MUST do
             so when it claims that a change to the policy reaches existing
             subscriptions. It MUST report a denial to its caller as
             `AccessRefused`, and MUST deliver nothing to a subscriber whose
             delivery was denied.
```

The policy of BEH-BR-264 decides on the core bus because core dispatches
those events; a companion bus dispatches its own, so core cannot consult the
policy for it. What core can do is make the same decision available to the
companion, under the same principal checks and the same failure rule, so
that one table answers "may `billing/export` read events of type X" whether
the event came through `Bridger.Events` or from another host
(URS gap G55).

**Settled here.** (1) Core does not run a companion's subscriber under the
subscriber's principal; the companion's delivery fiber carries whatever it
carries. A subscriber that wants its handler to run under its own principal
wraps it with `Plugin.Runtime.asSelf` when subscribing (BEH-BR-258).
(2) `origin` is an opaque string that the policy may use; core does not
interpret it. Its form is the companion's, which MUST document it: it MAY
name the local host for a locally published event, and it MAY carry a
suffix that changes over time (an incarnation, for example), in which case
the companion MUST say so, because a policy keyed on a host identifier then
has to match the stable part (CCR-BR-029, agent review F27; the event
delivery companion passes the envelope's `node#incarnation` origin). (3) `ask` returns a decision instead of dying because the
companion's own API has a typed error for refusals; `AccessRefused` is
exported so that every companion uses one tag. This closes URS gap G55 on
the core side.

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
                 with nothing wired, the suites of files 02–20 and 22–34 pass with
                 only the additive fields of BEH-BR-266 added to the values
                 they compare (BEH-BR-263 to BEH-BR-266).
             104. A wired `RefusalList`: an operator `install`, `replace`,
                 `enable`, `retry`, `restart` or restarting `reconfigure` of
                 a refused digest fails with `OperationRejected`
                 ("refused-digest: ..."), writes one `rejected` record and
                 never calls the gate; a dependency returning, a lazy
                 trigger, a cascade restart and a call whose step 4b passed
                 before the list changed each leave the plugin `disabled`
                 with reason "refused-digest", with no code loaded or built
                 and one `start-refused` record caused as BEH-BR-190 gives;
                 a background restart of a refused digest stops the plugin
                 into that state, with the stop's records caused by a root
                 `start-refused`; a refused child mount fails with
                 `ChildNotAllowed`, registers nothing and writes one
                 `start-refused` record; a definition without a digest is
                 never submitted; a throwing list refuses with
                 "policy-defect"; an `active` plugin is not stopped by a
                 list change; row "disabled (refused-digest)" of BEH-BR-071
                 holds cell by cell; such a registration counts as not
                 disabled for the `reconcile` diff and `registeredAt`, so a
                 second run issues nothing for it, and `Host.plan` lists a
                 refused entry in `rejected` (BEH-BR-267; 18, BEH-BR-154;
                 32, BEH-BR-317).
             105. The `OperationRequest` of a plugin-addressed operation
                 carries `allowChildren` and `mandatoryInterceptions`
                 (service ids, catalog ids where present, in composition
                 order) equal to the registration's effective values, the
                 incoming ones for `install`; a gate can refuse an `install`
                 with `allowChildren: true` (BEH-BR-219, BEH-BR-263).
             109. `AccessPolicy.declaredOnly`: an undeclared contribution or
                 listener of a plugin with a manifest is denied with the
                 stated reasons, a declared one is decided by `inner`, a
                 plugin without a manifest follows `withoutManifest`, and
                 application code goes to `inner`; `AccessPolicy.ask`
                 returns "allow" with no policy provided, decides
                 "subscribe", "delivery" and "publish" requests with the
                 subscriber's principal, dies with `PrincipalForged` on a
                 principal that was not minted and denies with
                 "principal-retired" for a retired one (BEH-BR-268,
                 BEH-BR-269).
```

---

_Previous: [27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)_ · _Next: [29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md)_
