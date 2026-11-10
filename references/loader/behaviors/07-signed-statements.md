# 07 — Signed Statements

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-07                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.4 (2026-11-10): BEH-LD-056: digests in `LoaderGate`'s `exempt.digests` are not refused "verification-unknown"; wiring passes `pinned` to `RevokedDigests.layer` (L1) (SPEC-AUDIT-04) (CCR-LD-007)<br>0.3 (2026-11-09): "first-party" reserved for in-process eligibility (file 09, F-06); `Revocation.refusalList` built over the `RevokedDigests` view (M-06) (CCR-LD-004)<br>0.2 (2026-11-08): Round-2 agent review (R3-01, R3-02, R3-03, R3-14, R3-15, R3-16): `SignedStatement` envelope and the exact `id`/`version` convention and call shape for every reserved type; "chain-bundle" reserved; "revocation-list" verified only by the revocation source, with no step 5; `reverify` for statements accepted before a restart; statement-digest revocation reaches `refusalList`; publisher binding under composite rules; statement-digest revocation scope reworded (CCR-LD-003)<br>0.1 (2026-11-08): Initial draft (CCR-LD-003)                 |

---

Packages are not the only signed things a deployment needs to judge. A
federation of hosts signs the desired-state manifest it sends to its members;
reference data ships as a signed data pack ([08 — Data Packs](./08-data-packs.md));
a licence token is a signed claim; a revocation list is itself signed
([04](./04-revocation-and-kill-switch.md), BEH-LD-026). This file generalises
[03 — Signature Policy](./03-signature-policy.md) from one statement about a
package digest to a **statement of any type** about a subject digest, and names
the one step every caller uses to check one: `SignaturePolicy.verify`. It also
binds a manifest's `publisher` label to a verified signer, defines the signing
input that the developer-experience kit's `publish` and `countersign` commands
sign, and feeds the revocation set into core's `RefusalList`, so that a
revoked digest does not start again whatever starts it
([ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)).
This file owns BEH-LD-049–056 and uses all eight.

> **What this package does not do — and who does**
>
> The loader verifies statements against the trust configuration the
> application gives it. It does **not** decide what a statement means — what a
> licence entitles, which hosts a manifest addresses, what a data pack's rows
> say. Those are the readers' (the entitlement companion, the federation
> companion, the application). It does **not** hold signing keys: signing goes
> through a `StatementSigner` adapter wired by whoever signs
> (BEH-LD-054).

Planned source: `packages/loader/src/Statement.ts`,
`packages/loader/src/Verify.ts`, `packages/loader/src/RefusalList.ts`
*(Planned)*.

## BEH-LD-049: A statement has a type and a subject digest, and the type is signed

> **See:** [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md), [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043)

```ts
// illustrative — not type-checked
// Built-in statement types; any other non-empty string names an application's own type.
type StatementType = "package" | "first-party" | "host-manifest" | "data-pack" | "licence" | "revocation-list" | "chain-bundle" | (string & {})

interface Statement {
  readonly type: "bridger-statement-v1"
  readonly statementType: StatementType
  readonly subject: { readonly digest: string }   // "<alg>:<hex>" (01, BEH-LD-003)
  readonly id?: string                            // the subject's name, when it has one (manifest id, pack id, licence id)
  readonly version?: string                       // the subject's version or revision, when it has one
}
// Signed bytes: the DSSE pre-authentication encoding of payloadType
// "application/vnd.bridger.statement+json" and the RFC 8785 (JCS) canonical JSON of the statement.
// statementDigest = "sha256:" + hex(SHA-256(JCS(statement)))

type StatementSubject = { readonly digest: string } | { readonly bytes: Uint8Array }
// { bytes } → subject.digest = "sha256:" + hex(SHA-256(bytes)), computed by the loader

// The transport form of a signed thing that is not a package: the subject bytes exactly as
// signed, the statement's id and version in clear, and the signatures beside them.
interface SignedStatement {
  readonly statementType: StatementType
  readonly id?: string
  readonly version?: string
  readonly payload: Uint8Array                    // the subject bytes, exactly as signed
  readonly signatures: readonly Signature[]       // 03, BEH-LD-017: { scheme, keyHint?, bytes }
}
// JSON form: payload and Signature.bytes in base64url without padding; other fields as above.
```

