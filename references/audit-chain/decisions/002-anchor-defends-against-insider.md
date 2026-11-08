# ADR-AC-002: Only an external anchor defends against an insider

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-AC-ADR-002                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-AC-001)                 |

---

## Context

A hash chain is computed from public inputs with a public function. Anyone who can write the store can change a record and recompute every later link; the result is as consistent as the original. Core's [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), non-claim 5, already bounds any Bridger sealing: detection "up to the last verified anchor, only against a party that cannot also rewrite the separately held anchor store", and no package calls a trail tamper-proof. The gap analysis of 2026-11-08 (item 13) states the same: a chain alone can be rewritten wholesale; the external anchor is what stops an insider.

## Decision

- **The anchor is the defence; the chain is the structure.** The package publishes, per window of records, an `AnchorStatement` (window bounds, Merkle root, head hash, previous statement) through an `Anchor` port to a party outside the store, and keeps receipts in a separate `ReceiptStore`.
- **Chain-only is named and limited.** `HashChainSink.layerUnanchored` exists only as an explicit choice, and is described as detection of corruption and of edits made without recomputing links — no protection against anyone able to write the store.
- **A keyed hash is not an anchor.** The optional `KeyedHasher` protects only against a party who cannot use the key; it is never described as a substitute.
- **Verification is bounded.** `verifyChain` reports `verifiedThrough` — the highest record covered by a confirmed, matching anchor — and never a single pass/fail value. Receipts count only after confirmation with the anchor service (`AnchorVerifier`).
- **No anchor is shipped.** Anchors are adapters supplied by the consumer, whose independence the consumer establishes.

## Alternatives considered

- **Chain only, described as tamper evidence.** Rejected: it would be a false claim against the very party (an insider with store access) a regulated user most needs to detect.
- **Signing each record.** Rejected as the package's mechanism: a signing key reachable from the host is reachable by whoever controls the host, and per-record signatures add cost without addressing truncation. A consumer may still wire a `KeyedHasher` backed by a hardware module.
- **A built-in local anchor (a second file, a second table).** Rejected: an anchor under the same operator as the trail gives no protection against that operator.

## Consequences

**Positive**:

- The package's claims match ADR-BR-034 non-claim 5 word for word, and its tests execute the threat table (BEH-AC-016, acceptance check 11).
- Inclusion proofs let a single record be shown without the rest of its window.

**Negative**:

- The tail after the last anchor is covered by the chain alone; truncation of it is not detected.
- The consumer must choose, operate and document an independent anchor service; the package cannot.

**Trade-off accepted**: a narrower, checkable claim that depends on an external party, rather than a self-contained mechanism that would be described as protecting against a party it cannot detect.

## References

- Behaviours: [02 — Anchoring](../behaviors/02-anchoring.md), [03 — Verification](../behaviors/03-verification.md)
- Invariants: [INV-AC-004](../invariants.md#inv-ac-004-verification-never-reports-more-than-it-checked)
- Core decisions: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-037](../../core/decisions/037-audit-sequence-separate-from-event-seq.md), [ADR-BR-032](../../core/decisions/032-operation-gate.md) (no control shipped in a form that does nothing)
- External: RFC 6962 (Merkle tree hash and audit paths); RFC 3161 (time-stamp protocol), as an example of an anchor service.
