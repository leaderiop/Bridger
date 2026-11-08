# 03 — Signature Policy

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-03                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.2 (2026-11-08): Sigstore offline verification checks the log's signed checkpoint or entry timestamp against a pinned log key and uses its time; signers carry a scheme-defined `identity` used by revocation lists; re-evaluation uses the acceptance time; double signing means two distinct signer entries, not two people (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

A digest says which bytes were loaded; it does not say who vouched for them.
This file specifies what is signed (a statement binding a package digest to an
id and a version), how signatures are checked (verifier adapters, one per
scheme: Ed25519 with pinned keys, Sigstore with pinned identities), and how
the application states whose signatures it requires: a `SignaturePolicy` of
N-of-M signers, optionally by role, which is how double signing — a publisher
and an independent reviewer — is expressed
([ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)).
This file owns BEH-LD-017–024 and uses all eight.

> **What this package does not do — and who does**
>
> The loader checks signatures against keys and identities the application
> gives it. It does **not** distribute or rotate trust roots, run a signing
> service, operate a transparency log, or decide who may sign. A signature
> policy is the application's statement of whom it trusts; the loader only
> applies it.

Planned source: `packages/loader/src/Signature.ts`,
`packages/loader/src/Policy.ts`, adapters
`packages/loader-ed25519/src/index.ts` and
`packages/loader-sigstore/src/index.ts` *(Planned)*.

