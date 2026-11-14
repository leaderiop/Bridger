# 03 — Conformance Kits

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-03                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-11): BEH-KT-018: `ConformanceReport` carries `kitVersion`, which BEH-KT-022 requires (PL20) (SPEC-AUDIT-05) (CCR-KT-008)<br>0.3 (2026-11-09): BEH-KT-017 a suite of a local contract (core `Contract.local`) holds author cases only; BEH-KT-020 a local contract is never verified through a wire subject (`LocalContractRefused`) (core CCR-BR-033) (CCR-KT-004)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

A versioned contract ([26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md))
says what a provider's methods accept and return. Core checks version ranges
and method names when a pair is registered (BEH-BR-228) and deliberately
compares no schemas (BEH-BR-230). Whether a provider actually honours the
contract — decodes what it must accept, returns what decodes, fails only with
declared errors, keeps the behaviour the contract's authors wrote down — is
what a conformance kit tests. This file owns BEH-KT-017–024 and uses
BEH-KT-017–022; 023 and 024 are reserved.

The gap report names this `Contract.verify`. Core owns the `Contract`
namespace and must not depend on the kit, so the kit exports it as
`Conformance.verify` ([ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)).

Planned source: `packages/kit/src/conformance/*.ts` *(Planned)*.

## BEH-KT-017: A suite belongs to one contract version

> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225, BEH-BR-226)

```ts
// illustrative — not type-checked
Conformance.suite<C extends Contract.Any>(contract: C, spec: {
  readonly generated?: { readonly samples: number }                     // default 25 per method
  readonly cases?: readonly Case<C>[]                                   // author-written behaviour cases
}): Suite<C>

interface Case<C> {
  readonly id: string                                                   // stable, e.g. "append-then-query"
  readonly since: ContractVersion                                       // the contract version that introduced it
  readonly run: (client: ClientOf<C>) => Effect.Effect<void, CaseFailed>
}

interface Suite<C> { readonly contract: ContractDescriptor; readonly cases: readonly Case<C>[] }
```

```
REQUIREMENT: A suite MUST be bound to the `ContractDescriptor` of the
             contract it was built from (`serviceId`, `name`, `version`,
             `methods`). Every case MUST carry `since`, a version not above
             the suite's version.
```

```
REQUIREMENT: For each method, the suite MUST contain generated cases:
             payloads sampled from the method's payload schema MUST be
             accepted (no decode failure); every success value MUST decode
             with the success schema; every typed failure MUST decode with
             the error schema; for `stream: true`, every element MUST decode.
             Sampling MUST be seeded, and the seed MUST appear in the report.
```

```
REQUIREMENT: Suites MUST be published with the contract package, one per
             contract version, at `<contract-package>/conformance/<version>`.
```

```
REQUIREMENT: A local contract (`Contract.local`, core BEH-BR-225) has no
             schemas, so the requirement on generated cases above MUST NOT
             apply to it: `Conformance.suite` of a local contract MUST be
             typed to reject `generated`, its suite MUST hold author cases
             only, and a suite built untyped with `generated` for one MUST
             make `Conformance.verify` fail with the remote companion's
             `LocalContractRefused { serviceId, site:
             "conformance-generated" }` (remote BEH-RM-007) before it runs
             a case. Its author cases run against a plugin subject
             (BEH-KT-019) only (BEH-KT-020).
```

Generated cases test the schemas; author cases test behaviour the schema
cannot express ("a query after an append sees the entry"). Both are needed;
neither alone is a conformance argument.

**Open.** Sampling relies on schema-derived arbitraries, which Effect v4
marks unstable (`docs/knowledge/EFFECT-V4.md`); the generator is isolated so
that it can follow API changes.

## BEH-KT-018: verify runs every suite of the subject's major up to its version

> **Invariant:** [INV-KT-005](../invariants.md#inv-kt-005-a-conformance-pass-comes-only-from-executed-cases)
> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-230)

```ts
// illustrative — not type-checked
Conformance.verify<C extends Contract.Any>(
  subject: Plugin.Any | HttpSubject,
  suites: readonly Suite<C>[],
  options?: { readonly provide?: readonly Provision[]; readonly config?: unknown; readonly seed?: number }
): Effect.Effect<ConformanceReport, ConformanceFailed | SuiteVersionMismatch, Scope.Scope>

interface ConformanceReport {
  readonly kitVersion: string                            // the @bridger/kit version that ran the suites (BEH-KT-022)
  readonly contract: ContractDescriptor                  // as the subject provides it
  readonly subject: { readonly kind: "plugin" | "http"; readonly id: string }
  readonly seed: number
  readonly cases: readonly { readonly suite: ContractVersion; readonly id: string; readonly method?: string
                             readonly outcome: "passed" | "failed"; readonly message?: string }[]
}
```

