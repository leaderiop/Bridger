# 05 — Promise SDK

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-05                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-09): BEH-KT-034 `CallContext.claims` carries only the identity claims the host's link discloses, none by default (F-07); BEH-KT-035 callback clients generated from `requested.capabilities`, never from `requires` (C-19); BEH-KT-036 the partner manifest has the guest shape and names its entry in `extensions["@bridger/loader"]`, and is never marked first-party (F-06, M-03); BEH-KT-033 `bridger sdk generate` refuses a local contract with `LocalContractRefused` before writing (core CCR-BR-033); introduction and BEH-KT-036 documentation: partner code is never evaluated in the host's runtime and runs where the deployment chose, a worker thread of the host's process included (independent review); BEH-KT-036 documentation: a partner cannot mark its own package first-party, an application can (independent review) (CCR-KT-004)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

Third-party code is never evaluated in the host's runtime (gap report §7
rule 1, as the loader and remote companions specify it). A partner's code
runs on the other side of a transport, and the host reaches it
through a link plugin of the [remote companion](../../remote/invariants.md):
an ordinary local proxy plugin whose session child publishes the contract's
service. On the partner's side the remote companion's guest runtime
(`Guest.serve`) receives calls. This file specifies the SDK the kit generates
so that the partner writes `async` functions over plain data and never learns
Effect or Bridger ([ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)).
This file owns BEH-KT-033–040 and uses BEH-KT-033–038; 039 and 040 are
reserved.

Nothing in this file isolates anything. Where and how the partner's process
is confined is the deployment's decision; the SDK is the same in every case.

Planned source: `packages/kit/src/sdk/generate.ts`, `packages/kit/src/sdk/runtime.ts` *(Planned)*.

## BEH-KT-033: The SDK is generated from one contract version

> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-225, BEH-BR-231)

```ts
// illustrative — generated output for the contract example/Greeter@1, version 1.2.0
export interface GreeterHandlers {
  greet(input: { name: string; locale?: string }, ctx: CallContext): Promise<{ text: string }>
  // stream methods: AsyncIterable of the success type
}
export class GreeterNotFound extends ContractError<"NotFound", { name: string }> {}
export function serve(handlers: GreeterHandlers, options?: { onUnexpected?: (method: string, thrown: unknown) => void }): GuestEntry
export interface CallContext {
  readonly signal: AbortSignal
  readonly deadlineMs: number
  readonly claims: DisclosedClaims          // only what the host's link discloses; empty by default (BEH-KT-034)
  client<K>(client: K): ClientOf<K>
}
export interface DisclosedClaims {          // descriptions, never authority
  readonly actor?: { readonly kind: string; readonly id: string }
  readonly onBehalfOf?: string              // an encoded principal reference, opaque to the partner
  readonly org?: string
  readonly correlationId?: string
}
export const contract: { serviceId: "example/Greeter@1"; version: "1.2.0"; methods: readonly ["greet"] }
```

