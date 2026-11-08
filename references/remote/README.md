# Bridger Remote — Specification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-00                                                |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Companion Master Index            |
> | Change History | 0.6 (2026-11-08): CCR-RM-003 extended with the resolutions of the round-2 agent review (CCR-RM-003)<br>0.5 (2026-11-08): CCR-RM-003 extended: epoch back in offered call-log entries (core CCR-BR-027), BEH-RM-002 provides the contract itself (core CCR-BR-028), epoch open question closed (CCR-RM-003)<br>0.4 (2026-11-08): round 2: recheck items 20, 23 and 25 — file 09, ADR-RM-010, core seams of CCR-BR-024–026, open questions refreshed, register row CCR-RM-003 (CCR-RM-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08; register row added (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

**implementation: absent**

This is the specification of `@bridger/remote`, a companion package of
`@bridger/core`, and of the obligations of its transport adapters
(`@bridger/worker`, `@bridger/worker-loader`, `@bridger/workerd`, later
`@bridger/wasm`). A remote plugin is an ordinary local proxy plugin whose
build opens a session over a `Transport`; the remote code implements a
versioned contract with `Guest.serve`. It covers gap item 2 and the
companion half of item 3 of the architecture review of 2026-11-08, the two
rules of its §7, roadmap steps B1 and B3, and the related risks of its §9.

## Status: prospective

Nothing described here is implemented. Every document is a `Draft`, every
decision is `Proposed`, and every source or test path is marked *Planned*.
The rule of the core specification applies unchanged
([ADR-BR-036](../core/decisions/036-prospective-specification.md)): this
specification is not evidence that the package behaves as described. A
requirement becomes evidence only when a test that exercises it has run and
passed ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## The honest-claims rule

This companion inherits the core's honest-claims rule
([core README](../core/README.md#the-honest-claims-rule)). In particular:

- It makes **no** claim that a remote plugin is isolated, sandboxed or
  secure. Bridger provides no isolation; whatever separation exists comes
  from the process, isolate or VM an adapter runs the guest in and from the
  consumer's deployment ([ADR-RM-006](./decisions/006-isolation-comes-from-the-host.md)).
  `@bridger/worker` runs guests in the host's own process.
- Self-hosted workerd is not a sandbox on its own; its documentation requires
  a VM or container around it, and an isolate-to-host escape in a
  workerd-class runtime was publicly reported in 2026
  ([RSK-RM-006](./risks.md#rsk-rm-006)).
- It performs **no** cryptography. Tokens are opaque references by default;
  a cross-process `TokenAuthority` is the consumer's.
- It provides **no** delivery guarantee across sessions and **no** automatic
  retry: an `unknown` outcome is reported as such
  ([ADR-RM-008](./decisions/008-unknown-outcomes-are-surfaced-never-retried.md)).

## Reading order

| Step | Document | Purpose |
| ---- | -------- | ------- |
| 1 | [Overview](./overview.md) | Mission, package boundary, API surface, worked example |
| 2 | [Behaviours](./behaviors/01-remote-proxy-plugin.md) | `BEH-RM` requirements |
| 3 | [Invariants](./invariants.md) | `INV-RM` properties, per host |
| 4 | [Decisions](./decisions/001-remote-plugin-is-a-local-proxy.md) | `ADR-RM` records |
| 5 | [Risks](./risks.md) | `RSK-RM` hazards, controls, residual risk |
| 6 | [Traceability](./traceability.md) | BEH → INV → ADR → REQ → RSK |

## Contents

### Behaviours

| # | File | Identifiers |
| - | ---- | ----------- |
| 01 | [Remote proxy plugin](./behaviors/01-remote-proxy-plugin.md) | BEH-RM-001–008 (001–006 used) |
| 02 | [Sessions and epochs](./behaviors/02-sessions-and-epochs.md) | BEH-RM-009–016 (009–014 used) |
| 03 | [Remote calls](./behaviors/03-remote-calls.md) | BEH-RM-017–024 (all used) |
| 04 | [Heartbeat and partition](./behaviors/04-heartbeat-and-partition.md) | BEH-RM-025–032 (025–030 used) |
| 05 | [Guest](./behaviors/05-guest-serve.md) | BEH-RM-033–040 (033–039 used) |
| 06 | [Capability tokens and call log](./behaviors/06-capability-tokens-and-call-log.md) | BEH-RM-041–048 (all used) |
| 07 | [Transports and adapters](./behaviors/07-transports-and-adapters.md) | BEH-RM-049–056 (all used) |
| 08 | [Test transport and acceptance](./behaviors/08-test-transport-and-acceptance.md) | BEH-RM-057–064 (057–061 used) |
| 09 | [Placement, budgets and adapters](./behaviors/09-placement-budgets-and-adapters.md) | BEH-RM-065–072 (065–071 used) |

Unused numbers at the end of a block are reserved, not gaps
([core identifier scheme](../core/process/requirement-id-scheme.md) §3).

### Decisions

| ADR | Decision |
| --- | -------- |
| [ADR-RM-001](./decisions/001-remote-plugin-is-a-local-proxy.md) | A remote plugin is a local proxy plugin |
| [ADR-RM-002](./decisions/002-partition-withdraws-the-session-child.md) | A partition withdraws the session child |
| [ADR-RM-003](./decisions/003-sessions-carry-epochs.md) | Every session carries an epoch, compared by equality |
| [ADR-RM-004](./decisions/004-bounded-calls-and-peer-free-lifecycle.md) | Remote calls always time out; lifecycle steps never wait on a peer |
| [ADR-RM-005](./decisions/005-per-call-capability-tokens.md) | Per-call capability tokens; guests reach granted contracts only |
| [ADR-RM-006](./decisions/006-isolation-comes-from-the-host.md) | Isolation comes from the host process or isolate, never from Bridger |
| [ADR-RM-007](./decisions/007-stateless-guests.md) | Guests are stateless per invocation |
| [ADR-RM-008](./decisions/008-unknown-outcomes-are-surfaced-never-retried.md) | Unknown outcomes are surfaced, never retried |
| [ADR-RM-009](./decisions/009-deterministic-test-transport.md) | A deterministic test transport, and the core suites re-run through proxies |
| [ADR-RM-010](./decisions/010-placement-labels-compared-at-the-boundary.md) | Placement labels are compared at the process boundary, as strings |

## Dependencies on core seams

| Seam | Defined by | Used for |
| ---- | ---------- | -------- |
| Versioned contracts (`Contract.make`, ranges, `IncompatibleContract`) | [Core 26](../core/behaviors/26-versioned-contracts.md), BEH-BR-225–232 (CCR-BR-017) | Wire schema, handshake |
| Plugin principal, `onBehalfOf` | [Core 28](../core/behaviors/28-plugin-principal-and-mandatory-policy.md), BEH-BR-257–259 (CCR-BR-018) | Callback attribution |
| `Grant.of`, `CapabilityPolicy`, `CallLog` | [Core 29](../core/behaviors/29-capability-grants-and-call-log.md), BEH-BR-273–278 (CCR-BR-018) | Callback admission and logging |
| Annotations, flow "wire", `CallerContext` | [Core 30](../core/behaviors/30-operation-context-annotations.md), BEH-BR-289–296 (CCR-BR-018, CCR-BR-022) | Call deadlines; wire annotations of calls, tokens and callbacks; served calls |
| Scoped child mount | Core [14 — Children and groups](../core/behaviors/14-children-and-groups.md), BEH-BR-121 and BEH-BR-126 (specified under CCR-BR-020, as requested by CCR-RM-001) | Withdrawal on partition |
| `@bridger/core/HeldPlugins` exported | Core BEH-BR-088 (exported under CCR-BR-020, as requested by CCR-RM-001) | `WouldDeadlock` across the remote hop |
| `MethodSpec.timeout`, `ContractDescriptor.timeouts` | Core [26](../core/behaviors/26-versioned-contracts.md), BEH-BR-225, BEH-BR-234 (CCR-BR-025) | Per-method call deadlines (BEH-RM-017) |
| `Plugin.Runtime.unmount` with `requestedBy` | Core [14](../core/behaviors/14-children-and-groups.md), BEH-BR-126 (CCR-BR-026) | Attributed revocation of a session child (BEH-RM-014) |
| `CurrentCorrelation`, `CallerContext.correlationId` | Core [22](../core/behaviors/22-attributable-operations.md), BEH-BR-187; core 30, BEH-BR-292 (CCR-BR-026) | Callbacks and served calls carry the caller's correlation |
| `RefusalList` | Core [28](../core/behaviors/28-plugin-principal-and-mandatory-policy.md), BEH-BR-267 (CCR-BR-026) | A revoked link stays `disabled` at its next start |
| Call-log entry kinds, `Host.offerCallEntry`, `PrincipalRef.encode`/`decode` | Core 29, BEH-BR-279, BEH-BR-280 (CCR-BR-026) | Crossings, refusals and revocations in one access log |
| `HostLink.reference`, `host.link` | Core 27, BEH-BR-250 (CCR-BR-024) | Hook points dispatched from served calls and callbacks |

## Open questions

Residuals that need a core decision; none blocks this revision.

- **Epoch type in `CrossingInfo`** — closed. Core now types
  `CrossingInfo.epoch` and `RevocationInfo.epoch` as opaque strings
  (BEH-BR-280, CCR-BR-027), and offered entries carry this companion's epoch
  strings again (BEH-RM-046).
- Core gaps G43, G57, G58 and G60, listed here in revision 0.3, are closed by
  CCR-BR-026 and adopted by CCR-RM-003; G48 by CCR-BR-025.

## Identifier scheme

| Prefix | Meaning |
| ------ | ------- |
| `BEH-RM-NNN` | Behaviour requirement, in blocks of eight per file |
| `INV-RM-NNN` | Runtime invariant |
| `ADR-RM-NNN` | Architecture decision |
| `REQ-RM-NNN` | Acceptance scenario (planned) |
| `RSK-RM-NNN` | Risk |
| `CCR-RM-NNN` | Change control record of this companion |

The core's [identifier scheme](../core/process/requirement-id-scheme.md) and
[change control](../core/process/change-control.md) apply with the infix `RM`.

## Document history

| CCR | Date | Change |
| --- | ---- | ------ |
| CCR-RM-001 | 2026-11-08 | Initial draft of the remote companion: `Remote.define` returning an ordinary link plugin that mounts one session child per session; handshake on wire and contract versions; epochs from the `IdGenerator`, compared by equality, stale epochs refused at both ends; finite deadlines on every call and callback; call outcomes (`executed`, `not-executed`, `unknown`) with no automatic retry; heartbeats and withdrawal of the session child on partition so dependents wait, mapped onto existing core states only, through a requested scoped-mount clarification; `"hold"` mode; revocation at the boundary; `Guest.serve` with stateless guests and granted clients only; per-call tokens through a `TokenAuthority` port, callbacks admitted through the core `CapabilityPolicy` and offered to the `CallLog`; `Transport` interface and adapter obligations, with the statement that isolation comes from the host and never from Bridger; `TestTransport` and the core suites re-run through proxies. Impact assessment (PROC-03 §3): (1) adds BEH-RM-001–006, 009–014, 017–023, 025–030, 033–038, 041–047, 049–055, 057–061; INV-RM-001–009; ADR-RM-001–009; REQ-RM-001–026; RSK-RM-001–011; no core identifier changed by this CCR — the core rows it needs (packages table, roadmap, ADR-BR-027 note, glossary, URS, risks, the scoped-mount clarification and the `HeldPlugins` export) are proposed to the core change that registers this companion. (2) Risk: introduces RSK-RM-001–011, to be summarised in the core risk assessment; RSK-BR-013 extended to out-of-process code. (3) GxP impact: yes — withdrawal produces core `system-start`/`system-stop` records and callbacks reach attributed operations; no core audit record, gate or legality cell is changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: new packages; no core public type changes beyond the requested clarification and export. |
| CCR-RM-002 | 2026-11-08 | Resolutions of the agent review of 2026-11-08 (report R3), findings R3-01 (remote part), R3-03 (remote part), R3-04, R3-05, R3-06, R3-07, R3-08, R3-09, R3-10, R3-11, R3-12, R3-13, R3-14, R3-15, R3-16, R3-17: host-side serving end `Remote.serve` (BEH-RM-039) and endpoint multiplexer (BEH-RM-056), on which the federation companion builds its peer links and exports; `hello` carries the epoch and `welcome` echoes it; per-call transports keep a host-side logical session and a guest reset ends the session; callbacks deduplicated per parent call (BEH-RM-048, INV-RM-010); default accepted range `>= V < (major+1).0.0` per core BEH-BR-232; finalizer deviation after a session loss stated (RSK-RM-012), check 1 exempted under partition; wire annotations encoded by core (BEH-RM-024); callback admission without passing an actor to core, `CallbackDenied`, `CallerContext.serve`; revocation kept for the life of `Remote.layer`, re-read from the source, recorded in the companion's trail (RSK-RM-013, core G57); `WireExit` refusals, missing options and wire fields; invariant sources aligned; re-run checks assert core records plus mount records; checks 27–33. Impact assessment (PROC-03 §3): (1) adds BEH-RM-024, 039, 048, 056; INV-RM-010; REQ-RM-027–033; RSK-RM-012, 013; renames the companion error `CapabilityDenied` to `CallbackDenied`; no identifier withdrawn. (2) Risk: RSK-RM-001 residual raised on per-call transports; two risks added, to be summarised in the core register. (3) GxP impact: yes — revocation-caused withdrawals stay unattributed in the core trail until core decides G57; no core record, gate or legality cell changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: wire envelope fields added (`hello.epoch`, `welcome.maxInFlight`, `call.remaining`, `call.version`, `call.annotations`, `call.claims`, `WireExit.Refused`) within `wire: 1` of a Draft; no core change. |
| CCR-RM-003 | 2026-11-08 | Round 2: recheck items 20, 22, 23 and 25 and alignment with CORE-DECISIONS-2 (CCR-BR-024–026). Item 20: `PlacementPolicy` (default `PlacementPolicy.exact`) compares the manifest's `residency` label with `TransportProfile.residency` at `Remote.define`, per session and at each serving end on the `placement/residency` wire annotation; `PlacementRefused` (BEH-RM-068, BEH-RM-069, INV-RM-011, ADR-RM-010). Item 23: `TokenClaims.org` and `WireClaims.org` through an `OrgOf` port (BEH-RM-065); per-principal budgets through `PrincipalBudget` with adapter-reported `TransportUsage`, `RemoteBudgetExceeded` (BEH-RM-066); `DedupeStore` for per-call transports, which makes INV-RM-009 hold across invocations (BEH-RM-067); `Transport.postMessage` / `GuestTransport.postMessage` (BEH-RM-070) and the Workers for Platforms adapter (BEH-RM-071). Item 25: a revocation unmounts the session child with `Plugin.Runtime.unmount` and `requestedBy` (G57), crossings, refusals and revocations are offered with core entry kinds through `Host.offerCallEntry`, callbacks under `onFailure` "refuse" (G43), `onBehalfOf` is `PrincipalRef.encode`. Item 22: the `wire` version follows the one N/N−1, writers-last rule of the federation skew model (BEH-RM-009). Alignment: method timeouts from `ContractDescriptor.timeouts` (G48); `CurrentCorrelation` for callbacks and served calls (G58); `RefusalList` (G60); `HostLink.reference` for served calls and callbacks. Impact assessment (PROC-03 §3): (1) adds BEH-RM-065–071, INV-RM-011, ADR-RM-010, REQ-RM-034–042, RSK-RM-014 and 015; amends BEH-RM-009, 014, 017, 024, 026, 034, 039, 041, 045, 046, 049, 050, 053, 061, INV-RM-009, RSK-RM-001 and 013; no identifier withdrawn. (2) Risk: RSK-RM-001 residual lowered on per-call transports with a `DedupeStore`; RSK-RM-013 controlled; two risks added. (3) GxP impact: yes — revocation-caused withdrawals are now attributed in the core trail through `requestedBy`; the residency label reaches audit records through core's "audit" flow; no core record, gate or legality cell changed. (4) Revalidation: none (nothing qualified exists). (5) Compatibility: draft-to-draft; `TransportProfile`, `Connection`, `RemoteOptions`, `TokenClaims`, `WireClaims` and `WireExit` refusal reasons gain fields; `RemoteCallLogFields` replaced by core entry kinds; one core-side type change proposed (epoch as string). Extended after integration: core adopted the string epoch (CCR-BR-027), so BEH-RM-046 puts `epoch` back into crossing and revocation entries; core renamed the key a contract wraps to `serviceKey` (CCR-BR-028), so BEH-RM-002 provides the contract itself; the epoch open question is closed. **Extension (2026-11-08, resolutions of the round-2 agent review):** findings R4-offline F14, F15, F17–F20, F23, F28 and R5-09 (coordinator decision on opaque-origin frames, FX-NEW N4). `Transport.postMessage` gains `targetOrigin: "opaque"`: a `sandbox` without allow-same-origin required, a `ready` message checked by `event.source` and a one-time nonce from the frame's name or fragment, the `MessagePort` posted once with "*" to that window; trust boundary narrowed to other windows and frames. The link checks the calling fiber's own residency label before sending. Multiplexed endpoints take the route's residency labels. `DedupeStore` claims after the refusal checks, a running duplicate is answered with the new `WireExit.InProgress` (the host keeps waiting, outcome "unknown" at the deadline), retention option and residual stated. Wire version negotiated per session (`hello.wire` list, `welcome.wire`, `RemoteOptions.wireVersions`). Revocation entries carry the epoch. Impact: adds REQ-RM-043, 044; amends BEH-RM-009, 014, 020, 035, 056, 067, 069, 070, INV-RM-009, 011, RSK-RM-001, 015; wire frame fields changed within a Draft. GxP impact: none on core records. Revalidation: none. |
