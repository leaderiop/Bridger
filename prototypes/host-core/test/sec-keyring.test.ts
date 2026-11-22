// Report 06 S19-S23: the field codec fails closed, binds the stream, bounds key use and attributes rotation.
import { describe, expect, it } from "vitest"
import { KeyVersionLimit, PayloadDecodeFailed, PayloadEncodeFailed, SubjectFromEncryptedField, makeKeyring, type FieldSpec } from "../src/keyring.js"

let n = 0
const bytes = (len: number) => () => Uint8Array.from({ length: len }, (_, i) => (++n + i) & 255)
const kr = (o: Partial<Parameters<typeof makeKeyring>[0]> = {}) => makeKeyring({ keySource: bytes(32), nonceSource: { next: bytes(12) }, maxKeyVersions: 3, maxUsesPerKey: 100, ...o })
const spec: FieldSpec = { type: "t", version: 1, paths: ["pii.email"], subject: (p) => p.user }
const ev = { user: "u1", pii: { email: "a@b.c" } }

describe("keyring codec", () => {
  it("round-trips, and decode rejects plaintext at a selected path (S19)", () => {
    const k = kr(), enc = k.encode(spec, "s1", ev)
    expect(JSON.stringify(enc)).not.toContain("a@b.c"); expect(k.decode(spec, "s1", enc)).toEqual(ev)
    expect(() => k.decode(spec, "s1", ev)).toThrow(PayloadDecodeFailed)
  })
  it("a marker must be exact; a malformed one is encrypted at encode and rejected at decode; a subject mismatch fails (S19)", () => {
    const k = kr()
    const bad = { user: "u1", pii: { email: { $shredded: 1, subject: "u1", path: "pii.email", extra: "a@b.c" } } }
    expect(JSON.stringify(k.encode(spec, "s1", bad))).not.toContain("a@b.c")                       // treated as an ordinary value
    const good = { user: "u1", pii: { email: { $shredded: 1, subject: "u1", path: "pii.email" } } }
    expect(k.encode(spec, "s1", good)).toEqual(good)
    expect(() => k.decode(spec, "s1", bad)).toThrow(PayloadDecodeFailed)
    const enc = k.encode(spec, "s1", ev)
    expect(() => k.decode(spec, "s1", { ...enc, user: "u2" })).toThrow(PayloadDecodeFailed)         // Encrypted.subject != payload subject
  })
  it("ciphertext copied to another stream fails to decrypt (S20)", () => {
    const k = kr(), enc = k.encode(spec, "s1", ev)
    expect(() => k.decode(spec, "s2", enc)).toThrow(PayloadDecodeFailed)
  })
  it("encode fails closed for a throwing or empty subject, a wildcard path, an uncanonicalisable value, and a subject that reads a listed path (S21)", () => {
    const k = kr()
    expect(() => k.encode({ ...spec, subject: () => { throw new Error("x") } }, "s", ev)).toThrow(PayloadEncodeFailed)
    expect(() => k.encode({ ...spec, subject: () => undefined }, "s", ev)).toThrow(PayloadEncodeFailed)
    expect(() => k.encode({ ...spec, paths: ["pii.*"] }, "s", ev)).toThrow(PayloadEncodeFailed)
    expect(() => k.encode(spec, "s", { user: "u1", pii: { email: Number.NaN } })).toThrow(PayloadEncodeFailed)
    expect(() => k.encode({ ...spec, subject: (p) => p.pii.email }, "s", ev)).toThrow(SubjectFromEncryptedField)
  })
  it("a shredded subject cannot be encoded again and decodes to a marker", () => {
    const k = kr(), enc = k.encode(spec, "s1", ev); k.shred("u1")
    expect(() => k.encode(spec, "s1", ev)).toThrow(PayloadEncodeFailed)
    expect((k.decode(spec, "s1", enc) as any).pii.email).toEqual({ $shredded: 1, subject: "u1", path: "pii.email" })
  })
  it("a fixed nonce source is refused outside a test host; key use is bounded by auto-rotation (S22)", () => {
    expect(() => kr({ nonceSource: { next: bytes(12), fixed: true } })).toThrow(/fixed/)
    expect(() => kr({ nonceSource: { next: bytes(12), fixed: true }, testHost: true })).not.toThrow()
    const k = kr({ maxUsesPerKey: 2 })
    for (let i = 0; i < 5; i++) k.encode(spec, "s", ev)
    expect(k.versions("u1")).toBe(3); expect(k.events.filter((e) => e.reason === "usage limit")).toHaveLength(2)
    expect(() => { for (let i = 0; i < 3; i++) k.encode(spec, "s", ev) }).toThrow(PayloadEncodeFailed)   // a version cap on auto-rotation surfaces as an encode failure
  })
  it("rotate and rewrap carry an actor and reason into a key event; versions are capped (S23)", () => {
    const k = kr({ maxKeyVersions: 2 })
    k.rotate("u1", "ops:alice", "scheduled"); k.rotate("u1", "ops:alice", "again"); k.rewrap("u1", "ops:bob", "kek change")
    expect(k.events).toEqual([{ op: "rotate", subject: "u1", actor: "ops:alice", reason: "scheduled" }, { op: "rotate", subject: "u1", actor: "ops:alice", reason: "again" }, { op: "rewrap", subject: "u1", actor: "ops:bob", reason: "kek change" }])
    expect(() => k.rotate("u1", "ops:alice", "third")).toThrow(KeyVersionLimit)
  })
  it("a shredded subject cannot be rotated into a new key (S57)", () => {
    const k = kr(); k.rotate("u1", "ops", "r"); k.shred("u1")
    expect(() => k.rotate("u1", "ops", "again")).toThrow(PayloadEncodeFailed); expect(k.versions("u1")).toBe(0)
  })
})
