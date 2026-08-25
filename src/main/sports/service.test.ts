import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_MINUTE } from '../../shared/preset'
import type { SportSettings } from '../../shared/sport'
import type { Clock } from '../timer/clock'
import { STOPPED } from './engine'
import { createSportsService } from './service'

const T0 = 1_700_000_000_000
const minutes = (count: number): number => count * MS_PER_MINUTE

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

const elapse = (ms: number): void => {
  clock.advance(ms)
  vi.advanceTimersByTime(ms)
}

const settings: SportSettings = {
  intervalMinutes: 60,
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
  ],
  enabled: true,
}

describe('createSportsService', () => {
  it('starts with nothing scheduled', () => {
    const service = createSportsService(clock)
    expect(service.getState()).toEqual(STOPPED)
    service.dispose()
  })

  it('schedules newly enabled settings and fires at the boundary', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setSettings(settings)
    elapse(minutes(60))

    expect(listener).toHaveBeenCalledTimes(1)
    service.dispose()
  })

  it('starts the next interval only once the firing is confirmed', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setSettings(settings)
    elapse(minutes(60))
    expect(listener).toHaveBeenCalledTimes(1)

    // Answered ten minutes late: the interval that follows is a whole hour
    // from the answer, not from the boundary.
    elapse(minutes(10))
    expect(service.confirm()).toBe(true)
    elapse(minutes(59))
    expect(listener).toHaveBeenCalledTimes(1)
    elapse(minutes(1))
    expect(listener).toHaveBeenCalledTimes(2)
    service.dispose()
  })

  it('restarts on demand, whether or not it was scheduled', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setSettings(settings)
    elapse(minutes(20))
    expect(service.start()).toBe(true)
    elapse(minutes(59))
    expect(listener).not.toHaveBeenCalled()
    elapse(minutes(1))
    expect(listener).toHaveBeenCalledTimes(1)
    service.dispose()
  })

  it('cannot start with no activities or a zero interval', () => {
    const service = createSportsService(clock)
    service.setSettings({ ...settings, activities: [] })
    expect(service.start()).toBe(false)

    service.setSettings({ ...settings, intervalMinutes: 0 })
    expect(service.start()).toBe(false)
    service.dispose()
  })

  it('fires immediately from the tray, showing the overlay right away', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setSettings(settings)
    expect(service.fireNow()).toBe(true)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(service.getState()).toEqual({ scheduled: true, nextFireAt: null })
    service.dispose()
  })

  it('starts the next interval from the answer to a forced firing, same as a scheduled one', () => {
    const service = createSportsService(clock)
    service.setSettings(settings)
    service.fireNow()
    elapse(minutes(3))

    expect(service.confirm()).toBe(true)
    expect(service.getState()).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(3) + minutes(60),
    })
    service.dispose()
  })

  it('does not re-fire or reopen a firing already awaiting an answer', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setSettings(settings)
    service.fireNow()
    expect(listener).toHaveBeenCalledTimes(1)

    expect(service.fireNow()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    service.dispose()
  })

  it('cannot fire with no activities or a zero interval', () => {
    const service = createSportsService(clock)
    service.setSettings({ ...settings, activities: [] })
    expect(service.fireNow()).toBe(false)

    service.setSettings({ ...settings, intervalMinutes: 0 })
    expect(service.fireNow()).toBe(false)
    service.dispose()
  })

  it('has nothing to confirm while idle', () => {
    const service = createSportsService(clock)
    expect(service.confirm()).toBe(false)
    service.dispose()
  })

  it('stops when disabled and does not fire', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.setSettings(settings)
    service.setSettings({ ...settings, enabled: false })
    elapse(minutes(60))

    expect(listener).not.toHaveBeenCalled()
    expect(service.getState()).toEqual(STOPPED)
    service.dispose()
  })

  it('resumes a schedule loaded from disk instead of scheduling fresh', () => {
    const service = createSportsService(clock)
    const loaded = { scheduled: true, nextFireAt: T0 + minutes(5) }

    service.resume(loaded, settings)

    expect(service.getState()).toEqual(loaded)
    service.dispose()
  })

  it('fires a firing already due at resume, e.g. after time asleep', () => {
    const service = createSportsService(clock)
    const listener = vi.fn()
    service.subscribe(listener)

    service.resume({ scheduled: true, nextFireAt: T0 - 1 }, settings)

    expect(listener).toHaveBeenCalledTimes(1)
    service.dispose()
  })

  it('snoozes the firing rather than starting a fresh interval', () => {
    const service = createSportsService(clock)
    service.setSettings(settings)
    elapse(minutes(60))

    const snoozed = service.snooze(minutes(5))

    expect(snoozed).toBe(true)
    expect(service.getState()).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(65),
    })
    service.dispose()
  })

  it('reports false when there is nothing running to snooze', () => {
    const service = createSportsService(clock)
    expect(service.snooze(minutes(5))).toBe(false)
    service.dispose()
  })

  it('corrects the running countdown to a target', () => {
    const service = createSportsService(clock)
    service.setSettings(settings)

    expect(service.setRemaining(minutes(5))).toBe(true)
    expect(service.getState()).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(5),
    })
    service.dispose()
  })

  it('cannot correct a countdown that is not running', () => {
    const service = createSportsService(clock)
    expect(service.setRemaining(minutes(5))).toBe(false)
    service.dispose()
  })

  it('adds time to the running countdown', () => {
    const service = createSportsService(clock)
    service.setSettings(settings)

    expect(service.addTime(minutes(5))).toBe(true)
    expect(service.getState()).toEqual({
      scheduled: true,
      nextFireAt: T0 + minutes(65),
    })
    service.dispose()
  })

  it('cannot add time to a countdown that is not running', () => {
    const service = createSportsService(clock)
    expect(service.addTime(minutes(5))).toBe(false)
    service.dispose()
  })

  it('stops polling once nothing is scheduled', () => {
    const service = createSportsService(clock)
    service.setSettings(settings)

    service.setSettings({ ...settings, enabled: false })

    expect(vi.getTimerCount()).toBe(0)
    service.dispose()
  })
})