```
REQUIREMENT: Every signature the loader evaluates MUST be verified over the
             canonical encoding of a `Statement` built by the loader from
             the statement type its caller names and from a subject digest
             the loader computed or was given by its caller — never over a
             statement supplied with the signature (03, BEH-LD-017 applies
             to every type).
```

```
REQUIREMENT: `statementType` MUST be part of the signed bytes. A signature
             made over a statement of one type MUST NOT count for a
             statement of another type, even when the subject digest, id
             and version are equal and the signature is cryptographically
             valid.
```

```
REQUIREMENT: The types "package", "first-party", "host-manifest",
             "data-pack", "licence", "revocation-list" and "chain-bundle" are
             reserved with the meanings of this specification: "package" for
             01 — Package and Digest, "first-party" for the in-process
             eligibility of a package (09, BEH-LD-065), "data-pack" for 08 —
             Data Packs, "revocation-list" for
             04 (BEH-LD-026), "host-manifest" for the federation companion's
             desired-state manifests, "licence" for licence tokens read by an
             entitlement adapter, "chain-bundle" for the audit-chain
             companion's verification bundles. Any other non-empty string
             MAY be used by an application; the loader MUST treat it as
             opaque.
```

```
REQUIREMENT: Every signer and every verifier of a reserved type MUST build
             the statement with exactly the subject, `id` and `version` of
             this table, so that one signature means one statement whoever
             checks it:

             | type            | subject                                   | id                                         | version                       |
             | --------------- | ----------------------------------------- | ------------------------------------------ | ----------------------------- |
             | package         | { digest }: package digest (01, BEH-LD-002) | manifest `id`                            | manifest `version`            |
             | first-party     | { digest }: package digest (01, BEH-LD-002) | manifest `id`                            | manifest `version`            |
             | data-pack       | { digest }: data-pack digest (08, BEH-LD-058) | manifest `id`                          | manifest `version`            |
             | host-manifest   | { bytes }: the manifest payload as signed | JCS of the JSON array [authority, host]    | revision (decimal, see below) |
             | revocation-list | { bytes }: the list payload as signed (04, BEH-LD-026) | the list's `issuer`           | revision (decimal, see below) |
             | chain-bundle    | { digest }: the bundle's `digest` (audit-chain BEH-AC-037) | JCS of the sorted JSON array of its series ids | the bundle's `createdAt` |
             | licence         | defined by the entitlement adapter that reads it; the loader fixes none |              |                               |

             A revision MUST be written as the decimal digits of the
             positive integer, with no sign, no leading zero and no
             separator ("42", never "042" or "4.2e1"). JCS is RFC 8785.
```

```
REQUIREMENT: A reader that receives a `SignedStatement` MUST pass the
             statement type its own code expects — never the envelope's
             `statementType` — and the envelope's `payload`, `id`, `version`
             and `signatures` unchanged; an envelope whose `statementType`
             differs from the expected one MUST be refused before `verify`
             is called. After `verify` accepts and the reader decodes the
             payload, the reader MUST refuse the payload when the `id` and
             `version` it derives from the decoded content by the table
             above differ from the envelope's. Bytes re-encoded from a
             decoded value MUST NOT be verified in place of the received
             payload.
```

```
REQUIREMENT: When the subject is given as `{ bytes }`, the loader MUST
             compute its digest itself, with SHA-256 over the bytes as
             given. When it is given as `{ digest }`, the digest MUST carry
             a supported algorithm prefix (01, BEH-LD-003) and the caller
             is responsible for having computed it from the bytes it
             judges.
```

The package statement of 03 is the instance with `statementType: "package"`,
the package digest as subject, and the manifest's id and version. Putting the
type inside what is signed is domain separation: without it, a publisher's
signature over a data pack's digest could be replayed as a signature over a
package that happens to have been given the same name, and a licence signer's
key would count towards a release policy that lists it for another purpose.

## BEH-LD-050: SignaturePolicy.verify is the one verification step for every statement

