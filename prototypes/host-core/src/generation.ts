// Generation (references/core behaviour 20, BEH-BR-169–176). Phase-P5 prototype — not product code.
import { Cause, Deferred, Effect, Exit, Fiber, Option, type Scope } from "effect"
import { ActivePlugin } from "./active.js"
import { AdmissionClosed, DrainTimeout, LeaseRevoked } from "./errors.js"

export interface Lease<A> { readonly value: A; readonly revision: number }
export interface DrainOptions { readonly timeout?: number | "forever"; readonly force?: boolean }
export interface Retired<A> {
  readonly value: A
  readonly drained: Effect.Effect<void>                                   // unbounded: for tests and callers with their own timeout
  readonly drain: (options?: DrainOptions) => Effect.Effect<void, DrainTimeout>
  readonly holders: Effect.Effect<number>
}
export interface Generation<A> {
  readonly acquire: Effect.Effect<Lease<A>, AdmissionClosed, Scope.Scope>
  readonly publish: (next: A) => Effect.Effect<Retired<A>>
  readonly closeAdmission: Effect.Effect<void>
  readonly reopenAdmission: Effect.Effect<void>
  readonly awaitDrained: (options?: DrainOptions) => Effect.Effect<void, DrainTimeout>
  readonly use: <B, E, R>(run: (value: A) => Effect.Effect<B, E, R>) => Effect.Effect<B, E | AdmissionClosed | LeaseRevoked, R>
  readonly current: Effect.Effect<{ readonly revision: number; readonly open: boolean }>
}
export interface GenerationOptions { readonly name?: string; readonly drainTimeout?: number | "forever" }

interface Slot<A> {
  value: A | undefined                               // dropped once drained and retired (BEH-BR-175)
  readonly revision: number
  readonly holders: Set<Fiber.Fiber<unknown, unknown>>
  readonly drained: Deferred.Deferred<void>
  retired: boolean
  idle?: Deferred.Deferred<void>                     // a drain waiting for the holders to reach zero
}

export const make = <A>(initial: A, options: GenerationOptions = {}): Effect.Effect<Generation<A>, never, Scope.Scope> => Effect.gen(function* () {
  const name = options.name ?? "generation"
  const defaultTimeout = options.drainTimeout ?? 30_000
  const owner = yield* ActivePlugin                                        // read at make (BEH-BR-174)
  const slot = (value: A, revision: number): Effect.Effect<Slot<A>> =>
    Effect.map(Deferred.make<void>(), (drained) => ({ value, revision, holders: new Set(), drained, retired: false }))
  let current = yield* slot(initial, 0)
  let open = true
  const retired = new Set<Slot<A>>()

  const release = (s: Slot<A>, holder: Fiber.Fiber<unknown, unknown>) => Effect.gen(function* () {
    s.holders.delete(holder)
    if (s.holders.size === 0 && s.idle) yield* Deferred.succeed(s.idle, undefined)
    if (s.holders.size === 0 && s.retired) {
      retired.delete(s); s.value = undefined                              // keep no reference (BEH-BR-175)
      yield* Deferred.succeed(s.drained, undefined)
    }
  })
  /** Admits a lease on the value current now, held by `holder` (BEH-BR-172). */
  const admit = (holder: Fiber.Fiber<unknown, unknown>) => Effect.suspend(() => {
    if (!open) return Effect.fail(new AdmissionClosed({ name }))
    const s = current
    s.holders.add(holder)
    return Effect.succeed(s)
  })
  /** Wait for the leases on `s` (BEH-BR-173), then revoke with force (BEH-BR-174). */
  const drain = (s: Slot<A>, o: DrainOptions = {}, force = o.force ?? false): Effect.Effect<void, DrainTimeout> => Effect.gen(function* () {
    if (s.holders.size === 0) return
    const timeout = o.timeout ?? defaultTimeout
    if (!s.idle || (yield* Deferred.isDone(s.idle))) s.idle = yield* Deferred.make<void>()
    const idle = Deferred.await(s.idle)
    const ok = timeout === "forever" ? yield* idle.pipe(Effect.as(true))
      : yield* idle.pipe(Effect.as(true), Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.succeed(false) }))
    if (ok) return
    const leases = s.holders.size
    if (!force) return yield* Effect.fail(new DrainTimeout({ id: name, leases }))
    // Revocation interrupts each holder and waits for its finalizers (BEH-BR-174, finding G26).
    yield* Fiber.interruptAll([...s.holders])
    if (Option.isSome(owner)) owner.value.revoked(name, leases)
    else yield* Effect.logWarning(`generation ${name}: ${leases} lease(s) revoked`)
  })
  const retire = (s: Slot<A>): Retired<A> => {
    const value = s.value as A
    return {
      value,
      drained: Effect.suspend(() => s.holders.size === 0 ? Effect.void : Deferred.await(s.drained)),
      drain: (o) => drain(s, o),
      holders: Effect.sync(() => s.holders.size)
    }
  }

  // Closing the generation's scope closes admission and drains everything still held, revoking at the limit (BEH-BR-169).
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    open = false
    for (const s of [current, ...retired]) yield* Effect.exit(drain(s, { timeout: defaultTimeout }, true))
  }))

  return {
    acquire: Effect.gen(function* () {
      const self = (yield* Effect.fiber) as Fiber.Fiber<unknown, unknown>
      const s = yield* admit(self)
      yield* Effect.addFinalizer(() => release(s, self))
      return { value: s.value as A, revision: s.revision }
    }),
    // Linearized: one synchronous step replaces the value; publish never changes admission (BEH-BR-170).
    publish: (next) => Effect.gen(function* () {
      const fresh = yield* slot(next, current.revision + 1)
      const old = current
      current = fresh
      old.retired = true
      const r = retire(old)
      if (old.holders.size === 0) { old.value = undefined; yield* Deferred.succeed(old.drained, undefined) }
      else retired.add(old)
      return r
    }),
    closeAdmission: Effect.sync(() => { open = false }),
    reopenAdmission: Effect.sync(() => { open = true }),
    awaitDrained: (o) => Effect.suspend(() => drain(current, o)),
    use: (run) => Effect.gen(function* () {
      const gate = yield* Deferred.make<A>()
      const child = yield* Effect.forkChild(Deferred.await(gate).pipe(Effect.flatMap(run)))
      const s = yield* admit(child as Fiber.Fiber<unknown, unknown>).pipe(Effect.onError(() => Fiber.interrupt(child)))
      yield* Deferred.succeed(gate, s.value as A)
      const exit = yield* Fiber.join(child).pipe(Effect.onInterrupt(() => Fiber.interrupt(child)), Effect.exit,
        Effect.ensuring(release(s, child as Fiber.Fiber<unknown, unknown>)))
      if (Exit.isSuccess(exit)) return exit.value
      if (Cause.hasInterrupts(exit.cause) && !Cause.hasFails(exit.cause)) return yield* Effect.fail(new LeaseRevoked({ serviceId: name }))
      return yield* Effect.failCause(exit.cause)
    }),
    current: Effect.sync(() => ({ revision: current.revision, open }))
  }
})
