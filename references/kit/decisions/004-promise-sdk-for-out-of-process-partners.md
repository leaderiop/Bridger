# ADR-KT-004: Partners get a generated Promise SDK and run behind a transport, never in the host's runtime

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-ADR-004                                           |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-09): Callback clients from `requested.capabilities` (C-19); identity only when the link discloses it (F-07); title and context: never evaluated in the host's runtime, which is not a claim of another process (independent review; the file name keeps its earlier wording) (CCR-KT-004)<br>0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

## Context

Third-party code is never evaluated in the host's runtime (gap report §7 rule
1, as the loader and remote companions specify it). It runs on the other side
of a transport, where the deployment chose — which can be a worker thread of
the host's own process (remote BEH-RM-053).
Partners implement contracts; they should not need to learn Effect or Bridger.
The remote companion already turns a contract into a link plugin on the host
and a guest runtime on the other side.

## Decision

- `bridger sdk generate` produces, per contract version, plain TypeScript
  types over the encoded side of the schemas and a `serve(handlers)` that
  returns an opaque entry for the remote companion's `Guest.serve`
  (BEH-KT-033, BEH-KT-034).
- The SDK checks input before and output after each handler; undeclared
  throws leave with a fixed message (BEH-KT-034).
- Calls back into the host exist only for capabilities the partner's
  manifest requests in `requested.capabilities` — never its `requires` —
  and pass the host's grant check (BEH-KT-035).
- A handler receives no user identity unless the host's link discloses it,
  per link, as a recorded data transfer (BEH-KT-034).
- The SDK speaks one version and never negotiates (BEH-KT-037), and makes no
  isolation claim (BEH-KT-038).

## Alternatives considered

- **An Effect SDK for partners.** Kept as an option for partners who want it
  (they can use the remote companion directly), rejected as the default.
- **A hand-written generic client.** Rejected: untyped, and drifts from the
  contract.
- **Running partner code in-process behind realms.** Rejected: realms are not
  isolation (ADR-BR-019).

## Consequences

**Positive**: a partner's whole API is a handlers object of `async`
functions; contract types stay authoritative.

**Negative**: values are the encoded form (strings for dates, for example);
the partner converts where needed.

**Trade-off accepted**: less convenient types for the partner, in exchange for
no Effect dependency on their side.

## References

- Behaviours: [05](../behaviors/05-promise-sdk.md)
- Invariants: [INV-KT-006](../invariants.md#inv-kt-006-a-partner-handler-sees-only-plain-data)
- Companions: [references/remote/](../../remote/invariants.md)
- Decisions: [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)
