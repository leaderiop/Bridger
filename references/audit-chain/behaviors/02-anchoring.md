# 02 — Anchoring

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-BEH-02                                            |
> | Revision       | 0.5                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.5 (2026-11-10): `ChainStatus` gains `dropped`, the loss counter 04, BEH-AC-030 requires the status to report; open item 3 closed (statements carry `dropped`) (CCR-AC-005)<br>0.4 (2026-11-08): `AnchorStatement` version 2 with `seriesId`, `canon` and `dropped` for every series, version 1 still read; the windows of a series resumed by another writer (04, BEH-AC-026) (round-2 agent review R3-06, R3-07) (CCR-AC-003)<br>0.3 (2026-11-08): Store port renamed `ChainStore` (round 2: recheck item 13) (CCR-AC-003)<br>0.2 (2026-11-08): Fail-closed anchoring is the `ChainGate` gate piece reading the sink's status, not failed writes; backlog bounded by compact ranges and queued statements without failing writes; later windows close and queue; threat table gains the party controlling the process before the sink and deletion of trailing anchored windows with their receipts (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

A hash chain uses no secret. Whoever can write the store can change a record
and recompute every later link, and the rewritten chain verifies as well as
the original. What such a party cannot do is change a value that has already
been published somewhere they do not control. This file specifies the
`Anchor` port, through which `HashChainSink` publishes, at intervals, the
Merkle root and head hash of each window of records to a party outside the
store; the `ReceiptStore` that keeps what was published; the schedule, which
runs off the write path and never fails a write; and the explicit gate
piece, `ChainGate`, that refuses operator changes while anchoring is overdue
or the chain is broken, while the sink keeps accepting records
([ADR-AC-002](../decisions/002-anchor-defends-against-insider.md),
[ADR-AC-003](../decisions/003-anchoring-off-the-write-path.md)). This file
owns BEH-AC-009–016 and uses all eight.

> **What this package does not do — and who does**
>
> The package publishes statements through a port. It does **not** provide
> an anchor service, does **not** establish that the anchor service is
> independent of whoever can write the store, and does **not** protect the
> records written after the last anchor. Choosing the anchor, holding its
> receipts apart from the trail, and showing that the two cannot be rewritten
> by the same party are the consumer's obligations.

Planned source: `packages/audit-chain/src/Anchor.ts`,
`packages/audit-chain/src/Merkle.ts` and
`packages/audit-chain/src/Anchoring.ts` *(Planned)*.

## BEH-AC-009: The Anchor and ReceiptStore ports

