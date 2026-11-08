# 04 — Generic Chain over Any Append-Only Stream

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-BEH-04                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): Round-2 agent review (R3-06, R3-07, R3-09; R5-08): `ChainLinkV2` with `seriesId`, `seq`, `canon` and its hash inputs, audit links stay version 1; anchor statements version 2 carry `seriesId`, `canon` and `dropped`; a series resumes across hosts with `resumeFrom` or `ChainStore.head`; the erasure wording no longer over-claims; checks 13–16 extended (CCR-AC-003)<br>0.1 (2026-11-08): Initial draft (CCR-AC-003)                 |

---

Core's audit trail is one append-only stream among several that an
application may want linked: a numbered series of business documents, a
release log, a log of who read which data, the entries of the core call log.
Each of them has the property that made the audit chain cheap — one writer
appends records in a known order — and none of them is an `AuditRecord`. This
file generalises the mechanism of [01 — Hash-Chain Sink](./01-hash-chain-sink.md)
into `ChainSink<R>`: a chain over records of any type `R`, identified by a
**series id** that is not a host id, with a pluggable **canonicaliser** that
decides which bytes are hashed. `HashChainSink` becomes one instance of it,
`ChainSink<AuditRecord>` adapted to the core `AuditSink` port
([ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)).
Anchoring ([02](./02-anchoring.md)) and verification ([03](./03-verification.md))
apply to every series unchanged. This file owns BEH-AC-025–032 and uses all
eight.

The inner store port that file 01 called `ChainSink` in revisions 0.1 and
0.2 is renamed `ChainStore` (with `ChainStore.split` and the testing fixture
`memoryChainStore`), so that `ChainSink` names the chaining sink, as it does
in core's vocabulary of sinks.

