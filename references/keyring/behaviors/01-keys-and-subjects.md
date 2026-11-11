# 01 — Keys and Subjects

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-BEH-01                                            |
> | Revision       | 0.9                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.9 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-06) — BEH-KR-004: `KeyStore.transaction` runs the `onEnd` effects of its `StoreTransaction` at commit or rollback, which ends fence admissions (H3); the keyring gives `tombstone`, `destroy`, `markStep` and `acknowledge` a transaction only from its own `KeyStore.transaction` or its own handlers, never a caller's (K3) (CCR-KR-008)<br>0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-KR-004: `tombstone`, `destroy`, `markStep` and `acknowledge` write in an ambient `KeyStore.transaction` when one is present, committed with it, so a handler on a database shared with the outbox never waits on a second writer (B5); `KeyStore.tombstones` lists every tombstone for the store-swap participant (B6); BEH-KR-008: the plugin registers that participant when `store.transaction` is given (B6); `KeyStore.transaction` keeps its signature and ends the fence admissions taken on it as the durable-bus adapter does (H2) (CCR-KR-007)<br>0.7 (2026-11-10): BEH-KR-004: `KeyStore` gains `acknowledge`, `acknowledgements` and `unacknowledged` for callback and host acknowledgements and each callback's cursor (K1); BEH-KR-008 declares `NonceSource`, `KeyringPorts`, `Keyring.plugin` and `KeyringConfigError` (PL2) (SPEC-AUDIT-04) (CCR-KR-006)<br>0.6 (2026-11-10): BEH-KR-004 declares `WrappedKey` and `SubjectKeys`; BEH-KR-005 declares the `KeyWrapper` port, whose failures are `KeyStoreUnavailable`; BEH-KR-006: `rewrap` handles only the versions listed at its start, returns a `RewrapReport` naming the versions it could not re-wrap, and a wrap failure of one version does not end the call (M24) (CCR-KR-005)<br>0.5 (2026-11-10): `rotate` and `rewrap`, required by BEH-KR-006, added to `KeyringShape` (BEH-KR-002) and to the members of the `Keyring` contract (BEH-KR-008) (P10); follow-up: BEH-KR-004 `KeyStore` gains `wrappedUnder` and the compare-and-set `replaceWrapped` (`WrappedKeyChanged`), which BEH-KR-006 `rewrap` uses (CCR-KR-004)<br>0.4 (2026-11-09): Specification audit of 2026-11-09 (M-01) — BEH-KR-004: `tombstone` stores the shred's attribution with it, and no field of a tombstone changes afterwards; `markStep` changes the step state only (M-01); BEH-KR-008: `Keyring` is declared with core `Contract.local` and never crosses a host (core CCR-BR-033) (CCR-KR-003)<br>0.3 (2026-11-08): BEH-KR-004 `KeyStore` gains `markStep`, `incompleteShreds`, optional `holders` and an optional outbox-sharing `transaction` for resumable shreds; Open (2) moved to a stated limit (CCR-KR-002)<br>0.2 (2026-11-08): BEH-KR-002 and 008 cite URS-BR-058 (registered by core CCR-BR-027) (CCR-KR-001)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

