# Loader — Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-OVW                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.2 (2026-11-08): API surface: `AcceptedDigests`, `LoaderGate.make`/`piece`, `Loader.stampRemote`, `KillSwitch.release`; worked example wires the gate before the host and leaves the scope to the kill switch alone (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Mission

Get plugin code from a source to a host so that three questions always have
an answer: **which bytes** were loaded (a digest that commits to manifest,
SBOM and code), **who vouched for them** (a policy of N-of-M signer entries, so that
a release can require a publisher's key and an independent reviewer's key —
that the keys belong to different people is the application's configuration), and **how to
stop them** (revocation that refuses new loads and drives `reconcile` to
remove what is running). The loader answers them before evaluation, because
in JavaScript evaluating a module runs it.

## Package boundary

| | |
| - | - |
| Depends on | `@bridger/core` (public API only), `effect` |
| Never depended on by | `@bridger/core` |
| Optional adapters | `@bridger/loader-ed25519`, `@bridger/loader-sigstore`, fetchers (content-addressed store, file system, HTTPS, OCI), evaluators per runtime |
| Works with | `@bridger/remote` (out-of-process guests), `@bridger/audit-chain` (sealing core's trail), `@bridger/federation` (desired-state manifests) |

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Loader` | service | `load(ref)` → stamped definition; `fetchVerified(ref)` → verified bytes, no evaluation; `resident` ([02](./behaviors/02-load-pipeline.md), [05](./behaviors/05-catalog-and-lazy-loading.md)) |
| `LoaderPlugin`, `Loader.layer` | function | The loader as a plugin providing `Loader`, or as a plain layer ([06](./behaviors/06-limits-and-acceptance.md)) |
| `Package`, `PackageRef`, `PackageSource`, `VerifiedPackage`, `LoadedPlugin` | types | Package parts and results ([01](./behaviors/01-package-and-digest.md)) |
| `Digest.package`, `Digest.manifest`, `Digest.sbom`, `Digest.files` | functions | The digest construction, pure ([01](./behaviors/01-package-and-digest.md)) |
| `Fetcher`, `Evaluator`, `ExternalModules` | ports, type | Byte sources and evaluation from held bytes ([02](./behaviors/02-load-pipeline.md)) |
| `PackagePredicate` | type | Application checks after verification, before evaluation (SBOM, permissions, engines) |
| `SignaturePolicy.pinned`, `.signed`, `.anyOf`, `SignaturePolicy`, `TrustedSigner`, `Requirement` | functions, types | Acceptance rules; no permissive rule exists ([03](./behaviors/03-signature-policy.md)) |
| `SignatureVerifier`, `VerifiedSigner` | port, type | Scheme adapters (Ed25519, Sigstore) |
| `RevocationSource`, `RevocationSource.verified`, `RevocationStore`, `RevocationSet` | port, function, port, type | Signed, monotonic revocation sets persisted by the application ([04](./behaviors/04-revocation-and-kill-switch.md)) |
| `Revocation.filterDesired`, `KillSwitch.run`, `KillSwitch.status`, `KillSwitch.release` | functions, stream | Kill switch through `reconcile`, the one reconciler of its scope; blast-radius release |
| `AcceptedDigests`, `AcceptedDigests.layer` | service, layer | Store of accepted digests and their verification records, built before the host and shared by the gate piece, the loader and the catalog |
| `LoaderGate.make`, `LoaderGate.piece` | functions | Core `Gate<OperationRequest>` piece refusing installs whose digest the loader did not accept, and operator restarts of revoked digests; explicit exemptions |
| `LoadLog`, `VerificationRecord` | port, type | The loader's own record, separate from core's trail |
| `Catalog.verifyEntry`, `Catalog.resolve`, `CatalogRegistry`, `CatalogEntry`, `VerifiedEntry` | functions, registry, types | Signed manifests verified without code ([05](./behaviors/05-catalog-and-lazy-loading.md)) |
| `Loader.lazy` | function | A verified entry as a `Plugin.lazy({ manifest, load, digest })` definition |
| `Loader.stampRemote` | function | Stamps a remote proxy definition with a verified guest bundle's version and digest |
| `@bridger/loader/testing` | entry point | `memoryFetcher`, `scriptedVerifier`, `fixedRevocations`, `recordingEvaluator`, `packageBuilder` |

Errors: `FetchFailed`, `PackageMalformed`, `UnsupportedDigestAlgorithm`,
`DigestMismatch`, `SignatureRejected`, `Revoked`, `RevocationUnavailable`,
`RevocationStale`, `PackageRefused`, `EvaluationFailed`,
`NotAPluginDefinition`, `ManifestMismatch`, `LoadLogFailed`,
`CatalogEntryRejected`, `NoMatchingEntry`.

## Worked example

```ts
// illustrative — not type-checked
const releasePolicy = SignaturePolicy.signed({
  id: "release-v1",
  signers: [publisherKey, reviewerKeyA, reviewerKeyB],          // TrustedSigner values from configuration
  require: { allOf: [{ role: "publisher", threshold: 1 }, { role: "reviewer", threshold: 1 }] }
})

const loader = LoaderPlugin({
  fetchers: [httpsFetcher()],
  verifiers: [ed25519Verifier()],
  acceptance: releasePolicy,
  externals: new Map([["effect", Effect], ["@bridger/core", BridgerCore]]),
  revocation: { maxAge: "7 days" },
  buildTimeout: "60 seconds"                                    // the host's buildTimeout: lazy loads run inside it
})

// Built once, before the host: the gate piece and the host share these instances.
const main = Effect.gen(function* () {
  const shared = yield* Layer.build(Layer.merge(AcceptedDigests.layer, revocations))
  const signature = yield* LoaderGate.piece({ exempt: { ids: ["loader", "catalog"] }, timeout: "2 seconds" })
    .pipe(Effect.provide(shared))
  const gate = OperationGate.fromGate(Gate.all([signature, approvalPiece]))
  const HostLive = Bridger.layer({ base: shared /* , ... */ }).pipe(Layer.provide(Layer.succeed(OperationGate, gate)))
  yield* program.pipe(Effect.provide(HostLive))
})

const program = Effect.gen(function* () {
  const host = yield* Bridger.Host
  yield* host.install(loader)                                    // exempt by id
  yield* host.install(catalogPlugin)                             // exempt by id
  const catalog = yield* CatalogRegistry
  // The kill switch is the only reconciler of scope "catalog". Desired lists come from
  // verified manifests: no code is fetched until a trigger fires.
  yield* KillSwitch.run({
    desired: catalog.changes.pipe(Stream.map(toDesired)),       // entry → { id, plugin: Loader.lazy(entry) }
    scope: "catalog",
    actor: { id: "catalog-sync", kind: "service" },             // desired-list changes
    revocationActor: { id: "release-revocation", kind: "service" },   // revocation removals only
    maxDroppedPerRevision: 5,
    retryInterval: "1 minute"
  }).pipe(Effect.forkScoped)
})
```

The application's gate composes `LoaderGate.piece` with its approval piece, so
an install whose digest did not come through the loader is refused by the
host itself, and an operator cannot `enable` or `restart` a revoked digest.
The application does not call `reconcile` for the scope it hands to the kill
switch.

## What stays in core

Plugin definitions as inert records; the host's lifecycle, leases, drain and
legality table; `reconcile`; the gate port and the guarantee that it cannot be
bypassed through the host; audit records carrying `version` and `digest`.
Core still does not verify `meta.digest` and says so
([BEH-BR-104](../core/behaviors/11-configuration.md#beh-br-104-meta-is-opaque-except-where-named)).

## What stays in the application

Trust roots, keys and identities, and who may sign; the signature policy;
the revocation channel and the store that keeps the last list; `maxAge`;
SBOM and permission predicates; whether its gate lets kill-switch removals
through without a human; marketplace rules (review, ranking, pricing);
scheduled restarts to clear resident code.

## Limits

The loader is not a sandbox and does not isolate plugins. It cannot reclaim
evaluated code or prevent evaluated code from fetching more code at run time.
`load` is for first-party code; everything else goes through `fetchVerified`
to an out-of-process guest. See
[06 — Limits and Acceptance](./behaviors/06-limits-and-acceptance.md).

---

_Previous: [README](./README.md)_ · _Next: [01 — Package and Digest](./behaviors/01-package-and-digest.md)_
