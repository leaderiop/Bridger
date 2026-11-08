# 01 — Keys and Subjects

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-BEH-01                                            |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): BEH-KR-004 `KeyStore` gains `markStep`, `incompleteShreds`, optional `holders` and an optional outbox-sharing `transaction` for resumable shreds; Open (2) moved to a stated limit (CCR-KR-002)<br>0.2 (2026-11-08): BEH-KR-002 and 008 cite URS-BR-058 (registered by core CCR-BR-027) (CCR-KR-001)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

This file specifies subjects, per-subject data keys, encryption with
authenticated data, the `KeyStore`, `KeyWrapper` and `NonceSource` ports,
rotation, backup obligations and access through core grants. This file owns
BEH-KR-001–008 and uses all eight.

Planned source: `packages/keyring/src/Keyring.ts`,
`packages/keyring/src/KeyStore.ts` *(Planned)*.

## BEH-KR-001: A subject is an opaque identifier chosen by the application

> **See:** [ADR-KR-005](../decisions/005-the-application-chooses-personal-fields.md)
> **Risk:** [RSK-KR-004](../risks.md#rsk-kr-004)

```
REQUIREMENT: A subject MUST be a string of 1–128 characters of
             [A-Za-z0-9._:/-], else `SubjectInvalid { reason }`.
             Documentation MUST state that the subject id stays readable
             after a shred and therefore MUST NOT itself be personal data
             (an opaque id, never a name, phone number or document number).
```

## BEH-KR-002: Keyring.key(subject) returns a handle, never key material

> **Invariant:** [INV-KR-003](../invariants.md#inv-kr-003-a-shredded-subject-never-gets-a-new-key)
> **See:** [ADR-KR-003](../decisions/003-a-shredded-subject-is-closed.md)
> **Satisfies:** [URS-BR-058](../../core/urs.md#urs-br-058-make-a-subjects-personal-fields-unreadable-without-rewriting-history)

```ts
// illustrative — not type-checked
interface KeyHandle { readonly subject: string; readonly keyId: string; readonly version: number; readonly alg: "aes-256-gcm" }
interface KeyringShape {
  readonly key: (subject: string) => Effect.Effect<KeyHandle, KeyShredded | SubjectInvalid | KeyStoreUnavailable>
  readonly encrypt: (subject: string, plaintext: Uint8Array, aad: Uint8Array) =>
    Effect.Effect<Sealed, KeyShredded | KeyStoreUnavailable>
  readonly decrypt: (sealed: Sealed, aad: Uint8Array) =>
    Effect.Effect<Uint8Array, KeyShredded | DecryptFailed | KeyStoreUnavailable>
  // shred, onShred, shredStatus: 03
}
interface Sealed { readonly v: 1; readonly subject: string; readonly keyId: string; readonly nonce: string; readonly ct: string }  // base64url
```

```
REQUIREMENT: `key(subject)` MUST return the subject's current key handle,
             creating a key on first use with material from `NonceSource`
             and storing it wrapped (BEH-KR-005). It MUST fail with
             `KeyShredded { subject, shreddedAt }` for a subject with a
             tombstone (03, BEH-KR-018). No public member MUST return
             unwrapped key material.
```

## BEH-KR-003: Encryption binds authenticated data

> **Invariant:** [INV-KR-002](../invariants.md#inv-kr-002-after-a-shred-begins-the-keyring-neither-encrypts-nor-decrypts-for-the-subject)

```
REQUIREMENT: `encrypt` MUST use an authenticated cipher (AES-256-GCM in
             this revision) with a fresh 96-bit nonce from `NonceSource`
             per call and the caller's `aad`; `decrypt` MUST fail with
             `DecryptFailed` when the ciphertext, nonce, key id or `aad`
             does not authenticate. Neither MUST log plaintext, keys or
             `aad` contents.
```

## BEH-KR-004: KeyStore obligations

> **See:** [ADR-KR-004](../decisions/004-key-custody-is-an-obligation.md)
> **Risk:** [RSK-KR-002](../risks.md#rsk-kr-002), [RSK-KR-005](../risks.md#rsk-kr-005)

```ts
// illustrative — not type-checked
interface KeyStore {
  readonly get: (subject: string) => Effect.Effect<SubjectKeys | Tombstone | undefined, KeyStoreUnavailable>
  readonly create: (subject: string, wrapped: WrappedKey) => Effect.Effect<void, KeyStoreUnavailable | KeyShredded>
  readonly addVersion: (subject: string, wrapped: WrappedKey) => Effect.Effect<void, KeyStoreUnavailable | KeyShredded>
  readonly tombstone: (subject: string, t: Tombstone) => Effect.Effect<void, KeyStoreUnavailable>    // 03
  readonly destroy: (subject: string) => Effect.Effect<void, KeyStoreUnavailable>                     // 03
  readonly markStep: (subject: string, shredId: string, step: ShredStep) => Effect.Effect<void, KeyStoreUnavailable>  // 03, BEH-KR-017
  readonly incompleteShreds: Effect.Effect<readonly Tombstone[], KeyStoreUnavailable>                 // tombstones with a pending step
  readonly holders?: (subject: string) => Effect.Effect<readonly string[], KeyStoreUnavailable>       // hosts the consumer gave the key to (BEH-KR-021)
  // present only when the KeyStore's database is the durable-bus outbox's: a transaction the OutboxStore accepts
  readonly transaction?: <A, E, R>(effect: Effect.Effect<A, E, R | StoreTransaction>) => Effect.Effect<A, E | KeyStoreUnavailable, Exclude<R, StoreTransaction>>
}
type ShredStep = "destroyed" | "noticed"
```

```
REQUIREMENT: A `KeyStore` MUST store only wrapped keys, MUST make `create`
             fail with `KeyShredded` for a tombstoned subject (atomically
             with the tombstone check), and after `destroy` MUST hold no
             copy of the subject's wrapped keys in its live data. It MUST
             document how deleted rows are removed from the engine's files
             (vacuum, compaction) and in what time. `tombstone`, when given a
             `KeyStore.transaction` in its environment, MUST write in that
             transaction; `markStep` MUST be committed to the store before it returns.
```

## BEH-KR-005: KeyWrapper — the key-encryption key stays outside the store

> **See:** [ADR-KR-004](../decisions/004-key-custody-is-an-obligation.md)
> **Risk:** [RSK-KR-005](../risks.md#rsk-kr-005)

```
REQUIREMENT: Data keys MUST be wrapped by a `KeyWrapper` (`wrap`, `unwrap`,
             `kekId`) before reaching the `KeyStore`. Documentation MUST
             recommend a wrapper whose key is held outside the database
             (a hardware module or key-management service), and MUST state
             that a wrapper key stored beside the keys gives a shred no
             protection against a copy of the database.
```

## BEH-KR-006: Rotation of data keys and of the wrapping key

> **See:** [ADR-KR-004](../decisions/004-key-custody-is-an-obligation.md)

```
REQUIREMENT: `Keyring.rotate(subject)` MUST add a new key version used for
             every later `encrypt`, and MUST keep earlier versions for
             `decrypt` until the subject is shredded, because stored events
             are never re-encrypted. `Keyring.rewrap(kekId)` MUST re-wrap
             every stored key version under the wrapper's current key
             without unwrapping it outside the wrapper where the wrapper
             supports that.
```

## BEH-KR-007: Backup obligations

> **Risk:** [RSK-KR-001](../risks.md#rsk-kr-001), [RSK-KR-002](../risks.md#rsk-kr-002)

```
REQUIREMENT: Documentation MUST state the backup obligations: backups of the
             `KeyStore` hold destroyed keys until they expire, so the
             consumer MUST bound their retention and MUST state the window
             after which a shred also covers backups; backups MUST be
             restored only with the tombstones of every later shred
             re-applied (BEH-KR-020); losing every copy of a key makes its
             fields unreadable as a shred would, so backups are also an
             availability control.
```

## BEH-KR-008: Access through core grants; no plaintext in core flows

> **Core seam:** [29 — Capability Grants and Call Log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-273, BEH-BR-276, BEH-BR-281), [30 — Operation Context Annotations](../../core/behaviors/30-operation-context-annotations.md) (BEH-BR-293), [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-196)
> **Satisfies:** [URS-BR-034](../../core/urs.md#urs-br-034-narrow-and-log-what-each-plugin-can-call), [URS-BR-058](../../core/urs.md#urs-br-058-make-a-subjects-personal-fields-unreadable-without-rewriting-history)
> **Invariant:** [INV-KR-001](../invariants.md#inv-kr-001-plaintext-of-a-selected-field-never-leaves-the-codec-unencrypted)

```
REQUIREMENT: The `Keyring` service MUST be a core contract provided by a
             plugin, so that `decrypt` and `shred` can be granted per
             plugin (BEH-BR-273) and a grant withdrawn through
             `CapabilityPolicy.changes` narrows live captures (BEH-BR-281).
             Arguments that reach the call log MUST be limited to subject,
             key id and member; plaintext and ciphertext MUST NOT.
```

```
REQUIREMENT: Documentation MUST state that core's audit `reason`, operation
             annotations and call-log entries are not encrypted by this
             package and MUST carry no personal data.
```

**Settled here.** (1) Subjects are opaque and stay readable (BEH-KR-001).
(2) Key material never leaves the API (BEH-KR-002). (3) Keys are stored
wrapped; the wrapper's custody decides what a shred is worth against a copied
database (BEH-KR-004, BEH-KR-005). (4) Old versions stay until shred
(BEH-KR-006).

**Open.** (1) Algorithm agility beyond AES-256-GCM. Key distribution for
subjects needed on several hosts is not specified and is a stated limit
(README, stated limit 2; BEH-KR-012).

---

_Previous: [Overview](../overview.md)_ · _Next: [02 — Field encryption](./02-field-encryption.md)_
