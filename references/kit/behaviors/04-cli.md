# 04 — Command Line

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-04                                            |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-11): BEH-KT-026: `dev --cold` passes `cold: true` on the reload's `reconcile` (core `ReconcileOptions.cold`, applied to every replace it issues) and on any `replace` it issues directly (`ReplaceOptions.cold`) (H9) (SPEC-AUDIT-05) (CCR-KT-008)<br>0.7 (2026-11-10): Synopsis: `verify-chain` takes `--keyed <module>` and `--expect-keyed [<seriesId>]` (06, BEH-KT-047) (A1) (SPEC-AUDIT-04) (CCR-KT-007)<br>0.6 (2026-11-09): BEH-KT-029: `pack` writes the entry in `extensions["@bridger/loader"].entry` and refuses a partner manifest without the guest shape (M-03, F-06); BEH-KT-032: `countersign --statement first-party` signs the loader's "first-party" statement (F-06) (CCR-KT-004)<br>0.5 (2026-11-08): `publish` takes `--signer`; without the deployment's rules it prints "policy unknown" and runs no verification, with them it needs an explicit revocation source or `--revocation unbounded` and writes no `LoadLog`; `verify-chain` synopsis gains `--verifier`, `--profile` and `--expect-head`, and exit code 4 (round-2 agent review R3-10–R3-13) (CCR-KT-003)<br>0.4 (2026-11-08): `publish` signs through the loader's `Statement.signingInput` and `StatementSigner` and reports with `SignaturePolicy.verify` (G56 closed for the kit); BEH-KT-032 `countersign`; `verify-chain` listed (06); manifests carry `role`, `target`, `listens`; `dev --cold`, non-atomic reloads and G65 (round 2: recheck items 11, 14, 17; core alignment) (CCR-KT-003)<br>0.3 (2026-11-08): `dev` digests aligned with core's lazy and manifest digest rules (CCR-KT-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

