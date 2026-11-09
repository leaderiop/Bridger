# 13 — Config Fingerprints

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-13                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

An approval of a `reconfigure` that names only the changed paths approves
"some new value for `limits.maxMg`", not the value 40. Core will not carry a
value anywhere ([ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md)); since CCR-BR-014 it can carry a
*fingerprint* of one, computed by a consumer-wired `ConfigFingerprinter`
port at step 4a of the call, after validation and before the gate
([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [BEH-BR-188](../../core/behaviors/22-attributable-operations.md)). This file specifies the companion's
implementation of that port: which paths it selects, the keyed MAC it
computes and its exact input, the value domain it accepts, the fixed test
vectors, how an issuer obtains the same fingerprints before the call, and
what a fingerprint does and does not reveal ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-018](../decisions/018-eligibility-allow-list.md)).
This file owns BEH-GX-097–104 and uses all eight.

> **What a fingerprint does not do — and who does**
>
> A fingerprint is not encryption and not a hash anyone can recompute: it is
> an HMAC under a key the consumer holds. Whoever holds that key can test
> guesses against it, so a value that can be guessed can be learned by the
> key holder. Choosing which paths are eligible, asserting how each value was
> generated, and keeping the key are the consumer's obligation
> ([14 — Fingerprint Keys](./14-fingerprint-keys.md)).

Planned source: `packages/gxp/src/fingerprints/hmacFingerprinter.ts`,
`packages/gxp/src/fingerprints/eligibility.ts`,
`packages/gxp/src/fingerprints/canonicalValue.ts` and
`packages/gxp/src/fingerprints/proposeFingerprints.ts` *(Planned)*.

## BEH-GX-097: hmacFingerprinter implements core's ConfigFingerprinter, selecting first and fingerprinting second

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-BR-013](../../core/invariants.md)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved)
> **Risk:** [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)
> **Regulatory:** supports 21 CFR 11.10(e), 11.70; EU GMP Annex 11 §10, §12.1

```ts
// illustrative — not type-checked
declare function hmacFingerprinter(options: {
  readonly keys: FingerprintKeyProviderShape           // 14 — Fingerprint Keys
  readonly eligibility: FingerprintEligibility         // BEH-GX-098
  readonly scope: string                               // the deployment, as for tickets (BEH-GX-065)
}): Layer.Layer<ConfigFingerprinter, GxpLayerInvalid>
// provides core's port (BEH-BR-188, step 4a):
//   select({ operation, target, paths })                       → the eligible paths, no value seen
//   fingerprint({ operation, target, form, entries })          → one { path, fingerprint } per entry
```

```
REQUIREMENT: `select` MUST return exactly the candidate paths that the
             eligibility list admits for the query's target and form
             (BEH-GX-098), in the order of the candidates, without
             duplicates. It MUST NOT read the key provider, and it receives
             no value.
```

```
REQUIREMENT: `fingerprint` MUST return one `{ path, fingerprint }` per entry
             it is given, in the order given, each computed as BEH-GX-099
             states with one key read once for the whole call (BEH-GX-107).
             It MUST fail the whole call with `ConfigFingerprintFailed`
             (BEH-GX-100) when any entry cannot be fingerprinted; it MUST NOT
             return a partial answer.
```

```
REQUIREMENT: `fingerprint` MUST refuse, with `ConfigFingerprintFailed`
             "path-not-selected", an entry whose path the eligibility list
             does not admit, so that a value core should not have sent is
             never fingerprinted.
```

```
REQUIREMENT: Building the layer MUST validate `scope` (non-blank, at most 128
             characters) and the eligibility list (BEH-GX-098), failing with
             `GxpLayerInvalid` naming the field, and MUST NOT call the key
             provider (BEH-GX-004). `GxpLayer.make` MUST build its
             `ConfigFingerprinter` with `hmacFingerprinter`, passing the
             `fingerprints` section's ports and the deployment's `scope`.
```

