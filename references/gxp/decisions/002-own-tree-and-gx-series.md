# ADR-GX-002: An own specification tree, process and GX identifier series

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-002                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

The core specification under `references/core/` has its own identifier series (`BEH-BR`, `INV-BR`, `ADR-BR`, `URS-BR`, `RSK-BR`, `REQ-BR`), its own change register (the CCR-BR series), its own procedures and a checker that holds the tree consistent. Its document IDs already use `BRIDGER-GXP-NN` for the core's own GxP documents (regulatory scope, compliance matrix, risk assessment, validation plan).

The companion ([ADR-GX-001](../decisions/001-separate-package.md)) needs requirements, risks and decisions of its own, and it must cite core's without being able to change them. Its "Companion" rows in core's compliance matrix, risk assessment and validation plan need answers that live somewhere other than core.

## Decision

- **Own tree.** The companion is specified under `references/gxp/`, a sibling of `references/core/`, with the same layout: README, overview, glossary, URS, invariants, traceability, roadmap, `behaviors/`, `decisions/`, `gxp/`, `process/`, `appendices/`, `scripts/`, and an `index.yaml` in every directory with `package: bridger-gxp, infix: GX`.
- **Own identifier series, infix `GX`.** `BEH-GX-NNN`, `INV-GX-NNN`, `ADR-GX-NNN`, `URS-GX-NNN`, `NFR-GX-NNN`, `RSK-GX-NNN`, `REQ-GX-NNN` and `CCR-GX-NNN`, three digits, never reused, allocated in blocks as in core (eight behaviours per file; file 20 holds sixteen). Document IDs are `BRIDGER-GX-*` (for example `BRIDGER-GX-ADR-002`), which cannot collide with core's `BRIDGER-GXP-NN`.
- **Own process.** PROC-GX-01 (identifier scheme), PROC-GX-02 (definitions of done) and PROC-GX-03 (change control) are written for this tree. They follow core's procedures and add one rule: a change on either side that affects an interface in `appendices/core-interface-map.md` carries a cross-reference to a CCR on the other side.
- **Core is cited, never copied.** A core identifier appears in this tree only as a link into `../core/...` (or `../../core/...` from a subdirectory), and every cited `*-BR-nnn` is listed in the core-interface map. A core requirement is never restated as a GX requirement; a GX requirement may build on it.
- **Same document conventions.** Every document carries the nine-row Document Control table; documents are Draft 0.x, ADRs are Proposed, planned code paths are marked *(Planned)* ([ADR-GX-026](../decisions/026-prospective-specification.md)).

## Alternatives considered

- **Extend core's tree with a `companion/` folder and BR identifiers.** Rejected: the core checker, claims lint and change register would cover two packages with different processes, and a core reviewer could not approve core without approving the companion.
- **Use the infix `GXP`.** Rejected: core's GxP documents already use `BRIDGER-GXP-NN`, so `BRIDGER-GXP-ADR-001` and `BRIDGER-GXP-03` would read as one family.
- **A shared register across both trees.** Rejected for now: each tree's checker validates its own register; check 13 of the GX checker accepts a CCR-BR reference only if core's register defines it ([ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)).

## Consequences

**Positive**:

- The companion can be reviewed, approved and changed on its own cycle, and its requirements trace without touching core.
- A reader sees from the infix alone which package a requirement binds.

**Negative**:

- Two registers, two checkers and two sets of procedures to keep aligned; the coupling rule and check 15 (core's checker must pass) are the mitigations.
- Links across trees can rot when core renames a heading; check 12 follows `../core` links and validates their anchors.

**Trade-off accepted**: duplicated process scaffolding, in exchange for a companion whose identifiers, changes and approvals never mix with core's.

## References

- Behaviours: [01 — Companion boundary](../behaviors/01-companion-boundary.md)
- Decisions: [ADR-GX-001](../decisions/001-separate-package.md), [ADR-GX-026](../decisions/026-prospective-specification.md), [ADR-GX-028](../decisions/028-checker-copy-and-adapt.md)
- Core: [ADR-BR-034](../../core/decisions/034-gxp-companion-scope.md), [ADR-BR-036](../../core/decisions/036-prospective-specification.md)
