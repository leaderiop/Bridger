# Report 03: Temporal composability, scopes, contributions and cleanup

Lens: Cordis / DeepSeek Harness (revertible effects, one `ctx.effect` primitive, LIFO inverses, `getEffects`, disposer-at-most-once, async disposers, INACTIVE_EFFECT). Scope: `references/core` behaviours 05, 06, 13, 19; `references/command` BEH-CM-050; `prototypes/host-core/src/{host,registry}.ts`.

## Executive summary

1. Bridger's cleanup model (one forked Effect `Scope` per activation, `ContributionRegistry` for shared state, dependency-ordered stops, sticky `failed(cleanup)`) is stricter and better specified than Cordis's.
2. The largest real gap is liveness: no spec'd bound on a hung finalizer in the activation scope (INV-BR-030 only assumes "finalizers that return"), and none on a revoked registry holder's own finalizers (BEH-BR-167).
3. `CleanupError` and `failed(cleanup)` carry one squashed message, so the operator learns that something leaked but not what; there is no analogue of `getEffects` for scope resources, only for registry contributions and listeners.
4. Cross-boundary effects are explicitly out of scope (BEH-BR-161/048, roadmap), but nothing lets a plugin declare an effect irreversible, or lets a build's emissions be withheld until publication, and `command` already has a `compensatedBy` model that core does not mirror.
5. Most fixes are additive diagnostics and one new timeout; none change the lifecycle state machine.

## Where Bridger is already ahead

- Failure is sticky and honest: BEH-BR-046 forbids claiming a failed finalizer's resource was released; BEH-BR-047 makes the acknowledgement of a leak a named, audited act (`leak-acknowledged` record, `Actor.system`) rather than a silent retry. Cordis has `FAILED` but no leak ledger.
- A leaked slot stays reserved (BEH-BR-046 prose): a replacement cannot reacquire the same external resource. In Cordis a failure stays on the fiber and withholds re-entry (paper §4.4); the paper does not model a failed inverse.
- Shared state has a real independence contract: `ContributionRegistry` (BEH-BR-161-168) gives keyed uniqueness (BEH-BR-163), id reservation until removal completes (BEH-BR-164), hide-then-drain-then-revoke with a bounded drain (BEH-BR-167), revisioned views, and a `revocations` feed with gap-detectable `seq`. Cordis only offers "inverse is the author's problem".
- Honest limits: BEH-BR-161 refuses to claim arbitrary mutations commute; BEH-BR-048 says removal does not compensate emissions. This is the paper's own stated threat, written as a requirement.
- No ambient mutation after death: activation scopes are fresh per activation (BEH-BR-036, INV-BR-014), `ActivePlugin.report` "does nothing once the activation has ended" (BEH-BR-119), and a failed activation publishes nothing (BEH-BR-037). This approximates INACTIVE_EFFECT without a throwing primitive.
- Ordering across plugins is specified (dependents stop first, ADR-BR-038) and deadlock-guarded (`WouldDeadlock`, INV-BR-016); Cordis relies on UNLOADING and inertia alone.
- Declared compensation exists one layer up: `compensatedBy`, `CommandBatchRolledBack` / `CommandBatchPartial` with `notUndone` reasons (BEH-CM-050) is an explicit, digest-bound output-commit answer for commands.

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|---|---|---|---|---|
| T1 | H | INV-BR-030 Source ("finalizers that return"); host.ts:1620 `Scope.close(scope, Exit.void)` with no timeout; BEH-BR-040 bounds builds only | A hung async finalizer blocks stop, cascade, replace and shutdown forever. Drains are bounded (INV-BR-017), builds are bounded (`buildTimeout`), the scope close is the one unbounded step | Add `closeTimeout` option; on expiry record `failed(cleanup)` "finalizer timed out", keep the fiber interrupted-not-awaited, see R1 |
| T2 | H | BEH-BR-167 "MUST wait for their finalizers and then complete the removal"; registry.ts `Fiber.interruptAll` after timeout | Revocation bounds the holder's run but not the holder's finalizers; one stuck finalizer pins the id reserved and the owner's scope close | Second bound `revokeTimeout`; on expiry complete removal, count it in `HoldRevoked` (`stuck: n`) |
| T3 | M | BEH-BR-046 `CleanupError { id, realm, message }`; host.ts:1625 `msg(Cause.squash(...))` | Only the first failure survives; several finalizers can fail, and none is identified. "What leaked" is unknowable | Carry `failures: [{ label?, message }]` (full cause, ordered LIFO), see R2 |
| T4 | M | BEH-BR-119 `report` kinds are only `contribution` and `listener`; `PluginInspection.contributions` (13:347) | No diagnostic tree of what an activation holds (the `getEffects`/EffectMeta analogue). Operator facing `failed(cleanup)` cannot see which resources were pending | Opt-in `Plugin.Runtime.resource(label, effect)` / `report({kind:"resource"})`, see R3 |
| T5 | M | BEH-BR-161/048; roadmap "Explicitly not planned: Compensation"; BEH-CM-050 `compensatedBy` | No way for a plugin to mark an acquired resource or emission as irreversible; the leak record cannot distinguish "closed handle leaked" from "money moved". No core-level counterpart of `compensatedBy` | `irreversible` tag on resource reports; surfaced in `leak-acknowledged` record and `failed(cleanup)` inspection, see R4 |
| T6 | M | BEH-BR-141 emit fire-and-forget; BEH-BR-037 atomic publish; no spec found withholding build-time emissions | A build that emits (bus, external) then fails or goes stale (BEH-BR-039) has already told the world. Publication is atomic, emission is not | Document, and optionally offer `Plugin.Runtime.afterPublish(effect)` that runs only once published, see R5 |
| T7 | M | BEH-BR-039 stale build "settles" rather than being interrupted; `buildTimeout` bound only | A stale build keeps acquiring resources for up to `buildTimeout` and gets no signal that it is stale | Expose a `Plugin.Runtime.superseded: Effect<boolean>` / `Deferred` for cooperative cancel, see R6 |
| T8 | L | BEH-BR-164 LIFO within one scope; BEH-BR-163 `owner` | Finalizer ordering between a plugin's own contributions and its `Layer` resources is Effect's insertion order and is not stated; a contribution added early in a build can be withdrawn after a resource it depends on closes | State the interleaving rule explicitly; add a conformance test, see R7 |
| T9 | L | BEH-BR-167 `get`/`view` "plain reference"; BEH-BR-166 | A removed value stays reachable to a reader holding the plain reference; only `use` holds | Acceptable and documented; add a dev-mode `Registry.options.freezeOnWithdraw` hook only if renderers misuse it (no change now) |
| T10 | L | BEH-BR-047 never re-runs cleanup | An operator who fixed the underlying fault cannot retry the cleanup; the only exit is acknowledgement, which discards the leak ledger | Optional `retryCleanup` operation for `failed(cleanup)` restoring the recorded scope finalizers, see R8 |

