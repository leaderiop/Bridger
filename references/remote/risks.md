# Risk Assessment — Remote Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-RISK                                              |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Risk Assessment                                              |
> | Change History | 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07, PL8): RSK-RM-013's residual says what removes the child after each failed revocation unmount (CCR-RM-010)<br>0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06, PL8): RSK-RM-013's residual names the failed revocation unmount (`WouldDeadlock`, `HostClosed`, `UnknownPlugin`), which leaves no `unmount-requested` record (CCR-RM-009)<br>0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, M15): RSK-RM-017 added — a callback whose host service ran is reported to the guest as refused when its call-log entry cannot be recorded (CCR-RM-006)<br>0.5 (2026-11-09): Specification audit of 2026-11-09 (F-07): RSK-RM-016 added — identity disclosed to a peer without a recorded decision; RSK-RM-016 controls gain the call-log `disclosed` names and the residual is restated now that core carries them (core CCR-BR-033) (CCR-RM-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F17, F18, F19) — RSK-RM-001 residual for copies past the `DedupeStore` retention; RSK-RM-015 controls and residual for the "opaque" frame mode and host-realm scripts (CCR-RM-003)<br>0.3 (2026-11-08): round 2: recheck items 20, 23 and 25 — RSK-RM-001 controls and residual with the `DedupeStore`; RSK-RM-013 controlled by attributed unmount (core G57 closed); RSK-RM-014 (residency labels) and RSK-RM-015 (browser frames) added (CCR-RM-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — RSK-RM-001 residual raised for per-call transports and controls extended to callbacks; RSK-RM-012 (dependents' finalizers after a session loss) and RSK-RM-013 (revocation not linked in the core audit trail) added (R3-05, R3-06, R3-09, R3-12) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

Hazards that `@bridger/remote` could introduce into a consumer's system,
scored with the method and anchors of the core risk assessment
([core §2](../core/gxp/03-risk-assessment.md#2-scoring)): Severity,
Probability and Detectability 1–3, risk class = S × P, priority from class
and D. Controls cite this companion's behaviours and invariants. Nothing
here is verified; every control is specified, not implemented
([ADR-BR-036](../core/decisions/036-prospective-specification.md)). The
integration of these risks into the core register is proposed in CCR-RM-001.

<a id="rsk-rm-001"></a>
### RSK-RM-001: Remote side effect repeated or misread

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A call whose reply is lost is retried, or its failure read as "did not happen", and the guest's side effect runs twice or is assumed absent. |
| Initial scoring | S 3 · P 3 · D 3 → class **High** (9) · priority **High** (9) |
| Controls | Outcome on every error (BEH-RM-020); session loss fails calls as `unknown` (BEH-RM-021); no re-send (INV-RM-008); per-session deduplication (BEH-RM-035, INV-RM-009); callback deduplication per parent call (BEH-RM-048, INV-RM-010); matching by call ID (BEH-RM-051); a `DedupeStore` required on per-call transports, or idempotent handlers stated explicitly (BEH-RM-034, BEH-RM-067). |
| Residual scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) on `liveness: "per-call"` transports started with "idempotent-handlers"; S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) on per-call transports with a `DedupeStore`; S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) elsewhere |
| Residual risk and acceptability | A caller that ignores `outcome: "unknown"` and retries without an idempotency key — contrary to the documented contract. On per-call transports a duplicated invocation runs a handler again (no guest table survives an invocation); acceptable only with idempotent handlers, which is the consumer's obligation. With a `DedupeStore`, a copy the runtime delivers after the key's retention expired runs again (BEH-RM-067); the consumer sets `dedupeRetention` above the runtime's redelivery window or keeps handlers idempotent. |
| Owner | Companion + Consumer |

<a id="rsk-rm-002"></a>
### RSK-RM-002: Stale session acts after a partition heals

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A delayed call, late reply or late callback from an ended session takes effect under the new session (split-brain at the boundary). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Fresh epoch per session (BEH-RM-010); equality checks at both ends (BEH-RM-011, BEH-RM-035); tokens bound to epoch and live call (BEH-RM-044); INV-RM-004. |
| Residual scoring | S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) |
| Residual risk and acceptability | A non-conforming guest (not built with `Guest.serve`) that ignores epochs. Host-side checks still refuse its callbacks. Acceptable. |
| Owner | Companion |

