# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-INV                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-09) — INV-KR-002: event-store reads gated page by page from the freeze's second step, fenced inside a store transaction; a read a participant step makes itself skips the gate (H4, H6); second pass (cleanest design): the step read is withdrawn — a store-swap step decodes only through its `SwapStep`, which no step gets before the keyring's "codec" `apply` has committed on the store `run` left; reads inside a store transaction take event-store `readIn` and the read fence (CCR-KR-011)<br>0.6 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-08) — INV-KR-002: no tombstone commits during the freeze except in the install's `apply` transaction (PL20); readers named (every subscription, `follow` and event-store read, the application's duty to await `whenReadable`) (H3); residual bounds restated (B4) (CCR-KR-010)<br>0.5 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — INV-KR-002: the store-swap participant re-applies tombstones in its `apply`, inside the install before the `OriginChange`, and the refusal of `decrypt` and the codec is removed; the residual narrows to a crash during the install before `apply` commits and a failed `apply` (H4, K2); SPEC-AUDIT-07 residual — INV-KR-002: the failed-`apply` residual is removed, durable-bus holding readers and retrying the `apply`; the residual keeps a stop of the process during the install or that hold and adds the keyring plugin stopping during the hold; the residuals marked accepted, with (c) an `apply` that fails on every retry, holding writes and readers until the operator restores the `KeyStore` (CCR-KR-009)<br>0.4 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — INV-KR-002: keyring writes on the outbox database take the durable-bus fence (H4); `decrypt` and the codec refuse every subject from the `OriginChange` until the re-apply commits (K1); the store-swap crash window stated as a named residual (K2) (CCR-KR-008)<br>0.3 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — INV-KR-002 holds across a whole-store re-bootstrap install through the store-swap participant (B6) (CCR-KR-007)<br>0.2 (2026-11-08): INV-KR-002 notes that storing an existing marker uses no key (CCR-KR-002)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

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
outbox's database does not reopen a subject: every keyring write on that
database takes the durable-bus fence, so no tombstone commits during the
freeze except in the install's `apply` transaction and durable-bus's retries
of it (BEH-KR-017); the keyring's store-swap participant reads every
tombstone before the swap and treats those subjects as shredded from then on,
and its `apply` writes the tombstones again to the new store inside the
install, before durable-bus emits the `OriginChange`, lifts the freeze or
resumes any subscription or `follow`, and before `DurableBus.whenReadable`
completes, behind which every event-store `read` and `readAll` is gated page by
page from the freeze's second step, a page in flight then interrupted, and
every `readIn` inside a store transaction takes the read fence (event-store
BEH-ES-034, durable-bus BEH-DB-048), so `decrypt` and the codec find them
there (BEH-KR-012, BEH-KR-020); an application that decodes through the codec
itself takes the same ways, its own duty. A store-swap step decodes only
through the `SwapStep` durable-bus hands it: a `prepare` on the store about to
be replaced, which holds the tombstones, and a "data" `apply` only once the
keyring's participant, of stage "codec", has committed its `apply`; `run` and
a "codec" `apply` get none (durable-bus BEH-DB-048), so no step decodes such a
subject either (BEH-KR-012).

**Residual (store-swap install window; accepted)**: what the participant read
lives in memory only. (a) A process that stops after `run` has replaced the store and before the
participant's `apply` has committed, during the install or during that hold,
restarts on a store without those tombstones, and a subject shredded only in
the replaced store decrypts again: a received tombstone until the
restored-host rule re-applies it (BEH-KR-007, BEH-KR-020); one of this host's
own shreds until an operator re-applies it from a host that received its
notice, and without that, or for a notice never delivered, with no bound. (b) A keyring plugin that stops during the hold
withdraws its participant, whose pending `apply` durable-bus drops; the hold
can then lift with those tombstones unwritten, and the new store serves such a
subject's key, to the codec at once and to the keyring when it starts again,
with the same bounds as (a) (BEH-KR-020; RSK-KR-001). (c) A failed
`apply` reopens no subject, since durable-bus holds every subscription, every
`follow` and every event-store read (`apply-pending`) and retries it until it
commits; one that fails on every retry keeps that hold, every write refused
and those readers paused, until the operator restores the `KeyStore` it
needs, as for a `recordIncarnation` that fails on every retry under
`origin-unrecorded` (durable-bus BEH-DB-048).

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
