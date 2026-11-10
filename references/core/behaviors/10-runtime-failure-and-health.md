# 10 — Runtime Failure and Health

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-10                                               |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-10): BEH-BR-095 a refused background restart is a cascade with no caller and revokes at the drain limit (C3) (CCR-BR-035)<br>0.8 (2026-11-08): BEH-BR-089 `Plugin.Runtime.unmount` for an attributed child removal (14, BEH-BR-126); BEH-BR-090 a wired `RefusalList` is consulted before each background restart (CCR-BR-026)<br>0.7 (2026-11-08): BEH-BR-089: `EntitlementView` failure modes (one `watch` per activation, shared latest-wins, unbounded first element, ended port yields a stale state once); unwired mode `unmetered`, core-only mode `unknown` (CCR-BR-022)<br>0.6 (2026-11-08): BEH-BR-089 `Plugin.Runtime` gains `principal` and `asSelf` and `install` may fail with `ChildNotAllowed` (CCR-BR-018); `install` takes `Plugin.Any`, and the optional `EntitlementView` port with `Plugin.Runtime.entitled` (CCR-BR-020)<br>0.5 (2026-10-03): A phase-"cleanup" failure is left only by `remove` (consistency pass) (CCR-BR-013)<br>0.4 (2026-10-02): `Plugin.Runtime.install` also fails with `Conflict` and `HostClosed` (prototype finding G19) (CCR-BR-010)<br>0.3 (2026-10-02): An in-flight health check is interrupted when the stop begins (prototype finding G17) (CCR-BR-009)<br>0.2 (2026-10-02): Cascades with no caller drain under `drainTimeout` and revoke, never park; shutdown revokes only after its overall limit; an ended parked intent gets an `intent-ended` record (CCR-BR-008)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

An `active` plugin can fail after its `build` succeeded: a background loop
dies, a health probe stops answering, or the plugin itself detects that it
can no longer do its job. This file converts SPEC.md "Runtime failure and
health": the `Plugin.Runtime` service, its `background` and `reportFailure`
members, health check semantics, the single runtime failure transition, and
the host's revocation when a drain expires with no caller to report to. This
file owns BEH-BR-089–096 and uses all eight.

The other `Plugin.Runtime` members are specified where they belong:
`optional`, `useOptional` and `whenAvailable` in
[15 — Optional and Reactive Dependencies](./15-optional-and-reactive.md),
`install` in [14 — Children and Groups](./14-children-and-groups.md).

## BEH-BR-089: Plugin.Runtime is provided to every build

> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```ts
// illustrative — not type-checked
// Context.Service with identifier "@bridger/core/Plugin.Runtime"
interface PluginRuntime {
  // Runs `effect` as a fiber scoped to the plugin's activation (BEH-BR-090).
  readonly background: <A, E, R>(
    name: string,
    effect: Effect.Effect<A, E, R>,
    options?: {
      readonly onFailure?: "fail-plugin" | "restart" | "ignore"
      readonly restart?: Schedule.Schedule<unknown, unknown>
    }
  ) => Effect.Effect<void, never, R | Scope.Scope>
  // Report an unrecoverable condition detected by the plugin itself (BEH-BR-091).
  readonly reportFailure: (cause: Cause.Cause<unknown>) => Effect.Effect<void>
  // Optional and reactive dependencies: behaviour 15.
  readonly optional: <S>(key: Context.Key<any, S>) => Effect.Effect<Option.Option<S>>
  readonly useOptional: <S, A, E, R>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E, R>) =>
    Effect.Effect<Option.Option<A>, E | LeaseRevoked | LeaseTimeout, R>
  readonly whenAvailable: <const Keys extends readonly Context.Key<any, any>[], A, E, R>(
    keys: Keys,
    run: (services: ServicesOf<Keys>) => Effect.Effect<A, E, R | Scope.Scope>,
    options?: { readonly name?: string; readonly onFailure?: "fail-plugin" | "restart" | "ignore" }
  ) => Effect.Effect<void, never, Scope.Scope>
  // Children: behaviour 14. The non-generic overload takes any definition (Plugin.Any, 01).
  readonly install: {
    <R extends Keys, P extends Keys, E, C>(child: Plugin<R, P, E, C>, options?: InstallOptions):
      Effect.Effect<PluginHandle, InstallError | Conflict | HostClosed | ChildNotAllowed, Scope.Scope>
    (child: Plugin.Any, options?: InstallOptions):
      Effect.Effect<PluginHandle, InstallError | Conflict | HostClosed | ChildNotAllowed, Scope.Scope>
  }
  // Removes one of this activation's children on someone's request, recorded with that
  // request's actor and reason (behaviour 14, BEH-BR-126).
  readonly unmount: (child: PluginRef, options: { readonly context: OperationContext }) =>
    Effect.Effect<void, UnknownPlugin | HostClosed>
  // Plugin principal: behaviour 28 (BEH-BR-258).
  readonly principal: PluginPrincipal
  readonly asSelf: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  // Entitlement of this activation, from the optional EntitlementView port (below).
  // Latest wins: each subscriber receives the latest state first (once one exists), then changes.
  readonly entitled: Stream.Stream<EntitlementState>
}

// Optional port, read with Effect.serviceOption (CCR-BR-020)
interface EntitlementState {
  readonly mode: "full" | "grace" | "read-only" | "none"   // from the port
    | "unmetered"                    // core only: no EntitlementView is wired
    | "unknown"                      // core only: the port ended before giving any state
  readonly validUntil?: string
  readonly graceUntil?: string
  readonly reason?: string
  readonly asOf: string
  readonly stale?: true
}
interface EntitlementViewShape {
  readonly watch: (target: { readonly id: string; readonly realm: string; readonly version?: string }) =>
    Stream.Stream<EntitlementState>
}
class EntitlementView extends Context.Service<EntitlementView, EntitlementViewShape>()("@bridger/core/EntitlementView") {}
```

