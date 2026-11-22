# Improvement Report 02: Dependency Model and Seams (spatial composability)

## Executive summary

- Bridger's spatial model is stricter and more explicit than Cordis: cycles are refused at install, provider slots are exclusive per realm, and contract keys carry a version and method list. Interface drift is only partly covered.
- Biggest gap: drift detection is name-only. BEH-BR-228 compares method names and version ranges, never payload/success/error schemas, so a changed signature under an unchanged name binds silently. Plain keys have no check at all (ADR-BR-011).
- Second gap: there is no broker seam. ADR-BR-003 pushes multiplexing into registries, and registries do not give consumers rolling provider swaps with no dependent restart. Replace always restarts dependents (BEH-BR-050 area).
- Third gap: interception reaches only captures, not `Host.use`/`lease` (BEH-BR-151), so the "read-only DB for community plugins" pattern needs the mandatory-policy path.
- The prototype diverges from the spec in realm-family option fingerprinting (`realms.ts`), which can let a changed interceptor set go unnoticed.

## Where Bridger is already ahead of Cordis

1. **Cycles are errors, not silent inactivity.** `install`/`replace`/`enable` fail with `DependencyCycle { path }` listing `{id, realm}` records (BEH-BR-018/020, INV-BR-002). Cordis leaves a cycle as a permanently inactive fiber found only by inspection. Mount edges (child to parent) are in the same graph (BEH-BR-078 text in 08).
2. **Optional keys are out of ordering and cycle detection by rule** (BEH-BR-129), with mutual-optional pairs explicitly legal. An undeclared optional access returns `None` and logs (BEH-BR-130), where Cordis raises UNDECLARED_ACCESS.
3. **Duplicate providers are refused at the caller** (`DuplicateProvider`, ADR-BR-003, INV-BR-001), not resolved by policy; base services are protected.
4. **Key identity is two-stage** (ServiceId then object, `KeyMismatch`, ADR-BR-011, INV-BR-015) and contract keys add semver ranges, `IncompatibleContract`, optional-incompatible-as-absent (BEH-BR-225..229), add-only evolution (BEH-BR-230), registry contracts (BEH-BR-233). Cordis relies on npm peer deps.
5. **Realm resolution is applied to the resolved graph** (BEH-BR-148), so cross-realm ordering and lease admission stay correct. Realms are explicitly "not a security boundary" (BEH-BR-150), more honest than Cordis.
6. **Realm families with lease-drain eviction** (BEH-BR-329..338) have no Cordis equivalent.
7. **Deadlock detection** through carried references (`CurrentTransition`, `HeldPlugins`, BEH-BR-078/088, `WouldDeadlock`) with stated residuals (RSK-BR-011).

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|---|---|---|---|---|
| D-01 | H | BEH-BR-228 clause 3, BEH-BR-229, BEH-BR-231 | Contract compatibility checks method names and version only; `MethodSpec` codecs (payload/success/error) are never compared. A provider can change a method's schema inside a minor and bind. | Add a canonical schema digest per method to `ContractDescriptor`; compare digests for equal-major pairs (see R1). |
| D-02 | H | ADR-BR-011 "Shape changes are a naming convention" | Plain keys: drift undetected by design; the only defence is a convention (`@2` suffix). | Make `Contract` the required form for any key crossing a package boundary; add a `plain-key-cross-package` lint in the kit conformance checks (R2). |
| D-03 | M | ADR-BR-003, `registry.ts:90-110` | No broker/multiplexed-provider seam. A provider swap (replace) restarts all dependents; Cordis brokers absorb it. | Specify an optional "stable facade" service pattern in core with lease-aware rebind (R3). |
| D-04 | M | BEH-BR-151 "Interception MUST NOT apply to Host.use, useAll, lease" | Capture-only interception: a plugin that calls `Host.use` bypasses an ordinary interceptor. Only mandatory interception (BEH-BR-262) covers it. Easy to misuse as an access control. | Keep, but add a normative "interception is not access control" cross-ref in BEH-BR-151 and a conformance check that mandatory policy, not ordinary interception, is used for restriction (R4). |
| D-05 | M | `prototypes/host-core/src/realms.ts` (`ensure`, `fingerprint`) vs BEH-BR-330 | Spec: same `ServiceId`s AND same interceptor objects in order. Prototype fingerprints only `isolate` ids plus interceptor and mandatory counts. A swapped interceptor of equal count reuses the member silently. | Fingerprint by object identity (WeakMap id) or fail the spec text to "count"; fix prototype (R5). |
| D-06 | M | `realms.ts` `ensure` key regex vs BEH-BR-330 | Spec refuses empty, "/" and "bridger:" prefix; prototype accepts only `[A-Za-z0-9._-]{1,64}`. Keys with ":" or spaces accepted by spec, rejected by prototype with `invalid-key`. | Reconcile: either spec adopts the grammar or prototype follows spec. |
| D-07 | M | `realms.ts` `awaitActive` | Polls `snapshot` with `Effect.sleep(1)`; under TestClock this works, in production it is a busy poll of the full host snapshot per member creation. | Use `Host.changes`/`awaitIdle` style subscription (BEH-BR-? snapshot stream) instead of polling. |
| D-08 | M | BEH-BR-146 "key K provided from inside realm R and not isolated lands in the default slot" | A plugin in a realm that forgets to isolate its provided key silently publishes into the default realm, colliding across tenants (DuplicateProvider at best). | Add a `RealmOptions.strict` (or lint) that fails install of a provide of a non-isolated key from a non-default realm (R6). |
| D-09 | L | BEH-BR-151 order: realm interceptors innermost | Composition order is fixed but not discoverable; no `inspect` listing of effective interception chain per consumer/key. | Add `PluginInspection.interceptions` (ids only) (R4). |
| D-10 | L | `registry.ts` `within` | `within(range)` throws synchronously (`checkRange`) rather than defecting in Effect; `make` uses `Effect.die`. Inconsistent error channel. | Make `within` return an Effect or document the throw. |
| D-11 | L | BEH-BR-129 + 130 | `requires` keys are undeclared for `optional`; so a plugin cannot treat a required key as soft after startup. Fine, but no spec path for "required at install, tolerate temporary loss" (Cordis restarts either way). | Document as non-goal in ADR-BR-022. |
| D-12 | L | ADR-BR-010 "Not adopted: mixin/accessor/invoke" | Sound, but no documented porting recipe for Cordis `accessor`/`mixin` patterns (ADR notes only that authors must "restructure"). | Add a recipe to kit docs (R3 companion). |

