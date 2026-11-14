# 01 — Entitlement Port

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-BEH-01                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — `EntitlementUnavailable` gains `realm` beside `pluginId`, taken from the subject, as `NotEntitled` names its plugin (PL11) (CCR-EN-010)<br>0.6 (2026-11-10): BEH-EN-001: `Entitlement.layer` records the application's `essential` list process-locally, where `guard` reads it (E2); BEH-EN-003: mode "unknown" and core's "unmetered" allow only essential uses; BEH-EN-005: under "last-known" with no answer ever known the served state is mode "unknown" with `stale: true` (E3) (SPEC-AUDIT-04) (CCR-EN-007)<br>0.5 (2026-11-10): BEH-EN-001: `Entitlement.guard` leaves the list of components that require the `Entitlement` service, since it reads the mode from the activation's `Plugin.Runtime.entitled` (02, BEH-EN-014), and is given `essential` in its own options (M25); BEH-EN-005: `checkTimeout` defaults to 4 seconds, shorter than core's 5-second `resolutionTimeout`, so `Entitlement.capabilityPolicy` builds with defaults (M26) (CCR-EN-006)<br>0.4 (2026-11-10): BEH-EN-001: the application's `EntitlementAdapter` is wrapped by `Entitlement.layer(adapter, options)`, the one way `EntitlementOptions` reach the package's components, and the `Entitlement` service carries them; BEH-EN-003 and 004: the adapter's fallback mode is `EntitlementState.fallbackMode` (P13) (CCR-EN-005)<br>0.3 (2026-11-08): Round 2: recheck item 16; core alignment — BEH-EN-007 names the contribution policy (core `HookPointOptions.policy`) and grant narrowing (04) among the components that never refuse essential uses (CCR-EN-003)<br>0.2 (2026-11-08): Essential labels of hook contributions are the skip policy's `step.labels` (CCR-EN-002)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

Whether a plugin may run, and how much of it, is a fact the application
knows and Bridger does not. This file defines the port through which the
application states that fact, the shape of its answer, how expiry and grace
are evaluated against the host's `Clock`, and what happens when the port
cannot answer. It deliberately says nothing about where entitlements come
from. This file owns BEH-EN-001–008 and uses all eight.

> **What this package does not do — and who does**
>
> It does not issue, sign, verify or store licences, keys or payments; the
> application's adapter does. It does not decide what a mode means inside a
> plugin; the plugin does (BEH-EN-014). It does not synchronise clocks; the
> consumer is responsible for the `Clock` it provides
> ([BEH-BR-216](../../core/behaviors/24-time-ids-and-sequence.md)).

Planned source: `packages/entitlement/src/Entitlement.ts` *(Planned)*.

## BEH-EN-001: The Entitlement port is optional, and the package ships no implementation

> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
interface EntitlementAdapter {                       // the application's
  readonly check: (subject: EntitlementSubject) => Effect.Effect<EntitlementState, EntitlementUnavailable>
  readonly watch: (subject: EntitlementSubject) => Stream.Stream<EntitlementState, EntitlementUnavailable>
}
interface EntitlementShape extends EntitlementAdapter {
  readonly options: EntitlementOptions               // BEH-EN-005; read by every component that requires the service
}
class Entitlement extends Context.Service<Entitlement, EntitlementShape>()("@bridger/entitlement/Entitlement") {}
declare const Entitlement: {
  readonly layer: (adapter: EntitlementAdapter, options: EntitlementOptions) => Layer.Layer<Entitlement, EntitlementConfigError>
}

class EntitlementUnavailable extends Schema.TaggedError<EntitlementUnavailable>()("EntitlementUnavailable", {
  pluginId: Schema.String,
  realm: Schema.optional(Schema.String),                    // the subject's realm, when it has one (core BEH-BR-147)
  message: Schema.String
}) {}
```

```
REQUIREMENT: `@bridger/entitlement` MUST NOT export an `EntitlementAdapter`
             implementation — no "allow all", no "always full", no example
             adapter outside its testing entry point. The only fixture MUST be
             a scripted test adapter exported from
             `@bridger/entitlement/testing`.
