# Roadmap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ROADMAP                                              |
> | Revision       | 0.24                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Planning Document — Informative                              |
> | Change History | 0.24 (2026-11-10): "Round 2 core fixes" table carried through CCR-BR-036 (CCR-BR-036)<br>0.23 (2026-11-10): "Round 2 core fixes" table carried through CCR-BR-031 to CCR-BR-035 (Low) (CCR-BR-035)<br>0.22 (2026-11-10): Core seams: the prototype passes of files 26–34 are noted in place of "no seam is prototyped" (audit round 2, Low) (CCR-BR-034)<br>0.21 (2026-11-09): P6: the companion Draft is linked, re-baselined (CCR-GX-002) and adopts `@bridger/audit-chain` for sealing; its exit criterion no longer waits for a restore (gap G35 closed) (CCR-BR-031)<br>0.20 (2026-11-08): Round 2 core fixes: prototype third pass recorded (340 tests in 32 files, 14 of 14 mutations caught); CCR-BR-030 row (CCR-BR-030)<br>0.19 (2026-11-08): Round 2 core fixes: prototype second pass recorded (every check 59–111 with a passing test, 25 only partly); CCR-BR-029 row (CCR-BR-029)<br>0.18 (2026-11-08): Round 2 core fixes: P7 prototype pass recorded (partial coverage of checks 59–111, evidences no requirement); CCR-BR-028 row (CCR-BR-028)<br>0.17 (2026-11-08): Round 2 companion revisions on B1 and B4–B7; step B8 (event-store, sequence, keyring); CCR-BR-027 in the round 2 core fixes table (CCR-BR-027)<br>0.16 (2026-11-08): Round 2 core fixes table: CCR-BR-024, CCR-BR-025 and CCR-BR-026, specified only (CCR-BR-024, CCR-BR-025, CCR-BR-026)<br>0.15 (2026-11-08): Core seams and companion phases B1–B7 (CCR-BR-017, CCR-BR-018, CCR-BR-019, CCR-BR-020, CCR-BR-021); loader and audit chaining moved out of "Deferred"; sandbox non-plan points to the remote companion (CCR-BR-021)<br>0.14 (2026-11-08): P6 row: the companion Draft in references/gxp/ is not present in this repository and must be restored or re-drafted before approval (gap G35); link turned into a plain-text citation (CCR-BR-016)<br>0.13 (2026-10-03): P6 row: companion specification drafted in references/gxp/ (Draft 0.1, CCR-GX-001), approval before code pending, prerequisite CCR-BR-014 done; non-plan wording without a restricted word (CCR-BR-015)<br>0.12 (2026-10-03): P6 row: prerequisite core change CCR-BR-014 specified and prototyped (CCR-BR-014)<br>0.11 (2026-10-03): P5 row: every settled cell (consistency pass) (CCR-BR-013)<br>0.10 (2026-10-03): P5 exit criterion met in the prototype (CCR-BR-012)<br>0.9 (2026-10-02): P5 prototyped (CCR-BR-011)<br>0.8 (2026-10-02): P4 prototyped (CCR-BR-010)<br>0.7 (2026-10-02): P2 prototyped (CCR-BR-009)<br>0.6 (2026-10-02): Stale G2–G4 exit criterion and blocker removed; review of CCR-BR-003..007, in two passes, noted (CCR-BR-008)<br>0.5 (2026-10-02): In-flight table prototyped (CCR-BR-007)<br>0.4 (2026-10-02): G11 resolved; P1 prototype extended (CCR-BR-006)<br>0.3 (2026-10-02): P3 prototype recorded (CCR-BR-005)<br>0.2 (2026-10-02): P1 prototype recorded (CCR-BR-004)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Current state

Specification, plus two throwaway prototypes in `prototypes/` (an Effect API
check and a host-core prototype). No product package, no product test and no
example exists. Every decision is Proposed and every source path is Planned;
the prototypes are not the implementation and evidence no requirement.

## Implementation order

The order follows risk: the behaviours with the highest-class risks in the
[risk assessment](./gxp/03-risk-assessment.md) are prototyped first, because
they are the ones most likely to force a change in the specification.

