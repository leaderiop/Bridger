// Minimal MCP host tools (mcp 04; improvement report 06 S49, S50): reconcile-apply binds the stored plan's digest and the proposer, and a snapshot's failure
// message is scrubbed. The server, selectors and client import are not modelled.
import { applyPlan, planDigest, scrubFailure } from "./hardening.js"

export const makeHostTools = (o: { readonly newId: () => string; readonly scrub: (m: string) => string; readonly allowOtherApplier: boolean }) => {
  const plans = new Map<string, { plan: unknown; digests: string[]; proposer: string }>()
  return {
    propose: (proposer: string, plan: unknown, digests: string[]) => { const planId = o.newId(); plans.set(planId, { plan, digests, proposer }); return { planId, planDigest: planDigest(plan, digests) } },
    apply: (i: { planId: string; planDigest: string; applier: string }) => { const s = plans.get(i.planId); return s ? applyPlan(s, i, o.allowOtherApplier) : "unknown-plan" as const },
    snapshot: <T extends { failure?: { message: string } }>(s: T): T => scrubFailure(s, o.scrub)
  }
}
