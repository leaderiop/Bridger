// `@bridger/core/ActivePlugin` (references/core BEH-BR-119, 163, 168, 174): set by the host while a plugin's activation
// builds, so that helpers can report ownership. Helpers MUST NOT use it for anything else.
import { Context, Option, type Effect, type Scope } from "effect"

/** One registration a helper reports under the active plugin (BEH-BR-119): names and ids only, never values. */
export type Registration =
  | { readonly kind: "contribution"; readonly registry: string; readonly id: string }
  | { readonly kind: "listener"; readonly event: string; readonly priority: number }
  | { readonly kind: "resource"; readonly label: string; readonly irreversible?: boolean }

export interface ActivePluginRef {
  readonly pluginId: string
  readonly realm: string
  /** Lists one registration under the plugin in `inspect` until the calling scope closes; does nothing once the activation has ended; never fails. */
  readonly report: (registration: Registration) => Effect.Effect<void, never, Scope.Scope>
  /** A generation made inside the activation forced a drain (BEH-BR-174). */
  readonly revoked: (generation: string, leases: number) => void
}
export const ActivePlugin = Context.Reference<Option.Option<ActivePluginRef>>("@bridger/core/ActivePlugin", { defaultValue: () => Option.none() })
