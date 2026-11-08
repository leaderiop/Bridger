# 29 — Capability Grants and Call Log

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-29                                               |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-08): BEH-BR-279 capacity judged only at the reservation, before the member runs (G-P18, second half not adopted); INV-BR-052 link retitled; check 72 `Grant.all` keeps a layer when `changes` is declared (G-P13) (CCR-BR-029)<br>0.4 (2026-11-08): BEH-BR-280 `CrossingInfo.epoch` and `RevocationInfo.epoch` are opaque strings; entry kind "dispatch" with `DispatchInfo` for companion dispatches that ran or replayed a stored outcome (G66 closed); BEH-BR-276 `CallEntry.kind` and `dispatch` field; BEH-BR-281 cites `Entitlement.capabilityPolicy`; check 112 (CCR-BR-027)<br>0.3 (2026-11-08): BEH-BR-279 call-log failure policy (`onFailure` "drop" or "refuse", bounded hand-off queue, `CallLogUnavailable`); BEH-BR-280 entry kinds ("call", "crossing", "refusal", "revocation"), `Host.offerCallEntry` and `PrincipalRef.encode`/`decode`; BEH-BR-281 `CapabilityPolicy.changes` re-resolves live captures (narrowing on entitlement lapse); BEH-BR-276 `CallEntry` gains `kind`, `correlationId` and `sanitized`, Open closed; BEH-BR-275 a grant layer is kept when the policy declares `changes`; checks 107, 110 and 111 (CCR-BR-026)<br>0.2 (2026-11-08): `ResolutionRequest.contract` is `{ name, version }` of the bound provision; one member set for narrowing and the malformed-grant check; the port never receives an actor, stated with the route for companions that admit by actor (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018) |

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
  core beyond a bounded hand-off queue; a deployment may make it refuse calls
  whose entries cannot be delivered (BEH-BR-279).

Per-call short-lived tokens, epochs, and egress treated as a granted
contract are the remote companion's ([`references/remote/`](../../remote/README.md)); this file defines
only the `CurrentCall` reference they plug into (BEH-BR-277). This file has
no SPEC.md source section
([ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)). It
owns BEH-BR-273–288 and uses BEH-BR-273–281; numbers 282–288 of the block are reserved.

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
  readonly changes?: Stream.Stream<ResolveAgain>     // optional; live captures to re-resolve (BEH-BR-281)
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
REQUIREMENT: A grant with `members: "all"` MUST add no narrowing layer,
             unless the wired policy declares `changes` (BEH-BR-281), in
             which case the layer is added and delegates every member.
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
  readonly kind: "call" | "crossing" | "refusal" | "revocation" | "dispatch"   // "call" for core's capture; BEH-BR-280
  readonly callId: string                     // IdGenerator
  readonly consumer: { readonly kind: "plugin"; readonly principal: PrincipalRef }
                   | { readonly kind: "application"; readonly realm: string }
                   | { readonly kind: "remote"; readonly principal: string; readonly host?: string }  // offered entries only (BEH-BR-280)
  readonly actor: Actor                       // CurrentActor of the calling fiber
  readonly serviceId: ServiceId
  readonly provider?: ResolutionRequest["provider"]   // present on every entry core produces; optional on offered ones
  readonly member?: string                    // present on kind "call" and "crossing"; optional on "dispatch"
  readonly outcome: "success" | "failure" | "defect" | "interrupted" | "denied" | "refused"
  readonly errorTag?: string                  // failure only: the typed error's _tag
  readonly startedAt: string                  // Clock, ISO-8601 UTC with ms
  readonly durationMs: number                 // Clock
  readonly correlationId?: string             // CurrentCorrelation of the calling fiber, when set (22, BEH-BR-187)
  readonly annotations?: readonly AnnotationEntry[]   // flow "callLog" (30, BEH-BR-293)
  readonly crossing?: CrossingInfo            // kind "crossing" only (BEH-BR-280)
  readonly refusal?: RefusalInfo              // kind "refusal" only (BEH-BR-280)
  readonly revocation?: RevocationInfo        // kind "revocation" only (BEH-BR-280)
  readonly dispatch?: DispatchInfo            // kind "dispatch" only (BEH-BR-280)
  readonly origin: "core" | { readonly companion: string }   // who produced the entry (BEH-BR-280)
  readonly sanitized?: true                   // a string was made well-formed (23, BEH-BR-196)
}