The `bridger` command line is the kit's tool surface. Core excludes a CLI, a
file watcher and a hot-reload policy ([ADR-BR-027](../../core/decisions/027-core-exclusions.md));
they belong here. Every command that changes a host does so through core
operations, attributed, gated and audited like any other caller
([INV-KT-004](../invariants.md#inv-kt-004-tooling-changes-a-host-only-through-host-operations)).
This file owns BEH-KT-025–032 and uses all eight.

```text
bridger create <name> [--template plugin|contract|app|partner]
bridger dev    [--entry <module>] [--plan] [--cold]
bridger test   [--conformance] [--reporter <name>]
bridger check  [--contracts-only]
bridger pack   [--out <dir>]
bridger publish <package> --target <name> [--signer <adapter>] [--rules <file>] [--revocation <file>|unbounded] [--partial]
bridger countersign <package> [--statement package|first-party] [--signer <adapter>] [--rules <file>] [--revocation <file>|unbounded]
bridger verify-chain <bundle> [--trust-roots <file>] [--verifier <module>]... [--profile <name>=<module>]... [--expect-head <seriesId>=<seq>[:<hash>]]... [--keyed <module>] [--expect-keyed [<seriesId>]]... [--json]
bridger inspect [--json] [--entry <module>] [<plugin>]
bridger sdk generate <contract-package> [--out <dir>]
```

Exit codes: 0 success; 1 a check or test failed; 2 usage error; 3 an
environment problem (missing entry, unreadable lockfile); 4, for
`verify-chain` only, nothing inconsistent was found but the check is
incomplete (06, BEH-KT-047). Every failure line
that involves an error tag ends with the tag's catalog reference
(07 — Error catalog).

`verify-chain` changes nothing and is specified with the other read-only tools in
[06 — Devtools inspector](./06-devtools-inspector.md) (BEH-KT-047).

Planned source: `packages/kit/src/cli/*.ts` *(Planned)*.

## BEH-KT-025: create scaffolds a package that passes its own checks

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)

```
REQUIREMENT: `create` MUST generate a package that, without edits, passes
             `bridger check` and `bridger test`. Templates: `plugin` (a
             `definePlugin` plugin and an `it.plugin` test), `contract` (a
             `Contract.make` contract, its conformance suite and generated
             SDK), `app` (an entry module that builds a host and installs
             plugins), `partner` (a Promise SDK handler module and a
             conformance run against it, with no `effect` import).
```

```
REQUIREMENT: Generated code MUST NOT contain a type assertion (`as`), an
             `as const` on `requires` or `provides`, or `any`.
```

## BEH-KT-026: dev reloads changed plugins with replace on a host it owns

> **Invariant:** [INV-KT-004](../invariants.md#inv-kt-004-tooling-changes-a-host-only-through-host-operations)
> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md), [ADR-BR-004](../../core/decisions/004-replace-is-stop-then-start.md)
> **Core seam:** [18 — Reconciliation](../../core/behaviors/18-reconciliation-and-confluence.md) (BEH-BR-153–156), [07 — Replacement](../../core/behaviors/07-replacement-and-reactivation.md) (BEH-BR-049, BEH-BR-050); state handoff [core 34 — State handoff](../../core/behaviors/34-state-handoff.md) (BEH-BR-345–352); reconcile plan [core 32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321)

The entry module exports a desired list:

```ts
// illustrative — not type-checked
export default Dev.app({
  host: { stallWarning: "5 seconds" },                // BridgerOptions for the dev host
  plugins: [logger, greeter],                          // Plugin.Any[]
  base: Layer.empty
})
```

```
REQUIREMENT: `dev` MUST create its own host with `Bridger.make` and MUST NOT
             attach to a host it did not create. It MUST refuse to start,
             with exit code 3, when the entry's options wire an `AuditSink`,
             an `OperationGate` or a `ConfigFingerprinter`, unless they are
             the kit's in-memory development doubles.
```

```
REQUIREMENT: On start, `dev` MUST call `reconcile` with the entry's list under
             the ownership scope `"bridger:dev"`, attributed to the actor
             `{ id: "bridger-dev", kind: "service" }` with reason
             `"dev start"`.
```

```
REQUIREMENT: On a saved change, `dev` MUST re-evaluate the entry in a fresh
             module instance, compute for each definition a development
             digest (`meta.digest = "dev:" + hash of its module sources`), and
             call `reconcile` again with reason `"dev reload: <files>"`.
             Changed digests MUST therefore become `replace` actions, new ids
             `install` and missing ids `remove` (BEH-BR-154, BEH-BR-155):
             core compares `meta.version` and `meta.digest` together, so a
             new development digest at an unchanged version is a different
             definition. When a definition carries a manifest with a
             `digest`, `dev` MUST set that field to the same development
             digest, because core refuses a manifest digest that differs
             from `meta.digest` (BEH-BR-242). For a lazy definition `dev`
             MUST pass the development digest as `Plugin.lazy`'s `digest`
             option (BEH-BR-244) and stamp the same `meta.digest` on the
             definition its `load` returns (BEH-BR-246). `dev` MUST NOT call any host-internal API.
```

```
REQUIREMENT: When a replaced definition declares a state handoff (file 34),
             the reload MUST use it; otherwise the plugin cold-starts and
             `dev` MUST print "cold start: <id> (no handoff declared)".
             `bridger dev --cold` MUST pass `cold: true` on the reload's
             `reconcile` (core `ReconcileOptions.cold`, which applies to
             every replace the reconcile issues, 18) and on any `replace` it
             issues directly (core `ReplaceOptions.cold`, 02, BEH-BR-013),
             as core 34 defines it (BEH-BR-353), so that a reload skips a
             declared handoff on purpose.
```

```
REQUIREMENT: `dev` MUST reconcile without `atomic` (core BEH-BR-153; the
             default is false). When a reload narrows a provider that a
             listed dependent still needs, core takes two runs (gap G65):
             `dev` MUST print the entry core rejected and apply the second
             run on the next save, not retry in a loop.
```

```
REQUIREMENT: A reload that fails MUST leave the host as core leaves it:
             a `ReplaceError` leaves the running plugin untouched
             (BEH-BR-050); a failed build leaves the new definition
             `failed` (BEH-BR-053). `dev` MUST print the per-entry
             rejection or the failure with its catalog entry and MUST keep
             watching; the next successful save replaces again.
```

```
REQUIREMENT: With `--plan`, `dev` MUST show the read-only `Host.plan` of
             each reload (core BEH-BR-317) and, after confirmation, apply it
             with `reconcile(desired, { expect: plan })` (BEH-BR-319), so a
             host that changed meanwhile fails with `PlanStale` and applies
             nothing.
```

```
REQUIREMENT: Documentation MUST state that re-evaluating modules does not
             reclaim the memory of earlier module instances (ADR-BR-027,
             "cannot promise reclamation of imported code"), and `dev` MUST
             print a warning, suggesting a restart, after 100 reloads in one
             process.
```

Driving reload through `reconcile` rather than calling `replace` directly
gives dev the per-entry error report, the ownership scope and idempotence for
free; the action it performs for a changed plugin is still core's `replace`,
with dependents stopping first and leases draining (BEH-BR-049).

**Settled here.** A development host never has a real sink or gate. A reload
loop that replaced code on a host feeding a regulated record would turn
unreviewed saves into recorded production changes; refusing at start is
cheaper than explaining it later.

## BEH-KT-027: test runs the package's tests and conformance suites

> **Invariant:** [INV-KT-005](../invariants.md#inv-kt-005-a-conformance-pass-comes-only-from-executed-cases)
> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)

```
REQUIREMENT: `test` MUST run the package's test files with the configured
             runner and, with `--conformance` or when the package declares
             `bridger.conformance` entries in its manifest file, run
             `Conformance.verify` for each and print each report.
```

```
REQUIREMENT: Reporters MUST report counts of executed cases only. A reporter
             that emits requirement identifiers MUST take them from tags in
             the test source, never from a list of expected identifiers.
```

## BEH-KT-028: check finds a second copy of Effect and breaking contract changes

> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md), [ADR-BR-011](../../core/decisions/011-serviceid-is-key-identity.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-230); manifest [core 27 — Manifest and lazy activation](../../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249)

