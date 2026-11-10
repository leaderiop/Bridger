# 34 — State Handoff

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-34                                               |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-10): BEH-BR-347 and BEH-BR-349 the plugin is carried in `CurrentTransition` by its canonical key (C1) (CCR-BR-036)<br>0.7 (2026-11-10): BEH-BR-347 and BEH-BR-349 export, `upgrade` and `import` carry the plugin in `CurrentTransition`, not `HeldPlugins` (H1) (CCR-BR-035)<br>0.6 (2026-11-10): BEH-BR-345 a definition without `handoff` behaves as files 01–20 and 22–33 specify (review of CCR-BR-034) (CCR-BR-034)<br>0.5 (2026-11-09): Examples use `Plugin.define` (C-15); BEH-BR-347 export as the stop's final step of any handing-off operation (C-14); export under the old activation's principal and import and upgrade under the new one's, each with an empty annotation bag and the correlation of its stop or build (U-04); BEH-BR-346 a lazy registration's old side is its loaded definition, whose `handoff` is checked at load (U-05); BEH-BR-349 the value is imported only into a build that will be published, a stale build receives nothing and a target change during the import waits for publication; BEH-BR-351 a `restart` or `reconfigure` that supersedes the new build keeps the value held for the next build (U-02); acceptance rows REQ-BR-087 and 088 (CCR-BR-033)<br>0.4 (2026-11-09): BEH-BR-353 `PluginHandle.restart` takes `HandoffCallOptions`; BEH-BR-013 named as the source of every signature (C-01) (CCR-BR-032)<br>0.3 (2026-11-08): BEH-BR-353 handoff on `restart` and on a restarting `reconfigure` when the definition lists them in `alsoOn`, `cold` call option, none on a volatile-only `reconfigure` (gap G44); BEH-BR-346 and 350 extended to those operations and to the undo `replace` of an atomic apply; BEH-BR-352 the previous definition kept for an atomic apply's undo; acceptance check 103 (CCR-BR-025)<br>0.2 (2026-11-08): handoff loss tags declared record-only (ADR-BR-008) (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

---

`replace` is stop-then-start with no rollback
([ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)): the old
activation's scope closes before the new build runs, so anything the plugin
held in memory — a cache it took an hour to warm, the open positions of a
session, a counter not yet flushed — is lost on every upgrade. Erlang solves
the same problem with `code_change`: the running process hands its state to
the new module, which converts it from the old version's shape. This file
adds the equivalent for one activation's in-memory state: a definition may
declare `handoff: { version, schema, export, import }`; on a `replace` of an
active plugin whose old and new definitions both declare it, the old
activation exports its state after its leases have drained and before its
scope closes, the host holds the encoded value, and the new activation
imports it after its build and before it is published. When the state cannot
be carried across — the export fails, the new version cannot decode it, the
new build fails — the new activation starts cold, and the loss is recorded.
Stop-then-start, one provider per key and no rollback are unchanged. It has
no SPEC.md source section
([ADR-BR-049](../decisions/049-state-handoff-on-replace.md), complementing
ADR-BR-004). This file owns BEH-BR-345–360 and uses BEH-BR-345–353;
numbers 354–360 of the block are reserved.

> **What core does not do — and who does**
>
> Handoff carries in-memory state between two activations in one host
> process. Core does not persist it, does not carry it across a process
> restart, does not keep it after the import, and does not reverse external
> effects. Core does not judge whether a state is correct for the new
> version: the definition's schema and import do. A plugin whose state must
> survive a crash keeps it in its own store.

Planned source: `packages/core/src/Handoff.ts`, with the stop and activation
steps in `packages/core/src/Lifecycle.ts` *(Planned)*.

## BEH-BR-345: A definition may declare a handoff

> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement)