The two-step shape is core's ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)) and the companion keeps it
strictly: `select` decides from paths alone, so a value whose path is not on
the list never leaves core. Re-checking the selection inside `fingerprint` is
defence in depth against a core defect or a hand-written caller that hands
over more than was selected. Core then checks the answer's shape, carries
the strings unchanged on the request and both records, and fails the call
closed when the port fails ([BEH-BR-219](../../core/behaviors/25-operation-gate.md), [BEH-BR-197](../../core/behaviors/23-audit-sink-and-record.md), REQ-BR-055,
REQ-BR-056).

## BEH-GX-098: Eligibility is an allow-list over plugin, realm, path and form, deny by default, with no class for low-entropy secrets

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-018](../decisions/018-eligibility-allow-list.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
> **Satisfies:** [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output)
> **Risk:** [RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012), [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(d) (by keeping secrets out of the port unless chosen)

```ts
// illustrative — not type-checked
interface FingerprintEligibility {
  readonly v: 1
  readonly entries: readonly {
    readonly pluginId: string            // exact, or with "*" for any run of characters (as BEH-GX-058)
    readonly realm?: string              // same pattern rules; absent: any realm
    readonly path: string                // dot path; a segment "*" matches exactly one segment
    readonly form?: "raw" | "decoded"    // absent: both
    readonly entropy: "public" | "high"  // "public": not secret; "high": generated with ≥ 128 bits
    readonly note: string                // why the path is eligible; printed by the installation checks
  }[]
}
declare function eligibilityDigest(e: FingerprintEligibility): string   // "sha256:" + hex(SHA-256(JCS(e)))
declare function describeEligibility(e: FingerprintEligibility): string // deterministic text for review
```

```
REQUIREMENT: A candidate path MUST be admitted only when some entry matches
             the target's `id` with `pluginId`, the target's `realm` with
             `realm` (when present), the form (when present), and the path
             with `path` segment by segment: the same number of
             dot-separated segments, each equal or matched by a "*" segment.
             Matching MUST be exact, case-sensitive and by code point. With
             no matching entry the path MUST NOT be selected.
```

```
REQUIREMENT: The list MUST be refused with `GxpLayerInvalid` when an entry's
             `path` consists only of "*" segments while its `pluginId` is
             "*", when `note` is shorter than 10 characters after trimming,
             or when `entropy` is any value other than "public" or "high".
             There MUST be no entropy class, option or override that admits a
             human-chosen password, PIN, passphrase or other secret drawn
             from a small set.
```

```
REQUIREMENT: An empty list MUST be accepted and MUST select nothing. The
             list's digest MUST be reported by the installation checks next
             to the policy digest, and `describeEligibility` MUST print each
             entry with its `entropy` and `note` (BEH-GX-119).
```

A path not on the list stays a path: the call carries it, the approval binds
it, and no value reaches the companion. Adding a path is a reviewed decision
with a stated reason, not a side effect of a schema change
([ADR-GX-018](../decisions/018-eligibility-allow-list.md)). "high" is an assertion about how a value was generated
— a random token, a generated key — which the companion cannot measure; it
exists so that such secrets can be bound, because guessing them is
infeasible even for the key holder. A value a person chose has no class,
because a key holder could enumerate it ([RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012)). This is the
consumer's obligation.

## BEH-GX-099: A fingerprint is HMAC-SHA256 over the canonical form of scope, plugin, path, form and value, written as fp1:hmac-sha256:keyId:mac

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
> **Satisfies:** [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §12.1

```ts
// illustrative — not type-checked
// macInput = { v: 1, scope, pluginId: target.id, path, form, value: canonicalValue(value) }   (BEH-GX-100)
// mac      = HMAC-SHA256(key, UTF-8(JCS(macInput)))                                          (BEH-GX-002)
// result   = "fp1:hmac-sha256:" + keyId + ":" + base64url(mac)                               (no padding)
declare function parseFingerprint(s: string): Option.Option<{ readonly keyId: string; readonly mac: string }>
```

```
REQUIREMENT: The MAC input MUST be the object `{ v: 1, scope, pluginId, path,
             form, value }`, with `scope` the fingerprinter's, `pluginId` the
             query's `target.id`, `path` and `form` as core gave them, and
             `value` the canonical value of BEH-GX-100. Its canonical form
             (RFC 8785, BEH-GX-002) MUST be encoded in UTF-8 and MACed with
             HMAC-SHA256 under the key read for the call.
```

```
REQUIREMENT: The fingerprint MUST be "fp1:hmac-sha256:", the key id, ":",
             and the RFC 4648 §5 base64url encoding of the 32-byte MAC
             without padding (43 characters). Key ids MUST match
             `^[A-Za-z0-9._:-]{1,64}$`, so that every fingerprint matches
             core's format `^[A-Za-z0-9._:-]{1,200}$` (BEH-BR-188) and is at
             most 124 characters long.
```

```
REQUIREMENT: `parseFingerprint` MUST split off the MAC after the last ":"
             and take the key id from between "fp1:hmac-sha256:" and that
             ":". It MUST return None for any string that does not have that
             prefix, a key id matching the pattern above and a MAC of exactly
             43 base64url characters.
```

Each element of the MAC input separates one use from another. Without
`path`, a value moved from one field to another would keep its fingerprint;
without `pluginId` and `scope`, a fingerprint seen on one plugin or in the
test deployment would identify the same value in production; without `form`,
a raw `install` value and the decoded value of a later `reconfigure` could
collide. The version prefix and algorithm name make the string
self-describing, and the key id tells a reader which key compares it
([BEH-GX-110](./14-fingerprint-keys.md)). Key ids may contain ":" — the fixture
ids are "test:…" ([BEH-GX-150](./19-testing-entry-point.md)) — which is why the MAC,
whose alphabet has no ":", is split off from the right.

**Settled here.** The realm is not part of the MAC input. A plugin installed
in two realms keeps the meaning of its configuration fields in both, and an
approver comparing two changes to the same plugin should see equal values as
equal. The input is the one ADR-GX-017 fixes; adding the realm would be a
`v: 2` change.

## BEH-GX-100: Only values in a defined canonical domain are fingerprinted, and every failure is ConfigFingerprintFailed

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)
> **Satisfies:** [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them), [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(e)

| The value core hands over | Canonical value |
| --- | --- |
| `null`, `true`, `false`, a string with no lone surrogate | itself |
| a number that is a safe integer | itself |
| any other number (fraction, `NaN`, ±infinity, beyond ±(2^53 − 1)) | outside the domain |
| an array | each element mapped; an `undefined` element is outside the domain |
| a plain object (prototype `Object.prototype` or `null`) | each own enumerable string-keyed property mapped; a property whose value is `undefined` is omitted |
| a `Redacted` value (Effect) | its content, mapped — only on a path whose entry has `entropy: "high"`; otherwise outside the domain |
| a valid `Date` | the string `toISOString()` gives (UTC, milliseconds) |
| a `bigint` | its decimal string, with "-" for a negative value |
| anything else (a string with a lone surrogate, an invalid `Date`, `Map`, `Set`, `Uint8Array`, a class instance, a function, a symbol) | outside the domain |

```
REQUIREMENT: `fingerprint` MUST map each entry's value by the table before
             canonicalising, and MUST fail with `ConfigFingerprintFailed`
             when any part of the value is outside the domain, when the
             mapped value is nested more than 32 levels deep, or when its
             canonical form exceeds 65536 UTF-8 bytes.
```

```
REQUIREMENT: Every failure of the fingerprinter — a value outside the domain,
             a path not selected, the key provider failing, dying or timing
             out, a key id outside the pattern, a test key without the
             fixture marker (BEH-GX-106) — MUST be `ConfigFingerprintFailed`
             whose `message` is exactly one fixed tag: "value-outside-domain",
             "path-not-selected", "key-unavailable", "key-id-invalid" or
             "test-key-without-fixture". The message MUST NOT contain the
             path, the value, the key id or the provider's text.
```

```
REQUIREMENT: The fingerprinter MUST NOT catch its own failure and answer
             without a fingerprint, and MUST NOT substitute a placeholder.
             Core then fails the call with `ConfigFingerprintUnavailable`
             before the gate and records nothing (BEH-BR-188).
```

The domain is what makes "the same value" mean the same bytes on every
platform and in both the issuer and the call ([RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)). Integers only,
as everywhere in the companion's canonical form (BEH-GX-002): a fractional
setting cannot be bound by fingerprint, and listing it as eligible makes every
call that changes it fail, which the consumer will notice at once rather than
later. A `Date` and a `bigint` are given fixed string forms because schemas
decode to them routinely; a string and a `Date` with the same text then
share a fingerprint, which is harmless because one path has one type.
`Redacted` is unwrapped only where the consumer declared the value a
generated secret; a `Redacted` value on a path declared "public" means the
declaration is wrong, and the call fails rather than treating a secret as
public.

## BEH-GX-101: Fixed test vectors pin the MAC input, its canonical form and the MAC

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
> **Satisfies:** [NFR-GX-001](../urs.md#nfr-gx-001-deterministic-outputs), [NFR-GX-005](../urs.md#nfr-gx-005-specification-integrity)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports EU GMP Annex 11 §4.7 (reproducible test data)

```
REQUIREMENT: The companion's test suite MUST include the vectors below, each
             checking that canonicalising `input` gives exactly `canonical`
             and that HMAC-SHA256 under the key `key_hex` over the UTF-8
             bytes of `canonical`, encoded as base64url without padding, is
             `hmac_b64url`. The specification checker MUST recompute them
             (check 17).
```

```
REQUIREMENT: A vector MUST NOT be changed except together with a new MAC
             input version `v` or a new fingerprint prefix. The keys in the
             vectors are published test values and MUST NOT be used, or
             accepted by the installation checks, as production keys
             (BEH-GX-118).
```

Each block is one JSON object: `key_hex` is the 32-byte key in hexadecimal,
`input` the MAC input after the canonical-value mapping of BEH-GX-100,
`canonical` its exact canonical text and `hmac_b64url` the 43-character MAC.
The first vector is a raw `install` value with an object; the second a
decoded value with non-ASCII text (U+201E, U+201C, U+2014, U+00B0), an array,
a boolean and `null`; the third the string a decoded `Date` maps to.

```vector
{"key_hex": "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "input": {"v": 1, "scope": "lims-prod", "pluginId": "sample-registry", "path": "retention", "form": "raw", "value": {"days": 3650, "mode": "archive"}}, "canonical": "{\"form\":\"raw\",\"path\":\"retention\",\"pluginId\":\"sample-registry\",\"scope\":\"lims-prod\",\"v\":1,\"value\":{\"days\":3650,\"mode\":\"archive\"}}", "hmac_b64url": "LYslr2gO-wE1b2aN12OCyOz_8XfUixrIzOtOQ4sq9wk"}
```

```vector
{"key_hex": "4b2026a1c3e5f70911335577799bbddff00e1c2a3b4c5d6e7f8091a2b3c4d5e6", "input": {"v": 1, "scope": "lims-prod", "pluginId": "stabilität-monitor", "path": "alerts.0.threshold", "form": "decoded", "value": {"label": "Grenzwert „hoch“ — 25 °C", "limits": [2, 8, 25], "enabled": true, "note": null}}, "canonical": "{\"form\":\"decoded\",\"path\":\"alerts.0.threshold\",\"pluginId\":\"stabilität-monitor\",\"scope\":\"lims-prod\",\"v\":1,\"value\":{\"enabled\":true,\"label\":\"Grenzwert „hoch“ — 25 °C\",\"limits\":[2,8,25],\"note\":null}}", "hmac_b64url": "BMWh_EpHA_M03tuZzuLLnNZdr1ETy7QpgaEkIzl4IzU"}
```

```vector
{"key_hex": "4b2026a1c3e5f70911335577799bbddff00e1c2a3b4c5d6e7f8091a2b3c4d5e6", "input": {"v": 1, "scope": "lims-prod", "pluginId": "erp-bridge", "path": "validFrom", "form": "decoded", "value": "2026-10-03T08:00:00.000Z"}, "canonical": "{\"form\":\"decoded\",\"path\":\"validFrom\",\"pluginId\":\"erp-bridge\",\"scope\":\"lims-prod\",\"v\":1,\"value\":\"2026-10-03T08:00:00.000Z\"}", "hmac_b64url": "OeF5X-qTBAMCJVA14hE1YEfNTSTrlxhd3-b-jNmrWUA"}
```

With the key id "k2026-01", the three fingerprints are
`fp1:hmac-sha256:k2026-01:LYslr2gO-wE1b2aN12OCyOz_8XfUixrIzOtOQ4sq9wk`,
`fp1:hmac-sha256:k2026-01:BMWh_EpHA_M03tuZzuLLnNZdr1ETy7QpgaEkIzl4IzU` and
`fp1:hmac-sha256:k2026-01:OeF5X-qTBAMCJVA14hE1YEfNTSTrlxhd3-b-jNmrWUA`; the key
id is not part of the MAC input, so the same key under another id gives the
same MAC behind a different prefix. The second vector's text is where
implementations differ: RFC 8785 writes the non-ASCII characters as
themselves, in UTF-8, and sorts the object's keys by UTF-16 code units.

## BEH-GX-102: proposeFingerprints gives an issuer exactly the fingerprints the call will carry

> **Invariant:** [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-010](../decisions/010-sign-first-then-call.md)
> **Satisfies:** [URS-GX-007](../urs.md#urs-gx-007-bind-an-approval-to-exactly-the-change-approved), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
> **Regulatory:** supports 21 CFR 11.70; EU GMP Annex 11 §10, §14

```ts
// illustrative — not type-checked
declare function proposeFingerprints(
  q: {
    readonly definition: PluginDefinition              // the definition the call will install or reconfigure
    readonly target: { readonly id: string; readonly realm: string }
    readonly form: "raw" | "decoded"                   // install → "raw", reconfigure → "decoded"
    readonly value: unknown                            // the override the operator will pass
    readonly paths: readonly string[]                  // the configChange.paths the call will carry
  },
  deps: { readonly keys: FingerprintKeyProviderShape; readonly eligibility: FingerprintEligibility; readonly scope: string }
): Effect.Effect<readonly { readonly path: string; readonly fingerprint: string }[], FingerprintProposalFailed>

class FingerprintProposalFailed extends Schema.TaggedError<FingerprintProposalFailed>()("FingerprintProposalFailed", {
  reason: Schema.Literal("decode-failed", "path-not-found", "value-outside-domain", "key-unavailable", "key-id-invalid"),
  message: Schema.String                               // fixed template; no path, value or key id
}) {}
```

```
REQUIREMENT: For form "decoded", `proposeFingerprints` MUST decode `value`
             with the definition's own configuration schema, as core decodes
             a `reconfigure` value at step 4 (BEH-BR-188); for form "raw" it
             MUST use `value` as given and read top-level keys only. It MUST
             then select from `paths` with the same `select` and fingerprint
             the value at each selected path with the same code as
             `hmacFingerprinter`, under the provider's current key.
```

```
REQUIREMENT: For the same definition, target, form, value, paths, scope,
             eligibility list and current key, the result MUST be equal,
             element for element and in order, to the `fingerprints` core
             will put on the call's `OperationRequest` (BEH-BR-219). A
             test MUST show this for every vector of BEH-GX-101 and for a
             seeded random sample of schemas and values.
```

```
REQUIREMENT: A path of `paths` with no value in the decoded or raw value MUST
             fail the proposal with "path-not-found". The result and the
             error MUST NOT contain a value.
```

The issuer must put into the binding the fingerprints the call will carry,
or the gate will refuse the call it approved ([BEH-GX-069](./09-approval-tickets.md#beh-gx-069-issueticket-turns-a-proposed-request-into-a-signed-ticket)). Using the
very functions of the fingerprinter, and the plugin's own schema for
decoding, removes every way the two could disagree except the one that
matters: a different value, which should be refused.

**Settled here.** The caller supplies `paths`. For a `reconfigure`, core
computes the changed paths against the configuration in effect, which
includes source values the companion can never observe (BEH-BR-103). The
operator knows which fields they are changing; if they name them wrongly,
the binding's paths differ from the request's and the gate refuses with
"binding-mismatch" — a safe failure that a dry run against a test host
catches before signing.

## BEH-GX-103: Nothing but the fingerprint string leaves the fingerprinter

> **Invariant:** [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-BR-028](../../core/invariants.md)
> **See:** [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md), [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md)
> **Satisfies:** [NFR-GX-007](../urs.md#nfr-gx-007-no-secrets-in-any-output), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024), [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)
> **Regulatory:** supports EU GMP Annex 11 §12.1; 21 CFR 11.10(d)

```
REQUIREMENT: The fingerprinter and `proposeFingerprints` MUST NOT log, trace,
             emit as an event, put in a metric, cache or keep beyond the
             call any value, canonical value, MAC input, MAC computed for a
             path not returned, or key. Their only outputs MUST be the
             returned `{ path, fingerprint }` list and the fixed-tag errors
             of BEH-GX-100 and BEH-GX-102.
```

```
REQUIREMENT: The fingerprinter MUST NOT send a value, or anything derived
             from one, to any port other than the platform's HMAC function
             (BEH-GX-002): not to the key provider, not to a store, not over
             a network.
```

```
REQUIREMENT: A test MUST fingerprint a `Redacted` canary value on an
             eligible "high" path and MUST show that the canary's text
             appears in no log line, span, metric, error, record, ticket or
             evidence file produced during the run.
```

Core keeps values away from everything except this port and keeps the
call's actor, reason and correlation away from it ([BEH-BR-192](../../core/behaviors/22-attributable-operations.md)); the
port must not then become the leak core avoided ([RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)). The
companion's fingerprinter has nowhere to send a value: it computes and
returns. A consumer who writes their own fingerprinter instead takes on this
review themselves.

## BEH-GX-104: A fingerprint shows equality to the key holder only, and documentation says so

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-018](../decisions/018-eligibility-allow-list.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-011](../urs.md#urs-gx-011-compare-configuration-values-without-revealing-them)
> **Risk:** [RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) EU GMP Annex 11 §12.1; 21 CFR 11.70

```
REQUIREMENT: The fingerprinter's documentation, and every rendering that
             shows a fingerprint, MUST state: "A fingerprint lets the holder
             of its key test whether a value equals the one fingerprinted.
             Anyone without the key learns only whether two fingerprints made
             with the same key, scope, plugin, path and form are equal."
```

```
REQUIREMENT: No output MAY call a fingerprint encrypted, anonymised or
             irreversible, and no output MAY show a fingerprint as evidence
             of a value to a reader who does not hold the key; it MAY show
             that two fingerprints are equal or different.
```

```
REQUIREMENT: Renderings for people — the signer's text (BEH-GX-074), the
             link report, the evidence report and the archive's rendering —
             MUST show that a path is fingerprinted and MUST NOT print the
             fingerprint string itself; machine-readable outputs MAY carry
             it.
```

Two equal fingerprints say "the same value" to anyone who sees both; that is
the point of binding an approval to a value, and it is also a disclosure:
a reviewer can see that a setting was put back to an earlier value. With
the key, a fingerprint becomes a test for any guessed value, which is why
the eligibility list admits no low-entropy secret and why key custody is
the consumer's ([14 — Fingerprint Keys](./14-fingerprint-keys.md)). Keeping the string
out of human renderings avoids inviting readers to compare long opaque
strings by eye, which is the job of `matchesFingerprint` and of the gate.

---

_Previous: [12 — Approval Gate](./12-approval-gate.md)_ · _Next: [14 — Fingerprint Keys](./14-fingerprint-keys.md)_
