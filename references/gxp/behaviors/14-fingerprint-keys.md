# 14 — Fingerprint Keys

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-14                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

A fingerprint is only as good as the key behind it ([13 — Config Fingerprints](./13-config-fingerprints.md)).
The companion holds no key: it asks a caller-supplied provider for the
current key when it fingerprints, and for a named key when it compares. This
file defines that provider port, the key identifiers carried inside every
fingerprint, what rotation does to outstanding tickets, how a retired key
stays usable for comparison, the comparison function itself, and the rule
that key material appears in no output
([ADR-GX-019](../decisions/019-key-provider-and-rotation.md)). This file owns BEH-GX-105–112 and uses all eight.

> **What the companion does not do — and who does**
>
> The companion does not generate, store, back up, rotate, retire, destroy
> or protect keys, and cannot tell a well-kept key from a leaked one. Key
> custody, the rotation schedule, the retention of retired keys for as long
> as fingerprints made with them are kept, and the response to a
> compromise are the consumer's obligation.

Planned source: `packages/gxp/src/fingerprints/FingerprintKeys.ts` and
`packages/gxp/src/fingerprints/matchesFingerprint.ts` *(Planned)*.

## BEH-GX-105: The FingerprintKeyProvider port returns the current key and any key by id, and has no default

> **Invariant:** [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys)
> **Risk:** [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
> **Regulatory:** supports EU GMP Annex 11 §12.1 (as the seam for the consumer's key management)

```ts
// illustrative — not type-checked
interface FingerprintKey {
  readonly keyId: string                  // BEH-GX-106
  readonly key: CryptoKey                 // WebCrypto, algorithm { name: "HMAC", hash: "SHA-256" }, usage "sign"
}

interface FingerprintKeyProviderShape {
  readonly manifest: {
    readonly name: string
    readonly version: string
    readonly custodian: string            // declared key custody, e.g. "site KMS, security team"
    readonly fixture?: true               // testing entry point only (BEH-GX-145)
  }
  readonly current: Effect.Effect<FingerprintKey, FingerprintKeyUnavailable>
  readonly byId: (keyId: string) => Effect.Effect<Option.Option<FingerprintKey>, FingerprintKeyUnavailable>
}
class FingerprintKeyProvider extends Context.Service<FingerprintKeyProvider, FingerprintKeyProviderShape>()("@bridger/gxp/FingerprintKeyProvider") {}

class FingerprintKeyUnavailable extends Schema.TaggedError<FingerprintKeyUnavailable>()("FingerprintKeyUnavailable", {
  keyId: Schema.optional(Schema.String),
  reason: Schema.Literal("unavailable", "timeout", "malformed"),
  message: Schema.String                  // fixed template; never the provider's text
}) {}
```

```
REQUIREMENT: The main entry point MUST NOT export a `FingerprintKeyProvider`:
             no generated, constant, environment-variable or file-based key
             provider. `testKeyProvider(seed)` exists only in
             `@bridger/gxp/testing` (BEH-GX-150).
```

```
REQUIREMENT: The companion MUST accept from the provider only a `CryptoKey`
             whose algorithm is HMAC with SHA-256 and whose usages include
             "sign"; any other answer, a missing `keyId` or a key id outside
             the pattern of BEH-GX-106 MUST be treated as
             `FingerprintKeyUnavailable` "malformed". The companion MUST NOT
             call `exportKey` or read key bytes by any other means.
```

```
REQUIREMENT: `manifest` MUST be a constant readable without I/O, and
             `custodian` MUST be non-blank; the installation checks print it
             and refuse a provider marked `fixture: true` (BEH-GX-118).
```

A `CryptoKey` lets the companion compute an HMAC without ever holding the
key's bytes in a form it could print: the provider may and should create the
key non-extractable, inside a KMS-backed or platform key store, and hand over
only the handle. The port has two methods because fingerprinting and
comparing need different keys — the newest, and whichever made the
fingerprint in front of the reader.

## BEH-GX-106: Every fingerprint names its key, and the "test:" key ids belong to fixtures

> **Invariant:** [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-024](../decisions/024-fixtures-are-marked.md)
> **Satisfies:** [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys)
> **Risk:** [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)
> **Regulatory:** supports EU GMP Annex 11 §4.4 (a stated configuration); 21 CFR 11.10(e)

```
REQUIREMENT: A key id MUST match `^[A-Za-z0-9._:-]{1,64}$` and MUST appear,
             unchanged, in every fingerprint made with that key
             (BEH-GX-099). The fingerprinter MUST fail with
             `ConfigFingerprintFailed` "key-id-invalid" for any other id.
```

```
REQUIREMENT: Key ids beginning with "test:" MUST be reserved for fixtures. A
             provider whose manifest lacks `fixture: true` and whose
             `current` answers such an id MUST make the fingerprinter fail
             with "test-key-without-fixture"; a provider marked as a fixture
             MUST answer only such ids.
```

```
REQUIREMENT: Documentation MUST state that a key id must never be reused for
             different key material, since a fingerprint names its key by id
             alone. The companion cannot detect reuse. This is the consumer's
             obligation.
```

The key id is how a fingerprint read years later finds the key that can
compare it, and how a reviewer sees, record by record, when a rotation took
effect. The "test:" prefix makes a fixture key visible in every fingerprint
it produced: a record carrying `fp1:hmac-sha256:test:…` came from a test
key, wherever it is found.

## BEH-GX-107: The current key is read once per call, and a provider failure fails the call

> **Invariant:** [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(e)

```
REQUIREMENT: `fingerprint` and `proposeFingerprints` MUST call `current`
             exactly once per call and use that key for every entry of the
             call, so that one call never mixes keys. The companion MUST NOT
             keep a key from one call to the next; a provider MAY cache
             internally.
```

```
REQUIREMENT: A failure, defect or malformed answer of `current` MUST fail the
             call with `ConfigFingerprintFailed` "key-unavailable" (or
             "key-id-invalid", "test-key-without-fixture" as BEH-GX-106
             states). Core then fails the operation with
             `ConfigFingerprintUnavailable` and changes nothing
             (BEH-BR-188); the companion MUST NOT retry `current` within the
             call.
```

```
REQUIREMENT: The time `current` takes MUST count against core's
             `fingerprintTimeout` (default 5 seconds). The companion MUST NOT
             add a timeout of its own that is longer.
```

Reading the key per call is what makes a rotation take effect at the next
call, everywhere, without restarting the host. A provider that is slow on
every call makes every configuration change slow or failed, and that is
visible in the calls themselves ([RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024) concerns what the port
does with values; this behaviour concerns only whether it answers).

## BEH-GX-108: Retired keys stay available for comparison, and an unavailable key is reported as such

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)
> **Regulatory:** supports EU GMP Annex 11 §7.1, §17 (comparability through the retention period); 21 CFR 11.10(c)

```
REQUIREMENT: `byId(keyId)` MUST return the key for every id the provider has
             ever issued as current and not destroyed, whether or not it is
             still current. It MUST return None only for an id it does not
             hold.
```

```
REQUIREMENT: A comparison whose key `byId` returns None MUST answer
             "key-retired-unavailable" (BEH-GX-110), never "match" and never
             "no-match". A report or rendering MUST show it as that answer.
```

```
REQUIREMENT: Documentation MUST state that a key must be retained, usable
             through `byId`, for as long as records, tickets or archives
             holding fingerprints made with it are retained, and that
             destroying it makes those fingerprints permanently
             uncomparable. This is the consumer's obligation.
```

A trail is kept for years and keys are rotated far more often. If a retired
key disappeared, every fingerprint it made would turn from evidence of a
value into an opaque string. "Key unavailable" is reported as its own answer
so that the loss of a key is never read as a value that changed.

## BEH-GX-109: A rotation makes every open ticket that binds fingerprints stale, and stale tickets must be re-issued

> **Invariant:** [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
> **Satisfies:** [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-GX-007](../gxp/03-risk-assessment.md#rsk-gx-007)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §10, §14

```ts
// illustrative — not type-checked
declare function staleTickets(
  tickets: TicketStoreShape,
  options: { readonly currentKeyId: string }
): Stream.Stream<{ readonly ticketId: string; readonly bindingDigest: string; readonly keyIds: readonly string[] }, TicketReadFailed>
```

```
REQUIREMENT: After the provider's current key changes, the gate MUST refuse a
             call whose open binding carries fingerprints under the previous
             key id with "stale-fingerprint-key" (BEH-GX-091). The companion
             MUST offer no way to translate, re-key or re-sign a signed
             binding; the ticket MUST be revoked or left to expire, and a new
             ticket issued and signed.
```

```
REQUIREMENT: `staleTickets` MUST list every signed ticket with an open
             binding whose fingerprints name a key id other than
             `currentKeyId`, with those key ids, so that the consumer can see
             before and after a rotation which approvals it invalidates.
```

```
REQUIREMENT: Fingerprints already stored in records MUST keep their key id
             after a rotation. The companion MUST NOT recompute, replace or
             annotate a stored fingerprint.
```

A signer approved the strings shown to them as fingerprinted, under one key.
After rotation the call carries different strings for the same value, and
re-signing them automatically would put a signature on something no person
saw ([ADR-GX-019](../decisions/019-key-provider-and-rotation.md)). The cost is that every open approval that binds a value
must be renewed by people, which is why rotations should be scheduled when
few tickets are open and why `staleTickets` exists. This is the consumer's
obligation.

## BEH-GX-110: matchesFingerprint compares one candidate value with one fingerprint under the key that made it

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-018](../decisions/018-eligibility-allow-list.md)
> **Satisfies:** [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys)
> **Risk:** [RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012), [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014)
> **Regulatory:** supports 21 CFR 11.10(e) (review of a recorded change against a known value); EU GMP Annex 11 §9

```ts
// illustrative — not type-checked
declare function matchesFingerprint(
  q: {
    readonly fingerprint: string                       // e.g. from a record's configChange.fingerprints
    readonly scope: string
    readonly pluginId: string
    readonly path: string
    readonly form: "raw" | "decoded"
    readonly value: unknown                            // the candidate, mapped as BEH-GX-100
  },
  deps: { readonly keys: FingerprintKeyProviderShape; readonly eligibility: FingerprintEligibility }
): Effect.Effect<"match" | "no-match" | "key-retired-unavailable",
                 FingerprintMalformed | FingerprintCompareRefused | FingerprintKeyUnavailable>

class FingerprintMalformed extends Schema.TaggedError<FingerprintMalformed>()("FingerprintMalformed", { message: Schema.String }) {}
class FingerprintCompareRefused extends Schema.TaggedError<FingerprintCompareRefused>()("FingerprintCompareRefused", {
  reason: Schema.Literal("value-outside-domain", "path-not-eligible"), message: Schema.String
}) {}
```

```
REQUIREMENT: `matchesFingerprint` MUST parse the fingerprint with
             `parseFingerprint` (BEH-GX-099), failing with
             `FingerprintMalformed` when it returns None; obtain the key with
             `byId` of the parsed key id; recompute the MAC with the input of
             BEH-GX-099; and compare the two 32-byte MACs in time independent
             of where they first differ.
```

```
REQUIREMENT: It MUST refuse with `FingerprintCompareRefused`
             "path-not-eligible" a `pluginId`, `path` and `form` that no
             entry of the eligibility list admits in any realm, and with
             "value-outside-domain" a candidate outside BEH-GX-100's domain.
```

```
REQUIREMENT: It MUST take one candidate value per call and the companion MUST
             offer no batch, dictionary or enumeration form of it. Its
             answer MUST be one of the three literals; it MUST return no MAC,
             key, canonical value or candidate.
```

The comparison is the reason fingerprints exist: an investigator holding a
candidate value — the limit written in the change request — can establish
that the recorded change put exactly that value in place. It is also an
oracle for guesses, which is why it answers only for eligible paths, one
value at a time, and why its use is confined to whoever can reach the key
provider ([RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012)). Restricting the batch form does not stop a key
holder from looping; it keeps the companion from offering the loop.

## BEH-GX-111: No key material appears in any output

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
> **Satisfies:** [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output), [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys)
> **Risk:** [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(d)

```
REQUIREMENT: No companion output — return value, error, log line, metric,
             trace, ticket, record, check report, evidence pack or archive —
             MAY contain key bytes, a `CryptoKey` object, a value derived
             from a key other than a fingerprint, or the provider's error
             text. A key id MAY appear.
```

```
REQUIREMENT: The installation checks MUST probe the provider by calling
             `current` and recording the key id and the time only
             (BEH-GX-119). They MUST NOT fingerprint a test value under a
             production key, and MUST NOT record anything derived from the
             key.
```

```
REQUIREMENT: A test MUST show, with a provider whose key bytes are a known
             canary, that the canary's hexadecimal and base64 forms appear in
             no output produced by fingerprinting, comparison, the
             installation checks and an evidence pack.
```

The provider hands over a handle, and the companion uses it for one
operation; nothing it writes can carry the key further. A key id is not a
secret — it is printed in every fingerprint by design.

## BEH-GX-112: What key handling can and cannot show, and the consumer's part

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-012](../urs.md#urs-gx-012-manage-fingerprint-keys)
> **Risk:** [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) EU GMP Annex 11 §12.1, §7.1

```
REQUIREMENT: The documentation of the key provider port MUST state: "Anyone
             who holds a fingerprint key can test guessed values against
             every fingerprint made with it, including after the key is
             retired. A compromised key must be rotated, and approvals that
             bind fingerprints must then be re-issued."
```

```
REQUIREMENT: The installation evidence MUST print the provider's `name`,
             `version` and declared `custodian`, and the current key id as a
             probe observed at a stated time. It MUST NOT describe the key or
             its custody as verified, and MUST list key custody, rotation
             schedule, retention and compromise response as items not
             executed: "not observable from code; Consumer obligation"
             (BEH-GX-114).
```

The companion can show that fingerprints carry a key id, that a failed
provider stops changes, that a retired key compares and a missing one is
reported as missing, and that no output carries a key. It cannot show that
the key was generated well, that only the right people can reach it, or that
it has not been copied. Those questions are answered by the consumer's key
management and its own qualification ([RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)); the installation
evidence lists them so that they are not mistaken for things the companion
checked.

---

_Previous: [13 — Config Fingerprints](./13-config-fingerprints.md)_ · _Next: [15 — Installation Checks](./15-installation-checks.md)_
