import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MS_PER_MINUTE,
  phaseDurationMs,
  type Preset,
} from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import {
  IDLE,
  currentPhase,
  nextPhase,
  remainingMs,
  skip,
  snooze,
  start,
  tick,
} from './machine'

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
      phaseEndsAt: T0 + minutes(25),
      snoozedMs: 0,
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
        cause: 'elapsed',
        presetId: pomodoro.id,
        startedAt: T0,
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
      {
        completed: once.phases[0],
        next: null,
        cause: 'elapsed',
        presetId: once.id,
        startedAt: T0,
        at: T0 + minutes(10),
      },
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

describe('snooze', () => {
  it('extends the phase that just ended without shortening the next one', () => {
    const boundary = T0 + minutes(30)
    const clicked = boundary + 2_000
    const { state, snoozed } = snooze(
      tick(start(sitStand, T0), boundary).state,
      clicked,
      minutes(5),
    )

    expect(snoozed).toEqual({
      phase: sitStand.phases[0],
      at: boundary,
      extendedByMs: minutes(5),
    })
    // Back in Sitting, with what is left of the five extra minutes.
    expect(currentPhase(state)?.label).toBe('Sitting')
    expect(remainingMs(state, clicked)).toBe(minutes(5) - 2_000)

    // Standing then starts five minutes late, at its full configured length.
    const resumed = tick(state, boundary + minutes(5))
    expect(resumed.transitions).toEqual([
      {
        completed: sitStand.phases[0],
        next: sitStand.phases[1],
        cause: 'elapsed',
        presetId: sitStand.id,
        // The snoozed stretch started at the boundary it deferred, so its length
        // is the snooze — which is what the history log records as its duration.
        startedAt: boundary,
        at: boundary + minutes(5),
      },
    ])
    expect(remainingMs(resumed.state, boundary + minutes(5))).toBe(minutes(15))
  })

  it('compounds across boundaries without drifting the sequence', () => {
    const first = T0 + minutes(30)
    let state = tick(start(sitStand, T0), first).state
    let at = first

    // Three snoozes in a row, each answered a second after the boundary it
    // defers: the deferral is anchored to the boundary, so the click latency
    // does not add up.
    for (let round = 0; round < 3; round += 1) {
      state = snooze(state, at + 1_000, minutes(5)).state
      at += minutes(5)
      state = tick(state, at).state
    }

    expect(at).toBe(T0 + minutes(45))
    expect(currentPhase(state)?.label).toBe('Standing')
    expect(remainingMs(state, at)).toBe(minutes(15))
  })

  it('extends the current snooze rather than stepping back twice', () => {
    const boundary = T0 + minutes(30)
    const once = snooze(
      tick(start(sitStand, T0), boundary).state,
      boundary,
      minutes(5),
    ).state
    // Two clicks on one overlay: more snooze, never an earlier phase.
    const twice = snooze(once, boundary, minutes(5))

    expect(twice.snoozed).toEqual({
      phase: sitStand.phases[0],
      at: boundary,
      extendedByMs: minutes(5),
    })
    expect(currentPhase(twice.state)?.label).toBe('Sitting')
    expect(remainingMs(twice.state, boundary)).toBe(minutes(10))
  })

  it('declines a boundary that is already in the past', () => {
    const boundary = T0 + minutes(30)
    const state = tick(start(sitStand, T0), boundary).state
    const late = snooze(state, boundary + minutes(6), minutes(5))

    expect(late).toEqual({ state, snoozed: null })
  })

  it('declines when the timer is idle', () => {
    expect(snooze(IDLE, T0, minutes(5))).toEqual({
      state: IDLE,
      snoozed: null,
    })
  })

  it('declines on the first phase of a preset that never looped', () => {
    const state = start(once, T0)

    expect(snooze(state, T0 + minutes(1), minutes(5))).toEqual({
      state,
      snoozed: null,
    })
  })
})

