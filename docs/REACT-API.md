# Proposed `@bridger/react` API

Status: design examples for review. These APIs do not exist yet and have not been implemented or type-checked. The examples target a client-rendered React application and reuse the `Audit`, `audit`, and `logger` definitions from `SPEC.md`.

`@bridger/react` adapts the generic Bridger host to React. Plugin definitions still use `@bridger/core`. The adapter owns React subscriptions and component actions; the core owns activation, dependency ordering, leases, and finalizers.

This document covers the service and state layer: connecting a client, calling services and observing plugin state. Building the UI itself from plugins (shell, menus, routes, pages and plugin-defined slots) is specified in [REACT-UI-PLUGINS.md](REACT-UI-PLUGINS.md), which uses these hooks inside contributed components.

```mermaid
flowchart LR
    UI[React components] --> Hooks[React hooks]
    Hooks -->|leased actions| Host[Bridger host]
    Host -->|versioned snapshots| Store[Adapter snapshot store]
    Store -->|useSyncExternalStore| Hooks
    Host -->|activation and cleanup| Plugins[Effect plugins]
```

## 1. Connect the application

Create the client once at application startup. `BridgerProvider` exposes an existing client through React context; mounting or unmounting the provider does not install plugins or dispose the host.

```tsx
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BridgerProvider, createBridgerClient } from "@bridger/react"
import { audit, logger } from "./plugins"
import { App } from "./App"

export async function mountApplication(element: HTMLElement) {
  const client = await createBridgerClient({ plugins: [audit, logger] })
  const root = createRoot(element)

  root.render(
    <StrictMode>
      <BridgerProvider client={client}>
        <App />
      </BridgerProvider>
    </StrictMode>
  )

  return async function dispose() {
    root.unmount()
    await client.dispose()
  }
}
```

The caller handles startup errors and retains `dispose` for its application lifecycle. `createBridgerClient` owns a `ManagedRuntime` over `Bridger.layer(...)` ([SPEC.md](./SPEC.md) "Hosting from non-Effect code"), forces the lazy layer build, registers the definitions, starts observation, and awaits current transitions before resolving. Missing dependencies produce `waiting`. Initial activation failures reject creation after cleanup; cleanup failures are included in the reported error. Disposal is idempotent, rejects new work, interrupts adapter-owned actions, awaits their finalizers, calls `host.shutdown()` so the `CloseReport` can be surfaced, and then disposes the runtime.

## 2. Call a plugin service from a component

```tsx
import { useServiceAction } from "@bridger/react"
import { Audit } from "./plugins"

export function AuditButton() {
  const record = useServiceAction(
    Audit,
    (audit, event: string) => audit.record(event)
  )

  return (
    <div>
      <button
        disabled={!record.available || record.pending}
        onClick={() => record.run("button.clicked")}
      >
        {record.pending ? "Recording…" : "Record event"}
      </button>
      {!record.available && <p>Audit is unavailable.</p>}
      {record.error && <p role="alert">{record.error.message}</p>}
    </div>
  )
}
```

`run(...args): void` schedules an Effect action and exposes its result through `{ pending, data, error }`. Errors are captured in hook state, including Effect failure causes; this event-handler API does not return a rejecting Promise. The callback returns an Effect whose requirements have already been satisfied. It executes inside `host.use(Audit, callback)`, so the service reference stays inside the lease.

The hook accepts one action at a time. Calls while pending are ignored. Each accepted call clears previous data and error. Unmount requests interruption and suppresses subsequent component updates, but the lease is released only once the action and its finalizers settle. Interruption does not undo external writes. A change of client or service key cancels the previous action and resets its state; changing the callback updates future calls without restarting an in-flight action.

`available` is a rendering hint, not a reservation. If removal wins a race with a click, `host.use` reports `ServiceUnavailable` (and, if the provider is forced out or the call exceeds its limit, `LeaseRevoked` or `LeaseTimeout`), which appears in `error`. An already leased call completes or is interrupted before teardown proceeds. A later click resolves the current provider instead of using a cached service object.

