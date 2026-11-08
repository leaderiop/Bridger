# 05 — Promise SDK

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-05                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

Third-party code never runs in the host's process (gap report §7 rule 1). A
partner's code runs on the other side of a transport, and the host reaches it
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
export interface CallContext { readonly signal: AbortSignal; readonly deadlineMs: number; client<K>(client: K): ClientOf<K> }
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
             milliseconds. It MUST NOT receive host objects, keys, the
             host's `Actor`, tokens or configuration values.
```

The fixed message mirrors core's rule that errors carry identifiers and
messages that core controls (ADR-BR-008): a partner's exception text may quote
customer data, and it must not travel into the host's logs by default.

## BEH-KT-035: Calls back to the host use granted contracts only

> **See:** [ADR-KT-004](../decisions/004-promise-sdk-for-out-of-process-partners.md)
> **Core seam:** [29 — Capability grants](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273); [references/remote/](../../remote/invariants.md) (RM)

```ts
// illustrative — generated from the contract example/Clock@1 when the partner package declares it
const now = await ctx.client(ClockClient).now({})
```

```
REQUIREMENT: The SDK MAY generate Promise clients for contracts the
             partner's manifest declares in `requires`. A client call MUST
             travel over the remote companion's session back to the link
             plugin, which resolves the service in the host; the grant
             check (file 29) and the call log apply there. A contract not
             declared MUST have no client.
```

The partner's reach into the host is exactly what the integrator granted;
egress is just another granted contract (gap report §5.3).

## BEH-KT-036: A partner package carries its manifest and conformance run

> **See:** [ADR-KT-003](../decisions/003-conformance-suites-from-versioned-contracts.md)

```
REQUIREMENT: The `partner` template (BEH-KT-025) MUST include a test that
             runs the contract's published suites against the handlers
             through an in-process test transport of the remote companion,
             and a manifest (file 27) naming the contract and version it
             provides.
```

```
REQUIREMENT: Documentation MUST state that the in-process test transport is
             for tests only and that a partner's code runs out of process in
             every deployment.
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
