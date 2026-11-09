# Qadi Audit Comparison

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-APP-02                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Appendix                                                     |
> | Change History | 0.2 (2026-11-09): Encoding row and sealing bullet follow ADR-GX-030 and ADR-GX-029 (F-02, C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

The sibling `qadi` specification has a companion package of its own,
`@qadi/audit`, recorded in ADR-QD-056 (the package and its five
capabilities), ADR-QD-057 (signature types harmonised with `@qadi/core`) and
ADR-QD-058 (`HasSignature` and `SignatureHistory`), and specified in qadi's
behaviour file 33, *Audit Pipeline* (BEH-QD-249–257). It is the nearest
precedent for `@bridger/gxp`. This appendix records what the companion takes
from it, what it changes, and what it designs fresh because the precedent has
no counterpart. It is informative; the qadi documents were read, not changed,
and no `QD` identifier is defined or relied on normatively here.

## 1. What is taken over

| Qadi precedent | Where | In the companion |
| -------------- | ----- | ---------------- |
| A separate companion package; core gains no dependency on it | ADR-QD-056 | [ADR-GX-001](../decisions/001-separate-package.md) |
| Every capability that needs storage, I/O, identity or crypto is a caller-supplied port | ADR-QD-056 | [ADR-GX-003](../decisions/003-ports-without-defaults.md) — and the companion goes further: decision ports have no default even in the main entry point's types ([BEH-GX-003](../behaviors/01-companion-boundary.md#beh-gx-003-no-port-that-stores-authenticates-signs-holds-keys-or-decides-has-a-default)) |
| No shipped signature default, not even a no-op, because a no-op signature service is a false-compliance affordance | ADR-QD-056, BEH-QD-255 | [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md): no default `SignatureCapture`; the testing fixture requires its decision function |
| Re-authentication is invisible to the package and stays the implementer's | ADR-QD-056 | Kept, but made visible: the captured signature carries an attestation (`reauthenticated: true`, method, event, components) that the companion records and does not verify |
| Encoding refuses rather than approximates a value with no safe representation | ADR-QD-056, BEH-QD-250 | Outside the trail, canonicalisation refuses a value I-JSON cannot represent ([ADR-GX-005](../decisions/005-jcs-and-sha256.md)); the trail sink differs on purpose: it stores such a record with the escaped encoding and a mark, and an unknown `schemaVersion` with a mark, because a refused record stops core's trail, and a gate piece refuses operator changes instead ([ADR-GX-030](../decisions/030-sink-marks-and-gate-refuses.md)) |
| Names chosen for the mechanism, not for what a reviewer might infer ("staging", not "write-ahead log") | ADR-QD-056, BEH-QD-254 | "Checks on read", "no findings of the checked kinds" and "seal verification" ([ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)) |
| Gap-and-duplicate detection named as such, with the explicit note that a party able to renumber stored rows passes it | BEH-QD-254 | Core's `verifyAuditSequence` has the same limit ([BEH-BR-215](../../core/behaviors/24-time-ids-and-sequence.md)); the companion's checks inherit it unless optional sealing and separately held anchors are wired |
| Correctness from deterministic in-memory test layers that consumers can reuse | ADR-QD-056 | The testing entry point `@bridger/gxp/testing` ([ADR-GX-024](../decisions/024-fixtures-are-marked.md)), with fixtures marked so that installation checks refuse them |
| A recommended, non-exhaustive vocabulary of signature meanings | ADR-QD-057, ADR-QD-058 | Meanings are declared per policy rule; the policy, not a global list, decides which meanings a binding needs |

## 2. What is changed

| Qadi choice | Reason it does not transfer | Companion choice |
| ----------- | --------------------------- | ---------------- |
| The trail port has one method, `write`, returning `void`; there is no read side | Bridger's audit sink fails closed and latches ([ADR-BR-031](../../core/decisions/031-audit-failure-policy.md)), so the acknowledgement must mean "stored", and checks on read need a read side | `TrailStore` with `append` answering `"stored"` or `"already-stored"`, plus `read` and `hosts` ([ADR-GX-004](../decisions/004-append-only-trail-store.md)) |
| A circuit breaker skips writes while open, dropping entries when no staging is wired | In Bridger a change that cannot be recorded is not made ([BEH-BR-203](../../core/behaviors/23-audit-sink-and-record.md)); a sink that skips writes would turn audit failures into unrecorded changes | No breaker, no queue, no background retry in the sink; core retries in place and latches |
| Optional best-effort staging, never blocking the write | Core already owns ordering and retry with one writer per host ([BEH-BR-202](../../core/behaviors/23-audit-sink-and-record.md)); a second buffer would sit between the record and its acknowledgement | No staging; the sink holds no record after acknowledging it |
| Write order is not promised under concurrency; readers sort by timestamp or an optional sequence number | Core writes each host's records in `auditSeq` order, contiguously from 1 ([BEH-BR-212](../../core/behaviors/24-time-ids-and-sequence.md)) | Uniqueness per (hostId, auditSeq) is a store rule; ordering is checked on read, per host |
| One flat, global sequence with no grouping key | Bridger has several hosts, each with its own sequence | Every check, chain and anchor is per `hostId` |
| Signature capture is driven by an obligation handler at enforcement time | Bridger's seam is the operation gate, which must decide within `gateTimeout` and must not wait for a human ([BEH-BR-221](../../core/behaviors/25-operation-gate.md)) | Sign first, then call: the signature is captured on a ticket before the call, and the gate only checks the ticket ([ADR-GX-010](../decisions/010-sign-first-then-call.md)) |
| Retention, archival and a decommissioning checklist as caller-invoked pure functions | Retention schedules and decommissioning are the regulated user's records-management decisions | `exportTrail` and `readArchive` only; retention and decommissioning stay with the consumer ([ADR-GX-023](../decisions/023-archives-keep-original-bytes.md)) |

## 3. What is designed fresh

The qadi precedent has no counterpart for the following, so they are designed
here without one:

- **An adapter conformance suite** that drives the real core through
  `TestHost`, with fault injection after commit
  ([ADR-GX-006](../decisions/006-conformance-through-testhost.md)).
- **Detection of tail loss** against high-water marks held under separate
  custody ([ADR-GX-008](../decisions/008-high-water-anchors.md)), and **optional sealing**, a per-host
  hash chain verified against separately held anchors, specified by
  `@bridger/audit-chain` and adopted by the companion
  ([ADR-GX-029](../decisions/029-sealing-through-audit-chain.md)). Qadi's sequence check, like core's, does not
  detect a renumbered trail; neither does the companion without sealing.
- **Linking a signature to the change it approved** (21 CFR 11.70), through a
  binding digest recomputed from the request and a single-use, compare-and-set
  consumption ([ADR-GX-012](../decisions/012-binding-contents.md),
  [ADR-GX-013](../decisions/013-single-use-tickets.md)), and **signature manifestation**
  (21 CFR 11.50) on every signed binding.
- **Separation of duties** on actor identifiers
  ([ADR-GX-015](../decisions/015-separation-of-duties.md)).
- **Keyed fingerprints of configuration values**, through the core port added
  for the purpose by CCR-BR-014 ([ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)).
- **Installation and operational evidence** — IQ checks that distinguish
  proof from probe, OQ results taken only from test-runner output, and a
  deterministic evidence pack ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md),
  [ADR-GX-021](../decisions/021-oq-from-runner-output.md), [ADR-GX-022](../decisions/022-evidence-pack-format.md)).

## 4. Shared limits

Both companions make the same kind of non-claim. Neither package provides
storage of its own, neither makes the record store resistant to a party with
write access to it, and neither makes a regulated system compliant; those
obligations stay with the regulated user ([ADR-GX-027](../decisions/027-claims-and-non-claims.md),
[ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md)).
