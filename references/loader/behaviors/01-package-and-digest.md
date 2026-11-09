# 01 — Package and Digest

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-01                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.5 (2026-11-09): The entry file and export named in the reserved key `extensions["@bridger/loader"]` of core's manifest (M-03); the stamped definition carries the signed manifest (M-02); `ManifestMismatch` renamed `PackageManifestMismatch`, which also covers `optional` (C-16) (CCR-LD-004)<br>0.4 (2026-11-08): Open question 2 answered by the data-pack kind of file 08 (round 2: recheck item 12) (CCR-LD-003)<br>0.3 (2026-11-08): A package manifest carries no `digest`; the lazy definition carries the package digest beside it (core BEH-BR-244) (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

Core treats `meta.version` and `meta.digest` as opaque labels that it
compares and never computes ([BEH-BR-104](../../core/behaviors/11-configuration.md#beh-br-104-meta-is-opaque-except-where-named),
[ADR-BR-027](../../core/decisions/027-core-exclusions.md)). This file fixes
what the loader means by a **package** and by its **digest**, so that the
label core carries into gate requests and audit records names one specific,
reproducible set of bytes. The digest commits to the manifest, to the SBOM and
to every file of the code, so none of the three can change without the label
changing ([ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)).
This file owns BEH-LD-001–008 and uses all eight.

> **What this package does not do — and who does**
>
> The loader computes and checks digests. It does **not** decide which
> digests are acceptable (that is the signature policy of
> [03 — Signature Policy](./03-signature-policy.md) and the application's
> trust roots), does **not** interpret the SBOM for vulnerabilities or
> licences (an application predicate may, BEH-LD-006), and does **not** make
> code safe to run: a correct digest proves which bytes were loaded, not what
> they do.

Planned source: `packages/loader/src/Package.ts` and
`packages/loader/src/Digest.ts` *(Planned)*.

## BEH-LD-001: A package is a manifest, an SBOM and a set of files

> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface Package {
  readonly manifestBytes: Uint8Array                 // the manifest exactly as published (27 — Manifest and lazy activation)
  readonly sbom: { readonly format: string; readonly bytes: Uint8Array }   // e.g. "cyclonedx+json", "spdx+json"; opaque to the loader
  readonly files: ReadonlyMap<string, Uint8Array>   // path → content; paths relative, "/"-separated, no "." or ".." segments
}
```

```ts
// illustrative — not type-checked
// The loader's reserved key in the manifest's `extensions` record, which core keeps
// "namespaced by the companion that owns them" (core BEH-BR-241).
const LoaderManifestExtension = Schema.Struct({
  entry: Schema.Struct({
    file: Schema.String,       // a path of the package's files, normalised as below
    export: Schema.String      // the export holding the definition; "default" for a default export
  })
})
// manifest.extensions["@bridger/loader"] : typeof LoaderManifestExtension.Encoded
```

```
REQUIREMENT: A package MUST consist of exactly three parts: the manifest
             bytes, one SBOM (format label and bytes), and a non-empty map of
             files. The manifest MUST name the entry file and its export in
             `extensions["@bridger/loader"]`, decoded with
             `LoaderManifestExtension`, and the entry file MUST be one of the
             package's files. A manifest whose key is absent or does not
             decode, or whose `entry.file` is not a file of the package, MUST
             be refused at step 2 with `PackageMalformed` ("entry").
```

```
REQUIREMENT: File paths MUST be relative, "/"-separated and normalised: no
             empty, "." or ".." segment, no leading "/", no backslash, no
             two paths equal after Unicode NFC normalisation. A package
             that breaks any of these rules MUST be refused with
             `PackageMalformed` before any digest is compared.
```

```
REQUIREMENT: The manifest MUST be decoded with the manifest schema of 27 —
             Manifest and lazy activation (BEH-BR-241). The loader MUST NOT
             extend that schema; fields it needs that the schema does not
             carry are a change request to core, not a private field. The
             key `extensions["@bridger/loader"]` is not an extension of the
             schema: it is the companion-owned key core reserves for this
             purpose. The loader MUST read no other key of `extensions`, and
             core reads none (core BEH-BR-241).
```

The entry is named inside the manifest, so it is signed with it and
committed to by the package digest: a package cannot be re-pointed at another
file or export after signing. Carrying it under the loader's key of the
`extensions` record, which core keeps unchanged and never interprets, needs
no core change; a reader that is not a loader ignores it.

The three parts are what a reviewer approves when approving a release: what
the package says about itself (manifest), what it is built from (SBOM), and
what will run (files). Refusing ambiguous paths up front means two loaders,
on two operating systems, never disagree about which bytes a path names.

## BEH-LD-002: The package digest commits to three sub-digests

> **Invariant:** [INV-LD-003](../invariants.md#inv-ld-003-a-stamped-digest-is-the-verified-package-digest)
> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
// H = SHA-256; hex is lower case; every digest string is "<alg>:<hex>"
manifestDigest = "sha256:" + hex(H(manifestBytes))
sbomDigest     = "sha256:" + hex(H(utf8(sbom.format) || 0x00 || sbom.bytes))
filesDigest    = "sha256:" + hex(H(  for each path in byte-wise order of its UTF-8 form:
                                       utf8(path) || 0x00 || utf8("sha256:" + hex(H(content))) || 0x0A ))
packageDigest  = "sha256:" + hex(H( utf8("bridger-package-v1") || 0x0A
                                    || utf8(manifestDigest) || 0x0A
                                    || utf8(sbomDigest) || 0x0A
                                    || utf8(filesDigest) || 0x0A ))
```

```
REQUIREMENT: The loader MUST compute the package digest exactly as above.
             The domain string "bridger-package-v1" MUST change whenever the
             construction changes, so that a digest of one construction can
             never be read as a digest of another.
```

```
REQUIREMENT: The manifest digest MUST be taken over the manifest bytes as
             published, never over a re-encoding of the decoded manifest.
```

```
REQUIREMENT: Digest computation MUST be a pure function of the package's
             bytes: no clock, no source URL, no file-system metadata
             (timestamps, permissions, ordering of directory listings) and
             no environment MAY influence it.
```

Committing to sub-digests rather than to one flat byte stream is what lets a
catalog prove that a manifest belongs to a package without shipping the code
(05 — Catalog and Lazy Loading, BEH-LD-034): given the manifest bytes and the
two other sub-digests, anyone can recompute the package digest and check a
signature over it. Taking the manifest digest over the published bytes avoids
a whole class of canonicalisation disagreements between producers and
loaders.

## BEH-LD-003: Digest algorithms are named, and unknown ones are refused

> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
type DigestAlgorithm = "sha256" | "sha512"
class UnsupportedDigestAlgorithm extends Schema.TaggedError<UnsupportedDigestAlgorithm>()("UnsupportedDigestAlgorithm", {
  algorithm: Schema.String
}) {}
```

```
REQUIREMENT: Every digest string MUST carry its algorithm as a prefix
             ("sha256:", "sha512:"). The loader MUST support "sha256" and
             MAY support "sha512"; the same algorithm MUST be used for the
             three sub-digests and the package digest of one package.
```

```
REQUIREMENT: A digest whose algorithm the loader does not support MUST be
             refused with `UnsupportedDigestAlgorithm`. The loader MUST NOT
             fall back to another algorithm, and MUST NOT compare digests of
             different algorithms as equal or unequal.
```

Naming the algorithm in the label keeps a later migration honest: a package
re-published under a stronger hash gets a different label, and an old label is
never silently re-interpreted.

## BEH-LD-004: The expected digest is supplied before fetching

> **Invariant:** [INV-LD-001](../invariants.md#inv-ld-001-no-code-is-evaluated-before-its-digest-and-signatures-are-accepted)
> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface PackageRef {
  readonly source: PackageSource              // opaque to the loader; interpreted by a Fetcher adapter (02)
  readonly expect?: string                    // the package digest the caller requires
  readonly firstParty?: readonly Signature[]  // signatures over the "first-party" statement (09, BEH-LD-065)
}
class DigestMismatch extends Schema.TaggedError<DigestMismatch>()("DigestMismatch", {
  expected: Schema.String,
  actual: Schema.String,
  part: Schema.Literal("package", "manifest", "sbom", "files")
}) {}
```

```
REQUIREMENT: When `expect` is present, the loader MUST compare it with the
             package digest computed from the fetched bytes and MUST fail with
             `DigestMismatch` when they differ.
```

```
REQUIREMENT: When `expect` is absent, the package digest MUST still be
             computed, and acceptance MUST then rest entirely on the
             signature policy (03): a package whose digest no accepted
             signature or pinned digest covers MUST be refused.
```

```
REQUIREMENT: The expected digest MUST NOT be read from the same response,
             file or archive that delivers the package bytes, unless that
             value is itself covered by a signature the policy accepts.
```

A digest that arrives in the same response as the bytes it describes proves
only that the response is internally consistent; an attacker who controls
the response controls both. The expected value comes from somewhere the
application trusts — a signed desired-state list, a catalog entry whose
signatures were checked, a pinned list in configuration.

## BEH-LD-005: The SBOM is part of what is signed

> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: Every package MUST carry an SBOM. A package without one MUST
             be refused with `PackageMalformed` ("sbom-missing"). An
             application MAY declare `sbom: "optional"` for a named
             `PackageSource` kind; the SBOM part is then an empty byte string
             with format "none", and is still committed to by the digest.
```

```
REQUIREMENT: The loader MUST treat the SBOM as opaque bytes with a format
             label. It MUST NOT claim that the SBOM is accurate or
             complete; it attests only that the SBOM shipped with the code
             is the one the signers signed.
```

Including the SBOM in the digest means the bill of materials a reviewer read
cannot be swapped after signing for one that hides a component. Whether the
SBOM tells the truth about the build is a property of the producer's build
process; the loader can only bind it to the code it describes.

## BEH-LD-006: An application predicate may refuse a package after verification

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface PackagePredicate {
  readonly name: string
  readonly check: (verified: VerifiedPackage) => Effect.Effect<void, PackageRefused>
}
class PackageRefused extends Schema.TaggedError<PackageRefused>()("PackageRefused", {
  predicate: Schema.String,
  reason: Schema.String
}) {}
```

```
REQUIREMENT: Predicates MUST run after the digest and the signature policy
             have accepted the package and before any evaluation, in the
             order given. The first refusal MUST end the load with
             `PackageRefused`; later predicates MUST NOT run.
```

```
REQUIREMENT: A predicate MUST receive the verified bytes and the decoded
             manifest only. A predicate that dies or exceeds the verify
             timeout (02, BEH-LD-013) MUST be treated as a refusal.
```

This is where an application refuses a package whose SBOM lists a denied
component, whose manifest asks for a permission the deployment does not grant,
or whose `engines` range excludes this host. The loader provides the
ordering, not the policy.

## BEH-LD-007: The loader stamps meta.version and meta.digest

> **Invariant:** [INV-LD-003](../invariants.md#inv-ld-003-a-stamped-digest-is-the-verified-package-digest)
> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time), [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
// Distinct from core's ManifestMismatch { id, field } (core BEH-BR-246), so that
// `catchTag` tells a package check from core's lazy-load comparison.
class PackageManifestMismatch extends Schema.TaggedError<PackageManifestMismatch>()("PackageManifestMismatch", {
  field: Schema.Literal("id", "version", "digest", "provides", "requires", "optional"),
  manifest: Schema.String,
  definition: Schema.String
}) {}
```

```
REQUIREMENT: The loader MUST return a copy of the evaluated definition whose
             `meta.version` is the manifest's version, whose `meta.digest` is
             the package digest, and whose `manifest` is the package's
             manifest as decoded at step 2 — the signed one — with every
             other field unchanged. A `manifest` the evaluated definition
             declares itself MUST be replaced, never merged. The loader MUST
             NOT mutate the evaluated object.
```

```
REQUIREMENT: A package manifest MUST NOT carry `digest`: it is an input of
             the package digest and cannot contain it. A load MUST refuse a
             manifest that does at step 2 with `PackageMalformed`
             ("manifest-digest"), before any signature is checked. A lazy
             definition carries the package digest beside its manifest
             instead (05, BEH-LD-037; core BEH-BR-244).
```

```
REQUIREMENT: When the evaluated definition declares `meta.version`, it MUST
             equal the manifest's version. When it declares `meta.digest`,
             the load MUST fail with `PackageManifestMismatch` ("digest"): a
             definition cannot know the digest of the package that contains
             it, so a declared value is a label set by someone other than the
             loader.
```

```
REQUIREMENT: The definition's `id` MUST equal the manifest's id, and its
             declared `requires`, `provides` and `optional` MUST agree with
             the manifest's as core compares an eager definition with its
             manifest (core BEH-BR-242): the same `ServiceId`s and, for each
             contract reference, the same version or range and method
             names. Any difference MUST fail the load with
             `PackageManifestMismatch` naming the first differing field.
```

Stamping is the loader's whole contribution to core: from here on,
`meta.digest` is not a label someone typed but the digest of the bytes that
were verified and evaluated, and `manifest` is not what the code says about
itself but what the signers signed. Core reads "the registered manifest" for
`AccessPolicy.declaredOnly`, `Manifest.consentDiff` and the gate request
(core BEH-BR-219, BEH-BR-243, BEH-BR-268); for an eager definition that
manifest is whatever the definition carries, so a stamp that left it to the
code would let the code declare its own permissions. Comparing exactly what
core's agreement check compares means a stamped definition is never refused
by core with `InvalidDefinition` for a mismatch the loader let through. Because the stamped definition carries both
`version` and `digest`, `reconcile` treats two loads of the same package as
the same definition (18 — Reconciliation, [BEH-BR-154](../../core/behaviors/18-reconciliation-and-confluence.md#beh-br-154-the-keyed-diff-and-the-action-sequence-of-one-entry)),
so a desired list rebuilt from the loader on every sync is idempotent. Core
still does not check the label; the gate check of
[02 — Load Pipeline](./02-load-pipeline.md) (BEH-LD-015) is how a deployment
refuses definitions that did not come through the loader.

## BEH-LD-008: Digests and stamps are visible, never described as more

> **See:** [ADR-BR-027](../../core/decisions/027-core-exclusions.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The loader's documentation MUST describe a matching digest as
             "the loaded bytes are the bytes the digest names", and an
             accepted signature policy as "the required signers signed that
             digest". It MUST NOT describe a loaded package as safe,
             trusted, approved for use, or isolated.
```

```
REQUIREMENT: Core documentation and records keep saying that core does not
             verify `meta.digest` (BEH-BR-104). The loader MUST NOT ask core
             to say otherwise; the statement that a digest was verified
             belongs to the loader's own record (02, BEH-LD-016).
```

The split keeps both packages honest. Core's audit record says which label
was installed; the loader's record says that this label was checked, when,
and against which policy. A reviewer who needs both joins them by digest.

**Settled here.** (1) The SBOM is mandatory by default and is committed to by
the digest even when declared optional (as an empty part), so the digest
construction has one shape. (2) Sub-digests are hashed as text with the
algorithm prefix, so that a digest of one algorithm can never collide with a
digest of another inside the construction. (3) A definition that declares its
own `meta.digest` is refused, not overwritten; a `manifest` it declares is
replaced by the signed one. (4) The entry file and export are named in the
reserved key `extensions["@bridger/loader"]`, so no core change is needed.
(5) The loader's mismatch error is `PackageManifestMismatch`, distinct from
core's `ManifestMismatch`.

**Open.** (1) Whether a signed manifest field may carry the archive digest of
an existing registry format (npm tarball integrity, OCI layer digest) so that
packages can be served by unmodified registries.

**Answered (round 2).** Reference data shipped beside code but signed
separately is a separate package kind, the data pack, with its own digest
construction and no entry code ([08 — Data Packs](./08-data-packs.md),
BEH-LD-057–063); it does not add a fourth sub-digest to the package.

---

_Next: [02 — Load Pipeline](./02-load-pipeline.md)_
