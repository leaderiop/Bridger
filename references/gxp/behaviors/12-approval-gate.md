# 12 — Approval Gate

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-12                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-09): BEH-GX-089–096: the approval gate is the last piece of the companion's composed host gate, and a recorded refusal reason carries the prefix "approval: " (F-02) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Core consults a wired `OperationGate` once per operator mutation — once per
entry action of a `reconcile` — after attribution, validation and
fingerprints and before any record, and treats a gate that fails, hangs or is
abandoned as a refusal ([BEH-BR-218](../../core/behaviors/25-operation-gate.md), [BEH-BR-221](../../core/behaviors/25-operation-gate.md)). The approval gate is the
companion's implementation of that port. It asks no one anything: the
approval was signed beforehand ([ADR-GX-010](../decisions/010-sign-first-then-call.md)), and the gate only finds the
ticket the call cites, checks its state and window, recomputes the binding
from the request, re-checks separation of duties, consumes the binding by
compare-and-set and allows — or refuses with one of eleven reasons. This file
owns BEH-GX-089–096 and uses all eight.

> **What the gate does not do — and who does**
>
> The gate does not authenticate the caller or the signers, does not decide
> which operations need approval (the policy does,
> [08 — Approval Policy](./08-approval-policy.md)), and protects only the
> host it is wired into: a second host without it, or a change made outside
> the host, is not gated ([BEH-BR-222](../../core/behaviors/25-operation-gate.md)). Closing those paths, and binding the
> call's `actor` to an authenticated person, is the consumer's obligation.

Planned source: `packages/gxp/src/approvals/approvalGate.ts` and
`packages/gxp/src/approvals/RefusalReason.ts` *(Planned)*.

## BEH-GX-089: approvalGate builds core's OperationGate from a policy, a ticket store and a scope, and is attached to its host

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011), [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g), 11.70; EU GMP Annex 11 §10, §12.1, §14

```ts
// illustrative — not type-checked
declare function approvalGate(options: {
  readonly policy: ApprovalPolicy                 // 08; checked here (BEH-GX-064)
  readonly tickets: TicketStoreShape              // 09
  readonly scope: string                          // the same scope the issuer uses (BEH-GX-065)
  readonly clock?: Clock.Clock                    // default: the Clock in the layer's context
  readonly deadline?: Duration.Input              // default: the host's gateTimeout minus 5 seconds (BEH-GX-094)
}): Layer.Layer<OperationGate | ApprovalGateLink, GxpLayerInvalid>

interface ApprovalGateLinkShape {
  readonly attach: (host: Host) => Effect.Effect<void, GateAttachFailed>
  readonly status: Effect.Effect<{
    readonly hostId: Option.Option<string>
    readonly deadline: Option.Option<Duration.Duration>
    readonly policyDigest: string
    readonly decisions: Readonly<Record<"allow" | "exempt" | RefusalReason, number>>   // counts only
  }>
}
class ApprovalGateLink extends Context.Service<ApprovalGateLink, ApprovalGateLinkShape>()("@bridger/gxp/ApprovalGateLink") {}

class GateAttachFailed extends Schema.TaggedError<GateAttachFailed>()("GateAttachFailed", {
  reason: Schema.Literal("already-attached", "deadline-required", "deadline-too-long", "ticket-store-unavailable"),
  message: Schema.String
}) {}
```

```
REQUIREMENT: `approvalGate` MUST check the policy as BEH-GX-064 states and
             compute its digest (BEH-GX-061) when the layer is built, and
             MUST fail the layer with `GxpLayerInvalid` on a violation or on
             a blank `scope`. Building the layer MUST NOT call the ticket
             store (BEH-GX-004).
```

```
REQUIREMENT: `attach(host)` MUST read `host.controls()` (BEH-BR-013) once,
             fix the gate's `hostId` and its deadline (BEH-GX-094), and
             append the `policy-activated` event of BEH-GX-095. It MUST fail
             with `GateAttachFailed` "already-attached" when called again
             with a different `hostId`, and MUST be idempotent for the same
             `hostId`. The gate MUST NOT call any other member of `Host`.
```

