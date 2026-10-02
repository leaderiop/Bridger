# 22 — Attributable Operations

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-22                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-10-02): Interruption before intent is allowed and ends with a failed (Interrupted) record (prototype finding G14) (CCR-BR-007)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

A regulated user of Bridger must be able to say, for every change to the
plugin set, *who* asked for it, *why*, and *what caused* the changes nobody
asked for directly. This file gives every mutating host operation an
attribution — an `Actor`, an optional reason and a correlation — fixes the
order in which a mutating call is checked, attributed, gated, recorded and
run, and attributes the host's own consequential transitions to the system
with a link to their cause. It has no SPEC.md source section: it is a GxP hook
added to the core design ([ADR-BR-028](../decisions/028-gxp-scope.md),
[ADR-BR-029](../decisions/029-attributable-mutations.md)). This file owns
BEH-BR-185–192 and uses all eight.

> **What core does not do — and who does**
>
> | Concern | Core | Responsible |
> | --- | --- | --- |
> | Authentication — proving the `Actor` is who it claims | Not done. The actor is taken as given. | Consumer (its identity provider and session handling) |
> | Storage of audit records | Not done. Records are handed to the `AuditSink` and not kept. | Consumer's sink, or the `@bridger/gxp` companion |
> | Retention and archiving | Not done. | Consumer / companion |
> | Durability | Not done. Core makes no durability claim. | Consumer's store / companion |
> | Review of the trail | Not done. | Consumer's procedures; companion tooling |
> | E-signature manifestation and record linking | Not done. The `OperationGate` is the seam. | Companion and consumer |
> | Tamper evidence | Not provided. `verifyAuditSequence` detects gaps and duplicates only. | Consumer's store / companion |
>
> Those obligations are specified later in `references/gxp/`. Nothing in core
> makes a deployment compliant with any regulation; core provides hooks that
> *support* the consumer's controls.

Planned source: `packages/core/src/Attribution.ts` *(Planned)*. The record
written for each step is in [23 — Audit Sink and Record](./23-audit-sink-and-record.md),
time and identifiers in [24 — Time, Identifiers and Sequence](./24-time-ids-and-sequence.md),
and the gate in [25 — Operation Gate](./25-operation-gate.md).

## BEH-BR-185: Actor and OperationContext

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §12.4; ALCOA+ Attributable

```ts
// illustrative — not type-checked
interface Actor {
  readonly id: string
  readonly kind: "user" | "service" | "system"
  readonly display?: string
}
declare const Actor: {
  readonly system: Actor        // { id: "bridger:system",       kind: "system", display: "Bridger host" }
  readonly unattributed: Actor  // { id: "bridger:unattributed", kind: "system", display: "Unattributed" }
}

interface OperationContext {
  readonly actor: Actor
  readonly reason?: string
  readonly correlationId?: string
}

type Operation =
  | "install" | "remove" | "replace" | "retry" | "reconfigure" | "restart"
  | "disable" | "enable" | "reconcile" | "defineRealm" | "shutdown"
  | "acknowledgeAuditDegraded"

type SystemTransition =
  | "system-start" | "system-stop" | "runtime-failure" | "lease-revoked" | "health-degraded"
```

```
REQUIREMENT: `Actor.system` and `Actor.unattributed` MUST be the only actors
             whose `id` begins with "bridger:". `Actor.system` MUST be used
             only for records the host originates (BEH-BR-190).
             `Actor.unattributed` MUST be the actor of a call made with no
             context and no `CurrentActor`.
```

```
REQUIREMENT: An `Actor` MUST be a plain value: an `id`, a `kind` and an
             optional `display`. Core MUST NOT add fields to it, derive it, or
             interpret `id` beyond the checks of BEH-BR-189.
```

```
REQUIREMENT: `reason` and `correlationId` MUST be free text supplied by the
             caller. Core MUST NOT rewrite, trim or translate them; it MUST
             pass them unchanged to the gate and the sink.
```

