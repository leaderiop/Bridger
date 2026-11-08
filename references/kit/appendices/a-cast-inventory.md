# Appendix A — Cast Inventory of the Host-Core Prototype

> **Document Control**
>
> | Property       | Value                                                        |
> | -------------- | ------------------------------------------------------------ |
> | Document ID    | BRIDGER-KT-APP-A                                             |
> | Revision       | 0.1                                                          |
> | Effective Date | — (pending approval)                                         |
> | Status         | Draft                                                        |
> | Author         | Bridger Engineering                                          |
> | Reviewed by    | — (no independent reviewer yet; see PROC-03 §5)              |
> | Approved by    | — (pending; single maintainer, see PROC-03 §5)               |
> | Classification | Appendix (informative)                                       |
> | Change History | 0.1 (2026-11-08): Initial draft (CCR-KT-001)                 |

---

This appendix is the evidence behind the facade types of
[01 — Plugin facade](../behaviors/01-plugin-facade.md). The gap report says the
prototype's tests contain "about 43 casts". This inventory lists every type
assertion in `prototypes/host-core/test/*.ts` and `src/plugin.ts`, says why
each family exists, and tests each claim by compiling. It is evidence about the
prototype's types only; it says nothing about the kit, which does not exist.

## §1 Method

1. A scratch copy of `prototypes/host-core` (sources, tests, lockfile) was
   made outside the repository, dependencies installed from the lockfile
   (`effect` 4.0.0, TypeScript 5.9.3), and `tsc --noEmit` run: clean. The
   prototype in the repository was not modified.
2. Assertions were found with `grep` for ` as ` followed by a type (comments,
   `import * as` and string literals excluded), and `any` in annotations.
3. Each family was removed from the copy and `tsc` re-run. A cast is
   **needed** when its removal produces a compile error at that site, and
   **redundant** when the copy still compiles with it removed.
4. The remedy was tested the same way: §3.

## §2 Families

| Family | What | Count | Needed | Why it exists | Facade answer |
| ------ | ---- | ----- | ------ | ------------- | ------------- |
| F1 | `build` cast to `AnyPlugin["build"]` (6 direct, 15 via `unknown`; plus 1 in `src/plugin.ts`) | 22 | 11 | `Layer<in ROut, …>` is contravariant in Effect v4; `AnyPlugin["build"]` is `Layer<any, unknown, any>`, and a layer that provides nothing (`ROut = never`) is not assignable to it: "Type 'any' is not assignable to type 'never'". Every needed cast is on a plugin that provides nothing, written as an object literal or returned as `AnyPlugin`. The 11 redundant ones are on plugins that provide a key. | `Plugin.Any` with `build: Layer<never, unknown, any>` and a phantom brand (BEH-KT-004, ADR-KT-002); Form 3 `run` for plugins that provide nothing (BEH-KT-001) |
| F2 | whole definition cast to `AnyPlugin` (18 direct, 4 via `unknown`) | 22 | 0 | Defensive. A `PluginDefinition<R, P, E>` produced by `define` is accepted where `AnyPlugin` is expected because TypeScript compares the two instantiations by their type arguments. Nobody could tell these from the needed F1 casts. | `definePlugin` returns `Plugin<…>`, assignable to `Plugin.Any` by construction; documentation states no cast is needed (BEH-KT-004) |
| F3 | data-dependent key lists (`cond ? [K] : []`) | 2 | 1 | No sound `build` type for a union of tuples. One instance is the F1 cast at `children.test.ts:26` (the only cast that survives §3); the other (`leases.test.ts:124`, `as unknown as readonly []`) is redundant. | One definition per shape; a clear `KitTypeError` (BEH-KT-005) |
| F4 | stub services (`{} as EventBus`, `{} as never`) | 2 | 1 | A test double implements no member. | `PluginTest.stub` / `PluginTest.partial` (BEH-KT-010) |
| F5 | partial records (`{ recordId } as AuditRecord`) | 2 | 2 | A fixture needs one field of a wide record. | `PluginTest.record` (BEH-KT-012) |
| F6 | heterogeneous effect arrays (`as Array<Effect.Effect<…>>`) | 2 | 1 | Iterating over effects with different success and error types to assert one failure tag. | `PluginTest.expectFailure(tag, ...effects)` with a variadic tuple (BEH-KT-014) |
| F7 | union key to `host.use` (`key as typeof Logger`) | 1 | 1 | `use<S>(key: Key<any, S>)` cannot infer `S` from a union of keys. | `PluginTest.holdLease(key)` generic over the key (BEH-KT-013) |
| F8 | effect, fiber and program narrowing | 3 | 0 | Defensive. | none needed |
| **Total** | type assertions | **55** (`F3` counted once, in F1) | **16** | | |