> **What this package does not do — and who does**
>
> `ChainSink<R>` links records it is given. It does **not** produce the
> records, number them, encrypt them, decide which fields hold personal
> data, or keep the keys that encrypt them; it does **not** make a stream
> durable or its writer unique. Numbering belongs to the stream's owner (a
> sequence companion, `@bridger/sequence` (SQ, planned), for a numbered
> series); encryption and key destruction belong to the application or to the
> planned keyring companion, `@bridger/keyring` (KR, planned). Nothing in
> this file makes a stream tamper-proof; the limits of
> [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 5
> and of [BEH-AC-016](./02-anchoring.md#beh-ac-016-why-the-chain-alone-can-be-rewritten-and-what-the-anchor-adds)
> apply to every series.

Planned source: `packages/audit-chain/src/ChainSink.ts`,
`packages/audit-chain/src/ChainStore.ts`,
`packages/audit-chain/src/Canonicaliser.ts` and
`packages/audit-chain/src/Profile.ts` *(Planned)*.

## BEH-AC-025: ChainSink<R> chains any append-only stream, and HashChainSink is its audit instance

> **Invariant:** [INV-AC-001](../invariants.md#inv-ac-001-one-link-per-record-identical-across-retries), [INV-AC-007](../invariants.md#inv-ac-007-one-series-one-canonicaliser-and-one-algorithm)
> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md), [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)

```ts
// illustrative — not type-checked
interface SeriesSpec<R> {
  readonly seriesId: string                       // BEH-AC-026; never a host id by default
  readonly canonicaliser: Canonicaliser<R>        // BEH-AC-027
  readonly position: (record: R) => SeriesPosition   // BEH-AC-029
  readonly dropped?: (record: R) => number        // optional loss counter carried by the record (BEH-AC-031)
  readonly schema?: (record: R) => "supported" | "unsupported"   // marks the link, never refuses (01, BEH-AC-002)
}
interface SeriesPosition {
  readonly seq: number                            // contiguous from 1 within the series, assigned by the stream's owner
  readonly recordId: string                       // unique within the series; the idempotency key of the store
  readonly origin?: string                        // optional writer identity expected constant (the audit instance: hostId)
}

interface ChainStoreShape<R, E> {
  readonly append: (entry: ChainEntry<R>) => Effect.Effect<void, E>
  // Optional: the last link stored for a series, read once at construction (BEH-AC-026).
  readonly head?: (seriesId: string) => Effect.Effect<Option.Option<{ readonly seq: number; readonly recordId: string; readonly hash: string }>, E>
}
interface ChainEntry<R> { readonly record: R; readonly link: ChainLink }   // ChainLinkV2 for a generic series
// The audit instance's store, as in 01: ChainStore = ChainStoreShape<AuditRecord, AuditWriteFailed>
class ChainStore extends Context.Service<ChainStore, ChainStoreShape<AuditRecord, AuditWriteFailed>>()("@bridger/audit-chain/ChainStore") {}

interface ChainSinkShape<R, E> {
  readonly seriesId: string
  readonly append: (record: R) => Effect.Effect<ChainLink, E | KeyedHashFailed>
  readonly status: ChainStatusView                 // 02, BEH-AC-012, for this series
}

interface ChainSinkOptions {
  readonly alg?: "sha-256" | "sha-512"
  readonly continuesFrom?: { readonly seriesId: string; readonly seq: number; readonly hash: string }  // another, predecessor series (01, BEH-AC-007)
  // The same series, continued from a previous writer's head (BEH-AC-026):
  readonly resumeFrom?: { readonly seq: number; readonly hash: string; readonly previousStatement?: string }
  readonly anchorEvery?: { readonly records?: number; readonly interval?: Duration.Input }           // 02
  readonly maxPendingWindows?: number
  readonly closeTimeout?: Duration.Input
}

declare const ChainSink: {
  readonly make: <R, E>(series: SeriesSpec<R>, store: ChainStoreShape<R, E>, options?: ChainSinkOptions) =>
    Effect.Effect<ChainSinkShape<R, E>, SeriesConfigInvalid | E, Scope.Scope | ReceiptStore | Anchor>   // E: the store's head read
  readonly makeUnanchored: <R, E>(series: SeriesSpec<R>, store: ChainStoreShape<R, E>,
    options?: Omit<ChainSinkOptions, "anchorEvery" | "maxPendingWindows">) =>
    Effect.Effect<ChainSinkShape<R, E>, SeriesConfigInvalid | E, Scope.Scope>
}

class SeriesConfigInvalid extends Schema.TaggedError<SeriesConfigInvalid>()("SeriesConfigInvalid", {
  seriesId: Schema.String,
  reason: Schema.Literal("series-id-syntax", "canonicaliser-id-syntax", "continues-from-self",
                         "resume-and-continue", "resume-mismatch")
}) {}
```

```
REQUIREMENT: `ChainSink.make` MUST link the records of one series exactly as
             01 — Hash-Chain Sink specifies for audit records (BEH-AC-003 to
             BEH-AC-005, BEH-AC-007), with the series id in place of the
             host id, the series position's `seq` in place of `auditSeq`, the
             bytes returned by the series' canonicaliser in place of the
             RFC 8785 form of an `AuditRecord`, and the link format and hash
             inputs of `ChainLinkV2` (BEH-AC-026). Anchoring (02) and
             verification (03) MUST apply to every series without a rule of
             their own.
```

```
REQUIREMENT: `HashChainSink` MUST be built as `ChainSink.make` over the
             audit series spec `auditSeries` — series id the record's
             `hostId`, `seq` its `auditSeq`, `recordId` its `recordId`,
             `origin` its `hostId`, canonicaliser `Canonicaliser.jcs`,
             `dropped` its `auditDropped`, `schema` "supported" for
             `schemaVersion` 1 — and MUST add only the adaptation to the core
             `AuditSink` port: `record` calls `append` and maps every failure
             to `AuditWriteFailed` (01, BEH-AC-001, BEH-AC-008).
```

```
REQUIREMENT: `append` MUST succeed only after the store's `append` has
             succeeded, and MUST fail with the store's own error, or with
             `KeyedHashFailed`, otherwise. It MUST NOT fail for a condition of
             the sink's own (01, BEH-AC-008, read for any series). The
             generic sink has no latch of its own: what a failed append means
             for the stream — a rolled-back transaction, a retried outbox row,
             a refused business operation — is the stream owner's decision.
```

```
REQUIREMENT: `SeriesConfigInvalid` MUST be raised only at construction, for
             a series id or canonicaliser id outside the syntax of
             BEH-AC-026 and BEH-AC-027, a `continuesFrom` naming the series
             itself, both `resumeFrom` and `continuesFrom` given
             ("resume-and-continue"), or a `resumeFrom` that differs from
             the head the store reports ("resume-mismatch").
```

One mechanism means one canonical link format, one window and Merkle rule,
one verifier and one detection matrix to test, rather than a near copy per
stream whose differences nobody reviews. The audit instance keeps every rule
file 01 states for it, because those rules were written against core's
writer; a generic series inherits the same "mark, never refuse" behaviour,
which is equally right for a stream whose writer retries.

## BEH-AC-026: A series has its own id, separate from the host id

> **Invariant:** [INV-AC-007](../invariants.md#inv-ac-007-one-series-one-canonicaliser-and-one-algorithm)
> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-212: a restarted application is a new host)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
// seriesId grammar: 1–128 characters of [A-Za-z0-9._:/-], chosen by the application,
// e.g. "release-log", "documents:outlet-17:2026", "access-log:terminal-3"
interface ChainLinkV2 {                   // the link of a generic series
  readonly v: 2
  readonly alg: "sha-256" | "sha-512"
  readonly keyId?: string                 // 01, BEH-AC-007
  readonly seriesId: string
  readonly seq: number                    // = series.position(record).seq
  readonly recordId: string               // = series.position(record).recordId
  readonly canon: string                  // the canonicaliser id (BEH-AC-027)
  readonly origin?: string                // = series.position(record).origin, when given
  readonly prevHash: string               // lower-case hex
  readonly hash: string                   // lower-case hex
  readonly break?: { readonly reason: "chain-order" | "retry-mismatch"
                     readonly expected: { readonly seriesId: string; readonly seq: number; readonly recordId?: string } }
  readonly schema?: "unsupported"
  readonly canonical?: "jcs-escaped"
}
// D2 = UTF-8 bytes of "bridger-audit-chain/v2/" + alg + "\n"
// genesis(seriesId)        = H(D2 || "genesis\n" || seriesId)
// hash(prevHash, r)        = H(D2 || "record\n" || hexToBytes(prevHash)
//                               || canon || "\n" || decimal(seq) || "\n" || recordId || "\n" || encode(r).bytes)
// leaf, node and statement hashes of a generic series use D2 in place of D (02, BEH-AC-010; BEH-AC-009)
```

```
REQUIREMENT: Every link of a generic series MUST be a `ChainLinkV2`, and
             its genesis value and hashes MUST be computed with the inputs
             above: the series id enters through the genesis value, and the
             canonicaliser id, `seq` and `recordId` enter every record hash,
             so that a link cannot be re-read under another canonicaliser or
             moved to another position without its hash changing. The audit
             instance MUST keep writing `ChainLinkV1` links with the inputs
             of 01, BEH-AC-003 unchanged; for it the series id is the
             record's `hostId`, `seq` its `auditSeq`, and `canon` is implied
             as "jcs-v1" and not written.
```

```
REQUIREMENT: Every anchor statement, of any series, MUST be an
             `AnchorStatement` of version 2 carrying `seriesId`, `canon` and,
             when the series spec gives `dropped`, `dropped` (02,
             BEH-AC-009). A verifier MUST read version 1 statements written
             before this revision and MUST report for them that no loss
             counter was anchored.
```

```
REQUIREMENT: The series id of a generic series MUST be supplied by the
             application and MUST NOT be derived from a host id, a process
             id or a time read at start-up. The same series MAY be written
             by successive hosts — an application restarted, a terminal
             replaced — provided its owner keeps `seq` contiguous across
             them; the package MUST NOT start a new genesis for a series
             because the host changed.
```

```
REQUIREMENT: At construction the sink MUST establish the series head before
             its first append: from `resumeFrom` when given; otherwise from
             the store's `head(seriesId)` when the store offers it; otherwise
             the series is new and its first record is expected at `seq` 1
             with the genesis value. When both `resumeFrom` and a store head
             are present and differ, construction MUST fail with
             `SeriesConfigInvalid` ("resume-mismatch"). A store `head` read
             that fails MUST fail construction with the store's error. The
             first record after a resumed head MUST be expected at the
             head's `seq` plus one, chained to the head's `hash`.
```

```
REQUIREMENT: `continuesFrom` MUST name a different, predecessor series
             (01, BEH-AC-007); `resumeFrom` and a store head continue the
             same series. Documentation MUST state that a series written
             before, resumed with neither, starts again at genesis and that
             `verifyChain` then reports its second run as a break.
```

```
REQUIREMENT: A resumed sink's first window MUST start at the head's `seq`
             plus one, and its first statement's `previous` MUST be
             `resumeFrom.previousStatement` when given. Records of the
             previous writer after its last anchored window are not in any
             window of the new writer; verification MUST report them as
             unanchored (02, BEH-AC-012), and documentation MUST recommend
             that a writer handing a series over closes and anchors its last
             window first (02, `closeTimeout`).
```

```
REQUIREMENT: Two series MUST NOT share chain state. One `ChainSink` instance
             MUST serve one series; a record whose position names another
             `origin` than the series' first record MUST be appended with a
             "chain-order" break marker (01, BEH-AC-005), never refused.
```

```
REQUIREMENT: Documentation MUST state that a series must have one writer at a
             time, and that the package does not enforce it: two sinks
             appending to one series in parallel produce two chains with the
             same genesis, which `verifyChain` reports as breaks, after the
             fact.
```

Core gives a restarted application a new `hostId` (BEH-BR-212), which is
right for core's audit — each host's trail is its own — and wrong for a
numbered series that must continue across restarts: a fiscal or document
series, or a release log, is one line whatever process wrote it. Separating
the series id from the host id lets such a series keep one genesis for its
whole life, and leaves core's audit series exactly as before. Writer
uniqueness is the stream owner's (for a numbered series, the planned sequence
companion's), because only the owner knows which writer holds the series.

## BEH-AC-027: The Canonicaliser port decides which bytes are hashed

> **Invariant:** [INV-AC-007](../invariants.md#inv-ac-007-one-series-one-canonicaliser-and-one-algorithm)
> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
interface Canonicaliser<R> {
  readonly id: string                             // [a-z0-9.-]{1,64}, e.g. "jcs-v1", "bytes-v1", or the application's own
  readonly encode: (record: R) => { readonly bytes: Uint8Array; readonly escaped?: true }
}
declare const Canonicaliser: {
  // RFC 8785 over a JSON-shaped record; lone surrogates written as \uXXXX with escaped: true (01, BEH-AC-003)
  readonly jcs: Canonicaliser<unknown>                    // id "jcs-v1"
  // The record is already the stored bytes (for example an encrypted envelope); hashed as given
  readonly bytes: Canonicaliser<Uint8Array>               // id "bytes-v1"
  // RFC 8785 over a projection of the record the application chooses (for example the stored, encrypted form)
  readonly jcsOf: <R>(id: string, project: (record: R) => unknown) => Canonicaliser<R>
}
```

```
REQUIREMENT: `encode` MUST be a pure, total, deterministic function: the same
             record MUST give the same bytes in any process, on any platform,
             with no clock, randomness or I/O. A canonicaliser that throws or
             fails is a defect of the application's adapter; the sink MUST
             surface it as a defect, never as a link.
```

```
REQUIREMENT: The canonicaliser's `id` MUST be recorded in every link of a
             generic series (`ChainLinkV2.canon`; implied "jcs-v1" for the
             audit instance's `ChainLinkV1`, BEH-AC-026) and in every anchor
             statement of the series (`AnchorStatement.canon`),
             and MUST be fixed for the life of the series. A verifier MUST
             select the canonicaliser by this id and MUST report a link whose
             `canon` differs from the series' first link as a break.
```

```
REQUIREMENT: When `encode` returns `escaped: true`, the link MUST carry
             `canonical: "jcs-escaped"` and the record MUST be appended
             unchanged, counted in the status and reported as a notice, as
             01, BEH-AC-003 specifies.
```

```
REQUIREMENT: The audit instance MUST use `Canonicaliser.jcs`. Since core
             replaces lone surrogates with U+FFFD before a record reaches the
             sink and marks it `sanitized: true` (core BEH-BR-196), an audit
             record from a current core is always I-JSON; the escaped form
             remains for records of older cores and of other streams.
```

The canonicaliser is the one decision that differs between streams: an audit
record is JSON already, a document series may store a signed binary envelope,
a data-access log may store a row whose personal fields are encrypted.
Keeping the decision behind a pure port, named by an id in every link, is what
lets an inspector's own tool recompute a link years later: it needs the id,
the published encoding rule and the stored bytes, nothing that ran inside the
application.

## BEH-AC-028: Hash the stored ciphertext, never the plaintext

> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md), [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)

```ts
// illustrative — not type-checked
// A data-access row whose subject fields are encrypted per subject by the application
// (or by the planned keyring companion). The chain covers the stored envelope.
interface StoredAccessRow {
  readonly seq: number; readonly rowId: string
  readonly at: string; readonly plugin: string; readonly purpose: string
  readonly subject: { readonly keyRef: string; readonly ciphertext: Uint8Array }   // never the decrypted subject
}
const accessSeries: SeriesSpec<StoredAccessRow> = {
  seriesId: "access-log:terminal-3",
  canonicaliser: Canonicaliser.jcsOf("access-row-v1", (row) => ({ ...row, subject: { keyRef: row.subject.keyRef, ciphertext: b64(row.subject.ciphertext) } })),
  position: (row) => ({ seq: row.seq, recordId: row.rowId })
}
```

```
REQUIREMENT: Documentation of `ChainSink` and of every built-in canonicaliser
             MUST state the rule: a series whose records hold encrypted
             fields MUST be canonicalised over the form that is stored — the
             ciphertext and its key reference — and never over a decrypted
             view. The package MUST NOT decrypt, and MUST NOT accept a key.
```

```
REQUIREMENT: Documentation MUST state why: destroying a subject's key
             ("crypto-shredding", the planned keyring companion's shred)
             leaves the ciphertext in the store, so every link still
             recomputes and the chain stays verifiable; a chain over
             plaintext could be verified only by keeping the plaintext,
             and deleting the plaintext instead removes records, which
             `verifyChain` reports as a removal (03, BEH-AC-019).
```

```
REQUIREMENT: Documentation MUST NOT describe key destruction as erasure.
             It MUST state that destroying a key makes the ciphertext
             unreadable only to holders with no other copy of the key (see
             the keyring companion, BEH-KR-022); that every field stored
             outside the ciphertext — identifiers, `keyRef` when it names
             the subject, times, purposes — stays readable and stays in the
             chain; and that whether key destruction meets an erasure
             obligation is the application's determination, not a property
             of this package.
```

```
REQUIREMENT: Documentation MUST state the limits: a hash of a ciphertext
             reveals nothing about the plaintext only when the encryption
             is randomised (a fresh nonce per encryption); a deterministic
             encryption, or a plaintext field outside the encrypted part,
             lets anyone holding the chain test guesses. Which fields are
             personal, and that they are encrypted before they reach the
             sink, is the application's.
```

```
REQUIREMENT: Anchor statements, inclusion proofs and verification bundles
             (05) MUST carry no record content beyond what the stored
             records already hold; a statement MUST carry hashes, sequence
             numbers, the series id, the canonicaliser id, the loss counter
             and time only (02, BEH-AC-009).
```

An application that must both keep an append-only, checkable record and
answer a request to erase personal data has two obligations that look
contradictory. Hashing the stored ciphertext lets key destruction and chain
verification coexist: making a payload unreadable is the destruction of a key,
which changes no stored byte, so the chain is unaffected. The ciphertext is
then unreadable to any holder that has no other copy of the key — not to a
backup or a host the destruction notice did not reach — and the keyring
companion's shred receipt states which copies it reached and which it does not
state ([keyring BEH-KR-022](../../keyring/behaviors/03-shred-and-acceptance.md)).
It does not remove what is stored in clear: in the example above `keyRef`,
`plugin`, `purpose` and `at` remain. Whether that is erasure in law is for the
application to decide. The package can only state the rule and keep its own
artefacts free of content; it cannot see whether a field it hashes is
personal, so the encryption and its custody remain the application's or the
keyring companion's.

## BEH-AC-029: Position, order and the store obligations, for any series

> **Invariant:** [INV-AC-002](../invariants.md#inv-ac-002-the-head-advances-only-on-a-successful-append-and-an-unexpected-record-is-marked), [INV-AC-003](../invariants.md#inv-ac-003-the-stored-record-is-the-record-core-handed-over)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: The sink MUST read each record's position only through
             `series.position`, and MUST expect `seq` to be the head's `seq`
             plus one (or the pending link's `seq` with the same `recordId`)
             and `origin`, when given, to equal the first record's. Any other
             record MUST be chained with a "chain-order" break marker, and a
             retried `recordId` with different canonical bytes with a
             "retry-mismatch" marker, exactly as 01, BEH-AC-004 and
             BEH-AC-005 specify. Neither MAY be refused.
```

```
REQUIREMENT: A `ChainStore` of any series MUST meet the obligations of 01,
             BEH-AC-006: idempotent on `recordId`, record and link stored
             together or `ChainStore.split` semantics (record first, then
             link), and no call into the host it serves. `ChainStore.split`
             MUST be available for any `R`, taking the stream's own record
             store and a `LinkStore`.
```

```
REQUIREMENT: The record in each `ChainEntry<R>` MUST be the record passed to
             `append`, unchanged (01, BEH-AC-002, read for any series).
```

The position function is the only thing the sink knows about a stream's
numbering. Asking the stream for it, instead of numbering records itself,
keeps one source of numbers: the chain detects a skipped or repeated number;
it never invents one.

## BEH-AC-030: Loss counters, the core call log and other core streams

> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-195, BEH-BR-202), [29 — Capability grants and call log](../../core/behaviors/29-capability-grants-and-call-log.md) (BEH-BR-279, BEH-BR-280)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: When the series spec gives `dropped`, the sink MUST report the
             value of the last appended record as `ChainStatus.dropped`, and
             every anchor statement MUST carry the value of its window's last
             record as `dropped` (02, BEH-AC-009). For the audit instance
             this is the `auditDropped` of the last chained record of the
             window (core BEH-BR-195, BEH-BR-196), which core stamps on every
             record when it is numbered and never decreases; no core change
             is needed for it.
```

```
REQUIREMENT: The package MUST NOT treat a non-zero or increasing loss counter
             as a reason to fail or mark an append: the records were lost
             before the sink and the counter is part of the record. It MUST
             be reported by verification (03, BEH-AC-019) as a notice at the
             record where the counter rose, and a counter that decreases as a
             break.
```

```
REQUIREMENT: A series fed from core's call log (entries of
             `CallEntry.kind` "call", "crossing", "refusal" or "revocation",
             BEH-BR-280) MUST take its position from the application's
             numbering of the entries it stores, since core's call log
             assigns no contiguous sequence. Documentation MUST state that
             the call log's failure policy (`CallLog.onFailure` "drop" or
             "refuse", BEH-BR-279) decides what happens to a call when the
             series' store cannot be written, and that entries dropped by
             that policy are never chained.
```

A count of records lost upstream is information the chain must keep, not a
fault of the chain: the sink saw every record it was given, and the counter
on each record tells a reviewer where losses happened between two of them.
Carrying the counter into the anchor statement means a party who rewrites
the store cannot quietly lower it within an anchored window.

## BEH-AC-031: Verification profiles, and the sequence check of a generic series

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
> **See:** [ADR-AC-005](../decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-215)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
interface ChainProfile<R> {
  readonly canonicalisers: readonly Canonicaliser<R>[]     // selected by link.canon
  readonly position: (record: R) => SeriesPosition
  readonly dropped?: (record: R) => number
  readonly schema?: (record: R) => "supported" | "unsupported"
  readonly sequence: (records: Iterable<R>) => SequenceResult
}
declare const auditProfile: ChainProfile<AuditRecord>        // sequence = core verifyAuditSequence (BEH-BR-215)
declare const ChainProfile: {
  readonly of: <R>(series: Omit<SeriesSpec<R>, "seriesId" | "canonicaliser"> & { readonly canonicalisers: readonly Canonicaliser<R>[] }) => ChainProfile<R>
}
// The generic check, used by ChainProfile.of: per series id, gaps, duplicates and disorder of seq.
declare function verifySeriesSequence<R>(records: Iterable<R>, position: (r: R) => SeriesPosition & { readonly seriesId: string }): SequenceResult
```

```
REQUIREMENT: `verifyChain` (03) MUST take a `ChainProfile`, defaulting to
             `auditProfile`. With `auditProfile` the sequence result MUST be
             core's `verifyAuditSequence`, unchanged (03, BEH-AC-018). With a
             profile built by `ChainProfile.of`, it MUST be
             `verifySeriesSequence`, which reports gaps, duplicates and
             disorder of `seq` per series and nothing more.
```

```
REQUIREMENT: `verifySeriesSequence` MUST be pure and total, and MUST NOT be
             presented as more than a numbering check, for the reason core
             gives for its own (BEH-BR-215): anyone able to edit the store
             can renumber it.
```

Core's sequence check knows the audit record; a generic series needs the same
check over its own numbers. Putting both behind a profile keeps
`verifyChain`'s rules — sequence first, links capped at the first sequence
problem, anchors matched in order — identical for every series.

## BEH-AC-032: Required acceptance checks for the generic chain

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following (planned acceptance scenarios
             REQ-AC-013–016, traceability §2):
             13. Audit instance: `HashChainSink` built over `auditSeries`
                 produces, for a `TestHost` run, `ChainLinkV1` links
                 identical to those the rules of 01 give, and passes checks
                 1–12 unchanged except that its anchor statements are
                 version 2 with `seriesId` the host id, `canon` "jcs-v1"
                 and `dropped` (BEH-AC-025, BEH-AC-026).
             14. Generic series: a series of non-audit records written by
                 two successive hosts — the second resuming once with
                 `resumeFrom` and once from `ChainStore.head` — keeps one
                 genesis and contiguous `seq`, with no break; a resumed
                 series with neither starts at genesis and is reported as a
                 break; `resumeFrom` differing from the store head fails
                 "resume-mismatch"; the previous writer's unanchored tail is
                 reported unanchored; a foreign `origin`, a skipped `seq`
                 and a differing retry are each appended with their marker;
                 a store failure surfaces as the store's error;
                 `SeriesConfigInvalid` only at construction (BEH-AC-025,
                 BEH-AC-026, BEH-AC-029).
             15. Canonicaliser and ciphertext: links recompute from the
                 canonicaliser id and the stored bytes with an independent
                 implementation, using the `ChainLinkV2` hash inputs; a
                 changed `canon`, `seq` or `recordId` in a stored link
                 makes its hash fail to recompute; a changed `canon`
                 mid-series is a break;
                 after the key of an encrypted field is destroyed, every
                 link still recomputes and `verifyChain` reports no break;
                 no statement or bundle contains a record field
                 (BEH-AC-027, BEH-AC-028).
             16. Loss counters and profiles: a rising `auditDropped` is a
                 notice at the record where it rose, a decrease a break, and
                 version 2 statements carry the window's last value, while a
                 version 1 statement is reported as anchoring no loss
                 counter; a generic profile
                 uses `verifySeriesSequence` and the audit profile core's
                 `verifyAuditSequence` (BEH-AC-030, BEH-AC-031).
```

**Settled here.** (1) One chain mechanism, `ChainSink<R>`, over any
append-only stream; `HashChainSink` is its audit instance and keeps every rule
of file 01 (BEH-AC-025). (2) A series id that is not a host id, supplied by
the application; the audit series' id stays the host id (BEH-AC-026). (3) The
canonicaliser is a pure port named in every link (BEH-AC-027). (4) Encrypted
fields are hashed in their stored, encrypted form, so key destruction leaves
the chain verifiable (BEH-AC-028). (5) Loss counters are kept, anchored and
reported, never a reason to fail (BEH-AC-030). (6) The store port is renamed
`ChainStore` (shape `ChainStoreShape`). (7) Generic series write `ChainLinkV2`
links whose hash covers the canonicaliser id and position; audit links stay
version 1; anchor statements are version 2 for every series. (8) A series
resumes across hosts from `resumeFrom` or the store's head; `continuesFrom` is
for a different predecessor series.

**Open.** (1) Whether a series should be able to declare its writer identity
in each link (an `origin` field in the link itself), so that two parallel
writers are told apart by the verifier rather than only as breaks.
(2) Whether the built-in canonicalisers should include a CBOR deterministic
encoding (RFC 8949 §4.2) for binary streams. (3) How the planned sequence and
keyring companions will name the series spec and canonicaliser they offer;
this file fixes only the shapes they plug into.

---

_Previous: [03 — Verification](./03-verification.md)_ · _Next: [05 — Verification Bundle](./05-verification-bundle.md)_
