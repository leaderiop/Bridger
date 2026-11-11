# 25 — Operation Gate

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-25                                               |
> | Revision       | 0.10                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.10 (2026-11-11): BEH-BR-219 `OperationRequest.cold`, present on a call that passes `cold: true` and on the actions a cold `reconcile` issues (core 34, BEH-BR-353) (C7) (SPEC-AUDIT-06) (CCR-BR-038)<br>0.9 (2026-11-10): BEH-BR-222 a refused entry stops an atomic `reconcile` (C1); BEH-BR-217 unwired equivalence covers files 02–21 and 26–34 (audit round 2, Low); the GxP companion is cited as a Draft (C20) (CCR-BR-034)<br>0.8 (2026-11-08): BEH-BR-223 lists every `SystemTransition`, `lazy-idle` and `unmount-requested` included (agent review R1-15) (CCR-BR-029)<br>0.7 (2026-11-08): BEH-BR-219 `allowChildren` and `mandatoryInterceptions` on the request of plugin-addressed operations (G41), revocation paragraph points to the `RefusalList`; BEH-BR-218 and BEH-BR-220 the refusal list at step 4b, before the gate; BEH-BR-223 "start-refused" among system transitions, and the list consulted on system starts without gating them (CCR-BR-026); `OperationRequest.undo` (CCR-BR-025)<br>0.6 (2026-11-08): BEH-BR-219: what a gate can and cannot do with the installed digest (revocation) (CCR-BR-022)<br>0.5 (2026-11-08): BEH-BR-219 `definition.manifest` and `previousManifest`, a manifest is allowed (CCR-BR-017); `onBehalfOf` and gate-flow `annotations`, BEH-BR-221 bound by `Annotation.Deadline` (CCR-BR-018); BEH-BR-217 adapters `OperationGate.fromGate`/`asGate` are not implementations (CCR-BR-019); `_Next` to 26 (CCR-BR-017)<br>0.4 (2026-10-03): BEH-BR-219 `configChange: ConfigChange` with optional `fingerprints` from the consumer's `ConfigFingerprinter`, equal to the records'; a fingerprint is not a configuration value; Settled (3) (CCR-BR-014)<br>0.3 (2026-10-02): An approval is never consumed without a `requested` record; interruption outcomes aligned with BEH-BR-188; that rule placed after the refusal rules; `intent-ended` is not gated (CCR-BR-008)<br>0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

In a regulated deployment some changes need approval before they happen:
replacing a validated plugin, reconfiguring a GMP-relevant one. If the only
way to enforce that were a wrapper around the host, any code holding the raw
`Host` could step around it. This file adds an optional `OperationGate` port
that the host itself consults on every operator mutation, after the call is
attributed and checked and before anything is recorded or changed. It has
no SPEC.md source section; it amends SPEC.md's statement that veto-style hooks
over host operations are not provided, for host lifecycle operations only
([ADR-BR-032](../decisions/032-operation-gate.md), amending
[ADR-BR-020](../decisions/020-typed-event-bus.md)). This file owns
BEH-BR-217–224 and uses all eight.

> **What core does not do — and who does**
>
> The gate is a seam, not an approval system. Core does not **authenticate**
> the approver or the requester, does not **store**, **retain**, make
> **durable** or **review** approvals, does not **manifest or link
> electronic signatures** (21 CFR 11.50, 11.70) or implement signature
> components (11.200), and offers **no tamper evidence**. Core provides **no
> gate implementation at all**. Those belong to the consumer, or to the
> `@bridger/gxp` companion where adopted, specified as a Draft in
> [`references/gxp/`](../../gxp/README.md). Core guarantees only that a wired gate cannot be bypassed
> through the `Host` it guards.

Planned source: `packages/core/src/OperationGate.ts` *(Planned)*. The call
order is [BEH-BR-188](./22-attributable-operations.md) in
22 — Attributable Operations; the `rejected` record is in
[23 — Audit Sink and Record](./23-audit-sink-and-record.md).

## BEH-BR-217: The OperationGate port is optional, and core provides no implementation

