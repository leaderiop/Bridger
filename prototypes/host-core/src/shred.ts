// Gated shred (keyring BEH-KR-017, BEH-KR-020; improvement report 06 S13): a shred, and a received shred notice, are decided by a mandatory generic gate
// (core BEH-BR-313) before anything is written; the request says the operation is irreversible. Prototype kernel: the key store and bus are the caller's.
import { createHash } from "node:crypto"
import { Effect } from "effect"
import type { Gate } from "./gate.js"
import type { Actor } from "./gxp.js"
import { Annotations } from "./annotations.js"

export interface ShredRequest {
  readonly operation: "shred" | "apply-shred-notice"
  readonly subjectDigest: string            // sha256 of the subject: a subject is the application's identifier and may be personal data
  readonly actor: Actor
  readonly reason: string
  readonly correlationId?: string
  readonly origin?: string                  // a received notice: the origin node of the envelope
  readonly reversibility: "irreversible"
}
export class ShredRefused extends Error { readonly _tag = "ShredRefused"; constructor(readonly reason: string) { super(`shred refused: ${reason}`) } }
export const subjectDigest = (subject: string): string => createHash("sha256").update(subject, "utf8").digest("hex")

/** Nothing is written before this allows. A refusal, a deferral and a gate defect all refuse: a shred is never pending approval inside the keyring. */
export const authorizeShred = (gate: Gate<ShredRequest>, request: ShredRequest): Effect.Effect<void, ShredRefused> =>
  request.actor.id.trim() === "" || request.actor.id.startsWith("bridger:") || request.reason.trim() === "" ? Effect.fail(new ShredRefused("unattributed")) :
  Effect.flatMap(Effect.exit(gate.decide(request, { annotations: Annotations.empty })), (exit) =>
    exit._tag === "Failure" ? Effect.fail(new ShredRefused("gate-defect"))
    : exit.value._tag === "Allow" ? Effect.void
    : Effect.fail(new ShredRefused(exit.value._tag === "Refuse" ? exit.value.reason : "deferred")))

export interface Notice { readonly subject: string; readonly shredId: string; readonly reason: string; readonly origin: string; readonly actor: Actor; readonly correlationId?: string }
/** A received notice: applied once per `shredId`, and only after the gate allowed it under `keyring-notice:<origin>`; a refused notice is left pending, unacknowledged. */
export const receiveNotice = (o: { readonly gate: Gate<ShredRequest>; readonly seen: Set<string>; readonly apply: (n: Notice) => Effect.Effect<void> }) =>
  (n: Notice): Effect.Effect<"applied" | "duplicate" | "pending"> => Effect.gen(function* () {
    if (o.seen.has(n.shredId)) return "duplicate" as const
    const request: ShredRequest = { operation: "apply-shred-notice", subjectDigest: subjectDigest(n.subject), actor: { id: `keyring-notice:${n.origin}`, kind: "service" } as Actor, reason: n.reason, ...(n.correlationId ? { correlationId: n.correlationId } : {}), origin: n.origin, reversibility: "irreversible" }
    const ok = yield* Effect.exit(authorizeShred(o.gate, request))
    if (ok._tag === "Failure") return "pending" as const
    yield* o.apply(n)
    o.seen.add(n.shredId)                                                      // marked only once applied: a failed apply is retried, never lost
    return "applied" as const
  })

/** `shred(subject)`: the gate decides first, then step 1 of BEH-KR-017 runs. */
export const gatedShred = <A, E>(gate: Gate<ShredRequest>, request: ShredRequest, step1: Effect.Effect<A, E>): Effect.Effect<A, E | ShredRefused> =>
  Effect.flatMap(authorizeShred(gate, request), () => step1)
