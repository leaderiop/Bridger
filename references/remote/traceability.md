# Traceability — Remote Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-TRACE                                             |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Traceability Matrix                                          |
> | Change History | 0.4 (2026-11-08): Round-2 agent review — REQ-RM-043, 044; REQ-RM-036, 038, 039 restated; INV-RM-011 row extended (CCR-RM-003)<br>0.3 (2026-11-08): round 2: recheck items 20, 23 and 25 — BEH-RM-065–071, INV-RM-011, ADR-RM-010, REQ-RM-034–042, RSK-RM-014 and 015 (CCR-RM-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — BEH-RM-024, 039, 048, 056; INV-RM-010; REQ-RM-027–033; RSK-RM-012, 013 (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

Chain: core URS → `BEH-RM` → `INV-RM` → `ADR-RM` → `REQ-RM` → `RSK-RM`.
Every source and test path is *(Planned)*; no scenario has run.

## §1 Behaviour files

| File | Identifiers | Invariants | Decisions | Planned source |
| ---- | ----------- | ---------- | --------- | -------------- |
| [01](behaviors/01-remote-proxy-plugin.md) | BEH-RM-001–006 | INV-RM-001, 002, 006 | ADR-RM-001, 004 | `packages/remote/src/Remote.ts`, `Link.ts` *(Planned)* |
| [02](behaviors/02-sessions-and-epochs.md) | BEH-RM-009–014 | INV-RM-002, 004 | ADR-RM-002, 003, 004, 005 | `packages/remote/src/Session.ts`, `Handshake.ts` *(Planned)* |
| [03](behaviors/03-remote-calls.md) | BEH-RM-017–024 | INV-RM-002, 003, 006, 007, 008 | ADR-RM-001, 002, 004, 008 | `packages/remote/src/Call.ts`, `Face.ts` *(Planned)* |
| [04](behaviors/04-heartbeat-and-partition.md) | BEH-RM-025–030 | INV-RM-001, 002, 005 | ADR-RM-002, 004 | `packages/remote/src/Heartbeat.ts`, `Link.ts` *(Planned)* |
| [05](behaviors/05-guest-serve.md) | BEH-RM-033–039 | INV-RM-004, 007, 009 | ADR-RM-001, 003, 005, 006, 007, 008 | `packages/remote/src/Guest.ts` *(Planned)* |
| [06](behaviors/06-capability-tokens-and-call-log.md) | BEH-RM-041–048 | INV-RM-003, 004, 007, 010 | ADR-RM-003, 004, 005 | `packages/remote/src/Token.ts`, `Callback.ts` *(Planned)* |
| [07](behaviors/07-transports-and-adapters.md) | BEH-RM-049–056 | INV-RM-002, 004, 009 | ADR-RM-003, 006, 007, 009 | `packages/remote/src/Transport.ts`; `packages/worker/`, `packages/worker-loader/`, `packages/workerd/` *(Planned)* |
| [08](behaviors/08-test-transport-and-acceptance.md) | BEH-RM-057–061 | INV-RM-001, 006 | ADR-RM-001, 009 | `packages/remote/src/testing/TestTransport.ts` *(Planned)* |
| [09](behaviors/09-placement-budgets-and-adapters.md) | BEH-RM-065–071 | INV-RM-007, 009, 011 | ADR-RM-005, 006, 007, 010 | `packages/remote/src/Placement.ts`, `Budget.ts`, `Dedupe.ts`, `PostMessage.ts`; `packages/workers-for-platforms/` *(Planned)* |

## §2 Invariants

| Invariant | Behaviours | Verified by |
| --------- | ---------- | ----------- |
| [INV-RM-001](invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition) | BEH-RM-001, 002, 027, 060 | REQ-RM-001, 003, 025 |
| [INV-RM-002](invariants.md#inv-rm-002-no-lifecycle-step-waits-on-a-peer) | BEH-RM-003, 005, 012, 028 | REQ-RM-002, 014, 025 |
| [INV-RM-003](invariants.md#inv-rm-003-every-remote-call-is-bounded-by-a-timeout) | BEH-RM-017, 018, 045 | REQ-RM-008, 009, 022 |
| [INV-RM-004](invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary) | BEH-RM-010, 011, 035, 044 | REQ-RM-005, 006, 007, 026 |
| [INV-RM-005](invariants.md#inv-rm-005-a-partition-withdraws-the-provider-and-fails-no-dependent) | BEH-RM-025, 026, 027 | REQ-RM-013 |
| [INV-RM-006](invariants.md#inv-rm-006-remote-adds-no-second-admission-path) | BEH-RM-019, 022 | REQ-RM-011, 025 |
| [INV-RM-007](invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token) | BEH-RM-024, 036, 041, 043, 044, 046 | REQ-RM-020, 021, 033 |
| [INV-RM-008](invariants.md#inv-rm-008-an-unknown-outcome-is-reported-as-unknown-and-never-retried) | BEH-RM-020, 021 | REQ-RM-012 |
| [INV-RM-009](invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest) | BEH-RM-034, 035, 039, 051, 067 | REQ-RM-019, 026, 029, 030, 036 |
| [INV-RM-010](invariants.md#inv-rm-010-within-one-parent-call-a-callback-executes-at-most-once) | BEH-RM-043, 048 | REQ-RM-028 |
| [INV-RM-011](invariants.md#inv-rm-011-no-call-crosses-a-transport-that-does-not-offer-its-residency-label) | BEH-RM-056, 068, 069 | REQ-RM-037, 038, 044 |

## §3 Decisions

| Decision | Status |
| -------- | ------ |
| [ADR-RM-001](decisions/001-remote-plugin-is-a-local-proxy.md) — A remote plugin is a local proxy plugin | Proposed |
| [ADR-RM-002](decisions/002-partition-withdraws-the-session-child.md) — A partition withdraws the session child | Proposed |
| [ADR-RM-003](decisions/003-sessions-carry-epochs.md) — Every session carries an epoch, compared by equality | Proposed |
| [ADR-RM-004](decisions/004-bounded-calls-and-peer-free-lifecycle.md) — Remote calls always time out; lifecycle steps never wait on a peer | Proposed |
| [ADR-RM-005](decisions/005-per-call-capability-tokens.md) — Per-call capability tokens; guests reach granted contracts only | Proposed |
| [ADR-RM-006](decisions/006-isolation-comes-from-the-host.md) — Isolation comes from the host process or isolate, never from Bridger | Proposed |
| [ADR-RM-007](decisions/007-stateless-guests.md) — Guests are stateless per invocation | Proposed |
| [ADR-RM-008](decisions/008-unknown-outcomes-are-surfaced-never-retried.md) — Unknown outcomes are surfaced, never retried | Proposed |
| [ADR-RM-009](decisions/009-deterministic-test-transport.md) — A deterministic test transport, and the core suites re-run through proxies | Proposed |
| [ADR-RM-010](decisions/010-placement-labels-compared-at-the-boundary.md) — Placement labels are compared at the process boundary, as strings | Proposed |

## §4 Acceptance scenarios

One scenario per required acceptance check of
[BEH-RM-061](behaviors/08-test-transport-and-acceptance.md), in the same
order. Planned location `packages/remote/test/` *(Planned)*. None has run.

| Scenario | Check | Behaviours | Status |
| --- | --- | --- | --- |
| REQ-RM-001 | 1. Remote.define returns a PluginDefinition and opens nothing | [BEH-RM-001](behaviors/01-remote-proxy-plugin.md) | Not run |
| REQ-RM-002 | 2. Link active with peer unreachable; dependents waiting | [BEH-RM-003](behaviors/01-remote-proxy-plugin.md) | Not run |
| REQ-RM-003 | 3. Handshake mounts one session child, audited system-start | [BEH-RM-002](behaviors/01-remote-proxy-plugin.md), [BEH-RM-009](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-004 | 4. Version outside accepts refused with IncompatibleContract | [BEH-RM-009](behaviors/02-sessions-and-epochs.md), [BEH-RM-033](behaviors/05-guest-serve.md) | Not run |
| REQ-RM-005 | 5. Fresh epoch per session, never reused | [BEH-RM-010](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-006 | 6. Old-epoch call refused by guest with StaleEpoch | [BEH-RM-011](behaviors/02-sessions-and-epochs.md), [BEH-RM-035](behaviors/05-guest-serve.md) | Not run |
| REQ-RM-007 | 7. Late old-epoch result completes no call | [BEH-RM-011](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-008 | 8. Every call ends by its deadline; forever refused | [BEH-RM-017](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-009 | 9. Deadline expiry yields RemoteTimeout and cancel | [BEH-RM-018](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-010 | 10. Caller interruption sends cancel without waiting | [BEH-RM-018](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-011 | 11. Face method after session end fails with RemoteUnavailable | [BEH-RM-019](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-012 | 12. Session loss fails in-flight calls first; no re-send | [BEH-RM-020](behaviors/03-remote-calls.md), [BEH-RM-021](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-013 | 13. Missed heartbeats withdraw; dependents waiting; heal restores | [BEH-RM-025](behaviors/04-heartbeat-and-partition.md), [BEH-RM-026](behaviors/04-heartbeat-and-partition.md), [BEH-RM-027](behaviors/04-heartbeat-and-partition.md), [BEH-RM-029](behaviors/04-heartbeat-and-partition.md) | Not run |
| REQ-RM-014 | 14. Withdrawal and lifecycle steps complete with peer partitioned | [BEH-RM-005](behaviors/01-remote-proxy-plugin.md), [BEH-RM-028](behaviors/04-heartbeat-and-partition.md) | Not run |
| REQ-RM-015 | 15. DuplicateProvider at remount ends in link runtime failure | [BEH-RM-002](behaviors/01-remote-proxy-plugin.md) | Not run |
| REQ-RM-016 | 16. Hold mode keeps child and fails fast | [BEH-RM-030](behaviors/04-heartbeat-and-partition.md) | Not run |
| REQ-RM-017 | 17. stableFor and flap warning | [BEH-RM-029](behaviors/04-heartbeat-and-partition.md) | Not run |
| REQ-RM-018 | 18. maxInFlight refuses with RemoteBusy on both ends | [BEH-RM-023](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-019 | 19. Duplicated call frames run once per session | [BEH-RM-035](behaviors/05-guest-serve.md), [BEH-RM-051](behaviors/07-transports-and-adapters.md) | Not run |
| REQ-RM-020 | 20. Granted clients only; ungranted fails with CallbackDenied | [BEH-RM-036](behaviors/05-guest-serve.md) | Not run |
| REQ-RM-021 | 21. Callback admission order and refusals, logged | [BEH-RM-043](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-044](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-046](behaviors/06-capability-tokens-and-call-log.md) | Not run |
| REQ-RM-022 | 22. Callback under token actor with onBehalfOf, bounded by parent | [BEH-RM-045](behaviors/06-capability-tokens-and-call-log.md) | Not run |
| REQ-RM-023 | 23. Revocation refuses at once; removal separate | [BEH-RM-014](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-024 | 24. No token reference in logs, status, events or CallLog | [BEH-RM-047](behaviors/06-capability-tokens-and-call-log.md) | Not run |
| REQ-RM-025 | 25. Core checks re-run through proxies | [BEH-RM-060](behaviors/08-test-transport-and-acceptance.md), [BEH-RM-022](behaviors/03-remote-calls.md) | Not run |
| REQ-RM-026 | 26. Transport conformance under faults | [BEH-RM-051](behaviors/07-transports-and-adapters.md), [BEH-RM-052](behaviors/07-transports-and-adapters.md), [BEH-RM-057](behaviors/08-test-transport-and-acceptance.md), [BEH-RM-058](behaviors/08-test-transport-and-acceptance.md) | Not run |
| REQ-RM-027 | 27. hello carries the epoch; mismatched welcome refused | [BEH-RM-009](behaviors/02-sessions-and-epochs.md), [BEH-RM-010](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-028 | 28. Duplicated callbacks run once per parent call | [BEH-RM-048](behaviors/06-capability-tokens-and-call-log.md) | Not run |
| REQ-RM-029 | 29. Per-call transport: guest reset ends the session; new handshake | [BEH-RM-025](behaviors/04-heartbeat-and-partition.md), [BEH-RM-034](behaviors/05-guest-serve.md) | Not run |
| REQ-RM-030 | 30. Remote.serve leases per call, refuses unserved methods and absent providers | [BEH-RM-039](behaviors/05-guest-serve.md) | Not run |
| REQ-RM-031 | 31. Multiplexed endpoints keep separate sessions; physical close ends all | [BEH-RM-056](behaviors/07-transports-and-adapters.md) | Not run |
| REQ-RM-032 | 32. Revocation survives restart, retry and replace; source read at start | [BEH-RM-014](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-033 | 33. Wire annotations cross without the deadline and combine on receipt | [BEH-RM-024](behaviors/03-remote-calls.md), [BEH-RM-041](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-045](behaviors/06-capability-tokens-and-call-log.md) | Not run |
| REQ-RM-034 | 34. With `OrgOf`, tokens and claims carry `org`; never in status | [BEH-RM-065](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-035 | 35. A budget refusal fails the call before any frame; `charge` uses reported measures only | [BEH-RM-066](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-036 | 36. A duplicated per-call `call` runs once with a shared `DedupeStore`, the copy answered with the result or `InProgress`; refused copies hold no claim; retention residual; no store and no statement refuses to start | [BEH-RM-067](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-037 | 37. A residency label not offered by the transport fails the link's build with `PlacementRefused` | [BEH-RM-068](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-038 | 38. The residency label crosses as a wire annotation and a serving end refuses a mismatch before any lease; the host refuses a fiber's own label before sending | [BEH-RM-069](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-039 | 39. `Transport.postMessage` origin checks, "opaque" mode source and nonce checks, one port per connection, new epoch per frame load | [BEH-RM-070](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-040 | 40. Workers for Platforms adapter limits, outbound route and conformance with a `DedupeStore` | [BEH-RM-071](behaviors/09-placement-budgets-and-adapters.md) | Not run |
| REQ-RM-041 | 41. Revocation records `unmount-requested` with `requestedBy`; `RefusalList` keeps the link disabled; one revocation entry | [BEH-RM-014](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-042 | 42. Core entry kinds offered; callbacks refused when unlogged; correlation and host link in served calls; descriptor timeouts | [BEH-RM-017](behaviors/03-remote-calls.md), [BEH-RM-039](behaviors/05-guest-serve.md), [BEH-RM-045](behaviors/06-capability-tokens-and-call-log.md), [BEH-RM-046](behaviors/06-capability-tokens-and-call-log.md) | Not run |
| REQ-RM-043 | 43. The wire version is negotiated per session; revocation entries carry the epoch | [BEH-RM-009](behaviors/02-sessions-and-epochs.md), [BEH-RM-014](behaviors/02-sessions-and-epochs.md) | Not run |
| REQ-RM-044 | 44. A multiplexed endpoint carries the route's residency labels | [BEH-RM-056](behaviors/07-transports-and-adapters.md), [BEH-RM-068](behaviors/09-placement-budgets-and-adapters.md) | Not run |

## §5 Risks

| Risk | Hazard | Controls | Verified by |
| --- | --- | --- | --- |
| [RSK-RM-001](risks.md#rsk-rm-001) | Remote side effect repeated or misread | BEH-RM-020, 021, 034, 035, 048, 051, 067, INV-RM-008, INV-RM-009, INV-RM-010 | REQ-RM-012, 019, 028, 029, 036 |
| [RSK-RM-002](risks.md#rsk-rm-002) | Stale session acts after a partition heals | BEH-RM-010, 011, 035, 044, INV-RM-004 | REQ-RM-005, 006, 007 |
| [RSK-RM-003](risks.md#rsk-rm-003) | Peer holds a lifecycle step | BEH-RM-003, 005, 012, 017, 028, 060, INV-RM-002, INV-RM-003 | REQ-RM-002, 008, 014, 025 |
| [RSK-RM-004](risks.md#rsk-rm-004) | Guest reaches more than it was granted | BEH-RM-014, 036, 043, 044, 046, INV-RM-007 | REQ-RM-020, 021, 023 |
| [RSK-RM-005](risks.md#rsk-rm-005) | Out-of-process mistaken for isolated | BEH-RM-001, 050, 052, 053 | Documentation review |
| [RSK-RM-006](risks.md#rsk-rm-006) | Escape from the guest's runtime | BEH-RM-052, 054, 055 | Consumer's own evidence |
| [RSK-RM-007](risks.md#rsk-rm-007) | Guest state lost on eviction or limits | BEH-RM-020, 034, 054 | REQ-RM-026 |
| [RSK-RM-008](risks.md#rsk-rm-008) | RPC module churn breaks the wire | BEH-RM-004, 009 | REQ-RM-004 |
| [RSK-RM-009](risks.md#rsk-rm-009) | Token leaked or replayed | BEH-RM-041, 042, 044, 047 | REQ-RM-021, 024 |
| [RSK-RM-010](risks.md#rsk-rm-010) | Flapping link churns dependents | BEH-RM-012, 025, 029, 030 | REQ-RM-016, 017 |
| [RSK-RM-011](risks.md#rsk-rm-011) | Clock skew between host and guest | BEH-RM-017, 044 | REQ-RM-008, 021 |
| [RSK-RM-012](risks.md#rsk-rm-012) | Dependents' finalizers lose the provider on a session loss | BEH-RM-020, 026, 030, 060, INV-RM-005 | REQ-RM-025 (exemption listed) |
| [RSK-RM-013](risks.md#rsk-rm-013) | Revocation-caused withdrawals not attributed in the core audit trail | BEH-RM-014, core BEH-BR-126 | REQ-RM-023, 041 |
| [RSK-RM-014](risks.md#rsk-rm-014) | Residency labels mistaken for a residency guarantee | BEH-RM-068, 069, INV-RM-011 | REQ-RM-037, 038 |
| [RSK-RM-015](risks.md#rsk-rm-015) | A browser frame reached by, or reaching, the wrong party | BEH-RM-070 | REQ-RM-039 |

---

_Previous: [Risks](./risks.md)_
