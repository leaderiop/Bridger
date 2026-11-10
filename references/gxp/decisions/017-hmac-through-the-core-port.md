# ADR-GX-017: Fingerprints are HMACs computed through the core ConfigFingerprinter port

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-017                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-10): Canonical domain: every finite number, not integers only, as in the rest of the canonical form (M6) (CCR-GX-006)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

[ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md) gives core an optional `ConfigFingerprinter` port, called at step 4a of a mutating call ([BEH-BR-188](../../core/behaviors/22-attributable-operations.md)), after validation and before the gate. `select` sees the operation, the target and the candidate paths, and no value; `fingerprint` sees the form (`"raw"` or `"decoded"`), the operation, the target `{ id, realm }` and the selected `{ path, value }` entries. Core checks each answer against `^[A-Za-z0-9._:-]{1,200}$`, bounds both calls by `fingerprintTimeout`, carries the strings on the request and records, and computes nothing itself ([BEH-BR-219](../../core/behaviors/25-operation-gate.md), [BEH-BR-197](../../core/behaviors/23-audit-sink-and-record.md)). It leaves the meaning of a fingerprint, and its resistance to enumeration, to the implementation ([RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)). The companion supplies that implementation.

## Decision

- **`hmacFingerprinter({ keys, eligibility, scope })` provides `ConfigFingerprinter`.** `select` is the eligibility allow-list ([ADR-GX-018](../decisions/018-eligibility-allow-list.md)); `fingerprint` computes, for each selected entry,

  `mac = HMAC-SHA256(key, UTF-8(JCS({ v: 1, scope, pluginId: target.id, path, form, value })))`

  with `key` the provider's current key ([ADR-GX-019](../decisions/019-key-provider-and-rotation.md)) and JCS as in [ADR-GX-005](../decisions/005-jcs-and-sha256.md).
- **Format.** `fp1:hmac-sha256:<keyId>:<b64url(mac)>`, where `b64url` is RFC 4648 §5 base64url without padding (43 characters for 32 bytes). `keyId` matches `^[A-Za-z0-9._:-]{1,64}$` (testing key ids start with `test:`, [ADR-GX-024](../decisions/024-fixtures-are-marked.md)); a provider key id outside that set fails `fingerprint` with `ConfigFingerprintFailed` "key-id-invalid"; building the layer never calls the provider. A reader splits off the MAC after the last `:` (base64url has none) and the key id between the second `:` and that one. The whole string is at most `16 + 64 + 1 + 43 = 124` characters and uses only characters in core's set, so core never refuses a well-formed answer.
- **Canonical domain.** The value is the JSON value core hands over: raw top-level values for `install`, decoded values for `reconfigure`. Before canonicalising, a valid `Date` from a decoder becomes the ISO 8601 string `toISOString()` gives (UTC, milliseconds), a `bigint` its decimal string, and a `Redacted` value on a high-entropy path its content ([BEH-GX-100](../behaviors/13-config-fingerprints.md)). Numbers are in the domain when finite, written as RFC 8785 writes them ([ADR-GX-005](../decisions/005-jcs-and-sha256.md)). A value still outside the domain — `NaN` or ±infinity, an invalid `Date`, a `Map`, `Set`, `Uint8Array`, class instance, function or symbol — fails `fingerprint` with `ConfigFingerprintFailed`, and core turns that into `ConfigFingerprintUnavailable` and changes nothing. The domain includes `scope`, `pluginId`, `path` and `form`, so equal values at different paths, plugins, forms or deployments give different fingerprints.
- **Nothing leaves but the string.** The fingerprinter returns only `{ path, fingerprint }`; it logs nothing, emits no event and puts no value, key or MAC input in any error message ([INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output)). Its failure message is exactly one fixed tag (`"value-outside-domain"`, `"path-not-selected"`, `"key-unavailable"`, `"key-id-invalid"`, `"test-key-without-fixture"`); core writes its own message anyway.
- **Proposals decode the same way.** `proposeFingerprints({ definition, target, form, value, paths }, { keys, eligibility, scope })` lets the issuer compute the fingerprints a binding should carry. For `"decoded"` it decodes with the plugin's own schema exactly as core does for `reconfigure`, and it selects and fingerprints with the same functions, so a ticket and the request agree ([RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)).
- **Test vectors.** [13 — Config fingerprints](../behaviors/13-config-fingerprints.md) carries fixed vectors of key, MAC input, canonical text and MAC; check 17 recomputes them.

## Alternatives considered

- **Plain SHA-256 of the value.** Rejected, as core rejected it: low-entropy values are enumerable.
- **HMAC over the value alone.** Rejected: one value would have one fingerprint everywhere, so a fingerprint seen for one path would identify the same value at every other path and deployment.
- **Hex output.** Rejected: 64 characters instead of 43, with no gain; base64url without padding stays within core's character set.

## Consequences

**Positive**:

- An approval can name the value a change puts in place, and the record carries the same string, without either revealing the value to someone who lacks the key.
- The format names its version, algorithm and key, so a reader knows which key to use for comparison.

**Negative**:

- Whoever holds the key can test guesses against a fingerprint; low-entropy secrets are therefore never eligible ([ADR-GX-018](../decisions/018-eligibility-allow-list.md)) and the key's custody is the user's ([RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013)).
- The port sees selected values; its code is part of what the user reviews ([RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)).

**Trade-off accepted**: a keyed, domain-separated MAC whose strength rests on key custody, in exchange for approvals that bind values without carrying them.

## References

- Behaviours: [13 — Config fingerprints](../behaviors/13-config-fingerprints.md), [14 — Fingerprint keys](../behaviors/14-fingerprint-keys.md)
- Invariants: [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
- Risks: [RSK-GX-012](../gxp/03-risk-assessment.md#rsk-gx-012), [RSK-GX-013](../gxp/03-risk-assessment.md#rsk-gx-013), [RSK-GX-014](../gxp/03-risk-assessment.md#rsk-gx-014), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
- Decisions: [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-018](../decisions/018-eligibility-allow-list.md), [ADR-GX-019](../decisions/019-key-provider-and-rotation.md)
- Core: [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [BEH-BR-188](../../core/behaviors/22-attributable-operations.md), [BEH-BR-197](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-219](../../core/behaviors/25-operation-gate.md), [RSK-BR-024](../../core/gxp/03-risk-assessment.md#rsk-br-024)
- External: RFC 2104 (HMAC); RFC 4648 §5 (base64url); RFC 8785 (JCS).