```
REQUIREMENT: The host MUST provide a `Plugin.Runtime` service (identifier
             `@bridger/core/Plugin.Runtime`) to the `build` layer of every
             activation, bound to that activation's scope and plugin
             identity.
```

```
REQUIREMENT: A `Plugin.Runtime` instance MUST NOT outlive its activation:
             work it starts MUST be owned by that activation's scope and end
             when the scope closes.
```

```
REQUIREMENT: `principal` and `asSelf` MUST behave as
             [28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
             BEH-BR-258, specifies; `install` MUST fail with
             `ChildNotAllowed` as BEH-BR-263 specifies.
```

```
REQUIREMENT: The host MUST read `EntitlementView` with `Effect.serviceOption`
             at construction; it MUST NOT appear in the requirements of
             `Bridger.layer` or `Bridger.make`. `Plugin.Runtime.entitled`
             MUST be fed by `watch` called with the activation's own id,
             realm and installed `meta.version`, ending when the activation's
             scope closes. With no `EntitlementView` wired it MUST emit one
             state `{ mode: "unmetered", asOf }` read from `Clock` and stay
             open. Core MUST NOT interpret `mode`, MUST NOT change plugin
             state, call any operation or write any record because of it, and
             MUST NOT describe the unwired state as an entitlement.
```

```
REQUIREMENT: Core MUST call `watch` at most once per activation, when
             `entitled` is first subscribed, and MUST share its elements
             among every subscriber of that activation, latest wins: a
             subscriber MUST receive the latest state received so far, if
             any, and then each later one. Core MUST NOT bound the wait for
             the port's first element; until it arrives a subscriber
             receives nothing, and a plugin that needs a bound applies its
             own.
```

```
REQUIREMENT: When `watch` fails, dies or ends before the activation's scope
             closes, core MUST log it at warning level, MUST emit the last
             state received with `stale: true` and `reason:
             "entitlement-view-ended"` — or, when none was received,
             `{ mode: "unknown", stale: true, reason:
             "entitlement-view-ended", asOf }` read from `Clock` — and then
             keep `entitled` open with no further element, and MUST NOT call
             `watch` again for that activation. It MUST NOT fail the plugin
             or change any state.
```

One instance per activation is what lets every member close over the right
scope without the author passing it around, and what makes a restarted
plugin start from a clean runtime rather than inheriting fibers from a
closed scope.

**Settled here (CCR-BR-020).** `entitled` is a domain-free seam requested by
the entitlement companion ([references/entitlement/](../../entitlement/README.md),
BEH-EN-013): core passes a stream from an optional port to the plugin and
reads nothing in it, so a lapse can never become a lifecycle state
([INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)).
The unwired constant has its own mode, `unmetered`, outside the port's
vocabulary, so that a plugin testing `mode === "full"` does not mistake "no
port" for "entitled"; `unknown` is likewise core's own, for a port that went
away before saying anything. Acceptance check 91 of BEH-BR-184 covers it.

## BEH-BR-090: Supervised background work and its failure policy

> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: `background(name, effect, options)` MUST run `effect` as a fiber
             forked into the activation scope (`Effect.forkIn(effect,
             activationScope)`) and apply the failure policy
             `options.onFailure`, whose default MUST be "fail-plugin".