## Recommendations

### R1. Bound the activation-scope close (T1)

Rationale: Cordis awaits async disposers with no bound too, but Bridger claims "no default is unbounded" (INV-BR-017) and writes the finalizer as the place where bounds are the only way out (BEH-BR-167 rationale: "a finalizer cannot fail"). The activation scope is the one place where the claim stops. Shutdown (12) inherits the exposure.

Concrete spec change: add `BridgerOptions.closeTimeout` (default 30 s, no "forever" default, consistent with BEH-BR-011). New requirement in BEH-BR-046: when closing the activation scope exceeds `closeTimeout`, the host MUST record `failed(cleanup)` with message "close timed out after N ms", MUST interrupt the closing fiber and MUST NOT claim any resource released; the plugin stays registered (slot reserved). Amend INV-BR-030 "finalizers that return" to "finalizers that return within `closeTimeout`", and add `closeTimeout` to the `DrainTimeout`-style bound sum in INV-BR-017.

Cost/risk: Medium. Interrupting a finalizer mid-write can leave a half-done external write (same caveat as BEH-BR-167). Mitigate: per-plugin override via manifest (27) for plugins with long closes.

Verification: `TestHost` fault `Fault.closeHangs` (extends BEH-BR-180 `stopFails`); assert state `failed(cleanup)` within the limit, shutdown completes, other plugins' scopes still closed.

### R2. Report every finalizer failure, not the squashed first (T3)

Rationale: Effect's `Scope.close` aggregates; `Cause.squash` (host.ts:1625) keeps one. Cordis has the same loss, but Bridger's whole value in BEH-BR-046/047 is truthful leak reporting.

Concrete spec change: `CleanupError`, the `failed(cleanup)` snapshot failure and the `leak-acknowledged` record's `error` gain `causes: readonly { message: string; label?: string }[]` (LIFO order), with the existing `message` kept as the first for compatibility. BEH-BR-047 requires the warning log and record to list all.

Cost/risk: Low; additive in schema (08 error taxonomy, 23 record shape; audit hash chains cover the new field, so version the record).

Verification: test with two failing finalizers asserts both appear and order is LIFO; record round-trips through `AuditSink` idempotence (BEH-BR-193).

### R3. A resource tree for diagnostics (T4)