class CallLog extends Context.Service<CallLog, {
  // synchronous; once per capture; a failure policy overrides `onFailure` for that capture (BEH-BR-279)
  readonly select: (capture: CallCapture) => boolean | "drop" | "refuse"
  readonly record: (entry: CallEntry) => Effect.Effect<void>
  readonly onFailure?: "drop" | "refuse"                     // default "drop" (BEH-BR-279)
  readonly queue?: number                                    // hand-off queue capacity; default 1024 (BEH-BR-279)
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
             grant is applied. When it returns true, "drop" or "refuse",
             the capture MUST be wrapped by the call recorder (layer 7 of
             BEH-BR-261), under the failure policy of BEH-BR-279; when it
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
             synchronous call. Every entry the recorder produces MUST have
             `kind` "call" and `origin` "core", and MUST carry
             `correlationId` when the calling fiber's `CurrentCorrelation`
             is set (22 — Attributable Operations, BEH-BR-187).
```

```
REQUIREMENT: A `CallEntry` MUST NOT contain arguments, results, error
             messages, configuration values, services or causes. `actor` is
             the calling fiber's `CurrentActor`, recorded as given.
```

```
REQUIREMENT: Entries MUST reach `record` through the hand-off queue of
             BEH-BR-279, each `record` call bounded by `callLogTimeout`.
             Under the failure policy "drop", the failure, death or timeout
             of `record` MUST NOT change the call's outcome; it MUST
             increment `Host.controls.callLog.failed`, and MUST be logged at
             warning level naming the service id and member. Under
             "refuse", BEH-BR-279 states the outcome.
```

```
REQUIREMENT: Core MUST hold an entry only in the bounded hand-off queue of
             BEH-BR-279, until `record` returns or times out, and MUST keep
             no copy or history of entries.
```

The log is a seam for the data-access record a regulated or privacy-bound
deployment keeps, not that record itself. Arguments and results are
excluded because they are the data whose access is being logged; a log that
copied them would be a second copy of the data under weaker controls. A
companion that must record payloads does so in a mandatory interception of
its own, under its own controls.

**Settled here.** (1) The actor reaches the call log, which amends the
"gate and sink only" rule of BEH-BR-192: a data-access entry that cannot say
for whom the call was made is of little use. The reason of host operations
does not reach it; it belongs to host mutations, and a service call has
none. The correlation of the calling fiber does reach it (CCR-BR-026,
[ADR-BR-054](../decisions/054-correlation-in-the-fiber.md)): an entry that
cannot be joined to the command, hook or request that made the call breaks
the chain a reviewer follows. (2) Revision 0.2 ran `record` on the caller's
fiber with no queue, on the premise that a queue is a store. Revision 0.3
(CCR-BR-026) replaces that with a bounded hand-off queue (BEH-BR-279): it
holds an entry only until `record` returns, keeps no history, and is what
lets a fail-closed log refuse at once when the log is behind instead of
making every caller wait for a timeout. The question recorded as open in
revision 0.2 — whether call logging may fail closed — is settled by
BEH-BR-279 (URS gap G42).

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
             `ResolutionRefused` and `CallLogUnavailable` MUST never be
             produced, `Host.offerCallEntry` MUST do nothing, and every
             operation
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

## BEH-BR-279: The call log's failure policy — drop, or refuse the call

> **Invariant:** [INV-BR-052](../invariants.md#inv-br-052-under-refuse-no-effect-member-delivers-its-outcome-unless-its-entry-was-accepted), [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-055](../urs.md#urs-br-055-refuse-a-call-whose-access-cannot-be-logged), [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-030](../gxp/03-risk-assessment.md#rsk-br-030), [RSK-BR-062](../gxp/03-risk-assessment.md#rsk-br-062)

```ts
// illustrative — not type-checked
// CallLog.onFailure?: "drop" | "refuse"   default "drop"
// CallLog.queue?: number                  default 1024; a positive integer
// CallLog.select may return "drop" or "refuse" to choose the policy of one capture (BEH-BR-276)

class CallLogUnavailable extends Schema.TaggedError<CallLogUnavailable>()("CallLogUnavailable", {
  serviceId: Schema.String,
  member: Schema.optional(Schema.String),
  why: Schema.Literal("queue-full", "record-failed", "record-timeout", "host-closing")
}) {}
// a defect inside a recorded service call; a typed error of Host.offerCallEntry (BEH-BR-280)

// HostControls.callLog (24, BEH-BR-212):
//   { failed: number; dropped: number; refused: number; onFailure: "drop" | "refuse"; queue: number }
```

```
REQUIREMENT: The host MUST read `onFailure` and `queue` from the wired
             `CallLog` once, at construction. A `queue` that is not a
             positive integer, or an `onFailure` that is neither "drop" nor
             "refuse", MUST fail construction with a defect naming the
             field. The policy of a capture MUST be the value `select`
             returned for it when that is "drop" or "refuse", and
             `onFailure` otherwise.
```

```
REQUIREMENT: The host MUST keep one hand-off queue of at most `queue`
             entries and one fiber, in the host's scope, that hands them to
             `record` one at a time in the order they were queued, each
             call bounded by `callLogTimeout`. A slot is taken from when an
             entry is queued (or reserved, below) until its `record` call
             returns, fails, dies or times out. Core MUST keep nothing of an
             entry once its slot is released.
```

```
REQUIREMENT: Under "drop", when a recorded call completes, its entry MUST be
             queued and the call's outcome MUST be delivered without waiting
             for `record`. When the queue is full, the entry MUST be dropped
             and counted in `Host.controls.callLog.dropped`. A `record`
             that fails, dies or times out MUST be counted in
             `callLog.failed`. Neither MUST change the call's outcome; each
             MUST be logged at warning level naming the service id and
             member.
```

```
REQUIREMENT: Under "refuse", for a function member that returns an Effect:
             - before the member runs, the recorder MUST reserve a slot.
               When none is free, the member MUST NOT run, the call MUST
               die with `CallLogUnavailable { why: "queue-full" }`, and the
               refusal MUST be counted in `callLog.refused`;
             - when the member's Effect completes, its entry MUST be queued
               in the reserved slot and the call MUST wait until `record`
               for that entry has returned;
             - when that `record` fails, dies or times out, the call MUST
               die with `CallLogUnavailable` ("record-failed" or
               "record-timeout") instead of delivering its outcome: a value
               the member produced MUST NOT reach the consumer. It MUST be
               counted in `callLog.failed` and `callLog.refused`;
             - an interruption of the caller while it waits MUST end only
               the wait; the entry stays queued.
             Capacity MUST be judged only at that reservation, before the
             member runs: a member that "refuse" let run MUST NOT die
             "queue-full". What decides the outcome after the member ran is
             whether `record` accepted the entry, as the third item states
             (CCR-BR-029).
```

```
REQUIREMENT: Under "refuse", a member that does not return an Effect MUST be
             refused at admission exactly as above (it throws
             `CallLogUnavailable` when no slot is free); its entry MUST
             then be queued in the reserved slot without waiting, and a
             failed `record` MUST be counted and logged as under "drop".
             A call the grant denies (outcome "denied") MUST keep its
             outcome under either policy; its entry follows "drop".
```

```
REQUIREMENT: When the host closes, after the last plugin has stopped, the
             queue MUST be given at most `callLogTimeout` after its last
             entry was queued to empty. Entries still queued after that
             MUST be dropped and counted, and a call still waiting under
             "refuse" MUST die with `CallLogUnavailable { why:
             "host-closing" }`.
```

```
REQUIREMENT: `Host.controls.callLog` MUST report `failed`, `dropped` and
             `refused` (each never decreasing) and the effective
             `onFailure` and `queue`.
```

A data-access log that silently loses entries is the failure a regulated
deployment cannot accept for some services; for others, a log outage that
stops the service is worse. "refuse" and "drop" let the deployment say
which, per capture if it needs to, and the queue makes "refuse" answer at
once when the log is behind, instead of making every caller wait out
`callLogTimeout`.

**Settled here.** (1) Under "refuse", core cannot undo what the provider did;
it can keep the consumer from receiving data whose access was not logged,
which is what a data-access log protects. A write the provider performed is
reported to the consumer as a defect although it happened; that residual is
stated in [RSK-BR-062](../gxp/03-risk-assessment.md#rsk-br-062), and a
service whose writes must not be reported that way keeps "drop" for its
capture. (2) The slot is reserved before the member runs, so a member that
"refuse" lets run always has a place for its entry. (3) Refused and allowed
calls may follow different policies only where that changes an outcome: a
denied call never ran, so its entry cannot change its outcome; a companion
chooses the policy of each entry it offers (BEH-BR-280), which covers the
remote companion's callbacks. (4) The refusal is a defect inside a service
call, like `CapabilityDenied`, because the member's error type belongs to
its contract. This closes URS gap G42.

## BEH-BR-280: Call-log entry kinds, offered entries and the principal's encoding

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services), [INV-BR-035](../invariants.md#inv-br-035-only-the-host-mints-a-plugin-principal)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md), [ADR-BR-043](../decisions/043-plugin-principal-and-mandatory-policy.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-030](../gxp/03-risk-assessment.md#rsk-br-030)

```ts
// illustrative — not type-checked
interface CrossingInfo {
  readonly direction: "outbound" | "inbound"   // outbound: this host called a peer; inbound: a peer called this host
  readonly link: string                         // the companion's link id, opaque
  readonly epoch?: string                       // the companion's session epoch, opaque (remote: an IdGenerator string)
  readonly peer?: string                        // the peer's host id, opaque
}
interface RefusalInfo    { readonly stage: "resolve" | "boundary"; readonly reason: string }
interface RevocationInfo { readonly link: string; readonly epoch?: string; readonly reason: string }
interface DispatchInfo {                         // a dispatch that ran its handler or returned a stored outcome
  readonly command: string                      // the dispatched name, opaque (command: the command id)
  readonly digest?: string                      // the companion's digest of the dispatched definition, opaque
  readonly inputDigest?: string                 // the companion's digest of the input, never the input
  readonly idempotencyKey?: string              // the caller's key, opaque
  readonly replayed?: true                      // a stored outcome was returned and no handler ran
}

interface OfferedCallEntry {
  readonly kind: "crossing" | "refusal" | "revocation" | "dispatch"
  readonly companion: string                    // the offering package, e.g. "@bridger/remote"
  readonly serviceId: ServiceId
  readonly member?: string
  readonly consumer?: CallEntry["consumer"]     // default: from the calling fiber
  readonly outcome: CallEntry["outcome"]
  readonly errorTag?: string
  readonly callId?: string                      // default: from IdGenerator; may repeat CurrentCall's callId
  readonly startedAt?: string                   // default: Clock, when offered
  readonly durationMs?: number                  // default: 0
  readonly crossing?: CrossingInfo
  readonly refusal?: RefusalInfo
  readonly revocation?: RevocationInfo
  readonly dispatch?: DispatchInfo
}

class InvalidCallEntry extends Schema.TaggedError<InvalidCallEntry>()("InvalidCallEntry", { message: Schema.String }) {}

// Host, added (02 — Host Construction, BEH-BR-013):
//   offerCallEntry(entry: OfferedCallEntry, options?: { readonly onFailure?: "drop" | "refuse" }):
//     Effect.Effect<void, CallLogUnavailable | InvalidCallEntry>

declare const PrincipalRef: {
  // "p1;" followed by id, realm, version, digest and revision, each encodeURIComponent'd, joined by ";";
  // an absent field is empty
  readonly encode: (ref: PrincipalRef) => string
  readonly decode: (encoded: string) => Option.Option<PrincipalRef>
}
```

```
REQUIREMENT: Every entry core produces from a capture MUST have `kind`
             "call". When a `CapabilityPolicy` refuses a capture
             (BEH-BR-274) and a `CallLog` is wired, core MUST call `select`
             for that capture and, unless it returns false, MUST queue one
             entry with `kind` "refusal", `refusal.stage` "resolve",
             `refusal.reason` the refusal's reason, `outcome` "refused", no
             `member`, and `durationMs` the time the decision took.
```

```
REQUIREMENT: `Host.offerCallEntry` MUST do nothing and succeed when no
             `CallLog` is wired. Otherwise it MUST check that `companion`
             is non-empty and that exactly the info field of `kind` is
             present (`crossing`, `refusal`, `revocation` or `dispatch`),
             and for `dispatch` that `command` is non-empty; any other
             entry MUST fail with `InvalidCallEntry` and queue nothing. It
             MUST complete the entry — `callId`, `startedAt` and
             `durationMs` defaults; `actor` the calling fiber's
             `CurrentActor`; `consumer`, when absent, from the calling
             fiber as for a capture; `correlationId` and "callLog"
             annotations from the calling fiber; `origin` `{ companion }` —
             and queue it under `options.onFailure` (default the port's
             `onFailure`), BEH-BR-279 applying with "refuse" waiting for
             `record` and failing with the typed `CallLogUnavailable`.
             `select` MUST NOT be consulted for an offered entry.
```

```
REQUIREMENT: An entry of kind "dispatch" MUST describe one dispatch the
             offering companion admitted and then either ran — its handler
             was called — or answered with a stored outcome without running
             a handler (`replayed: true`); a dispatch refused before that
             point is offered as kind "refusal". Its `outcome` MUST be
             "success", "failure" (with `errorTag`), "defect" or
             "interrupted"; `member` MAY repeat `dispatch.command`. Core
             MUST queue it as any other offered entry and MUST NOT produce
             entries of kind "dispatch" itself.
```

```
REQUIREMENT: A consumer of kind "remote" MUST appear only on offered
             entries; its `principal` is the string the companion received,
             recorded unchanged.
```

```
REQUIREMENT: `PrincipalRef.encode` MUST produce "p1;" followed by the
             `id`, `realm`, `version`, `digest` and `revision` (decimal),
             each passed through `encodeURIComponent` and joined by ";", an
             absent field being empty. `PrincipalRef.decode` MUST return the
             `PrincipalRef` for exactly the strings `encode` can produce
             (six fields, first "p1", non-empty `id` and `realm`, a
             non-negative integer `revision`) and `Option.none()` for any
             other string. `decode(encode(r))` MUST equal `r` for every
             `PrincipalRef` `r`. A companion that sends a principal to
             another host MUST send this encoding.
```

```
REQUIREMENT: Offered entries MUST obey the content rule of BEH-BR-276: no
             arguments, results, error messages, configuration values,
             services or causes; `dispatch.inputDigest` is a digest the
             companion computed, never the input. Core MUST NOT interpret
             `link`, `peer`, `epoch`, the fields of `dispatch` or the
             reasons it is given beyond the checks above.
```

A data-access log built on core sees only calls through captured services.
The remote companion sees more: a call leaving for a peer, a callback
arriving, a boundary refusing a caller, a link revoked. Offering those as
entries of the same log, under the same failure policy and with the same
identifiers, timing and correlation, gives a deployment one log of access to
read instead of two to join (URS gap G43).

**Settled here.** (1) `kind` names what the entry is about; core produces
only "call" and "refusal", and companions offer the rest. (2) The principal
crosses hosts as one string with a fixed, reversible encoding, so that the
event delivery companion's envelope and the remote companion's tokens carry
the same text and a receiver can decode it without guessing; realm ids and
child ids may contain "/" and ":" (G47), which is why each field is
percent-encoded rather than joined by a separator they might contain.
(3) `offerCallEntry` is a member of the `Host`, so a grant on `Bridger.Host`
can withhold it from a plugin like any other member (BEH-BR-275). This
closes URS gap G43. (4) `epoch` is an opaque string in both `CrossingInfo`
and `RevocationInfo`: the remote companion's epochs come from the
`IdGenerator` and are compared by equality (remote BEH-RM-010), and core
compares nothing (CCR-BR-027). (5) Kind "dispatch" (CCR-BR-027) lets a
companion that dispatches named requests — the command companion
(BEH-CM-015) — offer the dispatches that ran, or replayed a stored outcome,
with the dispatched name, its definition and input digests and the
idempotency key, so that a data-access log lists executed requests beside the
refused ones. Core offers no kind of its own for this: a dispatch is a
companion's concept. This closes URS gap G66.

## BEH-BR-281: Re-resolving live captures — a policy change can narrow a running consumer

> **Invariant:** [INV-BR-038](../invariants.md#inv-br-038-a-grant-never-widens-what-a-consumer-receives), [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-044](../decisions/044-capability-policy-and-call-log-ports.md)
> **Satisfies:** [URS-BR-034](../urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-BR-029](../gxp/03-risk-assessment.md#rsk-br-029)

```ts
// illustrative — not type-checked
interface ResolveAgain {
  readonly consumers?: readonly string[]       // "plugin:<id>@<realm>" or "application@<realm>"; absent: every consumer
  readonly serviceIds?: readonly ServiceId[]    // absent: every service
}
// CapabilityPolicy.changes?: Stream.Stream<ResolveAgain>   (BEH-BR-273)
```

```
REQUIREMENT: When the wired policy declares `changes`, the host MUST run it
             once, in the host's scope, from construction. For each element
             it MUST call `resolve` again, once, for every live capture that
             matches both filters — a capture whose activation, `use` or
             `useAll` call, or lease has not ended — with the request of
             that capture (its annotations as captured), and MUST apply the
             answer to that capture's narrowing layer (BEH-BR-275) for every
             call that begins afterwards. Calls in progress keep the grant
             they began with. Elements MUST be handled in order.
```

```
REQUIREMENT: A new grant MUST be applied to function members only: a
             granted member delegates, an ungranted one dies with
             `CapabilityDenied`. Non-function members MUST stay as they were
             at capture, and the layer MUST NOT expose a member the wrapped
             object does not have (INV-BR-038).
```

```
REQUIREMENT: A refusal, defect or timeout of a re-resolution MUST be applied
             as a grant of no members, MUST be logged at warning level and
             MUST publish `resolution-refused` with the capture's route. It
             MUST NOT change the state of the consumer: a required capture
             that is re-resolved to nothing leaves the plugin `active`, and
             its calls die with `CapabilityDenied`.
```

```
REQUIREMENT: When `changes` fails or ends, the host MUST log it at error
             level and make no further re-resolution; grants already
             applied MUST stay as they are.
```

This is the seam the entitlement companion needs when a licence lapses: the
policy that answered "all of `Inventory`" at activation can answer "only
`get` and `list`" now, and the plugin's captured object follows without the
plugin having to cooperate (entitlement INV-EN-002) — specified there as
`Entitlement.capabilityPolicy` (entitlement BEH-EN-025–028, CCR-EN-003). Renewal works the same
way and can restore members, never beyond what the provider delivered.

**Settled here.** (1) Re-resolution narrows the object core built; it is no
more a boundary for in-process code than the first grant was (BEH-BR-278).
(2) A re-resolution refusal does not fail the plugin: failure is sticky and
operator-cleared, and a lapse that renews in an hour should not need an
operator. The plugin sees denied calls, which is what it would see had the
grant been narrower from the start. (3) The layer is added even for
`Grant.all` when the policy declares `changes`, because a layer that does
not exist cannot narrow later; a policy without `changes` keeps the zero
cost of BEH-BR-275.

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
                 layer when the policy declares no `changes`, and a
                 delegating layer when it does; the narrowed object exposes nothing the wrapped one
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
             107. Call-log failure policy: under "drop" a full queue drops
                 and counts the entry and a failing `record` is counted,
                 neither changing the outcome nor making the caller wait;
                 under "refuse" a full queue refuses the call before the
                 member runs, a failing or slow `record` makes the call die
                 with `CallLogUnavailable` and no value reaches the
                 consumer, a denied call keeps `CapabilityDenied`, and a
                 synchronous member is refused only at admission; `select`
                 returning "drop" or "refuse" overrides the port's default;
                 at close, queued entries get `callLogTimeout` and waiting
                 callers die with "host-closing"; `Host.controls.callLog`
                 reports the counters (BEH-BR-279).
             110. Core's entries have `kind` "call" or, for a refused
                 capture, "refusal"; `Host.offerCallEntry` queues
                 "crossing", "refusal" and "revocation" entries completed
                 with actor, correlation and annotations from the fiber,
                 refuses a malformed one with `InvalidCallEntry`, follows
                 its `onFailure`, and does nothing with no `CallLog`;
                 entries carry the fiber's `correlationId`;
                 `PrincipalRef.decode(PrincipalRef.encode(r))` equals `r`
                 for ids and realms containing "/", ":" and ";", and
                 `decode` refuses every other string (BEH-BR-276,
                 BEH-BR-280).
             112. An offered entry of kind "dispatch" with a non-empty
                 `dispatch.command` is queued with `kind` "dispatch", its
                 `dispatch` fields unchanged, actor, correlation and
                 annotations from the fiber; one with an empty `command`,
                 without `dispatch`, or with `dispatch` on another kind
                 fails with `InvalidCallEntry` and queues nothing; core's
                 capture never produces kind "dispatch"; a string `epoch` on
                 a crossing or revocation entry is recorded unchanged
                 (BEH-BR-276, BEH-BR-280).
             111. With `changes` declared, an element re-resolves exactly
                 the matching live captures, narrowing later calls and not
                 calls in progress; renewal restores members up to the
                 delivered set and never beyond; a refusal re-resolves to no
                 members, publishes `resolution-refused` and leaves the
                 plugin `active`; `Grant.all` keeps a layer only when
                 `changes` is declared; an ended stream stops re-resolution
                 and keeps the grants applied (BEH-BR-275, BEH-BR-281).
```

---

_Previous: [28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md)_ · _Next: [30 — Operation Context Annotations](./30-operation-context-annotations.md)_
