# ADR-RM-006: Isolation comes from the host process or isolate, never from Bridger

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-006                                            |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

Moving code out of process is necessary for isolation but not sufficient. A
worker thread shares the process; a self-hosted workerd is not a sandbox on
its own and its documentation requires a VM or container around it; an
isolate-to-host escape in a workerd-class runtime was reported in 2026;
Cloudflare's Worker Loader isolates are the provider's. Bridger can withhold
what it passes to the guest; it cannot take away what the guest's runtime
already has.

## Decision

- Bridger provides no isolation and the remote package and every adapter
  say so.
- The package specifies a `Transport` interface and adapter obligations;
  adapters live in sub-packages: `@bridger/worker` (worker_threads, first),
  `@bridger/worker-loader` (Worker Loader and service bindings),
  `@bridger/workerd` (self-hosted, behind an operator-supplied VM or
  container such as gVisor or Firecracker), later `@bridger/wasm`.
- Each adapter declares a profile including free-text
  `isolationProvidedBy`, which Bridger never reads to decide anything.
- An adapter passes the guest nothing but the Remote channel; what the guest
  runtime offers on its own (network, files) is the host mechanism's.

## Alternatives considered

- **Call an adapter a sandbox when its host mechanism is one.** Rejected:
  the property would be the host's, and naming it as Bridger's invites the
  very misreading [RSK-BR-013](../../core/gxp/03-risk-assessment.md#rsk-br-013)
  records for realms.
- **An isolation level enum checked by the link.** Rejected: Bridger cannot
  verify it, so checking it would be theatre.

## Consequences

**Positive**: no isolation claim that cannot be tested.

**Negative**: consumers must design and evidence their own isolation.

**Trade-off accepted**: honesty over convenience, as in the core.

## References

- Behaviours: [07](../behaviors/07-transports-and-adapters.md), [BEH-RM-036](../behaviors/05-guest-serve.md)
- Risks: [RSK-RM-005](../risks.md#rsk-rm-005), [RSK-RM-006](../risks.md#rsk-rm-006)
- Core decisions: [ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
