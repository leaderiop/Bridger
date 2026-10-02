# User Requirements

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-URS                                                  |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | User Requirements Specification                              |
> | Change History | 0.5 (2026-10-02): G11 closed by ADR-BR-038 (CCR-BR-006)<br>0.4 (2026-10-02): G11 extended and G13 recorded from the GxP prototype (CCR-BR-005)<br>0.3 (2026-10-02): G10–G12 recorded from the host-core prototype (CCR-BR-004)<br>0.2 (2026-10-02): Open items G2–G4 closed by the Effect API prototype; G9 added (CCR-BR-003)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## 1. Purpose

This document states what users need from Bridger's plugin runtime
(`@bridger/core`), in their terms. The [behaviours](./behaviors/01-plugin-definition.md)
state how the library is to satisfy those needs, in the library's terms. Every
requirement here traces forward to at least one behaviour in
[§6](#6-traceability).

The prototype checks cited in §7 confirm facts about the Effect platform, not behaviour of Bridger; they are not evidence for any requirement.

These requirements are written **prospectively**, before any implementation
exists, from the design in `docs/SPEC.md` and from the GxP obligations a
regulated user of the library carries. That direction has the opposite weakness
to qadi's retroactive requirements: they describe intent, not proven behaviour.
Nothing here is evidence that the library does anything. [§7](#7-known-gaps-and-open-items)
records what is still undecided.

### 1.1 Scope

| Allocation | What |
| ---------- | ---- |
| **Core** (`@bridger/core`) | Installing, activating, replacing and removing plugins at runtime; dependency ordering; leases; failure and health; configuration decoding; observation; attributable operations; the `AuditSink` and `OperationGate` ports; deterministic time and identifiers |
| **Companion** (`@bridger/gxp`, specified later in `references/gxp/`) | A durable audit-trail adapter contract; approval and electronic-signature flows through `OperationGate`; IQ/OQ evidence generated from executed tests |
| **Consumer** (the regulated user's system) | Authentication and identity binding; audit storage, retention, protection, review and archival; clock synchronisation; system validation (IQ/OQ/PQ); procedures, training, periodic review; security of the process |
| **Out of scope** | Fetching, verifying or sandboxing plugin code; domain models; HTTP, UI or CLI integration; compensation of external effects |

Bridger runs plugins; it does not authenticate, persist, or validate. A library
cannot be validated on its own: validation is an activity a regulated user
performs on a computerized system that includes it. See
[ADR-BR-028](./decisions/028-gxp-scope.md) and the
[regulatory scope](./gxp/01-regulatory-scope.md).

## 2. User groups

| Group | Needs |
| ----- | ----- |
| **Application developer** | Install, use and observe plugins without ordering providers by hand |
| **Plugin author** | Declare typed dependencies, configuration and health; write teardown that is safe |
| **Operator / administrator** | Change the running plugin set safely; diagnose stalls and failures; shut down with a report |
| **QA / validation lead** | See who changed what, when and why; know which compliance obligations the library supports and which remain the system's; obtain evidence that was produced by executed tests |
| **Test author** | Drive the host deterministically, including time, identifiers and injected faults |

## 3. Functional requirements

### URS-BR-001: Install plugins at runtime without ordering providers

An application must be able to install plugins in any order while it runs, and
have each start as soon as what it needs is available.

Rationale: manual ordering is the step that gets wrong first when the plugin
set changes at runtime.

### URS-BR-002: Remove or replace a plugin safely while it is in use

An operator must be able to remove or replace a plugin while other plugins and
calls depend on it, without those dependents observing a closed provider.

Rationale: a runtime that can add but not safely remove is a runtime that must
be restarted for every change.

### URS-BR-003: Catch undeclared dependencies at compile time

A plugin author must learn at compile time that a plugin uses a service it did
not declare.

Rationale: a dependency discovered at runtime is discovered in production.

### URS-BR-004: Know why a plugin is not running

An operator must be able to see, for every installed plugin, its state and the
reason it is not active: which services are missing, or in which phase it
failed.

### URS-BR-005: Never lose a provider in the middle of a call

A call that has started using a service must not see that service close
underneath it, and a call that never ends must not block removal forever.

### URS-BR-006: Recover from failure explicitly and never silently

A failed plugin must stay failed until someone acts, so that repeated side
effects of a failing start are visible rather than retried away.

### URS-BR-007: Configure plugins safely including secrets and live changes

A plugin author must receive configuration checked against its schema before the plugin starts,
secrets must never appear in observable output, and settings declared as live
must change without a restart.

### URS-BR-008: Shut down with a report of what failed

Shutting down must stop everything in a safe order and report every cleanup
that failed and every lease that had to be revoked.

### URS-BR-009: See plugin lifecycle in existing tracing logs and metrics

Lifecycle transitions must appear in the application's existing Effect tracing,
logs and metrics, with plugin identity attached.

### URS-BR-010: Detect a plugin that waits forever

A plugin that waits for a provider that never arrives must be reported, not
left as a silent hang.

### URS-BR-011: Run the same plugin once per tenant or database

An application must be able to run the same plugin definition more than once,
each instance resolving its own copy of selected services.

### URS-BR-012: Use a dependency when it is present without requiring it

A plugin must be able to use a service if it is available, and react when it
appears or disappears, without failing to start when it is absent.

### URS-BR-013: Exchange typed events between plugins

Plugins must be able to publish and handle events whose arguments, results and
errors are checked at compile time, with listeners removed automatically when
their plugin stops.

### URS-BR-014: Contribute to a shared extension point safely

Several plugins must be able to add entries to one shared registry, and each
plugin's entries must disappear when it stops without disturbing the others.

### URS-BR-015: Switch several behaviours atomically

An application must be able to replace a set of related behaviours so that no
call ever observes a mixture of old and new.

### URS-BR-016: Drive the plugin set from a declarative list

An operator must be able to state the desired plugin set as data and have the
host converge on it repeatedly with the same result.

### URS-BR-017: Bind sub-plugins to the lifetime of a parent

A plugin must be able to start sub-plugins that are removed when it stops.

### URS-BR-018: Host plugins from code that does not use Effect

An application written without Effect (a React client, a script) must be able
to create, use and shut down a host and receive its shutdown report.

### URS-BR-019: Test plugin lifecycles deterministically with injected faults

A test author must be able to step the host, control time and identifiers, and
inject build, stop, lease and runtime faults.

### URS-BR-020: Load plugin definitions dynamically while running

An application must be able to install a definition produced by a dynamic
import at any time, with the host making no assumption about where it came
from.

### URS-BR-021: Know who changed the plugin set when and why

A QA lead must be able to attribute every change to the running plugin set to
an actor, a time and, where required, a reason.

Rationale: ALCOA+ *Attributable* and *Contemporaneous*; 21 CFR 11.10(e); EU GMP
Annex 11 §9.

### URS-BR-022: Obtain a complete ordered and gap-detectable lifecycle record

A QA lead must receive, for every change, a record of the request and of its
outcome, in an order that cannot be confused, with gaps detectable.

Rationale: ALCOA+ *Complete* and *Consistent*. A trail with silent holes cannot
be reviewed.

### URS-BR-023: Prevent a change that cannot be recorded

When a change cannot be recorded, it must not happen.

Rationale: a change made while the trail is unavailable is a change nobody can
later reconstruct.

### URS-BR-024: Require approval before a regulated change

A regulated user must be able to require an approval, or an electronic
signature, before a lifecycle change proceeds, with no path around it through
the host.

Rationale: 21 CFR 11.10(f)–(g), 11.50, 11.70 (approval and signature
manifestation themselves belong to the companion and the consumer).

### URS-BR-025: Generate qualification evidence from executed tests

A validation lead must be able to obtain operational-qualification evidence that
was produced by tests that actually ran against the installed package.

Rationale: the qadi predecessor shipped qualification steps that were
`typeof x === "function"` checks; evidence that does not test is a liability.

### URS-BR-026: Know which compliance obligations remain mine

A QA lead must be able to see, clause by clause, what the library supports,
what the companion supports and what remains the regulated system's
responsibility.

### URS-BR-027: Reproduce time and identifiers during validation

A validation lead must be able to run the host with controlled time and
identifiers, so that executed tests are reproducible.

### URS-BR-028: Know which plugin version was active at any time

A QA lead must be able to establish, from the record, which definition version
and digest of each plugin was active over any period.

## 4. Non-functional requirements

### NFR-BR-001: Determinism

Given the same inputs, `Clock` and `IdGenerator`, the host produces the same
snapshots, events and audit records.

### NFR-BR-002: Type safety

Plugin dependencies, configuration, event payloads and errors are expressed in
types, and illustrative examples in this specification compile once code exists.

### NFR-BR-003: Coverage

Line and branch coverage of `packages/core` at or above 95% once code exists.

### NFR-BR-004: Executable documentation examples

Every example marked runnable compiles in the merge gate once code exists; until
then all examples are marked illustrative.

### NFR-BR-005: Specification integrity

The specification passes `scripts/verify-traceability.sh --strict`.

### NFR-BR-006: Runtime dependency on effect only

`@bridger/core` has a single runtime dependency, `effect`.

### NFR-BR-007: Bounded memory

Every buffer the host owns is bounded or released: the event buffer, retired
generations, drained registries and removed plugins' state.

### NFR-BR-008: Mutation testing

Mutation score at or above 80% on `packages/core` and, when it exists, on
`packages/gxp`.

## 5. Assumptions

| # | Assumption |
| - | ---------- |
| A1 | Plugins are trusted code running in the host's process. Bridger provides no sandbox. |
| A2 | The consumer authenticates users and binds them to an `Actor` before calling the host. |
| A3 | The consumer's clock is synchronised to a trusted time source. |
| A4 | The consumer stores, protects, retains and reviews audit records that an `AuditSink` receives. |
| A5 | Effect 4.x behaves as documented; Bridger's guarantees are no stronger than the Effect runtime's. |
| A6 | Each regulated user validates the computerized system that includes Bridger; this specification is input to that validation, not a substitute for it. |

## 6. Traceability

Behaviours are cited by file; individual `BEH-BR` identifiers are listed in
[the traceability matrix](./traceability.md).

| Requirement | Behaviours | Invariants |
| ----------- | ---------- | ---------- |
| URS-BR-001 | [03](./behaviors/03-installation.md), [05](./behaviors/05-activation.md) | INV-BR-001, INV-BR-002, INV-BR-003 |
| URS-BR-002 | [06](./behaviors/06-removal.md), [07](./behaviors/07-replacement-and-reactivation.md), [08](./behaviors/08-operation-legality.md) | INV-BR-005, INV-BR-009, INV-BR-011 |
| URS-BR-003 | [01](./behaviors/01-plugin-definition.md) | INV-BR-015 |
| URS-BR-004 | [04](./behaviors/04-states-and-snapshots.md), [13](./behaviors/13-observability-and-diagnostics.md) | INV-BR-008 |
| URS-BR-005 | [09](./behaviors/09-leases.md) | INV-BR-006, INV-BR-016, INV-BR-017 |
| URS-BR-006 | [07](./behaviors/07-replacement-and-reactivation.md), [10](./behaviors/10-runtime-failure-and-health.md) | INV-BR-007 |
| URS-BR-007 | [11](./behaviors/11-configuration.md) | INV-BR-013 |
| URS-BR-008 | [12](./behaviors/12-shutdown-and-hosting.md) | INV-BR-018 |
| URS-BR-009 | [13](./behaviors/13-observability-and-diagnostics.md) | INV-BR-008 |
| URS-BR-010 | [13](./behaviors/13-observability-and-diagnostics.md) | — |
| URS-BR-011 | [17](./behaviors/17-realms-and-interception.md) | INV-BR-001, INV-BR-020 |
| URS-BR-012 | [15](./behaviors/15-optional-and-reactive.md) | INV-BR-019 |
| URS-BR-013 | [16](./behaviors/16-event-bus.md) | — |
| URS-BR-014 | [19](./behaviors/19-contribution-registry.md) | INV-BR-017 |
| URS-BR-015 | [20](./behaviors/20-generation.md) | INV-BR-017 |
| URS-BR-016 | [18](./behaviors/18-reconciliation-and-confluence.md) | INV-BR-021 |
| URS-BR-017 | [14](./behaviors/14-children-and-groups.md) | INV-BR-005 |
| URS-BR-018 | [12](./behaviors/12-shutdown-and-hosting.md), [02](./behaviors/02-host-construction.md) | INV-BR-018 |
| URS-BR-019 | [21](./behaviors/21-testing-host.md) | INV-BR-024 |
| URS-BR-020 | [01](./behaviors/01-plugin-definition.md), [03](./behaviors/03-installation.md) | INV-BR-012 |
| URS-BR-021 | [22](./behaviors/22-attributable-operations.md), [23](./behaviors/23-audit-sink-and-record.md) | INV-BR-025 |
| URS-BR-022 | [23](./behaviors/23-audit-sink-and-record.md), [24](./behaviors/24-time-ids-and-sequence.md) | INV-BR-022, INV-BR-023 |
| URS-BR-023 | [23](./behaviors/23-audit-sink-and-record.md) | INV-BR-027, INV-BR-029 |
| URS-BR-024 | [25](./behaviors/25-operation-gate.md) | INV-BR-026, INV-BR-027 |
| URS-BR-025 | [21](./behaviors/21-testing-host.md); [validation plan](./gxp/04-validation-plan.md) (companion) | — |
| URS-BR-026 | [compliance matrix](./gxp/02-compliance-matrix.md) | — |
| URS-BR-027 | [24](./behaviors/24-time-ids-and-sequence.md), [21](./behaviors/21-testing-host.md) | INV-BR-024 |
| URS-BR-028 | [23](./behaviors/23-audit-sink-and-record.md), [04](./behaviors/04-states-and-snapshots.md) | INV-BR-022 |
| NFR-BR-001 | [24](./behaviors/24-time-ids-and-sequence.md), [21](./behaviors/21-testing-host.md) | INV-BR-024 |
| NFR-BR-002 | [01](./behaviors/01-plugin-definition.md), [16](./behaviors/16-event-bus.md) | INV-BR-015 |
| NFR-BR-003 | [Definitions of Done](./process/definitions-of-done.md) | — |
| NFR-BR-004 | [Definitions of Done](./process/definitions-of-done.md) | — |
| NFR-BR-005 | [Definitions of Done](./process/definitions-of-done.md) | — |
| NFR-BR-006 | [ADR-BR-001](./decisions/001-effect-v4-as-effect-system.md) | — |
| NFR-BR-007 | [13](./behaviors/13-observability-and-diagnostics.md), [20](./behaviors/20-generation.md) | INV-BR-017 |
| NFR-BR-008 | [Definitions of Done](./process/definitions-of-done.md) | — |

## 7. Known gaps and open items

| # | Item | Status |
| - | ---- | ------ |
| G1 | No implementation exists. Every requirement is unverified. | Open — by design of this phase ([ADR-BR-036](./decisions/036-prospective-specification.md)) |
| G2 | Per-subscriber lag behaviour of a sliding `PubSub` in Effect 4.x. | Closed (CCR-BR-003): lag is per subscriber — a slow subscriber loses only its own oldest messages, a fast one loses nothing, and publishing never blocks. Platform fact confirmed by prototype checks E1a–E1c in `prototypes/effect-v4-api` (effect 4.0.0, Node 22; see its `RESULTS.md`) |
| G3 | Whether `Layer.effectContext` (used by `Plugin.fromEffect`) exists in Effect 4.x. | Closed (CCR-BR-003): it exists, lifts an `Effect<Context>` into a `Layer`, and releases scoped resources with the build scope. Prototype checks E2a–E2b |
| G4 | How to force a `ManagedRuntime` layer build without running an effect. | Closed (CCR-BR-003): `runtime.context()` forces the build without running an effect, caches it, and rejects when the layer fails. Prototype checks E3a–E3e |
| G5 | A changed service *shape* under an unchanged `ServiceId` cannot be detected by the core. | Residual risk (RSK-BR-010); mitigated by the versioned-identifier convention |
| G6 | A re-entrant wait that passes through another fiber cannot be detected. | Residual risk (RSK-BR-011); bounded by drain limits |
| G7 | Independent review of this specification is not yet possible (single maintainer). | Open — see [change control](./process/change-control.md) §5 |
| G8 | The `@bridger/gxp` companion is not yet specified. | Planned — `references/gxp/` |
| G10 | The `IdentifiersOf` helper as first written yields `unknown` for an empty tuple, so a plugin that provides nothing could not type-check. | Closed (CCR-BR-004): made distributive in BEH-BR-002; found by the compiler in `prototypes/host-core` |
| G11 | A system-initiated stop of a dependent (its provider is being removed) can meet an operator operation already in flight on that dependent; the specification ordered operations per plugin but did not say how a stop that crosses plugins is ordered against them. | Closed by [ADR-BR-038](./decisions/038-cross-plugin-stop-ordering.md) and BEH-BR-078–080 (CCR-BR-006): no host-wide order; waits run only from a provider to its dependents; a cascade waits for a dependent's step, never its operation, and ends a parked intent rather than completing it; `WouldDeadlock` is decided before any wait. The host-core prototype replaced its host-wide lock with per-plugin admission and confirmed the rule (scenarios for acceptance checks 43–45) |
| G12 | How a forced removal revokes a scoped `lease()` was unspecified. | Closed (CCR-BR-004): it interrupts the acquiring fiber (BEH-BR-086) |
| G13 | Whether acknowledging the audit latch needs only a writable sink or a drained backlog. | Closed (CCR-BR-005): a drained backlog (BEH-BR-206); found by the GxP prototype in `prototypes/host-core` |
| G9 | A naive supervised child (`forkChild` + `join` inside the lease) releases the lease before the child's finalizers run when the caller is interrupted, which would break BEH-BR-084. | Design constraint recorded (CCR-BR-003): the implementation interrupts and awaits the child before release; prototype checks E7a–E7b show the failure and the fix |

---

_Next: [Behaviours](./behaviors/01-plugin-definition.md)_
