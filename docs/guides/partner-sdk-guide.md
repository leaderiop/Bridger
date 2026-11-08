# Partner SDK guide

Status: **prospective API — nothing here is implemented.** Every snippet is
`type-checked: not yet (implementation absent)`. Normative text:
[kit 05 — Promise SDK](../../references/kit/behaviors/05-promise-sdk.md) and
[kit 03 — Conformance kits](../../references/kit/behaviors/03-conformance-kits.md).

You implement a contract that someone else's product consumes — a pricing
source, a shipping provider, a document store. You do **not** need Effect or
Bridger. You write `async` functions over plain JSON-shaped data; a generated
SDK connects them to the product.

## How your code is reached

```text
 product host (their process)                      your code (your process or service)
 ┌───────────────────────────────┐   transport    ┌──────────────────────────────┐
 │ consumer plugin               │                │ generated SDK  serve(handlers)│
 │   → link plugin (proxy) ──────┼────────────────┼──→ your async functions      │
 └───────────────────────────────┘                └──────────────────────────────┘
```

The product installs a *link plugin* (from the remote companion) that stands
in for you inside the host. Calls travel over a transport to your process.
Your code never runs inside the product's host process. Whether your process
is confined, and how, is decided by whoever deploys it — the SDK does not
isolate anything by itself.

## 1. Generate the SDK

```text
$ bridger create acme-greeter --template partner
$ bridger sdk generate @example/greeter-contract
generated src/sdk/greeter.ts for example/Greeter@1 version 1.2.0
```

The generated module contains only plain TypeScript types:

```ts
// type-checked: not yet (implementation absent) — generated
export interface GreeterHandlers {
  greet(input: { name: string; locale?: string }, ctx: CallContext): Promise<{ text: string }>
}
export class GreeterNotFound extends ContractError<"NotFound", { name: string }> {}
export function serve(handlers: GreeterHandlers): GuestEntry
```

Values are in their wire form: dates are strings, decimals are strings.

## 2. Write the handlers

```ts
// type-checked: not yet (implementation absent)
import { serve, GreeterNotFound } from "./sdk/greeter.js"

export default serve({
  async greet({ name, locale }, ctx) {
    if (name === "") throw new GreeterNotFound({ name })
    const text = await translate(`Hello, ${name}`, locale, { signal: ctx.signal })
    return { text }
  }
})
```

What the SDK does around your function:

- **Checks the input** against the contract before calling you. A bad payload
  never reaches your code (`SdkDecodeFailed`, side `input`).
- **Checks your result** against the contract (`SdkDecodeFailed`, side
  `output`). Extra fields are ignored.
- **Declared errors** (`GreeterNotFound`) reach the caller as typed errors.
- **Anything else you throw** reaches the caller as `SdkUndeclaredFailure`
  with a fixed message; your exception text stays on your side. Pass
  `serve(handlers, { onUnexpected })` to log it yourself.
- **`ctx.signal`** aborts when the caller gives up or times out;
  `ctx.deadlineMs` says how long you have.

You receive no host objects, user identities, tokens or configuration of the
product.

## 3. Calling back into the product

If the contract package declares that your code may use another contract (for
example a clock or a rate table), a client is generated for it:

```ts
// type-checked: not yet (implementation absent)
const { now } = await ctx.client(ClockClient).now({})
```

Each call goes back through the link plugin and is subject to whatever access
the product has granted you. A contract you did not declare has no client.

## 4. Test against the published suite

```text
$ bridger test --conformance
example/Greeter@1 suites 1.0.0, 1.1.0, 1.2.0 — passed 61 of 61 cases (seed 1849)
```

The contract package ships one conformance suite per version. Your handlers
are run against every suite of the major you implement, up to your version,
through an in-process test transport (tests only). The same suites can be run
against your deployed service in a test environment:

```ts
// type-checked: not yet (implementation absent)
Conformance.verify(Conformance.http("https://staging.acme.test/greeter", { contract: GreeterV1, timeout: "5 seconds" }), suites)
```

Do this against a test environment: generated payloads are sent for real. A
passing run means the executed cases passed — nothing more.

## 5. Versions

Your generated SDK speaks exactly one contract version. To serve two majors,
generate and serve two modules. The product picks a version it accepts when
it connects; you never negotiate in your code.

## If you ship a user interface

A partner UI bundle is never loaded into the product's page. The product renders
it in an `<iframe>` whose `sandbox` attribute omits `allow-same-origin`, behind a
proxy plugin, and talks to it over a postMessage transport
([REACT-UI-PLUGINS.md §3.7](../REACT-UI-PLUGINS.md)). Your bundle serves the
product's UI contract with the same generated SDK, receives plain JSON props,
the locale, the text direction and theme tokens, and calls back only through
the contracts you were granted. The browser's iframe sandbox is what confines
your bundle; neither the SDK nor Bridger confines anything.

## When something fails

Look the tag up in the [error catalog](./error-catalog.md); the tooling prints
the same fix text next to every failure.

## Publishing your package

[Partner publishing guide](../../references/kit/appendices/b-partner-publishing.md) — pack, publish, countersign and what a host checks.

Change log: 2026-11-08, round 2 — section "If you ship a user interface" (sandboxed iframe through `SandboxedSlot`); section "Publishing your package" links the partner publishing guide (CCR-BR-027).