The gap report's "about 43" is F1 + F2 in the tests (21 + 22 = 43).

Not assertions, but in scope of the facade:

| Family | What | Count | Needed | Facade answer |
| ------ | ---- | ----- | ------ | ------------- |
| F9 | `kind: "user" as const` in actor helpers | 5 | yes (literal union) | `PluginTest.actor` (BEH-KT-012) |
| F10 | `as const` on `requires` / `provides` | 81 | 0 — removing all 81 still compiles, because `define` already has `const` type parameters | never written by the facade or its docs (BEH-KT-002) |
| F11 | `any` in test annotations (`Layer.Layer<any>` ×3, `Context.Key<any, any>` ×2, `Context.Key<any, S>` ×1) | 6 | — | `PluginTest.mount` options typed by provision (BEH-KT-009) |

## §3 The one-line remedy, tested

In the scratch copy, `src/plugin.ts` was changed from

```ts
export type AnyPlugin = PluginDefinition<Keys, Keys, unknown>
```

to

```ts
export interface AnyPlugin extends Omit<PluginDefinition<Keys, Keys, unknown>, "build"> {
  readonly build: Layer.Layer<never, unknown, any>
}
```

and every F1 and F2 cast (43 in tests, 1 in `src/plugin.ts`) was removed.
`tsc --noEmit` then reported exactly one error, at `children.test.ts:20`
(family F3). `src/host.ts` compiled unchanged.

A probe file in the same copy confirmed the two remaining facts the facade
relies on:

