# 08 — Required Acceptance Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-08                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): BEH-KT-057: check 1 (REQ-KT-001) covers `manifest` and `handoff` passed through (L3); check 26 covers `--keyed`, `--expect-keyed` and exit 4 for "key-unavailable" (A1) (SPEC-AUDIT-04) (CCR-KT-007)<br>0.3 (2026-11-09): Check 28 and REQ-KT-028: disclosed claims, callback clients from `requested.capabilities`, the loader entry key, guest-shaped partner manifests, first-party countersigning (F-06, F-07, C-19, M-03); check 29 and REQ-KT-029: local contracts (core CCR-BR-033) (CCR-KT-004)<br>0.2 (2026-11-08): Checks 25–27 and REQ-KT-025–027 (round 2: recheck items 11, 14, 17; core alignment) (CCR-KT-003)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

The checks below are what the kit's test suite is required to contain, in the
style of core's [BEH-BR-183](../../core/behaviors/21-testing-host.md). A check
listed here with no executed test is a gap in the evidence and must be reported
as such ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).
This file owns BEH-KT-057–064 and uses BEH-KT-057; 058–064 are reserved. Checks 25–27 were added by CCR-KT-003.

Planned tests: `packages/kit/test/` *(Planned)*. Type-level checks (1–6, 11,
16, 20) are compile tests: a file that must compile and a file whose expected
errors are asserted by message.

## BEH-KT-057: Required acceptance checks

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md), [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)

```
REQUIREMENT: The kit test suite MUST contain at least one test for each of
             the following:
             1. definePlugin returns a core definition equal to its
                Plugin.define equivalent for all four forms, `manifest` and
                `handoff` included and passed through unchanged; nothing
                runs at definition.
             2. requires/provides inferred as tuples without as const;
                omitted requires is [].
             3. Undeclared requirement, unreturned provide, key both
                required and provided, bad volatile, non-literal id each
                give the specified KitTypeError message.
             4. Every definePlugin value, including provides-nothing, is
                assignable to Plugin.Any; an unbranded literal is not; no
                run-time brand.
             5. A union of tuples is rejected with the specified message.
             6. Contracts pass through unchanged; a missing contract
                method is a compile error at make.
             7. mount installs provisions then subject, attributed, on a
                TestHost with memory sink; MissingProvision and
                allowWaiting.
             8. Stubs are plugins test-stub/<serviceId>; a partial's
                missing member dies with StubNotImplemented.
             9. it.plugin fails on a held lease, an unexpected failed
                plugin, or a CloseReport with failures; prints inspection,
                events and fix.
             10. PluginTest.record decodes with the AuditRecord schema;
                actor helper keeps the literal kind.
             11. holdLease accepts a union key; expectFailure accepts
                effects of different types without cast.
             12. verify selects exactly the suites of the provided major
                up to its version; SuiteVersionMismatch otherwise.
             13. Every case executed and reported passed or failed;
                ConformanceFailed carries the report; report has seed, kit
                and suite versions and no conformance wording.
             14. A plugin subject is reached through leased calls; an
                HTTP subject uses the remote binding and the timeout.
             15. Earlier frozen suites are byte-identical after
                generation; a change fails check.
             16. create templates pass check and test unedited and
                contain no as, as const on keys, or any.
             17. dev refuses a wired sink, gate or fingerprinter; reloads
                via reconcile under scope bridger:dev with replace for
                changed digests; ReplaceError leaves the old plugin running.
             18. check finds a second copy of effect or @bridger/core;
                classifies contract changes by BEH-BR-230; manifest and
                definition agree.
             19. pack is reproducible and uses the loader's digest;
                publish holds no key material and stops after its own
                signature under N-of-M.
             20. Generated SDK exports only encoded JSON types and no
                effect type; generation is deterministic.
             21. SDK refuses bad input before the handler, reports bad
                output, maps undeclared throws to the fixed message, aborts
                on host interruption, and exposes no host object.
             22. Every tag of ADR-BR-008, of files 26–34 and of the
                companions has exactly one catalog entry, and none is stale.
             23. Inspector calls no mutating operation; report retries to
                a consistent revision; edges include missing.
             24. why follows waiting providers depth first once each;
                leases are counts; timeline shows gaps and its label; JSON
                report is schema-versioned and sorted.
             25. publish and countersign: both sign
                `Statement.signingInput` through a scripted
                `StatementSigner` and never see key material; publish stops
                and prints the unmet branch under N-of-M; countersign
                refuses a package whose digest does not recompute, adds a
                signature without changing any digest, adds nothing for a
                signer entry that already signed, and reports
                `PublisherMismatch` and `SigningFailed` with their catalog
                entries; emitted manifests carry `role`, `target` and
                `listens`.
             26. verify-chain calls `verifyBundle` with the pinned roots,
                makes no network or clock access, prints no record content
                and no overall verdict, maps reports to exit codes 0, 1,
                3 and 4 ("key-unavailable" links give 4), passes `--keyed`
                as `keyed` and `--expect-keyed` as `expectKeyed` (true, or
                the set of series given), and prints `--json` as the
                report's encoding.
             27. The inspector shows "refused-digest", `plugin-idled`,
                `held-event-dropped`, `reconcile-partial` and breaker scope
                by name and unknown tags raw; `PluginTest` re-exports core's
                `scriptedRefusalList` and `memoryCallLog`; `dev --cold`
                skips a declared handoff.
             28. Guest packages and identity: a handler's
                `CallContext.claims` is empty when the link discloses
                nothing and holds exactly the disclosed claims otherwise;
                callback clients exist only for `requested.capabilities`
                (with the listed methods) and none for `requires`; an
                ungranted requested capability is refused "not-granted";
                every emitted manifest names its entry in
                `extensions["@bridger/loader"].entry`; `pack` refuses a
                partner manifest without the guest shape, naming the field;
                `countersign --statement first-party` appends a first-party
                signature and never a package signature, and the default
                adds no first-party signature.
             29. Local contracts: `bridger sdk generate` of a local contract
                fails with `LocalContractRefused` (site "sdk-generate") and
                writes nothing; `Conformance.verify` of a local contract's
                suite against an HTTP subject, or with generated cases built
                untyped, fails with it before running a case or sending
                anything; the same suite's author cases run against a
                plugin subject; `Conformance.suite` and `Conformance.http`
                reject a local contract's generated cases and the contract
                at compile time (BEH-KT-017, BEH-KT-020, BEH-KT-033).
```