> **Invariant:** [INV-AC-005](../invariants.md#inv-ac-005-anchoring-never-delays-or-fails-a-write)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports the consumer's controls under 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
// Written by every series from revision 0.4 (04, BEH-AC-026); version 1 statements are still read.
interface AnchorStatement {
  readonly v: 2
  readonly alg: "sha-256" | "sha-512"
  readonly seriesId: string                // the audit instance: the host id
  readonly canon: string                   // canonicaliser id (04, BEH-AC-027); "jcs-v1" for the audit instance
  readonly fromSeq: number                 // first seq (auditSeq) of the window
  readonly toSeq: number                   // last seq (auditSeq) of the window
  readonly merkleRoot: string              // BEH-AC-010, lower-case hex
  readonly headHash: string                // link hash of the record with seq = toSeq
  readonly previous?: string               // hash of the previous statement of this series (BEH-AC-010)
  readonly dropped?: number                // the loss counter of the window's last record, when the series has one (04, BEH-AC-030)
  readonly createdAt: string               // from Clock, ISO-8601 UTC with ms
}
interface AnchorStatementV1 {              // revisions 0.1–0.3; read, never written
  readonly v: 1; readonly alg: "sha-256" | "sha-512"; readonly hostId: string
  readonly fromSeq: number; readonly toSeq: number; readonly merkleRoot: string; readonly headHash: string
  readonly previous?: string; readonly createdAt: string
}

interface AnchorReceipt {
  readonly statementHash: string           // H(D || "statement\n" || canonical(statement))
  readonly anchor: string                  // the adapter's name, e.g. "rfc3161:tsa.example"
  readonly evidence: Uint8Array            // opaque to this package: a timestamp token, a log inclusion proof, an object version id
  readonly at: string                      // as reported by the anchor service, opaque
}

interface AnchorShape {
  readonly name: string
  readonly publish: (statement: AnchorStatement, statementHash: string) => Effect.Effect<AnchorReceipt, AnchorFailed>
}
class Anchor extends Context.Service<Anchor, AnchorShape>()("@bridger/audit-chain/Anchor") {}

interface ReceiptStoreShape {
  readonly put: (statement: AnchorStatement, receipt: AnchorReceipt) => Effect.Effect<void, ReceiptStoreFailed>
}
class ReceiptStore extends Context.Service<ReceiptStore, ReceiptStoreShape>()("@bridger/audit-chain/ReceiptStore") {}

class AnchorFailed extends Schema.TaggedError<AnchorFailed>()("AnchorFailed", { anchor: Schema.String, message: Schema.String }) {}
class ReceiptStoreFailed extends Schema.TaggedError<ReceiptStoreFailed>()("ReceiptStoreFailed", { message: Schema.String }) {}
```

```
REQUIREMENT: `publish` MUST be idempotent on `statementHash`: publishing the
             same statement again MUST succeed and MAY return the receipt
             already issued. An adapter SHOULD fail with `AnchorFailed` only
             when the statement was not published.
```

```
REQUIREMENT: A window MUST count as anchored only after `publish` has
             returned a receipt and `ReceiptStore.put` has stored the
             statement with that receipt. A receipt that could not be stored
             MUST leave the window unanchored.
```

```
REQUIREMENT: `ReceiptStore` and `Anchor` MUST be separate ports from
             `ChainStore`. Documentation MUST state that keeping receipts in
             the same store, under the same credentials, as the chained
             records gives no protection against a party who can write that
             store.
```

A statement is small and contains no record content — only sequence
numbers, hashes and a time — so it can be published to a party that must not
see the trail itself. The receipt is the anchor service's evidence that it
saw the statement; its form depends entirely on the service, which is why
the package keeps it opaque and leaves its checking to an `AnchorVerifier`
(03 — Verification, BEH-AC-020).

## BEH-AC-010: Windows and their Merkle root

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
// leaf(link)      = H(D || "leaf\n" || hexToBytes(link.hash))
// node(l, r)      = H(D || "node\n" || l || r)
// root(leaves)    = RFC 6962 §2.1 Merkle Tree Hash structure, with leaf() and node() above
```

```
REQUIREMENT: Windows of one host MUST be contiguous and MUST NOT overlap:
             the first window starts at `auditSeq` 1, and each later window
             starts at the previous window's `toSeq` plus one. A window MUST
             contain at least one record. For a series resumed by another
             writer (04, BEH-AC-026), that writer's first window starts at
             the resumed head's `seq` plus one, and records between the
             previous writer's last anchored window and that head are
             reported as unanchored.
```

```
REQUIREMENT: Every statement written MUST be version 2, with `seriesId`,
             `canon` and, when the series has a loss counter, `dropped`
             (04, BEH-AC-026, BEH-AC-030). The statement hash covers these
             fields because it covers the whole canonical statement. A
             verifier MUST accept a version 1 statement, reading `hostId` as
             its series id and "jcs-v1" as its canonicaliser, and MUST report
             that it anchors no loss counter.
```

```
REQUIREMENT: `merkleRoot` MUST be the root, computed as above, over the link
             hashes of the window's records in `auditSeq` order, and
             `headHash` MUST be the link hash of the window's last record.
             `previous` MUST be the `statementHash` of the host's previous
             statement, absent for the first.
```

```
REQUIREMENT: A statement, once handed to `publish`, MUST NOT be changed or
             re-windowed. It MUST be published again unchanged until it is
             anchored (BEH-AC-014).
```

The head hash alone commits to the whole chain up to the window's end, and is
what defends against a rewrite. The Merkle root adds something else: a short
proof that one record belongs to an anchored window, without disclosing the
window's other records (03 — Verification, BEH-AC-021). The `previous` link
makes the statements a chain of their own, so that a statement withheld from
the receipt store is visible as a hole. It shows holes only, not removal from
the end: a party who deletes the last windows' records together with their
receipts leaves a shorter chain of statements that is still whole, which only
an independently known head reveals (03 — Verification, BEH-AC-019).

## BEH-AC-011: Anchoring runs on a schedule, off the write path

> **Invariant:** [INV-AC-005](../invariants.md#inv-ac-005-anchoring-never-delays-or-fails-a-write)
> **See:** [ADR-AC-003](../decisions/003-anchoring-off-the-write-path.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-204: `auditTimeout` bounds every wait on the sink)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020)

```
REQUIREMENT: A window MUST be closed when `anchorEvery.records` records have
             been appended since the last window, or when
             `anchorEvery.interval` has passed, read from `Clock`, since the
             last window closed and at least one record is unanchored —
             whichever comes first. With neither given, the defaults are 1000
             records and 15 minutes.
```

```
REQUIREMENT: Publishing MUST run in a fiber owned by the sink layer's scope,
             never inside `record`. No call of `record` MAY wait on
             `publish`, on `ReceiptStore.put`, or on a window being
             published, and no anchoring condition MAY fail a `record` call.
```

```
REQUIREMENT: For the open window the sink MUST hold only the RFC 6962
             compact range of its leaves — at most one subtree root per bit
             of the window's record count — and the window's last link hash,
             from which the window's `merkleRoot` and `headHash` are computed
             when it closes. A closed window MUST be held as its statement
             only, queued for publishing in order (BEH-AC-014).
```

```
REQUIREMENT: When `maxPendingWindows` closed statements are queued, the sink
             MUST stop closing windows: the open window MUST keep growing,
             in memory bounded by its compact range, until a queued
             statement is anchored. The condition MUST be logged at error
             level and reported in the status (BEH-AC-012). It MUST NOT fail
             a `record` call.
```

The audit writer sits on the path of every operator change, bounded by
`auditTimeout` (BEH-BR-204). An anchor service is a remote call to another
organisation's system; putting it on that path would let its latency become
the host's. Memory still has to stay bounded during a long outage, and it
does without refusing anything: the open window needs a logarithmic number of
hashes, and a closed window is a statement of a few hundred bytes. Failing
the write when a backlog filled up would have bounded memory by halting
core's writer instead — every later record, system records included, held
behind the refused one and dropped past core's queue (BEH-BR-202, Settled
item 0).

