import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import { IDLE_VIEW } from '../../shared/test-support/timer-view'
import type { Clock } from './clock'
import { createTimerService, type TimerUpdate } from './service'

const T0 = 1_700_000_000_000
const pomodoro = SEED_PRESETS[0]!
const minutes = (count: number): number => count * MS_PER_MINUTE
const SNOOZE_MS = minutes(5)

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

describe('createTimerService', () => {
  it('is idle before anything starts', () => {
    const service = createTimerService(clock)

    expect(service.getView()).toEqual(IDLE_VIEW)
    service.dispose()
  })

  it('counts down once a preset starts', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(90_000)

    expect(service.getView().countdown).toBe('23:30')
    expect(service.getView().phaseLabel).toBe('Focus')
    service.dispose()
  })

  it('pushes the phase list the run is on, and where in it the timer is', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(90_000)

    const view = service.getView()
    // Stripped to what a sequence bar draws: no `notify`, no ids.
    expect(view.phases).toEqual([
      { label: 'Focus', minutes: 25 },
      { label: 'Break', minutes: 5 },
    ])
    expect(view.phaseIndex).toBe(0)
    expect(view.loop).toBe(true)
    expect(view.nextPhaseMinutes).toBe(5)
    expect(view.phaseProgress).toBeCloseTo(90_000 / (25 * MS_PER_MINUTE))
    service.dispose()
  })

  it('reports no phases at all once nothing is running', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    service.stop()

    expect(service.getView().phases).toEqual([])
    expect(service.getView().phaseIndex).toBe(-1)
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
    expect(service.getView().phaseLabel).toBe('Break')
    service.dispose()
  })

  it('puts the user back in the phase they snoozed, and says so once', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))

    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)
    service.snooze(SNOOZE_MS)

    expect(service.getView().phaseLabel).toBe('Focus')
    expect(service.getView().countdown).toBe('05:00')

    const snoozes = updates.filter((update) => update.snoozed !== null)
    expect(snoozes).toHaveLength(1)
    expect(snoozes[0]?.snoozed).toEqual({
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

    service.snooze(SNOOZE_MS)

    expect(updates).toEqual([])
    expect(service.getView().running).toBe(false)
    service.dispose()
  })

  it('keeps counting down after a snooze runs out', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)
    service.snooze(SNOOZE_MS)

    elapse(SNOOZE_MS)

    expect(service.getView().phaseLabel).toBe('Break')
    expect(service.getView().countdown).toBe('05:00')
    service.dispose()
  })

  it('defers a boundary by whatever amount the caller asks for', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)

    expect(service.snooze(minutes(15))).toBe(true)

    expect(service.getView().phaseLabel).toBe('Focus')
    elapse(minutes(15))
    expect(service.getView().phaseLabel).toBe('Break')
    service.dispose()
  })

  it('stops polling when a non-looping preset finishes', () => {
    const service = createTimerService(clock)
    service.startPreset({
      id: 'once',
      name: 'One shot',
      loop: false,
      phases: [{ label: 'Only', minutes: 1, notify: true }],
    })

    elapse(2 * MS_PER_MINUTE)

    expect(service.getView().running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('stops on request and clears its poll timer', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    expect(vi.getTimerCount()).toBe(1)

    service.stop()

    expect(service.getView().running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('names the phase that starts next, so a view can offer to skip to it', () => {
    const service = createTimerService(clock)

    expect(service.getView().nextPhaseLabel).toBeNull()
    service.startPreset(pomodoro)
    expect(service.getView().nextPhaseLabel).toBe('Break')

    elapse(25 * MS_PER_MINUTE)
    expect(service.getView().phaseLabel).toBe('Break')
    expect(service.getView().nextPhaseLabel).toBe('Focus')
    service.dispose()
  })

  it('skips to the next phase on request, and announces the boundary', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.startPreset(pomodoro)
    service.subscribe((update) => updates.push(update))

    elapse(10 * MS_PER_MINUTE)
    expect(service.skip()).toBe(true)

    expect(service.getView().phaseLabel).toBe('Break')
    expect(service.getView().countdown).toBe('05:00')
    expect(updates.at(-1)?.transitions).toEqual([
      expect.objectContaining({ cause: 'skipped' }),
    ])
    service.dispose()
  })

  it('has nothing to skip while idle, and stops polling when a skip ends the run', () => {
    const service = createTimerService(clock)

    expect(service.skip()).toBe(false)

    service.startPreset({
      id: 'once',
      name: 'One shot',
      loop: false,
      phases: [{ label: 'Only', minutes: 10, notify: true }],
    })
    expect(service.skip()).toBe(true)

    expect(service.getView().running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('corrects the remaining time on request', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(10 * MS_PER_MINUTE)
    expect(service.setRemaining(2 * MS_PER_MINUTE)).toBe(true)

    expect(service.getView().phaseLabel).toBe('Focus')
    expect(service.getView().countdown).toBe('02:00')
    service.dispose()
  })

  it('has nothing to correct while idle', () => {
    const service = createTimerService(clock)

    expect(service.setRemaining(5 * MS_PER_MINUTE)).toBe(false)
    service.dispose()
  })

  it('adds time to the running phase on request', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(10 * MS_PER_MINUTE)
    expect(service.addTime(5 * MS_PER_MINUTE)).toBe(true)

    expect(service.getView().phaseLabel).toBe('Focus')
    expect(service.getView().countdown).toBe('20:00')
    service.dispose()
  })

  it('has nothing to add time to while idle', () => {
    const service = createTimerService(clock)

    expect(service.addTime(5 * MS_PER_MINUTE)).toBe(false)
    service.dispose()
  })

  it('resumes a saved state still in progress, keeping its poll running', () => {
    const service = createTimerService(clock)
    clock.advance(10 * MS_PER_MINUTE)

    service.resume({
      status: 'running',
      preset: pomodoro,
      phaseIndex: 0,
      phaseStartedAt: T0,
      phaseEndsAt: T0 + 25 * MS_PER_MINUTE,
      snoozedMs: 0,
    })

    expect(service.getView().phaseLabel).toBe('Focus')
    expect(service.getView().countdown).toBe('15:00')
    expect(vi.getTimerCount()).toBe(1)
    service.dispose()
  })

  it('drains a phase that finished while the app was closed, and reports it', () => {
    const service = createTimerService(clock)
    const updates: TimerUpdate[] = []
    service.subscribe((update) => updates.push(update))
    clock.advance(26 * MS_PER_MINUTE)

    service.resume({
      status: 'running',
      preset: pomodoro,
      phaseIndex: 0,
      phaseStartedAt: T0,
      phaseEndsAt: T0 + 25 * MS_PER_MINUTE,
      snoozedMs: 0,
    })

    expect(service.getView().phaseLabel).toBe('Break')
    expect(updates.at(-1)?.transitions).toEqual([
      expect.objectContaining({ cause: 'elapsed', next: pomodoro.phases[1] }),
    ])
    service.dispose()
  })

  it('resuming a state that has fully finished ends up idle, and stops polling', () => {
    const service = createTimerService(clock)
    clock.advance(2 * MS_PER_MINUTE)
    const once = {
      id: 'once',
      name: 'One shot',
      loop: false,
      phases: [{ label: 'Only', minutes: 1, notify: true }],
    }

    service.resume({
      status: 'running',
      preset: once,
      phaseIndex: 0,
      phaseStartedAt: T0,
      phaseEndsAt: T0 + MS_PER_MINUTE,
      snoozedMs: 0,
    })

    expect(service.getView().running).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })

  it('exposes the raw state for anything that needs more than the view', () => {
    const service = createTimerService(clock)

    expect(service.getState()).toEqual({ status: 'idle' })

    service.startPreset(pomodoro)
    expect(service.getState()).toMatchObject({
      status: 'running',
      phaseIndex: 0,
    })
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

describe('a boundary waiting to be confirmed', () => {
  it('pushes a view that names the phase about to start, at its full length', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    elapse(25 * MS_PER_MINUTE)

    expect(service.getView()).toMatchObject({
      running: true,
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

    expect(service.confirm()).toBe(true)
    elapse(2_000)

    // The confirm itself, then a view a second.
    expect(updates.length).toBeGreaterThan(2)
    expect(service.getView()).toMatchObject({
      awaiting: false,
      phaseLabel: 'Break',
      countdown: '04:58',
    })
    service.dispose()
  })

  it('has nothing to confirm while a phase is running', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)

    expect(service.confirm()).toBe(false)
    service.dispose()
  })
})
