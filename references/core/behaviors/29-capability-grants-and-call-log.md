# 29 — Capability Grants and Call Log

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-29                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): `ResolutionRequest.contract` is `{ name, version }` of the bound provision; one member set for narrowing and the malformed-grant check; the port never receives an actor, stated with the route for companions that admit by actor (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018) |

---

A consumer that lists a key in `requires` receives the whole service. A
deployment often wants less: this plugin may call `Inventory.get` and
`Inventory.list` but not `Inventory.adjust`; this one may not resolve
`Bridger.Host` at all; every call a plugin makes on `PatientRecords` must
reach a data-access log with who, what and when. Interceptions
([17 — Realms and Interception](./17-realms-and-interception.md), BEH-BR-151)
can do each of these by hand, one wrapper per key, written and wired by the
operator. This file adds the two seams that let a companion do it
generically, without core learning what any service means:

- an optional **`CapabilityPolicy`** port that core consults whenever a
  consumer resolves a service, and whose answer is a **grant** — the whole
  service, or named members of it — that core applies as a narrowing
  interception;
- an optional **`CallLog`** port that receives one entry per call made
  through a captured service — who, which key and member, outcome, timing,
  selected annotations — with no arguments, no results, and nothing kept by
  core.

Per-call short-lived tokens, epochs, and egress treated as a granted
contract are the remote companion's ([`references/remote/`](../../remote/README.md)); this file defines
only the `CurrentCall` reference they plug into (BEH-BR-277). This file has
no SPEC.md source section
([ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)). It
owns BEH-BR-273–288 and uses BEH-BR-273–278; numbers 279–288 of the block are reserved.

> **What this is not**
>
> A grant narrows the service object that core hands to a consumer. It is
> not a permission system that holds against hostile code: an in-process
> plugin can import a provider's module, keep a reference a granted method
> returns, or be handed the full service by other code
> ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md),
> [ADR-BR-027](../decisions/027-core-exclusions.md)). The same grant becomes a
> boundary only where the consumer runs out of process and the remote
> companion enforces it at the transport.

Planned source: `packages/core/src/Capability.ts` and
`packages/core/src/CallLog.ts` *(Planned)*. The position of these layers
among interceptions is fixed in
[28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md)
(BEH-BR-261); the `Consumer` and `PrincipalRef` types are defined there.

