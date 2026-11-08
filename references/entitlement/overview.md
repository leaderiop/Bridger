# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-EN-OVW                                               |
> | Revision       | 0.4                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview (companion)              |
> | Change History | 0.4 (2026-11-08): Round 2: recheck item 16; core alignment — mission item 5 (grant narrowing), API rows `Entitlement.capabilityPolicy`, `ReadOnly`, `Entitlement.contributionPolicy`, `Policies.first`, `Budget.contributionPolicy`, `Budget.usage`; core `policy` and `settle` replace `skip`; limits updated (CCR-EN-003)<br>0.3 (2026-11-08): Gate scope (`install`, optional `replace`); core seam specified (BEH-BR-089); core modes `unmetered`/`unknown`; API rows `EntitlementGate.piece`, `Entitlement.skipPolicy`, `Skip.first`, `Budget.skipPolicy`; worked example options corrected (CCR-EN-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-EN-001)<br>0.1 (2026-11-08): Initial draft (CCR-EN-001)                 |

---

## Mission

Plug-and-play systems sell, grant or ration what plugins may do: a paid
plugin whose subscription lapsed, a partner integration allowed a number of
calls per day, an agent task allowed a number of model tokens. Each
application tends to wire this into its plugins by hand, and each gets the
same things wrong: a lapse that stops a plugin in the middle of work, a
quota check that blocks a duty the system must always perform, a meter that
is charged twice when a call is retried.

`@bridger/entitlement` gives one shape to that wiring, without knowing what
is being sold:

1. An **`Entitlement` port** answers, for a subject (a plugin plus opaque
   labels), whether it is entitled `full`, in `grace`, `read-only` or `none`,
   and until when. The adapter behind it is the application's — signed
   tokens checked offline, a licence server, a configuration file.
2. An **entitlement gate** asks the port before a host operation would
   *grant* a plugin something — install, and replace when the application
   says so — and refuses when the plugin is not entitled. It never refuses
   taking something away, enabling it again or recovering it.
3. A **`Plugin.Runtime.entitled` stream** lets a running plugin see its own
   entitlement change and switch itself to read-only. A lapse never stops,
   fails or removes a plugin on its own.
4. **`Budget.reserve`** reserves an amount against a key of labels, commits
   what was actually used, and releases the rest when its scope closes.
5. **Grant narrowing** (`Entitlement.capabilityPolicy`) narrows a lapsed
   plugin's captured services to the members the application classed as
   read-only, through core's `CapabilityPolicy.changes`, without refusing a
   capture or changing plugin state; renewal restores them.

## Package boundary

