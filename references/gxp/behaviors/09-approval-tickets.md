# 09 — Approval Tickets

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-09                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

Approval happens before the call, not inside it ([ADR-GX-010](../decisions/010-sign-first-then-call.md)). A
requester proposes a change; the companion turns the proposal into one or
more **bindings** — canonical descriptions of exactly the change approved —
and the approvers sign a **ticket** holding them. The operator then makes the
call with the ticket's id as its `correlationId` ([ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)), and the
gate of [12 — Approval Gate](./12-approval-gate.md) only has to recompute the
binding from core's `OperationRequest`, compare digests and consume the
binding, well within `gateTimeout`. This file defines tickets and bindings,
the binding digest with its test vectors, the lifecycle, the append-only
`TicketStore` event log, single-use consumption by compare-and-set, expiry,
revocation, and bundles for `reconcile`. This file owns BEH-GX-065–072 and
uses all eight.

Planned source: `packages/gxp/src/approvals/Ticket.ts`,
`packages/gxp/src/approvals/binding.ts`,
`packages/gxp/src/approvals/TicketStore.ts` and
`packages/gxp/src/approvals/issueTicket.ts` *(Planned)*. Signatures are
captured through the port of
[10 — Signature Capture Port](./10-signature-capture-port.md).

## BEH-GX-065: A ticket holds bindings, a requester, a time window and the policy digest

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.10(f), 11.70; EU GMP Annex 11 §10, §14

```ts
// illustrative — not type-checked
interface Binding {
  readonly v: 1
  readonly scope: string                                  // the deployment the ticket is for, e.g. "lims-prod"
  readonly operation: GatedOperation
  readonly target?: { readonly id: string; readonly realm: string }
  readonly definition?: { readonly version?: string; readonly digest?: string }
  readonly config?: {
    readonly form: "raw" | "decoded"                      // install → "raw", reconfigure → "decoded"
    readonly paths: readonly string[]
    readonly fingerprints?: readonly { readonly path: string; readonly fingerprint: string }[]
  }
  readonly requester: { readonly id: string; readonly kind: "user" | "service" }
  readonly reason?: string                                // present only when the rule has bindReason
}

interface Ticket {
  readonly id: string                                     // from IdGenerator; the call's correlationId
  readonly scope: string
  readonly requester: { readonly id: string; readonly kind: "user" | "service" }
  readonly policyDigest: string                           // BEH-GX-061
  readonly ruleId: string                                 // the policy rule that required the ticket
  readonly bindings: readonly { readonly binding: Binding; readonly digest: string }[]
  readonly notBefore: string                              // ISO-8601 UTC with ms
  readonly notAfter: string
  readonly state: TicketState                             // derived from the event log (BEH-GX-067)
  readonly signatures: readonly SignatureRecord[]         // 10 — Signature Capture Port, BEH-GX-076
}
```

```
REQUIREMENT: A binding MUST contain exactly the fields that apply to the
             proposed call, each equal to what core will put in the call's
             `OperationRequest` (BEH-BR-219): `operation`; `target` when the
             operation addresses a plugin or realm; `definition` whenever the
             request will carry one, with the same present fields; `config`
             whenever the request will carry `configChange`, with `paths` and,
             when the request will carry them, `fingerprints` in the same
             order; `requester` the `id` and `kind` of the actor (never
             `display`); and `reason` exactly when the governing rule has
             `bindReason`. A field that does not apply MUST be absent, never
             `null` or empty.
```

```
REQUIREMENT: `scope` MUST be a non-empty string configured for the gate and
             the issuer alike. The gate MUST refuse a binding whose `scope`
             differs from its own.
```

```
REQUIREMENT: Neither a ticket nor a binding MAY contain a configuration value,
             a key, or anything derived from a value other than a fingerprint
             (BEH-GX-006).
```

