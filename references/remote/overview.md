# Overview — Remote Companion

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-OVW                                               |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview                          |
> | Change History | 0.6 (2026-11-10): Specification audit of 2026-11-10 (SPEC-AUDIT-03, review of the round) — names core's `CurrentTransition` export beside `HeldPlugins` (BEH-RM-022) (CCR-RM-006)<br>0.5 (2026-11-09): Specification audit of 2026-11-09: `RemoteOptions.manifest` and `disclose`, `LinkStatus` disclosed claims, `OrgOf` on the wire only when disclosed, `Transport.fromBundle`; loader's `RevokedDigests` and `LoaderRemote.link` in the package boundary; error `LocalContractRefused` (BEH-RM-007); call-log entries name the disclosed claims (core CCR-BR-033) (CCR-RM-004)<br>0.4 (2026-11-08): round 2: recheck items 20, 23 and 25 — API rows for file 09, errors `PlacementRefused` and `RemoteBudgetExceeded`, core seams G43, G57, G58 and G60 cited as closed (CCR-RM-003)<br>0.3 (2026-11-08): resolutions of the agent review of 2026-11-08 — claim narrowed to the link and session child as plugins, with the finalizer deviation; `Remote.serve`, multiplexer, `CallbackAdmission`, `CallbackDenied`, `MethodNotServed`; wire annotations (R3-01, R3-09, R3-10, R3-11) (CCR-RM-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-RM-001)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Mission

