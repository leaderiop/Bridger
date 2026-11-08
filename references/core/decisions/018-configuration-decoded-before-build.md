# ADR-BR-018: Configuration is decoded before build and never observable

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-018                                              |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-10-03): Values may leave core only to the consumer's `ConfigFingerprinter` port at step 4a of BEH-BR-188; fingerprints are carried with the paths (ADR-BR-039) (CCR-BR-014)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001) |

---

## Context

Plugins need configuration, some of it secret (credentials, keys), some of it changing while they run (a log level, a rate). Three failures are common in plugin hosts:

- **Late decoding.** A plugin reads and parses its own configuration inside `build`; a bad value is discovered halfway through a build that has already acquired resources, and a `reconfigure` cannot be rejected before the running plugin is stopped.
- **Stale caching.** The host reads configuration once at install; later activations (a restart after a dependency returns) use a value the source no longer holds.
- **Leaking.** Configuration appears in snapshots, events, error messages, logs or audit records, and a secret ends up in a log aggregator or an audit archive ([RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)).

## Decision

- **Schema and source.** A plugin declares `config` as an Effect Schema. The host reads the raw value from `BridgerOptions.config`, a `ConfigSource`: by default the ambient `ConfigProvider`, read with the plugin's schema under the path of the plugin ID (so environment variables, files and `Config.redacted` work unchanged), or a function `(id) => Effect<unknown>` for sources such as a database. Secrets use `Redacted`.
- **Decode before build.** The value is decoded before `build` runs and provided as `Plugin.Config` (`{ value, current, changes }`). A decode failure fails the activation with phase `activation` and cause `ConfigInvalid`; nothing is built or published.
- **Read at every activation.** The source is read at every activation (first start, restart after a dependency returns, `retry`, `replace`, `reconfigure`), so the source is the single default and never stale.
- **Override.** `reconfigure(ref, raw)` checks `raw` first (`ConfigInvalid` leaves the running plugin untouched) and stores it as an override for that ID, taking precedence over the source. `reconfigure(ref)` without a value clears the override and re-reads the source. `restart` keeps the override; `remove` and `replace` drop it (a new definition may have a new schema); on a `disabled` plugin it is stored for the next `enable`.
- **Volatile fields.** If the decoded difference is confined to fields listed in `volatile`, `reconfigure` updates the stored value, publishes to `Plugin.Config.changes`, emits `config-updated { id, paths }` and changes no state. Any other difference restarts the plugin and its dependents through the `replace` stop/start path.
- **Never observable.** Configuration values never appear in snapshots, events, logs, spans, `inspect` results, error fields, `OperationRequest`s or audit records. Where a change must be described, only the changed *paths* are carried (`config-updated`, `AuditRecord.configChange.paths`; [ADR-BR-033](../decisions/033-no-config-values-in-audit.md)), with, when the consumer wires a `ConfigFingerprinter`, the fingerprints that port returned (`configChange.fingerprints`), which are not values. That port is the one place a value leaves core: at step 4a of BEH-BR-188 core hands it the selected values of a new override, and no other value and nothing else ([22 — Attributable operations](../behaviors/22-attributable-operations.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)). `ConfigInvalid.message` names the failing paths and the expected forms and omits the offending values, all of them and not only `Redacted` ones. (SPEC.md says only that `Redacted` values are omitted; a non-redacted value echoed in an error would still make configuration observable, so this ADR takes the stricter reading.)

## Alternatives considered

- **Each plugin reads `Config` itself inside `build`.** Rejected: no central decode before build, and `reconfigure` could not reject a bad value without first stopping the plugin.
- **Read once at install and cache.** Rejected: later activations would use a stale value.
- **Live mutation for every field.** Rejected: a plugin's non-volatile state (connection pools, compiled rules) would silently disagree with its configuration.
- **Showing configuration in snapshots for admin screens.** Rejected: secrets would leak through the most widely consumed feed.

## Consequences

**Positive**:

- A plugin's `build` only ever sees a decoded, typed value.
- A bad `reconfigure` never disturbs a running plugin.
- No observation channel can carry a secret.

**Negative**:

- Admin tools cannot display current configuration through Bridger; they must read the source themselves under their own access control.
- Error messages for decode failures are less specific than a value-echoing message would be.
- Reading the source at every activation costs a read per restart.

**Trade-off accepted**: less convenient diagnostics and a read per activation, in exchange for configuration that is checked before use, never stale, and never observable.

## References

- Behaviours: [11 — Configuration](../behaviors/11-configuration.md), [05 — Activation](../behaviors/05-activation.md), [23 — Audit sink and record](../behaviors/23-audit-sink-and-record.md)
- Invariants: [INV-BR-013](../invariants.md#inv-br-013-configuration-values-are-never-observable), [INV-BR-028](../invariants.md#inv-br-028-audit-records-carry-no-configuration-values), [INV-BR-003](../invariants.md#inv-br-003-publication-is-atomic)
- Requirements: [URS-BR-007](../urs.md#urs-br-007-configure-plugins-safely-including-secrets-and-live-changes)
- Risks: [RSK-BR-008](../gxp/03-risk-assessment.md#rsk-br-008)
- Decisions: [ADR-BR-002](../decisions/002-plugin-build-is-a-layer.md), [ADR-BR-004](../decisions/004-replace-is-stop-then-start.md), [ADR-BR-008](../decisions/008-error-taxonomy.md), [ADR-BR-033](../decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../decisions/039-config-fingerprint-port.md)
- Source: `docs/SPEC.md` — "Configuration and metadata", "Volatile configuration", "Errors" (`ConfigInvalid`)
