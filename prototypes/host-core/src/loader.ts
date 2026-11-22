// The loader companion's kernel (references/loader behaviours 01, 03, 07): the package digest, the statement and its signing input, the Ed25519
// verifier, the N-of-M policy and the publisher binding. Prototype: no fetch, no load pipeline, no LoadLog; this is what the kit's `pack`, `publish`
// and `countersign` call so that the kit implements no digest of its own (BEH-KT-029).
import { createHash, createPublicKey, verify as edVerify } from "node:crypto"
import { Effect } from "effect"

export type Bytes = Uint8Array
const utf8 = (s: string): Bytes => new TextEncoder().encode(s)
const hex = (b: Bytes): string => Buffer.from(b).toString("hex")
const H = (...parts: ReadonlyArray<Bytes>): string => { const h = createHash("sha256"); for (const p of parts) h.update(p); return "sha256:" + h.digest("hex") }
export const b64u = (b: Bytes): string => Buffer.from(b).toString("base64url")
export const fromB64u = (s: string): Bytes => new Uint8Array(Buffer.from(s, "base64url"))

export class PackageMalformed extends Error { readonly _tag = "PackageMalformed"; constructor(readonly part: string, readonly reason: string) { super(`package malformed (${part}): ${reason}`) } }
export class UnsupportedDigestAlgorithm extends Error { readonly _tag = "UnsupportedDigestAlgorithm"; constructor(readonly algorithm: string) { super(`unsupported digest algorithm ${algorithm}`) } }
export class SigningFailed extends Error { readonly _tag = "SigningFailed"; constructor(readonly scheme: string, message: string) { super(message) } }
export class SignatureRejected extends Error { readonly _tag = "SignatureRejected"
  constructor(readonly digest: string, readonly policyId: string, readonly statementType: string, readonly reason: "unsatisfied" | "policy-invalid", readonly verified: ReadonlyArray<string>, readonly ignored: number, readonly missing: string) { super(`signature rejected: ${missing}`) }
}
export class PublisherMismatch extends Error { readonly _tag = "PublisherMismatch"; constructor(readonly statementType: string, readonly digest: string, readonly publisher: string, readonly signers: ReadonlyArray<string>) { super(`no verified signer may vouch for publisher ${publisher}`) } }
export class StatementRevoked extends Error { readonly _tag = "StatementRevoked"; constructor(readonly digest: string) { super(`statement revoked: ${digest}`) } }

// ---------------------------------------------------------------------------------------------- the package and its digest (BEH-LD-001, 002, 003)
export interface Package { readonly manifest: Bytes; readonly sbom: { readonly format: string; readonly bytes: Bytes }; readonly files: ReadonlyMap<string, Bytes> }

/** BEH-LD-001: relative, "/"-separated, normalised paths; no two equal after NFC. */
export const checkPaths = (paths: Iterable<string>): void => {
  const seen = new Set<string>()
  for (const p of paths) {
    if (p === "" || p.startsWith("/") || p.includes("\\") || p.split("/").some((s) => s === "" || s === "." || s === "..")) throw new PackageMalformed("path", `${JSON.stringify(p)} is not a relative, normalised path`)
    const n = p.normalize("NFC"); if (seen.has(n)) throw new PackageMalformed("path", `${JSON.stringify(p)} collides with another path after normalisation`); seen.add(n)
  }
}
export const manifestDigest = (p: Package): string => H(p.manifest)
export const sbomDigest = (p: Package): string => H(utf8(p.sbom.format), Uint8Array.of(0), p.sbom.bytes)
export const filesDigest = (p: Package): string => {
  const entries = [...p.files].map(([path, content]) => [utf8(path), content] as const).sort((a, b) => Buffer.compare(a[0], b[0]))
  return H(...entries.flatMap(([path, content]) => [path, Uint8Array.of(0), utf8(H(content)), Uint8Array.of(10)]))
}
/** BEH-LD-002: the digest commits to the three sub-digests; a pure function of the bytes. */
export const packageDigest = (p: Package): string => {
  if (p.files.size === 0) throw new PackageMalformed("files", "a package has at least one file")
  checkPaths(p.files.keys())
  return H(utf8("bridger-package-v1"), Uint8Array.of(10), utf8(manifestDigest(p)), Uint8Array.of(10), utf8(sbomDigest(p)), Uint8Array.of(10), utf8(filesDigest(p)), Uint8Array.of(10))
}
/** BEH-LD-003: a digest names its algorithm; only sha256 is supported. */
export const digestAlgorithm = (digest: string): "sha256" => { const a = digest.split(":")[0]!; if (a !== "sha256") throw new UnsupportedDigestAlgorithm(a); return "sha256" }

