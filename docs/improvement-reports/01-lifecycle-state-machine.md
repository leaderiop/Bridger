# Improvement report 01: Lifecycle and state machine

Scope: `references/core/behaviors/{03..10,12,13,18,34}`, `decisions/{004,005,010,038,049,051}`, `invariants.md` (INV-BR-003..011, 030), `prototypes/host-core/src/{host,legality,runtime}.ts`, `RESULTS.md`. Lens: Cordis (inertial fiber state machine, committed view, target by provider uid, dependents-drain-first unload, quiescence as a function of config).

## Executive summary

1. Bridger's lifecycle is already stricter than Cordis: a total 8x8 operation table, linearization per plugin, parked stops, cycle rejection at install, bounded drains, atomic reconcile with undo.
2. The biggest real defect is a spec/prototype divergence on stale builds. BEH-BR-039 says a stale build that failed after a provider loss is recorded `failed`; the prototype (`host.ts:1125`) silently discards it, and no test covers the case.
3. The confluence guarantee (BEH-BR-160) is weaker than Cordis' theorem. Failure, lazy wake, refusal and handoff are all carved out, and the property tests never inject failure.
4. There is no activation identity (Cordis' never-reused uid). Replacement identity is `(id, realm)` only. Snapshots, events and `providerIds` cannot distinguish "same activation" from "new activation of the same ID".
5. Operators have no scoped quiescence, no cancel for a parked stop, and no activation-level rollback for `replace`/atomic reconcile. Events cannot be correlated to snapshot revisions or to a cause.

## Where Bridger is already ahead of Cordis

- **Total legality.** BEH-BR-071/072 give every state x operation and in-flight x incoming pair a stated outcome (join, supersede, conflict). Cordis' inertia just chains "latest target wins" with no operator-visible outcome. The prototype tests 56 plus 28 cells live (`inflight.test.ts`).
- **Per-plugin linearization and intent that survives caller interruption** (BEH-BR-065..067, INV-BR-009/010). Cordis has no caller model.
- **Cycles are rejected at install** (INV-BR-002, BEH-BR-020). Cordis leaves them permanently inactive.
- **Hide-first, bounded drain, force with revocation** (BEH-BR-042/045/085/086). Cordis awaits dependents with no bound.
- **Stop-failure semantics.** `failed(cleanup)` is a stronger fact than a failed unload, and BEH-BR-047 refuses to claim a recovery Effect cannot perform.
- **Atomic bundle apply with attributed, gated undo** (ADR-BR-051, BEH-BR-322..326). Cordis has HMR cache rollback but no audited undo.
- **Confluence is a stated requirement with a randomized test** (BEH-BR-160; `confluence*.test.ts`, 40 to 100 seeded histories). The test found G25, so it already pays for itself.
- **Snapshot as a discriminated union with `next`, `reason`, `parked`** (BEH-BR-027). Cordis exposes only a status enum.

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
| --- | --- | --- | --- | --- |
| L1 | H | BEH-BR-039 (05:392-400); `host.ts:1125-1130`, `1548`; only test `lifecycle.test.ts:82` | Spec: stale build failed after provider loss is `failed`. Prototype discards every stale outcome. The case is untested, and the prototype passes its suite. | Decide the rule (R1 below), fix prototype, add test. |
| L2 | H | BEH-BR-160 (18:783-825); `confluence*.test.ts` (no failure injection) | Confluence carve-outs (failure, lazy, refusal, handoff) are broad and the property test never exercises them. "Failed" can depend on scheduling. | R2: make failure history explicit and test it. |
| L3 | M | `host.ts:262` (`epoch` internal); no `activationId` anywhere in `references/` (grep) | No activation identity. `providerIds` = `{id, realm}`; a replaced provider with the same ID is indistinguishable. Audit, events and snapshot cannot say which activation. | R3: monotonic `activation` ordinal. |
| L4 | M | BEH-BR-049 (07:87-98), ADR-BR-004, ADR-BR-051 "Scope of atomic" | `replace` and atomic apply roll back definitions, not activations. A new build that fails leaves the plugin `failed` and its dependents `waiting` with the old code gone. Cordis HMR rolls back on build failure. | R4: opt-in `verify: "activation"` / `onFailure: "rollback"`. |
| L5 | M | BEH-BR-045 (06:250-260), BEH-BR-074, BEH-BR-080 | A parked stop can only be driven forward (remove, replace, restart, disable). A provider hidden for a mistaken restart, with its scope still open, cannot be un-hidden. Dependents already torn down. | R5: `abort` of a parked stop (`stopping -> active`). |
| L6 | M | BEH-BR-040 (05:456-479); `awaitIdle` is host-wide; `PluginHandle.awaitActive` only | No scoped settle. `reconcile` returns before activations finish; callers must use host-wide idle, which a flapping unrelated plugin (background "restart" policy) can starve. | R6: `awaitSettled(refs \| scope)` returning per-plugin outcome. |
| L7 | M | BEH-BR-114 (13:82-110); `HostEventCommon` | `state-changed` has no `revision`, `causationId`, activation or trigger. Snapshot revisions and events cannot be joined; the cause lives only in the audit sink (which may be unwired, INV-BR-026). | R7: add fields to the common event. |
| L8 | M | BEH-BR-035 (05:177-221) vs BEH-BR-039 | Rationale contradiction: BEH-BR-035 rejects sticky failure because it "would make the settled state depend on scheduling" (BEH-BR-160), yet BEH-BR-039 adds sticky failure for a provider-loss stale build. | Part of R1. |
| L9 | L | `optional` unleased point-in-time read (BEH-BR-130, RESULTS P4) | TOCTOU: an optional service read can be used after its provider closes. Dependents-first does not cover it because there is no captured edge. | R8: document, or return a lease-wrapped accessor only. |
| L10 | L | BEH-BR-040: `buildTimeout` counted from slot acquisition; G21 (RESULTS P4) | A parent awaiting a child in its build with `concurrency` slots exhausted always times out. The spec only rules out the self-wait. | R9: static or runtime detection. |
| L11 | L | 8,322 lines in files 03-12/18/34; per-file Change History headers of 3-10 KB | Parked-stop, take-over, sub-scope close and unmount rules form a combinatorial sub-machine spread across BEH-BR-027/073/074/079/080/121/125. Hard to audit, high drift risk. | R10: one generated transition ledger. |

## Recommendations

### R1. Resolve the stale-build failure rule and make the prototype match (L1, L8)

**Rationale.** The spec (05:392-400) records a stale failed build as `failed` when the cause was provider loss, but discards it when the cause was an operator or shutdown. The prototype discards in both cases (`host.ts:1125`, the `discard=true; return` branch). The one existing test covers only the operator case. The rule also contradicts the logic of BEH-BR-035/G25: whether the plugin ends `failed` or `waiting` depends on whether the build's failure or the provider's stop was observed first, which is scheduling.

**Concrete spec change.** Pick one of two. The cleaner design, consistent with BEH-BR-160, is: a stale build's outcome is always discarded and the plugin goes `waiting`; if the failure was real, the next activation will reproduce it and fail visibly. Replace the third requirement in BEH-BR-039 with:

```
REQUIREMENT: A stale build's outcome, success or failure, MUST be discarded
             whatever changed the target. A failure so discarded MUST be
             recorded as a `build-finished` event with outcome "failure" and
             `stale: true`, and MUST NOT make the plugin `failed`.
```

Update the "Settled here" paragraph (RSK-BR-003 argument: a failing build re-running unattended). Mitigate that with a per-registration counter of consecutive discarded failures that surfaces `plugin-stalled`-style, rather than sticky state.

**Cost/risk.** Weakens "failure is sticky" for one path; hand-edits to BEH-BR-039, 06:BEH-BR-041/043 and 07:BEH-BR-053 cross-references. Risk is a repeated side-effecting build across dependency flaps, hence the counter.

**Verification.** New scenarios on `TestHost` with `Fault.buildFails` and a provider removed mid-build: assert both orders (failure first, stop first) settle to the same state. Add as a mutation check (revert to sticky; 1 test fails).

### R2. Make the quiescence theorem testable including failure (L2)

**Rationale.** Cordis' claim is clean: quiescent state is a function of final config. Bridger's BEH-BR-160 is a function of the installed set modulo failure, lazy class, refusal and handoff. That is honest, but the carve-out is untestable as written and the property tests only exercise success.

**Concrete spec change.** Add to BEH-BR-160 a second theorem and test obligation:

```
REQUIREMENT: For histories with injected build failures, the set of plugins
             in any state other than `failed`, once idle, MUST equal that of
             a history with no failures in which each failed plugin is
             `disabled`; the failed set MUST be a subset of the plugins whose
             build was begun and failed in that history.
```

Add the failing-set equality as the form of "may differ until retried".

**Cost/risk.** Test-only plus one requirement; needs `Fault` seeds in `confluence-p4/p5`.

**Verification.** Extend `confluence-p5.test.ts` with a random `buildFails` per plugin and the above oracle; keep mutation checks (G25 revert must still fail).

### R3. Introduce an activation ordinal (L3)

**Rationale.** Cordis keys targets by provider uid so a replaced provider is never confused with its predecessor. Bridger keys by `{id, realm}` (BEH-BR-027 `providerIds`) and keeps `epoch` as an internal prototype counter. A reader of the audit trail or snapshot cannot tell whether two `active` observations are the same activation, and no field proves "this dependent captured *that* generation of the provider".

**Concrete spec change.** In `PluginCommon` add `readonly activation: number` (host-scoped monotonic counter, never reused, incremented at each `starting` entry that will build; absent for `dormant`/`waiting`/`disabled`). Extend `providerIds` entries to `{ id, realm, activation }`. Add `activation` to `HostEventCommon` and to system/lifecycle audit records.

```
REQUIREMENT: A dependent's captured `providerIds[k].activation` MUST equal
             the provider's `activation` for every `active` or `starting`
             dependent at every revision (a stale pair is a defect).
```

**Cost/risk.** Snapshot schema change (pre-release, fine). One more field in INV-BR-013 checks. Equality of snapshots across confluence runs must exclude it (like revision).

**Verification.** Invariant check inside `confluence*.test.ts`: after every step assert the pair equality; plus a direct test that `replace` of a provider changes the dependents' captured activation only after they restart.

### R4. Opt-in activation-level rollback for `replace` and atomic reconcile (L4)

**Rationale.** ADR-BR-004 rejects keep-old-alive (two providers of a key) and ADR-BR-051 rejects "undo on activation failure" because the outcome would depend on build timing. Both are right as defaults, but Cordis' transactional reload shows the operator wants "replace, and if the new build fails, put the old one back". Today the operator must read the failure and issue `replace(previous)` by hand while dependents sit `waiting`.

**Concrete spec change.** `ReplaceOptions.onFailure?: "stay-failed" | { rollback: Plugin }` (default unchanged). Semantics: after the swap, the host waits for the new activation's first outcome as part of the operation (the call completes at `active` or at the rollback's `starting`); on `failed` it issues one `replace(previous)` as a system operation attributed to the call, recorded with `undoes`. Mirror for `reconcile` as `atomic: { settle: true }`, using the existing undo list and `PartialApply`.