`@bridger/remote` lets a Bridger host use a plugin whose code runs elsewhere —
a worker thread, another process, an isolate, another host — as if it were
local. The remote code implements a versioned contract with `Guest.serve`;
the host installs `Remote.define(contract, { transport })`, an ordinary
plugin. The rules of the core — leases, dependents-first removal, the
legality table, attribution, the gate, `reconcile` — apply to the link and
its session child as plugins, because to the host there is nothing but
plugins ([ADR-RM-001](./decisions/001-remote-plugin-is-a-local-proxy.md)).
One guarantee does not carry over: after a session loss, a dependent's
finalizers find the provider unreachable
([RSK-RM-012](./risks.md#rsk-rm-012)). A host that serves one of its own
providers to another host uses `Remote.serve`.

It implements the two architectural rules of the 2026-11-08 review (§7):
third-party code never runs in-process, and a remote plugin is a local proxy
plugin, with these restated invariants per host — availability is eventually
consistent; a partition makes plugins wait instead of failing; a stale epoch
is refused at the boundary; remote calls always have a timeout; a lifecycle
step never waits on a peer.

**Bridger provides no isolation.** Whatever separation exists between host and
guest comes from the process, isolate or VM the adapter runs the guest in,
and from the consumer's deployment of it
([ADR-RM-006](./decisions/006-isolation-comes-from-the-host.md)).

## Package boundary

| Concern | Where |
| ------- | ----- |
| Plugins, leases, children, legality, reconcile, attribution, gate, audit | Core — [references/core](../core/README.md) |
| Contract identity, versions, ranges, `IncompatibleContract`, add-only evolution (wire schema) | Core — [core 26 — Versioned contracts](../core/behaviors/26-versioned-contracts.md) (BEH-BR-225–232) |
| Plugin principal, `onBehalfOf` | Core — [core 28 — Plugin principal and mandatory policy](../core/behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-257–266) |
| `Grant.of`, `CapabilityPolicy`, `CallLog` ports | Core — [core 29 — Capability grants and call log](../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273–278) |
| Annotation bag, flow "wire", `Annotations.encode`/`decode`, `CallerContext` | Core — [core 30 — Operation context annotations](../core/behaviors/30-operation-context-annotations.md) (BEH-BR-289–296) |
| Scoped mount of a child (unmount when a sub-scope closes) | Core [14 — Children and groups](../core/behaviors/14-children-and-groups.md), BEH-BR-121 and BEH-BR-126 (specified under CCR-BR-020) |
| **Link and session child, sessions, epochs, heartbeat, withdrawal, call deadlines and outcomes, per-call tokens, `Guest.serve`, the host-side serving end `Remote.serve`, `Transport` interface and endpoint multiplexer, `TestTransport`** | **This package** |
| Adapters: `worker_threads`, Worker Loader / service binding, Workers for Platforms, self-hosted workerd, later Wasm | Sub-packages `@bridger/worker`, `@bridger/worker-loader`, `@bridger/workers-for-platforms`, `@bridger/workerd`, `@bridger/wasm` |
| Digest check, signatures, revocation source, the `RevokedDigests` view, catalog-to-guest links (`LoaderRemote.link`) | `@bridger/loader` — [references/loader/](../loader/README.md) |
| Cross-host manifests and imports (which use remote proxies) | `@bridger/federation` — [references/federation](../federation/README.md) |
| Promise SDK for guests, generated from contracts | `@bridger/kit` — [references/kit/](../kit/README.md) (agent KIT) |
| VM/container boundary, provider configuration, key custody, egress policy, callback admission by actor, the meaning of annotations | The application |

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose | Behaviour |
| ------ | ---- | ------- | --------- |
| `Remote.define` | function | The link plugin for a contract over a transport | [01](./behaviors/01-remote-proxy-plugin.md) |
| `RemoteOptions` | type | `id`, `transport`, `grants`, `accepts`, `callTimeout`, `handshakeTimeout`, `heartbeat`, `unavailableAfter`, `partition`, `reconnect`, `stableFor`, `flapWarning`, `flapWindow`, `maxInFlight`, `tokenTtl`, `manifest`, `disclose` (identity claims sent to the peer; default none, [03](./behaviors/03-remote-calls.md)) | [01](./behaviors/01-remote-proxy-plugin.md), [04](./behaviors/04-heartbeat-and-partition.md) |
| `Remote.layer` | layer | Base services `RemoteStatus`, `RemoteBoundary`, default `TokenAuthority.inProcess` | [01](./behaviors/01-remote-proxy-plugin.md), [02](./behaviors/02-sessions-and-epochs.md) |
| `RemoteStatus`, `LinkStatus` | service, type | Session condition per link: names, counts, epochs, disclosed claim names | [01](./behaviors/01-remote-proxy-plugin.md) |
| `RemoteBoundary` | service | `revoke(selector, context)`: refuse at the boundary at once | [02](./behaviors/02-sessions-and-epochs.md) |
| `Guest.serve`, `Guest.Handlers`, `GuestContext` | function, types | The guest end (entry `@bridger/remote/guest`) | [05](./behaviors/05-guest-serve.md) |
| `Remote.serve` | function | Host-side serving end: serves a local provider over a guest transport, one core lease per call | [05](./behaviors/05-guest-serve.md) |
| `Frame`, `WireExit`, `WireAnnotations`, `WireClaims` | types | The remote envelope | [01](./behaviors/01-remote-proxy-plugin.md), [03](./behaviors/03-remote-calls.md) |
| `CallbackAdmission`, `CallbackDenied` | port, error | Optional admission of callbacks by the token's claims | [06](./behaviors/06-capability-tokens-and-call-log.md) |
| `TokenAuthority`, `TokenAuthority.inProcess`, `TokenClaims` | port, layer, type | Per-call tokens | [06](./behaviors/06-capability-tokens-and-call-log.md) |
| `Egress.Http` | contract | Example egress contract a guest may be granted; provided by an application plugin | [05](./behaviors/05-guest-serve.md) |
| `Transport`, `GuestTransport`, `Connection`, `TransportProfile` | types | Adapter interface | [07](./behaviors/07-transports-and-adapters.md) |
| `Transport.multiplex`, `GuestTransport.multiplex` | functions | Several named endpoints over one physical connection | [07](./behaviors/07-transports-and-adapters.md) |
| `Transport.messagePort`, `Transport.webSocket`, `Remote.websocketDialer` | functions | Web-standard transports in this package | [07](./behaviors/07-transports-and-adapters.md) |
| `Transport.postMessage`, `GuestTransport.postMessage` | functions | A transport to a document in a sandboxed browser frame, one `MessageChannel` per connection | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `PlacementPolicy`, `PlacementPolicy.exact`, `Placement.Residency`, `PlacementRefused` | port, value, annotation key, error | Residency labels compared with a transport's declared labels | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `PrincipalBudget`, `TransportUsage`, `RemoteBudgetExceeded` | port, type, error | Per-principal call-rate, CPU-time and egress budgets from adapter-reported usage | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `DedupeStore` | port | At-most-once across invocations on per-call transports | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `OrgOf` | port | Opaque organisation claim in tokens; on the wire only when the link discloses it | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `WorkersForPlatforms.transport` | function | Adapter `@bridger/workers-for-platforms` | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `Transport.fromBundle`, `BundleRuntime`, `GuestBundle` | function, port, type | A transport that acquires a guest's bytes at each `open` (for example from the loader's `fetchVerified`) and starts the guest from them | [09](./behaviors/09-placement-budgets-and-adapters.md) |
| `TestTransport`, `TransportFault`, `RemoteTest.settle` | testing | Deterministic transport with scripted faults (entry `@bridger/remote/testing`) | [08](./behaviors/08-test-transport-and-acceptance.md) |

### Errors

| Tag | Raised when | Outcome |
| --- | ----------- | ------- |
| `RemoteUnavailable` | No open session (ended, hold mode, escaped reference) | not-executed |
| `RemoteTimeout` | The call's deadline expired | unknown or not-executed |
| `SessionLost` | The session ended with the call in flight | unknown or not-executed |
| `StaleEpoch` | A frame of another epoch | not-executed |
| `RemoteRevoked` | The link is revoked at the boundary | not-executed or unknown |
| `RemoteBusy` | `maxInFlight` reached | not-executed |
| `WireDecodeError` | A payload or reply does not decode | per direction |
| `RemoteDefect` | The guest handler died or failed outside the contract | executed |
| `MethodNotServed` | The serving end does not serve this method | not-executed |
| `CallbackDenied`, `TokenInvalid`, `TokenExpired` | A guest callback is refused (`CallbackDenied` is this package's error, distinct from core's `CapabilityDenied` defect) | — (callback) |
| `PlacementRefused` | The required residency label is not offered by the transport or route | not-executed (build fails at define) |
| `LocalContractRefused` | A local contract (core `Contract.local`) given to `Remote.define`, `Remote.serve` or `Guest.serve` ([01](./behaviors/01-remote-proxy-plugin.md), BEH-RM-007); a callback to one is refused with `CallbackDenied` "local-contract" | not-executed (the link's build fails; a serving end does not start) |
| `RemoteBudgetExceeded` | The `PrincipalBudget` refused the call | not-executed |
| `TransportError`, `TransportClosed` | Adapter failures | — |

## Worked example

```ts
// illustrative — not type-checked
// contract (core behaviour 26)
const PriceQuote = Contract.make(PriceQuoteKey, {
  version: "2.1.0",
  methods: { quote: Contract.method({ payload: QuoteRequest, success: Quote, error: QuoteRefused }) }
})

// guest bundle (runs in a worker thread here; any adapter works the same)
Guest.serve(PriceQuote, {
  quote: (req, ctx) => ctx.clients.catalog.lookup({ sku: req.sku }).pipe(Effect.map(toQuote))
}, { transport: Worker.guestTransport(), grants: [Catalog] })

// host
const quotes = Remote.define(PriceQuote, {
  id: "price-quote",
  transport: Worker.transport({ script: new URL("./quote-guest.js", import.meta.url) }),
  grants: [Grant.of(CatalogKey, { methods: ["lookup"] })],
  callTimeout: "2 seconds"
})
yield* host.install(quotes, { context: { actor: Actor.system } })
```

The link becomes `active` at once. A POS checkout plugin that requires
`PriceQuoteKey` stays `waiting` until the worker answers the handshake; the
link then mounts `price-quote/session` under epoch `e-7`, and the checkout
plugin starts. Each `quote` call carries a token naming the caller's actor;
the guest's `catalog.lookup` callback is admitted by grant, runs under the
caller's actor and annotations, and passes the application's
`CapabilityPolicy` through the host's own capture; both crossings are
offered to the `CallLog`. If the worker stops answering for three heartbeats, calls in flight
fail with `SessionLost { outcome: "unknown" }`, `price-quote/session` is
unmounted, and the checkout plugin goes to `waiting`; when the worker answers
again, a new session child under epoch `e-8` is mounted and checkout starts
again. Nothing entered `failed`, and no operator acted.

## What stays in core, and what stays in the application

- **Core** keeps one plugin model. The remote package needed one
  clarification — what closing a sub-scope does to a child mounted under it —
  now specified in core BEH-BR-121 and BEH-BR-126 (CCR-BR-020), with the
  exports of `HeldPlugins` and `CurrentTransition` (BEH-BR-088,
  CCR-BR-020, CCR-BR-035); otherwise it uses the public API,
  including the seams CCR-BR-026 added for it: `Plugin.Runtime.unmount` with
  `requestedBy` (G57), `CurrentCorrelation` (G58), `RefusalList` (G60) and
  the call-log entry kinds with `Host.offerCallEntry` and
  `PrincipalRef.encode` (G43). Residency placement needs no core seam: core
  only carries the label and the annotation.
- **The application** chooses adapters and supplies the isolation around the
  guest (VM, container, provider configuration), the `CapabilityPolicy`, the
  egress provider and its policy, any cross-process `TokenAuthority`, the
  residency labels and their truth, budget arithmetic, the `DedupeStore`'s
  storage, and what to do with an `unknown` outcome.

---

_Next: [Behaviours](./behaviors/01-remote-proxy-plugin.md)_