## Recommendations

### R1. Compare method schemas, not just names (D-01)

**Rationale.** BEH-BR-228 clause 3 only checks that every method name of the dependent's contract appears in the provision. The contract already holds `MethodSpec` codecs, and BEH-BR-230 states add-only evolution, but nothing enforces it. In a GxP product (RSK-BR-010, RSK-BR-025) a silent payload change is the exact failure the contract layer exists to stop.

**Change (as built).** `ContractDescriptor.schemas` lists a stable per-method digest: a sha-256 of the sorted-key JSON Schema of payload, success, error and the stream flag, ignoring title, description and examples. `MethodSpec.digest` overrides it for a codec with no canonical JSON Schema, and a method without a digest is skipped. BEH-BR-228 clause 3b: a method both sides name must have equal digests in every compatible pair; an add-only evolution never changes a method the older side knows, so no "unless higher" exception is needed. `IncompatibleContract.mismatchedMethods` names the methods, and a registry `add` accepts a `Contract.at` provision so its copy is compared too. BEH-BR-231's "core never compares schemas" now limits core to opaque digests; classification stays in the kit. There is no `SchemaFingerprinter` port: the default is always on.

**Cost/risk.** Medium: canonical JSON Schema of arbitrary codecs is hard (transformations, brands). Start with descriptor-level opt-in. False positives on harmless refactors, mitigated by add-only classification.

**Verification (as built).** `r1-schema-digest.test.ts`: identical copies bind (annotations ignored); a changed payload is refused from both install orders naming `post`; a flipped stream flag changes the digest; an add-only higher provision binds and one that edits a method does not; explicit digest and skipped methods; registry with a `Contract.at` provision. Mutation check: with clause 3b disabled, 3 tests fail. Kit acceptance check 30.

