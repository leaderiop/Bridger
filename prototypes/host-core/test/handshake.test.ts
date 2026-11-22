// Report 02 R1: the digest rule at the remote and federation boundaries (remote BEH-RM-009/011, federation BEH-FD-018/020).
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { guestAnswer, importCheck, loadRefusal, welcomeCheck } from "../src/handshake.js"
import { plainKeyProblems, type PluginManifest } from "../src/manifest.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const Text = Schema.Struct({ text: Schema.String })
const Rich = Schema.Struct({ text: Schema.String, mood: Schema.String })
const make = (version: string, payload: Schema.Top) => Contract.make(Board, { version, methods: { post: Contract.method({ payload, success: Schema.String }) } }).descriptor
const side = (d: ReturnType<typeof make>) => ({ version: d.version, methods: d.methods, schemas: d.schemas })

describe("remote welcome (BEH-RM-011)", () => {
  const hello = { ...side(make("1.2.0", Text)), accepts: "^1.2" }
  it("accepts a compatible version with equal digests", () => {
    expect(welcomeCheck(hello, side(make("1.3.0", Text)))).toBeUndefined()
  })
  it("refuses a compatible version whose method digest differs, naming the method", () => {
    expect(welcomeCheck(hello, side(make("1.3.0", Rich)))).toMatchObject({ mismatchedMethods: ["post"], provided: "1.3.0" })
  })
  it("refuses a version outside accepts and ignores digests then", () => {
    expect(welcomeCheck(hello, side(make("2.0.0", Rich)))).toMatchObject({ provided: "2.0.0", mismatchedMethods: [] })
  })
  it("refuses a welcome whose version does not parse, without throwing", () => {
    expect(welcomeCheck(hello, { version: "banana" })).toMatchObject({ provided: "banana", missingMethods: [], mismatchedMethods: [] })
  })
  it("judges a welcome without schemas by version alone", () => {
    expect(welcomeCheck(hello, { version: "1.3.0" })).toBeUndefined()
  })
})

describe("federation import (BEH-FD-020)", () => {
  const imp = { key: "example/Board@1", ...side(make("1.2.0", Text)) }
  const offer = (d: ReturnType<typeof make>, extra = {}) => ({ key: "example/Board@1", major: 1, version: d.version, schemas: d.schemas, ...extra })
  it("accepts an export of the same major, a satisfying version and equal digests", () => {
    expect(importCheck(imp, [offer(make("1.4.0", Text))])).toEqual({ accepted: true, version: "1.4.0" })
  })
  it("refuses a digest mismatch with incompatible-contract and the method", () => {
    expect(importCheck(imp, [offer(make("1.4.0", Rich))])).toMatchObject({ accepted: false, reason: "incompatible-contract", cause: { mismatchedMethods: ["post"] } })
  })
  it("refuses a lower minor, no export of the major, and an unavailable export", () => {
    expect(importCheck(imp, [offer(make("1.1.0", Text))])).toMatchObject({ accepted: false, reason: "incompatible-contract" })
    expect(importCheck(imp, [offer(make("2.0.0", Text), { major: 2 })])).toEqual({ accepted: false, reason: "no-export" })
    expect(importCheck(imp, [{ key: "example/Board@1", major: 1 }])).toEqual({ accepted: false, reason: "unavailable" })
  })
  it("never picks another major: two majors are two imports", () => {
    expect(importCheck({ ...imp, ...side(make("2.0.0", Text)) }, [offer(make("1.4.0", Text))])).toEqual({ accepted: false, reason: "no-export" })
  })
})

describe("guest and loader (remote BEH-RM-033, loader BEH-LD-014)", () => {
  const hello = { ...side(make("1.2.0", Text)), accepts: "^1.2" }
  it("the guest answers with the highest served version inside the range whose digests agree", () => {
    const served = [side(make("1.2.0", Text)), side(make("1.4.0", Text)), side(make("1.5.0", Rich)), side(make("2.0.0", Text))]
    expect(guestAnswer(hello, served)).toMatchObject({ t: "welcome", version: "1.4.0" })       // 1.5.0 changed `post`, 2.0.0 is outside
  })
  it("the guest refuses with incompatible-contract when no served version fits", () => {
    expect(guestAnswer(hello, [side(make("1.5.0", Rich))])).toMatchObject({ t: "refuse", reason: "incompatible-contract", cause: { mismatchedMethods: ["post"] } })
    expect(guestAnswer(hello, [side(make("2.0.0", Text))])).toMatchObject({ t: "refuse", cause: { provided: "2.0.0" } })
  })
  it("the link accepts what the guest answered", () => {
    const a = guestAnswer(hello, [side(make("1.3.0", Text))])
    expect(a.t === "welcome" && welcomeCheck(hello, { version: a.version, ...(a.schemas ? { schemas: a.schemas } : {}) })).toBeUndefined()
  })
  it("the loader refuses a manifest with a plain key not marked internal, naming the path, and loads a clean one", () => {
    const m = (requires: unknown) => ({ manifestVersion: 1, id: "p", version: "1.0.0", provides: [], requires }) as PluginManifest
    expect(loadRefusal(plainKeyProblems(m([{ serviceId: "example/Db", internal: true }, { serviceId: "example/Cache" }])))).toEqual({ _tag: "PackageRefused", predicate: "plain-cross-boundary-key", reason: "requires[1]" })
    expect(loadRefusal(plainKeyProblems(m([{ serviceId: "example/Db", internal: true }])))).toBeUndefined()
  })
})