```

```
REQUIREMENT: `Entitlement.layer(adapter, options)` MUST be the only way the
             `Entitlement` service is provided: it serves the adapter's
             `check` and `watch` unchanged, with `options`, and gives no
             answer of its own. It MUST fail with `EntitlementConfigError`
             (component "Entitlement.layer", 04) when `onUnavailable` is
             absent or is "last-known" without `staleAfter` (BEH-EN-005).
             Every component that requires the service reads `labels`,
             `onUnavailable`, `staleAfter`, `checkTimeout` and `essential`
             from the service's `options`. `Entitlement.guard` requires no
             service: `Entitlement.layer` MUST, when built, record
             `options.essential` in the package's process-local state,
             where `guard` reads it (02, BEH-EN-014).
```

```
REQUIREMENT: Every component of this package that needs the port (the gate
             of BEH-EN-009, the view of BEH-EN-013, `Entitlement.capabilityPolicy`
             of 04) MUST require it in its layer's requirements. None MAY
             fall back to a default answer when it is absent.
             `Entitlement.guard` does not read the port: it reads the mode
             the activation's `Plugin.Runtime.entitled` gives (02,
             BEH-EN-014), which the view feeds.
```

A shipped "always full" adapter would be the same false affordance the core
refuses for the gate ([ADR-BR-032](../../core/decisions/032-operation-gate.md)):
wired "for now", it makes a deployment look metered when nothing is. A host
that wants no entitlement simply does not use this package, and then
nothing in it runs.

## BEH-EN-002: The subject is a plugin and opaque labels

> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```ts
// illustrative — not type-checked
interface EntitlementSubject {
  readonly pluginId: string
  readonly realm?: string
  readonly version?: string                                   // the definition's meta.version, when declared
  readonly labels: Readonly<Record<string, string>>           // opaque: e.g. { org: "o-1", plan: "p" }
}
```

```
REQUIREMENT: The package MUST treat label keys and values as opaque strings:
             it MAY compare them for equality and MUST NOT parse, order,
             rank or interpret them. No label key MAY have a meaning fixed
             by Bridger.
```

```
REQUIREMENT: `pluginId` and `realm` MUST be the target of the request or the
             activation the subject is built for, never a value supplied by
             plugin code. Labels MUST come from the application's
             `EntitlementOptions.labels` function, evaluated for that
             target. An `EntitlementUnavailable` for a subject, from the
             adapter or treated as such by the package (BEH-EN-005), MUST
             name its plugin by the subject's `pluginId` and, when the
             subject has one, `realm`, as the record `{ id, realm }` does
             (core BEH-BR-147).
```

Keeping labels opaque is what keeps the host free of domain concepts: an
"org", a "seat", a "device" or a "project" are all just a key and a value
to Bridger. Taking `pluginId` from the target, not from the plugin, means a
plugin cannot ask about another plugin's entitlement and receive its own.

## BEH-EN-003: The EntitlementState and its four modes

> **Invariant:** [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```ts
// illustrative — not type-checked
type EntitlementMode = "full" | "grace" | "read-only" | "none"

interface EntitlementState {
  readonly mode: EntitlementMode | "unknown"   // "unknown": served by the package, never by the adapter (BEH-EN-005)
  readonly validUntil?: string        // ISO-8601 UTC; end of "full"
  readonly graceUntil?: string        // ISO-8601 UTC; end of "grace"
  readonly reason?: string            // free text from the adapter, e.g. "expired"
  readonly asOf: string               // when this state was established, from Clock
  readonly stale?: true               // last-known answer served under onUnavailable (BEH-EN-005)
  readonly fallbackMode?: "read-only" | "none"   // the adapter's mode after validUntil and graceUntil (BEH-EN-004); "read-only" when absent
}
```

```
REQUIREMENT: The modes MUST be ordered `full` > `grace` > `read-only` >
             `none` for the purpose of "allows": `grace` MUST allow every
             use `full` allows; `read-only` MUST allow only uses declared
             read-only or essential (BEH-EN-007, BEH-EN-014); `none` MUST
             allow only essential uses. Mode "unknown", which the derived
             `watch` serves when no answer is known (BEH-EN-005), and core's
             "unmetered" (02, BEH-EN-013) MUST allow only essential uses, as
             `none` does.
