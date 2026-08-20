import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MS_PER_MINUTE,
  phaseDurationMs,
  type Preset,
} from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import { currentPhase, remainingMs, start, tick } from './machine'

const T0 = 1_700_000_000_000
const minutes = (count: number): number => count * MS_PER_MINUTE

const pomodoro = SEED_PRESETS[0]!
const sitStand = SEED_PRESETS[1]!

const once: Preset = {
  id: 'once',
  name: 'One shot',
  loop: false,
  phases: [{ label: 'Only', minutes: 10, notify: true }],
}

describe('start', () => {
  it('begins on the first phase', () => {
    const state = start(pomodoro, T0)

    expect(state).toEqual({
      status: 'running',
      preset: pomodoro,
      phaseIndex: 0,
      phaseStartedAt: T0,
    })
    expect(currentPhase(state)?.label).toBe('Focus')
    expect(remainingMs(state, T0)).toBe(minutes(25))
  })

  it('rejects a preset that could never make progress', () => {
    const empty: Preset = { id: 'empty', name: 'Empty', loop: true, phases: [] }
    const zeroed: Preset = {
      ...once,
      phases: [{ label: 'Nope', minutes: 0, notify: false }],
    }

    expect(() => start(empty, T0)).toThrow(/no runnable phases/)
    expect(() => start(zeroed, T0)).toThrow(/no runnable phases/)
  })
})

describe('tick', () => {
  it('reports nothing while the phase is still running', () => {
    const result = tick(start(pomodoro, T0), T0 + minutes(24))

    expect(result.transitions).toEqual([])
    expect(remainingMs(result.state, T0 + minutes(24))).toBe(minutes(1))
  })

  it('moves to the next phase at the boundary', () => {
    const result = tick(start(pomodoro, T0), T0 + minutes(25))

    expect(result.transitions).toEqual([
      {
        completed: pomodoro.phases[0],
        next: pomodoro.phases[1],
        at: T0 + minutes(25),
      },
    ])
    expect(currentPhase(result.state)?.label).toBe('Break')
    expect(remainingMs(result.state, T0 + minutes(25))).toBe(minutes(5))
  })

  it('wraps a looping preset back to the first phase', () => {
    const result = tick(start(pomodoro, T0), T0 + minutes(30))

    expect(result.transitions).toHaveLength(2)
    expect(currentPhase(result.state)?.label).toBe('Focus')
  })

  it('goes idle when a non-looping preset runs out', () => {
    const result = tick(start(once, T0), T0 + minutes(10))

    expect(result.state.status).toBe('idle')
    expect(result.transitions).toEqual([
      { completed: once.phases[0], next: null, at: T0 + minutes(10) },
    ])
  })

  it('is a no-op once idle', () => {
    expect(tick({ status: 'idle' }, T0 + minutes(99))).toEqual({
      state: { status: 'idle' },
      transitions: [],
    })
  })

  // Wall-clock timing: the machine gets no wake-up notification, so the first
  // tick after the lid opens has to account for everything that elapsed.
  it('drains every phase that elapsed while the machine slept', () => {
    const timeline = tick(
      start(sitStand, T0),
      T0 + minutes(100),
    ).transitions.map(
      (transition) =>
        `+${(transition.at - T0) / MS_PER_MINUTE}m ${transition.completed.label} -> ${transition.next?.label}`,
    )

    expect(timeline).toMatchInlineSnapshot(`
      [
        "+30m Sitting -> Standing",
        "+45m Standing -> Sitting",
        "+75m Sitting -> Standing",
        "+90m Standing -> Sitting",
      ]
    `)
  })

  it('does not accumulate drift when polled irregularly', () => {
    const irregular = [7, 13, 26, 31, 44, 46, 59, 61].reduce(
      (state, minute) => tick(state, T0 + minutes(minute)).state,
      start(pomodoro, T0),
    )

    // Two full 30-minute cycles have passed, so minute 61 sits 1 minute into Focus.
    expect(currentPhase(irregular)?.label).toBe('Focus')
    expect(remainingMs(irregular, T0 + minutes(61))).toBe(minutes(24))
  })
})

describe('tick properties', () => {
  const runnablePreset = fc.record({
    id: fc.constant('generated'),
    name: fc.constant('Generated'),
    loop: fc.constant(true),
    phases: fc.array(
      fc.record({
        label: fc.string({ minLength: 1, maxLength: 8 }),
        minutes: fc.integer({ min: 1, max: 60 }),
        notify: fc.boolean(),
      }),
      { minLength: 1, maxLength: 4 },
    ),
  })

  const elapsedMs = fc.integer({ min: 0, max: 24 * 60 * MS_PER_MINUTE })

  it('always leaves the timer inside the phase containing now', () => {
    fc.assert(
      fc.property(runnablePreset, elapsedMs, (preset, elapsed) => {
        const now = T0 + elapsed
        const { state } = tick(start(preset, now - elapsed), now)
        const phase = currentPhase(state)

        expect(phase).not.toBeNull()
        expect(state.status === 'running' && state.phaseStartedAt <= now).toBe(
          true,
        )
        const remaining = remainingMs(state, now)
        expect(remaining).toBeGreaterThan(0)
        expect(remaining).toBeLessThanOrEqual(phaseDurationMs(phase!))
      }),
    )
  })

  it('emits transitions that are contiguous in time', () => {
    fc.assert(
      fc.property(runnablePreset, elapsedMs, (preset, elapsed) => {
        const { transitions } = tick(start(preset, T0), T0 + elapsed)

        transitions.reduce((expectedAt, transition) => {
          expect(transition.at).toBe(
            expectedAt + phaseDurationMs(transition.completed),
          )
          return transition.at
        }, T0)
      }),
    )
  })
})
