// Field-encryption codec kernel (keyring BEH-KR-005/006/010..013; improvement report 06 S19-S23). Synchronous and in-memory: the key store, wrapping and the
// outbox are not modelled. Key material and nonces come from two separate sources, injected so tests are deterministic.
import { createCipheriv, createDecipheriv } from "node:crypto"

export class PayloadEncodeFailed extends Error { readonly _tag = "PayloadEncodeFailed"; constructor(readonly reason: string) { super(reason) } }
export class PayloadDecodeFailed extends Error { readonly _tag = "PayloadDecodeFailed"; constructor(readonly reason: string) { super(reason) } }
export class KeyVersionLimit extends Error { readonly _tag = "KeyVersionLimit"; constructor(readonly subject: string) { super(`key versions of ${subject}`) } }
export class SubjectFromEncryptedField extends Error { readonly _tag = "SubjectFromEncryptedField"; constructor(readonly path: string) { super(path) } }

export interface FieldSpec { readonly type: string; readonly version: number; readonly paths: ReadonlyArray<string>; readonly subject: (payload: any) => string | undefined }
interface Encrypted { $encrypted: 1; subject: string; kv: number; n: string; c: string }
interface Shredded { $shredded: 1; subject: string; path: string }
export interface KeyEvent { readonly op: "rotate" | "rewrap"; readonly subject: string; readonly actor: string; readonly reason: string }

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/            // one concrete path: no wildcard, no array index
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url")
const get = (o: any, path: string) => path.split(".").reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o)
const put = (o: any, path: string, v: unknown) => { const ks = path.split("."); let a = o; for (const k of ks.slice(0, -1)) a = a[k]; a[ks.at(-1)!] = v }
const isEncrypted = (v: any): v is Encrypted => v && typeof v === "object" && v.$encrypted === 1 && typeof v.subject === "string" && Number.isInteger(v.kv) && typeof v.n === "string" && typeof v.c === "string"
const isMarker = (v: any, path: string, subject: string): v is Shredded => v && typeof v === "object" && Object.keys(v).sort().join() === "$shredded,path,subject" && v.$shredded === 1 && v.path === path && v.subject === subject
const claimsMarker = (v: any) => v && typeof v === "object" && "$shredded" in v