```

```
REQUIREMENT: Under "fail-plugin", a failure or defect of the fiber MUST be
             reported through `reportFailure` and so start the runtime
             failure transition (BEH-BR-094).
```

```
REQUIREMENT: Under "restart", the effect MUST be wrapped with the given
             `restart` schedule (`Effect.retry` / `Effect.repeat`). A restart
             MUST restart only that fiber and MUST NOT change plugin state,
             except as the next requirement states.
```

```
REQUIREMENT: When a `RefusalList` is wired and the plugin's definition
             declares a digest, the host MUST consult the list before each
             restart. A refusal MUST leave the fiber stopped and MUST stop
             the plugin into `disabled` with reason "refused-digest", as
             28 — Plugin Principal and Mandatory Policy, BEH-BR-267,
             states.
```

```
REQUIREMENT: Under "ignore", a failure MUST NOT change plugin state, but it
             MUST still be logged at error level with the plugin ID and the
             background `name`.
```

```
REQUIREMENT: Interruption of a background fiber caused by its activation
             scope closing MUST NOT be treated as a failure.
```

```
REQUIREMENT: Fibers forked in `build` without `background` are not tracked
             by the host. The host MUST NOT claim to supervise them.
```

`inspect` reports each background fiber by name, policy, restart count and
whether it is running ([13 — Observability and Diagnostics](./13-observability-and-diagnostics.md)).
A fiber that dies silently is how a plugin ends up `active` while doing
nothing, which is the hidden runtime failure
[RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016) names; hence even
"ignore" logs.

**Settled here.** (1) When `onFailure` is "restart" and no `restart`
schedule is given, a default schedule is applied that is bounded (finite
attempts) and spaced (non-zero delay); its exact parameters are fixed at
prototype. (2) When a restart schedule is exhausted, the final failure is
handled as "fail-plugin". Both settle a gap in SPEC.md in the direction that
never leaves a failure unbounded or unreported.

## BEH-BR-091: reportFailure is an immediate runtime failure

> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```
REQUIREMENT: `reportFailure(cause)` on an `active` plugin MUST start the
             runtime failure transition of BEH-BR-094 immediately.
```

```
REQUIREMENT: Several runtime failure signals for the same activation MUST
             result in one transition. Signals after the first MUST be
             logged and MUST NOT start a second transition.
```

```
REQUIREMENT: The full `cause` MUST stay inside the core's diagnostics (logs).
             Snapshots, events and errors MUST carry only the plugin ID and a
             message.
```

**Settled here.** SPEC.md does not say what a runtime failure signal does
when the plugin is not `active`. (1) A signal raised while the plugin is
still `starting` (from a background fiber or `reportFailure` inside `build`)
fails that activation with phase `activation`; nothing is published, so no
partially working plugin becomes visible
([INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic)). (2) A
signal raised while the plugin is already `stopping` for another reason is
logged and emitted as a `runtime-failure` event but does not change the
destination of the stop already in flight: the plugin is already leaving
service, and redirecting a caller's `remove` into `failed` would contradict
the operation that caller recorded.

## BEH-BR-092: Health checks run only while active

> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-004](../urs.md#urs-br-004-know-why-a-plugin-is-not-running), [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)

```ts
// PluginDefinition.health (behaviour 01)
readonly health?: {
  readonly check: Effect.Effect<void, unknown, IdentifiersOf<Requires>>
  readonly every: Duration.Input
  readonly timeout: Duration.Input
  readonly failureThreshold: number
}
```

```
REQUIREMENT: If `health` is declared, the host MUST run `check` every `every`,
             each run bounded by `timeout`, and only while the plugin is
             `active`.
```

```
REQUIREMENT: The check MUST run in the plugin's activation scope against the
             plugin's captured services. It MUST count as a short lease on
             the plugin itself, bounded by `timeout`, so that the scope never
             closes under a running check.
```

```
REQUIREMENT: When a stop of the plugin begins — in the revision in which it
             becomes `stopping`, before the drain — the host MUST interrupt
             an in-flight check and await its end, so that the check's lease
             ends at once and the drain never waits for it (BEH-BR-093).
```

```
REQUIREMENT: `failureThreshold` consecutive failed checks MUST count as one
             runtime failure (BEH-BR-094). A successful check MUST reset the
             consecutive count to zero.
```

```
REQUIREMENT: The snapshot of an `active` plugin MUST show `health` as
             "healthy" (last check succeeded), "degraded" (at least one
             consecutive failure, below the threshold) or "unknown" (no check
             declared, or none completed yet in this activation).