// ---------------------------------------------------------------------------------------------- statements (BEH-LD-049, 054)
export type StatementType = "package" | "first-party" | "host-manifest" | "data-pack" | "licence" | "revocation-list" | "chain-bundle" | (string & {})
export interface Statement { readonly type: "bridger-statement-v1"; readonly statementType: StatementType; readonly subject: { readonly digest: string }; readonly id?: string; readonly version?: string }
export interface Signature { readonly scheme: string; readonly keyHint?: string; readonly bytes: Bytes }
const PAYLOAD_TYPE = "application/vnd.bridger.statement+json"
/** RFC 8785 for a flat object of strings: keys sorted by code unit, no whitespace. */
const jcs = (o: Readonly<Record<string, unknown>>): string => "{" + Object.keys(o).sort().map((k) => o[k] === undefined ? "" : JSON.stringify(k) + ":" + (typeof o[k] === "object" ? jcs(o[k] as Record<string, unknown>) : JSON.stringify(o[k]))).filter((x) => x !== "").join(",") + "}"

export const Statement = {
  make: (request: { readonly statementType: StatementType; readonly subject: { readonly digest: string } | { readonly bytes: Bytes }; readonly id?: string; readonly version?: string }): Statement => {
    const digest = "digest" in request.subject ? request.subject.digest : H(request.subject.bytes)
    digestAlgorithm(digest)
    return { type: "bridger-statement-v1", statementType: request.statementType, subject: { digest }, ...(request.id !== undefined ? { id: request.id } : {}), ...(request.version !== undefined ? { version: request.version } : {}) }
  },
  /** The DSSE pre-authentication encoding of the payload type and the canonical statement. */
  signingInput: (s: Statement): Bytes => { const body = utf8(jcs(s as never)); return Buffer.concat([utf8(`DSSEv1 ${utf8(PAYLOAD_TYPE).length} ${PAYLOAD_TYPE} ${body.length} `), body]) },
  digest: (s: Statement): string => H(utf8(jcs(s as never)))
}

/** The port: whoever signs wires an adapter (a KMS, a token). The kit hands over the signing input and receives a Signature; it never sees a key. */
export interface StatementSigner { readonly scheme: string; readonly sign: (signingInput: Bytes) => Effect.Effect<Signature, SigningFailed> }

// ---------------------------------------------------------------------------------------------- policy (BEH-LD-018..021, 053)
export interface TrustedSigner { readonly id: string; readonly scheme: string; readonly key: string; readonly roles: ReadonlyArray<string>; readonly publishers?: ReadonlyArray<string> }
export type Requirement = { readonly threshold: number } | { readonly role: string; readonly threshold: number } | { readonly allOf: ReadonlyArray<Requirement> }
export interface SignaturePolicy { readonly id: string; readonly signers: ReadonlyArray<TrustedSigner>; readonly require: Requirement }
export interface VerifiedSigner { readonly signerId: string; readonly identity: string; readonly scheme: string; readonly roles: ReadonlyArray<string> }
export interface Revocations { readonly issuedAt?: string; readonly digests?: ReadonlyArray<string>; readonly identities?: ReadonlyArray<string> }

const SPKI = Buffer.from("302a300506032b6570032100", "hex")
/** The scheme-defined identity of an Ed25519 key: "ed25519:sha256:<hex of the raw public key>" (BEH-LD-019). */
export const ed25519Identity = (rawKeyB64: string): string => "ed25519:sha256:" + hex(createHash("sha256").update(Buffer.from(rawKeyB64, "base64")).digest())
const ed25519Verifies = (input: Bytes, sig: Signature, t: TrustedSigner): boolean => {
  try { return edVerify(null, input, createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(t.key, "base64")]), format: "der", type: "spki" }), sig.bytes) } catch { return false }
}

export const checkPolicy = (policy: SignaturePolicy): void => {
  const ids = new Set<string>(), keys = new Set<string>()
  for (const s of policy.signers) {
    if (ids.has(s.id) || keys.has(s.scheme + s.key)) throw new SignatureRejected("", policy.id, "", "policy-invalid", [], 0, `signer ${s.id}: an id or a key appears twice`)
    ids.add(s.id); keys.add(s.scheme + s.key)
  }
}

