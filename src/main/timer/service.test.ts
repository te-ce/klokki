import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import { SEED_PRESETS } from '../../shared/presets'
import type { Clock } from './clock'
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
