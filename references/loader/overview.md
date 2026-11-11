# Loader — Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-OVW                                               |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.8 (2026-11-11): `AcceptedDigests.pinnedFrom` and per-plugin federation sources; `LoaderGate` admits import proxies' digests; the example passes `maxDroppedPerRun` (H2, PL7, L2) (SPEC-AUDIT-07); follow-up: per-loader pinned sources, cleared on stop, the example exempting the default loader id "@bridger/loader"; the kill switch removes only its scope's plugins and reports the others (SPEC-AUDIT-07 residual) (CCR-LD-010)<br>0.7 (2026-11-11): `AcceptedDigests` row names `setPinned` (keyed by source) and `pinned` (their union) (L2); the example passes the gate's `maxAge` (L4); kill switch row: revocation removals through `Host.remove` (H6) (SPEC-AUDIT-06) (CCR-LD-009)<br>0.6 (2026-11-11): `RevokedDigests` row says agreement on the same inputs, not one view read by every consumer (PL16); `Loader.pinnedDigests`; `AcceptedDigests` operations; `DataPacks.layer` and `DataPacksOptions` (PL22); errors list adds `RevocationStoreFailed` and `SignatureInvalid` (PL21) (SPEC-AUDIT-05) (CCR-LD-008)<br>0.5 (2026-11-09): "first-party" statement, trust class, `Loader.lazy` refusing guest entries, `LoaderRemote.link` and `linkManifest`, `RevokedDigests`, the manifest's `extensions["@bridger/loader"]` entry, `PackageManifestMismatch`, `NotFirstParty`, `GuestEntryInvalid`; worked example maps entries by trust class (specification audit F-06, M-02, M-03, M-06, C-16); guest wording: outside the host's runtime, in the deployment's bundle runtime (independent review) (CCR-LD-004)<br>0.4 (2026-11-08): `SignedStatement`, `SignedRevocationList`, `RevocationSet.encode`/`decode`, `RevocationSource.offer` and `.constant`, "chain-bundle" and `RevocationListMalformed` in the API surface (round-2 agent review) (CCR-LD-003)<br>0.3 (2026-11-08): Signed statements, `SignaturePolicy.verify`, `StatementSigner`, `Revocation.refusalList` and data packs in the API surface and errors (round 2: recheck items 11, 12, 15) (CCR-LD-003)<br>0.2 (2026-11-08): API surface: `AcceptedDigests`, `LoaderGate.make`/`piece`, `Loader.stampRemote`, `KillSwitch.release`; worked example wires the gate before the host and leaves the scope to the kill switch alone (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

## Mission