This file specifies subjects, per-subject data keys, encryption with
authenticated data, the `KeyStore`, `KeyWrapper` and `NonceSource` ports,
rotation, backup obligations, the keyring plugin and access through core
grants. This file owns
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
  readonly rotate: (subject: string) => Effect.Effect<KeyHandle, KeyShredded | SubjectInvalid | KeyStoreUnavailable>   // BEH-KR-006: the new current handle
  readonly rewrap: (kekId: string) => Effect.Effect<RewrapReport, KeyStoreUnavailable>                                 // BEH-KR-006
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
  readonly tombstone: (subject: string, t: Tombstone) => Effect.Effect<void, KeyStoreUnavailable>    // 03, BEH-KR-018: with its attribution
  readonly destroy: (subject: string) => Effect.Effect<void, KeyStoreUnavailable>                     // 03
  readonly markStep: (subject: string, shredId: string, step: ShredStep) => Effect.Effect<void, KeyStoreUnavailable>  // 03, BEH-KR-017
  readonly incompleteShreds: Effect.Effect<readonly Tombstone[], KeyStoreUnavailable>                 // tombstones with a pending step
  readonly tombstones: Effect.Effect<readonly Tombstone[], KeyStoreUnavailable>                       // every tombstone; 03, BEH-KR-020 (store swap)
  readonly holders?: (subject: string) => Effect.Effect<readonly string[], KeyStoreUnavailable>       // hosts the consumer gave the key to (BEH-KR-021)
  // BEH-KR-006: rewrap. Every live key version whose `wrapped.kekId` is `kekId`, tombstoned subjects excluded
  readonly wrappedUnder: (kekId: string) => Effect.Effect<readonly StoredKeyVersion[], KeyStoreUnavailable>
  // BEH-KR-006: compare-and-set; replaces the version's wrapped key only while it still equals `expected`
  readonly replaceWrapped: (subject: string, version: number, expected: WrappedKey, next: WrappedKey) =>
    Effect.Effect<void, KeyStoreUnavailable | KeyShredded | WrappedKeyChanged>
  // 03, BEH-KR-019, BEH-KR-020: acknowledgements of a shred, kept beside its tombstone, never in it
  readonly acknowledge: (subject: string, shredId: string, by: ShredAcknowledger) => Effect.Effect<void, KeyStoreUnavailable>
  readonly acknowledgements: (subject: string, shredId: string) => Effect.Effect<readonly ShredAcknowledger[], KeyStoreUnavailable>
  // a callback's cursor: every tombstone the callback has not acknowledged, in the order the tombstones were written
  readonly unacknowledged: (callback: string) => Effect.Effect<readonly Tombstone[], KeyStoreUnavailable>
  // present only when the KeyStore's database is the durable-bus outbox's: a transaction the OutboxStore accepts,
  // whose StoreTransaction runs its `onEnd` effects at commit or rollback, which ends every DurableBus.fence
  // admission taken on it (durable-bus BEH-DB-009, BEH-DB-054, property 8)
  readonly transaction?: <A, E, R>(effect: Effect.Effect<A, E, R | StoreTransaction>) => Effect.Effect<A, E | KeyStoreUnavailable, Exclude<R, StoreTransaction>>
}
type ShredStep = "destroyed" | "noticed"
type ShredAcknowledger = { readonly callback: string } | { readonly host: string }   // a callback name; a host's node id
interface WrappedKey { readonly kekId: string; readonly bytes: string }   // a data key wrapped by the KeyWrapper (BEH-KR-005); base64url
interface SubjectKeys {                                                    // a live subject: every version kept until shred (BEH-KR-006)
  readonly subject: string
  readonly current: number                                                 // the version `encrypt` uses
  readonly versions: readonly StoredKeyVersion[]
}
interface StoredKeyVersion { readonly subject: string; readonly keyId: string; readonly version: number; readonly wrapped: WrappedKey }
class WrappedKeyChanged extends Schema.TaggedError<WrappedKeyChanged>()("WrappedKeyChanged", {
  subject: Schema.String, version: Schema.Number            // the stored wrapped key is no longer `expected`; nothing was changed
}) {}
```

```
REQUIREMENT: A `KeyStore` MUST store only wrapped keys, MUST make `create`
             fail with `KeyShredded` for a tombstoned subject (atomically
             with the tombstone check), and after `destroy` MUST hold no
             copy of the subject's wrapped keys in its live data. It MUST
             document how deleted rows are removed from the engine's files
             (vacuum, compaction) and in what time. `tombstone`, `destroy`,
             `markStep` and `acknowledge`, when given a `KeyStore.transaction`
             in their environment (the `StoreTransaction` of the `KeyStore`'s
             database, which the transaction of the keyring's own
             subscription handlers is when that database is the outbox's,
             03, BEH-KR-020), MUST write in that transaction and are
             committed with it; without one, `markStep` and `acknowledge`
             MUST be committed to the store before they return. The keyring
             gives them such a transaction only from a `KeyStore.transaction`
             it opened itself or from one of its own subscription handlers;
             no caller's transaction reaches them, since `shred` ignores an
             ambient transaction (03, BEH-KR-017).
