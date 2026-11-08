# Loader — Traceability

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-LD-TRACE                                             |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Functional Specification (companion)                         |
> | Change History | 0.3 (2026-11-08): Rows and scenario summaries for the review resolutions; RSK-BR-043 and RSK-BR-044 notes (CCR-LD-002)<br>0.2 (2026-11-08): Integration — core seams cited by link; names aligned with core (CCR-LD-001)<br>0.1 (2026-11-08): Initial draft (CCR-LD-001)                 |


---

Traceability for `@bridger/loader`, on the pattern of core's [traceability](../core/traceability.md): behaviour → invariant, decision and core seam (§1); acceptance scenarios (§2); risks (§3). Every scenario is *planned*; none has been written or executed, so nothing here is evidence ([ADR-BR-035](../core/decisions/035-evidence-from-executed-tests.md)).

## §1 Behaviour traceability

Core seams are core behaviour file numbers; files 26, 27 (CCR-BR-017) and 32 (CCR-BR-019) are specified in core.

| Behaviour | File | Invariant | Decisions | Core seam |
| --------- | ---- | --------- | --------- | --------- |
| BEH-LD-001 | [01](behaviors/01-package-and-digest.md) | — | ADR-LD-002 | 27 |
| BEH-LD-002 | [01](behaviors/01-package-and-digest.md) | INV-LD-003 | ADR-LD-002 | — |
| BEH-LD-003 | [01](behaviors/01-package-and-digest.md) | — | ADR-LD-002 | — |
| BEH-LD-004 | [01](behaviors/01-package-and-digest.md) | INV-LD-001 | ADR-LD-001 | — |
| BEH-LD-005 | [01](behaviors/01-package-and-digest.md) | — | ADR-LD-002 | — |
| BEH-LD-006 | [01](behaviors/01-package-and-digest.md) | — | ADR-LD-001 | — |
| BEH-LD-007 | [01](behaviors/01-package-and-digest.md) | INV-LD-003 | ADR-LD-002 | 01, 11, 18 |
| BEH-LD-008 | [01](behaviors/01-package-and-digest.md) | — | ADR-BR-027, ADR-BR-034 | 11 |
| BEH-LD-009 | [02](behaviors/02-load-pipeline.md) | INV-LD-001 | ADR-LD-001 | 01 |
| BEH-LD-010 | [02](behaviors/02-load-pipeline.md) | — | ADR-LD-001 | — |
| BEH-LD-011 | [02](behaviors/02-load-pipeline.md) | INV-LD-002 | ADR-LD-001 | 01 |
| BEH-LD-012 | [02](behaviors/02-load-pipeline.md) | — | ADR-LD-005 | 06 |
| BEH-LD-013 | [02](behaviors/02-load-pipeline.md) | INV-LD-001 | ADR-LD-001 | — |
| BEH-LD-014 | [02](behaviors/02-load-pipeline.md) | — | ADR-LD-001 | 27 |
| BEH-LD-015 | [02](behaviors/02-load-pipeline.md) | — | ADR-LD-001, ADR-BR-032 | 02, 25, 27, 32 |
| BEH-LD-016 | [02](behaviors/02-load-pipeline.md) | — | ADR-LD-001, ADR-BR-030 | 23 |
| BEH-LD-017 | [03](behaviors/03-signature-policy.md) | — | ADR-LD-003 | — |
| BEH-LD-018 | [03](behaviors/03-signature-policy.md) | — | ADR-LD-003 | — |
| BEH-LD-019 | [03](behaviors/03-signature-policy.md) | — | ADR-LD-003 | — |
| BEH-LD-020 | [03](behaviors/03-signature-policy.md) | — | ADR-LD-003 | — |
| BEH-LD-021 | [03](behaviors/03-signature-policy.md) | — | ADR-LD-003 | — |
| BEH-LD-022 | [03](behaviors/03-signature-policy.md) | INV-LD-006 | ADR-LD-003 | — |
| BEH-LD-023 | [03](behaviors/03-signature-policy.md) | — | ADR-LD-003 | — |
| BEH-LD-024 | [03](behaviors/03-signature-policy.md) | INV-LD-001 | ADR-LD-001 | — |
| BEH-LD-025 | [04](behaviors/04-revocation-and-kill-switch.md) | — | ADR-LD-004 | — |
| BEH-LD-026 | [04](behaviors/04-revocation-and-kill-switch.md) | — | ADR-LD-004 | — |
| BEH-LD-027 | [04](behaviors/04-revocation-and-kill-switch.md) | INV-LD-004 | ADR-LD-004 | — |
| BEH-LD-028 | [04](behaviors/04-revocation-and-kill-switch.md) | — | ADR-LD-004, ADR-BR-023 | 18 |
| BEH-LD-029 | [04](behaviors/04-revocation-and-kill-switch.md) | INV-LD-005 | ADR-LD-004, ADR-BR-029 | 10, 18, 22 |
| BEH-LD-030 | [04](behaviors/04-revocation-and-kill-switch.md) | — | ADR-LD-003, ADR-LD-004 | — |
| BEH-LD-031 | [04](behaviors/04-revocation-and-kill-switch.md) | — | ADR-LD-005 | 04, 06 |
| BEH-LD-032 | [04](behaviors/04-revocation-and-kill-switch.md) | INV-LD-005 | ADR-LD-004, ADR-BR-032 | 25 |
| BEH-LD-033 | [05](behaviors/05-catalog-and-lazy-loading.md) | — | ADR-LD-002 | 27 |
| BEH-LD-034 | [05](behaviors/05-catalog-and-lazy-loading.md) | INV-LD-003 | ADR-LD-002, ADR-LD-003 | — |
| BEH-LD-035 | [05](behaviors/05-catalog-and-lazy-loading.md) | — | ADR-LD-004 | 19 |
| BEH-LD-036 | [05](behaviors/05-catalog-and-lazy-loading.md) | — | ADR-LD-002 | 26 |
| BEH-LD-037 | [05](behaviors/05-catalog-and-lazy-loading.md) | INV-LD-001, INV-LD-003 | ADR-LD-001 | 27, 25 |
| BEH-LD-038 | [05](behaviors/05-catalog-and-lazy-loading.md) | — | ADR-LD-004 | 18, 27 |
| BEH-LD-039 | [05](behaviors/05-catalog-and-lazy-loading.md) | INV-LD-003 | ADR-LD-005 | references/remote/ (RM) |
| BEH-LD-040 | [05](behaviors/05-catalog-and-lazy-loading.md) | — | ADR-LD-002 | 27 |
| BEH-LD-041 | [06](behaviors/06-limits-and-acceptance.md) | — | ADR-LD-005 | 17 |
| BEH-LD-042 | [06](behaviors/06-limits-and-acceptance.md) | INV-LD-002 | ADR-LD-005 | 06 |
| BEH-LD-043 | [06](behaviors/06-limits-and-acceptance.md) | — | ADR-LD-001 | 21 |
| BEH-LD-044 | [06](behaviors/06-limits-and-acceptance.md) | — | ADR-BR-030, ADR-BR-032 | 23, 25 |
| BEH-LD-045 | [06](behaviors/06-limits-and-acceptance.md) | — | ADR-BR-026 | 21 |
| BEH-LD-046 | [06](behaviors/06-limits-and-acceptance.md) | INV-LD-005 | ADR-LD-004 | 06, 09, 23, 27 |
| BEH-LD-047 | [06](behaviors/06-limits-and-acceptance.md) | — | ADR-BR-034 | — |
| BEH-LD-048 | [06](behaviors/06-limits-and-acceptance.md) | — | ADR-BR-035 | — |

