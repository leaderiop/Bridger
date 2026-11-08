# Roadmap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ROADMAP                                              |
> | Revision       | 0.15                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Planning Document — Informative                              |
> | Change History | 0.15 (2026-11-08): Core seams and companion phases B1–B7 (CCR-BR-017, CCR-BR-018, CCR-BR-019, CCR-BR-020, CCR-BR-021); loader and audit chaining moved out of "Deferred"; sandbox non-plan points to the remote companion (CCR-BR-021)<br>0.14 (2026-11-08): P6 row: the companion Draft in references/gxp/ is not present in this repository and must be restored or re-drafted before approval (gap G35); link turned into a plain-text citation (CCR-BR-016)<br>0.13 (2026-10-03): P6 row: companion specification drafted in references/gxp/ (Draft 0.1, CCR-GX-001), approval before code pending, prerequisite CCR-BR-014 done; non-plan wording without a restricted word (CCR-BR-015)<br>0.12 (2026-10-03): P6 row: prerequisite core change CCR-BR-014 specified and prototyped (CCR-BR-014)<br>0.11 (2026-10-03): P5 row: every settled cell (consistency pass) (CCR-BR-013)<br>0.10 (2026-10-03): P5 exit criterion met in the prototype (CCR-BR-012)<br>0.9 (2026-10-02): P5 prototyped (CCR-BR-011)<br>0.8 (2026-10-02): P4 prototyped (CCR-BR-010)<br>0.7 (2026-10-02): P2 prototyped (CCR-BR-009)<br>0.6 (2026-10-02): Stale G2–G4 exit criterion and blocker removed; review of CCR-BR-003..007, in two passes, noted (CCR-BR-008)<br>0.5 (2026-10-02): In-flight table prototyped (CCR-BR-007)<br>0.4 (2026-10-02): G11 resolved; P1 prototype extended (CCR-BR-006)<br>0.3 (2026-10-02): P3 prototype recorded (CCR-BR-005)<br>0.2 (2026-10-02): P1 prototype recorded (CCR-BR-004)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

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
| P6 | Companion `@bridger/gxp` specification and implementation. The companion specification was **drafted** as `references/gxp/` (Draft 0.1, CCR-GX-001), but that Draft is not present in this repository and must be restored or re-drafted before it can be reviewed ([URS](urs.md#7-known-gaps-and-open-items) gap G35); it is not approved and nothing is implemented. Prerequisite core change CCR-BR-014 (the `ConfigFingerprinter` port, `Host.controls` with the audit position, `CloseReport.auditLastSeq`, the presented definition on `requested` and `rejected` records) is done: specified and **prototyped** in `prototypes/host-core` (11 scenario tests; finding G34) | `references/gxp/` (missing; G35); core prerequisite in 02, 11, 12, 22–25 | Its Draft restored or re-drafted, then its own specification approved before code (pending) |

## Core seams and companion phases

The architecture review of 2026-11-08 ranked the missing pieces and ordered
them as steps B1–B7. Core receives only small seams (behaviours 26–34 and the
amendments of CCR-BR-020); everything else is a companion package with its
own specification tree. Every row below is **specified only**: no seam is
prototyped, no companion specification is approved, and nothing is
implemented. Core seams are prototyped in `prototypes/host-core` before code.

| Step | Scope | Specification | Exit criterion |
| ---- | ----- | ------------- | -------------- |
| B1 | Versioned contracts (`Contract.make`, ranges, registration checks; CCR-BR-017), the sub-scope child mount and the `HeldPlugins` export (CCR-BR-020); companion `@bridger/remote` with its capability tokens from B3 — **specified** | core 14, 26; [references/remote/](../remote/README.md) (Draft 0.1, CCR-RM-001) | Property test of INV-BR-031 over random registrations; check 89; then the remote companion approved before code, and core acceptance checks 1, 2, 3, 4, 10, 12, 18 and 23 re-run through a proxy over `TestTransport`, with partition variants (BEH-RM-060) |
| B2 | Policy and decision seams: plugin principal, mandatory interceptions, `allowChildren`, `AccessPolicy` (28); `CapabilityPolicy`, grants, `CallLog`, `CurrentCall` (29); annotations (30) — CCR-BR-018; hook points and selector (31), generic gate, drafts and `Host.plan` (32), realm families, ephemeral realms, `retireRealm`, `Actor.narrow` (33), state handoff (34) — CCR-BR-019; `Plugin.Any` (CCR-BR-020, type-only, may land here) — **specified** | core 28–34, 01 | Checks 67–88 and 90 pass on `TestHost`, prototyped in `prototypes/host-core` before code |
| B3 | Per-call capability tokens and egress through a granted contract key, over `CurrentCall` — **specified** in the remote companion | [references/remote/](../remote/README.md) behaviour 06 | The remote companion's token checks pass |
| B4 | Manifest and lazy activation (`PluginManifest`, `consentDiff`, `Plugin.lazy`, `dormant`, triggers; CCR-BR-017); `@bridger/loader` (digest over manifest, SBOM and files; verify before evaluate; N-of-M signature policy; signed revocation sets and a kill switch through `reconcile`; catalog of signed manifests over `Plugin.lazy`); `@bridger/audit-chain` (hash-chain sink, external anchors, `verifyChain`); `@bridger/entitlement` (`Entitlement` port, gate piece, `Plugin.Runtime.entitled` — core seam CCR-BR-020 — and `Budget` reservations) — **specified** | core 27, 10; [references/loader/](../loader/README.md) (CCR-LD-001), [references/audit-chain/](../audit-chain/README.md) (CCR-AC-001), [references/entitlement/](../entitlement/README.md) (CCR-EN-001) | Every cell of the dormant legality row passes and a counting `load` shows no load before a trigger; check 91; each companion approved before code, then its acceptance checks pass (BEH-LD-048 1–16, BEH-AC-024 1–12, the entitlement checks) |
| B5 | Event delivery `@bridger/durable-bus` (the name is intent, not a claim; ADR-DB-007) on a SQLite adapter, and `@bridger/federation` (manifests, export/import, skew handshake) — **specified** | [references/durable-bus/](../durable-bus/README.md) (CCR-DB-001), [references/federation/](../federation/README.md) (CCR-FD-001); depends on core 26, 27, 30, remote (B1) and the loader's signature policy (B4) | Each companion approved before code; adapter conformance suite (BEH-DB-056), REQ-DB-001–027 and REQ-FD-001–024 including the N−1 replay check (REQ-FD-024) |
| B6 | Agent-facing companions `@bridger/command`, `@bridger/mcp`, `@bridger/agent` (with agent testing) — **specified** | [references/command/](../command/README.md) (CCR-CM-001), [references/mcp/](../mcp/README.md) (CCR-MC-001), [references/agent/](../agent/README.md) (CCR-AG-001); core prerequisites 28–33 | Each companion approved before code; REQ-CM, REQ-MC and REQ-AG 001–012 pass on `TestHost`; the MCP server checked against an external MCP client |
| B7 | `@bridger/kit`: `definePlugin` facade over `Plugin.Any`, `PluginTest`/`it.plugin`, conformance kits, the `bridger` CLI, Promise SDK generator, devtools inspector, error catalog; persona [guides](../../docs/guides/README.md) — **specified** | [references/kit/](../kit/README.md) (CCR-KT-001); depends on core 21, 26, 27, 32, 34, remote and loader | The kit approved before code; REQ-KT-001–024 pass; cast-free authoring of the prototype's plugins |

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
