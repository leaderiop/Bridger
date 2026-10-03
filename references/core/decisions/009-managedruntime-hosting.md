# ADR-BR-009: Non-Effect hosting through ManagedRuntime

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-ADR-009                                              |
> | Revision       | 0.3                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Proposed                                                     |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Architecture Decision Record                                 |
> | Change History | 0.3 (2026-10-03): Forced build no longer described as unconfirmed (CCR-BR-003) (consistency pass) (CCR-BR-013)<br>0.2 (2026-10-02): Build forcing confirmed: runtime.context() (CCR-BR-003)<br>0.1 (2026-10-02): Initial draft (CCR-BR-001)                 |

---

## Context

Many hosts of Bridger are not Effect programs: a React or FoldKit client, a framework callback, a script. They need to hold a host for the life of the application, call it from Promise-based code, and shut it down with a report.

Effect's answer for holding a layer from non-Effect code is `ManagedRuntime`. Three of its properties shape how Bridger must be hosted through it:

- **Dispose cannot report.** `dispose()` runs scope finalizers, and a finalizer cannot fail. A plugin cleanup failure during dispose would be logged and lost; the caller would never receive the `CloseReport`.
- **The build is lazy.** A `ManagedRuntime` builds its layer on first use, so "the host is ready" is not true when `make` returns, and a base-layer build failure surfaces only at the first call.
- **The runtime's `R` is static.** It is fixed when the runtime is made. Plugin services come and go; they cannot be members of a static environment.

## Decision

Non-Effect code hosts Bridger through `ManagedRuntime.make(Bridger.layer(options))`, with these rules (SPEC.md "API decisions" row 7):

1. **Shutdown before dispose.** An adapter's dispose calls `host.shutdown()` first, surfaces its `CloseReport`, and only then calls `runtime.dispose()`. The runtime cannot be reused after dispose.
2. **Force the build before "ready".** An adapter that promises readiness forces the layer build with `runtime.context()` — which builds without running an effect, caches the result and rejects on a layer failure (prototype checks E3a–E3e, [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md)) — and awaits the first `snapshot()` before resolving, so a base-layer build failure fails startup rather than the first user action. `context()` is used rather than running a trivial effect.
3. **The runtime holds the static part only.** Its `R` contains `Bridger.Host` and the application's base services. Plugin services never appear in `R`; they are reached only through `host.use`, `useAll` and `lease`. This is what lets plugins leave.
4. **One runtime per application, never per plugin.** A plugin uses `Scope` and `Plugin.Runtime`, so its resources stay inside its activation scope.
5. **The scope-close path still reports.** If the runtime is disposed without a prior `shutdown()`, the host performs the same shutdown from its scope finalizer, passes the report to `BridgerOptions.onClose` and logs each failure at error level; it is not returned to anyone.

## Alternatives considered

- **A Promise facade wrapping every Host method in core.** Rejected for core: it duplicates the whole surface and its error unions. An adapter may offer one on top of a `ManagedRuntime`.
- **Exposing plugin services in the runtime's `R`.** Rejected: `R` is fixed at creation; a plugin leaving would leave a dangling member, and a plugin arriving could not be added.
- **A `ManagedRuntime` per plugin.** Rejected: plugin resources would escape activation scopes and dependency-ordered removal.
- **`Effect.runPromise` with a fresh layer per call.** Rejected: it would build and tear down a host on every call.
- **Treating dispose as sufficient.** Rejected: cleanup failures would be logged only, which contradicts the shutdown report guarantee.

## Consequences

**Positive**:

- Non-Effect applications get the same host, semantics and report as Effect applications.
- Plugin services remain dynamic; nothing static points at them.

**Negative**:

- Adapters must follow a two-step dispose and an explicit build-forcing step; getting either wrong loses a report or delays a startup failure.

**Trade-off accepted**: a small, documented adapter discipline, in exchange for reusing Effect's runtime holder instead of a parallel Promise API in core.

## References

- Behaviours: [12 — Shutdown and hosting](../behaviors/12-shutdown-and-hosting.md), [02 — Host construction](../behaviors/02-host-construction.md)
- Invariants: [INV-BR-018](../invariants.md#inv-br-018-shutdown-reports-every-failure)
- Requirements: [URS-BR-018](../urs.md#urs-br-018-host-plugins-from-code-that-does-not-use-effect), [URS-BR-008](../urs.md#urs-br-008-shut-down-with-a-report-of-what-failed)
- Decisions: [ADR-BR-001](../decisions/001-effect-v4-as-effect-system.md), [ADR-BR-007](../decisions/007-observation-primitives.md)
- Source: `docs/SPEC.md` — "Hosting from non-Effect code (ManagedRuntime)", "Shutdown", "API decisions" row 7
