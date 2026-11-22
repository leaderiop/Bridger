// ContributionRegistry (references/core behaviour 19, BEH-BR-161–168). Phase-P5 prototype — not product code.
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Option, PubSub, Stream, SubscriptionRef, type Scope } from "effect"
import { ActivePlugin } from "./active.js"
import { ContributionUnavailable, DuplicateContribution, IncompatibleContract, LeaseRevoked, LeaseTimeout } from "./errors.js"
import { AccessDenied, CurrentPlugin, PolicySeam, refOf } from "./policy.js"
import { incompatibility, parseRange, parseVersion, provisionOf, rangeWithinMajor, refKind, satisfies, type Contract, type ContractDescriptor, type ContractProvision } from "./contract.js"

export interface RegistryView<A> {
  readonly revision: number
  readonly entries: ReadonlyArray<{ readonly id: string; readonly priority: number; readonly value: A; readonly version?: string; readonly methods?: ReadonlyArray<string> }>
}
/** A version, a version with its method names (and optionally their schema digests), or a `Contract.at` provision, whose contract copy is compared method by method (BEH-BR-228 clause 3b). */
export type Implements = string | { readonly version: string; readonly methods: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] } | ContractProvision
/** BEH-BR-167: one notice per removal that revoked at least one holder; `seq` is per registry, from 1, gap-free. */
export interface HoldRevoked {
  readonly registry: string
  readonly id: string
  readonly owner?: { readonly pluginId: string; readonly realm: string }
  readonly holders: number                            // callbacks interrupted with LeaseRevoked
  readonly stuck: number                              // of those, holders whose finalizers had not finished when `revokeTimeout` passed (report 03 T2)
  readonly at: string
  readonly seq: number
}
export interface AddOptions { readonly priority?: number; readonly implements?: Implements }
export interface Registry<A> {
  readonly name: string
  readonly add: (id: string, value: A, options?: AddOptions) => Effect.Effect<void, DuplicateContribution | IncompatibleContract, Scope.Scope>
  readonly get: (id: string) => Effect.Effect<Option.Option<A>>
  readonly view: Effect.Effect<RegistryView<A>>                       // a plain read: no hold (BEH-BR-166)
  readonly changes: Stream.Stream<RegistryView<A>>
  readonly use: <B, E, R>(id: string, run: (value: A) => Effect.Effect<B, E, R>, options?: { readonly timeout?: number }) =>
    Effect.Effect<B, E | ContributionUnavailable | LeaseRevoked | LeaseTimeout, R>
  readonly useAll: <B, E, R>(run: (view: RegistryView<A>) => Effect.Effect<B, E, R>, options?: { readonly timeout?: number }) =>
    Effect.Effect<B, E | LeaseRevoked | LeaseTimeout, R>
  /** Contract registries only (BEH-BR-233): a reader treating out-of-range entries as absent. */
  readonly within: (range: string) => Effect.Effect<Omit<Registry<A>, "add" | "within" | "revocations">>
  /** BEH-BR-167: a notification feed, not a log; a subscriber sees only notices published after it subscribed. */
  readonly revocations: Stream.Stream<HoldRevoked>
}
/** `revokeTimeout` (default 30 s) bounds the wait for revoked holders' finalizers (BEH-BR-167, report 03 T2); "forever" only when declared. */
export interface RegistryOptions { readonly drainTimeout?: number | "forever"; readonly revokeTimeout?: number | "forever"; readonly name?: string; readonly contract?: Contract; readonly range?: string; readonly report?: boolean }

interface Slot<A> {
  readonly id: string
  readonly priority: number
  readonly value: A
  readonly version?: string
  readonly methods?: ReadonlyArray<string>
  hidden: boolean                                   // removal has begun: out of the view, id still reserved (BEH-BR-164)
  readonly holders: Set<Fiber.Fiber<unknown, unknown>>
  readonly owner?: { readonly pluginId: string; readonly realm: string }
  idle?: Deferred.Deferred<void>
}

