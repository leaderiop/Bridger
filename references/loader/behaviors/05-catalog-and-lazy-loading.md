# 05 — Catalog and Lazy Loading

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-05                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.3 (2026-11-08): `Loader.lazy` uses core's `Plugin.lazy({ manifest, load, digest })` with the package digest beside a digest-free manifest; catalog entries recorded in `AcceptedDigests`; two digests at one version are different definitions; `Loader.stampRemote` for proxy definitions (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

Core's manifest is plugin metadata as data, and `Plugin.lazy` lets a host
know a plugin — its services, contributions and triggers — before its code is
loaded ([27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md),
BEH-BR-241–249). This file builds the loader's discovery on top: a **catalog** of
signed manifest entries that can be verified without fetching code, published
through a core `ContributionRegistry`, resolved by id and version range, and
turned into `Plugin.lazy` definitions whose `load` runs the full pipeline of
[02 — Load Pipeline](./02-load-pipeline.md). It also specifies the path for
bundles that must not be evaluated in the host at all: fetched and verified
here, run out of process by `@bridger/remote`. This file owns
BEH-LD-033–040 and uses all eight.

> **What this package does not do — and who does**
>
> The catalog lists what may be loaded. It does **not** rank, recommend,
> price or review plugins; those are the application's marketplace rules.
> It does **not** define the manifest schema ([core 27](../../core/behaviors/27-manifest-and-lazy-activation.md) does) or the remote
> transport ([references/remote/](../../remote/README.md) does).

Planned source: `packages/loader/src/Catalog.ts`,
`packages/loader/src/Lazy.ts` *(Planned)*.

## BEH-LD-033: A catalog entry carries a manifest and the other two sub-digests

> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked
interface CatalogEntry {
  readonly manifestBytes: Uint8Array
  readonly sbomDigest: string
  readonly filesDigest: string
  readonly packageDigest: string          // claimed; recomputed before use (BEH-LD-034)
  readonly signatures: readonly Signature[]
  readonly source: PackageSource          // where the files and SBOM can be fetched
}
interface CatalogFeedShape {
  readonly entries: Stream.Stream<readonly CatalogEntry[]>   // latest wins; an adapter (HTTP index, OCI, local directory)
}
```

```
REQUIREMENT: A catalog entry MUST carry the manifest bytes as published, the
             SBOM and files sub-digests, the package digest, the package
             signatures and a source. It MUST NOT carry code.
```

```
REQUIREMENT: Everything in an entry other than its verified result is
             untrusted input. In particular `packageDigest` is a claim to be
             recomputed, and a manifest's fields MUST NOT be acted upon
             before the entry is verified.
```

An entry is small — a manifest and three strings — so a device can hold the
whole catalog and answer "what could I install, and what would it ask for?"
without downloading any code.

## BEH-LD-034: A manifest is verified without fetching its code

> **Invariant:** [INV-LD-003](../invariants.md#inv-ld-003-a-stamped-digest-is-the-verified-package-digest)
> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md), [ADR-LD-003](../decisions/003-n-of-m-signature-policy-with-no-default.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
declare const Catalog: {
  readonly verifyEntry: (entry: CatalogEntry) => Effect.Effect<VerifiedEntry, CatalogEntryRejected, Loader>
}
interface VerifiedEntry {
  readonly manifest: Manifest             // decoded with core's PluginManifest schema (BEH-BR-241)
  readonly packageDigest: string          // recomputed
  readonly sbomDigest: string
  readonly filesDigest: string
  readonly source: PackageSource
  readonly verification: VerificationRecord
}
```

```
REQUIREMENT: `verifyEntry` MUST recompute the package digest from the
             manifest bytes and the two sub-digests (01, BEH-LD-002), MUST
             refuse the entry when it differs from the claimed one, and MUST
             then evaluate the loader's acceptance rule (03) and the current
             revocation set (04) on the recomputed digest, exactly as step 4
             and step 5 of a load.
```