## BEH-BR-273: The CapabilityPolicy port and grants

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing), [INV-BR-038](../invariants.md#inv-br-038-a-grant-never-widens-what-a-consumer-receives)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-011](../decisions/011-serviceid-is-key-identity.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
interface ResolutionRequest {
  readonly consumer: Consumer                                    // 28, BEH-BR-260
  readonly serviceId: ServiceId
  readonly provider:
    | { readonly kind: "plugin"; readonly id: string; readonly realm: string;
        readonly version?: string; readonly digest?: string }
    | { readonly kind: "base" }
  readonly route: "required" | "optional" | "whenAvailable" | "use" | "useAll" | "lease"
  readonly contract?: { readonly name: string; readonly version: string } // when the key is a Contract (26): its name
                                                                          // and the provision's (the bound provider's) version
  readonly annotations: Annotations                              // flow "policy" only (30, BEH-BR-292)
}

interface Grant<S> {
  readonly serviceId: ServiceId
  readonly members: "all" | readonly (keyof S & string)[]
}
declare const Grant: {
  readonly all: <S>(key: Context.Key<any, S>) => Grant<S>
  readonly of:  <S, const M extends readonly (keyof S & string)[]>(key: Context.Key<any, S>, options: { readonly methods: M }) => Grant<S>
}

class ResolutionRefused extends Schema.TaggedError<ResolutionRefused>()("ResolutionRefused", {
  serviceId: Schema.String,
  consumer: Schema.String,     // "plugin:<id>@<realm>" or "application@<realm>"
  reason: Schema.String
}) {}

class CapabilityPolicy extends Context.Service<CapabilityPolicy, {
  readonly resolve: (request: ResolutionRequest) => Effect.Effect<Grant<any>, ResolutionRefused>
}>()("@bridger/core/CapabilityPolicy") {}
```

```
REQUIREMENT: The host MUST read `CapabilityPolicy` with `Effect.serviceOption`
             at construction; it MUST NOT appear in the requirements of
             `Bridger.layer` or `Bridger.make`. Core MUST NOT export an
             implementation — no allow-all, no deny-all, no example layer;
             the only helper is a scripted fixture in
             `@bridger/core/testing`.
```

```
REQUIREMENT: `Grant.of(key, { methods })` MUST type-check `methods` against
             the members of the key's service type. A grant whose
             `serviceId` differs from the request's, or that names a member
             the delivered service does not have, MUST be treated as a
             refusal with reason "malformed grant". "Has" is decided on
             the delivered service's member set (BEH-BR-275).
```

```
REQUIREMENT: A `ResolutionRequest` MUST NOT contain a service, a key object,
             a configuration value, an actor or a reason. `consumer`,
             `provider` and `serviceId` are identifiers only. `contract`,
             when present, MUST carry the contract's `name` and the version
             of the provision bound to the capture (the provider's, or the
             `baseContracts` entry's), not the consumer's.
```

```
REQUIREMENT: `CapabilityPolicy.resolve` MUST NOT be given an actor by core,
             and core MUST NOT offer a second method or overload that takes
             one. A companion that admits work by actor — a remote callback
             carrying its caller's actor, say — MUST make that decision in
             its own layer, with its own error, before it reaches the host;
             the `resolve` that the host makes for the capture still
             applies, with the consumer the work runs under. Information
             about the actor MAY reach the policy only as an annotation
             whose key declares flow "policy" (30 — Operation-Context
             Annotations, BEH-BR-292).
```

The port is named for what it decides. The gap analysis that motivated it
called it a `ResolutionPolicy`; `CapabilityPolicy` is the single name used
here. When the key is a versioned contract
([26 — Versioned Contracts](./26-versioned-contracts.md)), `contract` carries
its identity and version, and `Grant.of` is checked against the contract's
methods, so a grant names the same members a remote boundary would.

**Settled here.** (0) Capability is decided for code, not for people: the
consumer is a plugin or application code, identified by the host; the actor
is a claim the caller states (ADR-BR-029) and is decided on by the gate for
mutations and by the companion that admits a request. Mixing the two in one
port would make every grant depend on who happens to be calling through the
plugin. (1) The grant names members, not arguments. Argument-level
rules ("only for this site") depend on what the arguments mean, which core
does not know; a mandatory interception (BEH-BR-260) or the provider itself
applies them.

## BEH-BR-274: When the policy is consulted, and what a refusal does

> **Invariant:** [INV-BR-038](../invariants.md#inv-br-038-a-grant-never-widens-what-a-consumer-receives), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
interface BridgerOptions { /* ... */ readonly resolutionTimeout?: Duration.Input }   // default 5 seconds; no "forever"

// Host.use, Host.useAll, Host.lease — error unions gain ResolutionRefused
```

```
REQUIREMENT: When wired, `resolve` MUST be called once per capture, for base
             services and plugin providers alike, and its answer MUST NOT
             be cached or reused by core:
             - `required`: each required key at each activation, after the
               provider is captured and before `wrap`;
             - `optional`: each `Plugin.Runtime.optional` and `useOptional`
               call, and each optional key captured at activation;
             - `whenAvailable`: each run, before it starts;
             - `use`, `useAll`, `lease`: each call, after lease admission.
```

```
REQUIREMENT: The outcome of a refusal MUST depend on the route:
             - `required`: the consumer's activation MUST fail with phase
               `activation` and the message "resolution refused:
               <serviceId>: <reason>"; failure is sticky (BEH-BR-031) and
               `retry` consults the policy again;
             - `optional`: the read MUST return `Option.none()`; the
               consumer is told the service is absent;
             - `whenAvailable`: the run MUST NOT start; the policy is
               consulted again at the next availability change of its keys;
             - `use`, `useAll`, `lease`: the call MUST fail with
               `ResolutionRefused`, MUST release the lease, and MUST NOT
               run its callback.
```

```
REQUIREMENT: A `resolve` that dies, fails with anything other than
             `ResolutionRefused`, is interrupted by anything other than the
             caller, or exceeds `resolutionTimeout`, MUST be treated as a
             refusal with reason "policy-defect" or "policy-timeout".
             When an `Annotation.Deadline` is present, the bound is the
             earlier of the two (30, BEH-BR-291).
```

```
REQUIREMENT: Every refusal MUST be logged at warning level with the
             consumer, the service id and the reason. A refusal on the
             `optional` or `whenAvailable` route MUST also publish a
             `resolution-refused { id, serviceId, route }` host event, so a
             service silently reported absent can still be explained.
```

```
REQUIREMENT: The policy MUST NOT call mutating operations of the host. Core
             does not detect such a call; it is bounded only by
             `resolutionTimeout`.
```

A refused required key is an activation failure, not a wait: waiting would
mean a plugin sits in `waiting` forever with every provider present, and
`waiting` would stop meaning "a dependency is missing". Failing makes the
refusal visible in the plugin's state, with its reason, at the moment it
happens.

**Settled here.** `ResolutionRefused` is a typed error of `Host.use`,
`useAll` and `lease` — unlike `AccessDenied` (28, BEH-BR-264), which is a
defect — because application code calling `use` under a policy is an
ordinary caller that should be able to handle "not for you" without a
crash. An unwired host never produces it.

## BEH-BR-275: Grant narrowing is a core-built interception

> **Invariant:** [INV-BR-038](../invariants.md#inv-br-038-a-grant-never-widens-what-a-consumer-receives), [INV-BR-036](../invariants.md#inv-br-036-a-mandatory-interception-reaches-every-capture-in-its-scope)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029), [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)

```ts
// defect raised by an ungranted member:
//   CapabilityDenied { serviceId, member, consumer }
```

```
REQUIREMENT: A grant with `members: "all"` MUST add no narrowing layer.
             A grant naming members MUST be applied as layer 6 of BEH-BR-261:
             a frozen plain object whose keys are exactly the member set of
             the object it wraps, in which
             - a granted member is delegated unchanged;
             - an ungranted function member is replaced by a function that,
               when called, returns an Effect that dies with
               `CapabilityDenied` (or throws `CapabilityDenied` when the
               original member does not return an Effect);
             - an ungranted non-function member is absent.
             The *member set* of a service object MUST be every string key
             of the object and of each object on its prototype chain up to
             and excluding `Object.prototype`, enumerable or not, except
             `constructor`; a key found on several objects of the chain is
             one member. A granted function member MUST be delegated bound
             to the original object; a granted accessor MUST be read from
             the original object at each access. The same set MUST decide
             whether a grant names a member the service "has" (BEH-BR-273).
```

```
REQUIREMENT: Narrowing MUST be shallow and documented as such: a value that a
             granted member returns is delivered as the provider returned
             it, and MAY expose more than the grant names.
```

```
REQUIREMENT: A grant MUST NOT widen what the consumer receives: the
             narrowed object MUST NOT expose any member that the wrapped
             object does not expose.
```

```
REQUIREMENT: Narrowing MUST obey BEH-BR-152: leases stay on the provider, the
             narrowed object is per consumer and per capture, and it changes
             nothing for other consumers.
```

Narrowing sits outside every mandatory interception, so a policy wrapper
below it is never asked to serve a member the consumer may not call, and
inside the call recorder, so the log shows denied attempts. Replacing an
ungranted member with a stub that dies, rather than deleting it, keeps the
object's shape stable for code that inspects it and turns a call that should
not happen into a loud, attributable defect rather than a `TypeError` far
from its cause.

**Settled here.** Granting `Bridger.Host` with named members is how a
deployment lets a plugin read `snapshot` and `use` without `remove`: the
host is a base service and is resolved, and therefore narrowed, like any
other. Under the same rule a grant on `Bridger.Events` can withhold
`waterfall`.

## BEH-BR-276: The CallLog port receives one entry per intercepted call

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing), [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-030](../gxp/03-risk-assessment.md#rsk-br-030)

```ts
// illustrative — not type-checked
interface CallCapture {
  readonly consumer: Consumer
  readonly serviceId: ServiceId
  readonly provider: ResolutionRequest["provider"]
  readonly route: ResolutionRequest["route"]
}

interface CallEntry {
  readonly callId: string                     // IdGenerator
  readonly consumer: { readonly kind: "plugin"; readonly principal: PrincipalRef }
                   | { readonly kind: "application"; readonly realm: string }
  readonly actor: Actor                       // CurrentActor of the calling fiber
  readonly serviceId: ServiceId
  readonly provider: ResolutionRequest["provider"]
  readonly member: string
  readonly outcome: "success" | "failure" | "defect" | "interrupted" | "denied"
  readonly errorTag?: string                  // failure only: the typed error's _tag
  readonly startedAt: string                  // Clock, ISO-8601 UTC with ms
  readonly durationMs: number                 // Clock
  readonly annotations?: readonly AnnotationEntry[]   // flow "callLog" (30, BEH-BR-293)
}

class CallLog extends Context.Service<CallLog, {
  readonly select: (capture: CallCapture) => boolean        // synchronous; once per capture
  readonly record: (entry: CallEntry) => Effect.Effect<void>
}>()("@bridger/core/CallLog") {}

interface BridgerOptions { /* ... */ readonly callLogTimeout?: Duration.Input }  // default 1 second; no "forever"
```

```
REQUIREMENT: The host MUST read `CallLog` with `Effect.serviceOption` at
             construction and MUST NOT require it. Core MUST NOT export an
             implementation other than an in-memory fixture in
             `@bridger/core/testing`.
```

```
REQUIREMENT: When wired, `select` MUST be called once per capture, after the
             grant is applied. When it returns true, the capture MUST be
             wrapped by the call recorder (layer 7 of BEH-BR-261); when it
             returns false or throws, the capture MUST NOT be recorded, and
             a throw MUST be logged at warning level.
```

```
REQUIREMENT: The recorder MUST produce exactly one `CallEntry` per call of a
             function member of the recorded object, including members the
             grant denies (outcome "denied"). For a member that returns an
             Effect, the entry MUST span that Effect's run, and its outcome
             MUST be "success", "failure" (with `errorTag`), "defect" or
             "interrupted". For any other member, the entry MUST span the
             synchronous call.
```

```
REQUIREMENT: A `CallEntry` MUST NOT contain arguments, results, error
             messages, configuration values, services or causes. `actor` is
             the calling fiber's `CurrentActor`, recorded as given.
```

```
REQUIREMENT: `record` MUST be called on the calling fiber after the call
             completes, uninterruptibly, bounded by `callLogTimeout`. Its
             failure, death or timeout MUST NOT change the call's outcome;
             it MUST increment `Host.controls.callLog.failed`, and MUST be
             logged at warning level naming the service id and member.
```

```
REQUIREMENT: Core MUST hold an entry only until `record` returns or times
             out, and MUST keep no copy, queue or history of entries.
```

The log is a seam for the data-access record a regulated or privacy-bound
deployment keeps, not that record itself. Arguments and results are
excluded because they are the data whose access is being logged; a log that
copied them would be a second copy of the data under weaker controls. A
companion that must record payloads does so in a mandatory interception of
its own, under its own controls.

**Settled here.** (1) The actor reaches the call log, which amends the
"gate and sink only" rule of BEH-BR-192: a data-access entry that cannot say
for whom the call was made is of little use. The reason and correlation of
host operations do not reach it; they belong to host mutations, and a
service call has neither. (2) `record` runs on the caller's fiber with a
short bound, rather than through a core-owned queue, because a queue is a
store and the port's premise is that core stores nothing. A companion that
must not slow callers enqueues inside `record`.

**Open.** Whether a deployment may ask for fail-closed call logging — a call
that fails when its entry cannot be delivered — is open. As specified, an
undeliverable entry is counted and logged, and the call stands
([RSK-BR-030](../gxp/03-risk-assessment.md#rsk-br-030)).

## BEH-BR-277: CurrentCall — the per-call seam for tokens and egress

> **Invariant:** [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)

```ts
// illustrative — not type-checked
interface CallInfo {
  readonly callId: string                     // equal to the CallEntry's, when one is recorded
  readonly consumer: CallEntry["consumer"]
  readonly serviceId: ServiceId
  readonly member: string
  readonly grant: "all" | readonly string[]
}
declare const CurrentCall: { readonly get: Effect.Effect<Option.Option<CallInfo>> }
```

```
REQUIREMENT: When a `CapabilityPolicy` or a `CallLog` is wired, core MUST
             set `CurrentCall` for the run of each call made through a
             narrowed or recorded object, around the Effect the member
             returns, and only there. Its value MUST be minted by core and
             checked like a principal (BEH-BR-257): a value provided by
             other code MUST make `CurrentCall.get` die with
             `PrincipalForged`.
```

```
REQUIREMENT: Core MUST NOT define tokens, expiries, epochs, signatures or
             egress rules. Those are the remote companion's, which reads
             `CurrentCall`, `CurrentActor` and the call's annotations from a
             proxy plugin's service implementation.
```

This is the whole of the core's part in per-call tokens. A remote proxy
plugin's service runs in the consumer's fiber; reading `CurrentCall` there,
it knows which consumer called which member under which grant, and can mint
the short-lived token (actor, plugin id, version, epoch, expiry, and any
tenant label carried as an annotation) that the guest side checks. Egress is
the same mechanism: an outbound connection is a contract key, provided by
the companion's egress proxy and granted like any other.

## BEH-BR-278: Unwired ports change nothing, and nothing claims enforcement

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028), [RSK-BR-030](../gxp/03-risk-assessment.md#rsk-br-030)

```
REQUIREMENT: With no `CapabilityPolicy` and no `CallLog` wired, no narrowing
             layer or recorder MUST exist, `CurrentCall` MUST never be set,
             `ResolutionRefused` MUST never be produced, and every operation
             MUST behave exactly as files 02–25 specify.
```

```
REQUIREMENT: Core documentation MUST NOT describe a grant as a security
             boundary for in-process code, and MUST NOT describe the call
             log as a complete record of data access: calls that do not go
             through a captured service — a reference kept from elsewhere,
             a module import, a provider's own internal calls — are not
             seen.
```

---

## Acceptance checks

These extend BEH-BR-184 of [21 — Testing Host](./21-testing-host.md) and are
allocated to `REQ-BR` scenarios in traceability §5.

```
REQUIREMENT: The following checks MUST pass before this file's behaviours
             are claimed:
             71. A wired `CapabilityPolicy` is consulted once per capture on
                 every route, never cached; a refusal fails a required
                 activation with phase `activation`, returns none for an
                 optional read, holds back a `whenAvailable` run, and fails
                 `use`, `useAll` and `lease` with `ResolutionRefused` with
                 the lease released; a dying, failing or slow policy is a
                 refusal; refusals on optional routes publish
                 `resolution-refused` (BEH-BR-273, BEH-BR-274).
             72. A grant naming members delivers an object whose ungranted
                 members die with `CapabilityDenied`; `Grant.all` adds no
                 layer; the narrowed object exposes nothing the wrapped one
                 does not; leases are unaffected; a grant on `Bridger.Host`
                 withholds its mutating members (BEH-BR-275).
             73. A selected capture yields exactly one `CallEntry` per call,
                 including denied ones, with `Clock` timing, the caller's
                 actor and principal and no argument, result or message;
                 a failing or slow `record` changes no outcome and is
                 counted; `CurrentCall` is set only around intercepted
                 calls and a provided one dies with `PrincipalForged`; with
                 nothing wired, the suites of files 02–25 pass unchanged
                 (BEH-BR-276 to BEH-BR-278).
```

---

_Previous: [28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md)_ · _Next: [30 — Operation Context Annotations](./30-operation-context-annotations.md)_