`kind` is descriptive. It lets a reviewer tell a person from a scheduled job
in a record, and lets a gate apply different rules to each; it confers
nothing. The reserved `bridger:` prefix keeps a consumer's own identifiers
from colliding with the two constants, so a record that says
`bridger:system` was written by the host and by nothing else.

**Settled here.** The concrete ids of the two constants are fixed here
(`bridger:system`, `bridger:unattributed`), with `kind: "system"` for both:
`Actor.unattributed` is not a person, and giving it `kind: "user"` would make
an unattributed change look like a human one at a glance.

## BEH-BR-186: Every mutating operation accepts an OperationContext

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-008](../decisions/008-error-taxonomy.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §12.4; ALCOA+ Attributable

```ts
interface OperationOptions { readonly context?: OperationContext }

interface InstallOptions extends OperationOptions { /* realm, config, disabled, intercept */ }
interface RemoveOptions  extends OperationOptions { /* drain, force */ }
interface ReplaceOptions extends RemoveOptions    { /* realm */ }

// G = Unattributed | ReasonRequired | AuditUnavailable | OperationRejected
// Only the GxP additions are shown here. Full signatures and the complete
// error unions: 02 — Host Construction, BEH-BR-013 (canonical).
//
// how each method accepts an OperationContext       GxP errors it adds
// ----------------------------------------------    -----------------------------------
// install(plugin, options?: InstallOptions)          G
// remove(ref, options?: RemoveOptions)               G
// replace(plugin, options?: ReplaceOptions)          G
// restart(ref, options?: RemoveOptions)              G
// disable(ref, options?: RemoveOptions)              G
// retry(ref, options?: OperationOptions)             G    (new OperationOptions parameter)
// enable(ref, options?: OperationOptions)            G    (new OperationOptions parameter)
// reconfigure(ref, config?, options?: OperationOptions)
//                                                    G    (new OperationOptions parameter)
// defineRealm(id, options, operation?: OperationOptions)
//                                                    G    (new OperationOptions parameter)
// reconcile(desired, options?: ReconcileOptions & OperationOptions)
//                                                    Unattributed | ReasonRequired | AuditUnavailable
//                                                    (gate refusals are per entry; 18)
// shutdown(options?: { timeout? } & OperationOptions)
//                                                    Unattributed | ReasonRequired
// acknowledgeAuditDegraded(options: { context: OperationContext })
//                                                    G    (context mandatory)

interface PluginHandle {
  readonly remove:  (options?: RemoveOptions) => Effect<void, /* as Host.remove */>
  readonly restart: (options?: RemoveOptions) => Effect<void, /* as Host.restart */>
}
```

```
REQUIREMENT: Every mutating operation — the twelve values of `Operation`,
             including `PluginHandle.remove` and `PluginHandle.restart` —
             MUST accept an `OperationContext` through its options, and its
             error union MUST include `Unattributed`, `ReasonRequired`,
             `AuditUnavailable` and `OperationRejected`, with exactly these
             exceptions: `reconcile` omits `OperationRejected` (refusals are
             per entry, 18 — Reconciliation and Confluence), and `shutdown`
             fails only with `Unattributed` or `ReasonRequired` (it is
             neither latched nor gated, and audit failure never blocks it).
```

```
REQUIREMENT: Read-only operations — `snapshot`, `changes`, `events`,
             `inspect`, `awaitIdle`, `use`, `useAll`, `lease` — MUST NOT take
             an `OperationContext` and MUST NOT be attributed, gated or
             audited.
```

The full signatures and base error unions are those of
[02 — Host Construction](./02-host-construction.md) (BEH-BR-013, the
canonical `Host` interface) and
[08 — Operation Legality](./08-operation-legality.md); this file adds the GxP
errors and does not restate the rest, so that the two lists cannot drift
apart. `PluginHandle.restart` is a function taking `RemoveOptions`, not a
bare `Effect`, precisely so that a restart through a handle can carry a
context like any other call.

## BEH-BR-187: Resolving the context of a call

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-016](../decisions/016-reentrancy-detection.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §12.4; ALCOA+ Attributable

```ts
// Context.Reference<Actor>, identifier "@bridger/core/CurrentActor", default Actor.unattributed
const program = host.remove("billing/export").pipe(
  Effect.provideService(CurrentActor, { id: "u-1042", kind: "user", display: "J. Rivera" })
)
// A per-call context wins over the reference:
host.remove("billing/export", { context: { actor: qaReviewer, reason: "CAPA-0193" } })
```

```
REQUIREMENT: The context of a call MUST be resolved once, when the call is
             made: `options.context` when supplied; otherwise
             `{ actor: CurrentActor }` with no reason, where `CurrentActor`
             is the value of the `@bridger/core/CurrentActor` reference in
             the calling fiber (default `Actor.unattributed`).
```

```
REQUIREMENT: When `options.context` is supplied it MUST win entirely over
             `CurrentActor`; the two MUST NOT be merged field by field.
```

```
REQUIREMENT: When the resolved context has no `correlationId`, the host MUST
             generate one with `IdGenerator` at resolution, so that every
             record of the call carries one.
```

```
REQUIREMENT: Core MUST run every build, finalizer, background fiber, health
             check, `whenAvailable` run and event listener with `CurrentActor`
             set to `Actor.unattributed`. The actor of the operation that
             caused an activation MUST NOT be visible to the plugin code it
             runs.
```

```
REQUIREMENT: A `use`/`useAll` callback MUST inherit the caller's
             `CurrentActor`, as it inherits every other fiber reference
             (09 — Leases).
```

`CurrentActor` exists for the common case of a request handler that knows the
user once and calls the host several times. The per-call context exists for
the case where a reason or a correlation belongs to one call.

Resetting `CurrentActor` inside plugin code is the rule that keeps identity
from leaking. Without it, a plugin activated by an operator's `install` would
run its background fibers carrying that operator's identity, and any host
call it later made — perhaps hours afterwards — would be recorded as that
operator's action. A plugin that mutates the host must therefore state an
actor itself, and under `attribution.require` it cannot mutate the host
without one.

## BEH-BR-188: The order of a mutating call

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing), [INV-BR-010](../invariants.md#inv-br-010-intent-survives-caller-interruption)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f), 11.10(g); EU GMP Annex 11 §9; ALCOA+ Attributable, Complete

```
step  check / action                  failure                    records written
----  ------------------------------  -------------------------  --------------------------
 1    host closed?                    HostClosed                 none
 2    attribution                     Unattributed,              none
                                      ReasonRequired
 3    audit-degraded latch            AuditUnavailable           none
 4    validation (UnknownPlugin,      the validation error       none
      definition checks; for
      `reconfigure` only, decoding
      a supplied config value)
 5    OperationGate.authorize         OperationRejected          one `rejected`
      (when wired)
 6    `requested` record              AuditUnavailable           (the write failed)
      (when a sink is wired)
 7    WouldDeadlock check; then       WouldDeadlock, Conflict,   system records of the
      intent recorded: re-validation, Superseded, DrainTimeout,  transition (23)
      legality, joins, supersession;  ...
      transition runs
 8    terminal record                 —                          one of `completed`,
      (when a sink is wired)                                     `failed`, `superseded`,
                                                                 `joined`
```

```
REQUIREMENT: Every mutating call MUST pass the steps above in this order.
             A call that fails at step 1, 2, 3 or 4 MUST change nothing and
             MUST write no record. A call refused at step 5 MUST change
             nothing and MUST write exactly one `rejected` record (when a sink
             is wired). A call whose step 6 fails MUST change nothing and
             MUST fail with `AuditUnavailable`.
```

```
REQUIREMENT: Every call that passes step 6 MUST reach step 8: exactly one
             terminal record MUST follow its `requested` record, whatever the
             outcome of step 7.
```

```
REQUIREMENT: A caller MAY be interrupted at any step. Interrupting it
             during steps 1–5 MUST end the call with no change and no
             record. Interrupting it after its `requested` record has been
             enqueued and before its intent is recorded — including while it
             waits for that record to be written, or for its turn at the
             plugin's linearization point (08 — Operation Legality,
             BEH-BR-065, BEH-BR-073) — MUST change nothing and MUST end the
             call with a `failed` terminal record whose `error._tag` is
             "Interrupted". Interrupting it after the intent is recorded
             MUST end only the caller's wait; the transition and its
             terminal record proceed (INV-BR-010).
```

**Settled here.** An earlier revision made step 6 and the start of step 7 one
uninterruptible unit. With per-plugin ordering
([ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)), the span
between the `WouldDeadlock` check and the intent can include a wait for the
plugin's turn, and that turn can be held by a call that waits for a system
stop to drain. An uninterruptible wait as long as a drain would make a
caller's own timeout meaningless. The host-core prototype showed the
alternative is cheap: the call is still answered by exactly one terminal
record, and nothing changes because no intent was recorded (URS gap G14).

```
REQUIREMENT: Configuration values MUST be decoded at step 4 for
             `reconfigure` only. `install` MUST NOT decode
             `options.config` at the call: an override that does not decode
             is an activation failure (phase `activation`), reported in the
             plugin's state and not as an error of the call
             (03 — Installation, BEH-BR-022).
```

```
REQUIREMENT: Validation at step 4 MUST be repeated when the intent is
             recorded at step 7. A call whose validation passed at step 4 but
             fails at step 7 (another call changed the plugin set in between)
             MUST fail with that error and MUST be recorded with a `failed`
             terminal record.
```

```
REQUIREMENT: `shutdown` MUST skip step 3 and step 5. Its `requested` record
             MUST be attempted; when it cannot be written, shutdown MUST
             proceed anyway, set the audit-degraded latch, and report
             `CloseReport.auditDegraded: true`. A `shutdown` on a host that
             is already closing MUST join the shutdown in progress (and is
             recorded with a `joined` terminal record).
```

```
REQUIREMENT: A `shutdown` called after shutdown has completed MUST return
             the original `CloseReport` and MUST write no record: the audit
             writer has already closed.
```

```
REQUIREMENT: `acknowledgeAuditDegraded` MUST skip step 3. It passes every
             other step (23 — Audit Sink and Record).
```

The order is chosen so that each check runs only when the previous one has
established something it needs. Attribution comes before the latch, so that
even a refusal for audit unavailability is decided for a known caller.
Validation comes before the gate, so that an approver is never asked to
authorize a change that cannot happen (an unknown plugin, an undecodable
`reconfigure` value) and the gate sees the configuration paths the call
changes. The gate
comes before the `requested` record, so that a refused request leaves exactly
one record, `rejected`, rather than a `requested` record followed by a
refusal. And the `requested` record comes before the intent, so that no
change is ever made that the trail does not already announce.

`WouldDeadlock` and the legality outcomes of
[08 — Operation Legality](./08-operation-legality.md) — `Conflict`,
`Superseded`, joins and no-op successes — are decided at step 7, after the
`requested` record, because they depend on the activity on the plugin at the
moment the intent is recorded. They are therefore always recorded, with a
`failed`, `superseded`, `joined` or `completed` (`noop: true`) terminal
record.

`shutdown` is exempt from the latch and the gate, and from fail-closed audit,
because stopping is the safe direction: refusing to stop a host whose audit
sink has failed would keep running exactly the system whose changes can no
longer be recorded. An explicit `shutdown()` call is still attributed
(step 2) under `attribution`; only the host-originated `shutdown` performed
when the host scope closes is exempt from the attribution checks
(BEH-BR-189).

**Settled here.** A call that fails validation (step 4) leaves no record,
like one refused for attribution or by the latch: nothing was attempted
against the plugin set. The race in which validation passes and the
plugin set then changes before the intent is recorded is closed by
re-validating at step 7, where the failure *is* recorded, because by then a
`requested` record exists and must be answered by a terminal one.

## BEH-BR-189: Required attribution and required reasons

> **Invariant:** [INV-BR-025](../invariants.md#inv-br-025-no-mutation-proceeds-without-required-attribution)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §12.4; ALCOA+ Attributable

```ts
interface BridgerOptions {
  // ...
  readonly attribution?: {
    readonly require?: boolean                     // default false
    readonly requireReason?: readonly Operation[]  // default []
  }
}
```

```
REQUIREMENT: With `attribution.require: true`, a mutating call whose resolved
             actor is `Actor.unattributed`, `Actor.system`, or any actor
             whose `id` begins with "bridger:" MUST fail with
             `Unattributed { operation }` at step 2.
```

```
REQUIREMENT: A mutating call whose resolved actor has an empty or
             whitespace-only `id` MUST fail with `Unattributed { operation }`
             at step 2, whatever `attribution.require` says.
```

```
REQUIREMENT: When the operation is listed in `attribution.requireReason` and
             the resolved context has no `reason`, or a `reason` that is empty
             or whitespace-only, the call MUST fail with
             `ReasonRequired { operation }` at step 2.
```

```
REQUIREMENT: `acknowledgeAuditDegraded` MUST require a non-blank `reason` and
             an actor other than the reserved ones, whatever `attribution`
             says.
```

```
REQUIREMENT: The defaults MUST change nothing: with `require: false` and an
             empty `requireReason`, no call made with a well-formed context,
             or with none, fails at step 2.
```

```
REQUIREMENT: The host-originated `shutdown` performed when the host scope
             closes (BEH-BR-190) MUST be exempt from `attribution.require`
             and `attribution.requireReason`, and MUST be attributed to
             `Actor.system` with no reason. An explicit `shutdown()` call
             MUST still be checked like any other mutating call.
```

A malformed actor (blank `id`) is refused even when attribution is not
required, because recording it would produce a record that names nobody
while looking as if it names someone — worse than the honest
`bridger:unattributed`.

Only a reason's *presence* is checked. Whether "fix" is an adequate reason
for removing a validated plugin is a procedural question for the consumer's
quality system, not something a library can judge.

**Settled here.** (1) Under `require`, the reserved actors are refused too: an
operator call that presents `Actor.system` would otherwise be recorded as a
host-originated change. (2) A blank `id` is refused unconditionally, as above.
(3) Closing the host scope is the one host-originated `shutdown`, and it is
exempt from both checks: it is attributed to `Actor.system`, which `require`
would refuse, and it carries no reason, which `requireReason: ["shutdown"]`
would refuse. Without the exemption, setting either option would make the
host's scope impossible to close — and refusing to stop is never the safe
direction (BEH-BR-188).

## BEH-BR-190: System transitions are attributed to the system, with a causation link

> **Invariant:** [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-017](../decisions/017-runtime-failure-one-transition.md), [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9; ALCOA+ Attributable, Complete

```
REQUIREMENT: A change the host makes as a consequence — not as the direct
             request of a caller — MUST be attributed to `Actor.system` and
             recorded as a system transition: `system-start`,
             `system-stop`, `runtime-failure`, `lease-revoked` or
             `health-degraded` (23 — Audit Sink and Record, BEH-BR-199).
```

```
REQUIREMENT: A system record MUST carry `causationId`: the `recordId` of the
             `requested` record of the operator call that caused it, or the
             `recordId` of the system record that caused it. A system record
             with no cause in the trail — a runtime failure reported by the
             plugin, a health check crossing into `degraded` — is a root and
             MUST carry no `causationId`.
```

```
REQUIREMENT: Mounting a child through `Plugin.Runtime.install` and removing
             it with its parent MUST be recorded as `system-start` and
             `system-stop` records whose `target` is the child and whose
             `causationId` is the record of the parent's triggering
             transition. They MUST NOT be gated.
```

```
REQUIREMENT: Closing the host's scope MUST perform `shutdown` attributed to
             `Actor.system` with no reason, recorded as operation `shutdown`
             with its own `requested` and terminal records. It is exempt
             from the attribution checks (BEH-BR-189).
```

```
REQUIREMENT: Core MUST NOT use the `@bridger/core/ActivePlugin` reference, a
             plugin id, or any fiber property as an `Actor`.
```

A system record is how the trail answers "why did this plugin stop when
nobody stopped it?": the dependent's `system-stop` points at the provider's
removal, which points at the operator who requested it and the reason they
gave. Following `causationId` from any record leads to an operator's
`requested` record or to a root system record, never to nothing.

A child mount is a consequence because the child is part of the parent's code:
the decision that a reviewer could approve or refuse was the parent's
installation, with its version and digest, and that decision is the one
attributed to an operator and submitted to the gate.

**Settled here.** Root system records carry no `causationId`. Inventing one
would make the trail claim a cause it does not contain.

## BEH-BR-191: Core does not authenticate, and does not infer identity

> **See:** [ADR-BR-028](../decisions/028-gxp-scope.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-005](../gxp/03-risk-assessment.md#rsk-br-005)
> **Regulatory:** supports the consumer's controls under 21 CFR 11.10(d) and 11.300; EU GMP Annex 11 §12.1 (by delimiting them — core implements neither)

```
REQUIREMENT: Core MUST NOT authenticate an actor, verify a credential, or
             check that an `Actor.id` belongs to a real person or service.
             It MUST record the actor exactly as given.
```

```
REQUIREMENT: Core MUST NOT infer an actor from the operating-system user, an
             environment variable, a fiber, a plugin, or the code location of
             a call.
```

```
REQUIREMENT: Core documentation MUST state that binding an `Actor` to an
             authenticated identity — and limiting who may call the host at
             all — is the consumer's responsibility.
```

An `Actor` is a claim made by the code that calls the host. If that code
accepts an unauthenticated HTTP request and passes `{ id: "admin" }`, the
trail will say `admin`. Part 11's access limits (§11.10(d)) and
identification-code controls (§11.300) belong to the system that knows who
its users are; core's part is to carry that system's answer faithfully and
never substitute a guess for it. A guessed identity is worse than none,
because it reads as evidence.

## BEH-BR-192: Attribution reaches the gate and the sink only, and defaults change nothing

> **Invariant:** [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008), [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012)
> **Regulatory:** supports ALCOA+ Attributable; 21 CFR 11.10(e)

```
REQUIREMENT: The actor, reason and correlation of a call MUST be passed to
             the `OperationGate` (as `OperationRequest`) and to the
             `AuditSink` (as `AuditRecord` fields), and to nothing else. They
             MUST NOT appear in snapshots, `Host.events`, logs, spans or
             metrics.
```

```
REQUIREMENT: With no `AuditSink`, no `OperationGate` and default
             `attribution`, every mutating call MUST behave exactly as
             specified in files 02–21: the same outcomes, errors, snapshots
             and events, and no additional waiting.
```

Keeping attribution out of the diagnostic channels has two reasons. An actor
id and a free-text reason are personal data in many deployments, and the
event feed and logs are not governed like an audit trail. And an actor that
appeared in `Host.events` would invite treating the event feed as an audit
trail — the confusion [23 — Audit Sink and Record](./23-audit-sink-and-record.md)
(BEH-BR-207) exists to prevent.

---

_Previous: [21 — Testing Host](./21-testing-host.md)_ · _Next: [23 — Audit Sink and Record](./23-audit-sink-and-record.md)_
