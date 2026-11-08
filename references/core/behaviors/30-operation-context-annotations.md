# 30 — Operation Context Annotations

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-30                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-BR-292 `CallerContext` carries `correlationId` and `serve` sets `CurrentCorrelation` (G58); check 106 (CCR-BR-026)<br>0.2 (2026-11-08): a deadline shortens the per-call timeout of `use`/`useAll` only (not `lease`, not an absent timeout); flow "wire" and `Annotations.decode` for host boundaries (BEH-BR-296, `Deadline` never crosses); `CallerContext` for code served on behalf of a caller; `reconcile` entry records carry the parent call's annotations (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-018); hook dispatch among the waits a deadline shortens (CCR-BR-019) |

---

An `OperationContext` (22 — Attributable Operations, BEH-BR-185) carries an
actor, a reason and a correlation. Several companions need to carry more
along a chain of calls, and need it to arrive in the same shape wherever it
is read: an agent runtime marks data that came from an untrusted source
(*taint*) and records where it came from (*provenance*); a request handler
gives a whole chain of work a *deadline*; a multi-site application labels
calls with the site they serve. Each of these could be a private fiber
reference of its own companion, but then none of them would reach the gate,
the call log or the audit trail, and none would cross the event bus, because
core would not know they exist.

This file adds one extensible, typed **annotation bag**: typed keys declared
by whoever owns the label, a combining rule per key, and a declared list of
**flows** — the places core is allowed to carry each key. Core defines three
keys (`Deadline`, `Taint`, `Provenance`), interprets only `Deadline`, and
carries the rest without reading them. It has no SPEC.md source section
([ADR-BR-045](../decisions/045-operation-context-annotations.md)). This file
owns and uses BEH-BR-289–296.

> **What this is not**
>
> Annotations are labels carried by trusted code in one process. Core does
> not check a taint before a call, does not stop code from dropping a label
> it is able to drop, and does not verify that a provenance entry is true.
> Enforcement on these labels belongs to the companions that read them (for
> example the hook points of
> [31 — Hook Points](./31-hook-points.md) and the agent companion,
> [`references/agent/`](../../agent/README.md)), and a label is only as reliable as the code that set
> it ([ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)).

Planned source: `packages/core/src/Annotations.ts` *(Planned)*.

## BEH-BR-289: Annotation keys and the annotation bag

