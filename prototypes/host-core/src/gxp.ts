// GxP hooks of the host core (references/core behaviours 22–25): attribution, the
// AuditSink port and its single writer, the audit sequence, IdGenerator and the
// OperationGate port. Phase-P3 prototype — not product code.
import { Clock, Context, Deferred, Effect, Schema } from "effect"

// ---------------------------------------------------------------- attribution (behaviour 22)
export interface Actor { readonly id: string; readonly kind: "user" | "service" | "system"; readonly display?: string }
export const Actor = {
  system: { id: "bridger:system", kind: "system" } as Actor,
  unattributed: { id: "bridger:unattributed", kind: "system" } as Actor,
}
export interface OperationContext { readonly actor: Actor; readonly reason?: string; readonly correlationId?: string }
export interface OperationOptions { readonly context?: OperationContext }
export const CurrentActor = Context.Reference<Actor>("@bridger/core/CurrentActor", { defaultValue: () => Actor.unattributed })

export type Operation = "install" | "remove" | "replace" | "retry" | "reconfigure" | "restart" | "disable" | "enable" | "shutdown" | "acknowledgeAuditDegraded"
export type SystemTransition = "system-start" | "system-stop" | "runtime-failure" | "lease-revoked" | "intent-ended" | "health-degraded"
export type AuditPhase = "requested" | "rejected" | "completed" | "failed" | "superseded" | "joined" | "system"

export interface AttributionOptions { readonly require?: boolean; readonly requireReason?: ReadonlyArray<Operation> }

// ---------------------------------------------------------------- errors
export class Unattributed extends Schema.TaggedError<Unattributed>()("Unattributed", { operation: Schema.String }) {}
export class ReasonRequired extends Schema.TaggedError<ReasonRequired>()("ReasonRequired", { operation: Schema.String }) {}
export class AuditUnavailable extends Schema.TaggedError<AuditUnavailable>()("AuditUnavailable", { operation: Schema.String, message: Schema.String }) {}
export class AuditWriteFailed extends Schema.TaggedError<AuditWriteFailed>()("AuditWriteFailed", { message: Schema.String }) {}
export class OperationRejected extends Schema.TaggedError<OperationRejected>()("OperationRejected", {
  operation: Schema.String, target: Schema.optional(Schema.Struct({ id: Schema.String, realm: Schema.String })), reason: Schema.String
}) {}

// ---------------------------------------------------------------- records and ports (behaviours 23, 25)
export interface DefinitionRef { readonly version?: string; readonly digest?: string }
export interface AuditRecord {
  readonly schemaVersion: 1
  readonly recordId: string
  readonly hostId: string
  readonly auditSeq: number
  readonly timestamp: string
  readonly actor: Actor
  readonly reason?: string
  readonly correlationId: string
  readonly causationId?: string
  readonly operation: Operation | SystemTransition
  readonly target?: { readonly id: string; readonly realm: string }
  readonly phase: AuditPhase
  readonly noop?: true
  readonly before?: { readonly state: string; readonly revision: number } & DefinitionRef
  readonly after?: { readonly state: string; readonly revision: number } & DefinitionRef
  readonly error?: { readonly _tag: string; readonly message: string }
  readonly droppedSinceAck?: number
  readonly configChange?: { readonly paths: ReadonlyArray<string> }   // paths only, never values (BEH-BR-197)
  readonly endsIntentOf?: string                    // `intent-ended` only: the parked call's `requested` record id (BEH-BR-080)
  readonly resumes?: string                         // a resumer's terminal record: the parked call's `requested` record id (BEH-BR-200)
}
export class AuditSink extends Context.Service<AuditSink, {
  readonly record: (r: AuditRecord) => Effect.Effect<void, AuditWriteFailed>
}>()("@bridger/core/AuditSink") {}

export interface OperationRequest {
  readonly operation: Operation
  readonly target?: { readonly id: string; readonly realm: string }
  readonly actor: Actor
  readonly reason?: string
  readonly correlationId: string
  readonly definition?: DefinitionRef
}
export class OperationGate extends Context.Service<OperationGate, {
  readonly authorize: (request: OperationRequest) => Effect.Effect<void, OperationRejected>
}>()("@bridger/core/OperationGate") {}

export class IdGenerator extends Context.Service<IdGenerator, { readonly next: Effect.Effect<string> }>()("@bridger/core/IdGenerator") {}
/** The one place core touches ambient randomness (BEH-BR-211). */
export const defaultIdGenerator: IdGenerator["Service"] = { next: Effect.sync(() => globalThis.crypto.randomUUID()) }

