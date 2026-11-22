// The partner SDK over the remote companion's session (remote BEH-RM-020.., kit BEH-KT-034): `serveEntry` answers the link handshake of a started guest
// and routes each call of the session's epoch to `GuestEntry.call`. A typed failure crosses as the call's error (the caller sees `RemoteError` with it
// as `detail`); a callback the partner makes goes back over the session under the call's token. shortcut: the call frame carries no disclosed claims
// (the session's call has no claims parameter), so `ctx.claims` is empty over a session, when the remote companion adds them to the frame.
import { Effect } from "effect"
import type { WireSide } from "./handshake.js"
import { serveGuest, type Handlers } from "./session.js"
import type { GuestEntry, WireResult } from "./sdk.js"
import type { Connection } from "./wire.js"

export const serveEntry = (conn: Connection, entry: GuestEntry, options: { readonly schemas?: WireSide["schemas"]; readonly maxInFlight?: number } = {}) => {
  const handlers: Handlers = Object.fromEntries(entry.served.methods.map((m) => [m, (payload: unknown, ctx) => Effect.gen(function* () {
    const callbacks: Array<Promise<unknown>> = []
    const r: WireResult = yield* Effect.promise(() => entry.call(m, payload as never, {
      callback: (serviceId, method, p) => {
        const done = Effect.runPromise(ctx.callback(serviceId, method, p)).then((x): WireResult => {
          const exit = x.exit as { ok?: unknown; failed?: { _tag: string }; refused?: { tag: string } }
          return "ok" in exit ? { ok: true, value: exit.ok as never } : { ok: false, failure: (exit.failed ?? { _tag: "CallbackDenied" }) as never }
        })
        callbacks.push(done); return done
      }
    }))
    if (!r.ok) return yield* Effect.fail(r.failure)
    if ("value" in r) return r.value
    return yield* Effect.promise(async () => { const items: Array<unknown> = []; for await (const x of r.stream) items.push(x); return items })
  })]))
  return serveGuest(conn, { wire: [1], served: [{ version: entry.served.version, methods: entry.served.methods, ...(options.schemas ? { schemas: options.schemas } : {}) }], maxInFlight: options.maxInFlight ?? 8, handlers })
}