> **Invariant:** [INV-BR-039](../invariants.md#inv-br-039-annotations-reach-records-only-through-declared-flows)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031)

```ts
// illustrative — not type-checked
type Flow = "events" | "gate" | "policy" | "callLog" | "audit" | "wire"   // "wire": BEH-BR-296

interface AnnotationKey<A> {
  readonly id: string                               // "domain/name"; the "bridger:" prefix is reserved for core
  readonly schema: Schema.Codec<A, unknown>         // encodes the value for the trail, the call log and a transport
  readonly combine: (current: A, incoming: A) => A  // used when a value is added where one is present
  readonly monotonic: boolean                       // true: the API offers no way to replace or remove it
  readonly flows: readonly Flow[]
}
declare const Annotation: {
  readonly key: <A>(id: string, options: Omit<AnnotationKey<A>, "id">) => AnnotationKey<A>
  // runs `effect` with `value` combined into the calling fiber's annotations
  readonly add: <A>(key: AnnotationKey<A>, value: A) => <X, E, R>(effect: Effect.Effect<X, E, R>) => Effect.Effect<X, E, R>
  // non-monotonic keys only: replaces or removes the value for `effect`
  readonly replace: <A>(key: AnnotationKey<A>, value: Option.Option<A>) => <X, E, R>(effect: Effect.Effect<X, E, R>) => Effect.Effect<X, E, R>
  readonly current: Effect.Effect<Annotations>
  readonly get: <A>(key: AnnotationKey<A>) => Effect.Effect<Option.Option<A>>
}

interface Annotations {                              // immutable; created only by Annotations.* and Annotation.*
  readonly get: <A>(key: AnnotationKey<A>) => Option.Option<A>
  readonly keys: readonly string[]                   // sorted by id
}
declare const Annotations: {
  readonly empty: Annotations
  readonly add: <A>(bag: Annotations, key: AnnotationKey<A>, value: A) => Annotations
  readonly filter: (bag: Annotations, flow: Flow) => Annotations
  readonly encode: (bag: Annotations) => { readonly entries: readonly AnnotationEntry[]; readonly omitted: readonly string[] }
  // BEH-BR-296: rebuilds a bag from entries, for the keys the receiver declares
  readonly decode: (entries: readonly AnnotationEntry[], keys: readonly AnnotationKey<any>[]) =>
    { readonly bag: Annotations; readonly rejected: readonly string[] }
}
interface AnnotationEntry { readonly key: string; readonly value: unknown }   // value: the schema's encoded form (JSON)

interface OperationContext { /* 22 */ readonly annotations?: Annotations }
// Context.Reference "@bridger/core/CurrentAnnotations", default Annotations.empty
```

```
REQUIREMENT: An annotation key MUST be identified by its `id`. Two key
             objects with the same `id` in one bag MUST make
             `Annotations.add` die with `DuplicateAnnotationKey { id }`; ids
             beginning with "bridger:" MUST be accepted only for the keys
             core defines (BEH-BR-290).
```

```
REQUIREMENT: Adding a value for a key already present MUST store
             `combine(current, incoming)`. `Annotation.replace` MUST die
             with `MonotonicAnnotation { id }` for a key declared
             `monotonic: true`.
```

```
REQUIREMENT: A bag MUST be immutable. Core MUST accept as `annotations`, and
             as the value of `CurrentAnnotations`, only bags created by the
             `Annotations` and `Annotation` functions; any other value MUST
             be treated as `Annotations.empty` and logged at error level.
```

```
REQUIREMENT: Core MUST NOT interpret any annotation other than `Deadline`
             (BEH-BR-291). It MUST carry each key only along the flows the
             key declares (BEH-BR-292, BEH-BR-293).
```

**Settled here.** (1) A per-key `combine` is mandatory, because the
question "what happens when two contexts meet" has a different answer per
label — the earlier deadline wins, taints accumulate, a site label should
probably not change at all (its owner makes `combine` keep the first value).
(2) The flows are declared by the key's owner, not chosen per call: whether a
label may reach the audit trail is a property of the label, decided once
where it is defined and reviewable there.

## BEH-BR-290: The keys core defines

> **Invariant:** [INV-BR-039](../invariants.md#inv-br-039-annotations-reach-records-only-through-declared-flows)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031)

```ts
// illustrative — not type-checked
Annotation.Deadline    // id "bridger:deadline"    A = { readonly at: number }   epoch ms from Clock
                       //   combine: earlier wins; monotonic: true; flows: events, gate, policy, callLog (never "wire")
Annotation.Taint       // id "bridger:taint"       A = ReadonlySet<string>      opaque labels
                       //   combine: union;        monotonic: true; flows: events, gate, policy, callLog, audit, wire
Annotation.Provenance  // id "bridger:provenance"  A = readonly { readonly source: string; readonly ref?: string }[]
                       //   combine: append, keeping the first occurrence of each (source, ref), at most 32 entries;
                       //   monotonic: true; flows: events, gate, policy, callLog, audit, wire
```

```
REQUIREMENT: Core MUST define exactly these three keys, with the ids,
             types, combining rules, monotonicity and flows shown.
```

```
REQUIREMENT: Core MUST NOT assign meaning to a taint label or a provenance
             entry, and MUST NOT set either itself.
```

```
REQUIREMENT: `Deadline.at` MUST be read and compared using `Clock`
             (24 — Time, Identifiers and Sequence, BEH-BR-211).
```

Defining taint and provenance in core, rather than in the agent companion,
is what lets two companions that never heard of each other agree on them:
a tool runner that taints its output and a hook point that refuses tainted
input meet on `bridger:taint`. Defining them costs core nothing, because it
only carries them.

**Settled here.** `Deadline` does not flow to the audit trail: a record
already carries its own `timestamp`, and the deadline of the call that asked
for a change is not a fact about the change. A consumer that needs it there
defines its own key.

## BEH-BR-291: A deadline shortens waits that already have a timeout

> **Invariant:** [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031)

```
REQUIREMENT: When the calling fiber carries `Deadline`, the effective bound
             of each of the following MUST be the earlier of its own timeout
             and the deadline, with the same outcome as its own timeout:
             - the per-call timeout of `Host.use` and `useAll` when
               `options.timeout` is given (09 — Leases, BEH-BR-087), which
               bounds the callback's run, with outcome `LeaseTimeout`;
             - `OperationGate.authorize` (a refusal with reason
               "gate-timeout", 25 — Operation Gate, BEH-BR-221);
             - `CapabilityPolicy.resolve` ("policy-timeout",
               29 — Capability Grants and Call Log, BEH-BR-274);
             - a hook point's dispatch (its effective deadline,
               31 — Hook Points, BEH-BR-303).
             A deadline already past when the wait begins MUST produce that
             outcome at once.
```

```
REQUIREMENT: A deadline MUST NOT bound anything that has no timeout of its
             own: `Host.use` and `useAll` called without `options.timeout`
             are not bounded by it, and `Host.lease`, whose admission is
             immediate (granted or refused with `ServiceUnavailable`, 09)
             and which has no timeout, is not affected by it.
```

```
REQUIREMENT: A deadline MUST NOT shorten `auditTimeout`, `drainTimeout`,
             `buildTimeout`, `shutdownTimeout`, `fingerprintTimeout` or
             `callLogTimeout`, and MUST NOT interrupt a transition after its
             intent is recorded (INV-BR-010).
```

A deadline is a caller's budget. It may end the caller's waiting, as a
caller's own interruption may; it may not change what the host records or
how a transition it has committed to runs. Shortening `auditTimeout` would
let a caller's budget decide whether a change is recorded; shortening a
drain would let it force-revoke other callers' leases.

**Settled here.** (0) A deadline shortens only bounds a caller already
chose: a `use` without `options.timeout` keeps the unbounded run its caller
asked for, so that adding a `Deadline` somewhere up a chain gives no call an
outcome its type and its caller did not expect; a caller that wants its
deadline to end its `use` passes a timeout. Leases are admitted at once or
refused, so there is no lease wait to shorten. (1) The gate is shortened, and a refusal follows: a caller
whose deadline has passed would not use an approval that arrived later, and
the uninterruptible passage after approval (BEH-BR-188) is untouched because
the bound ends before approval, never after.

## BEH-BR-292: How annotations propagate

> **Invariant:** [INV-BR-039](../invariants.md#inv-br-039-annotations-reach-records-only-through-declared-flows)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031)

```
REQUIREMENT: A mutating host call MUST resolve its annotations once, at
             step 2 of BEH-BR-188, together with its actor: the calling
             fiber's `CurrentAnnotations`, to which, when `options.context`
             supplies `annotations`, each supplied value is added — combined
             for a monotonic key, replacing for any other. A supplied
             context MUST NOT remove a monotonic key the fiber carries.
```

```
REQUIREMENT: Core MUST NOT change `CurrentAnnotations` on a service call:
             a provider's method runs in the caller's fiber and sees the
             caller's annotations, and fibers forked from it inherit them.
```

```
REQUIREMENT: Core MUST run with `CurrentAnnotations` set to
             `Annotations.empty` every piece of plugin code it starts:
             builds (and so the builds of children), finalizers, background
             fibers, health checks and `whenAvailable` runs — the same code
             for which BEH-BR-187 resets `CurrentActor`.
```

```
REQUIREMENT: The event bus MUST run each listener with the dispatcher's
             annotations filtered to the keys whose flows include "events",
             taken when the dispatch starts. Keys without "events" MUST NOT
             be visible to a listener. This applies to `emit`, `parallel`,
             `serial` and `waterfall` alike.
```

```
REQUIREMENT: `OperationRequest` MUST carry `annotations`: the call's
             resolved annotations filtered to flow "gate". When a generic
             gate request type exists ([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md)), every
             gate request MUST carry them under the same rule.
             `ResolutionRequest.annotations` MUST be the capturing fiber's
             annotations filtered to flow "policy" — empty for activation
             captures, which run in no caller's fiber.
```

```
REQUIREMENT: Annotations MUST cross a process boundary only under
             BEH-BR-296; core itself does not cross one.
```

```ts
// illustrative — not type-checked
interface CallerContext {
  readonly actor: Actor
  readonly annotations: Annotations
  readonly correlationId?: string        // the invoker's CurrentCorrelation, when set (22, BEH-BR-187)
}
declare const CallerContext: {
  // the calling fiber's CurrentActor, CurrentAnnotations and CurrentCorrelation
  readonly current: Effect.Effect<CallerContext>
  // runs `effect` with CurrentActor = ctx.actor, CurrentAnnotations = ctx.annotations
  // combined into what the fiber carries (monotonic keys kept) and, when ctx.correlationId
  // is present, CurrentCorrelation = ctx.correlationId; the principal is not touched
  readonly serve: (ctx: CallerContext) => <X, E, R>(effect: Effect.Effect<X, E, R>) => Effect.Effect<X, E, R>
}
```

```
REQUIREMENT: Code that one party registers and another party invokes as a
             request made on the invoker's behalf — a contribution's handler
             run by a dispatcher with a context captured when it was
             contributed, rather than a service method run in the caller's
             fiber — is a *served call*. Whoever runs a served call MUST run
             it inside `CallerContext.serve(ctx)`, with `ctx` read by
             `CallerContext.current` in the invoking fiber, so that the
             served code sees the invoker's actor, annotations and
             correlation, exactly as a provider's method does. `CallerContext.serve` MUST NOT
             change the fiber's plugin principal: the principal stays the
             one the running context carries (for a handler run with the
             contributor's captured context, the contributor's), so a host
             call the served code makes records the invoker's actor and
             annotations and `onBehalfOf` the contributor (28 — Plugin
             Principal and Mandatory Policy, BEH-BR-258, BEH-BR-259).
```

```
REQUIREMENT: `CallerContext.serve` MUST combine the given annotations into
             those the fiber carries under each key's `combine`, and MUST
             NOT remove a monotonic key the fiber carries. Core's own
             dispatchers — event listeners (BEH-BR-144) and hooks (31 — Hook
             Points, BEH-BR-306) — are not served calls: they keep the rules
             of those files (actor reset, annotations filtered or
             read-only).
```

Emptying the bag at the entry points of plugin code is the rule of
BEH-BR-187 applied to labels: a deadline or a taint of the operator call
that installed a plugin has nothing to do with what that plugin's background
fiber does an hour later. Carrying event-flow keys across the bus is the
opposite case: a listener processing an event raised while handling
untrusted input is processing that input, and the taint must follow it.

**Settled here.** (1) A supplied `options.context` wins entirely over the actor
(BEH-BR-187) but cannot launder a monotonic label: if it could, any call that
states an actor would silently clear the taint of the fiber that made it.
(2) A served call is the one place where a context captured at one moment
runs work requested at another. Without `CallerContext.serve` the handler
would run with the contributor's reset actor and empty annotations, and a
nested request or host call from it would be unattributed and untainted —
a laundering route through honest code. `serve` adds no power: `CurrentActor`
and `CurrentAnnotations` are references any code can provide; it fixes one
way of using them so that every companion that dispatches does the same.
Revision 0.2 kept the correlation out of `CallerContext` because core kept
none in the fiber. Revision 0.3 (CCR-BR-026) adds `CurrentCorrelation` (22,
BEH-BR-187; [ADR-BR-054](../decisions/054-correlation-in-the-fiber.md)), and
`CallerContext` carries it, so a nested host call from served code records
the invoker's correlation without the dispatcher passing it in
`options.context` (URS gap G58). A `ctx` without `correlationId` leaves the
fiber's `CurrentCorrelation` as it is.

## BEH-BR-293: Which annotations reach audit records and the call log

> **Invariant:** [INV-BR-039](../invariants.md#inv-br-039-annotations-reach-records-only-through-declared-flows), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031), [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)
> **Regulatory:** supports ALCOA+ Attributable; 21 CFR 11.10(e)

```ts
interface AuditRecord {
  // ... (23, BEH-BR-195)
  readonly annotations?: readonly AnnotationEntry[]     // flow "audit", encoded, sorted by key
  readonly annotationsOmitted?: readonly string[]       // key ids only
}
```

```
REQUIREMENT: The `requested`, `rejected` and terminal records of a mutating
             call MUST carry, as `annotations`, the call's resolved
             annotations whose flows include "audit", each encoded with its
             key's schema, sorted by key id, and the same on every record of
             the call. The records of each entry of a `reconcile` (18 —
             Reconciliation and Confluence) MUST carry the `reconcile`
             call's resolved annotations under the same rule. System records
             MUST carry none. When no key qualifies, both fields MUST be
             absent.
```

```
REQUIREMENT: A value MUST be omitted, and its key id listed in
             `annotationsOmitted`, when its encoding fails, when its decoded
             value contains a `Redacted` at any depth, or when adding it
             would exceed 16 entries or 4096 bytes of UTF-8 JSON for the
             record's `annotations`. Keys MUST be admitted in id order until
             a limit is reached.
```

```
REQUIREMENT: Core MUST NOT place a configuration value in an annotation or
             derive an annotation from configuration. Core documentation
             MUST state that a key whose flows include "audit" or "callLog"
             MUST NOT carry configuration values or secrets
             ([ADR-BR-033](../decisions/033-no-config-values-in-audit.md)).
```

```
REQUIREMENT: A `CallEntry` (29, BEH-BR-276) MUST carry the calling fiber's
             annotations whose flows include "callLog", encoded and limited
             under the same rules; omitted keys are not listed in a
             `CallEntry`.
```

```
REQUIREMENT: Annotations MUST NOT appear in snapshots, `Host.events`, logs,
             spans or metrics, and MUST NOT reach the `ConfigFingerprinter`
             (BEH-BR-192).
```

Recording the taint and provenance of the call that made a change answers a
question an agent-driven system will be asked: was this plugin installed on
the strength of input nobody trusted? Omitting what cannot be encoded, and
saying so by key id, keeps the record honest without letting a malformed
label fail a change.

**Settled here.** (1) `annotations` and `annotationsOmitted` are new
optional fields of the version-1 record shape, on the same pre-release
ground as `definition` (23 — Audit Sink and Record, BEH-BR-195, Settled (4)).
(2) Refusing `Redacted` is the one check core can make mechanically for
ADR-BR-033; the rest is the key owner's declaration, reviewed where the key
is defined.

## BEH-BR-294: Labels are carried, not enforced

> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031), [RSK-BR-028](../gxp/03-risk-assessment.md#rsk-br-028)

```
REQUIREMENT: Core documentation MUST state that core refuses no call on the
             strength of a taint or provenance; that monotonic keys are
             protected only against removal through the `Annotation` API,
             not against code that provides `Annotations.empty` directly or
             starts work in a fresh fiber; and that a provenance entry is a
             claim of the code that added it.
```

```
REQUIREMENT: Core documentation, types and events MUST NOT describe
             annotations as information-flow control, isolation or an
             access-control mechanism.
```

## BEH-BR-295: No annotation changes nothing

> **Invariant:** [INV-BR-037](../invariants.md#inv-br-037-an-unwired-policy-port-changes-nothing)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)

```
REQUIREMENT: When no code adds an annotation, every operation MUST behave
             exactly as files 02–29 specify; records MUST omit
             `annotations` and `annotationsOmitted`, and every
             `OperationRequest` MUST carry `Annotations.empty`.
```

## BEH-BR-296: Annotations across a host boundary

> **Invariant:** [INV-BR-039](../invariants.md#inv-br-039-annotations-reach-records-only-through-declared-flows)
> **See:** [ADR-BR-045](../decisions/045-operation-context-annotations.md)
> **Satisfies:** [URS-BR-035](../urs.md#urs-br-035-carry-labels-such-as-taint-provenance-and-deadline-across-calls)
> **Risk:** [RSK-BR-031](../gxp/03-risk-assessment.md#rsk-br-031)

```
REQUIREMENT: A companion that carries work from one host or process to
             another — a remote call, a callback, a federated call, a
             durable event — MUST send the sender's annotations as
             `Annotations.encode(Annotations.filter(bag, "wire"))`: encoded
             `AnnotationEntry[]`, never a flattened string map. Keys whose
             flows do not include "wire" MUST NOT be sent.
```

```
REQUIREMENT: `Annotation.Deadline` MUST NOT declare "wire" and MUST NOT be
             sent. A transport that wants the remote work bounded by the
             sender's deadline MUST send the remaining time as its own
             relative per-call timeout, and the receiver MAY start a new
             `Deadline` from it with its own `Clock`.
```

```
REQUIREMENT: `Annotations.decode(entries, keys)` MUST rebuild a bag from
             the entries whose `key` is the id of one of `keys` and whose
             value decodes with that key's schema; every other entry MUST
             be left out and its key listed in `rejected`. Ids beginning
             with "bridger:" MUST decode only with the keys core defines.
             The bag returned is a bag made by core (BEH-BR-289).
```

```
REQUIREMENT: The receiver MUST run the work it serves with the decoded bag
             combined into its own fiber's annotations (through
             `CallerContext.serve`, BEH-BR-292, or `Annotation.add`), never
             replacing them, so that a monotonic key received is kept and a
             monotonic key the receiver carries is not removed.
```

A string map loses the schema, the combining rule and monotonicity, and so
cannot be turned back into a bag; a taint that crosses as text arrives as
nothing. A deadline is the opposite case: it is an instant on the sender's
clock, meaningless and possibly hours stale on the receiver's, and, being
monotonic, it could not be removed once accepted.

**Settled here.** (1) Which keys cross is decided by the key's owner when it
declares the key, like every other flow, not by each transport. (2) A
receiver decodes only keys it declares: an unknown key cannot be combined
or checked, and is reported, not guessed.

---

## Acceptance checks

These extend BEH-BR-184 of [21 — Testing Host](./21-testing-host.md) and are
allocated to `REQ-BR` scenarios in traceability §5.

```
REQUIREMENT: The following checks MUST pass before this file's behaviours
             are claimed:
             74. Keys combine as declared; a monotonic key cannot be
                 replaced through the API nor removed by a supplied
                 `options.context`; a bag not made by core is treated as
                 empty; the three core keys have the shapes of BEH-BR-290
                 (BEH-BR-289, BEH-BR-290, BEH-BR-292).
             75. Propagation: a provider's method sees its caller's
                 annotations; builds, finalizers, background fibers, health
                 checks and `whenAvailable` runs start empty; listeners of
                 every dispatch mode see only "events" keys; the gate sees
                 only "gate" keys and the policy only "policy" keys; a
                 `Deadline` shortens the per-call timeout of `use` and
                 `useAll`, the gate and the policy with their own outcomes,
                 bounds no `use` without a timeout and no `lease`, and leaves
                 audit, drain, build and shutdown bounds unchanged; a served
                 call run inside `CallerContext.serve` sees the invoker's
                 actor and annotations and keeps the contributor's principal,
                 and a nested host call from it records both; `encode` of
                 the "wire" filter carries taint and provenance and never
                 the deadline, and `decode` rejects unknown keys and combines
                 into the receiver's bag (BEH-BR-291, BEH-BR-292,
                 BEH-BR-296).
             76. Records of a mutating call carry the "audit" keys,
                 encoded, sorted and equal on every record of the call;
                 system records carry none; an unencodable value, a
                 `Redacted` value or one beyond the limits is omitted and
                 named in `annotationsOmitted`; the entry records of a
                 `reconcile` carry the `reconcile` call's "audit" keys; call-log entries carry
                 "callLog" keys; no annotation appears in snapshots,
                 events or logs; with none set, the suites of files 02–29
                 pass unchanged (BEH-BR-293, BEH-BR-295).
             106. Correlation in the fiber: a call takes `options.context`'s
                 `correlationId`, else the fiber's `CurrentCorrelation`,
                 else a generated one; the gate request, every record of the
                 call, the system records it causes and the builds and
                 finalizers they run see that id, and a host call from such
                 a build records it; background fibers, health checks and
                 `whenAvailable` runs start with none; listeners see the
                 dispatcher's; `CallerContext.serve` sets the invoker's for
                 a served call and a nested host call records it; a root
                 system record takes the fiber's correlation when one is
                 set; a `CallEntry` carries the caller's; the
                 `ConfigFingerprinter` never sees one; no correlation
                 appears in snapshots, events or logs (22 — Attributable
                 Operations, BEH-BR-187; 23 — Audit Sink and Record,
                 BEH-BR-199; BEH-BR-292).
```

---

_Previous: [29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md)_ · _Next: [31 — Hook Points](./31-hook-points.md)_