**Cost/risk.** The call now waits for a build (BEH-BR-049 says it must not), so make it explicit and bounded by `buildTimeout`. A rollback build runs the previous definition's side effects again, so the doc must say rollback is not compensation (BEH-BR-048).

**Verification.** Scenarios: failing new build rolls back and dependents restart against the old one; failing rollback ends `failed` with both causes; a gate refusing the undo yields `PartialApply`.

### R5. A way to abort a parked stop (L5)

**Rationale.** BEH-BR-045 states the plugin "MUST NOT be republished" after `DrainTimeout`. That is safe but irreversible in practice: dependents were stopped, the provider is hidden, and the only exits are to stop it for good. A mistaken `restart` of a busy shared service becomes an outage.

**Concrete spec change.** Add operation `resume`/`abort` legal only on a parked stop whose scope has not begun to close: `stopping -> active` (the edge is safe because no finalizer has run). Provider republished in one revision; `waiting` dependents restart by the normal rule. Audit as an operator operation; the parked intent ends with `intent-ended`.

**Cost/risk.** New edge in BEH-BR-026 and row/column in the BEH-BR-071/072 tables (so 9x9). Must refuse if any part of the scope closed (exports for a handoff, BEH-BR-347, run after drain). Could be deferred to a later phase.

**Verification.** Extend `inflight.test.ts` live-cell grid and the confluence generator with `abort`.

