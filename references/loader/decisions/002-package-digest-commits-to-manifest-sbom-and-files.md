# ADR-LD-002: The package digest commits to the manifest, the SBOM and the files

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-002                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Context

Core carries `meta.digest` as an opaque label into gate requests and audit records ([BEH-BR-104](../../core/behaviors/11-configuration.md#beh-br-104-meta-is-opaque-except-where-named)). For that label to mean something, one construction must say which bytes it names. Three needs pull on the construction: a reviewer approves code together with its manifest and its bill of materials; a catalog must prove that a manifest belongs to a signed package without shipping the code; and two loaders on two platforms must compute the same value.

## Decision

- A package is a manifest (bytes as published), one SBOM (format label and bytes) and a set of files with normalised paths ([01 — Package and Digest](../behaviors/01-package-and-digest.md), BEH-LD-001).
- The package digest is a hash over a domain string and three sub-digests — manifest, SBOM, files — each written with its algorithm prefix (BEH-LD-002). The files sub-digest hashes each path with the digest of its content, in byte-wise path order.
- The SBOM is mandatory by default and always committed to, as an empty part when an application declares it optional (BEH-LD-005).
- The loader stamps the evaluated definition with the manifest's version and the package digest; a definition that declares its own digest is refused (BEH-LD-007).

## Alternatives considered

- **Hash the archive (tarball, zip) as delivered.** Rejected: archive bytes depend on the archiver (ordering, timestamps), and a manifest cannot be verified without the whole archive.
- **Hash a re-encoding of the decoded manifest.** Rejected: canonical re-encoding is a source of disagreement between producers and loaders; hashing the published bytes is unambiguous.
- **Leave the SBOM outside the digest, signed separately.** Rejected: a separately signed SBOM can be swapped for another signed one; binding it to the code is the point.
- **Let the definition declare its digest.** Rejected: a module cannot contain the digest of the package that contains it; any such value was set by someone other than the loader.

## Consequences

**Positive**:

- A catalog can verify manifests without code (BEH-LD-034); `reconcile` can compare definitions by stamped digest without evaluating code (BEH-LD-038).
- The label in core's audit records names manifest, SBOM and code together.

**Negative**:

- Packages need a Bridger-specific digest beside whatever digest their registry uses.
- Changing the construction requires a new domain string and re-signing.

**Trade-off accepted**: a purpose-built construction, at the cost of not reusing registry digests directly, so that discovery without code and a single meaning for `meta.digest` are possible.

## References

- Behaviours: [01 — Package and Digest](../behaviors/01-package-and-digest.md), [05 — Catalog and Lazy Loading](../behaviors/05-catalog-and-lazy-loading.md)
- Invariants: [INV-LD-003](../invariants.md#inv-ld-003-a-stamped-digest-is-the-verified-package-digest)
- Core: [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
