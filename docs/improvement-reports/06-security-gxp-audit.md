# Improvement report 06: Security, access control, sandboxing, GxP/audit and trust

Lens: Cordis / DeepSeek Harness (capability-style proxy access, interception metadata, UNDECLARED/INACTIVE_ACCESS, "language-level checks are not a sandbox", output-commit problem).

**State (2026-11-22):** the original review is kept as written below. All 11 findings were checked against the specification and the prototype; 10 were partly wrong in their premise or already specified, and all are resolved (see Resolution status). Not built: a production worker adapter, a production evaluator and a kill-switch loop; those are reference kernels.

## Resolution status (2026-11-22)

Corrected citations: BEH-BR-32 is BEH-BR-313..326, BEH-RM-06x is BEH-RM-041..044, BEH-LD-002 is BEH-LD-011, and the BEH-RM-070s are taken (new: BEH-RM-073).

| Finding | Rec. | Verdict | As built |
|---|---|---|---|
| S1 | R1 | Partly wrong, resolved | The leak was the install caller's environment, not host ports (those are closure values). `closed.ts` `closedContext` replaces the build, finalizer, background, listener and hook contexts; an undeclared service fails the activation as `UndeclaredAccess` (BEH-BR-036, ADR-BR-002 amendment, INV-BR-014, check 115). `test/sec-closed-context.test.ts`. |
| S2 | R1 | Partly wrong, resolved | `Runtime.optional` already hands out no service (BEH-BR-130). The real escape was a service kept past its activation: `leaseBound` throws `InactiveAccess` once the provider's activation has ended (check 116). |
| S3 | R2 | Partly wrong, resolved | `consentDiff` was already specified (BEH-BR-243, BEH-BR-318). Now wired into plan entries; manifest `emits`, `mounts`, `hostOps`; `declaredOnly` decides emit and child; BEH-GX-092 binds the diff through the request digest. `test/sec-declared-access.test.ts`. |
| S4 | R3 | Partly wrong, resolved | The guest trust class already exists (BEH-LD-066..068), so no `partner` value. BEH-RM-073 and ADR-RM-011: a six-case negative isolation suite, manifest first, `unsupported` fails; BEH-RM-052 obligation 7. `src/isolation-conformance.ts` with a `worker_threads` adapter that fails all six (`test/sec-isolation.test.ts`). No production worker adapter exists. |
| S5 | R5 | Partly wrong, resolved | `residentRevoked` is the loader's, not `Host.controls`; BEH-GX-091 stays at eleven reasons. BEH-LD-031 adds `restartRequired` and the opt-in `restartGate` (refusal `restart: resident-revoked`); federation kill frames feed the same revocation source. `test/sec-restart-required.test.ts`. |
| S6 | R4 | Partly wrong, resolved | Plan entries carry `reversibility` (BEH-BR-327, BEH-BR-328): core sets only `irreversible` from a resource acquired with `irreversible: true` (BEH-BR-119); an atomic apply defers irreversible removals past changes unless a dependency forces order (BEH-BR-156). The binding carries it only when present (BEH-GX-066 vectors unchanged). Shred and remote outcomes stay owner-declared. `test/sec-reversibility.test.ts`. |
| S7 | R4 | Partly wrong, resolved | `ChainGate` already did anchor freshness (BEH-AC-013); the option `anchorBeforeIrreversible` refuses `anchor-behind` at the gate and never waits on the write path (INV-AC-005). `test/sec-chain-gate.test.ts`. |
| S8 | R6 | Confirmed, resolved | BEH-BR-282: core's own delivery layer sets `bridger:via` while a provider's method runs, independent of `CallLog`; the principal is unchanged (BEH-BR-258); check 117. `test/sec-via.test.ts`. |
| S9 | R7 | Partly wrong, resolved | Closure was already BEH-LD-011 (`EvaluationFailed` "unresolved-import"), not BEH-LD-002. Added root-escape, protocol-specifier and `allowBuiltins` rules; `resolveSpecifier` and `checkExternals`. `test/sec-digest-closure.test.ts`. No production evaluator exists. |
| S10 | - | Partly wrong, resolved | The 900 s is awthaq's JWT (SPK-09-12), now documented in RSK-RM-009, the entitlement traceability and ERP-IDENTITY. The per-call cap `tokenTtl` existed; the checker now enforces it against custom authorities. `test/sec-token-cap.test.ts`. |
| S11 | - | Partly wrong, resolved | `CapabilityPolicy.resolve` (not `AccessPolicy`) already receives the provider's identity; documented as the allow-list hook in BEH-BR-273. `test/sec-provider-allowlist.test.ts`. |

## Executive summary

