# 01 — Hash-Chain Sink

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-BEH-01                                            |
> | Revision       | 0.6                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.6 (2026-11-10): BEH-AC-007: the key lifecycle of a `KeyedHasher` — `keyId` fixed per sink instance, a key changed only by rebuilding the sink, `KeyedHashFailed` with `keyId` and `permanent`, verification across keys through `verifyChain`'s `keyed` (03, BEH-AC-019) (CCR-AC-005)<br>0.5 (2026-11-09): BEH-AC-006: only an equal entry under a stored `recordId` is an idempotent repeat; a different record under it is kept with its link or refused, never dropped, following core BEH-BR-193 as amended by CCR-BR-031 (CCR-AC-004)<br>0.4 (2026-11-08): The store port's shape renamed `ChainStoreShape` (it was still named `ChainSinkShape`, which 04 uses for the chaining sink); the link type of this file is `ChainLinkV1`, and `ChainLink` is the union with the generic series' `ChainLinkV2` (04, BEH-AC-026); audit links stay version 1 (round-2 agent review R3-07) (CCR-AC-003)<br>0.3 (2026-11-08): Store port renamed `ChainStore`; `HashChainSink` is the audit instance of `ChainSink<R>`; core's `sanitized`, `auditDropped`, `requestedBy`, `undoes` and new system transitions chained as fields (G54, G59 closed) (round 2: recheck item 13; core alignment) (CCR-AC-003)<br>0.2 (2026-11-08): No condition of the sink's own fails a write: order and host violations and retry mismatches are appended with a break marker, unsupported schema versions and strings that are not I-JSON are chained with a marker (escaped canonical form); `failClosed` and `maxPending` options removed; the cost of core's retry in place stated (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

Core hands each `AuditRecord` to one `AuditSink`, one at a time, in
`auditSeq` order, and retries the same record until it is accepted
([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)). That
ordering is what makes a hash chain cheap: the sink sees the records of a host
in exactly the order they must be linked. This file specifies
`HashChainSink`, an `AuditSink` that computes a link for each record and hands
the record with its link to an inner store port, `ChainStore`. It changes
nothing in core and adds no field to the core record
([ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md)). This file owns
BEH-AC-001–008 and uses all eight.

> **What this package does not do — and who does**
>
> `HashChainSink` does not **store** records, make them **durable**,
> **retain** or **back them up**, control **access** to them or **review**
> them; those are the consumer's, behind `ChainStore`. A chain without an
> anchor does not defend against anyone who can write the store
> ([02 — Anchoring](./02-anchoring.md)). Nothing in this file makes a trail
> tamper-proof.

Planned source: `packages/audit-chain/src/HashChainSink.ts`,
`packages/audit-chain/src/ChainStore.ts` and
`packages/audit-chain/src/Canonical.ts` *(Planned)*.

## BEH-AC-001: HashChainSink provides the core AuditSink by wrapping an inner ChainStore

> **Invariant:** [INV-AC-002](../invariants.md#inv-ac-002-the-head-advances-only-on-a-successful-append-and-an-unexpected-record-is-marked)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-193)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports the consumer's controls under 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
interface ChainLinkV1 {                  // the audit instance's link; unchanged since 0.1
  readonly v: 1
  readonly alg: "sha-256" | "sha-512"
  readonly keyId?: string                 // present only when a KeyedHasher produced `hash` (BEH-AC-007)
  readonly hostId: string                 // = record.hostId
  readonly auditSeq: number               // = record.auditSeq
  readonly recordId: string               // = record.recordId
  readonly prevHash: string               // lower-case hex; the genesis value for auditSeq 1 (BEH-AC-003)
  readonly hash: string                   // lower-case hex
  // Present only when the sink appended a record it could not chain as expected (BEH-AC-005):
  readonly break?: {
    readonly reason: "chain-order" | "retry-mismatch"
    readonly expected: { readonly hostId: string; readonly auditSeq: number; readonly recordId?: string }
  }
  readonly schema?: "unsupported"         // the record's schemaVersion is not one this package knows (BEH-AC-002)
  readonly canonical?: "jcs-escaped"      // the record is not I-JSON; escaped encoding used (BEH-AC-003)
}

// A generic series (04) writes version 2 links; the audit instance always writes version 1.
type ChainLink = ChainLinkV1 | ChainLinkV2   // ChainLinkV2: 04, BEH-AC-026

interface ChainEntry {
  readonly record: AuditRecord            // exactly as core handed it (BEH-AC-002)
  readonly link: ChainLinkV1
}

interface ChainStoreShape {               // = ChainStoreShape<AuditRecord, AuditWriteFailed> of 04
  readonly append: (entry: ChainEntry) => Effect.Effect<void, AuditWriteFailed>
}
class ChainStore extends Context.Service<ChainStore, ChainStoreShape>()("@bridger/audit-chain/ChainStore") {}

interface HashChainOptions {
  readonly alg?: "sha-256" | "sha-512"                           // default "sha-256"
  readonly continuesFrom?: { readonly hostId: string; readonly auditSeq: number; readonly hash: string }  // BEH-AC-007
  readonly anchorEvery?: { readonly records?: number; readonly interval?: Duration.Input }              // 02
  readonly maxPendingWindows?: number                           // 02, closed windows awaiting anchoring; default 100_000
  readonly closeTimeout?: Duration.Input                        // 02, default 30 seconds
}

declare const HashChainSink: {
  readonly layer: (options?: HashChainOptions) =>
    Layer.Layer<AuditSink, never, ChainStore | ReceiptStore | Anchor>
  readonly layerUnanchored: (options?: Omit<HashChainOptions, "anchorEvery" | "maxPendingWindows">) =>
    Layer.Layer<AuditSink, never, ChainStore>                    // chain only: corruption detection (02, BEH-AC-016)
  readonly make: (inner: ChainStoreShape, options?: HashChainOptions) =>
    Effect.Effect<AuditSinkShape & { readonly status: ChainStatusView }, never, Scope.Scope | ReceiptStore | Anchor>
}
```

```
REQUIREMENT: `HashChainSink.layer` MUST provide the core `AuditSink` service
             (identifier `@bridger/core/AuditSink`) and nothing else that
             core reads. Its `record` MUST compute the link of the record it
             is given (BEH-AC-003) and call the inner `ChainStore.append`
             exactly once per attempt with the record and its link.
```

```
REQUIREMENT: `record` MUST succeed only after the inner `append` has
             succeeded, and MUST fail with `AuditWriteFailed` whenever the
             inner `append` fails, dies or is interrupted, so that core's
             writer retries the same record (BEH-BR-202) and, past
             `auditTimeout`, sets the audit-degraded latch (BEH-BR-205).
```

```
REQUIREMENT: One `HashChainSink` instance MUST serve exactly one host. The
             package MUST NOT share chain state between hosts. A record of a
             second host wired to the same instance MUST be appended with a
             break marker (BEH-AC-005), never refused.
```

The wrapper is the whole integration: a consumer that already writes records
to a store replaces `Layer.succeed(AuditSink, store)` with
`HashChainSink.layer().pipe(Layer.provide(ChainStore-of-store))`. Because the
sink's failure is core's `AuditWriteFailed`, every rule core already has for
a failing sink — retry in place, latch, refusal of operator changes — applies
when the inner store cannot be written, without any new core rule. That
includes the cost core states for it (core
[BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md#beh-br-202-one-writer-in-order-retrying-in-place),
Settled item 0): while a write keeps failing, every later record, system
records included, waits behind it, and past the 1024-record queue later
records are dropped. The package therefore fails a write only for a cause that
can clear — the store or the keyed hasher being unavailable, or a key that can
no longer be used, which clears when the sink is rebuilt with another key
(BEH-AC-007) — and never for a condition of its own (BEH-AC-008).

## BEH-AC-002: The record reaches the store unchanged

> **Invariant:** [INV-AC-003](../invariants.md#inv-ac-003-the-stored-record-is-the-record-core-handed-over)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-195, BEH-BR-208)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports ALCOA+ Original (the record core created is the one stored)

```
REQUIREMENT: `ChainEntry.record` MUST be the `AuditRecord` core passed to
             `record`, field for field. The package MUST NOT add, remove,
             reorder or rewrite a field of the record, and MUST NOT place
             link data inside it.
```

```
REQUIREMENT: A record whose `schemaVersion` is not one the package supports
             (version 1 in this revision) MUST still be chained and appended
             as BEH-AC-003 specifies, with `schema: "unsupported"` in its
             link; it MUST be logged at error level, counted in the sink's
             status (02, BEH-AC-012) and reported by `verifyChain` (03,
             BEH-AC-019). It MUST NOT be refused.
```

```
REQUIREMENT: After a successful `append`, the package MUST keep no reference
             to the record. It MAY keep the link's `hash` until the record's
             window is anchored (02 — Anchoring), and nothing else.
```

The core record is defined as "exactly these fields" (BEH-BR-195), and its
original is the one the sink accepted (BEH-BR-208). Putting the link beside
the record rather than inside it keeps both rules: a reader that ignores the
chain reads the same record it would without the package. An unknown
`schemaVersion` matters because the hash covers the canonical form of the
record: a field the package does not know is still hashed, but a verifier of
an older version would not know how to read the result. Marking the link
rather than refusing the record keeps the record: a refusal would never clear,
and core's writer, retrying it in place, would stop recording for the rest of
the host's life (core BEH-BR-202, RSK-BR-020).

## BEH-AC-003: The canonical encoding and the link

> **Invariant:** [INV-AC-001](../invariants.md#inv-ac-001-one-link-per-record-identical-across-retries)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports the consumer's controls under 21 CFR 11.10(e) (detection only)

```ts
// illustrative — not type-checked
// D = UTF-8 bytes of "bridger-audit-chain/v1/" + alg + "\n"
// canonical(r) = UTF-8 bytes of the RFC 8785 (JCS) serialization of r
// genesis(hostId)       = H(D || "genesis\n" || hostId)
// hash(prevHash, r)     = H(D || "record\n" || hexToBytes(prevHash) || canonical(r))
```

```
REQUIREMENT: The canonical form of a record MUST be the RFC 8785 (JSON
             Canonicalization Scheme) serialization of the record, encoded
             as UTF-8. Absent fields MUST stay absent; the package MUST NOT
             introduce `null` or defaults before hashing.
```

```
REQUIREMENT: When the record is not I-JSON — a string holding a lone
             surrogate, which RFC 8785 rejects — the canonical form MUST be
             the RFC 8785 serialization in which each lone surrogate is
             written as a lower-case `\uXXXX` escape (as ECMAScript's
             well-formed `JSON.stringify` writes it), and the link MUST carry
             `canonical: "jcs-escaped"`. The record MUST be appended
             unchanged, logged at warning level and counted in the sink's
             status; it MUST NOT be refused.
```

```
REQUIREMENT: Every hash input MUST begin with the domain string
             "bridger-audit-chain/v1/" followed by the algorithm name and a
             line feed, and then a type tag ("genesis" or "record"), so that
             a link hash can never be confused with a hash computed for
             another purpose or with another algorithm.
```

```
REQUIREMENT: The link of the record with `auditSeq` 1 of a host MUST use
             `prevHash = genesis(hostId)`, unless `continuesFrom` is set
             (BEH-AC-007). The link of every later record MUST use the
             `hash` of the link of the record with the previous `auditSeq`.
```

```
REQUIREMENT: `alg` MUST be "sha-256" unless the options name "sha-512". The
             algorithm MUST be fixed for the life of a sink instance and MUST
             be recorded in every link.
```

Core now replaces lone surrogates with U+FFFD before a record reaches the sink
and marks such a record `sanitized: true` (core BEH-BR-196; gap G59 closed by
CCR-BR-026), so a record from a conforming core is always well-formed. The
escaped encoding and its marker stay as a defence for records from another
source, or from a core that does not conform: a sink that refused such a
record would halt recording for good under core's retry in place; the escaped
encoding is deterministic, so a verifier recomputes the same link, and the
marker tells a reviewer that the record was not I-JSON. Core's
`sanitized: true` is part of the record and is chained like any field
([04 — Generic Chain](./04-generic-chain.md), BEH-AC-027).

From revision 0.3 the inner store port of this file is named `ChainStore`
(`ChainStore.split`, `memoryChainStore`), and `HashChainSink` is the audit
instance of the generic `ChainSink<R>` of 04 (BEH-AC-025); every rule of this
file is unchanged by the rename. Each record also carries core's
`auditDropped` counter, `requestedBy`, `undoes` and the new system transitions
("start-refused", "unmount-requested", "lazy-idle"; a root `lazy-triggered`
record carrying `onBehalfOf`) as ordinary fields: the sink chains them without
interpreting them, and 04 (BEH-AC-030) states how `auditDropped` is carried
into statements and reports.

JCS is chosen because the record is JSON-shaped already and because several
independent implementations exist: a reviewer can recompute a link with a
tool that has never heard of Bridger. The domain string prevents a
cross-protocol reuse of hashes (a link hash presented as, say, a package
digest of another system), and the type tag separates genesis values from
record links. The genesis value depends on `hostId`, so the first link of
one host cannot be transplanted to another.

## BEH-AC-004: A retried record gets the identical link

> **Invariant:** [INV-AC-001](../invariants.md#inv-ac-001-one-link-per-record-identical-across-retries), [INV-AC-002](../invariants.md#inv-ac-002-the-head-advances-only-on-a-successful-append-and-an-unexpected-record-is-marked)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-202)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: The sink MUST hold a head `{ auditSeq, hash }` (initially
             `{ 0, genesis }`) and at most one pending link. When `record`
             is called with the `recordId` of the pending link, it MUST
             append the pending link again, unchanged in every field.
```

```
REQUIREMENT: The head MUST advance to the appended link only after the inner
             `append` has succeeded, and MUST NOT advance on failure,
             defect, timeout or interruption.
```

```
REQUIREMENT: Because the canonical form, the algorithm and `prevHash` are
             fixed, a link recomputed for an identical record MUST equal the
             pending link. When a call carries the pending `recordId` with a
             record that differs, the sink MUST compute the link of the new
             record over the same `prevHash`, with `break: { reason:
             "retry-mismatch", expected }`, append it, log the condition at
             error level and count it in the sink's status. It MUST NOT
             refuse the record.
```

Core retries a record identical in every field, including `recordId` and
`auditSeq` (BEH-BR-202), and a sink must absorb a retried write that had in
fact reached the store (BEH-BR-193). The chain has to follow suit: a retry
that produced a new link — for instance because the head had already moved —
would leave two different links for one record in an idempotent store, one of
which is silently discarded. Advancing the head only on success, and
re-sending the pending link unchanged, gives each record exactly one link.
A retry whose content differs breaks core's own rule; the sink cannot know
whether the first version reached the store, so it appends the second with a
marker. If the store kept the first, the next record's `prevHash` does not
match the stored link and `verifyChain` reports a break there; if not, the
marker itself is reported. Either way the defect is visible, and no record is
held back.

## BEH-AC-005: Contiguity and order are checked per host, and a violation is marked, not refused

> **Invariant:** [INV-AC-002](../invariants.md#inv-ac-002-the-head-advances-only-on-a-successful-append-and-an-unexpected-record-is-marked)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-212), [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-202)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020)

```
REQUIREMENT: The sink MUST expect each record to have the `hostId` of the
             first record it accepted (any value for the first record) and
             an `auditSeq` equal to the head's `auditSeq` plus one, or the
             pending link's `auditSeq` with the same `recordId`. Any other
             record MUST be chained over the head's hash, with `break: {
             reason: "chain-order", expected }` naming the expected
             `hostId` and `auditSeq`, and appended. It MUST NOT be refused.
```

```
REQUIREMENT: A "chain-order" break MUST be logged at error level with the
             expected and the received `hostId`, `auditSeq` and `recordId`,
             and MUST be counted in the sink's status (02 — Anchoring,
             BEH-AC-012), where the gate piece of 02, BEH-AC-013, can read
             it.
```

Core already guarantees this order (BEH-BR-212, INV-BR-023), so in a correct
deployment the check never fires. When it does, the cause — two hosts sharing
a sink, a sink reused after a restart — is a wiring defect that never clears
by itself. Refusing the record would turn that defect into a permanent halt of
recording: core's writer retries a refused record in place, every later
record waits behind it, and past the queue bound records are dropped (core
BEH-BR-202, Settled item 0). Appending with a marker keeps every record,
leaves the break where a reviewer will find it — `verifyChain` reports it,
and the sequence check reports the gap or the foreign host — and lets an
application that wants operator changes to stop on a broken chain say so
through the gate piece, which the host consults before a change instead of
after its record.

## BEH-AC-006: The ChainStore obligations, and ChainStore.split

> **Invariant:** [INV-AC-003](../invariants.md#inv-ac-003-the-stored-record-is-the-record-core-handed-over)
> **See:** [ADR-AC-001](../decisions/001-chain-in-a-wrapping-sink.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-193)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
interface LinkStoreShape {
  readonly put: (link: ChainLink) => Effect.Effect<void, AuditWriteFailed>
}
class LinkStore extends Context.Service<LinkStore, LinkStoreShape>()("@bridger/audit-chain/LinkStore") {}

declare const ChainStore: {
  readonly split: (records: AuditSinkShape, links: LinkStoreShape) => ChainStoreShape
}
```

```
REQUIREMENT: A `ChainStore` MUST treat an `append` of an entry equal to one
             it has already stored under the same `record.recordId` as
             idempotent: it MUST succeed and MUST NOT store a second copy. An
             entry whose record differs from the one stored under its
             `recordId` MUST NOT be dropped while the store reports success:
             the store MUST keep it, with its link, beside the first without
             displacing it, or fail. It SHOULD fail only when it did not
             store the entry. These are the obligations of BEH-BR-193,
             applied to the entry.
```

```
REQUIREMENT: A `ChainStore` MUST store the record and its link together or
             not at all, or — when it cannot — MUST behave as
             `ChainStore.split` specifies.
```

```
REQUIREMENT: `ChainStore.split(records, links)` MUST call `records.record`
             with the unchanged record, then, only after it succeeds,
             `links.put` with the link, and MUST fail with
             `AuditWriteFailed` if either fails. Both stores MUST meet
             the obligations of BEH-BR-193 for an equal record under a stored
             `recordId`, so that a retry after a partial success leaves one
             record and one link.
```

```
REQUIREMENT: A `ChainStore` MUST NOT call mutating operations of the host it
             records for (as BEH-BR-193 requires of any sink).
```

`split` serves a consumer who already has an `AuditSink` adapter, perhaps
qualified on its own, and wants to add the chain without touching it. Writing
the record first means that a crash between the two writes leaves a record
without a link — which `verifyChain` reports as a break — rather than a link
for a record that was never stored.

## BEH-AC-007: Optional keyed hasher, and continuity across hosts

> **Invariant:** [INV-AC-001](../invariants.md#inv-ac-001-one-link-per-record-identical-across-retries)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-212: a restarted application is a new host)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
interface KeyedHasherShape {
  readonly keyId: string                  // read once, when the sink is built
  readonly mac: (input: Uint8Array) => Effect.Effect<Uint8Array, KeyedHashFailed>   // for example HMAC-SHA-256 in a hardware module
}
class KeyedHasher extends Context.Service<KeyedHasher, KeyedHasherShape>()("@bridger/audit-chain/KeyedHasher") {}
class KeyedHashFailed extends Schema.TaggedError<KeyedHashFailed>()("KeyedHashFailed", {
  keyId: Schema.String,
  permanent: Schema.Boolean,              // true: the key can never be used again (revoked, retired, destroyed)
  message: Schema.String
}) {}

// with continuesFrom = { hostId: h0, auditSeq: n, hash: x }:
// genesis(hostId) = H(D || "continues\n" || h0 || "\n" || n || "\n" || hexToBytes(x) || "\n" || hostId)
```

```
REQUIREMENT: When a `KeyedHasher` is wired, the sink MUST compute every link
             hash with it in place of the plain hash, over the same input,
             and MUST record its `keyId` in each link. A `KeyedHashFailed`
             MUST be mapped to `AuditWriteFailed`. The key MUST stay behind
             the port; the package MUST NOT read, log or store it.
```

```
REQUIREMENT: A sink MUST read `keyId` once, when it is built, and MUST use
             that key for every link it writes; a sink instance never changes
             key. A key is changed by building a new sink: for the audit
             instance, the next host, whose chain the consumer joins to the
             previous one with `continuesFrom`; for a generic series, a sink
             that resumes the same series (04, BEH-AC-026), whose links carry
             the new `keyId` from its first append. Documentation MUST state
             that a key must not be retired while a sink still writes with it.
```

```
REQUIREMENT: A `KeyedHasher` MUST fail with `permanent: true` when the key
             can never be used again (revoked, retired or destroyed), and
             with `permanent: false` otherwise. The sink MUST treat both as
             failures of the port (`AuditWriteFailed` for the audit instance,
             `KeyedHashFailed` from a generic `append`) and MUST log a
             permanent one at error level naming the `keyId`. Documentation
             MUST state that a permanent failure fails every later write
             until the sink is rebuilt with another key, and that, for the
             audit instance, core's writer holds and then drops records
             meanwhile (core BEH-BR-202, BEH-BR-205).
```

```
REQUIREMENT: Links written under different keys MUST verify in one run when
             the verifier's `keyed` function computes each `keyId` they name
             (03, BEH-AC-019). Documentation MUST state that a consumer keeps
             a retired key usable for verification (or the MAC service that
             holds it) for as long as the chain must be verifiable, and that a
             destroyed key leaves its links reported as "key-unavailable".
```

```
REQUIREMENT: Documentation MUST state that a keyed hash defends only against
             a party who cannot use the key, and that a key reachable from
             the host process is reachable by anyone who controls that
             process; it MUST NOT be presented as a substitute for an anchor.
```

```
REQUIREMENT: When `continuesFrom` is set, the genesis value MUST be computed
             from it as shown above, so that the first link of the new host
             commits to the head of the previous one. The package MUST NOT
             fetch `continuesFrom` itself; the consumer supplies it, from its
             own store, at construction.
```

Core gives every host — including the same application after a restart — a
new `hostId` and starts `auditSeq` at 1 (BEH-BR-212). Each host's chain is
therefore separate, and the loss of a whole host's chain cannot be seen from
the chains that remain. `continuesFrom` lets a consumer that keeps its last
head join the chains into one line, so a missing host appears as a link that
points to a head no stored chain has. Whether to do so is the consumer's: it
needs a store that can report its last head at start-up.

## BEH-AC-008: Failures map to the core latch, and nothing claims more

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-194, BEH-BR-205)
> **Satisfies:** [URS-BR-023](../../core/urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded), [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018), [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020)
> **Regulatory:** supports 21 CFR 11.10(e) (by never implying protection that does not exist)

```
REQUIREMENT: Every failure of the inner store or of the keyed hasher MUST
             surface to core as `AuditWriteFailed` with a message naming the
             cause. The package MUST NOT swallow such a failure and report
             success.
```

```
REQUIREMENT: The package MUST NOT fail a write for a condition of its own:
             an order or host violation, a retry mismatch, an unsupported
             `schemaVersion`, a string that is not I-JSON, or any anchoring
             condition (02 — Anchoring). Each is marked on the link or
             reported in the status, as the behaviours of this file and of
             02 specify. Documentation MUST state why: core's writer retries
             a refused record in place, so a refusal that can never clear
             stops recording until the host is restarted, holding system
             records behind it and dropping records past its queue (core
             BEH-BR-202, RSK-BR-020).
```

```
REQUIREMENT: Documentation, type comments, logs and status values of this
             package MUST NOT describe a chained trail as tamper-proof,
             secure, immutable or compliant. They MAY say that the chain
             detects changes to chained records within the limits of
             ADR-BR-034 non-claim 5, and MUST name those limits where they
             say it.
```

```
REQUIREMENT: The sink MUST read time only from `Clock` and MUST use no
             ambient randomness, so that a run under core's test clock and
             identifier fixtures produces the same links twice.
```

A chain sink sits on the write path of every operator change, so its
failures are availability events for the host: while the inner store cannot
be written, records wait behind the failing one and, with the latch, operator
changes stop until the store accepts writes again. That is the price of the
rule that a change which cannot be recorded is not made (ADR-BR-031), and the
package does not add a way around it — nor a second cause of it.

**Settled here.** (1) The link is carried beside the record, never inside it
(BEH-AC-002, ADR-AC-001). (2) RFC 8785 is the canonical form, with a domain
string and type tags (BEH-AC-003). (3) The head advances only on success and
a retry re-sends the pending link unchanged (BEH-AC-004). (4) Order and host
are checked, and a violation is appended with a break marker rather than
refused, so that no condition of the sink's own halts core's writer
(BEH-AC-005, BEH-AC-008). (5a) Unsupported schema versions and strings that
are not I-JSON are chained with a marker (BEH-AC-002, BEH-AC-003). (5) `split` writes the record before the link
(BEH-AC-006). (6) Keyed hashing and cross-host continuity are optional and
consumer-supplied; a sink keeps one key for its life, and a key change is a
new sink (BEH-AC-007).

**Open.** (1) Whether to support algorithm agility within one chain (a link
that changes `alg` mid-chain), which would let a long-lived deployment move
away from a weakened hash without starting a new chain; this revision fixes
the algorithm per sink instance. (2) Whether `continuesFrom` should also be
carried in a dedicated first link field, so that a verifier need not be told
it out of band. (3) Whether `ChainStore` should be offered a batched `append`
for stores that are slow per write; core's writer hands one record at a time,
so batching would sit behind the port.

---

_Previous: [Overview](../overview.md)_ · _Next: [02 — Anchoring](./02-anchoring.md)_
