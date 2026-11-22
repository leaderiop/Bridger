// The FoldKit adapter inside a real FoldKit program (docs/FOLDKIT-API.md): `layer` as the app's `resources`, `changes` as its Subscription,
// `use` as a Command. Needs `foldkit` and `@effect/platform-browser` (peers of effect 4.1); the suite skips when they are not installed.
// shortcut: the prototype pins effect 4.0.0, so this runs only where effect ~4.1 is installed; upgrade the prototype's pin to run it everywhere.
import { Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { JSDOM } from "jsdom"
import { BridgerFoldkit, BridgerHost, Snapshot } from "../src/foldkit.js"
import { definePlugin } from "../src/kit.js"

const foldkit = await import("foldkit").catch(() => undefined)
class Greeter extends Context.Service<Greeter, { readonly greet: (n: string) => Effect.Effect<string> }>()("example/Greeter") {}
const greeter = definePlugin({ id: "example/greeter", provides: Greeter, make: Effect.succeed({ greet: (n: string) => Effect.succeed(`hello ${n}`) }) })
const until = async (f: () => boolean) => { for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 5)); expect(f()).toBe(true) }

describe.skipIf(!foldkit)("@bridger/foldkit inside a FoldKit program", () => {
  it("the Model follows the host through the Subscription, and a Command reaches a plugin through `use`", async () => {
    const { Runtime, Subscription } = foldkit!
    const { defineMessageUnion } = await import("foldkit/message")
    const dom = new JSDOM("<!doctype html><div id=root></div>", { pretendToBeVisual: true })
    for (const k of Object.getOwnPropertyNames(dom.window)) if (!(k in globalThis) || k === "document") Object.defineProperty(globalThis, k, { configurable: true, get: () => (dom.window as never)[k] })
    let captured: BridgerHost["Service"] | undefined
    const resources = Layer.tap(BridgerFoldkit.layer({ plugins: [greeter] }), (ctx) => Effect.sync(() => { captured = Context.get(ctx, BridgerHost) }))

    const Model = Schema.Struct({ revision: Schema.Number, greeter: Schema.String, greeting: Schema.String })
    type Model = typeof Model.Type
    const Message = defineMessageUnion({ GotSnapshot: { snapshot: Snapshot }, GotGreeting: { text: Schema.String } })
    type Message = typeof Message.Type
    const subscriptions = Subscription.make<Model, Message, BridgerHost>()((entry) => ({
      host: entry({}, { modelToDependencies: () => ({}), dependenciesToStream: () => BridgerFoldkit.changes.pipe(Stream.filter(Option.isSome), Stream.map((o) => Message.GotSnapshot({ snapshot: o.value }))) })
    }))
    const program = Runtime.makeElement({
      Model, container: dom.window.document.getElementById("root"), resources, subscriptions,
      init: () => ({ model: { revision: 0, greeter: "uninstalled", greeting: "" }, commands: [] }),
      update: (m: Model, msg: Message) => Message.match<{ model: Model; commands: [] }>(msg, {
        GotSnapshot: ({ snapshot }) => ({ model: { ...m, revision: snapshot.revision, greeter: BridgerFoldkit.pluginState(Option.some(snapshot), "example/greeter") }, commands: [] }),
        GotGreeting: ({ text }) => ({ model: { ...m, greeting: text }, commands: [] })
      }),
      view: (m: Model, h: any) => h.div([], [`${m.greeter}|${m.greeting}`])
    } as never)
    Effect.runFork((program as { start: () => Effect.Effect<void> }).start())

    await until(() => dom.window.document.body.textContent?.startsWith("active") === true)       // the first snapshot reached the Model
    const text = await Effect.runPromise(BridgerFoldkit.use(Greeter, (g) => g.greet("fold")).pipe(Effect.provideService(BridgerHost, captured!)))
    expect(text).toBe("hello fold")
    await Effect.runPromise(captured!.host.remove("example/greeter", { context: { actor: { id: "t", kind: "user" } } } as never).pipe(Effect.ignore))
    await until(() => dom.window.document.body.textContent?.startsWith("uninstalled") === true)  // a host change reached the Model with no polling
  })
})
