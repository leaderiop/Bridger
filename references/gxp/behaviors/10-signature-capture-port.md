# 10 — Signature Capture Port

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-10                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-11): BEH-GX-074 `renderBinding` shows a bound `cold` (core CCR-BR-038 coupling) (SPEC-AUDIT-06) (CCR-GX-009)<br>0.2 (2026-11-10): BEH-GX-074 the rendered text shows every field binding version 2 locks in: `onBehalfOf`, `undo`, the manifest digest, `allowChildren` and `mandatoryInterceptions` (M1) (CCR-GX-006)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

A ticket becomes usable when the people the policy names have signed it
([BEH-GX-067](./09-approval-tickets.md#beh-gx-067-a-tickets-state-follows-from-its-events-through-one-lifecycle)). The companion does not know who those people are, how they
log in, or how a password, token or fingerprint is checked; it cannot, and
must not pretend to. It defines a port through which the consumer's identity
system captures a signature — showing the signer exactly what they approve
and with what meaning, re-authenticating them, and reporting back who signed
and how — and it enforces the rules it can enforce on what comes back:
the meaning asked for, a signer who is not the requester, distinct signers,
no reserved actors, a time from `Clock` ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-015](../decisions/015-separation-of-duties.md)).
This file owns BEH-GX-073–080 and uses all eight.

> **What the companion does not do — and who does**
>
> The companion does not authenticate anyone, check a credential, ensure
> that a signature is used only by its genuine owner, or provide the
> controls of 21 CFR 11.100–11.300. It records what the capture port
> attests. Identity, re-authentication, the uniqueness of signer
> identifiers and the controls on signature components are the consumer's
> obligation ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claims 3 and 6).

Planned source: `packages/gxp/src/approvals/SignatureCapture.ts` and
`packages/gxp/src/approvals/renderBinding.ts` *(Planned)*. How a recorded
signature is linked to the change and shown to a reader is
[11 — Signature Linking](./11-signature-linking.md).

