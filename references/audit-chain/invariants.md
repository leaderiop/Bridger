# Runtime Invariants

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-INV                                               |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification                                     |
> | Change History | 0.3 (2026-11-08): INV-AC-006 (bundle verified from the bundle alone), INV-AC-007 (one series, one canonicaliser, one algorithm); store port renamed `ChainStore` (round 2: recheck items 13, 14) (CCR-AC-003)<br>0.2 (2026-11-08): INV-AC-002 restated (an unexpected record is marked, not refused); INV-AC-003 markers; INV-AC-005 restated (anchoring never delays or fails a write; fail-closed at the gate) (CCR-AC-002)<br>0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

Properties of `@bridger/audit-chain` that hold for every execution. As in the
core ([invariants](../core/invariants.md)), each names the mechanism that is
to enforce it; every **Source** and **Verification** is *(Planned)*, nothing
here is implemented, and no invariant may be cited as evidence until a test
that checks it has been written and executed
([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## INV-AC-001: One link per record, identical across retries

Every record a `HashChainSink` appends has exactly one link, and every
attempt to append that record carries the same link, equal in every field.

**Source**: `packages/audit-chain/src/HashChainSink.ts` *(Planned)* — a head
and at most one pending link; a call with the pending `recordId` re-sends the
pending link; a retry whose content differs is appended once, with a
"retry-mismatch" break marker, never with a silently second link.

**Implication**: an idempotent store that absorbs a retried write keeps the
one link that was computed, never one of two; core's retry in place
(BEH-BR-202) cannot produce two chains.

**Verification** *(Planned)*: property test over generated sequences of
inner failures, timeouts and "stored but reported failed" writes, asserting
one distinct link per `recordId` in the store.

**Related**: [BEH-AC-003](behaviors/01-hash-chain-sink.md#beh-ac-003-the-canonical-encoding-and-the-link), [BEH-AC-004](behaviors/01-hash-chain-sink.md#beh-ac-004-a-retried-record-gets-the-identical-link), [BEH-AC-007](behaviors/01-hash-chain-sink.md#beh-ac-007-optional-keyed-hasher-and-continuity-across-hosts), [ADR-AC-001](decisions/001-chain-in-a-wrapping-sink.md).

---

## INV-AC-002: The head advances only on a successful append, and an unexpected record is marked

The sink's head moves only after the inner `append` of a record has
succeeded, and only to that record's link. A record that is not the expected
successor — `auditSeq` not the head's plus one, or a `hostId` other than the
sink's first — is appended with a break marker naming what was expected.

**Source**: `packages/audit-chain/src/HashChainSink.ts` *(Planned)* — the
host and order check of BEH-AC-005 before computing a link; the head updated
in the success continuation of `append` only.

**Implication**: no record is stored without a link to its predecessor, and
a wiring defect (two hosts on one sink, a sink reused after a restart) is a
marked break that `verifyChain` reports and the gate piece can act on,
instead of a silent hole in the chain or a refusal that halts core's writer.

**Verification** *(Planned)*: scenario tests for a second `hostId`, a skipped
and a repeated `auditSeq`, each appended with a "chain-order" marker and none
refused; property test that the head observed in the status stream advances
exactly once per successful append.

**Related**: [BEH-AC-001](behaviors/01-hash-chain-sink.md#beh-ac-001-hashchainsink-provides-the-core-auditsink-by-wrapping-an-inner-chainstore), [BEH-AC-004](behaviors/01-hash-chain-sink.md#beh-ac-004-a-retried-record-gets-the-identical-link), [BEH-AC-005](behaviors/01-hash-chain-sink.md#beh-ac-005-contiguity-and-order-are-checked-per-host-and-a-violation-is-marked-not-refused), [ADR-AC-001](decisions/001-chain-in-a-wrapping-sink.md), core [INV-BR-023](../core/invariants.md#inv-br-023-the-audit-sequence-is-contiguous-per-host).

---

## INV-AC-003: The stored record is the record core handed over

The `record` of every `ChainEntry` the package hands to a store is, field for
field, the `AuditRecord` core passed to `record`.

**Source**: `packages/audit-chain/src/HashChainSink.ts` and
`packages/audit-chain/src/ChainStore.ts` *(Planned)* — the record object is
passed through without copying into a new shape; `split` passes it unchanged
to the wrapped `AuditSink`; unsupported `schemaVersion` values and strings
that are not I-JSON are marked on the link, never rewritten in the record.

**Implication**: a reader that ignores the chain reads the record core
created, which remains the original (core BEH-BR-208); the chain never
changes what the trail says.

**Verification** *(Planned)*: deep-equality assertions between the records
core produced in a `TestHost` run and the records in `memoryChainStore`; a
schema-version-2 record and a record holding a lone surrogate stored unchanged
with their markers.

**Related**: [BEH-AC-002](behaviors/01-hash-chain-sink.md#beh-ac-002-the-record-reaches-the-store-unchanged), [BEH-AC-006](behaviors/01-hash-chain-sink.md#beh-ac-006-the-chainstore-obligations-and-chainstoresplit), [ADR-AC-001](decisions/001-chain-in-a-wrapping-sink.md).

---

## INV-AC-004: Verification never reports more than it checked

For every host, `verifiedThrough` ≤ `linksCheckedThrough` ≤ the last
`auditSeq` before the first sequence problem, and `verifiedThrough` is the end
of a window whose statement, and every earlier one, was confirmed and
matched.

**Source**: `packages/audit-chain/src/verifyChain.ts` *(Planned)* — core's
`verifyAuditSequence` first; link recomputation capped at the first sequence
problem; anchors matched in order; no overall pass/fail field in
`ChainReport`.

**Implication**: a report cannot be read as covering records that were not
anchored, or anchored records whose chain is broken.

**Verification** *(Planned)*: property test over generated stores and edits
(the detection matrix of acceptance check 11), asserting the inequalities and
that no edited record lies at or below `verifiedThrough`.

**Related**: [BEH-AC-010](behaviors/02-anchoring.md#beh-ac-010-windows-and-their-merkle-root), [BEH-AC-017](behaviors/03-verification.md#beh-ac-017-verifychain-is-a-pure-total-function), [BEH-AC-018](behaviors/03-verification.md#beh-ac-018-the-sequence-check-comes-first-from-core), [BEH-AC-019](behaviors/03-verification.md#beh-ac-019-links-are-recomputed-and-anchors-matched), [ADR-AC-002](decisions/002-anchor-defends-against-insider.md).

---

## INV-AC-005: Anchoring never delays or fails a write

No call of `record` waits on `publish`, on `ReceiptStore.put` or on a window
being published, and no anchoring condition — an overdue anchor, a full queue
of statements — fails it. Fail-closed anchoring refuses operator calls at the
gate, never records at the sink.

**Source**: `packages/audit-chain/src/Anchoring.ts` *(Planned)* — publishing
in a fiber of the sink layer's scope; `record` updates the open window's
compact range and never reads the anchoring state; `ChainGate` reads the
status.

**Implication**: the host's availability for recording does not depend on the
anchor service, and core's writer is never held behind an anchoring
condition; a consumer who wants changes to stop chooses that at the gate.

**Verification** *(Planned)*: scenario with `scriptedAnchor` hanging forever
and records — system records included — still accepted within their normal
bound, memory bounded, and with `ChainGate` wired, operator calls refused
"anchor-overdue" past the limit while `record` keeps succeeding.

**Related**: [BEH-AC-009](behaviors/02-anchoring.md#beh-ac-009-the-anchor-and-receiptstore-ports), [BEH-AC-011](behaviors/02-anchoring.md#beh-ac-011-anchoring-runs-on-a-schedule-off-the-write-path), [BEH-AC-013](behaviors/02-anchoring.md#beh-ac-013-fail-closed-anchoring-is-an-explicit-gate-piece-and-the-sink-keeps-recording), [ADR-AC-003](decisions/003-anchoring-off-the-write-path.md).

---

## INV-AC-006: A bundle is verified from the bundle alone

`verifyBundle` reads nothing but its arguments: no network, no clock, no file
system, no environment. Every receipt it reports as confirmed was confirmed
offline against the effective trust roots — the inspector's pinned roots when
given, otherwise the roots carried in the bundle, reported as such — and a
receipt that would need an online check is never reported as confirmed.

**Source**: `packages/audit-chain/src/Bundle.ts` *(Planned)* — a pure function
over the decoded bundle and options; offline receipt verifiers are pure
adapters.

**Implication**: an inspector can check a trail on an isolated machine, and
the report says exactly which evidence was checked there.

**Verification** *(Planned)*: acceptance checks 18 and 19 of BEH-AC-040, with
network, clock and file system unavailable.

**Related**: [BEH-AC-034](behaviors/05-verification-bundle.md), [BEH-AC-035](behaviors/05-verification-bundle.md), [BEH-AC-036](behaviors/05-verification-bundle.md), [ADR-AC-005](decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md).

---

## INV-AC-007: One series, one canonicaliser and one algorithm

Every link of a series names the series id, the canonicaliser id and the
algorithm it was computed with, and these are the same for every link of the
series; a link computed otherwise is reported as a break, never accepted as a
continuation.

**Source**: `packages/audit-chain/src/ChainSink.ts` *(Planned)* — the series
spec is fixed at construction; links carry `seriesId`, `canon` and `alg`.

**Implication**: a verifier recomputes every link from the stored bytes and
the named canonicaliser alone; a change of canonicaliser or algorithm cannot
pass silently.

**Verification** *(Planned)*: acceptance check 15 of BEH-AC-032.

**Related**: [BEH-AC-025](behaviors/04-generic-chain.md), [BEH-AC-026](behaviors/04-generic-chain.md), [BEH-AC-027](behaviors/04-generic-chain.md), [ADR-AC-005](decisions/005-one-chain-over-any-stream-hashing-the-stored-form.md).

---

_Previous: [03 — Verification](./behaviors/03-verification.md)_ · _Next: [Traceability](./traceability.md)_
