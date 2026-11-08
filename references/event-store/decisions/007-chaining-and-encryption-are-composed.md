# ADR-ES-007: Chaining and field encryption are composed from other companions, not built in

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ES-ADR-007                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-ES-001)                 |

---

## Context

Some applications want stored streams linked by a hash chain and personal fields encrypted so that a subject can be shredded. The audit-chain companion owns chaining (its generic `ChainSink<R>`, CCR-AC-003); the event delivery companion owns the payload codec port (`PayloadCodec`, CCR-DB-003); the keyring companion supplies a codec. Re-implementing either here would split their rules.

## Decision

- `EventStore.chain` hands committed events, in their stored form, to a `ChainSink<StoredEvent>` with a series id that defaults to the stream, never to a host id.
- A wired `PayloadCodec` is applied before storing and publishing and after reading; the same encoded payload is stored and published. Chains therefore hash ciphertext, never decrypted plaintext.
- Neither is a dependency of the main entry point beyond the codec port's type.

## Alternatives considered

- **A built-in hash per event.** Rejected: duplicates the audit-chain companion without its anchoring and verification.
- **Encrypting in the adapter.** Rejected: publication would carry plaintext, and the chain would hash something other than what is delivered.

## Consequences

**Positive**: a shredded subject leaves chains verifiable; one codec rules storage and wire.

**Negative**: alignment with two shapes being specified in parallel is pending (README open question 1).

**Trade-off accepted**: a cross-companion dependency, in exchange for one rule per concern.

## References

- Behaviours: [BEH-ES-031](../behaviors/04-versions-publication-and-chaining.md#beh-es-031-optional-chaining-through-chainsinkr), [BEH-ES-032](../behaviors/04-versions-publication-and-chaining.md#beh-es-032-stored-payloads-pass-through-the-durable-bus-payloadcodec)
- Companions: [audit-chain](../../audit-chain/README.md), [keyring](../../keyring/README.md)
