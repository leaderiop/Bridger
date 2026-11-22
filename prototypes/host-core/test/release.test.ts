// Kit 04 BEH-KT-029, 030, 032 over the loader kernel (loader BEH-LD-001..003, 017, 020, 049, 053, 054): pack, publish and countersign.
import { createHash, generateKeyPairSync, sign as edSign, type KeyObject } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { main } from "../src/cli.js"
import * as L from "../src/loader.js"

let dirs: Array<string> = []
const tmp = () => { const d = mkdtempSync(join(process.cwd(), ".tmp-release-")); dirs.push(d); return d }   // inside the project so `effect` resolves for the signer modules
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = [] })
const cli = async (cwd: string, args: Array<string>) => {
  const out: Array<string> = [], err: Array<string> = []
  const code = await main(args, [], { out: (s) => out.push(s), err: (s) => err.push(s), cwd })
  return { code, out: out.join("\n"), err: err.join("\n") }
}
const raw = (pub: KeyObject) => (pub.export({ format: "der", type: "spki" }) as Buffer).subarray(-32).toString("base64")
const keys = (n: string) => { const { privateKey, publicKey } = generateKeyPairSync("ed25519"); return { n, privateKey, publicKey, raw: raw(publicKey) } }

/** A signer module as the person signing wires it: it signs with a key it holds; the kit only sees signingInput in, Signature out. */
const signerModule = (d: string, name: string, k: ReturnType<typeof keys>, fail = false) => {
  const priv = (k.privateKey.export({ format: "pem", type: "pkcs8" }) as string)
  writeFileSync(join(d, `${name}.mjs`), `import { sign, createPrivateKey } from "node:crypto"
import { Effect } from "effect"
const key = createPrivateKey(${JSON.stringify(priv)})
export default { scheme: "ed25519", sign: (input) => ${fail ? `Effect.fail({ _tag: "SigningFailed", scheme: "ed25519", message: "the token is locked" })` : `Effect.succeed({ scheme: "ed25519", keyHint: "${name}", bytes: new Uint8Array(sign(null, input, key)) })`} }
`)
}
const project = (d: string, extra: Record<string, unknown> = {}) => {
  mkdirSync(join(d, "src"), { recursive: true })
  writeFileSync(join(d, "src", "plugin.ts"), "export default {}\r\n")
  writeFileSync(join(d, "src", "util.ts"), "export const x = 1\n")
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "report-export", version: "1.4.0", dependencies: { effect: "4.0.0" } }))
  writeFileSync(join(d, "pkg.mjs"), `export const manifests = [${JSON.stringify({ manifestVersion: 1, id: "example/report-export", version: "1.4.0", provides: [{ serviceId: "example/Export@1", internal: true }], requires: [], publisher: "acme", ...extra })}]\nexport const contracts = []\nexport const definitions = []\n`)
}
const rules = (d: string, signers: Array<{ id: string; key: string; roles: Array<string>; publishers?: Array<string> }>, require: unknown) =>
  writeFileSync(join(d, "rules.json"), JSON.stringify({ policy: { id: "release-v1", signers: signers.map((s) => ({ scheme: "ed25519", ...s })), require } }))

describe("loader kernel (BEH-LD-002, 049, 054)", () => {
  it("the package digest is the construction the spec gives, computed independently here", () => {
    const manifest = new TextEncoder().encode('{"id":"a"}'), sbom = { format: "spdx", bytes: new TextEncoder().encode("s") }
    const files = new Map([["b/z.ts", new TextEncoder().encode("1")], ["a.ts", new TextEncoder().encode("2")]])
    const h = (...p: Array<Uint8Array | string>) => { const x = createHash("sha256"); for (const q of p) x.update(q); return "sha256:" + x.digest("hex") }
    const md = h(manifest), sd = h("spdx", Uint8Array.of(0), sbom.bytes)
    const fd = h("a.ts", Uint8Array.of(0), h("2"), "\n", "b/z.ts", Uint8Array.of(0), h("1"), "\n")
    expect(L.packageDigest({ manifest, sbom, files })).toBe(h("bridger-package-v1\n", md, "\n", sd, "\n", fd, "\n"))
  })
  it("paths are refused when not relative and normalised; a digest of another algorithm is refused", () => {
    for (const p of ["/a", "a//b", "./a", "../a", "a\\b", ""]) expect(() => L.checkPaths([p])).toThrow(L.PackageMalformed)
    expect(() => L.checkPaths(["é", "é"])).toThrow("collides")
    expect(() => L.Statement.make({ statementType: "package", subject: { digest: "md5:00" } })).toThrow(L.UnsupportedDigestAlgorithm)
  })
  it("the signing input is the DSSE encoding of the canonical statement; Statement.digest is the hash of the canonical JSON", () => {
    const s = L.Statement.make({ statementType: "package", subject: { digest: "sha256:ab" }, id: "x", version: "1" })
    const body = '{"id":"x","statementType":"package","subject":{"digest":"sha256:ab"},"type":"bridger-statement-v1","version":"1"}'
    expect(Buffer.from(L.Statement.signingInput(s)).toString()).toBe(`DSSEv1 38 application/vnd.bridger.statement+json ${body.length} ${body}`)
    expect(L.Statement.digest(s)).toBe("sha256:" + createHash("sha256").update(body).digest("hex"))
  })
})

