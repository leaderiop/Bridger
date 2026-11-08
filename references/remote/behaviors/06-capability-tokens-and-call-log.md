# 06 — Capability Tokens and Call Log

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-06                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-08): BEH-RM-046 crossing and revocation entries carry the session epoch again, now that core types `epoch` as an opaque string (core BEH-BR-280, CCR-BR-027) (CCR-RM-003)<br>0.4 (2026-11-08): round 2: recheck items 23 and 25, CORE-DECISIONS-2 — `TokenClaims.org`; `correlationId` from `CurrentCorrelation` and set for callbacks through `CallerContext.serve` (G58 closed); callbacks carry `HostLink.reference`; crossings, refusals and revocations offered with core entry kinds through `Host.offerCallEntry`, callbacks with `onFailure` "refuse" (G43 closed) (CCR-RM-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — token labels replaced by core-encoded wire annotations; callbacks deduplicated per parent call (INV-RM-010); the core `CapabilityPolicy` consulted only by the host's own capture, actor admission in a companion `CallbackAdmission`, error renamed `CallbackDenied`; callbacks run inside `CallerContext.serve`; annotations reach records only through core flows (R3-06, R3-10, R3-11) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

A guest may call back into host services while it serves a call — read a
price list, write through an egress proxy. Each such callback must be
attributable to the call it serves and limited to what the link was granted.
This file specifies the per-call token the host mints, how a callback is
admitted — by this companion's checks, then by the core's `CapabilityPolicy`
through the host's own capture — and what reaches the core's `CallLog`
port. Both ports are defined by [core behaviour 29](../../core/behaviors/29-capability-grants-and-call-log.md)
([core 29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273–278)); the
annotation bag whose "wire" keys a token carries is [core behaviour 30](../../core/behaviors/30-operation-context-annotations.md)
([core 30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md) (BEH-BR-289–296)). This file owns
BEH-RM-041–048 and uses all eight.

Planned source: `packages/remote/src/Token.ts`, `packages/remote/src/Callback.ts`
*(Planned)*.

## BEH-RM-041: Every host-to-guest call carries a short-lived token

> **Invariant:** [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why), [URS-BR-028](../../core/urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-RM-009](../risks.md#rsk-rm-009)

```ts
// illustrative — not type-checked
interface TokenClaims {
  readonly tokenId: string                  // IdGenerator
  readonly actor: Actor                     // the caller's CurrentActor (BEH-BR-185)
  readonly onBehalfOf?: PrincipalRef        // when the caller is plugin code (core behaviour 28, BEH-BR-259)
  readonly annotations: WireAnnotations     // the caller's "wire" annotations, encoded (core BEH-BR-296; BEH-RM-024)
  readonly correlationId?: string           // the caller's CurrentCorrelation (core BEH-BR-187)
  readonly org?: string                     // opaque organisation claim (09, BEH-RM-065); never parsed here
  readonly pluginId: string                 // the link's ID
  readonly realm: string
  readonly version?: string                 // link meta.version
  readonly digest?: string                  // link meta.digest
  readonly contractVersion: string          // agreed in the handshake (BEH-RM-009)
  readonly epoch: string
  readonly callId: string                   // the host-to-guest call the token belongs to
  readonly grants: string                   // digest of the grant set of the link's activation
  readonly issuedAt: number                 // Clock millis
  readonly expires: number                  // ≤ the call's deadline
}
type TokenRef = string                      // what crosses the wire
```

```
REQUIREMENT: The link MUST mint one token per host-to-guest call, before the
             `call` frame is sent, with the claims above, and MUST send only
             its `TokenRef` in the frame. `expires` MUST NOT be later than the
             call's deadline (BEH-RM-017) and MUST NOT be later than
             `issuedAt + tokenTtl` (default 30 seconds).
```

```
REQUIREMENT: A token MUST die when its call ends — with a result, a failure,
             a timeout, a cancellation or a session loss — whatever its
             `expires`. After that, every check of it MUST fail.
```

```
REQUIREMENT: `annotations` MUST be `Annotations.encode(Annotations.filter(bag,
             "wire"))` of the calling fiber's annotations at mint (core
             BEH-BR-296): encoded entries and omitted ids, never a string
             map, and never `Annotation.Deadline`. The remote package MUST
             NOT interpret an annotation, and documentation MUST state that
             an annotation is a label carried by trusted code, not an
             isolation boundary (BEH-BR-150).
```

**Settled here.** A token is per call, not per session: a guest serving two
calls for two actors carries two tokens, and a callback made under one is
attributed to that one only. The guest does not choose which token to send;
the guest runtime binds each client call to the invocation it runs in
(BEH-RM-036).

## BEH-RM-042: Tokens are minted and checked through a TokenAuthority port

> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-009](../risks.md#rsk-rm-009)

```ts
// illustrative — not type-checked
// Context.Service "@bridger/remote/TokenAuthority"
interface TokenAuthority {
  readonly mint: (claims: TokenClaims) => Effect.Effect<TokenRef>
  readonly check: (ref: TokenRef) => Effect.Effect<TokenClaims, TokenInvalid>
  readonly end: (ref: TokenRef) => Effect.Effect<void>
}
TokenAuthority.inProcess: Layer.Layer<TokenAuthority>   // opaque references into a host-side table
```

```
REQUIREMENT: The remote package MUST ship `TokenAuthority.inProcess`, whose
             `TokenRef` is an identifier from the core `IdGenerator` that
             names an entry in a host-side table; it MUST carry no claim, and
             `check` MUST fail with `TokenInvalid` for any reference not in
             the table.
```

```
REQUIREMENT: When the token must be checked by a process other than the one
             that minted it (for example a federation peer), the consumer
             MUST provide a `TokenAuthority`; the remote package MUST NOT
             choose or implement a signature scheme.
```

```
REQUIREMENT: A `TokenAuthority` that fails or dies during `check` MUST be
             treated as a refusal (`TokenInvalid`), never as an allowance.
```

**Settled here.** The in-process table needs no cryptography: the reference
is unguessable only as far as the `IdGenerator` makes it so, which is the
consumer's choice of generator (BEH-BR-210), and it is valid only while the
call runs. Documentation MUST state that the default generator's
unpredictability is not a security property this specification claims.

## BEH-RM-043: A callback is admitted by grant and companion admission, then by the host's own capture

> **Invariant:** [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-004](../risks.md#rsk-rm-004)

```ts
// illustrative — not type-checked
class CallbackDenied extends Schema.TaggedError<CallbackDenied>()("CallbackDenied", {
  link: Schema.String, contract: Schema.String, method: Schema.String,
  reason: Schema.String          // "not-granted" | "invocation-ended" | the admission's reason
}) {}
// Context.Service "@bridger/remote/CallbackAdmission", optional, read by Remote.layer
interface CallbackAdmission {
  readonly admit: (request: {
    readonly claims: TokenClaims; readonly contract: string; readonly method: string
  }) => Effect.Effect<void, CallbackDenied>
}
```

```
REQUIREMENT: The host end MUST handle a `callback` frame in this order, and
             MUST stop at the first refusal:
             1. epoch equals the open session's (else `StaleEpoch`);
             2. the link is not revoked (else `RemoteRevoked`);
             3. the token checks (BEH-RM-044) and its `callId` equals the
                frame's `parent` (else `TokenInvalid` or `TokenExpired`);
             4. the callback's `callId` has not been seen for this parent
                call (else the duplicate is handled as BEH-RM-048 states);
             5. the contract and method are covered by the link's grants
                (else `CallbackDenied { reason: "not-granted" }`);
             6. when `Remote.layer` has a `CallbackAdmission`, it admits the
                callback for the token's claims — actor, annotations,
                principal — (else its `CallbackDenied`);
             7. the payload decodes with the granted contract's codec (else
                `WireDecodeError`);
             8. the host service is reached with `Host.use` in the link's
                realm, in a fiber of the link, and the method is run,
                bounded by BEH-RM-045.
```

```
REQUIREMENT: The remote package MUST NOT call the core `CapabilityPolicy`
             itself and MUST NOT pass it an actor (core BEH-BR-273). The
             policy decides only through the `resolve` that `Host.use` makes
             in step 8, with the link's plugin as consumer and the token's
             "policy"-flow annotations, decoded and served as BEH-RM-045
             states; a `ResolutionRefused` from it MUST be sent to the guest
             as a `Refused` exit, reason "denied", tag "ResolutionRefused".
```

```
REQUIREMENT: A grant whose key has no `active` provider MUST fail the callback
             with `ServiceUnavailable` from step 8, as `Host.use` does. Grants
             MUST NOT be `requires` of the link unless the application
             declares them so in `options.requires`.
```

```
REQUIREMENT: Every refusal in steps 1–7 MUST be sent to the guest as a
             `callback-result` whose exit is `Refused` (reason "denied" or
             "stale-epoch", `tag` the refusal's tag) and nothing else, and
             MUST NOT lease any service or run any host code other than the
             checks.
```

The grant check (step 5) is the link's static allow-list; the admission
(step 6) is the application's decision by actor, made in this companion's
layer with this companion's error, as core requires of admission by actor
(BEH-BR-273); the core policy (step 8) decides, as for every capture, by
consumer and provider. Keeping all three lets a link definition be read on
its own — "this plugin can reach `StockQuery.lookup` and
`Egress.Http.request`" — while the application still decides, per call, who
may. Core's `CapabilityDenied` is a different thing — a defect raised by
core narrowing — and this companion does not reuse its name.

## BEH-RM-044: Token checks cover expiry, epoch, call and revocation

> **Invariant:** [INV-RM-004](../invariants.md#inv-rm-004-a-stale-epoch-is-refused-at-the-boundary), [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md), [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-009](../risks.md#rsk-rm-009), [RSK-RM-011](../risks.md#rsk-rm-011)

```
REQUIREMENT: A token MUST check only when all hold: the `TokenAuthority`
             returns its claims; the host's `Clock` reads before `expires`;
             `epoch` equals the open session's; the call named by `callId`
             is still in flight; and no revocation selector matches the
             token's `pluginId` or `digest`.
```

```
REQUIREMENT: Expiry MUST be decided on the host's clock only. The guest's
             clock MUST NOT take part in any token decision.
```

## BEH-RM-045: A callback is bounded by the call it serves

> **Invariant:** [INV-RM-003](../invariants.md#inv-rm-003-every-remote-call-is-bounded-by-a-timeout)
> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-010](../../core/urs.md#urs-br-010-detect-a-plugin-that-waits-forever)

```
REQUIREMENT: A callback MUST run with a deadline no later than the remaining
             deadline of the host-to-guest call it belongs to, and MUST be
             interrupted when that call ends for any reason.
```

```
REQUIREMENT: A callback MUST run inside `CallerContext.serve({ actor,
             annotations })` (core BEH-BR-292), where `actor` is the token's
             actor and `annotations` the token's annotations decoded with
             `Annotations.decode` against the keys known to `Remote.layer`
             (core BEH-BR-296), combined into the fiber's bag, never
             replacing it. Any mutating operation it reaches through a
             granted service is then attributed to that actor by the core
             (BEH-BR-187), with the link — the principal of the fiber it
             runs in — recorded as `onBehalfOf` (core behaviour 28,
             BEH-BR-259), and the "audit"-flow keys of those annotations on
             its records (core BEH-BR-293).
```

```
REQUIREMENT: A token's `correlationId` MUST be the calling fiber's
             `CurrentCorrelation` at mint (core BEH-BR-187). A callback MUST
             run inside `CallerContext.serve({ actor, annotations,
             correlationId })` with the token's `correlationId`, so that
             `CurrentCorrelation` is set for the callback's work and every
             mutating operation it reaches carries the caller's correlation
             (core BEH-BR-292, gap G58 closed by CCR-BR-026). The callback
             fiber MUST also carry `HostLink.reference` set to `host.link`
             (core BEH-BR-250), as for served calls (BEH-RM-039).
```

## BEH-RM-046: Every boundary crossing is offered to the CallLog

> **Invariant:** [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-RM-004](../risks.md#rsk-rm-004)

```ts
// illustrative — not type-checked
// entries are offered through Host.offerCallEntry (core BEH-BR-280); the fields Remote fills:
//
//   host-to-guest call      kind "crossing", crossing { direction: "outbound", link, peer?, epoch }
//   callback (admitted)     kind "crossing", crossing { direction: "inbound",  link, peer?, epoch }
//   served call (BEH-RM-039) kind "crossing", crossing { direction: "inbound",  link, peer?, epoch }
//   refused callback, refused served call, placement or budget refusal
//                           kind "refusal",  refusal  { stage: "boundary", reason: <refusal tag> }
//   boundary revocation     kind "revocation", revocation { link, epoch?, reason } (BEH-RM-014)
//
// common: companion "@bridger/remote"; serviceId = the contract's ServiceId; member = the method;
// outcome: a result → "success"; a typed failure → "failure" (errorTag its tag); RemoteDefect → "defect";
//          RemoteTimeout, SessionLost, cancellation (outcome "unknown" or "not-executed") → "interrupted",
//          errorTag the remote tag; a boundary refusal → "refused"
// callId = the remote callId; inbound entries: consumer = { kind: "remote", principal: claims.onBehalfOf
// (the PrincipalRef.encode string, recorded unchanged), host?: the peer's host id when the transport names one }
// epoch = the epoch string of the session or served connection that carried the call (BEH-RM-010, BEH-RM-039),
// unchanged; core types it as an opaque string (BEH-BR-280, CCR-BR-027). A revocation carries it when a session was open
```

```
REQUIREMENT: When the core `CallLog` port is wired, the remote package MUST
             offer it, through `Host.offerCallEntry` (core BEH-BR-280), one
             entry per host-to-guest call at its end, one per callback at
             its end and one per served call at its end, with the kinds and
             fields above, including every refused callback or served call
             as a "refusal" entry. Entries MUST carry no payload, result
             value, error message, `TokenRef` or annotation value placed by
             this package; "callLog"-flow annotations reach them only by
             core's rules (BEH-BR-293). Every "crossing" entry MUST carry
             `epoch`, the epoch string of the session or served connection
             that carried the call, unchanged; a "revocation" entry MUST
             carry it when a session was open at the revocation. An offer
             that fails with `InvalidCallEntry` is a defect of this package
             and MUST be logged at error level.
```

```
REQUIREMENT: The `CallLog` failure policy is the core's (core BEH-BR-279).
             For each offer the remote package MUST pass `onFailure`
             "refuse" for an inbound crossing of a callback — so that a
             `CallLog` outage refuses the callback with `CallbackDenied`
             instead of admitting it unlogged — and MUST leave the port's
             own `onFailure` for every other entry. The remote package MUST
             NOT buffer entries beyond what that policy allows.
```

**Settled here.** One log of access: core's entry kinds (core BEH-BR-280)
cover a call leaving for a guest, a callback arriving, a served call, a
boundary refusal and a revocation, so a deployment reads remote crossings
in the same log as captured calls, with the same correlation and identifiers
(core gap G43, closed by CCR-BR-026). A callback is the one crossing that
is refused when it cannot be logged: it reaches host services on a guest's
request, which is the access a per-plugin access log exists to show.

## BEH-RM-047: Tokens never become values in logs, status or audit, and annotations follow core flows

> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md), [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md)
> **Satisfies:** [URS-BR-007](../../core/urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)
> **Risk:** [RSK-RM-009](../risks.md#rsk-rm-009), [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: A `TokenRef` MUST NOT appear in a log line, a span attribute,
             `RemoteStatus`, a host event or a `CallLog` entry. Logs MAY carry
             the `tokenId` claim, which grants nothing.
```

```
REQUIREMENT: Annotations MUST reach a record only where the flows of core
             30 put them — `CallLog` entries for "callLog" keys, audit
             records of a callback's mutating calls for "audit" keys (core
             BEH-BR-293) — and the guest only through `GuestContext`
             (BEH-RM-024). They MUST NOT appear in `RemoteStatus` and MUST
             NOT be used as metric labels (BEH-BR-117).
```

## BEH-RM-048: A duplicated callback runs nothing again

> **Invariant:** [INV-RM-010](../invariants.md#inv-rm-010-within-one-parent-call-a-callback-executes-at-most-once)
> **See:** [ADR-RM-003](../decisions/003-sessions-carry-epochs.md), [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-001](../risks.md#rsk-rm-001)

```
REQUIREMENT: For each host-to-guest call in flight, the host end MUST keep
             the `callId` of every callback admitted past step 4 of
             BEH-RM-043, and its `callback-result` once sent, until the
             parent call ends. A callback frame whose `callId` is already
             kept MUST NOT run anything: it MUST be answered with the stored
             `callback-result` when one exists, and dropped while the first
             is still running. Neither case MUST be offered to the
             `CallLog` a second time.
```

```
REQUIREMENT: The memory this needs MUST be bounded by the parent call: it
             is released when the parent ends, and a parent's callbacks are
             bounded by its deadline (BEH-RM-045).
```

**Settled here.** Transports that duplicate frames (`reliable: false`,
BEH-RM-050) would otherwise run a host service twice for one guest request
— an egress request sent twice — which is the hazard of
[RSK-RM-001](../risks.md#rsk-rm-001) in the other direction.

---

_Previous: [05 — Guest](./05-guest-serve.md)_ · _Next: [07 — Transports and Adapters](./07-transports-and-adapters.md)_
