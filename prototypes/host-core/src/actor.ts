// Actor.narrow and Actor.isWithin (references/core behaviour 33, BEH-BR-337). Pure. Prototype.
import type { Actor as ActorT } from "./gxp.js"

export const narrow = (parent: ActorT, segment: string, display?: string): ActorT => {
  if (typeof segment !== "string" || segment === "" || segment.includes("/")) throw new Error("Actor.narrow: segment is empty or contains /")
  if (parent.id.startsWith("bridger:")) throw new Error("Actor.narrow: reserved actors cannot be narrowed")
  return { id: `${parent.id}/${segment}`, kind: "service", ...(display !== undefined ? { display } : {}) } as ActorT
}
export const isWithin = (actor: ActorT, ancestor: ActorT): boolean => actor.id === ancestor.id || actor.id.startsWith(`${ancestor.id}/`)
