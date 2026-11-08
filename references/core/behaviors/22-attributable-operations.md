# 22 — Attributable Operations

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-22                                               |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-10-03): BEH-BR-188 step 4a — configuration fingerprints from the optional `ConfigFingerprinter` port, after validation and before the gate: when the port is called and never called, `select` before `fingerprint`, only selected values handed over, no attribution to the port, validation of the answer, `fingerprintTimeout`, fail-closed `ConfigFingerprintUnavailable` with a core-written message, interruption outcome, stored fingerprints reused without calling the port; BEH-BR-192 attribution never reaches the fingerprinter, and an unwired fingerprinter changes nothing; BEH-BR-186 `controls` added to the read-only operations; fingerprints ordered by `configChange.paths`, whatever order the port answers in (CCR-BR-014, CCR-BR-015)<br>0.4 (2026-10-02): Interruption outcome per stage of the call order; approval-to-`requested` passage uninterruptible; record-only `Interrupted` wins over a later `AuditUnavailable`; `WouldDeadlock` checked before any wait and at the linearization point; resumption of a parked stop is the call's intent; causation of system records in cascades; second review pass: `SystemTransition` "intent-ended" and its cause; a child's removal caused by the cascade root's record; pre-intent waits are a running system stop and the call's turn only; a `requested` record dropped for overflow fails the call at once (CCR-BR-008)<br>0.3 (2026-10-02): Interruption before intent is allowed and ends with a failed (Interrupted) record (prototype finding G14) (CCR-BR-007)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

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
  | "intent-ended"
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
             `inspect`, `awaitIdle`, `controls`, `use`, `useAll`, `lease` —
             MUST NOT take an `OperationContext` and MUST NOT be attributed,
             gated or audited.
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
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-023](../urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded), [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-004](../gxp/03-risk-assessment.md#rsk-br-004), [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)
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
 4a   configuration fingerprints      ConfigFingerprintUnavailable
      (when a ConfigFingerprinter                                none
      is wired and the call supplies
      a new override value)
 5    OperationGate.authorize         OperationRejected          one `rejected`
      (when wired)                    (also "caller-interrupted")
 6    `requested` record              AuditUnavailable;          `requested`, or none yet
      (when a sink is wired)          Interrupted*               when the write failed
 7    WouldDeadlock check before any  WouldDeadlock, Conflict,   system records of the
      wait; turn at the plugin's      Superseded, DrainTimeout,  transition (23)
      linearization point; there:     Interrupted* (before the
      WouldDeadlock again,            intent), ...
      re-validation, legality,
      joins, supersession,
      resumption; intent recorded;
      transition runs
 8    terminal record                 —                          one of `completed`,
      (when a sink is wired)                                     `failed`, `superseded`,
                                                                 `joined`

 * record-only tag: the caller's fiber is interrupted and receives no error;
   "Interrupted" appears only as `error._tag` of the call's `failed` record
   (ADR-BR-008).
```

```
REQUIREMENT: Every mutating call MUST pass the steps above in this order.
             A call that fails at step 1, 2, 3, 4 or 4a MUST change nothing
             and MUST write no record. A call refused at step 5 MUST change
             nothing and MUST write exactly one `rejected` record (when a
             sink is wired). A call whose step 6 fails because its
             `requested` record was not written within `auditTimeout` MUST
             change nothing and MUST fail with `AuditUnavailable`
             (23 — Audit Sink and Record, BEH-BR-203). A call whose
             `requested` record cannot be queued because the writer's queue
             is full MUST fail at once with `AuditUnavailable`, MUST change
             nothing and MUST receive no terminal record (BEH-BR-202).
```

```
REQUIREMENT: Every call that passes step 6 MUST reach step 8: exactly one
             terminal record MUST follow its `requested` record, whatever the
             outcome of step 7.
```

```
REQUIREMENT: A caller MAY be interrupted at any step, except in the passage
             below. The outcome MUST depend on where the interruption lands:
             - during steps 1–4a: the call ends with no change and no
               record;
             - during step 5, while the gate is deciding: the call ends with
               no change and, with a sink wired, the one `rejected` record
               ("caller-interrupted") of 25 — Operation Gate, BEH-BR-221;
             - after its `requested` record is enqueued and before its
               intent is recorded — including while it waits for that
               record to be written, for a running system stop on the
               plugin to settle (08 — Operation Legality, BEH-BR-073), or
               for its turn at the plugin's linearization point
               (BEH-BR-065) — the call changes nothing and ends with a
               `failed` terminal record whose `error._tag` is "Interrupted";
             - after its intent is recorded: only the caller's wait ends;
               the transition and its terminal record proceed (INV-BR-010).
               A call that waits for a running build after its intent is
               recorded (BEH-BR-071, `starting` row) is in this case.
             With no sink wired, an interruption before the intent changes
             nothing and writes nothing.
```

```
REQUIREMENT: The passage from the gate's approval — or from the end of step
             4a when no gate is wired — to the enqueue of the `requested`
             record MUST be uninterruptible, so that an approval is never
             consumed without a record. The passage MUST NOT wait for
             anything other than the enqueue itself.
```

```
REQUIREMENT: The `failed` (`Interrupted`) record MUST be written by the
             host's call path — an interruption finalizer of the call — and
             not by the reconciler, which has received no intent. It MUST be
             the call's only terminal record: the first terminal cause wins
             (23 — Audit Sink and Record, BEH-BR-203). A call interrupted
             while it waits for its `requested` record to be written MUST
             NOT also receive a `failed` (`AuditUnavailable`) record when
             that record is later written; a call whose `auditTimeout`
             expired before any interruption ends with `AuditUnavailable`
             as BEH-BR-203 states.
```

```
REQUIREMENT: A call that resumes a parked stop — by joining or superseding a
             parked operation, or as one of the calls that may resume a
             parked system stop (08 — Operation Legality, BEH-BR-072,
             BEH-BR-073, BEH-BR-074) — MUST record its intent when it
             resumes the stop and becomes its owner. An interruption after
             that MUST end only its wait.
```

**Settled here.** An earlier revision made step 6 and the start of step 7 one
uninterruptible unit. With per-plugin ordering
([ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)), the span
between the `WouldDeadlock` check and the intent can include a wait for a
running system stop or for the plugin's turn, and that turn can be held
by a stop that waits for a drain. An uninterruptible wait as long as a drain
would make a caller's own timeout meaningless. The host-core prototype showed
the alternative is cheap: the call is still answered by exactly one terminal
record, and nothing changes because no intent was recorded (URS gap G14).

**Settled here.** The review of CCR-BR-003..007 (URS gap G16) found two
holes in that rule, closed here. (1) An interruption that landed between the
gate's approval and the enqueue of the `requested` record would have consumed
an approval with no record of the request it approved; that passage waits for
nothing but the enqueue, so making it uninterruptible costs nothing. (2) A
call interrupted while its `requested` record was still being retried could
have been answered twice — `Interrupted` from the call path and, later,
`AuditUnavailable` from BEH-BR-203. The first terminal cause wins, so the
"one requested, one terminal" rule holds on every path. The `Interrupted`
record comes from the call path because no intent reached the reconciler;
the tag is record-only, since the interrupted caller is no longer there to
receive an error.

```
REQUIREMENT: Configuration values MUST be decoded at step 4 for
             `reconfigure` only. `install` MUST NOT decode
             `options.config` at the call: an override that does not decode
             is an activation failure (phase `activation`), reported in the
             plugin's state and not as an error of the call
             (03 — Installation, BEH-BR-022).
```

**Step 4a — configuration fingerprints.** A consumer whose approvals must
name the configuration value they cover, and not only its path, wires the
optional `ConfigFingerprinter` port
([ADR-BR-039](../decisions/039-config-fingerprint-port.md)). Core ships no
implementation and computes no fingerprint itself; it asks the port, after
validation and before the gate, so that the gate's request and the call's
records carry the same fingerprints (23 — Audit Sink and Record,
BEH-BR-197; 25 — Operation Gate, BEH-BR-219).

```ts
// illustrative — not type-checked
interface Fingerprint { readonly path: string; readonly fingerprint: string }
interface FingerprintQuery {
  readonly operation: "install" | "reconfigure"
  readonly target: { readonly id: string; readonly realm: string }
}
class ConfigFingerprinter extends Context.Service<ConfigFingerprinter, {
  readonly select: (q: FingerprintQuery & { readonly paths: ReadonlyArray<string> })
    => Effect.Effect<ReadonlyArray<string>>
  readonly fingerprint: (q: FingerprintQuery & {
      readonly form: "raw" | "decoded"
      readonly entries: ReadonlyArray<{ readonly path: string; readonly value: unknown }>
    }) => Effect.Effect<ReadonlyArray<Fingerprint>, ConfigFingerprintFailed>
}>()("@bridger/core/ConfigFingerprinter") {}

// ConfigFingerprintFailed { message }                — the port's error; never reaches a caller
// ConfigFingerprintUnavailable { operation, message } — the call's error (ADR-BR-008)
```

```
REQUIREMENT: Step 4a MUST run only when a `ConfigFingerprinter` is wired
             (02 — Host Construction, BEH-BR-015) and the call supplies a
             new override value:
             - `install` with `config`: form "raw", and as candidate paths
               the top-level keys of the supplied value, which is not
               decoded at the call (03 — Installation, BEH-BR-022);
             - `reconfigure` with a value: form "decoded", and as candidate
               paths the changed paths (23 — Audit Sink and Record,
               BEH-BR-197);
             - a `reconcile` entry whose action is one of these two
               (18 — Reconciliation and Confluence).
             When the call has no candidate paths, the port MUST NOT be
             called. With no `ConfigFingerprinter` wired, step 4a MUST be
             skipped and the call MUST behave as if step 4a did not exist.
```

```
REQUIREMENT: Core MUST NOT call the `ConfigFingerprinter` for a
             `reconfigure` without a value (a clear), for the revert of an
             override when an intent ends (`intent-ended`), for a call that
             resumes a parked operation, at activation, for values read
             from a configuration source or a default, or for any system
             transition.
```

```
REQUIREMENT: Core MUST call `select` first, with the operation, the target
             and the candidate paths, and with no value. Its answer MUST be
             a subset of the candidate paths with no duplicates; any other
             answer MUST fail step 4a with "selection outside the changed
             paths". When the selection is empty, core MUST NOT call
             `fingerprint`, and `configChange` MUST carry no
             `fingerprints`.
```

```
REQUIREMENT: Core MUST then call `fingerprint` once, with the operation, the
             target, the form, and one entry `{ path, value }` for each
             selected path, in the order of `configChange.paths` (the
             changed paths), whatever order `select` answered in. It MUST
             NOT hand the port the value of a path that was not selected,
             and MUST NOT hand a value to anything other than the port
             (INV-BR-013).
```

```
REQUIREMENT: Core MUST NOT pass the actor, the reason, the correlationId or
             any other part of the call's attribution to `select` or to
             `fingerprint` (BEH-BR-192).
```

```
REQUIREMENT: The answer of `fingerprint` MUST name exactly the selected
             paths, each once, each with a fingerprint matching
             `^[A-Za-z0-9._:-]{1,200}$`; any other answer MUST fail step 4a
             with "malformed answer". Core MUST order the accepted
             fingerprints by the order of `configChange.paths` (the changed
             paths), whatever order the port answers in, and MUST NOT alter
             them.
```

```
REQUIREMENT: `select` and `fingerprint` together MUST be bounded by
             `fingerprintTimeout` (02 — Host Construction, BEH-BR-011;
             default 5 seconds). When it passes, the port's call MUST be
             interrupted and step 4a MUST fail with "timeout".
```

```
REQUIREMENT: When `select` or `fingerprint` fails or dies, when
             `fingerprintTimeout` passes, or when an answer is refused as
             above, the call MUST fail with
             `ConfigFingerprintUnavailable { operation, message }`, MUST
             change nothing and MUST write no record, and the gate MUST NOT
             be called. The port's `ConfigFingerprintFailed` MUST NOT reach
             the caller.
```

```
REQUIREMENT: Core MUST write the message of `ConfigFingerprintUnavailable`
             itself, as "configuration fingerprints unavailable: <why>",
             where <why> is "selection outside the changed paths",
             "malformed answer", "timeout", the `_tag` of the port's error,
             or "defect". It MUST NOT include the port's own text, which
             could quote a value. Core MUST log the failure at error level
             naming the operation and the target (`<operation> <id>@<realm>`)
             and MUST NOT log a value.
```

```
REQUIREMENT: An interruption of the caller during step 4a MUST end the call
             as during steps 1–4: no change and no record.
```

```
REQUIREMENT: The fingerprints accepted at step 4a MUST be stored with the
             override they describe, and MUST be reused without calling the
             port: on the `intent-ended` record of a reverted override, the
             fingerprints stored with the override put back in place, for
             the reverted paths (23 — Audit Sink and Record, BEH-BR-199);
             and on the terminal record of a call that resumes a parked
             operation which stores an override (BEH-BR-200).
```

The port is asked in two steps so that values leave core only once a path
has been chosen: `select` sees paths, never values, and `fingerprint` sees
only the values of the paths `select` chose. A consumer that fingerprints
only non-secret fields never receives a secret at all. Core writes the
failure message itself because the port's own text could quote the value it
was given, and an error message reaches callers, logs and — for a refusal
recorded later — the trail. A port that cannot answer fails the call before
the gate, as a sink that cannot record fails it before the intent: an
approval that was meant to bind to a fingerprint is never asked for without
one ([RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)).

**Settled here.** A fingerprint stands for the override value the change
puts in place, so a change that puts no new value in place — a clear, a
revert, a resumption of somebody else's stored change — never calls the
port: a revert or a resumption reuses what was stored with the override, and
a clear has nothing to fingerprint. Fingerprinting the effective
configuration at activation was rejected (ADR-BR-039): it would hand source
values to the port on every activation, including values no operator
changed.

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
changes. Fingerprints (step 4a) come after validation, so that the port is
never handed the value of a call that cannot happen, and before the gate, so
that an approval can bind to them. The gate
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
record. `WouldDeadlock` is checked twice within step 7: before the call waits
for anything — a running system stop, or its turn — and again at the
linearization point before the intent, because whether the call joins an
operation in flight, and so would wait for that operation's step, is known
only there ([09 — Leases](./09-leases.md), BEH-BR-088).

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
             `system-stop`, `runtime-failure`, `lease-revoked`,
             `health-degraded` or `intent-ended` (23 — Audit Sink and
             Record, BEH-BR-199).
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
REQUIREMENT: In a cascade (08 — Operation Legality, BEH-BR-079), the cause
             of a system record MUST be taken from the cascade root:
             - root an operator call (the cascading call): that call's
               `requested` record;
             - root a runtime failure or shutdown: the `recordId` of the
               record that began the root — the `runtime-failure` record,
               or the `requested` record of `shutdown`;
             - root a dependency-loss stop with no operator call at its
               root: the `causationId` that stop's own `system-stop` record
               carries, which leads back to one of the roots above.
             The system records of a parked stop that a call resumes
             (BEH-BR-074) MUST carry the `recordId` of the resuming call's
             `requested` record; a parked stop resumed by a cascade follows
             the cascade root. The `intent-ended` record of a parked intent
             that a cascade or shutdown ends (23 — Audit Sink and Record,
             BEH-BR-199) MUST take its cause in the same way: the record of
             the cascade root, or the `requested` record of `shutdown`.
```

```
REQUIREMENT: Mounting a child through `Plugin.Runtime.install` MUST be
             recorded as a `system-start` record whose `target` is the child
             and whose `causationId` is the record of the parent's
             triggering transition — the record that began the parent's
             activation. Removing a child with its parent is a
             cascade (08 — Operation Legality, BEH-BR-079): the child's
             `system-stop` record MUST have the child as `target` and MUST
             take its `causationId` from the cascade root as above — when
             the parent was stopped directly by an operator call, that
             call's `requested` record. The mount and the removal MUST NOT
             be gated.
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
> **See:** [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008), [RSK-BR-012](../gxp/03-risk-assessment.md#rsk-br-012), [RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)
> **Regulatory:** supports ALCOA+ Attributable; 21 CFR 11.10(e)

```
REQUIREMENT: The actor, reason and correlation of a call MUST be passed to
             the `OperationGate` (as `OperationRequest`) and to the
             `AuditSink` (as `AuditRecord` fields), and to nothing else. They
             MUST NOT appear in snapshots, `Host.events`, logs, spans or
             metrics, and MUST NOT reach the `ConfigFingerprinter`
             (BEH-BR-188, step 4a).
```

```
REQUIREMENT: With no `AuditSink`, no `OperationGate`, no
             `ConfigFingerprinter` and default `attribution`, every mutating
             call MUST behave exactly as specified in files 02–21: the same
             outcomes, errors, snapshots and events, and no additional
             waiting.
```

Keeping attribution out of the diagnostic channels has two reasons. An actor
id and a free-text reason are personal data in many deployments, and the
event feed and logs are not governed like an audit trail. And an actor that
appeared in `Host.events` would invite treating the event feed as an audit
trail — the confusion [23 — Audit Sink and Record](./23-audit-sink-and-record.md)
(BEH-BR-207) exists to prevent.

The fingerprinter is kept apart for a third reason. It is the one port that
sees configuration values; handing it who asked and why as well would let it
join values to people, which is exactly the record the audit trail declines
to keep. A fingerprint depends on the value alone, and the trail, not the
port, joins it to the actor through the record that carries both.

---

_Previous: [21 — Testing Host](./21-testing-host.md)_ · _Next: [23 — Audit Sink and Record](./23-audit-sink-and-record.md)_
