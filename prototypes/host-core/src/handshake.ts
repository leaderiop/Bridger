// Contract checks of the two boundary handshakes, over the core comparison of BEH-BR-228 (clause 3b included):
// remote's `welcome` (remote BEH-RM-009, 011, 033) and federation's offered exports (federation BEH-FD-018, 020).
// Pure: the transports that carry the frames are not in this prototype.
import type { ContractDescriptor } from "./contract.js"
import { incompatibility, parseVersion } from "./contract.js"

/** What a `hello` names about its contract, and what a `welcome` or an offered export answers with. */
export interface WireSide { readonly version: string; readonly methods?: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] }
/** `IncompatibleContract`'s content as a handshake reports it (a cause, never thrown here). */
export interface Mismatch { readonly provided?: string; readonly missingMethods: ReadonlyArray<string>; readonly mismatchedMethods: ReadonlyArray<string> }

/**
 * The link's side of BEH-RM-011: accept a `welcome` only when its version lies inside `accepts` and no method both ends
 * name has a different schema digest. A side without `schemas` is judged by version alone.
 */
export const welcomeCheck = (hello: WireSide & { readonly accepts: string }, welcome: WireSide): Mismatch | undefined => {
  if (!parseVersion(welcome.version)) return { provided: welcome.version, missingMethods: [], mismatchedMethods: [] }
  const methods = hello.methods ?? hello.schemas?.map((x) => x.method) ?? []
  return incompatibility(
    { version: hello.version, range: hello.accepts, methods, ...(hello.schemas ? { schemas: hello.schemas } : {}) },
    { version: welcome.version, methods: welcome.methods ?? [...methods], ...(welcome.schemas ? { schemas: welcome.schemas } : {}) })
}

export type ImportVerdict =
  | { readonly accepted: true; readonly version: string }
  | { readonly accepted: false; readonly reason: "no-export" | "unavailable" | "incompatible-contract"; readonly cause?: Mismatch }

/**
 * The importing end of BEH-FD-020 for one import (key, major, version V): accepted only when the peer offers that key and
 * major at a version satisfying `"^" + V` whose method digests match. The handshake never chooses a major.
 */
export const importCheck = (
  imp: { readonly key: string; readonly version: string; readonly methods?: ReadonlyArray<string>; readonly schemas?: ContractDescriptor["schemas"] },
  offered: ReadonlyArray<{ readonly key: string; readonly major: number; readonly version?: string; readonly schemas?: ContractDescriptor["schemas"] }>
): ImportVerdict => {
  const V = parseVersion(imp.version)
  const same = offered.filter((e) => e.key === imp.key && V !== undefined && e.major === V[0])
  if (same.length === 0) return { accepted: false, reason: "no-export" }
  const e = same[0]!
  if (e.version === undefined) return { accepted: false, reason: "unavailable" }
  const bad = welcomeCheck({ version: imp.version, accepts: "^" + imp.version, ...(imp.methods ? { methods: imp.methods } : {}), ...(imp.schemas ? { schemas: imp.schemas } : {}) },
    { version: e.version, ...(e.schemas ? { methods: e.schemas.map((x) => x.method), schemas: e.schemas } : {}) })
  return bad ? { accepted: false, reason: "incompatible-contract", cause: bad } : { accepted: true, version: e.version }
}