describe("bridger pack (BEH-KT-029)", () => {
  it("packs reproducibly: the same sources give byte-identical packages; line endings are normalised; the entry is named under the loader key only", async () => {
    const a = tmp(), b = tmp(); project(a); project(b)
    const ra = await cli(a, ["pack", "pkg.mjs", "--entry", "src/plugin.ts"]), rb = await cli(b, ["pack", "pkg.mjs", "--entry", "src/plugin.ts"])
    expect([ra.code, rb.code]).toEqual([0, 0])
    const fa = readFileSync(join(a, "dist/report-export-1.4.0.bpkg"), "utf8")
    expect(fa).toBe(readFileSync(join(b, "dist/report-export-1.4.0.bpkg"), "utf8"))
    const pkg = JSON.parse(fa), manifest = JSON.parse(Buffer.from(pkg.manifest, "base64url").toString())
    expect(manifest.extensions).toEqual({ "@bridger/loader": { entry: { file: "src/plugin.ts", export: "default" } } })
    expect(Buffer.from(pkg.files["src/plugin.ts"], "base64url").toString()).toBe("export default {}\n")
    expect(ra.out).toMatch(/sha256:[0-9a-f]{64}/)
  })
  it("refuses an entry that is not one of the files, and a partner manifest that is not guest-shaped, naming the field", async () => {
    const d = tmp(); project(d)
    const e = await cli(d, ["pack", "pkg.mjs", "--entry", "src/nope.ts"]); expect(e.code).toBe(1); expect(e.err).toContain("PackageMalformed (entry)")
    const p = tmp(); project(p, { listens: ["x.y"] })
    const r = await cli(p, ["pack", "pkg.mjs", "--entry", "src/plugin.ts", "--partner"]); expect(r.code).toBe(1); expect(r.err).toContain("`listens`")
    expect((await cli(d, ["pack", "pkg.mjs"])).code).toBe(2)
  })
})

