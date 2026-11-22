# Appendix — Reference model

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-APP-05                                               |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Appendix — Informative                                       |
> | Change History | 0.1 (2026-11-22): The reference model and the properties it states (improvement report 07, R1) |

---

`references/core/formal/model.ts` is a pure TypeScript model of what the prose of this tree leaves implicit. It has no
Effect, clock or I/O, so a reader can run it on a page of input. The prototype is checked against it
(`prototypes/host-core/test/model.test.ts`, `test/pbt/`); the model is not checked against the prototype's behaviour
beyond that, and it evidences no requirement (CCR-BR-004).

## What it states

| Name | Statement | Source |
| --- | --- | --- |
| `legal`, `flight` | The outcome of an operation by plugin state, and by the operation in flight. Read from [`transitions.yaml`](../transitions.yaml), never copied. | BEH-BR-071, BEH-BR-072 |
| `quiescent` | The state every registration rests in once the host is idle, as a function of the installed set. | BEH-BR-160 |
| `waitCycle`, `inv030` | The wait-for relation between host transitions has no cycle. | INV-BR-030 |
| `takeOverWaits` | The wait-for edges of a take-over in a finalizer under the round-8 rule and the fixed rule. | SPEC-AUDIT-09 H1 |
| `inv017` | Every drain ended within its limit unless declared forever. | INV-BR-017 |
| `inv022`, `inv023` | One requested and one terminal record per call; `auditSeq` runs 1, 2, 3, … | INV-BR-022, INV-BR-023 |

## The theorems, and how each is checked

| Property | Statement | Checked by |
| --- | --- | --- |
| Confluence | After any history, once idle, the host's states equal `quiescent` of the set the history left installed. | `test/pbt/confluence.pbt.test.ts`, 300 histories over install, remove, enable, disable, restart, with shrinking |
| Ordering | Removing a provider closes each dependent once, before it. | `test/pbt/properties.pbt.test.ts`, random provider graphs |
| Bounded drain | A removal blocked by a lease fails with `DrainTimeout` when the limit passes, not before. | same file, TestClock |
| Audit | Any history leaves `inv022` and `inv023` true. | same file |
| Idempotence | Reconciling the same list twice issues nothing the second time. | same file |
| No wait cycle | The round-8 take-over rule closes a cycle through the concurrency slot; the fixed rule does not. | `test/model.test.ts` |

These are properties checked on sampled histories, not proofs.

## What it does not cover

Leases and handoff beyond the drain bound, hooks, the audit gate, lazy registrations, failure and refusal lists
(history, by BEH-BR-160), federation and the companion trees. *Progress* (no non-terminal state without an enabled
transition or a bounded timer) is not modelled: the host's states in the model are the settled ones, so the bounded
drain property and the shutdown scenarios are what stand in for it. INV-BR-009 and INV-BR-016 have no model predicate;
their `predicate` field reads `none`.
