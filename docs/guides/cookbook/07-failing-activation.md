# Test a failing activation

Use this when: You want to know what your plugin and its dependents do when a build fails.

```ts
// type-checked: test test/cookbook/07-failing-activation.test.ts
// inject a build failure for one plugin id; the fault lasts as long as the scope it is injected into
export const withFailingBuild = (host: Testing.TestHost, id: string) => Effect.gen(function* () {
  const fault = yield* Scope.make()
  yield* host.inject(Testing.Fault.buildFails(id)).pipe(Scope.provide(fault))
  return fault
})
```

The test host injects `Fault.buildFails(id)` for as long as the scope it is injected into stays open. The plugin ends `failed` with phase `build`; closing the scope and restarting brings it back.

The snippet is the `recipe` region of
[`prototypes/host-core/test/cookbook/07-failing-activation.test.ts`](../../../prototypes/host-core/test/cookbook/07-failing-activation.test.ts),
which runs with the prototype's suite; `doc-typecheck.sh` fails if this page and
that region differ. See [core 21](../../../references/core/behaviors/21-testing-host.md) (BEH-BR-177 to 182).