## 3. Observe plugin lifecycle

```tsx
import { usePluginState } from "@bridger/react"

export function AuditStatus() {
  const audit = usePluginState("example/audit")

  if (audit.state === "uninstalled") return <p>Audit is not installed.</p>
  if (audit.state === "waiting") {
    return <p>Waiting for: {audit.missingServiceIds.join(", ")}</p>
  }
  if (audit.state === "failed") return <p>Audit failed during {audit.phase}.</p>

  return <p>Audit: {audit.state}</p>
}
```

The hook returns a discriminated snapshot with the core states (including `disabled`) plus `uninstalled` for an unknown ID. Missing services are displayable service identifiers (`missingServiceIds`, the keys' `key.key` identifiers); failure details preserve the underlying cause. Lifecycle snapshots describe plugin availability, not changes to arbitrary domain data inside services.

## 4. Install code while React remains mounted

Application orchestration can use the same client returned by `createBridgerClient`:

```ts
// Inside an async command whose caller handles rejection.
// approvedEntryUrl comes from the application's trusted loader policy.
const { plugin } = await import(approvedEntryUrl)
await client.install(plugin)
await client.awaitIdle()

// Existing subscribers update as the host changes.
await client.remove("example/logger")
// AuditButton becomes unavailable; AuditStatus becomes waiting.

await client.install(logger)
await client.awaitIdle()
// Audit activates again; both components update.
```

The client's `install`, `remove`, `replace`, `retry`, and `awaitIdle` methods are Promise wrappers around host operations. An installation can be accepted while activation later fails; inspect the returned idle snapshot for activation outcomes. `useBridgerClient()` exposes this same client to components that need management commands. Call commands from event handlers or application orchestration, never during rendering. Dynamic entries must share the application's Effect runtime and service-key contracts.

## Core observation seam

`Host.changes` (a `Stream<HostSnapshot>`) and the `HostSnapshot` shape are defined in [SPEC.md](./SPEC.md). `snapshot()` is the one-time read. Each subscription must register and deliver its initial snapshot without a gap that could miss updates. Snapshots are immutable and carry a monotonically increasing revision. They include provider availability as well as plugin states, including stable base-service keys, so hooks can answer whether a key can be leased. Slow subscribers may receive the latest snapshot rather than every intermediate state; this is a state feed, not an audit log. Host closure terminates observation.

The adapter consumes one subscription per client and caches the latest snapshot. Hooks use `useSyncExternalStore` over that cache, with stable snapshot identity between revisions. React subscribes synchronously to the adapter store; it never starts asynchronous Effect work while rendering. The client is ready only after its initial snapshot is available.

## Use by the ERP UI

`@bridger/erp-react` ([ERP-BROWSER.md](ERP-BROWSER.md)) is built on this adapter. The browser Bridger host runs UI plugins (custom widgets and view renderers); each mounted widget takes a scoped lease on its plugin and releases it in effect cleanup, which provides the "contribution and teardown contract" listed below. Registry removal notifies the renderer to unmount before the plugin's scope closes.

## Boundaries to preserve

- The provider borrows a client. Application startup and shutdown own its lifetime, including when multiple React roots share it.
- React Strict Mode subscription setup and cleanup must not install or remove plugins.
- Service actions return data; returning a live service or resource from a lease remains unsupported.
- Reactive domain data needs an explicit service stream or external-store contract. Host lifecycle observation alone cannot make arbitrary service fields reactive.
- Rendering plugin-contributed components needs a separate contribution and teardown contract: hiding a contribution must coordinate with React unmount before resources used by component cleanup are released. A raw component registry alone cannot guarantee this. That contract is [REACT-UI-PLUGINS.md](REACT-UI-PLUGINS.md) §5.
- These examples cover client rendering. SSR requires a request-scoped host and a matching hydration snapshot; server and browser hosts do not share live service objects.

React references: [external store subscription and snapshot contracts](https://react.dev/reference/react/useSyncExternalStore), [Strict Mode lifecycle checks](https://react.dev/reference/react/StrictMode).