## BEH-AC-012: The sink reports its anchoring status

> **See:** [ADR-AC-003](../decisions/003-anchoring-off-the-write-path.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
interface ChainStatus {
  readonly hostId?: string
  readonly anchoring: "scheduled" | "unanchored"            // "unanchored" for layerUnanchored (BEH-AC-016)
  readonly head: { readonly auditSeq: number; readonly hash: string }
  readonly lastAnchored?: { readonly toSeq: number; readonly statementHash: string; readonly at: string }
  readonly unanchored: { readonly records: number; readonly oldest?: string }   // oldest = Clock time of the oldest unanchored append
  readonly anchorFailures: number                           // consecutive failed publish or receipt-store attempts
  readonly pendingWindows: number                           // closed statements queued for publishing
  readonly windowsHeld: boolean                             // true while maxPendingWindows stops window closing (BEH-AC-011)
  readonly chainBreaks: number                              // links appended with a break marker (01, BEH-AC-004, BEH-AC-005)
  readonly unsupportedSchema: number                        // links marked schema "unsupported" (01, BEH-AC-002)
  readonly nonCanonical: number                             // links marked canonical "jcs-escaped" (01, BEH-AC-003)
  readonly dropped?: number                                 // loss counter of the last appended record, when the series has one (04, BEH-AC-030)
}
interface ChainStatusView {
  readonly current: Effect.Effect<ChainStatus>
  readonly changes: Stream.Stream<ChainStatus>              // latest-wins
}
```

```
REQUIREMENT: `HashChainSink.status` MUST report the values above, updated
             after every successful append, every anchoring attempt and every
             marked link. `changes` MUST be latest-wins, and MUST NOT be
             described as a record of anchoring.
```

```
REQUIREMENT: Each failed anchoring attempt MUST be logged at warning level
             with the window and the adapter's message; when
             `anchorFailures` reaches 10, or `unanchored.oldest` is older
             than four times `anchorEvery.interval`, the log level MUST be
             error.
```

The status is what a health check or an operator dashboard reads to see that
anchoring has silently stopped — the failure mode that would otherwise go
unnoticed until a review finds a long unanchored tail.

## BEH-AC-013: Fail-closed anchoring is an explicit gate piece, and the sink keeps recording

> **Invariant:** [INV-AC-005](../invariants.md#inv-ac-005-anchoring-never-delays-or-fails-a-write)
> **See:** [ADR-AC-003](../decisions/003-anchoring-off-the-write-path.md), [ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)
> **Core seam:** [32 — Generic Gate and Plan](../../core/behaviors/32-generic-gate-and-plan.md) (BEH-BR-313, BEH-BR-315, BEH-BR-321), [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-202)
> **Satisfies:** [URS-BR-023](../../core/urs.md#urs-br-023-prevent-a-change-that-cannot-be-recorded)
> **Risk:** [RSK-BR-020](../../core/gxp/03-risk-assessment.md#rsk-br-020), [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)

```ts
// illustrative — not type-checked
declare const ChainGate: {
  // A core gate piece (32, BEH-BR-313) reading HashChainSink.status; never returns Defer.
  readonly make: (status: ChainStatusView, options: {
    readonly maxUnanchoredRecords?: number
    readonly maxUnanchoredAge?: Duration.Input
    readonly refuseOnBreak?: boolean                 // default true: refuse while status.chainBreaks > 0
    readonly allow: readonly Operation[]             // operations never refused; no default (e.g. ["remove", "disable"])
  }) => Effect.Effect<Gate<OperationRequest>>
}

// Wiring: the sink is made before the host, so that its status can feed the gate the host reads once.
const main = Effect.gen(function* () {
  const sink = yield* HashChainSink.make(store, { anchorEvery: { records: 500, interval: "15 minutes" } })
  const chain = yield* ChainGate.make(sink.status, { maxUnanchoredAge: "4 hours", allow: ["remove", "disable"] })
  const gate = OperationGate.fromGate(Gate.all([{ name: "anchoring", gate: chain, timeout: "1 second" }, approval]))
  const HostLive = Bridger.layer({ /* ... */ }).pipe(
    Layer.provide(Layer.succeed(AuditSink, sink)),
    Layer.provide(Layer.succeed(OperationGate, gate))
  )
  // ...
}).pipe(Effect.scoped)
```

```
REQUIREMENT: `ChainGate.make` MUST return a `Gate<OperationRequest>` as core
             defines it, which reads only the sink's status and the `Clock`
             and MUST NOT return `Defer`. For every request whose operation
             is not in `allow`, it MUST return `Refuse` with reason
             "anchor-overdue" while the unanchored records exceed
             `maxUnanchoredRecords` or the oldest unanchored append is older
             than `maxUnanchoredAge`, and with reason "chain-break" while
             `refuseOnBreak` holds and `status.chainBreaks` is greater than
             zero. Otherwise it MUST return `Allow`.
```

```
REQUIREMENT: `allow` MUST be stated explicitly. A limit MUST be larger than
             the corresponding `anchorEvery` value of the sink whose status
             it reads; a configuration that breaks this, or that gives
             neither limit and `refuseOnBreak: false`, MUST be refused when
             the piece is made.
```

```
REQUIREMENT: No anchoring condition and no chain break MAY fail a `record`
             call (01, BEH-AC-008). Documentation MUST state that the gate
             piece refuses operator calls only: system transitions and
             shutdown are never gated (core BEH-BR-223) and keep being
             recorded and chained, and the records of refused calls (core's
             `rejected` records) are themselves chained.
```

With the piece, a deployment states that an operator change must not be made
while too much of the trail is unprotected by an anchor, or while the chain
is known to be broken. The refusal happens before the change, where core asks
gates, and leaves core's single `rejected` record naming the reason (core
BEH-BR-220). The sink, meanwhile, accepts every record: nothing waits behind
an anchoring condition, nothing is dropped because of one, and the trail of
system transitions continues during an anchor outage. Expressing the same
policy as failed writes would have done the opposite — core retries a refused
record in place, so every later record, system ones included, would wait
behind it and be dropped past the 1024-record queue (core
[BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md#beh-br-202-one-writer-in-order-retrying-in-place),
Settled item 0; [RSK-BR-045](../../core/gxp/03-risk-assessment.md#rsk-br-045)).
A chain break never clears while the host runs, so with `refuseOnBreak` the
refusal lasts until the host is rebuilt; that is a defect needing a restart,
and the piece says so rather than stopping the recording of it. This trades
availability of operator changes for coverage, which is why the piece is not
wired by default: whether an anchor outage should stop changes is the
regulated user's decision, made in their risk assessment. Which operations
stay allowed — removal and disabling, so that a revocation still takes
effect, are the usual choice — is stated in the same place.

## BEH-AC-014: Failed anchoring is retried, unchanged

> **See:** [ADR-AC-003](../decisions/003-anchoring-off-the-write-path.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: When `publish` or `ReceiptStore.put` fails, dies or does not
             complete within 30 seconds, the anchoring fiber MUST retry the
             same statement, with spacing read from `Clock` starting at one
             second and doubling up to `anchorEvery.interval`. Later windows
             MUST NOT be published before the earlier one is anchored.
```

```
REQUIREMENT: When the earlier window is still unanchored at the time a later
             window closes, the sink MUST NOT merge the two: the later window
             MUST close on its own schedule, its statement (whose `previous`
             is known at closing) MUST be queued behind the earlier one,
             subject to `maxPendingWindows` (BEH-AC-011), and its records
             MUST count as unanchored until it is anchored.
```

Publishing windows in order keeps the `previous` chain of statements whole
and lets a verifier read "anchored through N" as a single number. Retrying
the identical statement relies on the port's idempotence (BEH-AC-009), the
same way core's writer relies on the sink's idempotence on `recordId`.

## BEH-AC-015: Closing the sink attempts a final anchor, and says what it left

> **See:** [ADR-AC-003](../decisions/003-anchoring-off-the-write-path.md)
> **Core seam:** [23 — Audit Sink and Record](../../core/behaviors/23-audit-sink-and-record.md) (BEH-BR-208), [12 — Shutdown and hosting](../../core/behaviors/12-shutdown-and-hosting.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: When the sink layer's scope closes, the sink MUST close a final
             window over any unanchored records and attempt to anchor it, and
             any earlier unanchored window, bounded by `closeTimeout`
             (default 30 seconds, read from `Clock`).
```

```
REQUIREMENT: Windows still unanchored after `closeTimeout` MUST be logged at
             error level with their `hostId`, `fromSeq` and `toSeq`. The
             package MUST NOT claim that a closed host's trail is fully
             anchored unless the last window was anchored.
```

The host's own audit writer is closed with the host and empties its queue
first (BEH-BR-208); the sink's scope closes after it, so the final window
covers the host's last record. A process that ends abruptly anchors nothing
more: its tail is covered by the chain alone, which is limit 2 of the
[overview](../overview.md#limits).

## BEH-AC-016: Why the chain alone can be rewritten, and what the anchor adds

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports the consumer's controls under 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only; prevents nothing)

| Party | Chain only (`layerUnanchored`) | Chain with keyed hasher | Chain with independent anchor |
| ----- | ------------------------------ | ----------------------- | ----------------------------- |
| Storage fault, partial restore | Detected | Detected | Detected |
| Edit of one record without recomputing links | Detected | Detected | Detected |
| Insider who can write the store and recomputes links | **Not detected** | Detected only if the key is out of the insider's reach | Detected up to the last confirmed anchor |
| Insider who truncates the tail after the last anchor | Not detected | Not detected | **Not detected** |
| Insider who deletes the last anchored windows together with their receipts | Not detected | Not detected | **Not detected**, unless the verifier is given the expected head independently (`expectedHeads`, 03 — Verification, BEH-AC-019): then detected |
| Insider who can rewrite store and anchor store | Not detected | Not detected | **Not detected** |
| Party controlling the host process, or the sink before append — an operator with host access, in-process plugin code ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md); loader [BEH-LD-041](../../loader/behaviors/06-limits-and-acceptance.md#beh-ld-041-verification-establishes-provenance-not-containment)) | Not detected | Not detected | **Not detected**: the anchor attests what the sink was given |
| Loss before the sink (core overflow, process death) | Never chained | Never chained | Never chained |

```
REQUIREMENT: `HashChainSink.layerUnanchored` MUST exist only as an explicit
             choice. Its status MUST report `anchoring: "unanchored"`, and
             documentation MUST describe that configuration as detection of
             corruption and of edits made without recomputing links, and as
             no protection against anyone able to write the store.
```

```
REQUIREMENT: The package's documentation MUST reproduce the table above, or
             one that says no less, wherever it describes what the chain
             detects, and MUST state the limits of ADR-BR-034 non-claim 5:
             detection up to the last verified anchor, only against a party
             that cannot also rewrite the separately held anchor store, and
             never against a party that controls what reaches the sink.
```

Two rows are easy to miss. Deleting the newest windows together with their
receipts leaves a chain of statements with no hole — the `previous` links
show holes, not a missing end — and a report with a lower `verifiedThrough`
and no unanchored tail; with an RFC 3161 timestamping authority, which keeps
nothing a verifier can query, the receipt store is the only copy of the
statements. Only a head learned elsewhere — a query to an anchor service that
keeps a log, the next host's `continuesFrom`, the `CloseReport.auditLastSeq`
or `Host.controls` audit position held apart from the store — reveals the
deletion. And a party that controls the process before the sink sees a record
decides what is chained and anchored: falsified records pass `verifyChain`
with a full `verifiedThrough`, because the anchor attests the sink's input,
not the truth of it.

The chain's links are computed from public inputs with a public function;
nothing about them is secret. A party who can write the store can therefore
produce a fully consistent chain over any history they like, starting from
the first record they change — which is why a chain alone is not evidence
against that party. An anchor changes the question from "is the chain
consistent?" to "is the chain consistent with what was published, at that
time, to someone else?". The rewrite still succeeds in the store; it is the
comparison with the anchor that reveals it. That comparison is worth only as
much as the anchor's independence, which the consumer must establish and
document, and covers only what was anchored.

**Settled here.** (1) Statements carry hashes and numbers only, never record
content (BEH-AC-009). (2) Windows are contiguous, published in order and
never merged or re-windowed (BEH-AC-010, BEH-AC-014). (3) Anchoring is off
the write path and never fails a write; memory is bounded by compact ranges
and queued statements; fail-closed is an explicit gate piece that refuses
operator changes while the sink keeps recording (BEH-AC-011, BEH-AC-013). (4) Chain-only operation is a named,
explicit configuration with its limits stated (BEH-AC-016).

**Open.** (1) Whether to publish to several anchors at once and count a window
as anchored when k of them confirm, for deployments that do not want to rely
on one anchor service. (2) The default window sizes, which should be set from
measurements of real anchor services' latency and cost. (3) *Settled:* a
statement carries the loss counter of its window's last record (`dropped`,
BEH-AC-009; for the audit instance core's `auditDropped`, 04, BEH-AC-030).

---

_Previous: [01 — Hash-Chain Sink](./01-hash-chain-sink.md)_ · _Next: [03 — Verification](./03-verification.md)_