## BEH-LD-017: What is signed is a statement about a package digest

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md), [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface PackageStatement {
  readonly type: "bridger-package-statement-v1"
  readonly digest: string          // the package digest (01, BEH-LD-002)
  readonly id: string              // manifest id
  readonly version: string         // manifest version
}
// The signed bytes are the RFC 8785 (JCS) canonical JSON of the statement,
// wrapped as a DSSE envelope with payloadType "application/vnd.bridger.package-statement+json".
interface Signature {
  readonly scheme: string          // "ed25519" | "sigstore" | an adapter's own scheme name
  readonly keyHint?: string        // advisory; never used to decide trust
  readonly bytes: Uint8Array       // the scheme's signature or bundle
}
```

```
REQUIREMENT: A signature MUST be verified over the canonical encoding of a
             `PackageStatement` built by the loader from the package it
             computed — its own digest, and the manifest's id and version —
             never over a statement supplied with the signature.
```

```
REQUIREMENT: A signature over a statement whose `digest`, `id` or `version`
             differs from the loaded package's MUST NOT count, even when it
             is cryptographically valid.
```

Binding id and version, not only the digest, stops a valid signature from
being replayed under another name: a reviewer who signed "report-export
1.4.0" did not sign the same bytes published as something else. Building the
statement from what the loader computed, rather than accepting one, means a
forged statement cannot even be presented.

## BEH-LD-018: Verifiers are adapters, one per scheme

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface SignatureVerifierShape {
  readonly scheme: string
  readonly verify: (statementBytes: Uint8Array, signature: Signature, trusted: readonly TrustedSigner[]) =>
    Effect.Effect<VerifiedSigner, SignatureInvalid>
}
interface VerifiedSigner {
  readonly signerId: string        // the TrustedSigner.id the signature verified against
  readonly scheme: string
  readonly signedAt?: string       // only when the scheme supplies a timestamp it verified (e.g. a log inclusion time)
}
```

```
REQUIREMENT: A verifier MUST return a `VerifiedSigner` only when the
             signature verifies against exactly one of the trusted signers
             of its scheme passed to it. It MUST NOT trust keys or
             identities carried in the signature itself.
```

```
REQUIREMENT: The Ed25519 adapter MUST verify against public keys pinned in
             the policy (RFC 8032, pure Ed25519). The Sigstore adapter MUST
             verify the certificate chain to a pinned trusted root, MUST
             match the certificate identity (issuer and subject) to a pinned
             identity, and MUST require transparency-log evidence carried in
             the bundle, so that it can verify offline: an inclusion proof
             together with a signed checkpoint, or a signed entry timestamp
             (SET), whose signature it MUST verify against a log public key
             pinned in the policy. An inclusion proof without a verified
             checkpoint or SET MUST NOT count.
```

```
REQUIREMENT: The Sigstore adapter MUST check the certificate's validity
             window against the log's integrated time taken from the
             verified checkpoint or SET — never against the time read from
             `Clock`, since signing certificates are valid for minutes — and
             MUST report that time as `signedAt`.
```

```
REQUIREMENT: The loader MUST select the verifier by `signature.scheme`. A
             signature whose scheme has no wired verifier MUST be ignored
             (it counts for nothing), and the policy result MUST report it.
```

Keeping schemes behind adapters keeps the policy logic — counting distinct
trusted signers — free of cryptography and identical for every scheme. A
terminal that is offline for days can still verify a Sigstore bundle, because
the log evidence travels with the bundle; the inclusion proof is worth
something only because the checkpoint or timestamp it leads to is signed by a
log key the application pinned, and that signed time is what places a
short-lived certificate inside its window. The terminal cannot check whether a
certificate was later revoked, which is what 04 — Revocation and Kill Switch
is for.

## BEH-LD-019: Trusted signers have ids, roles and validity windows

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface TrustedSigner {
  readonly id: string                       // unique within the policy; a local name
  readonly scheme: string
  readonly key: unknown                     // scheme-specific: a public key, or { issuer, subject }
  // Scheme-defined, configuration-independent name of the key or identity, computed by the
  // verifier adapter from `key`: "ed25519:sha256:<hex of the raw public key>",
  // "sigstore:<issuer>|<subject>". Revocation lists name signers by it (04, BEH-LD-025).
  readonly identity: string
  readonly roles: readonly string[]         // opaque to the loader, e.g. ["publisher"], ["reviewer"]
  readonly validFrom?: string               // ISO-8601 UTC
  readonly validUntil?: string
}
```

```
REQUIREMENT: Signer ids MUST be unique within a policy, and the same key or
             identity MUST NOT appear under two ids. A policy that breaks
             either rule MUST be refused when the loader is constructed.
```

```
REQUIREMENT: Each verifier adapter MUST define how `identity` is computed
             from `key` for its scheme, and the loader MUST compute it at
             construction, never accept it from configuration. Two signers
             with the same `identity` are the same key or identity under the
             previous requirement.
```

```
REQUIREMENT: A signer's validity window MUST be checked against the
             verifier's `signedAt` when present, and otherwise against the
             time read from `Clock` at step 4. A signature outside its
             signer's window MUST NOT count. When a policy is re-evaluated
             later from a verification record (04, BEH-LD-030), the window
             MUST be checked against the same time as at acceptance — the
             signer's recorded `signedAt`, otherwise the record's `at` —
             so that a window that closes after acceptance never withdraws
             a package by itself.
```

Roles are opaque labels the application chooses; the loader never knows what
"reviewer" means, only that the policy asks for one. The uniqueness rule
matters for counting: a key listed twice would let one signature satisfy a
threshold of two.

## BEH-LD-020: A policy is a threshold over distinct signers, composable by role

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
type Requirement =
  | { readonly threshold: number }                                   // any N of the policy's signers
  | { readonly role: string; readonly threshold: number }            // N signers holding the role
  | { readonly allOf: readonly Requirement[] }                       // every branch, by distinct signers
interface SignaturePolicy {
  readonly id: string
  readonly signers: readonly TrustedSigner[]
  readonly require: Requirement
}
// Double signing: a publisher and an independent reviewer
const releasePolicy: SignaturePolicy = {
  id: "release-v1",
  signers: [/* … */],
  require: { allOf: [{ role: "publisher", threshold: 1 }, { role: "reviewer", threshold: 1 }] }
}
```

```
REQUIREMENT: The policy MUST be satisfied when there is an assignment of
             verified signers to the requirement in which every threshold is
             met and no signer is counted more than once across the whole
             requirement, including across the branches of an `allOf`.
```

```
REQUIREMENT: Two signatures that verify to the same `signerId` MUST count
             as one signer.
```

```
REQUIREMENT: Policy evaluation MUST be a pure function of the policy, the
             list of `VerifiedSigner` values and the time used for validity
             windows (BEH-LD-019: at step 4, `signedAt` or `Clock`; at
             re-evaluation, the time recorded at acceptance). It MUST NOT
             perform I/O.
```

```
REQUIREMENT: The `VerificationRecord` (02, BEH-LD-016) MUST list every
             verified signer, not only those the assignment used, so that the
             policy can be re-evaluated later without the signatures
             (04, BEH-LD-030).
```

"No signer counted twice across branches" is what makes double signing mean
two distinct signer entries: a signer entry that holds both the publisher and
the reviewer role cannot satisfy both branches alone. It does not make them
two people. One person can hold two keys, or two Sigstore identities, listed
under two ids; that the entries of a policy belong to different people is the
application's trust configuration and key custody
([RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043)), which the
loader cannot check. Re-evaluation from recorded signers is what lets the revocation
of one signer's key withdraw exactly the packages that depended on it.

## BEH-LD-021: A rejected policy explains itself

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
class SignatureRejected extends Schema.TaggedError<SignatureRejected>()("SignatureRejected", {
  digest: Schema.String,
  policyId: Schema.String,
  reason: Schema.Literal("unsatisfied", "verifier-timeout", "verifier-defect", "policy-invalid"),
  verified: Schema.Array(Schema.String),     // signer ids that verified
  ignored: Schema.Number,                     // signatures with no verifier or no trusted match
  missing: Schema.String                      // human-readable: which branch was not met
}) {}
```

```
REQUIREMENT: When the policy is not satisfied, the load MUST fail with
             `SignatureRejected`, naming the signers that verified, the
             number of signatures that counted for nothing, and the first
             unmet branch.
```

```
REQUIREMENT: `SignatureRejected` MUST NOT carry signature bytes, keys or
             certificate contents.
```

An operator whose terminal refuses an update needs to know whether the review
signature is missing or the publisher's key expired; "signature invalid" tells
neither.

## BEH-LD-022: There is no default policy, and no policy that accepts everything

> **Invariant:** [INV-LD-006](../invariants.md#inv-ld-006-no-load-without-an-explicit-acceptance-rule)
> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
declare const SignaturePolicy: {
  // No signatures: accept only these package digests, listed by the application.
  readonly pinned: (options: { readonly id: string; readonly digests: readonly string[] }) => AcceptanceRule
  readonly signed: (policy: SignaturePolicy) => AcceptanceRule
  // Either a pinned digest or the signed policy.
  readonly anyOf: (...rules: readonly AcceptanceRule[]) => AcceptanceRule
}
```

```
REQUIREMENT: Constructing the loader MUST require an `AcceptanceRule`.
             `@bridger/loader` MUST NOT export a rule, helper or example that
             accepts a package without either a pinned digest or a satisfied
             signature policy — no "allow all", no "development mode", no
             threshold of zero.
```

```
REQUIREMENT: A `pinned` rule MUST accept only the exact digests listed. A
             threshold of zero, an empty signer list with a non-zero
             threshold, or an empty pinned list MUST be refused when the
             loader is constructed.
```

The reasoning is core's, for its gate ([ADR-BR-032](../../core/decisions/032-operation-gate.md)):
a shipped permissive rule is a control that does nothing and looks like one.
Local development still works — the developer pins the digest of the build
they just produced, which the CLI of the developer-experience kit can do for
them — and the deployment visibly does or does not require signatures.

## BEH-LD-023: Trust roots come from the application, not from packages

> **See:** [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: The policy, its signers and the Sigstore trusted root MUST be
             supplied to the loader as configuration at construction. The
             loader MUST NOT read trust material from a package, a catalog
             entry, a fetcher response or a revocation list.
```

```
REQUIREMENT: Changing the policy MUST require constructing a new loader (in
             a host, replacing the plugin that provides it). The loader
             MUST NOT change its policy while running.
```

A trust root fetched from the place it is meant to judge judges nothing.
Rotating keys is therefore an ordinary change to the application's
configuration, which on a Bridger host goes through `replace` or `reconcile`
— attributed, gated and audited by core.

## BEH-LD-024: Signature checks are part of every load, cached by nothing

> **Invariant:** [INV-LD-001](../invariants.md#inv-ld-001-no-code-is-evaluated-before-its-digest-and-signatures-are-accepted)
> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: Step 4 MUST verify the signatures and evaluate the policy on
             every `load`, including loads of a digest already resident
             (02, BEH-LD-012). A previous acceptance MUST NOT be reused as a
             substitute.
```

```
REQUIREMENT: A verifier MAY cache work that does not depend on time or
             trust (for example a parsed certificate), but MUST re-check
             validity windows and the pinned roots on every call.
```

Signatures do not change, but the judgement of them does: a signer's window
closes, a policy is replaced, a key is revoked. Re-checking on every load keeps
an earlier acceptance from outliving the reasons for it.

**Settled here.** (1) The signed object is a statement the loader builds from
what it computed; signatures over anything else do not count. (2) Distinct
signer entries are counted across the whole requirement, so double signing
requires two signer entries; that they are two people is the application's
configuration. (3) There is no permissive rule; unsigned loading is digest
pinning. (4) Trust roots are configuration, changed only by replacing the
loader.

**Open.** (1) Whether to support TUF-style signed trust-root updates, so that
a deployment can rotate roots without a configuration change, or leave that to
the application's own update channel. (2) Whether the transparency-log check
should be a separate requirement kind (inclusion in a named log) rather than a
property of the Sigstore adapter.

---

_Previous: [02 — Load Pipeline](./02-load-pipeline.md)_ · _Next: [04 — Revocation and Kill Switch](./04-revocation-and-kill-switch.md)_
