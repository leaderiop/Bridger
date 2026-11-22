// @vitest-environment jsdom
// docs/REACT-API.md: createBridgerClient, BridgerProvider, usePluginState and useServiceAction on a real DOM.
import { act, createElement as h, StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { Context, Effect } from "effect"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { definePlugin } from "../src/kit.js"
import { BridgerProvider, createBridgerClient, usePluginState, useServiceAction, type BridgerClient } from "../src/react.js"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
class Audit extends Context.Service<Audit, { readonly record: (e: string) => Effect.Effect<string> }>()("example/Audit") {}
const audit = definePlugin({ id: "example/audit", provides: Audit, make: Effect.succeed({ record: (e: string) => Effect.succeed(`recorded ${e}`) }) })
const boom = definePlugin({ id: "example/boom", provides: Audit, make: Effect.fail("nope") as never })

let cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const c of cleanups.reverse()) await c(); cleanups = [] })
const mount = async (client: BridgerClient, child: ReactNode) => {
  const el = document.createElement("div"); document.body.append(el)
  const root = createRoot(el)
  await act(async () => { root.render(h(StrictMode, null, h(BridgerProvider, { client }, child))) })
  cleanups.push(() => act(async () => { root.unmount() }))
  return el
}
const settle = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)) })

function Status() { const s = usePluginState("example/audit"); return h("p", { id: "status" }, s.state === "waiting" ? `waiting ${s.missingServiceIds.join(",")}` : s.state) }
function Button() {
  const rec = useServiceAction(Audit, (a, e: string) => a.record(e))
  return h("div", null,
    h("button", { id: "go", disabled: !rec.available || rec.pending, onClick: () => rec.run("click") }, "go"),
    h("p", { id: "out" }, rec.error ? `error ${rec.error.message}` : rec.data ?? (rec.available ? "idle" : "unavailable")))
}

describe("@bridger/react", () => {
  it("usePluginState follows install and removal while mounted; useServiceAction runs under a lease and reports unavailability", async () => {
    const client = await createBridgerClient({ plugins: [] })
    cleanups.push(() => client.dispose())
    const el = await mount(client, h("div", null, h(Status), h(Button)))
    expect(el.querySelector("#status")!.textContent).toBe("uninstalled")
    expect(el.querySelector("#out")!.textContent).toBe("unavailable")
    expect((el.querySelector("#go") as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { await client.install(audit); await client.awaitIdle() }); await settle()
    expect(el.querySelector("#status")!.textContent).toBe("active")
    expect((el.querySelector("#go") as HTMLButtonElement).disabled).toBe(false)
    await act(async () => { (el.querySelector("#go") as HTMLButtonElement).click() }); await settle()
    expect(el.querySelector("#out")!.textContent).toBe("recorded click")

    await act(async () => { await client.remove("example/audit"); await client.awaitIdle() }); await settle()
    expect(el.querySelector("#status")!.textContent).toBe("uninstalled")
    expect((el.querySelector("#go") as HTMLButtonElement).disabled).toBe(true)         // availability is a hint, read from the snapshot
  })
  it("createBridgerClient registers the initial plugins; a failing initial activation rejects creation; dispose is idempotent", async () => {
    const client = await createBridgerClient({ plugins: [audit] })
    expect(client.snapshot()!.plugins.map((p) => p.state)).toEqual(["active"])
    expect(await client.use(Audit, (a) => a.record("x"))).toBe("recorded x")
    await client.dispose(); await client.dispose()
    await expect(client.use(Audit, (a) => a.record("x"))).rejects.toThrow("disposed")
    await expect(createBridgerClient({ plugins: [boom] })).rejects.toMatchObject({ _tag: "ActivationFailed", id: "example/boom" })
  })
})