Rationale: Cordis `getEffects` returns an EffectMeta tree; Bridger's `inspect` shows contributions and listeners only. Layer-acquired resources (pools, sockets) are invisible, so a `failed(cleanup)` entry says nothing about what to fix.

Concrete spec change: extend `ActivePlugin.report` (BEH-BR-119) with `{ kind: "resource"; label: string; irreversible?: boolean }`, and add `PluginInspection.resources`. Provide `Plugin.Runtime.acquire(label, acquire, release)` as a thin wrapper over `Effect.acquireRelease` that reports; use stays optional (no mandatory wrapper, keeping "no resource abstraction beside Scope and Layer", BEH-BR-036). Report names only, never values, as BEH-BR-168 already does.

Cost/risk: Low-medium; adds a convention plugins may ignore, so coverage is partial. State that in the spec so absence is not read as "nothing held".

Verification: inspection lists resources while active, none after close, and under `failed(cleanup)` lists those whose release failed (needs R2 labels).

### R4. Irreversibility tagging and the leak ledger (T5)

Rationale: Cordis leaves inverse correctness to the author and the paper names the output-commit problem as a limit. Bridger already says compensation is application-defined, but gives the application nothing to attach it to, while `command` gives batches `compensatedBy`.

Concrete spec change: resources/emissions reported with `irreversible: true` (R3) appear in the `leak-acknowledged` record and in inspection of a `failed(cleanup)` plugin. Add to BEH-BR-161 one non-claim: "core never verifies that a finalizer is the inverse of its acquisition". Cross-reference BEH-CM-050 as the supported compensation pattern, and extend roadmap with an explicit hook `Plugin.compensate` only if a second consumer appears (keep "not planned" otherwise).

Cost/risk: Low; wording plus one field. Risk of over-promising: keep the "not verified" sentence.

Verification: record fixture includes the flag; docs conformance check (INV-BR-026-style differential) covers the new field.

### R5. Withheld emissions until publication (T6)

Rationale: BEH-BR-037 makes service publication atomic and BEH-BR-039 discards stale builds, but a build that already called `bus.emit` or an external API cannot be discarded. Cordis has the same gap; the paper calls for "withholding or compensation".

Concrete spec change: first state in BEH-BR-037 that emissions during `build` are not withheld. Then add optional `Plugin.Runtime.afterPublish(effect)`: effects queued in the build and run, in order, only after the plugin becomes `active` in the revision of publication; discarded (never run) when the activation fails or is stale. Use the `durable-bus` transactional outbox as the cross-process analogue (durable-bus 02).

Cost/risk: Medium. New ordering point relative to `plugin-activated` events; must not run under `CurrentTransition` re-entrancy rules (INV-BR-016). Keep optional.

Verification: stale-build test (BEH-BR-039) asserts queued effects never ran; successful build asserts they ran after the snapshot revision.

### R6. Cooperative cancellation signal for an in-flight activation (T7)

Rationale: Cordis's inertia completes the transition; Bridger does the same by design ("letting the step settle keeps finalizers in a known state"), with only `buildTimeout` as the cost bound. A build waiting on a slow external call after being made stale wastes resources and widens the leak window.

Concrete spec change: `Plugin.Runtime` gains `superseded: Effect<boolean>` (or a `Deferred`) set when BEH-BR-039 makes the build stale; builds MAY poll it and fail fast with a tagged `Superseded`, which the host treats as the stale outcome. No interruption by core, keeping the settle rule.

Cost/risk: Low; purely cooperative.

Verification: build that awaits the signal ends within one scheduler turn of supersession; scope still closes via the normal path.

### R7. State the finalizer interleaving rule (T8)

Concrete spec change: in BEH-BR-036/164 add: "A contribution's withdrawal is a finalizer of the scope `add` ran in and is ordered with all other finalizers of that scope by acquisition (LIFO)". Add a conformance test: resource A acquired, contribution C added using A, then close: C withdraws (draining `use` holders) before A releases.

Cost/risk: Low; likely already true (registry.ts `Effect.addFinalizer`), but the unstated rule matters because withdrawal can wait up to `drainTimeout`.

### R8. Optional retry of a failed cleanup (T10)