1. Bridger is already stricter than Cordis on trust: signed statements, no default policy, a separate "first-party" statement for in-process code (BEH-LD-065), and explicit "attribution, not isolation" non-claims.
2. The weak point is the gap between declared and reachable authority. Declarations are enforced at compile time (Layer `RIn`) and only for listen/contribute at run time (BEH-BR-268). There is no runtime UNDECLARED/INACTIVE_ACCESS analogue and no spec statement that a plugin build sees a closed context.
3. Partner (neither first-party nor fully hostile) plugins have no supported tier: in-process is first-party only, remote "provides no isolation" (ADR-RM-006), so isolation evidence is entirely the integrator's.
4. Irreversibility is not modelled. Atomic apply undo (ADR-BR-051), keyring shred (ADR-KR-001), revoked code staying resident (BEH-LD-031) and remote unknown outcomes (ADR-RM-008) are each handled alone; the gate and approval plan have no "irreversible" class and no output-commit ordering.
5. Audit integrity is well specified (anchors, expected heads, INV-AC-001..007). Remaining items: tying anchor freshness to irreversible operations, and attributing provider-originated mutations.

## Where Bridger is already ahead of Cordis

- **Trust is a first-class, signed pipeline.** Digest commits to manifest, SBOM and files (BEH-LD-001); N-of-M signer policy with roles and validity windows (BEH-LD-020); no default policy (BEH-LD-022); trust roots from the application, never the package (BEH-LD-023); signatures re-checked on every load (BEH-LD-024). Cordis has no signing concept.
- **Revocation and kill switch** (BEH-LD-025..032): stale revocation set refuses loads (BEH-LD-027), blast-radius guard `maxDroppedPerRun`, and what the switch cannot reach is reported (`status.outsideScope`, `status.residentRevoked`).
- **Principal minted only by the host** (BEH-BR-257, INV-BR-035; prototype `policy.ts` `minted` WeakSet, `PrincipalForged`/`PrincipalRetired`). Cordis has fiber uid but no forgery-proof principal on records.
- **Mandatory interceptions that plugins cannot remove** (BEH-BR-260/262) are stronger than Cordis `intercept`, which is merged metadata a parent may override.
- **Honest non-claims** (core/overview.md Core exclusions; RSK-BR-028; INV on realms). Cordis itself says real sandboxing needs an external boundary; Bridger says this in the normative text.
- **Gate with single-use, bound, separated-duty approvals** (BEH-GX-089..093, ADR-GX-010/013/015) and undo actions that are ordinary, gated, linked changes (`undoes`, BEH-BR-325).
- **Audit chain** with anchor-or-say-so (`layerUnanchored` explicit, ADR-AC-002), keyed hasher, generic series, bundle verification; spikes 06/09 confirmed that tail truncation and rewritable audit tables are real (SPK-06-07, SPK-09-20), and the spec answers them.

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|----|-----|----------|-------|-----------------|
| S1 | H | ADR-BR-002 ("a requirement reached only inside a returned method is invisible"); the build pipeline of host.ts (`closedContext`; it was `provideContext`) (`Context.empty()` plus `Effect.provideContext`); RSK-BR-001 residual | Closed build context is not specified or tested. `provideContext` adds to the inherited fiber context; host services and `Reference` defaults may be reachable by `Effect.service` or a cast. No UNDECLARED_ACCESS equivalent. | New behaviour: build, finalizers and background fibers run with a replaced context; acceptance check that an undeclared host service lookup fails with a typed defect. |
| S2 | M | BEH-BR-130 `Runtime.optional`; RSK-BR-001 residual "reference captured and kept" | A captured service used after its lease ends is accepted as "contradicts contract" with no runtime signal (no INACTIVE_ACCESS). | Lease-bound wrapper that throws `InactiveAccess` after release, built on the BEH-BR-260 interception machinery. |
| S3 | M | BEH-BR-268 settled (3): emits and child mounts not compared | Load-time review covers listens and contributions only. Emits, child mounts, host mutations and external egress are undeclared. | Extend manifest and `DeclaredAccess` with `emits`, `mounts`; add a consent-diff on upgrade. |
| S4 | H | INV-LD-009; ADR-RM-006; RSK-BR-028 | Partner/third-party plugins have no Bridger-defined tier: not in-process, remote isolation is "the host's". No shipped negative conformance for an adapter. | Isolation conformance suite per adapter (egress, fs, env, timing) recorded as evidence, never an enum. |
| S5 | M | BEH-LD-031 `residentRevoked` | A revoked, evaluated module keeps running code until restart. Kill switch removes the plugin but not its scheduled outside work. | Gate-visible `restartRequired` state: GMP-class operations refused (or flagged) until recycle, configurable. |
| S6 | H | Core exclusions ("does not compensate external effects"); ADR-BR-051; ADR-BR-004; ADR-RM-008; ADR-KR-001; BEH-GX-093 | No operation-level reversibility class. Atomic apply undoes in reverse order but cannot know which action is irreversible (shred, external send, ticket consumption). | Reversibility annotation on plan entries; apply orders irreversible last or refuses to roll back past it (output-commit rule). |
| S7 | M | INV-AC-005 (anchoring never delays a write); SPK-06-07; FINDINGS #9 | Records after the last anchor rest on the chain alone, and nothing couples anchor freshness to a high-risk operation. | Gate option "anchored head at least n" before an irreversible op (the gate, not the write path, waits). |
| S8 | M | BEH-BR-258/259; RSK-BR-028 | A provider mutating the host while serving consumer A is recorded `onBehalfOf` A with no trace of the provider's code. Attribution of module origin is lost. | Built-in mandatory interception adds a `via` annotation (provider principal) on every intercepted call result path. |
| S9 | M | BEH-LD-001/ADR-LD-002 | SBOM is opaque to the loader (BEH-LD-001 non-claims). Transitive imports at evaluation time are not tied to the digest. | Require file-set closure: loader evaluates only files in the digest, no dynamic import outside it. |
| S10 | L | SPK-09-12; BEH-BR-281 | Offline/stateless tokens stay valid until expiry (900 s); entitlement lapse narrows live captures but token lifetime is awthaq's. | Document the bound in the entitlement and remote risk tables; per-call token (BEH-RM-041..044) TTL max. |
| S11 | L | Cordis paper: version drift, key collision | Nominal key identity (ADR-BR-011) allows a lookalike provider to satisfy a `requires`. | Already mitigated by contract versions (BEH-BR-229); add provider-principal allow-list in AccessPolicy docs. |

