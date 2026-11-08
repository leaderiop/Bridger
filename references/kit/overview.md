# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-OVW                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Companion Specification — Overview                           |
> | Change History | 0.3 (2026-11-08): `countersign` and `verify-chain`; loader statement and audit-chain bundle seams; core testing fixtures (round 2: recheck items 11, 14, 17) (CCR-KT-003)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-KT-001)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

## Mission

Bridger's core is precise and Effect-native. That precision has a price for
adoption: a plugin author must write a `Layer`, keep `requires` and `provides`
in step with it, and — in the prototype — cast definitions to get them into a
host ([appendix A](./appendices/a-cast-inventory.md) counts 55 type assertions
in 3,453 lines of tests). A partner who only wants to implement one contract
should not have to learn Effect at all. The gap report lists "the Effect
learning curve" as a risk and names the facade and the Promise SDK as the
mitigation.

`@bridger/kit` is that mitigation. It is sugar and tooling over core and adds
no runtime semantics ([ADR-KT-001](./decisions/001-kit-is-sugar-and-tools-over-core.md)):
every plugin the facade produces is a core `PluginDefinition`; every test runs
on core's `TestHost`; every reload is a core operation, attributed and audited.

## Package boundary

| Entry point | Contents | Depends on |
| ----------- | -------- | ---------- |
| `@bridger/kit` | `definePlugin`, `Plugin` type helpers, `KitTypeError` | `@bridger/core`, `effect` |
| `@bridger/kit/testing` | `PluginTest`, `it.plugin` | `@bridger/core/testing`, a test runner adapter |
| `@bridger/kit/conformance` | `Conformance.suite`, `Conformance.verify`, `Conformance.http` | `@bridger/core` (contracts), `@bridger/remote` (HTTP subject only) |
| `@bridger/kit/devtools` | `Devtools.plugin`, `Inspector`, `InspectorReport` | `@bridger/core` |
| `@bridger/kit/catalog` | `ErrorCatalog` (data) | none |
| `bridger` (bin) | `create`, `dev`, `test`, `check`, `pack`, `publish`, `countersign`, `verify-chain`, `inspect`, `sdk generate` | all of the above; `@bridger/loader` for `pack`, `publish` and `countersign`; `@bridger/audit-chain` for `verify-chain` |
| generated `<contract>/sdk` | `serve`, typed handler and client types | the remote companion's guest runtime only — no `effect` in the partner's API |

