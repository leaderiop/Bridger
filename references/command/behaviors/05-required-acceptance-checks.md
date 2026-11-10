# 05 — Required Acceptance Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-05                                            |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-10): Check 6 compares the actor and annotations of offered call-log entries and hook inputs with a context supplied only in `options.context` (H9) (CCR-CM-005)<br>0.6 (2026-11-09): Specification audit of 2026-11-09 — check 14 covers receipt partitions, the `services` each port call receives, a dispatch inside a durable-bus subscription's transaction and `retryable` typed errors (M-04, ERP alignment); check 18 covers `retryable` validation and digest; new check 19 and REQ-CM-019 for admission policies (C-10) (CCR-CM-004)<br>0.5 (2026-11-08): Checks 13–17 follow the resolutions of the round-2 agent review: read-only exemption from the floor, receipt digest, actor-first comparison, mode, expiry and `void`, call-log kind of a step-7 refusal, batch admission phases, compensation approvals, long items refused, keyed tasks, `CommandTaskStore` and lost tasks (BEH-CM-054) (CCR-CM-003)<br>0.4 (2026-11-08): Check 15 covers "dispatch" entries for executed and replayed dispatches (BEH-CM-015) (CCR-CM-003)<br>0.3 (2026-11-08): Checks 5, 6 and 8 follow the new step order, core `CurrentCorrelation` and core 31's phases and targets; checks 14–18 for receipts, wrappers and breakers, batches, tasks, typed metadata and the envelope (CCR-CM-003, round 2: recheck items 1–8, 10)<br>0.2 (2026-11-08): Checks for served calls, approval binding, wrappers, supplied schemas and the taint floor (check 13); core `TestHost.scriptedGateOf` used (CCR-CM-002)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

---

The checks every implementation of `@bridger/command` must pass before any
behaviour of this companion may be cited as evidence
([ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)).
They run on core's `TestHost` with its `counterIdGenerator` and `TestClock`,
and with core's scripted gate fixture `TestHost.scriptedGateOf<CommandRequest>`
(core BEH-BR-182) as the `CommandGate` (the package exports no gate), so that
every check is deterministic. This file owns BEH-CM-033–040
and uses 033; 034–040 are reserved.

Planned tests: `packages/command/test/*.test.ts` *(Planned)*.

## BEH-CM-033: Required acceptance checks