export const makeKeyring = (o: {
  readonly keySource: () => Uint8Array                       // 32 bytes of key material; NOT the nonce source
  readonly nonceSource: { readonly next: () => Uint8Array; readonly fixed?: boolean }   // 12 bytes
  readonly testHost?: boolean
  readonly maxKeyVersions: number
  readonly maxUsesPerKey: number                             // at most 2^31 for random 96-bit nonces
}) => {
  if (o.nonceSource.fixed && !o.testHost) throw new Error("a fixed NonceSource is refused outside a test host")
  if (o.maxUsesPerKey > 2 ** 31) throw new Error("maxUsesPerKey above 2^31")
  const keys = new Map<string, Uint8Array[]>(), uses = new Map<string, number>(), tomb = new Set<string>(), events: KeyEvent[] = []
  const add = (subject: string) => {
    if (tomb.has(subject)) throw new PayloadEncodeFailed("KeyShredded")                      // a closed subject never gets a new key (INV-KR-003)
    const vs = keys.get(subject) ?? []
    if (vs.length >= o.maxKeyVersions) throw new KeyVersionLimit(subject)
    vs.push(o.keySource()); keys.set(subject, vs); uses.set(subject, 0)
  }
  const rotate = (subject: string, actor: string, reason: string) => { add(subject); events.push({ op: "rotate", subject, actor, reason }) }
  const rewrap = (subject: string, actor: string, reason: string) => { events.push({ op: "rewrap", subject, actor, reason }) }
  const shred = (subject: string) => { tomb.add(subject); keys.delete(subject) }
  const aad = (s: FieldSpec, path: string, subject: string, stream: string) => Buffer.from(`bridger-keyring/v1\n${s.type}\n${s.version}\n${path}\n${subject}\n${stream}`, "utf8")
  /** BEH-KR-013: `subject` must not read a listed path; checked by running it on a copy whose listed paths throw when read. */
  const probe = (s: FieldSpec, payload: any) => {
    const copy = structuredClone(payload)
    for (const p of s.paths) { const ks = p.split("."); let a = copy; for (const k of ks.slice(0, -1)) a = a?.[k]; if (a && typeof a === "object") Object.defineProperty(a, ks.at(-1)!, { get() { throw new SubjectFromEncryptedField(p) }, enumerable: true }) }
    let r: unknown
    try { r = s.subject(copy) } catch (e) { throw e instanceof SubjectFromEncryptedField ? e : new PayloadEncodeFailed("subject function threw") }
    if (typeof r !== "string" || r === "") throw new PayloadEncodeFailed("subject function returned nothing")
    for (const p of s.paths) if (get(payload, p) === r) throw new SubjectFromEncryptedField(p)
    return r
  }
  const encode = (s: FieldSpec, stream: string, payload: any) => {
    try {
      for (const p of s.paths) if (!PATH.test(p)) throw new PayloadEncodeFailed(`path ${p} is not a single concrete path`)
      const subject = probe(s, payload), out = structuredClone(payload)
      for (const path of s.paths) {
        const v = get(payload, path)
        if (v === undefined) continue                                                            // absent stays absent
        if (isMarker(v, path, subject)) continue                                                 // an exact marker is stored as it is, without a key
        if (tomb.has(subject)) throw new PayloadEncodeFailed("KeyShredded")
        let canonical: string
        try { canonical = JSON.stringify(v); if (canonical === undefined || (typeof v === "number" && !Number.isFinite(v))) throw 0 } catch { throw new PayloadEncodeFailed("value cannot be canonicalised") }
        if (!keys.has(subject) || (uses.get(subject) ?? 0) >= o.maxUsesPerKey) { if (keys.has(subject)) events.push({ op: "rotate", subject, actor: "keyring", reason: "usage limit" }); add(subject) }
        const vs = keys.get(subject)!, nonce = o.nonceSource.next()
        const c = createCipheriv("aes-256-gcm", vs.at(-1)!, nonce); c.setAAD(aad(s, path, subject, stream))
        const ct = Buffer.concat([c.update(canonical, "utf8"), c.final(), c.getAuthTag()])
        uses.set(subject, (uses.get(subject) ?? 0) + 1)
        put(out, path, { $encrypted: 1, subject, kv: vs.length - 1, n: b64(nonce), c: b64(ct) } satisfies Encrypted)
      }
      return out
    } catch (e) { throw e instanceof PayloadEncodeFailed || e instanceof SubjectFromEncryptedField ? e : new PayloadEncodeFailed(`encode failed: ${(e as Error).message}`) }   // every failure, defects included, writes nothing
  }
  const decode = (s: FieldSpec, stream: string, payload: any) => {
    const subject = (() => { try { const r = s.subject(payload); if (typeof r === "string" && r) return r } catch { /* below */ } return undefined })()
    const out = structuredClone(payload)
    for (const path of s.paths) {
      const v = get(payload, path)
      if (v === undefined) continue
      if (claimsMarker(v)) {
        if (subject === undefined || !isMarker(v, path, subject)) throw new PayloadDecodeFailed("malformed or foreign Shredded marker"); continue
      }
      if (!isEncrypted(v)) throw new PayloadDecodeFailed("plaintext at a selected path")        // never accepted as stored
      if (subject !== undefined && v.subject !== subject) throw new PayloadDecodeFailed("Encrypted.subject differs from the payload's subject")
      if (tomb.has(v.subject)) { put(out, path, { $shredded: 1, subject: v.subject, path } satisfies Shredded); continue }
      const key = keys.get(v.subject)?.[v.kv]
      if (!key) throw new PayloadDecodeFailed("key absent")
      try {
        const raw = Buffer.from(v.c, "base64url"), d = createDecipheriv("aes-256-gcm", key, Buffer.from(v.n, "base64url"))
        d.setAAD(aad(s, path, v.subject, stream)); d.setAuthTag(raw.subarray(raw.length - 16))
        put(out, path, JSON.parse(Buffer.concat([d.update(raw.subarray(0, raw.length - 16)), d.final()]).toString("utf8")))
      } catch { throw new PayloadDecodeFailed("DecryptFailed") }
    }
    return out
  }
  return { encode, decode, rotate, rewrap, shred, events, uses: (subject: string) => uses.get(subject) ?? 0, versions: (subject: string) => keys.get(subject)?.length ?? 0 }
}