```

```
REQUIREMENT: When `health` becomes "degraded" from another value and an
             `AuditSink` is wired, the host MUST write the system transition
             `health-degraded`, attributed to `Actor.system`.
```

Timing comes from the `Clock` service
([INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)),
so a test drives health checks with `TestClock` rather than waiting.

**Settled here.** (1) Each new activation starts with `health: "unknown"`
and a zero count; failures do not carry across a restart. (2)
`failureThreshold` below 1 is an `InvalidDefinition` at install, since a
threshold of 0 would fail a plugin that never failed a check. (3) Only the
transition into "degraded" is audited, not each failed check, so a flapping
probe cannot flood the audit trail; the counts are visible in logs and
metrics.

## BEH-BR-093: A health check is not a transition

> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```
REQUIREMENT: When the plugin leaves `active` for any reason (removal,
             replacement, dependency loss, runtime failure, disable, restart,
             reconfigure or shutdown), an in-flight check MUST be interrupted
             and its outcome discarded. It MUST NOT be counted as a failure.
```

```
REQUIREMENT: A check that exceeds `timeout` MUST count as a failed check.
```

```
REQUIREMENT: Checks MUST NOT be transitions: `awaitIdle` MUST neither wait
             for them nor treat them as activity, and a check MUST NOT change
             the snapshot `revision` except through a change of `health`.
```

**Settled here.** BEH-BR-092 made a check a short lease "so that a drain
waits for at most one in-flight check", while this behaviour interrupts the
check as soon as the plugin leaves `active`, which is when its stop begins. The
host-core prototype (URS gap G17) showed both can hold: interrupting the check
when the stop begins ends its lease at once, so the scope still never closes
under a running check, and a removal does not wait up to `timeout` for a probe
whose result would be discarded anyway (CCR-BR-009).

Counting an interrupted check as a failure would let a routine removal push
a plugin over its threshold in the instant before it stops, producing a
runtime failure that never happened.

## BEH-BR-094: Three signals, one runtime failure transition

> **Invariant:** [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers), [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease)
> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016), [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: A failing `background` fiber under "fail-plugin", a health check
             reaching `failureThreshold`, and `reportFailure` MUST all end in
             the same transition, in this order:
             1. the plugin is marked failing: new leases and new dependents
                are blocked and it is hidden from new consumers;
             2. its dependents are stopped first, as a cascade whose root is
                this runtime failure (08 — Operation Legality, BEH-BR-079,
                BEH-BR-080);
             3. its leases drain under the normal drain limit (BEH-BR-085,
                and BEH-BR-095 on expiry);
             4. its activation scope is closed;
             5. it ends `failed` with `failure.phase = "runtime"`.
```

```
REQUIREMENT: The dependents' stops of step 2 MUST drain under
             `BridgerOptions.drainTimeout` and, on expiry, MUST revoke as
             BEH-BR-095 requires; they MUST NOT park. A dependent whose stop
             is already parked MUST be resumed under those options and
             revoked on expiry, and the parked operator intent it carries
             MUST end as BEH-BR-080 requires, with its `intent-ended` record
             (23 — Audit Sink and Record). The system records of these stops,
             and that `intent-ended` record, MUST carry as `causationId` the
             record id of the `runtime-failure` record.
```

```
REQUIREMENT: While the transition runs, the snapshot MUST show the plugin as
             `stopping` with `reason: "runtime-failure"` and
             `next: "failed"`. A `runtime-failure` host event MUST be
             emitted.
```

```
REQUIREMENT: When an `AuditSink` is wired, the transition MUST be audited as
             the system transition `runtime-failure`, attributed to
             `Actor.system`, with before and after states.
```

One transition for three signals means one set of guarantees to test and
one shape for operators to read. The dependents-first and drain steps are the
same as removal's ([06 — Removal](./06-removal.md)), so a failing provider
does not tear down a dependent mid-call any more than a removed one does.

**Settled here.** If closing the scope in step 4 itself fails, the plugin
ends `failed` with phase `cleanup` (the message records that the stop was a
runtime failure), not phase `runtime`. Cleanup failure is the stricter state
([08 — Operation Legality](./08-operation-legality.md)): it withholds
restarting operations until the leak is acknowledged, and Bridger must not
imply that a leaked resource was released.

## BEH-BR-095: With no caller, the host revokes at the drain limit

