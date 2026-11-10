# 33 — Realm Families

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-33                                               |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-10): BEH-BR-329 `FamilyEvictionError` declared, carrying the stopping step, its error and the outcome; BEH-BR-333 `family.evict` and `reset` fail with it, "realm-kept" for `RealmInUse` (CL5); BEH-BR-336 `Realm.ephemeral`'s union gains `HostClosed`, a rejected reconcile entry fails creation with `FamilyMemberUnavailable` "rejected" (CL4); REQ-BR-085 and REQ-BR-086 extended (CCR-BR-036)<br>0.7 (2026-11-10): BEH-BR-331 the failed and refused-digest rules hold for any "creating" member, an expired wait included (C9); BEH-BR-334 `use` reports the reason the member was marked with, and an operator `enable` or `replace` recovers a refused-digest plugin (Low); BEH-BR-329 family scope close and BEH-BR-336 teardown and creation undo stop on any error of any step, `retireRealm` refused and `HostClosed` included; `FamilyEvent.outcome` "refused" (C10); REQ-BR-084, 086 rows (CCR-BR-035)<br>0.6 (2026-11-10): BEH-BR-329 family scope close removes a `failed(cleanup)` plugin as BEH-BR-047 allows, as an ephemeral realm does (C13); BEH-BR-331 a ready member whose plugin fails or is refused is marked "failed" (C16); BEH-BR-336 a teardown step refused by the gate or blocked by the latch stops, logs at error level and leaves the realm visible (C19) (CCR-BR-034)<br>0.5 (2026-11-09): BEH-BR-331 a member is ready when every plugin is `active`, `dormant` or disabled by an operator; a plugin disabled "refused-digest" fails the member ("rejected"); after `activationTimeout` the member stays "creating", the next `use` waits again without a host call, and BEH-BR-333 lets idle eviction evict it (U-03); BEH-BR-336 `EphemeralRealm.use` is `Host.useAll` with the realm, with its callback shape and error union (C-15); acceptance row REQ-BR-084 (CCR-BR-033)<br>0.4 (2026-11-09): BEH-BR-336 `Realm.ephemeral` adds `InvalidRealm` from `defineRealm` (C-02) (CCR-BR-032)<br>0.3 (2026-11-08): BEH-BR-337 "/" reserved as the narrowing delimiter, `isWithin` specified for ids that keep it, a Settled paragraph (host-core prototype finding G-P8; actor half of gap G47) (CCR-BR-028)<br>0.2 (2026-11-08): eviction and teardown prune through `reconcile` with `pruneDrain`/`pruneForce`; a per-realm turn serialises `retireRealm` with registrations into the realm; eviction outcomes on the family's own `events` stream, not the host feed; `family.use` aligned with `Host.useAll`; duplicate family ids a documented precondition (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

---

A realm runs a plugin once per resolution namespace
([17 — Realms and Interception](./17-realms-and-interception.md)). Some
applications need a realm per *key* — per customer organisation, per
workspace, per open document — for keys that are not known when the host
starts, most of which are idle most of the time. Others need a realm per
*task*: a short-lived scope for delegated work, such as a sub-agent with its
own tools, that disappears when the task ends. Today both must be assembled
by hand from `defineRealm`, `install` and `remove`, and neither can give a
realm back, because realms live as long as their host. This file adds three
helpers — `Realm.family`, created lazily per key and evicted when idle only
through lease drain; `Realm.ephemeral`, bound to a scope; and `Actor.narrow`,
a derived label for work done on someone's behalf — and one host operation,
`retireRealm`, which retires an empty realm. It has no SPEC.md source section
([ADR-BR-048](../decisions/048-realm-families-and-retirement.md), amending
[ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md) for realm
retirement only). This file owns BEH-BR-329–344 and uses BEH-BR-329–338;
numbers 339–344 of the block are reserved.

> **What core does not do — and who does**
>
> A realm family is **not** tenancy, isolation or data separation, and core
> offers no "tenant" option. Members of a family share one process, one heap,
> one event bus and every base service, exactly as realms do
> ([BEH-BR-150](./17-realms-and-interception.md#beh-br-150-a-realm-is-not-a-security-boundary)).
> A consumer that needs one customer's data kept from another builds that in
> its services (separate credentials and connections) or runs separate
> processes, and justifies it in its own risk assessment. `Actor.narrow`
> confers no authority and restricts none: it is a label. Restricting what a
> narrowed actor may do is the consumer's gate or capability policy
> ([29 — Capability Grants and Call Log](./29-capability-grants-and-call-log.md)).

Planned source: `packages/core/src/RealmFamily.ts` *(Planned)*;
`Host.retireRealm` in `packages/core/src/Host.ts` and `Actor.narrow` in
`packages/core/src/Attribution.ts` *(Planned)*.

## BEH-BR-329: A realm family is a helper outside the Host, with one owner

> **Invariant:** [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-024](../decisions/024-shared-state-helpers.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle)
> **Risk:** [RSK-BR-034](../gxp/03-risk-assessment.md#rsk-br-034), [RSK-BR-013](../gxp/03-risk-assessment.md#rsk-br-013)

```ts
// illustrative — not type-checked
interface RealmFamilyOptions<K extends string> {
  readonly id: string                                          // family id; member realms are `${id}/${key}`
  readonly realm: (key: K) => RealmOptions                     // must return equal options for one key every time
  readonly plugins: (key: K) => readonly DesiredPlugin[]       // the member's plugin set; realm field ignored
  readonly context: OperationContext                           // actor and reason for every host call the family makes
  readonly idleEvict?: { readonly after: Duration.Input; readonly drain?: Duration.Input } | "never"
                                                               // default "never"
  readonly activationTimeout?: Duration.Input                  // default 30 seconds
}

interface RealmFamily<K extends string> {
  readonly use: <A, E, R, Keys extends readonly Context.Key<any, any>[]>(
    key: K, keys: Keys, run: (services: ServicesOf<Keys>) => Effect.Effect<A, E, R>,   // as Host.useAll (09)
    options?: { readonly timeout?: Duration.Input }
  ) => Effect.Effect<A, E | FamilyMemberUnavailable | ServiceUnavailable | UnknownRealm | LeaseRevoked
                        | LeaseTimeout | ResolutionRefused | HostClosed, R>
  readonly members: Effect.Effect<readonly { readonly key: K; readonly realm: string;
    readonly status: "creating" | "ready" | "failed" | "evicting"; readonly holders: number }[]>
  readonly events: Stream.Stream<FamilyEvent>     // BEH-BR-333; the family's own feed, not Host.events
  readonly evict: (key: K, options?: OperationOptions) => Effect.Effect<void, FamilyEvictionError>
  readonly reset: (key: K, options: { readonly context: OperationContext }) => Effect.Effect<void, FamilyEvictionError>
}

declare const Realm: {
  family<K extends string>(host: Host, options: RealmFamilyOptions<K>):
    Effect.Effect<RealmFamily<K>, never, Scope.Scope>
}

interface FamilyEvent {
  readonly type: "family-eviction"
  readonly family: string
  readonly key: string
  readonly outcome: "completed" | "incomplete" | "realm-kept" | "forced" | "refused"
                                  // "refused": a step failed with an error other than DrainTimeout
                                  // or RealmInUse — a gate refusal, the latch, HostClosed (BEH-BR-329, 333)
}

class FamilyMemberUnavailable extends Schema.TaggedError<FamilyMemberUnavailable>()("FamilyMemberUnavailable", {
  family: Schema.String, key: Schema.String,
  reason: Schema.Literal("rejected", "failed", "activation-timeout", "options-changed", "invalid-key", "closed")
}) {}

class FamilyEvictionError extends Schema.TaggedError<FamilyEvictionError>()("FamilyEvictionError", {
  family: Schema.String, key: Schema.String,
  outcome: Schema.Literal("incomplete", "realm-kept", "refused"),   // the eviction's `family-eviction` outcome (BEH-BR-333)
  step: Schema.Literal("reconcile", "retireRealm"),                 // the step that stopped the eviction
  error: Schema.Unknown   // a FamilyStepError (CCR-BR-036)
}) {}
// the error of the step that stopped the eviction: a `reconcile` entry's `reason` (18, BEH-BR-153),
// an error of `reconcile` itself, or an error of `retireRealm` (BEH-BR-335)
type FamilyStepError =
  | ReconcileReport["rejected"][number]["reason"]      // DrainTimeout, OperationRejected among them
  | Unattributed | ReasonRequired | AuditUnavailable | HostClosed | UnknownRealm | RealmInUse
```

```
REQUIREMENT: `Realm.family` MUST be a helper outside the `Host` interface.
             Every change it makes MUST be made through public host
             operations — `defineRealm`, `reconcile` (with `pruneDrain` and
             `pruneForce`, 18 — Reconciliation and Confluence, BEH-BR-155),
             `retireRealm` — under
             `options.context`, so that each is attributed, gated and
             audited as every operator mutation is (22 — Attributable
             Operations, 25 — Operation Gate).
```

```
REQUIREMENT: A family MUST assume one owner: the code that made it. Family
             ids MUST be unique per host; that is a precondition on the
             owner, documented with `Realm.family`. Core MUST NOT claim to
             detect a duplicate: a second family with the same `id` fails
             only where one of its operations collides with the first's
             (for example `DuplicateRealm` when a member realm already
             exists), and otherwise shares the first's reconcile scopes.
```

```
REQUIREMENT: Core names, types, errors, events and documentation for
             families MUST NOT use the words "tenant", "tenancy",
             "isolation" or "sandbox" to describe a family or a member.
             The family's key type MUST be a plain string type.
```

```
REQUIREMENT: When the scope given to `Realm.family` closes, the family MUST
             stop creating members and MUST evict every member as
             BEH-BR-333 specifies, except that at the drain limit it MUST
             retry with `pruneForce: true`, report each forced eviction, and then
             retire the realm. A plugin `failed` with phase "cleanup" MUST
             be removed as BEH-BR-047 allows — the leak acknowledged and
             reported — and retirement MUST follow, as for an ephemeral
             realm (BEH-BR-336).
```

```
REQUIREMENT: When a step of the scope-close eviction of a member cannot
             complete — any error of any step, an entry action or
             `retireRealm` refused by the `OperationGate`, `AuditUnavailable`,
             `Unattributed`, `ReasonRequired`, `HostClosed` or `RealmInUse`
             included — the family MUST treat that member as BEH-BR-336
             treats a teardown step that cannot complete: no bypass of the
             gate or the latch, no retry, the realm left defined with the
             plugins not removed, an error-level log naming the realm, the
             step and the error, and a `family-eviction` event with outcome
             "refused" ("realm-kept" for `RealmInUse`). It MUST then go on
             with the other members, and the close MUST complete, since it
             runs in a finalizer (CCR-BR-035).
```

The family is the generic form of "a realm per customer": nothing in it
knows what a key means. Making its changes through public operations is what
keeps a lazily created member as reviewable as one an operator created by
hand: the trail shows who (the family's context), what (each install and
remove) and why (the context's reason), and the gate sees every one.

**Settled here.** (1) A family takes an `OperationContext`, not an implicit
actor: the calls it makes are made on behalf of whoever configured it,
usually a service actor, and nothing in an end user's request is carried
into them. (2) The scope-close path forces at the limit, as a generation's
scope close does (BEH-BR-169): a finalizer must end. Idle eviction never
forces (BEH-BR-333).

## BEH-BR-330: A member is a realm per key, with options fixed per key

> **Invariant:** [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle), [URS-BR-011](../urs.md#urs-br-011-run-the-same-plugin-once-per-tenant-or-database)

```
REQUIREMENT: The member of key K MUST be the realm `${id}/${K}` together
             with the plugins installed in it by the reconcile scope
             `family:${id}/${K}`. A key that is empty, contains "/", or
             begins with "bridger:" MUST be refused with
             `FamilyMemberUnavailable { reason: "invalid-key" }` and MUST
             cause no host call.
```

```
REQUIREMENT: Every entry of `plugins(K)` MUST be installed into the member
             realm; an entry's own `realm` field MUST be ignored.
```

```
REQUIREMENT: When a member realm is defined again after retirement, the
             options returned by `realm(K)` MUST equal those it was defined
             with before — the same isolated `ServiceId`s and the same
             interceptor objects in the same order. While the realm is
             still defined, a `use` whose `realm(K)` returns different
             options MUST fail with
             `FamilyMemberUnavailable { reason: "options-changed" }`.
```

Realm definitions are immutable (BEH-BR-145), so a key must mean the same
realm every time it is created. A function that returned different isolated
keys for one key on two creations would make the same member resolve
differently on two days, which is a configuration change no operation named.

## BEH-BR-331: A member is created lazily, once, on first use

> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle)
> **Risk:** [RSK-BR-034](../gxp/03-risk-assessment.md#rsk-br-034)

```
REQUIREMENT: The first `use` of a key with no member MUST create it:
             `defineRealm(${id}/${K}, realm(K))` when the realm is not
             defined, then `reconcile(plugins(K), { scope:
             family:${id}/${K}, prune: true })`, both with
             `options.context`. Creation MUST be serialized per key:
             concurrent `use` calls of one key MUST share one creation.
```

```
REQUIREMENT: When `defineRealm` fails, or the reconcile fails or reports
             any entry in `rejected`, the member MUST be marked "failed" and
             the waiting calls MUST fail with
             `FamilyMemberUnavailable { reason: "rejected" }`. Entry actions
             that completed MUST NOT be undone.
```

```
REQUIREMENT: After the reconcile, creation MUST wait, bounded by
             `activationTimeout`, until the member is *ready*: every plugin
             of the member is `active`, `dormant` (a lazy plugin nothing has
             triggered, 27 — Manifest and Lazy Activation, BEH-BR-244), or
             `disabled` by an operator (its entry's `disabled: true`, or an
             operator's `disable`; no `reason`). The member is then "ready".
             A plugin that ends `failed` MUST mark the member "failed"
             (`reason: "failed"`); a plugin that ends `disabled` with reason
             "refused-digest" (28 — Plugin Principal and Mandatory Policy,
             BEH-BR-267) MUST mark it "failed" (`reason: "rejected"`).
             These two rules MUST hold for as long as the member is
             "creating" — during a wait and after a wait expired
             (below) — and after it is "ready": a plugin of such a member
             that enters `failed` (any phase) or `disabled` with reason
             "refused-digest" MUST mark the member "failed" with the same
             `reason`, so that BEH-BR-334 governs it and idle eviction
             never takes a member with a failed or refused plugin
             (CCR-BR-035).
```

```
REQUIREMENT: When `activationTimeout` expires first, the waiting calls MUST
             fail with `reason: "activation-timeout"`, and the member MUST
             stay "creating": the family MUST make no host call for it, and
             its plugins continue as the host moves them. The next `use` of
             the key MUST NOT create the member again; it MUST wait again
             for readiness, bounded by `activationTimeout`, with the same
             outcomes, and concurrent `use` calls MUST share that wait.
             `family.evict` and `family.reset` MAY be called on such a
             member, and idle eviction applies to it (BEH-BR-333).
```

```
REQUIREMENT: Creation MUST NOT run for a key that is not used. The family
             MUST NOT create members ahead of use.
```

Readiness counts what the member's plugins can reach on their own. A lazy
plugin stays `dormant` until a trigger applies, and a read never triggers
(BEH-BR-245), so a `use` through the family does not wake it either: a key it
provides answers `ServiceUnavailable` as through `Host.useAll`, and a caller
that wants it loaded calls `wake`. A plugin the entry lists as disabled is
where its owner wants it. A plugin the `RefusalList` disabled will not start
until the list changes, which is a refusal of the member as a reconcile
rejection is. An expiry, by contrast, says only that the member was slow:
its plugins may still be building or waiting for a provider, and nothing
failed, so the member is neither marked "failed" (which would need a reset,
BEH-BR-334) nor created again (which would issue a second reconcile for no
change); the next `use` waits for it again (CCR-BR-033).

Using `reconcile` with a scope per member reuses ownership (BEH-BR-155): the
family prunes only what it installed for that key, an operator's hand-installed
diagnostic plugin in the same realm is never touched, and a member's plugin
set can be changed by the next creation without a second mechanism.

## BEH-BR-332: Use through the family holds the member

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-044](../invariants.md#inv-br-044-a-realm-is-retired-only-when-empty-and-eviction-never-forces)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle), [URS-BR-005](../urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)

```
REQUIREMENT: `family.use(K, keys, run)` MUST ensure the member is "ready",
             then run `run` through `Host.useAll(keys, run, { realm:
             ${id}/${K} })` with the edge rules of 09 — Leases. For the
             duration of the call the family MUST count one holder on the
             member.
```

```
REQUIREMENT: A `use` that arrives while the member is "evicting" MUST wait
             for the eviction to settle and then create the member again,
             within the call's `timeout` when one is given.
```

```
REQUIREMENT: A member's idle time MUST be measured, with the `Clock`
             service, from the moment its holder count last fell to zero.
```

The family counts its own holders to decide idleness; host leases are what
keeps a provider open, and they remain the only thing the eviction's removal
waits for (BEH-BR-333). A plugin of the member reached by some other path —
`Host.use` with the member's realm, a lease taken by a sibling plugin — is
therefore still protected, even though the family did not see it.

## BEH-BR-333: Idle eviction happens only through lease drain

> **Invariant:** [INV-BR-044](../invariants.md#inv-br-044-a-realm-is-retired-only-when-empty-and-eviction-never-forces), [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle)
> **Risk:** [RSK-BR-034](../gxp/03-risk-assessment.md#rsk-br-034), [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: When `idleEvict` is set and a "ready" member, or a "creating"
             member whose wait expired (BEH-BR-331) and that no call is
             waiting on, has had no holder for `idleEvict.after`, the family
             MUST evict it: mark it
             "evicting", call `reconcile([], { scope: family:${id}/${K},
             prune: true, pruneDrain: idleEvict.drain, pruneForce: false })`
             with `options.context` (`pruneDrain` defaulting to
             `BridgerOptions.drainTimeout`, 18 — Reconciliation and
             Confluence, BEH-BR-155), and then `retireRealm(${id}/${K})`
             (BEH-BR-335).
```

```
REQUIREMENT: Idle eviction MUST NOT pass `force: true` and MUST NOT revoke a
             lease. When a prune fails with `DrainTimeout`, the eviction
             MUST stop, the member's plugins stay as 09 — Leases leaves them
             (stopping, parked), the family MUST report the eviction as
             incomplete, and MUST re-issue the eviction at its next idle
             check.
```

```
REQUIREMENT: When `retireRealm` fails with `RealmInUse` — a plugin not owned
             by the family's scope is installed in the realm — the family
             MUST leave the realm defined, MUST mark the member absent, and
             MUST report it. A later `use` MUST reinstall into the existing
             realm.
```

```
REQUIREMENT: `family.evict(K)` MUST perform the same eviction at once, with
             the caller's context when given, and MUST fail with
             `FamilyEvictionError` carrying the step and the error of the
             step that stopped the eviction, and the eviction's outcome,
             when it cannot complete: "incomplete" for a `DrainTimeout`,
             "refused" for any other error of the `reconcile` or of
             `retireRealm` (a gate refusal, the latch, `HostClosed`), and
             "realm-kept" for `RealmInUse`, which fails the call after the
             member is marked absent as the rule above states.
             `family.reset` MUST fail the same way (CCR-BR-036).
```

```
REQUIREMENT: Every eviction outcome — completed, incomplete, realm kept,
             forced, refused (an eviction step failing with any other error,
             such as a gate refusal or the latch, which stops the eviction
             as `DrainTimeout` does, above, and never bypasses the gate or
             the latch) — MUST be logged and published on the family's own
             `events` stream as a `family-eviction` event naming the family,
             the key and the outcome. A family MUST NOT publish on
             `Host.events`, which carries only what the host itself assigns
             a `seq` to (13 — Observability and Diagnostics, BEH-BR-115).
```

Eviction is an ordinary removal: dependents first, leases drained, scope
closed, records written. That is the guarantee the review asked for — no
customer request in flight is cut off because its realm looked idle to a
counter — and it costs only that an eviction may have to wait, or try again
later.

**Settled here.** An eviction that times out is abandoned, not forced:
"idle" is the family's guess, and a guess must never interrupt a call. The
plugins it began to stop stay parked, unavailable to new consumers, as any
`DrainTimeout` leaves them; the next idle check, or the next `use` of the
key, continues from there.

## BEH-BR-334: A failed member is not recreated by itself

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)

```
REQUIREMENT: A member marked "failed" MUST NOT be evicted by idleness and
             MUST NOT be created again by `use`; `use` MUST fail with
             `FamilyMemberUnavailable` carrying the `reason` the member was
             marked with — "failed" for a failed plugin, "rejected" for a
             rejected creation or a refused digest (BEH-BR-331) — until the
             member is reset or recovers.
```

```
REQUIREMENT: `family.reset(K, { context })` MUST evict the failed member
             with the given context (BEH-BR-333) and mark it absent, so that
             the next `use` creates it again. When an operator's own calls
             bring every plugin of a "failed" member back to what readiness
             requires (BEH-BR-331) — a failed plugin by `retry`, a plugin
             disabled "refused-digest" by an `enable` or `replace` the
             `RefusalList` no longer refuses (28, BEH-BR-267) — the member
             MUST be "ready" again; a member marked failed because its
             creation was rejected recovers only by reset.
```

Evicting a failed member when it went idle and reinstalling it on the next
use would re-run its build — and the side effects of that build — with no
operator decision, which is exactly the automatic retry
[ADR-BR-005](../decisions/005-failure-is-sticky.md) refuses. A failure stays
visible until someone resets it, under their own name.

## BEH-BR-335: retireRealm retires an empty realm

> **Invariant:** [INV-BR-044](../invariants.md#inv-br-044-a-realm-is-retired-only-when-empty-and-eviction-never-forces), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-019](../decisions/019-realms-are-resolution-namespaces.md)
> **Satisfies:** [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle), [URS-BR-039](../urs.md#urs-br-039-run-a-short-lived-plugin-set-for-delegated-work), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e)

```ts
// illustrative — not type-checked
interface Host {
  retireRealm(id: string, operation?: OperationOptions):
    Effect.Effect<void,
      | UnknownRealm | RealmInUse | HostClosed
      | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected>
}
class RealmInUse extends Schema.TaggedError<RealmInUse>()("RealmInUse", {
  id: Schema.String, plugins: Schema.Array(Schema.String)
}) {}
// Operation gains "retireRealm" (22 — Attributable Operations, BEH-BR-185).
```

```
REQUIREMENT: `retireRealm(R)` MUST be a mutating operation following the
             call order of BEH-BR-188. Its validation (step 4) MUST fail with
             `UnknownRealm` when R is not defined, MUST refuse "default" with
             `RealmInUse { id: "default", plugins: [] }`, and MUST fail with
             `RealmInUse` listing the plugins when any plugin — in any
             state, including `disabled`, `failed` and parked `stopping` —
             is installed in R. The emptiness check MUST be repeated at the
             linearization point.
```

```
REQUIREMENT: Each realm R MUST have a realm turn, a serialisation point
             separate from the per-plugin linearization points of
             BEH-BR-065. `retireRealm(R)` MUST take R's turn at its
             linearization point and make its emptiness check and the
             retirement within it. Every operation that registers a plugin
             into R — `install`, `replace` naming R, each `install` or
             `replace` entry of a `reconcile` into R, and
             `Plugin.Runtime.install` of a child into R — MUST take R's turn
             at its own linearization point, MUST re-validate there that R
             is defined, and MUST fail with `UnknownRealm`, registering
             nothing, when R was retired after its validation. A
             registration that took R's turn before a `retireRealm(R)` makes
             that `retireRealm` fail with `RealmInUse`.
```

```
REQUIREMENT: On success the realm MUST disappear from `HostSnapshot.realms`
             in one revision; afterwards `install`, `use`, `useAll` and
             `lease` naming R MUST fail with `UnknownRealm`, and
             `defineRealm(R, options)` MUST be allowed again.
```

```
REQUIREMENT: Retirement MUST NOT stop, remove or revoke anything. A realm
             with a plugin in it MUST NOT be retired by any path.
```

```
REQUIREMENT: The records of `retireRealm` MUST have `operation:
             "retireRealm"` and `target: { id: R, realm: R }`, as
             `defineRealm` does (BEH-BR-196).
```

BEH-BR-145 gave no `removeRealm` because removing a realm would mean
deciding what happens to the plugins still in it. Retirement answers that by
refusing whenever there are any: the plugins are removed first, by the
operations that own them, and retiring the empty namespace is then a
bookkeeping step with nothing to decide. Without it, a family whose keys
keep changing and every ephemeral realm would leave one entry in
`HostSnapshot.realms` each, forever, against NFR-BR-007.

**Settled here.** (1) A retired id may be defined again, because a family
recreates the same member realm after eviction. Records stay unambiguous:
they are ordered by `auditSeq`, and the `retireRealm` and later
`defineRealm` records mark where one definition ends and the next begins.
(2) Retiring "default" is refused with `RealmInUse` rather than a new error
tag, because the default realm is never empty in the sense that matters:
it holds the base services.

## BEH-BR-336: Realm.ephemeral is a realm bound to a scope

> **Invariant:** [INV-BR-044](../invariants.md#inv-br-044-a-realm-is-retired-only-when-empty-and-eviction-never-forces), [INV-BR-020](../invariants.md#inv-br-020-a-realm-changes-resolution-only)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md)
> **Satisfies:** [URS-BR-039](../urs.md#urs-br-039-run-a-short-lived-plugin-set-for-delegated-work)
> **Risk:** [RSK-BR-034](../gxp/03-risk-assessment.md#rsk-br-034)

```ts
// illustrative — not type-checked
interface EphemeralRealm {
  readonly realm: string                          // `ephemeral/${segment}`
  readonly context: OperationContext              // { actor: Actor.narrow(owner.actor, segment), correlationId: owner's }
  readonly use: <A, E, R, Keys extends readonly Context.Key<any, any>[]>(
    keys: Keys, run: (services: ServicesOf<Keys>) => Effect.Effect<A, E, R>,   // as Host.useAll (09)
    options?: { readonly timeout?: Duration.Input }) =>
    Effect.Effect<A, E | ServiceUnavailable | UnknownRealm | LeaseRevoked | LeaseTimeout
      | ResolutionRefused, R>
}

declare const Realm: {
  ephemeral(host: Host, options: {
    readonly segment?: string                     // default: from IdGenerator
    readonly realm: RealmOptions
    readonly plugins: readonly DesiredPlugin[]
    readonly context: OperationContext            // the owner's context
    readonly drain?: Duration.Input               // default BridgerOptions.drainTimeout
    readonly activationTimeout?: Duration.Input   // default 30 seconds
  }): Effect.Effect<EphemeralRealm,
      InvalidRealm | DuplicateRealm | FamilyMemberUnavailable | Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
      | HostClosed,
      Scope.Scope>
}
```

```
REQUIREMENT: `Realm.ephemeral` MUST define the realm `ephemeral/${segment}`,
             reconcile `plugins` into it under the scope
             `ephemeral:${segment}`, and wait, bounded by
             `activationTimeout`, until its plugins are ready as BEH-BR-331
             defines readiness, all with `options.context`. A failure at any
             step — an expiry of that wait included, failing with
             `FamilyMemberUnavailable { reason: "activation-timeout" }` —
             MUST undo the steps already taken, in reverse order, before the
             effect fails. An undo step that cannot complete MUST be handled
             as a teardown step that cannot complete (below): the undo stops
             there, leaves the realm and what it did not remove, logs, and
             the effect fails with the original error (CCR-BR-035).
             A `reconcile` whose report lists a rejected entry fails that
             step: the effect MUST fail with `FamilyMemberUnavailable
             { family: "ephemeral", key: segment, reason: "rejected" }`,
             and a plugin that ends `failed` or `disabled` with reason
             "refused-digest" during the wait with that error and reason
             "failed" or "rejected", as BEH-BR-331 marks a member; every
             `FamilyMemberUnavailable` of `Realm.ephemeral` carries `family`
             "ephemeral" and `key` the segment (CCR-BR-036).
```

```
REQUIREMENT: When the caller's scope closes, the ephemeral realm MUST be
             torn down with `options.context`: `reconcile([], { scope:
             ephemeral:${segment}, prune: true, pruneDrain: options.drain })`,
             then, at the limit, the same with `pruneForce: true`, reporting
             each forced plugin; then `retireRealm`. A plugin `failed` with phase "cleanup" MUST be
             removed as BEH-BR-047 allows, and retirement MUST follow.
```

```
REQUIREMENT: When a teardown step cannot complete — any error of any step,
             including an entry action or `retireRealm` itself refused by
             the `OperationGate` (`OperationRejected`), the call failing
             with `AuditUnavailable` (the audit-degraded latch),
             `Unattributed`, `ReasonRequired` or `HostClosed`, and
             `retireRealm` failing with `RealmInUse` — the teardown MUST
             NOT bypass the gate or the latch and MUST NOT retry; it MUST
             stop at that step, leave the realm defined with the plugins it
             did not remove, log at error level naming the realm, the step
             and the error, and
             then complete, since it runs in a finalizer that cannot fail.
             What it left stays visible in the snapshot until an operator
             removes it and retires the realm.
```

```
REQUIREMENT: `EphemeralRealm.use(keys, run, options)` MUST be
             `Host.useAll(keys, run, { ...options, realm })` with the
             ephemeral realm, with the same callback shape and error union
             (02 — Host Construction, BEH-BR-013; 09 — Leases); after the
             realm is retired it fails with `UnknownRealm`.
```

```
REQUIREMENT: `EphemeralRealm.context` MUST be the context a caller passes for
             host calls made on behalf of the task, with its actor produced
             by `Actor.narrow` (BEH-BR-337).
```

An ephemeral realm is what a sub-agent, a preview or a one-off job needs: a
set of plugins that see their own providers of some keys, that exist exactly
as long as the task, and that leave no realm behind. Its teardown forces at
the drain limit because it runs in a finalizer, which must end; that is the
owner's explicit end of the task, not an inference from idleness, and every
forced plugin is reported and recorded.

## BEH-BR-337: Actor.narrow derives a label for work done on someone's behalf

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution)
> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-039](../urs.md#urs-br-039-run-a-short-lived-plugin-set-for-delegated-work), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Attributable

```ts
// illustrative — not type-checked
declare const Actor: {
  // ...system, unattributed (BEH-BR-185)
  narrow(parent: Actor, segment: string, display?: string): Actor
  // = { id: `${parent.id}/${segment}`, kind: "service", display }
  isWithin(actor: Actor, ancestor: Actor): boolean
  // = actor.id === ancestor.id || actor.id.startsWith(`${ancestor.id}/`)
}

const sub = Actor.narrow({ id: "u-1042", kind: "user" }, "task-7f3a", "Research sub-agent")
// { id: "u-1042/task-7f3a", kind: "service", display: "Research sub-agent" }
```

```
REQUIREMENT: `Actor.narrow` MUST be a pure function returning
             `{ id: parent.id + "/" + segment, kind: "service", display }`
             (`display` absent when not given). It MUST NOT add a field to
             `Actor`.
```

```
REQUIREMENT: `Actor.narrow` MUST throw a defect when `segment` is empty or
             contains "/", or when `parent.id` begins with "bridger:".
             `Actor.system` and `Actor.unattributed` MUST NOT be narrowed.
```

```
REQUIREMENT: A narrowed actor's id MUST begin with its parent's id followed
             by "/", at every depth, so that the parent — and every actor
             the parent's narrowings derive — stays recognisable.
             `Actor.isWithin(actor, ancestor)` MUST be the pure test of the
             comment above, offered for a consumer's gate, for example to
             refuse an approval given by an agent, or by any narrowing of
             it, for a request that agent made.
```

```
REQUIREMENT: "/" is the narrowing delimiter. An application MUST NOT give
             an actor an id containing "/" unless `Actor.narrow` produced
             it; an application whose own actor ids contain "/" MUST map
             them to ids without "/" before it narrows or compares them.
             `isWithin` is specified only for ids that keep this rule.
             Core MUST NOT check the rule, since it does not interpret
             actor ids (22 — Attributable Operations, BEH-BR-185).
             Documentation MUST state the rule and its consequence:
             `isWithin({ id: "acme/alice" }, { id: "acme" })` is true
             (CCR-BR-028).
```

```
REQUIREMENT: Core MUST NOT confer or restrict anything on the basis of a
             narrowed actor, MUST NOT itself call `isWithin` or otherwise
             parse an actor id to find its parent,
             and MUST record a narrowed actor exactly as any other actor.
             Core documentation MUST state that narrowing is a label and
             that restriction is the consumer's gate or capability policy.
```

A record that says `u-1042/task-7f3a` tells a reviewer, from the record
alone, that the change was made by a delegated task started for user
`u-1042` — the attribution a sub-agent's actions need. The kind is
"service" because the task is not a person; giving it the parent's kind
would make an agent's change look like a human one at a glance (the
argument BEH-BR-185 makes for `Actor.unattributed`).

**Settled here.** BEH-BR-185 says core does not derive an actor.
`Actor.narrow` is a function the *caller* invokes, deterministically, from
an actor it already holds; core still never derives an actor on its own or
interprets one. The rule of BEH-BR-185 is amended to name this exception
(CCR-BR-019 integration note).

**Settled (CCR-BR-028).** The host-core prototype found that `isWithin`
reads an application id such as `acme/alice` as a narrowing of `acme`
(finding G-P8). A prefix test cannot tell the two apart, and a different
delimiter only moves the collision, so the rule is put on the ids: "/" is
reserved for narrowings, by the application, because core does not inspect
actor ids. This settles the actor half of URS gap G47; realm ids are a
separate namespace that `isWithin` never reads, and whether `defineRealm`
should reserve "/" for family members stays open there.

## BEH-BR-338: Families and ephemeral realms are observable as realms

> **See:** [ADR-BR-048](../decisions/048-realm-families-and-retirement.md), [ADR-BR-014](../decisions/014-discriminated-plugin-snapshot.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-038](../urs.md#urs-br-038-create-a-plugin-set-per-key-on-demand-and-reclaim-it-when-idle)

```
REQUIREMENT: Members and ephemeral realms MUST appear in
             `HostSnapshot.realms` and their plugins in
             `HostSnapshot.plugins` exactly as hand-defined realms and their
             plugins do (BEH-BR-149). Core MUST NOT add a snapshot field
             marking a realm as a family member.
```

```
REQUIREMENT: `family.members` MUST report each member's key, realm, status
             and the family's holder count, and MUST NOT report a member
             that has been evicted and not recreated.
```

A family is a pattern of ordinary operations, so the host's view of it is
the ordinary view; the family adds only what it alone knows — which key a
realm belongs to and how many of its own calls hold it.

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-084 | A family creates a member once per key on first use through attributed, gated, audited `defineRealm` and `reconcile`; concurrent uses share one creation; invalid keys and changed options are refused; a member is ready when every plugin is `active`, `dormant` or disabled by an operator, and a "refused-digest" plugin fails it; after the activation timeout the member stays "creating", the next use waits again without a host call, and idle eviction can evict it unless a plugin has since failed or been refused, which marks it "failed"; a failed member is not recreated until reset or recovery, and `use` fails with the reason it was marked with | BEH-BR-329, BEH-BR-330, BEH-BR-331, BEH-BR-333, BEH-BR-334 |
| REQ-BR-085 | Idle eviction prunes with drain and never forces: a held host lease makes it time out and leaves the member parked, retried at the next check; a use during eviction waits and recreates; `retireRealm` refuses a non-empty realm and "default", retires an empty one in one revision, and allows redefinition; `family.evict` that cannot complete fails with `FamilyEvictionError` carrying the stopping step, its error and the outcome ("realm-kept" for `RealmInUse`) | BEH-BR-332, BEH-BR-333, BEH-BR-335, BEH-BR-338 |
| REQ-BR-086 | `Realm.ephemeral` defines, installs and activates under the owner's context, undoes on failure (an expired readiness wait included, and a rejected reconcile entry, which fails it with `FamilyMemberUnavailable` "rejected"), its `use` behaves as `Host.useAll` with the realm, tears down at scope close (forcing only at the limit, reported) and retires its realm, and a teardown or undo step failing with any error stops, logs and leaves the realm (per member, with a "refused" event, at a family's scope close); `Actor.narrow` returns the documented value at every depth, refuses invalid input and reserved actors, and is recorded as any actor; `Actor.isWithin` recognises the actor itself and every narrowing of it, and nothing else, among ids that keep the delimiter rule | BEH-BR-336, BEH-BR-337 |

---

_Previous: [32 — Generic Gate and Plan](./32-generic-gate-and-plan.md)_ · _Next: [34 — State Handoff](./34-state-handoff.md)_
