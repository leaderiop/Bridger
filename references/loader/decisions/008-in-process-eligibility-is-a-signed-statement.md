# ADR-LD-008: In-process eligibility is a signed statement of its own, and guests reach the host as remote links

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-ADR-008                                           |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-09): Initial draft (specification audit F-06); guests run outside the host's runtime, in the deployment's bundle runtime, not necessarily in another process (independent review) (CCR-LD-004) |

---

## Context

[ADR-LD-005](./005-in-process-loading-is-for-first-party-code.md) decided that
only first-party code is evaluated in the host's process and that other code
is fetched with `fetchVerified` and run as a guest, outside the host's
runtime. The specification did
not carry that decision through. A catalog entry and a manifest said nothing
about whose code a package was; the same "package" rule accepted a partner's
release and the application's own; the reference wiring mapped every catalog
entry to `Loader.lazy`, whose `load` evaluates in the host's process; and there
was no path from a catalog entry to a guest at all. A partner's signed package
listed in the catalog would therefore have been evaluated next to the host
(audit of 2026-11-09, finding F-06).

## Decision

- **A separate statement type, "first-party", carries in-process
  eligibility** ([09](../behaviors/09-trust-class-and-guest-links.md),
  BEH-LD-065). It names the package digest, id and version, like "package",
  and is accepted under its own rule in `StatementRules`, with no default.
  `load` verifies it at step 4 after the "package" statement; `fetchVerified`
  does not.
- **A catalog entry's trust class is derived from that statement only**
  (BEH-LD-066): "first-party" when it verifies, "guest" otherwise.
- **`Loader.lazy` refuses guest entries** with `NotFirstParty` (BEH-LD-067).
- **Guests reach the host through `LoaderRemote.link`** (BEH-LD-068): a
  remote link built from the verified entry alone, whose transport fetches and
  verifies the bundle at each session attempt and hands the verified bytes to
  a bundle runtime of the remote companion.
- **A link carries a manifest derived from its guest's** (BEH-LD-069), and
  **one view of revoked package digests** serves the refusal list, the kill
  switch, the gate and the remote boundary (BEH-LD-070).

## Alternatives considered

- **A `trust` field in the manifest.** Rejected: the manifest is signed by
  the package's own signers, partners included, so a partner could mark its
  own package first-party.
- **Infer the class from which signers or roles satisfied the "package"
  rule** (for example, two rules for "package", one for in-process code).
  Rejected: the class would follow from an accident of key configuration — an
  in-house reviewer's countersignature on a partner release could satisfy the
  in-process branch — and no signer would ever have made the decision
  explicitly.
- **An unsigned marker in the catalog feed or the application's
  configuration.** Rejected for the catalog: the feed is untrusted input
  (BEH-LD-033). A pinned digest list in configuration remains possible, as a
  `pinned` rule for "first-party".
- **Fetch guest bundles once, when the desired list is built.** Rejected: it
  makes every sync fetch code, holds the bytes for the life of the link, and
  lets a revocation or policy change take effect only at the next sync.
  Fetching per session keeps reconcile free of fetches and re-checks at each
  session.
- **A lazy guest link (`Plugin.lazy` around `Remote.define`).** Rejected: a
  lazy definition's manifest must agree with the loaded definition, and a
  link provides nothing itself while its session child provides the contract,
  so the two cannot agree; it would also put a fetch in a build slot, which
  the remote companion forbids (remote BEH-RM-003).

## Consequences

**Positive**:

- No package is evaluated in the host's process without a signed,
  revocable, explicitly made statement that it may be (INV-LD-009).
- Partner packages listed in a catalog have a working path to the host that
  never evaluates them in its runtime; where they run is the deployment's
  bundle runtime, which may be a worker thread of the host's own process
  (remote BEH-RM-053).
- A guest's signed declarations reach the gate, consent screens and placement
  through its link's manifest.
- A signer or statement revocation reaches the remote boundary at once.

**Negative**:

- Every deployment that loads code in-process must configure a
  "first-party" rule and sign, or pin, its own packages a second time.
- A guest link needs the application's own copy of the contract and a bundle
  runtime for each guest it runs.
- Revoking only a first-party statement does not stop an in-process plugin
  already running; the package digest must be revoked for that.

**Trade-off accepted**: one more signature per first-party release, in
exchange for in-process evaluation that is always an explicit, signed
decision rather than a consequence of what the catalog happens to list.

## References

- Behaviours: [09 — Trust Class and Guest Links](../behaviors/09-trust-class-and-guest-links.md), [05 — Catalog and Lazy Loading](../behaviors/05-catalog-and-lazy-loading.md), [07 — Signed Statements](../behaviors/07-signed-statements.md)
- Decisions: [ADR-LD-005](./005-in-process-loading-is-for-first-party-code.md), [ADR-LD-006](./006-one-verification-step-for-every-signed-statement.md)
- Core: [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013), [RSK-BR-017](../../core/gxp/03-risk-assessment.md#rsk-br-017)
- Companion: [references/remote/](../../remote/README.md) (RM)
