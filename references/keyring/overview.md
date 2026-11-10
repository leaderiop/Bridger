# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-OVW                                               |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview (companion)              |
> | Change History | 0.6 (2026-11-10): API rows for `KeyringPorts`, `Keyring.plugin`, the `KeyStore` acknowledgement members and `Keyring.fields(ports, spec)`; worked example installs the plugin (K1, PL2) (SPEC-AUDIT-04) (CCR-KR-006)<br>0.5 (2026-11-10): `Keyring.rewrap` returns a `RewrapReport`; `KeyWrapper`, `WrappedKey` and `SubjectKeys` declared (M24) (CCR-KR-005)<br>0.4 (2026-11-10): API rows `Keyring.rotate` and `Keyring.rewrap` (P10) (CCR-KR-004)<br>0.3 (2026-11-09): `Keyring.shred` keeps the shred's attribution in the tombstone and fails with `ShredUnattributed` without an attributed actor (M-01); `Keyring` is a local contract (core CCR-BR-033) (CCR-KR-003)<br>0.2 (2026-11-08): Limit 5: no key distribution, and what a host without keys does; receipt covers acknowledging and declared hosts only (CCR-KR-002)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

## Mission

Append-only stores, outboxes and hash chains never rewrite what they hold —
that is what makes them reviewable. A request to remove a person's data then
has no good answer: deleting events breaks streams and chains; keeping them
keeps the data. Crypto-shredding is the usual answer: encrypt each subject's
personal fields with a key of their own, and destroy the key when the data
must go. `@bridger/keyring` specifies that mechanism for Bridger systems:

- **per-subject data keys** — `Keyring.key(subject)` returns a handle to the
  subject's current key, created on first use; key material never leaves the
  keyring's API;
- **field encryption** — a durable-bus `PayloadCodec` that replaces the
  application's selected fields with an encrypted form, so the same
  ciphertext is stored, published and chained;
- **shred** — `shred(subject)` records a tombstone, destroys the subject's key
  copies in the `KeyStore`, and calls the redaction callbacks that
  projections and caches registered, until each has acknowledged;
- **verifiable chains** — chains hash the stored form, which holds only
  ciphertext for selected fields, so they verify before and after a shred;
- **obligations** — key storage, wrapping, rotation and backups are stated as
  obligations of the adapters and the consumer, not provided.

## Package boundary

| Package | Relationship |
| ------- | ------------ |
| `@bridger/core` | Dependency: contracts, grants, call log, attribution. Core never sees plaintext or keys of this package. |
| `@bridger/durable-bus` | Dependency: the `PayloadCodec` port this package implements; delivery of shred notices. |
| `@bridger/event-store` | Consumer: stores payloads through the codec; projections register redaction callbacks. |
| `@bridger/audit-chain` | Unaffected: chains over stored forms hash ciphertext. |
| `KeyStore`, `KeyWrapper` adapters | The consumer's: a database table with keys wrapped by a key held in a hardware module or a key-management service. |

Planned source: `packages/keyring/src/` *(Planned)*, testing entry point
`@bridger/keyring/testing` *(Planned)*.

## Public API surface

All signatures are illustrative until code exists.

