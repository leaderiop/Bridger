# 03 — Verification

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-BEH-03                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.2 (2026-11-08): `verifyChain` takes `expectedHeads` and reports `head` per host; marked links reported as "sink-marked" breaks and escaped encodings as notices; undetectable cases listed; acceptance checks 1–4, 8 and 11 updated (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

Core's `verifyAuditSequence` answers one question: did the store lose,
duplicate or reorder anything the host handed it? It says nothing about
whether a record was altered, and its documentation must say so
([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)). This file
specifies `verifyChain`, which runs that check first and then checks the
links and the confirmed anchors, and reports, per host, up to which record
the result holds. It also specifies how a receipt is confirmed with its
anchor service (an effect, kept out of the pure check), inclusion proofs for
a single record, the words the package may use about a result, and the
package's acceptance checks. This file owns BEH-AC-017–024 and uses all
eight.

> **What this package does not do — and who does**
>
> `verifyChain` reports. It does **not** decide whether a break is an
> incident, does **not** schedule itself, does **not** read the store, and
> does **not** review the trail. Running it, over which export, how often,
> and what is done with its result are the consumer's obligations under
> their own procedures.

Planned source: `packages/audit-chain/src/verifyChain.ts`,
`packages/audit-chain/src/Inclusion.ts` and
`packages/audit-chain/src/AnchorVerifier.ts` *(Planned)*.

## BEH-AC-017: verifyChain is a pure, total function

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-215)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006), [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports the consumer's review under 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
declare function verifyChain(
  entries: Iterable<ChainEntry>,                          // in the store's order
  options?: {
    readonly anchors?: Iterable<ConfirmedStatement>       // from confirmAnchors (BEH-AC-020)
    readonly continuesFrom?: ReadonlyMap<string, { readonly hostId: string; readonly auditSeq: number; readonly hash: string }>  // per hostId, as wired (01, BEH-AC-007)
    readonly keyed?: (keyId: string, input: Uint8Array) => Uint8Array | undefined   // a pure MAC function, when links are keyed
    // Per hostId, the head the verifier learned independently of the trail and receipt stores:
    // an anchor service's log, the next host's continuesFrom, a CloseReport.auditLastSeq or
    // Host.controls audit position held apart (BEH-AC-019).
    readonly expectedHeads?: ReadonlyMap<string, { readonly auditSeq: number; readonly hash?: string }>
  }
): ChainReport

interface ChainReport {
  readonly sequence: ReturnType<typeof verifyAuditSequence>       // core's result, unchanged (BEH-AC-018)
  readonly hosts: readonly {
    readonly hostId: string
    readonly highestSeq: number
    readonly linksCheckedThrough: number                  // highest auditSeq up to which every link recomputes, from 1
    readonly verifiedThrough: number                      // highest toSeq of a matching confirmed anchor at or below linksCheckedThrough; 0 if none
    readonly unanchoredTail: { readonly fromSeq: number; readonly toSeq: number } | undefined
    readonly head: "confirmed" | "head-unconfirmed" | "head-short" | "head-mismatch"   // against expectedHeads (BEH-AC-019)
  }[]
  readonly breaks: readonly {
    readonly hostId: string
    readonly auditSeq: number
    readonly kind: "hash-mismatch" | "prev-mismatch" | "missing-link" | "link-record-mismatch"
                 | "unsupported-version" | "key-unavailable"
                 | "sink-marked"                                // the link carries a break marker (01, BEH-AC-004, BEH-AC-005)
    readonly marker?: "chain-order" | "retry-mismatch"
  }[]
  readonly notices: readonly {
    readonly hostId: string
    readonly auditSeq: number
    readonly kind: "non-canonical-encoding"                     // link marked canonical "jcs-escaped" (01, BEH-AC-003)
  }[]
  readonly anchorMismatches: readonly {
    readonly hostId: string
    readonly statementHash: string
    readonly kind: "root-mismatch" | "head-mismatch" | "window-not-in-entries" | "previous-mismatch" | "window-gap"
  }[]
}
```

```
REQUIREMENT: `verifyChain` MUST be a pure, total function: no effects, no
             clock, no I/O, the same report for the same input, and an empty
             report for an empty input. Malformed entries MUST be reported
             as breaks, never thrown.
```

```
REQUIREMENT: It MUST check each `hostId` separately and MUST NOT stop at the
             first break: every break and every anchor mismatch in the input
             MUST be reported.
```

Purity is what lets the same function run in a consumer's review tool, in a
test, and in an auditor's own environment with the same answer. Everything
that needs the network — asking an anchor service whether a receipt is
genuine — is done before, by `confirmAnchors`, and passed in as data.

## BEH-AC-018: The sequence check comes first, from core

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
> **See:** [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md)
> **Core seam:** [24 — Time, Identifiers and Sequence](../../core/behaviors/24-time-ids-and-sequence.md) (BEH-BR-215)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```
REQUIREMENT: `verifyChain` MUST call core's `verifyAuditSequence` over the
             records of the entries and MUST return its result unchanged as
             `report.sequence`. It MUST NOT re-implement gap, duplicate or
             order detection.
```

```
REQUIREMENT: For each host, `linksCheckedThrough` MUST NOT exceed the number
             before the first gap, duplicate or out-of-order record reported
             for that host.
```

The two checks answer different questions and are kept apart: the sequence
check says whether records are missing or repeated; the link check says
whether the records present are the ones that were chained. A link check over
a sequence with a gap could only say "consistent from here"; capping
`linksCheckedThrough` at the first sequence problem keeps the report from
implying more.

## BEH-AC-019: Links are recomputed, and anchors matched

> **Invariant:** [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)
> **Regulatory:** supports the consumer's review under 21 CFR 11.10(e) (detection only)

```
REQUIREMENT: For every entry, `verifyChain` MUST check that the link's
             `hostId`, `auditSeq` and `recordId` equal the record's
             ("link-record-mismatch"), that `prevHash` equals the genesis
             value or the previous link's `hash` ("prev-mismatch"), and that
             `hash` recomputes from the canonical record exactly as 01 —
             Hash-Chain Sink, BEH-AC-003 specifies, with the escaped encoding
             when the link says `canonical: "jcs-escaped"` ("hash-mismatch").
             An entry without a link is a "missing-link" break. A link with
             a `break` marker MUST be reported as a "sink-marked" break with
             its reason, whatever else recomputation finds; a link with
             `schema: "unsupported"` as an "unsupported-version" break; a
             link with `canonical: "jcs-escaped"` as a notice.
             `linksCheckedThrough` MUST stop before the first break of any
             kind.
```

```
REQUIREMENT: For every confirmed statement of a host, it MUST recompute the
             Merkle root and the head hash from the entries of the window
             and report any difference, and MUST check that statements are
             contiguous from `auditSeq` 1 and that each `previous` equals the
             prior statement's hash.
```

```
REQUIREMENT: `verifiedThrough` MUST be the highest `toSeq` of a statement
             that matched, whose window and every earlier window matched, and
             that lies at or below `linksCheckedThrough`. Records above it
             MUST be reported in `unanchoredTail`.
```

```
REQUIREMENT: For a host with an entry in `expectedHeads`, `head` MUST be
             "head-short" when the host's `highestSeq` is below the expected
             `auditSeq`, "head-mismatch" when the record at that `auditSeq`
             is present but its link `hash` differs from the expected `hash`
             (when given), and "confirmed" otherwise. For a host with no
             entry, `head` MUST be "head-unconfirmed". Documentation MUST
             state that without an expected head, deletion of the newest
             records — anchored or not — together with their receipts is not
             detected.
```

The report's central number is `verifiedThrough`: up to that record, the
stored chain is the chain that was published to the anchor. Above it, the
chain is merely self-consistent, which a party able to write the store can
always arrange. `verifiedThrough` says nothing about where the trail ought
to end: a party who removes the last windows together with their receipts
lowers it without leaving a hole. `head` is the field that answers that
question, and only from a head the verifier learned somewhere the same party
cannot write; "head-unconfirmed" is the honest default.

## BEH-AC-020: Receipts are confirmed by an effect, outside verifyChain

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```ts
// illustrative — not type-checked
interface AnchorVerifierShape {
  readonly anchor: string
  readonly confirm: (statement: AnchorStatement, receipt: AnchorReceipt) => Effect.Effect<ConfirmedStatement, AnchorUnconfirmed>
}
class AnchorVerifier extends Context.Service<AnchorVerifier, AnchorVerifierShape>()("@bridger/audit-chain/AnchorVerifier") {}

interface ConfirmedStatement { readonly statement: AnchorStatement; readonly statementHash: string; readonly confirmedBy: string }

declare const confirmAnchors: (
  pairs: Iterable<{ readonly statement: AnchorStatement; readonly receipt: AnchorReceipt }>
) => Effect.Effect<{ readonly confirmed: readonly ConfirmedStatement[]; readonly unconfirmed: readonly { readonly statementHash: string; readonly reason: string }[] }, never, AnchorVerifier>
```

```
REQUIREMENT: `confirmAnchors` MUST recompute each `statementHash` from its
             statement and MUST refuse a receipt whose `statementHash`
             differs. It MUST pass every other pair to the `AnchorVerifier`
             named by the receipt's `anchor`; a pair with no matching
             verifier, or whose verifier fails or dies, MUST be reported as
             unconfirmed and MUST NOT be passed to `verifyChain`.
```

```
REQUIREMENT: Documentation MUST state that a statement read from the
             consumer's `ReceiptStore` and not confirmed with the anchor
             service proves nothing against a party who can write that
             store.
```

What makes an anchor worth having is that it can be checked against a party
the insider does not control. A receipt read back from the consumer's own
storage could have been forged along with the chain; only the anchor
service's confirmation — a timestamp token checked against the authority's
certificate, an inclusion proof checked against a log's signed tree head —
turns it into evidence. The verifiers are adapters because that check is
specific to each service.

## BEH-AC-021: Inclusion proofs show one record without the others

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record)
> **Risk:** [RSK-BR-006](../../core/gxp/03-risk-assessment.md#rsk-br-006)

```ts
// illustrative — not type-checked
interface InclusionProof {
  readonly hostId: string
  readonly auditSeq: number
  readonly link: ChainLink
  readonly statementHash: string
  readonly path: readonly string[]          // RFC 6962 §2.1.1 audit path, lower-case hex
}
declare function proveInclusion(entries: Iterable<ChainEntry>, statement: AnchorStatement, auditSeq: number): InclusionProof | undefined
declare function verifyInclusion(record: AuditRecord, proof: InclusionProof, confirmed: ConfirmedStatement): boolean
```

```
REQUIREMENT: `proveInclusion` and `verifyInclusion` MUST be pure and total.
             `verifyInclusion` MUST return true only when the record's link
             hash recomputes (BEH-AC-003), the link matches the record, and
             the audit path leads from that link's leaf to the confirmed
             statement's `merkleRoot`.
```

```
REQUIREMENT: Documentation MUST state that an inclusion proof shows that one
             record was part of an anchored window, and nothing about the
             records the proof does not disclose.
```

A reviewer asked about a single change can then show that its record is the
one anchored at that time, without handing over the rest of the window.

## BEH-AC-022: The words a report and its documentation may use

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-AC-004](../decisions/004-separate-from-gxp-companion.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)
> **Regulatory:** supports 21 CFR 11.10(e) (by never implying protection that does not exist)

```
REQUIREMENT: The name, type documentation and every guide of `verifyChain`
             MUST describe it as detection of alteration, insertion, removal
             and reordering of chained records up to `verifiedThrough`, only
             against a party who cannot also rewrite the anchor store. They
             MUST list what it cannot detect: changes in the unanchored tail
             by a party able to write the store, truncation of that tail,
             deletion of the newest anchored windows together with their
             receipts when no expected head is supplied, rewrites of both
             store and anchor store, records falsified or omitted by a party
             controlling the host process or the sink before append, and
             records lost before they reached the sink.
```

```
REQUIREMENT: No report field, message or document of this package MAY call a
             trail "verified", "intact", "tamper-proof" or "compliant"
             without the bound `verifiedThrough` beside it. The report MUST
             NOT contain a single overall pass/fail value.
```

```
REQUIREMENT: Documentation MUST state that the package does not depend on
             `@bridger/gxp`, that the GxP companion may adopt it for the
             optional sealing within its scope (ADR-BR-034), and that this
             adoption, if it happens, is specified by that companion.
```

A single "valid: true" is the result most likely to be quoted without its
limits. Reporting "links consistent through 1 204; anchored through 1 000;
records 1 001–1 204 covered by the chain alone" is longer, and it is the
only statement the check supports.

## BEH-AC-023: The package ships no production anchor

> **See:** [ADR-AC-002](../decisions/002-anchor-defends-against-insider.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md)
> **Satisfies:** [URS-BR-026](../../core/urs.md#urs-br-026-know-which-compliance-obligations-remain-mine)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The main entry point of `@bridger/audit-chain` MUST NOT export
             an `Anchor`, `AnchorVerifier` or `ReceiptStore` implementation —
             no default, no no-op, no "log only", no local-file anchor. The
             only implementations are the fixtures of
             `@bridger/audit-chain/testing` (`scriptedAnchor`,
             `memoryReceiptStore`, `memoryChainSink`).
```

```
REQUIREMENT: The testing fixtures MUST identify themselves as such in every
             receipt they issue (`anchor: "testing:scripted"`), and
             `confirmAnchors` MUST report such receipts as unconfirmed unless
             a testing verifier is wired explicitly.
```

An anchor shipped with the package would sit next to the trail it is meant to
check, under the same operator — exactly the arrangement that gives no
protection against an insider. The reasoning is core's for the gate
(ADR-BR-032): a control that does nothing must not be available in a form
that looks like one. Anchor adapters for particular services may be published
as separate packages, each stating what its service's independence rests on.

## BEH-AC-024: Required acceptance checks

> **See:** [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
> **Satisfies:** [URS-BR-022](../../core/urs.md#urs-br-022-obtain-a-complete-ordered-and-gap-detectable-lifecycle-record), [URS-BR-025](../../core/urs.md#urs-br-025-generate-qualification-evidence-from-executed-tests)
> **Risk:** [RSK-BR-018](../../core/gxp/03-risk-assessment.md#rsk-br-018)

```
REQUIREMENT: The package's test suite MUST contain at least one test for
             each of the following (planned acceptance scenarios
             REQ-AC-001–012, traceability §2):
             1. Wrapping: records written through core reach the inner
                `ChainSink` unchanged, each with one link; an inner failure
                surfaces as `AuditWriteFailed` and sets core's latch after
                `auditTimeout`; no other condition fails a write; an
                unsupported `schemaVersion` is appended with its marker
                (BEH-AC-001, BEH-AC-002, BEH-AC-008).
             2. Canonical form: links recompute with an independent RFC 8785
                implementation; absent fields stay absent; the domain string
                and type tags are present; a record holding a lone surrogate
                is appended with `canonical: "jcs-escaped"` and its link
                recomputes (BEH-AC-003).
             3. Retry: a write that fails, times out, or succeeds in the
                store but reports failure is retried with the identical
                link; the head advances once; a retry with different content
                is appended with a "retry-mismatch" marker and reported by
                `verifyChain` (BEH-AC-004).
             4. Order: a record from a second host, or with a skipped or
                repeated `auditSeq`, is appended with a "chain-order" marker,
                never refused; core's writer is not held; `verifyChain`
                reports the break (BEH-AC-005).
             5. `ChainSink.split`: record before link; a crash between the
                two leaves a "missing-link" break, never a link without a
                record (BEH-AC-006).
             6. Keyed hasher and `continuesFrom`: links carry `keyId`;
                genesis commits to the previous head; a missing host is
                visible as a "prev-mismatch" (BEH-AC-007).
             7. Windows: contiguous, in order, never merged or re-windowed;
                Merkle root and head hash match RFC 6962 test vectors with
                this package's tags (BEH-AC-010, BEH-AC-014).
             8. Off the write path: with `scriptedAnchor` hanging, `record`
                completes within its normal bound, system transitions keep
                being recorded and chained, and memory stays within the
                compact range and `maxPendingWindows` statements; with
                `ChainGate` wired, operator calls outside `allow` are refused
                "anchor-overdue" past the limit and "chain-break" after a
                marked link, each with one core `rejected` record, while
                `record` never fails for either (BEH-AC-011, BEH-AC-013).
             9. Status and close: status counts and log levels; a final
                window on scope close; the unanchored tail logged after
                `closeTimeout` (BEH-AC-012, BEH-AC-015).
             10. `verifyChain`: purity and totality (property test over
                 generated stores); `report.sequence` equals core's
                 `verifyAuditSequence`; `linksCheckedThrough` capped at the
                 first sequence problem (BEH-AC-017, BEH-AC-018).
             11. Detection matrix: generated edits — one record changed,
                 inserted, removed, reordered; a full recomputation of the
                 chain; truncation of the tail; deletion of the last anchored
                 windows with their receipts, with and without
                 `expectedHeads`; records falsified before the sink — are
                 each reported or not reported exactly as the table of
                 BEH-AC-016 states, and `verifiedThrough` never covers an
                 edited record (BEH-AC-016, BEH-AC-019).
             12. Receipts, inclusion and wording: unconfirmed receipts never
                 reach `verifyChain`; testing receipts stay unconfirmed;
                 inclusion proofs verify and fail on any changed byte; no
                 report carries an overall pass/fail value; the main entry
                 point exports no anchor (BEH-AC-020–BEH-AC-023).
```

Check 11 is the one that matters most: it executes the threat table, so that
the package's documentation can never state a detection property its tests
do not show — including, explicitly, the cases it does not detect.

**Settled here.** (1) `verifyChain` is pure and builds on core's
`verifyAuditSequence` instead of re-implementing it (BEH-AC-017,
BEH-AC-018). (2) The report's bound is `verifiedThrough`, and there is no
overall pass/fail value; whether the trail ends where it should is a separate
`head` result, confirmed only against an independently learned head
(BEH-AC-019, BEH-AC-022). (3) Receipt confirmation is
an effect run before the pure check, through verifier adapters (BEH-AC-020).
(4) No production anchor is shipped (BEH-AC-023).

**Open.** (1) A streaming form of `verifyChain` for exports too large to hold
in memory, with the same result. (2) A portable export format (entries,
statements, receipts) that an auditor's own tool can read without this
package. (3) Whether `confirmAnchors` should cache confirmations, which would
make a later run depend on an earlier one.

---

_Previous: [02 — Anchoring](./02-anchoring.md)_ · _Next: [Invariants](../invariants.md)_