## Recommendations

### R1 (S1, S2). A closed plugin context and typed access errors

**Rationale.** Cordis's value is that `ctx[key]` is proxy-mediated: undeclared throws UNDECLARED_ACCESS, declared but unavailable throws INACTIVE_ACCESS, and the capability set is knowable before running. Bridger gets the first half from the `Layer` type and from the resolver supplying only declared services (the build pipeline of host.ts builds `ctx` from `requires` alone), which is good. But the spec never states that the build fiber's context is exactly that set. `Effect.provideContext(ctx)` merges onto the caller's context; if the host's fiber carries `AuditSink`, `OperationGate` or similar, plugin code can read them at run time (type erasure, `as any`). `Reference` services (`CurrentActor`, `PrincipalReference`, `ActivePlugin`) are always readable by design. RSK-BR-028 says "trusted code"; but a partner plugin or an agent-generated plugin is exactly where capability discipline pays.

**Concrete spec change.** (a) New BEH in core 05 Activation: "The build, finalizers, background fibers, listeners and hooks of a plugin MUST run in a context whose services are exactly: its declared and optional requirements (after interceptions), `Plugin.Runtime`, `Plugin.Config`, and Effect's own References. Host-internal ports (`AuditSink`, `OperationGate`, `AccessPolicy`, `CallLog`, `RefusalList`) MUST NOT be present." (b) Define `UndeclaredAccess` and `InactiveAccess` defects with the plugin id and key; `Runtime.optional` captures and lease-released services are wrapped to throw `InactiveAccess`. (c) Add acceptance checks: undeclared lookup in build fails; a captured optional used after drain fails typed. (d) Record the reachable References list in `Host.controls` (BEH-BR-265).

**Cost/risk.** Low to medium. Wrapping by interception costs a proxy per delivered service; Effect-internal services (Scope, Clock) must stay. Risk: a plugin legitimately using a host service through a cast breaks (desired).

**Verification.** Prototype test under `TestHost`: plugin whose build calls `Effect.service(AuditSink)` must die with `UndeclaredAccess`; property test on lease release.

### R2 (S3). Make the load-time review complete

**Rationale.** A manifest read by a consent screen or agent (BEH-BR-241) is only as true as what is enforced. `declaredOnly` leaves emits and child mounts out because the manifest declares none (BEH-BR-268 settled 3).

**Concrete spec change.** Add manifest fields `emits`, `mounts`, `hostOps` (which host operations it may call via `Plugin.Runtime.install/unmount`). Extend `DeclaredAccess` and `declaredOnly` to deny "undeclared emit/mount" with exact-string comparison. Add a manifest diff (old vs new on replace) as input to the approval plan so an upgrade that widens declarations needs a fresh ticket (BEH-GX-092 binding). Keep `withoutManifest` without default.

**Cost/risk.** Manifest churn; existing eager plugins without manifests unaffected under "allow". Cordis does this only informally.

**Verification.** Acceptance checks mirroring check 102; golden manifest-diff fixtures.

