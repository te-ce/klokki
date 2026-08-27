import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE, type Preset } from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import { IDLE_VIEW } from '../../shared/test-support/timer-view'
import type { RunView } from '../../shared/timer'
import type { Clock } from './clock'
import {
  createTimerService,
  type TimerService,
  type TimerUpdate,
} from './service'

const T0 = 1_700_000_000_000
const pomodoro = SEED_PRESETS[0]!
const sitStand = SEED_PRESETS[1]!
const minutes = (count: number): number => count * MS_PER_MINUTE
const SNOOZE_MS = minutes(5)

const once: Preset = {
  id: 'once',
  name: 'One shot',
  loop: false,
  phases: [{ label: 'Only', minutes: 1, notify: true }],
}

/** Fake timers move the event loop; this moves the clock the service reads. */
const createTestClock = (): Clock & { advance: (ms: number) => void } => {
  let current = T0
  return {
    now: () => current,
    advance: (ms) => {
      current += ms
    },
  }
}

let clock: ReturnType<typeof createTestClock>

beforeEach(() => {
  vi.useFakeTimers()
  clock = createTestClock()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Moves both the fake event loop and the fake clock forward together. */
const elapse = (ms: number): void => {
  clock.advance(ms)
  vi.advanceTimersByTime(ms)
}

/** One run of the pushed view, by id — undefined once it is no longer running. */
const run = (service: TimerService, runId: string): RunView | undefined =>
  service.getView().runs.find((candidate) => candidate.runId === runId)

/** The one run in progress, for a test that only ever starts one. */
const only = (service: TimerService): RunView | undefined =>
  service.getView().runs[0]

describe('createTimerService', () => {
  it('has no runs before anything starts', () => {
    const service = createTimerService(clock)

    expect(service.getView()).toEqual(IDLE_VIEW)
    service.dispose()
  })

  it('counts down once a preset starts', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(90_000)

    expect(only(service)?.countdown).toBe('23:30')
    expect(only(service)?.phaseLabel).toBe('Focus')
    // Named by the preset it runs, which is what every command has to say.
    expect(only(service)?.runId).toBe('pomodoro')
    service.dispose()
  })

  it('pushes the phase list the run is on, and where in it the timer is', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(90_000)

    const view = only(service)
    // Stripped to what a sequence bar draws: no `notify`, no ids.
    expect(view?.phases).toEqual([
      { label: 'Focus', minutes: 25 },
      { label: 'Break', minutes: 5 },
    ])
    expect(view?.phaseIndex).toBe(0)
    expect(view?.loop).toBe(true)
    expect(view?.nextPhaseMinutes).toBe(5)
    expect(view?.phaseProgress).toBeCloseTo(90_000 / (25 * MS_PER_MINUTE))
    service.dispose()
  })

  it('has no runs left once the only one is stopped', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    expect(service.stop('pomodoro')).toBe(true)

    expect(service.getView().runs).toEqual([])
    service.dispose()
  })

  it('notifies subscribers of a phase change exactly once', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))

    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)

    const withTransitions = updates.filter(
      (update) => update.transitions.length > 0,
    )
    expect(withTransitions).toHaveLength(1)
    expect(withTransitions[0]?.transitions[0]?.next?.label).toBe('Break')
    expect(only(service)?.phaseLabel).toBe('Break')
    service.dispose()
  })

  it('puts the user back in the phase they snoozed, and says which run', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))

    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)
    service.snooze('pomodoro', SNOOZE_MS)

    expect(only(service)?.phaseLabel).toBe('Focus')
    expect(only(service)?.countdown).toBe('05:00')

    const snoozes = updates.filter((update) => update.snoozed !== null)
    expect(snoozes).toHaveLength(1)
    // The run comes with it: two runs can each be sitting on a deferred
    // boundary, and history has to know whose stretch was extended.
    expect(snoozes[0]?.snoozed).toEqual({
      runId: 'pomodoro',
      phase: pomodoro.phases[0],
      at: T0 + 25 * MS_PER_MINUTE,
      extendedByMs: SNOOZE_MS,
    })
    service.dispose()
  })

  it('ignores a snooze with no boundary to defer', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))

    expect(service.snooze('pomodoro', SNOOZE_MS)).toBe(false)

    expect(updates).toEqual([])
    expect(service.getView().runs).toEqual([])
    service.dispose()
  })

  it('keeps counting down after a snooze runs out', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)
    service.snooze('pomodoro', SNOOZE_MS)

    elapse(SNOOZE_MS)

    expect(only(service)?.phaseLabel).toBe('Break')
    expect(only(service)?.countdown).toBe('05:00')
    service.dispose()
  })

  it('defers a boundary by whatever amount the caller asks for', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)

    expect(service.snooze('pomodoro', minutes(15))).toBe(true)

    expect(only(service)?.phaseLabel).toBe('Focus')
    elapse(minutes(15))
    expect(only(service)?.phaseLabel).toBe('Break')
    service.dispose()
  })

  it('stops polling when a non-looping preset finishes', () => {
    const service = createTimerService(clock)
    service.startPreset(once)

    elapse(2 * MS_PER_MINUTE)

    expect(service.getView().runs).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('stops on request and clears its poll timer', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    expect(vi.getTimerCount()).toBe(1)

    service.stop('pomodoro')

    expect(service.getView().runs).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('has nothing to stop for a run that is not going', () => {
    const service = createTimerService(clock)

    expect(service.stop('pomodoro')).toBe(false)
    service.dispose()
  })

  it('names the phase that starts next, so a view can offer to skip to it', () => {
    const service = createTimerService(clock)

    service.startPreset(pomodoro)
    expect(only(service)?.nextPhaseLabel).toBe('Break')

    elapse(25 * MS_PER_MINUTE)
    expect(only(service)?.phaseLabel).toBe('Break')
    expect(only(service)?.nextPhaseLabel).toBe('Focus')
    service.dispose()
  })

  it('skips to the next phase on request, and announces the boundary', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.startPreset(pomodoro)
    service.subscribe((update) => updates.push(update))

    elapse(10 * MS_PER_MINUTE)
    expect(service.skip('pomodoro')).toBe(true)

    expect(only(service)?.phaseLabel).toBe('Break')
    expect(only(service)?.countdown).toBe('05:00')
    expect(updates.at(-1)?.transitions).toEqual([
      expect.objectContaining({ cause: 'skipped', presetId: 'pomodoro' }),
    ])
    service.dispose()
  })

  it('has nothing to skip in a run that is not going, and stops polling when a skip ends one', () => {
    const service = createTimerService(clock)

    expect(service.skip('pomodoro')).toBe(false)

    service.startPreset({
      ...once,
      phases: [{ ...once.phases[0]!, minutes: 10 }],
    })
    expect(service.skip('once')).toBe(true)

    expect(service.getView().runs).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('corrects the remaining time on request', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(10 * MS_PER_MINUTE)
    expect(service.setRemaining('pomodoro', 2 * MS_PER_MINUTE)).toBe(true)

    expect(only(service)?.phaseLabel).toBe('Focus')
    expect(only(service)?.countdown).toBe('02:00')
    service.dispose()
  })

  it('has nothing to correct in a run that is not going', () => {
    const service = createTimerService(clock)

    expect(service.setRemaining('pomodoro', 5 * MS_PER_MINUTE)).toBe(false)
    service.dispose()
  })

  it('has no remaining time to correct at an unanswered boundary', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)

    expect(service.setRemaining('pomodoro', 2 * MS_PER_MINUTE)).toBe(false)
    service.dispose()
  })

  it('adds time to the running phase on request', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(10 * MS_PER_MINUTE)
    expect(service.addTime('pomodoro', 5 * MS_PER_MINUTE)).toBe(true)

    expect(only(service)?.phaseLabel).toBe('Focus')
    expect(only(service)?.countdown).toBe('20:00')
    service.dispose()
  })

  it('has nothing to add time to in a run that is not going', () => {
    const service = createTimerService(clock)

    expect(service.addTime('pomodoro', 5 * MS_PER_MINUTE)).toBe(false)
    service.dispose()
  })

  it('resumes a saved run still in progress, keeping its poll running', () => {
    const service = createTimerService(clock)
    clock.advance(10 * MS_PER_MINUTE)

    service.resume([
      {
        status: 'running',
        preset: pomodoro,
        phaseIndex: 0,
        phaseStartedAt: T0,
        phaseEndsAt: T0 + 25 * MS_PER_MINUTE,
        snoozedMs: 0,
      },
    ])

    expect(only(service)?.phaseLabel).toBe('Focus')
    expect(only(service)?.countdown).toBe('15:00')
    expect(vi.getTimerCount()).toBe(1)
    service.dispose()
  })

  it('drains a phase that finished while the app was closed, and reports it', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))
    clock.advance(26 * MS_PER_MINUTE)

    service.resume([
      {
        status: 'running',
        preset: pomodoro,
        phaseIndex: 0,
        phaseStartedAt: T0,
        phaseEndsAt: T0 + 25 * MS_PER_MINUTE,
        snoozedMs: 0,
      },
    ])

    expect(only(service)?.phaseLabel).toBe('Break')
    expect(updates.at(-1)?.transitions).toEqual([
      expect.objectContaining({ cause: 'elapsed', next: pomodoro.phases[1] }),
    ])
    service.dispose()
  })

  it('resuming a run that has fully finished leaves no run, and stops polling', () => {
    const service = createTimerService(clock)
    clock.advance(2 * MS_PER_MINUTE)

    service.resume([
      {
        status: 'running',
        preset: once,
        phaseIndex: 0,
        phaseStartedAt: T0,
        phaseEndsAt: T0 + MS_PER_MINUTE,
        snoozedMs: 0,
      },
    ])

    expect(service.getView().runs).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('exposes the raw states for anything that needs more than the view', () => {
    const service = createTimerService(clock)

    expect(service.getStates()).toEqual([])

    service.startPreset(pomodoro)
    expect(service.getStates()).toEqual([
      expect.objectContaining({ status: 'running', phaseIndex: 0 }),
    ])
    service.dispose()
  })

  it('drops listeners on unsubscribe', () => {
    const service = createTimerService(clock)
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)

    unsubscribe()
    service.startPreset(pomodoro)

    expect(listener).not.toHaveBeenCalled()
    service.dispose()
  })
})

