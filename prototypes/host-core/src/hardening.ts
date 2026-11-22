// Reference kernels for report 06 S38-S55 on packages the prototype does not otherwise model (event-store, durable-bus, command, agent, mcp, sequence,
// remote, loader). Each is the smallest pure function that enforces the requirement; storage, transport and the models themselves are the caller's.
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

// ---- S38 event-store: a snapshot is bound to its event and removed on shred
export interface Snapshot { readonly stream: string; readonly streamVersion: number; readonly eventId: string; readonly eventHash: string; readonly state: unknown }
export const snapshotStore = () => {
  const m = new Map<string, Snapshot>()
  return {
    put: (stream: string, streamVersion: number, event: { eventId: string; bytes: string }, state: unknown) => { m.set(stream, { stream, streamVersion, eventId: event.eventId, eventHash: sha(event.bytes), state }) },
    /** Usable only when the event at `streamVersion` still has the recorded id and hash; otherwise the caller folds from the events. */
    load: (stream: string, eventAt: (version: number) => { eventId: string; bytes: string } | undefined) => {
      const s = m.get(stream); const e = s && eventAt(s.streamVersion)
      return s && e && e.eventId === s.eventId && sha(e.bytes) === s.eventHash ? s.state : undefined
    },
    onShred: (streams: Iterable<string>) => { for (const s of streams) m.delete(s) }
  }
}

// ---- S39 durable-bus: destructive operations are gated, attributed and leave a record
export interface BusOp { readonly operation: "retireDestination" | "acceptGap" | "resetVersions"; readonly actor: { id: string }; readonly reason: string; readonly reversibility: "irreversible" }
export const retireDestination = (o: { gate: (r: BusOp) => "allow" | "refuse"; actor: { id: string }; reason: string; pending: number; acceptLoss?: { count: number }; records: unknown[] }): "retired" | "refused" | "loss-not-accepted" => {
  if (!o.actor.id.trim() || !o.reason.trim()) return "refused"
  if (o.pending > 0 && o.acceptLoss?.count !== o.pending) return "loss-not-accepted"
  if (o.gate({ operation: "retireDestination", actor: o.actor, reason: o.reason, reversibility: "irreversible" }) !== "allow") return "refused"
  o.records.push({ _tag: "DestinationRetired", actor: o.actor.id, dropped: o.pending })
  return "retired"
}

// ---- S40 event-store: a fact is matched by id and content; a different content under the same id is recorded as a conflict, never dropped
export const recordFact = (stream: Map<string, { digest: string }>, conflicts: unknown[], f: { factId: string; payload: string; version: number }): "recorded" | "already-recorded" | "conflict" => {
  const digest = sha(`${f.version}\n${f.payload}`), have = stream.get(f.factId)
  if (!have) { stream.set(f.factId, { digest }); return "recorded" }
  if (have.digest === digest) return "already-recorded"
  conflicts.push({ _tag: "FactConflict", factId: f.factId, digests: [have.digest, digest] })
  return "conflict"
}

// ---- S41 event-store: the received-fact prefix belongs to the receive paths, and append is asked of the access policy
export const appendAllowed = (a: { stream: string; viaReceive: boolean; ask: (r: { mode: "append"; stream: string }) => boolean }): boolean =>
  (a.stream.startsWith("rx:") ? a.viaReceive : true) && a.ask({ mode: "append", stream: a.stream })

// ---- S42 durable-bus: per-envelope limits, and a received stream name that stays within the stream limit
export const checkEnvelope = (e: { bytes: number; stream: string; annotations: number }, l: { maxEnvelopeBytes: number; maxStreamBytes: number; maxAnnotations: number }): "ok" | "EnvelopeRefused" =>
  e.bytes > l.maxEnvelopeBytes || Buffer.byteLength(e.stream) > l.maxStreamBytes || e.annotations > l.maxAnnotations ? "EnvelopeRefused" : "ok"
/** Origin and stream are percent-encoded, so ":" cannot move between them; the hash form starts "rx:%", which no encoded origin can. */
export const receivedStream = (origin: string, stream: string, max = 256): string => { const n = `rx:${encodeURIComponent(origin)}:${encodeURIComponent(stream)}`; return Buffer.byteLength(n) <= max ? n : `rx:%h:${sha(n).slice(0, 32)}` }

// ---- S45 agent: a failed outcome from an external command reaches the model as one capped untrusted value, and is tainted
export const envelopeFailure = (tag: string, message: string, o: { external: boolean; cap?: number }): { text: string; tainted: boolean } => {
  const cap = o.cap ?? 200, body = message.split("\n")[0]!.slice(0, cap)
  return { text: o.external ? `<untrusted source="error">${tag}: ${body.replace(/[<>]/g, "")}</untrusted>` : `${tag}: ${body}`, tainted: o.external }
}
/** On resume the envelope and taint come from the descriptor the draft's digest names, never from the supplied outcome. */
export const recomputeOnResume = (draftDigest: string, descriptors: ReadonlyMap<string, { external: boolean }>): { tainted: boolean } => ({ tainted: descriptors.get(draftDigest)?.external ?? true })   // unknown descriptor: tainted

