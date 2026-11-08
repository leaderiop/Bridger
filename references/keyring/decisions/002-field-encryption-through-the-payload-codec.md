# ADR-KR-002: Field encryption through the durable-bus PayloadCodec, one codec for storage and wire

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-ADR-002                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

## Context

An event is stored by the event store and published by the event delivery companion. If storage and delivery encrypted separately, one of them could carry plaintext, and a chain would hash something other than what was delivered. The delivery companion is adding a `PayloadCodec` port (CCR-DB-003); the event store applies it to stored payloads ([BEH-ES-032](../../event-store/behaviors/04-versions-publication-and-chaining.md#beh-es-032-stored-payloads-pass-through-the-durable-bus-payloadcodec)).

## Decision

- The keyring implements `PayloadCodec` (`Keyring.fields`); one instance is given to the event store and the bus, so one encoded payload is stored, published and chained.
- Encrypted fields have a fixed JSON form bound by authenticated data to event type, version, path and subject.

## Alternatives considered

- **Encryption in the storage adapter.** Rejected: the wire would carry plaintext.
- **Whole-payload encryption.** Not chosen: every projection would need keys; left Open.

## Consequences

**Positive**: one rule for storage and wire; chains hash ciphertext.

**Negative**: depends on a port being specified in parallel (README open question 1).

**Trade-off accepted**: a cross-companion dependency, in exchange for a single encoding.

## References

- Behaviours: [BEH-KR-009](../behaviors/02-field-encryption.md#beh-kr-009-keyringfields-builds-a-payloadcodec-for-one-event-type), [BEH-KR-010](../behaviors/02-field-encryption.md#beh-kr-010-the-encrypted-field-form), [BEH-KR-011](../behaviors/02-field-encryption.md#beh-kr-011-authenticated-data-binds-the-field-to-its-place)