A binding is the approved change written in the request's own terms, so that
the gate can rebuild it from the request alone and compare. `scope` stands in
for the host, whose `hostId` does not exist until the host is built and
changes at every restart ([BEH-BR-016](../../core/behaviors/02-host-construction.md)): a ticket approves a change to a
deployment, not to one process lifetime of it.

## BEH-GX-066: The binding digest is SHA-256 over the binding's canonical form, with test vectors

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-012](../decisions/012-binding-contents.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §14

```
REQUIREMENT: `bindingDigest(b)` MUST be "sha256:" followed by the lower-case
             hexadecimal SHA-256 of the UTF-8 bytes of the RFC 8785 canonical
             form of `b`. The issuer and the gate MUST use the same function
             from the same package version (BEH-GX-002).
```

```
REQUIREMENT: The companion's test suite MUST include the vectors below, each
             checking that canonicalising `input` gives exactly `canonical`
             and that SHA-256 of its UTF-8 bytes is `sha256`. The
             specification checker MUST recompute them (check 17), and a
             vector MUST NOT be changed except with a new binding version `v`.
```

The vectors cover a bound `install` with a definition digest and a
fingerprint, a `reconfigure` whose identifiers and reason contain non-ASCII
characters, a quotation mark, a backslash, U+2028 and a control character,
and an `acknowledgeAuditDegraded` with no target. Each block is one JSON
object; `canonical` is the exact canonical text and `sha256` the hexadecimal
digest without the "sha256:" prefix.

```vector
{"input": {"v": 1, "scope": "lims-prod", "operation": "install", "target": {"id": "sample-registry", "realm": "default"}, "definition": {"version": "2.4.0", "digest": "sha256:9f2c4e0b7a1d3c5e8f6a2b4d0c1e3f5a7b9d1c3e5f7a9b1d3c5e7f9a1b3d5c7e"}, "config": {"form": "raw", "paths": ["db", "retention"], "fingerprints": [{"path": "retention", "fingerprint": "fp1:hmac-sha256:k2026-01:LYslr2gO-wE1b2aN12OCyOz_8XfUixrIzOtOQ4sq9wk"}]}, "requester": {"id": "u:jrivera", "kind": "user"}, "reason": "CC-2026-114: deploy sample registry 2.4.0"}, "canonical": "{\"config\":{\"fingerprints\":[{\"fingerprint\":\"fp1:hmac-sha256:k2026-01:LYslr2gO-wE1b2aN12OCyOz_8XfUixrIzOtOQ4sq9wk\",\"path\":\"retention\"}],\"form\":\"raw\",\"paths\":[\"db\",\"retention\"]},\"definition\":{\"digest\":\"sha256:9f2c4e0b7a1d3c5e8f6a2b4d0c1e3f5a7b9d1c3e5f7a9b1d3c5e7f9a1b3d5c7e\",\"version\":\"2.4.0\"},\"operation\":\"install\",\"reason\":\"CC-2026-114: deploy sample registry 2.4.0\",\"requester\":{\"id\":\"u:jrivera\",\"kind\":\"user\"},\"scope\":\"lims-prod\",\"target\":{\"id\":\"sample-registry\",\"realm\":\"default\"},\"v\":1}", "sha256": "11ba890c21b2df2ecfa81c62920ed36cbbe45cbed3db3ece584ec3ba4433d612"}
```

```vector
{"input": {"v": 1, "scope": "lims-prod", "operation": "reconfigure", "target": {"id": "stabilität-monitor", "realm": "qc"}, "definition": {"version": "1.0.3"}, "config": {"form": "decoded", "paths": ["alerts.0.threshold", "db.pool.max"]}, "requester": {"id": "u:müller", "kind": "user"}, "reason": "Ändern gemäß \"CC-7\" — Schwelle neu\\alt\u0001"}, "canonical": "{\"config\":{\"form\":\"decoded\",\"paths\":[\"alerts.0.threshold\",\"db.pool.max\"]},\"definition\":{\"version\":\"1.0.3\"},\"operation\":\"reconfigure\",\"reason\":\"Ändern gemäß \\\"CC-7\\\" — Schwelle neu\\\\alt\\u0001\",\"requester\":{\"id\":\"u:müller\",\"kind\":\"user\"},\"scope\":\"lims-prod\",\"target\":{\"id\":\"stabilität-monitor\",\"realm\":\"qc\"},\"v\":1}", "sha256": "e30c094ae50d253aa8c8d5ef22e177a50c76cd035e1ea5011079fdc5198b9915"}
```

```vector
{"input": {"v": 1, "scope": "lims-prod", "operation": "acknowledgeAuditDegraded", "requester": {"id": "svc:ops-console", "kind": "service"}, "reason": "store restored after network outage, INC-4471"}, "canonical": "{\"operation\":\"acknowledgeAuditDegraded\",\"reason\":\"store restored after network outage, INC-4471\",\"requester\":{\"id\":\"svc:ops-console\",\"kind\":\"service\"},\"scope\":\"lims-prod\",\"v\":1}", "sha256": "0f8360a6c2fa88d836686d843e34a2b454ab0def95f11dbd743a665d30da39c1"}
```

The second vector is the one most implementations get wrong: RFC 8785
leaves non-ASCII characters and U+2028 unescaped, escapes the quotation mark
and backslash, and writes the control character U+0001 as `\u0001` in lower
case. A gate and an issuer that disagree on any of these would refuse every
ticket for that change ([RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)) — a loud failure, but one that the
vectors catch before deployment.

## BEH-GX-067: A ticket's state follows from its events, through one lifecycle

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-010](../decisions/010-sign-first-then-call.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §9, §14

| State | Reached by | Usable at the gate |
| --- | --- | --- |
| `issued` | an `issued` event | no |
| `signed` | `signed` events from as many distinct signers as the rule requires, with its meanings | yes, for each open binding, inside the time window |
| `consumed` | a `consumed` event for every binding | no |
| `expired` | reading the state when `Clock` is at or after `notAfter`, with an open binding left | no |
| `revoked` | a `revoked` event | no |

```
REQUIREMENT: A ticket's state MUST be computed from its events in `eventSeq`
             order and the current `Clock` time, by the rules of the table,
             and from nothing else. `consumed` and `revoked` MUST be final;
             `expired` MUST be final once `notAfter` has passed, whatever
             events follow.
```

```
REQUIREMENT: A `signed` event recorded after `notAfter`, after a `revoked`
             event, or beyond the number of signatures the rule requires MUST
             be refused by the store's compare-and-set (BEH-GX-068) and MUST
             NOT change the state.
```

```
REQUIREMENT: Each binding MUST be either open or consumed. A ticket MUST be
             `consumed` exactly when all its bindings are consumed; while some
             are open and none of the final conditions holds it MUST stay
             `signed`.
```

Deriving the state rather than storing it means there is one source of truth
— the event log — and a reviewer can replay it to see how a ticket reached
the state it is in. Expiry is computed, not written, because no process
need be running at the moment a ticket expires; the gate reads
`Clock` when it checks the window ([BEH-GX-070](#beh-gx-070-tickets-expire-at-notafter-and-can-be-revoked-with-attribution-and-a-reason)).

## BEH-GX-068: The TicketStore is an append-only event log with its own sequence and compare-and-set

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry), [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-010](../gxp/03-risk-assessment.md#rsk-gx-010), [RSK-GX-021](../gxp/03-risk-assessment.md#rsk-gx-021)
> **Regulatory:** supports 21 CFR 11.10(e), 11.70; EU GMP Annex 11 §9, §14

```ts
// illustrative — not type-checked
type TicketEvent =
  | { readonly type: "issued"; readonly ticket: Omit<Ticket, "state" | "signatures"> }
  | { readonly type: "signed"; readonly signature: SignatureRecord }                         // BEH-GX-076
  | { readonly type: "consumed"; readonly bindingDigest: string; readonly hostId: string
      readonly correlationId: string; readonly policyDigest: string }
  | { readonly type: "revoked"; readonly by: { readonly id: string; readonly kind: "user" | "service" }
      readonly reason: string }
  | GateEvent                          // "policy-activated", "exempted": by the gate only, stream "gate:<hostId>" (BEH-GX-095)

interface StoredTicketEvent {
  readonly eventSeq: number            // 1, 2, 3, ... per store, contiguous
  readonly ticketId: string
  readonly version: number             // 1, 2, 3, ... per ticket: this event's position in the ticket's log
  readonly at: string                  // from Clock, ISO-8601 UTC with ms, stamped by the companion
  readonly event: TicketEvent
}

interface TicketStoreShape {
  readonly manifest: { readonly name: string; readonly version: string; readonly fixture?: true }
  readonly append: (q: { readonly ticketId: string; readonly expectedVersion: number; readonly at: string; readonly event: TicketEvent }) =>
    Effect.Effect<StoredTicketEvent, TicketVersionConflict | TicketWriteFailed>
  readonly ticket: (ticketId: string) => Effect.Effect<readonly StoredTicketEvent[], TicketReadFailed>   // [] when unknown
  readonly events: (q: { readonly fromSeq?: number }) => Stream.Stream<StoredTicketEvent, TicketReadFailed>
}
```

```
REQUIREMENT: `append` MUST store the event only when the ticket's last stored
             `version` equals `expectedVersion` (0 for a ticket with no
             events), giving it `version` = `expectedVersion` + 1 and the next
             `eventSeq`, atomically. Otherwise it MUST fail with
             `TicketVersionConflict` and store nothing. The check and the
             write MUST be one operation of the store, not a read followed by
             a write in the adapter.
```

```
REQUIREMENT: The store MUST offer no method that changes or removes an event.
             `eventSeq` MUST be contiguous from 1 across the store; `version`
             contiguous from 1 per ticket.
```

```
REQUIREMENT: Before appending, the companion MUST validate each event against
             the ticket's current events by the rules of BEH-GX-067 and
             BEH-GX-069 to BEH-GX-072, and MUST NOT append an event those
             rules refuse. The store enforces the version only; the companion
             enforces the meaning.
```

```
REQUIREMENT: The companion MUST NOT export a `TicketStore` from its main entry
             point; `memoryTicketStore` exists only in `@bridger/gxp/testing`
             (BEH-GX-145).
```

Compare-and-set on a per-ticket version is the whole concurrency model: two
gates trying to consume the same binding, or a revocation racing a
consumption, both read version k and try to write k + 1, and exactly one
succeeds. The loser re-reads and finds the binding consumed or the ticket
revoked. The store-wide `eventSeq` makes the log checkable for gaps and
order the same way a trail is, and lets `checkApprovals` stream it
([BEH-GX-039](./05-checks-on-read.md#beh-gx-039-approvals-and-records-are-checked-against-each-other)).

## BEH-GX-069: issueTicket turns a proposed request into a signed ticket

> **Invariant:** [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-010](../decisions/010-sign-first-then-call.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019)
> **Regulatory:** supports 21 CFR 11.10(f), 11.50, 11.70; EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
interface ProposedRequest {                     // an OperationRequest without correlationId (BEH-BR-219)
  readonly operation: GatedOperation
  readonly target?: { readonly id: string; readonly realm: string }
  readonly actor: Actor
  readonly reason?: string
  readonly definition?: { readonly version?: string; readonly digest?: string }
  readonly configChange?: { readonly paths: readonly string[]; readonly fingerprints?: readonly { readonly path: string; readonly fingerprint: string }[] }
}

declare function issueTicket(
  proposal: { readonly scope: string; readonly requests: readonly ProposedRequest[]; readonly notBefore?: string; readonly notAfter: string },
  deps: { readonly policy: ApprovalPolicy; readonly tickets: TicketStoreShape; readonly signatures: SignatureCaptureShape }
): Effect.Effect<Ticket, IssueRefused | SignatureDeclined | SignatureCaptureFailed | TicketWriteFailed | TicketVersionConflict>
```

```
REQUIREMENT: `issueTicket` MUST evaluate the policy for every proposed request
             (BEH-GX-058) and MUST fail with `IssueRefused` when the requests
             do not all fall under the same "ticket" rule, when a request
             falls under an "exempt" rule, when the window exceeds the rule's
             `validity`, when `notAfter` is not later than `notBefore`, or
             when a request lacks what the rule requires (`reason` under
             `bindReason`, `definition.digest` under `requireDigest`, a
             fingerprint per path under `requireFingerprints`).
```

```
REQUIREMENT: It MUST build one binding per proposed request as BEH-GX-065
             states, compute each digest (BEH-GX-066), take `id` from core's
             `IdGenerator` and `notBefore`, when omitted, from `Clock`, and
             append the `issued` event with `expectedVersion` 0.
```

```
REQUIREMENT: It MUST then request one signature per meaning of the rule
             through the signature port (BEH-GX-073), one at a time, and
             append a `signed` event for each signature accepted under the
             rules of BEH-GX-078. When a signature is declined or capture
             fails, it MUST stop, leave the ticket `issued`, and fail with
             that error; signatures already recorded MUST stay recorded.
```

```
REQUIREMENT: A `signed` event MUST be appended only by the `issueTicket` call
             that appended the ticket's `issued` event. The companion MUST
             NOT offer a way to resume or repeat signing of a ticket left
             `issued`; such a ticket stays unusable at the gate until it
             expires or is revoked, and the change needs a new ticket.
```

```
REQUIREMENT: `IssueRefused.message` MUST name the rule `id` and the missing or
             invalid element by field name only, never a value.
```

The proposal is what the operator intends to submit, so the binding the
issuer builds is the binding the gate will rebuild — provided both see the
same request. For `install` and `reconfigure` with fingerprints, the issuer
obtains them with `proposeFingerprints`, which decodes the value the same way
the call will ([13 — Config Fingerprints](./13-config-fingerprints.md)).

**Settled here.** A declined or failed signature ends the ticket's signing:
asking again on the same ticket would let a requester go from approver to
approver until one signs, with only the identity system's records showing the
refusals. A new ticket starts a new, visible approval round, and the
abandoned one remains in the store as `issued` with the signatures it got.

**Settled here.** One ticket answers to one policy rule. A bundle that mixed
rules would need the strictest signatures of all of them, and a reviewer
would have to work out which approval covered which entry; requiring one
rule per ticket keeps that one-to-one.

## BEH-GX-070: Tickets expire at notAfter and can be revoked, with attribution and a reason

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-015](../decisions/015-separation-of-duties.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018), [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)
> **Regulatory:** supports 21 CFR 11.10(e), 11.10(f); EU GMP Annex 11 §12.1; ALCOA+ Attributable

```ts
// illustrative — not type-checked
declare function revokeTicket(
  q: { readonly ticketId: string; readonly by: Actor; readonly reason: string },
  deps: { readonly tickets: TicketStoreShape }
): Effect.Effect<void, RevokeRefused | TicketWriteFailed | TicketVersionConflict>
```

```
REQUIREMENT: A ticket MUST be usable only while `notBefore` <= now <
             `notAfter`, where now is read from `Clock` by the party checking.
             No tolerance MAY be added for clock skew.
```

```
REQUIREMENT: `revokeTicket` MUST refuse with `RevokeRefused` a reserved actor
             (BEH-BR-189), a blank `reason`, an unknown ticket, and a ticket
             already `consumed`, `expired` or `revoked`. Otherwise it MUST
             append one `revoked` event carrying the actor's `id` and `kind`
             and the reason, by compare-and-set, retrying on
             `TicketVersionConflict` at most three times after re-reading.
```

```
REQUIREMENT: Revocation MUST affect open bindings only. A binding consumed
             before the `revoked` event MUST stay consumed, and the change it
             allowed MUST NOT be described as revoked.
```

Expiry with no tolerance makes the companion's behaviour exact and puts clock
quality where core puts it — with the consumer ([BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md),
[RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018)). A skewed clock then refuses some tickets early or accepts
them late by the size of the skew, which the consumer's time synchronisation
must bound. This is the consumer's obligation. Revocation is attributed like
any change because withdrawing an approval is itself a decision someone is
accountable for.

## BEH-GX-071: A binding is consumed once, by compare-and-set, and a failed call burns it

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §14

```
REQUIREMENT: Consuming a binding MUST append a `consumed` event carrying the
             binding's digest, the `hostId` and `correlationId` of the
             request, and the digest of the policy in force, with
             `expectedVersion` equal to the version the consumer read. It MUST
             succeed only when the ticket was `signed`, inside its window, and
             the binding was open at that version.
```

```
REQUIREMENT: On `TicketVersionConflict`, the consumer MUST re-read the ticket
             and re-evaluate. A binding found consumed after re-reading MUST
             NOT be consumed again; the second request MUST be refused.
```

```
REQUIREMENT: A consumed binding MUST stay consumed whatever the outcome of the
             call: refused later by core, failed, interrupted or superseded.
             The companion MUST NOT offer a way to return a binding to open.
```

Consumption happens at the gate, before core writes the call's `requested`
record ([BEH-BR-218](../../core/behaviors/25-operation-gate.md)), so the companion cannot know whether the change will
succeed. Restoring a binding after a failure would need a second write that
can itself fail, and would make "approved once, applied twice" possible. A
failed call therefore burns its approval and the change needs a new ticket —
an availability cost that tempts teams to widen exemptions
([RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)), which is why every exemption must be justified in the
policy ([BEH-GX-059](./08-approval-policy.md#beh-gx-059-exemptions-are-explicit-rules-with-a-justification)).

## BEH-GX-072: A reconcile cites one bundle ticket, with one binding per entry action

> **Invariant:** [INV-GX-002](../invariants.md#inv-gx-002-a-binding-is-consumed-at-most-once), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)
> **Satisfies:** [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §10, §14

```
REQUIREMENT: A ticket for a `reconcile` MUST hold one binding per entry action
             the reconcile is expected to submit to the gate, each built from
             that action's own operation, target, definition and configuration
             change. The binding's `operation` MUST be the entry action's,
             never "reconcile".
```

```
REQUIREMENT: The gate MUST match each entry action of a call whose
             `correlationId` is the bundle's ticket id to the open binding
             whose digest equals the one recomputed from that action, and MUST
             consume only that binding. An entry action with no equal open
             binding MUST be refused; the other entries MUST be decided
             independently.
```

```
REQUIREMENT: Bindings of a bundle left open after the call MUST stay open
             until consumed by a later call citing the same ticket id,
             revoked, or expired. A binding MUST NOT be consumed by a call
             with a different `correlationId`.
```

```
REQUIREMENT: Two bindings of one bundle with equal digests MUST be refused by
             `issueTicket` with `IssueRefused`; each binding of a bundle MUST
             be distinct.
```

Core consults the gate once per entry action, with the parent's
`correlationId` ([BEH-BR-201](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-222](../../core/behaviors/25-operation-gate.md)), so one ticket id can cover a
whole reconcile while each entry is still bound to its own change. A
reconcile whose diff turned out different from the one approved is refused
entry by entry, not as a whole: the entries that match go ahead under their
approvals, those that do not are refused and recorded as `rejected`, and the
open bindings stay visible in the ticket store, where `checkApprovals`
reports them ([RSK-GX-022](../gxp/03-risk-assessment.md#rsk-gx-022)).

---

_Previous: [08 — Approval Policy](./08-approval-policy.md)_ · _Next: [10 — Signature Capture Port](./10-signature-capture-port.md)_
