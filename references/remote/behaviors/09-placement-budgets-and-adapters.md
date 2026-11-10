# 09 — Placement, Budgets and Adapters

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-BEH-09                                            |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.4 (2026-11-10): round 2 follow-up: `DedupeUnavailable` declared (BEH-RM-067) (CCR-RM-005)<br>0.3 (2026-11-09): Specification audit of 2026-11-09 (F-07, F-06): BEH-RM-065 `WireClaims.org` sent only when the link discloses "org"; new BEH-RM-072 `Transport.fromBundle` and `BundleRuntime`, starting a guest from the bytes the loader verified at each session attempt (CCR-RM-004)<br>0.2 (2026-11-08): Round-2 agent review (R4 F14, F17, F18, F19, F20; R5-09) — the link checks the calling fiber's own residency label before sending; `Transport.postMessage` gains the "opaque" mode for frames sandboxed without allow-same-origin (ready message checked by `event.source` and a one-time nonce, port posted once with "*" to that window); trust-boundary sentence narrowed to other windows and frames; `DedupeStore` claim after the refusal checks, "running" answered `InProgress`, retention option and residual stated (CCR-RM-003)<br>0.1 (2026-11-08): Initial draft — round 2: recheck items 20 and 23 (organisation claim, per-principal budgets, `DedupeStore`, residency placement, `Transport.postMessage`, Workers for Platforms adapter) (CCR-RM-003) |

---

A remote link reaches code in another place. Four things about that place
are not yet stated by files 01–08: which organisation a call is made for,
how much a principal may consume there, how a per-call runtime that spreads
invocations over a pool keeps the at-most-once rule, and whether the place
is one where the call's data may go at all. This file also names two
adapters — a `postMessage` transport for code in a sandboxed browser frame,
and a Workers for Platforms adapter — and the bundle transport through which
a guest is started from bytes the loader companion verified. This file owns
BEH-RM-065–072 and uses all eight.

Planned source: `packages/remote/src/Placement.ts`,
`packages/remote/src/Budget.ts`, `packages/remote/src/Dedupe.ts`,
`packages/remote/src/PostMessage.ts`; adapter in
`packages/workers-for-platforms/` *(Planned)*.

> **What this file does not do.** It does not make a label true. A residency
> label, an organisation claim or a transport's declared labels are strings
> written by the consumer; this package compares them and refuses on a
> mismatch. Whether data really stays in a region, or a frame really is
> sandboxed, is the deployment's property, never Bridger's
> ([ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md),
> [ADR-RM-010](../decisions/010-placement-labels-compared-at-the-boundary.md)).

## BEH-RM-065: A token carries an opaque organisation claim