<a id="rsk-rm-003"></a>
### RSK-RM-003: Peer holds a lifecycle step

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A build, stop, removal or shutdown waits for an unreachable or slow peer. |
| Initial scoring | S 2 · P 3 · D 1 → class **High** (6) · priority Medium (3) |
| Controls | Build opens nothing remote (BEH-RM-003); finalizers never await the peer (BEH-RM-005); bounded handshake (BEH-RM-012); every call has a deadline (BEH-RM-017); withdrawal bounded by core limits (BEH-RM-028); INV-RM-002, INV-RM-003; partition variants of the core suites (BEH-RM-060). |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | An adapter whose local close blocks beyond `closeTimeout` in native code. Logged. Acceptable. |
| Owner | Companion |

<a id="rsk-rm-004"></a>
### RSK-RM-004: Guest reaches more than it was granted

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A guest calls an ungranted host service or method, acts after its call ended, or acts for another actor. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Granted clients only (BEH-RM-036); admission order with policy (BEH-RM-043); token checks (BEH-RM-044); revocation at the boundary (BEH-RM-014); CallLog entries for every crossing (BEH-RM-046); INV-RM-007. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | Ambient capabilities of the guest's runtime outside the Remote channel (see RSK-RM-005, RSK-RM-006). Owned by the consumer's host mechanism. |
| Owner | Companion + Consumer |

<a id="rsk-rm-005"></a>
### RSK-RM-005: Out-of-process mistaken for isolated

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer runs third-party code through `@bridger/worker` or a bare runtime and believes Bridger isolates it. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Explicit statements (BEH-RM-053, BEH-RM-052); profile `isolationProvidedBy` documentation-only (BEH-RM-050); worker adapter not recommended for third-party code (BEH-RM-053); `Remote.define` returns an ordinary plugin with no isolation flag (BEH-RM-001). |
| Residual scoring | S 3 · P 1 · D 3 → class Medium (3) · priority High (6) |
| Residual risk and acceptability | Documentation cannot force reading. Owned by the consumer; Bridger makes no isolation claim. |
| Owner | Consumer |

<a id="rsk-rm-006"></a>
### RSK-RM-006: Escape from the guest's runtime

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Guest code escapes a workerd or provider isolate into the host process or machine (an isolate-to-host escape in a workerd-class runtime was publicly reported in 2026). |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | workerd adapter refuses to open without an explicit operator boundary and documents the VM/container obligation (BEH-RM-055); Worker Loader adapter withholds outbound network and bindings (BEH-RM-054); adapter obligation 3 (BEH-RM-052). |
| Residual scoring | S 3 · P 2 · D 3 → class High (6) · priority High (9) — unchanged by Bridger |
| Residual risk and acceptability | Not reducible by this package. The consumer's VM or container boundary (gVisor, Firecracker), patching and monitoring are the controls. |
| Owner | Consumer |

<a id="rsk-rm-007"></a>
### RSK-RM-007: Guest state lost on eviction or limits

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An isolate is evicted, or a provider limit on dynamic workers is hit, and state or calls are lost. |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Stateless guests (BEH-RM-034, ADR-RM-007); eviction as transport failure with outcomes (BEH-RM-054, BEH-RM-020); limits refused, not waited for (BEH-RM-054). |
| Residual scoring | S 2 · P 1 · D 1 → class Low (2) · priority Low (1) |
| Residual risk and acceptability | Module-level variables in a guest bundle (documented, BEH-RM-034). Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-rm-008"></a>
### RSK-RM-008: RPC module churn breaks the wire

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | `effect/rpc`, marked unstable in Effect v4, changes and silently alters encoding between host and guest versions. |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Own versioned envelope (BEH-RM-004); handshake on wire and contract versions (BEH-RM-009); undecodable frames never reach handlers (BEH-RM-004). |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | Upgrade friction; detected at handshake. Acceptable. |
| Owner | Companion |

<a id="rsk-rm-009"></a>
### RSK-RM-009: Token leaked or replayed

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A token reference appears in a log or is replayed by a guest after its call. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Token dies with its call (BEH-RM-041); checks on epoch and live call (BEH-RM-044); never in logs, status or CallLog (BEH-RM-047); failing authority refuses (BEH-RM-042). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | A consumer-provided `TokenAuthority` with weak references or signatures. Owned by the consumer. |
| Owner | Companion + Consumer |

