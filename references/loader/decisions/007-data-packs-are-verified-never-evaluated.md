# ADR-LD-007: Data packs are verified and served as bytes, never evaluated

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-007                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-LD-003)                 |

---

## Context

Applications ship signed reference data (price lists, rule tables, interaction data) that must be traceable to its publisher, revocable, and known to be current. A loader package must have entry code (BEH-LD-001), and the open question of 01 — Package and Digest asked whether such data needed a fourth sub-digest or a separate package kind. Treating data as code would hand it to an evaluator; treating it as unsigned configuration would lose provenance and revocation.

## Decision

- A data pack is its own package kind: a `DataPackManifest` and one payload, with no files, no entry and no plugin manifest fields ([08 — Data Packs](../behaviors/08-data-packs.md), BEH-LD-057).
- Its digest uses its own domain string, "bridger-data-pack-v1", and commits to the manifest and to the payload with its media type (BEH-LD-058).
- It is verified by `SignaturePolicy.verify` as a "data-pack" statement and served from held bytes; nothing evaluates it, and it never enters `AcceptedDigests` or `Loader.resident` (BEH-LD-059).
- The effective window and freshness (`maxAge` since the signed `issuedAt`) are reported on every read; a pack past `maxAge` is reported with `DataPackStale`, and the application decides whether stale data may be used (BEH-LD-060).
- Versions per id only rise; a revoked pack is withdrawn from `current` (BEH-LD-062, BEH-LD-063).

## Alternatives considered

- **A plugin package whose entry exports the data.** Rejected: the data would be evaluated, and a data publisher would become a code publisher.
- **A fourth sub-digest of the package.** Rejected: data and code would be released and revoked together, though they change on different schedules and are signed by different people.
- **Refuse stale packs in the loader.** Rejected: whether stale data may be used differs by data set and by use; the loader reports and the application decides.

## Consequences

**Positive**:

- Reference data has the same provenance, revocation and record as code, without being run.
- Staleness is visible on every read.

**Negative**:

- Applications must state a `DataPackStore` and decide, per use, what to do with stale data.
- Switching to a new pack is not a host operation; core records nothing about it.

**Trade-off accepted**: a second, smaller package kind and an explicit staleness decision, rather than overloading code packages or hiding age.

## References

- Behaviours: [08 — Data Packs](../behaviors/08-data-packs.md), [07 — Signed Statements](../behaviors/07-signed-statements.md)
- Invariants: [INV-LD-007](../invariants.md#inv-ld-007-a-data-pack-is-never-evaluated)
- Core: [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)