```

```
REQUIREMENT: A mode MUST NOT be mapped to a plugin lifecycle state. No mode,
             including `none`, MAY cause the package to call `remove`,
             `disable`, `restart` or any other host operation.
```

`grace` exists as its own mode because a plugin, an admin screen or a user
often needs to say "this will stop soon" while nothing has yet changed.
`none` is not "removed": the plugin keeps running its essential work, and a
person decides whether to take it out
([ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)).

## BEH-EN-004: Expiry and grace are evaluated against Clock

> **Invariant:** [INV-EN-002](../invariants.md#inv-en-002-a-lapse-never-changes-plugin-state-by-itself)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md), [ADR-BR-025](../../core/decisions/025-deterministic-time-and-ids.md)
> **Satisfies:** [URS-BR-027](../../core/urs.md#urs-br-027-reproduce-time-and-identifiers-during-validation)
> **Risk:** [RSK-BR-007](../../core/gxp/03-risk-assessment.md#rsk-br-007)

```
REQUIREMENT: When an answer carries `validUntil` or `graceUntil`, the package
             MUST derive the effective mode from the time read from `Clock`:
             `full` until `validUntil`; then `grace` until `graceUntil` when
             present; then the adapter's stated `fallbackMode`, `read-only`
             when it states none. The package MUST NOT read ambient time.
```

```
REQUIREMENT: The package MUST emit a new state on `watch` at each such
             boundary without waiting for the adapter, using a timer from
             `Clock`, so that a host under `TestClock` crosses the boundary
             exactly when the test clock does.
```

```
REQUIREMENT: The package MUST NOT extend a `validUntil` or `graceUntil` the
             adapter returned. Only a new answer from the adapter MAY raise
             the mode again.
```

Deriving the boundary locally is what lets an offline host lapse on time:
an adapter that verified a token once does not need to be asked again for
the token's end date to be honoured. Reading `Clock` keeps the behaviour
reproducible in tests, as the core requires for its own time.

## BEH-EN-005: A port that cannot answer — onUnavailable and staleAfter

> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014)

```ts
// illustrative — not type-checked
interface EntitlementOptions {
  readonly labels: (target: { pluginId: string; realm: string }) => Readonly<Record<string, string>>
  readonly onUnavailable: "last-known" | "read-only" | "none"          // required, no default
  readonly staleAfter?: Duration.Input                                  // with "last-known": required
  readonly checkTimeout?: Duration.Input                                // default 4 seconds: shorter than core's 5-second resolutionTimeout (04, BEH-EN-025)
  readonly essential?: readonly string[]                                // BEH-EN-007
}
```

```
REQUIREMENT: `onUnavailable` MUST be stated explicitly; the package MUST NOT
             choose a default. With "last-known", `staleAfter` MUST be
             stated, and a last-known state older than `staleAfter` (by
             `asOf`, read against `Clock`) MUST be served as `read-only`
             with `stale: true`. Under "last-known", while no answer was
             ever known for the subject, the served state MUST be
             `{ mode: "unknown", stale: true, reason:
             "entitlement-unavailable", asOf }`, `asOf` read from `Clock`.
```

```
REQUIREMENT: A `check` that fails, dies, or does not complete within
             `checkTimeout` MUST be treated as `EntitlementUnavailable`. A
             state served under `onUnavailable` MUST carry `stale: true`.
```

```
REQUIREMENT: Unavailability MUST NEVER raise a mode: the served state MUST be
             at most the last-known mode, and at most `read-only` once
             stale.