```

```
REQUIREMENT: `tombstone` MUST store every field of the `Tombstone` it is
             given, its `attribution` included (03, BEH-KR-018), and
             `get`, `incompleteShreds` and `tombstones` MUST return them
             unchanged. A
             `KeyStore` MUST NOT change or remove any field of a stored
             tombstone; `markStep` MUST change only its `steps`.
```

```
REQUIREMENT: `acknowledge` MUST be committed to the store before it
             returns, or with the ambient `KeyStore.transaction` when one is
             present (above), MUST change nothing when the same acknowledgement is
             already stored, and MUST NOT change any field of the tombstone.
             `acknowledgements(subject, shredId)` MUST return every
             acknowledgement committed for that shred, and
             `unacknowledged(callback)` every tombstone with no committed
             acknowledgement by that callback, so that acknowledgements and
             cursors survive a restart (03, BEH-KR-019, BEH-KR-021).
```

```
REQUIREMENT: `wrappedUnder(kekId)` MUST return every key version in the
             store's live data whose wrapped key names `kekId`, and none of
             a tombstoned subject. `replaceWrapped` MUST, atomically,
             replace the wrapped key of that subject's `version` with `next`
             only while the stored one equals `expected`, and MUST change no
             other field (`keyId`, `version`); otherwise it MUST change
             nothing and fail with `WrappedKeyChanged { subject, version }`
             when the stored wrapped key differs or the version is absent,
             and with `KeyShredded` when the subject is tombstoned. Like
             `create`, it MUST check the tombstone in the same atomic step.
```

## BEH-KR-005: KeyWrapper — the key-encryption key stays outside the store

> **See:** [ADR-KR-004](../decisions/004-key-custody-is-an-obligation.md)
> **Risk:** [RSK-KR-005](../risks.md#rsk-kr-005)

```ts
// illustrative — not type-checked
interface KeyWrapper {                     // the application's adapter: a hardware module or a key-management service
  readonly kekId: Effect.Effect<string, KeyStoreUnavailable>                          // the current wrapping key
  readonly wrap: (dataKey: Uint8Array) => Effect.Effect<WrappedKey, KeyStoreUnavailable>   // under the current key
  readonly unwrap: (wrapped: WrappedKey) => Effect.Effect<Uint8Array, KeyStoreUnavailable>
  // optional: re-wrap under the current key inside the wrapper, the data key never leaving it
  readonly rewrap?: (wrapped: WrappedKey) => Effect.Effect<WrappedKey, KeyStoreUnavailable>
}
```

```
REQUIREMENT: Data keys MUST be wrapped by a `KeyWrapper` before reaching the
             `KeyStore`. A wrapper that cannot wrap or unwrap (its service
             unreachable, its key disabled or destroyed) MUST fail with
             `KeyStoreUnavailable` naming the wrapper in `message`; a key
             unwrapped for `decrypt` is held only for that call. Documentation MUST
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
             supports that (`KeyWrapper.rewrap`); otherwise with `unwrap`
             and `wrap`.
```

```
REQUIREMENT: `rewrap(kekId)` MUST read the versions to re-wrap with
             `KeyStore.wrappedUnder(kekId)` and store each re-wrapped key
             with `KeyStore.replaceWrapped`, passing the wrapped key it read
             as `expected`. A `WrappedKeyChanged` or `KeyShredded` for a
             version (re-wrapped, or its subject shredded, meanwhile) MUST
             NOT fail the call: that version is skipped. It MUST handle
             only the versions of one listing, taken at its start, and MUST
             NOT list again, so that it ends whatever is written meanwhile.
             A `KeyStoreUnavailable` from the wrapper for one version MUST
             NOT fail the call either: that version is left as it is and
             reported in `failed`, and the call goes on with the next. It
             MUST succeed at once, changing nothing, when `kekId` is the
             wrapper's current `kekId`. It fails only with a
             `KeyStoreUnavailable` from the `KeyStore` or from reading the
             wrapper's `kekId`; versions already replaced stay replaced,
             and a repeated `rewrap(kekId)` completes the rest. Documentation MUST state that a version
             written under `kekId` after the listing, or reported in
             `failed`, stays under `kekId` until `rewrap(kekId)` is run
             again, and that the old wrapping key must not be retired
             while `wrappedUnder(kekId)` still lists a version.
