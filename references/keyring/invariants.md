# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-INV                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — INV-KR-002 holds across a whole-store re-bootstrap install through the store-swap participant (B6) (CCR-KR-007)<br>0.2 (2026-11-08): INV-KR-002 notes that storing an existing marker uses no key (CCR-KR-002)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

Properties of `@bridger/keyring` that hold for every execution. Every
**Source** and **Verification** is *(Planned)*; nothing here is implemented
and no invariant is evidence until a test that checks it has run
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-KR-001: Plaintext of a selected field never leaves the codec unencrypted

The plaintext of a field the application selected never reaches the store, the
outbox, a chain, the call log or a log line through this package.

**Source**: `packages/keyring/src/FieldCodec.ts` *(Planned)* — encryption
before the payload leaves encode; encode fails rather than passing plaintext.

**Implication**: what the package hands on can be shredded.

**Verification** *(Planned)*: `assertNoPlaintext` over every sink in a
`TestHost` run.

**Related**: [BEH-KR-008](behaviors/01-keys-and-subjects.md#beh-kr-008-access-through-core-grants-no-plaintext-in-core-flows), [BEH-KR-010](behaviors/02-field-encryption.md#beh-kr-010-the-encrypted-field-form), [BEH-KR-012](behaviors/02-field-encryption.md#beh-kr-012-after-a-shred-a-field-decodes-as-shredded).

---

## INV-KR-002: After a shred begins, the keyring neither encrypts nor decrypts for the subject

**Source**: tombstone checked before every key use *(Planned)*. Storing an
existing `Shredded` marker uses no key and encrypts nothing (BEH-KR-012). A
whole-store re-bootstrap install that replaces a `KeyStore` sharing the
outbox's database does not reopen a subject: the keyring's store-swap
participant reads every tombstone before the swap, treats those subjects as
shredded from then on, and writes the tombstones again to the new store
before it serves `decrypt` (BEH-KR-020).

**Implication**: no new plaintext is produced for a shredded subject while its
redaction is still running.

**Verification** *(Planned)*: concurrent decrypt and shred scenario; a
whole-store install over a snapshot without the tombstone (check 12).

**Related**: [BEH-KR-003](behaviors/01-keys-and-subjects.md#beh-kr-003-encryption-binds-authenticated-data), [BEH-KR-017](behaviors/03-shred-and-acceptance.md#beh-kr-017-shredsubject-runs-in-a-fixed-order), [BEH-KR-020](behaviors/03-shred-and-acceptance.md#beh-kr-020-shred-notices-reach-other-hosts).

---

## INV-KR-003: A shredded subject never gets a new key

**Source**: `KeyStore.create` refused atomically with the tombstone check
*(Planned)*.

**Implication**: data written after a shred cannot be read with a key created
for the same subject id by mistake.

**Verification** *(Planned)*: create-after-shred and concurrent create and
shred scenarios.

**Related**: [BEH-KR-002](behaviors/01-keys-and-subjects.md#beh-kr-002-keyringkeysubject-returns-a-handle-never-key-material), [BEH-KR-018](behaviors/03-shred-and-acceptance.md#beh-kr-018-the-tombstone-closes-the-subject), [ADR-KR-003](decisions/003-a-shredded-subject-is-closed.md).

---

## INV-KR-004: A shred changes no stored byte

A shred changes no stored event, outbox entry or chain link.

**Source**: `packages/keyring/src/Shred.ts` *(Planned)* — touches only the
`KeyStore` and callbacks.

**Implication**: chains over stored forms verify after a shred.

**Verification** *(Planned)*: byte comparison and `verifyChain` before and
after a shred.

**Related**: [BEH-KR-014](behaviors/02-field-encryption.md#beh-kr-014-chains-hash-ciphertext-only), [BEH-KR-017](behaviors/03-shred-and-acceptance.md#beh-kr-017-shredsubject-runs-in-a-fixed-order), [ADR-KR-001](decisions/001-shred-keys-never-rewrite-events.md).

---

## INV-KR-005: A shred is reported complete only after every callback acknowledged

**Source**: receipt status computed from recorded acknowledgements *(Planned)*.

**Implication**: "shredded" never hides a projection still holding plaintext
among the registered ones.

**Verification** *(Planned)*: `scriptedCallback` failing and hanging.

**Related**: [BEH-KR-019](behaviors/03-shred-and-acceptance.md#beh-kr-019-redaction-callbacks-drop-plaintext), [BEH-KR-021](behaviors/03-shred-and-acceptance.md#beh-kr-021-status-and-receipt).

---

_Previous: [03 — Shred and acceptance](./behaviors/03-shred-and-acceptance.md)_ · _Next: [Risks](./risks.md)_
