# ADR-GX-024: Test fixtures are marked and refused by installation checks

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-024                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

The testing entry point provides `memoryTrailStore`, `faultyTrailStore`, `memoryTicketStore`, `memoryAnchorStore`, `scriptedSignatureCapture(decide)` and `testKeyProvider(seed)` ([ADR-GX-003](../decisions/003-ports-without-defaults.md)). Each is a working implementation of a port; wired into production, a memory store loses the trail on restart, a scripted capture approves without a person and a seeded key is known to anyone with the seed (RSK-GX-017). Keeping them in a separate entry point lowers the chance; it does not stop an import. Core keeps its own fixtures in its testing entry point too ([BEH-BR-181](../../core/behaviors/21-testing-host.md), [BEH-BR-182](../../core/behaviors/21-testing-host.md)).

## Decision

- **Every fixture carries a marker.** Each port value built by the testing entry point publishes a `manifest` with `fixture: true` and a `name` beginning "@bridger/gxp/testing/" ([BEH-GX-145](../behaviors/19-testing-entry-point.md)). The marker is a field of the manifest every port already publishes, so the installation checks find it by reading what is wired. No implementation in the main entry point sets it, and a check in the companion's own build fails if a main-entry module imports a fixture.
- **Fixture key ids are recognisable.** `testKeyProvider(seed)` issues key ids that start with `test:`, so every fingerprint made with a test key reads `fp1:hmac-sha256:test:...`. The main entry point's `hmacFingerprinter` fails with "test-key-without-fixture" when a provider whose manifest lacks `fixture: true` answers a `test:` key id ([BEH-GX-106](../behaviors/14-fingerprint-keys.md)).
- **Fixture data is recognisable where the port's shape allows.** Signatures from `scriptedSignatureCapture` carry the method "test-fixture"; fingerprints made with a test key carry a `test:` key id; trail store fixtures declare `commit: "in-memory"` in their manifest ([INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)).
- **IQ refuses.** The installation checks inspect every wired companion port; a port whose manifest carries `fixture: true`, a current key id starting with `test:`, or a capture whose manifest lists the method "test-fixture" makes its check `fail` — IQ-11, a proof, for a marked port or capture, and IQ-15, a probe, for a `test:` key id ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)) — and adds a deviation. There is no option to accept a fixture in IQ.
- **Core fixtures.** The companion's IQ also reports whether an `AuditSink` and an `OperationGate` are wired, through `Host.controls` ([BEH-BR-013](../../core/behaviors/02-host-construction.md)). It detects core's own fixtures only if core marks them; until then that item (IQ-U3) is `not-executed` with the reason "core fixtures carry no marker".

## Alternatives considered

- **Rely on the separate entry point alone.** Rejected: an import is one line, and nothing at runtime would show it.
- **Detect fixtures by class name or `instanceof`.** Rejected: names are minified and classes duplicated across bundles; a manifest field survives both.
- **A registered symbol on the service value.** Rejected: a second, hidden channel beside the manifest every port already publishes; a manifest field is visible to the installation checks and to a reviewer reading the wiring alike.
- **Make fixtures refuse to run when `NODE_ENV=production`.** Rejected: an environment variable is a configuration value, not a check, and it would break tests run in production-like environments.

## Consequences

**Positive**:

- A fixture wired into an installation fails IQ, and fixture data stays recognisable wherever it is stored.
- Tests keep full, working fixtures with no special mode.

**Negative**:

- A user who copies a fixture's code into their own module removes the marker; IQ cannot detect that, and the conformance and code review remain the safeguard.
- Core's fixtures are covered only once core marks them.

**Trade-off accepted**: a marker convention that a determined copy can defeat, in exchange for catching the common accident by check, not by warning.

## References

- Behaviours: [19 — Testing entry point](../behaviors/19-testing-entry-point.md), [15 — Installation checks](../behaviors/15-installation-checks.md)
- Invariants: [INV-GX-001](../invariants.md#inv-gx-001-no-decision-port-has-a-default-outside-the-testing-entry-point), [INV-GX-014](../invariants.md#inv-gx-014-test-fixtures-are-detectable)
- Risks: [RSK-GX-017](../gxp/03-risk-assessment.md#rsk-gx-017)
- Decisions: [ADR-GX-003](../decisions/003-ports-without-defaults.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md)
- Core: [BEH-BR-013](../../core/behaviors/02-host-construction.md), [BEH-BR-181](../../core/behaviors/21-testing-host.md), [BEH-BR-182](../../core/behaviors/21-testing-host.md)
