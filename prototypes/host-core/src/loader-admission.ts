// Minimal loader admission (loader 08, 09; improvement report 06 S55): reverify trusts an accepted record only when its MAC holds, and a guest link's grants must be
// within what the signed manifest requested. Package verification and the catalog are not modelled.
import { acceptedValid, grantsWithin, sealAccepted } from "./hardening.js"

export const makeAdmission = (key: Uint8Array) => ({
  seal: (r: { digest: string; acceptedAt: number; policyDigest?: string; revocationEpoch?: number }) => sealAccepted(key, r),
  /** A record whose MAC fails is absent: reverify then has no acceptedAt and must verify now. */
  acceptedAt: (r: { digest: string; acceptedAt: number; mac: string; policyDigest?: string; revocationEpoch?: number }): number | undefined => acceptedValid(key, r) ? r.acceptedAt : undefined,
  link: (granted: string[], requested: string[]) => grantsWithin(granted, requested)
})