<a id="rsk-rm-010"></a>
### RSK-RM-010: Flapping link churns dependents

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | An unstable network withdraws and restores the session child repeatedly, restarting dependents and flooding the audit trail. |
| Initial scoring | S 2 · P 3 · D 1 → class **High** (6) · priority Medium (3) |
| Controls | Heartbeat threshold (BEH-RM-025); spaced reconnect with backoff (BEH-RM-012); `stableFor` and flap warning (BEH-RM-029); `"hold"` mode (BEH-RM-030). |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | Availability cost on poor networks; tunable. Acceptable. |
| Owner | Companion + Consumer |

<a id="rsk-rm-011"></a>
### RSK-RM-011: Clock skew between host and guest

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Host and guest clocks disagree, so deadlines or token expiry are decided wrongly. |
| Initial scoring | S 2 · P 2 · D 2 → class Medium (4) · priority Medium (4) |
| Controls | Guest uses remaining duration, not absolute time (BEH-RM-017); expiry decided on the host's clock only (BEH-RM-044). |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | Transport latency added to remaining time; bounded by the host deadline. Acceptable. |
| Owner | Companion |

<a id="rsk-rm-012"></a>
### RSK-RM-012: Dependents' finalizers lose the provider on a session loss

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A dependent stopped because a session was lost runs finalizers that call the remote contract (flush, deregister, release) and get `RemoteUnavailable`, so clean-up that works against a local provider is skipped. |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Deviation stated (BEH-RM-026, INV-RM-005); check 1 exempted under partition and listed in the suite report (BEH-RM-060); `"hold"` mode for consumers that must not be stopped by a partition (BEH-RM-030); outcome `not-executed` tells the finalizer nothing ran (BEH-RM-020). |
| Residual scoring | S 2 · P 2 · D 1 → class Medium (4) · priority Low (2) |
| Residual risk and acceptability | Finalizers that depend on a remote provider must tolerate its absence. A consequence of the peer being unreachable, not reducible by the proxy. Acceptable with documentation. |
| Owner | Companion + Consumer |

