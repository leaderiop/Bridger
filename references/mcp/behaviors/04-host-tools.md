# 04 — Host Tools

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-MC-BEH-04                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-08): `reconcile-plan` no longer declared `readOnly`: it writes a plan into the `PlanStore` and may evict others (round-2 agent review A-18) (CCR-MC-003)<br>0.4 (2026-11-08): Reads and plans declared `readOnly`; host calls carry the dispatch's correlation through core `CurrentCorrelation`; `reconcile-plan` takes `atomic`, `reconcile-apply` reports `ApplyRolledBack` and `PartialApply`, undo requests, core's order and refused digests; call-log wording (CCR-MC-003, round 2: recheck item 9; core round 2 alignment)<br>0.3 (2026-11-08): `PlanStore` and `PlanUnknown`; `UnknownPlugin`; inspect without id; served host calls; error classes declared (CCR-MC-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-MC-001)<br>0.1 (2026-11-08): Initial draft (CCR-MC-001)                 |

---

An agent that can see the host — which plugins run, why one is waiting — can
explain a system to its operator. An agent that can propose a plugin set and
show the difference can help change it. An agent that can apply that change
by itself is a self-modifying system, and is safe only if every change still
passes the host's attribution, gate and audit. This file serves the host as
four commands: three that read or plan, and one, separate and regulated,
that applies ([ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md)).
This file owns BEH-MC-025–032 and uses 025–030; 031–032 are reserved.

Planned source: `packages/mcp/src/HostTools.ts` *(Planned)*. Although the
commands are served over MCP by default, they are ordinary commands of the
catalog and reach any dispatcher, including `@bridger/agent`'s `ToolRunner`.

## BEH-MC-025: Host tools are commands contributed by one plugin

> **See:** [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md), [ADR-MC-001](../decisions/001-server-projects-a-toolset.md)
> **Core seam:** [19 — Contribution registry](../../core/behaviors/19-contribution-registry.md), [28 — Plugin principal and mandatory policy](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md)

```ts
// illustrative — not type-checked
HostTools.plugin(options?: {
  readonly id?: string          // default "bridger-host-tools"
  readonly apply?: boolean      // default false: reconcile-apply is not contributed at all
  readonly maxPlans?: number    // PlanStore bound, default 64 (BEH-MC-028)
  readonly planTtl?: Duration.Input   // default 24 hours, measured with Clock (BEH-MC-028)
}): Plugin<[Bridger.Host, CommandCatalog, DefinitionResolver], [], never>
```

| Command id | `regulated` | Tags | Effect on the host |
| ---------- | ----------- | ---- | ------------------ |
| `bridger.host.snapshot` | false | `bridger-host`, `read` | none (`readOnly: true`) |
| `bridger.host.inspect` | false | `bridger-host`, `read` | none (`readOnly: true`) |
| `bridger.host.reconcile-plan` | false | `bridger-host`, `plan` | none on the host; stores a plan in the plugin's `PlanStore` (BEH-MC-028), so not `readOnly` |
| `bridger.host.reconcile-apply` | **true** | `bridger-host`, `host-mutation` | host lifecycle operations, each gated and audited by core |

```
REQUIREMENT: `HostTools.plugin` MUST contribute exactly the commands in the
             table, through `Command.contribute`, in its activation scope.
             `bridger.host.reconcile-apply` MUST be contributed only when
             `apply: true`, and MUST always be `regulated: true`; no option
             MAY lower it.
```

```
REQUIREMENT: The host tools' handlers run as served calls (command
             BEH-CM-003, core `CallerContext.serve`, BEH-BR-292), and MUST
             call the `Host` they require from that fiber, passing the
             input's `reason` in `options.context` and leaving
             `correlationId` unset, so that core takes the dispatch's
             correlation from the fiber's `CurrentCorrelation` (core
             BEH-BR-187). The host then attributes each lifecycle call
             to the dispatching actor (the MCP session's or the agent's),
             with the dispatch's annotations, and records the host-tools
             plugin as `onBehalfOf` (the fiber's plugin principal, core
             BEH-BR-258, BEH-BR-259) — never to `Actor.system`, and never
             with the host-tools plugin as the actor.
```

**Settled here.** Apply is absent unless asked for at installation: a
deployment that never wants self-modification does not have the command in
its catalog at all, so no selector mistake can list it.

