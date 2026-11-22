// Minimal remote link admission (remote 02, 06; improvement report 06 S46, S53, S54): the peer is bound to an accepted package digest, token refs are long and
// bound to session, epoch, call and guest, and callbacks per parent are bounded. Framing, deadlines and the session loop are not modelled.
import { mintRef, servedActor, tokenBound } from "./hardening.js"

export const makeRemoteLink = (o: { readonly accepted: ReadonlySet<string>; readonly random: () => Uint8Array; readonly session: string; readonly epoch: string; readonly maxCallbacks: number }) => {
  const tokens = new Map<string, { callId: string; guest: string }>(), callbacks = new Map<string, number>()
  const hello = (claim: { pluginId: string; digest: string }) => servedActor(claim, o.accepted)
  const mint = (callId: string, guest: string) => { const ref = mintRef(o.random); tokens.set(ref, { callId, guest }); return ref }
  const callback = (f: { ref: string; parent: string; guest: string; session: string; epoch: string }): "admitted" | "denied" | "callback-limit" => {
    const t = tokens.get(f.ref)
    if (!t || !tokenBound({ session: o.session, epoch: o.epoch, callId: t.callId, guest: t.guest }, f)) return "denied"
    const n = callbacks.get(f.parent) ?? 0
    if (n >= o.maxCallbacks) return "callback-limit"
    callbacks.set(f.parent, n + 1); return "admitted"
  }
  return { hello, mint, callback }
}
