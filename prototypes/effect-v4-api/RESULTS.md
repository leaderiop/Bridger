# Effect v4 API prototype — results

Throwaway prototype that checks, against the real `effect@4.0.0` runtime, the
Effect facts the Bridger core specification (`references/core/`) relied on
without confirmation: URS §7 items G2–G4, plus the other Effect behaviours the
specification depends on. It is **not** product code and **not** evidence that
Bridger behaves as specified — Bridger is not implemented. It records facts
about the platform Bridger is to be built on (CCR-BR-003).

Run: `npm install && npm run check && npm run run` (Node 22).

| Item | Checks | Result |
| ---- | ------ | ------ |
| G2 — sliding `PubSub` lag | E1a–E1c | Per subscriber; publishing never blocks |
| G3 — `Layer.effectContext` | E2a–E2b | Exists; scoped resources released with the build scope |
| G4 — forcing a `ManagedRuntime` build | E3a–E3e | `runtime.context()` forces it without running an effect; cached; rejects on failure |
| Fresh memo map per activation | E4a–E4c | A shared `MemoMap` reuses the build; a fresh one rebuilds; forked scopes close with the host scope |
| `SubscriptionRef.changes` | E5a–E5b | Current value first, then every change |
| `Context.Reference` inheritance | E6a–E6b | Default when absent; inherited by forked children |
| Supervised child on caller interruption | E7a–E7c | **Finding:** `forkChild` + `join` releases the lease before the child's finalizers; interrupting and awaiting the child fixes it. `timeoutOrElse` takes `{ duration, orElse }` |
| `Schema.TaggedError` | E8a | `_tag` and fields; narrowed by `catchTag` |
| Key identity | E9a–E9b | `key.key` is the identifier; two key objects with one identifier resolve the same entry |

## Output of the run recorded on 2026-10-02

```
PASS  E1a  A fast subscriber that keeps up receives every message despite a slow one
        observed: fast received [1,2,3,4,5,6,7,8,9,10]
PASS  E1b  A slow subscriber loses the oldest messages and keeps the latest `capacity`
        observed: slow received [7,8,9,10]
PASS  E1c  Publishing never blocks on a slow subscriber (sliding strategy)
        observed: 10 publishes completed with an undrained subscriber
PASS  E2a  Layer.effectContext exists and builds a Layer providing several services from one Context
        observed: Alpha.a=1, Beta.b=two
PASS  E2b  Scoped resources acquired in an effectContext layer are released when the build scope closes
        observed: released before close=0, after close=1
PASS  E3a  ManagedRuntime builds lazily (nothing built at make)
        observed: builds after make=0
PASS  E3b  runtime.context() forces the layer build without running an effect
        observed: builds after context()=1
PASS  E3c  The built context is cached for later runs
        observed: builds after runPromise=1
PASS  E3d  dispose() releases the layer's resources
        observed: released=1
PASS  E3e  A failing layer makes context() reject (startup failure is observable before use)
        observed: context() rejected
PASS  E4a  Reusing one MemoMap across activations reuses the first build (the trap the spec avoids)
        observed: builds with a shared memo map across two activations=1
PASS  E4b  A fresh MemoMap per activation rebuilds the layer every time
        observed: builds with fresh memo maps=2
PASS  E4c  Closing the host scope closes activation scopes forked from it
        observed: child finalizer ran=true
PASS  E5a  SubscriptionRef.changes emits the current value first
        observed: head of changes after set(1)={"_id":"Option","_tag":"Some","value":1}
PASS  E5b  A subscriber sees the current value then later changes, without a gap
        observed: collected [1,2,3]
PASS  E6a  A Context.Reference yields its default when not provided
        observed: default size=0
PASS  E6b  A forked child fiber inherits the provided reference (re-entrancy detection relies on this)
        observed: child saw [example/audit]
PASS  E7a  FINDING: forkChild + join alone releases the lease BEFORE the child's finalizers run (so it does not meet BEH-BR-084)
        observed: lease-acquired → lease-released → child-finalizer
PASS  E7b  Interrupting and awaiting the child on caller interruption releases the lease only after the child's finalizers
        observed: lease-acquired → child-finalizer → lease-released
PASS  E7c  Effect.timeoutOrElse({ duration, orElse }) maps an overrun to a chosen result (LeaseTimeout mapping)
        observed: result=timed-out
PASS  E8a  Schema.TaggedError errors carry _tag and fields and are narrowed by catchTag
        observed: handled=DrainTimeout:example/logger:2
PASS  E9a  A service key's string identifier is `key.key`
        observed: LoggerA.key=proto/Logger
PASS  E9b  Two distinct key objects with the same identifier resolve the same Context entry (why KeyMismatch must be checked explicitly)
        observed: lookup via second key object={"_id":"Option","_tag":"Some","value":{"n":1}}; same object=false

23/23 passed (effect 4.0.0, node v22.22.0)
```
