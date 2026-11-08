# 06 — Limits and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-06                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.2 (2026-11-08): BEH-LD-046 limited to direct loads; a lazy load runs in the build slot with the loader's timeouts inside `buildTimeout`; `LoaderPlugin` requires `AcceptedDigests`; acceptance checks 5, 6, 7, 12, 13, 15 and 16 extended (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

---

A loader is easy to over-read. "Verified" slides into "safe", "removed" into
"gone", "signed" into "approved for this deployment". This file states what
the loader cannot do inside one JavaScript process, how it sits next to the
host and its GxP hooks, which test fixtures it ships, and the acceptance
checks its test suite must contain
([ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)).
This file owns BEH-LD-041–048 and uses all eight.

Planned source: `packages/loader/src/index.ts`,
`packages/loader/src/testing.ts` *(Planned)*.

## BEH-LD-041: Verification establishes provenance, not containment

> **See:** [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: Documentation MUST state that code evaluated by `load` runs in
             the host's process with the host's authority: it can read and
             call anything the process can, copy another definition's
             `meta` stamp, and defeat any in-process check, including
             `LoaderGate` (02, BEH-LD-015). The loader MUST NOT be described
             as a sandbox or as isolating plugins.
```

```
REQUIREMENT: Documentation MUST state that `load` is intended for the
             application's own first-party plugins and system plugins only.
```

The loader's checks keep code that nobody approved from being evaluated.
They do nothing about code that was approved and misbehaves, because nothing
inside a process can. Realms do not change that
([INV-BR-020](../../core/invariants.md#inv-br-020-a-realm-changes-resolution-only)).

## BEH-LD-042: No reclamation, and no control of run-time code fetching

> **See:** [ADR-LD-005](../decisions/005-in-process-loading-is-for-first-party-code.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: Documentation MUST state that the loader cannot unload
             evaluated code; that replacing or removing a plugin leaves its
             module in memory until the process ends (02, BEH-LD-012; core
             BEH-BR-048); and that `Loader.resident` and
             `KillSwitch.status.residentRevoked` are how this is made
             visible.
```

```
REQUIREMENT: Documentation MUST state that module resolution (02,
             BEH-LD-011) governs imports only: evaluated code that fetches
             and evaluates further code at run time, with `fetch` and
             `eval` or a `Function` constructor, is outside what the loader
             can prevent.
```

A host that runs for months will accumulate modules from every version it
replaced. That is a memory cost and, for a revoked digest, a residual risk; a
scheduled restart is the remedy, and the loader's job is to say when one is
due.

## BEH-LD-043: The loader is a plugin, and the host is unchanged

> **See:** [ADR-LD-001](../decisions/001-verify-before-evaluate.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)

```ts
// illustrative — not type-checked
declare const LoaderPlugin: (options: LoaderOptions & {
  readonly fetchers: readonly FetcherShape[]
  readonly verifiers: readonly SignatureVerifierShape[]
  readonly acceptance: AcceptanceRule
  readonly externals: ExternalModules
  readonly buildTimeout: Duration.Input        // the host's buildTimeout, stated by the application (BEH-LD-046)
}) => PluginDefinition</* requires */ [typeof RevocationSource, typeof AcceptedDigests],   // base services (02, BEH-LD-015)
                       /* provides */ [typeof Loader], never, never>
```

```
REQUIREMENT: The loader MUST be usable both as a plugin that provides
             `Loader` and as a plain `Layer` for applications that load
             before a host exists. It MUST NOT require any change to
             `@bridger/core`'s `Host` interface.
```

```
REQUIREMENT: Every time the loader records or compares MUST be read from
             `Clock`, and every identifier it creates from core's
             `IdGenerator` when one is in context, so that the loader is
             deterministic under core's `TestHost` (core 21 — Testing host).
```

Running the loader as a plugin puts its own configuration — policy, trust
roots, fetchers — under the host's change control: replacing the loader is an
operator call, gated and audited like any other.

## BEH-LD-044: What core records, and how the two records join

> **See:** [ADR-BR-030](../../core/decisions/030-audit-sink-port.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time), [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)

```
REQUIREMENT: The loader's documentation MUST describe the join: core's
             `requested` and `rejected` records carry `definition.digest`,
             its `before` and `after` states carry `digest`, and its gate
             request carries `definition.digest` (core 23, 25); the
             loader's `VerificationRecord` carries the same `digest` with the
             policy, signers and revocation revision. Neither record MUST be
             described as sufficient alone.
```

```
REQUIREMENT: The loader MUST NOT write to core's `AuditSink`, and MUST NOT
             add fields to core's `AuditRecord` or `OperationRequest`.
```

Core answers "which digest was active, who installed it, who approved it";
the loader answers "why that digest was acceptable". A regulated user's
procedure decides how long each is kept and how they are reviewed together.

## BEH-LD-045: Test fixtures make every refusal reachable

> **See:** [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```ts
// illustrative — not type-checked
// @bridger/loader/testing
declare const memoryFetcher: (packages: ReadonlyMap<string, Package>) => FetcherShape
declare const scriptedVerifier: (scheme: string, answers: ReadonlyMap<string, VerifiedSigner | "invalid" | "hang" | "die">) => SignatureVerifierShape
declare const fixedRevocations: (sets: readonly RevocationSet[]) => Layer.Layer<RevocationSource>  // advanced by the test
declare const recordingEvaluator: () => EvaluatorShape & { readonly calls: Effect.Effect<readonly string[]> }
declare const packageBuilder: (spec: { manifest: unknown; sbom?: Uint8Array; files: Record<string, string> }) => Package
```

```
REQUIREMENT: `@bridger/loader/testing` MUST provide the fixtures above. The
             recording evaluator MUST record every digest it was asked to
             evaluate, so that a test can assert that a refused load
             evaluated nothing.
```

```
REQUIREMENT: The testing entry point MUST NOT export a fixture usable as a
             production acceptance rule that accepts everything.
```

The property that matters most — nothing evaluated before acceptance — is a
negative one, and can only be tested if the evaluator can be asked what it was
given.

## BEH-LD-046: Interaction with core's lifecycle rules

> **See:** [ADR-LD-004](../decisions/004-revocation-acts-through-desired-state.md), [ADR-BR-015](../../core/decisions/015-leases-one-primitive.md)
> **Risk:** [RSK-BR-015](../../core/gxp/03-risk-assessment.md#rsk-br-015)

```
REQUIREMENT: The loader and kill switch MUST rely on core for the removal
             of a plugin: dependents stop first, leases drain within the
             configured limit, a drain that times out parks the stop, and
             the audit latch refuses operator changes (core 06, 09, 23). The
             loader MUST NOT shorten a drain or force a revocation unless the
             kill switch was configured with drain options that say so.
```

```
REQUIREMENT: A direct `Loader.load` call MUST NOT hold a host lease or a
             transition: it happens before the operator call that installs
             its result, so a slow fetch in it never delays another plugin's
             transition.
```

```
REQUIREMENT: The `load` of a `Loader.lazy` definition runs inside the
             plugin's build step, in its build slot and under core's
             `buildTimeout` (core BEH-BR-246). Documentation MUST state
             this. The loader MUST refuse construction when the sum of its
             `fetch`, `verify` and `evaluate` timeouts (02, BEH-LD-013) is
             not shorter than the stated `buildTimeout`, so that a loader
             step error, not core's build timeout, reports a slow step.
             Documentation MUST state that the build itself, which runs
             after the load in the same slot, shares the remainder.
```

```
REQUIREMENT: When the load of a lazy definition fails, the plugin becomes
             `failed` with phase "load" and a core `LoadFailed` cause whose
             message core writes from the cause's kind (core BEH-BR-246);
             the loader's step error (its tag and step) MUST be found in the
             loader's own record (02, BEH-LD-016) and logs, joined by digest
             and time. When core's `buildTimeout` interrupts the load first,
             the loader MUST stop at the current step as for any interrupted
             caller (02, BEH-LD-013).
```

Keeping direct loads outside the host's transitions is what keeps a stalled
download from becoming a stalled host; a lazy load cannot be kept outside,
because loading on demand is a step of the activation it serves, so the
loader's bounds are required to fit inside the one core gives that
activation. Keeping removal inside the host's transitions is what keeps a
revocation from cutting a write in half.

## BEH-LD-047: Claims the loader does not make

> **See:** [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-036](../../core/decisions/036-prospective-specification.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: No loader document, type documentation or release note MAY
             state that the loader makes plugins safe, isolates them,
             reclaims them or prevents tampering, and none MAY claim that
             it makes a deployment compliant with any regulation. It MAY
             state, once tested, that
             it refuses to evaluate packages whose digest, signatures or
             revocation status do not satisfy the application's rules.
```

Core's claim 8 ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md))
says Bridger does not verify, sign or sandbox plugin code. With the loader
adopted, the first part becomes "the loader verifies digests and signatures
before evaluation, within the limits of this file"; the rest stays true.

## BEH-LD-048: Required acceptance checks

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The loader test suite MUST contain at least one test for each
             of the following:
             1. Package digest: the construction of BEH-LD-002 reproduces
                fixed test vectors; changing any byte of the manifest, the
                SBOM, its format label or any file, or renaming a file,
                changes the digest; malformed paths are refused
                (BEH-LD-001–003, BEH-LD-005).
             2. Order: each of steps 1–6 failing in turn ends the load with
                its error and the recording evaluator records no call
                (BEH-LD-009, BEH-LD-013).
             3. Held bytes: changing the fetcher's backing store after
                verification does not change what is evaluated; a URL or
                unlisted bare import fails with "unresolved-import"
                (BEH-LD-011).
             4. One evaluation per digest; a reload re-runs steps 1–6; a
                new version leaves the old digest in `resident`
                (BEH-LD-012).
             5. Stamping and mismatch: the stamped copy carries the
                manifest version and package digest; a declared digest, a
                different id or different key lists fail with
                `ManifestMismatch`; a manifest carrying `digest` is refused
                (BEH-LD-007, BEH-LD-014).
             6. `LoaderGate`: it is a core `Gate<OperationRequest>` built
                before the host, composed with `Gate.all` and adapted with
                `OperationGate.fromGate`; install and replace with an
                absent, unaccepted or revoked digest are refused; exempt ids
                and digests are allowed; a contributed catalog entry's
                digest is accepted for a lazy install; after the loader is
                replaced, earlier digests are refused for install until
                accepted again; `enable`, `retry`, `restart` and
                `reconfigure` of a revoked installed digest are refused
                "digest-revoked"; remove and disable are never refused, and
                shutdown never reaches the gate (BEH-LD-015).
             7. `LoadLog`: an unwritable `accepted` record prevents
                evaluation; an unwritable refusal record is logged and the
                refusal is unchanged; record fields are present exactly for
                the steps reached (BEH-LD-016).
             8. Policy: N-of-M thresholds, role branches with distinct
                signers, one signer holding two roles not satisfying a
                double-signing policy, duplicate signatures counted once,
                validity windows, signatures over a different id or version
                not counting (BEH-LD-017–021).
             9. No permissive rule: zero thresholds, empty pinned lists and
                duplicate signer keys are refused at construction
                (BEH-LD-019, BEH-LD-022).
             10. Revocation lists: an unsigned or rolled-back list is
                 ignored; an unsaved list is not published; a restart keeps
                 the last saved list (BEH-LD-026).
             11. Stale and unavailable revocation refuse a load; "unbounded"
                 is accepted only when written (BEH-LD-027).
             12. Kill switch: a revoked digest owned by the scope is removed
                 through `reconcile` with `revocationActor` and a reason
                 naming the revision, and that reconcile issues no other
                 action; a desired-list change is reconciled under the
                 application's actor and names no revocation; a gate
                 refusal, a drain timeout and the audit latch leave it in
                 `pending` and it is retried; plugins outside the scope are
                 reported, or removed with "remove"; a revision above
                 `maxDroppedPerRevision` is held until released; an
                 un-revoked entry is reported and reinstalls nothing; an
                 entry with no verification record is dropped
                 "verification-unknown" when a signer is revoked, unless
                 pinned (BEH-LD-026, BEH-LD-028, BEH-LD-029, BEH-LD-031,
                 BEH-LD-032).
             13. Signer revocation, by identity, withdraws exactly the
                 digests whose policy becomes unsatisfied at the time of
                 their acceptance; a signer's later `validUntil` withdraws
                 nothing (BEH-LD-030).
             14. Catalog: an entry with a wrong claimed digest, missing
                 signatures or a revoked digest is not contributed; an
                 ambiguous id and version is withdrawn; `resolve` picks the
                 highest acceptable version (BEH-LD-033–036).
             15. Lazy: `Loader.lazy` builds the definition with
                 `Plugin.lazy({ manifest, load, digest })`; its `meta.digest`
                 is the package digest before load; a trigger loads it and
                 core's digest comparison succeeds (the plugin becomes
                 `active`, not `failed` with `ManifestMismatch`); reconciling
                 an unchanged catalog list evaluates nothing; two package
                 digests at one version are different definitions and the
                 changed one is replaced; a load failure evaluates nothing;
                 the loader refuses construction when its timeouts do not
                 fit inside `buildTimeout` (BEH-LD-037, BEH-LD-038,
                 BEH-LD-046).
             16. `fetchVerified` evaluates nothing and does not mark the
                 digest resident; `stampRemote` stamps a proxy definition
                 with the guest's version and digest and refuses a
                 mismatched id (BEH-LD-039).
```

Each check corresponds to one acceptance scenario, REQ-LD-001 to REQ-LD-016,
in [traceability](../traceability.md) §2. None has been written or executed;
none is evidence ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).

**Settled here.** (1) The limits — not a sandbox, no reclamation, no control
of run-time fetching — are documentation requirements, not footnotes. (2) The
loader is a plugin and leaves the `Host` interface unchanged. (3) Direct loads
sit outside host transitions; a lazy load runs in its plugin's build slot,
with the loader's bounds inside core's `buildTimeout`; removal stays inside
host transitions.

**Open.** (1) Whether the acceptance checks should also run through
`@bridger/kit`'s conformance harness once that is specified (references/kit/).
(2) Core's `Host.controls` reports `gateTimeout` but not `buildTimeout`, so
the loader cannot read the bound it must fit inside and relies on the value
the application states; recorded as an open question for core in the
[README](../README.md#open-questions).

---

_Previous: [05 — Catalog and Lazy Loading](./05-catalog-and-lazy-loading.md)_ · _Next: [Invariants](../invariants.md)_
