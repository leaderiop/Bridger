# Runtime Invariants — Kit Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-INV                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Runtime Invariants                                           |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

Properties of `@bridger/kit` that hold for every execution. Each says what the
kit never does to a host or to the data it handles, because a developer tool
that quietly changes semantics is worse than no tool.

This specification is prospective
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): nothing
below is implemented. Every **Source** names a planned module, marked
*(Planned)*; every **Verification** names a planned check, also *(Planned)*.

## INV-KT-001: A facade plugin behaves as its core equivalent

A definition produced by `definePlugin` is a core `PluginDefinition` with the
same fields as the equivalent `Plugin.define` call, and a host cannot tell the
two apart.

**Source**: `packages/kit/src/definePlugin.ts` *(Planned)* — derives `build`
by the fixed rules of BEH-KT-001 and adds no field.

**Implication**: everything the core specifies about a plugin holds for a
facade plugin; the facade cannot become a second, weaker lifecycle.

**Verification** *(Planned)*: REQ-KT-001 — for each form, install the facade
definition and its hand-written equivalent on two `TestHost`s and compare
snapshots, audit records and inspections step by step.

**Related**: [BEH-KT-001](./behaviors/01-plugin-facade.md#beh-kt-001-defineplugin-returns-a-core-definition-and-nothing-more), [BEH-KT-003](./behaviors/01-plugin-facade.md#beh-kt-003-the-keys-a-build-uses-are-checked-against-requires-with-a-readable-error), [ADR-KT-001](./decisions/001-kit-is-sugar-and-tools-over-core.md)

## INV-KT-002: Test helpers run only through TestHost

Every `PluginTest`, `it.plugin` and plugin-subject conformance run drives a
core `TestHost`; no helper schedules, injects faults or resolves services by a
path of its own.

**Source**: `packages/kit/src/testing/PluginTest.ts` *(Planned)*.

**Implication**: a passing kit test means what a passing `TestHost` test
means ([BEH-BR-177](./../core/behaviors/21-testing-host.md)), no less.

**Verification** *(Planned)*: REQ-KT-007, REQ-KT-014; a code check that the
testing entry point imports scheduling only from `@bridger/core/testing`.

**Related**: [BEH-KT-009](./behaviors/02-plugin-test.md#beh-kt-009-mount-installs-one-plugin-with-its-provisions-and-waits-for-it), [BEH-KT-013](./behaviors/02-plugin-test.md#beh-kt-013-faults-and-stepping-stay-cores), [BEH-KT-019](./behaviors/03-conformance-kits.md#beh-kt-019-a-plugin-subject-is-mounted-with-plugintest)

## INV-KT-003: Tooling output carries names and counts, never values

No kit output — inspector report, `why`, timeline, CLI messages, test failure
prints, catalog entries — contains a configuration value, a service object or
a raw cause.

**Source**: `packages/kit/src/devtools/*.ts`, `packages/kit/src/cli/*.ts` *(Planned)* — built only from core observation, which already carries names and counts ([INV-BR-013](../core/invariants.md#inv-br-013-configuration-values-are-never-observable)).

**Implication**: pasting a devtools report into an issue does not leak a secret.

**Verification** *(Planned)*: REQ-KT-023, REQ-KT-024 with a configuration
containing a sentinel value that must not appear in any output.

**Related**: [BEH-KT-041](./behaviors/06-devtools-inspector.md#beh-kt-041-the-inspector-is-a-plugin-over-core-observation-only), [BEH-KT-044](./behaviors/06-devtools-inspector.md#beh-kt-044-leases-are-counts-per-plugin-never-holders), [BEH-KT-049](./behaviors/07-error-catalog.md#beh-kt-049-one-entry-per-tag-as-data)

## INV-KT-004: Tooling changes a host only through host operations

Every change the kit makes to a host — `dev` reloads, `PluginTest.mount` — is
a core operation with an `OperationContext`, and therefore linearized,
attributed, gated and audited as core specifies.

**Source**: `packages/kit/src/cli/dev.ts`, `packages/kit/src/testing/PluginTest.ts` *(Planned)*.

**Implication**: no kit path bypasses the legality table, the gate or the
audit sink ([ADR-BR-032](../core/decisions/032-operation-gate.md)).

**Verification** *(Planned)*: REQ-KT-017 asserts the records of a reload; a
code check that the kit imports no host-internal module.

**Related**: [BEH-KT-026](./behaviors/04-cli.md#beh-kt-026-dev-reloads-changed-plugins-with-replace-on-a-host-it-owns), [BEH-KT-009](./behaviors/02-plugin-test.md#beh-kt-009-mount-installs-one-plugin-with-its-provisions-and-waits-for-it)

## INV-KT-005: A conformance pass comes only from executed cases

A report counts a case as passed only when that case ran and its assertion
held; there is no skipped, assumed or inherited pass.

**Source**: `packages/kit/src/conformance/verify.ts` *(Planned)*.

**Implication**: "passed N of N" means N executions
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

**Verification** *(Planned)*: REQ-KT-013, including a mutation that skips a
case and must turn the run into a failure.

**Related**: [BEH-KT-018](./behaviors/03-conformance-kits.md#beh-kt-018-verify-runs-every-suite-of-the-subjects-major-up-to-its-version), [BEH-KT-022](./behaviors/03-conformance-kits.md#beh-kt-022-a-conformance-report-is-never-presented-as-more-than-it-is), [BEH-KT-027](./behaviors/04-cli.md#beh-kt-027-test-runs-the-packages-tests-and-conformance-suites)

## INV-KT-006: A partner handler sees only plain data

A Promise SDK handler receives a checked, JSON-compatible payload and a
`CallContext`; never a host object, key, actor, token or configuration value.
What it throws leaves the guest only as a declared error or a fixed-text
undeclared failure.

**Source**: `packages/kit/src/sdk/runtime.ts` *(Planned)*.

**Implication**: the SDK adds no channel through which host internals reach
partner code, or partner exception text reaches host logs.

**Verification** *(Planned)*: REQ-KT-020, REQ-KT-021.

**Related**: [BEH-KT-034](./behaviors/05-promise-sdk.md#beh-kt-034-serve-wraps-handlers-for-the-remote-companions-guest-runtime), [ADR-KT-004](./decisions/004-promise-sdk-for-out-of-process-partners.md)

## INV-KT-007: Publish never handles signing key material

`bridger publish` passes a digest to the loader companion's signing step and
receives signatures; it never reads, receives, stores or logs a private key.

**Source**: `packages/kit/src/cli/publish.ts` *(Planned)*.

**Implication**: the kit cannot leak a signing key, because it never has one.

**Verification** *(Planned)*: REQ-KT-019 with a signer double that records
what it was given.

**Related**: [BEH-KT-030](./behaviors/04-cli.md#beh-kt-030-publish-delegates-signing-to-the-loader-and-holds-no-key)

---

_Previous: [08 — Required acceptance checks](./behaviors/08-required-acceptance-checks.md)_ · _Next: [Decisions](./decisions/001-kit-is-sugar-and-tools-over-core.md)_