```ts
// illustrative — not type-checked
interface Handoff<S, Encoded, Provided> {
  readonly version: string                                   // the handoff format this definition writes
  readonly schema: Schema.Codec<S, Encoded>                  // Encoded: plain data (JSON-compatible)
  readonly export: Effect.Effect<S, HandoffError, Provided>  // runs in the old activation
  readonly import: (state: S) => Effect.Effect<void, HandoffError, Provided>   // runs in the new one
  readonly accepts?: readonly string[]                       // older formats it can read; default [version]
  readonly upgrade?: (from: { readonly version: string; readonly encoded: unknown }) =>
    Effect.Effect<Encoded, HandoffError>                     // code_change: old format → this format
  readonly alsoOn?: readonly ("restart" | "reconfigure")[]   // also hand off on these (BEH-BR-353); default []
}
class HandoffError extends Schema.TaggedError<HandoffError>()("HandoffError", { message: Schema.String }) {}

const counter = Plugin.define({
  id: "metrics/counter",
  provides: [Counter],
  build: CounterLive,
  handoff: {
    version: "2",
    schema: Schema.Struct({ counts: Schema.Record(Schema.String, Schema.Number) }),
    export: Effect.flatMap(Counter.asEffect(), (c) => c.snapshot),
    import: (s) => Effect.flatMap(Counter.asEffect(), (c) => c.restore(s)),
    accepts: ["1", "2"],
    upgrade: ({ version, encoded }) => version === "1" ? migrateV1(encoded) : Effect.succeed(encoded as never)
  }
})
```

```
REQUIREMENT: `handoff` MUST be optional on a plugin definition. A definition
             without it MUST behave exactly as files 01–20 and 22–33 specify, and
             `replace` to or from such a definition MUST NOT attempt a
             handoff.
```

```
REQUIREMENT: `export` and `import` MUST have as their only requirements the
             services the definition provides (`Provided`); the host MUST
             run them against the activation's own built services. They
             MUST NOT be able to require another plugin's services.
```

```
REQUIREMENT: `version` MUST be a non-empty string, `accepts`, when given,
             MUST contain `version`, `alsoOn`, when given, MUST hold only
             "restart" and "reconfigure" without repetition, and the
             schema's encoded side MUST be plain data. A definition that breaks these MUST fail the
             definition checks of `install` and `replace` with
             `InvalidDefinition` (03 — Installation).
```

The state lives in services the plugin provides — a counter, a cache, a
session table — so the declaration can be static, part of the definition,
and still reach the activation's state: the host runs `export` against the
old activation's services and `import` against the new one's. This keeps the
build a plain `Layer` ([ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md))
with no handoff API to call from inside it.

**Settled here.** (1) The format `version` is separate from `meta.version`:
many releases of a plugin keep one state format, and a release can change the
format without a version label at all. (2) `accepts` and `upgrade` are the
`code_change` of the new version: the *new* definition decides what it can
read, because only it knows its own shape. A plugin whose state is private
to its build provides a private key for it, or does not declare a handoff.

## BEH-BR-346: Handoff applies only to replace of an active plugin, and where BEH-BR-353 admits it

> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement), [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```
REQUIREMENT: A handoff MUST be attempted only for a `replace` (including a
             `reconcile` entry action `replace` and the undo `replace` of an
             atomic apply, 32 — Generic Gate and Plan, BEH-BR-323) of a
             plugin that is `active` when its stop begins and whose old and
             new definitions both declare `handoff`, and for the `restart`
             and restarting `reconfigure` that BEH-BR-353 admits.
```

```
REQUIREMENT: No other stop — `remove`, `disable`, a `restart` or
             `reconfigure` that BEH-BR-353 does not admit, a runtime
             failure, dependency loss, shutdown — and no `replace` of a
             plugin in any other state MUST export, hold or import state.
```

```
REQUIREMENT: For a registration made from a lazy definition (27 — Manifest
             and Lazy Activation, BEH-BR-244), the old side of a handoff
             MUST be the loaded definition's `handoff`, and only while that
             definition is loaded: a registration not yet loaded, or whose
             loaded definition an idle return released (BEH-BR-252), has no
             old side and MUST NOT hand off. A `LazyPluginDefinition`
             declares no `handoff` of its own. A loaded definition's
             `handoff` MUST be checked against BEH-BR-345 when it is loaded,
             and one that breaks it fails the load (27, BEH-BR-246), so an
             invalid declaration never becomes the old side.
```

```
REQUIREMENT: Handoff MUST NOT change the stop-then-start order of
             BEH-BR-049: the old activation MUST stop, dependents first,
             before the new definition is swapped in and built; the two
             activations MUST NEVER provide the plugin's keys at the same
             time.
```

Limiting handoff to `replace` keeps it the answer to one question — "carry
my state to the new code" — and keeps every other stop exactly as it is.
A lazy registration declares only a manifest until it loads, so `install` and
`replace` of it cannot see a `handoff`; the declaration that runs is the
loaded one, and the load is where it is checked (CCR-BR-033).
`restart` and `reconfigure` run the same definition, and hand off only when
the definition asks for it (BEH-BR-353); a plugin that wants its state
across a process restart is asking for persistence, which is its own store's
job.

## BEH-BR-347: Export runs after the drain and before the scope closes

> **Invariant:** [INV-BR-006](../invariants.md#inv-br-006-a-leased-provider-does-not-close-under-its-lease), [INV-BR-005](../invariants.md#inv-br-005-dependents-stop-before-their-providers)
> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035)

```ts
// illustrative — not type-checked
interface BridgerOptions {
  // ...
  readonly handoffTimeout?: Duration.Input     // default 5 seconds; bounds export, upgrade and import each
}
```

```
REQUIREMENT: In the stop of an operation that attempts a handoff — a
             `replace`, or a `restart` or `reconfigure` that BEH-BR-353
             admits — the host MUST run the old definition's `export` after
             the dependents have stopped and the old activation's leases
             have drained (or been revoked under `force`), and before its
             scope begins to close, as the stop's final step: in the same
             transition step that closes the scope and, for a `replace`,
             swaps the definition.
```

```
REQUIREMENT: The exported value MUST be encoded with the old definition's
             `schema` at once. `export` and encoding together MUST be
             bounded by `handoffTimeout`, measured with the `Clock`
             service.
```

```
REQUIREMENT: When `export` fails, dies, times out or produces a value that
             does not encode, the host MUST drop the handoff, MUST continue
             the stop — scope close, the swap of a `replace`, and new build — as if no handoff
             had been declared, and MUST record the loss (BEH-BR-350). An
             export failure MUST NOT fail the `replace`, the stop or the old
             activation.
```

```
REQUIREMENT: `export` MUST run as a finalizer of the old activation does,
             whatever the fiber of the call that caused the stop carries:
             under the old activation's principal (28 — Plugin Principal and
             Mandatory Policy, BEH-BR-258), with
             `@bridger/core/CurrentActor` set to `Actor.unattributed`
             (22 — Attributable Operations, BEH-BR-187),
             `@bridger/core/CurrentAnnotations` set to `Annotations.empty`
             (30 — Operation Context Annotations, BEH-BR-292),
             `@bridger/core/CurrentCorrelation` set to the correlation of
             the stop it runs in (BEH-BR-187), and the plugin's canonical
             key in `@bridger/core/CurrentTransition` (BEH-BR-088).
```

Exporting after the drain means the state is quiescent: no admitted call is
still changing it. Exporting before the scope closes means the services that
hold it still exist. A stop that waits for a `DrainTimeout` and parks
(BEH-BR-045) has not reached the export; the export runs when the stop
resumes and its drain completes.

**Settled here.** (1) An export that fails cannot hold up the stop: the old
activation is already unavailable to new consumers, and a stop that waited
on a broken export would trade a lost cache for an outage. (2) Under
`force`, the export sees the state as the interrupted calls left it; the
plugin's `import` decides whether that is usable. (3) The export runs inside
an operator's call, but it is the plugin's code run for the plugin, like a
finalizer, so it takes the plugin's principal and an empty annotation bag,
never the caller's identity or labels; only the correlation follows the
call, as a finalizer's does, so that a host call the export makes belongs to
the change that caused it (CCR-BR-033).

## BEH-BR-348: The held state is never observable, and is released at once

> **Invariant:** [INV-BR-045](../invariants.md#inv-br-045-handed-off-state-is-never-observable-and-its-loss-is-recorded), [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable)
> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035), [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: Between export and import the host MUST hold only the encoded
             value and the old `version`, in memory. It MUST NOT write
             them to any store, the `AuditSink`, the gate, events, logs,
             snapshots, `inspect` or any error message.
```

```
REQUIREMENT: The host MUST drop its reference to the held value as soon as
             the import completes or the handoff is abandoned
             (BEH-BR-350, BEH-BR-351).
```

```
REQUIREMENT: A `TestHost` MAY expose the held value to a test only through
             `@bridger/core/testing` (21 — Testing Host).
```

State can be as sensitive as configuration — tokens, personal data in a
session — so it is treated the same way: it crosses from one activation to
the next and goes nowhere else.

## BEH-BR-349: Import runs after the build, before publication

> **Invariant:** [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky)
> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-005](../decisions/005-failure-is-sticky.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035)

```
REQUIREMENT: The held value MUST be imported only into a build that will be
             published. When the new build settles, the host MUST first
             decide whether it is stale (05 — Activation, BEH-BR-039). A
             stale build MUST NOT receive the value: it MUST be discarded as
             BEH-BR-039 requires, without `upgrade`, decoding or `import`,
             and the value MUST stay held for the next build of the
             registration, unless the change that made the build stale
             abandons the handoff (BEH-BR-351).
```

```
REQUIREMENT: Once the host has begun the steps below for a build that is not
             stale, that build MUST be published or fail as this behaviour
             says: the steps are the last part of its build step, and a
             change of the plugin's target while they run — an operator
             call, a captured provider beginning to stop — MUST NOT make it
             stale. An operator call that reaches its linearization point
             while they run MUST wait, before its intent is recorded, until
             the build step has ended, and MUST then be decided by
             BEH-BR-071 against the state the plugin landed in (`active`, or
             `failed` when the import failed), as a call that meets a
             running system stop is (08 — Operation Legality, BEH-BR-073);
             the wait is before the intent, so interrupting the caller
             during it ends the call as BEH-BR-067 says. A cascade waits for
             the build step as for any build (BEH-BR-079) and then stops the
             plugin. Shutdown is the one exception: a build whose steps are
             running when shutdown begins settles and is discarded (12 —
             Shutdown and Hosting, BEH-BR-105), and the handoff is
             abandoned.
```

```
REQUIREMENT: When the new build succeeds, is not stale and a held value
             exists, the host MUST, before publishing the new activation
             (BEH-BR-037):
             - when the old `version` is not the new `version`: run the new
               definition's `upgrade` if the old version is in `accepts`,
               or abandon the handoff if it is not or `upgrade` is absent;
             - decode the (upgraded) value with the new `schema`, ignoring
               fields the schema does not declare;
             - run the new definition's `import` with the decoded state.
             Each step MUST be bounded by `handoffTimeout`.
```

```
REQUIREMENT: When the version is not accepted, `upgrade` fails, dies or
             times out, or decoding fails, the host MUST abandon the handoff,
             MUST publish the new activation without importing (a cold
             start), and MUST record the loss (BEH-BR-350).
```

```
REQUIREMENT: When `import` fails, dies or times out, the activation MUST
             fail with phase "activation" and publish nothing, as a failure
             around the build does (05 — Activation); the held value MUST be
             dropped and the loss recorded. The host MUST NOT retry the
             import or restart the plugin cold.
```

```
REQUIREMENT: `upgrade` and `import` MUST run as the new activation's build
             does: under the new activation's principal (28, BEH-BR-258),
             with `@bridger/core/CurrentActor` set to `Actor.unattributed`,
             `@bridger/core/CurrentAnnotations` set to `Annotations.empty`,
             `@bridger/core/CurrentCorrelation` set to the build's
             correlation (22, BEH-BR-187; 30, BEH-BR-292), and the plugin's
             canonical key in `@bridger/core/CurrentTransition`
             (BEH-BR-088).
```

Decoding failure leads to a cold start because nothing has been applied yet:
the new activation is whole, it only lacks the old state. Import failure is
different: `import` may have written part of the state into the new
services, and an activation in that condition is not the one anyone
approved. Failing it is the conservative reading, and
[ADR-BR-005](../decisions/005-failure-is-sticky.md) then applies: an
operator's `retry` starts it again — cold, because the held value is gone.

**Settled here.** (1) Unknown fields are ignored when decoding, so that a newer
old version exporting an extra field does not force a cold start on a
version that does not need it; this is the add-only evolution rule of
[26 — Versioned Contracts](./26-versioned-contracts.md) applied to state.
(2) Staleness is decided before the import, and the import then commits the
build (CCR-BR-033). Revision 0.4 ran the import "before publishing" and
dropped the value "as soon as the import completes", so a build superseded
after it settled could import the state and then be discarded, losing it.
Deciding first means a superseded build never sees the value. Committing the
build once the import begins is the other half: an import may already have
written part of the state into the new services, so discarding that build
would lose the state as surely. A call that arrives during the import waits
for a bounded time (`handoffTimeout` for each step) and then applies to the
published activation, exactly as it would had it arrived a moment later; a
provider that begins to stop meanwhile is still open, because its own stop
waits for this dependent's (06 — Removal, BEH-BR-043), so publishing the
build exposes no closed service. Shutdown discards instead, because nothing
may start once it has begun (BEH-BR-105).

## BEH-BR-350: A lost handoff is recorded

> **Invariant:** [INV-BR-045](../invariants.md#inv-br-045-handed-off-state-is-never-observable-and-its-loss-is-recorded), [INV-BR-022](../invariants.md#inv-br-022-one-requested-and-one-terminal-record-per-mutating-call)
> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement), [URS-BR-028](../urs.md#urs-br-028-know-which-plugin-version-was-active-at-any-time)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Complete

```ts
// illustrative — not type-checked
// SystemTransition gains "handoff" (22 — Attributable Operations, BEH-BR-185).
// error._tag values of a handoff record that ends in loss — record-only tags, like "Interrupted"
// (ADR-BR-008): never Schema.TaggedError classes, never in any operation's error union:
type HandoffLoss =
  | "HandoffExportFailed" | "HandoffVersionUnaccepted" | "HandoffUpgradeFailed"
  | "HandoffDecodeFailed" | "HandoffImportFailed" | "HandoffAbandoned"
```

```
REQUIREMENT: With a sink wired, each attempted handoff MUST produce exactly
             one system record with `operation: "handoff"`, phase
             `system`, actor `Actor.system`, the plugin as `target`, and a
             `causationId` naming the `requested` record of the `replace`,
             `restart` or `reconfigure` that attempted it
             (BEH-BR-190). When the state was imported, the record MUST
             carry no `error`; when it was lost, `error` MUST carry one of
             the `HandoffLoss` tags and a core-written message naming the
             step, never the plugin's text or any state.
```

```
REQUIREMENT: The handoff record MUST be written before the `system-start`
             record of the new activation, so that a reviewer reads "state
             carried" or "cold start" before "active".
```

```
REQUIREMENT: A lost handoff MUST also be reported as a `handoff-lost` host
             event naming the plugin and the tag, and logged at warning
             level. An imported handoff MUST be reported as a
             `handoff-imported` host event.
```

```
REQUIREMENT: A handoff record that cannot be written MUST set the
             audit-degraded latch, as every system record does
             (BEH-BR-205); it MUST NOT block or undo the activation.
```

A cold start that nobody can see is the silent loss the review warned of:
an upgraded plugin that quietly forgot its open sessions looks healthy and
behaves wrongly. One record per attempt makes the outcome part of the
plugin's history, next to the version that became active.

**Settled here.** (1) One `SystemTransition` value with an optional `error`,
not two values: BEH-BR-196 already says a system record carries `error`
exactly when its transition ended in failure. (2) The record schema stays
`schemaVersion: 1` on the pre-release ground BEH-BR-195 (Settled 3 and 4)
gives; after a release, the new value would need a new `schemaVersion`.

## BEH-BR-351: Handoff and the rest of the lifecycle

> **Invariant:** [INV-BR-045](../invariants.md#inv-br-045-handed-off-state-is-never-observable-and-its-loss-is-recorded), [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin)
> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-038](../decisions/038-cross-plugin-stop-ordering.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement), [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035)

```
REQUIREMENT: The handoff MUST be abandoned, with tag `HandoffAbandoned`,
             when the held value can no longer reach an import into a build
             that will be published: the new build fails or times out; the
             new definition's requirements are missing, so the plugin
             enters `waiting`; the plugin is removed, disabled or replaced
             again before the new activation is published; or shutdown
             begins.
```

```
REQUIREMENT: A `restart` or `reconfigure` that supersedes the new build
             (08 — Operation Legality, BEH-BR-071, row `starting`) MUST NOT
             abandon the handoff: the superseded build MUST be discarded
             without the value (BEH-BR-349), the value MUST stay held, and
             the next build of the registration MUST receive it under
             BEH-BR-349. The handoff keeps its one record, written for the
             build that imports or loses it, with the `causationId` of the
             call that attempted it (BEH-BR-350). The superseding call
             attempts no handoff of its own: the plugin was not `active`
             when it began (BEH-BR-346, BEH-BR-353).
```

```
REQUIREMENT: A `replace` whose new definition is lazy, so that the plugin
             lands in `dormant` (27 — Manifest and Lazy Activation,
             BEH-BR-244), MUST NOT attempt a handoff: the old definition's
             `export` MUST NOT run and no `handoff` record MUST be written.
             A dormant plugin has run none of its code, so nothing could
             import the state, and holding it until a trigger would give it
             an unbounded lifetime.
```

```
REQUIREMENT: A cascade that ends a parked `replace`'s intent before the
             export (08 — Operation Legality, BEH-BR-080) MUST cause no
             export and no handoff record.
```

```
REQUIREMENT: `TestHost` MUST let a test fail, delay or hang `export`,
             `upgrade` and `import` of a named plugin through its fault
             entry points (21 — Testing Host, BEH-BR-180).
```

A held value waits for exactly one thing — the next successful build of the
new definition that will be published — and is dropped, with a record, by
anything that means no such build will come. A `restart` or `reconfigure`
of the plugin while it is `starting` is not such a thing: it discards the
build in flight and builds the same registration again, and the value goes
to that build (CCR-BR-033; revision 0.4 listed neither, leaving a superseded
build free to consume the value). Holding it until the plugin's requirements
return would make the state outlive the replacement by an unbounded time,
and a later start from it would not be the start the replace caused.

**Settled here.** (1) A replace into `dormant` is decided at validation —
the new definition is known to be lazy before the stop begins — so it is
treated as "no handoff declared" rather than as a loss. (2) `waiting` abandons the handoff. A new definition whose
requirements are missing has no activation to import into, and keeping the
value until some provider arrives would turn handoff into a hidden store
with no bound on its lifetime (NFR-BR-007).

## BEH-BR-352: What handoff is not

> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-027](../decisions/027-core-exclusions.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035)

```
REQUIREMENT: Core documentation MUST state that handoff is not rollback
             (a failed new build leaves the new definition `failed`,
             BEH-BR-053), not persistence (state does not survive a process
             restart), not a transaction over external effects, and not a
             way to run two versions at once.
```

```
REQUIREMENT: Core MUST NOT keep the old definition, or its exported state,
             to restore after a failed replace — except that an atomic
             `reconcile` keeps the previous definition object, never its
             exported state, until the call ends, to issue its undo
             (32 — Generic Gate and Plan, BEH-BR-323).
```

Handoff narrows the cost of an upgrade; it does not change what an upgrade
is. The replaced plugin is still stopped before the new one starts, the
dependents still restart, and a failed upgrade is still a visible failure
that an operator answers with `replace(previous)` — which starts the
previous version cold, because nothing was kept for it.

## BEH-BR-353: Handoff on restart and on a restarting reconfigure, when the definition asks for it

> **Invariant:** [INV-BR-045](../invariants.md#inv-br-045-handed-off-state-is-never-observable-and-its-loss-is-recorded), [INV-BR-014](../invariants.md#inv-br-014-every-activation-gets-a-fresh-scope-and-memo-map)
> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement), [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)
> **Risk:** [RSK-BR-035](../gxp/03-risk-assessment.md#rsk-br-035)

```ts
// illustrative — not type-checked
interface HandoffCallOptions { readonly cold?: boolean }        // default false: hand off when admitted
// restart(ref, options?: RemoveOptions & HandoffCallOptions)            (07, BEH-BR-058)
// PluginHandle.restart(options?: RemoveOptions & HandoffCallOptions)   (07, BEH-BR-059)
// every signature: 02 — Host Construction, BEH-BR-013
// reconfigure(ref, config?, options?: OperationOptions & HandoffCallOptions)   (11, BEH-BR-101)

const sessions = Plugin.define({
  id: "pos/sessions",
  provides: [Sessions],
  build: SessionsLive,
  config: SessionsConfig,
  handoff: { version: "1", schema: SessionTable, export: exportTable, import: importTable,
             alsoOn: ["restart", "reconfigure"] }
})
```

```
REQUIREMENT: A handoff MUST also be attempted for a `restart` of a plugin
             that is `active` when its stop begins (07 — Replacement and
             Reactivation, BEH-BR-058), and for a `reconfigure` that
             restarts a plugin that is `active` when its stop begins (a
             change to a non-volatile field, 11 — Configuration, BEH-BR-101,
             BEH-BR-102), when the definition's `handoff.alsoOn` lists that
             operation and the call does not pass `cold: true`. Both calls
             issued by `reconcile` — an entry action or an undo action —
             MUST follow the same rule.
```

```
REQUIREMENT: In such a handoff the old and new definitions MUST be the same
             definition: the format versions are equal, `upgrade` MUST NOT
             run, and the export, hold, decode, import, failure and record
             rules of BEH-BR-347–351 MUST apply unchanged. For a
             `reconfigure`, `import` MUST run in the activation built with
             the new configuration; whether the state suits it is the
             plugin's `import` to decide.
```

```
REQUIREMENT: A `reconfigure` confined to volatile fields (BEH-BR-102) MUST
             NOT attempt a handoff and MUST write no `handoff` record: the
             activation does not stop, so its state stays where it is.
```

```
REQUIREMENT: A `restart` or `reconfigure` with `cold: true`, or of a
             definition whose `alsoOn` does not list the operation, MUST NOT
             run `export` and MUST write no `handoff` record. A `restart` of
             a plugin in any state other than `active` — `starting`,
             `waiting`, `failed` — MUST NOT attempt a handoff. Dependents
             stopped and started again by the restart MUST NOT hand off
             (BEH-BR-346).
```

```
REQUIREMENT: `cold` MUST NOT change any other behaviour of `restart` or
             `reconfigure`, MUST NOT appear in a gate request or an audit
             record, and MUST be accepted, and ignored, on a definition
             without `handoff`.
```

The case for this is the one the review of gap G44 described: a plugin
reconfigured with a new upstream address, or restarted by an operator to
pick up a rotated certificate, loses its open sessions although nothing
about its code or its state format changed. The same machinery that carries
state across a `replace` carries it across these stops, with the same bound,
the same record and the same cold start when it fails.

**Settled here.** (1) Opt-in per definition, and per call through `cold`.
`restart` is also the way to *clear* state — a development adapter restarts
a plugin because its external world changed (BEH-BR-058) — so handing off by
default would turn a reset into a no-op. (2) A volatile-only `reconfigure`
needs no handoff: its activation keeps running and its state with it. (3) The
handoff stays in memory and in one process; it is not persistence, and a
crash still loses the state (BEH-BR-352). This closes gap G44.

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-087 | A replace of an active plugin with handoff on both sides — or a `restart` or restarting `reconfigure` under `alsoOn` — exports after the drain and before scope close, as the stop's final step, under the old activation's principal; upgrades through `accepts`/`upgrade` and imports before publication under the new activation's principal, each step with `Actor.unattributed` and an empty annotation bag whatever the caller carries; and writes one `handoff` record before `system-start`; no other operation or state hands off; a lazy registration hands off only from its loaded definition, and a loaded definition with an invalid `handoff` fails phase "load"; keys are never provided twice; the held value appears in no record, event, log, snapshot or error | BEH-BR-345, BEH-BR-346, BEH-BR-347, BEH-BR-348, BEH-BR-349 |
| REQ-BR-088 | Export failure, unaccepted version, upgrade or decode failure each give a cold start with the matching loss record and event; import failure fails the activation with no retry; new-build failure, `waiting`, removal and shutdown abandon the handoff with a record; a `restart` or `reconfigure` that supersedes the new build discards it without importing and the next build imports the value, with one record caused by the original call; an operator call arriving during the import waits and is decided against the published or failed plugin; a cascade-ended parked replace, and a replace into `dormant`, export nothing and write no record | BEH-BR-347, BEH-BR-349, BEH-BR-350, BEH-BR-351, BEH-BR-352 |
| REQ-BR-103 | With `alsoOn`, an active plugin's `restart` and restarting `reconfigure` export after the drain and import into the new activation (built with the new configuration) with one `handoff` record caused by that call; `cold: true`, an unlisted operation, a non-active plugin, its dependents and a volatile-only `reconfigure` hand nothing off and write no record; loss paths as for replace | BEH-BR-346, BEH-BR-350, BEH-BR-353 |

---

_Previous: [33 — Realm Families](./33-realm-families.md)_ · _Next: [Invariants](../invariants.md)_
