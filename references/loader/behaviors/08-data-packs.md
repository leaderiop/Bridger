# 08 — Data Packs

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-08                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.5 (2026-11-11): BEH-LD-062: `StoredDataPack.acceptedAt`, passed as `reverify.acceptedAt` at the construction re-verification, so a signer window that closed after acceptance does not withhold a saved pack (PL20); check 18 extended (SPEC-AUDIT-06) (CCR-LD-009)<br>0.4 (2026-11-11): BEH-LD-061: `DataPacks.layer(options: DataPacksOptions)` declared, with its error and requirements (PL22) (SPEC-AUDIT-05) (CCR-LD-008)<br>0.3 (2026-11-09): Footer links file 09 (CCR-LD-004)<br>0.2 (2026-11-08): Round-2 agent review (R3-04, R3-05): the store keeps manifest bytes, payload and signatures so that saved packs are verified again at restart, with `reverify` (held revocations apply, `maxAge` does not) and a stated result when it fails; an equal version with a different digest is refused as "equivocation"; checks 23 and 24 extended (CCR-LD-003)<br>0.1 (2026-11-08): Initial draft (CCR-LD-003)                 |

---

Applications ship reference data as well as code: a price list, a table of
rules, a list of product interactions, a set of tax rates. Such data needs the
same answers as code — which bytes, who vouched for them, how to stop them —
and one more: is it still current? A package cannot carry it, because a package
must have entry code (01, BEH-LD-001), and evaluating data as code would be the
wrong control in both directions. This file specifies the **data pack**: a
package kind with a manifest and a payload and no entry code, verified as a
signed statement ([07 — Signed Statements](./07-signed-statements.md)), served
as bytes, never evaluated, and reported stale when it outlives its stated
`maxAge` ([ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md)).
This file owns BEH-LD-057–064 and uses all eight.

> **What this package does not do — and who does**
>
> The loader verifies a data pack and reports its window and freshness. It
> does **not** decide whether stale data may be used — that is the
> application's rule, per pack and per use — and does **not** interpret the
> payload beyond decoding it with the application's own schema. Which
> decision a plugin makes from the data, and whether that decision is
> recorded, are the application's.

Planned source: `packages/loader/src/DataPack.ts` *(Planned)*.

## BEH-LD-057: A data pack is a package kind with a payload and no entry code