```
REQUIREMENT: `check` MUST resolve `effect` and `@bridger/core` from every
             package in the dependency graph and MUST fail with
             `DuplicateDependencyCopy { package, copies }` (copies: resolved
             path and version) when more than one physical copy of either is
             reachable.
```

```
REQUIREMENT: For each contract the package defines, `check` MUST compare its
             schemas with the last released version recorded in
             `bridger.contracts.lock` and classify each difference by the
             table of BEH-BR-230. A change the table forbids within a major,
             released under the same major, MUST fail with
             `ContractBreakingChange { serviceId, from, to, changes }`. A
             change that adds without a minor bump MUST fail with
             `ContractVersionNotBumped { serviceId, version, changes }`.
```

```
REQUIREMENT: `check` MUST verify that each plugin's manifest (file 27), when
             present, declares the same `requires`, `provides` and
             `optional` service identifiers and ranges as its definition,
             and that frozen conformance suites are unchanged (BEH-KT-021).
```

```
REQUIREMENT: `check` MUST type-check every snippet in the package's
             documentation marked `type-checked: yes`, and MUST fail if a
             snippet so marked does not compile.
```

Two copies of `effect` make two `Context` worlds: a key created with one copy
is not found by a host built with the other, which surfaces as
`ServiceUnavailable` or `KeyMismatch` far from the cause. The check names the
cause before anything runs.

**Open.** Schema comparison needs a stable structural form of a schema; the
candidate is Effect's schema representation (`SchemaRepresentation`, see
`docs/knowledge/EFFECT-V4.md` E23). Transformations that the representation
cannot express are reported as "not comparable" and fail the check unless
acknowledged in the lockfile.

## BEH-KT-029: pack builds a loader package and nothing else

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [references/loader/](../../loader/behaviors/01-package-and-digest.md) (LD; BEH-LD-001, BEH-LD-002)

```
REQUIREMENT: `pack` MUST run `check`, then produce a package in the loader
             companion's format (manifest bytes, one SBOM, files;
             BEH-LD-001) and compute its digest with the loader's own digest
             function (BEH-LD-002). The kit MUST NOT implement a digest.
```

```
REQUIREMENT: The manifest `pack` emits, and the one `check` compares, MUST
             carry each contribution's `role` and `target` when the plugin
             registers its hook contributions with them, and `listens` with
             the event ids its listeners subscribe to (core BEH-BR-241), so
             that `Host.declaredContributions` and
             `AccessPolicy.declaredOnly` (core BEH-BR-250, BEH-BR-268) see
             what the code registers. A manifest emitted for a data pack
             MUST be a loader `DataPackManifest` (BEH-LD-057), with no
             plugin fields.
```

