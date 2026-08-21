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
  addTime,
  completedPhase,
  confirm,
  currentPhase,
  nextPhase,
  remainingMs,
  setRemaining,
  skip,
  snooze,
  start,
  stretchProgress,
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

  it('holds at the boundary instead of starting the next phase', () => {
    const result = tick(start(pomodoro, T0), T0 + minutes(25))

    expect(result.state.status).toBe('awaiting')
    expect(completedPhase(result.state)?.label).toBe('Focus')
    // Break is chosen, and still whole: no part of it was spent waiting.
    expect(currentPhase(result.state)?.label).toBe('Break')
    expect(remainingMs(result.state, T0 + minutes(30))).toBe(minutes(5))
    expect(stretchProgress(result.state, T0 + minutes(30))).toBe(0)
  })

  it('reports nothing more until the boundary is confirmed', () => {
    const waiting = tick(start(pomodoro, T0), T0 + minutes(25)).state

    // An hour later, still the same unanswered boundary: the phases behind it
    // did not happen, because they never started.
    expect(tick(waiting, T0 + minutes(85))).toEqual({
      state: waiting,
      transitions: [],
    })
  })

  it('wraps a looping preset back to the first phase, one confirmation at a time', () => {
    const onBreak = confirm(
      tick(start(pomodoro, T0), T0 + minutes(25)).state,
      T0 + minutes(25),
    )
    const wrapped = confirm(
      tick(onBreak, T0 + minutes(30)).state,
      T0 + minutes(30),
    )

    expect(currentPhase(wrapped)?.label).toBe('Focus')
    expect(remainingMs(wrapped, T0 + minutes(30))).toBe(minutes(25))
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
  it('reports one boundary however long the machine slept', () => {
    const timeline = tick(
      start(sitStand, T0),
      T0 + minutes(100),
    ).transitions.map(
      (transition) =>
        `+${(transition.at - T0) / MS_PER_MINUTE}m ${transition.completed.label} -> ${transition.next?.label}`,
    )

    // Not four phases the user slept through: the first boundary is where the
    // run stopped, and Standing is what they are being asked to start now.
    expect(timeline).toMatchInlineSnapshot(`
      [
        "+30m Sitting -> Standing",
      ]
    `)
  })

  it('does not accumulate drift when polled irregularly', () => {
    // Each phase is confirmed the instant it is reported, which is the fastest
    // a run can go: the boundaries still land on the configured minute, so a
    // 1s poll cannot shave milliseconds off the sequence.
    const boundaries: number[] = []
    let state: ReturnType<typeof start> = start(pomodoro, T0)
    for (const minute of [7, 13, 26, 31, 44, 46, 59, 61]) {
      const result = tick(state, T0 + minutes(minute))
      for (const transition of result.transitions)
        boundaries.push((transition.at - T0) / MS_PER_MINUTE)
      state = confirm(result.state, T0 + minutes(minute))
    }

    // Focus ends at 25, Break five minutes after it was confirmed at 26, Focus
    // twenty-five after it was confirmed at 31: every boundary is its phase's
    // full length past the start it was given, whenever the poll noticed.
    expect(boundaries).toEqual([25, 31, 56])
    expect(currentPhase(state)?.label).toBe('Break')
    expect(remainingMs(state, T0 + minutes(61))).toBe(minutes(3))
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

  it('never leaves a phase running past its end', () => {
    fc.assert(
      fc.property(runnablePreset, elapsedMs, (preset, elapsed) => {
        const now = T0 + elapsed
        const { state } = tick(start(preset, now - elapsed), now)
        const phase = currentPhase(state)

        expect(phase).not.toBeNull()
        const remaining = remainingMs(state, now)
        expect(remaining).toBeGreaterThan(0)
        expect(remaining).toBeLessThanOrEqual(phaseDurationMs(phase!))

        // Either the phase still has time on it, or the run is holding at the
        // boundary with the next phase whole — never a phase that has overrun.
        if (state.status === 'awaiting')
          expect(remaining).toBe(phaseDurationMs(phase!))
        else
          expect(
            state.status === 'running' && state.phaseStartedAt <= now,
          ).toBe(true)
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

describe('setRemaining', () => {
  it('corrects the current phase to the given remaining time', () => {
    const result = setRemaining(
      start(pomodoro, T0),
      T0 + minutes(2),
      minutes(10),
    )

    expect(result.transitions).toEqual([])
    expect(currentPhase(result.state)?.label).toBe('Focus')
    expect(remainingMs(result.state, T0 + minutes(2))).toBe(minutes(10))
  })

  it('clamps a negative target to zero rather than rejecting it', () => {
    const result = setRemaining(
      start(pomodoro, T0),
      T0 + minutes(2),
      -minutes(5),
    )

    expect(remainingMs(result.state, T0 + minutes(2))).toBe(0)
  })

  it('reports a boundary the poll had not seen yet, and corrects nothing', () => {
    const at = T0 + minutes(25) + 1_000
    const result = setRemaining(start(pomodoro, T0), at, minutes(3))

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
    // Break has not started, so there is no remaining time to pull into line —
    // it will get its full five minutes whenever it is confirmed.
    expect(result.state.status).toBe('awaiting')
    expect(remainingMs(result.state, at)).toBe(minutes(5))
  })

  it('has nothing to correct while idle', () => {
    expect(setRemaining(IDLE, T0, minutes(10))).toEqual({
      state: IDLE,
      transitions: [],
    })
  })
})

describe('addTime', () => {
  it('adds to the current phase, relative to whatever remains', () => {
    const result = addTime(start(pomodoro, T0), T0 + minutes(2), minutes(5))

    expect(result.transitions).toEqual([])
    expect(currentPhase(result.state)?.label).toBe('Focus')
    expect(remainingMs(result.state, T0 + minutes(2))).toBe(
      minutes(23) + minutes(5),
    )
  })

  it('gives the phase that ended more of itself at an unanswered boundary', () => {
    const at = T0 + minutes(25) + 1_000
    const result = addTime(start(pomodoro, T0), at, minutes(5))

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
    // Five more minutes of Focus, measured from the boundary rather than from
    // the click — the same anchor a snooze uses.
    expect(currentPhase(result.state)?.label).toBe('Focus')
    expect(remainingMs(result.state, at)).toBe(minutes(5) - 1_000)
  })

  it('has nothing to add to while idle', () => {
    expect(addTime(IDLE, T0, minutes(5))).toEqual({
      state: IDLE,
      transitions: [],
    })
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

  it('starts the phase an unanswered boundary is holding, and skips nothing', () => {
    // A second past the Focus boundary, before the poll fired: Break has not
    // begun, so there is nothing to cut short — skipping is starting it.
    const at = T0 + minutes(25) + 1_000
    const result = skip(start(pomodoro, T0), at)

    expect(result.transitions.map((transition) => transition.cause)).toEqual([
      'elapsed',
    ])
    expect(result.transitions[0]?.completed.label).toBe('Focus')
    expect(result.state.status).toBe('running')
    expect(currentPhase(result.state)?.label).toBe('Break')
    expect(remainingMs(result.state, at)).toBe(minutes(5))
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

describe('stretchProgress', () => {
  it('is zero at the start of a phase and one at its end', () => {
    const running = start(pomodoro, T0)

    expect(stretchProgress(running, T0)).toBe(0)
    expect(stretchProgress(running, T0 + minutes(25))).toBe(1)
  })

  it('is the fraction of the phase that has passed', () => {
    const running = start(pomodoro, T0)

    expect(stretchProgress(running, T0 + minutes(5))).toBeCloseTo(0.2)
  })

  it('is measured against the snoozed stretch, not the phase it belongs to', () => {
    // Focus ran out, Break started, and the user snoozed the boundary: the
    // stretch is now five minutes of Focus, so halfway through it is 2:30 in —
    // not the 12:30 that half of a 25-minute phase would be.
    const elapsed = tick(start(pomodoro, T0), T0 + minutes(25))
    const snoozed = snooze(elapsed.state, T0 + minutes(25), minutes(5))

    expect(stretchProgress(snoozed.state, T0 + minutes(27.5))).toBeCloseTo(0.5)
  })

  it('reads as full rather than overfull for a boundary no poll has drained', () => {
    const running = start(pomodoro, T0)

    expect(stretchProgress(running, T0 + minutes(40))).toBe(1)
  })

  it('is zero while idle: there is no stretch to be part of the way through', () => {
    expect(stretchProgress(IDLE, T0)).toBe(0)
  })

  it('never leaves the unit interval, whatever the clock says', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -minutes(60), max: minutes(60) }),
        (offset) => {
          const progress = stretchProgress(start(pomodoro, T0), T0 + offset)

          expect(progress).toBeGreaterThanOrEqual(0)
          expect(progress).toBeLessThanOrEqual(1)
        },
      ),
    )
  })
})

describe('confirm', () => {
  it('starts the waiting phase in full, from the moment it was confirmed', () => {
    const boundary = T0 + minutes(25)
    const answered = boundary + minutes(3)
    const state = confirm(tick(start(pomodoro, T0), boundary).state, answered)

    // Three minutes went by getting to the overlay, and none of them came out
    // of the break: that is the whole reason the run waited.
    expect(state.status).toBe('running')
    expect(currentPhase(state)?.label).toBe('Break')
    expect(remainingMs(state, answered)).toBe(minutes(5))
    expect(stretchProgress(state, answered)).toBe(0)
  })

  it('is a no-op with no boundary waiting', () => {
    const running = start(pomodoro, T0)

    expect(confirm(running, T0 + minutes(1))).toBe(running)
    expect(confirm(IDLE, T0)).toBe(IDLE)
  })
})