`@bridger/entitlement` depends on `@bridger/core` and on `effect`.
`@bridger/core` never depends on it. It uses the core gate
([25](../core/behaviors/25-operation-gate.md)), the generic gate of
[32](../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313–321) and the hook
points of [31](../core/behaviors/31-hook-points.md) (BEH-BR-297–312), whose
`policy` and `settle` options carry its entitlement and budget policies, and
the capability grants of [29](../core/behaviors/29-capability-grants-and-call-log.md)
(BEH-BR-273–281) for grant narrowing. Its one core seam,
an optional `EntitlementView` port behind `Plugin.Runtime.entitled`, is
specified in core ([BEH-BR-089](../core/behaviors/10-runtime-failure-and-health.md#beh-br-089-pluginruntime-is-provided-to-every-build),
CCR-BR-020; see BEH-EN-013 and
[ADR-EN-002](./decisions/002-runtime-stream-and-gate-only.md)).

Labels are opaque. Bridger compares label values for equality and nothing
else; it never interprets "org", "plan" or "tier".

## Public API surface

All signatures are illustrative until code exists.

### Entitlement — [behaviour 01](./behaviors/01-entitlement-port.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Entitlement` | port | `check(subject)` and `watch(subject)`; the application's adapter |
| `EntitlementSubject` | type | `{ pluginId, realm?, labels }` — labels opaque |
| `EntitlementState` | type | `{ mode: "full" \| "grace" \| "read-only" \| "none", validUntil?, graceUntil?, reason?, asOf, stale? }`; core adds its own modes `"unmetered"` and `"unknown"` on `Plugin.Runtime.entitled` (BEH-BR-089), which the port never produces |
| `EntitlementUnavailable`, `NotEntitled` | errors | The port cannot answer; an operation needs more than the current mode |
| `EntitlementOptions` | type | `onUnavailable`, `staleAfter`, `essential` |

### Gate and runtime — [behaviour 02](./behaviors/02-gate-and-runtime.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `EntitlementGate.gate`, `EntitlementGate.piece` | functions | A `Gate<OperationRequest>` that refuses granting operations for unentitled plugins; `piece` gives the `Gate.all` entry with its timeout |
| `EntitlementGate.layer` | layer | Provides it as the host's `OperationGate` when it is the only gate |
| `EntitlementView.layer` | layer | Provides the core port behind `Plugin.Runtime.entitled` |
| `Entitlement.guard` | function | Fails an effect with `NotEntitled` unless the current mode allows it; skips essential operations |
| `Entitlement.contributionPolicy`, `Policies.first` | functions | A hook point's `policy` (and `settle`): a not-entitled contribution is skipped ("skipped-policy") or, under `onNotEntitled: "deny"`, denies a veto phase ("denied-policy"); bundles combined in order, a reserving bundle last |

### Budgets — [behaviour 03](./behaviors/03-budgets.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Budget` | service | `reserve`, `remaining`, `changes` |
| `BudgetKey` | type | `{ labels, unit }` — labels opaque |
| `Reservation` | type | `commit(actual)`, `release`; released on scope close if not committed |
| `BudgetExhausted` | error | `{ key, requested, remaining, resetsAt? }` |
| `BudgetLedger` | port | Optional shared or persisted ledger behind `Budget` |
| `Budget.contributionPolicy` | function | A hook point's `policy` and `settle`: reserves a per-call quota per contributor at admission, commits or releases it after the call |
| `Budget.usage`, `UsageExport` | function, type | Amounts and counts per limit and period, a process-local diagnostic report |

### Grant narrowing and usage — [behaviour 04](./behaviors/04-grant-narrowing-and-usage.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Entitlement.capabilityPolicy` | layer | Provides core's `CapabilityPolicy`: the application's `inner` policy narrowed by entitlement; emits `ResolveAgain` on a mode change |
| `ReadOnlyClassifier`, `ReadOnly.fromContracts`, `ReadOnly.fromServices`, `ReadOnly.combine` | type, functions | The application's classification of read-only members; no default |

## Worked example

```ts
// illustrative — not type-checked
const entitlement = Layer.succeed(Entitlement, {
  check: (s) => tokens.verify(s),           // application adapter: signed tokens checked offline
  watch: (s) => tokens.watch(s)
})

const HostLive = Bridger.layer({ /* ... */ }).pipe(
  Layer.provide(EntitlementGate.layer({ onReplace: "allow", gateTimeout: "5 seconds" })),   // the host's gateTimeout
  Layer.provide(EntitlementView.layer),
  Layer.provide(entitlement)   // with EntitlementOptions { onUnavailable, staleAfter, essential: ["duty:legal"] } (01, BEH-EN-005, BEH-EN-007)
)

// A plugin that switches itself to read-only:
const reports = Plugin.define({
  id: "reports",
  requires: [Ledger], provides: [Reports],
  build: Layer.effect(Reports, Effect.gen(function* () {
    const rt = yield* Plugin.Runtime
    const mode = yield* SubscriptionRef.make<EntitlementState["mode"]>("full")
    yield* rt.background("entitlement", Stream.runForEach(rt.entitled, (s) => SubscriptionRef.set(mode, s.mode)))
    return {
      read: (q) => query(q),                                     // always allowed
      export: (q) => Entitlement.guard(exportCsv(q), { requires: "full" })
    }
  }))
})

// A metered task:
Effect.scoped(Effect.gen(function* () {
  const r = yield* Budget.reserve({ labels: { org: "o-1", task: "t-9" }, unit: "tokens" }, 2000)
  const used = yield* callModel(prompt)
  yield* r.commit(used.tokens)                                   // the rest returns when the scope closes
}))
```

## What stays in core

The gate port, its fail-closed handling and its records (`rejected` on a
refusal); `reconcile`'s per-entry gating; `Plugin.Runtime` and its scope;
hook points, deadlines, breakers and the `policy` and `settle` options that
record "skipped-policy" and "denied-policy" ([core 31](../core/behaviors/31-hook-points.md), BEH-BR-297–312);
the `CapabilityPolicy` port, the narrowing layer per capture and the
re-resolution of live captures ([core 29](../core/behaviors/29-capability-grants-and-call-log.md), BEH-BR-273–281). Core learns only that an
optional port may supply an `entitled` stream.

## What stays in the application

What a subject is entitled to and how that is proven (tokens, keys, servers,
grace rules); which operations are essential and must never be refused;
what read-only means for each plugin and which members of each service are
read-only; prices, invoices and anything charged;
how budgets are sized and reset.

## Limits

- Read-only is a mode the plugin honours, not an isolation property:
  in-process plugin code can ignore it. Grant narrowing takes write members
  out of the services a lapsed plugin captured, but it is shallow and is not
  isolation either (BEH-EN-029). Code that must be stopped from
  writing belongs out of process ([references/remote/](../remote/README.md)).
- Entitlement answers are only as good as the adapter and its clock.
- `Budget` without a ledger counts per process; two hosts each with their own
  `Budget` can together spend twice the amount.
