// Plugin.Runtime (references/core behaviours 10, 14, 15): one instance per activation, bound to its scope.
import { Context, type Cause, type Effect, type Option, type Schedule, type Scope } from "effect"
import type { Conflict, HostClosed, InstallError, LeaseRevoked, LeaseTimeout } from "./errors.js"
import type { AnyPlugin, InstallOptions, Keys, PluginHandle, ServicesOf } from "./plugin.js"

export type FailurePolicy = "fail-plugin" | "restart" | "ignore"

export class PluginRuntime extends Context.Service<PluginRuntime, {
  /** Runs `effect` as a fiber forked into the activation scope, under a failure policy (BEH-BR-090). */
  readonly background: <A, E, R>(
    name: string,
    effect: Effect.Effect<A, E, R>,
    options?: { readonly onFailure?: FailurePolicy; readonly restart?: Schedule.Schedule<unknown, unknown> }
  ) => Effect.Effect<void, never, R | Scope.Scope>
  /** An unrecoverable condition detected by the plugin itself (BEH-BR-091). */
  readonly reportFailure: (cause: Cause.Cause<unknown>) => Effect.Effect<void>
  /** Mounts a child for the lifetime of this activation (BEH-BR-121). */
  readonly install: (child: AnyPlugin, options?: Omit<InstallOptions, "context">) => Effect.Effect<PluginHandle, InstallError | HostClosed | Conflict | import("./policy.js").ChildNotAllowed, Scope.Scope>
  /** Round 2 (core 28, 10, 14): this activation's principal; run under it; entitlement; attributed child removal. */
  readonly principal: import("./policy.js").PluginPrincipal
  readonly asSelf: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly entitled: import("effect").Stream.Stream<import("./policy.js").EntitlementState>
  readonly unmount: (child: PluginHandle, options: { readonly context: import("./gxp.js").OperationContext }) => Effect.Effect<void>
  /** Point-in-time read of an optional key; never leased (BEH-BR-130). */
  readonly optional: <S>(key: Context.Key<any, S>) => Effect.Effect<Option.Option<S>>
  /** Runs `run` under a lease when the optional key is available (BEH-BR-131). */
  readonly useOptional: <S, A, E>(key: Context.Key<any, S>, run: (service: S) => Effect.Effect<A, E>) => Effect.Effect<Option.Option<A>, E | LeaseRevoked | LeaseTimeout>
  /** Runs `run` in a child scope whenever every key is available (BEH-BR-132). */
  readonly whenAvailable: <const K extends Keys, A, E>(
    keys: K,
    run: (services: ServicesOf<K>) => Effect.Effect<A, E, Scope.Scope>,
    options?: { readonly name?: string; readonly onFailure?: FailurePolicy }
  ) => Effect.Effect<void, never, Scope.Scope>
}>()("@bridger/core/Plugin.Runtime") {}