```
REQUIREMENT: `bridger sdk generate` MUST produce, for one contract version,
             TypeScript declarations and a runtime module in which every
             payload, success and error type is the *encoded* side of the
             contract's schema — JSON-compatible values only — and no type
             or value from `effect` or `@bridger/*` appears in an exported
             signature other than `GuestEntry`, which is opaque.
```

```
REQUIREMENT: Each declared error member MUST become a generated subclass of
             `ContractError` carrying its tag and encoded fields. The
             generated module MUST embed the contract's `ContractDescriptor`
             unchanged.
```

```
REQUIREMENT: Generation MUST be deterministic: the same contract and kit
             version MUST give byte-identical output.
```

```
REQUIREMENT: `bridger sdk generate` MUST refuse a local contract
             (`Contract.local`, core BEH-BR-225; `descriptor.local` true)
             with the remote companion's `LocalContractRefused { serviceId,
             site: "sdk-generate" }` (remote BEH-RM-007), before it writes
             any file, and the generated module's `serve` is therefore never
             built for one: a local contract has no encoded side and must
             not cross a host boundary (core BEH-BR-232). The `contract`
             template of `create` (04, BEH-KT-025) MUST make a
             `Contract.make` contract.
```

The encoded side is what crosses the wire anyway; giving the partner that
type, rather than a decoded type with `Date` or `BigDecimal` instances, keeps
the SDK free of Effect's data types.

## BEH-KT-034: serve wraps handlers for the remote companion's guest runtime

> **Invariant:** [INV-KT-006](../invariants.md#inv-kt-006-a-partner-handler-sees-only-plain-data)
> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)
> **Core seam:** [references/remote/](../../remote/invariants.md) (RM; `Guest.serve`, BEH-RM-004)

```
REQUIREMENT: `serve(handlers)` MUST return a `GuestEntry` that the remote
             companion's `Guest.serve` accepts, and MUST NOT open a
             transport, a socket or a session itself. Session setup, version
             offer, epochs, heartbeats and timeouts MUST be the remote
             companion's.
```

```
REQUIREMENT: Before calling a handler, the SDK runtime MUST check the
             payload against the method's encoded schema and refuse a
             mismatch with `SdkDecodeFailed { method, side: "input",
             message }` without calling the handler. After the handler
             resolves, it MUST check the result against the success schema
             and report a mismatch as `SdkDecodeFailed { side: "output" }`.
             Unknown fields MUST be ignored, as core requires of every codec
             built from a contract (BEH-BR-231).
```

```
REQUIREMENT: A handler that throws or rejects with a generated
             `ContractError` MUST produce that typed failure. Anything else
             thrown MUST produce `SdkUndeclaredFailure { method, message }`,
             whose `message` is the fixed text "handler failed with an
             undeclared error" — never the thrown value's text — and the
             thrown value MUST be passed only to the partner's own
             `onUnexpected` callback when one is given.
```

```
REQUIREMENT: Every handler MUST receive a `CallContext` with an
             `AbortSignal` that aborts when the host side's call is
             interrupted or times out, and the remaining deadline in
             milliseconds. It MUST NOT receive host objects, keys, tokens
             or configuration values.
```

```
REQUIREMENT: `CallContext.claims` MUST carry exactly the identity claims
             present in the call's wire claims — `actor`, `onBehalfOf`,
             `org`, `correlationId` — and each MUST be absent when the
             host's link does not disclose it. A link discloses none by
             default; an integrator opts in per link with the remote
             companion's `RemoteOptions.disclose`, and records the opted-in
             link as a data transfer to the partner
             ([BEH-RM-024](../../remote/behaviors/03-remote-calls.md)).
             Documentation MUST state that, by default, a partner receives
             no user identity, and that a disclosed claim is a description
             asserted by the host: it grants nothing, and the SDK MUST NOT
             use it to decide anything.
```

A partner that receives identity becomes a processor of it, which is the
integrator's decision for each link, never a default of the SDK (the same
rule as the MCP import, [BEH-MC-022](../../mcp/behaviors/03-client-import.md#beh-mc-022-the-proxy-forwards-no-identity-unless-the-import-discloses-it-and-never-annotations)).

The fixed message mirrors core's rule that errors carry identifiers and
messages that core controls (ADR-BR-008): a partner's exception text may quote
customer data, and it must not travel into the host's logs by default.

## BEH-KT-035: Calls back to the host use granted contracts only

> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)
> **Core seam:** [29 — Capability grants](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273); [references/remote/](../../remote/invariants.md) (RM)

```ts
// illustrative — generated from the contract example/Clock@1 when the partner manifest requests it:
// manifest.requested.capabilities = [{ serviceId: "example/Clock@1", methods: ["now"] }]
const now = await ctx.client(ClockClient).now({})
```

```
REQUIREMENT: The SDK MAY generate Promise clients for the capabilities the
             partner's manifest declares in `requested.capabilities` (core
             BEH-BR-241), one client per `serviceId`, with only the
             `methods` listed there, or every method of the contract when
             `methods` is absent. It MUST NOT generate a client from
             `requires`: a guest manifest declares no `requires` (loader
             [BEH-LD-068](../../loader/behaviors/09-trust-class-and-guest-links.md)),
             and the remote companion forbids making grants `requires` of
             the link
             ([BEH-RM-043](../../remote/behaviors/06-capability-tokens-and-call-log.md)).
             A capability not requested MUST have no client.
```

```
REQUIREMENT: A client call MUST travel over the remote companion's session
             back to the link plugin, which admits it only when the link's
             `grants` cover the contract and method and then resolves the
             service in the host; the grant check (core file 29) and the
             call log apply there. Documentation MUST state that a request
             is not a grant: a requested capability the integrator did not
             grant is refused at the host with `CallbackDenied`
             ("not-granted"), and the generated client reports that refusal
             as a typed failure.
```

A manifest's `requested.capabilities` is the partner's declaration, read by
the integrator's consent screen before any code runs; the link's `grants` are
the integrator's answer. The partner's reach into the host is exactly what
the integrator granted; egress is just another granted contract (gap report
§5.3).

## BEH-KT-036: A partner package carries its manifest and conformance run

> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)

```
REQUIREMENT: The `partner` template (BEH-KT-025) MUST include a test that
             runs the contract's published suites against the handlers
             through an in-process test transport of the remote companion,
             and a manifest (file 27) in the guest shape of the loader
             companion ([BEH-LD-068](../../loader/behaviors/09-trust-class-and-guest-links.md)):
             exactly one `provides` reference, the contract and version it
             serves, with its methods; empty `requires`, `optional`,
             `activation`, `contributions` and `listens`; the host services
             it calls back in `requested.capabilities` (BEH-KT-035); and its
             entry in `extensions["@bridger/loader"].entry` (loader
             [BEH-LD-001](../../loader/behaviors/01-package-and-digest.md#beh-ld-001-a-package-is-a-manifest-an-sbom-and-a-set-of-files)).
```

```
REQUIREMENT: Documentation MUST state that a partner cannot mark its own
             package first-party: a host accepts a "first-party" statement
             only from the signers its own rule names
             ([BEH-LD-065](../../loader/behaviors/09-trust-class-and-guest-links.md)),
             so a host runs a package without one only as a guest, through
             `LoaderRemote.link`, and `Loader.lazy` refuses it with
             `NotFirstParty`. It MUST also state that an application can
             sign that statement for a partner's package, and that the
             package is then evaluated in the host's runtime by the
             application's decision.
```

```
REQUIREMENT: Documentation MUST state that the in-process test transport is
             for tests only; that in every deployment a partner's code runs
             on the other side of a transport, never evaluated in the host's
             runtime; and that where that is — a worker thread of the host's
             process, an isolate, another process or a service — and what
             confines it are the deployment's choice (remote BEH-RM-053).
```

## BEH-KT-037: Versions the SDK serves

> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)
> **Core seam:** [26 — Versioned contracts](../../core/behaviors/26-versioned-contracts.md) (BEH-BR-232)

```
REQUIREMENT: A generated SDK MUST declare to the guest runtime the single
             version it was generated from. Serving several versions MUST be
             done by serving several generated modules, one per major; the
             SDK MUST NOT negotiate.
```

Negotiation is the remote companion's, using core's `maxSatisfying`
(BEH-BR-232); the SDK only states what it speaks.

## BEH-KT-038: The SDK makes no isolation claim

> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md), [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)

```
REQUIREMENT: Generated code, the partner guide and CLI output MUST NOT
             describe the SDK, the guest runtime or the transport as a
             sandbox or as isolating the partner. They MUST state that
             confinement is provided, if at all, by the deployment.
```

---

_Previous: [04 — Command line](./04-cli.md)_ · _Next: [06 — Devtools inspector](./06-devtools-inspector.md)_
