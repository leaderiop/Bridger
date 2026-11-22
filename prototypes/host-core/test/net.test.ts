// The handshake and the session over real sockets: loopback TCP, and TLS with a certificate generated for the test.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Context, Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Contract } from "../src/contract.js"
import { dialSocket, listen } from "../src/net.js"
import { openSession, serveGuest, type Session } from "../src/session.js"

class Board extends Context.Service<Board, { readonly post: (s: string) => Effect.Effect<string> }>()("example/Board@1") {}
const mk = (version: string, payload: Schema.Top) => Contract.make(Board, { version, methods: { post: Contract.method({ payload, success: Schema.String }) } }).descriptor
const side = (x: ReturnType<typeof mk>) => ({ version: x.version, methods: x.methods, schemas: x.schemas })
const contract = { id: "example/Board@1", accepts: "^1.2", ...side(mk("1.2.0", Schema.String)) }
const opts = (epoch: string) => ({ epoch, wire: [1], contract, heartbeat: { every: 50, missed: 3 } })
const guestWith = (served: ReturnType<typeof side>[]) => ({ wire: [1], served, maxInFlight: 4, handlers: { post: (p: unknown) => Effect.succeed(`posted:${String(p)}`) } })

const cert = () => {
  const dir = mkdtempSync(join(tmpdir(), "bridger-tls-"))
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" })
  return { key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }
}

describe("sockets", () => {
  it("runs the handshake and calls over loopback TCP", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const l = yield* listen((c) => serveGuest(c, guestWith([side(mk("1.4.0", Schema.String))])).pipe(Effect.asVoid))
      const s = (yield* openSession(yield* dialSocket(l.port), opts("net-1"))) as Session
      expect(s.version).toBe("1.4.0")
      expect(yield* s.call("post", "over tcp")).toBe("posted:over tcp")
      yield* s.close; yield* l.close
    }))
  })
  it("refuses over TCP a guest whose method schema differs, naming the method", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const l = yield* listen((c) => serveGuest(c, guestWith([side(mk("1.4.0", Schema.Number))])).pipe(Effect.asVoid))
      const out = yield* openSession(yield* dialSocket(l.port), opts("net-2"))
      expect(out).toMatchObject({ refused: "incompatible-contract" })
      yield* l.close
    }))
  })
  it("a connection the far end destroys ends the session by heartbeat-missed", async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const l = yield* listen((c) => serveGuest(c, guestWith([side(mk("1.2.0", Schema.String))])).pipe(Effect.asVoid))
      const s = (yield* openSession(yield* dialSocket(l.port), opts("net-3"))) as Session
      yield* l.close                                                           // destroys the accepted socket
      expect(yield* s.ended).toBe("heartbeat-missed")
    }))
  })
  it("speaks TLS with a generated certificate, and refuses a client that does not trust it", async () => {
    const { key, cert: c } = cert()
    await Effect.runPromise(Effect.gen(function* () {
      const l = yield* listen((conn) => serveGuest(conn, guestWith([side(mk("1.3.0", Schema.String))])).pipe(Effect.asVoid), { key, cert: c })
      const s = (yield* openSession(yield* dialSocket(l.port, { ca: c }), opts("tls-1"))) as Session
      expect(yield* s.call("post", "secure")).toBe("posted:secure")
      yield* s.close
      const untrusted = yield* Effect.flip(dialSocket(l.port, {}))              // the default trust store does not know the test certificate
      expect(untrusted.message).toMatch(/self.signed|unable to verify|certificate/i)
      yield* l.close
    }))
  })
})