Get plugin code from a source to a host so that three questions always have
an answer: **which bytes** were loaded (a digest that commits to manifest,
SBOM and code), **who vouched for them** (a policy of N-of-M signer entries, so that
a release can require a publisher's key and an independent reviewer's key —
that the keys belong to different people is the application's configuration), and **how to
stop them** (revocation that refuses new loads and removes what is running
through the host's ordinary `remove`). The loader answers them before evaluation, because
in JavaScript evaluating a module runs it. The same three questions are
answered for every other signed thing a deployment judges — host manifests,
licence tokens, and data packs of reference data, which are verified and
served as bytes but never evaluated — through one verification step,
`SignaturePolicy.verify`.

## Package boundary

| | |
| - | - |
| Depends on | `@bridger/core` (public API only), `effect` |
| Never depended on by | `@bridger/core` |
| Optional adapters | `@bridger/loader-ed25519`, `@bridger/loader-sigstore`, fetchers (content-addressed store, file system, HTTPS, OCI), evaluators per runtime |
| Works with | `@bridger/remote` (guests outside the host's runtime), `@bridger/audit-chain` (sealing core's trail), `@bridger/federation` (desired-state manifests) |

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Loader` | service | `load(ref)` → stamped definition; `fetchVerified(ref)` → verified bytes, no evaluation; `resident`; `pinnedDigests`, the rule's pinned digests ([02](./behaviors/02-load-pipeline.md), [05](./behaviors/05-catalog-and-lazy-loading.md)) |
| `LoaderPlugin`, `Loader.layer` | function | The loader as a plugin providing `Loader`, or as a plain layer ([06](./behaviors/06-limits-and-acceptance.md)) |
| `Package`, `PackageRef`, `PackageSource`, `VerifiedPackage`, `LoadedPlugin` | types | Package parts and results ([01](./behaviors/01-package-and-digest.md)) |
| `LoaderManifestExtension` | schema | The entry file and export, under the reserved manifest key `extensions["@bridger/loader"]` ([01](./behaviors/01-package-and-digest.md)) |
| `Digest.package`, `Digest.manifest`, `Digest.sbom`, `Digest.files` | functions | The digest construction, pure ([01](./behaviors/01-package-and-digest.md)) |
| `Fetcher`, `Evaluator`, `ExternalModules` | ports, type | Byte sources and evaluation from held bytes ([02](./behaviors/02-load-pipeline.md)) |
| `PackagePredicate` | type | Application checks after verification, before evaluation (SBOM, permissions, engines) |
| `SignaturePolicy.pinned`, `.signed`, `.anyOf`, `SignaturePolicy`, `TrustedSigner`, `Requirement` | functions, types | Acceptance rules; no permissive rule exists ([03](./behaviors/03-signature-policy.md)) |
| `SignatureVerifier`, `VerifiedSigner` | port, type | Scheme adapters (Ed25519, Sigstore) |
| `RevocationSource`, `RevocationSource.verified`, `.constant`, `RevocationSourceShape.offer`, `RevocationStore`, `RevocationSet`, `RevocationSet.encode`, `.decode`, `SignedRevocationList`, `RawRevocationFeed` | port, functions, port, types | Signed, monotonic revocation sets persisted by the application, verified under their own trust root with no revocation step; other companions hand lists in through `offer` ([04](./behaviors/04-revocation-and-kill-switch.md)) |
| `Revocation.filterDesired`, `KillSwitch.run`, `KillSwitch.status`, `KillSwitch.release` | functions, stream | Kill switch: desired lists through `reconcile`, the one reconciler of its scope; revocation removals through `Host.remove` of the scope's own plugins only, outside-scope matches reported in `status.outsideScope`; blast-radius release |
| `AcceptedDigests`, `AcceptedDigests.layer` | service, layer | Store of accepted digests and their verification records, one acceptance per digest and origin (`record`, `remove`, `markNotCurrent`, `lookup`, `entries`), and the pinned digests published per source — each loader's under "@bridger/loader:" + its id, each federation plugin's proxies' under "@bridger/federation:" + its id, each source cleared when its plugin stops (`setPinned(source, digests)`, `pinned` as their union, `pinnedFrom(prefix)` per source), built before the host by the application and shared by the gate piece, the loader, the catalog and the federation plugins |
| `LoaderGate.make`, `LoaderGate.piece` | functions | Core `Gate<OperationRequest>` piece refusing installs whose digest the loader did not accept and no federation plugin published as an import proxy's, and operator restarts of revoked digests; explicit exemptions |
| `LoadLog`, `VerificationRecord` | port, type | The loader's own record, separate from core's trail |
| `Catalog.verifyEntry`, `Catalog.resolve`, `CatalogRegistry`, `CatalogEntry`, `VerifiedEntry` | functions, registry, types | Signed manifests verified without code ([05](./behaviors/05-catalog-and-lazy-loading.md)) |
| `Loader.lazy` | function | A first-party entry as a `Plugin.lazy({ manifest, load, digest })` definition; refuses guest entries with `NotFirstParty` ([09](./behaviors/09-trust-class-and-guest-links.md)) |
| `Loader.stampRemote` | function | Stamps a remote proxy definition with a verified guest bundle's version, digest and link manifest |
| `LoaderRemote.link`, `LoaderRemote.linkManifest` (entry point `@bridger/loader/remote`) | functions | A guest entry as a remote link that fetches and verifies the bundle at each session; the link manifest derived from the guest's ([09](./behaviors/09-trust-class-and-guest-links.md)) |
| `RevokedDigests`, `RevokedDigests.layer` | service, layer | The view of revoked package digests — by digest, statement digest or signer — read by the refusal list and the remote boundary; the kill switch and the gate agree with it on the same inputs — agreement, not one computation ([09](./behaviors/09-trust-class-and-guest-links.md)) |
| `Statement`, `Statement.make`, `.signingInput`, `.digest`, `StatementType`, `SignedStatement` | functions, types | Typed signed statements (`package`, `first-party` ([09](./behaviors/09-trust-class-and-guest-links.md)), `host-manifest`, `data-pack`, `licence`, `revocation-list`, `chain-bundle`, or an application's own type) about a subject digest, with one `id`/`version` convention per reserved type; `SignedStatement` is the transport envelope ([07](./behaviors/07-signed-statements.md)) |
| `SignaturePolicy.verify`, `StatementVerifier`, `StatementVerifier.layer`, `StatementRules` | function, service, layer, type | The one verification step for every statement type, with one rule per type; used by loads, the catalog, data packs, the kit and the federation companion |
| `StatementSigner` | port | Signing adapter over the signing input; the loader holds no key; countersigning appends a signer entry |
| `Revocation.check`, `Revocation.refusalList` | function, layer | Pure re-check of a recorded statement; core's `RefusalList` backed by the revocation set |
| `DataPacks`, `DataPacks.layer`, `DataPacksOptions`, `DataPacks.status`, `.requireFresh`, `.decode`, `DataPackManifest`, `VerifiedDataPack`, `DataPackStore`, `DataPackFeed` | service, functions, types, ports | Signed data packs: verified, served as bytes, never evaluated; window and freshness reported ([08](./behaviors/08-data-packs.md)) |
| `@bridger/loader/testing` | entry point | `memoryFetcher`, `scriptedVerifier`, `fixedRevocations`, `recordingEvaluator`, `packageBuilder` |

Errors: `FetchFailed`, `PackageMalformed`, `UnsupportedDigestAlgorithm`,
`DigestMismatch`, `SignatureRejected`, `SignatureInvalid` (a verifier's, counted
for nothing), `Revoked`, `RevocationUnavailable`, `RevocationStale`,
`RevocationListMalformed`, `RevocationStoreFailed`, `PackageRefused`, `EvaluationFailed`,
`NotAPluginDefinition`, `PackageManifestMismatch` (distinct from core's
`ManifestMismatch`), `LoadLogFailed`, `CatalogEntryRejected`,
`NoMatchingEntry`, `NotFirstParty`, `GuestEntryInvalid`, `PublisherMismatch`,
`StatementRevoked`, `SigningFailed`, `DataPackStale` (a report, also the
failure of `requireFresh`), `DataPackStoreFailed`.

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
  acceptance: releasePolicy,                                    // "package": who may publish code the host verifies
  statementRules: { "first-party": SignaturePolicy.signed(inHouseReleasePolicy) },   // whose code may run in-process (09)
  externals: new Map([["effect", Effect], ["@bridger/core", BridgerCore]]),
  revocation: { maxAge: "7 days" },
  buildTimeout: "60 seconds"                                    // the host's buildTimeout: lazy loads run inside it
})

// Built once, before the host: the gate piece and the host share these instances.
const main = Effect.gen(function* () {
  const shared = yield* Layer.build(Layer.merge(AcceptedDigests.layer, revocations))
  const signature = yield* LoaderGate.piece({ exempt: { ids: ["@bridger/loader", "catalog"] }, maxAge: "7 days", timeout: "2 seconds" })
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
    // first-party entry → Loader.lazy(entry); guest entry → LoaderRemote.link(entry, guestSettings)
    // (09: BEH-LD-067, BEH-LD-068); a guest without settings is left out and reported
    desired: catalog.changes.pipe(Stream.mapEffect(toDesired)),
    scope: "catalog",
    actor: { id: "catalog-sync", kind: "service" },             // desired-list changes
    revocationActor: { id: "release-revocation", kind: "service" },   // revocation removals only
    maxDroppedPerRun: 5,
    retryInterval: "1 minute"
  }).pipe(Effect.forkScoped)
})
```

The application's gate composes `LoaderGate.piece` with its approval piece, so
an install whose digest did not come through the loader is refused by the
host itself, and an operator cannot `enable` or `restart` a revoked digest.
The application does not call `reconcile` for the scope it hands to the kill
switch. Entries reach the desired list by their signed trust class: only an
entry whose "first-party" statement the application's own rule accepts
becomes an in-process lazy plugin; every other entry becomes a remote link
whose sessions fetch and verify the bundle and hand it to the deployment's
bundle runtime, outside the host's runtime (which, with `@bridger/worker`,
is still the host's operating-system process).

## What stays in core

Plugin definitions as inert records; the host's lifecycle, leases, drain and
legality table; `reconcile`; the gate port and the guarantee that it cannot be
bypassed through the host; audit records carrying `version` and `digest`.
Core still does not verify `meta.digest` and says so
([BEH-BR-104](../core/behaviors/11-configuration.md#beh-br-104-meta-is-opaque-except-where-named)).

## What stays in the application

Trust roots, keys and identities, and who may sign; the signature policy;
the revocation channel and the store that keeps the last list; `maxAge`;
the rule for each statement type and the publisher names each signer may use,
including the "first-party" rule that says whose code may run in-process;
the contract and bundle runtime of each guest it runs;
whether stale data packs may be used;
SBOM and permission predicates; whether its gate lets kill-switch removals
through without a human; marketplace rules (review, ranking, pricing);
scheduled restarts to clear resident code.

## Limits

The loader is not a sandbox and does not isolate plugins. It cannot reclaim
evaluated code or prevent evaluated code from fetching more code at run time.
`load` evaluates only packages whose "first-party" statement is accepted;
everything else goes through `fetchVerified` to a guest outside the host's runtime, from
the catalog through `LoaderRemote.link`. See
[06 — Limits and Acceptance](./behaviors/06-limits-and-acceptance.md).

---

_Previous: [README](./README.md)_ · _Next: [01 — Package and Digest](./behaviors/01-package-and-digest.md)_