/** Priority ascending, ties by id in code-unit order (BEH-BR-165). */
const order = (a: { priority: number; id: string }, b: { priority: number; id: string }) =>
  a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const make = <A>(options: RegistryOptions = {}): Effect.Effect<Registry<A>, never, Scope.Scope> => Effect.gen(function* () {
  const name = options.name ?? "registry"
  const drainTimeout = options.drainTimeout ?? 30_000
  const revokeTimeout = options.revokeTimeout ?? 30_000
  const notices = yield* PubSub.sliding<HoldRevoked>(256)
  let noticeSeq = 0
  const slots = new Map<string, Slot<A>>()
  let revision = 0
  // BEH-BR-233: a contract registry; an invalid contract or range, or a range without a contract, is a defect.
  const contract = options.contract
  if (options.range !== undefined && !contract) return yield* Effect.die(new Error(`registry ${name}: range without a contract`))
  if (contract?.invalid) return yield* Effect.die(new Error(`registry ${name}: contract ${contract.key}: ${contract.invalid}`))
  const major = contract ? parseVersion(contract.version)![0] : 0
  const range = contract ? options.range ?? "^" + contract.version : undefined
  const checkRange = (r: string, where: string) => {
    if (!parseRange(r) || !rangeWithinMajor(r, major)) throw new Error(`registry ${name}: ${where} range ${r} breaks the grammar or leaves major ${major}`)
  }
  if (range !== undefined) { try { checkRange(range, "make") } catch (e) { return yield* Effect.die(e) } }
  const viewOf = (keep: (s: Slot<A>) => boolean): RegistryView<A> => ({
    revision,
    entries: [...slots.values()].filter((s) => !s.hidden && keep(s)).sort(order).map(({ id, priority, value, version, methods }) => ({ id, priority, value, ...(version !== undefined ? { version, methods: methods! } : {}) }))
  })
  const viewNow = (): RegistryView<A> => viewOf(() => true)
  const feed = yield* SubscriptionRef.make<RegistryView<A>>(viewNow())
  // One step per entry entering or leaving the view (BEH-BR-165).
  const bump = Effect.suspend(() => { revision++; return SubscriptionRef.set(feed, viewNow()) })

  /** Hide, then drain the holders under drainTimeout, then revoke and await their finalizers (BEH-BR-167). */
  const withdraw = (s: Slot<A>) => Effect.gen(function* () {
    s.hidden = true
    yield* bump
    if (s.holders.size > 0) {
      s.idle = yield* Deferred.make<void>()
      const drained = drainTimeout === "forever"
        ? yield* Deferred.await(s.idle).pipe(Effect.as(true))
        : yield* Deferred.await(s.idle).pipe(Effect.as(true), Effect.timeoutOrElse({ duration: drainTimeout, orElse: () => Effect.succeed(false) }))
      if (!drained) {
        const revoked = [...s.holders]
        // Finalizers cannot be interrupted, so the revoke runs detached and only the wait is bounded (BEH-BR-167).
        const revoking = yield* Effect.forkDetach(Fiber.interruptAll(revoked))
        if (revokeTimeout === "forever") yield* Fiber.await(revoking)
        else yield* Fiber.await(revoking).pipe(Effect.timeoutOrElse({ duration: revokeTimeout, orElse: () => Effect.succeed(undefined) }))
        const stuck = revoked.filter((f) => f.pollUnsafe() === undefined).length
        const at = new Date(yield* Clock.currentTimeMillis).toISOString()
        const notice: HoldRevoked = { registry: name, id: s.id, ...(s.owner ? { owner: s.owner } : {}), holders: revoked.length, stuck, at, seq: ++noticeSeq }
        yield* Effect.logWarning(`registry ${name}: removing ${s.id} revoked ${revoked.length} holder(s)${stuck > 0 ? `, ${stuck} still running their finalizers` : ""}`)
        yield* PubSub.publish(notices, notice)
      }
    }
    slots.delete(s.id)                                // only now may the id be added again (BEH-BR-164)
  })

  const add: Registry<A>["add"] = (id, value, o = {}) => Effect.gen(function* () {
    const priority = o.priority ?? 0
    if (!Number.isFinite(priority)) return yield* Effect.die(new Error(`priority of contribution ${id} is not a finite number`))
    let declared: { version: string; methods: ReadonlyArray<string>; schemas?: ContractDescriptor["schemas"] } | undefined
    if (o.implements !== undefined) {
      if (!contract) return yield* Effect.die(new Error(`registry ${name}: implements on a registry without a contract`))
      declared = typeof o.implements === "string" ? { version: o.implements, methods: contract.descriptor.methods } : refKind(o.implements as never) === "provision" ? provisionOf(o.implements as never)! : o.implements as { version: string; methods: ReadonlyArray<string> }
      if (declared.methods.length === 0) return yield* Effect.die(new Error(`registry ${name}: implements with empty methods`))
    }
    // A wired AccessPolicy decides every contribution (BEH-BR-264, 268); a denial is a defect.
    const seam = yield* PolicySeam
    if (Option.isSome(seam)) {
      const p = yield* CurrentPlugin.get
      const principal = Option.isSome(p) ? refOf(p.value) : undefined
      const declared = seam.value.declaredFor(principal)
      const d = seam.value.decide({ kind: "contribute", registry: name, id, ...(principal ? { principal } : {}), ...(declared ? { declared } : {}) })
      if (d !== "allow") return yield* Effect.die(new AccessDenied("contribute", `${name}/${id}`, d.deny))
    }
    if (contract) {
      // After a wired AccessPolicy and before the id is reserved (BEH-BR-233).
      const bad = incompatibility({ range: range!, version: contract.version, methods: contract.descriptor.methods, schemas: contract.descriptor.schemas }, declared)
      if (bad) {
        const owner = yield* ActivePlugin
        return yield* Effect.fail(new IncompatibleContract({ serviceId: contract.key, dependentId: `registry:${name}`, providerId: Option.isSome(owner) ? owner.value.pluginId : "application", required: range!, ...bad }))
      }
    }
    // Check and register in one synchronous segment: two concurrent adds of one id yield one registration (BEH-BR-163).
    if (slots.has(id)) return yield* Effect.fail(new DuplicateContribution({ id }))
    const ownerRef = yield* ActivePlugin
    const s: Slot<A> = { id, priority, value, hidden: false, holders: new Set(), ...(Option.isSome(ownerRef) ? { owner: { pluginId: ownerRef.value.pluginId, realm: ownerRef.value.realm } } : {}), ...(declared ? { version: declared.version, methods: declared.methods } : {}) }
    slots.set(id, s)
    yield* bump
    // Reported first, so its removal runs after the withdrawal: listed until the removal has completed (BEH-BR-119, 164).
    if (options.report !== false && Option.isSome(ownerRef)) yield* ownerRef.value.report({ kind: "contribution", registry: name, id })
    // Scope finalizers run last in, first out (BEH-BR-164).
    yield* Effect.addFinalizer(() => withdraw(s))
  })

  /** Runs `run` in a child fiber that holds `held`, with the edge rules of Host.use (BEH-BR-166). */
  const holding = <B, E, R>(held: ReadonlyArray<Slot<A>>, run: Effect.Effect<B, E, R>, timeout: number | undefined, label: string) =>
    Effect.gen(function* () {
      const gate = yield* Deferred.make<void>()
      const child = yield* Effect.forkChild(Deferred.await(gate).pipe(Effect.andThen(run)))
      for (const s of held) s.holders.add(child as Fiber.Fiber<unknown, unknown>)
      const release = Effect.gen(function* () {
        for (const s of held) {
          s.holders.delete(child as Fiber.Fiber<unknown, unknown>)
          if (s.holders.size === 0 && s.idle) yield* Deferred.succeed(s.idle, undefined)
        }
      })
      yield* Deferred.succeed(gate, undefined)
      const joined = Fiber.join(child).pipe(Effect.onInterrupt(() => Fiber.interrupt(child)))
      const bounded = timeout === undefined ? joined : joined.pipe(Effect.timeoutOrElse({
        duration: timeout, orElse: () => Fiber.interrupt(child).pipe(Effect.andThen(Effect.fail(new LeaseTimeout({ serviceId: label }))))
      }))
      const exit = yield* Effect.exit(bounded).pipe(Effect.ensuring(release))
      if (Exit.isSuccess(exit)) return exit.value
      // The child was interrupted while the caller was not: the registry revoked the hold (BEH-BR-167).
      if (Cause.hasInterrupts(exit.cause) && !Cause.hasFails(exit.cause)) return yield* Effect.fail(new LeaseRevoked({ serviceId: label }))
      return yield* Effect.failCause(exit.cause)
    })

  const reader = (keep: (s: Slot<A>) => boolean) => ({
    name,
    get: (id: string) => Effect.sync(() => { const s = slots.get(id); return s && !s.hidden && keep(s) ? Option.some(s.value) : Option.none() }),
    view: Effect.sync(() => viewOf(keep)),
    changes: SubscriptionRef.changes(feed).pipe(Stream.map(() => viewOf(keep))),
    use: <B, E, R>(id: string, run: (value: A) => Effect.Effect<B, E, R>, o: { readonly timeout?: number } = {}) =>
      Effect.suspend((): Effect.Effect<B, E | ContributionUnavailable | LeaseRevoked | LeaseTimeout, R> => {
        const s = slots.get(id)
        if (!s || s.hidden || !keep(s)) return Effect.fail(new ContributionUnavailable({ id }))
        return holding([s], Effect.suspend(() => run(s.value)), o.timeout, `${name}/${id}`)
      }),
    useAll: <B, E, R>(run: (view: RegistryView<A>) => Effect.Effect<B, E, R>, o: { readonly timeout?: number } = {}) => Effect.suspend(() => {
      const v = viewOf(keep)
      const held = v.entries.map((e) => slots.get(e.id)!)
      return holding(held, Effect.suspend(() => run(v)), o.timeout, name)
    })
  })
  const all = reader(() => true)
  return {
    ...all, add,
    revocations: Stream.fromPubSub(notices),
    changes: SubscriptionRef.changes(feed),
    // Misuse is a defect in the Effect channel, as in `make` (BEH-BR-233), never a synchronous throw.
    within: (r: string) => Effect.suspend(() => {
      try {
        if (!contract) throw new Error(`registry ${name}: within on a registry without a contract`)
        checkRange(r, "within")
      } catch (e) { return Effect.die(e) }
      return Effect.succeed(reader((s) => s.version !== undefined && satisfies(s.version, r)))
    })
  }
})
