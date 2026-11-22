// A `Connection` over a Node socket (net or tls): length-prefixed UTF-8 frames. The transport of remote 07 reduced to what the
// handshake and session need. A closed socket ends the connection's input: the session's heartbeat then ends the session.
import { Effect, Queue } from "effect"
import { createServer as netServer, connect as netConnect, type Server, type Socket } from "node:net"
import { createServer as tlsServer, connect as tlsConnect, type ConnectionOptions, type TlsOptions } from "node:tls"
import type { Connection } from "./wire.js"

const MAX_FRAME = 1 << 20      // shortcut: a frame above 1 MiB closes the socket; a streaming codec belongs to the real transport

export const fromSocket = (sock: Socket): Connection => {
  const frames = Effect.runSync(Queue.unbounded<string>())
  let buf = Buffer.alloc(0)
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 4) {
      const n = buf.readUInt32BE(0)
      if (n > MAX_FRAME) { sock.destroy(); return }
      if (buf.length < 4 + n) break
      Queue.offerUnsafe(frames, buf.subarray(4, 4 + n).toString("utf8"))
      buf = buf.subarray(4 + n)
    }
  })
  sock.on("error", () => {})
  return {
    send: (frame) => Effect.sync(() => {
      const body = Buffer.from(frame, "utf8"), head = Buffer.alloc(4); head.writeUInt32BE(body.length, 0)
      if (!sock.destroyed) sock.write(Buffer.concat([head, body]))      // never awaits the peer (remote 07, Connection.send)
    }),
    receive: Queue.take(frames)
  }
}

export interface Listener { readonly port: number; readonly close: Effect.Effect<void> }
/** Accepts connections and hands each to `onConnection`; with `tls` the server speaks TLS. */
export const listen = (onConnection: (c: Connection) => Effect.Effect<void>, tls?: TlsOptions): Effect.Effect<Listener> => Effect.callback<Listener>((resume) => {
  const open = new Set<Socket>()
  const handler = (sock: Socket) => { open.add(sock); sock.once("close", () => open.delete(sock)); Effect.runFork(onConnection(fromSocket(sock))) }
  const server: Server = tls ? tlsServer(tls, handler) : netServer(handler)
  server.listen(0, "127.0.0.1", () => resume(Effect.succeed({ port: (server.address() as { port: number }).port, close: Effect.callback<void>((r) => { server.close(() => r(Effect.void)); for (const c of open) c.destroy() }) })))
})
/** Dials `host:port` (default loopback); with `tls` the connection is TLS and fails unless the server's certificate verifies. */
export const dialSocket = (port: number, tls?: ConnectionOptions, host = "127.0.0.1"): Effect.Effect<Connection, Error> => Effect.callback<Connection, Error>((resume) => {
  const sock = tls ? tlsConnect({ host, port, ...tls }, () => resume(Effect.succeed(fromSocket(sock)))) : netConnect({ host, port }, () => resume(Effect.succeed(fromSocket(sock))))
  sock.once("error", (e) => resume(Effect.fail(e)))
})