| Phase | Scope | Behaviours | Exit criterion |
| ----- | ----- | ---------- | -------------- |
| P1 | Host core: definition, installation, activation, removal, states, legality table, leases — **prototyped** in `prototypes/host-core` (24 scenario tests; findings G10–G12 in the URS; per-plugin ordering of ADR-BR-038 with 3 further tests, closing G11; the in-flight table of BEH-BR-072 with 34 further tests, findings G14–G15; a review of those amendments by three agent reviewers, in two passes, led to CCR-BR-008, URS gap G16, which changed the specification and, to follow it, the prototype) | 01–09 | Every row of the legality table has a passing test |
| P2 | Runtime failure, health, configuration, shutdown, observability, `ManagedRuntime` — **prototyped** in `prototypes/host-core` (18 scenario tests, several under `TestClock`; findings G17–G18) | 10–13 | Shutdown report and drain/force tests pass under `TestClock` |
| P3 | GxP hooks: attribution, `AuditSink`, sequence, `OperationGate` — **prototyped** in `prototypes/host-core` (11 scenario tests; finding G13) | 22–25 | INV-BR-022–029 each have a property test; audit records verified by `verifyAuditSequence` across fault-injected runs |
| P4 | Composition: children and groups, optional and reactive, event bus, realms, reconcile — **prototyped** in `prototypes/host-core` (50 scenario tests, including a confluence property test over 100 seeded random histories; findings G19–G25) | 14–18 | Confluence property test over random operation histories |
| P5 | Helpers and test host as public API — **prototyped** in `prototypes/host-core` (24 scenario tests, including the confluence property driven through `TestHost` with random step orders; findings G26–G32). The suites of P1–P4 then moved onto `TestHost` and the testing entry point's fixtures, except the checks that concern `Bridger.make` itself and one confluence run kept on the production host for comparison; the state × operation table gained a live test of every settled cell (56: seven settled rows × eight operations); finding G33 | 19–21 | `@bridger/core/testing` used by the suites of P1–P4 — met in the prototype |
| P6 | Companion `@bridger/gxp` specification and implementation. The companion specification is **drafted** as [`references/gxp/`](../gxp/README.md) (CCR-GX-001) and was re-baselined against this core by CCR-GX-002, which also made it adopt `@bridger/audit-chain` for sealing; it is not approved and nothing is implemented. Prerequisite core change CCR-BR-014 (the `ConfigFingerprinter` port, `Host.controls` with the audit position, `CloseReport.auditLastSeq`, the presented definition on `requested` and `rejected` records) is done: specified and **prototyped** in `prototypes/host-core` (11 scenario tests; finding G34) | [`references/gxp/`](../gxp/README.md); core prerequisite in 02, 11, 12, 22–25 | Its own specification reviewed and approved before code (pending) |

## Core seams and companion phases

