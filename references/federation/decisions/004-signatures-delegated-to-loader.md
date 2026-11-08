# ADR-FD-004: Signature verification is delegated to the loader companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-FD-ADR-004                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-FD-001)<br>0.1 (2026-11-08): Initial draft (CCR-FD-001)                 |

---

## Context

Manifests must be signed by the authority. Plugin packages must be signed too, by the loader companion ([references/loader/](../../loader/README.md)), which defines a `SignaturePolicy` accepting N-of-M signers and named algorithms, and a `RevocationSource`. Two signature mechanisms in two companions would diverge in key handling and in what counts as accepted.

## Decision

- Federation calls the loader companion's `SignaturePolicy` with the received bytes and their signatures, before decoding; anything but acceptance is `ManifestRejected { reason: "signature" }` ([BEH-FD-002](../behaviors/01-host-manifest.md#beh-fd-002-the-signed-bytes-are-verified-before-they-are-decoded)).
- Federation holds no keys and performs no cryptography. It ships no default policy, and refuses to build without one.
- A digest revoked by a wired `RevocationSource` is treated as a kill entry.

## Alternatives considered

- **Signature code in federation.** Rejected: duplicate trust machinery.
- **Trust the transport (TLS to the authority).** Rejected: the stored copy must be re-verifiable at boot, offline, long after the session that delivered it.

## Consequences

**Positive**: one policy decides what is signed enough, for code and for desired state.

**Negative**: federation depends on the loader companion's port being specified; until it is, the shape used in 01 is an assumption to be aligned.

## References

- Behaviours: [01](../behaviors/01-host-manifest.md)
- Core: [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md) (no permissive default)
