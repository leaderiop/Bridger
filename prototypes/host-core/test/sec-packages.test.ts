// Minimal agent, MCP host tools, remote link and loader admission apply S45, S49-S50, S52-S55 end to end.
import { describe, expect, it } from "vitest"
import { makeAgent } from "../src/agent.js"
import { makeAdmission } from "../src/loader-admission.js"
import { makeHostTools } from "../src/mcp-host-tools.js"
import { makeRemoteLink } from "../src/remote-link.js"

describe("agent", () => {
  it("resume ignores the supplied taint, an unknown draft is tainted, terminal tasks are bounded and purgeable, transcripts hold digests", () => {
    const a = makeAgent({ descriptors: new Map([["d1", { external: false }], ["d2", { external: true }]]), retain: 2, content: false })
    expect(a.resume("d1", { output: "secret", tainted: true }).tainted).toBe(false); expect(a.resume("d2", { output: "x", tainted: false }).tainted).toBe(true); expect(a.resume("zz", { output: "y" }).tainted).toBe(true)
    expect(JSON.stringify(a.transcript())).not.toContain("secret")
    for (const i of [1, 2, 3]) a.finishTask({ id: `t${i}`, session: "s" }); expect(a.retained()).toBe(2); a.purge("s"); expect(a.retained()).toBe(0)
  })
})
describe("mcp host tools", () => {
  it("apply needs the plan's digest and the proposer, and a snapshot message is scrubbed", () => {
    let n = 0; const t = makeHostTools({ newId: () => `p${++n}`, scrub: () => "failed", allowOtherApplier: false })
    const p = t.propose("alice", { add: ["a"] }, ["d1"])
    expect(t.apply({ planId: p.planId, planDigest: "x", applier: "alice" })).toBe("digest-mismatch"); expect(t.apply({ planId: p.planId, planDigest: p.planDigest, applier: "bob" })).toBe("not-proposer")
    expect(t.apply({ planId: p.planId, planDigest: p.planDigest, applier: "alice" })).toBe("apply"); expect(t.apply({ planId: "nope", planDigest: p.planDigest, applier: "alice" })).toBe("unknown-plan")
    expect(t.snapshot({ failure: { message: "pw=s3cret" } }).failure!.message).toBe("failed")
  })
})
describe("remote link", () => {
  const link = () => { let n = 0; return makeRemoteLink({ accepted: new Set(["sha256:good"]), random: () => new Uint8Array(16).fill(++n), session: "s", epoch: "e", maxCallbacks: 1 }) }
  it("an unaccepted peer gets no actor; a token is bound to its guest and the callbacks per parent are bounded", () => {
    const l = link()
    expect(l.hello({ pluginId: "p", digest: "sha256:bad" })).toBeUndefined(); expect(l.hello({ pluginId: "p", digest: "sha256:good" })?.id).toMatch(/^remote:p@/)
    const ref = l.mint("call-1", "guest-a")
    expect(l.callback({ ref, parent: "call-1", guest: "guest-b", session: "s", epoch: "e" })).toBe("denied"); expect(l.callback({ ref, parent: "call-2", guest: "guest-a", session: "s", epoch: "e" })).toBe("denied")
    expect(l.callback({ ref, parent: "call-1", guest: "guest-a", session: "s", epoch: "e" })).toBe("admitted"); expect(l.callback({ ref, parent: "call-1", guest: "guest-a", session: "s", epoch: "e" })).toBe("callback-limit")
    expect(l.callback({ ref: "guess", parent: "call-1", guest: "guest-a", session: "s", epoch: "e" })).toBe("denied")
  })
})
describe("loader admission", () => {
  it("a backdated accepted record is treated as absent and excess grants are reported", () => {
    const a = makeAdmission(new Uint8Array(32).fill(3)), r = a.seal({ digest: "d", acceptedAt: 100 })
    expect(a.acceptedAt(r)).toBe(100); expect(a.acceptedAt({ ...r, acceptedAt: 1 })).toBeUndefined()
    expect(a.link(["net", "fs"], ["net"])).toEqual({ ok: false, excess: ["fs"] })
  })
})
