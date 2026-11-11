# 03 — Shred and Acceptance

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KR-BEH-03                                            |
> | Revision       | 0.8                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.8 (2026-11-11): Specification audit of 2026-11-11 (SPEC-AUDIT-05) — BEH-KR-017: a publish that fails on the one-transaction path runs step 1 again alone and leaves the notice pending; the pending-notice list adds `OutboxFrozen`, `AccessRefused` and `DowncastRefused`; the error union is unchanged (B4); BEH-KR-020: the applying and acknowledgement handlers write the `KeyStore` in their own transaction when the `KeyStore` shares the outbox database (B5); an `onStoreSwap` participant keeps tombstones, pending steps and acknowledgements across a whole-store install (B6); checks 10–12 extended (CCR-KR-007)<br>0.7 (2026-11-10): BEH-KR-019: acknowledgements and callback cursors are stored with the `KeyStore` (K1); BEH-KR-020: subscriptions named `<id>/shred-apply`, `<id>/shred-refused` and `<id>/shred-ack` (PL2), and a notice for a subject tombstoned under another `shredId` writes nothing, resumes steps 2 and 4 and is acknowledged with its own `shredId` (K2); checks 10, 11 and 12 extended (SPEC-AUDIT-04) (CCR-KR-006)<br>0.6 (2026-11-10): BEH-KR-020: only a refused (unattributed) notice is parked, through a refusal subscription of its own; a notice that meets `KeyStoreUnavailable` halts the applying subscription, never parked, and resumes on plugin start or `DurableBus.resume` (M22); `SubjectShredAcknowledged` loses `host`, the acknowledging host is taken from the envelope's origin, and the `AccessPolicy` obligation covers the acknowledgement as well as the notice (M23); checks 4 and 12 extended (CCR-KR-005)<br>0.5 (2026-11-10): BEH-KR-020: a received notice whose envelope actor a local shred would refuse is not applied (`ShredUnattributed`, parked); the `AccessPolicy` rules that keep the notice's event type to the keyring plugin and to trusted origins are a stated obligation; checks 7 and 12 extended (P12; key-store outage on decode); follow-up: BEH-KR-024 checks 3 and 4 cover `wrappedUnder`, `replaceWrapped` and `rewrap` (BEH-KR-004, BEH-KR-006) (CCR-KR-004)<br>0.4 (2026-11-09): Specification audit of 2026-11-09 (M-01) — a shred requires an attributed actor (`ShredUnattributed`); the tombstone keeps the shred's actor, `onBehalfOf`, correlation, reason and origin, written once and never changed; the notice carries the reason and time and is published under the shred's context, and a receiving host keeps the origin's attribution as a claim; the receipt exposes the attribution; checks 10 and 12 extended (CCR-KR-003)<br>0.3 (2026-11-08): BEH-KR-017 persists step state, resumes incomplete shreds at start and on a repeated `shred`, opens its own transactions and commits the notice with the tombstone when the `KeyStore` shares the outbox; BEH-KR-020 and 021 report acknowledging and `KeyStore`-declared hosts only; BEH-KR-022 `notStated` names undeclared hosts; BEH-KR-024 checks 7, 10 and 12 extended (CCR-KR-002)<br>0.2 (2026-11-08): BEH-KR-017 cites URS-BR-058 (registered by core CCR-BR-027) (CCR-KR-001)<br>0.1 (2026-11-08): Initial draft (CCR-KR-001)                 |

---

This file specifies `shred(subject)` — its steps, the tombstone, redaction
callbacks, notices across hosts, the receipt — the limits of a shred, test
fixtures and the acceptance checks. This file owns BEH-KR-017–024 and uses
all eight.

Planned source: `packages/keyring/src/Shred.ts` *(Planned)*.

## BEH-KR-017: shred(subject) runs in a fixed order

