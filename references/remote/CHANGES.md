# Change history

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-CHG                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Change Record                                                |
> | Change History | 0.1 (2026-11-22): Older Change History lines moved out of the Document Control tables (improvement report 07, R6) |

---

A Document Control cell keeps its newest revisions; older lines are moved here, newest first, under the Document ID of
the document they belong to (`python3 references/core/scripts/split-history.py`). Nothing is rewritten: a line moves whole.

## BRIDGER-RM-00

`remote/README.md`

- 0.5 (2026-11-08): CCR-RM-003 extended: epoch back in offered call-log entries (core CCR-BR-027), BEH-RM-002 provides the contract itself (core CCR-BR-028), epoch open question closed (CCR-RM-003)
- 0.4 (2026-11-08): round 2: recheck items 20, 23 and 25 — file 09, ADR-RM-010, core seams of CCR-BR-024–026, open questions refreshed, register row CCR-RM-003 (CCR-RM-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08; register row added (CCR-RM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                

## BRIDGER-RM-RISK

`remote/risks.md`

- 0.3 (2026-11-08): round 2: recheck items 20, 23 and 25 — RSK-RM-001 controls and residual with the `DedupeStore`; RSK-RM-013 controlled by attributed unmount (core G57 closed); RSK-RM-014 (residency labels) and RSK-RM-015 (browser frames) added (CCR-RM-003)
- 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — RSK-RM-001 residual raised for per-call transports and controls extended to callbacks; RSK-RM-012 (dependents' finalizers after a session loss) and RSK-RM-013 (revocation not linked in the core audit trail) added (R3-05, R3-06, R3-09, R3-12) (CCR-RM-002)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                

## BRIDGER-RM-BEH-01

`remote/behaviors/01-remote-proxy-plugin.md`

- 0.4 (2026-11-08): round 2: recheck item 20 and CORE-DECISIONS-2 — `RemoteOptions.methodTimeouts` (shortens the contract descriptor timeouts) and `RemoteOptions.residency`; `WireClaims` gains `org` and `correlationId`, `onBehalfOf` is `PrincipalRef.encode`; refusal reasons "placement-refused" and "budget-exceeded" (CCR-RM-003)
- 0.3 (2026-11-08): `meta` stamping points to the loader's `Loader.stampRemote` (BEH-LD-039) (CCR-RM-002); resolutions of the agent review of 2026-11-08 — default `accepts` per core BEH-BR-232; missing options; `hello` carries the epoch; `call` carries `remaining`, `version`, wire annotations and claims; `welcome` carries `maxInFlight`; per-call refusals in `WireExit` (R3-04, R3-07, R3-10, R3-15) (CCR-RM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                

## BRIDGER-RM-BEH-02

`remote/behaviors/02-sessions-and-epochs.md`

- 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-RM-014: after a failed revocation unmount the child is removed by the parent's own stop when it resumes, or by shutdown, not when the session's sub-scope closes, which removes nothing then (R1; core CCR-BR-038) (CCR-RM-009)
- 0.8 (2026-11-11): BEH-RM-014: a failed revocation unmount (now possibly `WouldDeadlock`, core CCR-BR-037) is logged and leaves the boundary refusal in force; the sub-scope close removes the child (SPEC-AUDIT-05 follow-up) (CCR-RM-008)
- 0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — BEH-RM-009: the accepted range is `"^" + V`, inside the `ContractRange` grammar, and for major 0 admits no higher minor (C9) (CCR-RM-007)
- 0.6 (2026-11-09): Specification audit of 2026-11-09 (M-06): BEH-RM-014 reads the loader's `RevokedDigests` view, so signer and statement revocations refuse at the boundary at once, and the limit without the view is stated; BEH-RM-013 session end reason "mount-refused" (U-11); BEH-RM-014 consults the `RevokedDigests` view live at each session attempt and on each change, and never copies its answers into the permanent revocation list; BEH-RM-013 a link ended "revoked" by the view resumes when the view stops refusing it (independent review) (CCR-RM-004)
- 0.5 (2026-11-08): Round-2 agent review (R4 F23, F28) — the wire version is negotiated per session (`hello` lists N and N−1, `welcome` picks the highest common), which is writers last without a fleet condition; `RemoteOptions.wireVersions`; the revocation entry carries `epoch` when a session was open (stale parenthesis removed) (CCR-RM-003)
- 0.4 (2026-11-08): round 2: recheck item 25 — a revocation unmounts the session child with `Plugin.Runtime.unmount` and `requestedBy` (core G57 closed), offers a "revocation" entry through `Host.offerCallEntry` (G43 closed), and cites `RefusalList` for starts (G60 closed); recheck item 22 — the `wire` version follows the N/N−1, writers-last rule (CCR-RM-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — accepted range bounded by core BEH-BR-232; `hello` carries the epoch and `welcome` must echo it; revocations held for the life of `Remote.layer`, re-read from the revocation source at start, and recorded in the companion's own status (R3-04, R3-07, R3-08, R3-12, R3-13) (CCR-RM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                

## BRIDGER-RM-BEH-05

`remote/behaviors/05-guest-serve.md`

- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — host-side serving end `Remote.serve` (BEH-RM-039) for hosts that serve a local provider; epoch echo and `maxInFlight` in `welcome`; per-call transports keep no table across invocations; `CallbackDenied`; decoded wire annotations in `GuestContext`; endpoints may be multiplexed (R3-01, R3-03, R3-04, R3-05, R3-10, R3-11, R3-15) (CCR-RM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                

## BRIDGER-RM-BEH-06

`remote/behaviors/06-capability-tokens-and-call-log.md`

- 0.4 (2026-11-08): round 2: recheck items 23 and 25, CORE-DECISIONS-2 — `TokenClaims.org`; `correlationId` from `CurrentCorrelation` and set for callbacks through `CallerContext.serve` (G58 closed); callbacks carry `HostLink.reference`; crossings, refusals and revocations offered with core entry kinds through `Host.offerCallEntry`, callbacks with `onFailure` "refuse" (G43 closed) (CCR-RM-003)
- 0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — token labels replaced by core-encoded wire annotations; callbacks deduplicated per parent call (INV-RM-010); the core `CapabilityPolicy` consulted only by the host's own capture, actor admission in a companion `CallbackAdmission`, error renamed `CallbackDenied`; callbacks run inside `CallerContext.serve`; annotations reach records only through core flows (R3-06, R3-10, R3-11) (CCR-RM-002)
- 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                

## BRIDGER-RM-BEH-08

`remote/behaviors/08-test-transport-and-acceptance.md`

- 0.5 (2026-11-09): Specification audit of 2026-11-09: check 34 amended (`org` on the wire only when disclosed); checks 45–48 added — disclosure, mount refusal, `Transport.fromBundle`, the loader's `RevokedDigests` view and the link manifest; check 48 covers the call-log `disclosed` names; check 49 local contracts (BEH-RM-007) (core CCR-BR-033); check 48: view answers are consulted live and never kept (independent review) (CCR-RM-004)
- 0.4 (2026-11-08): Round-2 agent review (R4 F14, F15, F17, F19, F20, F23, F28) — checks 36, 38, 39 restated; checks 43 (wire negotiation, revocation epoch) and 44 (endpoint residency) added (CCR-RM-003)
- 0.3 (2026-11-08): round 2: recheck items 20, 23 and 25 — checks 34–42 (CCR-RM-003)
- 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — re-run checks assert the core records plus the session child's mount records; check 1 exempted under partition; checks 27–33 for the epoch echo, callback deduplication, per-call sessions, `Remote.serve`, the multiplexer, persistent revocation and wire annotations (R3-01, R3-04, R3-05, R3-06, R3-07, R3-09, R3-10, R3-13, R3-17) (CCR-RM-002)
- 0.1 (2026-11-08): Initial draft (CCR-RM-001)                
