// The remote session over a `Connection` (remote 02 and 04): an epoch per session, calls and results carrying it, a stale epoch
// refused at both ends (BEH-RM-011), heartbeat (BEH-RM-025) and a link that opens a fresh session after one ends (BEH-RM-010, 029).
import { Clock, Deferred, Effect, Fiber, Option, Ref } from "effect"
import type { WireSide } from "./handshake.js"
import { guestServe, linkHandshake, type Connection, type LinkOutcome } from "./wire.js"

const parse = (s: string): { readonly t?: string; readonly [k: string]: unknown } | undefined => { try { const v = JSON.parse(s); return typeof v === "object" && v !== null && !Array.isArray(v) ? v : undefined } catch { return undefined } }

export type EndReason = "heartbeat-missed" | "guest-reset" | "closed"
/** A call that did not complete normally: `outcome` says whether the guest may have run it (ADR-RM-008). */
export interface CallFailure { readonly _tag: "StaleEpoch" | "SessionLost" | "MethodNotServed" | "RemoteError" | "RemoteUnavailable"; readonly outcome: "not-executed" | "unknown"; readonly detail?: unknown }
export interface Session {
  readonly epoch: string; readonly version: string
  readonly call: (method: string, payload: unknown) => Effect.Effect<unknown, CallFailure>
  readonly ended: Effect.Effect<EndReason>
  readonly refusals: Effect.Effect<number>
  readonly close: Effect.Effect<void>
}
export interface SessionOptions { readonly epoch: string; readonly wire: ReadonlyArray<number>; readonly contract: WireSide & { readonly id: string; readonly accepts: string }; readonly heartbeat: { readonly every: number; readonly missed: number } }

/** The link's end of one session: handshake, then calls and heartbeat until it ends. Resolves to the refusal when the handshake fails. */
export const openSession = (conn: Connection, o: SessionOptions): Effect.Effect<Session | Exclude<LinkOutcome, { session: unknown }>> => Effect.gen(function* () {
  const h = yield* linkHandshake(conn, { wire: o.wire, epoch: o.epoch, contract: o.contract })
  if (!("session" in h)) return h
  const pending = new Map<string, Deferred.Deferred<{ value?: unknown; error?: { _tag?: string } }>>()
  const endedD = yield* Deferred.make<EndReason>()
  const refusals = yield* Ref.make(0)
  const lastSeen = yield* Ref.make(yield* Clock.currentTimeMillis)
  let n = 0
  const fibers: Array<Fiber.Fiber<unknown, unknown>> = []
  const finish = (reason: EndReason) => Effect.gen(function* () {
    if (!(yield* Deferred.succeed(endedD, reason))) return
    for (const [, d] of pending) yield* Deferred.succeed(d, { error: { _tag: "SessionLost" } })     // every call in flight ends with outcome unknown
    pending.clear()
    for (const f of fibers) yield* Effect.forkDetach(Fiber.interrupt(f))
  })
  fibers.push(yield* Effect.forkDetach(Effect.forever(Effect.gen(function* () {
    const f = parse(yield* conn.receive)
    if (!f) return
    if (f.epoch !== o.epoch) { yield* Ref.update(refusals, (x) => x + 1); return }              // a frame of another epoch is dropped and counted
    yield* Ref.set(lastSeen, yield* Clock.currentTimeMillis)                                  // any decoding frame of the epoch is a sign of life
    if (f.t === "refuse" && (f.reason === "incompatible-contract" || f.reason === "stale-epoch")) return yield* finish("guest-reset")
    if (f.t === "result" && typeof f.callId === "string") {
      const d = pending.get(f.callId)
      if (d) { pending.delete(f.callId); yield* Deferred.succeed(d, f.error ? { error: f.error as { _tag?: string } } : { value: f.value }) }
      if ((f.error as { _tag?: string } | undefined)?._tag === "StaleEpoch") yield* finish("guest-reset")
    }
  }))))
  fibers.push(yield* Effect.forkDetach(Effect.gen(function* () {
    while (true) {
      yield* Effect.sleep(o.heartbeat.every)
      if ((yield* Clock.currentTimeMillis) - (yield* Ref.get(lastSeen)) >= o.heartbeat.every * o.heartbeat.missed) return yield* finish("heartbeat-missed")
      yield* conn.send(JSON.stringify({ t: "ping", epoch: o.epoch, n: ++n }))
    }
  })))
  const call = (method: string, payload: unknown): Effect.Effect<unknown, CallFailure> => Effect.gen(function* () {
    if (yield* Deferred.isDone(endedD)) return yield* Effect.fail({ _tag: "SessionLost", outcome: "not-executed" } satisfies CallFailure)
    const callId = `c-${++n}`
    const d = yield* Deferred.make<{ value?: unknown; error?: { _tag?: string } }>()
    pending.set(callId, d)
    yield* conn.send(JSON.stringify({ t: "call", epoch: o.epoch, callId, method, payload, version: h.session.version }))
    const r = yield* Deferred.await(d)
    if (r.error) {
      const tag = r.error._tag
      return yield* Effect.fail({ _tag: tag === "StaleEpoch" || tag === "SessionLost" || tag === "MethodNotServed" ? tag : "RemoteError", outcome: tag === "SessionLost" ? "unknown" : "not-executed", detail: r.error } satisfies CallFailure)
    }
    return r.value
  })
  const session: Session = { epoch: o.epoch, version: h.session.version, call, ended: Deferred.await(endedD), refusals: Ref.get(refusals), close: finish("closed") }
  return session
})