describe('snooze properties', () => {
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
  // A snooze is offered in whole minutes, and always longer than the latency
  // below — a deferral shorter than the answer's own delay is already past.
  const extraMs = fc.integer({ min: 1, max: 30 }).map(minutes)
  /** How late the overlay is answered, relative to the boundary it announced. */
  const latencyMs = fc.integer({ min: 0, max: 10 * MS_PER_MINUTE })

  it('never moves the clock backwards', () => {
    fc.assert(
      fc.property(
        runnablePreset,
        elapsedMs,
        latencyMs,
        extraMs,
        (preset, elapsed, latency, extra) => {
          const boundary = T0 + elapsed
          const before = tick(start(preset, T0), boundary).state
          const now = boundary + latency
          const { state, snoozed } = snooze(before, now, extra)

          // A declined snooze hands the state back untouched, boundary included.
          if (snoozed === null) {
            expect(state).toBe(before)
            return
          }
          if (before.status !== 'running' || state.status !== 'running') return
          // Elapsed time can only grow: the current stretch never starts later
          // than it did, so `now` is never pushed back inside it.
          expect(state.phaseStartedAt).toBeLessThanOrEqual(
            before.phaseStartedAt,
          )
          expect(state.phaseEndsAt).toBeGreaterThan(now)
        },
      ),
    )
  })

  it('never leaves more remaining than the phase plus the snooze', () => {
    fc.assert(
      fc.property(
        runnablePreset,
        elapsedMs,
        latencyMs,
        extraMs,
        (preset, elapsed, latency, extra) => {
          const boundary = T0 + elapsed
          const now = boundary + latency
          const { state } = snooze(
            tick(start(preset, T0), boundary).state,
            now,
            extra,
          )
          const phase = currentPhase(state)
          if (!phase || state.status !== 'running') return

          expect(remainingMs(state, now)).toBeLessThanOrEqual(
            phaseDurationMs(phase) + state.snoozedMs,
          )
        },
      ),
    )
  })

  it('delays the sequence by exactly the snoozes it was given', () => {
    fc.assert(
      fc.property(
        runnablePreset,
        fc.integer({ min: 1, max: 5 }),
        extraMs,
        (preset, rounds, extra) => {
          const firstBoundary = T0 + phaseDurationMs(preset.phases[0]!)
          let snoozedRun = tick(start(preset, T0), firstBoundary).state
          let at = firstBoundary

          for (let round = 0; round < rounds; round += 1) {
            // Answered a second late every time; the deferral is anchored to the
            // boundary, so the latency must not accumulate.
            snoozedRun = snooze(snoozedRun, at + 1_000, extra).state
            at += extra
            snoozedRun = tick(snoozedRun, at).state
          }

          // The undisturbed run reaches the same point `rounds * extra` earlier.
          const plainRun = tick(start(preset, T0), firstBoundary).state
          expect(at).toBe(firstBoundary + rounds * extra)
          expect(currentPhase(snoozedRun)).toEqual(currentPhase(plainRun))
          expect(remainingMs(snoozedRun, at)).toBe(
            remainingMs(plainRun, firstBoundary),
          )
        },
      ),
    )
  })
})

describe('nextPhase', () => {
  it('names what starts when the current phase ends', () => {
    expect(nextPhase(start(pomodoro, T0))?.label).toBe('Break')
  })

  it('wraps to the first phase of a looping preset', () => {
    const onBreak = tick(start(pomodoro, T0), T0 + minutes(25)).state
    expect(nextPhase(onBreak)?.label).toBe('Focus')
  })

  it('has nothing to name on the last phase of a preset that does not loop', () => {
    expect(nextPhase(start(once, T0))).toBeNull()
    expect(nextPhase(IDLE)).toBeNull()
  })
})

describe('skip', () => {
  it('ends the current phase now and starts the next one in full', () => {
    const clicked = T0 + minutes(10)
    const result = skip(start(pomodoro, T0), clicked)

    expect(result.transitions).toEqual([
      {
        completed: pomodoro.phases[0],
        next: pomodoro.phases[1],
        cause: 'skipped',
        presetId: pomodoro.id,
        // Ten minutes of Focus, not the twenty-five it was configured for:
        // this is what the history log records as the time really spent.
        startedAt: T0,
        at: clicked,
      },
    ])
    expect(currentPhase(result.state)?.label).toBe('Break')
    // The break is not shortened by the skip — its length applies when it starts.
    expect(remainingMs(result.state, clicked)).toBe(minutes(5))
  })

  it('drains a boundary the poll had not reported yet, then skips the phase the user saw', () => {
    // A second past the Focus boundary, before the poll fired: the phase the
    // user is looking at is Break, and that is the one the skip must end.
    const at = T0 + minutes(25) + 1_000
    const result = skip(start(pomodoro, T0), at)

    expect(result.transitions.map((transition) => transition.cause)).toEqual([
      'elapsed',
      'skipped',
    ])
    expect(result.transitions[0]?.completed.label).toBe('Focus')
    expect(result.transitions[1]?.completed.label).toBe('Break')
    expect(currentPhase(result.state)?.label).toBe('Focus')
  })

  it('ends the run when the last phase of a non-looping preset is skipped', () => {
    const result = skip(start(once, T0), T0 + minutes(1))

    expect(result.state.status).toBe('idle')
    expect(result.transitions).toEqual([
      {
        completed: once.phases[0],
        next: null,
        cause: 'skipped',
        presetId: once.id,
        startedAt: T0,
        at: T0 + minutes(1),
      },
    ])
  })

  it('has nothing to skip while idle', () => {
    expect(skip(IDLE, T0)).toEqual({ state: IDLE, transitions: [] })
  })

  it('leaves the sequence undrifted: every phase after a skip keeps its length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }).map(minutes), (early) => {
        const skipped = skip(start(sitStand, T0), early)
        // Standing starts when the user asked for it and runs its full 15,
        // so the boundary after the skip is 15 minutes from the click.
        const next = tick(skipped.state, early + minutes(15))

        expect(next.transitions).toHaveLength(1)
        expect(next.transitions[0]?.completed.label).toBe('Standing')
        expect(currentPhase(next.state)?.label).toBe('Sitting')
      }),
    )
  })
})
