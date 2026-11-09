# 07 — Optional Sealing

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-BEH-07                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Functional Specification                                     |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

The digest of each entry ([BEH-GX-010](./02-trail-store-port.md#beh-gx-010-a-trailentry-carries-the-record-its-canonical-text-and-its-digest)) shows whether an entry's bytes
still match the digest stored beside them. It cannot show that someone who
changed both did so. Sealing links each host's entries into a hash chain —
each seal covers the entry's digest and the seal before it — and copies the
latest seal, now and then, into the anchor store of
[06 — High-Water Marks and Anchors](./06-high-water-marks-and-anchors.md).
Verification then detects an alteration, insertion, removal or reordering of
sealed entries up to the last verified anchor, provided the party who made
the change could not also rewrite the anchor store. That proviso is the
whole of the claim; nothing here prevents a change ([ADR-GX-009](../decisions/009-optional-sealing.md),
[ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 5). Sealing is off by default. This file owns
BEH-GX-049–056 and uses all eight.

Planned source: `packages/gxp/src/sealing/seal.ts` and
`packages/gxp/src/checks/verifySeals.ts` *(Planned)*.

## BEH-GX-049: The seal chain is defined per host over the entries' digests

> **Invariant:** [INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015), [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
interface SealEnvelope {
  readonly v: 1
  readonly prev: string     // seal of the host's entry at auditSeq − 1, or GENESIS for auditSeq 1
  readonly seal: string     // "sha256:" + hex(SHA-256(UTF-8(JCS({ v: 1, hostId, auditSeq, prev, digest }))))
}
const GENESIS = "sha256:0000000000000000000000000000000000000000000000000000000000000000"

interface SealingOptions {
  readonly anchorEvery: { readonly records: number; readonly interval: Duration.Input }  // BEH-GX-051
}
```

```
REQUIREMENT: For the entry of host H at sequence number n with digest d,
             `seal` MUST be "sha256:" followed by the lower-case hexadecimal
             SHA-256 of the UTF-8 bytes of the RFC 8785 canonical form of the
             object `{ "v": 1, "hostId": H, "auditSeq": n, "prev": p,
             "digest": d }`, where p is the `seal` of H's entry at n − 1, or
             GENESIS when n is 1.
```

```
REQUIREMENT: `prev` in the envelope MUST equal p. A host's chain MUST be
             linear: exactly one sealed entry per sequence number, each sealed
             against its immediate predecessor (BEH-GX-022).
```

```
REQUIREMENT: Sealing MUST use SHA-256 only, with no key. The companion MUST
             NOT describe a seal as a signature, a MAC or evidence of who
             wrote the entry.
```

Including `hostId` and `auditSeq` in each sealed object means an entry
cannot be moved to another position or another host's chain and keep its
seal; including the digest means its content cannot change; including `prev`
means no entry can be removed or inserted without changing every seal after
it. None of this is secret, by design: anyone holding the entries can
recompute every seal, which is what makes verification independent of the
companion — and what makes the anchors, held elsewhere, indispensable
([BEH-GX-055](#beh-gx-055-without-a-matching-anchor-a-consistent-chain-shows-only-consistency)).

## BEH-GX-050: The envelope sits beside the record, and a repeat is never re-sealed

> **Invariant:** [INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence), [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry)
> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-001](../urs.md#urs-gx-001-store-audit-records-with-honest-acknowledgement)
> **Risk:** [RSK-GX-002](../gxp/03-risk-assessment.md#rsk-gx-002)
> **Regulatory:** supports 21 CFR 11.10(e); ALCOA+ Original

```
REQUIREMENT: The envelope MUST be stored as `TrailEntry.seal` and MUST NOT be
             added to the record, its canonical text or its digest
             (BEH-GX-010). The record stored MUST remain the record core
             created.
```

```
REQUIREMENT: The sink MUST compute an entry's envelope only from the record's
             digest and the stored or remembered seal of the previous entry
             (BEH-GX-022), so that every attempt to write the same record
             yields the same envelope. On "already-stored", the stored
             envelope MUST be kept; it MUST NOT be recomputed into the store,
             replaced or written a second time.
```

```
REQUIREMENT: The trail store MUST treat the envelope as part of the entry for
             the idempotence rule of BEH-GX-011: a repeat whose envelope
             differs from the stored one MUST NOT replace it. The sink's
             read-back (BEH-GX-021) MUST compare the stored envelope with the
             computed one and MUST fail the write with `AuditWriteFailed` when
             they differ.
```

Keeping the seal out of the record keeps core's record the original: a reader
who does not care about sealing reads exactly what core created, and the
digest of the record is the same whether sealing was on or off.

## BEH-GX-051: Anchors are taken every N records, every T, and at close

> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-008](../decisions/008-high-water-anchors.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-004](../urs.md#urs-gx-004-detect-loss-of-the-newest-records)
> **Risk:** [RSK-GX-003](../gxp/03-risk-assessment.md#rsk-gx-003), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
> **Regulatory:** supports 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: With sealing on, an anchor is a high-water mark carrying `seal`
             (BEH-GX-042). The recorder MUST put an anchor: when an entry
             whose `auditSeq` is a multiple of `anchorEvery.records` has been
             acknowledged to core; when `anchorEvery.interval` of `Clock` time
             has passed since the last anchor and the position moved; and at
             close (BEH-GX-044).
```

```
REQUIREMENT: The anchor's `seal` MUST be the seal of the entry at its
             `lastWritten`, taken from the sink's memory when it holds that
             entry's seal, and otherwise read from the trail store. When
             neither is available, the recorder MUST put no anchor for that
             position and MUST log the failure at error level.
```

```
REQUIREMENT: `anchorEvery.records` MUST be an integer from 1 to 100000
             (default 1000) and `anchorEvery.interval` between 1 second and 24
             hours (default 15 minutes). `GxpLayer.make` MUST refuse sealing
             with `anchors: "not-used"` with `GxpLayerInvalid` (BEH-GX-004).
```

The two triggers bound the unanchored tail in both directions: a busy host
is anchored at least every N records, a quiet one at least every T. The
defaults trade the size of the window in which an alteration goes
undetectable against the write load on the anchor store; a consumer can
narrow both.

**Settled here.** Sealing requires the anchor store. A chain with no anchor
detects only inconsistent edits; anyone able to edit entries can recompute
every later seal, so an unanchored chain would invite exactly the over-claim
the companion exists to avoid ([RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)).

## BEH-GX-052: verifySeals recomputes the chain and compares it with every anchor

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded), [INV-GX-013](../invariants.md#inv-gx-013-a-hosts-seal-chain-is-linear-over-exactly-the-stored-sequence)
> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [NFR-GX-006](../urs.md#nfr-gx-006-bounded-memory-on-read)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports the consumer's review under 21 CFR 11.10(e) and EU GMP Annex 11 §9 (detection only)

```ts
// illustrative — not type-checked
declare function verifySeals(
  store: TrailStoreShape,
  anchors: AnchorStoreShape,
  options: { readonly hostId: string; readonly pageSize?: number }
): Effect.Effect<CheckReport, TrailReadFailed | AnchorReadFailed>
```

| Kind | Reported when |
| --- | --- |
| `chainBreak` | an entry has no envelope; its `prev` differs from the stored seal of the entry before it (GENESIS for n = 1); its `seal` differs from the seal recomputed from its own stored `digest` and `prev`; or the entry before it is missing |
| `anchorMismatch` | an anchor's `seal` differs from the stored seal of the entry at its `lastWritten`, or that entry does not exist |
| `unanchoredTail` | sealed entries exist above the highest anchor whose seal matched (from that anchor's `lastWritten` + 1 to `lastSeq`) |

```
REQUIREMENT: `verifySeals` MUST read the host's entries in ascending order as
             a stream, holding one page and the previous entry's seal, and
             MUST check every entry for `chainBreak` against the stored
             previous entry, not against a recomputed one, so that one altered
             entry yields findings at that entry and, where its stored seal
             changed, at the next.
```

```
REQUIREMENT: It MUST check every anchor of the host, not only the latest, and
             MUST report each mismatching anchor separately. `unanchoredTail`
             MUST be computed from the highest anchor that matched; when no
             anchor matched, from 1.
```

```
REQUIREMENT: Seals MUST be recomputed from each entry's stored `digest`.
             `verifySeals` MUST NOT recompute the digest from `canonical`;
             that is `checkTrailEntries`'s `digestMismatch` (BEH-GX-034), and
             a full verification MUST run both.
```

Checking every anchor matters because an attacker who can rewrite the trail
and wants the last anchor to match must rebuild the chain to reproduce it —
which they can only do by keeping everything up to that anchor unchanged. An
older anchor that mismatches therefore points at an alteration before it,
even if the newest one matches.

## BEH-GX-053: Sealing is off by default and fixed for the life of a host

> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-BR-030](../../core/decisions/030-audit-sink-port.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports EU GMP Annex 11 §4.4 (a stated configuration)

```
REQUIREMENT: `trailSink` without a `sealing` option, and `GxpLayer.make` with
             `sealing: "off"`, MUST write no envelope. Sealing MUST be enabled
             only by passing `SealingOptions` explicitly.
```

```
REQUIREMENT: Whether a host's trail is sealed MUST be decided by the sink
             configuration in force when the host writes its first record, and
             MUST NOT change while the host lives. Because each host
             construction has a new `hostId` (BEH-BR-016), enabling or
             disabling sealing takes effect with the next host built.
```

```
REQUIREMENT: When sealing is off, every check that offers seal verification
             MUST list `chainBreak` and `anchorMismatch` in `notCheckedKinds`
             (BEH-GX-033).
```

Sealing is optional because it is not free — one more hash per record, one
more read on retries, an anchor store under separate custody — and because a
consumer whose trail store already provides an equivalent control under their
own validation does not need it. Making it a per-host constant keeps every
chain linear from its first entry.

## BEH-GX-054: Seal verification is described in exactly one way

> **See:** [ADR-GX-027](../decisions/027-claims-and-non-claims.md), [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine), [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e); EU GMP Annex 11 §9

```
REQUIREMENT: Documentation, type documentation and every report MUST call the
             function "seal verification" and MUST describe what it does in
             these words, or a strict subset of them: "Seal verification
             detects alteration, insertion, removal or reordering of sealed
             records up to the last verified anchor, against a party that
             cannot also rewrite the anchor store."
```

```
REQUIREMENT: Every report containing seal verification MUST add: "Entries
             above the last verified anchor are not covered. Sealing does not
             prevent any change." It MUST NOT describe a sealed trail with any
             term on the list of claims that ADR-GX-027 forbids.
```

The sentence is copied from core's narrowed non-claim ([ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) #5)
so that the two trees cannot drift apart. Each of its qualifications is a real
limit: "up to the last verified anchor" — the tail is open; "against a party
that cannot also rewrite the anchor store" — custody is the consumer's;
"detects" — nothing is prevented.

## BEH-GX-055: Without a matching anchor, a consistent chain shows only consistency

> **Invariant:** [INV-GX-009](../invariants.md#inv-gx-009-a-finding-is-never-suppressed-or-upgraded)
> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)
> **Satisfies:** [URS-GX-005](../urs.md#urs-gx-005-optionally-detect-alteration-of-sealed-records), [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004), [RSK-GX-005](../gxp/03-risk-assessment.md#rsk-gx-005)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e)

```
REQUIREMENT: When a host has no anchor whose seal matched, a report with no
             `chainBreak` finding MUST state "The chain is internally
             consistent; no anchor confirms it." and MUST report
             `unanchoredTail` for the whole trail.
```

```
REQUIREMENT: When the anchor store cannot be read, `verifySeals` MUST fail
             with `AnchorReadFailed` rather than report chain consistency
             alone.
```

A chain recomputed end to end by whoever changed an entry is consistent; only
a seal held outside their reach can show it is not the chain that was
written. The report says which of the two the reader has.

## BEH-GX-056: Sealing covers trail entries only

> **See:** [ADR-GX-009](../decisions/009-optional-sealing.md), [ADR-GX-013](../decisions/013-single-use-tickets.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)
> **Satisfies:** [URS-GX-016](../urs.md#urs-gx-016-know-which-obligations-remain-mine)
> **Risk:** [RSK-GX-004](../gxp/03-risk-assessment.md#rsk-gx-004)
> **Regulatory:** supports (by delimiting) 21 CFR 11.10(e), 11.70

```
REQUIREMENT: The seal chain MUST cover trail entries and nothing else.
             Documentation MUST state that tickets and their event log
             (BEH-GX-068), high-water marks and evidence packs are not sealed;
             an evidence pack is identified by its own digest (BEH-GX-132).
```

```
REQUIREMENT: An entry reported as `unknownSchemaVersion` (BEH-GX-036) MUST
             still be sealed by the sink when it is stored and verified by
             `verifySeals`, since the chain depends only on the entry's digest
             and position.
```

Saying where the chain stops prevents a reader from extending it in their
mind to approvals: a ticket's link to the change it approved is checked by
the digest rules of [11 — Signature Linking](./11-signature-linking.md), not
by the trail's seals.

---

_Previous: [06 — High-Water Marks and Anchors](./06-high-water-marks-and-anchors.md)_ · _Next: [08 — Approval Policy](./08-approval-policy.md)_
