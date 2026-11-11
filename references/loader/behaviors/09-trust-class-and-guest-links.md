# 09 — Trust Class and Guest Links

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-09                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.5 (2026-11-11): BEH-LD-070: the package rule's pinned digests are those of each running `Loader`, each under "@bridger/loader:" + its plugin id (SPEC-AUDIT-07 residual) (CCR-LD-010)<br>0.4 (2026-11-11): BEH-LD-070: the view reads the package rule's pinned digests live from `AcceptedDigests.pinned` (the union over its sources, federation's proxy digests included), its `pinned` option naming exempt and further pinned digests only (L2); the gate's "verification-unknown" agreement covers `enable`, `retry` and `restart`, not `reconfigure` (PL17); check 30 extended (SPEC-AUDIT-06) (CCR-LD-009)<br>0.3 (2026-11-11): BEH-LD-070: the view computes from the record `AcceptedDigests.lookup` returns, re-evaluating its recorded signers and requirement without a policy, over `AcceptedDigests.entries` (H7, L2); `LoaderGate` reaches the same answer for install, replace and the operator calls that start code again, "verification-unknown" included (L3); Settled (5) and the rationale say agreement on the same inputs, not one computation (PL16); check 30 covers the gate's restart-like refusals and a replaced loader's records; the introduction says the same (SPEC-AUDIT-05) (CCR-LD-008)<br>0.2 (2026-11-10): BEH-LD-070: `RevokedDigests.layer` takes `pinned` (the rule's pinned digests and `LoaderGate`'s exempt digests) (L1); "one computation" replaced by agreement on the same inputs (PL14); check 30 (BEH-LD-071) covers exempt digests (SPEC-AUDIT-04) (CCR-LD-007)<br>0.1 (2026-11-09): Initial draft: the "first-party" statement, the trust class of catalog entries, `Loader.lazy` refusing unmarked entries, `LoaderRemote.link` as the catalog-to-guest path, the link manifest derived from the guest's, the `RevokedDigests` view, checks 25–30 (specification audit F-06, M-02, M-06); introduction defines evaluation in the host's process and states where a guest runs, `@bridger/worker` included; BEH-LD-065 documentation states both without an isolation claim (independent review) (CCR-LD-004) |

---

The loader verifies every package the same way, whoever wrote it: digest,
signatures, publisher binding, revocation. Where the verified code then runs
is a second decision. Code evaluated in the host's process has the host's
authority ([06](./06-limits-and-acceptance.md), BEH-LD-041), so only the
application's own code may run there
([ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)).
Until this file, nothing in a package or a catalog entry said whose code it
was, and the reference wiring turned every catalog entry into an in-process
lazy plugin. This file adds a signed **trust class**: a package may be
evaluated in the host's process only under a separate "first-party" statement
signed by the application's own release authority
([ADR-LD-008](../decisions/008-in-process-eligibility-is-a-signed-statement.md)).
Every other verified package is a **guest**, reached through
`LoaderRemote.link`, a remote link that fetches and verifies the bundle at
each session and hands it to a bundle runtime, which runs it outside the
host's runtime. It also gives a link a manifest
derived from the guest's, and publishes the set of revoked package digests as
a view that every consumer judging by digest reads or agrees with. This file owns
BEH-LD-065–072 and uses BEH-LD-065–071; BEH-LD-072 is reserved.

In this companion, *evaluated in the host's process* means evaluated by the
host's own JavaScript runtime — in its heap, its module graph and its
globals — as `load` does. A guest never is. It runs in the bundle runtime the
deployment chose (remote BEH-RM-072): with `@bridger/worker`, a worker thread
of the host's own operating-system process, which gives it a separate heap
and event loop and confines nothing else (remote BEH-RM-053); with the other
adapters, an isolate, another process or a service. What, if anything,
confines a guest is that runtime's and the deployment's, never the loader's.

> **What this package does not do — and who does**
>
> The loader checks who signed a statement. It does **not** decide whose code
> is first-party — that is the application's rule for the "first-party"
> statement type — and does **not** make a guest safe: where a guest runs, and
> what that process or isolate can reach, are the remote companion's
> transport and the deployment's
> ([references/remote/](../../remote/README.md)). A first-party statement
> says who vouched for running code next to the host; it does not contain
> that code.

Planned source: `packages/loader/src/Trust.ts`,
`packages/loader/src/RevokedDigests.ts`, and the entry point
`packages/loader/src/remote/index.ts` (`@bridger/loader/remote`)
*(Planned)*.

## BEH-LD-065: A "first-party" statement marks a package for in-process evaluation

> **Invariant:** [INV-LD-009](../invariants.md#inv-ld-009-no-package-is-evaluated-in-the-host-process-without-an-accepted-first-party-statement)
> **See:** [ADR-LD-008](../decisions/008-in-process-eligibility-is-a-signed-statement.md), [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md), [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-043](../../core/gxp/03-risk-assessment.md#rsk-br-043)

```ts
// illustrative — not type-checked
// Reserved statement type (07, BEH-LD-049): subject { digest } = the package digest,
// id = manifest id, version = manifest version — the same subject, id and version as "package".
type StatementType = /* ... */ "first-party" | (string & {})

interface PackageRef {
  // ... source, expect (01, BEH-LD-004)
  readonly firstParty?: readonly Signature[]      // signatures over the "first-party" statement of the package
}

const rules: StatementRules = {
  package: releasePolicy,                                         // who may publish code the host verifies
  "first-party": SignaturePolicy.signed(inHouseReleasePolicy),    // whose code may run in the host's process
  // ...
}
```

```
REQUIREMENT: "first-party" MUST be a reserved statement type (07,
             BEH-LD-049) whose subject is the package digest and whose `id`
             and `version` are the manifest's, as for "package". An accepted
             "first-party" statement means: the application's release
             authority allows this package to be evaluated in the host's
             process. It MUST NOT be read as a statement about what the code
             does.
```

```
REQUIREMENT: `load` (02, BEH-LD-009) MUST, at step 4, after the "package"
             statement is accepted, call `SignaturePolicy.verify` with
             `statementType: "first-party"`, the computed package digest,
             the manifest's id and version, and `ref.firstParty` (or no
             signatures). When it fails, the load MUST end with that error
             — `SignatureRejected` with `statementType` "first-party",
             `StatementRevoked`, `RevocationUnavailable` or `RevocationStale`
             — before step 6, and MUST evaluate nothing.
```

```
REQUIREMENT: `StatementRules` MUST have no default for "first-party"
             (BEH-LD-051): without a rule, `verify` fails with "no-rule" and
             no package can be loaded into the host's process. A `pinned`
             rule for "first-party" pins package digests the application
             lists in its configuration.
```

```
REQUIREMENT: `fetchVerified` (05, BEH-LD-039) MUST NOT require a
             "first-party" statement: it evaluates nothing, and its bytes are
             never evaluated in the host's runtime; a bundle runtime runs
             them (remote BEH-RM-072).
```

```
REQUIREMENT: Documentation MUST state that the "first-party" rule is the
             application's statement of whose code it evaluates next to the
             host; that its signers should be the application's own release
             authority, never a partner's key; and that the "package" rule
             and the "first-party" rule are separate, so a partner whose
             package the "package" rule accepts does not thereby gain
             in-process evaluation.
```

```
REQUIREMENT: Documentation MUST state, without a claim of isolation, that
             a guest is never evaluated in the host's runtime but may run
             in the host's operating-system process: `@bridger/worker` starts
             it in a worker thread, which confines nothing beyond a separate
             heap and event loop (remote BEH-RM-053), and whether a guest
             runs in another process, an isolate or elsewhere is the
             deployment's choice of bundle runtime. It MUST also state that
             the loader does not know whose code a package is: the signers
             the "first-party" rule accepts can sign that statement for any
             package, a partner's included, and a package is evaluated in
             the host's runtime exactly when the application's rule accepts
             such a statement for it — the application's decision, never the
             package author's.
```

```
REQUIREMENT: A "first-party" statement MUST be revocable like any statement
             (07, BEH-LD-052): by subject digest, by its statement digest or
             by signer. Revoking only its statement digest, or only a signer
             of the "first-party" rule, MUST refuse every later in-process
             load of the digest — each load verifies again (03, BEH-LD-024)
             — and MUST leave the "package" statement standing, so the
             package may still run as a guest. Documentation MUST state that
             such a revocation changes where the code may run next, not what
             is running now: an evaluated module stays resident and an
             installed plugin keeps running until its package digest is
             revoked, which the kill switch acts on (04, BEH-LD-029), or an
             operator removes it.
```

The "package" statement answers "did the required signers vouch for these
bytes?"; the "first-party" statement answers "may these bytes run next to the
host?". Keeping them two statements under two rules is the domain separation
of 07 (BEH-LD-049) applied to the one decision whose mistake is most costly: a
key that may vouch for a partner's release, or a reviewer's countersignature
on it, never makes that release in-process code. Revoking the first-party
statement alone is the targeted remedy for a package marked by mistake: its
next in-process load is refused while its guest use stays possible.

## BEH-LD-066: A catalog entry carries its trust class

> **See:** [ADR-LD-008](../decisions/008-in-process-eligibility-is-a-signed-statement.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)

```ts
// illustrative — not type-checked
interface CatalogEntry {
  // ... manifestBytes, sbomDigest, filesDigest, packageDigest, signatures, source (05, BEH-LD-033)
  readonly firstParty?: readonly Signature[]      // signatures over the "first-party" statement; absent for guests
}
interface VerifiedEntry {
  // ... manifest, packageDigest, sbomDigest, filesDigest, source, verification (05, BEH-LD-034)
  readonly trust: "first-party" | "guest"
  readonly firstParty?: {                         // present exactly when trust is "first-party"
    readonly signatures: readonly Signature[]
    readonly verification: VerificationRecord     // statementType "first-party" (07, BEH-LD-055)
  }
  readonly firstPartyRefused?: string             // the refusal's tag, when the entry carried signatures that did not verify
}
```

```
REQUIREMENT: After the "package" statement of an entry is accepted,
             `Catalog.verifyEntry` MUST verify the "first-party" statement
             when the entry carries `firstParty` signatures, exactly as
             BEH-LD-065 states for a load. The entry's `trust` MUST be
             "first-party" when that call accepts, and "guest" otherwise:
             when the entry carries no such signatures, or when the call
             fails, in which case `firstPartyRefused` MUST carry the
             error's tag and the refusal MUST be recorded in the `LoadLog`
             when one is wired (02, BEH-LD-016). A failed "first-party"
             statement MUST NOT reject the entry.
```

```
REQUIREMENT: `trust` MUST be derived only from that verification. It MUST
             NOT be read from the manifest, the `publisher`, the `tier`, the
             feed, the source, or any field of the entry other than the
             signatures, and MUST NOT be settable by any option.
```

```
REQUIREMENT: When the revocation set changes, the catalog MUST verify the
             "first-party" statement of every contributed first-party entry
             again; an entry whose statement no longer verifies MUST be
             withdrawn and contributed again with `trust` "guest", in one
             serialized change of the registry, so that no reader sees it
             with both classes.
```

```
REQUIREMENT: The catalog's plain-data view (05, BEH-LD-040) MUST show
             `trust` for every entry.
```

A guest entry is still a verified entry: its digest is accepted for an install
(02, BEH-LD-015), its manifest is signed, and it is listed for people and
agents to read. What changes with the class is only the path from the entry to
a definition (BEH-LD-067, BEH-LD-068).

## BEH-LD-067: Loader.lazy refuses an entry that is not marked first-party

> **Invariant:** [INV-LD-009](../invariants.md#inv-ld-009-no-package-is-evaluated-in-the-host-process-without-an-accepted-first-party-statement)
> **See:** [ADR-LD-008](../decisions/008-in-process-eligibility-is-a-signed-statement.md), [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-244, BEH-BR-246)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
declare const Loader: {
  readonly lazy: (entry: VerifiedEntry, options?: { readonly idle?: Duration.Input; readonly holdTimeout?: Duration.Input }) =>
    Effect.Effect<LazyPluginDefinition, NotFirstParty>
  // load = Loader.load({ source: entry.source, expect: entry.packageDigest, firstParty: entry.firstParty.signatures })
}
class NotFirstParty extends Schema.TaggedError<NotFirstParty>()("NotFirstParty", {
  id: Schema.String,
  version: Schema.String,
  digest: Schema.String
}) {}

// Reference wiring: each class has its own path, and a guest needs the application's own guest settings.
const toDesired = (entry: VerifiedEntry) =>
  entry.trust === "first-party"
    ? Loader.lazy(entry).pipe(Effect.map((plugin) => ({ id: entry.manifest.id, plugin })))
    : LoaderRemote.link(entry, guestSettings(entry)).pipe(Effect.map((plugin) => ({ id: entry.manifest.id, plugin })))
```

```
REQUIREMENT: `Loader.lazy` MUST fail with `NotFirstParty` when the entry's
             `trust` is not "first-party", and MUST then build no
             definition. There MUST be no option, overload or helper that
             turns a guest entry into a definition evaluated in the host's
             process.
```

```
REQUIREMENT: The `load` of a definition built by `Loader.lazy` MUST pass the
             entry's first-party signatures as `firstParty` (BEH-LD-065), so
             that each load verifies the "first-party" statement again with
             the current rules and revocation set. A refusal surfaces as the
             load failure of 05 (BEH-LD-037).
```

```
REQUIREMENT: Documentation and the worked example MUST map catalog entries
             by class: "first-party" entries to `Loader.lazy`, "guest"
             entries to `LoaderRemote.link` (BEH-LD-068) with the
             application's guest settings for the contract the entry
             provides. An application that has no guest settings for an
             entry MUST leave the entry out of its desired list and SHOULD
             report it; it MUST NOT fall back to `Loader.lazy`.
```

Failing at definition time, not at the first trigger, keeps a guest entry out
of the desired list altogether: the host never registers an in-process
definition for it, never reserves its provider slots for an in-process
plugin, and never reaches the trigger. The check at each load is the second
line, for revocations that arrive after install.

## BEH-LD-068: LoaderRemote.link turns a guest entry into a remote link

> **See:** [ADR-LD-008](../decisions/008-in-process-eligibility-is-a-signed-statement.md), [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)
> **Core seam:** [references/remote/](../../remote/README.md) (RM; `Remote.define`, `Transport.fromBundle`, BEH-RM-001, BEH-RM-003, BEH-RM-072)
> **Satisfies:** [URS-BR-041](../../core/urs.md#urs-br-041-use-plugin-code-that-runs-outside-the-host-process)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
// Entry point "@bridger/loader/remote"; @bridger/remote is an optional peer dependency of the loader.
declare const LoaderRemote: {
  readonly link: <C extends Contract.Any>(entry: VerifiedEntry, options: GuestLinkOptions<C>) =>
    Effect.Effect<PluginDefinition<any, []>, GuestEntryInvalid>
}
interface GuestLinkOptions<C extends Contract.Any> extends Omit<RemoteOptions<any>, "id" | "transport" | "meta" | "manifest"> {
  readonly contract: C                 // the application's own copy of the contract the guest provides
  readonly runtime: BundleRuntime      // remote BEH-RM-072: starts a guest from the bytes it is given
}
class GuestEntryInvalid extends Schema.TaggedError<GuestEntryInvalid>()("GuestEntryInvalid", {
  id: Schema.String,
  reason: Schema.String                // "provides", "requires", "optional", "activation", "contributions", "listens", "contract"
}) {}

// = Remote.define(options.contract, {
//     ...options,
//     id: entry.manifest.id,
//     meta: { version: entry.manifest.version, digest: entry.packageDigest },
//     manifest: linkManifest(entry.manifest, options.requires),              // BEH-LD-069
//     transport: Transport.fromBundle(options.runtime,                       // remote BEH-RM-072
//       Loader.fetchVerified({ source: entry.source, expect: entry.packageDigest })
//         .pipe(Effect.map(toGuestBundle), Effect.mapError(toTransportError)))
//   })
```

```
REQUIREMENT: `LoaderRemote.link` MUST build its definition with the remote
             companion's `Remote.define` and MUST NOT fetch, verify or
             evaluate anything when it is called: it reads only the verified
             entry, so that a desired list of guest links reconciles without
             fetching code, as a list of lazy definitions does (05,
             BEH-LD-038).
```

```
REQUIREMENT: The guest's manifest MUST have exactly one `provides`
             reference, a contract reference agreeing with
             `options.contract` as core compares a provision with its
             contract (same `ServiceId`, version and method names, core
             BEH-BR-227), and MUST have empty or absent `requires`,
             `optional`, `activation`, `contributions` and `listens`: a
             guest reaches the host only through the link's grants
             (remote BEH-RM-043), never as a dependent, a contributor or a
             listener. Any other manifest MUST fail with
             `GuestEntryInvalid` naming the first offending field.
             `LoaderRemote.link` MUST accept an entry of either trust class.
```

```
REQUIREMENT: The definition's `id` MUST be the manifest's id; its `meta`
             MUST be `{ version: manifest.version, digest:
             entry.packageDigest }`, so that `LoaderGate` (02, BEH-LD-015),
             core's `RefusalList` (07, BEH-LD-056), the kill switch (04) and
             the remote boundary's revocation (remote BEH-RM-014) judge the
             link by the guest package's digest; its `manifest` MUST be the
             link manifest of BEH-LD-069.
```

```
REQUIREMENT: The link's transport MUST be `Transport.fromBundle` (remote
             BEH-RM-072) over `options.runtime`, with an acquisition that
             runs `Loader.fetchVerified({ source: entry.source, expect:
             entry.packageDigest })` at each session attempt and hands the
             runtime the verified files and the entry named by the
             manifest's `extensions["@bridger/loader"]` (01, BEH-LD-001). A
             refusal of `fetchVerified` MUST fail that attempt with the
             remote companion's `TransportError` whose message is the
             refusal's tag, so that the link provides nothing, reports the
             refusal in its status and retries on its own schedule; it MUST
             NOT fail the link's build (remote BEH-RM-003).
```

```
REQUIREMENT: Documentation MUST state that every session of a guest link
             runs the full verification of a fetch — digest, "package"
             statement, publisher binding, revocation, predicates — and
             that whether the guest then runs exactly those bytes, and what
             its process or isolate can reach, are the bundle runtime's and
             the deployment's (remote BEH-RM-052, BEH-RM-053, BEH-RM-072).
```

This is the catalog-to-guest path that ADR-LD-005 promised and the reference
wiring lacked. Building the link from the verified entry alone gives it the
properties of a lazy plugin where they matter — a digest known before any
code is fetched, a gate decision at install, an idempotent reconcile — and
the properties of a remote link everywhere else: the link is `active` at
once, provides nothing until a session is established, and never holds a
build slot on a fetch. Fetching per session, rather than once, means a
revocation, a policy change or a replaced loader takes effect at the next
session without restarting anything.

## BEH-LD-069: A link carries a manifest derived from its guest's

> **See:** [ADR-LD-008](../decisions/008-in-process-eligibility-is-a-signed-statement.md), [ADR-LD-002](../decisions/002-package-digest-commits-to-manifest-sbom-and-files.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–243), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-268)
> **Satisfies:** [URS-BR-030](../../core/urs.md#urs-br-030-know-what-a-plugin-declares-before-running-its-code)
> **Risk:** [RSK-BR-027](../../core/gxp/03-risk-assessment.md#rsk-br-027)

```ts
// illustrative — not type-checked
declare const LoaderRemote: {
  // Pure: the guest's verified manifest, re-shaped to agree with the link definition.
  readonly linkManifest: (guest: PluginManifest, requires?: Keys) => PluginManifest
}
// linkManifest(guest, requires) = {
//   ...guest,                                       // every label field unchanged: publisher, tier, requested,
//                                                   // residency, description, config, extensions
//   provides: [],                                   // the link provides nothing; its session child provides the contract
//   requires: (requires ?? []).map(plainRef),       // the keys the transport itself needs (remote BEH-RM-001)
//   optional: undefined, activation: undefined, contributions: undefined, listens: undefined
// }
```

```
REQUIREMENT: `linkManifest` MUST return the guest's decoded manifest with
             `provides` empty, `requires` the link's own `requires` as plain
             references, and `optional`, `activation`, `contributions` and
             `listens` absent, and with every other field — `id`,
             `version`, `publisher`, `tier`, `requested`, `residency`,
             `description`, `config`, `extensions` and unknown properties —
             unchanged. It MUST be pure.
```

```
REQUIREMENT: `LoaderRemote.link` and `Loader.stampRemote` (05, BEH-LD-039)
             MUST set the link definition's `manifest` to `linkManifest` of
             the verified guest manifest, so that core's agreement check
             (core BEH-BR-242) passes, the install's gate request carries
             the guest's signed `requested`, `publisher` and `residency`
             (core BEH-BR-219), `Manifest.consentDiff` (core BEH-BR-243)
             compares the guest's labels across a replace, and the link's
             residency label is the guest's (remote BEH-RM-068).
```

```
REQUIREMENT: Documentation MUST state that the link manifest is derived,
             not signed: the signed bytes are the catalog entry's, and a
             reader that needs them reads the entry (05, BEH-LD-040). The
             derivation changes only the resolution fields, which describe
             the link, never a label the signers signed.
```

Without a manifest, a link is an eager plugin that declares nothing: a
consent screen shows no requested capabilities, `AccessPolicy.declaredOnly`
has nothing to compare and treats it as "no manifest", and the residency
label the guest's publisher declared never reaches placement. The resolution
fields cannot be copied as they are — the guest provides the contract, while
the link provides nothing and its session child provides the contract
(remote BEH-RM-002) — so they are re-shaped and nothing else is.

## BEH-LD-070: The revoked-digest view serves every consumer that judges by digest

> **Invariant:** [INV-LD-004](../invariants.md#inv-ld-004-a-revoked-digest-is-never-newly-loaded)
> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-LD-006](../decisions/006-one-verification-step-for-every-signed-statement.md)
> **Core seam:** [references/remote/](../../remote/README.md) (RM; `RemoteBoundary`, BEH-RM-014)
> **Risk:** [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044)

```ts
// illustrative — not type-checked
interface RevokedDigest {
  readonly by: "digest" | "statement-digest" | "signer" | "verification-unknown"
  readonly reason: string               // e.g. "revoked by signer ed25519:sha256:… (revision 42): key compromise"
  readonly revision: number             // the revocation set's revision
}
interface RevokedDigestsShape {
  // Synchronous and pure: reads the view computed at the last change; never reads the source, the store or Clock.
  readonly refused: (digest: string) => Option.Option<RevokedDigest>
  readonly current: Effect.Effect<ReadonlyArray<{ readonly digest: string } & RevokedDigest>>   // every known revoked package digest
  readonly changes: Stream.Stream<number>                                                      // the view's revision, latest wins
}
class RevokedDigests extends Context.Service<RevokedDigests, RevokedDigestsShape>()("@bridger/loader/RevokedDigests") {}
declare const RevokedDigests: {
  // pinned: LoaderGate's exempt.digests and further pinned digests (02, BEH-LD-015); the digests the package
  // rule pins (03, BEH-LD-022) and federation's proxy digests are read live from AcceptedDigests.pinned, never fixed here.
  readonly layer: (options: { readonly pinned: readonly string[] }) =>
    Layer.Layer<RevokedDigests, RevocationUnavailable, RevocationSource | AcceptedDigests>
}
```

```
REQUIREMENT: `RevokedDigests.layer` MUST compute, when a revocation set
             arrives (`RevocationSource.changes`) and when `AcceptedDigests`
             changes, the package digests revoked under the newest set: by
             digest (04, BEH-LD-025), by the `statementDigest` of the
             digest's `AcceptedDigests` record (07, BEH-LD-052), the record
             `lookup` returns (02, BEH-LD-015), and by signer through the
             re-evaluation of BEH-LD-030 over that record, from its recorded
             signer identities, roles and `require` (03, BEH-LD-020); the
             layer is given no policy and MUST NOT need one.
             `refused(digest)` MUST answer from that computation,
             and MUST answer "verification-unknown" for a digest with no
             record while the set revokes a signer, unless the digest is in
             `AcceptedDigests.pinned` — the union over its sources: the
             digests the package rule of each running `Loader` pins, each
             published under "@bridger/loader:" + its plugin id, and those
             each federation plugin publishes for its import
             proxies (federation BEH-FD-007), read at each computation (02,
             BEH-LD-015) — or in `options.pinned`, the digests `LoaderGate`
             exempts and any further pinned digests; together, the same
             list `filterDesired` is given (04, BEH-LD-028).
```

```
REQUIREMENT: `current` MUST list every digest of `AcceptedDigests.entries`
             and of the set's `digests` that `refused` refuses, and `changes` MUST
             publish a new revision exactly when that list changes.
             Building the layer MUST read the current set and MUST fail with
             `RevocationUnavailable` when there is none.
```

```
REQUIREMENT: `Revocation.refusalList` (07, BEH-LD-056), the kill switch's
             `filterDesired` (04, BEH-LD-028) and `LoaderGate` (02,
             BEH-LD-015) MUST reach the same answer as `refused` for every
             package digest — `LoaderGate` for `install` and `replace` and
             for the operator calls that start code again (`enable`,
             `retry`, `restart`, `reconfigure`), "verification-unknown"
             included except for `reconfigure` (02, BEH-LD-015), given the
             same pinned and exempt digests — and
             `Revocation.refusalList` and the remote boundary MUST be built
             over this view. `filterDesired` and
             `LoaderGate` compute their answers from the same inputs (the
             revocation set, `AcceptedDigests` and the pinned and exempt
             digests); agreement, not a single computation, is what this
             requirement asks of them.
```

```
REQUIREMENT: Revocation of a "first-party" statement (BEH-LD-065) MUST NOT
             enter this view: the view answers whether a package may run at
             all, and a package whose first-party statement is revoked may
             still run as a guest.
```

```
REQUIREMENT: Documentation MUST state that a consumer that refuses by
             digest outside the host — the remote companion's boundary
             (remote BEH-RM-014) — reads this view, so that the revocation
             of a signer or of a statement reaches it at once, not only
             through the kill switch's removal.
```

A revocation list names digests and signers; a consumer at a boundary holds
only a digest. Mapping one to the other needs the verification records, which
are the loader's, and one rule applied to the same inputs keeps the refusal
list, the kill switch, the gate and the remote boundary from disagreeing about
the same digest. Before
this view, the remote boundary read the list's digests only, so revoking a
compromised signer stopped a running guest only when the kill switch removed
its link.

## BEH-LD-071: Required acceptance checks for trust classes, guest links and the revoked-digest view

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: The loader test suite MUST contain at least one test for each
             of the following, numbered after those of BEH-LD-064:
             25. First-party statement: a load whose "package" statement is
                 accepted and whose "first-party" statement is absent,
                 unsatisfied, revoked by statement digest or by a signer of
                 its rule, or has no rule, evaluates nothing and fails with
                 that error; `fetchVerified` of the same package succeeds; a
                 "package" signature does not count as a "first-party" one
                 (BEH-LD-065).
             26. Catalog trust class: an entry without first-party
                 signatures, or with signatures that do not verify, is
                 contributed as "guest" with `firstPartyRefused` and a
                 `LoadLog` record; a first-party entry whose statement is
                 then revoked is withdrawn and contributed again as "guest"
                 in one registry change (BEH-LD-066).
             27. `Loader.lazy` fails with `NotFirstParty` for a guest entry
                 and builds nothing; a first-party entry's trigger-time load
                 verifies the "first-party" statement again (BEH-LD-067).
             28. `LoaderRemote.link`: fetches nothing when called; refuses a
                 manifest with two `provides`, any `requires`,
                 `contributions` or `listens`, or a provision that differs
                 from the contract, with `GuestEntryInvalid`; the link is
                 `active` with no session while the bundle cannot be
                 fetched or is refused, and each session attempt runs
                 `fetchVerified` again; reconciling an unchanged list of
                 guest links fetches nothing (BEH-LD-068).
             29. Link manifest: the link's `manifest` passes core's
                 agreement check, keeps every label of the guest's, has
                 empty `provides`, and its `residency` reaches the link's
                 placement check (BEH-LD-069).
             30. `RevokedDigests`: digest, statement-digest and signer
                 revocations, and "verification-unknown", give the same
                 answer from `refused`, `Revocation.refusalList`,
                 `filterDesired` and `LoaderGate` (for `install`, and for
                 `enable` and `restart` of an installed digest); the signer
                 answer is reached from the record alone after the loader
                 that accepted the digest was replaced; a digest in `pinned` or
                 `exempt.digests` with no record is not refused
                 "verification-unknown"; after a loader replacement that
                 changes the rule's pinned digests, the view, the gate and
                 `filterDesired` agree at once, with no rebuild; a digest
                 published under another `setPinned` source is not refused
                 "verification-unknown", and replacing one source's list
                 leaves the other's in place; a revoked first-party
                 statement does not enter the view; `changes` advances only
                 when the list changes (BEH-LD-070).
```

Each check corresponds to one acceptance scenario, REQ-LD-025 to REQ-LD-030,
in [traceability](../traceability.md) §2. None has been written or executed;
none is evidence ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).

**Settled here.** (1) In-process evaluation needs a signed statement of its
own, under a rule with no default; the "package" rule never implies it.
(2) The trust class of a catalog entry is derived from that signature alone.
(3) `Loader.lazy` refuses guest entries; guests reach the host as remote links
built from the verified entry, which fetch and verify the bundle at each
session. (4) A link's manifest is the guest's, re-shaped in its resolution
fields only. (5) One view of revoked package digests serves the refusal
list and the remote boundary; the kill switch and the gate compute their
answers from the same inputs and agree with it — agreement, not one
computation.

**Open.** (1) Whether a host should be able to demote a running in-process
plugin to a guest link when its first-party statement is revoked, rather than
leave it to the kill switch and the operator.

---

_Previous: [08 — Data Packs](./08-data-packs.md)_ · _Next: [Invariants](../invariants.md)_