**Open.** Whether `bridger.host.events` (a bounded tail of `Host.events`)
should be added; the diagnostic feed is lossy by design (core BEH-BR-113) and
would need its own wording.

## BEH-MC-026: snapshot returns the host snapshot, which carries no configuration values

> **Invariant:** [INV-MC-004](../invariants.md#inv-mc-004-host-tools-never-return-configuration-values)
> **See:** [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md), [ADR-BR-007](../../core/decisions/007-observation-primitives.md)
> **Core seam:** [04 — States and snapshots](../../core/behaviors/04-states-and-snapshots.md)
> **Risk:** [RSK-BR-008](../../core/gxp/03-risk-assessment.md#rsk-br-008)

```
REQUIREMENT: `bridger.host.snapshot` MUST take an empty input and return the
             encoding of `Host.snapshot()` (core BEH-BR-028) under a schema
             published with the command, restricted to the realms the
             application's `HostToolsScope` option allows (default: all).
```

```
REQUIREMENT: The output MUST NOT contain a configuration value, a cause, a
             service or a definition object. Failures are given as their
             `_tag` and the message core already exposes in snapshots.
```

**Settled here.** The snapshot is passed through, not re-derived — a
`disabled` plugin's `reason` (for example "refused-digest", core BEH-BR-027)
included — so it can never say more than the core snapshot does
([INV-BR-013](../../core/invariants.md#inv-br-013-configuration-values-are-never-observable)).

**Open.** Realm filtering is a convenience, not access control (a realm is not
a security boundary, core BEH-BR-150); whether to keep it is open.

## BEH-MC-027: inspect returns names and counts only

> **Invariant:** [INV-MC-004](../invariants.md#inv-mc-004-host-tools-never-return-configuration-values)
> **See:** [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md)
> **Core seam:** [13 — Observability and diagnostics](../../core/behaviors/13-observability-and-diagnostics.md)

```
REQUIREMENT: `bridger.host.inspect` MUST take `{ id?: string, realm?: string }`
             and return the encoding of `Host.inspect(ref)` (core BEH-BR-118:
             names and counts only) for that plugin. When `id` is absent it
             MUST read one `Host.snapshot()`, and return `{ revision, plugins }`
             where `revision` is that snapshot's revision and `plugins` is
             `Host.inspect` of each plugin the snapshot lists (restricted to
             `realm` when given), ordered by realm then id in code-unit
             order. Core has no all-plugins form of `inspect`; a plugin
             removed between the snapshot and its `inspect` MUST be left
             out, not reported as an error.
```

```
REQUIREMENT: An unknown plugin MUST be core's `UnknownPlugin` (core 02,
             13), declared in the command's `error` schema and returned as
             an `isError` result (BEH-MC-005), not a defect.
```

**Settled here.** `inspect` is the tool that answers "why is this plugin
waiting" — missing service ids, held leases, pending operations — which is
the question an operator most often asks an agent.

**Open.** None.

## BEH-MC-028: reconcile-plan returns a plan and changes nothing

> **See:** [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md), [ADR-BR-023](../../core/decisions/023-desired-state-reconcile.md)
> **Core seam:** [18 — Reconciliation and confluence](../../core/behaviors/18-reconciliation-and-confluence.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)

```ts
// illustrative — not type-checked
interface DesiredEntryRef {                  // wire form of a desired entry; no code, no values
  readonly id: string
  readonly realm?: string                    // default "default"
  readonly definition: { readonly name: string; readonly version: string }
  readonly configRef?: string                // resolved by the DefinitionResolver; never a value
  readonly disabled?: boolean
}
interface DefinitionResolverShape {
  readonly resolve: (ref: DesiredEntryRef) =>
    Effect.Effect<DesiredPlugin, DefinitionUnresolved>     // core 18, BEH-BR-153
}
class DefinitionResolver extends Context.Service<DefinitionResolver, DefinitionResolverShape>()(
  "@bridger/mcp/DefinitionResolver") {}
class DefinitionUnresolved extends Schema.TaggedError<DefinitionUnresolved>()("DefinitionUnresolved", {
  id: Schema.String,
  realm: Schema.String,
  reason: Schema.String                      // the resolver's reason, e.g. "unknown-name", "unknown-version"
}) {}

// held by the host-tools plugin, in its activation scope; never persisted
interface StoredPlan {
  readonly planId: string                    // from the host's IdGenerator; a key, not an encoding
  readonly input: ReconcileInput             // the refs as proposed
  readonly desired: readonly DesiredPlugin[] // as resolved at plan time
  readonly plan: ReconcilePlan               // core BEH-BR-318
  readonly proposedBy: Actor
  readonly createdAt: number                 // Clock, epoch ms
}
class PlanUnknown extends Schema.TaggedError<PlanUnknown>()("PlanUnknown", {
  planId: Schema.String,
  reason: Schema.Literals(["never-issued", "expired", "evicted", "plugin-restarted"])
}) {}

// input of reconcile-plan and reconcile-apply
interface ReconcileInput {
  readonly desired: readonly DesiredEntryRef[]
  readonly scope?: string                    // ownership scope, default "agent"
  readonly prune?: boolean                   // default false for host tools
  readonly atomic?: boolean                  // core ReconcileOptions.atomic (BEH-BR-322); default false, as core
}
```

```
REQUIREMENT: `bridger.host.reconcile-plan` MUST resolve every entry through
             `DefinitionResolver`, then call the read-only
             `host.plan(desired, { scope, prune, atomic })` (core BEH-BR-317;
             the plan's `atomic` and each entry's `undo`, BEH-BR-318), and
             return core's `ReconcilePlan` (BEH-BR-318): per entry, the
             action sequence core would run and the host revision the plan
             was computed at, plus the unresolved entries with their
             `DefinitionUnresolved` reason. It MUST NOT install, replace,
             remove, disable or reconfigure anything.
```

```
REQUIREMENT: The input MUST NOT accept a configuration value. A desired
             override is named by `configRef` and resolved by the
             application's resolver; the plan shows configuration paths
             only, as core's records do (BEH-BR-197).
```

```
REQUIREMENT: The result MUST carry a `planId` for use by reconcile-apply
             (BEH-MC-029). `planId` MUST be a key into the plugin's
             `PlanStore`, generated by the host's `IdGenerator`, never a
             self-contained encoding of the plan: the store holds the
             `StoredPlan` — the input, the resolved `desired` list with its
             definition digests, core's `ReconcilePlan` and its host
             revision, and the proposing actor.
```

```
REQUIREMENT: The `PlanStore` MUST live in the host-tools plugin's activation
             scope and MUST NOT be persisted: a stop, restart, replace or
             removal of the plugin MUST forget every plan. It MUST hold at
             most `maxPlans` plans, evicting the oldest first, and MUST
             forget a plan older than `planTtl` measured with `Clock`.
             Plans MUST NOT be listed through any command.
```

An MCP client cannot send a plugin definition: definitions are code. The
resolver turns names and versions into definitions the deployment already
trusts — a static table, or the manifest registry of
[`@bridger/loader`](../../loader/README.md). Sending configuration values
through a model would put secrets into prompts and transcripts.

**Settled here.** (1) Host tools default to `prune: false` and to the
ownership scope `"agent"`, so a plan proposed by an agent can never remove
plugins it did not install, unless the input says so and the gate accepts it
([BEH-BR-155](../../core/behaviors/18-reconciliation-and-confluence.md)).
(2) A plan is not gated by the `OperationGate`: it is not a mutation. It is
still a command and passes the command gate.

**Open.** None on the plan's shape: it is core's `ReconcilePlan`
([BEH-BR-318](../../core/behaviors/32-generic-gate-and-plan.md)), passed through
without configuration values.

## BEH-MC-029: reconcile-apply applies a plan only through both gates

> **See:** [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Core seam:** [25 — Operation gate](../../core/behaviors/25-operation-gate.md), [32 — Generic gate and plan](../../core/behaviors/32-generic-gate-and-plan.md)
> **Risk:** [RSK-BR-014](../../core/gxp/03-risk-assessment.md#rsk-br-014), [RSK-BR-004](../../core/gxp/03-risk-assessment.md#rsk-br-004)

```
REQUIREMENT: `bridger.host.reconcile-apply` MUST take `{ planId, reason }`
             and MUST pass, in this order: (1) the command gate and taint
             floor, as every dispatch (command companion, 02 — Dispatch),
             where a deferral becomes a draft whose approval re-dispatches
             it; (2) a lookup of `planId` in the `PlanStore`, failing with
             the declared handler error `PlanUnknown { planId, reason }`
             when the plan was never issued by this activation, has
             expired, was evicted, or was forgotten by a restart; (3) a
             check that re-resolving the stored refs gives definitions with
             the digests the stored `desired` list bound, failing with
             core's `PlanStale` (one mismatch per changed entry) otherwise;
             (4) core
             `reconcile(desired, { scope, prune, atomic, expect: plan })`
             (BEH-BR-319, BEH-BR-322), which itself fails with `PlanStale`
             when the host no longer matches the plan, and otherwise
             consults the `OperationGate` once per entry action — and, for
             an atomic apply that rolls back, once per undo request
             (`OperationRequest.undo`, matched by the gate against the
             plan's `PlannedEntry.undo`, BEH-BR-325) — and audits each
             (core BEH-BR-158). Entries run in core's order (removals
             dependents first, other changes providers first,
             BEH-BR-156), not in input order.
```

```
REQUIREMENT: The command MUST NOT bypass, cache or pre-approve the
             `OperationGate` because the command gate allowed it; the two
             decisions are independent and both are required.
```

```
REQUIREMENT: The result MUST be `{ report, proposedBy }`: the core
             `ReconcileReport`, including its per-entry `rejected` outcomes
             (an operator call refused by core's `RefusalList` appears as
             `OperationRejected` with reason "refused-digest: …",
             BEH-BR-267), encoded without configuration values, and the
             stored plan's proposing actor. Core's `ApplyRolledBack` and
             `PartialApply` (BEH-BR-324) MUST be declared in the command's
             `error` schema and returned as `isError` results with their
             `failed`, `undone` and `notUndone` lists; a `PartialApply`
             MUST NOT be described as rolled back.
```

```
REQUIREMENT: `reason` MUST be required and passed as the `OperationContext`
             reason, so that `requireReason` of core BEH-BR-189 can be met.
```

A stale plan is refused, not re-planned, at this layer: an approval was
given for the difference that was shown; re-planning silently would apply a
difference nobody saw. The drafts of [core file 32](../../core/behaviors/32-generic-gate-and-plan.md) carry expected versions for
the same reason.

**Settled here.** Two gates, not one. The command gate decides "may this
principal run self-modification at all"; the `OperationGate` decides each
lifecycle change as it does for an operator. A deployment that wires only one
gets only that one's protection, visibly.

**Settled here (plans).** (1) A plan is not bound to its proposing actor:
whether another actor may apply it is a rule, and rules are the command
gate's. The gate request carries the `planId`, and the result of
`reconcile-apply` reports `proposedBy`, so a gate or a reviewer can compare
them. (2) A deferred apply re-dispatched after the plan's `planTtl`, or after
the plugin restarted, fails with `PlanUnknown`; the caller plans again and
the new plan passes the gates again. (3) A `planId` is a key: guessing one
gains nothing that the gates do not still decide.

**Open.** Whether `PlanStale` should carry the new plan for convenience. Not
in this draft: the caller asks for a new plan, which passes the command gate
again.

## BEH-MC-030: Host tools write nothing core does not already write

> **See:** [ADR-MC-003](../decisions/003-host-self-service-is-plan-first.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Core seam:** [23 — Audit sink and record](../../core/behaviors/23-audit-sink-and-record.md), [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md)

```
REQUIREMENT: The host tools MUST NOT write `AuditSink` records themselves.
             The lifecycle records of reconcile-apply are core's; a
             refused dispatch of a host tool is offered to the `CallLog`
             port like any command's (command BEH-CM-015), and the host
             calls a handler makes carry the dispatch's correlation.
```

```
REQUIREMENT: The host tools MUST NOT be described as an approval mechanism.
             Approval belongs to the gates the application wires.
```

**Settled here.** Reads and plans leave no audit record: they change no
GMP-relevant state, and the call log is the place for access records.
`reconcile-plan` is still not declared `readOnly` (command BEH-CM-006 means
"the handler changes no state"): it writes a plan and can evict another
actor's plan, so it gets no `readOnlyHint`, is not projected as a resource,
and from a tainted session it is deferred or refused by the command
catalog's taint floor unless approved (command BEH-CM-016).

**Open.** None.

---

_Previous: [03 — Client import](./03-client-import.md)_ · _Next: [05 — Required acceptance checks](./05-required-acceptance-checks.md)_
