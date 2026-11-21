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

**Concrete spec change.** Extend `ContractDescriptor` with `schemas: readonly { method: string; digest: string }[]` where `digest` is a stable hash of the method's encoded-side JSON Schema (payload, success, error, stream flag), sorted by method. Add to BEH-BR-228: "3b. For every method in D's contract object, when the provision's version has the same major, the provision's digest MUST equal D's digest unless the provision's minor/patch is higher and the change is classified add-only by `Contract.diff` (BEH-BR-230); otherwise the pair is incompatible with `mismatchedMethods`." `IncompatibleContract` gains `mismatchedMethods: Schema.Array(Schema.String)`. Core computes no hash itself if ADR-BR-039's port pattern is preferred: a `SchemaFingerprinter` port, defaulting to unwired (names only, today's behaviour), keeping INV-BR-013 style neutrality.

**Cost/risk.** Medium: canonical JSON Schema of arbitrary codecs is hard (transformations, brands). Start with descriptor-level opt-in. False positives on harmless refactors, mitigated by add-only classification.

**Verification.** Conformance tests: same name, widened payload (add-only) binds; narrowed payload fails; two bundled copies of an identical contract bind; stream flag change fails. Add to kit BEH acceptance checks (kit 08).

### R2. Make plain keys across package boundaries a conformance failure (D-02)

**Rationale.** ADR-BR-011 admits drift under an unchanged `ServiceId` passes. ADR-BR-040 added contracts but left plain keys fully legal, so the weak path is the easy path.

**Concrete spec change.** In kit conformance (references/kit behaviors/03) add: "A plugin definition whose `provides` or `requires` contains a plain key MUST be reported by `bridger kit check` as `plain-cross-boundary-key` unless the key is annotated `internal`." Core is unchanged. Add a manifest field (BEH-BR-241 family) flagging `internal` keys so the loader (references/loader 02) can refuse a manifest requiring a plain key from outside its package.

**Cost/risk.** Low. Possible friction for first-party internal keys; the `internal` annotation absorbs it.

**Verification.** Kit CLI fixture with one plain and one contract key; loader pipeline test with a third-party manifest.

### R3. A broker seam for provider swaps (D-03, D-12)

**Rationale.** ADR-BR-003 correctly refuses multiple providers per key. But Cordis's broker pattern (a stable facade absorbing provider swaps) answers a real operational need: replacing a provider currently stops all dependents (BEH-BR-050, "Dependents do not survive a replace"). For a long-running ERP host that is a large blast radius for a patch. Registries (`registry.ts`) multiplex by id but consumers pick ids; they do not give "one service, many implementations behind it".

**Concrete spec change.** Specify, in 24 (shared-state helpers), `Broker.make(Contract, { select })`: a base-service facade implementing the contract by delegating each call to `registry.use(id, ...)` under a lease (registry `use` already provides drain and `LeaseRevoked`, `registry.ts:holding`). Providers contribute implementations to the registry (`implements` version and methods are already checked by BEH-BR-233). Consumers require the facade key and are never restarted when implementations come and go. State: calls with no live implementation fail with `ContributionUnavailable`; selection (`first`, `by-priority`, `by-key`) is declared by the broker's author, not by core. Federation (BEH-FD-026) and remote (references/remote 01) proxies then become ordinary registry contributors, giving a documented path for rolling update and cross-process fan-in.

**Cost/risk.** Medium; strictly additive and expressed with existing primitives. Risk: broker hides provider identity from audit; require the `CallLog` (BEH-BR-029) to record the chosen contribution id.

**Verification.** Test: swap implementation under in-flight call (drain, no consumer restart); remove last implementation (fail typed); contract-version-mismatched contribution rejected at `add` (BEH-BR-233).

### R4. Make the interception limits unmistakable and inspectable (D-04, D-09)

**Rationale.** BEH-BR-151 deliberately wraps at capture only, and BEH-BR-152 notes authorization or rate-limit wrappers must not be called a boundary (line 467). Cordis's intercept is also consulted at read time, but it is also not security. The risk here is documentation, not design, plus invisibility: `inspect` shows no interceptions.

**Concrete spec change.** (a) Add to BEH-BR-151 a one-line normative note referencing BEH-BR-262 for restriction. (b) Extend BEH-BR-232's `PluginInspection` with `interceptions: readonly { key: ServiceId; source: "realm" | "install" | "inherited" | "mandatory"; id?: string }[]` in composition order. Ids only, honouring ADR-BR-033-style no-values rule.

**Cost/risk.** Low. Needs an optional `id` on `Interception`.

**Verification.** Inspect fixture asserting order realm, inherited/own, mandatory (BEH-BR-261).

### R5. Fix realm-family option fingerprinting (D-05, D-06)

**Rationale.** BEH-BR-330 requires identical isolated keys and the same interceptor objects in order. `realms.ts` computes `{isolate ids, interceptors.length, mandatory.length}`. A family whose `realm(K)` returns a different interceptor of equal count produces `options-changed` never; the member keeps the old wrap. This is the one prototype/spec divergence I found.

**Concrete spec change (prototype).** Replace the count with an identity list: assign each interceptor/mandatory entry a stable id via a module-level `WeakMap<object, number>` and fingerprint `interceptors.map(idOf)`. Spec side: add to BEH-BR-330 an explicit verification line "same count, different object fails with options-changed". For D-06, align the key grammar: either state `[A-Za-z0-9._-]{1,64}` in BEH-BR-330 (cleanest, matches `realm` id use in audit) or relax the prototype.

**Cost/risk.** Low.

**Verification.** Unit test in prototypes/host-core: second `use` with swapped interceptor returns `FamilyMemberUnavailable { reason: "options-changed" }`; key `"a:b"` behaviour pinned either way.

### R6. Guard the default-realm leak (D-08)

**Rationale.** BEH-BR-146 lets a non-isolated key provided inside a realm land in the default slot. That is intended for shared services but is the classic tenant-leak mistake: forget to list the key in `isolate`, and tenant B's install fails `DuplicateProvider` (best case) or tenant A's data service is visible to everyone (worst case, if only one tenant exists at first).

**Concrete spec change.** Add `RealmOptions.provideNonIsolated?: "allow" | "refuse"` default `"allow"` (back-compat); with `"refuse"`, `install` of a plugin whose `provides` includes a key not isolated by its realm fails `InvalidDefinition { reason: "non-isolated-provide-in-realm" }`. Family helpers default to `"refuse"`.

**Cost/risk.** Low; opt-in.

**Verification.** Install tests per realm; family test showing the refusal and that BEH-BR-148 cross-realm ordering is unchanged for allowed keys.

## Not checked / uncertainties

- I did not read federation, remote, loader or kit behaviour files line by line; claims about them (BEH-FD-026 proxies as registry-compatible contributors, kit conformance hooks) are inferred from headings and a partial read of federation 04. R2 and R3 integration points need confirming.
- BEH-BR-020 cycle-path wording and the whole of ADR-BR-038 (stop ordering) and BEH-BR-121..128 (children) were sampled, not fully audited; the claim that child mount edges share the graph is from 08.
- D-07 (polling) is judged from the prototype only; production host may expose a change stream I did not look for.
- No tests were run; D-05 is by code reading of `realms.ts`.
- Cordis comparisons rely on the supplied brief, not the primary paper.
