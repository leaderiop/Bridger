# 08 — Test Transport and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-08                                            |
> | Revision       | 0.11                                                         |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.11 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09) — check 41: the `CleanupError` case — record kept only when the unmount began or took over the removal, child unregistered with its leak logged outside shutdown (F3, PL3); check 14: a failed child cleanup still completes the withdrawal and the next session mounts; a take-over waits for the stop step only (F4, PL4) (CCR-RM-012)<br>0.10 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — check 41: a failed revocation unmount's child goes by cause — `WouldDeadlock` by the removal under way or the session's sub-scope close, `HostClosed` by shutdown, `UnknownPlugin` nothing left (PL8) (CCR-RM-010)<br>0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — check 41: a failed revocation unmount is logged at warning level, keeps the boundary refusal, records no `unmount-requested`, and the child goes with the parent's stop or shutdown (PL8, R1) (CCR-RM-009)<br>0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — check 30: a provision whose version does not satisfy `"^" + V` is refused "unavailable", as BEH-RM-039 states (F4) (CCR-RM-008)<br>0.7 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-04) — check 4 uses the range `"^" + V` (C9); check 36: a copy refused "placement-refused" holds no claim (PL15) (CCR-RM-007)<br>0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03) — checks 38 (M13), 42 (M15, Low) and 44 (H8) restated; check 50 added: callback placement and budget after the duplicate check (M14); BEH-RM-060 note: check 3 covers a guest callback of `restart(P)` during P's build (core `CurrentTransition`) (CCR-RM-006)<br>0.5 (2026-11-09): Specification audit of 2026-11-09: check 34 amended (`org` on the wire only when disclosed); checks 45–48 added — disclosure, mount refusal, `Transport.fromBundle`, the loader's `RevokedDigests` view and the link manifest; check 48 covers the call-log `disclosed` names; check 49 local contracts (BEH-RM-007) (core CCR-BR-033); check 48: view answers are consulted live and never kept (independent review) (CCR-RM-004)<br>0.4 (2026-11-08): Round-2 agent review (R4 F14, F15, F17, F19, F20, F23, F28) — checks 36, 38, 39 restated; checks 43 (wire negotiation, revocation epoch) and 44 (endpoint residency) added (CCR-RM-003)<br>0.3 (2026-11-08): round 2: recheck items 20, 23 and 25 — checks 34–42 (CCR-RM-003)<br>0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — re-run checks assert the core records plus the session child's mount records; check 1 exempted under partition; checks 27–33 for the epoch echo, callback deduplication, per-call sessions, `Remote.serve`, the multiplexer, persistent revocation and wire annotations (R3-01, R3-04, R3-05, R3-06, R3-07, R3-09, R3-10, R3-13, R3-17) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

The riskiest claim of this companion is that a proxy plugin keeps every local
rule of the core intact (gap report §8, step B1). It can be tested only with
a transport whose faults are scripted and whose time is the test clock. This
file specifies `TestTransport`, how it is used with the core's `TestHost`
([21 — Testing Host](../../core/behaviors/21-testing-host.md)), the
requirement that the core's lease and drain suites be re-run through
proxies, and this companion's required acceptance checks. This file owns
BEH-RM-057–064 and uses BEH-RM-057–061; BEH-RM-062–064 are reserved.

Planned source: `packages/remote/src/testing/TestTransport.ts` *(Planned)*;
entry point `@bridger/remote/testing`.

## BEH-RM-057: TestTransport is an in-process transport with deterministic delivery