### R2. Make plain keys across package boundaries a conformance failure (D-02)

**Rationale.** ADR-BR-011 admits drift under an unchanged `ServiceId` passes. ADR-BR-040 added contracts but left plain keys fully legal, so the weak path is the easy path.

**Change (as built).** Core only decodes a new `internal` flag on a plain-key manifest reference (BEH-BR-241; refused on a contract key). The loader refuses a manifest naming a plain key not marked `internal` with `PackageRefused` predicate "plain-cross-boundary-key" (loader BEH-LD-014), and `bridger check` fails it with `PlainCrossBoundaryKey` (kit BEH-KT-028, error catalog entry). ADR-BR-011 records that the weak path is now explicit.

**Cost/risk.** Low. Possible friction for first-party internal keys; the `internal` annotation absorbs it.

**Verification (as built).** `r2-internal-key.test.ts` covers the decode rules. The loader and kit rules are specification only: no loader or kit prototype exists, so they are covered by kit acceptance check 30 (REQ-KT-030, not run).

### R3. A broker seam for provider swaps (D-03, D-12)

**Rationale.** ADR-BR-003 correctly refuses multiple providers per key. But Cordis's broker pattern (a stable facade absorbing provider swaps) answers a real operational need: replacing a provider currently stops all dependents (BEH-BR-050, "Dependents do not survive a replace"). For a long-running ERP host that is a large blast radius for a patch. Registries (`registry.ts`) multiplex by id but consumers pick ids; they do not give "one service, many implementations behind it".

**Change (as built).** `Broker.make(contract, {name, range, select, drainTimeout})` (BEH-BR-168, `src/broker.ts`) makes a contract registry and a facade with one function member per contract method. Each call chooses a contribution (`"first"` = lowest priority number, a function, or `Broker.byKey`), runs the member under a lease, and reselects once if the choice was withdrawn meanwhile; no contribution gives `ContributionUnavailable`. The chosen id reaches the call log through `CurrentCall.contributed`, recorded as `CallEntry.contribution`. The Cordis porting recipe is a paragraph of BEH-BR-168. The selector names differ from the proposal (`first`, function, `byKey`; `by-priority` equals `first` because the view order is priority order). Limit stated as Open: a stream method is leased while it is produced, not consumed.

**Cost/risk.** Medium; strictly additive and expressed with existing primitives. Risk: broker hides provider identity from audit; require the `CallLog` (BEH-BR-029) to record the chosen contribution id.

**Verification (as built).** `r3-broker.test.ts`: delegation, selection by key, typed failure when empty; a swap under an in-flight call (old drains, new calls reach the new one, no plugin restarts); contract-mismatched contribution refused at `add`; the call log carries the contribution.

### R4. Make the interception limits unmistakable and inspectable (D-04, D-09)

**Rationale.** BEH-BR-151 deliberately wraps at capture only, and BEH-BR-152 notes authorization or rate-limit wrappers must not be called a boundary (line 467). Cordis's intercept is also consulted at read time, but it is also not security. The risk here is documentation, not design, plus invisibility: `inspect` shows no interceptions.

**Change (as built).** As proposed. BEH-BR-151 states that restriction belongs to mandatory interception (BEH-BR-262). `Interception` and `MandatoryInterception` take an optional `id`; `PluginInspection.interceptions` lists `{key, source, id?}` in composition order: realm, inherited, install, then mandatory (own chain, realm, host). Ids only.

**Cost/risk.** Low. Needs an optional `id` on `Interception`.

**Verification (as built).** `realms.test.ts` (report 02 R4): parent, inheriting child, child with its own, and a plugin with none.

### R5. Fix realm-family option fingerprinting (D-05, D-06)

**Rationale.** BEH-BR-330 requires identical isolated keys and the same interceptor objects in order. `realms.ts` computes `{isolate ids, interceptors.length, mandatory.length}`. A family whose `realm(K)` returns a different interceptor of equal count produces `options-changed` never; the member keeps the old wrap. This is the one prototype/spec divergence I found.

