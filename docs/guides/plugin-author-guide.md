# Plugin author guide

Status: **prospective API — nothing here is implemented.** Every snippet is
`type-checked: not yet (implementation absent)`. Normative text:
[kit behaviours 01–02](../../references/kit/behaviors/01-plugin-facade.md) and
core behaviours [01](../../references/core/behaviors/01-plugin-definition.md)–[25](../../references/core/behaviors/25-operation-gate.md).

This guide is for first-party plugins: code you trust, running in the host's
process. Partner code does not belong here; see the
[partner SDK guide](./partner-sdk-guide.md).

## The four shapes of a plugin

```ts
// type-checked: not yet (implementation absent)
import { Effect, Layer } from "effect"
import { Bridger } from "@bridger/core"
import { definePlugin } from "@bridger/kit"

// 1. One service: make returns its implementation
const clock = definePlugin({
  id: "example/clock",
  provides: Clock,
  make: Effect.succeed({ now: Effect.sync(() => Date.now()) })
})

// 2. Several services: a record of keys, make returns a record of implementations
const store = definePlugin({
  id: "example/store",
  requires: [Database],
  provides: { reader: Reader, writer: Writer },
  make: Effect.gen(function* () {
    const db = yield* Database
    return { reader: makeReader(db), writer: makeWriter(db) }
  })
})

// 3. No service: run registers listeners, contributions or background work
const audit = definePlugin({
  id: "example/order-audit",
  requires: [Bridger.Events, Logger],
  run: Effect.gen(function* () {
    const events = yield* Bridger.Events
    const log = yield* Logger
    yield* events.on(OrderPlaced, (order) => log.log(`order ${order.id}`))   // removed with the plugin
  })
})

// 4. Escape hatch: your own Layer, checked exactly as Plugin.define checks it
const legacy = definePlugin({
  id: "example/legacy",
  requires: [Logger],
  provides: [Legacy],
  build: Layer.effect(Legacy, makeLegacy)
})
```

Rules worth remembering:

- **Never write `as const`** on `requires` or `provides`; they are inferred as
  tuples.
- **Never cast a definition.** Every `definePlugin` value fits wherever a host
  or a list accepts a plugin (`Plugin.Any`). If you feel a cast is needed,
  read the [error catalog](./error-catalog.md) or the compiler's
  `KitTypeError` first.
- **Declare what your methods reach at call time.** The compiler checks what
  `make` uses while building. A service used only inside a method you return
  is invisible to that check; list it in `requires` anyway.
- **One shape per definition.** If `provides` would depend on a run-time flag,
  write two definitions and install the one you need.

## Configuration

```ts
// type-checked: not yet (implementation absent)
const mailer = definePlugin({
  id: "example/mailer",
  provides: Mailer,
  config: Schema.Struct({ host: Schema.String, retries: Schema.Number, apiKey: Schema.Redacted(Schema.String) }),
  volatile: ["retries"],                         // may change without a restart
  make: ({ config }) => connect(config)
})
```

Configuration is decoded before `make` runs; a decode failure leaves the
plugin `failed` with `ConfigInvalid` naming the paths, never the values.
Changing a `volatile` field publishes the new value without restarting; any
other change restarts the plugin and its dependents.

## Contracts

When a service is meant to be implemented by more than one party, or across
versions, declare it as a versioned contract
([core 26](../../references/core/behaviors/26-versioned-contracts.md)):

```ts
// type-checked: not yet (implementation absent)
const GreeterV1 = Contract.make(GreeterKey, {
  version: "1.2.0",
  methods: { greet: Contract.method({ payload: GreetRequest, success: GreetResult, error: NotFound }) }
})

const consumer = definePlugin({ id: "example/ui", requires: [GreeterV1.range("^1.1")], run: wireUi })
```

Within one major you may only add (a method, an optional field). Anything else
is a new major with a new key. `bridger check` compares your contract with the
last release and fails on a change that breaks this rule.

## Testing

```ts
// type-checked: not yet (implementation absent)
import { PluginTest, it } from "@bridger/kit/testing"
import { Fault } from "@bridger/core/testing"

it.plugin("store writes through the database", store, {
  provide: [PluginTest.partial(Database, { execute: () => Effect.succeed({ rows: 1 }) })]
}, (t) => Effect.gen(function* () {
  yield* t.use(Writer, (w) => w.save({ id: "a" }))
}))

it.plugin("a failing build is reported", store, {
  provide: [PluginTest.stub(Database, fakeDatabase)],
  allowWaiting: true
}, (t) => Effect.gen(function* () {
  yield* t.host.inject(Fault.buildFails("example/store"))   // core fault, unchanged
  // ...
}))
```

- `PluginTest.stub` must implement the whole service; `PluginTest.partial`
  implements some members, and calling another one fails the test at that
  member (`StubNotImplemented`).
- Doubles are installed as real plugins, so removing one sends your plugin to
  `waiting` exactly as in production.
- `t.host` is the core `TestHost`: `step`, `pending`, `Fault.*` and the test
  clock work as the core specifies.
- If your plugin provides a contract, run its published conformance suites:
  `bridger test --conformance`.

## Hosting plugins in an application

```ts
// type-checked: not yet (implementation absent)
const program = Effect.scoped(Effect.gen(function* () {
  const host = yield* Bridger.make({ attribution: { require: true } })
  const report = yield* host.reconcile([
    { id: "example/logger", plugin: logger },
    { id: "example/greeter", plugin: greeter, config: { greeting: "Hello" } }
  ], { scope: "app", context: { actor: deployBot, reason: "release 1.4" } })
}))
```

`reconcile` converges the host on a list: it installs what is missing,
replaces what changed, and removes only what this scope installed earlier.
Each entry is gated and audited on its own; rejections are reported per entry.

## Inspecting a host

```text
$ bridger inspect example/greeter
example/greeter@default  waiting
  └─ example/Logger: provider example/logger is failed (build): connection refused

$ bridger inspect --json > host.json
```

The inspector reads the host and changes nothing. It shows a dependency graph,
why a plugin waits (as a chain through its providers), lease counts and a
timeline of recent host events. The timeline is a diagnostic feed with gaps
marked — not an audit trail.

## Attribution and audit

Every change to a host carries an `OperationContext`: an actor, optionally a
reason and a correlation id. With `attribution.require`, a change without an
actor fails with `Unattributed`. With an `AuditSink` wired, every change
yields a `requested` record and a terminal record, sequenced so that gaps can
be detected. With an `OperationGate` wired, the gate can refuse any change
before it happens.

What Bridger does **not** do: store records, establish who an actor is, sign
anything, or make a system compliant. Those obligations stay with a companion
and with you; the [compliance matrix](../../references/core/gxp/02-compliance-matrix.md)
lists them clause by clause.

`bridger dev` never runs against a host with a sink or a gate: reloading
unreviewed code into a recorded system would turn every save into a recorded
change.
