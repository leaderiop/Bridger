# ADR-GX-012: What a binding covers and how its digest is computed

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-GX-ADR-012                                           |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-GX-03 §5)           |
> | Approved by    | — (pending; single maintainer, see PROC-GX-03 §5)            |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-11-10): An empty value the request carries is bound as carried, not dropped (H7) (CCR-GX-006)<br>0.2 (2026-11-09): Binding version 2: `onBehalfOf`, `undo` and request-only `manifestDigest`, `allowChildren`, `mandatoryInterceptions`; gate-flow annotations and `previousManifest` deliberately not bound (F-01) (CCR-GX-002)<br>0.1 (2026-10-03): Initial draft (CCR-GX-001)                 |

---

## Context

A signature must be bound to exactly the change it approves (URS-GX-007; Part 11 §11.70). The signer sees a rendering at issue time; the gate sees only an `OperationRequest` ([BEH-BR-219](../../core/behaviors/25-operation-gate.md)) at call time; a reviewer sees the `requested` or `rejected` record later ([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)). All three must reduce to the same value. Since CCR-BR-014 the request and the records carry `definition { version?, digest? }` for plugin-addressed operations (on `requested` and `rejected` too) and `configChange { paths, fingerprints? }` ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)). Values never appear ([ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md)).

## Decision

- **The binding.** A binding is the JSON value

  ```ts
  // illustrative — not type-checked
  interface Binding {
    readonly v: 2                                        // CCR-GX-002; version 1 lacked the fields below marked v2
    readonly scope: string                               // the deployment the ticket is valid for
    readonly operation: GatedOperation                   // as on the request
    readonly target?: { readonly id: string; readonly realm: string }
    readonly definition?: { readonly version?: string; readonly digest?: string }
    readonly config?: {
      readonly form: "raw" | "decoded"                    // install → raw, reconfigure → decoded (ADR-BR-039)
      readonly paths: ReadonlyArray<string>               // as on the request's configChange, in its order
      readonly fingerprints?: ReadonlyArray<{ readonly path: string; readonly fingerprint: string }>  // as on the request
    }
    readonly requester: { readonly id: string; readonly kind: "user" | "service" }   // the actor, never `display`
    readonly onBehalfOf?: { readonly id: string; readonly realm: string; readonly version?: string; readonly digest?: string }  // v2
    readonly undo?: true                                 // v2: an undo action of an atomic reconcile
    readonly requestOnly?: {                             // v2: on the request, not on any record
      readonly manifestDigest?: string
      readonly allowChildren?: boolean
      readonly mandatoryInterceptions?: ReadonlyArray<{ readonly serviceId: string; readonly id?: string }>
    }
    readonly reason?: string                             // present only when the policy rule sets bindReason
  }
  ```

  Optional members are absent, never `null`, when the request has no such field, and bound as the request carries them when it has one, an empty array or object included (`mandatoryInterceptions: []`, `definition: {}`), so that an issuer and a gate never disagree on whether an empty value is "absent"; `fingerprints` is absent when `configChange` carries none, and `requestOnly` is present exactly when one of its fields is ([BEH-GX-065](../behaviors/09-approval-tickets.md)).