```

There is no right default between keeping a plugin usable during a licence
server outage and cutting it to read-only, so the application must choose
in writing. What is fixed is the direction: an outage may lower what a
plugin may do, never raise it. The gate's reading of unavailability for
granting operations is stricter still (BEH-EN-011).

## BEH-EN-006: watch is a latest-wins stream that starts with the current state

> **See:** [ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md), [ADR-BR-007](../../core/decisions/007-observation-primitives.md)
> **Satisfies:** [URS-BR-006](../../core/urs.md#urs-br-006-recover-from-failure-explicitly-and-never-silently)

```
REQUIREMENT: The package's derived `watch` MUST emit the current effective
             state first, then each change of effective state (mode,
             `validUntil`, `graceUntil`, `stale`), and MUST NOT emit two
             equal consecutive states.
```

```
REQUIREMENT: A slow subscriber MUST see the latest state, not a backlog:
             intermediate states MAY be skipped, the latest MUST NOT.
```

```
REQUIREMENT: A failure of the adapter's stream MUST NOT end the derived
             stream: it MUST be handled as unavailability (BEH-EN-005) and
             the adapter's stream MUST be re-subscribed on a schedule read
             from `Clock`, starting at 1 second and doubling up to 1
             minute.
```

Entitlement is state, not a log of events, so it follows the core's
latest-wins state feed (`Host.changes`) rather than its lossy event feed. A
plugin that missed "grace" and sees "read-only" has lost nothing it needs.

## BEH-EN-007: Essential labels are never refused by this package

> **Invariant:** [INV-EN-005](../invariants.md#inv-en-005-essential-uses-are-never-refused-by-entitlement-or-budget-helpers)
> **See:** [ADR-EN-001](../decisions/001-entitlement-changes-modes-not-state.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)

```
REQUIREMENT: The application MAY declare a list of essential labels
             (`EntitlementOptions.essential`, opaque strings). A use that
             carries one of them — through `Entitlement.guard`'s `labels`, a
             hook contribution's labels (`step.labels` of a contribution
             policy, 02, BEH-EN-016), a plugin subject's labels when grants
             are narrowed (04, BEH-EN-027), or a budget reservation's
             `essential` flag — MUST NOT be refused or degraded by any component of this
             package, whatever the mode or budget.
```

```
REQUIREMENT: Every component that lets an essential use through in a mode
             that would otherwise refuse it MUST count it on a
             per-label counter exposed by `Entitlement.inspect`, so that the
             use is visible.
```

Some work must happen whether or not anything was paid for — a duty the
system owes its users or a regulator. Bridger cannot know which work that
is, so the application names it with a label and the package guarantees,
in one place, that no entitlement or budget helper stands in its way. What
is essential remains the application's decision and its responsibility.

## BEH-EN-008: Entitlement states are diagnostics, not audit records

> **See:** [ADR-EN-002](../decisions/002-runtime-stream-and-gate-only.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-021](../../core/urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
> **Risk:** [RSK-BR-012](../../core/gxp/03-risk-assessment.md#rsk-br-012)

```
REQUIREMENT: The package MUST NOT write to the core `AuditSink`. A refusal
             it causes on a host operation MUST reach the trail only as the
             core's `rejected` record of that call (25 — Operation Gate,
             BEH-BR-220), with the reason of BEH-EN-010.
```

```
REQUIREMENT: Mode changes MUST be logged at info level with plugin id,
             realm, old and new mode and reason, and MUST NOT carry label
             values the application marks secret. Documentation MUST state
             that this log is diagnostic, not a record of entitlement.
```

An entitlement change is not a change to the plugin set, so it is not the
core's to record; a consumer that must keep a record of entitlement
decisions keeps it in its own adapter, which is the party that made them.

**Settled here.** (1) Four modes, not a boolean: `grace` is visible, and
`none` keeps essential work running. (2) `onUnavailable` has no default.
(3) Unavailability never raises a mode. (4) The package writes no audit
records of its own.

**Open.** (1) Whether `EntitlementState` should carry an adapter-supplied
`evidence` reference (token id) for diagnostics, and how to keep it out of
logs when it is sensitive. (2) Whether labels should be resolvable per call
(for subjects that change within an activation) or only per activation, as
specified here.

---

_Next: [02 — Gate and Runtime](./02-gate-and-runtime.md)_
