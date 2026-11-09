# ADR-GX-005: RFC 8785 canonical JSON and SHA-256 for every digest

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-005                                           |
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

The companion computes digests in five places: the entry digest of a stored record ([ADR-GX-004](../decisions/004-append-only-trail-store.md)), the seal chain ([ADR-GX-009](../decisions/009-optional-sealing.md)), the binding digest of an approval ([ADR-GX-012](../decisions/012-binding-contents.md)), the HMAC input of a fingerprint ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)) and the evidence-pack manifest ([ADR-GX-022](../decisions/022-evidence-pack-format.md)). Each is computed by one party and recomputed by another: the issuer of a ticket and the gate, the sink and a reader years later, a Node process and a browser. `JSON.stringify` does not fix key order across producers, and number and string escaping differ between serialisers. If two parties canonicalise differently, a correct approval is refused or a stored record looks altered (RSK-GX-015).

## Decision

- **One canonical form: RFC 8785 (JCS).** Every value that is hashed, HMAC-ed or compared by bytes is first serialised with the JSON Canonicalization Scheme: object members sorted by UTF-16 code units of their names, no insignificant white space, numbers in the ECMAScript shortest round-trip form, strings with the minimal JCS escapes. The result is encoded as UTF-8 without a byte order mark.
- **Input domain.** Canonicalisation accepts only JSON values RFC 8785 represents exactly: `null`, booleans, safe integers, strings, arrays and plain objects. `undefined` object members are omitted before canonicalising (an absent optional field and a missing field are the same). Non-finite numbers, numbers that are not safe integers, lone surrogates in strings, `undefined` inside an array, `bigint`, `Date` objects and any non-plain object are refused with `CanonicalisationFailed { path }`, where `path` names the position and never the value ([BEH-GX-002](../behaviors/01-companion-boundary.md)). The fingerprinter maps a valid `Date` and a `bigint` to strings, and unwraps an eligible `Redacted`, before canonicalising; every other value outside this domain is outside its domain too ([BEH-GX-100](../behaviors/13-config-fingerprints.md)).
- **One hash: SHA-256.** Every digest is SHA-256 over the canonical UTF-8 bytes, written `"sha256:" + lower-case hex` (64 hex digits), except that a file's digest is over the file's bytes as read and a rendered text's digest is over its UTF-8 bytes ([BEH-GX-002](../behaviors/01-companion-boundary.md)). The only keyed construction is HMAC-SHA256 for fingerprints. No other algorithm is accepted on read; a digest with another prefix is a finding, not a fallback.
- **One implementation, shared.** Issuer, gate, sink, checks and archive reader all call the same `canonicalize` and `sha256Digest` functions (planned at `packages/gxp/src/Crypto.ts` *(Planned)*), built on Web Crypto. No part re-implements them.
- **Test vectors.** The specification carries vectors (input, canonical text, digest) in [09 — Approval tickets](../behaviors/09-approval-tickets.md) and [13 — Config fingerprints](../behaviors/13-config-fingerprints.md), covering key reordering, nested objects, non-ASCII text, U+2028, escaped quotation marks, backslashes and control characters. Check 17 recomputes them ([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)); the conformance suite and the unit tests run the same vectors on every supported platform ([INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)).

## Alternatives considered

- **`JSON.stringify` with sorted keys.** Rejected: number formatting and escaping are left to the engine, and two "sorted stringify" implementations disagree on edge cases that JCS defines.
- **CBOR (RFC 8949 deterministic encoding).** Rejected: records are JSON-shaped and read by people; a binary canonical form needs a decoder for every review and archive.
- **SHA-512 or BLAKE3.** Not needed: SHA-256 is in every platform's Web Crypto, is what reviewers expect in a manifest, and has no known weakness relevant here. A later algorithm needs a new prefix and a CCR-GX; old digests stay readable.

## Consequences

**Positive**:

- Any two parties that agree on the value agree on the bytes and the digest, on any platform, which the vectors make checkable.
- A stored entry's `canonical` text can be rehashed by a reader with any JCS implementation, independent of the companion.

**Negative**:

- Values outside the JSON domain must be converted before they reach a binding or record; the refusal surfaces such cases rather than hashing them silently.
- JCS number formatting must be implemented exactly; the vectors are the guard.

**Trade-off accepted**: a strict input domain and one more dependency-free module, in exchange for digests that two parties always compute alike.

## References

- Behaviours: [02 — Trail store port](../behaviors/02-trail-store-port.md), [09 — Approval tickets](../behaviors/09-approval-tickets.md), [13 — Config fingerprints](../behaviors/13-config-fingerprints.md)
- Invariants: [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
- Risks: [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
- Decisions: [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-012](../decisions/012-binding-contents.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
- Core: [BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)
- External: RFC 8785 (JSON Canonicalization Scheme); FIPS 180-4 (SHA-256); RFC 2104 (HMAC).
