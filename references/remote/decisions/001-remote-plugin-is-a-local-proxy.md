# ADR-RM-001: A remote plugin is a local proxy plugin

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-RM-ADR-001                                            |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.2 (2026-11-08): resolutions of the agent review of 2026-11-08 — host-side serving end `Remote.serve` and endpoint multiplexing named (R3-01) (CCR-RM-002)<br>0.1 (2026-11-08): Initial draft (CCR-RM-001)                 |

---

## Context

Some plugin code must not run in the host's process: third-party code, code
that needs another runtime, code on another host. The core runs everything
in-process and excludes a sandbox ([ADR-BR-027](../../core/decisions/027-core-exclusions.md));
realms are not isolation ([ADR-BR-019](../../core/decisions/019-realms-are-resolution-namespaces.md)).
The gap report's §7 records two rules: third-party code never runs in-process,
and a remote plugin is a local proxy plugin. The question is what that proxy
is, so that the core's guarantees — leases, dependents-first removal, the
legality table, attribution, the gate, `reconcile` — carry over unchanged.

## Decision

- `Remote.define(contract, options)` returns an ordinary `PluginDefinition`
  (the **link**) built with `Plugin.define`. It provides nothing itself.
- For each established session the link mounts one child (`<id>/session`)
  with `Plugin.Runtime.install`. The child provides exactly the contract's
  key; its face service turns method calls into frames.
- The package uses only the core's public API. It adds no host operation, no
  plugin state and no legality cell; calls in flight are protected by the
  core's lease primitive on the session child, with no admission count of
  its own.
- On the far side, `Guest.serve(contract, impl)` implements the contract
  without a Bridger host; when the far side is another Bridger host,
  `Remote.serve(contract, options)` serves one of its providers with a core
  lease per call ([BEH-RM-039](../behaviors/05-guest-serve.md)).
- One contract per link, and per session; several sessions may share one
  physical connection through the endpoint multiplexer
  ([BEH-RM-056](../behaviors/07-transports-and-adapters.md)).

## Alternatives considered

- **A remote mode inside the core** (a `remote: true` flag on definitions).
  Rejected: it would put transports, epochs and timeouts in the core and
  make every core rule conditional.
- **The link provides the contract itself.** Rejected: a partition could then
  withdraw the key only by stopping the link, and the only system-initiated
  stop of that kind is a runtime failure, which is sticky.
- **A second lease mechanism for remote calls.** Rejected for the reason of
  [ADR-BR-015](../../core/decisions/015-leases-one-primitive.md): two
  admission paths would disagree about when a provider is free.

## Consequences

**Positive**:

- Every core tool — snapshots, `inspect`, `reconcile`, the gate, the audit
  trail — handles a remote plugin with no change.
- The claim "a proxy keeps every local rule" is testable by re-running the
  core suites through a proxy ([BEH-RM-060](../behaviors/08-test-transport-and-acceptance.md)).

**Negative**:

- Two plugin entries (link and child) per remote contract in every snapshot.
- The contract's provider slot is free while the child is unmounted.

**Trade-off accepted**: one more snapshot entry per remote contract, in
exchange for no remote-specific rule in the core.

## References

- Behaviours: [01](../behaviors/01-remote-proxy-plugin.md), [03](../behaviors/03-remote-calls.md), [05](../behaviors/05-guest-serve.md)
- Invariants: [INV-RM-001](../invariants.md#inv-rm-001-a-remote-plugin-adds-no-state-operation-or-transition), [INV-RM-006](../invariants.md#inv-rm-006-remote-adds-no-second-admission-path)
- Core decisions: [ADR-BR-015](../../core/decisions/015-leases-one-primitive.md), [ADR-BR-021](../../core/decisions/021-children-and-groups.md), [ADR-BR-027](../../core/decisions/027-core-exclusions.md)
