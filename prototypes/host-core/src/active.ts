// `@bridger/core/ActivePlugin` (references/core BEH-BR-163, 168, 174): set by the host while a plugin's activation
// builds, so that helpers can report ownership. Helpers MUST NOT use it for anything else.
import { Context, Option } from "effect"

export interface ActivePluginRef {
  readonly pluginId: string
  readonly realm: string
  /** A contribution added inside the activation (BEH-BR-168): names and ids only, never values. */
  readonly contributed: (registry: string, id: string) => void
  readonly withdrawn: (registry: string, id: string) => void
  /** A generation made inside the activation forced a drain (BEH-BR-174). */
  readonly revoked: (generation: string, leases: number) => void
}
export const ActivePlugin = Context.Reference<Option.Option<ActivePluginRef>>("@bridger/core/ActivePlugin", { defaultValue: () => Option.none() })