> **Invariant:** [INV-LD-008](../invariants.md#inv-ld-008-a-signature-counts-only-for-the-statement-type-it-was-made-for)
> **See:** [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043)

```ts
// illustrative — not type-checked
interface VerifyRequest {
  readonly statementType: StatementType
  readonly subject: StatementSubject
  readonly id?: string
  readonly version?: string
  readonly publisher?: string                  // the publisher the subject claims (BEH-LD-053)
  readonly signatures: readonly Signature[]    // 03, BEH-LD-017
  // A statement this reader accepted before a restart, verified again from what it saved
  // (08, BEH-LD-062): step 5 checks the held set's entries and does not apply maxAge.
  readonly reverify?: true
}
interface StatementVerification {
  readonly statementType: StatementType
  readonly subjectDigest: string
  readonly statementDigest: string
  readonly record: VerificationRecord          // BEH-LD-055
}
type VerifyError =
  | SignatureRejected | PublisherMismatch | StatementRevoked
  | RevocationUnavailable | RevocationStale | UnsupportedDigestAlgorithm | LoadLogFailed

declare const SignaturePolicy: {
  // ... pinned, signed, anyOf (03, BEH-LD-022)
  readonly verify: (request: VerifyRequest) => Effect.Effect<StatementVerification, VerifyError, StatementVerifier>
}
// The configured verifiers, rules and revocation source; provided by LoaderPlugin and by
// StatementVerifier.layer for processes that verify statements without loading code.
class StatementVerifier extends Context.Service<StatementVerifier, StatementVerifierShape>()("@bridger/loader/StatementVerifier") {}
declare const StatementVerifier: {
  readonly layer: (options: {
    readonly verifiers: readonly SignatureVerifierShape[]
    readonly rules: StatementRules                             // BEH-LD-051
    readonly revocation: { readonly maxAge: Duration.Input | "unbounded" }   // no default (04, BEH-LD-027)
  }) => Layer.Layer<StatementVerifier, never, RevocationSource | Clock>
}
```

```
REQUIREMENT: `SignaturePolicy.verify` MUST run these steps in this order,
             each completing before the next begins: (1) compute or check
             the subject digest (BEH-LD-049); (2) build the statement and
             its digest; (3) verify each signature with the verifier of its
             scheme and evaluate the acceptance rule of the statement type
             (03, BEH-LD-018–021; BEH-LD-051); (4) check the publisher
             binding (BEH-LD-053); (5) check the current revocation set
             (BEH-LD-052); (6) write the record (BEH-LD-055). A failure at
             any step MUST end the call with that step's error.
```

```
REQUIREMENT: Every caller MUST use this request shape, with `subject`,
             `id` and `version` as the table of BEH-LD-049 gives them for its
             type. For a `SignedStatement` the call is exactly
             `verify({ statementType: <expected type>, subject: { bytes:
             envelope.payload }, id: envelope.id, version: envelope.version,
             signatures: envelope.signatures })`. The federation companion's
             host-manifest check MUST be this call with `statementType:
             "host-manifest"`; no other request shape, field name or
             signature shape (such as `{ keyId, algorithm, value }`) is
             part of this API.
```

```
REQUIREMENT: With `reverify: true`, step 5 MUST check the held set's
             digests and signers exactly as for a new statement, MUST NOT
             fail with `RevocationStale` however old the set is, and MUST
             still fail with `RevocationUnavailable` when there is no set.
             The record MUST carry `reverified: true` and the held set's
             `issuedAt`. `reverify` MUST be used only to restore a statement
             that this process or its store accepted before; a statement
             seen for the first time MUST be verified without it.
```

```
REQUIREMENT: The type "revocation-list" is the one exception to this step.
             `StatementRules` MUST NOT hold a rule for it — a
             `StatementVerifier` constructed with one MUST be refused as the
             construction checks of 03 (BEH-LD-022) are — so `verify` with
             `statementType: "revocation-list"` always fails with
             `SignatureRejected` ("no-rule"). Revocation lists are verified
             only by the revocation source (04, BEH-LD-026), with steps 1–4
             and 6 of this function under the revocation trust root, and
             with no step 5. The two MUST share one implementation of steps
             1–4 and 6; there MUST be no second implementation of signature
             evaluation.
```

```
REQUIREMENT: The load pipeline (02, BEH-LD-009) MUST run its steps 4 and 5
             for a package through this same function, with
             `statementType: "package"`, the computed package digest, the
             manifest's id, version and `publisher`. For a package, a
             revocation MUST be reported as `Revoked` (04, BEH-LD-027);
             every other caller sees `StatementRevoked`. There MUST be no
             second implementation of signature evaluation in the
             package.
```

```
REQUIREMENT: The bounds and failure rules of 02 apply unchanged: steps 3–5
             are bounded by the `verify` timeout (02, BEH-LD-013); a
             verifier or revocation source that dies or times out MUST be
             a refusal; no failure MAY be read as an acceptance. A
             successful result MUST NOT be cached: each call verifies again
             (03, BEH-LD-024).
```

```
REQUIREMENT: `SignaturePolicy.verify` MUST NOT evaluate, decode or interpret
             the subject. It answers "the required signers signed a
             statement of this type about these bytes, and nothing revokes
             it"; what the bytes say is the caller's to read.
```

This is the named step the other companions cite. The developer-experience
kit's `publish` and `countersign` commands call it to report which signers a
package still needs ([kit 04 — Command line](../../kit/behaviors/04-cli.md));
the federation companion calls it with `statementType: "host-manifest"` and
the manifest's bytes before acting on a desired-state manifest; the data-pack
reader calls it with `"data-pack"` (08, BEH-LD-059). One function means one
place where thresholds, roles, validity windows, verifier timeouts and
revocation are applied — and one place to test.

Revocation lists cannot go through it. `verify` consults the current
revocation set at step 5, and a revocation list is what establishes that set:
checking a list against the set it is about to replace — or, at first boot,
against no set at all — would be circular, and so would a `StatementVerifier`
that needs a `RevocationSource` that needs a `StatementVerifier`. The list
therefore has its own trust root, given to the revocation source, and its own
monotonic revision in place of step 5 (04, BEH-LD-026;
[ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
records this as the one exception). The `reverify` flag exists for the opposite
problem: a reader restoring what it accepted yesterday must still honour every
revocation it holds, but must not lose its data because the device has been
offline longer than `maxAge`, which governs new acceptances only
(BEH-LD-056).

## BEH-LD-051: Each statement type has its own acceptance rule, and none has a default

> **Invariant:** [INV-LD-006](../invariants.md#inv-ld-006-no-load-without-an-explicit-acceptance-rule)
> **See:** [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md), [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043)

```ts
// illustrative — not type-checked
// One AcceptanceRule (03, BEH-LD-022) per statement type the deployment verifies.
type StatementRules = { readonly package?: AcceptanceRule } & { readonly [statementType: string]: AcceptanceRule }

const rules: StatementRules = {
  package: releasePolicy,                                   // publisher + independent reviewer
  "host-manifest": SignaturePolicy.signed(fleetPolicy),     // two of three fleet operators
  "first-party": SignaturePolicy.signed(inHousePolicy),     // the application's own release authority (09, BEH-LD-065)
  "data-pack": SignaturePolicy.signed(dataPolicy),          // the data publisher's key
  licence: SignaturePolicy.signed(licencePolicy)            // the licensing service's key
}
```

```
REQUIREMENT: `verify` for a statement type that has no rule MUST fail with
             `SignatureRejected` with reason "no-rule". There MUST be no
             fallback from one type's rule to another's, and no rule that
             applies to every type.
```

```
REQUIREMENT: Every rule MUST satisfy the construction checks of 03
             (BEH-LD-019, BEH-LD-022): no threshold of zero, no empty
             pinned list, no signer key or identity under two ids within
             one policy. A `pinned` rule for a type other than "package"
             pins subject digests of that type.
```

```
REQUIREMENT: The rules, their signers and every trusted root MUST be
             configuration given at construction (03, BEH-LD-023); changing
             any rule MUST require constructing a new `StatementVerifier`
             (or loader).
```

The same key may appear in two types' policies — a data publisher may also
publish plugins — but each policy counts it only for the type it governs
(BEH-LD-049). Separate rules keep a fleet operator, who signs host manifests,
from becoming a code signer by accident of configuration.

## BEH-LD-052: Revocation covers every statement, by subject digest, statement digest or signer

> **Invariant:** [INV-LD-004](../invariants.md#inv-ld-004-a-revoked-digest-is-never-newly-loaded)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
> **Risk:** [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044)

```ts
// illustrative — not type-checked
class StatementRevoked extends Schema.TaggedError<StatementRevoked>()("StatementRevoked", {
  statementType: Schema.String,
  subjectDigest: Schema.String,
  statementDigest: Schema.String,
  by: Schema.Literal("subject-digest", "statement-digest", "signer"),
  reason: Schema.String,
  revision: Schema.Number
}) {}
declare const Revocation: {
  // ... filterDesired (04, BEH-LD-028)
  // Pure: is this recorded verification revoked under this set? (re-evaluation as BEH-LD-030)
  readonly check: (record: VerificationRecord, set: RevocationSet, rule: AcceptanceRule) => Option.Option<StatementRevoked>
}
```

```
REQUIREMENT: A digest listed in a revocation set's `digests` (04,
             BEH-LD-025) MUST revoke every statement whose subject digest
             or statement digest equals it, whatever its type. Revoking a
             subject digest withdraws every statement about those bytes;
             revoking a statement digest withdraws every statement of that
             type, id and version about those bytes — including a
             byte-identical re-issue, which has the same statement digest —
             and leaves statements of another type, id or version about the
             same bytes standing.
```

```
REQUIREMENT: Revocation by statement digest MUST reach every place that
             revocation by subject digest reaches: `verify` (step 5),
             `Revocation.check`, `Revocation.filterDesired` and the kill
             switch (04, BEH-LD-028, BEH-LD-029), and `Revocation.refusalList`
             (BEH-LD-056). Where only a subject digest is at hand — a
             desired-list entry's `meta.digest`, core's `RefusalSubject` —
             the statement digest MUST be taken from the digest's
             `AcceptedDigests` record (`statementDigest`, BEH-LD-055).
```

```
REQUIREMENT: A revoked signer (04, BEH-LD-025) MUST withdraw a statement of
             any type exactly as BEH-LD-030 withdraws a package: by
             re-evaluating the type's rule from the recorded verified
             signers minus the revoked ones, at the time recorded at
             acceptance, with no clock read.
```

```
REQUIREMENT: `Revocation.check` MUST be pure and total. Readers that hold a
             verified statement past the call that verified it — a data
             pack served for days, a licence cached by an entitlement
             adapter, a host manifest applied by a federation member — MUST
             be able to re-check it on every revocation change from its
             record alone, without its signatures.
```

```
REQUIREMENT: The kill switch (04, BEH-LD-029) acts on packages only.
             Withdrawing any other statement is its reader's job;
             `StatementRevoked` and `Revocation.check` are how the loader
             tells it.
```

One revocation channel for every signed thing means one key ceremony, one
`maxAge` decision and one store across restarts. The cost is that a
revocation list now speaks for more than code; the threshold recommendation of
BEH-LD-032 and the anti-rollback rule of BEH-LD-026 apply to it with that
weight.

## BEH-LD-053: The manifest publisher must match a verified signer

> **See:** [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241)
> **Risk:** [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043), [RSK-BR-027](../../core/gxp/03-risk-assessment.md#rsk-br-027)

```ts
// illustrative — not type-checked
interface TrustedSigner {
  // ... id, scheme, key, identity, roles, validFrom, validUntil (03, BEH-LD-019)
  readonly publishers?: readonly string[]      // publisher names this signer may vouch for; configuration
}
class PublisherMismatch extends Schema.TaggedError<PublisherMismatch>()("PublisherMismatch", {
  statementType: Schema.String,
  digest: Schema.String,
  publisher: Schema.String,
  signers: Schema.Array(Schema.String)         // ids of the verified signers, none of which matched
}) {}
```

```
REQUIREMENT: When the request carries a `publisher` — for a package, the
             manifest's `publisher` label (core BEH-BR-241); for a data
             pack, its manifest's `publisher` (08, BEH-LD-057) — and the
             statement was accepted by a `signed` rule, at least one
             verified signer within its validity window and not revoked
             MUST either list that exact string in `publishers` or have an
             `identity` equal to it. Otherwise `verify` MUST fail with
             `PublisherMismatch`, and a load MUST evaluate nothing.
```

```
REQUIREMENT: Under a composite rule (`anyOf`, 03, BEH-LD-022) the branches
             MUST be tried in rule order, and the statement is accepted by
             the first branch that is satisfied. When that branch is
             `signed`, the binding MUST be checked against that branch's
             verified signers only, and a `PublisherMismatch` MUST end the
             call: a later `pinned` or `signed` branch MUST NOT be tried
             after it. When that branch is `pinned`, the rule below applies
             even if a later `signed` branch would also be satisfied.
             `acceptedBy` and `publisherBound` MUST describe that one
             branch.
```

```
REQUIREMENT: When the statement was accepted by a `pinned` rule, no signer
             vouches for the label: the record MUST carry
             `publisherBound: false`, and every loader view that shows the
             publisher (the catalog, 05, BEH-LD-040; data-pack status,
             08) MUST present it as unbound, never as the publisher.
```

```
REQUIREMENT: The comparison MUST be exact (code-point equality after
             Unicode NFC normalisation of both strings), and `publishers`
             MUST come from configuration only (03, BEH-LD-023), never from
             a package, a catalog entry or a signature.
```

Core carries `publisher` as a label it never interprets, and a marketplace
view shows it. Without this rule, anyone whose key satisfies the policy can
publish under another publisher's name; with it, the name shown is one the
application's trust configuration says that signer may use. A re-evaluation
after a signer revocation (BEH-LD-052) re-checks the binding: a package whose
only matching signer is revoked fails it.

## BEH-LD-054: Signing input and countersigning add signer entries without changing the digest

> **Invariant:** [INV-LD-003](../invariants.md#inv-ld-003-a-stamped-digest-is-the-verified-package-digest)
> **See:** [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md), [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043)

```ts
// illustrative — not type-checked
declare const Statement: {
  readonly make: (request: { readonly statementType: StatementType; readonly subject: StatementSubject;
                             readonly id?: string; readonly version?: string }) =>
    Effect.Effect<Statement, UnsupportedDigestAlgorithm>
  readonly signingInput: (statement: Statement) => Uint8Array     // the DSSE pre-authentication encoding (BEH-LD-049)
  readonly digest: (statement: Statement) => string               // statementDigest
}
// Port: whoever signs wires an adapter (a KMS, a hardware token, a Sigstore keyless flow).
// The caller hands over the signing input and receives a Signature; it never sees key material.
interface StatementSignerShape {
  readonly scheme: string
  readonly sign: (signingInput: Uint8Array) => Effect.Effect<Signature, SigningFailed>
}
class SigningFailed extends Schema.TaggedError<SigningFailed>()("SigningFailed", {
  scheme: Schema.String,
  message: Schema.String
}) {}
```

```
REQUIREMENT: `Statement.signingInput` and `Statement.digest` MUST be pure
             functions of the statement, identical to what `verify` builds
             for the same request, so that a signature made over the
             signing input of `Statement.make(request)` is one that
             `verify(request)` evaluates.
```

```
REQUIREMENT: Signatures MUST travel beside the subject — in a catalog entry
             (05, BEH-LD-033), a publish target, a federation envelope —
             and MUST NOT be an input of any digest. Adding a signature to
             a package or data pack MUST NOT change its bytes, its
             sub-digests or its digest.
```

```
REQUIREMENT: A countersignature is one more `Signature` over the same
             statement (same type, subject digest, id and version) by a
             signer entry not already among those whose signatures verify.
             Two signatures that verify to the same signer entry MUST count
             once (03, BEH-LD-020); a countersignature over a different
             statement MUST count for nothing.
```

```
REQUIREMENT: `@bridger/loader` MUST NOT ship a `StatementSigner` adapter
             that reads a private key from a file, an environment variable
             or configuration of the loader, and no loader component MAY
             receive, store or log key material. A `StatementSigner` that
             fails MUST fail with `SigningFailed`, carrying no key
             material.
```

This is the signing step the kit's `publish` and `countersign` commands call:
they build the statement with `Statement.make`, hand its signing input to the
signer adapter the person signing has wired, append the result to the
signatures that travel with the package, and call `verify` to report what the
policy still needs. Because signatures sit outside the digest, a reviewer
countersigns a release days after the publisher without the package, its
catalog entry digest or any stamp changing.

## BEH-LD-055: Every statement verification is recorded

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```ts
// illustrative — not type-checked
interface VerificationRecord {
  // ... digest, id, version, at, policyId, signers, acceptedBy, revocationRevision, outcome (02, BEH-LD-016)
  readonly statementType: StatementType          // "package" for loads and catalog entries
  readonly statementDigest?: string              // present once the statement was built (step 2 of verify)
  readonly publisher?: string                    // the publisher the request carried
  readonly publisherBound?: boolean              // present with publisher once step 4 of verify was reached
  readonly reverified?: true                     // a restore under `reverify` (BEH-LD-050)
  readonly revocationIssuedAt?: string           // the held set's issuedAt, with reverified
}
```

```
REQUIREMENT: When `LoadLog` is wired (02, BEH-LD-016), every `verify` call
             that reaches step 2 MUST produce one record, accepted or
             refused, with the fields of BEH-LD-016 and those above present
             exactly when the step producing them was reached. A call whose
             `accepted` record cannot be written MUST fail with
             `LoadLogFailed`, so that no reader acts on an acceptance that
             was not recorded.
```

```
REQUIREMENT: Records of statement types other than "package" MUST NOT be
             entered in `AcceptedDigests` (02, BEH-LD-015): only packages
             are installed through the host, and only their digests are
             judged by `LoaderGate`.
```

`digest` in the record is the subject digest, so the join with core's records
(06, BEH-LD-044) is unchanged for packages, and a reviewer can find every
statement the loader accepted about any bytes by one field.

## BEH-LD-056: The revocation set feeds core's RefusalList

> **Invariant:** [INV-LD-004](../invariants.md#inv-ld-004-a-revoked-digest-is-never-newly-loaded)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-BR-053](../../core/decisions/053-refusal-list.md)
> **Core seam:** [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-267), [02 — Host construction](../../core/behaviors/02-host-construction.md) (BEH-BR-012)
> **Satisfies:** [URS-BR-053](../../core/urs.md#urs-br-053-keep-a-revoked-plugin-version-from-running-again-whatever-starts-it)
> **Risk:** [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044), [RSK-BR-061](../../core/gxp/03-risk-assessment.md#rsk-br-061)

```ts
// illustrative — not type-checked
declare const Revocation: {
  // ... filterDesired, check
  // Core's RefusalList (BEH-BR-267) backed by the loader's revocation set, read through the
  // RevokedDigests view (09, BEH-LD-070), which the remote boundary also reads.
  readonly refusalList: Layer.Layer<RefusalList, never, RevokedDigests>
}
// Wiring: built before the host with the other shared services and handed over as a Context base.
const shared = yield* Layer.build(
  Layer.provideMerge(Revocation.refusalList,
    Layer.provideMerge(RevokedDigests.layer({ pinned }), Layer.merge(AcceptedDigests.layer, revocations))))
// pinned: the package rule's pinned digests plus LoaderGate's exempt.digests (09, BEH-LD-070).
```

```
REQUIREMENT: `Revocation.refusalList` MUST provide core's `RefusalList`
             whose `refused(subject)` returns `Some(reason)` exactly when
             `subject.digest` is revoked under the newest revocation set
             the layer has received — by digest, by the `statementDigest`
             of the digest's `AcceptedDigests` record (BEH-LD-052), or by
             signer through the re-evaluation of BEH-LD-030 over that
             record — and `None` otherwise. The reason MUST name the cause
             and the revision, for example "revoked by digest (revision
             42): <reason>" or "revoked by statement digest (revision 42):
             <reason>". Core submits only the definition's own digest
             (core BEH-BR-267); mapping it to the statement digests recorded
             for it is the loader's. A digest with no `AcceptedDigests`
             record cannot match a statement-digest entry and is refused by
             its own digest, or with "verification-unknown" under the rule
             below.
```

```
REQUIREMENT: `refused` MUST be synchronous and pure, as core requires: it
             MUST answer from the `RevokedDigests` view (09, BEH-LD-070),
             which computes the set of refused digests when a revocation set
             arrives and when `AcceptedDigests` changes. It MUST NOT read the
             source, the store or `Clock` inside `refused`, and the loader
             MUST NOT compute the refused set a second time for it.
```

```
REQUIREMENT: When a signer is revoked and a digest submitted to `refused`
             has no `AcceptedDigests` record, the layer MUST refuse it with
             reason "verification-unknown", unless the digest is pinned by
             the package rule or listed in `LoaderGate`'s `exempt.digests`
             (02, BEH-LD-015) — the `pinned` list the view is built with and
             `filterDesired` applies (04, BEH-LD-028; 09, BEH-LD-070). A
             bundled plugin exempt by digest has no record and would
             otherwise go `disabled` after any signer revocation.
```

```
REQUIREMENT: The layer MUST require the `RevokedDigests` view, whose
             construction reads the current set (which loads and
             re-verifies the last saved list first, 04, BEH-LD-026) and
             fails with `RevocationUnavailable` when there is none (09,
             BEH-LD-070), so that a host is never built with a refusal list
             that has not yet heard of earlier revocations. Documentation MUST state
             that `maxAge` governs new loads only: an old set does not
             refuse the start of a digest it does not list.
```

```
REQUIREMENT: Documentation MUST state the division of work: the refusal
             list keeps a revoked digest from entering `starting` — a
             dependency's return, a lazy trigger, a background restart, a
             child mount, an operator `enable` or `restart` (core
             BEH-BR-267) — and leaves an `active` plugin running; the kill
             switch (04, BEH-LD-029) removes running plugins. A deployment
             that wants both wires both.
```

Before core had a refusal list, the loader could refuse operator calls that
restarted a revoked digest but not the system transitions that did the same
(02, BEH-LD-015). With the list wired, a revoked registration that would start
for any cause becomes `disabled` with reason "refused-digest" and a
`start-refused` record instead (core BEH-BR-267); a lazy plugin whose digest
is refused is not triggered at all. `LoaderGate` keeps refusing those operator
calls, so a deployment without the list keeps the protection it had.

**Settled here.** (1) Every signed thing is a typed statement about a subject
digest, and the type is signed. (2) `SignaturePolicy.verify` is the one
verification step, used by the load pipeline, the catalog, data packs and
other companions. (3) Each statement type has its own rule, with no fallback.
(4) Revocation covers subject digests, statement digests and signers for every
type; readers re-check from records with `Revocation.check`. (5) A manifest's
`publisher` is accepted only when a verified signer is configured for it. (6)
Signatures sit outside every digest; countersigning appends a signer entry;
signing goes through an adapter the loader never sees inside. (7) The
revocation set backs core's `RefusalList`, statement digests included,
through the one `RevokedDigests` view (09, BEH-LD-070). (8)
Each reserved type has one fixed subject, `id` and `version` convention and one
call shape; a `SignedStatement` carries the payload as signed, and readers
compare the decoded id and version with the envelope's. (9) Revocation lists
are the one type `verify` does not check; the revocation source checks them
under its own trust root with no step 5. (10) A restore after restart uses
`reverify`: held revocations apply, `maxAge` does not.

**Open.** (1) Whether a licence statement needs fields beyond the subject
digest, id and version (an audience, an expiry) inside the signed statement,
or whether those belong in the licence bytes, read by the entitlement adapter.
(2) Whether a statement should carry an issuance nonce, so that revoking one
issuance by statement digest never revokes a byte-identical re-issue of the
same type, id and version (today it does, BEH-LD-052).

---

_Previous: [06 — Limits and Acceptance](./06-limits-and-acceptance.md)_ · _Next: [08 — Data Packs](./08-data-packs.md)_