```
REQUIREMENT: Every plugin manifest `pack` emits MUST name the package's
             entry in the loader's reserved key
             `extensions["@bridger/loader"].entry` — `{ file, export }`,
             the entry file's path in the package and the name of the
             export holding the definition (loader
             [BEH-LD-001](../../loader/behaviors/01-package-and-digest.md#beh-ld-001-a-package-is-a-manifest-an-sbom-and-a-set-of-files)) —
             and `pack` MUST refuse to build when the file is not one of the
             package's files. The kit MUST NOT write any other key under
             `extensions["@bridger/loader"]`.
```

```
REQUIREMENT: For a package made from the `partner` template, the manifest
             `pack` emits MUST have the guest shape of the loader companion
             ([BEH-LD-068](../../loader/behaviors/09-trust-class-and-guest-links.md)):
             exactly one `provides` reference to the contract it serves,
             empty `requires`, `optional`, `activation`, `contributions` and
             `listens`, and its callbacks in `requested.capabilities`
             (05, BEH-KT-035). `pack` MUST refuse a partner package whose
             manifest does not have that shape, naming the field, so that a
             partner learns at build time what a host's
             `LoaderRemote.link` would refuse with `GuestEntryInvalid`.
```

```
REQUIREMENT: `pack` MUST be reproducible: the same sources, lockfile and kit
             version MUST give byte-identical packages (sorted paths, fixed
             timestamps, normalised line endings).
```

## BEH-KT-030: publish delegates signing to the loader and holds no key