> **Invariant:** [INV-RM-007](../invariants.md#inv-rm-007-a-guest-reaches-only-granted-contracts-under-a-live-token)
> **See:** [ADR-RM-005](../decisions/005-per-call-capability-tokens.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-RM-009](../risks.md#rsk-rm-009)

```ts
// illustrative — not type-checked
// Context.Service "@bridger/remote/OrgOf" — optional; provided by the application
interface OrgOf {
  // synchronous and pure: the organisation the calling fiber acts for, if any
  readonly current: (caller: { readonly actor: Actor; readonly annotations: Annotations }) => Option.Option<string>
}
// TokenClaims.org?: string and WireClaims.org?: string (06, 01)
```

```
REQUIREMENT: When `OrgOf` is provided to `Remote.layer`, the link MUST set
             `TokenClaims.org` at mint to the value it returns for the
             calling fiber, and MUST omit it when it returns `None` or is
             not provided. A throw MUST be treated as `None` and logged at
             error level. `WireClaims.org` MUST be set to the same value
             only when the link lists "org" in `RemoteOptions.disclose`
             (03, BEH-RM-024); otherwise the organisation stays on the host,
             where the budget and the callback admission read it from the
             token.
```

```
REQUIREMENT: The remote package MUST NOT parse, compare or authorize on
             `org` itself. It MUST pass it to the `PrincipalBudget`
             (BEH-RM-066) and to `CallbackAdmission` (06), to the guest
             through `GuestContext.claims` only when disclosed, and MUST NOT
             place it in `RemoteStatus`, a metric label or a host event.
```

**Settled here.** Bridger has no tenant concept; the claim is a string the
application chooses — a tenant, an account, a partner — so that a guest
pool serving several organisations can keep their work apart in its own
storage, and a budget can count per organisation. Taking it from a port
rather than from an annotation, and sending it only when the link discloses
it, keeps it off the wire unless the application asks for it. The claim is a description: a guest that trusts it trusts the
host that minted the token, as for every claim (BEH-RM-024).

## BEH-RM-066: Per-principal budgets for call rate, CPU time and egress

> **See:** [ADR-RM-004](../decisions/004-bounded-calls-and-peer-free-lifecycle.md)
> **Satisfies:** [URS-BR-034](../../core/urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call)
> **Risk:** [RSK-RM-007](../risks.md#rsk-rm-007)

```ts
// illustrative — not type-checked
interface TransportUsage {                       // reported by an adapter per invocation or per call
  readonly callId: string
  readonly cpuMs?: number                        // as the runtime reports it; absent when it cannot
  readonly wallMs: number
  readonly egressBytes?: number                  // bytes sent through the adapter's egress route
  readonly subrequests?: number
}
interface TransportProfile { /* 07 */ readonly reportsUsage?: readonly ("cpuMs" | "egressBytes" | "subrequests")[] }

interface BudgetSubject {
  readonly principal?: string                    // PrincipalRef.encode of the caller's principal, when it has one
  readonly actor: string                         // actor id
  readonly org?: string                          // BEH-RM-065
  readonly link: string
}
// Context.Service "@bridger/remote/PrincipalBudget" — optional; provided by the application
interface PrincipalBudget {
  readonly admit: (s: BudgetSubject) => Effect.Effect<"admit" | { readonly refuse: string }>   // before each call
  readonly charge: (s: BudgetSubject, usage: TransportUsage) => Effect.Effect<void>             // after each call
}
class RemoteBudgetExceeded extends Schema.TaggedError<RemoteBudgetExceeded>()("RemoteBudgetExceeded", {
  link: Schema.String, reason: Schema.String          // outcome "not-executed"
}) {}
```

```
REQUIREMENT: An adapter MUST state in `TransportProfile.reportsUsage` which
             measures it reports, and MUST report each through
             `Connection.usage` (an optional `Stream<TransportUsage>`) for
             every call it carried. A measure not listed MUST NOT be
             estimated by the remote package.
```

```
REQUIREMENT: When a `PrincipalBudget` is provided, the link MUST call
             `admit` before minting the token of each host-to-guest call,
             bounded by the call's deadline. A refusal MUST fail the call
             with `RemoteBudgetExceeded` (`outcome: "not-executed"`),
             send no frame and be offered to the `CallLog` as a "refusal"
             entry with `refusal.reason` "budget-exceeded" (06). A failure,
             defect or timeout of `admit` MUST be treated as a refusal.
```

```
REQUIREMENT: The link MUST call `charge` once per call with the usage the
             transport reported for it, after the call ended, in the
             background, best effort; a missing report MUST be charged with
             `wallMs` only. `charge` MUST NOT change the call's outcome.
```

```
REQUIREMENT: Callbacks MUST be admitted against the same budget with the
             token's subject before step 4 of BEH-RM-043; a refusal answers
             the callback with `Refused`, reason "budget-exceeded".
```

**Settled here.** The budget's arithmetic — windows, quotas, what a CPU
millisecond costs — is the application's; this package fixes where the
check and the charge happen and that a refused call never leaves the host.
Charging after the call means one call may overrun a budget; a runtime
limit per invocation (BEH-RM-071) is what bounds a single call.

## BEH-RM-067: A DedupeStore keeps at-most-once across invocations on per-call transports

> **Invariant:** [INV-RM-009](../invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest)
> **See:** [ADR-RM-007](../decisions/007-stateless-guests.md), [ADR-RM-003](../decisions/003-sessions-carry-epochs.md)
> **Satisfies:** [URS-BR-005](../../core/urs.md#urs-br-005-never-lose-a-provider-in-the-middle-of-a-call)
> **Risk:** [RSK-RM-001](../risks.md#rsk-rm-001)

```ts
// illustrative — not type-checked
interface DedupeKey { readonly link: string; readonly epoch: string; readonly callId: string }
// Context.Service "@bridger/remote/DedupeStore" — supplied to Guest.serve by the guest's deployment
interface DedupeStore {
  // atomically: the first claimant of a key gets "run"; later claimants see the stored result or "running";
  // the store keeps a key for `retention`, measured on the store's own clock
  readonly claim: (key: DedupeKey, retention: Duration.Duration) =>
    Effect.Effect<"run" | { readonly running: true } | { readonly result: Uint8Array }, DedupeUnavailable>
  readonly complete: (key: DedupeKey, result: Uint8Array) => Effect.Effect<void, DedupeUnavailable>
}
class DedupeUnavailable extends Schema.TaggedError<DedupeUnavailable>()("DedupeUnavailable", {
  message: Schema.String
}) {}
// Guest.serve options gain: dedupe?: DedupeStore | "idempotent-handlers"
//                           dedupeRetention?: Duration.Input   // default 1 hour
```

```
REQUIREMENT: On a transport with `liveness: "per-call"`, `Guest.serve` MUST
             be given either a `DedupeStore` or the explicit value
             "idempotent-handlers"; with neither, it MUST fail to start
             with `GuestTransportError { reason: "no-dedupe" }`.
```

```
REQUIREMENT: With a `DedupeStore`, after the four checks of BEH-RM-035
             (epoch, duplicate within the invocation, in-flight limit,
             positive `remaining`) and before decoding the payload, the
             guest MUST call `claim` with (link, epoch, `callId`) and a
             `retention` of the larger of `dedupeRetention` and the call's
             `remaining` plus the adapter's `closeNotice`. It MUST run the
             handler only on "run"; on a stored result it MUST resend that
             result; on "running" it MUST answer with an `InProgress` exit
             (01, 03), never drop the frame, because on a request/response
             runtime a dropped answer surfaces at the host as a transport
             failure. After the handler ends it MUST call `complete` with
             the encoded `result` frame before sending it. A copy refused
             by one of the four checks MUST NOT call `claim`.
```

```
REQUIREMENT: Documentation MUST state the residual: `remaining` is a
             relative duration carried unchanged in every copy, and the
             guest's clock decides nothing, so a copy that a transport
             delivers after the key's retention has expired is claimed
             afresh and runs again. At-most-once therefore holds only for
             copies that reach the store within `retention`
             (INV-RM-009, [RSK-RM-001](../risks.md#rsk-rm-001)); a
             deployment whose runtime can redeliver later than that MUST
             raise `dedupeRetention` or make the handler idempotent.
```

```
REQUIREMENT: A `DedupeUnavailable` from `claim` MUST be answered with a
             `Refused` exit, reason "busy", and the handler MUST NOT run;
             from `complete`, the result MUST still be sent and the failure
             logged. Documentation MUST state that the store's atomicity
             and retention are the deployment's, and that this package
             makes no persistence claim for it.
```

**Settled here.** A Workers for Platforms dispatch namespace or a pool of
workerd processes can deliver two copies of one `call` to two isolates
that share nothing; a table inside one guest cannot see the other copy
([INV-RM-009](../invariants.md#inv-rm-009-within-one-session-a-call-executes-at-most-once-on-a-conforming-guest)).
Moving the table to a store both isolates reach — a coordinating object of
the provider, a key-value service — restores the rule for every invocation
that reaches the same store. Refusing when the store cannot answer keeps
the failure on the "not executed" side.

## BEH-RM-068: Transports and routes declare the residency labels they offer

> **Invariant:** [INV-RM-011](../invariants.md#inv-rm-011-no-call-crosses-a-transport-that-does-not-offer-its-residency-label)
> **See:** [ADR-RM-010](../decisions/010-placement-labels-compared-at-the-boundary.md), [ADR-BR-041](../../core/decisions/041-manifest-as-data.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-RM-014](../risks.md#rsk-rm-014)

```ts
// illustrative — not type-checked
interface TransportProfile { /* 07 */ readonly residency?: readonly string[] }   // labels this route offers; absent = none

interface PlacementRequest {
  readonly subject: { readonly kind: "link" | "served" | "import" | "export" | "route"; readonly id: string }
  readonly required?: string               // the manifest's `residency`, or the call's annotation (BEH-RM-069)
  readonly offered: readonly string[]      // the transport's or route's declared labels
}
// Context.Service "@bridger/remote/PlacementPolicy"
interface PlacementPolicy {
  // synchronous and pure; Some(reason) refuses
  readonly refuses: (request: PlacementRequest) => Option.Option<string>
}
declare const PlacementPolicy: {
  // the default: refuse when `required` is set and not an element of `offered` (string equality)
  readonly exact: PlacementPolicy
}
class PlacementRefused extends Schema.TaggedError<PlacementRefused>()("PlacementRefused", {
  subject: Schema.String, required: Schema.String, offered: Schema.Array(Schema.String), reason: Schema.String
}) {}
```

```
REQUIREMENT: `Remote.layer` MUST provide `PlacementPolicy.exact` unless the
             application provides another `PlacementPolicy`. A policy MUST
             be total: a throw or a value other than `None` or `Some` of a
             non-empty string MUST be treated as a refusal with reason
             "policy-defect".
```

```
REQUIREMENT: A link's required label MUST be `RemoteOptions.residency`, or,
             absent that, the `residency` of the link definition's manifest
             (core BEH-BR-241). `Remote.define` MUST evaluate the policy
             against `transport.profile.residency` and, on a refusal, MUST
             return a definition whose build fails with `PlacementRefused`,
             so that `install` leaves the link `failed` with that tag and no
             session ever opens. Before each session attempt the link MUST
             evaluate the policy again (the transport's profile may differ
             after `reconfigure`) and, on a refusal, MUST open no session
             and report `PlacementRefused` in `LinkStatus`.
```

```
REQUIREMENT: A link without a required label MUST NOT be refused on
             placement. A required label with a transport that declares no
             labels MUST be refused by `PlacementPolicy.exact`.
```

```
REQUIREMENT: The remote package MUST NOT read a residency label for any
             other purpose, and documentation MUST state that the label and
             the declared labels are the consumer's assertions, compared as
             strings, and that Bridger verifies neither.
```

**Settled here.** Core carries the manifest's `residency` and never
enforces it ([ADR-BR-041](../../core/decisions/041-manifest-as-data.md));
a process boundary is where a check has something to compare against,
because only there does the call leave for a place the transport describes.
The check runs at definition, so a mismatch fails at install rather than at
the first call, and again at each session, because a transport is
configuration. A gate that wants to refuse the install itself can read
`OperationRequest.definition.manifest.residency` (core BEH-BR-219) and the
same policy; that composition is the application's.

## BEH-RM-069: The residency label travels as a wire annotation and is checked by the serving end

> **Invariant:** [INV-RM-011](../invariants.md#inv-rm-011-no-call-crosses-a-transport-that-does-not-offer-its-residency-label)
> **See:** [ADR-RM-010](../decisions/010-placement-labels-compared-at-the-boundary.md), [ADR-BR-045](../../core/decisions/045-operation-context-annotations.md)
> **Depends on:** [core 30 — Operation context annotations](../../core/behaviors/30-operation-context-annotations.md) (`Annotation.key`, flow "wire"; BEH-BR-289, BEH-BR-296)
> **Risk:** [RSK-RM-014](../risks.md#rsk-rm-014)

```ts
// illustrative — not type-checked
Placement.Residency    // Annotation.key<string>("placement/residency", {
                       //   schema: Schema.String, combine: (first, _) => first, monotonic: true,
                       //   flows: ["gate", "policy", "callLog", "audit", "wire"] })
```

```
REQUIREMENT: The link MUST run each host-to-guest call with
             `Placement.Residency` added to the calling fiber's annotations
             when the link has a required label, so that the label is sent
             in the `call` frame's encoded annotations (BEH-RM-024) and, by
             core's flows, reaches the `CallLog` and the audit records of
             mutating work the call causes. Because the key is monotonic
             and keeps its first value, a call already carrying a label
             keeps that label.
```

```
REQUIREMENT: Before sending each host-to-guest call, the link MUST also
             evaluate the `PlacementPolicy` with `subject.kind` "link",
             `required` the calling fiber's own `placement/residency` label
             when it carries one, and `offered` the labels of the link's
             `transport.profile.residency`, whatever the link's own
             required label is (including none). A refusal MUST fail the
             call with `PlacementRefused` (`outcome: "not-executed"`), send
             no frame, and be offered to the `CallLog` as a "refusal" entry
             with `refusal.reason` "placement-refused", so that a labelled
             payload never crosses to an end that would only refuse it
             after receiving it.
```

```
REQUIREMENT: `Guest.serve` and `Remote.serve` MUST decode
             `Placement.Residency` (it is among the keys `Remote.layer`
             declares) and, when the call carries a label, MUST evaluate the
             `PlacementPolicy` with `subject.kind` "served", `required` the
             label and `offered` the labels of their own `GuestTransport`
             profile. A refusal MUST be answered with a `Refused` exit,
             reason "placement-refused", before the payload is decoded and
             before any lease, and offered to the `CallLog` as a "refusal"
             entry with `refusal.reason` "placement-refused".
```

```
REQUIREMENT: A label received in a callback's token MUST be checked the
             same way by the host against the profile of the link's
             transport before step 4 of BEH-RM-043.
```

**Settled here.** Carrying the label as an annotation, not as a frame field,
reuses core's single statement of which labels cross hosts and where they
are recorded (core BEH-BR-296, BEH-BR-293), so the trail shows the label a
change was made under. Checking it again at the serving end protects the
other direction: work that arrives labelled for a place this end does not
claim to be is refused, not run. Core compares nothing; this package
compares strings.

## BEH-RM-070: Transport.postMessage — a transport to code in a sandboxed browser frame

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md)
> **Satisfies:** [URS-BR-041](../../core/urs.md#urs-br-041-use-plugin-code-that-runs-outside-the-host-process)
> **Risk:** [RSK-RM-015](../risks.md#rsk-rm-015), [RSK-RM-005](../risks.md#rsk-rm-005)

```ts
// illustrative — not type-checked
// host page (entry @bridger/remote)
Transport.postMessage(options: {
  readonly frame: () => HTMLIFrameElement        // the frame to open a channel to; read in `open`, never at define
  readonly targetOrigin: string | "opaque"       // the frame document's exact origin, or "opaque" for a frame sandboxed
                                                 // without allow-same-origin (srcdoc, blob:); "*" is refused
  readonly endpoint?: string                     // a name told to the guest, default "bridger"
  readonly residency?: readonly string[]         // BEH-RM-068
  readonly connectTimeout?: Duration.Input       // default 10 seconds
}): Transport
Transport.postMessage.nonce: () => Effect.Effect<string>   // one-time connection nonce, from IdGenerator; the
                                                           // application puts it in the frame's `name` or src fragment

// frame document (entry @bridger/remote/guest)
GuestTransport.postMessage(options: {
  readonly allowedOrigins: readonly string[]     // exact origins of host pages allowed to connect; "*" is refused
  readonly endpoint?: string                     // default "bridger"
  readonly residency?: readonly string[]
}): GuestTransport

// handshake, exact origin: the host creates a MessageChannel and posts once to the frame's window
//   frame.contentWindow.postMessage({ bridger: "remote-postmessage/1", endpoint }, targetOrigin, [port2])
// handshake, "opaque" (the frame's origin is "null" and cannot be named):
//   1. guest → parent:  { bridger: "remote-postmessage/1", endpoint, ready: nonce }   (nonce read from window.name or location.hash)
//   2. host checks event.source === frame.contentWindow and ready === the nonce it issued for this frame, then consumes it
//   3. host → frame.contentWindow.postMessage({ bridger: "remote-postmessage/1", endpoint, nonce }, "*", [port2]) — once
// in both modes every later frame travels on the MessagePort, never on window.postMessage
// profile: { adapter: "@bridger/remote/postMessage", liveness: "heartbeat", ordered: true, reliable: true,
//            isolationProvidedBy: "the browser's sandboxing of the frame, as configured by the consumer" }
```

```
REQUIREMENT: `Transport.postMessage` MUST refuse a `targetOrigin` of "*" or
             one that is neither "opaque" nor a serialized origin, by
             failing `open` with `TransportError`. `open` MUST read
             `frame()` only when called, MUST create a new `MessageChannel`
             per connection, MUST transfer its port to the frame's window in
             exactly one message carrying the handshake object, and MUST
             move every further frame over that port. Closing the
             connection MUST close the port.
```

```
REQUIREMENT: With `targetOrigin` "opaque", `open` MUST first check that the
             frame has a `sandbox` attribute that does not contain
             "allow-same-origin", else fail with `TransportError` — a
             configuration check, not isolation. It MUST then listen on the
             host window for one `message` event whose `source` is exactly
             `frame().contentWindow` and whose data is the `ready` object of
             the same `endpoint` carrying a nonce issued by
             `Transport.postMessage.nonce` for this connection and not yet
             used; every other message MUST be ignored without reading
             further. On that event it MUST consume the nonce, post the
             handshake with the nonce and the transferred port to
             `frame().contentWindow` with target origin "*" exactly once,
             and stop listening on the window. No `ready` before
             `connectTimeout` MUST fail `open` with `TransportError`, and
             the nonce MUST NOT be accepted afterwards.
```

```
REQUIREMENT: `GuestTransport.postMessage` MUST accept a connection only from
             a `message` event whose `origin` is an exact element of
             `allowedOrigins`, whose `source` is the frame's `parent`, whose
             data is the handshake object of the same `endpoint` — echoing
             the nonce it sent in `ready`, when it sent one — and which
             transfers exactly one `MessagePort`. In a frame whose own
             origin is opaque it MUST send `ready` to `parent` once, with
             the nonce read from `window.name` or the location fragment and
             a target origin that is an element of `allowedOrigins`. Every
             other message MUST be ignored and logged at debug level without
             reading further.
```

```
REQUIREMENT: Frames MUST be sent as `Uint8Array` values (BEH-RM-049); the
             transport MUST NOT send structured objects, functions or
             transferables other than the handshake port.
```

```
REQUIREMENT: Documentation MUST state that the frame's isolation is the
             browser's and the consumer's — the frame's `sandbox` attribute
             (which must not include `allow-same-origin` together with
             `allow-scripts` when the frame's content is untrusted), its
             content security policy and its origin — and that Bridger
             checks none of them beyond the attribute precondition of the
             "opaque" mode. It MUST state that a frame served from the host
             page's own origin with `allow-same-origin` can reach the host
             page directly, so this transport separates nothing in that
             configuration. For the "opaque" mode it MUST state the
             residual: the handshake is posted with target origin "*" to
             one window, so a document that replaced the frame's document
             between `ready` and the handshake — a navigation the
             consumer's sandbox flags did not prevent — would receive the
             port; the nonce proves only that the document which sent
             `ready` read the frame's name or fragment, and the peer on the
             port is treated as untrusted in every mode.
```

```
REQUIREMENT: The transport MUST pass the transport conformance suite
             (BEH-RM-061, check 26) in a browser test runner, in both
             modes.
```

**Settled here.** (1) A `MessageChannel` per connection rather than
`window.postMessage` for every frame: once the port is transferred, no other
window or frame can inject frames into the session, and the origin (or, in
the "opaque" mode, the source and nonce) check happens once, on the message
that carries the port. Scripts running in the host page's own realm are
inside the trust boundary: they can wrap `MessageChannel` or
`MessagePort.prototype` before the transport runs, and nothing here
prevents that. (2) The "opaque" mode exists because a frame sandboxed
without `allow-same-origin` — the configuration untrusted content needs —
has the origin "null", which no `targetOrigin` other than "*" can reach;
the source check on the host window and the one-time nonce take the place
of the origin check, and the frame never gets `allow-same-origin`. This is
the cross-tree decision recorded with the user-interface companion
documentation (`docs/REACT-UI-PLUGINS.md` §3.7). (3) The name is
`Transport.postMessage` because that documentation mounts one session per
frame through it; one link per mounted frame keeps one epoch per frame, so
a reloaded frame is a new session and a stale reply from the previous
document is refused (BEH-RM-011). (4) A heartbeat transport: a frame
removed from the page closes no port, so liveness is learnt from missed
heartbeats (04).

## BEH-RM-071: The Workers for Platforms adapter

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md), [ADR-RM-007](../decisions/007-stateless-guests.md)
> **Satisfies:** [URS-BR-041](../../core/urs.md#urs-br-041-use-plugin-code-that-runs-outside-the-host-process)
> **Risk:** [RSK-RM-006](../risks.md#rsk-rm-006), [RSK-RM-007](../risks.md#rsk-rm-007), [RSK-RM-001](../risks.md#rsk-rm-001)

```ts
// illustrative — not type-checked
// package @bridger/workers-for-platforms
WorkersForPlatforms.transport(options: {
  readonly namespace: DispatchNamespaceBinding    // the provider's dispatch namespace binding
  readonly script: string                         // the user worker's script name in the namespace
  readonly limits?: { readonly cpuMs?: number; readonly subrequests?: number }   // per invocation, passed to the provider
  readonly outbound?: { readonly worker: string; readonly params?: Record<string, string> }  // egress route
  readonly residency?: readonly string[]          // BEH-RM-068; the consumer's statement of where the namespace runs
}): Transport
// profile: { adapter: "@bridger/workers-for-platforms", liveness: "per-call", ordered: false, reliable: false,
//            reportsUsage: as the provider exposes per invocation, isolationProvidedBy: "the provider's isolates" }
```

```
REQUIREMENT: The adapter MUST meet the obligations of BEH-RM-052 and
             BEH-RM-054: `liveness: "per-call"`, each invocation stateless,
             per-call context in the frame only, eviction treated as a
             transport failure of the calls in flight, and provider limits
             enforced by failing `open` with `TransportError`, never by
             waiting.
```

```
REQUIREMENT: The adapter MUST pass `limits` to the provider on every
             dispatch when given, MUST route the user worker's egress
             through `outbound` when given, and documentation MUST state
             that without `outbound` the user worker's network access is
             whatever the provider grants by default.
```

```
REQUIREMENT: The guest end MUST be built with `Guest.serve` and a
             `DedupeStore` (BEH-RM-067) reachable from every invocation of
             the script, or with "idempotent-handlers" stated; the adapter's
             documentation MUST show the first.
```

```
REQUIREMENT: The adapter MUST report usage (BEH-RM-066) only for the
             measures the provider returns for an invocation, and MUST NOT
             estimate CPU time from wall time.
```

**Settled here.** Workers for Platforms runs many customers' scripts in one
dispatch namespace, which is the shape of a partner marketplace; it differs
from the Worker Loader adapter (BEH-RM-054) in that the script is deployed
ahead of time under a name rather than loaded from bytes per request. Its
per-invocation limits are the runtime's bound on one call, which a
`PrincipalBudget` cannot give. The limit names and values are the
provider's and may change; the adapter reads them from configuration.

## BEH-RM-072: Transport.fromBundle starts a guest from bytes it is given

> **See:** [ADR-RM-006](../decisions/006-isolation-comes-from-the-host.md), [ADR-RM-001](../decisions/001-remote-plugin-is-a-local-proxy.md)
> **Satisfies:** [URS-BR-041](../../core/urs.md#urs-br-041-use-plugin-code-that-runs-outside-the-host-process), [URS-BR-020](../../core/urs.md#urs-br-020-load-plugin-definitions-dynamically-while-running)
> **Risk:** [RSK-RM-005](../risks.md#rsk-rm-005), [RSK-RM-003](../risks.md#rsk-rm-003)

```ts
// illustrative — not type-checked
interface GuestBundle {
  readonly digest: string                         // the package digest the bytes were verified under, opaque here
  readonly files: ReadonlyMap<string, Uint8Array> // path → content, as verified
  readonly entry: { readonly file: string; readonly export: string }   // the guest's entry, one of `files`
}
interface BundleRuntime {                         // offered by an adapter that can start a guest from bytes
  readonly profile: TransportProfile
  readonly start: (bundle: GuestBundle) => Effect.Effect<Connection, TransportError, Scope.Scope>
}
declare const Transport: {
  // ... multiplex (07, BEH-RM-056), postMessage (BEH-RM-070)
  readonly fromBundle: (runtime: BundleRuntime, acquire: Effect.Effect<GuestBundle, TransportError>) => Transport
}
```

```
REQUIREMENT: `Transport.fromBundle` MUST return a `Transport` whose
             `profile` is `runtime.profile` and whose `open` runs `acquire`
             and then `runtime.start` with the bundle `acquire` returned,
             afresh on every call of `open`: no bundle MUST be cached from
             one session attempt to the next. A failure of either MUST fail
             `open` with its `TransportError`, so that the link reports it
             and retries on its own schedule (02, BEH-RM-012); `open` MUST
             NOT fail the link's build.
```

```
REQUIREMENT: `runtime.start` MUST start the guest from the bytes of the
             `GuestBundle` it is given, held in memory or passed to the
             runtime directly, and MUST NOT read the guest's code again from
             a source, a URL or a path that another principal can write
             between `acquire` and evaluation. Module resolution in the
             guest MUST be closed to the bundle's own `files` and the guest
             runtime the adapter supplies; the guest MUST be started at
             `entry`. This is the remote side of the loader companion's
             hand-over: the loader verifies the bytes and hands them over
             ([BEH-LD-039](../../loader/behaviors/05-catalog-and-lazy-loading.md),
             [BEH-LD-068](../../loader/behaviors/09-trust-class-and-guest-links.md)),
             and an adapter's `BundleRuntime` is where the obligation that
             the guest runs exactly those bytes lives.
```

```
REQUIREMENT: The adapters that can start a guest from bytes —
             `@bridger/worker`, `@bridger/worker-loader` and
             `@bridger/workerd` — MAY offer a `BundleRuntime`; one that does
             MUST meet the adapter obligations of BEH-RM-052 for it and MUST
             pass the bundle conformance cases of BEH-RM-061 (check 47).
             `@bridger/workers-for-platforms` deploys scripts ahead of time
             under a name (BEH-RM-071) and MUST NOT offer one.
```

```
REQUIREMENT: The remote package MUST NOT verify a `GuestBundle`: `digest`
             is carried for logs and status only. Documentation MUST state
             that `fromBundle` checks no signature and no digest, that
             verification is `acquire`'s (for example the loader companion's
             `fetchVerified`), and that starting a guest from verified bytes
             isolates nothing: confinement is the runtime's and the
             deployment's (07, BEH-RM-053).
```

**Settled here.** (1) The bundle is acquired at each session attempt, not
when the link is defined, so the link's definition stays inert (BEH-RM-001),
a desired list of guest links reconciles without fetching code, and every
new session runs on bytes checked against the current trust configuration
and revocation set. (2) A fetch or a verification refusal is a failed
`open`, which is an availability condition for dependents, not a sticky
failure of the link: the link keeps trying on its schedule, and a revoked
digest is refused before `open` is called by the boundary check of
BEH-RM-014.

---

_Previous: [08 — Test Transport and Acceptance](./08-test-transport-and-acceptance.md)_