export type Handlers = Readonly<Record<string, (payload: unknown) => Effect.Effect<unknown>>>
/** The guest's end: answer the handshake, adopt the epoch, then serve calls of that epoch only and answer pings. Never answers a call of another epoch by executing it. */
export const serveGuest = (conn: Connection, guest: { readonly wire: ReadonlyArray<number>; readonly served: ReadonlyArray<WireSide>; readonly maxInFlight: number; readonly handlers: Handlers }): Effect.Effect<{ readonly answered: "welcome" | "refuse" }> =>
  Effect.gen(function* () {
    const h = yield* guestServe(conn, guest)
    if (h.answered !== "welcome") return { answered: h.answered }
    yield* Effect.forkDetach(Effect.forever(Effect.gen(function* () {
      const f = parse(yield* conn.receive)
      if (!f) return
      if (f.t === "ping" && f.epoch === h.epoch) return yield* conn.send(JSON.stringify({ t: "pong", epoch: h.epoch, n: f.n }))
      if (f.t !== "call" || typeof f.callId !== "string") return
      if (f.epoch !== h.epoch) return yield* conn.send(JSON.stringify({ t: "result", epoch: f.epoch, callId: f.callId, error: { _tag: "StaleEpoch", epoch: f.epoch }, outcome: "not-executed" }))
      const fn = guest.handlers[String(f.method)]
      if (!fn) return yield* conn.send(JSON.stringify({ t: "result", epoch: h.epoch, callId: f.callId, error: { _tag: "MethodNotServed" } }))
      yield* conn.send(JSON.stringify({ t: "result", epoch: h.epoch, callId: f.callId, value: yield* fn(f.payload) }))
    })))
    return { answered: "welcome" as const }
  })

export interface LinkStatus { readonly state: "active" | "partitioned" | "stopped"; readonly sessions: ReadonlyArray<{ readonly epoch: string; readonly ended?: EndReason }>; readonly withdrawals: number }
/**
 * A link that keeps one session open: after a session ends it dials again and handshakes with a new epoch, never reusing one
 * (BEH-RM-010, 029). `dial` yields a connection to a guest that has already been started on its end.
 */
export const startLink = (dial: Effect.Effect<Connection>, o: Omit<SessionOptions, "epoch"> & { readonly backoff: number; readonly stableFor?: number; readonly flapWarning?: number; readonly flapWindow?: number; readonly onSession?: (s: Session) => Effect.Effect<void>; readonly onEnd?: (s: Session, why: EndReason) => Effect.Effect<void> }) => Effect.gen(function* () {
  const status = yield* Ref.make<LinkStatus>({ state: "partitioned", sessions: [], withdrawals: 0 })
  const withdrawn: Array<number> = []
  const current = yield* Ref.make<Option.Option<Session>>(Option.none())
  let seq = 0
  const loop = Effect.gen(function* () {
    while (true) {
      const epoch = `epoch-${++seq}`
      const out = yield* openSession(yield* dial, { ...o, epoch })
      if ("call" in out) {
        yield* Ref.update(status, (s) => ({ ...s, state: "active" as const, sessions: [...s.sessions, { epoch }] }))
        yield* Ref.set(current, Option.some(out))
        // BEH-RM-029: a child is mounted only once the session has stayed open for `stableFor`; one that ends sooner mounts none.
        const stable = (o.stableFor ?? 0) <= 0 ? true : (yield* Effect.raceFirst(Effect.sleep(o.stableFor!).pipe(Effect.as(true)), out.ended.pipe(Effect.as(false))))
        if (stable && o.onSession) yield* o.onSession(out)
        const reason = yield* out.ended
        yield* Ref.set(current, Option.none())
        if (stable) {
          if (o.onEnd) yield* o.onEnd(out, reason)
          const now = yield* Clock.currentTimeMillis
          withdrawn.push(now)
          const window = o.flapWindow ?? 600_000
          while (withdrawn.length && now - withdrawn[0]! > window) withdrawn.shift()
          yield* Ref.update(status, (s) => ({ ...s, withdrawals: s.withdrawals + 1 }))
          if (withdrawn.length > (o.flapWarning ?? 5)) yield* Effect.logWarning(`remote link flapping: ${withdrawn.length} withdrawals within ${window} ms`)
        }
        yield* Ref.update(status, (s) => ({ ...s, state: "partitioned" as const, sessions: s.sessions.map((x) => x.epoch === epoch ? { ...x, ended: reason } : x) }))
      }
      yield* Effect.sleep(o.backoff)
    }
  })
  const fiber = yield* Effect.forkDetach(loop)
  return { status: Ref.get(status), current: Ref.get(current), stop: Fiber.interrupt(fiber).pipe(Effect.andThen(Ref.update(status, (s) => ({ ...s, state: "stopped" as const })))) }
})
