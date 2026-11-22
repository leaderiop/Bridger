// A guest transport over HTTP for the partner SDK: `POST <url>/<method>` with a JSON payload; 200 with the value, 422 with a typed failure,
// 400 for SdkDecodeFailed on the input. shortcut: this is the prototype's own binding; the remote companion's session, version offer,
// epochs and heartbeats are not implemented, so claims and callbacks do not travel (kit BEH-KT-034 leaves the transport to that companion).
import { createServer } from "node:http"
import type { GuestEntry } from "./sdk.js"

export const listen = (entry: GuestEntry, port = 0): Promise<{ readonly url: string; readonly close: () => Promise<void> }> => new Promise((resolve) => {
  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (d) => { body += d })
    req.on("end", async () => {
      const ctl = new AbortController()
      req.on("close", () => { if (!res.writableEnded) ctl.abort() })
      const method = (req.url ?? "/").slice(1)
      let payload: unknown = null
      try { payload = body ? JSON.parse(body) : null } catch { res.statusCode = 400; res.end(JSON.stringify({ _tag: "SdkDecodeFailed", method, side: "input", message: "$: not JSON" })); return }
      const r = await entry.call(method, payload as never, { signal: ctl.signal })
      res.setHeader("content-type", "application/json")
      if (r.ok && "value" in r) { res.end(JSON.stringify(r.value)); return }
      if (r.ok) { const items: Array<unknown> = []; for await (const x of r.stream) items.push(x); res.end(JSON.stringify(items)); return }
      res.statusCode = r.failure._tag === "SdkDecodeFailed" ? 400 : 422
      res.end(JSON.stringify(r.failure))
    })
  })
  server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: () => new Promise((r) => server.close(() => r())) }))
})