```
REQUIREMENT: `verifyEntry` MUST refuse, as a manifest decode error, a
             manifest that carries `digest`: a manifest digested as part of
             its package cannot contain that package's digest (01,
             BEH-LD-002), and core requires a manifest `digest`, when
             present, to equal the lazy definition's `meta.digest` (core
             BEH-BR-244).
```

```
REQUIREMENT: A refused entry MUST fail with `CatalogEntryRejected`
             carrying the cause's tag (`DigestMismatch`,
             `SignatureRejected`, `Revoked`, `RevocationStale`,
             `RevocationUnavailable`, or the manifest decode error) and MUST
             be recorded in the `LoadLog` when one is wired (02,
             BEH-LD-016).
```

This is the use of committing to sub-digests: the signers signed the package
digest, the package digest commits to the manifest, so a verified entry's
manifest is the manifest of the package they signed — established without a
byte of code. What the manifest *says* (services, permissions, egress) is as
truthful as its signers; what the code *does* is checked against it only when
the code is loaded (01, BEH-LD-007).

## BEH-LD-035: Verified entries are published through a contribution registry

> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md)
> **Satisfies:** [URS-BR-014](../../core/urs.md#urs-br-014-contribute-to-a-shared-extension-point-safely)

```ts
// illustrative — not type-checked
// A ContributionRegistry (core behaviour 19) whose contributions are VerifiedEntry values,
// keyed "<id>@<version>", registered by the catalog plugin's activation scope.
declare const CatalogRegistry: ContributionRegistry.Registry<VerifiedEntry>   // identifier "@bridger/loader/Catalog"
```

```
REQUIREMENT: The catalog plugin MUST contribute only verified entries to
             `@bridger/loader/Catalog`, and MUST withdraw an entry when a
             later feed omits it or when the revocation set revokes its
             digest or the signers it depended on.
```

```
REQUIREMENT: For each contributed entry, the catalog MUST record its
             digest in `AcceptedDigests` with `via: "catalog-entry"` and the
             entry's verification record (02, BEH-LD-015), and MUST remove
             that acceptance when it withdraws the entry. While contributed,
             the entry's digest is therefore accepted by `LoaderGate` for
             `install` and `replace` without its code having been fetched.
```

```
REQUIREMENT: Readers of the registry (admin screens, agents, a
             marketplace view) MUST obtain manifests only through it; the
             loader MUST NOT expose unverified entries through any public
             API other than the rejection reports.
```

Reusing core's registry gives the catalog ordering, revisions, a `changes`
stream and scope-bound withdrawal without new machinery
([BEH-BR-165](../../core/behaviors/19-contribution-registry.md#beh-br-165-views-are-ordered-revisioned-and-observable)).
When the catalog plugin is removed, its contributions go with it, so there is
never a catalog view that outlives the component that verified it.

## BEH-LD-036: Resolution picks the highest acceptable version in a range

> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225–232)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```ts
// illustrative — not type-checked
declare const Catalog: {
  readonly resolve: (id: string, range: string) => Effect.Effect<VerifiedEntry, NoMatchingEntry, CatalogRegistry>
}
```

```
REQUIREMENT: `resolve` MUST choose, among the registry's current entries
             for `id`, the highest version satisfying `range` under the
             range syntax of 26 — Versioned contracts. Revoked
             entries are not in the registry and MUST NOT be chosen.
```

```
REQUIREMENT: Two entries with the same id and version but different package
             digests MUST both be withdrawn, and `resolve` MUST fail for that
             version with `NoMatchingEntry` ("ambiguous"), until the feed
             removes one of them.
```

One version naming two code bodies is exactly the ambiguity core refuses to
guess about in `reconcile` (core
[BEH-BR-154](../../core/behaviors/18-reconciliation-and-confluence.md#beh-br-154-the-keyed-diff-and-the-action-sequence-of-one-entry));
the catalog refuses it one step earlier.

## BEH-LD-037: Loader.lazy turns a verified entry into a lazy plugin

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
declare const Loader: {
  readonly lazy: (entry: VerifiedEntry) => LazyPluginDefinition
  // = Plugin.lazy({                              // core BEH-BR-244
  //     manifest: entry.manifest,                 // carries no `digest` (BEH-LD-034)
  //     digest: entry.packageDigest,              // the lazy definition's identity: meta = { version, digest }
  //     load: Loader.load({ source: entry.source, expect: entry.packageDigest }).pipe(Effect.map((l) => l.definition))
  //   })
}
```

```
REQUIREMENT: `Loader.lazy` MUST build its definition with core's
             `Plugin.lazy({ manifest, load, digest })`, passing the verified
             manifest, which carries no `digest`, and `digest` set to the
             entry's recomputed package digest. The lazy definition's `meta`
             is then `{ version: manifest.version, digest: packageDigest }`
             before any code is loaded (core BEH-BR-244), and its `load`
             MUST run the full pipeline of 02 — Load Pipeline with `expect`
             set to the entry's package digest.
```

```
REQUIREMENT: The definition `load` returns MUST be the stamped copy of 01,
             BEH-LD-007, whose `meta.digest` is the package digest, so that
             it equals the lazy definition's `meta.digest` as core requires
             (core BEH-BR-246). A `manifest` the stamped copy carries is
             ignored by core; the registered manifest stays in effect.
```

```
REQUIREMENT: When the trigger of 27 — Manifest and lazy activation
             fires and `load` fails, the failure MUST surface as that
             behaviour's load failure, carrying the loader's error tag; no
             code MUST have been evaluated (INV-LD-001).
```

```
REQUIREMENT: The definition `load` returns MUST be checked against the
             entry's manifest (01, BEH-LD-007) before it is handed back to
             the host.
```

The digest is known from the moment the entry is verified, so the host's gate
request and audit records for the lazy install already name it (core
[BEH-BR-219](../../core/behaviors/25-operation-gate.md#beh-br-219-the-operationrequest-without-configuration-values),
[BEH-BR-248](../../core/behaviors/27-manifest-and-lazy-activation.md#beh-br-248-reconcile-gate-and-audit-work-from-manifests-without-evaluating-code)),
and the code that eventually runs is held to the same digest. The digest
travels beside the manifest, not in it, because the manifest is one of the
inputs of that digest: core takes a lazy definition's digest from
`Plugin.lazy`'s `digest` option for exactly this case (core BEH-BR-244,
Settled item 0). Revocation is
re-checked when the trigger fires, so an entry revoked between install and
first use is never evaluated.

## BEH-LD-038: A desired list from the catalog reconciles without evaluating code

> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-016](../../core/urs.md#urs-br-016-drive-the-plugin-set-from-a-declarative-list)

```
REQUIREMENT: A `DesiredPlugin` list built from `Loader.lazy` definitions
             MUST reconcile against an unchanged host as `unchanged` for
             every entry, without fetching or evaluating any package, because
             each lazy definition's `meta` carries both `version` and
             `digest` (core BEH-BR-154, BEH-BR-244). Two entries with the
             same id and version but different package digests MUST be
             different definitions to `reconcile`, so that a changed package
             under an unchanged version is replaced.
```

```
REQUIREMENT: When the catalog publishes a new version, the rebuilt desired
             list MUST differ only in the entries whose digest changed, and
             only those MUST be replaced.
```

This is the property a device that syncs a desired list several times a day
needs: syncing is cheap when nothing changed, and a change touches only what
changed. With revocation applied as a filter (04, BEH-LD-028), the same list
also carries the kill switch.

## BEH-LD-039: Guest bundles are fetched and verified here, and run out of process

> **See:** [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)
> **Core seam:** [references/remote/](../../remote/README.md) (RM)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface VerifiedPackage {
  readonly digest: string
  readonly manifest: Manifest
  readonly sbom: { readonly format: string; readonly bytes: Uint8Array }
  readonly files: ReadonlyMap<string, Uint8Array>
  readonly verification: VerificationRecord
}
```

```
REQUIREMENT: `Loader.fetchVerified` MUST run steps 1–6 of the pipeline and
             return the verified bytes. It MUST NOT evaluate anything and
             MUST NOT add the digest to `Loader.resident`. It MUST record the
             digest in `AcceptedDigests` (02, BEH-LD-015) as for a load.
```

```ts
// illustrative — not type-checked
declare const Loader: {
  // Copies a proxy definition (references/remote/) with meta.version and meta.digest
  // taken from the verified guest bundle; checks id and version against its manifest.
  readonly stampRemote: <D extends PluginDefinition<any, any, any, any>>(verified: VerifiedPackage, proxy: D) =>
    Effect.Effect<D, ManifestMismatch>
}
```

```
REQUIREMENT: `Loader.stampRemote` MUST return a copy of the proxy
             definition whose `meta.version` is the guest manifest's
             version and whose `meta.digest` is the verified package digest,
             with every other field unchanged, and MUST fail with
             `ManifestMismatch` when the proxy's `id` differs from the
             manifest's or the proxy declares a different `meta.version` or
             any `meta.digest`. Documentation MUST state that the stamp
             names the guest bundle the loader verified, and that whether the
             guest runs those bytes is the remote transport's obligation.
```

```
REQUIREMENT: Documentation MUST state that code from a party other than
             the application's own developers is to be loaded with
             `fetchVerified` and run by `@bridger/remote` in a separate
             process, isolate or worker behind a proxy plugin, never with
             `load`. The loader's guarantee ends when it hands over the
             bytes; that the guest runs exactly those bytes is the remote
             transport's obligation.
```

`stampRemote` exists so that the kill switch and `LoaderGate` cover proxies
for third-party guests — their main use case — without application code
copying a digest by hand: the proxy's `meta.digest` comes from the same
verified value as a loaded definition's (INV-LD-003).

This is the loader's half of the rule that third-party code never runs in the
host's process. Verification is the same for both paths — a partner's bundle
is signed and revocable like a first-party package — but only first-party
code is evaluated next to the host, because only for first-party code is
"signed by the right people" the property that matters. For anyone else's
code the property that matters is containment, which a loader inside the
process cannot provide.

## BEH-LD-040: Discovery is data, readable by people and agents

> **See:** [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```
REQUIREMENT: The catalog MUST be readable as plain data — verified
             manifests, digests, versions and the verification record — so
             that an admin screen, a marketplace view or an agent can list,
             compare and propose plugins without loading code.
```

```
REQUIREMENT: Text from a manifest (descriptions, names) MUST be presented
             as data from the package's signers, and MUST NOT be treated as
             instructions by any loader component.
```

An agent proposing a plugin set reads manifests; it must never be steered by
them. Treating manifest text as untrusted data is the same rule MCP applies to
tool annotations, applied at the source.

**Settled here.** (1) A catalog entry is verified without code by recomputing
the package digest from the manifest bytes and two sub-digests. (2) The
catalog is a core `ContributionRegistry` of verified entries only, and its
entries count as accepted by `LoaderGate` while contributed. (3) An id and
version with two digests is ambiguous and withdrawn. (4) Lazy plugins are
built with core's `Plugin.lazy({ manifest, load, digest })`: the digest lives
beside the manifest, is the lazy definition's identity from the start, and
the loaded definition is held to it. (5) Third-party bundles take the
`fetchVerified` path to an out-of-process guest, and their proxies are
stamped by `stampRemote`.

**Open.** (1) Whether the catalog should also carry a transparency-log
checkpoint per feed, so that a device can detect a feed that shows different
entries to different devices.

---

_Previous: [04 — Revocation and Kill Switch](./04-revocation-and-kill-switch.md)_ · _Next: [06 — Limits and Acceptance](./06-limits-and-acceptance.md)_