const leaves = (r: Requirement): ReadonlyArray<{ readonly role?: string; readonly threshold: number }> => "allOf" in r ? r.allOf.flatMap(leaves) : [r]
const combos = <T>(xs: ReadonlyArray<T>, k: number): ReadonlyArray<ReadonlyArray<T>> => k === 0 ? [[]] : xs.length < k ? [] : [...combos(xs.slice(1), k - 1).map((c) => [xs[0]!, ...c]), ...combos(xs.slice(1), k)]
/** The largest prefix of the leaves that an assignment of distinct signers meets (BEH-LD-020: no signer counts twice across branches). */
const placed = (ls: ReturnType<typeof leaves>, signers: ReadonlyArray<VerifiedSigner>): number => {
  const go = (i: number, used: ReadonlySet<string>): number => {
    if (i === ls.length) return i
    const l = ls[i]!
    let best = i
    for (const c of combos(signers.filter((s) => !used.has(s.signerId) && (l.role === undefined || s.roles.includes(l.role))), l.threshold)) best = Math.max(best, go(i + 1, new Set([...used, ...c.map((s) => s.signerId)])))
    return best
  }
  return go(0, new Set())
}

export interface Verification { readonly digest: string; readonly statementDigest: string; readonly policyId: string; readonly verified: ReadonlyArray<VerifiedSigner>; readonly ignored: number; readonly satisfied: boolean; readonly missing: string; readonly publisherBound?: boolean }

/** BEH-LD-050 in the order the spec gives: build the statement, verify each signature, evaluate the rule, bind the publisher, check revocation. A pure function. */
export const verifyStatement = (request: { readonly statement: Statement; readonly signatures: ReadonlyArray<Signature>; readonly policy: SignaturePolicy; readonly publisher?: string; readonly revocations?: Revocations }): Verification => {
  const { statement: s, policy } = request
  checkPolicy(policy)
  const input = Statement.signingInput(s)
  const verified = new Map<string, VerifiedSigner>()
  let ignored = 0
  for (const sig of request.signatures) {
    const matches = policy.signers.filter((t) => t.scheme === sig.scheme && t.scheme === "ed25519" && ed25519Verifies(input, sig, t))
    if (matches.length !== 1) { ignored++; continue }
    const t = matches[0]!
    verified.set(t.id, { signerId: t.id, identity: ed25519Identity(t.key), scheme: t.scheme, roles: t.roles })   // two signatures by one signer entry count once
  }
  if (request.revocations?.digests?.includes(s.subject.digest)) throw new StatementRevoked(s.subject.digest)
  const live = [...verified.values()].filter((v) => !request.revocations?.identities?.includes(v.identity))
  const ls = leaves(policy.require)
  const n = placed(ls, live)
  const satisfied = n === ls.length
  const l = ls[n]
  const missing = satisfied ? "" : `needs ${l!.threshold} signer${l!.threshold === 1 ? "" : "s"}${l!.role ? ` with role ${l!.role}` : ""}`
  let publisherBound: boolean | undefined
  if (satisfied && request.publisher !== undefined) {
    const p = request.publisher.normalize("NFC")
    publisherBound = live.some((v) => { const t = policy.signers.find((x) => x.id === v.signerId)!; return (t.publishers ?? []).some((x) => x.normalize("NFC") === p) || v.identity.normalize("NFC") === p })
    if (!publisherBound) throw new PublisherMismatch(s.statementType, s.subject.digest, request.publisher, live.map((v) => v.signerId))
  }
  return { digest: s.subject.digest, statementDigest: Statement.digest(s), policyId: policy.id, verified: live, ignored, satisfied, missing, ...(publisherBound !== undefined ? { publisherBound } : {}) }
}

