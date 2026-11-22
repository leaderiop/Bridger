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

**Concrete spec change (as built).** A stale build's outcome, success or failure, is always discarded whatever changed the target, and the plugin goes `waiting`; this is consistent with BEH-BR-160. A discarded failure is reported by `build-finished` with `stale: true` and `discardedFailures`; at `staleFailureLimit` (host option, default 3) consecutive discards the host emits `build-flapping` and the `waiting` snapshot carries `flapping`. BEH-BR-039 is rewritten and BEH-BR-041/043/053 and RSK-BR-003 follow it.

```
REQUIREMENT: A stale build that failed MUST NOT make the plugin `failed`:
             the plugin goes to `waiting` or to the operator's destination,
             and the failure MUST be reported by a `build-finished` event with
             outcome "failure" and `stale: true`, carrying `discardedFailures`.
             At `staleFailureLimit` consecutive discards the host MUST emit
             `build-flapping`.
```

**Cost/risk.** Weakens "failure is sticky" for one path: a failing build can run again when the provider returns, which `discardedFailures` and `build-flapping` bound (RSK-BR-003). **Verification.** `r1-stale-build` (waiting, stale event, counter, flapping signal, failure under shutdown) and `confluence-faults` (stale discard across interleavings); making stale failures sticky fails both.

### R2. Make the quiescence theorem testable including failure (L2)

**Rationale.** Cordis' claim is clean: quiescent state is a function of final config. Bridger's BEH-BR-160 is a function of the installed set modulo failure, lazy class, refusal and handoff. That is honest, but the carve-out is untestable as written and the property tests only exercise success.

**Concrete spec change (as built).** BEH-BR-160 (v0.17) bounds the failure exception: for a history with injected build failures, once idle, the non-failed plugins equal those of a history without failures in which each failed plugin is `disabled`, and the failed set is a subset of the plugins whose build began and failed. A stale failure never appears in the failed set.

**Cost/risk.** Test-only plus one requirement; the tests use the `Fault.buildFails` injection. **Verification.** `confluence-faults.test.ts`: random histories check the failed-set subset and the non-failed equality (BEH-BR-160), equality with a direct install after restarting the faulted plugins, and the activation-pair invariant at every step. A separate interleaving test covers stale builds; the random universe's builds finish within one step, so only that test exercises them.

### R3. Introduce an activation ordinal (L3)

**Rationale.** Cordis keys targets by provider uid so a replaced provider is never confused with its predecessor. Bridger keys by `{id, realm}` (BEH-BR-027 `providerIds`) and keeps `epoch` as an internal prototype counter. A reader of the audit trail or snapshot cannot tell whether two `active` observations are the same activation, and no field proves "this dependent captured *that* generation of the provider".

**Concrete spec change (as built).** `activation` on `starting` and `active` snapshots (host-scoped, increases at each entry to `starting`, never reused), on events, and in `providerIds` entries `{ id, realm, activation }`. While a provider is `stopping` (hidden; its dependents stop next, BEH-BR-042) the pair names the activation it had.

**Cost/risk.** Snapshot schema change (pre-release). Snapshot equality across confluence runs ignores the ordinal, like revision. **Verification.** `r3-r7-identity` (a restart gives a larger ordinal and the dependent captures it) and the invariant check after every step of `confluence-p5` and `confluence-faults`.

### R4. Opt-in activation-level rollback for `replace` and atomic reconcile (L4)

**Rationale.** ADR-BR-004 rejects keep-old-alive (two providers of a key) and ADR-BR-051 rejects "undo on activation failure" because the outcome would depend on build timing. Both are right as defaults, but Cordis' transactional reload shows the operator wants "replace, and if the new build fails, put the old one back". Today the operator must read the failure and issue `replace(previous)` by hand while dependents sit `waiting`.

**Concrete spec change (as built).** `ReplaceOptions.onFailure: "stay-failed" | { rollback }` (default unchanged). After the swap the call waits for the new activation's first outcome, bounded by `buildTimeout`; on `failed` it issues one `replace(rollback)` attributed to the call and recorded with `undoes`, and fails with `ReplaceRolledBack`. `ReconcileOptions.settle`, with `atomic`, waits for each changed entry's first outcome and undoes the apply when one fails (`PartialApply` on an undo the gate refuses).

**Cost/risk.** The call now waits for a build, explicitly and with a bound. A rollback build re-runs the previous definition's side effects: rollback is not compensation (BEH-BR-048). **Verification.** `r4-rollback`: rollback succeeds, rollback fails (both causes reported), no rollback on success, atomic `settle` with and without; the atomic-apply checks cover a gate-refused undo.

### R5. A way to abort a parked stop (L5)

**Rationale.** BEH-BR-045 states the plugin "MUST NOT be republished" after `DrainTimeout`. That is safe but irreversible in practice: dependents were stopped, the provider is hidden, and the only exits are to stop it for good. A mistaken `restart` of a busy shared service becomes an outage.