> **See:** [ADR-RM-009](../decisions/009-deterministic-test-transport.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [NFR-BR-001](../../core/urs.md#nfr-br-001-determinism)

```ts
// illustrative — not type-checked
TestTransport.make(options?: {
  readonly mode?: "auto" | "held"           // auto: deliver on the test clock; held: deliver only on `deliver`
  readonly seed?: number                    // reorder and selection decisions
  readonly profile?: Partial<TransportProfile>
}): Effect.Effect<TestTransport, never, Scope.Scope>

interface TestTransport {
  readonly transport: Transport             // for Remote.define
  readonly guest: GuestTransport            // for Guest.serve, in the same process
  readonly inject: (fault: TransportFault) => Effect.Effect<void, never, Scope.Scope>
  readonly pending: Effect.Effect<ReadonlyArray<PendingFrame>>   // queued, in delivery order
  readonly deliver: (n?: number) => Effect.Effect<number>        // deliver up to n queued frames; returns the count
  readonly runUntilQuiet: Effect.Effect<void>                    // deliver until nothing is queued or due
  readonly frames: Effect.Effect<ReadonlyArray<FrameRecord>>     // every frame sent, with fate: delivered | dropped | duplicated | delayed
}
interface PendingFrame { readonly direction: "to-guest" | "to-host"; readonly kind: Frame["t"]; readonly epoch?: string; readonly callId?: string; readonly dueAt: number }
```

```
REQUIREMENT: `TestTransport` MUST take time only from the core's `Clock`
             (BEH-BR-209) and randomness only from `seed`; two runs with the
             same seed, the same test clock steps and the same calls MUST
             produce the same `frames` log.
```

```
REQUIREMENT: In "held" mode no frame MUST be delivered except by `deliver` or
             `runUntilQuiet`. In "auto" mode a frame MUST be delivered when
             the test clock reaches its `dueAt` (send time plus any delay).
```

```
REQUIREMENT: `TestTransport` MUST implement `Transport` and `GuestTransport`
             exactly as BEH-RM-049 requires of an adapter, so that the
             remote package runs the same code paths over it as over a real
             adapter. It MUST NOT have a private path into the link or guest.
```

## BEH-RM-058: Transport faults are scoped and visible as faults

> **See:** [ADR-RM-009](../decisions/009-deterministic-test-transport.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)

```ts
// illustrative — not type-checked
TransportFault.drop(select?: FrameSelector)                      // matching frames are lost
TransportFault.delay(by: Duration.Input, select?: FrameSelector) // matching frames are due later
TransportFault.reorder(select?: FrameSelector)                   // matching queued frames are delivered in a seeded order
TransportFault.duplicate(select?: FrameSelector)                 // matching frames are delivered twice
TransportFault.partition()                                       // every frame in both directions is lost; no close is signalled
TransportFault.close(reason?: string)                            // the connection closes, signalled on both ends
type FrameSelector = { readonly direction?: "to-guest" | "to-host"; readonly kind?: Frame["t"]; readonly method?: string; readonly nth?: number }
```

```
REQUIREMENT: A fault MUST be active from `inject` until the scope passed to it
             closes, as the core's faults are (BEH-BR-180). Closing a
             `partition` scope heals it: frames sent afterwards are delivered;
             frames lost during it stay lost.
```

```
REQUIREMENT: Every frame a fault affects MUST be recorded in `frames` with its
             fate and the fault that caused it, and a connection closed by
             `close` MUST carry a reason beginning "injected fault:", so that
             an injected failure cannot be mistaken for a defect.
```

```
REQUIREMENT: `partition` MUST NOT signal closure: the link MUST learn of it
             only through missed heartbeats (or failed calls, for
             `liveness: "per-call"`), as it would from a real network.
```

## BEH-RM-059: TestTransport runs under the core's TestHost

> **See:** [ADR-RM-009](../decisions/009-deterministic-test-transport.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-027](../../core/urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)

```
REQUIREMENT: A link over `TestTransport` and a `Guest.serve` over its `guest`
             end MUST run inside a `TestHost` (BEH-BR-177) with the test
             clock and the counter `IdGenerator` (BEH-BR-179), so that epochs,
             token identifiers and call identifiers are deterministic.
```

```
REQUIREMENT: Documentation MUST state that `TestHost.awaitIdle` and
             `runUntilIdle` do not wait for frames: a test that needs both
             settled MUST alternate `TestTransport.runUntilQuiet` and
             `TestHost.runUntilIdle` until neither makes progress. The remote
             testing entry point MUST provide that loop as
             `RemoteTest.settle(testHost, testTransport)`.
```

**Settled here.** The core's scheduling seam is internal and not exported
(BEH-BR-177), so `TestTransport` keeps its own delivery queue rather than
entering the `TestHost`'s step order. Both are driven from the test, and
`settle` composes them; no core change is needed.

## BEH-RM-060: The core's lease and drain suites are re-run through proxies

> **Invariant:** [INV-RM-001](../invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition), [INV-RM-006](../invariants.md#inv-rm-006-remote-adds-no-second-admission-path)
> **See:** [ADR-RM-009](../decisions/009-deterministic-test-transport.md), [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)
> **Satisfies:** [URS-BR-002](../../core/urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use), [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call), [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-001](../../core/gxp/03-risk-assessment.md#rsk-br-001), [RSK-RM-003](../risks.md#rsk-rm-003)

```
REQUIREMENT: The remote package's test suite MUST re-run each of the core's
             acceptance checks 1, 2, 3, 4, 10, 12, 18 and 23
             (BEH-BR-183, BEH-BR-184) with the provider under test replaced
             by `Remote.define` over `TestTransport` and an in-process
             `Guest.serve`, the plugin under operation being the link or
             its session child as the check requires, and MUST assert the
             same states, errors and events as the core check, and the core
             check's audit records plus the session child's `system-start`
             and `system-stop` mount records (core BEH-BR-126) and nothing
             else, with the session child's ID where the core check names
             the provider.
```

```
REQUIREMENT: Each re-run check MUST also be run with a `partition` injected at
             the point where the core check waits on a lease or a drain, and
             MUST then assert that the operation still completes within the
             core's limits with no frame delivered (INV-RM-002). Check 1 is
             exempt from its finalizer assertion under partition: after a
             session loss a dependent's finalizers find the provider
             unreachable (BEH-RM-026, [RSK-RM-012](../risks.md#rsk-rm-012)),
             and the suite's report MUST list that exemption with this
             reason; the order of stops is still asserted.
```

```
REQUIREMENT: A core check that cannot be re-run through a proxy MUST be
             listed, with the reason, in the suite's report; it MUST NOT be
             replaced silently by a test of something nearby
             ([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).
```

Check 4 — every cell of both legality tables — is included because the claim
is that the link and its session child are ordinary plugins; if any cell
differs, the claim is false. Check 3 covers `WouldDeadlock` both for a
host-side callback, for a guest callback that reaches `remove` of the
link through a granted service, and for a guest callback that reaches
`restart(P)` from a call made during P's build (BEH-RM-022, `HeldPlugins`
and `CurrentTransition` carried).

## BEH-RM-061: Required acceptance checks — remote companion

> **See:** [ADR-RM-009](../decisions/009-deterministic-test-transport.md), [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-019](../../core/urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The remote package's test suite MUST contain at least one test,
             run on `TestHost` with `TestTransport` unless stated otherwise,
             for each of the following:
             1. `Remote.define` returns a `PluginDefinition`; defining it
                opens nothing and allocates nothing.
             2. The link becomes `active` with the peer unreachable;
                dependents of the contract stay `waiting`.
             3. A handshake mounts one session child providing exactly the
                contract's key, audited as `system-start`.
             4. A guest serving a version outside `"^" + V` — a lower minor
                of the same major included, and for major 0 a higher minor
                too — or outside a
                narrower `accepts` is refused with an `IncompatibleContract`
                cause in `RemoteStatus`; the link stays `active`, no
                session child is mounted, and dependents stay `waiting`.
             5. Each session has a fresh epoch from the `IdGenerator`;
                epochs are never reused across sessions, activations or
                `replace`.
             6. A delayed `call` of an old epoch is refused by the guest
                with `StaleEpoch` and does not run the handler.
             7. A late `result` of an old epoch completes no call and is
                counted as a refusal.
             8. Every call ends by its deadline; `"forever"` and
                non-positive timeouts are refused at configuration.
             9. A deadline expiry yields `RemoteTimeout` with the right
                outcome and sends `cancel`; the guest interrupts the handler.
             10. Caller interruption sends `cancel` and completes without
                 waiting for the guest.
             11. A face method called after its session ended fails with
                 `RemoteUnavailable` and sends no frame.
             12. Session loss fails every call in flight with `SessionLost`
                 before the withdrawal begins; no `callId` is ever sent
                 twice.
             13. Missed heartbeats withdraw the session child; dependents
                 go `active` → `stopping` → `waiting`; nothing is `failed`;
                 heal returns them to `active` under a new epoch.
             14. Withdrawal and every lifecycle step complete with the peer
                 partitioned and no frame delivered; a withdrawal whose
                 session child's cleanup fails completes, the child is
                 unregistered with its leak logged at warning level, and
                 the next session mounts a new session child; a sub-scope
                 close that takes over an operator `restart` of the session
                 child waits for its stop step only, never its build
                 (BEH-RM-028).
             15. A mount refused with `DuplicateProvider` ends in the link's
                 runtime failure naming the `ServiceId`.
             16. `"hold"` mode keeps the session child mounted and fails
                 calls fast with `RemoteUnavailable` while no session is
                 open.
             17. `stableFor` prevents a mount for a session shorter than it;
                 the flap warning is logged once per window.
             18. `maxInFlight` refuses excess calls with `RemoteBusy` on
                 both ends.
             19. Duplicated `call` frames run the handler once per session.
             20. A guest receives clients for granted contracts and methods
                 only; an ungranted call fails with `CallbackDenied`
                 without a frame.
             21. Callback admission follows the order of BEH-RM-043; each
                 refusal (stale epoch, revoked, invalid token, expired
                 token, token of an ended call, ungranted, admission
                 refusal, undecodable) is returned by tag, leases nothing
                 and is offered to the `CallLog`; the core policy is asked
                 only by the host's own capture, with the link as consumer,
                 and its `ResolutionRefused` reaches the guest as "denied".
             22. A callback runs under the token's actor with the link as
                 `onBehalfOf`, and is interrupted when its parent call ends.
             23. `RemoteBoundary.revoke` refuses new calls and callbacks at
                 once, ends the session, prevents reconnection, records the
                 actor and reason in `RemoteBoundary.revoked` and
                 `LinkStatus.revoked`, and writes one `CallLog` entry; the
                 link's removal is a separate audited operation.
             24. No token reference appears in logs, spans, `RemoteStatus`,
                 events or `CallLog` entries.
             25. The core checks re-run through proxies (BEH-RM-060).
             26. Transport conformance: under each `TransportFault` alone
                 and in seeded combination, every call ends with exactly one
                 outcome and INV-RM-004 and INV-RM-009 hold. Each adapter
                 runs this suite against its real runtime (BEH-RM-052).
             27. `hello` carries the session's epoch; a `welcome` whose
                 epoch differs is refused and opens no session.
             28. A duplicated `callback` frame runs the host service once
                 per parent call; the duplicate is answered from the stored
                 result or dropped, and is offered to the `CallLog` once
                 (INV-RM-010).
             29. On a per-call transport, a guest reset (a call answered
                 with "stale-epoch" or "incompatible-contract") ends the
                 session at once, withdraws the session child, and a new
                 handshake mounts a new one; transport failures end it after
                 `unavailableAfter`.
             30. `Remote.serve` takes one core lease per served call, so a
                 local `remove` of the provider drains served calls; a
                 method outside `methods` is refused "method-not-served"
                 before any lease; with no active provider, or a provision
                 whose version v does not satisfy `"^" + V`, V the
                 announced version (for major 0, the same minor and
                 v ≥ V; 05, BEH-RM-039), calls are refused
                 "unavailable" and no provider is started; the served call
                 runs under `options.context`, not under the asserted
                 `claims.actor`.
             31. Over `Transport.multiplex`, sessions of two endpoints keep
                 separate epochs and frames; closing the physical
                 connection ends both sessions; a frame for an unopened
                 endpoint is dropped.
             32. A revoked link refuses sessions after `restart`, `retry`
                 and a `replace` with the same digest; with a revocation
                 source wired, a restarted `Remote.layer` reads it before
                 any session opens.
             33. A `call` and a token carry the caller's taint and
                 provenance encoded, and never its deadline; the guest and
                 a callback decode them, reject unknown keys, and combine
                 them into the receiving fiber; a callback's mutating call
                 records the token's actor, the link as `onBehalfOf`, and
                 the "audit" keys.
             34. With `OrgOf` provided, a token carries `org`, and the
                 `call` claims carry it only when the link discloses "org";
                 without `OrgOf` neither does; `org` never appears in
                 `RemoteStatus` (BEH-RM-065).
             35. A `PrincipalBudget` refusal fails the call with
                 `RemoteBudgetExceeded` before any frame and offers one
                 "refusal" entry; a failing `admit` refuses; `charge` sees
                 only the measures the profile lists (BEH-RM-066).
             36. On a per-call `TestTransport` profile that duplicates a
                 `call` to two guest instances sharing one in-memory
                 `DedupeStore`, the handler runs once; the second copy is
                 answered with the stored result, or with `InProgress`
                 while the first runs, and the link keeps the call in
                 flight on `InProgress` (outcome "unknown" at its
                 deadline); a copy refused "busy", "deadline-passed" or
                 "placement-refused" holds no claim, and its duplicate is
                 refused the same way, never answered `InProgress`; a copy delivered after the retention
                 expired runs again (the stated residual); a guest started
                 with neither a store nor "idempotent-handlers" fails to
                 start; a failing `claim` refuses "busy" and runs nothing
                 (BEH-RM-020, BEH-RM-035, BEH-RM-067, BEH-RM-069, INV-RM-009).
             37. A link whose manifest `residency` is not among its
                 transport's labels fails its build with `PlacementRefused`
                 and opens no session; with no labels declared it is
                 refused; with no required label it is never refused; a
                 throwing policy refuses "policy-defect" (BEH-RM-068).
             38. A call carries `placement/residency` in its encoded
                 annotations; a serving end whose `GuestTransport` profile
                 does not offer the label answers "placement-refused"
                 before any lease — `Remote.serve` offers a "refusal" entry
                 with `refusal.reason` "placement-refused", `Guest.serve`
                 logs it in the guest's logger and imports no host-side
                 module; the label reaches the audit
                 records of a callback's mutating call; a fiber already
                 carrying a label that the link's transport does not offer
                 is refused before any frame is sent, on a link with no
                 required label or a different one (BEH-RM-069).
             39. `Transport.postMessage` refuses `targetOrigin` "*"; the
                 guest ignores messages from an origin not listed, from a
                 source other than its parent, or without one port; in the
                 "opaque" mode `open` refuses a frame whose `sandbox`
                 contains "allow-same-origin", ignores a `ready` from
                 another window or with an unknown or used nonce, posts the
                 port once, and fails at `connectTimeout` without `ready`;
                 after the handshake no frame travels on
                 `window.postMessage`; a reloaded frame is a new session
                 with a new epoch (BEH-RM-070).
             40. The Workers for Platforms adapter passes `limits` and
                 `outbound` on every dispatch, fails `open` beyond provider
                 limits, and runs the transport conformance suite with a
                 `DedupeStore` (BEH-RM-071).
             41. A boundary revocation records `unmount-requested` with
                 `requestedBy` the revoking actor and reason before the
                 session child's `system-stop`; with a wired `RefusalList`
                 refusing the link's digest, a later restart leaves the
                 link `disabled` ("refused-digest"); one "revocation"
                 entry is offered per matching link; an unmount that fails
                 is logged at warning level, keeps the boundary refusal in
                 force and records no `unmount-requested`, except a
                 `CleanupError` of an unmount that began or took over the
                 removal, which keeps its record; after a `CleanupError`
                 outside shutdown the child is unregistered at once with
                 its leak logged at warning level, and its id is free;
                 after
                 `WouldDeadlock`, the child is removed by the parent's stop
                 already under way, or, with no removal under way, by the
                 session's sub-scope close; after `HostClosed`, by
                 shutdown; after `UnknownPlugin`, nothing is left to remove
                 (BEH-RM-014).
             42. Crossings and refusals are offered with core entry kinds,
                 each "refusal" entry's `refusal.reason` a `WireRefusal`,
                 never a tag; a callback under a `CallLog` whose `record`
                 fails has run its host service and has its result
                 withheld: the guest receives `CallbackDenied { reason:
                 "call-log-unavailable" }` from a `Refused` exit tagged
                 "CallLogUnavailable"; a served call's and a
                 callback's mutating calls carry the caller's correlation;
                 a hook point dispatched from a served call wakes a dormant
                 veto contributor instead of "no-host-link"; a method's
                 deadline is the descriptor's timeout when shorter than
                 `callTimeout` (BEH-RM-017, BEH-RM-039, BEH-RM-045,
                 BEH-RM-046).
             43. Wire negotiation: a release at N and a guest at N−1 agree
                 on N−1, two ends at N on N, an end listing only N against
                 one at N−1 is refused "wire" with no session; a frame at a
                 version other than the agreed one ends the session; a
                 revocation entry carries the epoch when a session was
                 open (BEH-RM-009, BEH-RM-014).
             44. A multiplexed endpoint given residency labels reports
                 them in its profile, and a link over it is placed against
                 them; a `MultiplexedGuest` endpoint given labels reports
                 them in its `GuestTransport` profile and the serving end
                 places calls against them; every other profile field of
                 an endpoint is the one passed to `multiplex` (BEH-RM-049,
                 BEH-RM-056, BEH-RM-068, BEH-RM-069).
             45. Disclosure: a link without `disclose` sends `call` claims
                 with no actor, `onBehalfOf`, `org` or `correlationId`
                 while its tokens keep them on the host; a link disclosing
                 a subset sends exactly that subset, lists it in
                 `LinkStatus.disclosed` and logs it at each session open
                 without values; a guest and `Remote.serve` handle calls
                 without identity claims, and a served call's inbound
                 entry names "link:" + `pluginId` as principal (BEH-RM-024,
                 BEH-RM-039, BEH-RM-046, INV-RM-012).
             46. Mount refusal: with the link installed under
                 `allowChildren: false`, or an `AccessPolicy` denying its
                 `child` request, the first handshake ends the session
                 "mount-refused", the mount is not retried, `LinkStatus`
                 shows the `ChildNotAllowed` tag and the link becomes
                 `failed` through `reportFailure`; `DuplicateProvider`
                 behaves the same and names the `ServiceId` (BEH-RM-002,
                 BEH-RM-013).
             47. `Transport.fromBundle`: each `open` runs `acquire` again
                 and starts the guest from the given files at `entry`; a
                 failing `acquire` fails `open` and the link retries on its
                 schedule without failing its build; changing the source
                 after `acquire` does not change what runs; a
                 `BundleRuntime` of each adapter that offers one passes
                 this check against the real runtime (BEH-RM-072).
             48. With the loader's `RevokedDigests` view wired, a signer
                 revocation and a statement-digest revocation that the view
                 maps to a link's `meta.digest` end its session "revoked"
                 at once and refuse later sessions while the view refuses
                 it; a "verification-unknown" answer that the view later
                 drops lets the link connect again, and no view answer
                 appears in `RemoteBoundary.revoked`; a link's
                 `options.manifest` is carried unchanged and a manifest
                 that does not agree with the link fails `install` with
                 core's `InvalidDefinition` (BEH-RM-014, BEH-RM-001); each
                 "crossing" entry names in `disclosed` exactly the identity
                 claims that crossed with the call, in the fixed order, and
                 omits it when none did (BEH-RM-024, BEH-RM-046).
             49. Local contracts: `Remote.define` of a local contract passed
                 untyped returns a definition whose `install` leaves the
                 link `failed` with `LocalContractRefused` (site "define")
                 and opens no session; `Remote.serve` and `Guest.serve` of
                 a local contract, or with one in `grants`, fail at once
                 with it and accept no connection; a granted key whose
                 provision is local is left out of `hello`, and a callback
                 for it is refused "local-contract" before decoding; each
                 entry point rejects a local contract at compile time
                 (BEH-RM-007).
             50. Callback placement and budget: a callback whose token
                 carries a residency label the link's transport does not
                 offer is refused "placement-refused" (tag
                 `PlacementRefused`), and one the `PrincipalBudget` refuses
                 is refused "budget-exceeded" (tag `RemoteBudgetExceeded`),
                 both after the duplicate check and before the grant check,
                 leasing nothing and offered as "refusal" entries; a
                 duplicate of a callback that succeeded is answered with the
                 stored result without calling `admit` or the policy again
                 (BEH-RM-043, BEH-RM-048, BEH-RM-066, BEH-RM-069).
```

A check that is listed here and has no executed test is a gap in the
evidence, and it must be reported as such rather than covered by a test of
something nearby.

---

_Previous: [07 — Transports and Adapters](./07-transports-and-adapters.md)_ · _Next: [09 — Placement, Budgets and Adapters](./09-placement-budgets-and-adapters.md)_
