# Report 04: Events, hooks, policy gates and pipelines (Bridger vs the Cordis lens)

## Executive summary

- Bridger has three separate decision/observation mechanisms: the `Bridger.Events` bus (BEH-BR-137-144), hook points (BEH-BR-297-312) and the operation gate (BEH-BR-313-321, `gate.ts`). Their veto and observe roles are cleanly separated; Bridger is ahead of Cordis on this.
- The bus itself is thinner than Cordis' catalog discipline: an `EventKey` carries no dispatch mode, so "one mode per event" is not enforced; a mismatch (an `on` listener on a waterfall-dispatched event) is silent.
- No generated event/hook catalog and no verifier checks call sites against declarations. `references/core/scripts/` only has traceability and claims checks.
- `emit` has no back-pressure and no ordering statement: one unbounded supervised fiber per listener per emit (`bus.ts` `fireAndForget`), results unordered.
- Waterfall `next` is un-memoised and "observer must call next" is a SHOULD, not a checked property; `waterfall` is also the only dispatch with no failure/timeout/deadline policy.

## Where Bridger is already ahead

- **Veto is not an event.** BEH-BR-144 forbids any listener veto over host operations; authorisation goes through the `OperationGate` port only. Cordis lets any waterfall listener veto by omission.
- **Decision hooks are a separate, fully specified contract** (BEH-BR-297-312): roles `veto|enrich|advisory` fixed at registration, admission rules (`who`), per-hook timeout, per-dispatch deadline (INV-BR-041), circuit breaker per contribution or plugin, dormant-plugin wake, and a decision record naming the decider (BEH-BR-305). Cordis has none of this.
- **Fail-closed gate**: `Gate.run` (`gate.ts`) turns defect, timeout and malformed `Defer` into `Refuse` ("gate-defect", "gate-timeout"); `Gate.all` ordering is specified (first refusal wins, deferral yields).
- **Failure isolation on emit** is specified: listener failure never reaches the emitter and becomes a `listener-failed` host event (BEH-BR-141). Listener removal mid-dispatch is a defined defect, not silent skipping (BEH-BR-142).
- **Dispatch context** (BEH-BR-144): listener principal = owner, actor reset to unattributed, annotations filtered to "events"; stronger than Cordis' fiber-context proxy.
- **Deterministic order**: priority then monotonic id, `prepend` via descending ids, snapshot at dispatch start (BEH-BR-140); `parallel` returns results in listener order.
- **Command dispatch pipeline is a fixed 8-step order** (BEH-CM-009) with a single entry point, which is the "tool pipeline gated by events" idea made normative and checked (INV-CM-001).

## Findings

