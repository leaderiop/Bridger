# 02 — Plugin Test Harness

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-BEH-02                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Core fixtures `scriptedRefusalList` and `memoryCallLog` (`onFailure`, `queue`) re-exported; hook `settle` observed through core (core alignment) (CCR-KT-003)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

Core's `TestHost` ([21 — Testing host](../../core/behaviors/21-testing-host.md))
is a full host with deterministic scheduling. It is the right tool for testing
the core, and a heavy one for testing one plugin: the author must construct
the host, install doubles for every requirement, attribute each call, wait for
activation and check for leaks by hand. `PluginTest` packages those steps.
Every helper here runs through a `TestHost`; none has a path of its own
([INV-KT-002](../invariants.md#inv-kt-002-test-helpers-run-only-through-testhost)).
This file owns BEH-KT-009–016 and uses BEH-KT-009–014; 015 and 016 are
reserved.

Planned source: `packages/kit/src/testing/PluginTest.ts` *(Planned)*.

## BEH-KT-009: mount installs one plugin with its provisions and waits for it

> **Invariant:** [INV-KT-002](../invariants.md#inv-kt-002-test-helpers-run-only-through-testhost)
> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Core seam:** [21 — Testing host](../../core/behaviors/21-testing-host.md) (BEH-BR-177, BEH-BR-178)

```ts
// illustrative — not type-checked
PluginTest.mount<P extends Plugin.Any>(plugin: P, options?: {
  readonly provide?: readonly Provision[]              // stubs, partial stubs or real plugins
  readonly config?: ConfigOf<P>                        // the install override, typed by the plugin's schema
  readonly realm?: string                              // defined on the TestHost before install
  readonly host?: BridgerOptions                       // passed to TestHost.make
  readonly actor?: Actor                               // default PluginTest.actor("test")
  readonly allowWaiting?: boolean                      // default false
}): Effect.Effect<Mounted<P>, MountError<P>, Scope.Scope>

type Provision = Plugin.Any | Stub<any>
type MountError<P> = InstallError | ActivationFailed | PluginRemoved | MissingProvision

interface Mounted<P extends Plugin.Any> {
  readonly host: TestHost
  readonly handle: PluginHandle
  readonly use: <K extends ProvidedKeys<P>, A, E>(key: K, f: (service: ShapeOf<K>) => Effect.Effect<A, E>) => Effect.Effect<A, E | ServiceUnavailable>
  readonly inspect: Effect.Effect<PluginInspection>
  readonly audit: { readonly records: Effect.Effect<readonly AuditRecord[]> }   // TestHost.memoryAuditSink, always wired
}
```

```
REQUIREMENT: `mount` MUST, in this order: create a `TestHost` with the given
             options, a `TestHost.memoryAuditSink` that stores every record
             and a `TestHost.counterIdGenerator`; define the realm if one is
             named; install each provision in the order given, attributed to
             the mount's actor; install the plugin with the given `config`;
             run the host until idle; and resolve when the plugin is
             `active`.
```

```
REQUIREMENT: When the plugin is not `active` once the host is idle, `mount`
             MUST fail with `ActivationFailed` (state `failed`), or — unless
             `allowWaiting` is set — with `MissingProvision { id,
             missingServiceIds }` (state `waiting`). With `allowWaiting`,
             `mount` MUST resolve and leave the plugin `waiting`.
```

```
REQUIREMENT: The type of `mount` MUST report, as `KitTypeError<"mount:
             no provision for a required key", X>`, a required key `X` of
             the plugin that no provision in a literal `provide` array
             provides, unless `allowWaiting` is `true`.
```

```
REQUIREMENT: Every call `mount` makes on the host MUST carry an
             `OperationContext` with the mount's actor and a correlation id
             from the counter, so that a host constructed with
             `attribution.require` accepts them.
```

Because the doubles are installed as plugins, leases, drain, `replace` and
removal apply to them exactly as to real providers; a test can remove a stub
and watch the subject go to `waiting`.

**Settled here.** `MissingProvision` is a kit error: a plugin left `waiting`
is a state in core, not an error (ADR-BR-008), but in a unit test a missing
double is almost always a mistake in the test, so `mount` turns it into one
unless the test opts out.

## BEH-KT-010: Stubs are typed doubles installed as plugins

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)

```ts
// illustrative — not type-checked
PluginTest.stub<K extends KeyRef>(key: K, implementation: ShapeOf<K>): Stub<K>
PluginTest.partial<K extends KeyRef>(key: K, implementation: Partial<ShapeOf<K>>): Stub<K>
```

```
REQUIREMENT: A stub MUST become a definition with id
             `test-stub/<serviceId>`, `requires: []`, `provides: [key]` and a
             build that provides the implementation. `stub` MUST type-check
             the implementation against the full service shape.
```

```
REQUIREMENT: A member that `partial` does not implement MUST, when called or
             read, die with the defect `StubNotImplemented { serviceId,
             member }`. It MUST NOT return `undefined` silently.
```

These replace the prototype's `{} as EventBus` and `{} as never` doubles
(appendix A family F4): a partial double states which members it implements,
and a test that reaches an unimplemented one fails at that member rather than
with a `TypeError` far away.

## BEH-KT-011: it.plugin is a scoped test case with leak and failure checks

> **Invariant:** [INV-KT-002](../invariants.md#inv-kt-002-test-helpers-run-only-through-testhost)
> **See:** [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)

```ts
// illustrative — not type-checked
it.plugin<P extends Plugin.Any>(
  name: string,
  plugin: P,
  options: MountOptions<P> & { readonly expectFailed?: readonly string[] },
  body: (t: Mounted<P>) => Effect.Effect<void, unknown, Scope.Scope>
): void
```

```
REQUIREMENT: `it.plugin` MUST register one test case with the test runner's
             Effect integration that runs `mount`, then `body`, inside one
             scope, under `TestClock`. After `body` succeeds it MUST run the
             host until idle and then fail the case if any plugin holds a
             lease (`inspect(...).leases > 0`) or is `failed` and not listed
             in `expectFailed`. Closing the scope MUST shut the host down;
             a `CloseReport` with `failed` entries MUST fail the case.
```

```
REQUIREMENT: A failing `it.plugin` case MUST print the plugin's
             `PluginInspection` and the last 20 host events with their
             `seq`, and, when an error tag is involved, the matching
             `ErrorCatalog` entry's fix (07 — Error catalog).
```

The post-checks encode what a reviewer of the prototype's tests checked by
hand: nothing is still leased when a test ends, nothing failed that the test
did not expect, and shutdown was clean.

**Open.** Which runner integration is the reference (`@effect/vitest` or an
equivalent for Effect v4); the requirement is runner-neutral.

## BEH-KT-012: Typed fixtures for actors and audit records

> **See:** [ADR-BR-029](../../core/decisions/029-attributable-mutations.md)
> **Core seam:** [22 — Attributable operations](../../core/behaviors/22-attributable-operations.md), [23 — Audit sink and record](../../core/behaviors/23-audit-sink-and-record.md)

```ts
// illustrative — not type-checked
PluginTest.actor(id: string, kind?: Actor["kind"]): Actor                    // default kind "user"
PluginTest.context(actor: Actor, overrides?: Partial<OperationContext>): OperationOptions
PluginTest.record(fields: Partial<AuditRecord>): AuditRecord                 // fills every required field deterministically
```

```
REQUIREMENT: `PluginTest.record` MUST return a value that decodes with the
             core `AuditRecord` schema, filling absent required fields with
             fixed values (`auditSeq` 1, `timestamp` the epoch, `hostId`
             "test-host", `actor` `PluginTest.actor("test")`). It MUST be
             exported only from `@bridger/kit/testing`.
```

These remove the prototype's `{ recordId: "r-1" } as AuditRecord` casts and
the five `kind: "user" as const` helpers (appendix A families F5 and F9).

## BEH-KT-013: Faults and stepping stay core's

> **See:** [ADR-KT-001](../decisions/001-kit-is-sugar-and-tools-over-core.md)
> **Core seam:** [21 — Testing host](../../core/behaviors/21-testing-host.md) (BEH-BR-178, BEH-BR-180)

```
REQUIREMENT: `PluginTest` MUST NOT define faults, scheduling or time
             control of its own. `Mounted.host` MUST expose the core
             `TestHost` unchanged, so that `step`, `pending`, `inject` with
             `Fault.*` and `TestClock` are used directly.
```

```
REQUIREMENT: `PluginTest.holdLease(key)` MUST be generic over any key,
             including a union of keys, and MUST return a handle with
             `release` and the holding fiber; it MUST be implemented with
             `host.use`.
```

```
REQUIREMENT: `PluginTest` MUST re-export core's testing fixtures for the
             seams of CCR-BR-024–026 unchanged — `scriptedRefusalList` and
             `memoryCallLog` with its `onFailure` and `queue` options (core
             [21 — Testing host](../../core/behaviors/21-testing-host.md),
             BEH-BR-182) — and MUST NOT define its own refusal list, call
             log or hook `settle` double. A test of a budgeted hook point
             observes refunds through the hook point's `settle` step (core
             BEH-BR-302) and the entitlement companion's usage export, not
             through a kit-specific hook.
```

The second requirement replaces the prototype's `key as typeof Logger`
(appendix A family F7): holding a lease on "one of these keys" is a common
test step, and a helper generic over the key avoids the cast.

## BEH-KT-014: Expecting failures from several operations

> **See:** [ADR-BR-008](../../core/decisions/008-error-taxonomy.md)

```ts
// illustrative — not type-checked
PluginTest.expectFailure<const T extends readonly Effect.Effect<any, any, any>[]>(
  tag: string, ...effects: T
): Effect.Effect<void, never, RequirementsOf<T[number]>>
```

```
REQUIREMENT: `expectFailure` MUST run each effect in order, and MUST fail
             with a test assertion naming the index and the actual exit when
             an effect succeeds or fails with another tag. Its parameter
             MUST be a variadic tuple, so that effects of different success
             and error types need no cast.
```

This replaces the prototype's `[...] as Array<Effect.Effect<unknown, unknown>>`
(appendix A family F6), used to assert that several operations all fail with
`HostClosed`.

---

_Previous: [01 — Plugin facade](./01-plugin-facade.md)_ · _Next: [03 — Conformance kits](./03-conformance-kits.md)_
