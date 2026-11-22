// Reference of the @bridger/gxp testing entry point's safety rules (gxp BEH-GX-145..152, IQ-11; improvement report 06 S32-S37). Not the full fixtures:
// a key provider, a signature capture, the fixture-detection of IQ-11 and the executed gate probe.
import { createHash } from "node:crypto"

export interface PortManifest { readonly name: string; readonly fixture?: boolean; readonly commit?: string; readonly custodian?: string; readonly methods?: ReadonlyArray<string> }
const SEED = /^[A-Za-z0-9._-]{1,32}$/
const sha = (s: string) => createHash("sha256").update(s).digest()

/** F6: the id carries a digest of the seed, never the seed, and the seed is not a secret (documented): key bytes are derivable from it. */
export const testKeyProvider = (seed: string) => {
  if (!SEED.test(seed)) throw new Error("seed must match ^[A-Za-z0-9._-]{1,32}$")
  const label = sha(seed).toString("hex").slice(0, 8)
  const key = (n: number) => ({ id: `test:${label}:${n}`, bytes: sha(`bridger-gx/test-key/${seed}/${n}`) })
  return { manifest: { name: "@bridger/gxp/testing/testKeyProvider", fixture: true } as PortManifest, key }
}

/** F3: `decide` is required at runtime too, so a JS caller or a cast cannot get an approve-all capture. */
export const scriptedSignatureCapture = (decide: (r: { ticketId: string }) => { signer: { id: string } } | undefined) => {
  if (typeof decide !== "function") throw new TypeError("scriptedSignatureCapture requires decide")
  let n = 0
  /** BEH-GX-148: the signature echoes the request, method "test-fixture", two components, event "test-fixture:" plus its index. */
  const sign = (r: { ticketId: string }) => { const a = decide(r); return a ? { signer: a.signer, method: "test-fixture", components: 2, event: `test-fixture:${++n}`, ticketId: r.ticketId } : undefined }
  return { manifest: { name: "@bridger/gxp/testing/scriptedSignatureCapture", fixture: true, methods: ["test-fixture"] } as PortManifest, capture: decide, sign }
}

/** BEH-GX-150: building a layer with fixtures logs exactly one warning line that names the fixtures and carries no value. */
export const fixtureWarning = (ports: ReadonlyArray<PortManifest>): string | undefined => {
  const names = ports.filter((m) => iq11([m]).length > 0).map((m) => m.name)
  return names.length ? `warning: test fixtures wired: ${names.join(", ")}` : undefined
}

/** F1: a fixture is recognised by what it is, not by one flag it declares: the name prefix, an in-memory commit, a "test fixture" custodian, a "test-fixture" method. */
export const iq11 = (ports: ReadonlyArray<PortManifest>): ReadonlyArray<{ readonly port: string; readonly why: string }> =>
  ports.flatMap((m) => [
    ...(m.fixture === true ? [{ port: m.name, why: "fixture: true" }] : []),
    ...(m.name.startsWith("@bridger/gxp/testing/") ? [{ port: m.name, why: "testing name prefix" }] : []),
    ...(m.commit === "in-memory" ? [{ port: m.name, why: "in-memory commit" }] : []),
    ...(m.custodian === "test fixture" ? [{ port: m.name, why: "test fixture custodian" }] : []),
    ...((m.methods ?? []).includes("test-fixture") ? [{ port: m.name, why: "test-fixture method" }] : [])])

/** F4: an executed probe, since core's fixtures carry no marker: a synthetic gated request with no ticket must be refused. */
export const gatePosture = (authorize: (r: { operation: string; correlationId: string }) => "allow" | "refuse" | "defer"): { ok: boolean; why?: string } => {
  let out: unknown
  try { out = authorize({ operation: "install", correlationId: "iq-probe-no-ticket" }) } catch { return { ok: true } }      // a gate that throws does not approve
  return out === "allow" ? { ok: false, why: "the wired gate allowed a request that carries no ticket" } : { ok: true }
}
