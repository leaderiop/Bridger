# ADR-BR-033: Audit records carry configuration paths, never values

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-033                                              |
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

Two rules collide here.

[ADR-BR-018](../decisions/018-configuration-decoded-before-build.md) and [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable) say configuration values are never observable: not in snapshots, events, logs or errors. Configuration carries secrets (connection strings, API keys, signing material), and SPEC.md's decode errors already omit `Redacted` values.

An audit trail, by contrast, is conventionally expected to show what changed: Part 11 §11.10(e) asks that record changes not obscure previously recorded information, and ALCOA+ asks for complete records. A reviewer reading "plugin `billing` reconfigured" wants to know what the configuration became.

Writing values into the trail would breach the first rule in the one place where a breach is hardest to repair. An audit trail is retained for years, replicated and archived, and by design is not edited; a secret written into it cannot be purged without tampering with the trail. The sink is also outside the core's trust boundary: the core cannot know who reads the consumer's store.

## Decision

- **Paths, not values.** An `AuditRecord` that concerns configuration carries `configChange: { paths: readonly string[] }`. For `reconfigure` with a value, which is decoded at the call, the paths are those whose decoded values differ between the old and new configuration. For `install` with an override, which is not decoded at the call (a value that does not decode becomes an activation failure), the paths are the top-level keys of the raw override, never its values. A `reconfigure` that clears the override records the cleared paths only ([23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), BEH-BR-197). It never carries a value, old or new, plain or `Redacted`. The same `configChange` shape, and the same rule, applies to `OperationRequest` ([ADR-BR-032](../decisions/032-operation-gate.md)).
- **What is recorded instead.** `before` and `after` carry `state`, `version`, `digest` and `revision`; with the paths, they say that configuration changed, where, and which definition and revision it applied to.
- **The value history belongs to the configuration source.** The `ConfigSource` (a database, a configuration service, a managed file) is the system of record for configuration values. A regulated user who needs value history keeps it there, under that system's own access control and audit trail, and correlates by time, actor and `correlationId`.
- **Fingerprinting is the companion's.** Recording a fingerprint of each changed value (for example a keyed hash, so that two values can be compared without being revealed) needs key management and a decision about which fields are low-entropy. That is left to the `@bridger/gxp` companion and the consumer ([ADR-BR-034](../decisions/034-gxp-companion-scope.md)); the core computes no fingerprint.
- **Path disclosure is accepted.** A path such as `database.password` reveals that a secret changed, not its value. That is the information a reviewer needs.

## Alternatives considered

- **Record values with `Redacted` fields omitted.** Rejected: the core cannot know which non-`Redacted` fields are sensitive, and an author who forgets `Redacted` once leaks a secret into a permanent record.
- **Record values when the consumer opts in.** Rejected: one option away from an irreversible leak, in exactly the store that cannot be cleaned afterwards.
- **Plain hashes of values in core.** Rejected: an unsalted hash of a low-entropy value (a port number, a short password, an enum) is reversible by enumeration. A keyed hash needs a key the core has no way to manage.
- **No configuration information at all.** Rejected: a reviewer could not tell a configuration change from a restart, and the operation's scope would be invisible.

## Consequences

**Positive**:

- No configuration value, and so no secret, can reach the trail through the core.
- The trail still shows that configuration changed, where, by whom, why and against which definition.

**Negative**:

- The trail alone cannot answer "what was the value at time T"; that needs the configuration source's own history, which the regulated user must keep and correlate.
- This is a deliberate departure from a value-bearing audit trail; the regulated user's assessment must accept that the configuration source, not the Bridger trail, holds the values ([../gxp/02-compliance-matrix.md](../gxp/02-compliance-matrix.md)).
- `reconfigure` paths are computed from decoded values, so a change the schema normalises away (for example whitespace a transform removes) is not reported. `install` paths are coarser: only the top-level keys the override sets, because nothing is decoded at the call.

**Trade-off accepted**: an incomplete trail for configuration values, completed by the configuration source, rather than a complete trail that can permanently leak a secret.

## References

- Behaviours: [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md), [11 — Configuration](../behaviors/11-configuration.md), [25 — Operation gate](../behaviors/25-operation-gate.md)
- Invariants: [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values)
- Requirements: [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes), [URS-BR-021](../urs.md#urs-br-021-know-who-changed-the-plugin-set-when-and-why)
- Risks: [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)
- Decisions: [ADR-BR-018](../decisions/018-configuration-decoded-before-build.md), [ADR-BR-030](../decisions/030-audit-sink-port.md), [ADR-BR-032](../decisions/032-operation-gate.md), [ADR-BR-034](../decisions/034-gxp-companion-scope.md)
- Source: `docs/SPEC.md` — "Configuration and metadata", "Volatile configuration"
- External: 21 CFR Part 11 §11.10(e); PIC/S PI 041 (ALCOA+, complete); EU GMP Annex 11 (2011) §9, §12.