describe('several presets at once', () => {
  it('runs them side by side, in the order they were started', () => {
    const service = createTimerService(clock)

    service.startPreset(pomodoro)
    service.startPreset(sitStand)
    elapse(90_000)

    expect(service.getView().runs.map((each) => each.runId)).toEqual([
      'pomodoro',
      'sit-stand',
    ])
    expect(run(service, 'pomodoro')?.countdown).toBe('23:30')
    expect(run(service, 'sit-stand')?.countdown).toBe('28:30')
    // One poll serves them both.
    expect(vi.getTimerCount()).toBe(1)
    service.dispose()
  })

  it('starting a preset that is already running restarts it in place', () => {
    const service = createTimerService(clock)

    service.startPreset(pomodoro)
    service.startPreset(sitStand)
    elapse(10 * MS_PER_MINUTE)
    service.startPreset(pomodoro)

    // One run, not two — and still first, so the menubar title does not
    // reshuffle under the user when they restart something.
    expect(service.getView().runs.map((each) => each.runId)).toEqual([
      'pomodoro',
      'sit-stand',
    ])
    expect(run(service, 'pomodoro')?.countdown).toBe('25:00')
    expect(run(service, 'sit-stand')?.countdown).toBe('20:00')
    service.dispose()
  })

  it('gives each run its own phase sequence and its own boundaries', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.startPreset(pomodoro)
    service.startPreset(sitStand)
    service.subscribe((update) => updates.push(update))

    // Pomodoro's Focus ends at 25 minutes; sit/stand's Sitting runs to 30.
    elapse(25 * MS_PER_MINUTE)

    expect(run(service, 'pomodoro')?.awaiting).toBe(true)
    expect(run(service, 'sit-stand')?.awaiting).toBe(false)
    expect(
      updates.flatMap((update) => update.transitions).map((t) => t.presetId),
    ).toEqual(['pomodoro'])
    service.dispose()
  })

  it('reports both boundaries when two runs cross one in the same tick', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.startPreset(pomodoro)
    service.startPreset({ ...sitStand, phases: pomodoro.phases })
    service.subscribe((update) => updates.push(update))

    elapse(25 * MS_PER_MINUTE)

    const transitions = updates.flatMap((update) => update.transitions)
    expect(transitions.map((each) => each.presetId)).toEqual([
      'pomodoro',
      'sit-stand',
    ])
    // Both drained against one reading of the clock: two runs that ended
    // together must not be recorded as ending a tick apart.
    expect(new Set(transitions.map((each) => each.at)).size).toBe(1)
    service.dispose()
  })

  it('commands reach only the run they name', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    service.startPreset(sitStand)

    elapse(10 * MS_PER_MINUTE)
    service.skip('pomodoro')

    expect(run(service, 'pomodoro')?.phaseLabel).toBe('Break')
    expect(run(service, 'sit-stand')?.phaseLabel).toBe('Sitting')

    service.addTime('sit-stand', 5 * MS_PER_MINUTE)
    expect(run(service, 'pomodoro')?.countdown).toBe('05:00')
    expect(run(service, 'sit-stand')?.countdown).toBe('25:00')
    service.dispose()
  })

  it('stopping one run leaves the others counting', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    service.startPreset(sitStand)

    expect(service.stop('pomodoro')).toBe(true)

    expect(service.getView().runs.map((each) => each.runId)).toEqual([
      'sit-stand',
    ])
    // Still one poll: the collection is not empty.
    expect(vi.getTimerCount()).toBe(1)
    service.dispose()
  })

  it('keeps polling for a live run while another holds at a boundary', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    service.startPreset(sitStand)

    elapse(25 * MS_PER_MINUTE)

    expect(run(service, 'pomodoro')?.awaiting).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    elapse(5 * MS_PER_MINUTE)

    // Sitting reached its own boundary; Pomodoro has not moved an inch behind
    // the one it is holding at.
    expect(run(service, 'sit-stand')?.awaiting).toBe(true)
    expect(run(service, 'pomodoro')?.countdown).toBe('05:00')
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('restores every saved run across a restart', () => {
    const service = createTimerService(clock)
    clock.advance(10 * MS_PER_MINUTE)

    service.resume([
      {
        status: 'running',
        preset: pomodoro,
        phaseIndex: 0,
        phaseStartedAt: T0,
        phaseEndsAt: T0 + 25 * MS_PER_MINUTE,
        snoozedMs: 0,
      },
      {
        status: 'awaiting',
        preset: sitStand,
        phaseIndex: 1,
        completedIndex: 0,
        boundaryAt: T0 + 5 * MS_PER_MINUTE,
      },
    ])

    expect(run(service, 'pomodoro')?.countdown).toBe('15:00')
    expect(run(service, 'sit-stand')?.awaiting).toBe(true)
    expect(run(service, 'sit-stand')?.phaseLabel).toBe('Standing')
    service.dispose()
  })

  it('drains each resumed run’s elapsed boundary independently', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))
    clock.advance(31 * MS_PER_MINUTE)

    service.resume([
      {
        status: 'running',
        preset: pomodoro,
        phaseIndex: 0,
        phaseStartedAt: T0,
        phaseEndsAt: T0 + 25 * MS_PER_MINUTE,
        snoozedMs: 0,
      },
      {
        status: 'running',
        preset: once,
        phaseIndex: 0,
        phaseStartedAt: T0,
        phaseEndsAt: T0 + MS_PER_MINUTE,
        snoozedMs: 0,
      },
    ])

    // Pomodoro comes back holding at one boundary; the one-shot ran out and is
    // gone — and both said so.
    expect(run(service, 'pomodoro')?.awaiting).toBe(true)
    expect(run(service, 'once')).toBeUndefined()
    expect(
      updates.flatMap((update) => update.transitions).map((t) => t.presetId),
    ).toEqual(['pomodoro', 'once'])
    service.dispose()
  })
})