## Acceptance scenario traceability

| REQ | Check | Behaviours | Status |
| --- | --- | --- | --- |
| REQ-KT-001 | 1. definePlugin returns a core definition equal to its Plugin.define equivalent for all four forms (`manifest` and `handoff` passed through); nothing runs at definition | [BEH-KT-001](./01-plugin-facade.md#beh-kt-001-defineplugin-returns-a-core-definition-and-nothing-more) | Not run |
| REQ-KT-002 | 2. requires/provides inferred as tuples without as const; omitted requires is [] | [BEH-KT-002](./01-plugin-facade.md#beh-kt-002-requires-and-provides-are-inferred-as-tuples-without-as-const) | Not run |
| REQ-KT-003 | 3. Undeclared requirement, unreturned provide, key both required and provided, bad volatile, non-literal id each give the specified KitTypeError message | [BEH-KT-003](./01-plugin-facade.md#beh-kt-003-the-keys-a-build-uses-are-checked-against-requires-with-a-readable-error) | Not run |
| REQ-KT-004 | 4. Every definePlugin value, including provides-nothing, is assignable to Plugin.Any; an unbranded literal is not; no run-time brand | [BEH-KT-004](./01-plugin-facade.md#beh-kt-004-pluginany-accepts-every-definition-and-only-definitions) | Not run |
| REQ-KT-005 | 5. A union of tuples is rejected with the specified message | [BEH-KT-005](./01-plugin-facade.md#beh-kt-005-a-data-dependent-key-list-is-two-definitions) | Not run |
| REQ-KT-006 | 6. Contracts pass through unchanged; a missing contract method is a compile error at make | [BEH-KT-006](./01-plugin-facade.md#beh-kt-006-the-facade-accepts-contracts-wherever-core-does) | Not run |
| REQ-KT-007 | 7. mount installs provisions then subject, attributed, on a TestHost with memory sink; MissingProvision and allowWaiting | [BEH-KT-009](./02-plugin-test.md#beh-kt-009-mount-installs-one-plugin-with-its-provisions-and-waits-for-it) | Not run |
| REQ-KT-008 | 8. Stubs are plugins test-stub/<serviceId>; a partial's missing member dies with StubNotImplemented | [BEH-KT-010](./02-plugin-test.md#beh-kt-010-stubs-are-typed-doubles-installed-as-plugins) | Not run |
| REQ-KT-009 | 9. it.plugin fails on a held lease, an unexpected failed plugin, or a CloseReport with failures; prints inspection, events and fix | [BEH-KT-011](./02-plugin-test.md#beh-kt-011-itplugin-is-a-scoped-test-case-with-leak-and-failure-checks), [BEH-KT-050](./07-error-catalog.md#beh-kt-050-tooling-prints-the-fix-next-to-the-tag) | Not run |
| REQ-KT-010 | 10. PluginTest.record decodes with the AuditRecord schema; actor helper keeps the literal kind | [BEH-KT-012](./02-plugin-test.md#beh-kt-012-typed-fixtures-for-actors-and-audit-records) | Not run |
| REQ-KT-011 | 11. holdLease accepts a union key; expectFailure accepts effects of different types without cast | [BEH-KT-013](./02-plugin-test.md#beh-kt-013-faults-and-stepping-stay-cores), [BEH-KT-014](./02-plugin-test.md#beh-kt-014-expecting-failures-from-several-operations) | Not run |
| REQ-KT-012 | 12. verify selects exactly the suites of the provided major up to its version; SuiteVersionMismatch otherwise | [BEH-KT-017](./03-conformance-kits.md#beh-kt-017-a-suite-belongs-to-one-contract-version), [BEH-KT-018](./03-conformance-kits.md#beh-kt-018-verify-runs-every-suite-of-the-subjects-major-up-to-its-version) | Not run |
| REQ-KT-013 | 13. Every case executed and reported passed or failed; ConformanceFailed carries the report; report has seed, kit and suite versions and no conformance wording | [BEH-KT-018](./03-conformance-kits.md#beh-kt-018-verify-runs-every-suite-of-the-subjects-major-up-to-its-version), [BEH-KT-022](./03-conformance-kits.md#beh-kt-022-a-conformance-report-is-never-presented-as-more-than-it-is) | Not run |
| REQ-KT-014 | 14. A plugin subject is reached through leased calls; an HTTP subject uses the remote binding and the timeout | [BEH-KT-019](./03-conformance-kits.md#beh-kt-019-a-plugin-subject-is-mounted-with-plugintest), [BEH-KT-020](./03-conformance-kits.md#beh-kt-020-an-http-subject-is-reached-through-the-remote-companions-binding) | Not run |
| REQ-KT-015 | 15. Earlier frozen suites are byte-identical after generation; a change fails check | [BEH-KT-021](./03-conformance-kits.md#beh-kt-021-suites-are-generated-never-hand-copied-from-the-contract) | Not run |
| REQ-KT-016 | 16. create templates pass check and test unedited and contain no as, as const on keys, or any | [BEH-KT-025](./04-cli.md#beh-kt-025-create-scaffolds-a-package-that-passes-its-own-checks) | Not run |
| REQ-KT-017 | 17. dev refuses a wired sink, gate or fingerprinter; reloads via reconcile under scope bridger:dev with replace for changed digests; ReplaceError leaves the old plugin running | [BEH-KT-026](./04-cli.md#beh-kt-026-dev-reloads-changed-plugins-with-replace-on-a-host-it-owns) | Not run |
| REQ-KT-018 | 18. check finds a second copy of effect or @bridger/core; classifies contract changes by BEH-BR-230; manifest and definition agree | [BEH-KT-028](./04-cli.md#beh-kt-028-check-finds-a-second-copy-of-effect-and-breaking-contract-changes) | Not run |
| REQ-KT-019 | 19. pack is reproducible and uses the loader's digest; publish holds no key material and stops after its own signature under N-of-M | [BEH-KT-029](./04-cli.md#beh-kt-029-pack-builds-a-loader-package-and-nothing-else), [BEH-KT-030](./04-cli.md#beh-kt-030-publish-delegates-signing-to-the-loader-and-holds-no-key) | Not run |
| REQ-KT-020 | 20. Generated SDK exports only encoded JSON types and no effect type; generation is deterministic | [BEH-KT-033](./05-promise-sdk.md#beh-kt-033-the-sdk-is-generated-from-one-contract-version) | Not run |
| REQ-KT-021 | 21. SDK refuses bad input before the handler, reports bad output, maps undeclared throws to the fixed message, aborts on host interruption, and exposes no host object | [BEH-KT-034](./05-promise-sdk.md#beh-kt-034-serve-wraps-handlers-for-the-remote-companions-guest-runtime), [BEH-KT-035](./05-promise-sdk.md#beh-kt-035-calls-back-to-the-host-use-granted-contracts-only) | Not run |
| REQ-KT-022 | 22. Every tag of ADR-BR-008, of files 26–34 and of the companions has exactly one catalog entry, and none is stale | [BEH-KT-049](./07-error-catalog.md#beh-kt-049-one-entry-per-tag-as-data), [BEH-KT-051](./07-error-catalog.md#beh-kt-051-the-catalog-is-checked-against-the-specifications), [BEH-KT-052](./07-error-catalog.md#beh-kt-052-the-catalog-v01) | Not run |
| REQ-KT-023 | 23. Inspector calls no mutating operation; report retries to a consistent revision; edges include missing | [BEH-KT-041](./06-devtools-inspector.md#beh-kt-041-the-inspector-is-a-plugin-over-core-observation-only), [BEH-KT-042](./06-devtools-inspector.md#beh-kt-042-the-dependency-graph-is-consistent-with-one-snapshot-revision) | Not run |
| REQ-KT-024 | 24. why follows waiting providers depth first once each; leases are counts; timeline shows gaps and its label; JSON report is schema-versioned and sorted | [BEH-KT-043](./06-devtools-inspector.md#beh-kt-043-why-explains-a-waiting-plugin-as-a-chain), [BEH-KT-044](./06-devtools-inspector.md#beh-kt-044-leases-are-counts-per-plugin-never-holders), [BEH-KT-045](./06-devtools-inspector.md#beh-kt-045-the-timeline-is-the-event-feed-with-gaps-shown), [BEH-KT-046](./06-devtools-inspector.md#beh-kt-046-the-json-report-is-versioned-and-stable), [BEH-KT-031](./04-cli.md#beh-kt-031-inspect-prints-the-inspector-report) | Not run |
| REQ-KT-025 | 25. publish and countersign sign the loader's signing input through a signer adapter, never see keys, change no digest, report what remains; manifests carry roles, targets and listens | [BEH-KT-029](./04-cli.md#beh-kt-029-pack-builds-a-loader-package-and-nothing-else), [BEH-KT-030](./04-cli.md#beh-kt-030-publish-delegates-signing-to-the-loader-and-holds-no-key), [BEH-KT-032](./04-cli.md#beh-kt-032-countersign-adds-a-second-signer-entry-without-changing-the-package) | Not run |
| REQ-KT-026 | 26. verify-chain runs `verifyBundle` offline with pinned roots and prints what was checked, with no overall verdict | [BEH-KT-047](./06-devtools-inspector.md#beh-kt-047-verify-chain-checks-a-verification-bundle-offline-and-prints-what-was-checked) | Not run |
| REQ-KT-027 | 27. Inspector renders the core states and events of CCR-BR-024–026; core fixtures re-exported; dev --cold | [BEH-KT-045](./06-devtools-inspector.md#beh-kt-045-the-timeline-is-the-event-feed-with-gaps-shown), [BEH-KT-013](./02-plugin-test.md#beh-kt-013-faults-and-stepping-stay-cores), [BEH-KT-026](./04-cli.md#beh-kt-026-dev-reloads-changed-plugins-with-replace-on-a-host-it-owns) | Not run |
| REQ-KT-028 | 28. Disclosed claims only; callback clients from `requested.capabilities`; entry key; guest-shaped partner manifests; first-party countersigning | [BEH-KT-034](./05-promise-sdk.md#beh-kt-034-serve-wraps-handlers-for-the-remote-companions-guest-runtime), [BEH-KT-035](./05-promise-sdk.md#beh-kt-035-calls-back-to-the-host-use-granted-contracts-only), [BEH-KT-036](./05-promise-sdk.md#beh-kt-036-a-partner-package-carries-its-manifest-and-conformance-run), [BEH-KT-029](./04-cli.md#beh-kt-029-pack-builds-a-loader-package-and-nothing-else), [BEH-KT-032](./04-cli.md#beh-kt-032-countersign-adds-a-second-signer-entry-without-changing-the-package) | Not run |
| REQ-KT-029 | 29. A local contract gets no SDK, no generated cases and no wire subject; author cases run in-process | [BEH-KT-017](./03-conformance-kits.md#beh-kt-017-a-suite-belongs-to-one-contract-version), [BEH-KT-020](./03-conformance-kits.md#beh-kt-020-an-http-subject-is-reached-through-the-remote-companions-binding), [BEH-KT-033](./05-promise-sdk.md#beh-kt-033-the-sdk-is-generated-from-one-contract-version) | Not run |

---

_Previous: [07 — Error catalog](./07-error-catalog.md)_ · _Next: [Invariants](../invariants.md)_
