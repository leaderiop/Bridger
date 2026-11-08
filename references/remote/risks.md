# Risk Assessment — Remote Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-RISK                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Risk Assessment                                              |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — RSK-RM-001 residual raised for per-call transports and controls extended to callbacks; RSK-RM-012 (dependents' finalizers after a session loss) and RSK-RM-013 (revocation not linked in the core audit trail) added (R3-05, R3-06, R3-09, R3-12) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

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
| Controls | Outcome on every error (BEH-RM-020); session loss fails calls as `unknown` (BEH-RM-021); no re-send (INV-RM-008); per-session deduplication (BEH-RM-035, INV-RM-009); callback deduplication per parent call (BEH-RM-048, INV-RM-010); matching by call ID (BEH-RM-051); idempotency stated as the handler's obligation on per-call transports (BEH-RM-034). |
| Residual scoring | S 3 · P 2 · D 2 → class **High** (6) · priority **High** (6) on `liveness: "per-call"` transports; S 3 · P 1 · D 1 → class Medium (3) · priority Low (2) elsewhere |
| Residual risk and acceptability | A caller that ignores `outcome: "unknown"` and retries without an idempotency key — contrary to the documented contract. On per-call transports a duplicated invocation runs a handler again (no guest table survives an invocation); acceptable only with idempotent handlers, which is the consumer's obligation. |
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
| Failure mode | A boundary revocation unmounts the session child; the child's and every dependent's stops are audited as `system-stop` by `Actor.system`, caused by the mount record, and an auditor cannot see who pulled the switch or why (core gap G57). |
| Initial scoring | S 2 · P 3 · D 2 → class **High** (6) · priority **High** (6) |
| Controls | The revoking actor, reason and time kept in `RemoteBoundary.revoked` and `LinkStatus.revoked`, logged at warning level with the withdrawn links, and offered to the `CallLog` (BEH-RM-014); removal of the revoked link is a separate attributed operation. |
| Residual scoring | S 2 · P 2 · D 2 → class Medium (4) · priority Medium (4) |
| Residual risk and acceptability | The link between the revocation and the stops lives outside the core audit trail until core decides G57. Acceptable for a Draft; to be revisited with G57. |
| Owner | Companion + Core (G57) |

---

_Previous: [Invariants](./invariants.md)_ · _Next: [Traceability](./traceability.md)_