| ID | Sev | Evidence | Issue | Proposed change |
|----|-----|----------|-------|-----------------|
| EV-01 | H | `bus.ts:17-21` `Event.make`; BEH-BR-138; `EventBus` has 4 dispatchers + 2 registrars | An `EventKey` has no mode. Registering `on` and dispatching via `waterfall` (or the reverse) type-checks, and the listener is silently never called (`snapshot(...,"around")` filters by kind). | Put `mode` in the key (`Event.make<...>()(id, { mode })`); typed dispatch/registration accept only matching modes. |
| EV-02 | H | `references/core/scripts/*` (traceability and claims only); BEH-BR-138 "Settled here" says shape drift is undetectable | No generated event catalog, no check that every emitted/listened key is declared and every call site uses the declared mode. | Add `verify-events.sh` plus generated `references/core/appendices/event-catalog.md` from `Event.make` declarations; CI fails on drift. |
| EV-03 | M | `bus.ts` `fireAndForget`: `Effect.forkIn(run, supervisor)` per listener, no limit | `emit` has no back-pressure: a hot event with a slow listener grows fibers without bound (NFR-BR-007 bounded memory is stated only for metrics, BEH-BR-117). | Per-listener concurrency/queue bound with a stated overflow policy (drop-oldest plus `listener-overflow` host event), or document emit as in-process-only and cap by plugin. |
| EV-04 | M | BEH-BR-141/140; `fireAndForget` forks in order but runs concurrently | Start order is by priority, but there is no statement that listeners of one emit run concurrently, nor per-listener ordering across successive emits (emit A, emit B may overtake). | Specify: no ordering across listeners; per-listener FIFO optional via a `serialised` option, else state it is not guaranteed. |
| EV-05 | M | BEH-BR-143 "A listener that only observes MUST run `next`"; `waterfall` in `bus.ts` | Veto vs observe is an authoring convention on waterfall; `next` is not memoised (run twice = chain twice); no timeout, deadline or breaker unlike hook points. A buggy observer that skips `next` vetoes silently. | Give `around` a role (`observe`/`decide`): the bus supplies `next` once-only and, for `observe`, runs the tail itself. Fail the dispatch if an `observe` listener returns without having run `next`. Memoise `next` (second call = defect). |
| EV-06 | M | `bus.ts` `serial`: `out !== undefined` ends chain; BEH-BR-142 Settled (2) | `serial` is Cordis' `bail` under another name; "decision pattern" is exactly the veto-vs-observe ambiguity (`void` listeners observe, a value decides) with no role marking and no decision record. BEH-BR-142 says `bail` is not provided because Effect has no sync dispatch, which is a weak rationale. | Reword rationale; state that `serial` is for first-answer queries, never policy; policy uses hook points (BEH-BR-308 should say this). |
| EV-07 | M | `bus.ts` `parallel`: `concurrency:"unbounded"`; BEH-BR-142 | Unbounded fan-out and first-failure-interrupts-rest: a sibling listener that has already produced a side effect is cut off mid-way, with no compensation rule. | Add a `concurrency` option and state that `parallel` listeners must be idempotent/interrupt-safe; or fail-late (collect all) variant. |
| EV-08 | M | `events.ts` `HostEventBody` (20 variants incl. `listener-failed`); BEH-BR-131-ish in 13 | `Host.events` is lossy by design but there is no machine-checked list tying each `type` to an emitting behaviour; `listener-failed` carries a message only, no plugin id or listener id (the `HostEvent.pluginId` is optional). | Require `pluginId` on `listener-failed`; add a verify script that every `HostEventBody` tag appears in exactly one BEH. |
| EV-09 | M | `hooks.ts:29` `OnErrorPolicy`; `runtime.ts:6` `FailurePolicy`; BEH-BR-302, 310 | Two unrelated failure vocabularies: `FailurePolicy` ("fail-plugin"/"restart"/"ignore", background tasks) vs `OnErrorPolicy` ("deny"/"skip"). The listener failure policy on the bus is implicit (emit: log; others: propagate). | Add a glossary entry mapping the three failure sites (listener, hook, background) and pick consistent names. |
| EV-10 | M | `hooks.ts:35-52`: `timeout`, `deadline`, `breaker`, `dormant`, `policy`, `settle`, `allowNoLink`; BEH-BR-309 history CCR-BR-029 | `HookPointOptions` is large (10 knobs); defaults are spread across 12 behaviours. Misconfiguration (e.g. `onError:"skip"` on a veto point) is only partly admission-checked. | Spec a table of defaults and a `HookPoint.validate` list; mark `skip` on veto role as admission-refused unless declared in `allow`. |
| EV-11 | L | BEH-BR-139 listener = registering scope; `ListenerOptions` has `priority`, `prepend` | No `global`-style option and no listener-disposal visibility beyond scope close; `prepend` plus numeric `priority` is two ways to say the same thing. | Document precedence (priority first, then prepend); no `global` needed because realms replace it (BEH-BR-146 area); say so. |
| EV-12 | L | BEH-BR-144 inherited `HeldPlugins` | Re-entrancy: a listener that emits the same event it handles is not bounded (no depth cap, no cycle detection); only `WouldDeadlock` for lease waits. | Add emit-depth annotation with a default cap, failing with a defect naming the chain. |
| EV-13 | L | `references/agent/behaviors/01-agent-seams.md`, BEH-CM-012 | Agent tool runs reach hooks only through command dispatch (good), but model-side events (step start/finish, tool refused) have no declared event keys or catalog entries, so an observer cannot subscribe without private contracts. | List agent loop events as typed keys in the same catalog (see EV-02). |

## Recommendations

### R1. Mode belongs to the event key (EV-01, EV-06)

**Rationale.** Cordis' strongest idea here is that each event has exactly one mode, so a listener cannot be registered for a style the emitter never uses. Bridger split `on`/`around` by kind but left mode free in the key, so the bug is silent.

**Concrete spec change.** BEH-BR-138: `EventKey<Args,Result,E,Mode>`, `Event.make(...)(id, { mode: "emit"|"parallel"|"serial"|"waterfall" })`. BEH-BR-139: `on` accepts keys of mode emit/parallel/serial, `around` only waterfall (compile error otherwise). BEH-BR-141-143: each dispatcher accepts only its mode (compile error, plus runtime defect for untyped callers). ADR-BR-020 gets an amendment. Cleanest design: no unmoded keys exist.

**Cost/risk.** Low; the prototype has 4 dispatchers and a single `Event.make`. Risk: events dispatched by two modes today need splitting.