### R3 (S4). A partner-plugin tier built from evidence, not an enum

**Rationale.** ADR-RM-006 correctly rejects an isolation-level enum; yet GxP integrators then have nothing to cite for partner code. The Cordis paper's conclusion (external sandbox needed) is accepted by Bridger but not operationalised.

**Concrete spec change.** In remote BEH-RM-073: a normative negative conformance suite each adapter publishes (egress denied, fs/env unreadable, CPU/memory cap, no shared module cache), result recorded in the GxP OQ evidence pack (BEH-GX-127 already records package self). Add a loader trust-class value `partner` meaning "remote link only; first-party statement refused" so `Loader.lazy` cannot admit it by accident (BEH-LD-067 already refuses non-first-party; make the class explicit in the catalog).

**Cost/risk.** Medium: suite content per adapter. Avoids false claims.

**Verification.** Run the suite against the `worker_threads` adapter and expect specific known leaks documented as failures (shows the suite has teeth).

### R4 (S6, S7). Reversibility class and output-commit ordering

**Rationale.** The paper's own stated limit: effects crossing the system boundary need withholding or compensation. Bridger says "does not compensate external effects" and handles each case separately, but a GxP approver reading an atomic-apply plan cannot see which entries cannot be undone.

**Concrete spec change.** (a) Add an annotation `Reversibility = reversible | compensable | irreversible` on plan entries (BEH-BR-313..326 generic plan); defaults: install/replace/remove reversible by the undo of ADR-BR-051; keyring shred, remote calls with unknown outcome, ticket consumption and external-egress contributions declared irreversible by their owners. (b) Atomic apply MUST order irreversible entries after all reversible ones and MUST fail the plan, not the run, if an irreversible entry precedes a reversible one it depends on. (c) The approval binding (BEH-GX-092) covers the class so approvers see it. (d) With S7, the gate may require `anchoredHead >= headAtPlanTime` before executing an irreversible entry; this respects INV-AC-005 because the wait is at the gate, not the write.

**Cost/risk.** Medium; one new annotation, one ordering rule. Risk: plugin authors under-declare, so also require companions (keyring, remote) to set it.

**Verification.** Scenario: apply with shred plus failing replace rolls back everything except the (last) shred, which never ran; property test on ordering.

### R5 (S5). Revoked resident code must be visible to the gate

**Rationale.** BEH-LD-031 admits revoked modules stay in memory. For a high-risk revocation (compromised signer), "removed from host" is not "stopped".

**Concrete spec change.** When `status.residentRevoked` is non-empty and the policy is `strict`, `Host.controls` reports `restartRequired`, and the GxP gate refuses new GMP-class operations (reason from the eleven of BEH-GX-091, plus one) until a process incarnation begins. Federation kill frames (ADR-FD-009) trigger the same.

**Cost/risk.** Availability cost; make it opt-in per deployment.

**Verification.** Kill switch scenario in `TestHost` plus gate acceptance check.

### R6 (S8). Attribute provider-originated mutations

**Rationale.** BEH-BR-258 consciously records the caller, not the module. In an audit this makes a provider-originated change look consumer-originated; Cordis has the same blind spot but also no regulatory duty.

**Concrete spec change.** Ship a mandatory interception (core-built, like grant narrowing BEH-BR-275) that adds `via: providerPrincipal` as an annotation while a service method runs; record it in `onBehalfOf`'s neighbour field `via`. Costs one wrapper per service call, tolerable since interceptions already exist.

**Cost/risk.** Per-call overhead; shallow (does not reach captured sub-objects, same limitation as grants).

**Verification.** Record-shape tests; spike against awthaq adapter (spike 09 SPK-09-03).

### R7 (S9). Digest closure

**Rationale.** The digest commits to a file set (ADR-LD-002) but evaluation can still import outside it.

**Concrete spec change.** Add to BEH-LD-011: the evaluator MUST resolve imports only inside the digested file map; a bare or dynamic specifier outside it fails with `OutsideDigest`. Keep SBOM interpretation out of scope.

**Cost/risk.** Packaging constraint for bundling; matches Cordis HMR's import-graph analysis in spirit.

**Verification.** Fixture package with a dynamic import of `node:fs` and a sibling path.

## Not checked / uncertainties

- S1 was run, not inferred: `test/sec-closed-context.test.ts` shows the leak before the fix and its removal after.
- Whether a ticket consumed by a rolled-back forward action is re-issued for its undo is still per case (BEH-GX-090, BEH-GX-093).
- No production worker adapter, evaluator or kill-switch loop exists; the isolation suite, `resolveSpecifier` and `restartGate` are reference kernels. Six probes are not the whole attack surface (BEH-RM-073).
- ERP-layer authorization (spike 08) is not assessed. Everything is Draft/Planned.
