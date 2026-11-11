# 02 — Load Pipeline

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-02                                            |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.8 (2026-11-11): BEH-LD-015: `AcceptedDigests` declares `record`, `remove`, `markNotCurrent` and `entries`, acceptances keyed by (digest, `via`) (L2); `lookup` prefers a current acceptance (L1); a digest is revoked for the piece as `RevokedDigests.refused` answers, from the record `lookup` returns, which carries the signer identities and requirement (H7); `enable`, `retry`, `restart` and `reconfigure` refused "verification-unknown" unless the digest is pinned or exempt, and `LoaderGateOptions.pinned` (L3); `Loader.pinnedDigests` (H7); BEH-LD-016: `VerificationRecord` keeps `RecordedSigner` values and `require` (H7) (SPEC-AUDIT-05) (CCR-LD-008)<br>0.7 (2026-11-10): BEH-LD-015: an exempt digest is never refused "verification-unknown" and the same `exempt.digests` reach `RevokedDigests.layer` and `filterDesired` (L1); `AcceptedDigests` keeps one acceptance per digest and origin, so a catalog withdrawal leaves a load's acceptance in place (PL12) (SPEC-AUDIT-04) (CCR-LD-007)<br>0.6 (2026-11-10): BEH-LD-015: installs by core realm families and ephemeral realms (agent model adapters, subagents) are judged as any install; the supported wirings are a loader load or an exemption by digest, never by realm (round 2 findings of the specification audit of 2026-11-09, P23); follow-up: `FetchError`, the error of `fetchVerified`, defined as the errors of steps 1–6 (it was used and never defined) (CCR-LD-005)<br>0.5 (2026-11-09): Step 4 also verifies the "first-party" statement, so no package is evaluated in the host's process without it (F-06); the entry is read from `extensions["@bridger/loader"]` (M-03); `PackageManifestMismatch` and `StatementRevoked` in `LoadError` (C-16); guest wording (independent review) (CCR-LD-004)<br>0.4 (2026-11-08): Steps 4 and 5 run through `SignaturePolicy.verify` with the publisher binding; system starts of revoked digests refused by core's `RefusalList` backed by the loader (G60 closed); undo requests judged as the operation they issue (round 2: recheck items 11, 15; core alignment) (CCR-LD-003)<br>0.3 (2026-11-08): `LoaderGate` is a core `Gate<OperationRequest>` piece built before the host over a shared `AcceptedDigests` store, with bootstrap exemptions, verified catalog entries accepted for lazy installs, and revoked digests refused for every operation that restarts code; `VerificationRecord` fields defined per step reached; refusal-record write failures; evaluator option narrowed (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

