# Roadmap

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ROADMAP                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Roadmap                                                      |
> | Change History | 0.3 (2026-11-10): Deferred: non-integer numbers removed (specified since CCR-GX-002, BEH-GX-018); seal verification beyond `maxEntries` awaits an incremental verifier in `@bridger/audit-chain` (P19, low) (CCR-GX-005)<br>0.2 (2026-11-09): G1 adds the sink's status and `trailGate` (22); G2 seals through `@bridger/audit-chain` (21; 07 withdrawn); G0 reproduces the vectors of file 03 (F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Current state

Specification only, in Draft (`implementation: absent`). No `packages/gxp`
exists and no prototype of the companion exists. The core change the
companion depends on, CCR-BR-014, is specified in `references/core` and
prototyped in `prototypes/host-core`; core itself is not implemented either.
Core's roadmap places the companion in its phase P6, which requires this
specification to be approved before any companion code is written.

## Implementation order

The companion's phases (G) start once core's phases P1–P3 exist — the
lifecycle, the runtime and configuration, and the GxP hooks (attribution,
`AuditSink`, `OperationGate`, `ConfigFingerprinter`, `Host.controls`) — and
phases that drive core through `TestHost` also need core's P5. Each phase ends
with its acceptance checks of [file 20](./behaviors/20-required-acceptance-checks.md) passing and gate
D1 passing with `--strict` ([Definitions of Done](./process/definitions-of-done.md)). The order is
by risk: the trail first, because every later control relies on it.

| Phase | Content | Behaviour files | Needs from core | Exit criterion |
| ----- | ------- | --------------- | --------------- | -------------- |
| G0 | Package skeleton, `GxpLayer.make` types, canonical form and digests with the published test vectors, testing entry point with marked fixtures | [01](./behaviors/01-companion-boundary.md), [19](./behaviors/19-testing-entry-point.md) | P1–P3 | Vectors of files 03, 09 and 13 reproduced; a missing port is a compile error |
| G1 | Trail store port, trail sink, conformance suite, the sink's status and `trailGate` | [02](./behaviors/02-trail-store-port.md), [03](./behaviors/03-trail-sink.md), [04](./behaviors/04-conformance-suite.md), [22](./behaviors/22-trail-status-and-gate.md) | P3, P5 (`TestHost`, `Fault`) | Suite passes on `memoryTrailStore` and fails, with the expected case numbers, on every `brokenTrailStore` variant |
| G2 | Checks on read, high-water marks and anchors, optional sealing through `@bridger/audit-chain` | [05](./behaviors/05-checks-on-read.md), [06](./behaviors/06-high-water-marks-and-anchors.md), [21](./behaviors/21-sealing-through-audit-chain.md) (07 withdrawn) | P3 (`Host.controls`, `CloseReport.auditLastSeq`); `@bridger/audit-chain` for sealing | Every finding kind produced by a constructed trail; memory bound held on a long trail |
| G3 | Approval policy, tickets, signature capture port, linking, approval gate | [08](./behaviors/08-approval-policy.md)–[12](./behaviors/12-approval-gate.md) | P3 (gate, `definition` on records), P4 (`reconcile`) | Every refusal reason produced; replay, transfer and copied-signature cases refused |
| G4 | Configuration fingerprints and keys | [13](./behaviors/13-config-fingerprints.md), [14](./behaviors/14-fingerprint-keys.md) | P3 (step 4a, `ConfigFingerprinter`) | Value-bound tickets allow only the approved value; rotation forces re-issue |
| G5 | Installation checks, OQ evidence, evidence pack | [15](./behaviors/15-installation-checks.md), [16](./behaviors/16-oq-evidence.md), [17](./behaviors/17-evidence-pack.md) | P3, P5 | Evidence self-test on the known-bad corpus; two runs give the same pack digest |
| G6 | Archive and export | [18](./behaviors/18-archive-and-export.md) | — | Export then `readArchive` reproduces the check report byte for byte |

## Blocking first release

A first release of `@bridger/gxp` is blocked until all of the following hold:

1. **Independent review.** This specification has been reviewed by a
   competent reviewer other than its author, and the Reviewed by rows say so
   ([change control](./process/change-control.md) §5). Agent reviews do not count.
2. A released core version contains CCR-BR-014, and the compatibility matrix
   names it ([core interface map](./appendices/core-interface-map.md) §7).
3. Every acceptance check of file 20 passes against the packed package and
   the packed core, and the merge gate of PROC-GX-02 passes in full,
   including coverage (NFR-GX-003) and mutation score (NFR-GX-004).
4. Every test vector is reproduced by the implementation (gate row 10).
5. The evidence generator's self-test passes on its known-bad corpus.
6. `implementation:` is moved to `partial`, and no document or decision is
   marked Effective or Accepted without the code and test that demonstrate it.

## Deferred

- A shared verification engine for both trees, replacing the copied checker
  ([ADR-GX-028](./decisions/028-checker-copy-and-adapt.md)) — a later CCR on both sides.
- Reference adapters for specific databases or object stores, as separate
  packages with their own conformance evidence; none ships with the companion.
- Seal verification of a host with more entries than `maxEntries`
  (BEH-GX-171): it needs an incremental verifier from `@bridger/audit-chain`,
  whose `verifyChain` takes its whole input at once; until then such a run
  fails with `CheckCapacityExceeded`.
- Signature schemes beyond the port (for example detached cryptographic
  signatures over binding digests) — the port's shape allows them; no
  implementation is planned.

## Explicitly not planned

- A trail review, search or reporting tool, and PQ — as for core
  ([ADR-BR-034](../core/decisions/034-gxp-companion-scope.md) non-claim 12).
- A production trail, anchor or ticket store, an identity system, or key
  management of any kind.
- Any statement that a system using the companion is compliant or validated,
  or that a stored trail cannot be changed ([ADR-GX-027](./decisions/027-claims-and-non-claims.md)).
