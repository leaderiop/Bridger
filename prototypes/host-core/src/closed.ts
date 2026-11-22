import { Context } from "effect"

/**
 * The closed context of plugin code (BEH-BR-036, ADR-BR-055): of the fiber context a plugin's code would inherit
 * only References survive (Effect's own and the host's), never a service. Finalizers and forked fibers inherit
 * the context they were started in, so a host port or application service in the caller's environment is
 * unreachable from every plugin fiber: build, finalizers, background fibers, listeners and hooks.
 */
const referenceIds = new Set<string>()
const effectReferencePrefixes = ["effect/Clock", "effect/Console", "effect/Random", "effect/Scheduler", "effect/References/", "effect/Logger/", "effect/Tracer", "effect/ErrorReporter/"]

/** Registers References of the host as surviving the closure. Called once per module that defines them. */
export const keepReferences = (...keys: ReadonlyArray<Context.Key<any, any>>): void => { for (const k of keys) referenceIds.add(k.key) }

export const closedContext = (caller: Context.Context<never>): Context.Context<any> => {
  const kept = new Map<string, unknown>()
  caller.mapUnsafe.forEach((v, id) => { if (referenceIds.has(id) || effectReferencePrefixes.some((p) => id.startsWith(p))) kept.set(id, v) })
  return Context.makeUnsafe(kept)
}

/** A lookup of a service the plugin did not declare dies with Effect's "Service not found: <id>"; core reports it as UndeclaredAccess (BEH-BR-036). */
export const undeclaredAccessOf = (cause: unknown): string | undefined => {
  const m = /^Service not found: (.+)$/.exec(cause instanceof Error ? cause.message : String(cause))
  return m?.[1]
}

/** The defect of a service used after its lease ended (BEH-BR-036, INACTIVE_ACCESS): a held reference outlives its provider's drain. */
export class InactiveAccess extends Error {
  readonly _tag = "InactiveAccess"
  constructor(readonly serviceId: string, readonly providerId: string) {
    super(`InactiveAccess ${serviceId}: the lease on ${providerId} has ended`)
  }
}

/** A service whose members throw InactiveAccess once `ended()` is true; methods are wrapped so a detached method fails too. Shallow, as grants are. */
export const leaseBound = <S>(service: S, serviceId: string, providerId: string, ended: () => boolean): S => {
  if (service === null || (typeof service !== "object" && typeof service !== "function")) return service
  return new Proxy(service as object, {
    get(target, prop, receiver) {
      if (ended()) throw new InactiveAccess(serviceId, providerId)
      const v = Reflect.get(target, prop, receiver)
      if (typeof v !== "function") return v
      return (...args: Array<unknown>) => { if (ended()) throw new InactiveAccess(serviceId, providerId); return v.apply(target, args) }
    }
  }) as S
}