describe('a boundary waiting to be confirmed', () => {
  it('pushes a view that names the phase about to start, at its full length', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(25 * MS_PER_MINUTE)

    expect(only(service)).toMatchObject({
      awaiting: true,
      phaseLabel: 'Break',
      countdown: '05:00',
      phaseIndex: 1,
      phaseProgress: 0,
    })
    service.dispose()
  })

  it('stops polling while it waits, and starts again when confirmed', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)
    service.subscribe((update) => updates.push(update))

    // Nothing is counting, so there is nothing to poll for: a minute of waiting
    // pushes no views at all.
    elapse(MS_PER_MINUTE)
    expect(updates).toHaveLength(0)

    expect(service.confirm('pomodoro')).toBe(true)
    elapse(2_000)

    // The confirm itself, then a view a second.
    expect(updates.length).toBeGreaterThan(2)
    expect(only(service)).toMatchObject({
      awaiting: false,
      phaseLabel: 'Break',
      countdown: '04:58',
    })
    service.dispose()
  })

  it('has nothing to confirm while a phase is running', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    expect(service.confirm('pomodoro')).toBe(false)
    service.dispose()
  })

  it('has nothing to confirm for a run that is not going', () => {
    const service = createTimerService(clock)

    expect(service.confirm('pomodoro')).toBe(false)
    service.dispose()
  })
})