### R6. Scoped settle (L6)

**Rationale.** `awaitIdle` is host-wide (BEH-BR-040) and excludes `waiting`/`failed`. After a `reconcile` an operator wants "these entries reached `active` or a stated terminal state". Under churn or a restart-policy loop, host-wide idle may never arrive, forcing polling of `changes`.

**Concrete spec change.**

```ts
awaitSettled(refs: readonly PluginRef[] | { scope: string }, opts?: { timeout?: Duration.Input }):
  Effect<readonly { ref: PluginRef; state: "active"|"waiting"|"failed"|"disabled"|"dormant"; activation?: number }[], SettleTimeout | HostClosed | WouldDeadlock>
```

A plugin is settled when it has no transition running or ready and no operation in flight, as BEH-BR-040 defines idleness per plugin. Reuse the same `WouldDeadlock` rule.

**Cost/risk.** Small; derived from the same predicate. Needs the per-plugin predicate exposed, which is already internal.

**Verification.** Test: with an unrelated plugin in a restart loop, `awaitSettled` on a reconciled scope returns while `awaitIdle` times out.

### R7. Correlate events with revisions and causes (L7)

**Rationale.** Cordis emits `internal/status` per fiber. Bridger's `state-changed` (13:82) carries `from`, `to`, `reason`, but no `revision`, no trigger (operator call, cascade root, background failure, provider return), and events are lossy by design. Without a revision, a consumer cannot know which snapshot an event belongs to. With no sink wired, the cause is lost entirely (INV-BR-026).

