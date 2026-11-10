# Bridger in 5 minutes

Status: **prospective API — nothing here is implemented.** The names follow
the [core specification](../../references/core/overview.md) and the
[kit specification](../../references/kit/overview.md). Every snippet is
`type-checked: not yet (implementation absent)`.

Bridger composes an application from **plugins**. A plugin declares the
services it **requires** and **provides**; a **host** starts each plugin when
what it requires is available, stops dependents before their providers, and
never closes a provider under a call in flight.

## 1. Declare two services

```ts
// type-checked: not yet (implementation absent)
import { Context, Effect } from "effect"

export class Logger extends Context.Service<Logger, {
  readonly log: (message: string) => Effect.Effect<void>
}>()("example/Logger") {}

export class Greeter extends Context.Service<Greeter, {
  readonly greet: (name: string) => Effect.Effect<string>
}>()("example/Greeter") {}
```

A service key is a value (`Logger`) with a stable identifier
(`"example/Logger"`). Plugins meet through keys, never through imports of each
other.

## 2. Write two plugins

```ts
// type-checked: not yet (implementation absent)
import { Effect, Schema } from "effect"
import { definePlugin } from "@bridger/kit"

export const logger = definePlugin({
  id: "example/logger",
  provides: Logger,
  make: Effect.succeed({ log: (message) => Effect.log(message) })
})

export const greeter = definePlugin({
  id: "example/greeter",
  requires: [Logger],
  provides: Greeter,
  config: Schema.Struct({ greeting: Schema.String }),
  make: ({ config }) => Effect.gen(function* () {
    const log = yield* Logger
    return {
      greet: (name) => log.log(`greeting ${name}`).pipe(Effect.as(`${config.greeting}, ${name}!`))
    }
  })
})
```

`definePlugin` writes the Effect `Layer` for you. If `make` uses a service you
did not list in `requires`, the compiler says so in one line:

```text
KitTypeError<"example/greeter: make uses a service that requires does not declare", Logger>
```

No `as const`, no casts.

## 3. Run them in a host

```ts
// type-checked: not yet (implementation absent)
import { Effect } from "effect"
import { Actor, Bridger } from "@bridger/core"

const operator: Actor = { id: "user-42", kind: "user", display: "J. Doe" }
const ctx = { context: { actor: operator, reason: "first run" } }

const program = Effect.scoped(Effect.gen(function* () {
  const host = yield* Bridger.make({ attribution: { require: true } })

  yield* host.install(greeter, { ...ctx, config: { greeting: "Hello" } })  // waiting: Logger missing
  yield* host.install(logger, ctx)                                          // logger starts, then greeter
  yield* host.awaitIdle()

  const text = yield* host.use(Greeter, (g) => g.greet("Ada"))
  yield* Effect.log(text)                                                   // "Hello, Ada!"

  yield* host.remove("example/logger", ctx)
  // greeter stops first (its finalizers may still use Logger), then logger closes;
  // greeter stays installed and waits for a Logger to return.
}))

Effect.runPromise(program)
```

Order did not matter: `greeter` waited until a `Logger` existed. Every change
carried an actor and a reason; with an audit sink wired, each would produce a
sequenced record.

## 4. Test one plugin

```ts
// type-checked: not yet (implementation absent)
import { Effect } from "effect"
import { expect } from "vitest"
import { PluginTest, it } from "@bridger/kit/testing"

it.plugin("greets with the configured greeting", greeter, {
  provide: [PluginTest.stub(Logger, { log: () => Effect.void })],
  config: { greeting: "Hello" }
}, (t) => Effect.gen(function* () {
  expect(yield* t.use(Greeter, (g) => g.greet("Ada"))).toBe("Hello, Ada!")
}))
```

The test runs on a deterministic test host. When it ends, it fails if a
lease is still held, if a plugin failed unexpectedly, or if shutdown reported
a failure.

## 5. Develop with reload

```text
$ bridger create my-app --template app
$ bridger dev
dev host started: 2 plugins active
saved src/greeter.ts → replace example/greeter (cold start: no handoff declared)
```

`bridger dev` replaces changed plugins through the host's own `replace`, on a
host it owns. It refuses to start when the entry wires an audit sink
(`AuditSink`), an operation gate (`OperationGate`) or a configuration
fingerprinter (`ConfigFingerprinter`), unless it is the kit's in-memory
development double.

## Where next

- Writing plugins: [plugin author guide](./plugin-author-guide.md)
- Implementing a contract without Effect: [partner SDK guide](./partner-sdk-guide.md)
- Holding an error tag: [error catalog](./error-catalog.md)

Change log: 2026-11-10, audit round 2 — `bridger dev` refuses any `AuditSink`, `OperationGate` or `ConfigFingerprinter` other than the kit's in-memory doubles, as kit BEH-KT-026 says (CCR-BR-034).
