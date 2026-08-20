import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import type { Clock } from './clock'
import { SNOOZE_MS } from '../../shared/timer'
import { createTimerService, type TimerUpdate } from './service'

const T0 = 1_700_000_000_000
const pomodoro = SEED_PRESETS[0]!

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

    expect(service.getView()).toEqual({
      running: false,
      presetName: null,
      phaseLabel: null,
      nextPhaseLabel: null,
      remainingMs: 0,
      countdown: '00:00',
    })
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
    service.snooze()

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

    service.snooze()

    expect(updates).toEqual([])
    expect(service.getView().running).toBe(false)
    service.dispose()
  })

  it('keeps counting down after a snooze runs out', () => {
    const service = createTimerService(clock)
    service.startPreset(pomodoro)
    elapse(25 * MS_PER_MINUTE)
    service.snooze()

    elapse(SNOOZE_MS)

    expect(service.getView().phaseLabel).toBe('Break')
    expect(service.getView().countdown).toBe('05:00')
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