// ---------------------------------------------------------------------------------------------- data packs (BEH-LD-057, 058)
export interface DataPackManifest {
  readonly dataPackVersion: 1; readonly id: string; readonly version: string; readonly schemaId: string; readonly mediaType: string
  readonly issuedAt: string; readonly effectiveFrom: string; readonly effectiveUntil?: string; readonly maxAge: string; readonly publisher?: string; readonly description?: string
}
export interface DataPack { readonly manifestBytes: Bytes; readonly payload: Bytes }
const PLUGIN_FIELDS = ["provides", "requires", "optional", "activation", "contributions", "listens", "files", "entry", "sbom", "manifestVersion"]
/** BEH-LD-057: the shape (no plugin fields), the dates and `maxAge` are checked; a pack that breaks a rule is refused with PackageMalformed. */
export const decodeDataPackManifest = (bytes: Bytes): DataPackManifest => {
  let m: Record<string, unknown>
  try { m = JSON.parse(Buffer.from(bytes).toString("utf8")) } catch { throw new PackageMalformed("data-pack-manifest", "not JSON") }
  const bad = PLUGIN_FIELDS.find((f) => f in m); if (bad) throw new PackageMalformed("data-pack-shape", `field ${bad} belongs to a plugin manifest`)
  for (const f of ["id", "version", "schemaId", "mediaType", "issuedAt", "effectiveFrom", "maxAge"]) if (typeof m[f] !== "string" || m[f] === "") throw new PackageMalformed("data-pack-manifest", `${f} is required`)
  if (m.dataPackVersion !== 1) throw new PackageMalformed("data-pack-manifest", "dataPackVersion must be 1")
  const t = (f: string) => Date.parse(String(m[f]))
  for (const f of ["issuedAt", "effectiveFrom", ...(m.effectiveUntil !== undefined ? ["effectiveUntil"] : [])]) if (Number.isNaN(t(f))) throw new PackageMalformed("data-pack-manifest", `${f} is not a date`)
  if (m.effectiveUntil !== undefined && !(t("effectiveFrom") < t("effectiveUntil"))) throw new PackageMalformed("data-pack-manifest", "effectiveFrom must be earlier than effectiveUntil")
  if (m.effectiveUntil !== undefined && t("issuedAt") > t("effectiveUntil")) throw new PackageMalformed("data-pack-manifest", "issuedAt must not be later than effectiveUntil")
  if (m.maxAge !== "unbounded" && !/^[1-9]\d*\s+(second|minute|hour|day|week)s?$/.test(String(m.maxAge))) throw new PackageMalformed("data-pack-manifest", "maxAge is a positive duration or `unbounded`")
  return m as unknown as DataPackManifest
}
/** BEH-LD-058: the digest commits to the manifest bytes as published and to the payload under its media type; its domain string differs from the package's. */
export const dataPackDigest = (p: DataPack): string => {
  const m = decodeDataPackManifest(p.manifestBytes)
  return H(utf8("bridger-data-pack-v1"), Uint8Array.of(10), utf8(H(p.manifestBytes)), Uint8Array.of(10), utf8(H(utf8(m.mediaType), Uint8Array.of(0), p.payload)), Uint8Array.of(10))
}

// ---------------------------------------------------------------------------------------------- signed revocation lists (BEH-LD-026)
export interface RevocationList { readonly issuer: string; readonly revision: number; readonly issuedAt: string; readonly digests?: ReadonlyArray<string>; readonly identities?: ReadonlyArray<string> }
export interface SignedRevocationList { readonly statementType: "revocation-list"; readonly id: string; readonly version: string; readonly payload: Bytes; readonly signatures: ReadonlyArray<Signature> }
/** The source answers `Rejected` with a reason (BEH-LD-026); it is a result, not a catalog error. */
export class RevocationRejected extends Error { constructor(readonly reason: "wrong-issuer" | "envelope-mismatch" | "no-trust-root" | "not-newer", message: string) { super(message) } }
/** The checks in the spec's order, before the payload is decoded: envelope type and issuer, the signatures against the trust root over `{ bytes: payload }`, then the decoded issuer and revision against the envelope. */
export const verifyRevocationList = (env: SignedRevocationList, o: { readonly issuer: string; readonly trustRoot: SignaturePolicy; readonly heldRevision?: number }): RevocationList => {
  if (env.statementType !== "revocation-list") throw new RevocationRejected("envelope-mismatch", "the envelope is not a revocation list")
  if (env.id !== o.issuer) throw new RevocationRejected("wrong-issuer", `the list names issuer ${env.id}, not the configured one`)
  const v = verifyStatement({ statement: Statement.make({ statementType: "revocation-list", subject: { bytes: env.payload }, id: env.id, version: env.version }), signatures: env.signatures, policy: o.trustRoot })
  if (!v.satisfied) throw new RevocationRejected("no-trust-root", `the signatures do not satisfy the revocation trust root: ${v.missing}`)
  const list = JSON.parse(Buffer.from(env.payload).toString("utf8")) as RevocationList
  if (list.issuer !== env.id || String(list.revision) !== env.version) throw new RevocationRejected("envelope-mismatch", "the decoded issuer or revision differs from the envelope's")
  if (o.heldRevision !== undefined && list.revision <= o.heldRevision) throw new RevocationRejected("not-newer", `revision ${list.revision} is not greater than ${o.heldRevision}`)
  return list
}