```
REQUIREMENT: Until `attach` has succeeded, `authorize` MUST refuse every
             request with the reason "ticket-store-unavailable" (BEH-GX-091)
             and MUST NOT read or write the ticket store.
```

```
REQUIREMENT: `GxpLayer.make` (BEH-GX-004) MUST build its `OperationGate`
             with `approvalGate`, passing the `approvals` section's policy
             and ticket store and the deployment's `scope`, and MUST expose
             `ApprovalGateLink` alongside the core ports it provides.
```

Core's `OperationRequest` carries no `hostId` ([BEH-BR-219](../../core/behaviors/25-operation-gate.md)), and the gate's layer is
built before the host it guards exists ([BEH-BR-015](../../core/behaviors/02-host-construction.md)). The consumption
event must nevertheless name the host whose trail will show the change
([BEH-GX-071](./09-approval-tickets.md#beh-gx-071-a-binding-is-consumed-once-by-compare-and-set-and-a-failed-call-burns-it)), and the deadline must sit below the host's own `gateTimeout`.
Both are read from the built host through its read-only `controls`, in one
explicit step the assembly performs right after construction, next to
starting the high-water recorder ([BEH-GX-043](./06-high-water-marks-and-anchors.md#beh-gx-043-recordhighwater-reads-hostcontrols-on-a-schedule-and-writes-a-mark-when-the-position-moved)).

**Settled here.** An unattached gate refuses rather than allowing or waiting.
A gate that allowed before attachment would let the first changes of every
host through unapproved; one that waited would turn a forgotten `attach` into
a hung console instead of a recorded refusal. The reason given is
"ticket-store-unavailable" because the gate cannot write a complete
consumption event, which is the same condition as a store it cannot write to.

## BEH-GX-090: authorize runs seven steps in a fixed order, and the first step that fails decides the refusal

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester), [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-015](../decisions/015-separation-of-duties.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-010](../urs.md#urs-gx-010-keep-requester-and-approver-apart)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008), [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports 21 CFR 11.10(f), 11.10(g), 11.70; EU GMP Annex 11 §12.1, §14

```
step  check                                       refusal reason when it fails
----  ------------------------------------------  ---------------------------------
 1    policy: match the rule (BEH-GX-058); an      unbound-definition,
      exempt rule ends at the exempt allow of      unbound-config-value
      BEH-GX-095; a ticket rule's requirements
      on the request
 2    ticket: read the events of the ticket whose  no-ticket
      id is the request's correlationId
 3    state and window at Clock's now, from the    ticket-revoked, ticket-expired,
      events alone (BEH-GX-067)                    ticket-unsigned
 4    binding: scope, policy digest and rule of    binding-mismatch, binding-consumed,
      the ticket; recompute the binding from the   same-person, stale-fingerprint-key
      request and find its digest (BEH-GX-092)
 5    separation of duties on the stored           same-person
      signatures (BEH-GX-078)
 6    consume the binding by compare-and-set       binding-consumed, ticket-revoked,
      (BEH-GX-093)                                 ticket-store-unavailable
 7    allow                                        —
any   a ticket-store failure or defect, or the     ticket-store-unavailable
      deadline passing (BEH-GX-094)
```

```
REQUIREMENT: `authorize` MUST perform the steps in the order shown and MUST
             refuse with the reason of the first step that fails; later steps
             MUST NOT run. It MUST allow only by completing step 7 after
             step 6 has stored the `consumed` event, or by the exempt allow
             of BEH-GX-095.
```

```
REQUIREMENT: At step 3 the gate MUST count only the signatures that pass
             every check of BEH-GX-086. With fewer such signatures, from
             fewer distinct signers, or with meanings that do not equal the
             rule's meanings as a multiset (BEH-GX-078), the ticket MUST be
             refused as "ticket-unsigned".
```

```
REQUIREMENT: Every refusal MUST fail `authorize` with core's
             `OperationRejected`, with `operation` and `target` copied from
             the request and `reason` equal to the refusal reason's code
             alone. When the gate is composed into the companion's host gate
             (BEH-GX-178), core writes that code prefixed with the piece name,
             "approval: <code>", to the `rejected` record (BEH-BR-220,
             BEH-BR-321); every check that reads a refusal reason MUST accept
             exactly that form.
```

The order is the order of information: the policy decides whether a ticket
is needed at all; only then is the store read; a ticket's own state is
judged before the request is compared with it; and the irreversible act —
consumption — comes last, when nothing else can refuse. Putting consumption
last is what makes a refusal for any other reason leave the approval open
for a corrected call.

## BEH-GX-091: The gate refuses with exactly one of eleven reasons, each with a fixed condition

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-015](../decisions/015-separation-of-duties.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-010](../urs.md#urs-gx-010-keep-requester-and-approver-apart), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(g); EU GMP Annex 11 §9, §12.1

```ts
// illustrative — not type-checked
type RefusalReason =
  | "no-ticket" | "ticket-unsigned" | "ticket-expired" | "ticket-revoked"
  | "binding-mismatch" | "binding-consumed" | "same-person"
  | "unbound-definition" | "unbound-config-value" | "stale-fingerprint-key"
  | "ticket-store-unavailable"
```

| Reason | Step | Exact condition |
| --- | --- | --- |
| `unbound-definition` | 1 | the rule has `requireDigest`, the request addresses a plugin, and `request.definition.digest` is absent |
| `unbound-config-value` | 1 | the rule has `requireFingerprints`, the request carries `configChange`, and some path of `configChange.paths` has no entry in `configChange.fingerprints` |
| `no-ticket` | 2 | the ticket store holds no event for a ticket whose `id` equals `request.correlationId`, or that id begins with the reserved prefix "gate:" |
| `ticket-revoked` | 3, 6 | the ticket's events include `revoked` |
| `ticket-expired` | 3 | now, read from `Clock`, is before `notBefore` or at or after `notAfter` (BEH-GX-070) |
| `ticket-unsigned` | 3 | the ticket's counted signatures do not meet its rule (BEH-GX-090, second requirement) |
| `binding-mismatch` | 4 | the ticket's `scope` differs from the gate's, its `policyDigest` from the policy in force, or its `ruleId` from the rule matched at step 1; or no binding can be built from the request; or no binding of the ticket has the recomputed digest and neither `same-person` nor `stale-fingerprint-key` applies |
| `binding-consumed` | 4, 6 | a binding of the ticket has the recomputed digest and is consumed, including when a concurrent consumer won the compare-and-set |
| `same-person` | 4, 5 | no binding has the recomputed digest and the request's `actor.id` equals the `signer.id` of a counted signature; or a counted signature's `signer.id` equals the ticket's requester `id`, another counted signature's `signer.id`, or begins with "bridger:"; or the requester `id` begins with "bridger:" |
| `stale-fingerprint-key` | 4 | no binding has the recomputed digest, and an open binding differs from the recomputed one only in `config.fingerprints`, both list the same paths in the same order, and for every path the ticket's fingerprint names a key id other than the one the request's fingerprint names (BEH-GX-109) |
| `ticket-store-unavailable` | any | the gate is not attached (BEH-GX-089); a store call fails, dies or answers malformed data; three compare-and-set conflicts in a row (BEH-GX-093); or the deadline passes (BEH-GX-094) |

```
REQUIREMENT: The gate MUST refuse with exactly the reason whose condition of
             the table holds first in step order; within one step, the
             reasons MUST be tested in the order the table lists them. No
             other reason string MAY be produced.
```

```
REQUIREMENT: The refusal reason MUST be the bare code. The gate MUST NOT add
             the ticket's contents, a binding, a fingerprint, a signer's name,
             a store error's text or any other detail to the reason, the
             error or a log line (BEH-GX-006); it MAY log the code with the
             request's `operation`, `target` and `correlationId` at info
             level.
```

```
REQUIREMENT: Each reason's condition MUST be decided from the request, the
             ticket's stored events, the policy the gate was built with and
             Clock's now, and from nothing else.
```

The reasons are the operator's and the reviewer's diagnosis. "binding-
mismatch" tells an operator that the call is not the change that was
approved and must be corrected; "stale-fingerprint-key" that it is, but the
approval predates a key rotation and must be re-issued; "ticket-store-
unavailable" that nothing was wrong with the call at all. Keeping them
distinct is what lets a reviewer read the `rejected` records of a period and
tell refused attempts from outages ([RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010)).

**Settled here.** (1) A ticket whose `policyDigest` differs from the policy
in force is refused as "binding-mismatch": the approval was given under other
terms, which BEH-GX-061 makes part of what a ticket binds. (2) "ticket-
expired" covers both ends of the window: a ticket used before `notBefore` is
outside its window in the same way, and the operator's remedy — use it within
the window or re-issue it — is the same. (3) A call by one of the ticket's
signers is reported as "same-person" rather than "binding-mismatch", although
the requester in the binding already differs: the reviewer should see that
an approver tried to apply an approval, which is the attempt separation of
duties exists to stop.

## BEH-GX-092: The binding step recomputes the binding from the request with the shared function and compares digests only

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §10, §14

```
REQUIREMENT: Step 4 MUST compute `bindingOf({ kind: "request", value:
             request }, { scope, bindReason })` (BEH-GX-082), with the gate's
             `scope` and the matched rule's `bindReason`, and its digest with
             `bindingDigest` (BEH-GX-066). It MUST select the ticket's binding
             by digest equality alone, never by position in the ticket or by
             comparing fields one by one.
```

```
REQUIREMENT: The gate MUST take the fingerprints it compares from
             `request.configChange.fingerprints` as core delivered them
             (BEH-BR-219). It MUST NOT call a `ConfigFingerprinter`, read a
             fingerprint key or see a configuration value.
```

```
REQUIREMENT: The field-by-field comparison of the "stale-fingerprint-key"
             condition MUST be made only after digest equality has failed,
             and only to choose the reason; it MUST NOT lead to an allow.
```

The gate never needs a value: core computed the fingerprints at step 4a of
the call, before the gate ([BEH-BR-188](../../core/behaviors/22-attributable-operations.md)), with the consumer's fingerprinter, and
the ticket's binding holds the fingerprints the issuer obtained the same way
([13 — Config Fingerprints](./13-config-fingerprints.md)). Two strings are compared inside one
digest. A rotation changes the key id inside every fingerprint the
fingerprinter produces, so an approval signed before the rotation can never
match again; recognising that case only to name it correctly costs nothing
and spares the operator a misleading "binding-mismatch".

## BEH-GX-093: The binding is consumed by compare-and-set before the gate allows, and a lost race refuses

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)
> **Regulatory:** supports 21 CFR 11.10(e), 11.70; EU GMP Annex 11 §14

```
REQUIREMENT: Step 6 MUST append one `consumed` event (BEH-GX-071) carrying
             the binding's digest, the attached `hostId`, the request's
             `correlationId` and the policy digest, with `expectedVersion`
             equal to the version of the last event the gate read at step 2,
             and `at` read from `Clock`.
```

```
REQUIREMENT: On `TicketVersionConflict` the gate MUST re-read the ticket and
             repeat steps 3 to 6 on the new events, at most three times in
             all for one request; the third conflict MUST refuse with
             "ticket-store-unavailable". A binding found consumed on
             re-reading MUST be refused as "binding-consumed", a ticket found
             revoked as "ticket-revoked".
```

```
REQUIREMENT: On `TicketWriteFailed`, a defect, or an answer that is not the
             stored event, the gate MUST refuse with
             "ticket-store-unavailable" and MUST NOT retry the append, since
             it may have taken effect (BEH-GX-005).
```

```
REQUIREMENT: Two requests citing the same binding, on one host or on two
             hosts sharing the ticket store, MUST NOT both be allowed: at most
             one `consumed` event per binding digest and ticket MUST be
             stored, and only the request whose append stored it MAY be
             allowed.
```

The store's compare-and-set is the whole defence against replay
([RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)): the gate reads version k, decides, and writes k + 1 only if
nobody wrote in between. A failed write is not retried because an append
whose answer was lost may have stored the event; retrying could only end in
a conflict that the gate would then misread as someone else's consumption.
The binding stays consumed whatever core does next ([BEH-GX-071](./09-approval-tickets.md#beh-gx-071-a-binding-is-consumed-once-by-compare-and-set-and-a-failed-call-burns-it)), and
[BEH-GX-087](./11-signature-linking.md#beh-gx-087-linkapprovals-lays-every-consumed-binding-beside-its-record-burned-bindings-included) reports a consumption that core then refused or failed as
"burned".

## BEH-GX-094: The gate decides under its own deadline, set below the host's gateTimeout

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [NFR-GX-008](../urs.md#nfr-gx-008-gate-decision-within-its-deadline), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021), [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(g); EU GMP Annex 11 §12.1

```
REQUIREMENT: When `attach` reads a finite `gateTimeout` from `Host.controls`
             and no `deadline` was given, the deadline MUST be `gateTimeout`
             minus 5 seconds; `attach` MUST fail with `GateAttachFailed`
             "deadline-too-long" when that leaves less than 1 second. A
             `deadline` given explicitly MUST be at least 1 second and at
             least 1 second shorter than `gateTimeout`; otherwise `attach`
             MUST fail with "deadline-too-long".
```

```
REQUIREMENT: When `gateTimeout` is "forever", `attach` MUST fail with
             "deadline-required" unless a `deadline` was given. With one, it
             MUST attach, and the installation checks MUST report the
             non-finite `gateTimeout` as a deviation (BEH-GX-120).
```

```
REQUIREMENT: Every `authorize` MUST run steps 1 to 7 under the deadline,
             measured with `Clock` from the moment `authorize` is entered.
             When it passes, the gate MUST interrupt its pending store call
             and refuse with "ticket-store-unavailable". It MUST NOT allow
             after the deadline has passed, even when the pending append
             answers at that moment.
```

```
REQUIREMENT: The gate MUST NOT wait for anything other than the ticket store
             and `Clock`: no person, no signature, no network call of its own
             and no other port.
```

Core would refuse a slow gate anyway, at `gateTimeout`, with the generic
reason "gate-timeout" ([BEH-BR-221](../../core/behaviors/25-operation-gate.md)). The gate's own, shorter deadline turns that
into a refusal the gate itself writes, naming the store as the cause, and
leaves core's timeout as a backstop that should never fire. Five seconds is
the margin for the gate to stop its store call, build the refusal and return
it before core's clock runs out. The gate's work is a few reads and one
append, so a healthy store answers far inside any sensible deadline;
refusals at the deadline are the visible signature of the slow store of
[RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021).

**Settled here.** An append interrupted at the deadline may already have
stored its `consumed` event. The gate refuses all the same, core writes a
`rejected` record, and the binding is reported as "burned" (BEH-GX-087).
Allowing a call whose consumption the gate could not confirm in time would
let a decision depend on a write the gate never saw complete.

## BEH-GX-095: Exempt allows and the policy in force are recorded in the ticket store before they take effect

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-013](../decisions/013-single-use-tickets.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007), [RSK-GX-011](../gxp/03-risk-assessment.md#rsk-gx-011)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §1, §10

```ts
// illustrative — not type-checked
// Two further TicketEvent variants (09, BEH-GX-068), written by the gate only, to the stream "gate:<hostId>"
type GateEvent =
  | { readonly type: "policy-activated"; readonly hostId: string; readonly policyDigest: string
      readonly deadlineMs: number }
  | { readonly type: "exempted"; readonly hostId: string; readonly correlationId: string
      readonly operation: GatedOperation; readonly target?: { readonly id: string; readonly realm: string }
      readonly ruleId: string; readonly policyDigest: string }
```

```
REQUIREMENT: `attach` MUST append one `policy-activated` event to the stream
             whose `ticketId` is "gate:" followed by the attached `hostId`,
             carrying the policy digest and the deadline in milliseconds.
             When the append fails, `attach` MUST fail with
             `GateAttachFailed` "ticket-store-unavailable" and the gate MUST
             stay unattached.
```

```
REQUIREMENT: When step 1 matches an "exempt" rule, the gate MUST append an
             `exempted` event to the same stream, by compare-and-set with the
             retry rule of BEH-GX-093, before it allows. When the append does
             not store the event within the deadline, the gate MUST refuse
             with "ticket-store-unavailable". An exempt allow MUST NOT read or
             consume any ticket, even when `correlationId` names one.
```

```
REQUIREMENT: The gate MUST NOT treat a stream whose id begins with "gate:" as
             a ticket (BEH-GX-091, `no-ticket`), and no other companion
             function MAY append to such a stream.
```

An exemption is a decision someone made in the policy; its use is a change
nobody signed. Recording each use, with the rule that allowed it and the
policy digest, puts exempt changes in the same store as approved ones, so
that [BEH-GX-087](./11-signature-linking.md#beh-gx-087-linkapprovals-lays-every-consumed-binding-beside-its-record-burned-bindings-included) can show every gated record with what let it through
and a growth in exempt traffic is measurable ([RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)). The
`policy-activated` event marks, in the store, from when a policy governed a
host. The cost is that an exempt operation also stops when the ticket store
is down — which is why the policy's rule for `acknowledgeAuditDegraded` must
be chosen deliberately ([BEH-GX-062](./08-approval-policy.md#beh-gx-062-acknowledgeauditdegraded-must-have-its-own-deliberate-rule)).

## BEH-GX-096: The gate never caches, decides each reconcile entry alone, and leaves interruption to core

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.10(f), 11.70; EU GMP Annex 11 §10, §14

```
REQUIREMENT: The gate MUST read the ticket store afresh on every `authorize`
             and MUST NOT keep a ticket, a decision or a negative lookup from
             one call to the next. Two identical requests MUST each be
             decided from the store's state at their own time (BEH-BR-218).
```

```
REQUIREMENT: For each entry action of a `reconcile`, which core submits with
             the parent call's `correlationId` (BEH-BR-201, BEH-BR-222), the
             gate MUST run all seven steps for that entry alone and consume
             at most the one binding whose digest it recomputes (BEH-GX-072).
             An entry with no matching open binding MUST be refused on its
             own; the gate MUST NOT refuse, delay or allow other entries
             because of it.
```

```
REQUIREMENT: When core interrupts `authorize` because its caller was
             interrupted, the gate MUST stop at once and MUST NOT start an
             append it has not started. An append already in flight MAY
             complete; its binding is then burned (BEH-GX-087), and core
             writes the "caller-interrupted" `rejected` record (BEH-BR-221).
```

```
REQUIREMENT: The gate MUST NOT call any mutating operation of the host
             (BEH-BR-218). It MUST hold no rule for `shutdown` or a system
             transition (BEH-GX-063), which core never submits to it
             (BEH-BR-223).
```

Caching would make a decision outlive the state it was based on: a ticket
revoked a second ago would still pass. Per-entry decisions are what make a
bundle work: a reconcile whose actual diff differs from the approved one goes
ahead for the entries that match and is refused, entry by entry, for the
rest, which appear in core's `ReconcileReport.rejected` and as open bindings
in the link report ([RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)). Interruption is core's to handle: core
interrupts the gate, writes the record and changes nothing, and once the gate
has allowed, core does not let the call be interrupted before its
`requested` record ([BEH-BR-188](../../core/behaviors/22-attributable-operations.md)), so an allow is never left without a record.

---

_Previous: [11 — Signature Linking](./11-signature-linking.md)_ · _Next: [13 — Config Fingerprints](./13-config-fingerprints.md)_