- **The digest.** `bindingDigest = "sha256:" + hex(SHA-256(JCS(binding)))`, lower-case hex, with JCS and SHA-256 as in [ADR-GX-005](../decisions/005-jcs-and-sha256.md). The issuer computes it from the binding it renders to the signer; the gate recomputes it from the request and the checks from the record, all three with the one function `bindingOf(source, { scope, bindReason })` ([BEH-GX-082](../behaviors/11-signature-linking.md)).
- **Scope.** `scope` is a string set once in the gate's configuration (for example `"lims-prod-eu"`) and in the issuer's. A ticket issued for one scope never matches a request in another, so a ticket for a test system cannot be replayed on production ([RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006)).
- **Version 2 (CCR-GX-002).** Since CCR-BR-017 to CCR-BR-026 the `OperationRequest` also carries `onBehalfOf`, `undo`, a `manifest` in `definition`, `previousManifest`, `allowChildren`, `mandatoryInterceptions` and gate-flow `annotations` ([BEH-BR-219](../../core/behaviors/25-operation-gate.md)). A binding that left them out would approve a `replace` from plugin code as if an operator made it, an undo as if it were the forward change, and a definition without its manifest. Version 2 binds `onBehalfOf` (without `revision`, which a proposal cannot know), `undo`, and, under `requestOnly`, the manifest's digest, `allowChildren` and `mandatoryInterceptions`. Records carry `onBehalfOf` and `undoes` but none of the `requestOnly` fields ([BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md)), so the record-side link takes `requestOnly` from the consumed binding and every rendering says those fields were matched by the gate only ([BEH-GX-083](../behaviors/11-signature-linking.md)). Gate-flow annotations are left out: they are call-time context for gate pieces, not part of the change, and a policy that needs one decides on it in its own piece ([BEH-BR-292](../../core/behaviors/30-operation-context-annotations.md)). `previousManifest` is left out: it describes what is replaced, which `target` and the record's `before` already name.
- **What is deliberately out.** The binding has no timestamp, no `correlationId` (that selects the ticket, [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md)), no signer and no configuration value. Time limits are on the ticket; signers are on the signatures over the digest.
- **Policy decides strength.** A rule may require `definition.digest` (`requireDigest`) or fingerprints for every changed path (`requireFingerprints`); a request without them is refused even if the digests match ([ADR-GX-014](../decisions/014-deny-by-default-policy.md)).
- **Test vectors.** [09 — Approval tickets](../behaviors/09-approval-tickets.md) carries binding/digest vectors; check 17 recomputes them.

## Alternatives considered

- **Bind to the whole request object.** Rejected: core may add fields; every addition would silently change every digest. The binding names its fields and its version `v`.
- **Bind configuration paths only.** Rejected: it approves "change `database.url`" without saying to what; with fingerprints the approval names the value without revealing it.
- **Always bind the reason.** Rejected: many workflows let the caller phrase the reason at call time. Binding it is a per-rule choice.

## Consequences

**Positive**:

- Signer, gate and reviewer compute the same digest from three different inputs; any difference in operation, target, definition, paths, fingerprints, requester, principal, undo, request-only fields or (when bound) reason refuses.
- Bindings carry no values, so tickets can be stored and archived like records.

**Negative**:

- `install` fingerprints are over raw top-level keys, coarser than `reconfigure`'s ([ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md)); a binding is only as precise as core's request.
- A new binding field needs a new `v` and a CCR-GX; version 2 was the first such change (CCR-GX-002). The record shows only part of what the gate matched: `requestOnly` is evidenced by the consumption, not by the record.

**Trade-off accepted**: a fixed, versioned field list, in exchange for one digest that issuer, gate and reviewer always agree on.

## References

- Behaviours: [09 — Approval tickets](../behaviors/09-approval-tickets.md), [11 — Signature linking](../behaviors/11-signature-linking.md), [12 — Approval gate](../behaviors/12-approval-gate.md)
- Invariants: [INV-GX-003](../invariants.md#inv-gx-003-an-allowed-call-holds-a-valid-binding-with-an-equal-digest), [INV-GX-005](../invariants.md#inv-gx-005-no-configuration-value-or-key-material-appears-in-any-companion-output), [INV-GX-012](../invariants.md#inv-gx-012-the-canonical-form-is-deterministic-across-platforms)
- Risks: [RSK-GX-006](../gxp/03-risk-assessment.md#rsk-gx-006), [RSK-GX-015](../gxp/03-risk-assessment.md#rsk-gx-015)
- Decisions: [ADR-GX-005](../decisions/005-jcs-and-sha256.md), [ADR-GX-011](../decisions/011-ticket-cited-by-correlation-id.md), [ADR-GX-014](../decisions/014-deny-by-default-policy.md), [ADR-GX-017](../decisions/017-hmac-through-the-core-port.md)
- Core: [ADR-BR-033](../../core/decisions/033-no-config-values-in-audit.md), [ADR-BR-039](../../core/decisions/039-config-fingerprint-port.md), [BEH-BR-195](../../core/behaviors/23-audit-sink-and-record.md), [BEH-BR-219](../../core/behaviors/25-operation-gate.md), [BEH-BR-248](../../core/behaviors/27-manifest-and-lazy-activation.md), [BEH-BR-259](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [BEH-BR-260](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [BEH-BR-263](../../core/behaviors/28-plugin-principal-and-mandatory-policy.md), [BEH-BR-292](../../core/behaviors/30-operation-context-annotations.md), [BEH-BR-325](../../core/behaviors/32-generic-gate-and-plan.md)
- External: 21 CFR Part 11 §11.70.
