# ADR-BR-050: A declared veto of a plugin not yet loaded is woken or denies; hook phases run enrich, veto, advise

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-050                                              |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed — amends ADR-BR-042 and ADR-BR-046                  |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-BR-024)                 |

---

## Context

A recheck of 2026-11-08, made for one consuming application, found that two drafts which are each sound fail together, and that hook points miss pieces a policy owner needs:

- **A lazy veto fails open.** A lazy plugin registers its hooks in its build, which runs only after a trigger, and reads never trigger ([27 — Manifest and Lazy Activation](../behaviors/27-manifest-and-lazy-activation.md), BEH-BR-245). A hook dispatch sees only registered contributions (BEH-BR-299), so a `dormant` plugin's veto is never asked and the dispatch returns `Allowed`. The recheck ranks this first (K1) and records it as a contradiction between core 27 and core 31.
- **Hook-point gaps (K8).** `onError` is per hook point, not per contribution; the breaker is per contribution, not per plugin; vetoes run before enrichment, so no veto can judge an enriched value (the "final say" of a pricing plugin); the admission rule does not see what a contribution hooks; and the skip policy can only skip, never block (URS gap G62).
- **An `OnEvent` wake drops its event (K9).** The dispatch that wakes a lazy consumer is over before the consumer has a listener, so the consumer always misses the first event it exists for.
- **Open questions of core 27.** Returning an idle loaded plugin to `dormant` (G37), and whether `wake` records the caller's principal (G39), were left open.

The owner of the completion plan decided (D3): a dormant veto wakes the plugin by default, and a failed or late wake applies the point's `onError`, so deny points deny.

## Decision

- **Declarations are readable.** The host reports, without loading anything, the contributions that registrations not yet loaded declare in their manifests (`Host.declaredContributions`), each with an optional hook `role` and `target` from the manifest entry. A hook point reaches the host through a `HostLink` carried in the dispatching fiber (BEH-BR-250); without one, a point with veto codes denies (`no-host-link`).
- **A wake step before the phases.** Each dispatch admits each declaration by the point's own rule (`who`, with `declared: true`), consults the point's policy, and then applies the point's `dormant` policy: "wake" (the default for veto) wakes the plugin from the dispatcher's fiber and waits until its contribution registers, at most until the deadline less one `timeout`; "deny" denies at once and still wakes. A failed or late wake of a veto is resolved by the point's `onError`. Enrich and advisory declarations are skipped by default (BEH-BR-309).
- **Per-contribution `onError` and breaker scope.** A contribution may choose its `onError` within a set the point allows, and the admission rule sees the choice. A point may keep one breaker per plugin instead of per contribution (BEH-BR-310).
- **Ordered phases.** A dispatch runs enrich, then veto, then advise. Veto and advisory hooks receive the enrichments beside the input, never merged into it, with the ids of enrichers that produced nothing (BEH-BR-311).
- **Targets and a policy deny.** A point may declare a target descriptor computed from the input and a selector schema; a contribution names the targets it hooks, the admission rule sees the selector, and non-matching contributions are not called. The policy (renamed from `skip`) may return `Deny`, recorded as "denied-policy" and never as the contributor's veto (BEH-BR-312).
- **The triggering event is held.** An `OnEvent` wake holds the one event that caused it and delivers it once, with `emit` semantics, to the woken plugin's own listeners when it becomes `active`; it is dropped with a diagnostic when no listener registers, the activation fails or ends, or `holdTimeout` elapses (BEH-BR-251).
- **Idle return.** `Plugin.lazy({ idle })` returns a loaded plugin that nothing uses to `dormant` through a normal, ungated system stop, recorded as `lazy-idle`; the next wake loads again (BEH-BR-252).
- **Who asked for a wake.** The root `lazy-triggered` record of a `wake` or of an event dispatch carries the caller's principal as `onBehalfOf`, the one exception to core 28's rule that system records carry none (BEH-BR-253).

## Alternatives considered