Concrete spec change: `Host.retryCleanup(id)` for `failed(cleanup)` only, attributed and gated like other operators (22, 25), re-running only finalizers that previously failed (needs R2's per-finalizer record, so hold behind R2). BEH-BR-047 stays the acknowledgement path.

Cost/risk: Medium-high: partial finalizer state must be kept after the scope has "closed". Defer unless operators ask; conflicts with "nothing more can be released through the scope" (BEH-BR-046 prose).

Verification: fault injects a one-shot failure; retry succeeds and the plugin leaves `failed(cleanup)` without a `leak-acknowledged` record.

## Resolution status (2026-11-22)

Branch `spec/cleanup-report-03`; prototype suite 646/646 (622 when the work started), `verify-traceability.sh` 0 failures. Every finding is resolved; the cards above are the proposals, and this table is what was built.

| Finding | Rec. | Status | As built |
|---|---|---|---|
| T1 | R1 | Resolved | `closeTimeout` (default 30 s). Effect cannot interrupt a finalizer (probed), so the close runs detached and only the wait is bounded; expiry ends the stop `failed(cleanup)` and claims no release. BEH-BR-107 amended: the overall shutdown limit still never interrupts, the per-scope limit records a failure. A plugin definition may override the bound (`closeTimeout`); the manifest override was replaced by it, since a manifest is data. |
| T2 | R1 | Resolved | `Registry.revokeTimeout` (default 30 s) and `HoldRevoked.stuck`. The prototype had no `revocations` feed at all; BEH-BR-167's feed (`seq`, no notice without a revoked holder) is now implemented with it. |
| T3 | R2 | Resolved | `causes` (LIFO, `label?`) on `CleanupError`, the failed snapshot entry and the `leak-acknowledged` error; `message` is the first. The `unmount` hook still carries one message. |
| T4 | R3 | Resolved | `Runtime.acquire` and `PluginInspection.resources` (held, or release failed or unconfirmed). Opt-in: an empty list does not mean nothing is held. The prototype's `ActivePlugin` now has the specified scoped `report` (contribution, listener, resource); a listener is listed under `listeners` only. |
| T5 | R4 | Resolved | `irreversible` resources appear in the leak record's `error.resources` and in inspection; BEH-BR-161 non-claim added; roadmap keeps `Plugin.compensate` as not planned. |
| T6 | R5 | Resolved | BEH-BR-037 states emissions during build are not withheld; `Runtime.afterPublish` runs the queue in order after publication, never for a failed or stale build. |
| T7 | R6 | Resolved | `Runtime.superseded` and `whenSuperseded`. No `Superseded` tag: any failure of a stale build is already discarded. |
| T8 | R7 | Resolved | Rule stated in BEH-BR-164 and tested (holder drains before an earlier resource is released). |
| T9 | — | Resolved (documented) | BEH-BR-166: plain references are not holds; no `freezeOnWithdraw` option. |
| T10 | R8 | Resolved | `Host.retryCleanup`, the tenth operation (ledger, BEH-BR-071/072 tables, gate and audit as the others). It re-runs only releases kept by `acquire`; a bare finalizer failure or a timed-out close stays acknowledgement-only. When nothing is left the plugin becomes `disabled`, so nothing builds unattended. |

## Not checked / uncertainties

- Checked: `Scope.close` has no implicit bound and a timeout over it hangs on a hung finalizer (probe); a finalizer added to an already closed scope runs at once; several failing finalizers surface in LIFO order in the cause.
- Checked: shutdown (12) bounded the whole shutdown only, never a single plugin's close; T1 stood as written. BEH-BR-107 was amended.
- Checked: no rule withheld build-time emissions (05, 16); T6 stood.
- The prototype was run: every change has a test and a mutation check (breaking the code failed the test).
- Not done: `retryCleanup` cannot retry a finalizer not acquired through `acquire`, because a `Layer` hides its finalizers in closures of nested scopes that the host cannot reach (probed: wrapping every reachable finalizer captured only the labelled release, and Effect's `scopeClose` on an already closed scope does nothing, so a composite closure cannot be re-run); a retry also runs a release a second time, which Cordis forbids (at most once), so a kept release must be safe to repeat; `Plugin.compensate` stays unplanned; the per-plugin `closeTimeout` lives on the plugin definition, not the manifest.
- Cordis comparisons were checked against the paper (arXiv 2608.25512): inertia (§4.4), the failure outcome that withholds re-entry (§4.4), awaiting `fiber.dispose()` with no bound (Algorithm, §5.1.3), recovery at most once (§5.1.1) and acquisition versus emission with withholding and compensation (§6.1) are stated there. `getEffects` and `INACTIVE_EFFECT` come from the Cordis fiber documentation, not the paper. One row was wrong and is corrected: Cordis does not "re-run" after a failure. The animated diagrams were re-read against the as-built behaviour: the close-timeout cards said the closing fiber is interrupted, which is wrong (a finalizer cannot be interrupted); they now say the wait ends and the close keeps running detached. `docs/improvement-reports/verify-report-03.py` now checks every phrase the cards rely on against the spec files and rejects the stale wording, so they cannot drift silently; the drawings themselves remain hand-authored.