> **See:** [ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md), [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
const DataPackManifest = Schema.Struct({
  dataPackVersion: Schema.Literal(1),
  id: Schema.String,
  version: Schema.String,                     // ordered with the version syntax of core 26
  schemaId: Schema.String,                    // names the application's decoder, e.g. "price-list/v3"
  mediaType: Schema.String,                   // the payload's media type, e.g. "application/json"
  issuedAt: Schema.String,                    // ISO-8601 UTC; freshness is measured from it
  effectiveFrom: Schema.String,               // ISO-8601 UTC
  effectiveUntil: Schema.optional(Schema.String),
  maxAge: Schema.String,                      // a duration ("30 days"), or "unbounded" written as such
  publisher: Schema.optional(Schema.String),  // bound to a signer (07, BEH-LD-053)
  description: Schema.optional(Schema.String),
  extensions: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})
interface DataPack {
  readonly manifestBytes: Uint8Array          // the manifest exactly as published
  readonly payload: Uint8Array
}
```

```
REQUIREMENT: A data pack MUST consist of exactly two parts: the manifest
             bytes, decoded with `DataPackManifest`, and one payload. It
             MUST NOT carry files, an entry, an SBOM of code, `provides`,
             `requires`, `activation` or any other field of core's plugin
             manifest (core BEH-BR-241). A data pack that does MUST be
             refused with `PackageMalformed` ("data-pack-shape").
```

```
REQUIREMENT: `effectiveFrom` MUST be earlier than `effectiveUntil` when the
             latter is present, `issuedAt` MUST NOT be later than
             `effectiveUntil`, and `maxAge` MUST be either a positive
             duration or the literal "unbounded". A manifest that breaks
             any of these MUST be refused with `PackageMalformed`
             ("data-pack-manifest").
```

```
REQUIREMENT: `DataPackManifest` is the loader's schema, not core's. The
             rule of BEH-LD-001 that the loader does not extend core's
             plugin manifest is unchanged: a data pack is not a plugin and
             is never installed in a host.
```

A separate shape, rather than a plugin package with an empty entry, keeps two
things that must never meet apart by construction: nothing in a data pack can
be handed to an evaluator, and no plugin manifest can claim to be data.

## BEH-LD-058: The data-pack digest commits to the manifest and the payload

> **Invariant:** [INV-LD-007](../invariants.md#inv-ld-007-a-data-pack-is-never-evaluated)
> **See:** [ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md), [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
manifestDigest = "sha256:" + hex(H(manifestBytes))
payloadDigest  = "sha256:" + hex(H(utf8(mediaType) || 0x00 || payload))
dataPackDigest = "sha256:" + hex(H( utf8("bridger-data-pack-v1") || 0x0A
                                    || utf8(manifestDigest) || 0x0A
                                    || utf8(payloadDigest) || 0x0A ))
```

```
REQUIREMENT: The loader MUST compute the data-pack digest exactly as above,
             with the rules of 01 for algorithms and purity (BEH-LD-002,
             BEH-LD-003). The domain string "bridger-data-pack-v1" MUST
             differ from the package construction's, so that no package
             digest can equal a data-pack digest.
```

```
REQUIREMENT: When a `DataPackRef` carries `expect`, the computed digest
             MUST equal it, otherwise the load MUST fail with
             `DigestMismatch`; the expected digest MUST NOT come from the
             response that delivers the bytes (01, BEH-LD-004).
```

Committing to the media type with the payload keeps the same bytes, relabelled
from CSV to JSON, from being read as different data under the same signature.

## BEH-LD-059: A data pack is verified as a statement and served as bytes, never evaluated

> **Invariant:** [INV-LD-007](../invariants.md#inv-ld-007-a-data-pack-is-never-evaluated), [INV-LD-008](../invariants.md#inv-ld-008-a-signature-counts-only-for-the-statement-type-it-was-made-for)
> **See:** [ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md), [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface DataPackRef {
  readonly source: PackageSource              // fetched by the loader's fetchers (02, BEH-LD-010)
  readonly expect?: string
  readonly signatures: readonly Signature[]   // beside the pack (07, BEH-LD-054)
}
interface VerifiedDataPack {
  readonly id: string
  readonly version: string
  readonly digest: string
  readonly manifestBytes: Uint8Array          // the manifest exactly as published (BEH-LD-058)
  readonly manifest: DataPackManifest         // decoded from manifestBytes
  readonly payload: Uint8Array                // the verified bytes, held in memory
  readonly signatures: readonly Signature[]   // as received beside the pack (07, BEH-LD-054)
  readonly verification: VerificationRecord   // statementType "data-pack" (07, BEH-LD-055)
}
interface DataPacksShape {
  readonly load: (ref: DataPackRef) => Effect.Effect<VerifiedDataPack, DataPackLoadError>
  readonly current: (id: string) => Effect.Effect<Option.Option<CurrentDataPack>>        // BEH-LD-062
  readonly changes: (id: string) => Stream.Stream<Option.Option<CurrentDataPack>>        // latest wins
  readonly restored: Effect.Effect<readonly DataPackRestore[]>                           // saved packs not restored (BEH-LD-062)
}
class DataPacks extends Context.Service<DataPacks, DataPacksShape>()("@bridger/loader/DataPacks") {}
type DataPackLoadError =
  | FetchFailed | PackageMalformed | UnsupportedDigestAlgorithm | DigestMismatch
  | SignatureRejected | PublisherMismatch | StatementRevoked | RevocationUnavailable | RevocationStale
  | PackageRefused | LoadLogFailed | DataPackStoreFailed
```

```
REQUIREMENT: `DataPacks.load` MUST run, in order: fetch; check the shape and
             compute the digest (BEH-LD-057, BEH-LD-058); compare with
             `expect`; `SignaturePolicy.verify` with
             `statementType: "data-pack"`, the data-pack digest, the
             manifest's id, version and `publisher` (07, BEH-LD-050);
             check the schema id (BEH-LD-061); check rollback
             (BEH-LD-062). A failure at any step MUST end the load with
             that step's error.
```

```
REQUIREMENT: No byte of a data pack MAY be passed to an evaluator, a module
             loader, `eval`, `Function`, `import()` or `require`, at any
             step or after. A data pack MUST NOT be added to
             `Loader.resident` or to `AcceptedDigests`, and a data-pack
             digest MUST NOT be accepted by `LoaderGate` (02, BEH-LD-015).
```

```
REQUIREMENT: The payload MUST be served from the bytes held in the
             `VerifiedDataPack`, never re-read from the source or from a
             path a fetcher wrote (02, BEH-LD-011 applies to data).
```

The same fetchers, digest rules, verifier timeouts and records serve both
kinds; only the last step differs. A package ends in evaluation; a data pack
ends in bytes handed to a reader. Activating a pack is not a host operation,
so core records nothing about it: the loader's record (07, BEH-LD-055) is the
record of which pack was accepted. An application that needs the switch to a
new pack attributed and approved puts that switch behind its own command.

## BEH-LD-060: Effective window and freshness are reported, and staleness is the application's decision

> **See:** [ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
class DataPackStale extends Schema.TaggedError<DataPackStale>()("DataPackStale", {
  id: Schema.String,
  version: Schema.String,
  digest: Schema.String,
  reason: Schema.Literal("max-age", "expired"),     // older than maxAge since issuedAt, or past effectiveUntil
  issuedAt: Schema.String,
  maxAge: Schema.String,
  effectiveUntil: Schema.optional(Schema.String),
  at: Schema.String                                  // the Clock time of the evaluation
}) {}
interface DataPackStatus {
  readonly window: "pending" | "effective" | "expired"   // against effectiveFrom / effectiveUntil
  readonly stale: Option.Option<DataPackStale>
  readonly publisherBound: boolean                       // 07, BEH-LD-053
  readonly at: string
}
declare const DataPacks: {
  readonly status: (pack: VerifiedDataPack, options?: { readonly maxAge?: Duration.Input }) => Effect.Effect<DataPackStatus>
  // For callers that refuse stale data: fails with the stale report, otherwise returns the pack.
  readonly requireFresh: (pack: VerifiedDataPack, options?: { readonly maxAge?: Duration.Input }) =>
    Effect.Effect<VerifiedDataPack, DataPackStale>
}
```

```
REQUIREMENT: `status` MUST read the time from `Clock` on every call and
             MUST NOT cache a result. The pack is stale with reason
             "max-age" when the time since `issuedAt` exceeds `maxAge`, and
             with reason "expired" when the time is at or after
             `effectiveUntil`. "unbounded" is never stale by age.
```

```
REQUIREMENT: Staleness MUST be reported, never acted on by the loader: a
             stale pack MUST NOT be refused by `load`, withdrawn from
             `current`, or hidden. `requireFresh` is the one helper that
             turns the report into a failure, and only its caller decides
             to call it.
```

```
REQUIREMENT: An application MAY give a shorter `maxAge` per pack or per
             call; it MUST NOT lengthen the one the signed manifest states.
             Documentation MUST state that freshness is measured from the
             publisher's signed `issuedAt` and the reader's `Clock`, so a
             wrong clock on either side makes the report wrong.
```

Whether a terminal may price a sale from a price list three weeks old, or must
stop and say so, is not a question a loader can answer; it differs by data
set and by use (reading a stale interaction table to warn is not the same as
reading a stale tax table to charge). The loader's job is to make the age
impossible to miss.

## BEH-LD-061: The schema id selects the application's decoder, and decoding is data only

> **See:** [ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface DataPacksOptions {
  readonly schemas: ReadonlyMap<string, Schema.Codec<unknown, unknown>>   // schemaId → decoder; configuration
  readonly fetchers: readonly FetcherShape[]
  readonly store: DataPackStore                                          // BEH-LD-062
  readonly feed?: DataPackFeed                                           // BEH-LD-062
}
declare const DataPacks: {
  // Builds the DataPacks service (BEH-LD-059); saved packs are verified again at construction (BEH-LD-062).
  readonly layer: (options: DataPacksOptions) =>
    Layer.Layer<DataPacks, DataPackStoreFailed, StatementVerifier | RevocationSource>
  readonly decode: <A>(pack: VerifiedDataPack, schema: Schema.Codec<A, unknown>) => Effect.Effect<A, Schema.SchemaError>
}
```

```
REQUIREMENT: `DataPacks.layer` MUST be the one constructor of the
             `DataPacks` service and MUST take every option of
             `DataPacksOptions`. It MUST require `StatementVerifier`, through
             which `SignaturePolicy.verify` runs (07, BEH-LD-050), and
             `RevocationSource`, whose changes drive the re-checks of
             BEH-LD-062 and BEH-LD-063 (04, BEH-LD-026); it MUST read
             `LoadLog` with `Effect.serviceOption` (02, BEH-LD-016). Building
             it MUST fail with `DataPackStoreFailed` ("load") when the store
             cannot be read; a saved pack that fails verification MUST NOT
             fail the build (BEH-LD-062). With `feed`, the layer MUST pass
             each `DataPackRef` the feed lists to `load`, in a fiber of the
             layer's scope.
```

```
REQUIREMENT: A data pack whose `schemaId` is not a key of `schemas` MUST be
             refused at load with `PackageRefused` (predicate
             "schema-id"). The schema map MUST be configuration given at
             construction.
```

```
REQUIREMENT: `decode` MUST parse a payload of media type
             "application/json" with a JSON parser and decode the result
             with the given schema; for any other media type it MUST fail
             with a schema error naming the media type, leaving the bytes
             to the application. Decoding MUST NOT evaluate any part of the
             payload.
```

The schema id is what lets a reader built for "price-list/v3" refuse a pack
built for "price-list/v4" before reading a row of it. Decoding is offered,
not imposed: a pack in a binary format is still verified and served; its
reader decodes it.

## BEH-LD-062: The current pack per id is chosen without rollback

> **See:** [ADR-LD-007](../decisions/007-data-packs-are-verified-never-evaluated.md), [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface CurrentDataPack {
  readonly pack: VerifiedDataPack
  readonly status: DataPackStatus
}
interface DataPackFeed {
  readonly packs: Stream.Stream<readonly DataPackRef[]>   // an adapter (HTTP index, OCI, local directory); latest wins
}
// What the store keeps per accepted pack: enough to verify it again, byte for byte.
interface StoredDataPack {
  readonly manifestBytes: Uint8Array          // exactly as published
  readonly payload: Uint8Array
  readonly signatures: readonly Signature[]
  readonly digest: string                     // the data-pack digest computed at acceptance
  readonly acceptedAt: string                 // the `at` of the acceptance's record (07, BEH-LD-055)
}
interface DataPackStoreShape {                            // the application's persistence port
  // highest accepted version of an id, with that version's digest
  readonly highest: (id: string) => Effect.Effect<Option.Option<{ readonly version: string; readonly digest: string }>, DataPackStoreFailed>
  readonly save: (pack: StoredDataPack) => Effect.Effect<void, DataPackStoreFailed>
  readonly load: Effect.Effect<readonly StoredDataPack[], DataPackStoreFailed>                 // verified again at construction
}
interface DataPackRestore {                               // DataPacks.restored: one entry per saved pack not restored
  readonly id?: string                                    // absent when the manifest could not be decoded
  readonly digest: string
  readonly cause: DataPackLoadError
}
class DataPackStoreFailed extends Schema.TaggedError<DataPackStoreFailed>()("DataPackStoreFailed", {
  operation: Schema.Literal("highest", "save", "load"),
  message: Schema.String
}) {}
```

```
REQUIREMENT: A data pack whose version is lower than the highest version
             accepted for its id MUST be refused with `PackageRefused`
             (predicate "rollback"). A data pack whose version equals the
             highest accepted version and whose digest differs from that
             version's digest MUST be refused with `PackageRefused`
             (predicate "equivocation") and logged at warning level with
             both digests; one with the same digest MUST return the pack
             already accepted and change nothing. An accepted pack MUST be
             saved through the store, as a `StoredDataPack`, before it is
             published on `changes`; a pack that cannot be saved MUST NOT
             be published.
```

```
REQUIREMENT: `current(id)` MUST return, among the accepted packs of that id
             that are not revoked, the highest version whose window is
             "effective"; when none is effective, the highest version whose
             window is "expired"; and `None` when there is none. Each value
             MUST carry the `status` computed at the time of the call.
```

```
REQUIREMENT: At construction, before `current` answers, each saved pack
             MUST be verified again from its `StoredDataPack` alone: the
             shape checks and the digest of BEH-LD-057 and BEH-LD-058
             recomputed from `manifestBytes` and `payload` and compared with
             the saved `digest`, then `SignaturePolicy.verify` with the saved
             `signatures` and `reverify: { acceptedAt }` from the saved
             `acceptedAt` (07, BEH-LD-050), then the
             schema-id check. The held revocation set's entries therefore
             apply, and its age does not: a restart without network keeps
             the data it had however long ago the last list arrived, and
             every revocation it had.
```

```
REQUIREMENT: A saved pack that fails this verification MUST NOT be
             returned by `current` or published on `changes`, MUST be listed
             in `DataPacks.restored` with its cause, and MUST be logged at
             error level. When the cause is `RevocationUnavailable` (no
             revocation set at all), the pack MUST be verified again on the
             next revocation change; for any other cause it stays withheld
             until a new `load` accepts a pack of that id. `current(id)`
             MUST answer from the packs that were restored, so it returns
             `None` for an id none of whose packs was restored.
```

```
REQUIREMENT: Documentation MUST state that the no-rollback and
             no-equivocation rules hold only as far as the store does: a
             store restored from an older backup lowers the highest version
             the loader knows, as for the revocation store (04, BEH-LD-026),
             and protecting it is the consumer's control.
```

A pack published to supersede a faulty one must not be undone by replaying the
older pack, which is why versions only rise, as revocation revisions do
(04, BEH-LD-026). Two different packs under one id and version are worse than a
replay: readers on different hosts would hold different data under the same
name, and `current` could not say which is "the highest". A publisher that
needs to correct a pack issues a new version. Saving the bytes and signatures
as received, rather than the decoded pack, is what makes the restart check
possible at all: the digest is recomputed from the manifest bytes as
published, and the rule is evaluated over the same signatures. An expired pack is still returned when nothing newer is
effective, with its status saying so: the alternative — no data at all — is a
decision the application makes, not the loader.

## BEH-LD-063: A revoked data pack is withdrawn and reported

> **Invariant:** [INV-LD-004](../invariants.md#inv-ld-004-a-revoked-digest-is-never-newly-loaded)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
> **Risk:** [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044)

```
REQUIREMENT: On each revocation change, `DataPacks` MUST re-check every
             accepted pack with `Revocation.check` (07, BEH-LD-052) and MUST
             withdraw from `current` each pack the new set revokes, by
             subject digest, statement digest or signer, publishing the
             new choice on `changes`. It MUST log each withdrawal at
             warning level with the id, version, digest and
             `StatementRevoked` cause.
```

```
REQUIREMENT: Documentation MUST state that a reader that already holds a
             revoked pack's payload, or values decoded from it, keeps them:
             the loader cannot reclaim data it has handed out, and readers
             that must stop using revoked data subscribe to `changes`.
```

```
REQUIREMENT: Un-revocation by a newer list (04, BEH-LD-026) MUST NOT
             restore a withdrawn pack by itself: the pack becomes current
             again only through a new `load` that verifies it.
```

The withdrawal is the data-pack form of the kill switch. It goes through no
host operation because a data pack was never installed; the record of what
was withdrawn and why is the loader's log and the revocation list itself.

## BEH-LD-064: Required acceptance checks for statements and data packs

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044)

```
REQUIREMENT: The loader test suite MUST also contain at least one test for
             each of the following, numbered after those of BEH-LD-048:
             17. Statement types: a valid signature over a statement of
                 one type does not count for another type with the same
                 subject, id and version; `{ bytes }` subjects are digested
                 by the loader; for each reserved type a statement built by
                 the table's `id`/`version` convention from a
                 `SignedStatement` verifies, and a decoded payload whose id
                 or version differs from the envelope's is refused
                 (BEH-LD-049).
             18. One step: the load pipeline's steps 4 and 5 and
                 `Catalog.verifyEntry` go through `SignaturePolicy.verify`;
                 a type with no rule fails "no-rule"; verifier timeouts and
                 deaths refuse; nothing is cached between calls; a
                 `StatementVerifier` with a "revocation-list" rule is
                 refused and `verify` of that type fails "no-rule";
                 `reverify` ignores the set's age and still honours its
                 entries, and a signer window that closed after
                 `acceptedAt` does not refuse it (BEH-LD-050, BEH-LD-051).
             19. Revocation of statements: a subject digest revokes every
                 statement about it; a statement digest revokes every
                 statement of that type, id and version about those bytes
                 and no other; a revoked signer withdraws exactly the
                 statements whose rule becomes unsatisfied;
                 `Revocation.check` is pure; a package whose statement
                 digest alone (not its package digest) is listed is
                 dropped by `filterDesired` and removed by the kill switch; under `anyOf` the binding is
                 checked on the first satisfied branch with no fallback
                 after `PublisherMismatch` (BEH-LD-052, BEH-LD-053).
             20. Publisher binding: a manifest `publisher` matched by no
                 verified signer's `publishers` or `identity` fails with
                 `PublisherMismatch` and evaluates nothing; a pinned
                 acceptance records `publisherBound: false` and the catalog
                 shows the publisher as unbound (BEH-LD-053).
             21. Signing and countersigning: a signature over
                 `Statement.signingInput` verifies; appending a
                 countersignature changes no digest; a second signature by
                 the same signer entry counts once; a `StatementSigner`
                 failure is `SigningFailed` with no key material; records
                 carry `statementType` and `statementDigest`
                 (BEH-LD-054, BEH-LD-055).
             22. Refusal list: with `Revocation.refusalList` wired, a
                 revoked digest whose dependency returns, whose lazy
                 trigger fires or whose background fiber restarts becomes
                 `disabled` with reason "refused-digest" and evaluates
                 nothing; an `active` plugin is not stopped by the list;
                 `refused` reads no clock and no source; the layer fails to
                 build without a current set; a digest whose
                 `AcceptedDigests` record's statement digest (not its
                 package digest) is listed is refused at its next start —
                 through a dependency's return and through a lazy trigger
                 — with reason "revoked by statement digest" (BEH-LD-056).
             23. Data packs: a pack with files or plugin manifest fields is
                 refused; the digest follows BEH-LD-058; the recording
                 evaluator records no call for any data-pack load; an
                 unknown schema id and a lower version are refused; an
                 equal version with a different digest is refused as
                 "equivocation" and logged, and with the same digest
                 changes nothing; JSON payloads decode with the given
                 schema (BEH-LD-057–059, BEH-LD-061, BEH-LD-062).
             24. Freshness and withdrawal: `status` reports "pending",
                 "effective" and "expired" and `DataPackStale` for
                 "max-age" and "expired" under a test clock; a stale pack
                 is still served; `requireFresh` fails with
                 `DataPackStale`; a shorter application `maxAge` applies
                 and a longer one does not; a revocation withdraws the pack
                 from `current` and un-revocation does not restore it; a
                 restart under a test clock past the revocation `maxAge`
                 restores every saved pack from its stored bytes and
                 signatures, a restart after its digest was revoked
                 restores none of that pack, and a saved pack whose bytes
                 were altered is listed in `restored` with
                 `DigestMismatch` (BEH-LD-060, BEH-LD-062, BEH-LD-063).
```

Each check corresponds to one acceptance scenario, REQ-LD-017 to REQ-LD-024,
in [traceability](../traceability.md) §2. None has been written or executed;
none is evidence ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).

**Settled here.** (1) A data pack is a manifest and a payload, digested under
its own domain string, with no entry code. (2) It is verified by
`SignaturePolicy.verify` as a "data-pack" statement and served as held bytes;
nothing evaluates it. (3) Window and freshness are reported on every read;
whether stale data is used is the application's decision, with `requireFresh`
for callers that refuse it. (4) Versions per id only rise, an equal version
with other bytes is refused, and a revoked pack is withdrawn from `current`.
(5) The store keeps manifest bytes, payload and signatures; a restart verifies
each saved pack again with `reverify`, so held revocations apply and the list's
age does not.

**Open.** (1) Whether large packs need a chunked payload with a Merkle root,
so that a reader can verify part of a pack without holding all of it. (2)
Whether `current` should be able to hold two versions at once during a stated
overlap, for data whose old and new versions are both valid for a period.

---

_Previous: [07 — Signed Statements](./07-signed-statements.md)_ · _Next: [09 — Trust Class and Guest Links](./09-trust-class-and-guest-links.md)_