> **See:** [ADR-CM-001](../decisions/001-commands-are-contributions.md), [ADR-CM-002](../decisions/002-catalog-not-rules.md), [ADR-CM-003](../decisions/003-toolset-is-a-generation.md), [ADR-CM-004](../decisions/004-json-schema-from-encoded-side.md), [ADR-BR-026](../../core/decisions/026-deterministic-test-host.md)
> **Core seam:** [21 — Testing host](../../core/behaviors/21-testing-host.md)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package test suite MUST contain at least one test for each
             of the following:
             1. `Command.make` is pure; invalid ids and tags are defects;
                tags are normalised; `regulated` defaults to false.
             2. Labels change nothing but the default selector: the same
                dispatch order, timeout and error mapping for regulated and
                unregulated commands; labels reach gate and hook inputs.
             3. `contribute`: a duplicate id fails with
                `DuplicateContribution`; an unprojectable schema registers
                nothing; the handler runs with the contributor's context,
                served with the dispatch's actor and annotations (a nested
                dispatch and a host call from the handler keep the outer
                taint and actor, with `onBehalfOf` the contributor);
                the entry leaves the catalog when the scope closes; registry
                access rules of core file 28 refuse a contribution.
             4. The catalog exposes no handler (type-level test plus a
                runtime walk of every exported value); views are ordered by
                id, revisioned and observable; digests are stable across
                processes and exclude `owner`.
             5. Dispatch runs its eight steps in order: a failure at each
                step runs no later step (one test per step); steps 1–6 run
                no handler code; an `expectDigest` that differs fails with
                `ToolChanged` at step 1.
             6. Attribution: actor resolution as BEH-BR-187; `onBehalfOf`
                taken from the dispatching fiber's plugin principal and
                absent without one; annotations reach gate,
                hooks, handler and call log unchanged, and a supplied
                context cannot remove a monotonic key; a nested dispatch, a
                host call and a hook call made during the dispatch carry the
                outer correlation through core's `CurrentCorrelation`; a
                correlation set on the dispatching fiber is used when none
                is supplied; generated correlation ids come from
                `IdGenerator`; for a dispatch from a fiber with no actor and
                no annotations, given its actor and annotations only in
                `options.context`, the actor and "callLog" annotations of
                every entry it offers ("refusal" and "dispatch") equal
                those of `options.context`, and the `before` and `after`
                hooks receive its annotations (BEH-CM-010, BEH-CM-015).
             7. Gate: consulted once per dispatch and never cached; Refuse,
                Defer (no handler run; typed `CommandDeferred`), defect and
                timeout as refusals; an approved draft is re-dispatched
                through every step; an `ApprovalRef` for another digest fails
                with `ToolChanged` and one for another input fails with
                `ApprovalMismatch` before the gate; gate wrappers apply in
                order over the `CommandGate` (or none) and no plugin can
                change them.
             8. Hooks: enrichers run before vetoes and a veto sees their
                values; the handler receives the enrichments beside its
                input, never merged into it; a veto ends the dispatch with
                `CommandVetoed` naming cause, hook and code; a policy deny,
                a failing `before` hook under "deny", a dormant veto that
                cannot be woken and a dispatch without a host link each end
                with their cause; a contribution targets commands by id,
                tag and tag prefix and is "not-targeted" elsewhere; roles
                outside a point's roles are refused before `who`; an
                `after` hook failure changes no outcome; hook inputs carry
                no output value.
             9. Lease and timeout: removal waits for a running handler and
                revokes at `drainTimeout`; a remove-and-re-contribute race
                between steps 1 and 6 fails with `ToolChanged`; the
                smallest of the three bounds applies; `CallLog` reports
                carry no values and its failure changes nothing.
             10. Toolsets: published only when the fingerprint changes; one
                 generation per (actor id, selector name); a pin keeps its
                 value across publications; publishing never interrupts a
                 pin; pinned dispatch fails with `ToolNotInToolset`,
                 `ToolChanged` or `CommandNotFound` as specified.
             11. Order and selection: toolset order equals id order for
                 random contribution, activation and priority orders
                 (property test); the default selector excludes regulated
                 commands; a throwing selector keeps the current toolset; a
                 toolset member is still refused by the gate.
             12. Projection: 2020-12 `$schema`; object roots; encoded side;
                 refusal names the offending path; recursion via `$defs`;
                 byte-stable output across two processes; labels never in
                 the schema; no `default` or `examples` for redacted fields;
                 a supplied document replaces the projection, is digested,
                 and is refused for another dialect, a non-object root or a
                 label keyword.
             13. Taint floor: for every combination of taint, effective gate
                 (none, Allow, Refuse, Defer), approval and draft source, the
                 outcome is the table of BEH-CM-016 (property test); a
                 tainted request with no gate wired never runs its handler;
                 a failing draft source or a malformed draft refuses with
                 "gate-defect"; no option turns the floor off; a tainted
                 request of a command declared `readOnly` keeps the gate's
                 decision (allowed with no gate), its nested dispatches
                 stay tainted, and `taintFloor.readOnly: "floor"` applies
                 the floor to it; a batch item or a compensation never
                 calls `draftFor`.
             14. Receipts: a key reaches the request, the hook inputs, the
                 handler context and core's call-log entries of the
                 handler's calls; a completed receipt returns the stored
                 outcome without running the handler (success and typed
                 error); another actor (whatever the input), input,
                 definition digest or mode, an in-flight claim and a
                 missing port fail with `IdempotencyConflict` with the
                 reasons of BEH-CM-041; a repeated keyed task returns the
                 same `CommandTaskRef`; a typed failure is completed
                 outside the wrappers and survives a rolling-back
                 transaction wrapper; a claim is released on every end
                 other than its completed outcome, including a wrapper
                 failure after `complete`; an `InFlight` claim past
                 `expiresAt` is taken over and the superseded ticket's
                 `complete` fails; a nested dispatch without a key logs
                 no outer key; the gate is consulted again on a repeat;
                 one key in two partitions names two receipts, and an
                 invalid or throwing `receiptPartition` refuses with
                 "receipts-unavailable"; each port call receives only the
                 `receiptContext` keys of the dispatching fiber, and a
                 `Success` completion also the wrapper chain's services; a
                 dispatch from a durable-bus subscription handler whose
                 transaction wrapper joins the inbox's `StoreTransaction`
                 leaves no receipt after a rolled-back delivery
                 (`TestStore.conflictAtCommit`, durable-bus) and its retry
                 claims `Fresh`; a typed error listed in `retryable` is
                 released, never stored, and the next claim runs the
                 handler again.
             15. Wrappers, call log and breaker: wrappers apply outermost
                 first, fixed at layer build, `applies` filters them, only
                 `provides` keys reach the handler, a wrapper cannot turn a
                 failed run into a success, and a wrapper failure is
                 `CommandWrapperFailed`; refusals are offered once as
                 "refusal" entries (also a step-7 end before the handler
                 was called), and executed and replayed dispatches
                 once as "dispatch" entries with the command id, digests,
                 idempotency key, `replayed` and the outcome mapping of
                 BEH-CM-015, through the attached host, and an offer
                 failure changes nothing; the breaker opens after the
                 counted errors within the window, answers
                 `CommandBreakerOpen`, half-opens after the cooldown with one
                 probe, ignores typed errors and pre-step-7 failures, and
                 keys by command or owner (on `TestClock`).
             16. Batches: no handler runs before every item is admitted
                 (property test over item outcomes); a later refusal wins
                 over an earlier deferral; a deferred, refused or vetoed
                 batch holds no receipt claim and no probe slot, and its
                 approved re-dispatch with the same keys runs; a deferred
                 batch yields one draft of every request with each planned
                 compensation and no single-item floor draft; an approved
                 batch is bound per item, compensation digest included; a
                 stale draft fails with `CommandDraftStale` and runs
                 nothing; a `long` item is refused; a failure undoes
                 earlier items by an atomic wrapper or by compensations in
                 reverse, read-only items need none, replayed items are
                 listed as not undone, undone items' receipts are voided
                 so a retry runs them again, a tainted approved batch's
                 compensations carry the derived `ApprovalRef` and are
                 allowed by a gate that accepts it, reporting
                 `CommandBatchRolledBack` or `CommandBatchPartial`, never
                 retrying an undo.
             17. Tasks: a long command returns a `CommandTaskRef` after
                 admission and errors of steps 1–6 reach the caller; the
                 task holds the lease, applies the timeout and publishes a
                 terminal snapshot; revisions never regress; progress is
                 rate-limited per clock millisecond; `await` and its timeout;
                 `cancel` awaits finalizers, is a no-op on a terminal task,
                 and caller interruption after `start` does not cancel;
                 closing the layer cancels running tasks; snapshots go to
                 the `CommandTaskStore` before the feeds; a store holding a
                 `running` record at layer build yields `failed` /
                 `TaskLost` and releases its receipt; a string dispatch is
                 told apart by the descriptor's `long`.
             18. Metadata and envelope: id and tag grammars (mixed case,
                 `.`, `:`; case-only duplicates refused); typed metadata on
                 descriptors, requests, hook targets and digests;
                 `retryable` validated, sorted on the descriptor and
                 digested only when non-empty;
                 untrusted output paths computed and digested, never in the
                 schema; the envelope replaces untrusted values in document
                 order, caps its size deterministically and never splits a
                 surrogate pair.
             19. Admissions: fixed at layer build with unique names;
                 consulted after the claim and the breaker, in order, only
                 where `applies` holds; never consulted for a replayed
                 outcome or a repeated keyed task; `Refuse` ends with
                 `CommandRefused` and its reason, an invalid reason, a
                 dying or slow `admit` with "admission-unavailable"; a
                 refusal releases a fresh claim, returns a probe slot,
                 settles earlier admissions `NotRun`, is not counted by
                 a breaker and is offered as a "refusal" entry; `settle`
                 is called once, uninterruptibly, after step 7 and outside
                 the wrappers, with the outcome mapping of BEH-CM-015 or
                 `NotRun`, and its scope closes after it; a failing
                 `settle` changes nothing; batch items and tasks are
                 settled as BEH-CM-049, BEH-CM-050 and BEH-CM-052 state.