## §2 Acceptance scenario traceability

Each scenario is one numbered acceptance check of [BEH-LD-048](behaviors/06-limits-and-acceptance.md#beh-ld-048-required-acceptance-checks). Planned test file: `packages/loader/test/acceptance.test.ts` *(Planned)*.

| Scenario | Check | Summary | Behaviours |
| -------- | ----- | ------- | ---------- |
| <a id="req-ld-001"></a>REQ-LD-001 | 1 | Package digest construction, sensitivity to every part, malformed paths | BEH-LD-001, BEH-LD-002, BEH-LD-003, BEH-LD-005 |
| <a id="req-ld-002"></a>REQ-LD-002 | 2 | Pipeline order; nothing evaluated on any refusal | BEH-LD-009, BEH-LD-013 |
| <a id="req-ld-003"></a>REQ-LD-003 | 3 | Evaluation from held bytes; closed module resolution | BEH-LD-011 |
| <a id="req-ld-004"></a>REQ-LD-004 | 4 | One evaluation per digest; resident set | BEH-LD-012 |
| <a id="req-ld-005"></a>REQ-LD-005 | 5 | Stamping; ManifestMismatch; manifest without `digest` | BEH-LD-007, BEH-LD-014 |
| <a id="req-ld-006"></a>REQ-LD-006 | 6 | `LoaderGate` as a core gate piece: refusals, exemptions, catalog entries, loader replacement, revoked restarts; removal never refused | BEH-LD-015 |
| <a id="req-ld-007"></a>REQ-LD-007 | 7 | LoadLog fail-closed before evaluation; refusal-record failures; fields per step | BEH-LD-016 |
| <a id="req-ld-008"></a>REQ-LD-008 | 8 | Signature policy: thresholds, roles, distinct signers, windows, statement binding | BEH-LD-017, BEH-LD-018, BEH-LD-019, BEH-LD-020, BEH-LD-021 |
| <a id="req-ld-009"></a>REQ-LD-009 | 9 | No permissive acceptance rule | BEH-LD-019, BEH-LD-022 |
| <a id="req-ld-010"></a>REQ-LD-010 | 10 | Revocation lists: verification, monotonic revision, persistence | BEH-LD-026 |
| <a id="req-ld-011"></a>REQ-LD-011 | 11 | Stale and unavailable revocation; explicit maxAge | BEH-LD-027 |
| <a id="req-ld-012"></a>REQ-LD-012 | 12 | Kill switch as the scope's one reconciler; two actors; pending and retry; outside scope; blast-radius guard; un-revocation; unknown verification | BEH-LD-026, BEH-LD-028, BEH-LD-029, BEH-LD-031, BEH-LD-032 |
| <a id="req-ld-013"></a>REQ-LD-013 | 13 | Signer revocation by identity, at acceptance time, withdraws exactly dependent digests | BEH-LD-030 |
| <a id="req-ld-014"></a>REQ-LD-014 | 14 | Catalog verification, ambiguity, resolution | BEH-LD-033, BEH-LD-034, BEH-LD-035, BEH-LD-036 |
| <a id="req-ld-015"></a>REQ-LD-015 | 15 | Lazy plugins through `Plugin.lazy({ manifest, load, digest })`: a load succeeds; two digests at one version differ; unchanged reconcile evaluates nothing; timeouts inside `buildTimeout` | BEH-LD-037, BEH-LD-038, BEH-LD-046 |
| <a id="req-ld-016"></a>REQ-LD-016 | 16 | fetchVerified evaluates nothing; `stampRemote` | BEH-LD-039 |

## §3 Risk notes

The loader cites core risks; it defines no risk series of its own. New hazards it introduces are proposed for core's register by the integration notes of this change, and are listed here by description only.

| Core risk | How the loader bears on it |
| --------- | -------------------------- |
| [RSK-BR-017](../core/gxp/03-risk-assessment.md#rsk-br-017) Unverified dynamically loaded code | Primary control once adopted: digest and acceptance rule before evaluation (BEH-LD-009), stamping (BEH-LD-007), `LoaderGate` (BEH-LD-015), revocation and kill switch (04). Residual: in-process code can copy stamps and defeat in-process checks (BEH-LD-041); resident revoked code until restart (BEH-LD-031). |
| [RSK-BR-013](../core/gxp/03-risk-assessment.md#rsk-br-013) Realm mistaken for security boundary | Third-party code takes `fetchVerified` to an out-of-process guest (BEH-LD-039, ADR-LD-005); the loader is documented as no isolation (BEH-LD-041). |
| [RSK-BR-014](../core/gxp/03-risk-assessment.md#rsk-br-014) Approval bypass through the raw Host | The kill switch goes through the gate (BEH-LD-032); `LoaderGate` is a gate piece, not a gate (BEH-LD-015). |
| [RSK-BR-018](../core/gxp/03-risk-assessment.md#rsk-br-018) Over-claiming qualification evidence | Claims rules (BEH-LD-008, BEH-LD-047); double signing described as two signer entries, not two people (BEH-LD-020). |
| [RSK-BR-043](../core/gxp/03-risk-assessment.md#rsk-br-043) Trust root or signature policy accepts unapproved code | Distinct signer entries (BEH-LD-020) — not distinct people, which is the application's key custody; Sigstore log evidence checked against a pinned log key (BEH-LD-018); exemptions of `LoaderGate` are explicit configuration (BEH-LD-015). |
| [RSK-BR-044](../core/gxp/03-risk-assessment.md#rsk-br-044) Revocation does not take effect | `LoaderGate` refuses operator restarts of revoked digests (BEH-LD-015); signers revoked by identity, re-evaluated at acceptance time, unknown verification dropped (BEH-LD-025, BEH-LD-028, BEH-LD-030). Residual: system transitions are never gated, so only removal or disabling makes a digest unusable (core G60); store rollback is the consumer's control (BEH-LD-026). Introduced by the control: a compromised revocation key can remove plugins — bounded by a threshold policy on lists and `maxDroppedPerRevision` (BEH-LD-032). |

Hazards proposed for core's register (descriptions only; numbers assigned by the integrator): (a) a compromised or mis-configured trust root or signature policy accepts unapproved code; (b) a stale or suppressed revocation channel keeps a revoked release loadable or running — bounded by `maxAge` for new loads and reported by the kill switch's status; (c) the kill switch is blocked by a gate or drain limit and a revoked plugin keeps running — reported as `pending`.

---

_Previous: [Invariants](./invariants.md)_ · _Next: [README](./README.md)_