The core's runtime dependency stays `effect` only
([NFR-BR-006](../core/urs.md#nfr-br-006-runtime-dependency-on-effect-only)); the
kit is never imported by core.

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose | Behaviour |
| ------ | ---- | ------- | --------- |
| `definePlugin` | function | Declare a plugin from `make` (one service), a record of services, or `run` (none); writes the `Layer` | [01](./behaviors/01-plugin-facade.md) |
| `Plugin<R, P, E, C>` | type | A core definition with the phantom brand of `Plugin.Any` | [01](./behaviors/01-plugin-facade.md) |
| `KitTypeError<Message, Detail>` | type | The shape of every facade type error | [01](./behaviors/01-plugin-facade.md) |
| `PluginTest.mount` | function | Install one plugin with stubs and configuration on a `TestHost`, wait for activation | [02](./behaviors/02-plugin-test.md) |
| `PluginTest.stub`, `PluginTest.partial` | functions | Full or partial service doubles, installed as plugins | [02](./behaviors/02-plugin-test.md) |
| `PluginTest.actor`, `PluginTest.record` | functions | Typed test actors and audit-record fixtures | [02](./behaviors/02-plugin-test.md) |
| `it.plugin` | function | A scoped test case around `mount` with leak and failure checks | [02](./behaviors/02-plugin-test.md) |
| `Conformance.suite`, `Conformance.verify`, `Conformance.http` | functions | Contract conformance suites and their subjects | [03](./behaviors/03-conformance-kits.md) |
| `bridger <command>` | CLI | Scaffold, develop, test, check, pack, publish, countersign, inspect | [04](./behaviors/04-cli.md) |
| `bridger verify-chain` | CLI | Offline check of an audit-chain verification bundle | [06](./behaviors/06-devtools-inspector.md) |
| `<contract>/sdk` `serve` | generated | Promise handlers for a contract, run behind `Guest.serve` | [05](./behaviors/05-promise-sdk.md) |
| `Devtools.plugin`, `Inspector` | plugin, service | Graph, why-waiting, leases, timeline, JSON report | [06](./behaviors/06-devtools-inspector.md) |
| `ErrorCatalog` | data | One entry per error tag: cause, example, fix | [07](./behaviors/07-error-catalog.md) |

## Core seams used

| Seam | Defined in | Used by |
| ---- | ---------- | ------- |
| `Plugin.define`, `PluginDefinition`, `IdentifiersOf` | [01 — Plugin definition](../core/behaviors/01-plugin-definition.md) | facade |
| `Plugin.Any` (new type, requested) | amendment to [01](../core/behaviors/01-plugin-definition.md), [03](../core/behaviors/03-installation.md), [14](../core/behaviors/14-children-and-groups.md), [18](../core/behaviors/18-reconciliation-and-confluence.md) — see [ADR-KT-002](./decisions/002-plugin-any-is-the-contravariant-top.md) | facade, test harness, `dev` |
| `inspect`, `snapshot`, `events`, `controls`, `plugin-stalled` | [04](../core/behaviors/04-states-and-snapshots.md), [13 — Observability](../core/behaviors/13-observability-and-diagnostics.md) | devtools, `inspect --json` |
| `TestHost`, `Fault`, fixtures | [21 — Testing host](../core/behaviors/21-testing-host.md) | test harness, conformance |
| `reconcile`, ownership scopes | [18 — Reconciliation](../core/behaviors/18-reconciliation-and-confluence.md) | `dev` |
| `Contract.make`, ranges, `IncompatibleContract`, add-only rules | [26 — Versioned contracts](../core/behaviors/26-versioned-contracts.md) (BEH-BR-225–232) | conformance, SDK, `check` |
| Manifest as data, `Plugin.lazy` | [core 27 — Manifest and lazy activation](../core/behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241–249) | `pack`, `check` |
| Grants (`Grant.of`) | [29 — Capability grants](../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273–278) | SDK client side |
| Reconcile plan (dry run) | [core 32 — Generic gate and plan](../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321) | `dev --plan` |
| State handoff on replace | [core 34 — State handoff](../core/behaviors/34-state-handoff.md) (BEH-BR-345–352) | `dev` |
| Remote link, `Guest.serve`, transports | [references/remote/](../remote/invariants.md) (RM) | SDK, `Conformance.http` |
| Package, digest, signing | [references/loader/](../loader/behaviors/01-package-and-digest.md) (LD); `Statement`, `StatementSigner`, `SignaturePolicy.verify` ([07](../loader/behaviors/07-signed-statements.md)) | `pack`, `publish`, `countersign` |
| Verification bundle | [references/audit-chain/](../audit-chain/behaviors/05-verification-bundle.md) (AC; `verifyBundle`) | `verify-chain` |
| Refusal list, call log fixtures | [21 — Testing host](../core/behaviors/21-testing-host.md) (`scriptedRefusalList`, `memoryCallLog`) | `PluginTest` |

Files 27, 32 and 34 are being drafted in parallel; they are named by file and
owner and linked once they exist.

## Worked example

```ts
// illustrative — not type-checked (implementation absent)
import { Context, Effect, Schema } from "effect"
import { Bridger } from "@bridger/core"
import { definePlugin } from "@bridger/kit"
import { PluginTest, it } from "@bridger/kit/testing"

class Logger extends Context.Service<Logger, { readonly log: (m: string) => Effect.Effect<void> }>()("example/Logger") {}
class Greeter extends Context.Service<Greeter, { readonly greet: (name: string) => Effect.Effect<string> }>()("example/Greeter") {}

export const greeter = definePlugin({
  id: "example/greeter",
  requires: [Logger],                       // no `as const`: inferred as a tuple
  provides: Greeter,                        // one service: `make` returns its implementation
  config: Schema.Struct({ greeting: Schema.String }),
  make: ({ config }) => Effect.gen(function* () {   // config: the decoded Plugin.Config value
    const log = yield* Logger
    return { greet: (name) => log.log(`greet ${name}`).pipe(Effect.as(`${config.greeting}, ${name}`)) }
  })
})

it.plugin("greets with the configured greeting", greeter, {
  provide: [PluginTest.stub(Logger, { log: () => Effect.void })],
  config: { greeting: "Hello" }
}, (t) => Effect.gen(function* () {
  const text = yield* t.use(Greeter, (g) => g.greet("Ada"))
  expect(text).toBe("Hello, Ada")
}))
```

Remove `requires: [Logger]` and the compiler reports, at `make`:

```text
KitTypeError<"example/greeter: make uses a service that requires does not declare", Logger>
```

The same plugin installs in a production host with `host.install(greeter, ctx)`,
exactly as a definition written with `Plugin.define`.

---

_Previous: [README](./README.md)_ · _Next: [01 — Plugin facade](./behaviors/01-plugin-facade.md)_
