# Overview

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-OVW                                               |
> | Revision       | 0.7                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification — Overview (companion)              |
> | Change History | 0.7 (2026-11-10): `KeyedHasher` passed as the sink option `keyed` (BEH-AC-007); `precomputeMacs` for an effectful MAC (BEH-AC-019); `BundleReport.chain` per series (BEH-AC-034) (CCR-AC-006)<br>0.6 (2026-11-10): `ChainStore` idempotent for an equal entry only (BEH-AC-006); `verifyChain` takes a profile and a `KeyedHasher` keeps one key per sink (CCR-AC-005)<br>0.5 (2026-11-09): Package boundary: the GxP companion adopts this package as its only sealing mechanism (CCR-GX-002) (CCR-AC-004)<br>0.4 (2026-11-08): `ChainLink` (`ChainLinkV1` audit, `ChainLinkV2` generic), `AnchorStatement` version 2, `resumeFrom` and `ChainStore.head` in the API surface (round-2 agent review R3-06, R3-07) (CCR-AC-003)<br>0.3 (2026-11-08): Generic chain and verification bundle in the API surface; store port renamed `ChainStore` (round 2: recheck items 13, 14) (CCR-AC-003)<br>0.2 (2026-11-08): `ChainGate` in the API surface and worked example (no `failClosed` option); `expectedHeads`; limits gain deletion of trailing windows and control of the process before the sink (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

## Mission

Core hands each lifecycle record to an `AuditSink`, in order, numbered
contiguously per host, and keeps no copy
([23 — Audit Sink and Record](../core/behaviors/23-audit-sink-and-record.md)).
What happens to the record afterwards is outside core, and core's own check
over stored records, `verifyAuditSequence`, detects gaps, duplicates and
disorder only: anyone able to edit the store can renumber it and pass
([BEH-BR-215](../core/behaviors/24-time-ids-and-sequence.md)).

`@bridger/audit-chain` adds the next layer a consumer may want, and states
exactly how far it goes:

- a **hash chain** — each stored record carries a link whose hash covers the
  record and the previous link, so a change to any chained record breaks
  every later link;
- an **anchor** — the chain's Merkle roots and head hashes are published, at
  intervals, to a party outside the store, so that a rewritten chain no longer
  matches what was published;
- **verification** — a pure function that checks a stored chain against the
  sequence, the links and the confirmed anchors, and says up to which record
  the check holds.

The chain alone defends against corruption and careless edits. Only the
anchor defends against an insider who can write the store, and only when
that insider cannot also rewrite the anchor store
([ADR-AC-002](./decisions/002-anchor-defends-against-insider.md)). Records
after the last anchor are covered by the chain alone.

## Package boundary

| Package | Relationship |
| ------- | ------------ |
| `@bridger/core` | Dependency. This package implements the core `AuditSink` port and calls `verifyAuditSequence`. Core never depends on this package and does not know it is wired. |
| `@bridger/gxp` | No dependency in either direction. The GxP companion's scope includes optional trail sealing ([ADR-BR-034](../core/decisions/034-gxp-companion-scope.md)); it adopts this package as its only sealing mechanism (its ADR-GX-029, CCR-GX-002), and this specification still relies on nothing in the companion's draft ([ADR-AC-004](./decisions/004-separate-from-gxp-companion.md)). |
| Consumer store | Behind the inner `ChainStore` port: where records and links are stored. Its durability, retention and access control are the consumer's. |
| Anchor service | Behind the `Anchor` port: a timestamping authority, a transparency log, a write-once store held by another party. Its independence is the consumer's to establish. |

Planned source: `packages/audit-chain/src/` *(Planned)*, testing entry point
`@bridger/audit-chain/testing` *(Planned)*.

## Public API surface

All signatures are illustrative until code exists.

### Chaining — [behaviour 01](./behaviors/01-hash-chain-sink.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `HashChainSink.layer`, `HashChainSink.make` | functions | Provide the core `AuditSink` by wrapping an inner `ChainStore` |
| `HashChainSink.layerUnanchored` | function | The chain without anchoring, chosen explicitly; described as corruption detection only |
| `ChainStore` | port | Inner store of chained entries (`append`); an equal entry under a stored `recordId` is an idempotent repeat, a different one is kept or refused, never dropped (BEH-AC-006) |
| `ChainStore.split` | function | Keep an existing `AuditSink` for the records and send the links to a separate `LinkStore` |
| `LinkStore` | port | Store of links only, for `ChainStore.split` |
| `KeyedHasher` | port | Optional: a keyed hash (for example HMAC in a hardware module) in place of the plain hash, passed to the sink as `options.keyed`; one key per sink, changed by rebuilding the sink (BEH-AC-007) |
| `ChainEntry`, `ChainLink`, `ChainLinkV1`, `ChainLinkV2`, `HashChainOptions` | types | The record with its link (version 1 for the audit instance, version 2 with `seriesId`, `seq`, `canon` for a generic series); options (`alg`, `continuesFrom`, anchoring, `keyed`) |

### Anchoring — [behaviour 02](./behaviors/02-anchoring.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `Anchor` | port | Publish an `AnchorStatement` outside the store; returns an `AnchorReceipt` |
| `ReceiptStore` | port | Keep statements and receipts, separately from the chain store |
| `AnchorStatement`, `AnchorReceipt`, `AnchorFailed` | types, error | Statement of a window (version 2: `seriesId`, `canon`, `fromSeq`, `toSeq`, `merkleRoot`, `headHash`, `dropped`) and its receipt; version 1 statements are still read |
| `HashChainSink.status` | member | `{ head, lastAnchored, unanchored, anchorFailures, pendingWindows, chainBreaks, … }` as a current value and a stream |
| `ChainGate.make` | function | Optional core gate piece: refuses operator calls while anchoring is overdue or the chain carries a marked break; the sink keeps recording |

### Verification — [behaviour 03](./behaviors/03-verification.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `verifyChain` | function | Pure, total check of stored entries against links, sequence, confirmed anchors and, when supplied, independently learned heads; any series through `options.profile` |
| `precomputeMacs` | function | Runs an effectful MAC (a hardware module, a MAC service) over the keyed links before the pure check and returns the pure `keyed` function `verifyChain` and `verifyBundle` take |
| `AnchorVerifier` | port | Confirm a receipt with its anchor service (an effect, kept out of `verifyChain`) |
| `proveInclusion`, `verifyInclusion` | functions | Show that one record is covered by an anchored Merkle root without disclosing the others |
| `ChainReport`, `InclusionProof` | types | Verification results |

### Generic chain — [behaviour 04](./behaviors/04-generic-chain.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `ChainSink.make`, `ChainSink.makeUnanchored`, `ChainSinkShape<R, E>` | functions, type | Chain any append-only stream described by a `SeriesSpec<R>`; `HashChainSink` is its audit instance |
| `SeriesSpec<R>`, `SeriesPosition` | types | Series id (separate from any host id), canonicaliser, position (`seq`, `recordId`, `origin`), optional loss counter |
| `ChainStoreShape<R, E>` | type | The store port of any series (`ChainStore` is the audit instance's), with an optional `head` read used to resume a series; `ChainSinkOptions.resumeFrom` resumes it explicitly |
| `Canonicaliser` | port | Pure, named encoding of a record into the hashed bytes; stored ciphertext is hashed, never plaintext |
| `ChainProfile`, `auditProfile`, `verifySeriesSequence` | types, functions | How `verifyChain` reads a series: core's `verifyAuditSequence` for audit, a generic sequence check otherwise |
| `SeriesConfigInvalid` | error | A series spec refused at construction |

### Verification bundle — [behaviour 05](./behaviors/05-verification-bundle.md)

| Export | Kind | Purpose |
| ------ | ---- | ------- |
| `exportBundle` | function | Export chain segments, anchors, receipts and trust roots, as stored, into a canonical `VerificationBundle` |
| `verifyBundle` | function | Pure, total, offline check of a bundle; returns a `BundleReport` with one `ChainReport` per series; used by the kit's `bridger verify-chain` |
| `VerificationBundle`, `BundleReport`, `TrustRoot` | types | The bundle format `bridger-chain-bundle/v1` and its report |
| `ChainReader`, `ReceiptReader`, `OfflineReceiptVerifier` | ports | Read sides for export; offline receipt confirmation |
| `BundleExportFailed` | error | A store or receipt store that cannot be read; never a partial bundle |

### Testing

`memoryChainStore`, `memoryReceiptStore` and `scriptedAnchor` (succeed, fail,
hang on demand), exported from `@bridger/audit-chain/testing` only. The main
entry point exports no `Anchor` implementation
([BEH-AC-023](./behaviors/03-verification.md#beh-ac-023-the-package-ships-no-production-anchor)).

## Worked example

```ts
// illustrative — not type-checked
import { Bridger } from "@bridger/core"
import { HashChainSink, ChainGate, ChainStore, Anchor, ReceiptStore, verifyChain } from "@bridger/audit-chain"

// The consumer's adapters: its own database table and an anchor held by another party.
const Receipts = Layer.succeed(ReceiptStore, myReceiptTable)
const Anchoring = Layer.succeed(Anchor, myTimestampAuthorityAnchor)

// Anchoring never fails a write. To stop operator changes during an anchor outage, the
// sink is made before the host and its status feeds a gate piece (optional).
const main = Effect.gen(function* () {
  const sink = yield* HashChainSink.make(myDatabaseChainSink, {
    alg: "sha-256",
    anchorEvery: { records: 500, interval: "15 minutes" }
  }).pipe(Effect.provide([Receipts, Anchoring]))
  const anchoring = yield* ChainGate.make(sink.status, { maxUnanchoredAge: "4 hours", allow: ["remove", "disable"] })
  const HostLive = Bridger.layer({ /* ... */ }).pipe(
    Layer.provide(Layer.succeed(AuditSink, sink)),
    Layer.provide(Layer.succeed(OperationGate,
      OperationGate.fromGate(Gate.all([{ name: "anchoring", gate: anchoring, timeout: "1 second" }, approvalPiece]))))
  )
  // ...
}).pipe(Effect.scoped)

// Later, on review of an export:
const report = verifyChain(exportedEntries, {
  anchors: confirmedStatements,
  expectedHeads: headsHeldElsewhere      // e.g. Host.controls audit positions kept outside the trail store
})
// report.verifiedThrough — per host, the highest auditSeq covered by a confirmed, matching anchor
// report.unanchoredTail  — records covered by the chain alone
// report.head            — "confirmed" only against a head learned outside the trail and receipt stores
```

## What stays in core

The `AuditSink` port, the `AuditRecord` and its `schemaVersion`, the single
in-order writer that retries the same record, `auditSeq`, the latch, and
`verifyAuditSequence`. None of them changes for this package. Core computes
no hash and keeps no copy
([ADR-BR-027](../core/decisions/027-core-exclusions.md)).

## What stays in the application

- The consumer's store behind `ChainStore`, its durability, backup, retention and access
  control.
- The choice of anchor service and the evidence that it is independent of
  whoever can write the store.
- The key behind a `KeyedHasher`, if one is used, and its custody.
- Running `verifyChain` — when, over what export, and what is done with a
  break. Review of the trail is the consumer's.
- Continuity across hosts: knowing which `hostId`s a deployment ran, so that
  the loss of a whole host's chain is noticed (see `continuesFrom`, BEH-AC-007).

## Limits

1. A chain without an anchor can be recomputed by anyone who can write the
   store. It is described as corruption detection only.
2. Records after the last confirmed anchor are covered by the chain alone.
   Truncation of that tail is not detected.
3. An insider who can rewrite both the store and the anchor store is not
   detected. Deleting the newest anchored windows together with their
   receipts is detected only when the verifier is given the expected head
   from somewhere else (`expectedHeads`).
4. A party who controls the host process, or the sink before append — an
   operator with host access, in-process plugin code — decides what is
   chained and anchored; the anchor attests what the sink was given, not
   that it was true.
5. Records lost before they reach the sink — the writer-queue overflow and
   process-death paths of core (BEH-BR-202, BEH-BR-208) — are never chained.
   The chain cannot show what it never saw.
6. Detection is not prevention: nothing here stops a record from being
   altered. It makes certain alterations visible to whoever runs the check.
7. The strength of every claim depends on the hash algorithm and on the
   consumer's adapters, which this package does not control.

---

_Previous: [README](./README.md)_ · _Next: [01 — Hash-chain sink](./behaviors/01-hash-chain-sink.md)_