> **Invariant:** [INV-KR-002](../invariants.md#inv-kr-002-after-a-shred-begins-the-keyring-neither-encrypts-nor-decrypts-for-the-subject), [INV-KR-004](../invariants.md#inv-kr-004-a-shred-changes-no-stored-byte)
> **See:** [ADR-KR-001](../decisions/001-shred-keys-never-rewrite-events.md)
> **Satisfies:** [URS-BR-058](../../core/urs.md#urs-br-058-make-a-subjects-personal-fields-unreadable-without-rewriting-history)
> **Core seam:** [22 — Attributable Operations](../../core/behaviors/22-attributable-operations.md) (BEH-BR-187, BEH-BR-189)
> **Risk:** [RSK-KR-006](../risks.md#rsk-kr-006)

```ts
// illustrative — not type-checked
declare const Keyring: {
  // the keyring opens its own transactions; the caller passes none (see below)
  readonly shred: (subject: string, options: { reason: string; context?: OperationContext }) =>
    Effect.Effect<ShredReceipt, SubjectInvalid | ShredUnattributed | KeyStoreUnavailable>
}
class ShredUnattributed extends Schema.TaggedError<ShredUnattributed>()("ShredUnattributed", { subject: Schema.String }) {}
interface ShredReceipt {
  readonly subject: string
  readonly shredId: string                   // IdGenerator
  readonly shreddedAt: string                // Clock
  readonly keyIds: readonly string[]
  readonly attribution: ShredAttribution     // as kept in the tombstone (BEH-KR-018)
  readonly steps: { readonly tombstone: "done"; readonly destroy: "pending" | "done"; readonly notice: "pending" | "done" }
  readonly status: "redaction-pending" | "shredded"
  readonly callbacks: readonly { name: string; state: "pending" | "acknowledged"; attempts: number }[]
  readonly hosts: readonly { host: string; state: "pending" | "acknowledged"; declared: boolean }[]   // BEH-KR-020, BEH-KR-021
  readonly notStated: readonly string[]      // BEH-KR-022, always present
}
```

```
REQUIREMENT: `shred` MUST (1) write the tombstone, after which `key`,
             `encrypt`, `decrypt` and the codec treat the subject as shredded
             (BEH-KR-018); (2) call `KeyStore.destroy`; (3) publish a shred
             notice (BEH-KR-020); (4) run the redaction callbacks
             (BEH-KR-019). It MUST NOT change a stored event, an outbox
             entry or a chain link. `shred` MUST return once step 1 has
             committed, with the receipt's `steps` as they stand; it fails
             only when step 1 fails (`KeyStoreUnavailable`), and then nothing
             was written. A failed publish that rolls step 1 back on the
             one-transaction path is not a failure of step 1: step 1 is run
             again alone (below).
```

```
REQUIREMENT: The state of steps 2 and 3 MUST be persisted with the tombstone
             (`KeyStore.markStep`, after each step succeeds), so that a shred
             interrupted by a failure or a crash is resumable. The keyring
             MUST resume every incomplete shred (`KeyStore.incompleteShreds`)
             from its first pending step when its plugin starts, MUST retry a
             failed step with bounded backoff while it runs, and MUST resume
             it on a repeated `shred` of the same subject before returning
             the receipt. Steps 2 and 3 MUST be idempotent: destroying
             destroyed keys succeeds, and a notice published twice carries
             the same `shredId`, which receivers apply once (BEH-KR-020).
```

```
REQUIREMENT: The keyring MUST open its own transactions. When the `KeyStore`
             offers `transaction` (its database is the durable-bus outbox's),
             the keyring MUST write the tombstone and publish the notice in
             that one transaction, so that step 3 commits with step 1 and
             `notice` is "done" from the start. When the publish fails there,
             the transaction rolls back with the tombstone; the keyring MUST
             then run step 1 again as a `KeyStore.transaction` that writes
             the tombstone only, and publish the notice afterwards as the
             two-transaction path does, in a later `KeyStore.transaction`,
             with `notice` "pending" while that publish fails. Otherwise it
             MUST publish the notice in a transaction of the durable-bus
             storage adapter that the keyring plugin is configured with, as
             a resumable step after step 1. On either path, a publish error
             (`EncodeFailed`, `PayloadEncodeFailed`, `OutboxWriteFailed`,
             `OutboxFrozen`, `AccessRefused`, `DowncastRefused`) leaves
             `notice` "pending" for the retry and is reported, never
             returned by `shred`, whose error union stays as declared.
```

```
REQUIREMENT: The shred's actor, `onBehalfOf` and correlation MUST be
             resolved as core resolves a call's (BEH-BR-187). A resolved
             actor that is `Actor.unattributed`, `Actor.system`, any actor
             whose `id` begins with "bridger:", or one whose `id` is empty
             or whitespace-only MUST fail the shred with
             `ShredUnattributed { subject }` before step 1, writing
             nothing, whatever core's `attribution.require` says (the rule
             core applies to `acknowledgeAuditDegraded`, BEH-BR-189): a
             shred makes retained fields unreadable, so who asked for it
             is never optional. `reason` MUST be non-empty and not
             whitespace-only, else the shred MUST fail with
             `SubjectInvalid` before step 1; documentation MUST state that
             it carries no personal data. Shredding a shredded subject
             MUST resume its pending steps as above and return its
             receipt; it MUST NOT write a second tombstone or change
             `shredId` or the tombstone's attribution, and the repeated
             call's own actor and reason are not recorded by the keyring.
```

## BEH-KR-018: The tombstone closes the subject

> **Invariant:** [INV-KR-003](../invariants.md#inv-kr-003-a-shredded-subject-never-gets-a-new-key)
> **See:** [ADR-KR-003](../decisions/003-a-shredded-subject-is-closed.md)
> **Risk:** [RSK-KR-006](../risks.md#rsk-kr-006)

```ts
// illustrative — not type-checked
interface Tombstone {
  readonly subject: string
  readonly shredId: string
  readonly shreddedAt: string                    // Clock of the host that shred first
  readonly keyIds: readonly string[]
  readonly attribution: ShredAttribution
  readonly steps: { readonly destroyed: boolean; readonly noticed: boolean }   // the only part markStep changes
}
interface ShredAttribution {
  readonly actor: Actor                          // core BEH-BR-185; on a receiving host, the origin's claim
  readonly onBehalfOf?: string                   // PrincipalRef.encode, when resolved
  readonly correlationId: string
  readonly reason: string
  readonly origin: string                        // durable-bus origin of the host that shred first, node#incarnation
  readonly received?: { readonly eventId: string; readonly receivedAt: string }   // set on a receiving host only
}
```

```
REQUIREMENT: A tombstone MUST be kept for the life of the `KeyStore`. While
             it exists, no key MUST be created for the subject; new data
             about the same person requires a new subject id chosen by the
             application.
```

```
REQUIREMENT: The tombstone MUST carry the shred's attribution: on the host
             that shred first, the resolved actor, `onBehalfOf` and
             correlation of BEH-KR-017, the `reason`, and the origin that
             `DurableBus.origin` returns when step 1 is written; on a
             receiving host, the values of BEH-KR-020. The `KeyStore` MUST
             write every field of the tombstone with step 1 and MUST NOT
             change any of them afterwards; `markStep` MUST change `steps`
             only (BEH-KR-004). The tombstone is the keyring's record of
             who shred the subject, when, why and from where. Documentation
             MUST state that it is not a core audit record (core
             BEH-BR-207), that the package does not protect it against
             change or deletion by whoever administers the `KeyStore`, and
             that a consumer who must keep shreds in its own audit trail
             writes them there from the receipt or a redaction callback.
```

## BEH-KR-019: Redaction callbacks drop plaintext

> **Invariant:** [INV-KR-005](../invariants.md#inv-kr-005-a-shred-is-reported-complete-only-after-every-callback-acknowledged)
> **Depends on:** [BEH-ES-019](../../event-store/behaviors/03-projections-and-snapshots.md#beh-es-019-async-projections-follow-positions-with-a-checkpoint-in-the-same-transaction)
> **Risk:** [RSK-KR-001](../risks.md#rsk-kr-001)

```ts
// illustrative — not type-checked
declare const Keyring: {
  readonly onShred: (name: string, redact: (subject: string, receipt: ShredReceipt) => Effect.Effect<void, RedactionFailed>) =>
    Effect.Effect<void, DuplicateCallback, Scope.Scope>
}
```

```
REQUIREMENT: Every registered callback MUST be called at least once per
             shred, with retries under bounded backoff until it succeeds;
             each acknowledgement MUST be recorded. Callbacks MUST be
             documented as idempotent. A callback registered after a shred
             MUST be called for every shred it has not acknowledged (its own
             cursor), so that a projection rebuilt or added later also drops
             plaintext.
```

```
REQUIREMENT: The keyring MUST record a callback's acknowledgement with
             `KeyStore.acknowledge(subject, shredId, { callback: name })`
             (01, BEH-KR-004) once the callback succeeds, and a host's, on
             the originating host, with `{ host: node }` (BEH-KR-020),
             before it counts either. A callback's cursor MUST be
             `KeyStore.unacknowledged(name)`: when a callback is registered
             and when the keyring plugin starts, the keyring MUST call it for
             every tombstone listed there. The receipt's `callbacks` and
             `hosts` states MUST be read from `KeyStore.acknowledgements`;
             `attempts` counts the attempts of the running process only.
```

## BEH-KR-020: Shred notices reach other hosts

> **Depends on:** [BEH-DB-017](../../durable-bus/behaviors/03-delivery-and-inbox.md#beh-db-017-the-relay-delivers-at-least-once-in-order)
> **Risk:** [RSK-KR-001](../risks.md#rsk-kr-001)

```
REQUIREMENT: `shred` MUST publish `SubjectShredded { subject, shredId,
             shreddedAt, keyIds, reason }` through durable-bus (BEH-KR-017
             step 3), under the shred's resolved context, so that the
             envelope's actor, `onBehalfOf` and correlation are the
             shred's (durable-bus BEH-DB-005, BEH-DB-006); a notice resumed
             at plugin start MUST be published under that same context,
             rebuilt from the tombstone. A keyring
             receiving it MUST apply steps 1, 2 and 4 of BEH-KR-017 locally,
             once per `shredId`, writing a tombstone whose attribution is
             the envelope's actor (a claim of the origin, durable-bus
             BEH-DB-006), its `onBehalfOf`, its correlation and its origin,
             the notice's `reason` and `shreddedAt`, and `received` with the
             envelope's `eventId` and the local `Clock`; and publish an
             acknowledgement `SubjectShredAcknowledged { subject, shredId }`.
             The originating keyring MUST take the acknowledging host from
             the acknowledgement envelope's `origin` — its node, without the
             incarnation (durable-bus BEH-DB-004) — never from the payload,
             and MUST count it only for a `shredId` of its own shred of that
             `subject`. The originating receipt's `hosts` MUST list every
             host that acknowledged, and every host the `KeyStore` declares
             through `holders(subject)` with `declared: true` and its state;
             `holders` MUST name hosts by the same node ids. The keyring
             keeps no record of key copies of its own: without `holders`,
             the receipt lists acknowledging hosts only.
```

```
REQUIREMENT: A received notice MUST pass the attribution rule of a local
             shred before any step: when the envelope's actor is one that
             BEH-KR-017 refuses (reserved, `bridger:` or blank) or its
             `reason` is blank, the keyring MUST NOT apply or acknowledge
             it and MUST log it at error level with the origin and
             `shredId`. The keyring MUST receive notices through two
             subscriptions: an applying one, named `<id>/shred-apply`
             (`id` the keyring plugin's, 01, BEH-KR-008) and registered
             with `onPoison: "halt"`, whose handler passes over a refused
             notice without any step; and a refusal one, named
             `<id>/shred-refused` and registered with `onPoison:
             "park-and-continue"` and `maxAttempts: 1`, whose handler fails
             with `ShredUnattributed { subject }` for a refused notice and
             does nothing for any other. A refused notice is so parked,
             visible and never applied, and later notices still arrive
             (durable-bus BEH-DB-021); no other notice is ever parked.
             The originating keyring MUST receive acknowledgements through
             a third subscription, named `<id>/shred-ack` and registered
             with `onPoison: "halt"`, whose handler records the
             acknowledgement (BEH-KR-019) and ignores one for a `shredId`
             that is not its own; a `KeyStoreUnavailable` there halts it as
             below. When the `KeyStore` offers `transaction`, the handler's
             `StoreTransaction` is a transaction of the `KeyStore`'s database
             and serves as the ambient `KeyStore.transaction` (01,
             BEH-KR-004): the applying and acknowledgement handlers MUST make their
             `KeyStore` writes (`tombstone`, `destroy`, `markStep`,
             `acknowledge`) in it, so that they commit with the inbox mark
             and never wait on a second writer of the same database.
```

```
REQUIREMENT: A received notice for a subject that already has a tombstone
             under another `shredId` (shred on this host, or received from
             another origin) MUST NOT write a tombstone or change the one
             stored: the keyring MUST resume steps 2 and 4 of that stored
             tombstone, which are idempotent, and MUST then publish
             `SubjectShredAcknowledged` with the notice's own `subject` and
             `shredId`, so that the originating receipt counts this host.
```

```
REQUIREMENT: When applying a notice fails with `KeyStoreUnavailable`, the
             applying subscription MUST retry it under the bus's backoff and
             then halt that (origin, stream) with its cursor before the
             notice (durable-bus BEH-DB-021), so that the notice is never
             parked or lost; the keyring MUST log the halt at error level
             with the origin and `shredId`. Processing resumes from that
             notice when the keyring plugin starts again and its handler
             registers under the same name, or when an operator calls
             `DurableBus.resume("<id>/shred-apply", origin, stream)` once the
             `KeyStore` can be read. Documentation MUST state that, until
             then, the subject stays readable on that host and later
             notices from that origin wait behind it.
```

```
REQUIREMENT: The grant on `shred` (BEH-KR-008) does not reach a notice or an
             acknowledgement: any code that can publish the notice's event
             type on a host makes every receiving keyring shred, and any
             code that can publish an acknowledgement makes a receipt list
             a host that did not shred. Documentation MUST therefore
             require the consumer's core `AccessPolicy` (core BEH-BR-269,
             durable-bus BEH-DB-053) to allow `{ kind: "emit", event,
             mode: "publish" }` for `SubjectShredded` and
             `SubjectShredAcknowledged` only to the keyring plugin's
             principal, on every host; the keyring's `{ kind: "listen",
             event: SubjectShredded, style: "delivery", origin }` only from
             the origins whose shreds the host accepts; and its `{ kind:
             "listen", event: SubjectShredAcknowledged, style: "delivery",
             origin }` only from the origins it sends its notices to. The
             keyring cannot check these rules itself; a received actor and
             origin stay claims of the sending node (durable-bus
             BEH-DB-006).
```

```
REQUIREMENT: A host restored from a backup MUST re-apply every received
             tombstone before it serves `decrypt` (BEH-KR-007).
```

```
REQUIREMENT: When the `KeyStore` offers `transaction`, a whole-store
             re-bootstrap install (durable-bus BEH-DB-048) replaces it with
             the outbox's database. The keyring plugin MUST therefore
             register a durable-bus `onStoreSwap` participant, named
             `<id>/store-swap`, whose `prepare` reads, from the store about
             to be replaced, every tombstone (`KeyStore.tombstones`, with its
             pending steps) and every acknowledgement of each
             (`KeyStore.acknowledgements`). From `prepare` on, the keyring
             MUST treat every subject so read as shredded for `key`,
             `encrypt`, `decrypt` and the codec (INV-KR-002). After the
             `OriginChange` (durable-bus BEH-DB-004), and before it serves
             `decrypt` for any subject, the keyring MUST re-apply them to the
             new store in one `KeyStore.transaction`: write each tombstone
             the new store lacks for its subject, with `destroyed` false so
             that step 2 destroys any key the new store holds and with its
             other steps as read, leave a tombstone the new store holds
             under another `shredId` as it is (as a received notice does,
             above), and record each acknowledgement again; then it resumes
             every pending step (BEH-KR-017). A re-apply that fails with
             `KeyStoreUnavailable` MUST be retried under bounded backoff,
             with the subjects still treated as shredded. Documentation MUST
             state that what `prepare` read is lost if the process stops
             before the re-apply has committed (durable-bus BEH-DB-048), and
             that the restored-host rule above then applies.
```

## BEH-KR-021: Status and receipt

> **Invariant:** [INV-KR-005](../invariants.md#inv-kr-005-a-shred-is-reported-complete-only-after-every-callback-acknowledged)

```
REQUIREMENT: `shredStatus(subject)` MUST return the receipt with status
             "redaction-pending" until steps 2 and 3 are "done", every
             callback registered at the shred has acknowledged, and every
             host the `KeyStore` declares as a holder has acknowledged; and
             "shredded" afterwards. "shredded" MUST NOT be read as covering
             hosts the `KeyStore` did not declare; `notStated` says so
             (BEH-KR-022).
```

## BEH-KR-022: The limits of a shred are stated in every receipt

> **See:** [ADR-KR-004](../decisions/004-key-custody-is-an-obligation.md)
> **Risk:** [RSK-KR-003](../risks.md#rsk-kr-003)

```
REQUIREMENT: Every receipt MUST carry `notStated`, listing what the shred
             did not reach: key copies outside the `KeyStore`; backups not
             yet expired; plaintext outside registered callbacks; hosts that
             hold the key but were not declared by the `KeyStore`'s
             `holders` (all hosts other than acknowledging ones, when
             `holders` is absent); unencrypted metadata. Documentation,
             type comments and logs MUST NOT describe a shred as erasure,
             irreversible or permanent, and MUST NOT claim that it satisfies
             a data-protection law.
```

## BEH-KR-023: Test fixtures

```
REQUIREMENT: The testing entry point MUST export `memoryKeyStore`,
             `fixedNonces`, a `scriptedCallback` (fails n times, hangs) and
             `assertNoPlaintext(bytes, values)`, which fails when any of the
             given plaintext values appears in stored rows, outbox entries,
             chain entries, call-log entries or captured logs.
```

## BEH-KR-024: Required acceptance checks

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following (planned acceptance scenarios
             REQ-KR-001–012, traceability §2):
             1. Subjects and handles: grammar; no public key material
                (BEH-KR-001, BEH-KR-002).
             2. Cipher: authentication failures for changed ciphertext,
                nonce, key id or `aad` (BEH-KR-003, BEH-KR-011).
             3. KeyStore: wrapped keys only; create refused after a
                tombstone; destroy leaves no live copy; `wrappedUnder` lists
                no tombstoned subject; `replaceWrapped` with a stale
                `expected` fails with `WrappedKeyChanged` and after a
                tombstone with `KeyShredded`, changing nothing (BEH-KR-004,
                BEH-KR-005).
             4. Rotation and rewrap: old versions decrypt; new writes use the
                newest; after `rewrap(kekId)` no version is listed under
                `kekId` and every version still decrypts; a rewrap racing a
                rotate or a shred completes without error and lists no
                second time; a wrapper failing for one version leaves it in
                `failed` and the others re-wrapped; one interrupted by
                `KeyStoreUnavailable` from the `KeyStore` is completed by a
                repeated call (BEH-KR-005, BEH-KR-006).
             5. Grants and call log: `decrypt` refused without a grant;
                no plaintext or ciphertext in call-log entries (BEH-KR-008).
             6. Codec: selected fields encrypted, others unchanged, unlisted
                types untouched; `assertNoPlaintext` over store, outbox and
                logs (BEH-KR-009, BEH-KR-010, BEH-KR-013, BEH-KR-016).
             7. After shred: reads yield `Shredded`; encoding plaintext fails
                with `KeyShredded`; encoding an existing marker stores it
                without a key, so a late fact about the subject is recorded
                (event-store BEH-ES-030); replays and projections continue;
                an upcaster passes a marker through; a key-store outage
                fails the decode with `PayloadDecodeFailed`, never a marker
                or `PayloadUnreadable` (BEH-KR-009, BEH-KR-012).
             8. Chains: a chain over stored events verifies before and after
                a shred, byte-identical stored rows (BEH-KR-014).
             9. Determinism with `fixedNonces` (BEH-KR-015).
             10. Shred order; a crash after the tombstone and before
                 `destroy`, and one before the notice, are resumed at plugin
                 start and by a repeated `shred`; with an outbox-sharing
                 `KeyStore` the tombstone and the notice commit together,
                 and a publish that fails there (`OutboxFrozen`,
                 `AccessRefused`, `OutboxWriteFailed`) leaves a committed
                 tombstone with `notice` "pending", `shred` returning its
                 receipt;
                 a second shred keeps `shredId` and the first attribution;
                 a shred by a reserved or blank actor fails with
                 `ShredUnattributed` and a blank reason with
                 `SubjectInvalid`, writing nothing; the tombstone and the
                 receipt carry the actor, `onBehalfOf`, correlation,
                 reason and origin, and `markStep` changes only `steps`;
                 `Keyring.plugin` fails with `KeyringConfigError` without
                 `store.transaction` or `noticeTransaction` (BEH-KR-008,
                 BEH-KR-017, BEH-KR-018).
             11. Callbacks: at least once, retried, late-registered callback
                 catches up; status "redaction-pending" until all
                 acknowledge; callback and host acknowledgements and a
                 callback's cursor survive a restart, and an
                 acknowledgement recorded twice changes nothing; with an
                 outbox-sharing `KeyStore` on a single-writer engine, the
                 acknowledgement handler records a host's acknowledgement
                 in its own transaction, without blocking or halting
                 (BEH-KR-004, BEH-KR-019, BEH-KR-020, BEH-KR-021).
             12. Notices and limits: a second host applies a notice once even
                 when it arrives twice, and its tombstone keeps the origin's
                 actor, correlation, origin, reason and `shreddedAt` with
                 `received`; a resumed notice carries the shred's actor and
                 correlation; a notice under a reserved or blank actor, or
                 with a blank reason, is parked by the refusal subscription
                 and not applied, while the applying subscription goes on;
                 a notice that meets `KeyStoreUnavailable` halts the
                 applying subscription, is never parked, and is applied
                 after `DurableBus.resume` of `<id>/shred-apply`; a notice
                 for a subject tombstoned under another `shredId` writes
                 no tombstone and is acknowledged with its own `shredId`,
                 so that its originator's receipt reaches "shredded"; with the documented
                 `AccessPolicy`, a notice or an acknowledgement published
                 by another plugin is refused with `AccessRefused` and one
                 from an origin the policy does not accept is not applied;
                 the receipt lists acknowledging hosts by the node of
                 their envelope's origin, and declared hosts; a restored host re-applies tombstones; a
                 whole-store install whose snapshot lacks a tombstone leaves
                 the subject shredded, its keys destroyed and its
                 acknowledgements kept, with no `decrypt` served for it in
                 between; every
                 receipt lists `notStated`; wording lint (BEH-KR-020,
                 BEH-KR-021, BEH-KR-022, BEH-KR-023).
```

**Settled here.** (1) Tombstone first, then destroy, notify, redact; the
steps are persisted and resumed, and the notice commits with the tombstone
when the `KeyStore` shares the outbox's database (BEH-KR-017). (2) A shredded subject is closed (BEH-KR-018), and its tombstone says who
shred it, when, why and from which origin; the record stays in the keyring
rather than in core's audit trail, because a shred is not a host lifecycle
operation (core BEH-BR-193), and it travels with the notice so that every
receiving host keeps the same account. (3) Callbacks are
at least once with their own cursor (BEH-KR-019). (4) Every receipt states
what the shred did not reach (BEH-KR-022).

**Open.** (1) A deadline after which a shred with unacknowledged callbacks
raises an alert. (2) A signed receipt for an external requester.

---

_Previous: [02 — Field encryption](./02-field-encryption.md)_ · _Next: [Invariants](../invariants.md)_
