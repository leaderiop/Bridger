// Generic gate, drafts and the OperationGate adapters (references/core behaviour 32, BEH-BR-313–316, 321). Prototype.
import { Cause, Effect, Exit, Option } from "effect"
import { Annotations, CurrentAnnotations, isBag, type Annotations as Bag } from "./annotations.js"
import { OperationGate, OperationRejected, type OperationRequest } from "./gxp.js"

export interface Draft<Req> { readonly draftId: string; readonly requests: ReadonlyArray<Req>; readonly expected: ReadonlyArray<{ readonly key: string; readonly version: string }> }
export type GateDecision<Req> = { readonly _tag: "Allow" } | { readonly _tag: "Refuse"; readonly reason: string } | { readonly _tag: "Defer"; readonly draft: Draft<Req> }
export interface GateContext { readonly annotations: Bag }
export interface Gate<Req> { readonly decide: (request: Req, context: GateContext) => Effect.Effect<GateDecision<Req>> }
export type DraftCheck = { readonly _tag: "Fresh" } | { readonly _tag: "Stale"; readonly mismatches: ReadonlyArray<{ readonly key: string; readonly expected: string; readonly actual: Option.Option<string> }> }

export const wellFormed = (d: unknown): d is Draft<unknown> => {
  const x = d as Draft<unknown> | null
  if (!x || typeof x.draftId !== "string" || x.draftId === "" || !Array.isArray(x.requests) || x.requests.length === 0 || !Array.isArray(x.expected)) return false
  const keys = x.expected.map((e) => e?.key)
  return keys.every((k) => typeof k === "string") && x.expected.every((e) => typeof e.version === "string") && new Set(keys).size === keys.length
}

const TIMEOUT = Symbol("gate-timeout")
/** BEH-BR-314: once, fail closed; the caller's interruption ends it without a decision. */
const run = <Req>(gate: Gate<Req>, request: Req, options: { readonly name: string; readonly timeout: number | "forever" }): Effect.Effect<GateDecision<Req>> => Effect.gen(function* () {
  const cur = yield* CurrentAnnotations
  const ctx: GateContext = { annotations: Annotations.filter(isBag(cur) ? cur : Annotations.empty, "gate") }
  const call = Effect.suspend(() => gate.decide(request, ctx))
  const bounded = options.timeout === "forever" ? call : call.pipe(Effect.timeoutOrElse({ duration: options.timeout, orElse: () => Effect.succeed(TIMEOUT as never) }))
  const exit = yield* Effect.exit(bounded)
  if (Exit.isFailure(exit)) {
    if (Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause) && !Cause.hasFails(exit.cause) && (yield* Effect.interruptible(Effect.void).pipe(Effect.as(false)))) return yield* Effect.interrupt
    return { _tag: "Refuse", reason: "gate-defect" }
  }
  const d = exit.value as GateDecision<Req> | typeof TIMEOUT
  if (d === TIMEOUT) return { _tag: "Refuse", reason: "gate-timeout" }
  if (d._tag === "Defer" && !wellFormed(d.draft)) return { _tag: "Refuse", reason: "gate-defect" }
  if (d._tag !== "Allow" && d._tag !== "Refuse" && d._tag !== "Defer") return { _tag: "Refuse", reason: "gate-defect" }
  return d
})

/** BEH-BR-321: in order, each under its own timeout; the first refusal wins; a deferral yields to a later refusal. */
const all = <Req>(pieces: ReadonlyArray<{ readonly name: string; readonly gate: Gate<Req>; readonly timeout: number | "forever" }>): Gate<Req> => {
  if (pieces.length === 0) throw new Error("Gate.all: empty list")
  return {
    decide: (request) => Effect.gen(function* () {
      let deferred: GateDecision<Req> | undefined
      for (const p of pieces) {
        const d = yield* run(p.gate, request, { name: p.name, timeout: p.timeout })
        if (d._tag === "Refuse") return { _tag: "Refuse", reason: `${p.name}: ${d.reason}` }
        if (d._tag === "Defer") deferred ??= d
      }
      return deferred ?? { _tag: "Allow" }
    })
  }
}

export const Gate = { run, all }
export const Draft = {
  /** BEH-BR-316: `read` once per expectation; every mismatch, nothing else. */
  check: <Req>(draft: Draft<Req>, read: (key: string) => Effect.Effect<Option.Option<string>>): Effect.Effect<DraftCheck> => Effect.gen(function* () {
    const mismatches: Array<{ key: string; expected: string; actual: Option.Option<string> }> = []
    for (const e of draft.expected) {
      const actual = yield* read(e.key)
      if (Option.isNone(actual) || actual.value !== e.version) mismatches.push({ key: e.key, expected: e.version, actual })
    }
    return mismatches.length ? { _tag: "Stale", mismatches } : { _tag: "Fresh" }
  })
}
/** BEH-BR-315: the adapters between the generic gate and the host's port. */
export const fromGate = (gate: Gate<OperationRequest>, options: { readonly deferReason?: (d: Draft<OperationRequest>) => string } = {}): OperationGate["Service"] => ({
  authorize: (request) => run(gate, request, { name: "operation-gate", timeout: "forever" }).pipe(Effect.flatMap((d) =>
    d._tag === "Allow" ? Effect.void
      : Effect.fail(new OperationRejected({ operation: request.operation, reason: d._tag === "Refuse" ? d.reason : (options.deferReason ?? (() => "deferred"))(d.draft), ...(request.target ? { target: request.target } : {}) }))))
})
export const asGate = (port: OperationGate["Service"]): Gate<OperationRequest> => ({
  decide: (request) => port.authorize(request).pipe(Effect.as({ _tag: "Allow" } as GateDecision<OperationRequest>),
    Effect.catch((e: OperationRejected) => Effect.succeed({ _tag: "Refuse", reason: e.reason } as GateDecision<OperationRequest>)))
})
