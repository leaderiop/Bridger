# ADR-BR-013: The state by operation table is total

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-013                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-02): Consistency fixes from independent review (CCR-BR-002)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

SPEC.md specifies operation outcomes in two places that do not cover the whole space: the state-and-lifecycle rules, and the race table in "Operation semantics and races", which is keyed by the *activity in progress* rather than by state. Many pairs are left unstated (`restart` on `starting`, `reconfigure` on `waiting`, `enable` on `active`, any operation on a plugin whose cleanup failed except `retry`, `replace` and `remove`), and one stated rule cannot be carried out: "`remove` retries the cleanup" of a `failed` plugin with phase `cleanup`. Once an Effect `Scope` has closed, its finalizers have run and cannot be run again; there is nothing to retry.

An unstated pair is a behaviour that each implementer, adapter and test author fills in differently. In a regulated setting it is also an outcome that cannot be predicted from the specification, so it cannot be reviewed or tested against it. Every pair needs one defined outcome ([INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)).

## Decision

The outcome of every (state, operation) pair for the eight plugin-addressed operations is fixed by Table 1, and the outcome of every pair while an operation is in flight by Table 2. The outcomes are decided at the steps of the order of a mutating call in [22 — Attributable operations](../behaviors/22-attributable-operations.md) (BEH-BR-188): `HostClosed` at step 1; `UnknownPlugin` and `DuplicatePlugin` at validation (step 4, repeated when the intent is recorded); every other outcome when the intent is recorded at step 7, after the attribution, latch, gate and `requested`-record steps have passed ([ADR-BR-012](../decisions/012-intent-and-linearization.md)). `PluginHandle.remove` and `PluginHandle.restart` behave exactly as `Host.remove` and `Host.restart`. `reconcile` acts through these operations, entry by entry; `defineRealm`, `shutdown` and `acknowledgeAuditDegraded` address no plugin and are outside the tables.

Legend: **✓** performs the operation; **no-op** succeeds with no transition; `Dup` = `DuplicatePlugin`; `Unk` = `UnknownPlugin`; `C(x)` = `Conflict { pending: x }`.

**Table 1 — state × operation**