- **Require veto owners to be eager** (a documented rule, offered by the recheck). Rejected as the only answer: nothing would detect a breach, and a lazy veto would still fail open silently. It remains available — an eager owner needs no wake.
- **Treat every declared veto of a dormant plugin as a deny, without waking.** Rejected as the default (kept as `dormant: "deny"`): a lazy veto plugin would then block every dispatch until something else wakes it.
- **Have the host register placeholder contributions for dormant plugins.** Rejected: the host would interpret registries it does not own, and a placeholder has no hook to call.
- **Let the host wake veto plugins when a hook point is created.** Rejected: the host must not consult hook points (BEH-BR-297), and it would load every veto plugin at start, defeating lazy activation.
- **Keep veto first and add a second veto phase after enrichment.** Rejected: two veto phases double the deadline reasoning, and a veto that does not need enrichments loses nothing by running after them.
- **Merge enrichments into the input before the veto phase.** Rejected for the reason of BEH-BR-301: one plugin's result would overwrite the input or another plugin's result.
- **Buffer every event for a plugin that is starting.** Rejected: it would make the bus a queue; the event delivery companion exists for consumers that must see every event.
- **Keep the loaded definition on idle return.** Rejected: a `dormant` registration that already ran code would look like one that never did, and a reload gives the loader a fresh check.
- **Record the wake's principal in a new field instead of `onBehalfOf`.** Rejected: two fields for "the plugin on whose behalf code ran" would split one question across the trail.

## Consequences

**Positive**:

- A lazy veto is asked or denies; it can no longer fail open unrecorded.
- A point owner can mix feature and control contributors, protect a slow plugin with one breaker, let a veto judge enriched values, restrict hooks per target, and block an unlicensed contributor as a recorded policy decision.
- A lazy event consumer sees the event that woke it.
- Lazy plugins can give back their resources when idle, and every root wake names the plugin that asked for it.

**Negative**:

- Under "wake", the first dispatch after a cold start waits for a load and build, and under "deny" it is refused when that takes longer than the wake window.
- A dispatch from code outside the host's fibers must carry the host's link, or a point with vetoes denies.
- Enrichers run on dispatches that end denied; their values may be discarded.
- `skip` is renamed `policy` and the phase order changes: companion drafts citing the old names and order must align (CCR-BR-024).
- The `lazy-triggered` root record gains `onBehalfOf`, an exception core 28 must state.

**Trade-off accepted**: a slower or refused first decision after a cold start, and more options on a hook point, in exchange for vetoes that fail closed whether or not their owner is loaded.

## References

- Behaviours: [31 — Hook points](../behaviors/31-hook-points.md) (BEH-BR-299–303, BEH-BR-305, BEH-BR-306, BEH-BR-309–312), [27 — Manifest and lazy activation](../behaviors/27-manifest-and-lazy-activation.md) (BEH-BR-241, BEH-BR-244, BEH-BR-245, BEH-BR-248, BEH-BR-250–253), [16 — Event bus](../behaviors/16-event-bus.md) (BEH-BR-141), [28 — Plugin principal and mandatory policy](../behaviors/28-plugin-principal-and-mandatory-policy.md) (BEH-BR-259)
- Invariants: [INV-BR-040](../invariants.md#inv-br-040-only-an-admitted-veto-contribution-decides-a-hook-dispatch), [INV-BR-046](../invariants.md#inv-br-046-a-declared-veto-of-a-plugin-not-yet-loaded-is-never-passed-over-unrecorded), [INV-BR-047](../invariants.md#inv-br-047-a-held-triggering-event-is-delivered-at-most-once-only-to-the-plugin-it-woke), [INV-BR-032](../invariants.md#inv-br-032-a-dormant-plugin-has-run-none-of-its-code)
- Requirements: [URS-BR-049](../urs.md#urs-br-049-keep-a-policy-decision-closed-while-a-contributor-to-it-is-not-yet-loaded), [URS-BR-050](../urs.md#urs-br-050-let-a-plugin-started-by-an-event-receive-that-event), [URS-BR-036](../urs.md#urs-br-036-let-several-plugins-take-part-in-one-decision-under-a-stated-failure-policy), [URS-BR-031](../urs.md#urs-br-031-start-a-plugin-only-when-it-is-needed), [URS-BR-032](../urs.md#urs-br-032-know-which-plugin-made-a-change-and-for-whom)
- Risks: [RSK-BR-057](../gxp/03-risk-assessment.md#rsk-br-057), [RSK-BR-058](../gxp/03-risk-assessment.md#rsk-br-058), [RSK-BR-032](../gxp/03-risk-assessment.md#rsk-br-032), [RSK-BR-026](../gxp/03-risk-assessment.md#rsk-br-026)
- Decisions: [ADR-BR-042](./042-lazy-activation.md), [ADR-BR-046](./046-hook-points.md), [ADR-BR-043](./043-plugin-principal-and-mandatory-policy.md), [ADR-BR-020](./020-typed-event-bus.md), [ADR-BR-005](./005-failure-is-sticky.md)
- Source: Bridger recheck of 2026-11-08, §4 items K1, K8, K9 and §8 X1; URS gaps G37, G39, G62. No SPEC.md section.
