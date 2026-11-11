# 02 — Field Encryption

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-BEH-02                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07 residual) — BEH-KR-009: a key the codec creates on encode is written under the durable-bus fence (03, BEH-KR-017), and an `OutboxFrozen` there fails `encode` with `PayloadEncodeFailed` (CCR-KR-009)<br>0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-07) — BEH-KR-012: the refusal of every decode from a whole-store `OriginChange` until the store-swap re-apply commits, and the state the codec shared with the plugin, are removed: the re-apply now commits inside the install before the `OriginChange` (03, BEH-KR-020), so the codec reads the tombstones from the `KeyStore` (H4, K2) (CCR-KR-009)<br>0.7 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-KR-012: the codec fails every decode of an `Encrypted` field with `PayloadDecodeFailed` naming `KeyStoreUnavailable` from a whole-store `OriginChange` until the keyring's store-swap re-apply has committed, a state shared with the plugin through the same `KeyringPorts` value (K1) (CCR-KR-008)<br>0.6 (2026-11-10): BEH-KR-009: `Keyring.fields` takes the `KeyringPorts` given to `Keyring.plugin` (PL2) (SPEC-AUDIT-04) (CCR-KR-006)<br>0.5 (2026-11-10): BEH-KR-012: a decode that meets `KeyStoreUnavailable` fails with `PayloadDecodeFailed`, never `PayloadUnreadable` or a marker, so that the reader keeps the envelope and retries (CCR-KR-004)<br>0.4 (2026-11-08): BEH-KR-009 `Field` is `Codec<A | Shredded, I | Shredded>` and upcasters pass markers through; BEH-KR-010 defines the `Shredded` form, decoded and stored; BEH-KR-012 stores an existing marker without a key, leaves park or halt to the reader, and states the key precondition as a limit (CCR-KR-002)<br>0.3 (2026-11-08): BEH-KR-009 and 012 cite URS-BR-058 and URS-BR-059 (registered by core CCR-BR-027) (CCR-KR-001)<br>0.2 (2026-11-08): BEH-KR-009 and BEH-KR-012 aligned with durable-bus BEH-DB-008 (`PayloadCodec` shape cited, codec id "bridger-keyring/v1", `PayloadEncodeFailed`, `PayloadDecodeFailed` and `PayloadUnreadable` mapping); Open (2) closed (CCR-KR-001, revision bump)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

This file specifies `Keyring.fields`, a durable-bus `PayloadCodec` that
encrypts the fields the application selects, the stored form of an
encrypted field, its authenticated data, the `Shredded` marker, and why
chains over the stored form stay verifiable. This file owns BEH-KR-009–016
and uses all eight.

Planned source: `packages/keyring/src/FieldCodec.ts` *(Planned)*.

## BEH-KR-009: Keyring.fields builds a PayloadCodec for one event type

