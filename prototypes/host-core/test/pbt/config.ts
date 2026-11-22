// Shared by the property suites of report 07: pinned seeds, a TestHost on a TestClock, and a runner that names the seed.
import { Effect, type Layer, type Scope } from "effect"
import { TestClock } from "effect/testing"
import * as fc from "fast-check"
import * as Testing from "../../src/testing.js"

/** The seed is pinned so CI is reproducible; set BRIDGER_PBT_SEED to explore. A failure prints it with the shrunk case. */
export const seed = Number(process.env.BRIDGER_PBT_SEED ?? 20261122)
export const options = { drainTimeout: 200, shutdownTimeout: 300 }

/** `ports` is provided around `Testing.make` too, so a sink or gate in it is the one the host reads. */
export const onTestHost = <A>(body: (t: Testing.TestHost) => Effect.Effect<A, unknown, Scope.Scope>, ports?: Layer.Layer<any>) => {
  const program = Effect.scoped(Effect.flatMap(Testing.make(options), body))
  return Effect.runPromise((ports ? program.pipe(Effect.provide(ports)) : program).pipe(Effect.provide(TestClock.layer())) as typeof program)
}

export const assertProperty = <T>(property: fc.IAsyncPropertyWithHooks<T>, numRuns: number) =>
  fc.assert(property, { seed, numRuns, verbose: 1 })