| State | install | remove | replace | retry | reconfigure | restart | disable | enable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| unknown | registers | `Unk` | `Unk` | `Unk` | `Unk` | `Unk` | `Unk` | `Unk` |
| `waiting` | `Dup` | ✓ | ✓ | no-op | ✓ stores and checks; no build to restart | no-op | ✓ | no-op |
| `starting` | `Dup` | ✓ in-flight build settles, result discarded | ✓ supersedes the target | no-op | ✓ restarts after the build settles | ✓ in-flight build settles, result discarded, builds again | ✓ | no-op |
| `active` | `Dup` | ✓ | ✓ | no-op | ✓ | ✓ | ✓ | no-op |
| `stopping` | `Dup` | Table 2 | Table 2 | Table 2 | Table 2 | Table 2 | Table 2 | Table 2 |
| `failed` (build, activation, runtime) | `Dup` | ✓ | ✓ | ✓ | ✓ | ✓ same as retry | ✓ | no-op |
| `failed` (cleanup) | `Dup` | ✓ unregisters, records the leak as acknowledged | `C("cleanup-failure")` | `C("cleanup-failure")` | `C("cleanup-failure")` | `C("cleanup-failure")` | `C("cleanup-failure")` | `C("cleanup-failure")` |
| `disabled` | `Dup` | ✓ | ✓ stays disabled | `C("disabled")` | ✓ override stored for next `enable` | `C("disabled")` | no-op (joins) | ✓ re-checks the definition |
| host closing | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` | `HostClosed` |

Each operation that restarts a failed plugin (retry, restart, replace, reconfigure) lands in `starting` if its requirements are available and in `waiting` otherwise. While the host is closing, `shutdown` itself joins the shutdown in progress.

**Table 2 — operation in flight (`stopping`) × incoming operation**

| In flight | remove | replace | retry | reconfigure | restart | disable | enable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `remove` | joins | `C("remove")` | `C("remove")` | `C("remove")` | `C("remove")` | `C("remove")` | `C("remove")` |
| `replace` | remove wins; replace caller `Superseded` | later wins; earlier caller `Superseded` | `C("replace")` | `C("replace")` | `C("replace")` | `C("replace")` | `C("replace")` |
| `restart` | supersedes; earlier caller `Superseded` | supersedes; earlier caller `Superseded` | `C("restart")` | joins; its value becomes the override | joins | supersedes; earlier caller `Superseded` | `C("restart")` |
| `reconfigure` | supersedes; earlier caller `Superseded` | supersedes; earlier caller `Superseded` | `C("reconfigure")` | equal value: joins; different value: supersedes (earlier caller `Superseded`; the later value is the target) | joins | supersedes; earlier caller `Superseded` | `C("reconfigure")` |
| `disable` | remove wins; disable caller `Superseded` | `C("disable")` | `C("disable")` | `C("disable")` | `C("disable")` | joins | `C("disable")` |

Table 2 is the in-flight table of [08 — Operation legality](../behaviors/08-operation-legality.md) (BEH-BR-072), which is canonical; an incoming `install` of the known ID is `DuplicatePlugin` there as in Table 1. SPEC.md's race table left several of these pairs open; 08 settles every one of them, and the pairs it refuses are `Conflict { pending: <in-flight operation> }`: refusing is visible and safe, and the caller can repeat the call once the in-flight transition has landed, when Table 1 decides it. A plugin in `stopping` because of a *system* transition (dependency loss, runtime failure) has no operation in flight; an incoming operation is linearized behind that transition and decided by Table 1 against the state it lands in (settled in [08 — Operation legality](../behaviors/08-operation-legality.md)). `remove` wins over an in-flight `disable` for the same reason it wins over `replace`: removal is the operator's strongest intent, and making it wait on a disable it makes moot serves no one.

**Why each resolution**

- *unknown / known × install:* only `install` registers; a second install of a known ID is a duplicate identity ([ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md)).
- *retry on anything but `failed`:* nothing failed, so it is a no-op, except on `disabled` and while an operation is in flight, where the caller's premise is wrong or not yet decidable and the honest answer is `Conflict`.
- *restart on `waiting`:* there is no build to restart; the plugin starts by itself when its requirements arrive. On `starting`, restart means "build again from now", so the in-flight build settles and its result is discarded ([INV-BR-004](../invariants.md#inv-br-004-no-stale-build-is-published)).
- *reconfigure on `waiting` or `disabled`:* the value is checked and stored; it takes effect at the next activation, so it never needs a running build.
- *enable on anything but `disabled`:* the plugin is already enabled; no-op.
- *`failed` (cleanup):* the scope is closed and its finalizers cannot re-run, so SPEC.md's "`remove` retries the cleanup" is replaced: `remove` unregisters the plugin and records the leak as *acknowledged*, never as recovered. Every operation that would start a new activation beside a possibly leaked resource (a port, a lock, a registration) is withheld with `Conflict { pending: "cleanup-failure" }` until the application has dealt with the leak and removed the plugin.
- *`disabled`:* `retry` and `restart` presuppose a running or failed plugin; `replace` swaps the definition without enabling; `enable` re-checks for providers and cycles that appeared meanwhile.
- *A no-op success is still audited* (phase `completed`, `noop: true`): an operator's decision is a fact worth recording, and a missing record would be indistinguishable from a lost one.

## Alternatives considered

- **Leave unstated pairs to the implementation.** Rejected: untestable against the specification and unpredictable for operators.
- **Make every unstated pair an error.** Rejected: idempotent requests (`enable` on an enabled plugin, `retry` on a waiting one) would fail for no benefit to the caller.
- **Keep "`remove` retries the cleanup".** Rejected: Effect cannot re-run a closed scope's finalizers; the rule would claim a recovery that does not happen.
- **Queue incoming operations behind any in-flight operation instead of `Conflict`.** Rejected: a queued `retry` or `enable` would act on a state the caller never saw.

## Consequences

**Positive**:

- Every pair has one outcome that a test can assert and an operator can predict.
- A cleanup leak can never be reported as recovered.

**Negative**:

- Several idempotent no-ops and conservative conflicts may surprise callers used to stricter or looser frameworks.
- The conservative `Conflict` outcomes for an in-flight `disable` refuse calls that a looser framework would queue; the caller repeats them once the plugin is `disabled`.

**Trade-off accepted**: a large, explicit table that callers must learn, in exchange for no undefined behaviour and no claimed recovery that cannot happen.

## References

- Behaviours: [08 — Operation legality](../behaviors/08-operation-legality.md), [07 — Replacement and reactivation](../behaviors/07-replacement-and-reactivation.md), [06 — Removal](../behaviors/06-removal.md)
- Invariants: [INV-BR-004](../invariants.md#inv-br-004-no-stale-build-is-published), [INV-BR-007](../invariants.md#inv-br-007-failure-is-sticky), [INV-BR-009](../invariants.md#inv-br-009-at-most-one-transition-in-flight-per-plugin), [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome)
- Risks: [RSK-BR-009](../gxp/03-risk-assessment.md#rsk-br-009), [RSK-BR-019](../gxp/03-risk-assessment.md#rsk-br-019)
- Decisions: [ADR-BR-005](../decisions/005-failure-is-sticky.md), [ADR-BR-006](../decisions/006-one-instance-per-id-per-realm.md), [ADR-BR-012](../decisions/012-intent-and-linearization.md), [ADR-BR-030](../decisions/030-audit-sink-port.md)
- Source: `docs/SPEC.md` — "State and lifecycle", "Operation semantics and races", "Disable, enable and restart"
