# ADR-BR-026: A deterministic test host is part of the core contract

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-026                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-03): `step` advances one pending item; checks concerning `Bridger.make` are exempt (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

Most of what the core promises is about interleavings: a removal racing a replace, a lease held across a drain limit, a build that settles after its target changed, a health check in flight when the plugin leaves `active`. Tests that drive the real host with real time can reach these only by sleeping and hoping the scheduler cooperates, which yields slow tests that pass on a developer's machine and fail in CI, or pass while never reaching the interleaving they name.

Plugin authors face the same problem one level up: they need to show that their plugin survives a provider leaving, a build failure, a forced revocation. And a regulated user qualifying a system that embeds Bridger needs scripted scenarios whose outcome is the same on every run ([ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)).

## Decision

`@bridger/core/testing` *(Planned)* is part of the core's public contract, versioned and released with `@bridger/core`. It provides `TestHost`:

- **The same machine.** `TestHost` runs the production reconciler, operation table and lease machinery; it differs only in how the reconciler is driven and in the services it is given. A test host with its own lifecycle logic would prove properties of a different machine.
- **Steppable reconciler.** `step` advances one pending item (a transition step or a wait) to its next settlement point; `stepPlugin` and `pending` choose among them; `runUntilIdle` runs to idle (BEH-BR-178). A test can stop between "removal began" and "dependent stopped" and assert on the snapshot there.
- **Test time and identifiers.** Time comes from `TestClock`, so timeouts (`buildTimeout`, `drainTimeout`, `stallWarning`, `auditTimeout`) fire when the test adjusts the clock. `IdGenerator` yields a counter sequence ([ADR-BR-025](../decisions/025-deterministic-time-and-ids.md)).
- **Injectable faults.** `Fault.buildFails(id)`, `Fault.stopFails(id)`, `Fault.holdLease(id)` and `Fault.runtimeFailure(id)` produce build failures, cleanup failures, stuck leases and runtime failures without writing a misbehaving plugin for each.
- **Acceptance checks.** The required behaviours listed in SPEC.md "Testing the core" — every row of the operation table, drain and force, `WouldDeadlock`, sticky failure, configuration, shutdown reports, registry and generation drains, children, optional dependencies, events, realms, reconcile, hosting — are written against `TestHost`, except those that concern `Bridger.make` itself (BEH-BR-183), and they are the core's acceptance tests.

## Alternatives considered

- **Test the real host with real time.** Rejected: interleavings become probabilistic and timeouts cost wall-clock seconds; a suite that sleeps is a suite people skip.
- **A separate testing package versioned independently.** Rejected: a test host that drifts from the core it imitates would let consumers pass tests against behaviour the core no longer has. Publishing both from one version line keeps them the same machine.
- **Mocks of `Host` for plugin authors.** Rejected: a mock reproduces the author's belief about the host, not the host. Plugin tests against `TestHost` exercise the real ordering and drain rules.
- **Internal-only test utilities.** Rejected: plugin authors and regulated users need the same determinism the core's own tests need, and the cost of publishing it is the cost of keeping it honest.

## Consequences

**Positive**:

- Races and timeouts are tested deterministically and quickly, by the core and by plugin authors.
- The test host is a public artifact whose behaviour is itself covered by the core's suite, so a regulated user's scripted scenarios run against a specified component rather than an ad hoc harness.

**Negative**:

- `TestHost`, `step` and `Fault.*` become public API under semantic versioning; changing them is a breaking change for consumers' test suites.
- Stepping exposes intermediate states that production callers never synchronise on; a test that asserts on them is coupled to the reconciler's granularity.
- A deterministic scheduler does not reproduce real concurrency; properties that depend on true parallelism (for example a sink slower than `auditTimeout` under load) still need tests outside `TestHost`.

**Trade-off accepted**: a larger public surface and a versioning obligation on test utilities, in exchange for deterministic, fast evidence that the real machine handles each race and fault.

## References

- Behaviours: [21 — Testing host](../behaviors/21-testing-host.md), [08 — Operation legality](../behaviors/08-operation-legality.md), [24 — Time, ids and sequence](../behaviors/24-time-ids-and-sequence.md)
- Invariants: [INV-BR-011](../invariants.md#inv-br-011-every-state-and-operation-pair-has-a-defined-outcome), [INV-BR-024](../invariants.md#inv-br-024-time-and-identifiers-come-only-from-services)
- Requirements: [URS-BR-019](../urs.md#urs-br-019-test-plugin-lifecycles-deterministically-with-injected-faults), [URS-BR-025](../urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
- Decisions: [ADR-BR-013](../decisions/013-total-operation-legality.md), [ADR-BR-025](../decisions/025-deterministic-time-and-ids.md), [ADR-BR-035](../decisions/035-evidence-from-executed-tests.md)
- GxP documents: [../gxp/04-validation-plan.md](../gxp/04-validation-plan.md)
- Source: `docs/SPEC.md` — "Testing the core"