**Concrete spec change.** Add to `HostEventCommon`: `revision: number` (the snapshot revision the event is part of), `causeSeq?: number` (the `seq` of the event that triggered it, e.g. the provider's `state-changed`), `activation?: number` (R3). `state-changed` additionally carries `trigger: "operator" | "system" | "provider-return" | "dependency-loss" | "runtime-failure" | "shutdown"`.

**Cost/risk.** Event schema growth; no behaviour change. Keep INV-BR-013 (no values).

**Verification.** Property test: events folded by `revision` reproduce the snapshot stream's `state` transitions; every `causeSeq` points to an earlier `seq`.

### R8. Close the optional-read hazard (L9)

**Rationale.** BEH-BR-130 gives an unleased point-in-time read; the removal path cannot protect a use that happens after the read. Cordis has the analogous INACTIVE_ACCESS.

**Concrete spec change.** Constrain the docs and types: `optional` returns the service only inside `useOptional`'s lease; deprecate or mark the bare read as "existence check only" in BEH-BR-130 and in the INV-BR-006 *Implication*.

**Cost/risk.** Breaking for callers of the bare read (prototype only). **Verification.** Type-level test that the bare read yields `Option<void>`-like witness, or a documented-unsafe label verified by a docs check.

### R9. Detect the build-slot self-deadlock statically (L10)

**Rationale.** G21: a parent that `awaitActive`s a child in its build holds a slot the child needs, and with `concurrency` N such parents it always times out at `buildTimeout`.

**Concrete spec change.** Either exclude a build's await-for-child time from slot occupancy (release the slot while awaiting a child, re-acquire after), or fail fast with `WouldDeadlock`-style `SlotStarvation` when `awaitActive` is called from a build and the child cannot get a slot. Add the rule to BEH-BR-124 and BEH-BR-034.

**Cost/risk.** Slot accounting changes the FIFO rule. **Verification.** `concurrency: 1` parent-with-child scenario.

### R10. A generated transition ledger (L11)

**Rationale.** The legal edges are spread over BEH-BR-026 (mermaid), 071, 072, 073, 074, 079, 080 and the child rules. Every audit round (7 to 9) edited the same cells. A single machine-readable table (state, trigger, reason, next, record kind, event) would let `legality.ts`, the snapshot union, the audit schema and the docs be generated and diffed, as Cordis does with its event catalogue check.

**Concrete spec change.** Add `references/core/transitions.yaml` as the source of truth for BEH-BR-026/071/072 and the `StopReason`/`next` pairs; add a doc check that the mermaid diagram and tables match it.

**Cost/risk.** Tooling work, no semantic change. **Verification.** CI check; prototype `legality.ts` generated from it and the 56 + 28 cell tests still pass.

## Not checked / uncertainties

- I read behaviours 04-08 and 13/18 and ADR-004/010/051 in full; files 09 (leases), 10, 12 (shutdown), 34 (handoff) and 14 only through headings, the RESULTS.md findings and targeted greps. Contradictions there may remain.
- Prototype conclusions rely on `host.ts` lines 255-270, 1085-1170 and 1540-1550 and grep over `test/`; I did not run the suite. The L1 claim (silent discard) comes from reading line 1125 and its surrounding branch; a separate path in the stop code (line 1548 onward) might record failure for provider-loss, which I did not trace.
- `activationId` absence was established by grep over `references/core` only; companions (loader, remote, federation) were not searched.
- No measurement of cost of R4/R5; whether Effect v4 scopes allow `stopping -> active` after partial drain depends on handoff export semantics (BEH-BR-347) I did not read.
- Cordis details come from the supplied brief, not the source.

## Resolution status (2026-11-21)

Branch `spec/lifecycle-report-01`; prototype suite 368/368, `verify-traceability.sh` 0 failures.

| Finding | Rec. | Status | Notes |
| --- | --- | --- | --- |
| L1 / L8 | R1 | Resolved | BEH-BR-039 rewritten: stale outcomes always discarded; `build-finished` carries `stale` and `discardedFailures`. Prototype and tests match. |
| L2 | R2 | Spec only | BEH-BR-160 failure bound added. No randomized failure-injection confluence test yet. |
| L3 | R3 | Resolved | `activation` on starting/active; `providerIds` carry the captured activation (prototype lacks `realm` in entries). |
| L4 | R4 | Resolved | `replace` `onFailure: {rollback}` and reconcile `settle` (with `atomic`). |
| L5 | R5 | Resolved | `abort` of a parked stop, folded into BEH-BR-074; tables gain an `abort` column. |
| L6 | R6 | Resolved | `awaitSettled(refs | {scope})` and `SettleTimeout`. |
| L7 | R7 | Resolved | Events carry `revision`, `activation`, `causeSeq`; `state-changed.trigger`. `causeSeq` is a heuristic. |
| L9 | R8 | Resolved | `Runtime.optional` is an existence witness; the service only through `useOptional`. |
| L10 | R9 | Resolved | A build awaiting a child releases its slot for the wait. |
| L11 | R10 | Resolved | `transitions.yaml` ledger, generated `legality.table.ts`, drift test. |