> **See:** [ADR-KR-002](../decisions/002-field-encryption-through-the-payload-codec.md)
> **Satisfies:** [URS-BR-058](../../core/urs.md#urs-br-058-make-a-subjects-personal-fields-unreadable-without-rewriting-history), [URS-BR-059](../../core/urs.md#urs-br-059-make-a-persons-event-payloads-unreadable-without-breaking-their-order)
> **Depends on:** [BEH-DB-008](../../durable-bus/behaviors/01-events-and-envelope.md#beh-db-008-a-payloadcodec-encodes-payloads-and-records-carry-no-personal-data), [BEH-ES-032](../../event-store/behaviors/04-versions-publication-and-chaining.md#beh-es-032-stored-payloads-pass-through-the-durable-bus-payloadcodec)

```ts
// illustrative — not type-checked; PayloadCodec is durable-bus BEH-DB-008's, and its shape governs:
//   { id; encode({ type, version, stream }, encoded); decode({ type, version, stream, codec }, payload) }
// Keyring.fields returns a codec with id "bridger-keyring/v1"; encode fails with PayloadEncodeFailed,
// decode with PayloadDecodeFailed or PayloadUnreadable (durable-bus errors)
interface FieldSpec<A> {
  readonly event: DurableEvent<A, any>
  readonly subject: (encoded: unknown) => string              // read from unencrypted fields of the encoded payload
  readonly fields: readonly string[]                          // JSON paths of the encoded payload, e.g. "name", "address.line1"
}
declare const Keyring: {
  // `ports`: the same KeyringPorts value given to Keyring.plugin (01, BEH-KR-008)
  readonly fields: <A>(ports: KeyringPorts, ...specs: readonly FieldSpec<A>[]) => PayloadCodec
  readonly Field: <A, I>(schema: Schema.Codec<A, I>) => Schema.Codec<A | Shredded, I | Shredded>
}
// The schema never sees `Encrypted`: the codec runs after the schema on write and before the
// upcasters and the schema on read (BEH-DB-008), so the schema's encoded side is I | Shredded.
```

```
REQUIREMENT: The codec MUST, on encode, replace the value at each listed
             path of a payload of a listed event type with its `Encrypted`
             form (BEH-KR-010), and leave every other value unchanged; on
             decode it MUST restore the value or put `Shredded` in its place
             (BEH-KR-012). Payloads of unlisted types MUST pass unchanged.
```

```
REQUIREMENT: The codec MUST implement the durable-bus `PayloadCodec` of
             BEH-DB-008 as written: its `id` MUST be "bridger-keyring/v1";
             `encode` receives `{ type, version, stream }` and the
             schema-encoded payload, and reads the subject from unencrypted
             fields; `decode` receives `{ type, version, stream, codec }` and
             the stored or received payload. It MUST change only the
             payload (BEH-DB-008 forbids changing any other envelope field).
             A `KeyShredded` or `KeyStoreUnavailable` on encode, or an
             `OutboxFrozen` refusing the key it creates under a transaction
             not yet fenced (03, BEH-KR-017), MUST fail `encode` with
             durable-bus `PayloadEncodeFailed`, so that nothing is written. The same codec instance MUST serve the bus
             and the event store, which stores the envelope's payload of a
             published event unchanged (event-store BEH-ES-032).
```

```
REQUIREMENT: Documentation MUST state that upcasters of a listed event type
             receive a decoded payload in which a selected field may be a
             `Shredded` marker, and MUST pass such a marker through unchanged
             (moving it with its field when a field is renamed), never read
             or replace it.
```

## BEH-KR-010: The encrypted field form

> **Invariant:** [INV-KR-001](../invariants.md#inv-kr-001-plaintext-of-a-selected-field-never-leaves-the-codec-unencrypted)

```ts
// illustrative — not type-checked
interface Encrypted { readonly $enc: 1; readonly subject: string; readonly keyId: string; readonly nonce: string; readonly ct: string }
// ct = AES-256-GCM(key, nonce, plaintext = UTF-8 of RFC 8785 JSON of the field's encoded value, aad = BEH-KR-011)
interface Shredded { readonly $shredded: 1; readonly subject: string; readonly path: string }   // decoded and stored alike
```

```
REQUIREMENT: The encrypted form MUST be exactly the `Encrypted` object
             above, JSON serializable, with base64url strings. A path whose
             value is absent MUST stay absent; a present `null` MUST be
             encrypted like any value. A `Shredded` marker MUST have the same
             form decoded and stored, so that a marker written by the codec
             (BEH-KR-012) decodes to the marker it was.
```

## BEH-KR-011: Authenticated data binds the field to its place

```
REQUIREMENT: The authenticated data of a field MUST be the UTF-8 bytes of
             "bridger-keyring/v1\n" + event type + "\n" + version + "\n" +
             path + "\n" + subject, so that ciphertext moved to another
             field, event type or subject fails to decrypt.
```

## BEH-KR-012: After a shred, a field decodes as Shredded

> **Invariant:** [INV-KR-002](../invariants.md#inv-kr-002-after-a-shred-begins-the-keyring-neither-encrypts-nor-decrypts-for-the-subject)
> **Satisfies:** [URS-BR-058](../../core/urs.md#urs-br-058-make-a-subjects-personal-fields-unreadable-without-rewriting-history), [URS-BR-059](../../core/urs.md#urs-br-059-make-a-persons-event-payloads-unreadable-without-breaking-their-order)

```
REQUIREMENT: Decoding a field whose subject has a tombstone MUST yield
             `Shredded { subject, path }` and MUST NOT fail the decode, so
             that event-store reads, projections and replays continue
             (event-store BEH-ES-032) and bus subscribers receive the event
             with the marker. A stored marker MUST decode to itself.
```

```
REQUIREMENT: Encoding a selected field whose value is already a `Shredded`
             marker MUST store the marker as it is, without a key and without
             consulting the tombstone, so that a fact received after its
             subject was shredded can still be recorded (event-store
             BEH-ES-030, ADR-ES-005) and an event carrying a marker can be
             re-published. Encoding a plaintext value for a tombstoned
             subject MUST fail with `KeyShredded` (surfaced as
             `PayloadEncodeFailed`, BEH-KR-009), never write plaintext.
```

```
REQUIREMENT: `decode` MUST fail with durable-bus `PayloadUnreadable` only
             when no field of the payload can be restored or marked — an
             `Encrypted` form whose key is absent from the key store without
             a tombstone — and with `PayloadDecodeFailed` for a malformed
             `Encrypted` form or a `DecryptFailed`. What the reader does then
             is the reader's rule, not the codec's: a durable-bus subscription
             parks or halts as its options say (BEH-DB-008), and one that
             records facts halts and never parks (event-store BEH-ES-030); an
             event-store read ends with `DecodeFailed` (BEH-ES-032).
             Documentation MUST tell authors to declare every selected field
             with `Keyring.Field`, because a schema that reads a selected path
             without it fails on a `Shredded` marker in the bus's schema step.
```

```
REQUIREMENT: When the `KeyStore` cannot be read (`KeyStoreUnavailable`),
             `decode` MUST NOT yield a `Shredded` marker and MUST NOT fail
             with `PayloadUnreadable`, since nothing is known to be gone: it
             MUST fail with `PayloadDecodeFailed` naming `KeyStoreUnavailable`
             as its cause. The reader then keeps the envelope and can retry:
             a durable-bus subscription under `onPoison: "halt"` stops that
             (origin, stream) with its cursor before the envelope until
             `resume` (BEH-DB-021), and an event-store read ends with
             `DecodeFailed` and can be repeated (BEH-ES-032). Documentation
             MUST tell subscribers of encrypted event types to use
             `onPoison: "halt"`, because "park-and-continue" parks the
             envelope until it is unparked by hand.
```

```
REQUIREMENT: Documentation MUST state the key precondition as a limit, not
             an open question: a host can decode a selected field only if its
             `KeyStore` holds the subject's key or its tombstone. `Keyring.key`
             creates keys in the local `KeyStore` only, and the package
             distributes no key (README, stated limit 2). Every host that
             receives an encrypted event type and must read it therefore needs
             the consumer's key distribution; a host that must only record it
             records the ciphertext verbatim (event-store BEH-ES-030), and a
             host that has neither halts the receiving subscription.
```

## BEH-KR-013: The application chooses the fields

> **See:** [ADR-KR-005](../decisions/005-the-application-chooses-personal-fields.md)
> **Risk:** [RSK-KR-001](../risks.md#rsk-kr-001)

```
REQUIREMENT: The package MUST NOT infer which fields are personal data. It
             MUST refuse a `FieldSpec` whose subject function reads a listed
             path (`SubjectFromEncryptedField`), and documentation MUST state
             that unlisted fields are stored and published in plaintext.
```

## BEH-KR-014: Chains hash ciphertext only

> **Invariant:** [INV-KR-004](../invariants.md#inv-kr-004-a-shred-changes-no-stored-byte)
> **Depends on:** [BEH-AC-025](../../audit-chain/behaviors/04-generic-chain.md#beh-ac-025-chainsinkr-chains-any-append-only-stream-and-hashchainsink-is-its-audit-instance), [BEH-ES-031](../../event-store/behaviors/04-versions-publication-and-chaining.md#beh-es-031-optional-chaining-through-chainsinkr)

```
REQUIREMENT: Documentation MUST state the rule chains rely on: a chain over
             stored events hashes the stored form, which holds the
             `Encrypted` object for each selected field; a shred changes no
             stored byte (INV-KR-004), so every link recomputes and the
             chain verifies after a shred exactly as before.
```

```
REQUIREMENT: The package MUST NOT offer a canonicaliser or hash over decoded
             payloads, and MUST document that a chain built over plaintext
             would either keep personal data in the chain or stop verifying
             after a shred.
```

## BEH-KR-015: Deterministic tests

> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-211, as a model)

```
REQUIREMENT: All nonces and key material MUST come from `NonceSource`. The
             testing entry point MUST export `fixedNonces`, with which two
             runs produce identical ciphertext; the main entry point MUST
             NOT export it, and production wiring MUST use a cryptographic
             source.
```

## BEH-KR-016: What is not encrypted

> **Risk:** [RSK-KR-004](../risks.md#rsk-kr-004)

```
REQUIREMENT: Documentation MUST list what stays readable after a shred:
             subject ids, stream ids, event types and versions, stream
             versions, positions, timestamps, actors, correlation ids,
             annotations, the `Encrypted` object's metadata, and every
             unselected field.
```

**Settled here.** (1) One codec serves storage and wire (BEH-KR-009).
(2) Ciphertext is bound to event type, version, path and subject
(BEH-KR-011). (3) Reads continue with `Shredded` after a shred, and a marker is
re-encoded as a marker without a key (BEH-KR-012).
(4) Chains hash ciphertext only (BEH-KR-014). (5) The codec is the `PayloadCodec` of durable-bus BEH-DB-008, unchanged
(BEH-KR-009, BEH-KR-012; revision 0.2).

**Open.** (1) Encrypting whole payloads, which hides more metadata but makes
every projection depend on keys.

---

_Previous: [01 — Keys and subjects](./01-keys-and-subjects.md)_ · _Next: [03 — Shred and acceptance](./03-shred-and-acceptance.md)_
