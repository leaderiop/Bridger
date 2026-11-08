# 34 — State Handoff

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-BEH-34                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): handoff loss tags declared record-only (ADR-BR-008) (CCR-BR-022)<br>0.1 (2026-11-08): Initial draft (CCR-BR-019) |

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
ADR-BR-004). This file owns BEH-BR-345–360 and uses BEH-BR-345–352;
numbers 353–360 of the block are reserved.

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
}
class HandoffError extends Schema.TaggedError<HandoffError>()("HandoffError", { message: Schema.String }) {}

const counter = Plugin.make({
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
             without it MUST behave exactly as files 01–25 specify, and
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
             MUST contain `version`, and the schema's encoded side MUST be
             plain data. A definition that breaks these MUST fail the
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

## BEH-BR-346: Handoff applies only to replace of an active plugin

> **See:** [ADR-BR-049](../decisions/049-state-handoff-on-replace.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md)
> **Satisfies:** [URS-BR-040](../urs.md#urs-br-040-keep-a-plugins-state-across-a-replacement), [URS-BR-002](../urs.md#urs-br-002-remove-or-replace-a-plugin-safely-while-it-is-in-use)

```
REQUIREMENT: A handoff MUST be attempted only for a `replace` (including a
             `reconcile` entry action `replace`) of a plugin that is
             `active` when its stop begins and whose old and new definitions
             both declare `handoff`.
```

```
REQUIREMENT: No other stop — `remove`, `restart`, `disable`, `reconfigure`,
             a runtime failure, dependency loss, shutdown — and no
             `replace` of a plugin in any other state MUST export, hold or
             import state.
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
`restart` runs the same definition; a plugin that wants its state across a
restart is asking for persistence, which is its own store's job.

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
REQUIREMENT: In the stop of a `replace` that attempts a handoff, the host
             MUST run the old definition's `export` after the dependents
             have stopped and the old activation's leases have drained (or
             been revoked under `force`), and before its scope begins to
             close, in the same transition step as the swap.
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
             the stop — scope close, swap and new build — as if no handoff
             had been declared, and MUST record the loss (BEH-BR-350). An
             export failure MUST NOT fail the `replace`, the stop or the old
             activation.
```

```
REQUIREMENT: `export` MUST run with `@bridger/core/CurrentActor` set to
             `Actor.unattributed` and the plugin's ID in
             `@bridger/core/HeldPlugins`, as a finalizer does (BEH-BR-187,
             BEH-BR-088).
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
plugin's `import` decides whether that is usable.

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
REQUIREMENT: When the new build succeeds and a held value exists, the host
             MUST, before publishing the new activation (BEH-BR-037):
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
REQUIREMENT: `import` MUST run with `@bridger/core/CurrentActor` set to
             `Actor.unattributed` and the plugin's ID in
             `@bridger/core/HeldPlugins`, as the build does.
```

Decoding failure leads to a cold start because nothing has been applied yet:
the new activation is whole, it only lacks the old state. Import failure is
different: `import` may have written part of the state into the new
services, and an activation in that condition is not the one anyone
approved. Failing it is the conservative reading, and
[ADR-BR-005](../decisions/005-failure-is-sticky.md) then applies: an
operator's `retry` starts it again — cold, because the held value is gone.

**Settled here.** Unknown fields are ignored when decoding, so that a newer
old version exporting an extra field does not force a cold start on a
version that does not need it; this is the add-only evolution rule of
[26 — Versioned Contracts](./26-versioned-contracts.md) applied to state.

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
             `causationId` naming the `replace`'s `requested` record
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
             when the held value cannot reach an import: the new build
             fails or times out; the new definition's requirements are
             missing, so the plugin enters `waiting`; the plugin is
             removed, disabled, replaced again or stopped before the new
             activation is published; or shutdown begins.
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
new definition — and is dropped, with a record, by anything that means that
build will not be published. Holding it until the plugin's requirements
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
             to restore after a failed replace.
```

Handoff narrows the cost of an upgrade; it does not change what an upgrade
is. The replaced plugin is still stopped before the new one starts, the
dependents still restart, and a failed upgrade is still a visible failure
that an operator answers with `replace(previous)` — which starts the
previous version cold, because nothing was kept for it.

---

## Acceptance checks

These checks extend BEH-BR-184 (21 — Testing Host); their scenarios are
allocated in [traceability.md](../traceability.md) §5. Each will be a tagged
scenario once code exists; none has run.

| Scenario | Check | Behaviours |
| --- | --- | --- |
| REQ-BR-087 | A replace of an active plugin with handoff on both sides exports after the drain and before scope close, upgrades through `accepts`/`upgrade`, imports before publication, and writes one `handoff` record before `system-start`; no other operation or state hands off; keys are never provided twice; the held value appears in no record, event, log, snapshot or error | BEH-BR-345, BEH-BR-346, BEH-BR-347, BEH-BR-348, BEH-BR-349 |
| REQ-BR-088 | Export failure, unaccepted version, upgrade or decode failure each give a cold start with the matching loss record and event; import failure fails the activation with no retry; new-build failure, `waiting`, removal and shutdown abandon the handoff with a record; a cascade-ended parked replace, and a replace into `dormant`, export nothing and write no record | BEH-BR-347, BEH-BR-349, BEH-BR-350, BEH-BR-351, BEH-BR-352 |

---

_Previous: [33 — Realm Families](./33-realm-families.md)_ · _Next: [Invariants](../invariants.md)_