**Concrete spec change (as built).** Operation `abort`, folded into BEH-BR-074 (file 06's ID block had no room for a new ID): legal only on a plugin whose own operation is parked and whose scope has not begun to close. It returns the plugin `stopping` to `active`, with its parked dependency-loss dependents that have all their providers active or returning, in one revision; each such dependent emits `stop-aborted`. Refused with `Conflict` `not-parked`, `dependency-loss`, `child-removed`, `provider-stopping` or the operation in flight; `HostClosed` once shutdown began. Health checks resume, a swallowed runtime-failure signal is replayed, no export or handoff record occurs.

**Cost/risk.** A new edge in BEH-BR-026 and an `abort` column in the BEH-BR-071/072 tables, generated from the transition ledger. **Verification.** `r5-abort`: restart and remove aborted, `stop-aborted` event, health loop, `whenAvailable` re-run, swallowed signal, shutdown versus abort, child removed, multi-provider dependents; the live-cell grid of `inflight.test.ts` covers the table cells.

### R6. Scoped settle (L6)

**Rationale.** `awaitIdle` is host-wide (BEH-BR-040) and excludes `waiting`/`failed`. After a `reconcile` an operator wants "these entries reached `active` or a stated terminal state". Under churn or a restart-policy loop, host-wide idle may never arrive, forcing polling of `changes`.

**Concrete spec change (as built).** `awaitSettled(refs | { scope }, { timeout })` returns each plugin's `{ ref, state, activation? }` once that plugin has no transition running or ready and no operation in flight other than a parked stop; it fails with `SettleTimeout`, `HostClosed` or `WouldDeadlock` (same rule as `awaitIdle`).

```
awaitSettled(refs: readonly PluginRef[] | { scope: string },
             opts?: { timeout?: Duration.Input }):
  Effect<readonly { ref; state; activation? }[],
         SettleTimeout | HostClosed | WouldDeadlock>
```

**Cost/risk.** Small; derived from the same per-plugin predicate as `awaitIdle`. **Verification.** `r6-settled`: returns while an unrelated plugin is still starting and times out on the busy one; a parked stop does not block it.

### R7. Correlate events with revisions and causes (L7)

**Rationale.** Cordis emits `internal/status` per fiber. Bridger's `state-changed` (13:82) carries `from`, `to`, `reason`, but no `revision`, no trigger (operator call, cascade root, background failure, provider return), and events are lossy by design. Without a revision, a consumer cannot know which snapshot an event belongs to. With no sink wired, the cause is lost entirely (INV-BR-026).

**Concrete spec change (as built).** `revision`, `activation` and `causeSeq` on events; `state-changed` carries `trigger` (operator, system, provider-return, dependency-loss, runtime-failure, shutdown). For a dependency-loss stop, `causeSeq` is the `seq` of the causing provider's own `stopping` event.

**Cost/risk.** Event schema growth; no behaviour change; INV-BR-013 (no values) is kept. **Verification.** `r3-r7-identity`: revisions never decrease, `causeSeq` points to an earlier event, transitions chain, and two independent providers each cause only their own dependent's stop.

### R8. Close the optional-read hazard (L9)

**Rationale.** BEH-BR-130 gives an unleased point-in-time read; the removal path cannot protect a use that happens after the read. Cordis has the analogous INACTIVE_ACCESS.

**Concrete spec change (as built).** `Runtime.optional` returns an existence witness (`Option<void>`), never the service; the service is reachable only through `useOptional`'s lease. BEH-BR-130 and the INV-BR-006 Implication say so.

**Cost/risk.** Breaking for callers of the bare read (prototype only). **Verification.** `optional.test.ts`.

### R9. Detect the build-slot self-deadlock statically (L10)

**Rationale.** G21: a parent that `awaitActive`s a child in its build holds a slot the child needs, and with `concurrency` N such parents it always times out at `buildTimeout`.

**Concrete spec change (as built).** A build that awaits a child releases its slot for the wait and takes one again afterwards (BEH-BR-034, BEH-BR-124); the FIFO wording is updated. The fail-fast alternative was not built.

**Cost/risk.** Slot accounting changes the FIFO rule. **Verification.** The G21 test in `children.test.ts`: `concurrency: 1`, parent with child.

### R10. A generated transition ledger (L11)

**Rationale.** The legal edges are spread over BEH-BR-026 (mermaid), 071, 072, 073, 074, 079, 080 and the child rules. Every audit round (7 to 9) edited the same cells. A single machine-readable table (state, trigger, reason, next, record kind, event) would let `legality.ts`, the snapshot union, the audit schema and the docs be generated and diffed, as Cordis does with its event catalogue check.

**Concrete spec change (as built).** `references/core/transitions.yaml` is the source for BEH-BR-026/071/072 and the stop-reason pairs; `scripts/gen-legality.mjs` generates `src/legality.table.ts`, which `legality.ts` reads.

**Cost/risk.** Tooling work, no semantic change. The drift check runs in the test suite, not in `verify-traceability.sh`. **Verification.** `transitions-ledger.test.ts`: the BEH-BR-026 diagram and the BEH-BR-071/072 tables match the ledger, the generated file is current, and the 56 + 28 cell tests still pass.

## Verification of the original uncertainties (2026-11-22)

- **Files 09, 10, 12, 14, 34 (read in full, 2026-11-22).** Found and fixed: abort wording in 09, a swallowed runtime-failure signal lost across an abort (now retained and replayed), health loop and counters across an abort, stale build under shutdown, shutdown versus abort, `awaitSettled` in `HostClosed` and `WouldDeadlock`, handoff text that contradicted abort. Two real unsoundness cases in `abort` were fixed in spec and prototype: a stop that already removed a child cannot be aborted (`child-removed`), and a dependent returns only when all its providers are active or return with it (`provider-stopping`).
- **Stop path after line 1548.** Traced: every site that sets `failed` for a build, load or activation is guarded by the epoch check, so a stale build cannot mark a plugin failed; the cleanup failure site is a real stop failure. Mutation-checked by tests.
- **Companions and docs.** Searched references/kit, the loader, remote, federation and ERP specs and the docs folder. Fixed `docs/SPEC.md`, ERP-RUNTIME, FOLDKIT-API, REACT-UI-PLUGINS, ERP-BROWSER, the error catalogues and the devtools `why` rule. Loader, remote and federation had no conflicts.
- **BEH-BR-347 and cost.** Read: the export runs after the drain and before the scope closes, so an abort causes no export; BEH-BR-347 is unaffected. Measured in the prototype test host (200 iterations, one machine): `replace` 3.9 ms, `replace` with rollback on the success path 4.7 ms, `restart` 3.6 ms, park and abort about 4 ms beyond the forced 5 ms drain.
- **As built differs from proposed.** Only in naming and the alternative taken: R1's signal is `build-flapping` (`plugin-stalled` already exists), R9 releases the slot (no fail-fast), R6 is `awaitSettled(refs | {scope})`, R4 is `onFailure` and reconcile `settle`. R2 follows the proposal: the failed-set and non-failed-set oracle of BEH-BR-160 is tested on random histories, besides the restart-equality check.
- **Diagrams and cards.** Simplified sketches, not spec extracts. The AFTER figures and the 'Concrete spec change (as built)' text of every card show the implemented behaviour; the Rationale text is the original finding.

## Original uncertainties (as first written)

- I read behaviours 04-08 and 13/18 and ADR-004/010/051 in full; files 09 (leases), 10, 12 (shutdown), 34 (handoff) and 14 only through headings, the RESULTS.md findings and targeted greps. Contradictions there may remain.
- Prototype conclusions rely on `host.ts` lines 255-270, 1085-1170 and 1540-1550 and grep over `test/`; I did not run the suite. The L1 claim (silent discard) comes from reading line 1125 and its surrounding branch; a separate path in the stop code (line 1548 onward) might record failure for provider-loss, which I did not trace.
- `activationId` absence was established by grep over `references/core` only; companions (loader, remote, federation) were not searched.
- No measurement of cost of R4/R5; whether Effect v4 scopes allow `stopping -> active` after partial drain depends on handoff export semantics (BEH-BR-347) I did not read.
- Cordis details come from the supplied brief, not the source.

## Resolution status (2026-11-22)

Branch `spec/lifecycle-report-01`; prototype suite 382/382, `verify-traceability.sh` 0 failures.

| Finding | Rec. | Status | Notes |
| --- | --- | --- | --- |
| L1 / L8 | R1 | Resolved | BEH-BR-039 rewritten: stale outcomes always discarded; `build-finished` carries `stale` and `discardedFailures`; `build-flapping` event and snapshot `flapping` at `staleFailureLimit` (default 3). Prototype and tests match. |
| L2 | R2 | Resolved | BEH-BR-160 failure bound added; randomized failure-injection confluence tests (`confluence-faults.test.ts`) with a mutation-checked stale-discard property. |
| L3 | R3 | Resolved | `activation` on starting/active; `providerIds` carry the provider's `realm` and the captured activation. |
| L4 | R4 | Resolved | `replace` `onFailure: {rollback}` and reconcile `settle` (with `atomic`). |
| L5 | R5 | Resolved | `abort` of a parked stop, folded into BEH-BR-074; tables gain an `abort` column; tests cover remove, health-loop restart and `whenAvailable` re-run. |
| L6 | R6 | Resolved | `awaitSettled(refs | {scope})` and `SettleTimeout`. |
| L7 | R7 | Resolved | Events carry `revision`, `activation`, `causeSeq`; `state-changed.trigger`. `causeSeq` of a dependency-loss stop names the causing provider's own `stopping` event (per edge). |
| L9 | R8 | Resolved | `Runtime.optional` is an existence witness; the service only through `useOptional`. |
| L10 | R9 | Resolved | A build awaiting a child releases its slot for the wait. |
| L11 | R10 | Resolved | `transitions.yaml` ledger, generated `legality.table.ts`, drift test. |