```
REQUIREMENT: `verify` MUST run, for a subject providing version V of a
             contract, every given suite whose version has the same major
             as V and is not above V, and no other. A suite list with no
             such suite MUST fail with `SuiteVersionMismatch { serviceId,
             provided, suites }`.
```

```
REQUIREMENT: Every case of every selected suite MUST be executed and MUST
             appear in the report with `passed` or `failed`. There is no
             "skipped" outcome. `verify` MUST fail with `ConformanceFailed
             { serviceId, version, failed }` (the failed case ids) when any
             case fails, and the report MUST still be available from the
             error.
```

Add-only evolution (BEH-BR-230) means a provider of 2.3 must still pass what
2.0 and 2.1 promised; running the older suites is the cheap way to check it.
A suite of a later version is not run: it may test methods the subject does
not claim.

## BEH-KT-019: A plugin subject is mounted with PluginTest

> **Invariant:** [INV-KT-002](../invariants.md#inv-kt-002-test-helpers-run-only-through-testhost)
> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)

```
REQUIREMENT: A plugin subject MUST be mounted with `PluginTest.mount` and the
             given `provide` and `config`. Cases MUST reach it through
             `Mounted.use` on the contract's key, so that every call is a
             leased call through the host. The subject MUST declare the
             contract in `provides`; otherwise `verify` MUST fail with
             `SuiteVersionMismatch` with `provided` absent.
```

## BEH-KT-020: An HTTP subject is reached through the remote companion's binding

> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)
> **Core seam:** [references/remote/](../../remote/invariants.md) (RM)

```ts
// illustrative — not type-checked
Conformance.http(url: string, options: { readonly contract: Contract.Any; readonly timeout: Duration.Input; readonly headers?: Record<string, string> }): HttpSubject
```

```
REQUIREMENT: An HTTP subject MUST be called with the wire encoding and
             session handshake the remote companion defines for HTTP; the
             kit MUST NOT define a wire format of its own. Every call MUST
             carry the given `timeout`.
```

```
REQUIREMENT: Documentation MUST state that running a suite against a
             deployed endpoint sends generated payloads to it, and that an
             endpoint with side effects should be verified in a test
             environment.
```

```
REQUIREMENT: `Conformance.http` MUST be typed to reject a local contract
             (core BEH-BR-225). `Conformance.verify` of a suite whose
             `ContractDescriptor` has `local` true against any subject other
             than a plugin subject (BEH-KT-019) MUST fail with
             `LocalContractRefused { serviceId, site: "conformance-wire" }`
             before it opens a connection or sends anything: a local
             contract must not cross a host boundary (core BEH-BR-232).
```

This is what lets a partner run the same suite against the service they
deploy as the integrator runs against the proxy plugin.

## BEH-KT-021: Suites are generated, never hand-copied, from the contract

> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)

```
REQUIREMENT: `bridger sdk generate` and `bridger pack` of a contract package
             (04 — Command line) MUST regenerate the generated cases of the
             current version's suite from the contract's schemas, and MUST
             leave the suites of earlier versions byte-identical. A change
             to an earlier suite MUST fail `bridger check`.
```

Freezing old suites is how the add-only promise stays testable: if the
contract author could edit the 2.0 suite while releasing 2.4, the cumulative
run of BEH-KT-018 would test nothing.

## BEH-KT-022: A conformance report is never presented as more than it is

> **Invariant:** [INV-KT-005](../invariants.md#inv-kt-005-a-conformance-pass-comes-only-from-executed-cases)
> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)

```
REQUIREMENT: Reports and CLI output MUST use the words "passed N of N
             cases" and MUST NOT describe a subject as conformant,
             certified, validated or compliant.
```

```
REQUIREMENT: A report MUST record the kit version, the seed, and each
             suite's version, so that a run can be repeated.
```

---

_Previous: [02 — Plugin test harness](./02-plugin-test.md)_ · _Next: [04 — Command line](./04-cli.md)_