<a id="rsk-rm-013"></a>
### RSK-RM-013: Revocation-caused withdrawals not attributed in the core audit trail

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A boundary revocation unmounts the session child; the child's and every dependent's stops are audited as `system-stop` by `Actor.system`, and an auditor cannot see who pulled the switch or why. |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | The session child is removed with core `Plugin.Runtime.unmount(child, { context })`, which records `unmount-requested` with `requestedBy` and causes the stops (BEH-RM-014, core BEH-BR-126, gap G57 closed by CCR-BR-026); the revoking actor, reason and time kept in `RemoteBoundary.revoked` and `LinkStatus.revoked`, logged, and offered to the `CallLog` as a "revocation" entry; removal of the revoked link is a separate attributed operation. |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | A child whose removal had already begun for another reason (a session loss in the same instant) carries no `requestedBy`; nor does one whose revocation unmount failed, which leaves no `unmount-requested` record: after `WouldDeadlock` the child is removed by the removal already under way (its parent's stop, or another) or, with none, by the session's sub-scope close; after `HostClosed`, by shutdown; after `UnknownPlugin` it is already gone (BEH-RM-014). In both cases the companion's trail (the warning log, `LinkStatus.revoked`, the "revocation" `CallLog` entry) still names the revocation, and the boundary refusal stays in force. Acceptable. |
| Owner | Companion |

<a id="rsk-rm-014"></a>
### RSK-RM-014: Residency labels mistaken for a residency guarantee

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A consumer labels a plugin and its transports and reads "no `PlacementRefused`" as evidence that data stayed where the label says; or a transport's declared labels are wrong, so calls go to an unlabelled place unrefused. |
| Initial scoring | S 3 · P 2 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Labels compared as the consumer's strings, at define, per session and at each serving end (BEH-RM-068, BEH-RM-069, INV-RM-011); a required label with no declared labels is refused; documentation that Bridger verifies neither the label nor the declaration; the label recorded in `CallLog` entries and audit records by core flows. |
| Residual scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Residual risk and acceptability | Where a provider or region really runs code is outside any software check here. Acceptable only with the consumer's own evidence for each declared label. |
| Owner | Consumer |

<a id="rsk-rm-015"></a>
### RSK-RM-015: A browser frame reached by, or reaching, the wrong party

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | A `postMessage` channel is opened to, or accepted from, a document of another origin; or a partner frame is configured so that it can script the host page directly, and the transport is taken for a separation. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | Exact `targetOrigin` and `allowedOrigins`, "*" refused as an option, source checked as the parent; in the "opaque" mode a `sandbox` without `allow-same-origin` required, the `ready` message checked by `event.source` and a one-time nonce, the port posted once to that window; one transferred port per connection, no further `window.postMessage` frames (BEH-RM-070); one session and epoch per frame; documentation of the `sandbox` configuration the separation depends on. |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | The frame's `sandbox`, origin and content security policy are the consumer's. In the "opaque" mode, a document that replaced the frame's document between `ready` and the handshake would receive the port; the peer on the port is untrusted in every mode. Scripts in the host page's own realm are inside the trust boundary. Acceptable with the documented configuration. |
| Owner | Companion + Consumer |

<a id="rsk-rm-016"></a>
### RSK-RM-016: Identity disclosed to a peer without a recorded decision

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Every remote call sends the caller's actor, principal, organisation and correlation id to the guest or peer, which becomes a processor of that personal data without the application having decided so; or a link discloses identity and nobody can later tell which links did. |
| Initial scoring | S 2 · P 3 · D 3 → class **High** (6) · priority **High** (9) |
| Controls | Identity claims sent only when the link lists them in `RemoteOptions.disclose`, default none (BEH-RM-024, INV-RM-012); `org` on the wire only when disclosed (BEH-RM-065); a disclosing link listed in `LinkStatus.disclosed` and logged at each session open (BEH-RM-006, BEH-RM-024); host-side controls read the token, not the frame (BEH-RM-041, BEH-RM-043, BEH-RM-066); the federation companion's imports disclose only what the signed host manifest lists (federation BEH-FD-026); every call-log crossing entry names the identity claims that crossed with the call, never their values (BEH-RM-024, BEH-RM-046; core BEH-BR-280). |
| Residual scoring | S 2 · P 1 · D 2 → class Low (2) · priority Low (2) |
| Residual risk and acceptability | The per-call record of which claims crossed exists only where the application wires a core `CallLog` port; without one, the record is the link's configuration and its session log. Personal data inside payloads is the contract's and the application's, and no option of this package controls it. Acceptable with the stated limits. |
| Owner | Companion + Consumer |

<a id="rsk-rm-017"></a>
### RSK-RM-017: A callback whose host service ran is reported to the guest as refused

| Aspect | Assessment |
| ------ | ---------- |
| Failure mode | Under the "refuse" call-log policy a callback's entry is offered at its end, after the host service ran; when the offer fails with `CallLogUnavailable`, the guest receives `CallbackDenied` although the service's effect, a write included, happened, and the guest retries it or reports it as not done; or a log outage refuses every callback of a link. Trigger: log outage or slowness. |
| Initial scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | "refuse" applied to callbacks only, every other crossing following the port's own policy (BEH-RM-046); the refusal names `CallLogUnavailable` in its tag and the guest sees "call-log-unavailable", never a refusal before the run (BEH-RM-036, BEH-RM-046); core's `failed` and `refused` counters (core BEH-BR-279, BEH-BR-212); callbacks deduplicated per parent call, so a retried copy of the same `callId` does not run again (BEH-RM-048, INV-RM-010); documentation of the residual (BEH-RM-046). |
| Residual scoring | S 3 · P 1 · D 2 → class Medium (3) · priority Medium (4) |
| Residual risk and acceptability | The host service ran and its result was withheld: as under core's "refuse" ([RSK-BR-062](../core/gxp/03-risk-assessment.md#rsk-br-062)), nothing can undo it. A guest that retries under a new `callId` runs it again. Acceptable with idempotent host services behind callback grants and a `CallLog` whose availability the consumer sizes. |
| Owner | Companion + Consumer |

---

_Previous: [Invariants](./invariants.md)_ · _Next: [Traceability](./traceability.md)_
