// Mount-time entitlement policy (entitlement BEH-EN-009; improvement report 06 S24): a child's mount is a grant core does not gate, so this is the hook.
import type { Options } from "./host.js"

export const childMountPolicy = (o: {
  readonly childSubject: "own" | "parent" | "none"
  readonly entitled: (subject: string) => boolean
}): NonNullable<Options["mountPolicy"]> => (m) => {
  if (o.childSubject === "none") return { deny: "entitlement: children not licensed" }
  return o.entitled(o.childSubject === "parent" ? m.parent.id : m.child.id) ? "allow" : { deny: `entitlement: ${m.child.id} not entitled` }
}
