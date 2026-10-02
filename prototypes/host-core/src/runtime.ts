// Plugin.Runtime (references/core behaviour 10): one instance per activation, bound to its scope.
import { Context, type Cause, type Effect, type Schedule, type Scope } from "effect"

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
}>()("@bridger/core/Plugin.Runtime") {}