> **Invariant:** [INV-KT-007](../invariants.md#inv-kt-007-publish-never-handles-signing-key-material)
> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [references/loader/](../../loader/behaviors/01-package-and-digest.md) (LD)

```ts
// illustrative — not type-checked
interface PublishTarget {                                // port; adapters per registry
  readonly upload: (pkg: PackedPackage, signatures: readonly Signature[]) => Effect.Effect<{ readonly location: string }, PublishFailed>
}
```

```
REQUIREMENT: `publish` MUST obtain its signature through the loader's
             signing step: it MUST build the statement with
             `Statement.make({ statementType: "package", subject: { digest },
             id, version })`, hand `Statement.signingInput(statement)` to the
             `StatementSigner` adapter the person publishing has wired, and
             append the returned `Signature` to the package's signatures
             (loader [07 — Signed statements](../../loader/behaviors/07-signed-statements.md),
             BEH-LD-049, BEH-LD-054). It MUST NOT read, receive, store or
             log signing key material.
```

```
REQUIREMENT: `publish` MUST sign with the `StatementSigner` adapter named
             by `--signer`, or by the project configuration when the option
             is absent, and MUST stop with a usage error when neither names
             one.
```

```
REQUIREMENT: Without the deployment's rules (`--rules`, or the project
             configuration), `publish` MUST NOT call
             `SignaturePolicy.verify`, MUST print "policy unknown: the
             deployment's rules were not given" in place of the policy line,
             and MUST upload only with `--partial`. With the rules, it MUST
             build a `StatementVerifier` from them, with `maxAge`
             "unbounded" (it loads nothing) and no `LoadLog`, over the
             revocation source `--revocation` names: a file holding a saved
             `SignedRevocationList`, offered to `RevocationSource.verified`
             built with the revocation issuer and trust root the rules file
             gives (loader BEH-LD-026), whose `issuedAt` MUST be printed; or
             the value `unbounded`, meaning `RevocationSource.constant` of an
             empty set, in which case it MUST print a warning that no
             revocation was checked. It MUST stop with a usage error when
             the rules are given without `--revocation`.
```

```
REQUIREMENT: After signing, `publish` MUST call `SignaturePolicy.verify`
             (BEH-LD-050) with the package's signatures, the manifest's
             `publisher`, and the deployment's rules as above; when the
             result is `SignatureRejected` ("unsatisfied"),
             it MUST stop after its own signature, upload nothing unless
             `--partial` is given, and print the unmet branch the error
             names (`missing`) as what remains — for example "needs 1
             signer with role reviewer: run bridger countersign". A
             `PublisherMismatch` MUST stop the publish with its catalog
             entry.
```

```
REQUIREMENT: `publish` MUST refuse a package whose digest it cannot
             recompute from the files, and MUST refuse to run while `check`
             fails.
```

## BEH-KT-032: countersign adds a second signer entry without changing the package

> **Invariant:** [INV-KT-007](../invariants.md#inv-kt-007-publish-never-handles-signing-key-material)
> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [references/loader/](../../loader/behaviors/07-signed-statements.md) (LD; BEH-LD-050, BEH-LD-053, BEH-LD-054)

```text
$ bridger countersign dist/report-export-1.4.0.bpkg --signer kms-reviewer
package   report-export 1.4.0  sha256:3f…a1 (recomputed)
verified  publisher-key (roles: publisher)
signing   kms-reviewer …  ok (signer entry reviewer-key)
policy    release-v1: satisfied (publisher-key, reviewer-key)
```

```
REQUIREMENT: `countersign` MUST recompute the package digest from its files
             with the loader's digest function (BEH-LD-002) and MUST refuse
             a package whose digest differs from the one its signatures
             name. It MUST verify the existing signatures with
             `SignaturePolicy.verify` before signing and print the signer
             entries that verified, with the rules and revocation source
             built as for `publish` (BEH-KT-030); without the deployment's
             rules it MUST print "policy unknown" and sign without that
             report.
```

```
REQUIREMENT: `countersign` MUST sign the same statement the existing
             signatures cover — `statementType` "package", the recomputed
             digest, the manifest's id and version — through
             `Statement.signingInput` and the wired `StatementSigner`
             (BEH-LD-054), and MUST append the signature beside the package
             without changing any of its bytes. When the new signature
             verifies to a signer entry that already signed, it MUST say so
             and add nothing (the policy counts that entry once,
             BEH-LD-020).
```

```
REQUIREMENT: After appending, `countersign` MUST call
             `SignaturePolicy.verify` again and print whether the policy is
             satisfied or which branch remains. It MUST NOT read, receive,
             store or log key material; a signer failure MUST end the
             command with `SigningFailed` and its catalog entry, leaving the
             signatures unchanged.
```

```
REQUIREMENT: `countersign` MUST also accept a data pack (loader 08), with
             `statementType` "data-pack" and the data-pack digest
             (BEH-LD-058), under the same rules.
```

```
REQUIREMENT: With `--statement first-party`, `countersign` MUST sign the
             loader's "first-party" statement about the package — the
             recomputed package digest, the manifest's id and version
             ([BEH-LD-065](../../loader/behaviors/09-trust-class-and-guest-links.md)) —
             through the same signing step, MUST append the signature to the
             package's first-party signatures (the catalog entry's
             `firstParty`), never to its package signatures, and MUST then
             verify both statements and print each result: the package
             statement first, since a first-party mark on a package the
             "package" rule refuses marks nothing. Documentation MUST state
             that this is the application's own release authority marking
             its own code for evaluation in the host's process, that a
             partner never runs it, and that the default `--statement
             package` never adds a first-party signature.
```

Countersigning is the second half of double signing: a reviewer who did not
build the package signs the same statement days later, with a key the
publisher never sees. Because signatures sit outside the digest, the catalog
entry, the stamp and every earlier record keep naming the same bytes. The
partner publishing guide ([appendix B](../appendices/b-partner-publishing.md))
walks through both steps.

## BEH-KT-031: inspect prints the inspector report

> **See:** [ADR-KT-005](../decisions/005-devtools-are-read-only.md)
> **Core seam:** [13 — Observability](../../core/behaviors/13-observability-and-diagnostics.md) (BEH-BR-118)

```
REQUIREMENT: `inspect` MUST print the `InspectorReport` of
             06 — Devtools inspector for the `dev` host of `--entry`, or for
             a host whose application exposes the `Inspector` service at a
             configured address. With `--json` it MUST print exactly the
             report's JSON encoding, versioned by `schemaVersion`; with a
             plugin argument, the `why` explanation of that plugin.
```

---

_Previous: [03 — Conformance kits](./03-conformance-kits.md)_ · _Next: [05 — Promise SDK](./05-promise-sdk.md)_