```

```ts
// illustrative — not type-checked
interface RewrapReport {
  readonly kekId: string                   // the wrapper's current kekId, under which versions were re-wrapped
  readonly rewrapped: number
  readonly skipped: number                 // WrappedKeyChanged or KeyShredded: re-wrapped or shredded meanwhile
  readonly failed: readonly { readonly subject: string; readonly version: number; readonly message: string }[]   // the wrapper failed
}
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
REQUIREMENT: The `Keyring` service MUST be declared with core
             `Contract.local` (core BEH-BR-225) listing its members `key`,
             `encrypt`, `decrypt`, `rotate`, `rewrap`, `shred`, `onShred` and
             `shredStatus`, and provided by a plugin, so that `decrypt`,
             `rotate`, `rewrap` and `shred` can be granted per plugin
             (BEH-BR-273) and a grant withdrawn through
             `CapabilityPolicy.changes` narrows live captures (BEH-BR-281).
             Arguments that reach the call log MUST be limited to subject,
             key id and member; plaintext and ciphertext MUST NOT.
```

```
```ts
// illustrative — not type-checked
interface NonceSource { readonly bytes: (length: number) => Effect.Effect<Uint8Array> }   // 02, BEH-KR-015: cryptographic in production
interface KeyringPorts {                     // the application's adapters; the same value is given to the plugin and to the codec (02, BEH-KR-009)
  readonly store: KeyStore
  readonly wrapper: KeyWrapper
  readonly nonces: NonceSource
}
declare const Keyring: {
  readonly plugin: (options: KeyringPorts & {
    readonly id?: string                                  // default "bridger/keyring"; prefixes its subscription names (03, BEH-KR-020)
    // the durable-bus storage adapter's transaction that publishes the notice when `store.transaction` is absent (03, BEH-KR-017)
    readonly noticeTransaction?: InboxStore["transaction"]
  }) => Plugin<readonly [typeof DurableBus], readonly [typeof Keyring], KeyringConfigError, void>
}
class KeyringConfigError extends Schema.TaggedError<KeyringConfigError>()("KeyringConfigError", { reason: Schema.String }) {}
```

```
REQUIREMENT: `Keyring.plugin(options)` MUST return an ordinary plugin
             definition that requires `DurableBus`, provides `Keyring` and
             takes its ports as values in `options`, since a plugin's
             `build` cannot require the application's adapters (core
             BEH-BR-002). Its build MUST fail with `KeyringConfigError`
             when neither `store.transaction` nor `noticeTransaction` is
             given. It MUST register the subscriptions of 03, BEH-KR-020,
             and, when `store.transaction` is given, its durable-bus
             `onStoreSwap` participant (03, BEH-KR-020), in the activation's
             scope, and MUST resume incomplete shreds
             (03, BEH-KR-017) and call the redaction callbacks (03,
             BEH-KR-019) in fibers forked with `Plugin.Runtime.background`.
             Documentation MUST state
             that a host installs one keyring plugin, and that the same
             `KeyringPorts` value MUST be given to `Keyring.fields` (02,
             BEH-KR-009), so that the codec and the plugin read one
             `KeyStore`.
```

```
REQUIREMENT: The contract is local, and every major of `Keyring` MUST stay
             local (core BEH-BR-225): `onShred` takes a callback and a
             scope, and `decrypt` returns plaintext that the package keeps
             off any wire it does not control. It MUST NOT be served to
             another host, provided from a peer or turned into a wire
             artifact; a boundary companion refuses it on `local` (core
             BEH-BR-232). Keys stay in the local `KeyStore` (README, stated
             limit 2); documentation MUST say so.
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
