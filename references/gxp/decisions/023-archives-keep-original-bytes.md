# ADR-GX-023: Archives keep the original canonical bytes

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-023                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-09): Archive format 2: marks, collisions and audit-chain links; audit-chain's verification bundle for sealed trails (C-09) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

A trail is exported to move it between systems, to hand it to an inspector, or to keep it after the live store is retired (URS-GX-015; Part 11 §11.10(b), (c); Annex 11 §17). Digests, seals and binding digests were computed over specific bytes ([ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md)). An exporter that parses the stored record and writes it again (a different JSON library, a newer schema, pretty-printing) produces bytes that no longer hash to the stored digest, and a reader then sees a "mismatch" that the export itself caused, or worse, re-hashes the new bytes and loses the link to the originals. Core keeps no copy and provides no review tool ([BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md); [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md) non-claim 12).

## Decision

- **Original bytes, verbatim.** `exportTrail({ store, tickets, anchors, hostId, range, scope, policy, outDir })` writes `trail.jsonl` with one line per entry, in `(hostId, auditSeq)` order: the entry's stored `canonical` text exactly as read, never parsed and re-serialised. Digests, marks and audit-chain links go in `seals.jsonl` as `{ hostId, auditSeq, recordId, digest, marks?, collision?, link? }` lines; a sealed trail also carries `@bridger/audit-chain`'s verification bundle (`chain-bundle.json`, BEH-AC-033). The format is `"bridger-gx-archive/2"` since CCR-GX-002.
- **What else goes in.** `tickets.jsonl` (the ticket store's events for the tickets the trail cites, as stored), `anchors.jsonl`, `check-report.json` (the `CheckReport`, tail and seal reports run at export, [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md)) and `manifest.json` (`format: "bridger-gx-archive/1"`, file digests as in the evidence pack, the supported `schemaVersion` list, the range exported).
- **A human-readable rendering, marked as derived.** `trail.html` renders each record and, for each approved change, its manifestations (printed name, `signedAt` UTC, meaning; [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)). Its first line states that it is a derived rendering and that `trail.jsonl` is the record.
- **Re-verification on read.** `readArchive(dir)` recomputes every file digest against the manifest, every entry digest from its line, audit-chain's `verifyBundle` where a bundle is present, and the binding links, and returns a fresh `CheckReport`; it never trusts the archived report.
- **Supported schema versions are stated.** The archive manifest lists the `schemaVersion`s the exporter understood. An entry with another version is exported verbatim and reported as `unknownSchemaVersion`, never dropped or converted.
- **No migration by rewriting.** The companion offers no function that converts archived records to a newer schema. A future reader handles old versions, or a user-run migration produces a new archive that references the old one by its manifest digest.
- **Not a review tool.** The rendering supports reading; searching, filtering and sign-off of a review are the user's tooling.

## Alternatives considered

- **Export the parsed record objects.** Rejected: the bytes behind every digest would be lost.
- **Pretty-print for readability.** Rejected for `trail.jsonl`; readability is the job of the derived rendering.
- **Re-seal on export.** Rejected: a new chain would replace the evidence of the old one; the archive carries the original links.

## Consequences

**Positive**:

- Every digest and link in the archive can be recomputed from the bytes in the archive, years later, with any JCS and SHA-256 implementation.
- An archive can be checked without the companion, from its manifest and the published formats.

**Negative**:

- Archives are larger than a compressed re-encoding would be.
- Old schema versions must be readable by future readers; this is a cost the user carries through retention.

**Trade-off accepted**: verbatim bytes and no migration in place, in exchange for archives whose digests still mean what they meant when written.

## References

- Behaviours: [18 — Archive and export](../behaviors/18-archive-and-export.md)
- Invariants: [INV-GX-008](../invariants.md#inv-gx-008-no-companion-api-rewrites-a-stored-entry), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms), [INV-GX-015](../invariants.md#inv-gx-015-every-signed-binding-carries-a-manifestation)
- Risks: [RSK-GX-019](../gxp/03-risk-assessment.md#rsk-gx-019), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
- Decisions: [ADR-GX-004](../decisions/004-append-only-trail-store.md), [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-007](../decisions/007-checks-never-claim-integrity.md), [ADR-GX-029](../decisions/029-sealing-through-audit-chain.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-208](../../core/behaviors/23-audit-sink-and-record.md)
- External: 21 CFR Part 11 §11.10(b), (c); EU GMP Annex 11 §17.