| Export | Kind | Purpose | Behaviour |
| ------ | ---- | ------- | --------- |
| `Keyring` | service (local contract, `Contract.local`) | Provided by the keyring plugin; never crosses a host | [01](./behaviors/01-keys-and-subjects.md) |
| `Keyring.key(subject)` | member | The subject's current key handle | [01](./behaviors/01-keys-and-subjects.md) |
| `Keyring.encrypt`, `Keyring.decrypt` | members | Bytes in, bytes out, with authenticated data | [01](./behaviors/01-keys-and-subjects.md) |
| `Keyring.rotate(subject)`, `Keyring.rewrap(kekId)` | members | A new data-key version for later writes, earlier versions kept until shred; the versions listed at the call's start re-wrapped under the wrapper's current key, with a `RewrapReport` naming those it could not re-wrap | [01](./behaviors/01-keys-and-subjects.md) |
| `KeyStore`, `KeyWrapper`, `NonceSource` | ports | Wrapped key storage (`WrappedKey`, `SubjectKeys`), with shred acknowledgements and each callback's cursor (`acknowledge`, `acknowledgements`, `unacknowledged`); key-encryption key (`kekId`, `wrap`, `unwrap`, optional `rewrap`); randomness (`bytes`) | [01](./behaviors/01-keys-and-subjects.md) |
| `KeyringPorts`, `Keyring.plugin(options)` | type, plugin definition | The application's `KeyStore`, `KeyWrapper` and `NonceSource`, one value for the plugin and the codec; the plugin requires `DurableBus`, provides `Keyring`, and registers the subscriptions `<id>/shred-apply`, `<id>/shred-refused` and `<id>/shred-ack` (`KeyringConfigError` without a way to publish the notice) | [01](./behaviors/01-keys-and-subjects.md), [03](./behaviors/03-shred-and-acceptance.md) |
| `Keyring.fields(ports, spec)` | function | A `PayloadCodec` encrypting selected fields of one event type | [02](./behaviors/02-field-encryption.md) |
| `Encrypted<A>`, `Shredded` | types | A field as stored; a field whose key is gone | [02](./behaviors/02-field-encryption.md) |
| `Keyring.shred(subject, options)` | member | Tombstone with the shred's actor, correlation, reason and origin; destroy, notify, redact; `ShredUnattributed` without an attributed actor | [03](./behaviors/03-shred-and-acceptance.md) |
| `Keyring.onShred(name, redact)` | member | Register a redaction callback | [03](./behaviors/03-shred-and-acceptance.md) |
| `Keyring.shredStatus(subject)` | member | Status and receipt | [03](./behaviors/03-shred-and-acceptance.md) |
| `memoryKeyStore`, `fixedNonces` | fixtures | Testing entry point only | [03](./behaviors/03-shred-and-acceptance.md) |

## Worked example

```ts
// illustrative — not type-checked
import { Keyring } from "@bridger/keyring"

// The application decides which fields are personal and whose they are.
const ContactAdded = DurableEvent.make("app/ContactAdded", Schema.Struct({
  contactId: Schema.String,                       // opaque id, not personal data
  name: Keyring.Field(Schema.String),             // Encrypted on the wire, string | Shredded when read
  phone: Keyring.Field(Schema.String)
}), { version: 1 })

const ports = { store: keyStore, wrapper: kmsWrapper, nonces: cryptoNonces }   // the application's adapters
const codec = Keyring.fields(ports, {
  event: ContactAdded,
  subject: (payload) => `contact:${payload.contactId}`,
  fields: ["name", "phone"]
})

// The same codec is given to the event store and to the bus (one encoded payload).
const Stores = EventStore.layer({ codec }).pipe(Layer.provide(DurableBus.layer({ codec })))

// The keyring plugin, over the same ports; the KeyStore here shares the outbox's database.
yield* host.install(Keyring.plugin(ports))

// A projection that holds plaintext registers how to drop it.
yield* Keyring.onShred("app/contacts-view", (subject) => contactsView.redact(subject))

// Later, on the application's decision:
const receipt = yield* Keyring.shred("contact:42", { reason: "subject-request" })
// receipt.status: "redaction-pending" until every callback has acknowledged, then "shredded"
```

## What stays in core

Contracts, grants, the call log, attribution and annotations. Core's audit
`reason`, annotations and call-log entries must carry no personal data: that
is the application's discipline, which this package states and cannot enforce
(BEH-KR-008).

## What stays in the application

- Which fields are personal data, which subject each belongs to, and the
  subject id scheme (ADR-KR-005).
- When to shred, and the reasons; weighing a shred against any duty to retain
  a record.
- The `KeyStore`, `KeyWrapper` and backup arrangements, and the evidence that
  they meet the obligations (ADR-KR-004).
- Redaction callbacks for every place that holds plaintext.

## Limits

1. A shred reaches only key copies held by the `KeyStore` and plaintext held
   by registered callbacks.
2. Backups of the `KeyStore` keep a destroyed key until they expire; a shred
   is complete for backups only when the last backup holding the key is gone
   (BEH-KR-007).
3. Unencrypted metadata (stream ids, subject ids, event types, timing) stays
   readable.
4. Ciphertext is as strong as its algorithm and key custody; a future break of
   the algorithm, or a copied key, undoes a shred for the data concerned.
5. The package distributes no key. A host can read a selected field only if
   its `KeyStore` holds the subject's key or tombstone; a host that receives
   encrypted events without keys records them verbatim or halts the receiving
   subscription (BEH-KR-012, event-store BEH-ES-030). A shred reaches another
   host only through its notice, and the receipt covers only hosts that
   acknowledged or that the `KeyStore` declares (BEH-KR-020, BEH-KR-021).

---

_Previous: [README](./README.md)_ · _Next: [01 — Keys and subjects](./behaviors/01-keys-and-subjects.md)_