/**
 * The properties that make a keyed collection worth having: what a run does is
 * what it would have done alone. If they ever diverge, the collection has grown
 * a decision of its own — which is exactly what forking the machine per run
 * would have cost.
 */
describe('runs are independent of each other', () => {
  /** A preset whose phases are drawn from the arbitrary, keyed by its index. */
  const presetArb = (index: number) =>
    fc
      .record({
        loop: fc.boolean(),
        phases: fc.array(
          fc.record({
            label: fc.constantFrom('Focus', 'Break', 'Sitting', 'Standing'),
            minutes: fc.integer({ min: 1, max: 40 }),
            notify: fc.boolean(),
          }),
          { minLength: 1, maxLength: 4 },
        ),
      })
      .map((fields): Preset => ({
        id: `preset-${index}`,
        name: `Preset ${index}`,
        ...fields,
      }))

  const presetsArb = fc
    .integer({ min: 1, max: 4 })
    .chain((count) =>
      fc.tuple(
        ...Array.from({ length: count }, (_, index) => presetArb(index)),
      ),
    )

  it('gives every run the view it would have had running alone', () => {
    fc.assert(
      fc.property(
        presetsArb,
        fc.integer({ min: 0, max: 90 }),
        (presets, elapsedMinutes) => {
          // One clock and one fake event loop for all of them, so the poll each
          // service runs fires at the same instants — the only difference left
          // would be the collection interfering with one of its members.
          const together = createTimerService(clock)
          for (const preset of presets) together.startPreset(preset)

          const alone = presets.map((preset) => {
            const service = createTimerService(clock)
            service.startPreset(preset)
            return service
          })

          elapse(elapsedMinutes * MS_PER_MINUTE)

          for (const [index, preset] of presets.entries()) {
            expect(run(together, preset.id)).toEqual(
              run(alone[index]!, preset.id),
            )
          }

          together.dispose()
          for (const service of alone) service.dispose()
        },
      ),
      { numRuns: 40 },
    )
  })

  it('holds exactly one run per distinct preset started', () => {
    fc.assert(
      fc.property(
        presetsArb,
        fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 8 }),
        (presets, restarts) => {
          const service = createTimerService(clock)
          for (const preset of presets) service.startPreset(preset)
          // Restarting any of them again, in any order, adds nothing — and
          // moves nothing: the order is the order they were first started.
          for (const index of restarts) {
            const preset = presets[index % presets.length]
            if (preset) service.startPreset(preset)
          }

          expect(service.getView().runs.map((each) => each.runId)).toEqual(
            presets.map((preset) => preset.id),
          )
          service.dispose()
        },
      ),
      { numRuns: 40 },
    )
  })
})