Core accepts a `PluginDefinition` from anywhere, including a dynamic
`import()` ([BEH-BR-008](../../core/behaviors/01-plugin-definition.md#beh-br-008-a-plugin-entry-has-no-import-time-side-effects)),
and says that fetching and verifying belong to an optional loader. This file
specifies that loader's pipeline: fetch the bytes, check the digest, check the
signatures, check revocation, run the application's predicates — and only then
evaluate, and evaluate exactly the bytes that were checked
([ADR-LD-001](../decisions/001-verify-before-evaluate.md)). It also specifies
the gate check that lets a deployment refuse definitions that did not come
through the loader, and the loader's own record. This file owns
BEH-LD-009–016 and uses all eight.

> **What this package does not do — and who does**
>
> The pipeline decides whether bytes may be evaluated. Once evaluated, code
> runs in the host's process with the host's authority: the loader is **not
> a sandbox** and cannot take back what code does or reclaim it from memory
> ([06 — Limits and Acceptance](./06-limits-and-acceptance.md)). Code that is
> not first-party is fetched by the loader and run outside the host's runtime
> (05, BEH-LD-039; 09, BEH-LD-068), never evaluated here: `load` evaluates
> only a package whose "first-party" statement is accepted (09, BEH-LD-065).

Planned source: `packages/loader/src/Loader.ts`,
`packages/loader/src/Fetcher.ts`, `packages/loader/src/Evaluator.ts`
*(Planned)*.

## BEH-LD-009: Fetch, verify, then evaluate — in that order, every time

> **Invariant:** [INV-LD-001](../invariants.md#inv-ld-001-no-code-is-evaluated-before-its-digest-and-signatures-are-accepted)
> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface LoaderShape {
  readonly load: (ref: PackageRef) => Effect.Effect<LoadedPlugin, LoadError>
  readonly fetchVerified: (ref: PackageRef) => Effect.Effect<VerifiedPackage, FetchError>  // 05, BEH-LD-039
  // The digests the instance's acceptance rule pins (03, BEH-LD-022); empty when it pins none.
  // Read by the kill switch for filterDesired's `pinned` (04, BEH-LD-028).
  readonly pinnedDigests: readonly string[]
}
class Loader extends Context.Service<Loader, LoaderShape>()("@bridger/loader/Loader") {}
```

```
REQUIREMENT: `load` MUST run these steps in this order, and each step MUST
             complete successfully before the next begins:
             1. fetch the package bytes (BEH-LD-010);
             2. check paths and compute the digests (01, BEH-LD-001–003);
             3. compare with the expected digest, when given (01, BEH-LD-004);
             4. evaluate the signature policy (03 — Signature Policy) and
                the publisher binding, through `SignaturePolicy.verify`
                with `statementType: "package"` (07, BEH-LD-050,
                BEH-LD-053), and then the "first-party" statement through
                `SignaturePolicy.verify` with `statementType:
                "first-party"` (09, BEH-LD-065);
             5. check the current revocation set (04 — Revocation and Kill
                Switch, BEH-LD-027), within each of those `verify` calls;
             6. run the application's predicates (01, BEH-LD-006);
             7. evaluate the entry file (BEH-LD-011);
             8. extract and check the definition, and stamp it (BEH-LD-014,
                01, BEH-LD-007).
```

```
REQUIREMENT: No byte of the package MAY be passed to an evaluator, to a
             module loader, to `eval`, `Function`, `import()` or `require`
             before step 6 has succeeded. A failure at any step MUST end the
             load with that step's error and MUST evaluate nothing.
```

```
REQUIREMENT: There MUST be no option, flag, environment variable or
             overload that skips steps 2–6. A development workflow that
             loads unsigned local code MUST do so through an explicit
             signature policy (03, BEH-LD-022), never by skipping a step.
```

The one rule the loader exists to keep is that unverified bytes never run.
Every shortcut that has ever weakened a package manager's integrity checks —
"verify later", "verify only on first install", "skip in development" —
starts as an option. Having none means the rule can be tested exhaustively:
each step fails in turn, and the evaluator fixture records that it was never
called.

## BEH-LD-010: Fetchers are adapters behind a port

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked
type PackageSource = { readonly kind: string; readonly location: string }   // e.g. { kind: "https", location: "https://…" }
interface FetcherShape {
  readonly kind: string
  readonly fetch: (source: PackageSource) => Effect.Effect<Package, FetchFailed>
}
class FetchFailed extends Schema.TaggedError<FetchFailed>()("FetchFailed", {
  source: Schema.String,
  message: Schema.String
}) {}
```

```
REQUIREMENT: The loader MUST select the fetcher by `source.kind` from the
             fetchers it was constructed with. An unknown kind MUST fail with
             `FetchFailed` ("no-fetcher"). The loader MUST NOT ship a fetcher
             that reaches the network implicitly; every fetcher is wired by
             the application.
```

```
REQUIREMENT: A fetcher MUST return bytes only. Anything a fetcher reports
             about the bytes — a digest header, a signature file, a cache
             validator — MUST be ignored by the verification steps unless it
             is a signature the policy evaluates (03).
```

Planned adapters, each optional and separately versioned: a content-addressed
local store, a file-system directory, HTTPS, and an OCI registry. None is
trusted more than another: a fetcher's only job is to produce bytes, and the
same verification runs whatever produced them.

## BEH-LD-011: The evaluator receives only the verified bytes

> **Invariant:** [INV-LD-002](../invariants.md#inv-ld-002-the-evaluated-bytes-are-the-verified-bytes)
> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface EvaluatorShape {
  readonly evaluate: (pkg: VerifiedPackage, options: { readonly externals: ExternalModules }) =>
    Effect.Effect<ModuleNamespace, EvaluationFailed>
}
type ExternalModules = ReadonlyMap<string, unknown>   // bare specifier → the host's own module namespace
class EvaluationFailed extends Schema.TaggedError<EvaluationFailed>()("EvaluationFailed", {
  digest: Schema.String,
  reason: Schema.Literal("unresolved-import", "threw", "timeout", "no-entry"),
  message: Schema.String
}) {}
```

```
REQUIREMENT: The evaluator MUST evaluate from the bytes held in the
             `VerifiedPackage` and MUST NOT read the package again from its
             source, from a path a fetcher wrote, or from any location an
             external process could modify between verification and
             evaluation.
```

```
REQUIREMENT: Relative imports between package files MUST resolve to files of
             the same verified package. Bare specifiers MUST resolve only
             through `externals`, which the application supplies; any other
             specifier, including a URL, MUST fail evaluation with
             `EvaluationFailed` ("unresolved-import").
```

```
REQUIREMENT: `externals` MUST map `effect` and `@bridger/core` to the host's
             own module instances, so that a loaded plugin shares the host's
             service keys (core [BEH-BR-006](../../core/behaviors/01-plugin-definition.md#beh-br-006-service-keys-are-matched-by-serviceid)).
```

Evaluating "the file we just verified" by path re-opens the window between
check and use: anything able to write that path after the check decides what
runs. Evaluating from held bytes closes it. The resolution rule closes the
other door — an entry that imports a URL would pull in code that no digest
covers. This rule governs module resolution only; code that, once running,
fetches and evaluates more code at run time is outside what an in-process
loader can prevent (06, BEH-LD-042).

## BEH-LD-012: One evaluation per digest per process

> **See:** [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: The loader MUST evaluate a given package digest at most once
             per process. A later `load` of the same digest MUST still run
             steps 1–6 — revocation and policy may have changed — and MUST
             then return a definition from the module already evaluated.
```

```
REQUIREMENT: The loader MUST keep the set of digests evaluated in this
             process, readable as `Loader.resident`. Loading a new digest
             for an id already resident MUST evaluate the new package; the
             old module MUST be reported as still resident.
```

JavaScript runtimes do not unload modules. Evaluating the same bytes twice
would create a second copy of every module-level value — including service
keys — for no gain, and evaluating a new version leaves the old one in memory
whatever the loader does. `Loader.resident` states that fact instead of
hiding it, and is what 04 — Revocation and Kill Switch uses to say which
revoked code is still in memory (BEH-LD-031).

## BEH-LD-013: Every step is bounded, and every failure is a refusal

> **Invariant:** [INV-LD-001](../invariants.md#inv-ld-001-no-code-is-evaluated-before-its-digest-and-signatures-are-accepted)
> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```ts
// illustrative — not type-checked
interface LoaderOptions {
  readonly timeouts?: {
    readonly fetch?: Duration.Input      // default 30 seconds
    readonly verify?: Duration.Input     // signature verifiers, revocation read, predicates; default 10 seconds
    readonly evaluate?: Duration.Input   // default 10 seconds
  }
}
```

```
REQUIREMENT: Each of fetch, verify (steps 4–6) and evaluate MUST be bounded
             by its timeout, read from `Clock`. A step that exceeds it MUST
             be interrupted and MUST end the load with its step's error
             (`FetchFailed` "timeout", `SignatureRejected` "verifier-timeout",
             `RevocationUnavailable` "timeout", `PackageRefused` "timeout",
             `EvaluationFailed` "timeout").
```

```
REQUIREMENT: A verifier, revocation source or predicate that dies MUST be
             treated as a refusal of its step. No failure of a verification
             step MAY be treated as an acceptance.
```

```
REQUIREMENT: When the caller of `load` is interrupted, the load MUST stop at
             the current step. If evaluation had already begun, the digest
             MUST be recorded as resident, because evaluation cannot be
             undone.
```

Failing closed is the only reading under which a verification is a control: a
signature check that passes when the verifier is down is a check that works
only when nobody is attacking it. An evaluation timeout cannot stop module
code that never yields; it bounds the caller's wait, and the digest is
recorded as resident because its code may still be running.

## BEH-LD-014: The result is a stamped definition or a typed error

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md)
> **Core seam:** [27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked
interface LoadedPlugin {
  readonly definition: PluginDefinition<any, any, any, any>   // stamped (01, BEH-LD-007)
  readonly digest: string
  readonly manifest: Manifest                                 // decoded (27 — Manifest and lazy activation)
  readonly verification: VerificationRecord                   // BEH-LD-016
}
type LoadError =
  | FetchFailed | PackageMalformed | UnsupportedDigestAlgorithm | DigestMismatch
  | SignatureRejected | PublisherMismatch | Revoked | StatementRevoked | RevocationUnavailable | RevocationStale
  | PackageRefused | EvaluationFailed | NotAPluginDefinition | PackageManifestMismatch | LoadLogFailed
// StatementRevoked: the "first-party" statement revoked by its statement digest or a signer (09, BEH-LD-065)
// The errors of steps 1–6, which `fetchVerified` runs (05, BEH-LD-039): `LoadError` without
// StatementRevoked (no "first-party" statement is verified, 09) and the errors of steps 7–8.
type FetchError =
  | FetchFailed | PackageMalformed | UnsupportedDigestAlgorithm | DigestMismatch
  | SignatureRejected | PublisherMismatch | Revoked | RevocationUnavailable | RevocationStale
  | PackageRefused | LoadLogFailed
```

```
REQUIREMENT: The definition MUST be read from the export that the manifest's
             `extensions["@bridger/loader"].entry` names for the entry file
             (01, BEH-LD-001). A missing export, or a value that is not a
             `PluginDefinition` as core defines it (01 — Plugin definition),
             MUST fail with `NotAPluginDefinition`.
```

```
REQUIREMENT: `load` MUST NOT install anything. Installing the definition is
             the caller's operator call on the host, attributed, gated and
             audited as core specifies (22–25).
```

Keeping installation out of the loader keeps one path for every change to
the plugin set: the host's. A loaded definition is a value; what happens to
it — `install`, a `DesiredPlugin` entry, a test — is decided by the caller,
and recorded by core when it reaches the host.

## BEH-LD-015: A gate piece refuses definitions that did not come through the loader

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Core seam:** [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321), [25 — Operation gate](../../core/behaviors/25-operation-gate.md) (BEH-BR-219, BEH-BR-223)
> **Satisfies:** [URS-BR-024](../../core/urs.md#urs-br-024-require-approval-before-a-regulated-change)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-044](../../core/gxp/03-risk-assessment.md#rsk-br-044)

```ts
// illustrative — not type-checked
// A store of accepted digests, built as a Layer BEFORE the host and shared by
// the gate piece, every Loader instance and the catalog (05). Given to the host
// as a base service (core 02, BEH-BR-012) so that LoaderPlugin can require it.
interface AcceptedDigestsShape {
  // Acceptances are keyed by (digest, via): at most one per digest and origin.
  // Adds the acceptance with current true, replacing that origin's earlier one for the digest.
  readonly record: (acceptance: { readonly digest: string; readonly via: AcceptedDigest["via"];
                                  readonly verification: VerificationRecord }) => Effect.Effect<void>
  // Removes that origin's acceptance only (05, BEH-LD-035); no-op when there is none.
  readonly remove: (digest: string, via: AcceptedDigest["via"]) => Effect.Effect<void>
  // Sets current false on every acceptance, keeping its record (a Loader's construction).
  readonly markNotCurrent: Effect.Effect<void>
  // A current acceptance when one exists ("load" before "catalog-entry"), otherwise the "load" one,
  // otherwise the "catalog-entry" one.
  readonly lookup: (digest: string) => Option.Option<AcceptedDigest>
  readonly entries: Effect.Effect<ReadonlyArray<AcceptedDigest>>   // every acceptance, current or not
  readonly changes: Stream.Stream<number>                      // revision of the store, latest wins
}
interface AcceptedDigest {
  readonly digest: string
  readonly via: "load" | "catalog-entry"                       // steps 1–6 of a load, or Catalog.verifyEntry (05)
  readonly current: boolean                                    // false once the loader that accepted it is replaced
  readonly verification: VerificationRecord                    // BEH-LD-016
}
class AcceptedDigests extends Context.Service<AcceptedDigests, AcceptedDigestsShape>()("@bridger/loader/AcceptedDigests") {}
declare const AcceptedDigests: { readonly layer: Layer.Layer<AcceptedDigests> }

declare const LoaderGate: {
  // A core gate piece (32, BEH-BR-313): never returns Defer.
  readonly make: (options: LoaderGateOptions) =>
    Effect.Effect<Gate<OperationRequest>, never, AcceptedDigests | RevocationSource>
  // The entry for Gate.all, named "signature", with its required timeout (32, BEH-BR-321).
  readonly piece: (options: LoaderGateOptions & { readonly timeout: Duration.Input }) =>
    Effect.Effect<{ readonly name: string; readonly gate: Gate<OperationRequest>; readonly timeout: Duration.Input },
                  never, AcceptedDigests | RevocationSource>
}
interface LoaderGateOptions {
  // Bootstrap and bundled first-party plugins: the loader plugin itself, plugins shipped in
  // the application's own bundle. Configuration, visible in review; no default.
  readonly exempt: { readonly ids?: readonly string[]; readonly digests?: readonly string[] }
  // The digests the package rule pins (03, BEH-LD-022): the list RevokedDigests.layer is given
  // beside exempt.digests (09, BEH-LD-070). Default none.
  readonly pinned?: readonly string[]
}

// Wiring: one instance of each shared service, built before the host, handed to the
// gate and to the host as a Context base (used as given, core BEH-BR-012).
const program = Effect.gen(function* () {
  const shared = yield* Layer.build(Layer.merge(AcceptedDigests.layer, revocations))
  // pinned: the digests the package rule pins (empty under a signed rule alone)
  const signature = yield* LoaderGate.piece({ exempt: { ids: ["loader", "catalog"] }, pinned, timeout: "2 seconds" })
    .pipe(Effect.provide(shared))
  const HostLive = Bridger.layer({ base: shared /* , ... */ }).pipe(
    Layer.provide(Layer.succeed(OperationGate, OperationGate.fromGate(Gate.all([signature, approval]))))
  )
  // ...
})
```

```
REQUIREMENT: `LoaderGate.make` MUST return a `Gate<OperationRequest>` as
             core defines it (`decide(request, context)` yielding
             `GateDecision`, 32 — Generic gate and plan, BEH-BR-313). Its
             requirements MUST be satisfied when the gate is built, before
             the host: `decide` itself MUST require nothing. It MUST NOT
             return `Defer`. The loader MUST NOT provide an `OperationGate`
             layer on its own; the application composes the piece with
             `Gate.all` (BEH-BR-321) and adapts the result with
             `OperationGate.fromGate` (BEH-BR-315).
```

```
REQUIREMENT: Documentation MUST state that the `AcceptedDigests` and
             `RevocationSource` instances the gate is built with MUST be the
             ones given to the host as a `Context` base (a `Layer` base would
             build second instances) and therefore read by every
             `Loader` instance and by the catalog; a gate built over another
             instance refuses every non-exempt install.
```

```
REQUIREMENT: In this piece a digest *is revoked* exactly when
             `RevokedDigests.refused` would refuse it (09, BEH-LD-070): by
             digest; by the statement digest or, through the re-evaluation
             of 04, BEH-LD-030, by the signers of the record `lookup`
             returns for it — computed from that record's recorded signers
             and `require` (03, BEH-LD-020), never from a policy; or
             "verification-unknown", when it has no `AcceptedDigests`
             record while the set revokes a signer and it is in neither
             `pinned` nor `exempt.digests`. The piece refuses the last case
             with reason "verification-unknown" and the others with
             "digest-revoked".
```

```
REQUIREMENT: For `install` and `replace`, the piece MUST return `Refuse`
             unless one of the following holds for `request.definition`:
             (a) `lookup` of its `digest` returns an acceptance with
             `current` true — accepted by a load of the current loader
             instance, or by `Catalog.verifyEntry` for an entry still
             contributed to the catalog registry (05, BEH-LD-035) — and the
             digest is not revoked;
             (b) `request.target.id` is listed in `exempt.ids`, or its
             `digest` is listed in `exempt.digests`, and its `digest`, when
             present, is not revoked.
             Reasons: "digest-absent", "digest-not-accepted",
             "digest-revoked", "verification-unknown".
```

```
REQUIREMENT: The installs made by core's realm families and ephemeral
             realms (core BEH-BR-331, BEH-BR-336) — for example the agent
             companion's model adapter per session and its subagents'
             plugins — are ordinary `install` requests and MUST be judged
             by the rule above, with no exception for their realm.
             Documentation MUST state the two supported wirings: (1) the
             definitions the family or the ephemeral realm installs are
             those returned by a load of the current `Loader` instance (or
             a catalog entry it verified), so their stamped digest is
             accepted; or (2) the application sets `meta.digest` on each
             bundled definition it installs that way and lists that digest
             in `exempt.digests`. Documentation MUST NOT present an
             exemption by id as the way to admit them.
```

```
REQUIREMENT: A digest listed in `exempt.digests` never has an
             `AcceptedDigests` record, so the rule that refuses a digest
             with no record while a signer is revoked ("verification-unknown",
             04, BEH-LD-028; 09, BEH-LD-070) MUST NOT apply to it: the
             application MUST pass the same `exempt.digests` to
             `RevokedDigests.layer` (in `pinned`) and to `KillSwitch.run`
             (as `exemptDigests`, which it adds to `filterDesired`'s
             `pinned`), and the piece MUST NOT refuse an exempt digest for that reason. An
             exempt digest revoked by digest is still refused. The digests
             the package rule pins (`Loader.pinnedDigests`) are in the same
             position: the application MUST pass them to the piece (in
             `pinned`) and to `RevokedDigests.layer`, and the kill switch
             reads them from `Loader` (04, BEH-LD-028).
```

```
REQUIREMENT: For `enable`, `retry`, `restart` and `reconfigure` — every
             operator call that can start an installed plugin's code again
             — the piece MUST return `Refuse` when the installed
             `request.definition.digest` (core BEH-BR-219) is revoked under
             the current revocation set as defined above: with reason
             "digest-revoked" by digest, statement digest or signer, and
             with reason "verification-unknown" when the digest has no
             `AcceptedDigests` record while the set revokes a signer, unless
             it is in `pinned` or `exempt.digests`. It MUST allow them
             otherwise, including when the digest is absent, or not in
             `AcceptedDigests` while the set revokes no signer: the install
             was the decision the piece governed.
```

```
REQUIREMENT: The piece MUST allow `remove`, `disable` and every other
             request. It MUST never refuse a removal or a disabling. When the
             current revocation set cannot be read, or is stale under
             `maxAge` (04, BEH-LD-027), the piece MUST refuse `install` and
             `replace` with reason "revocation-unavailable" or
             "revocation-stale", and MUST allow the operations of the
             previous requirement only for digests it can show are not
             revoked from the last set it read.
```

```
REQUIREMENT: Each `Loader` instance MUST, at construction, mark every entry
             it did not accept itself as `current: false`
             (`AcceptedDigests.markNotCurrent`), keeping its verification
             record for revocation (04, BEH-LD-030); the record carries the
             signer identities, roles and requirement that re-evaluation
             reads (03, BEH-LD-020), so it is judged without the replaced
             loader's policy. A digest
             accepted under a replaced loader is therefore refused for
             `install` and `replace` until a load or catalog verification of
             the new instance accepts it again. Running plugins are not
             affected: the gate is not consulted for system transitions.
```

```
REQUIREMENT: `AcceptedDigests` MUST keep at most one acceptance per digest
             and origin (`via`): `record` MUST replace that origin's earlier
             acceptance of the digest, and `remove` MUST remove only that
             origin's: the catalog's withdrawal of an entry (05,
             BEH-LD-035) MUST leave a load's acceptance of the same digest in
             place. `lookup` MUST return a `current` acceptance when one
             exists — the `via: "load"` one when both are current — and
             otherwise the `via: "load"` acceptance, and otherwise the
             `via: "catalog-entry"` one, so that a load's acceptance made
             `current: false` by a loader replacement never hides a current
             catalog acceptance from the piece. `entries` MUST list every
             acceptance, current or not, and `changes` MUST publish a new
             revision after every `record`, `remove` and `markNotCurrent`
             that changed the store.
```

Without this piece, the loader is a convenience: any code holding the raw
`Host` can `import()` a module and install it, and core will carry whatever
`meta.digest` it declares. With it, the gate — which core guarantees cannot
be bypassed through the host it guards (core
[BEH-BR-222](../../core/behaviors/25-operation-gate.md#beh-br-222-the-gate-cannot-be-bypassed-through-the-host-it-guards))
— refuses any install or replace whose digest the loader did not accept.

The host reads `OperationGate` once, at construction, and the loader plugin
is installed afterwards, so the piece cannot depend on the plugin. It depends
instead on `AcceptedDigests`, a store that exists before the host and outlives
any loader instance; the loader plugin writes to it. The exemptions exist
because the very first install — the loader plugin itself — and plugins
bundled with the application carry no loader-stamped digest. An exemption by
id lets any definition with that id through and is therefore weaker than an
exemption by digest; both are configuration a reviewer can read, and
neither has a default. No exemption by realm is offered: a realm is a
resolution namespace, not a boundary (core
[BEH-BR-150](../../core/behaviors/17-realms-and-interception.md)), and any
caller of the host can define one, so exempting `ephemeral/` or a family's
realms would admit any code installed there.

A catalog entry counts as accepted before its code is fetched because a lazy
install is the only gated decision for a lazy plugin: leaving `dormant` is a
system transition (core
[BEH-BR-245](../../core/behaviors/27-manifest-and-lazy-activation.md#beh-br-245-triggers-wake-a-dormant-plugin)),
and the load at trigger time still runs steps 1–6 (05, BEH-LD-037).

Refusing the restart-like operations of a revoked digest keeps an operator
from undoing a revocation. The gate cannot do more: core never gates a system
transition (core
[BEH-BR-223](../../core/behaviors/25-operation-gate.md#beh-br-223-system-transitions-and-shutdown-are-audited-not-gated)).
System starts are covered instead by core's `RefusalList`, consulted before
every start whatever its cause (core
[BEH-BR-267](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md#beh-br-267-the-refusallist-port--a-refused-digest-does-not-start-system-starts-included)),
which the loader backs with its revocation set (07, BEH-LD-056). With the list
wired, core refuses those operator calls at its step 4b before the gate is
asked, and this piece's refusal is a second line for deployments without the
list. An `active` plugin is still stopped only by `disable` or `remove` — the
kill switch's job (04).

An undo request of an atomic reconcile (`OperationRequest.undo: true`, core
BEH-BR-219, BEH-BR-325) is judged by the same rules as the operation it
issues: restoring a digest that is no longer accepted, or that was revoked
meanwhile, is refused, and core reports the entry in `PartialApply.notUndone`.
The piece never restores revoked code to undo a failed apply. The fields
`allowChildren` and `mandatoryInterceptions` of a request are not read by the
piece.

The check remains a label check: it holds because a definition carrying a
loader-accepted digest can only have been produced by the loader's stamping,
or by code in the same process copying a stamp, which in-process code can
always do (06, BEH-LD-041).

## BEH-LD-016: The loader keeps its own record, separate from the audit trail

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```ts
// illustrative — not type-checked
interface VerificationRecord {
  readonly digest: string                              // the computed package digest (step 2)
  readonly id?: string                                 // manifest id and version: present once the manifest decoded (step 2)
  readonly version?: string
  readonly at: string                                  // from Clock, ISO-8601 UTC with ms
  readonly policyId?: string                           // present once step 4 was reached
  readonly signers?: readonly RecordedSigner[]         // step 4 reached: every verified signer, with its identity,
                                                       // roles, window outcome and signedAt, not only those
                                                       // counted (03, BEH-LD-018, BEH-LD-020)
  readonly require?: Requirement                       // step 4 reached under a signed rule: the requirement
                                                       // evaluated, which re-evaluation reads (04, BEH-LD-030)
  readonly acceptedBy?: "pinned" | "signed"            // step 4 passed: which branch of the acceptance rule accepted it
  readonly revocationRevision?: number                 // present once step 5 was reached
  readonly outcome: "accepted" | { readonly _tag: string; readonly message: string }
  // statementType, statementDigest, publisher, publisherBound: 07, BEH-LD-055
}
interface LoadLogShape {
  readonly record: (r: VerificationRecord) => Effect.Effect<void, LoadLogFailed>
}
class LoadLog extends Context.Service<LoadLog, LoadLogShape>()("@bridger/loader/LoadLog") {}
```

```
REQUIREMENT: The loader MUST read `LoadLog` with `Effect.serviceOption`.
             When wired, every load that reaches step 2 MUST produce one
             record, accepted or refused, and a load whose `accepted` record
             cannot be written MUST fail with `LoadLogFailed` before step 7:
             code is not evaluated when its acceptance cannot be recorded.
```

```
REQUIREMENT: `id`, `version`, `policyId`, `signers`, `acceptedBy` and
             `revocationRevision` MUST be present exactly when the step
             that produces them was reached (`acceptedBy` when step 4
             passed), and absent otherwise; `require` MUST be present
             exactly when step 4 was reached under a rule with a `signed`
             branch; a refusal at step 3 carries no `policyId`. A *refusal* record that cannot be written MUST be
             logged at error level with the digest and the refusal's tag,
             and MUST NOT change the refusal or its error.
```

```
REQUIREMENT: The loader's record MUST NOT be written to core's `AuditSink`
             and MUST NOT be described as part of core's audit trail. A
             reviewer joins the two by `digest` and time.
```

This mirrors core's rule that a change which cannot be recorded is not made
(core [BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md#beh-br-203-a-change-that-cannot-be-recorded-is-not-made)),
applied to the loader's own decision. The two records answer different
questions: core's says "this digest was installed by this actor"; the
loader's says "this digest was checked against this policy and these signers,
at this revocation revision". Storage and retention of the loader's record are
the application's, as for core's.

**Settled here.** (1) The order of the pipeline is fixed and has no bypass.
(2) Evaluation is from held bytes; module resolution is closed except for
application-supplied externals. (3) The loader never installs and never
provides a gate of its own; it provides a core gate piece built before the
host over the shared `AcceptedDigests` store, with explicit exemptions for
bootstrap and bundled plugins. (4) Verified catalog entries count as
accepted for the install of a lazy definition; the trigger-time load still
runs every step. (5) Revoked digests are refused for every operator call
that restarts code; system starts of a revoked digest are refused by core's
`RefusalList` backed by the loader (07, BEH-LD-056; core G60 closed).
(6) The loader's record is fail-closed for acceptances when wired, and
separate from core's trail.

**Open.** (1) The concrete Node.js evaluator: `vm.SourceTextModule` (still
behind a flag in some runtimes) or another mechanism that evaluates from the
held bytes. Writing the verified bytes to a directory and importing them from
there is acceptable only if no other principal can write that directory; a
re-check of the bytes immediately before `import()` narrows the window
between check and use but does not close it, so it does not satisfy
BEH-LD-011 on its own.

---

_Previous: [01 — Package and Digest](./01-package-and-digest.md)_ · _Next: [03 — Signature Policy](./03-signature-policy.md)_
