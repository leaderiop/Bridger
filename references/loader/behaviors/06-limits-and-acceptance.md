# 06 — Limits and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-BEH-06                                            |
> | Revision       | 0.12                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.12 (2026-11-11): Check 12: a loader's replacement with an unchanged rule starts a run that removes nothing (L3), run ids "<startId>-<n>" from `IdGenerator.next` (L2); check 14: the end of the catalog activation withdraws its acceptances (L1) (SPEC-AUDIT-09) (CCR-LD-012)<br>0.11 (2026-11-11): Check 6: a loader replacement leaves contributed catalog entries admitted, a withdrawn catalog acceptance admits nothing (L2, L3), a stopped loader's pins stay until a successor (L1), child and `Loader.layer` sources (PL13); check 9: the `anyOf` repeated-id refusal in statement rules and at `StatementVerifier.layer` (PL16); check 12: catalog withdrawal removes nothing under `revocationActor` in any run (L2), a loader's stop starts no run and `HostClosed` stops a run (L1), `release` of a pre-restart run id fails (L4) (SPEC-AUDIT-08) (CCR-LD-011)<br>0.10 (2026-11-11): Check 6: install and replace of a digest published under a "@bridger/federation:<id>" source admitted, refused once revoked by digest (H2, PL7); check 9: an `anyOf` repeating an `id` refused (PL14); check 12: a catalog withdrawal removes nothing under `revocationActor` and a catalog update is one `replace` (L1), a plugin reinstalled by hand is outside the scope (L4), a start run, `drain` and `force` (PL15), the cap and `release` per run (L2), the kill switch's `pinned` option (PL13) (SPEC-AUDIT-07); follow-up: check 6: two loaders keep their own "@bridger/loader:<id>" lists and a stopped one clears its own (C1); second follow-up: check 6: sources keyed by `JSON.stringify([realm, id])`, two plugins with one id in different realms keeping distinct lists, and a loader's construction leaving another loader's acceptances current; check 12: plugins outside the scope reported in `status.outsideScope`, never removed or counted (C4) (SPEC-AUDIT-07 residual) (CCR-LD-010)<br>0.9 (2026-11-11): Check 6: a `reconfigure` is not refused "verification-unknown", and a set older than the piece's `maxAge` refuses install "revocation-stale" (PL17, L4); check 10: a saved list whose signer window closed after acceptance is still restored (PL20); check 12: a revocation removes the dropped installed plugins with `Host.remove`, reconciles nothing, leaves an operator's direct changes in place, and runs on `AcceptedDigests` and pinned changes (H6, L3); check 13: re-evaluation counts the accepting branch's signers and re-checks the publisher binding (L1, H5) (SPEC-AUDIT-06) (CCR-LD-009)<br>0.8 (2026-11-11): Check 6: `enable`/`restart` of an installed digest with no record refused "verification-unknown" after a signer revocation unless pinned or exempt (L3), and a current catalog acceptance admits an install after a loader replacement (L1); check 12: a pending entry still installed survives a revocation reconcile (H8); check 13: re-evaluation from the record alone, after the accepting loader was replaced (H7) (SPEC-AUDIT-05) (CCR-LD-008)<br>0.7 (2026-11-10): Checks 6 and 12 (BEH-LD-048): exempt digests after a signer revocation, per-origin acceptances, and the revocation reconcile with pending or hand-removed entries (L1, L2, PL12) (SPEC-AUDIT-04) (CCR-LD-007)<br>0.6 (2026-11-10): Check 6 adds the cross-companion scenario: subagent and model-family installs under `LoaderGate` (P23) (CCR-LD-005)<br>0.5 (2026-11-09): Checks 5, 15 and 16 follow `PackageManifestMismatch`, the stamped manifest, the entry key, `Loader.lazy`'s refusal of guest entries and the link manifest; checks 25–30 are in file 09; `statementRules` carries the "first-party" rule (specification audit F-06, M-02, M-03, C-16); check 16: `stampRemote` refuses a non-guest manifest with `GuestEntryInvalid` (independent review) (CCR-LD-004)<br>0.4 (2026-11-08): Check 10 covers first boot, the separate revocation trust root, self-revocation and envelope mismatch (round-2 agent review R3-02) (CCR-LD-003)<br>0.3 (2026-11-08): The loader plugin reads `buildTimeout` from `Host.controls` (G61 closed) and provides `StatementVerifier`; open question 2 answered (core alignment) (CCR-LD-003)<br>0.2 (2026-11-08): BEH-LD-046 limited to direct loads; a lazy load runs in the build slot with the loader's timeouts inside `buildTimeout`; `LoaderPlugin` requires `AcceptedDigests`; acceptance checks 5, 6, 7, 12, 13, 15 and 16 extended (CCR-LD-002)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |

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
  readonly statementRules?: StatementRules     // rules for statement types other than "package" (07, BEH-LD-051),
                                               // "first-party" among them: without it nothing is loaded in-process (09, BEH-LD-065)
}) => PluginDefinition</* requires */ [typeof RevocationSource, typeof AcceptedDigests],   // base services (02, BEH-LD-015)
                       /* provides */ [typeof Loader, typeof StatementVerifier], never, never>