// ---- S48 command: the taint floor passes only an approval witness the gate returned, not a ref the caller presented
export type Decision = { _tag: "Allow" } | { _tag: "Allow"; approvedBy: string; approvalId: string } | { _tag: "Refuse" }
export const taintFloor = (tainted: boolean, d: Decision, presentedRef?: string): "run" | "defer" =>
  !tainted ? (d._tag === "Allow" ? "run" : "defer") : "approvedBy" in d && d.approvalId.length > 0 && presentedRef !== undefined && presentedRef === d.approvalId ? "run" : "defer"

// ---- S49 mcp: applying a plan binds its content
export const planDigest = (plan: unknown, resolvedDigests: ReadonlyArray<string>) => sha(JSON.stringify([plan, [...resolvedDigests].sort()]))
export const applyPlan = (stored: { plan: unknown; digests: string[]; proposer: string }, i: { planDigest: string; applier: string }, allowOther: boolean): "apply" | "digest-mismatch" | "not-proposer" =>
  i.planDigest !== planDigest(stored.plan, stored.digests) ? "digest-mismatch" : i.applier !== stored.proposer && !allowOther ? "not-proposer" : "apply"

// ---- S50 mcp and core: plugin error text is scrubbed before it enters a snapshot or a host-tool output
export const scrubFailure = <T extends { failure?: { message: string } }>(s: T, scrub: (m: string) => string): T => s.failure ? { ...s, failure: { ...s.failure, message: scrub(s.failure.message) } } : s

// ---- S51 sequence: an event whose origin, stream origin and series id disagree is quarantined, not recorded in the series
export const acceptSeriesEvent = (e: { envelopeOrigin: string; streamOrigin: string; seriesOrigin: string }): "record" | "quarantine" =>
  e.envelopeOrigin === e.streamOrigin && e.streamOrigin === e.seriesOrigin ? "record" : "quarantine"

// ---- S52 agent: terminal tasks are bounded and erasable; transcripts keep digests unless content is asked for
export const taskStore = (retain: number) => {
  const terminal: Array<{ id: string; session: string }> = []
  return { finish: (t: { id: string; session: string }) => { terminal.push(t); while (terminal.length > retain) terminal.shift() }, purge: (session: string) => { for (let i = terminal.length - 1; i >= 0; i--) if (terminal[i]!.session === session) terminal.splice(i, 1) }, size: () => terminal.length }
}
export const transcriptEntry = (content: string, withContent: boolean) => withContent ? { content } : { digest: sha(content) }

// ---- S53 remote: the peer's package digest must be one the host accepts, and the served actor derives from it
export const servedActor = (claim: { pluginId: string; digest: string }, accepted: ReadonlySet<string>): { id: string } | undefined =>
  accepted.has(claim.digest) ? { id: `remote:${claim.pluginId}@${claim.digest.slice(0, 12)}` } : undefined

// ---- S54 remote: a token ref is long, random and bound to its session, epoch, call and guest
export const mintRef = (random: () => Uint8Array): string => { const b = random(); if (b.length < 16) throw new Error("token ref needs at least 128 bits"); return Buffer.from(b).toString("base64url") }
export const tokenBound = (c: { session: string; epoch: string; callId: string; guest: string }, f: { session: string; epoch: string; parent: string; guest: string }): boolean =>
  c.session === f.session && c.epoch === f.epoch && c.callId === f.parent && c.guest === f.guest

// ---- S55 loader: the accepted record is MAC'd by a host-held key; guest-link grants are a subset of what the signed manifest requested
export const sealAccepted = (key: Uint8Array, r: { digest: string; acceptedAt: number }) => ({ ...r, mac: createHmac("sha256", key).update(`${r.digest}\n${r.acceptedAt}`).digest("hex") })
export const acceptedValid = (key: Uint8Array, r: { digest: string; acceptedAt: number; mac: string }): boolean => {
  const want = Buffer.from(sealAccepted(key, r).mac, "hex"), got = Buffer.from(r.mac, "hex")
  return want.length === got.length && timingSafeEqual(want, got)
}
export const grantsWithin = (granted: ReadonlyArray<string>, requested: ReadonlyArray<string>): { ok: boolean; excess: string[] } => { const excess = granted.filter((g) => !requested.includes(g)); return { ok: excess.length === 0, excess } }

// ---- S43 audit-chain: `origin` and `break` are outside the link hash, so the verifier derives them instead of trusting the link
export const linkMetaOk = (link: { origin?: string; break?: boolean }, derived: { origin?: string; break: boolean }): boolean => link.origin === derived.origin && (link.break ?? false) === derived.break