```

| REQ | Check | Behaviours | Status |
| --- | ----- | ---------- | ------ |
| REQ-CM-001 | 1. Pure command values; id and tag rules | [BEH-CM-001](./01-command-definition.md#beh-cm-001-a-command-is-a-value-with-an-id-and-schemas) | Not run |
| REQ-CM-002 | 2. Labels carried, not interpreted | [BEH-CM-002](./01-command-definition.md#beh-cm-002-tags-and-the-regulated-label-are-carried-not-interpreted) | Not run |
| REQ-CM-003 | 3. Scope-bound contribution | [BEH-CM-003](./01-command-definition.md#beh-cm-003-a-handler-is-contributed-for-the-lifetime-of-a-scope) | Not run |
| REQ-CM-004 | 4. Descriptors only; ordered views; stable digests | [BEH-CM-004](./01-command-definition.md#beh-cm-004-the-catalog-exposes-descriptors-never-handlers), [BEH-CM-005](./01-command-definition.md#beh-cm-005-a-descriptor-digest-identifies-a-definition) | Not run |
| REQ-CM-005 | 5. Fixed dispatch order; typed outcomes | [BEH-CM-009](./02-dispatch.md#beh-cm-009-one-dispatch-path-in-a-fixed-order), [BEH-CM-014](./02-dispatch.md#beh-cm-014-every-outcome-has-a-tag) | Not run |
| REQ-CM-006 | 6. Principal and context resolution | [BEH-CM-010](./02-dispatch.md#beh-cm-010-the-principal-and-context-of-a-dispatch) | Not run |
| REQ-CM-007 | 7. Command gate | [BEH-CM-011](./02-dispatch.md#beh-cm-011-the-command-gate-allow-refuse-or-defer) | Not run |
| REQ-CM-008 | 8. Hook points | [BEH-CM-012](./02-dispatch.md#beh-cm-012-hook-points-around-the-handler) | Not run |
| REQ-CM-009 | 9. Lease, timeout and call log | [BEH-CM-013](./02-dispatch.md#beh-cm-013-the-handler-runs-under-a-lease-bounded-by-a-timeout), [BEH-CM-015](./02-dispatch.md#beh-cm-015-each-dispatch-is-reported-to-the-call-log-not-to-the-audit-sink) | Not run |
| REQ-CM-010 | 10. Toolset generations and pins | [BEH-CM-017](./03-toolsets.md#beh-cm-017-a-toolset-is-an-immutable-ordered-value), [BEH-CM-018](./03-toolsets.md#beh-cm-018-a-toolset-per-principal-is-published-as-a-generation), [BEH-CM-019](./03-toolsets.md#beh-cm-019-pinning-a-toolset-for-a-turn) | Not run |
| REQ-CM-011 | 11. Deterministic order; selection; membership grants nothing | [BEH-CM-020](./03-toolsets.md#beh-cm-020-order-depends-only-on-content), [BEH-CM-021](./03-toolsets.md#beh-cm-021-selection-is-the-applications-and-the-default-excludes-regulated-commands), [BEH-CM-022](./03-toolsets.md#beh-cm-022-toolset-membership-grants-nothing) | Not run |
| REQ-CM-012 | 12. JSON Schema projection and supplied documents | [BEH-CM-025](./04-json-schema-projection.md#beh-cm-025-input-and-output-are-projected-to-json-schema-2020-12), [BEH-CM-026](./04-json-schema-projection.md#beh-cm-026-the-encoded-side-is-projected-and-what-cannot-be-described-is-refused), [BEH-CM-027](./04-json-schema-projection.md#beh-cm-027-projection-is-byte-stable), [BEH-CM-028](./04-json-schema-projection.md#beh-cm-028-descriptions-come-from-annotations-and-labels-stay-out-of-the-schema), [BEH-CM-029](./04-json-schema-projection.md#beh-cm-029-a-supplied-json-schema-replaces-the-projection-under-the-same-checks) | Not run |
| REQ-CM-013 | 13. Taint floor | [BEH-CM-016](./02-dispatch.md#beh-cm-016-a-tainted-request-not-declared-read-only-is-never-allowed-on-an-automatic-decision) | Not run |
| REQ-CM-014 | 14. Idempotency key and receipts | [BEH-CM-041](./06-receipts-wrappers-and-breakers.md#beh-cm-041-an-idempotency-key-returns-the-stored-outcome-of-a-completed-dispatch) | Not run |
| REQ-CM-015 | 15. Wrappers, call-log entries and breaker | [BEH-CM-042](./06-receipts-wrappers-and-breakers.md#beh-cm-042-handler-wrappers-are-fixed-when-the-catalog-layer-is-built), [BEH-CM-043](./06-receipts-wrappers-and-breakers.md#beh-cm-043-a-breaker-per-command-or-per-providing-plugin), [BEH-CM-015](./02-dispatch.md#beh-cm-015-each-dispatch-is-reported-to-the-call-log-not-to-the-audit-sink) | Not run |
| REQ-CM-016 | 16. Batches | [BEH-CM-049](./07-batches-and-long-commands.md#beh-cm-049-a-batch-is-admitted-whole-before-any-handler-runs), [BEH-CM-050](./07-batches-and-long-commands.md#beh-cm-050-items-run-in-order-and-a-failure-undoes-the-items-before-it), [BEH-CM-051](./07-batches-and-long-commands.md#beh-cm-051-a-batch-draft-is-approved-all-or-none-and-a-stale-draft-is-re-planned) | Not run |
| REQ-CM-017 | 17. Long commands and tasks | [BEH-CM-052](./07-batches-and-long-commands.md#beh-cm-052-a-long-command-runs-as-a-task), [BEH-CM-053](./07-batches-and-long-commands.md#beh-cm-053-progress-await-and-cancel-of-a-command-task), [BEH-CM-054](./07-batches-and-long-commands.md#beh-cm-054-task-records-are-kept-through-a-store-port-and-a-task-cut-off-by-a-restart-is-reported-lost) | Not run |
| REQ-CM-018 | 18. Typed metadata and the model-facing envelope | [BEH-CM-001](./01-command-definition.md#beh-cm-001-a-command-is-a-value-with-an-id-and-schemas), [BEH-CM-006](./01-command-definition.md#beh-cm-006-typed-metadata-is-carried-digested-and-read-by-the-application), [BEH-CM-030](./04-json-schema-projection.md#beh-cm-030-untrusted-output-fields-and-the-envelope-a-model-reads-them-in) | Not run |
| REQ-CM-019 | 19. Admission policies | [BEH-CM-044](./06-receipts-wrappers-and-breakers.md#beh-cm-044-admission-policies-are-fixed-when-the-catalog-layer-is-built), [BEH-CM-009](./02-dispatch.md#beh-cm-009-one-dispatch-path-in-a-fixed-order) | Not run |

Every `BEH-CM` identifier of this companion appears in at least one row;
BEH-CM-033 is this list itself.

**Settled here.** The gate used in checks 7, 11 and 13 is core's
`TestHost.scriptedGateOf<CommandRequest>` (core BEH-BR-182), which returns a
`Gate<CommandRequest>` and so fits `CommandGate` directly, with no implicit
decision. The package itself ships no gate, not even for tests, so that no
deployment can wire a test gate by accident (core BEH-BR-217 takes the same
line); the earlier Open on a `@bridger/command/testing` gate is closed by
core's generic fixture.

---

_Previous: [04 — JSON Schema projection](./04-json-schema-projection.md)_ · _Next: [06 — Receipts, wrappers and breakers](./06-receipts-wrappers-and-breakers.md)_
