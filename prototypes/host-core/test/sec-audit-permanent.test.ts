// Report 06 S15: a record the sink will never accept does not wedge the writer: a stub with the same recordId and auditSeq is written once (BEH-BR-202).
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { AuditSink, AuditWriteFailed, type AuditRecord } from "../src/gxp.js"
import { define, type AnyPlugin } from "../src/plugin.js"
import { Layer } from "effect"
import { drive, idle, withHost } from "./fixtures.js"
import { as, settleWriter } from "./p4fixtures.js"
import * as Testing from "../src/testing.js"

const p = (id: string) => define({ id, requires: [] as const, provides: [] as const, build: Layer.empty as never }) as unknown as AnyPlugin
describe("a permanent sink refusal", () => {
  it("writes a stub with the same recordId and auditSeq, then carries on in order", async () => {
    const stored: AuditRecord[] = []
    const sink = { record: (r: AuditRecord) => (r.target?.id === "poison" && (r as { error?: { _tag?: string } }).error?._tag !== "UnrepresentableRecord" ? Effect.fail(new AuditWriteFailed({ message: "bad bytes", permanent: true })) : Effect.sync(() => { stored.push(r) })) } as never
    await withHost((host) => Effect.gen(function* () {
      yield* drive(host, host.install(p("poison"), as("secret reason"))); yield* drive(host, host.install(p("after"), as())); yield* idle(host); yield* settleWriter
      yield* Effect.yieldNow
      const seqs = stored.map((r) => r.auditSeq)
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b)); expect(new Set(seqs).size).toBe(seqs.length)
      expect(seqs).toEqual(Array.from({ length: seqs.length }, (_, i) => i + 1))              // no gap
      const stubs = stored.filter((r) => (r as { error?: { _tag?: string } }).error?._tag === "UnrepresentableRecord")
      expect(stubs.length).toBeGreaterThan(0); expect(stubs.every((r) => r.target?.id === "poison" && r.reason === undefined)).toBe(true)
      expect(stored.some((r) => r.target?.id === "after")).toBe(true)
    }), { auditTimeout: 50 }, Layer.mergeAll(Testing.counterIdGenerator("id-"), Layer.succeed(AuditSink, sink)))
  })
})
