# Appendix — Cordis comparison

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-APP-02                                               |
> | Revision       | 0.2                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Appendix — Informative                                       |
> | Change History | 0.2 (2026-10-03): No "lossless" claim about the audit sequence (consistency pass) (CCR-BR-013)<br>0.1 (2026-10-02): Initial draft, moved from `docs/SPEC.md` "Comparison with Cordis" (CCR-BR-001) |

---

This appendix is informative. It records how Bridger's feature set relates to
Cordis, the plugin framework of DeepSeek Harness, reviewed for parity in the
design phase. The normative decision is
[ADR-BR-010](../decisions/010-cordis-parity.md); the normative behaviours are
in `behaviors/`.

Sources: the DeepSeek Harness Cordis tutorial (`docs/cordis-tutorial`), API
reference (`docs/cordis-api`: context, service, fiber, registry, events) and
primer (`docs/cordis-primer.md`) in the `deepseek-ai/deepseek-harness`
repository, read on 2026-10-02.

Bridger's core is built on the same paradigm as Cordis (revertible effects for time, reactive coeffects for space — Shi, Zhang and Cui, *A Programming Paradigm for Spatiotemporal Composability*). This table maps Cordis's published features to Bridger and records what Effect changes.

| Cordis | Bridger | Note |
| --- | --- | --- |
| Plugin as function, object or `Service` class | `PluginDefinition` with a `Layer` `build`; service classes are `Context.Service` | One form with static types |
| Fiber states `PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED`, `FAILED` | `waiting → starting → active → stopping`, `failed`, plus `disabled` | Same machine; removal ends in no state |
| `fiber.dispose / restart / update / await` | `PluginHandle.remove / restart`, `reconfigure`, `awaitActive` | `awaitActive` fails fast with the cause |
| `ctx.effect(disposer)` | `Scope`, `Effect.acquireRelease`, `Layer` finalizers | LIFO, sequential, interruptible; async disposers do not race |
| Child plugins dispose with the parent | `Plugin.Runtime.install`, `Plugin.group` | Prefixed IDs, scope-owned |
| `inject: [...]` and `ctx.inject(deps, cb)` | `requires`, `whenAvailable` | `requires` is typed through the Layer's `RIn` |
| `ctx.get` (optional) | `optional`, `Runtime.optional`, `useOptional` | Optional use is leased |
| Target and committed views | Provider identities captured per activation | Same rule |
| Guarded withdrawal | Dependents-first removal, leases, `drain` and `force` | Adds bounded drain and revocation |
| `ctx.isolate`, `ctx.intercept` | Realms and `Interception` | Resolution only, not a security boundary |
| `ctx.on` / `emit` / `parallel` / `serial` / `bail` / `waterfall` | `Bridger.Events` with `on`, `around`, `emit`, `parallel`, `serial`, `waterfall` | Typed keys with args, result and error; no `bail` |
| Config schema, `.volatile()`, `!!js` | `Schema`, `volatile`, `ConfigProvider` and `Config.redacted` | Computed values come from Effect config |
| Loader entries, `id`, `disabled`, groups, patches | `reconcile`, `disabled`, `Plugin.group`, `Desired.overlay` | File format and fetching left to the app |
| HMR | `replace` and `restart`, driven by an adapter | No automatic private-state migration (same as Cordis) |
| `ctx.registry`, `fiber.getEffects()` | `snapshot`, `changes`, `inspect` | Names and counts only |
| Silent `PENDING` stalls | `plugin-stalled` event | |
| `ctx.timer / interval / debounce` | `Effect.sleep`, `Schedule`, `Effect.forkIn(scope)` | Native, scope-owned |
| `ctx.mixin`, `ctx.accessor`, `Service.invoke`, `ctx.extend` | Not adopted | Effect services are reached through keys; scoping is `Context`/`Scope` |
| Session log, profiles, bundles | Application layer | Out of core scope |

**Beyond Cordis, from Effect:** typed requirements and errors per service and per event; scoped leases with drain, `force` and re-entrancy detection; a specified operation-race table; supervised background work, health checks and a runtime-failure path; atomic `Generation` publication; schema-checked, redacted configuration; a deterministic test host with fault injection; and tracing and interruption that follow the fiber.

## GxP features Cordis does not address

Cordis has no notion of attributing a lifecycle change to an actor, recording
it in a numbered, gap-detectable sequence, refusing it pending approval, or controlling time
and identifiers for reproducible verification. Bridger adds these as optional
ports ([behaviours 22–25](../behaviors/22-attributable-operations.md)); none of
them changes the parity mapping above.