## BEH-GX-073: The SignatureCapture port captures one signature per request and has no default

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports 21 CFR 11.50, 11.100, 11.200 (as the seam for the consumer's controls); EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
interface SignatureCaptureShape {
  readonly manifest: {
    readonly name: string
    readonly version: string
    readonly methods: readonly string[]                    // authentication methods it can report
    readonly attestation: { readonly document: string; readonly version: string }   // BEH-GX-079
    readonly fixture?: true                                // testing entry point only (BEH-GX-145)
  }
  readonly capture: (request: SignatureRequest) =>
    Effect.Effect<CapturedSignature, SignatureDeclined | SignatureCaptureFailed>
}
class SignatureCapture extends Context.Service<SignatureCapture, SignatureCaptureShape>()("@bridger/gxp/SignatureCapture") {}
```

```
REQUIREMENT: The companion MUST call `capture` once per signature it needs and
             MUST NOT call it again for the same ticket and meaning after a
             `CapturedSignature` has been recorded for them.
```

```
REQUIREMENT: The companion MUST NOT provide a `SignatureCapture` in its main
             entry point — no accept-all, no no-op, no implementation that
             signs as a configured service account (BEH-GX-003).
```

The port is the one place where the companion meets a human act. Keeping it a
single method, called once per signature, makes each call correspond to one
person signing one thing, which is what a reviewer will want to reconstruct.

## BEH-GX-074: A SignatureRequest shows the signer exactly what is approved and with what meaning

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-012](../decisions/012-binding-contents.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
> **Regulatory:** supports 21 CFR 11.50(a), 11.70; EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
interface SignatureRequest {
  readonly ticketId: string
  readonly bindingDigest: string          // one binding: its digest; a bundle: BEH-GX-074, second requirement
  readonly meaning: Meaning               // { code, text } from the policy rule (BEH-GX-060)
  readonly requester: { readonly id: string; readonly kind: "user" | "service" }
  readonly rendered: {
    readonly text: string                 // deterministic rendering of the bindings, UTF-8, LF line ends
    readonly digest: string               // "sha256:" + hex(SHA-256(UTF-8(text)))
  }
  readonly notAfter: string
}
```

```
REQUIREMENT: `rendered.text` MUST be produced by the companion's
             `renderBinding` from the ticket's bindings alone,
             deterministically, and MUST show for each binding: the operation;
             the target id and realm; the definition version and digest when
             bound; each configuration path, with "fingerprinted" against the
             paths whose value is bound by a fingerprint; the requester's id;
             when bound, the `onBehalfOf` plugin's id, realm, version and
             digest, "undo action" for `undo`, "cold start, no state
             handoff" for `cold`, and the `requestOnly`
             manifest digest, `allowChildren` and each mandatory
             interception's `serviceId` and `id` (or "none" for an empty
             list), marked "matched by the gate only" (BEH-GX-083); and the
             reason when bound. It MUST end with the meaning's `text` and the
             ticket's `notAfter`. A field the binding locks in MUST NOT be
             left out of the text.
```

```
REQUIREMENT: For a ticket with one binding, `bindingDigest` MUST be that
             binding's digest. For a bundle it MUST be "sha256:" followed by
             the hexadecimal SHA-256 of the RFC 8785 canonical form of the
             array of the bindings' digests in ticket order.
```

```
REQUIREMENT: The port MUST present `rendered.text` to the signer, unchanged,
             before capturing the signature, and MUST NOT present a different
             description of the change. This is the consumer's obligation; the
             companion records `rendered.digest` with the signature so that
             the text shown can be reproduced and compared later (BEH-GX-076).
```

```
REQUIREMENT: A `SignatureRequest` MUST NOT contain a configuration value or a
             fingerprint key; a fingerprint itself MUST NOT appear in
             `rendered.text`, which shows only that the path is fingerprinted.
```

A signer approves what they are shown. If the port showed a description of
its own making, the signature would bind to that description, not to the
binding the gate later checks ([RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)). A rendering fixed by the
companion and digested with the signature makes "what did the signer see?"
answerable from the record.

## BEH-GX-075: A CapturedSignature names the signer, echoes the meaning and attests the authentication

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports 21 CFR 11.50(a)(1), 11.50(a)(3), 11.200(a)(1); EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
interface CapturedSignature {
  readonly signer: {
    readonly id: string                   // the identity system's unique identifier for the person
    readonly kind: "user"
    readonly printedName: string          // the name to show in the manifestation (11.50(a)(1))
  }
  readonly meaning: string                // must equal request.meaning.code
  readonly renderedDigest: string         // must equal request.rendered.digest
  readonly authentication: {
    readonly method: string               // one of manifest.methods, e.g. "id+password", "id+otp", "biometric"
    readonly event: string                // the identity system's identifier of the authentication event
    readonly components: number           // number of distinct identification components used
    readonly reauthenticated: true        // attests a fresh authentication for this signature
  }
}
```

```
REQUIREMENT: The companion MUST refuse a `CapturedSignature`, failing the
             capture with `SignatureCaptureFailed { reason: "malformed" }`,
             when: `meaning` differs from the requested `code`;
             `renderedDigest` differs from the requested digest; `signer.kind`
             is not "user"; `signer.id`, `printedName` or
             `authentication.event` is blank; `method` is not in
             `manifest.methods`; `reauthenticated` is not the literal `true`;
             or `components` is less than 2 for a method other than
             "biometric".
```

```
REQUIREMENT: A `CapturedSignature` MUST NOT contain a credential, a password,
             a one-time code, a biometric sample or template, or any part of
             one. `components` is a count, never the components.
```

The checks the companion can make are checks of consistency — the meaning
asked for came back, the text signed is the text sent, the port claims a
fresh two-component authentication. They catch a port wired to the wrong
request or built to skip re-authentication by default. They cannot catch a
port that reports a re-authentication it did not perform ([BEH-GX-079](#beh-gx-079-re-authentication-and-the-11200-controls-are-attested-by-the-implementer-not-verified)).

## BEH-GX-076: The companion stamps signedAt from Clock and records the signature as an event

> **Invariant:** [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-009](../urs.md#urs-gx-009-link-each-signature-to-the-change-it-approved)
> **Risk:** [RSK-GX-018](../gxp/03-risk-assessment.md#rsk-gx-018), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports 21 CFR 11.50(a)(2), 11.10(e); ALCOA+ Contemporaneous, Attributable

```ts
// illustrative — not type-checked
interface SignatureRecord extends CapturedSignature {
  readonly ticketId: string
  readonly bindingDigest: string
  readonly meaningText: string            // the policy's Meaning.text, as rendered
  readonly signedAt: string               // from Clock when capture returned, ISO-8601 UTC with ms
  readonly policyDigest: string
}
```

```
REQUIREMENT: `signedAt` MUST be read from `Clock` by the companion when
             `capture` returns successfully. The port MUST NOT supply a time,
             and any time-like field in its answer MUST be ignored and not
             recorded.
```

```
REQUIREMENT: The companion MUST record each accepted signature as one `signed`
             event in the ticket store (BEH-GX-068) carrying the full
             `SignatureRecord`, before requesting the next signature.
```

```
REQUIREMENT: A signature whose `signedAt` is at or after the ticket's
             `notAfter` MUST NOT be recorded; the capture MUST fail with
             `SignatureCaptureFailed { reason: "timeout" }`.
```

One clock, one place: the time in the manifestation is the time the
companion observed the signature, from the same `Clock` service that times
the trail ([BEH-BR-209](../../core/behaviors/24-time-ids-and-sequence.md)). A port supplying its own time would put a second,
uncontrolled clock into the record.

## BEH-GX-077: Declining and failing are distinct, and both leave the ticket unsigned

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md)
> **Satisfies:** [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning), [URS-GX-006](../urs.md#urs-gx-006-approve-a-change-before-it-is-made)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §14

```ts
// illustrative — not type-checked
class SignatureDeclined extends Schema.TaggedError<SignatureDeclined>()("SignatureDeclined", {
  ticketId: Schema.String, meaning: Schema.String, message: Schema.String
}) {}
class SignatureCaptureFailed extends Schema.TaggedError<SignatureCaptureFailed>()("SignatureCaptureFailed", {
  ticketId: Schema.String, reason: Schema.Literal("unavailable", "malformed", "timeout"), message: Schema.String
}) {}
```

```
REQUIREMENT: The port MUST answer `SignatureDeclined` when the signer refused
             to sign, and `SignatureCaptureFailed` for every other failure. A
             defect of the port, and a capture not completed within
             `captureTimeout` (default 10 minutes, at most 24 hours, read from
             `Clock`), MUST be turned into `SignatureCaptureFailed` with
             reason "unavailable" or "timeout".
```

```
REQUIREMENT: Neither outcome MAY record a signature. `issueTicket` MUST fail
             with the error and leave the ticket `issued` (BEH-GX-069); the
             ticket cannot be signed later, stays unusable until it expires
             or is revoked, and the change needs a new ticket.
```

```
REQUIREMENT: The `message` of both errors MUST be written by the companion
             from a fixed template and MUST NOT include the port's text
             (BEH-GX-006).
```

A refusal to sign is a decision, and a reviewer may need to see that the
change was put to an approver and declined; the identity system's own records
carry it, and the ticket stays `issued` with fewer signatures than required
— for good, since signing is never resumed on the same ticket.
A failed capture is not a decision, and is reported as such.

## BEH-GX-078: Signers are distinct, never the requester and never a reserved actor

> **Invariant:** [INV-GX-004](../invariants.md#inv-gx-004-the-approver-is-never-the-requester)
> **See:** [ADR-GX-015](../decisions/015-separation-of-duties.md), [ADR-BR-029](../../core/decisions/029-attributable-mutations.md)
> **Satisfies:** [URS-GX-010](../urs.md#urs-gx-010-keep-requester-and-approver-apart)
> **Risk:** [RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008)
> **Regulatory:** supports 21 CFR 11.10(g); EU GMP Annex 11 §12.1, §14 (separation of duties as the consumer's control)

```
REQUIREMENT: The companion MUST refuse a `CapturedSignature` whose `signer.id`
             equals the ticket requester's `id`, equals the `signer.id` of a
             signature already recorded on the ticket, or begins with the
             reserved prefix "bridger:" (BEH-BR-189). The capture MUST then
             fail with `SignatureCaptureFailed { reason: "malformed" }` and
             nothing is recorded.
```

```
REQUIREMENT: Identifiers MUST be compared as exact strings, by code point,
             with no case folding or normalisation. A ticket MUST be `signed`
             only when it holds as many signatures as the rule's `signatures`,
             from that many distinct `signer.id`s, whose meanings equal the
             rule's meanings as a multiset (BEH-GX-060).
```

```
REQUIREMENT: Documentation MUST state that separation of duties is enforced on
             identifiers only: it holds for people only when the identity
             system gives each person one identifier and the call's `actor`
             comes from the same system. This is the consumer's obligation.
```

The companion compares strings. A requester who acts as "u:jrivera" and signs
as "j.rivera@site" defeats the check unless the identity system maps both to
one identifier — which is why the gate also requires the calling actor to be
the requester ([12 — Approval Gate](./12-approval-gate.md)) and why the
residual risk is allocated to the consumer ([RSK-GX-008](../gxp/03-risk-assessment.md#rsk-gx-008)).

**Settled here.** Comparison is exact. Case folding or Unicode normalisation
would make two identifiers the identity system treats as different people
look like one, and refuse a legitimate signer; the identity system is the
authority on what is the same identifier.

## BEH-GX-079: Re-authentication and the §11.200 controls are attested by the implementer, not verified

> **See:** [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-008](../urs.md#urs-gx-008-show-who-signed-when-and-with-what-meaning)
> **Risk:** [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.100, 11.200, 11.300; EU GMP Annex 11 §14

```
REQUIREMENT: The port's manifest MUST name an attestation document and its
             version: the implementer's statement of how each reported method
             authenticates, how re-authentication is enforced for every
             signature, and how the controls of 21 CFR 11.200 and 11.300 are
             met. The installation evidence MUST print the reference and mark
             the item as "attested, not verified by @bridger/gxp"
             (BEH-GX-113).
```

```
REQUIREMENT: No companion output MAY describe a recorded signature as
             verified, authenticated, legally binding or non-repudiable.
             Outputs MAY say that the capture port reported the signer,
             method, components and authentication event shown.
```

```
REQUIREMENT: The signature record MUST keep `authentication.event` as given so
             that a reviewer can look the event up in the identity system. The
             companion MUST NOT interpret or validate it beyond rejecting a
             blank value.
```

The line between attested and verified is the honest boundary of the
companion. It can prove that it asked for a signature on a specific text,
recorded what came back, and refused inconsistent answers. Whether a real
person, the genuine owner of the identifier, re-entered two components at
that moment is known only to the identity system, and the event identifier
is the thread a reviewer follows to it.

## BEH-GX-080: There is no default capture, not even a no-op

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)
> **See:** [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)
> **Regulatory:** supports 21 CFR 11.10(d), 11.200; EU GMP Annex 11 §14

```
REQUIREMENT: The only implementation of `SignatureCapture` the companion ships
             MUST be `scriptedSignatureCapture(decide)` in
             `@bridger/gxp/testing`, whose `decide` argument is required
             (BEH-GX-145). Its manifest MUST carry `fixture: true`, every
             signature it returns MUST use the method "test-fixture", and the
             installation checks MUST refuse it (BEH-GX-113).
```

```
REQUIREMENT: No option of `GxpLayer.make`, `issueTicket` or the gate MAY skip
             signature capture, accept a ticket with fewer signatures than its
             rule requires, or treat the requester's own call as a signature.
```

Core keeps no default gate for the same reason ([BEH-BR-217](../../core/behaviors/25-operation-gate.md),
[ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)): a harmless-looking default — a capture that signs as the
requester, a "development mode" that skips signing — is one configuration
mistake away from production. The fixture can exist because it is marked,
and the installation checks look for the mark.

---

_Previous: [09 — Approval Tickets](./09-approval-tickets.md)_ · _Next: [11 — Signature Linking](./11-signature-linking.md)_