> **Invariant:** [INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)
> **See:** [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md), [ADR-BR-015](../decisions/015-leases-one-primitive.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: If the drain limit expires during a runtime failure transition,
             the host MUST revoke the remaining leases — the failing
             plugin's and those of its dependents being stopped by the
             transition (callbacks fail with `LeaseRevoked`) — await their
             finalizers, and complete the transition. It MUST NOT leave the
             plugin or any of those dependents `stopping` waiting for a
             caller that does not exist.
```

```
REQUIREMENT: The same MUST hold for every cascade with no caller at its
             root: a dependency-loss stop with no operator call at its root,
             a refused background restart (28 — Plugin Principal and
             Mandatory Policy, BEH-BR-267), and shutdown. Its stops MUST
             drain under `BridgerOptions.drainTimeout` and MUST never park; they MUST
             revoke on expiry — shutdown only once the overall shutdown limit
             has passed (12 — Shutdown and Hosting, BEH-BR-107). A parked
             stop such a cascade meets MUST be resumed under those options
             and revoked as above, and a parked operator intent it ends MUST
             get its `intent-ended` record (08 — Operation Legality,
             BEH-BR-080). An expiry while such a cascade waits for a running
             build step MUST continue the wait under `buildTimeout`. The
             system records of these stops MUST carry the `causationId` that
             22 — Attributable Operations (BEH-BR-190) gives for the cascade
             root.
```

```
REQUIREMENT: Each such revocation MUST be reported as a `lease-revoked` host
             event and, when an `AuditSink` is wired, audited as the system
             transition `lease-revoked` with `causationId` set to the
             record id of the `runtime-failure` record (for another cascade
             root, as BEH-BR-190 gives it).
```

A removal has a caller who can receive `DrainTimeout` and decide; a runtime
failure does not. Without this rule a failing plugin with one stuck callback
would hold its dependents, its provider slot and every `awaitIdle` hostage
indefinitely. Only a path whose cascade root is an operator call parks on
expiry, because only there is a caller told `DrainTimeout` and able to resume
the stop (08 — Operation Legality, BEH-BR-074, BEH-BR-080).

**Settled here.** When `BridgerOptions.drainTimeout` is `"forever"`, the
runtime failure transition waits indefinitely and does not revoke: the
application declared unbounded drains explicitly
([INV-BR-017](../invariants.md#inv-br-017-every-drain-is-bounded-unless-declared-forever)),
and an automatic revocation could interrupt a regulated write
([RSK-BR-015](../gxp/03-risk-assessment.md#rsk-br-015)). The stuck plugin
remains visible as `stopping` in snapshots, with `parked` false: it is still
draining, not waiting for a call.

**Settled here.** CCR-BR-008 extends the no-caller rule from the failing
plugin to the whole cascade below it, and to every cascade whose root has no
caller. A dependent stopped by a runtime failure, by a dependency-loss stop
that no operator call began, or by shutdown has nobody to receive
`DrainTimeout`; parking it would leave a stop that only a later, unrelated
call could resume. Shutdown is the one root that does not revoke at the drain
limit: it drains under `drainTimeout`, reports an expiry in `CloseReport`, and
revokes once its overall limit has passed, but it never parks either. A
cascade with no caller that meets a running build has no drain to revoke; it
waits for the build, which `buildTimeout` bounds.

## BEH-BR-096: Runtime failure is sticky

> **Invariant:** [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-006](../urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-003](../gxp/03-risk-assessment.md#rsk-br-003)

```
REQUIREMENT: A plugin `failed` with phase "runtime" MUST stay `failed` until
             one of these explicit operations: `retry`, `restart`, `replace`,
             `reconfigure`, `disable` or `remove`. The host MUST NOT retry it
             automatically, including when its requirements disappear and
             return.
```

```
REQUIREMENT: A "restart" policy on a background fiber MUST NOT be used by the
             host to restart the plugin; it restarts only that fiber
             (BEH-BR-090).
```

SPEC.md's runtime failure paragraph listed the exit operations as `retry`,
`restart`, `replace`, `reconfigure` or `remove`, omitting `disable`, while
its state rules list `disable` among the operations that leave `failed`. The
state rules are correct and this list is aligned with them: every failure
phase other than `cleanup`, `runtime` included, is left by the same six
operations, and a `cleanup` failure only by `remove`
([08 — Operation Legality](./08-operation-legality.md)).

Automatic restart after a runtime failure would repeat whatever side effects
`build` performs on every attempt, and could loop. A caller who wants a
restart policy builds it on `changes` and `retry`, where it is visible and
attributable.

---

_Previous: [09 — Leases](./09-leases.md)_ · _Next: [11 — Configuration](./11-configuration.md)_
