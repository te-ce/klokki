/**
 * Time is injected, never read ambiently. The phase machine must not call
 * Date.now() — that is what lets the whole suite run without sleeping.
 */
export interface Clock {
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }
