# 04 — Command Line

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-04                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): `dev` digests aligned with core's lazy and manifest digest rules (CCR-KT-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

The `bridger` command line is the kit's tool surface. Core excludes a CLI, a
file watcher and a hot-reload policy ([ADR-BR-027](../../core/decisions/027-core-exclusions.md));
they belong here. Every command that changes a host does so through core
operations, attributed, gated and audited like any other caller
([INV-KT-004](../invariants.md#inv-kt-004-tooling-changes-a-host-only-through-host-operations)).
This file owns BEH-KT-025–032 and uses BEH-KT-025–031; 032 is reserved.

```text
bridger create <name> [--template plugin|contract|app|partner]
bridger dev    [--entry <module>] [--plan]
bridger test   [--conformance] [--reporter <name>]
bridger check  [--contracts-only]
bridger pack   [--out <dir>]
bridger publish <package> --target <name>
bridger inspect [--json] [--entry <module>] [<plugin>]
bridger sdk generate <contract-package> [--out <dir>]
```

Exit codes: 0 success; 1 a check or test failed; 2 usage error; 3 an
environment problem (missing entry, unreadable lockfile). Every failure line
that involves an error tag ends with the tag's catalog reference
(07 — Error catalog).

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
REQUIREMENT: `publish` MUST obtain signatures by calling the signing step
             the loader companion defines, passing the package digest, and
             MUST NOT read, receive, store or log signing key material. When
             the loader's signing policy needs N of M signers, `publish` MUST
             stop after its own signature and print what remains.
```

```
REQUIREMENT: `publish` MUST refuse a package whose digest it cannot
             recompute from the files, and MUST refuse to run while `check`
             fails.
```

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