- core's own heterogeneous type `PluginDefinition<any, any, any>` rejects a
  provides-nothing literal ("`Layer<never, never, never>` is not assignable to
  `Layer<unknown, any, unknown>`"), so the defect is in the specification
  (BEH-BR-127, BEH-BR-153), not only in the prototype;
- the widened type **accepts** a literal that claims `provides: [A]` with an
  empty build, which `define` rejects — hence the brand of ADR-KT-002.

## §4 Full list

"Needed" is the result of the removal test of §1 step 3. Line numbers refer to
commit `2d35d64`.

| # | Location | Cast | Family | Needed under TS 5.9.3 | Note |
| - | -------- | ---- | ------ | --------------------- | ---- |
| 1 | `test/bus.test.ts:21` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 2 | `test/bus.test.ts:24` | `as Effect.Effect<EventBus` | F8 | no |  |
| 3 | `test/bus.test.ts:33` | `as unknown as AnyPlugin["build"]` | F1 | no |  |
| 4 | `test/bus.test.ts:33` | `as EventBus` | F4 | yes |  |
| 5 | `test/bus.test.ts:119` | `as unknown as AnyPlugin["build"]` | F1 | no |  |
| 6 | `test/children.test.ts:26` | `as AnyPlugin["build"]` | F1/F3 | yes | survives Plugin.Any: data-dependent provides |
| 7 | `test/children.test.ts:27` | `as AnyPlugin` | F2 | no |  |
| 8 | `test/children.test.ts:40` | `as AnyPlugin["build"]` | F1 | no |  |
| 9 | `test/children.test.ts:223` | `as AnyPlugin["build"]` | F1 | no |  |
| 10 | `test/children.test.ts:237` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 11 | `test/children.test.ts:237` | `as never` | F4 | no |  |
| 12 | `test/fixtures.ts:69` | `as typeof program` | F8 | no |  |
| 13 | `test/generation.test.ts:96` | `as Fiber.Fiber<unknown` | F8 | no |  |
| 14 | `test/generation.test.ts:109` | `as unknown as AnyPlugin["build"]` | F1 | no |  |
| 15 | `test/leases.test.ts:124` | `as unknown as readonly` | F3 | no |  |
| 16 | `test/lifecycle.test.ts:120` | `as Array<Effect.Effect<void` | F6 | no |  |
| 17 | `test/optional.test.ts:41` | `as AnyPlugin["build"]` | F1 | no |  |
| 18 | `test/optional.test.ts:54` | `as AnyPlugin["build"]` | F1 | no |  |
| 19 | `test/optional.test.ts:55` | `as AnyPlugin["build"]` | F1 | no |  |
| 20 | `test/optional.test.ts:58` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 21 | `test/p2.test.ts:357` | `as Array<Effect.Effect<unknown` | F6 | yes |  |
| 22 | `test/realms.test.ts:28` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 23 | `test/realms.test.ts:40` | `as AnyPlugin` | F2 | no |  |
| 24 | `test/realms.test.ts:41` | `as AnyPlugin` | F2 | no |  |
| 25 | `test/realms.test.ts:46` | `as AnyPlugin` | F2 | no |  |
| 26 | `test/realms.test.ts:48` | `as AnyPlugin` | F2 | no |  |
| 27 | `test/realms.test.ts:58` | `as AnyPlugin` | F2 | no |  |
| 28 | `test/realms.test.ts:60` | `as AnyPlugin` | F2 | no |  |
| 29 | `test/realms.test.ts:66` | `as AnyPlugin` | F2 | no |  |
| 30 | `test/realms.test.ts:74` | `as AnyPlugin` | F2 | no |  |
| 31 | `test/realms.test.ts:75` | `as AnyPlugin` | F2 | no |  |
| 32 | `test/realms.test.ts:77` | `as AnyPlugin` | F2 | no |  |
| 33 | `test/realms.test.ts:81` | `as AnyPlugin` | F2 | no |  |
| 34 | `test/realms.test.ts:94` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 35 | `test/realms.test.ts:110` | `as AnyPlugin` | F2 | no |  |
| 36 | `test/realms.test.ts:176` | `as unknown as AnyPlugin["build"]` | F1 | no |  |
| 37 | `test/reconcile.test.ts:13` | `as AnyPlugin` | F2 | no |  |
| 38 | `test/reconcile.test.ts:14` | `as AnyPlugin` | F2 | no |  |
| 39 | `test/reconcile.test.ts:17` | `as unknown as AnyPlugin` | F2 | no |  |
| 40 | `test/reconcile.test.ts:129` | `as unknown as AnyPlugin` | F2 | no |  |
| 41 | `test/reconcile.test.ts:158` | `as unknown as AnyPlugin` | F2 | no |  |
| 42 | `test/registry.test.ts:97` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 43 | `test/review.test.ts:23` | `as typeof Logger` | F7 | yes |  |
| 44 | `test/testhost.test.ts:23` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 45 | `test/testhost.test.ts:25` | `as unknown as AnyPlugin` | F2 | no |  |
| 46 | `test/testhost.test.ts:196` | `as AuditRecord` | F5 | yes |  |
| 47 | `test/testhost.test.ts:199` | `as AuditRecord` | F5 | yes |  |
| 48 | `test/universe.ts:14` | `as AnyPlugin` | F2 | no |  |
| 49 | `test/universe.ts:15` | `as AnyPlugin` | F2 | no |  |
| 50 | `test/universe.ts:16` | `as AnyPlugin` | F2 | no |  |
| 51 | `test/universe.ts:17` | `as unknown as AnyPlugin["build"]` | F1 | no |  |
| 52 | `test/universe.ts:18` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 53 | `test/universe.ts:23` | `as unknown as AnyPlugin["build"]` | F1 | yes |  |
| 54 | `test/universe.ts:25` | `as unknown as AnyPlugin["build"]` | F1 | no |  |
| 55 | `src/plugin.ts:71` | `as AnyPlugin["build"]` | F1 | yes | Plugin.group: build provides nothing |
