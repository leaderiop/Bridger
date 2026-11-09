# ADR-GX-019: Keys come from a caller-supplied provider; rotation forces ticket re-issue

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-019                                           |
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

Fingerprints are HMACs ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)); their value rests on a key that only the user's custody protects. Keys are generated, stored, rotated and eventually retired by the user's key management system (a KMS, an HSM, a secret store). Records keep fingerprints for years, so a reviewer must be able to compare a later value against an old fingerprint long after the key that made it stopped being current. A ticket carries fingerprints in its binding ([ADR-GX-012](../decisions/012-binding-contents.md)); when the current key changes, the fingerprint core computes for the same value changes too.

## Decision

- **The port.** `FingerprintKeyProvider` (planned at `packages/gxp/src/fingerprints/FingerprintKeys.ts` *(Planned)*), caller-supplied, no default ([ADR-GX-003](../decisions/003-ports-without-defaults.md)):

  ```ts
  // illustrative — not type-checked
  interface FingerprintKeyProviderShape {
    readonly manifest: { readonly name: string; readonly version: string; readonly custodian: string; readonly fixture?: true }
    readonly current: Effect<FingerprintKey, FingerprintKeyUnavailable>          // FingerprintKey = { keyId, key: CryptoKey }
    readonly byId: (keyId: string) => Effect<Option<FingerprintKey>, FingerprintKeyUnavailable>
  }
  ```

  `key` is a Web Crypto `CryptoKey` for `HMAC` with `SHA-256`. The companion asks for no other usage and never calls `exportKey`; a provider may and should create keys as non-extractable.
- **Current for new fingerprints, `byId` for comparison.** `hmacFingerprinter` reads `current` once per `fingerprint` call and uses that key for every entry of the call, so one call never mixes keys. `matchesFingerprint({ fingerprint, scope, pluginId, path, form, value }, { keys, eligibility })` parses the key id from the string and uses `byId`.
- **Retired keys stay available.** A key that is no longer current must still be returned by `byId` for as long as records or tickets fingerprinted with it are retained; the provider's retention is the user's procedure. `byId` returning `None` makes `matchesFingerprint` answer `"key-retired-unavailable"`, never `"match"` and never `"no-match"`.
- **Rotation makes tickets stale.** After rotation, a request carries fingerprints under the new key id, so its recomputed binding digest no longer equals a binding signed before rotation. The gate refuses it with `stale-fingerprint-key`; the ticket must be re-issued and re-signed. The companion offers no translation of a signed binding to a new key, because the signer did not sign the new strings.
- **No key material in any output.** No key bytes, MAC input or key-derived value other than the fingerprint itself appears in a return value, error, log line, evidence pack or archive ([INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)). `FingerprintKeyUnavailable` carries at most the key id, a fixed reason tag and a fixed message, never the provider's text.
- **Failure refuses.** A `current` failure fails `fingerprint`, which core turns into `ConfigFingerprintUnavailable`: the call changes nothing ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)).

## Alternatives considered

- **The companion stores keys itself.** Rejected: it would become a key store, with custody, backup and access control it cannot provide.
- **Re-sign tickets automatically after rotation.** Rejected: a signature would cover strings the signer never saw.
- **Delete retired keys at rotation.** Rejected: every fingerprint made with them would become uncomparable; deletion is a deliberate act under the user's retention procedure, and the consequence is reported, not hidden.

## Consequences

**Positive**:

- Old fingerprints remain comparable for as long as the user keeps their keys, and every fingerprint names its key.
- A compromised key can be replaced; fingerprints under the new key differ, so outstanding approvals must be renewed by people.

**Negative**:

- Rotation invalidates every outstanding ticket that binds fingerprints; rotations should be scheduled when few tickets are open.
- A compromised retired key still lets its holder test guesses against old fingerprints ([RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)).

**Trade-off accepted**: re-issuing tickets after rotation, in exchange for signatures that only ever cover the strings their signers saw.

## References

- Behaviours: [14 — Fingerprint keys](../behaviors/14-fingerprint-keys.md), [13 — Config fingerprints](../behaviors/13-config-fingerprints.md)
- Invariants: [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-GX-011](../invariants.md#inv-gx-011-every-port-failure-on-a-decision-path-refuses)
- Risks: [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014)
- Decisions: [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)
- Core: [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)