// Loader.layer, used before a host exists, takes `buildTimeout` explicitly (BEH-LD-046).
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
             this. Running as a plugin, the loader MUST read `buildTimeout`
             from `Host.controls` (core BEH-BR-212) when it builds; used as
             `Loader.layer` without a host, it takes the value the
             application states. The loader MUST refuse construction when the sum of its
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
                manifest version, the package digest and the signed
                manifest, which replaces a manifest the code declared; a
                declared digest, a different id, or `requires`, `provides`
                or `optional` that core's agreement check would refuse fail
                with `PackageManifestMismatch`, never with core's
                `ManifestMismatch` tag; a manifest carrying `digest` is
                refused; a manifest without a decodable
                `extensions["@bridger/loader"].entry`, or naming a file the
                package lacks, is refused with `PackageMalformed` ("entry");
                the definition is read from the export named there
                (BEH-LD-001, BEH-LD-007, BEH-LD-014).
             6. `LoaderGate`: it is a core `Gate<OperationRequest>` built
                before the host, composed with `Gate.all` and adapted with
                `OperationGate.fromGate`; install and replace with an
                absent, unaccepted or revoked digest are refused; exempt ids
                and digests are allowed; a contributed catalog entry's
                digest is accepted for a lazy install; after the loader is
                replaced, digests accepted only by its loads are refused
                for install until accepted again, a contributed catalog
                entry's digest stays admitted (its acceptance is never made
                `current: false` by a loader's construction), and a digest
                whose load acceptance is no longer current is admitted by a
                current catalog acceptance; a withdrawn catalog acceptance
                admits nothing;
                `enable`, `retry`, `restart` and `reconfigure` of a revoked
                installed digest are refused "digest-revoked", and
                `enable`, `retry` and `restart` of an installed digest with
                no record, after a signer revocation, "verification-unknown"
                unless it is pinned or exempt by digest, while a
                volatile-only `reconfigure` of it is allowed; a set older
                than the piece's `maxAge` refuses install
                "revocation-stale"; an install and a replace of a digest
                with no record published under a "@bridger/federation:" +
                `JSON.stringify([realm, id])` source (`setPinned`) are admitted, also after a signer
                revocation, and refused "digest-revoked" once it is revoked
                by digest, while a digest published only under another
                source is not admitted by that rule; `pinnedFrom` returns
                one prefix's sources only; two loaders with distinct ids,
                and two with one id in different realms (likewise two
                federation plugins), publish under "@bridger/loader:" +
                `JSON.stringify([realm, id])` each, neither replaces
                the other's list, and a stopped loader's pinned digests stay
                pinned until a loader of the same source is constructed; a
                `LoaderPlugin` mounted as a child publishes under its
                principal's id ("parent/child") and a `Loader.layer` under
                `JSON.stringify(["layer", LoaderOptions.id])`, so neither
                shares a source with a `LoaderPlugin` of the default id; the
                construction of one loader marks `current: false` only the
                acceptances carrying its own source, so a digest the other
                loader accepted is still admitted; remove and disable are never refused, and
                shutdown never reaches the gate; with the agent companion,
                a subagent spawn (`Realm.ephemeral`) whose plugins carry no
                accepted digest fails with the refusal and leaves no realm,
                and a model family member (`Realm.family`) in that case
                fails with `FamilyMemberUnavailable` ("rejected") and the
                step with `ModelError` "unavailable"; both succeed when
                their plugins come from a loader load or are exempt by
                digest, and a realm is never exempt; those exempt by digest
                still succeed after a signer revocation (never refused
                "verification-unknown"); withdrawing a catalog entry leaves
                a load's acceptance of the same digest in place (BEH-LD-015,
                BEH-LD-035; agent BEH-AG-007, BEH-AG-025).
             7. `LoadLog`: an unwritable `accepted` record prevents
                evaluation; an unwritable refusal record is logged and the
                refusal is unchanged; record fields are present exactly for
                the steps reached (BEH-LD-016).
             8. Policy: N-of-M thresholds, role branches with distinct
                signers, one signer holding two roles not satisfying a
                double-signing policy, duplicate signatures counted once,
                validity windows, signatures over a different id or version
                not counting (BEH-LD-017–021).
             9. No permissive rule: zero thresholds, empty pinned lists,
                duplicate signer keys and an `anyOf` whose rules repeat an
                `id` are refused at construction, in a package rule and in
                a statement rule alike, by the loader and by
                `StatementVerifier.layer` (BEH-LD-019, BEH-LD-022,
                BEH-LD-051).
             10. Revocation lists: an unsigned or rolled-back list is
                 ignored; an unsaved list is not published; a restart keeps
                 the last saved list; at first boot, with no set held, a
                 list signed under the revocation trust root is accepted
                 through `offer`; a list whose digest a held set lists is
                 still accepted (no revocation step); a list that revokes
                 one of its own signers is accepted and that signer counts
                 for no later list; a saved list whose signer's window
                 closed after its `acceptedAt` is still restored at
                 construction; a decoded issuer or revision that
                 differs from the envelope is refused; the source builds
                 with no `StatementVerifier` in context (BEH-LD-025,
                 BEH-LD-026).
             11. Stale and unavailable revocation refuse a load; "unbounded"
                 is accepted only when written (BEH-LD-027).
             12. Kill switch: a revoked digest owned by the scope is removed
                 with `Host.remove` under `revocationActor` and a reason
                 naming the revision, no `reconcile` is called for it, and
                 nothing else changes, even when an entry of the last
                 applied list is still pending or was removed by hand (it
                 is skipped); a plugin an operator replaced, reconfigured,
                 enabled or disabled directly since the last reconcile is
                 left as the operator left it; a pending entry still
                 installed (a refused replace, a parked stop) whose digest
                 is not dropped stays installed as before; an
                 `AcceptedDigests` change of a load record or of the pinned
                 digests (a loader replacement changing them) that makes
                 `filterDesired` drop an installed plugin removes it under
                 `revocationActor`, while a catalog withdrawal (`remove(digest,
                 "catalog-entry")`) after a signer revocation removes nothing
                 under `revocationActor` — at that change, at the next
                 revocation-set run and at a restarted kill switch's start
                 run alike — and a v1→v2 catalog update is one
                 `replace` under `actor`; a loader's stop or removal
                 starts no run, and its replacement with an unchanged rule
                 starts a run (the successor's `markNotCurrent`) that
                 removes nothing, also during shutdown; a run whose
                 `Host.remove` fails `HostClosed` stops and removes nothing
                 more; `release` of a run id issued before a restart fails
                 with `UnknownKillSwitchRun`, run ids being
                 "<startId>-<n>" with `startId` from `IdGenerator.next`
                 per start (under `TestHost.counterIdGenerator`, a restart
                 with the `TestClock` not advanced issues a new id); a plugin of the last applied list
                 that an operator removed and installed again by hand is not
                 of the scope and is reported, not removed; a restarted kill
                 switch judges its scope at start; the removals use the
                 `drain` and `force` given to `run`; a desired-list change is reconciled under the
                 application's actor and names no revocation; a gate
                 refusal, a drain timeout and the audit latch leave it in
                 `pending` and it is retried; an installed plugin outside the
                 scope whose digest the set drops is reported in
                 `status.outsideScope` with its `{ id, realm }`, its scope
                 and the dropped digest, is not removed, and is not counted
                 against `maxDroppedPerRun`; a run above
                 `maxDroppedPerRun` — a revocation change or an
                 `AcceptedDigests` change alike — is held until
                 `release(run)`, which removes only that run's held plugins
                 still dropped, and a later run is counted on its own; an
                 un-revoked entry is reported and reinstalls nothing; an
                 entry with no verification record is dropped
                 "verification-unknown" when a signer is revoked, unless
                 pinned or in the kill switch's `pinned` option (BEH-LD-026, BEH-LD-028, BEH-LD-029, BEH-LD-031,
                 BEH-LD-032).
             13. Signer revocation, by identity, withdraws exactly the
                 digests whose policy becomes unsatisfied at the time of
                 their acceptance, judged from the record alone (its
                 recorded identities, roles, `policyId` tags and
                 `require`), also after the loader that accepted them was
                 replaced; under an `anyOf` of two signed policies only the
                 accepting branch's signers count; a package whose only
                 signer with `publisherBound` true is revoked is withdrawn
                 though its requirement still holds; a signer's later
                 `validUntil` withdraws nothing (BEH-LD-018, BEH-LD-020,
                 BEH-LD-030, BEH-LD-053).
             14. Catalog: an entry with a wrong claimed digest, missing
                 signatures or a revoked digest is not contributed; an
                 ambiguous id and version is withdrawn; `resolve` picks the
                 highest acceptable version; the catalog plugin's removal,
                 restart and reconfigure, and a replacement of the loader
                 it requires, leave every acceptance its activation
                 recorded withdrawn (admitting nothing for install or
                 replace, removing nothing), and after a replacement by a
                 loader whose rule refuses an entry, that entry's digest is
                 refused for install (BEH-LD-033–036).
             15. Lazy: for a first-party entry, `Loader.lazy` builds the definition with
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
             16. `fetchVerified` evaluates nothing, does not mark the
                 digest resident and needs no "first-party" statement;
                 `stampRemote` stamps a proxy definition with the guest's
                 version and digest and its link manifest, refuses a
                 manifest that is not a guest's with `GuestEntryInvalid`
                 naming the field, and refuses a mismatched id or version
                 with `PackageManifestMismatch` (BEH-LD-039, BEH-LD-068,
                 BEH-LD-069).
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
(2) Answered (round 2): core's `Host.controls` now reports `buildTimeout`
(core BEH-BR-212, gap G61 closed), and the loader plugin reads it.

---

_Previous: [05 — Catalog and Lazy Loading](./05-catalog-and-lazy-loading.md)_ · _Next: [07 — Signed Statements](./07-signed-statements.md)_
