# ADR-GX-022: The evidence pack format

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-022                                           |
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

IQ results ([ADR-GX-020](../decisions/020-iq-proof-and-probe.md)), OQ results ([ADR-GX-021](../decisions/021-oq-from-runner-output.md)) and conformance runs ([ADR-GX-006](../decisions/006-conformance-through-testhost.md)) have to reach a reviewer, be filed in the user's document system and be compared with the next run. A pack that differs byte-for-byte between two generations of the same inputs cannot be compared by digest (NFR-GX-001); a pack that mixes raw results and prose makes it unclear which part is evidence.

## Decision

- **Layout.** A pack is one directory with a fixed layout ([BEH-GX-129](../behaviors/17-evidence-pack.md)); the companion writes no archive or container format of it, and packing it for transfer is the consumer's:

  ```
  manifest.json      format "bridger-gx-evidence/1"
  iq.json            IQ results (ADR-GX-020)
  oq.json            OQ results per requirement (ADR-GX-021)
  coverage.json      requirement → tests → outcome, including "not covered"; behaviour → requirements
  checks.json        the check reports given, in input order
  deviations.json    every deviation, with kind and source
  adapters.json      the wired ports' manifests, copied unchanged
  attachments/       the runner output files exactly as read, plus run and conformance manifests
  report.html        derived rendering
  report.md          derived rendering
  ```

- **The manifest.** `manifest.json` holds `{ format: "bridger-gx-evidence/1", package: { name, version, filesDigest }, core: { version }, generatedAt, inputs: [{ as, digest }], files: [{ path, digest, bytes }], statement }`, with `digest` = `"sha256:"` + hex SHA-256 of each file's bytes, listing every file of the pack except `manifest.json`, `signatures.json` and `assessments.json`, sorted by path. `generatedAt` comes from `Clock`.
- **Deterministic.** All JSON files are written in RFC 8785 canonical form ([ADR-GX-005](../decisions/005-jcs-and-sha256.md)) followed by one newline. Arrays are sorted by their documented keys (requirement id, check id, behaviour id, deviation id, path). The same inputs and the same `generatedAt` produce byte-identical packs on any platform.
- **Pack digest.** `packDigest = "sha256:" + hex(SHA-256(the manifest's canonical text))`, that is, the bytes of `manifest.json` without its final line feed. Because the manifest lists every file's digest, the pack digest covers the whole pack.
- **Derived reports are marked.** `report.html` and `report.md` are generated from the JSON files only, deterministically, and their first line states "Derived rendering of evidence pack <packDigest>; the JSON files are the evidence." They contain no result not present in the JSON.
- **Attachments are verbatim.** Runner outputs are copied byte for byte; the generator never re-serialises them, so a reviewer can re-run the generator on `attachments/` and obtain the same `oq.json`.
- **Optional QA signature.** A pack may carry `signatures.json`, outside the manifest's file list, holding signatures over the digest of `{ packDigest, assessmentsDigest }` captured through the same `SignatureCapture` port and manifestation rules as approvals ([ADR-GX-016](../decisions/016-signature-port-and-manifestation.md)). Signing does not change the pack digest. The consumer's deviation assessments go to `assessments.json`, also outside the file list, so assessing a deviation changes neither the pack digest nor the deviation.
- **Comparison.** `diffPacks(prev, next)` reports every IQ check, requirement, conformance case and deviation whose outcome or state changed, appeared or disappeared, every attachment that differs by digest, and a change of policy or eligibility digest.

## Alternatives considered

- **A single PDF report.** Rejected: not machine-comparable, and the rendered text would become the evidence.
- **Include signatures in the manifest.** Rejected: a signature would then change the digest it signs.
- **Free-form JSON.** Rejected: non-canonical output defeats digest comparison.

## Consequences

**Positive**:

- One digest identifies a pack; two packs are compared file by file without reading prose.
- A reviewer can regenerate `oq.json` from the attachments and check it matches.

**Negative**:

- The format is versioned; a change to it needs `bridger-gx-evidence/2` and a reader for both.
- The reports are deliberately plain; any richer rendering is the user's.

**Trade-off accepted**: a strict, canonical layout, in exchange for packs that can be filed, compared and checked by digest.

## References

- Behaviours: [17 — Evidence pack](../behaviors/17-evidence-pack.md), [15 — Installation checks](../behaviors/15-installation-checks.md), [16 — OQ evidence](../behaviors/16-oq-evidence.md)
- Invariants: [INV-GX-010](../invariants.md#inv-gx-010-evidence-results-come-only-from-runner-output-and-gaps-stay-gaps), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
- Risks: [RSK-GX-016](../gxp/03-risk-assessment.md#rsk-gx-016), [RSK-GX-020](../gxp/03-risk-assessment.md#rsk-gx-020)
- Decisions: [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-016](../decisions/016-signature-port-and-manifestation.md), [ADR-GX-020](../decisions/020-iq-proof-and-probe.md), [ADR-GX-021](../decisions/021-oq-from-runner-output.md)
- Core: [ADR-BR-035](../../core/decisions/035-evidence-from-executed-tests.md)