**Verification.** Type tests (`// @ts-expect-error`) for each mismatched pair; a runtime test that a mismatched dispatch dies with the event id.

### R2. Generated, verified event catalog (EV-02, EV-08, EV-13)

**Rationale.** Cordis' `@mode` tag + generated catalog + `verify-cordis-catalog` makes drift a CI failure. Bridger has the same tooling culture (`verify-traceability.sh`, `verify-companions.sh`) but not for events.

**Concrete spec change.** New script `references/core/scripts/verify-events.sh` (and per-companion equivalents) that (a) extracts every `Event.make` / `HostEventBody` tag / `HookPoint.make` name from source or spec snippets; (b) generates `appendices/event-catalog.md` with id, mode, args, result, owner behaviour; (c) fails if a dispatch or listener site names an id or mode absent from the catalog. Add a PROC rule that a new event needs a catalog row in the same change.

**Cost/risk.** Medium (parser on illustrative snippets, which are marked "not type-checked"); start with the prototype source and a regex for `Event.make`.

**Verification.** Seed a mismatched fixture; the script must exit non-zero.

### R3. Waterfall roles and once-only `next` (EV-05)

**Rationale.** Cordis admits "not calling next vetoes" is right for policy and a bug for observers. Bridger's BEH-BR-143 repeats the trap as prose.

**Concrete spec change.** BEH-BR-143: `around(event, {role:"observe"|"decide"}, fn)`. For `observe` the bus passes a `next` and, if the listener returns without calling it, runs the tail itself and records a `listener-failed` ("observer skipped next"). `next` becomes memoised: a second call is a defect. State that decisions with consequences must use a hook point (BEH-BR-308), keeping BEH-BR-144 intact.

**Cost/risk.** Low-medium; changes `waterfall`'s type, rare use today.

**Verification.** Tests: observer that skips `next` still reaches `final`; double `next` defects; `decide` short-circuits.

### R4. Bounded emit and stated ordering (EV-03, EV-04, EV-12)

**Rationale.** `fireAndForget` forks without limit, and the spec says nothing on order, capacity or re-entrancy. For a GxP runtime, "lossy but silent" on the bus is the wrong default.

**Concrete spec change.** BEH-BR-141: add a per-listener in-flight bound (default stated) with overflow behaviour `drop` plus a `listener-overflow` host event (add to `HostEventBody`); declare that emit gives no completion-order guarantee and that cross-emit order per listener holds only for `serialised` listeners. BEH-BR-144: an emit depth annotation with a cap; exceeding it is a defect naming the event chain.

**Cost/risk.** Medium: touches `begin` and `fireAndForget` and NFR-BR-007 wording.

**Verification.** Stress test with a blocked listener; assert bounded fibers and the overflow event; recursion test hits the cap.

### R5. Align policy surfaces and vocabulary (EV-06, EV-09, EV-10)

**Rationale.** A policy author must pick between `serial`, `around`, a hook point and a gate; the specs say it only in scattered "Settled" paragraphs.

**Concrete spec change.** Add one decision table to core overview or 16: observe -> `emit`; first answer -> `serial`; middleware -> `waterfall` observe; multi-party decision with failure policy and audit -> hook point; host operation authorisation -> `OperationGate`. Add glossary rows for `FailurePolicy` vs `OnErrorPolicy` vs listener failure. Add a defaults table for `HookPointOptions` and an admission rule rejecting `onError:"skip"` on veto unless allowed.

**Cost/risk.** Low (documentation plus one admission check).

**Verification.** A traceability check that every hook option has a default row; test of the admission rule.

### R6. Listener failure attribution (EV-08)

**Concrete spec change.** BEH-BR-141 and `HostEventBody`: `listener-failed` MUST carry `pluginId` (owner) and listener contribution id; `HostEvent.pluginId` is optional today (`events.ts:27`).

**Cost/risk.** Trivial. **Verification.** Test that a failing listener's event names its owner.

## Not checked / uncertainties

- I did not read BEH-BR-301-312 or the hook implementation line by line (`hooks.ts`, 466 lines); hook findings rely on type signatures and behaviour headings.
- I did not verify durable-bus order guarantees (BEH-DB-xxx) or event-store projection ordering, nor `references/mcp` pipeline behaviour; only grep-level checks.
- BEH-BR-146 (cited in EV-11 as the realm answer to `global`) was not opened; treat as an unverified pointer.
- EV-07 and EV-12 are inferred from code behaviour, not from a failing test; no prototype tests were run.
- Whether `Event.make` ids are used with more than one dispatcher in the prototype's tests was not counted.