**Change (as built).** Already in the prototype (`sameOptions` compares interceptor and mandatory objects with `Object.is`, and the key grammar follows BEH-BR-330, so `tenant:1` is valid); the three repro tests pass and BEH-BR-330 states both rules. No `WeakMap` was needed.

**Cost/risk.** Low.

**Verification (as built).** `divergence-repro.test.ts` (interceptor swap of the same count, key `tenant:1`, a dormant member).

### R6. Guard the default-realm leak (D-08)

**Rationale.** BEH-BR-146 lets a non-isolated key provided inside a realm land in the default slot. That is intended for shared services but is the classic tenant-leak mistake: forget to list the key in `isolate`, and tenant B's install fails `DuplicateProvider` (best case) or tenant A's data service is visible to everyone (worst case, if only one tenant exists at first).

**Change (as built).** As proposed. `RealmOptions.provideNonIsolated: "allow" | "refuse"` (BEH-BR-146); `"refuse"` fails the install with `InvalidDefinition` "non-isolated-provide-in-realm". Realm families define every member with `"refuse"` (BEH-BR-330), so a leaking member is "rejected". The snapshot does not show the policy.

**Cost/risk.** Low; opt-in.

**Verification (as built).** `realms.test.ts` (refusal, isolated key allowed, default "allow" unchanged) and `r2-family-leak.test.ts` (family rejects, isolated key accepted).

## Resolution status (2026-11-22)

Branch `spec/dependency-report-02`; prototype suite 396/396, `verify-traceability.sh` 0 failures. Every finding is resolved; the cards below describe what was built.

| Finding | Rec. | Status | Notes |
|---|---|---|---|
| D-01 | R1 | Resolved | Per-method schema digests, BEH-BR-228 clause 3b, `mismatchedMethods`. |
| D-02 | R2 | Resolved (spec + decode) | `internal` flag decoded by core; loader and kit refusal specified, no prototype exists for them. |
| D-03 / D-12 | R3 | Resolved | `Broker.make` (BEH-BR-168) and the porting recipe; stream lease limit stated as Open. |
| D-04 / D-09 | R4 | Resolved | BEH-BR-151 note; `PluginInspection.interceptions`; interception ids. |
| D-05 / D-06 | R5 | Resolved | Already in the prototype; both rules in BEH-BR-330; repro tests pass. |
| D-07 | X1 | Resolved | `awaitActive` subscribes to `Host.changes`. |
| D-08 | R6 | Resolved | `provideNonIsolated`; families default to `"refuse"`. |
| D-10 | X2 | Resolved | `within` is an Effect (defect channel). |
| D-11 | X3 | Resolved | Non-goal documented in ADR-BR-022. |

The minor proposals X1 (D-07), X2 (D-10) and X3 (D-11) are in the rows above. As built differs from proposed: R1 has no "unless higher" exception and no `SchemaFingerprinter` port; R2 is a manifest `internal` flag enforced by the loader and kit specifications (no prototype for those); R3's selectors are `first`, a function and `byKey`; R5 needed no change (already built); X2 uses the defect channel. The Rationale text of each card is the original finding.

## Not checked / uncertainties

- Federation, remote, loader and kit files were checked for the changes made here (2026-11-22): federation imports (BEH-FD-026) and remote proxies are contract-based (`Contract.at`), so the plain-key rule does not touch them, and a proxy whose contract copy has no digest is simply not compared. Not done: carrying digests in the remote handshake descriptor, so cross-host drift is not detected yet.
- BEH-BR-020 was read against the prototype: `DependencyCycle.path` was a list of key strings against the spec's `{ id, realm }` records; the prototype now follows the spec and a test pins it. ADR-BR-038 and BEH-BR-121..128 (children) are still only sampled.
- D-07: the host exposes `Host.changes`; it is now used.
- The suite was run for every change (396 tests). The loader and kit rules of R2 have no prototype to run against.
- Cordis comparisons rely on the supplied brief, not the primary paper.
