# 05 — Required Acceptance Checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-CM-BEH-05                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Checks for served calls, approval binding, wrappers, supplied schemas and the taint floor (check 13); core `TestHost.scriptedGateOf` used (CCR-CM-002)<br>0.1 (2026-11-08): Initial draft (CCR-CM-001)                 |

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
                step runs no later step (one test per step); steps 1–5 run
                no handler code.
             6. Attribution: actor resolution as BEH-BR-187; `onBehalfOf`
                taken from the dispatching fiber's plugin principal and
                absent without one; annotations reach gate,
                hooks, handler and call log unchanged, and a supplied
                context cannot remove a monotonic key; a nested dispatch
                inherits the outer correlation id through
                `DispatchCorrelation`; generated correlation ids come from
                `IdGenerator`.
             7. Gate: consulted once per dispatch and never cached; Refuse,
                Defer (no handler run; typed `CommandDeferred`), defect and
                timeout as refusals; an approved draft is re-dispatched
                through every step; an `ApprovalRef` for another digest fails
                with `ToolChanged` and one for another input fails with
                `ApprovalMismatch` before the gate; gate wrappers apply in
                order over the `CommandGate` (or none) and no plugin can
                change them.
             8. Hooks: a veto ends the dispatch naming the hook; a failing
                `before` hook denies; an `after` hook failure changes no
                outcome; hook inputs carry no output value.
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
                 "gate-defect"; no option turns the floor off.
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
| REQ-CM-013 | 13. Taint floor | [BEH-CM-016](./02-dispatch.md#beh-cm-016-a-tainted-request-is-never-allowed-on-an-automatic-decision) | Not run |

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

_Previous: [04 — JSON Schema projection](./04-json-schema-projection.md)_