// ---------------------------------------------------------------- verifyAuditSequence (BEH-BR-215)
/** Gap, duplicate and order detection over records as given. Not tamper evidence. */
export const verifyAuditSequence = (records: ReadonlyArray<Pick<AuditRecord, "auditSeq">>) => {
  const gaps: Array<{ after: number; before: number }> = []
  const duplicates: Array<number> = []
  const outOfOrder: Array<number> = []
  const seen = new Set<number>()
  let prev = 0
  for (const { auditSeq: n } of records) {
    if (seen.has(n)) { duplicates.push(n); continue }
    seen.add(n)
    if (n < prev) outOfOrder.push(n)
    else if (n > prev + 1) gaps.push({ after: prev, before: n })
    prev = Math.max(prev, n)
  }
  return { gaps, duplicates, outOfOrder }
}

// ---------------------------------------------------------------- the single writer (BEH-BR-202..205, 212, 213)
export type Draft = Omit<AuditRecord, "auditSeq" | "recordId" | "timestamp" | "hostId" | "schemaVersion">
interface Pending { readonly draft: Draft; readonly recordId: string; readonly done: Deferred.Deferred<boolean> }

export interface Writer {
  /** Enqueue a record; returns its record id and a signal that resolves true when written. */
  readonly enqueue: (draft: Draft) => Effect.Effect<{ recordId: string; written: Deferred.Deferred<boolean> } | undefined>
  readonly state: { degraded: boolean; dropped: number; droppedSinceAck: number }
  readonly written: ReadonlyArray<AuditRecord>      // diagnostic copy for the prototype's tests only
  /** Waits until every queued record has been handed to the sink (the scope-close path, BEH-BR-108). */
  readonly flush: Effect.Effect<void>
}

export const makeWriter = (opts: {
  readonly sink: AuditSink["Service"]
  readonly hostId: string
  readonly ids: IdGenerator["Service"]
  readonly auditTimeout: number
  readonly capacity: number
  readonly onDegraded: (why: string) => Effect.Effect<void>
}) => Effect.gen(function* () {
  const queue: Array<Pending> = []
  const wake = { signal: yield* Deferred.make<void>() }
  const state = { degraded: false, dropped: 0, droppedSinceAck: 0 }
  const written: Array<AuditRecord> = []
  let seq = 0
  let writing = false

  const degrade = (why: string) => Effect.suspend(() => {
    const first = !state.degraded
    state.degraded = true
    return first ? opts.onDegraded(why) : Effect.void
  })

  const writeOne = (p: Pending) => Effect.gen(function* () {
    writing = true
    // The number is assigned at the serialization point, immediately before the first attempt,
    // and kept by every retry, so a failed write never consumes a number (BEH-BR-213).
    const record: AuditRecord = {
      schemaVersion: 1, recordId: p.recordId, hostId: opts.hostId, auditSeq: ++seq,
      timestamp: new Date(yield* Clock.currentTimeMillis).toISOString(), ...p.draft
    }
    const started = yield* Clock.currentTimeMillis
    let delay = 100
    let signalled = false
    while (true) {
      const ok = yield* opts.sink.record(record).pipe(
        Effect.timeoutOrElse({ duration: opts.auditTimeout, orElse: () => Effect.fail(new AuditWriteFailed({ message: "timeout" })) }),
        Effect.as(true), Effect.catchCause(() => Effect.succeed(false)))
      if (ok) { written.push(record); if (!signalled) yield* Deferred.succeed(p.done, true); return }
      const elapsed = (yield* Clock.currentTimeMillis) - started
      if (!signalled && elapsed >= opts.auditTimeout) {
        signalled = true
        yield* Deferred.succeed(p.done, false)                       // the caller gives up; the writer does not
        if (p.draft.phase !== "requested") yield* degrade(`unwritten ${p.draft.phase} record`)
      }
      yield* Effect.sleep(Math.min(delay, opts.auditTimeout)); delay *= 2   // retry in place (BEH-BR-202)
    }
  })

  const loop: Effect.Effect<never> = Effect.gen(function* () {
    while (true) {
      const next = queue.shift()
      if (!next) { yield* Deferred.await(wake.signal); wake.signal = yield* Deferred.make<void>(); continue }
      yield* writeOne(next)
      writing = false
    }
  })
  yield* Effect.forkScoped(loop)

  const enqueue = (draft: Draft) => Effect.gen(function* () {
    if (queue.length >= opts.capacity) {                           // overflow: never numbered, counted, latched
      state.dropped++; state.droppedSinceAck++
      yield* degrade("writer queue overflow")
      return undefined
    }
    const recordId = yield* opts.ids.next
    const done = yield* Deferred.make<boolean>()
    queue.push({ draft, recordId, done })
    yield* Deferred.succeed(wake.signal, undefined)
    return { recordId, written: done }
  })
  const flush: Effect.Effect<void> = Effect.gen(function* () { while (queue.length > 0 || writing) yield* Effect.yieldNow })
  return { enqueue, state, written, flush } satisfies Writer
})

export const awaitWritten = (w: Deferred.Deferred<boolean>, timeout: number) =>
  Deferred.await(w).pipe(Effect.timeoutOrElse({ duration: timeout, orElse: () => Effect.succeed(false) }))