> **Invariant:** [INV-BR-026](../invariants.md#inv-br-026-an-unwired-sink-or-gate-changes-nothing)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g); EU GMP Annex 11 §10, §12.1

```ts
// illustrative — not type-checked
interface OperationGateShape {
  readonly authorize: (request: OperationRequest) => Effect.Effect<void, OperationRejected>
}
class OperationGate extends Context.Service<OperationGate, OperationGateShape>()("@bridger/core/OperationGate") {}

class OperationRejected extends Schema.TaggedError<OperationRejected>()("OperationRejected", {
  operation: Schema.String,
  target: Schema.optional(Schema.Struct({ id: Schema.String, realm: Schema.String })),  // same shape as OperationRequest.target
  reason: Schema.String
}) {}
```

```
REQUIREMENT: The host MUST read `OperationGate` with `Effect.serviceOption`
             at construction. `OperationGate` MUST NOT appear in the
             requirements of `Bridger.layer` or `Bridger.make`.
```

```
REQUIREMENT: `@bridger/core` MUST NOT export any `OperationGate`
             implementation — no default, no permissive "allow all", no
             "log only", no example layer. The only gate helper is the
             scripted test fixture of 21 — Testing Host, exported from
             `@bridger/core/testing`. `OperationGate.fromGate` and
             `OperationGate.asGate` (32 — Generic Gate and Plan,
             BEH-BR-315) are adapters, not implementations: each requires a
             gate written by the consumer.
```

```
REQUIREMENT: With no gate wired, step 5 of BEH-BR-188 MUST be skipped and
             every call MUST behave exactly as specified in files 02–21 and
             26–34.
```

A shipped allow-all gate would be a control that does nothing and looks like
one. Someone wires it "for now", the deployment passes a review that asks
"is there an approval gate?", and the answer is yes. Leaving the gate
unimplemented means that a deployment either has a real gate, written or
adopted on purpose, or visibly has none.

## BEH-BR-218: The gate is consulted after attribution and validation, before any record

> **Invariant:** [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-029](../decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g)

```
REQUIREMENT: When a gate is wired, `authorize` MUST be called exactly once per
             mutating call (once per entry action for `reconcile`), at step 5
             of BEH-BR-188: after the host-closed, attribution, latch,
             validation, fingerprint and refusal-list checks have passed
             (steps 1–4b), and before the `requested` record is written or
             the intent recorded. A call the `RefusalList` refuses at step
             4b (28, BEH-BR-267) MUST NOT be submitted to the gate.
```

```
REQUIREMENT: The host MUST NOT cache, reuse or infer a gate decision. Two
             identical calls MUST each be submitted.
```

```
REQUIREMENT: A gate MUST NOT call mutating operations of the host it guards.
             Core does not detect such a call; it would be submitted to the
             gate in turn and is bounded only by `gateTimeout`.
```

Running after attribution means the gate always knows who is asking; running
after validation means it is never asked to approve something that cannot
happen; running before the `requested` record means a refusal leaves exactly
one record. Consulting it on every call — never caching — keeps the gate's
decision tied to the request it was asked about, which is what an approval is
for.

## BEH-BR-219: The OperationRequest, without configuration values

> **Invariant:** [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008), [RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)
> **Regulatory:** supports 21 CFR 11.10(g); EU GMP Annex 11 §10, §12.1

```ts
interface OperationRequest {
  readonly operation: Operation
  readonly target?: { readonly id: string; readonly realm: string }
  readonly actor: Actor
  readonly reason?: string
  readonly correlationId: string                  // always present: supplied, or generated by the host
  readonly definition?: {
    readonly version?: string
    readonly digest?: string
    readonly manifest?: PluginManifest              // when the definition carries one (27, BEH-BR-248)
  }
  readonly previousManifest?: PluginManifest        // replace only, when the replaced definition carries one (27)
  readonly configChange?: ConfigChange             // { paths, fingerprints? } (23, BEH-BR-195)
  readonly onBehalfOf?: PrincipalRef               // calls made from plugin code only (28, BEH-BR-259)
  readonly annotations: Annotations                // flow "gate" only (30, BEH-BR-292)
  readonly allowChildren?: boolean                 // plugin-addressed operations only (28, BEH-BR-263)
  readonly mandatoryInterceptions?: readonly {     // plugin-addressed operations only (28, BEH-BR-260)
    readonly serviceId: ServiceId
    readonly id?: string                           // the catalog id, when the interception has one (18)
  }[]
  readonly undo?: true                             // an undo action of an atomic reconcile (32, BEH-BR-325)
  readonly cold?: true                             // a call passing cold: true, and each replace and restarting
                                                   // reconfigure a cold reconcile issues (34, BEH-BR-353)
}
```

`manifest` and `previousManifest` follow the requirement of
[27 — Manifest and Lazy Activation](./27-manifest-and-lazy-activation.md)
(BEH-BR-248), so that a gate can compute `Manifest.consentDiff` itself;
`onBehalfOf` follows
[28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md)
(BEH-BR-259) and `annotations`
[30 — Operation Context Annotations](./30-operation-context-annotations.md)
(BEH-BR-292).

`undo` marks the undo actions of an atomic `reconcile`
([32 — Generic Gate and Plan](./32-generic-gate-and-plan.md), BEH-BR-325),
so that a gate answering from a recorded approval can match them against the
approved plan's `undo` lists; a gate that refuses them makes the apply end in
`PartialApply`.

```
REQUIREMENT: `operation`, `target`, `actor`, `reason` and `correlationId`
             MUST be the values the call's records carry (23 — Audit Sink and
             Record, BEH-BR-196).
```

```
REQUIREMENT: `definition` MUST be present for every plugin-addressed
             operation: for `install` and `replace` it MUST describe the
             incoming definition; for every other operation, the definition
             currently installed. Its fields MUST be absent when the
             definition does not declare them.
```

A gate can therefore refuse, by the installed `definition.digest`, every
operator call that would start a plugin's code again — `enable`, `retry`,
`restart`, `reconfigure` and, by the incoming digest, `install` and
`replace`. It cannot do more: system transitions are never gated
(BEH-BR-223). What a revocation companion
([`references/loader/`](../../loader/README.md)) needs for the starts nobody
calls — a dependency returning, a lazy trigger, a background fiber
restarting — is the `RefusalList` port
([28 — Plugin Principal and Mandatory Policy](./28-plugin-principal-and-mandatory-policy.md),
BEH-BR-267), which the host consults on every start, operator or system,
and which refuses operator calls before the gate is asked. Making a digest
unusable on a running host still takes a `disable` or a `remove`; the list
keeps it from starting again.

A gate can likewise require that a plugin is installed with
`allowChildren: false` or with a given mandatory interception, because the
request carries both (URS gap G41).

```
REQUIREMENT: `allowChildren` and `mandatoryInterceptions` MUST be present
             for every plugin-addressed operation and absent otherwise. For
             `install` they MUST describe the registration the call would
             create — the effective `allowChildren` (the parent's value AND
             the option, for a child) and the installation-mandatory
             interceptions, inherited ones first, own last, in the order of
             step 3 of BEH-BR-261 — and for every other operation the
             installed registration's. Each element of
             `mandatoryInterceptions` MUST carry the interception's service
             id and, when it was given through the catalog of
             18 — Reconciliation and Confluence, its catalog `id`; an
             interception given as a bare value carries no `id`.
```

```
REQUIREMENT: `configChange` MUST follow the rule of BEH-BR-197 and MUST equal
             the `configChange` of the call's records: for `reconfigure`, the
             paths of the fields the decoded value changes; for `install`,
             the top-level keys of the raw override, which is not decoded at
             the call (03 — Installation, BEH-BR-022) — never a value.
             When a `ConfigFingerprinter` is wired, `configChange` MUST
             carry the `fingerprints` accepted at step 4a (22 —
             Attributable Operations, BEH-BR-188), which come before the
             gate is called, and they MUST equal the `fingerprints` of the
             call's `requested` and terminal records.
```

```
REQUIREMENT: `OperationRejected.target`, when present, MUST have the same
             `{ id, realm }` shape and value as `OperationRequest.target`.
```

```
REQUIREMENT: An `OperationRequest` MUST NOT contain a configuration value,
             a key object, a definition object, a service, a fiber or a
             cause. A manifest is data, not a definition object, and is
             allowed (BEH-BR-241). A fingerprint returned by the consumer's
             `ConfigFingerprinter` is not a configuration value; core MUST
             NOT compute one itself.
```

The request carries what an approver needs to decide — what operation, on
what, by whom, why, which version and digest, which configuration fields —
and nothing that would turn the gate into a channel through which secrets or
live objects leave the host. A companion that must show an approver the new
value of a non-secret field obtains it from its own configuration store,
under its own controls.

**Settled here.** (1) `correlationId` is typed as always present, as in the
record (the host generates one when the caller supplies none). (2) `definition`
is present for every plugin-addressed operation, not only `install` and
`replace`, so that a gate can refuse, say, a `restart` of a version that has
been withdrawn. (3) `configChange.fingerprints` (CCR-BR-014,
[ADR-BR-039](../decisions/039-config-fingerprint-port.md)) is what lets a
gate bind an approval to the values it approves, not only to their paths:
the fingerprints are taken at step 4a, before the gate, so the request the
approver sees and the records the reviewer reads carry the same strings. A
fingerprinter that cannot answer fails the call before the gate is asked
(`ConfigFingerprintUnavailable`), so a gate is never asked about a change
whose fingerprinting failed; a request carries no `fingerprints` only when
no fingerprinter is wired or the port selected no path. Core passes the strings through unchanged and
claims nothing about what they prove; that depends on the consumer's port
([RSK-BR-024](../gxp/03-risk-assessment.md#rsk-br-024)).

## BEH-BR-220: A refusal changes nothing and leaves one record

> **Invariant:** [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call), [INV-BR-029](../invariants.md#inv-br-029-the-audit-degraded-latch-blocks-operator-mutations)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-031](../decisions/031-audit-failure-policy.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(g); EU GMP Annex 11 §9

```
REQUIREMENT: When `authorize` fails with `OperationRejected`, the call MUST
             fail with that error, MUST record no intent and MUST change
             nothing.
```

```
REQUIREMENT: With a sink wired, a refused call MUST write exactly one record:
             phase `rejected`, with `error` `{ _tag: "OperationRejected",
             message }` carrying the gate's reason, and no `requested`
             record.
```

```
REQUIREMENT: A `rejected` record is a terminal record. When it cannot be
             written within `auditTimeout`, the call MUST still fail with
             `OperationRejected`, and the host MUST set the audit-degraded
             latch.
```

```
REQUIREMENT: A call refused by the `RefusalList` at step 4b of BEH-BR-188
             (28 — Plugin Principal and Mandatory Policy, BEH-BR-267) MUST
             be failed and recorded as this behaviour states for a gate
             refusal, with `OperationRejected.reason` and the record's
             `error.message` "refused-digest: <reason>".
```

A refused request is itself an event a reviewer may need: someone tried to
replace a validated plugin and was stopped. One `rejected` record captures
exactly that — who, what, why they asked, and why they were refused — without
a `requested` record that would suggest the change was ever under way.

## BEH-BR-221: A gate that fails, hangs or is abandoned is a refusal

> **Invariant:** [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(g)

```ts
interface BridgerOptions {
  // ...
  readonly gateTimeout?: Duration.Input | "forever"   // default 60 seconds
}
```

```
REQUIREMENT: A gate that dies, or is interrupted by anything other than the
             caller, MUST be treated as a refusal: the call MUST fail with
             `OperationRejected` with reason "gate-defect".
```

```
REQUIREMENT: A gate that has not completed within `gateTimeout` — or, when
             the calling fiber carries `Annotation.Deadline`, within the
             earlier of `gateTimeout` and that deadline (30 — Operation
             Context Annotations, BEH-BR-291) — MUST be
             interrupted and treated as a refusal with reason
             "gate-timeout". `gateTimeout: "forever"` MUST be accepted only
             when stated explicitly.
```

```
REQUIREMENT: When the caller is interrupted while the gate is deciding, the
             gate MUST be interrupted, nothing MUST change, and — with a sink
             wired — a `rejected` record with reason "caller-interrupted"
             MUST be written.
```

```
REQUIREMENT: In every case the refusal MUST be recorded as BEH-BR-220
             specifies.
```

```
REQUIREMENT: Once `authorize` has succeeded, the call MUST NOT be
             interruptible until its `requested` record has been enqueued
             (22 — Attributable Operations, BEH-BR-188). An interruption of
             the caller after that point is recorded as BEH-BR-188 states —
             a `failed` (`Interrupted`) record before the intent, the
             ordinary terminal record after it — never as a refusal.
```

Failing closed is the only reading under which a gate is a control: a gate
whose outage lets changes through is a gate that works only when nobody is
testing it. The timeout exists so that a stuck approval service turns into a
visible refusal rather than an administration console that hangs.

Approval that needs a person should be obtained *before* the call — the
companion records the approval, and the gate checks that a matching approval
exists — not by holding the call open while someone is paged. That is why the
default timeout is a minute, not a shift.

**Settled here.** SPEC.md and the GxP hook design do not say what happens
when the *caller* abandons a call during authorization. Nothing has changed
at that point, so the call simply ends; the `rejected` record is written so
that the trail still shows every request that reached the gate. The other
side of the decision is closed too: an approval the gate has given is
followed, without a window for interruption, by the enqueue of the
`requested` record of the request it approved, so an approval is never
consumed by a call that leaves no record of its request (URS gap G16).

## BEH-BR-222: The gate cannot be bypassed through the Host it guards

> **Invariant:** [INV-BR-027](../invariants.md#inv-br-027-a-refused-or-unauditable-mutation-changes-nothing)
> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-023](../decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(g); EU GMP Annex 11 §12.1

```
REQUIREMENT: Every operator mutation reachable through the `Host` — every
             `Operation` except `shutdown`, including calls through
             `PluginHandle`, group operations, and each entry action of
             `reconcile` — MUST be submitted to a wired gate. No method,
             option, overload or internal path MAY skip it.
```

```
REQUIREMENT: `reconcile` MUST consult the gate once per entry action, never
             once for the batch. A refused entry MUST appear in
             `ReconcileReport.rejected` with `OperationRejected` and MUST NOT
             stop the other entries (18 — Reconciliation and Confluence),
             unless the call is atomic: with `atomic: true` a refusal stops
             the apply and is reported in `failed` of `ApplyRolledBack` or
             `PartialApply` (32 — Generic Gate and Plan, BEH-BR-322).
```

```
REQUIREMENT: Core documentation MUST state what the guarantee does not cover:
             a second host with no gate, code that changes the world without
             the host, and plugin code's own side effects.
```

The guarantee is deliberately narrow and therefore checkable: a test can call
every mutating method, through every route, and show the gate was consulted.
It is what distinguishes a gate *inside* the host from a wrapper around it,
which code holding the raw `Host` could ignore. Beyond the host, the gate
protects nothing — a consumer that also runs ungated administration paths has
to close them by other means.

## BEH-BR-223: System transitions and shutdown are audited, not gated

> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-029](../decisions/029-attributable-mutations.md), [ADR-BR-021](../decisions/021-children-and-groups.md)
> **Satisfies:** [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-016](../gxp/03-risk-assessment.md#rsk-br-016)
> **Regulatory:** supports 21 CFR 11.10(e)

```
REQUIREMENT: System transitions — `system-start`, `system-stop`,
             `runtime-failure`, `lease-revoked`, `health-degraded` and
             `intent-ended`, `lazy-triggered`, `lazy-idle`, `handoff`,
             `start-refused` and `unmount-requested` — every value of
             `SystemTransition` (22 — Attributable Operations, BEH-BR-185),
             including a child's mount and its removal with its parent —
             MUST NOT be submitted to the gate. They MUST be
             audited as specified in 23 — Audit Sink and Record.
```

```
REQUIREMENT: A wired `RefusalList` MUST be consulted on system starts as
             28 — Plugin Principal and Mandatory Policy, BEH-BR-267,
             states. Consulting it is not gating: the list is a synchronous
             lookup with no approval, no `OperationRequest` and no
             `rejected` record, and a refused system start is recorded as
             the system transition `start-refused`.
```

```
REQUIREMENT: `shutdown`, whether called explicitly or performed by closing the
             host's scope, MUST NOT be submitted to the gate.
```

A system transition is a consequence, not a decision. A gate that could
refuse "dependent stops because its provider was removed" would have to be
consulted in the middle of a removal it had already approved, and a refusal
there could only leave the host half-way. The decision a reviewer can approve
is the operator's call that caused it, and that call was gated.

Shutdown is not gated because stopping is the safe direction: a gate that
could keep a host running — perhaps the very host whose audit sink has failed
— would be a control that prevents the safe action.

## BEH-BR-224: The gate is the seam for approvals and electronic signatures

> **See:** [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md), [ADR-BR-020](../decisions/020-typed-event-bus.md)
> **Satisfies:** [URS-BR-024](../urs.md#urs-br-024-require-approval-before-a-regulated-change), [URS-BR-026](../urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-014](../gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-018](../gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports the companion's and consumer's controls under 21 CFR 11.50, 11.70, 11.200; EU GMP Annex 11 §14 (core implements none of them)

```
REQUIREMENT: Core documentation MUST state that the gate is where an
             approval or electronic-signature workflow connects to the host,
             and that signature manifestation (11.50), signature/record
             linking (11.70) and signature components and controls (11.200)
             are the obligations of the companion and the consumer, not of
             core.
```

```
REQUIREMENT: The veto the gate provides MUST be limited to host lifecycle
             operations. Application events on `Bridger.Events` MUST keep no
             veto hook.
```

```
REQUIREMENT: Core MUST NOT describe a wired gate as making a deployment
             compliant with any regulation.
```

A companion can build on this seam without changing core: record an approval
(with its signature, manifestation and link to the change) in its own store,
then answer `authorize` by checking that an approval matching the request's
`operation`, `target`, `definition` and `configChange` exists and was given
by someone other than the requester. The `requested` record that follows
carries the same `correlationId`, which is how the companion's approval
record and the host's change record are joined.

The amendment to [ADR-BR-020](../decisions/020-typed-event-bus.md) is
deliberately limited. Veto hooks over *application* events would make every
`emit` a potential policy decision with no record; a veto over *host
lifecycle operations* is the one place where a decision is both needed and
recorded.

---

_Previous: [24 — Time, Identifiers and Sequence](./24-time-ids-and-sequence.md)_ · _Next: [26 — Versioned Contracts](./26-versioned-contracts.md)_
