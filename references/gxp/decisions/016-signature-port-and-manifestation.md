# ADR-GX-016: The signature port, mandatory manifestation and re-authentication attestation

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-016                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

A signed approval must show the printed name of the signer, the date and time of signing and the meaning of the signature (Part 11 §11.50), and a signature based on identification codes and passwords needs two distinct components, re-entered for each signing outside a continuous session (§11.200). How a person is identified, what they re-enter and how their credentials are managed belong to the user's identity system. [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) puts signature capture in the companion's scope as a caller-supplied port, with no default "not even a no-op", and non-claim 6 says no Bridger package provides the controls of Part 11 Subpart C. Core takes every timestamp from `Clock` ([BEH-BR-209](../../core/behaviors/24-time-ids-and-sequence.md)).

## Decision

- **The port.** `SignatureCapture` (planned at `packages/gxp/src/approvals/SignatureCapture.ts` *(Planned)*):

  ```ts
  // illustrative — not type-checked
  interface SignatureRequest {
    readonly ticketId: string
    readonly bindingDigest: string      // the binding's digest; for a bundle, the digest of the array of digests
    readonly meaning: { readonly code: string; readonly text: string }   // one of the rule's meanings
    readonly requester: { readonly id: string; readonly kind: "user" | "service" }
    readonly rendered: { readonly text: string; readonly digest: string }   // renderBinding's text shown to the signer
    readonly notAfter: string
  }
  interface CapturedSignature {
    readonly signer: { readonly id: string; readonly kind: "user"; readonly printedName: string }
    readonly meaning: string            // must equal the requested meaning's code
    readonly renderedDigest: string     // must equal request.rendered.digest
    readonly authentication: {
      readonly method: string           // one of manifest.methods, e.g. "id+otp"
      readonly event: string            // the identity system's reference for this re-authentication
      readonly components: number       // components used; at least 2 unless the method is "biometric"
      readonly reauthenticated: true
    }
  }
  interface SignatureCaptureShape {
    readonly manifest: { name: string; version: string; methods: readonly string[]
                         attestation: { document: string; version: string }; fixture?: true }
    readonly capture: (req: SignatureRequest) => Effect<CapturedSignature, SignatureDeclined | SignatureCaptureFailed>
  }
  ```

- **The companion stamps the time.** `signedAt` is taken from the companion's `Clock` when `capture` returns, never from the port's answer, and stored with the signature as UTC ISO-8601 with milliseconds.
- **Manifestation is mandatory.** A stored signature is a `SignatureRecord`: the `CapturedSignature` plus `ticketId`, `bindingDigest`, `meaningText`, `signedAt` and `policyDigest`, recorded as one `signed` event. Every rendering of a signed binding (the issuer's view, the archive, the evidence report) shows printed name, `signedAt` in UTC and meaning together ([INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)). An answer with a blank `signer.id`, `printedName` or `authentication.event`, a meaning or `renderedDigest` other than the one requested, a method not in the manifest, `components` below 2 for a method other than "biometric", or `reauthenticated` not `true`, is refused as `SignatureCaptureFailed { reason: "malformed" }` and nothing is stored.
- **Attested, not verified.** `authentication` is the port's attestation. The companion checks its shape and records it; it does not and cannot verify that re-authentication happened, that the components were distinct, or that the credentials meet §11.300. These are implementer obligations, listed in the compliance matrix as Consumer rows.
- **No default, not even a no-op.** The main entry point exports no `SignatureCapture`. The testing entry point exports `scriptedSignatureCapture(decide)`, where `decide` is required and the fixture carries the marker IQ refuses ([ADR-GX-024](../decisions/024-fixtures-are-marked.md)).
- **Failure refuses.** A declined, failed, malformed or timed-out capture leaves the binding unsigned; the ticket does not reach `signed`, signing is not resumed on it, and the change needs a new ticket ([BEH-GX-077](../behaviors/10-signature-capture-port.md)).

## Alternatives considered

- **Let the port supply `signedAt`.** Rejected: the time would come from a system the companion cannot see, and two ports would stamp differently; core and companion both take time from `Clock`.
- **Verify a password inside the companion.** Rejected: the companion would hold credentials and become an identity system, which non-claim 3 rules out.
- **A no-op capture for development.** Rejected by [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md); the scripted fixture with a required `decide` serves tests.

## Consequences

**Positive**:

- Every signed binding has a manifestation and a recorded attestation of how the signer was re-identified.
- The time of signing comes from one clock under the user's control, consistent with core's records.

**Negative**:

- The value of a signature rests on the user's port; a port that sets `reauthenticated: true` without re-authenticating defeats the control ([RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009)).
- Clock accuracy is the user's ([BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md)).

**Trade-off accepted**: an attested, recorded re-authentication instead of a verified one, in exchange for keeping credentials and identity out of the companion.

## References

- Behaviours: [10 — Signature capture port](../behaviors/10-signature-capture-port.md), [11 — Signature linking](../behaviors/11-signature-linking.md)
- Invariants: [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
- Risks: [RSK-GX-009](../gxp/03-risk-assessment.md#rsk-gx-009), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
- Decisions: [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-015](../decisions/015-separation-of-duties.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [BEH-BR-209](../../core/behaviors/24-time-ids-and-sequence.md), [BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md)
- External: 21 CFR Part 11 §11.50, §11.200, §11.300.