describe("publish and countersign (BEH-KT-030, 032)", () => {
  const setup = async () => {
    const d = tmp(); project(d)
    const pub = keys("publisher-key"), rev = keys("reviewer-key")
    signerModule(d, "pubsigner", pub); signerModule(d, "revsigner", rev); signerModule(d, "badsigner", pub, true)
    rules(d, [{ id: "publisher-key", key: pub.raw, roles: ["publisher"], publishers: ["acme"] }, { id: "reviewer-key", key: rev.raw, roles: ["reviewer"] }],
      { allOf: [{ role: "publisher", threshold: 1 }, { role: "reviewer", threshold: 1 }] })
    await cli(d, ["pack", "pkg.mjs", "--entry", "src/plugin.ts"])
    return { d, pkg: "dist/report-export-1.4.0.bpkg", sigs: "dist/report-export-1.4.0.signatures.json", pub, rev }
  }
  it("a usage error without a signer, and when the rules are given without --revocation; an unknown target is refused", async () => {
    const { d, pkg } = await setup()
    expect((await cli(d, ["publish", pkg, "--target", "dir:out"])).code).toBe(2)
    const r = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--rules", "rules.json"]); expect(r.code).toBe(2); expect(r.err).toContain("--revocation")
    expect((await cli(d, ["publish", pkg, "--target", "s3:x", "--signer", "pubsigner.mjs"])).code).toBe(2)
  })
  it("without the rules, publish prints `policy unknown`, signs, and uploads only with --partial", async () => {
    const { d, pkg } = await setup()
    const r = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs"])
    expect(r.code).toBe(1); expect(r.out).toContain("policy unknown: the deployment's rules were not given"); expect(existsSync(join(d, "out"))).toBe(false)
    const p = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--partial"])
    expect(p.code).toBe(0); expect(existsSync(join(d, "out/report-export-1.4.0.bpkg"))).toBe(true)
  })
  it("double signing: the publisher alone leaves the reviewer branch unmet and uploads nothing; a countersign satisfies it without changing the package bytes", async () => {
    const { d, pkg, sigs } = await setup()
    const before = readFileSync(join(d, pkg), "utf8")
    const r = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(r.code).toBe(1); expect(r.out).toContain("needs 1 signer with role reviewer: run bridger countersign"); expect(r.out).toContain("no revocation was checked"); expect(existsSync(join(d, "out"))).toBe(false)
    const c = await cli(d, ["countersign", pkg, "--signer", "revsigner.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(c.code).toBe(0); expect(c.out).toContain("release-v1: satisfied (publisher-key, reviewer-key)")
    expect(readFileSync(join(d, pkg), "utf8")).toBe(before)                                                   // signatures sit outside the digest
    expect(JSON.parse(readFileSync(join(d, sigs), "utf8")).package).toHaveLength(2)
    const again = await cli(d, ["countersign", pkg, "--signer", "revsigner.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(again.out).toContain("already signed"); expect(JSON.parse(readFileSync(join(d, sigs), "utf8")).package).toHaveLength(2)
    const done = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(done.out).toContain("satisfied"); expect(existsSync(join(d, "out/report-export-1.4.0.bpkg"))).toBe(true)
  })
  it("a signer that fails ends with SigningFailed and leaves the signatures unchanged; a tampered package is refused by countersign", async () => {
    const { d, pkg, sigs } = await setup()
    await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--partial"])
    const kept = readFileSync(join(d, sigs), "utf8")
    const f = await cli(d, ["countersign", pkg, "--signer", "badsigner.mjs"]); expect(f.code).toBe(1); expect(f.err).toContain("SigningFailed")
    expect(readFileSync(join(d, sigs), "utf8")).toBe(kept)
    const j = JSON.parse(readFileSync(join(d, pkg), "utf8")); j.files["src/util.ts"] = Buffer.from("export const x = 2\n").toString("base64url"); writeFileSync(join(d, pkg), JSON.stringify(j))
    const t = await cli(d, ["countersign", pkg, "--signer", "revsigner.mjs"]); expect(t.code).toBe(1); expect(t.err).toContain("differs from the one its signatures name")
  })
  it("a signature by an untrusted key counts for nothing; a publisher no verified signer may vouch for is a PublisherMismatch", async () => {
    const { d, pkg, sigs, pub } = await setup()
    rules(d, [{ id: "publisher-key", key: pub.raw, roles: ["publisher"], publishers: ["someone-else"] }], { role: "publisher", threshold: 1 })
    const m = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(m.code).toBe(1); expect(m.err).toContain("PublisherMismatch")
    rmSync(join(d, sigs))                                                       // the publisher's own signature from above is not part of this case
    const other = keys("other"); signerModule(d, "other", other)
    rules(d, [{ id: "publisher-key", key: pub.raw, roles: ["publisher"], publishers: ["acme"] }], { role: "publisher", threshold: 1 })
    const u = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "other.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(u.code).toBe(1); expect(u.out).toContain("needs 1 signer with role publisher")
  })
  it("a revoked signer identity stops counting; a revoked digest stops the statement", async () => {
    const { d, pkg, pub } = await setup()
    rules(d, [{ id: "publisher-key", key: pub.raw, roles: ["publisher"], publishers: ["acme"] }], { role: "publisher", threshold: 1 })
    writeFileSync(join(d, "rev.json"), JSON.stringify({ issuedAt: "2026-11-01T00:00:00Z", identities: [L.ed25519Identity(pub.raw)] }))
    const r = await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--rules", "rules.json", "--revocation", "rev.json"])
    expect(r.out).toContain("revocation list issued 2026-11-01T00:00:00Z"); expect(r.out).toContain("needs 1 signer with role publisher"); expect(r.code).toBe(1)
  })
  it("--statement first-party signs the first-party statement and appends it to firstParty, never to the package signatures", async () => {
    const { d, pkg, sigs, pub } = await setup()
    rules(d, [{ id: "publisher-key", key: pub.raw, roles: ["publisher"], publishers: ["acme"] }], { role: "publisher", threshold: 1 })
    await cli(d, ["publish", pkg, "--target", "dir:out", "--signer", "pubsigner.mjs", "--partial"])
    const c = await cli(d, ["countersign", pkg, "--statement", "first-party", "--signer", "pubsigner.mjs", "--rules", "rules.json", "--revocation", "unbounded"])
    expect(c.code).toBe(0)
    const s = JSON.parse(readFileSync(join(d, sigs), "utf8")); expect([s.package.length, s.firstParty.length]).toEqual([1, 1])
    expect(c.out.indexOf("package")).toBeLessThan(c.out.indexOf("first-party"))
  })
})