The architecture review of 2026-11-08 ranked the missing pieces and ordered
them as steps B1–B7; the recheck of the same day (round 2) adds B8. Core receives only small seams (behaviours 26–34 and the
amendments of CCR-BR-020); everything else is a companion package with its
own specification tree. Every row below is **specified only**: no companion
specification is approved and nothing is implemented. Core seams are
prototyped in `prototypes/host-core` before code; the seams of files 26–34
have been exercised there by pass P7 and its later passes (§ "Round 2 core
fixes" below), which evidences no requirement.

| Step | Scope | Specification | Exit criterion |
| ---- | ----- | ------------- | -------------- |
| B1 | Versioned contracts (`Contract.make`, ranges, registration checks; CCR-BR-017), the sub-scope child mount and the `HeldPlugins` export (CCR-BR-020); companion `@bridger/remote` with its capability tokens from B3 — **specified** | core 14, 26; [references/remote/](../remote/README.md) (Draft, CCR-RM-001; round 2: CCR-RM-003 — placement by residency label, per-principal budgets, `DedupeStore`, `Transport.postMessage` and the Workers for Platforms adapter) | Property test of INV-BR-031 over random registrations; check 89; then the remote companion approved before code, and core acceptance checks 1, 2, 3, 4, 10, 12, 18 and 23 re-run through a proxy over `TestTransport`, with partition variants (BEH-RM-060) |
| B2 | Policy and decision seams: plugin principal, mandatory interceptions, `allowChildren`, `AccessPolicy` (28); `CapabilityPolicy`, grants, `CallLog`, `CurrentCall` (29); annotations (30) — CCR-BR-018; hook points and selector (31), generic gate, drafts and `Host.plan` (32), realm families, ephemeral realms, `retireRealm`, `Actor.narrow` (33), state handoff (34) — CCR-BR-019; `Plugin.Any` (CCR-BR-020, type-only, may land here) — **specified** | core 28–34, 01 | Checks 67–88 and 90 pass on `TestHost`, prototyped in `prototypes/host-core` before code |
| B3 | Per-call capability tokens and egress through a granted contract key, over `CurrentCall` — **specified** in the remote companion | [references/remote/](../remote/README.md) behaviour 06 | The remote companion's token checks pass |
| B4 | Manifest and lazy activation (`PluginManifest`, `consentDiff`, `Plugin.lazy`, `dormant`, triggers; CCR-BR-017); `@bridger/loader` (digest over manifest, SBOM and files; verify before evaluate; N-of-M signature policy; signed revocation sets and a kill switch through `reconcile`; catalog of signed manifests over `Plugin.lazy`); `@bridger/audit-chain` (hash-chain sink, external anchors, `verifyChain`); `@bridger/entitlement` (`Entitlement` port, gate piece, `Plugin.Runtime.entitled` — core seam CCR-BR-020 — and `Budget` reservations) — **specified** | core 27, 10; [references/loader/](../loader/README.md) (CCR-LD-001), [references/audit-chain/](../audit-chain/README.md) (CCR-AC-001), [references/entitlement/](../entitlement/README.md) (CCR-EN-001); round 2: CCR-LD-003 (typed signed statements, `SignaturePolicy.verify`, signed data packs, `RefusalList` from the revocation set), CCR-AC-003 (generic `ChainSink<R>`, offline verification bundles), CCR-EN-003 (grant narrowing on lapse, `settle` refunds, usage export) | Every cell of the dormant legality row passes and a counting `load` shows no load before a trigger; check 91; each companion approved before code, then its acceptance checks pass (BEH-LD-048 1–16, BEH-AC-024 1–12, the entitlement checks) |
| B5 | Event delivery `@bridger/durable-bus` (the name is intent, not a claim; ADR-DB-007) on a SQLite adapter, and `@bridger/federation` (manifests, export/import, skew handshake) — **specified** | [references/durable-bus/](../durable-bus/README.md) (CCR-DB-001), [references/federation/](../federation/README.md) (CCR-FD-001); round 2: CCR-DB-003 (`PayloadCodec`, `AccessPolicy` at delivery, re-bootstrap outbox, `publishVersion`), CCR-FD-003 (kill path apart from desired state, outbox before snapshot, one skew model); depends on core 26, 27, 30, remote (B1) and the loader's signature policy (B4) | Each companion approved before code; adapter conformance suite (BEH-DB-056), REQ-DB-001–027 and REQ-FD-001–024 including the N−1 replay check (REQ-FD-024) |
| B6 | Agent-facing companions `@bridger/command`, `@bridger/mcp`, `@bridger/agent` (with agent testing) — **specified** | [references/command/](../command/README.md) (CCR-CM-001), [references/mcp/](../mcp/README.md) (CCR-MC-001), [references/agent/](../agent/README.md) (CCR-AG-001); round 2: CCR-CM-003, CCR-MC-003, CCR-AG-003; core prerequisites 28–33 | Each companion approved before code; REQ-CM, REQ-MC and REQ-AG 001–012 pass on `TestHost`; the MCP server checked against an external MCP client |
| B7 | `@bridger/kit`: `definePlugin` facade over `Plugin.Any`, `PluginTest`/`it.plugin`, conformance kits, the `bridger` CLI, Promise SDK generator, devtools inspector, error catalog; persona [guides](../../docs/guides/README.md) — **specified** | [references/kit/](../kit/README.md) (CCR-KT-001; round 2: CCR-KT-003 — `countersign`, `verify-chain`, partner publishing appendix); depends on core 21, 26, 27, 32, 34, remote and loader | The kit approved before code; REQ-KT-001–024 pass; cast-free authoring of the prototype's plugins |
| B8 | Local-first data companions: `@bridger/event-store` (streams, expected versions, deciders, facts, projections, snapshots, outbox in the append's transaction; SQLite and Postgres adapter obligations), `@bridger/sequence` (per-origin number series verified by an authority), `@bridger/keyring` (per-subject keys, field encryption, shred) — **specified** | [references/event-store/](../event-store/README.md) (CCR-ES-001), [references/sequence/](../sequence/README.md) (CCR-SQ-001), [references/keyring/](../keyring/README.md) (CCR-KR-001); depend on core 22–24, 26–30, the event delivery companion (B5, including `PayloadCodec`) and audit-chain `ChainSink<R>` (B4) | Each companion approved before code; adapter conformance suite on SQLite and Postgres (BEH-ES-037); REQ-ES-001–016, REQ-SQ-001–010, REQ-KR-001–012 pass |

### Round 2 core fixes

The recheck of 2026-11-08 found contradictions and gaps in the core seams
above. They are amended in place — **specified**. Core files 26, 27 and
31–34 were then partly exercised by the host-core prototype's pass P7
(`prototypes/host-core/RESULTS.md`, section "P7"; 274 scenario tests, 30 of
acceptance checks 59–111 covered in full or in part), whose findings are
resolved by CCR-BR-028. Its second pass (section "Second pass") built core
28–30 and the rest of 27 and 33: 319 scenario tests, every check 59–111 with
at least one passing test (25 of them only in part), 13 of 13 new mutations
caught, `test/ccr14.test.ts` reconstructed, effect kept at 4.0.0; its
findings G-P13..G-P18 and the round-2 agent review are resolved by
CCR-BR-029. Its third pass (section "P7 third pass (CCR-BR-029
alignment)") aligned the prototype to CCR-BR-029: 340 scenario tests in 32
files, 14 of 14 mutations caught; its findings G-P19..G-P24 are resolved by
CCR-BR-030. The prototype is not the implementation and evidences no
requirement:

| CCR | Scope | Specification | Exit criterion |
| --- | ----- | ------------- | -------------- |
| CCR-BR-024 | Declared vetoes of plugins not yet loaded woken or denied; hook phases enrich → veto → advise; per-contribution `onError`, breaker per plugin, targets, policy deny; held triggering event; idle return to `dormant`; wake attribution | core 31, 27, 16 (BEH-BR-250–253, 309–312); ADR-BR-050 | Checks 92–97 pass on a prototype; INV-BR-046 property test |
| CCR-BR-025 | Reconcile in dependency order; atomic apply with reverse undo (`ApplyRolledBack`, `PartialApply`); contract-checked registries; desired-entry policy by catalog id; handoff on restart and restarting reconfigure; method timeouts in the descriptor | core 18, 19, 26, 32, 34 (BEH-BR-233–234, 322–326, 353); ADR-BR-051, 052 | Checks 98–103 pass on a prototype; INV-BR-048 property test |
| CCR-BR-026 | `RefusalList` on every start; gate request policy fields; `CurrentCorrelation`; fail-closed call log; `auditDropped`, `sanitized`, `buildTimeout`; `AccessPolicy.declaredOnly` and `ask`; attributed unmount, call-log entry kinds, `PrincipalRef` encoding; `CapabilityPolicy.changes`; hook `settle` step | core 02, 05, 08, 10, 14, 22–25, 28–31 (BEH-BR-267–269, 279–281); ADR-BR-053, 054 | Checks 104–111 pass on a prototype |
| CCR-BR-027 | Call-log entry kind "dispatch" and string epochs; registry entry `owner` and `Registry.revocations` (`HoldRevoked`); `publisher` note; round 2 companion rows, URS-BR-056–059, RSK-BR-064–070 | core 19, 21, 27, 29 (BEH-BR-163, 165–167, 241, 276, 280) | Checks 112–113 pass on a prototype |
| CCR-BR-028 | Resolutions of the host-core prototype findings G-P1..G-P12 of pass P7: contract `serviceKey`, disabled install and contract checks, wake window and woken contributions, manifest `range`/`version`, `consentDiff` shapes, confluence with lazy plugins, the actor delimiter rule, `PlanStale` mismatches, `plan` decoding, `settle` outcomes, `sanitized` scope | core 18, 21–23, 26, 27, 31–33 (BEH-BR-160, 185, 196, 225, 228, 229, 241, 243, 252, 297, 302, 309, 317, 319, 337) | Checks 49, 59, 60, 62, 63, 79, 83, 86, 92 and 108 pass on a prototype as amended |
| CCR-BR-029 | Resolutions of the round-2 agent review (core side) and of prototype findings G-P13..G-P18 of the second pass: atomic undo restores overrides and checks the moving revision; idling and refused veto declarations, owner matching, `HostLink.none` and failed reads deny; the refusal list in the reconcile diff, `plan` and atomic validation; idle conditions the host observes; held-event drop reason during a load; URS-BR-059 narrowed; `origin` form | core 01, 18, 21, 25–29, 31, 32 (BEH-BR-001, 154, 155, 159, 160, 223, 233, 250–252, 262, 267, 269, 279, 297, 305, 309, 312, 317, 318, 322, 323, 326) | Checks 72, 92, 96, 97, 99 and 104 pass on a prototype as amended |
| CCR-BR-030 | Resolutions of prototype findings G-P19..G-P24 of the third pass: held-event drop reason when a waited-for build succeeds and is discarded; a link without `hostId` counts as `HostLink.none`; the "waking" wait rule; a kept trigger absent from `WakeReport.triggered`; when `expect` compares `pruneDrain`/`pruneForce`; reporting a half-finished two-action undo step | core 21, 27, 31, 32 (BEH-BR-250, 251, 252, 305, 309, 318, 319, 323, 326) | Checks 83, 92, 96, 97 and 99 pass on a prototype as amended |
| CCR-BR-031 | Specification audit of 2026-11-09, phase 1: core re-synchronised with the `@bridger/gxp` companion Draft (citations, peer ranges, shared vocabulary) | ADR-BR-034, BEH-BR-181, 193, URS gaps G8, G35, G71, compliance matrix, validation plan, roadmap | Documentation gate D1 passes with `--strict` |
| CCR-BR-032 | Audit phase 2: host interface, realms, shutdown and lifecycle rules (BEH-BR-013 as the single source of `Host` members, realm and shutdown findings) | core 02–34 in part (45 BEH amended), INV-BR-018, 020, ADR-BR-008, 019, 020 | Amended checks pass on an implementation |
| CCR-BR-033 | Audit, remaining core findings: identifier uniqueness, handoff, member readiness, plan tags, local contracts | core in part (BEH-BR-016, 179, 210, 318, 331, 349 and others), INV-BR-004, 024, 045, installation check 8 | Amended checks and check 114 pass on an implementation |
| CCR-BR-034 | Audit round 2 (`docs/SPEC-AUDIT.html`): `correlationId` exceptions, `expect` compares incoming version, digest and consent diff, `dormant` and refused starts, "refused-digest", shutdown from a finalizer, `Generation.revocations`, cycles in `reconcile`, ephemeral teardown and family failures | core 01–34 in part, ADRs, invariants, URS, risk, validation | Amended checks pass on an implementation |
| CCR-BR-035 | Audit round 3 (`docs/SPEC-AUDIT-03.html`): `expect` binds code only through a digest; a cycle-closing entry is a validation-stage rejection; one step-4b criterion; family and ephemeral failure paths; sub-scope and unmount resumption; atomic outcomes before any action; mutation testing against packed mutants | core 13, 14, 18, 20, 21, 27, 28, 32, 33 and the rest of core in part; ADR-BR-010, 026, 032, 035, 051; PROC-02; validation plan | Amended checks pass on an implementation |
| CCR-BR-036 | Audit round 4 (`docs/SPEC-AUDIT-04.html`): a sub-scope close or `unmount` waits under the parent stop's limits; realm-qualified re-entrancy references; a reconcile record lost at shutdown named everywhere; close-flush losses signalled by `auditPosition`; the mutation kill rule a review criterion; the remaining core findings | core 02, 08–14, 21–24 and the rest of core in part; INV-BR-009, 016, 017, 022, 023, 029, 030; ADR-BR-008, 016, 031, 035; risk assessment; validation plan; URS | Amended checks pass on an implementation |

## Blocking first release

- An independent reviewer for this specification ([change control](./process/change-control.md) §5).
- The full merge gate of the [Definitions of Done](./process/definitions-of-done.md).

## Deferred

- Hot module replacement policy — an adapter built on `replace` and `restart` (the kit's development reload, B7, uses `reconcile`, `replace` and handoff; no policy for production).

The loader and the chaining of audit records, deferred before, are now
companion phases (B4).

## Explicitly not planned

- A sandbox for untrusted plugin code in the core — nor in `@bridger/remote`, which moves code out of process but provides no isolation of its own ([ADR-RM-006](../remote/decisions/006-isolation-comes-from-the-host.md)); untrusted code runs out of process behind a proxy plugin, isolated, if at all, by the host mechanism and the consumer's deployment.
- Automatic retry of failed plugins.
- Compensation of external effects on removal.
- Any claim of validation, qualification or regulatory compliance for the library itself.
