import { describe, expect, it, vi } from 'vitest'
import type { SportSettings } from '../../shared/sport'
import { fireSportsNow, logSports, startSports, stopSports } from './start'

const settings: SportSettings = {
  intervalMinutes: 60,
  activities: [{ id: 'situps', name: 'Situps' }],
  enabled: true,
}

const fakes = (initial: SportSettings) => {
  let current = initial
  const store = {
    get: vi.fn(() => current),
    save: vi.fn((next: SportSettings) => {
      current = next
      return { ok: true } as const
    }),
    subscribe: vi.fn(() => () => {}),
  }
  const service = { start: vi.fn(() => true), fireNow: vi.fn(() => true) }
  return { store, service }
}

describe('startSports', () => {
  it('schedules Sports that was already on', () => {
    const { store, service } = fakes(settings)

    startSports(store, service as never)

    expect(store.save).not.toHaveBeenCalled()
    expect(service.start).toHaveBeenCalled()
  })

  it('turns Sports on before scheduling it', () => {
    const { store, service } = fakes({ ...settings, enabled: false })

    startSports(store, service as never)

    expect(store.save).toHaveBeenCalledWith({ ...settings, enabled: true })
    expect(service.start).toHaveBeenCalled()
  })
})

describe('fireSportsNow', () => {
  it('fires Sports that was already on', () => {
    const { store, service } = fakes(settings)

    expect(fireSportsNow(store, service as never)).toBe(true)

    expect(store.save).not.toHaveBeenCalled()
    expect(service.fireNow).toHaveBeenCalled()
  })

  it('turns Sports on before firing it', () => {
    const { store, service } = fakes({ ...settings, enabled: false })

    fireSportsNow(store, service as never)

    expect(store.save).toHaveBeenCalledWith({ ...settings, enabled: true })
    expect(service.fireNow).toHaveBeenCalled()
  })
})

describe('logSports', () => {
  const store = { get: vi.fn(() => settings) }
  const clock = { now: () => 1_700_000_000_000 }

  it('records only the activities given a number', () => {
    const record = vi.fn()
    const service = {
      getState: vi.fn(() => ({ scheduled: false, nextFireAt: null })),
      start: vi.fn(),
    }

    logSports(store as never, service as never, record, { situps: 20 }, clock)

    expect(record).toHaveBeenCalledWith({
      loggedAt: 1_700_000_000_000,
      activityId: 'situps',
      activityLabel: 'Situps',
      quantity: 20,
    })
  })

  it('does not start Sports when it was not scheduled', () => {
    const service = {
      getState: vi.fn(() => ({ scheduled: false, nextFireAt: null })),
      start: vi.fn(),
    }

    logSports(store as never, service as never, vi.fn(), { situps: 20 }, clock)

    expect(service.start).not.toHaveBeenCalled()
  })

  it('restarts the interval when Sports was already scheduled', () => {
    const service = {
      getState: vi.fn(() => ({
        scheduled: true,
        nextFireAt: 1_700_003_600_000,
      })),
      start: vi.fn(),
    }

    logSports(store as never, service as never, vi.fn(), { situps: 20 }, clock)

    expect(service.start).toHaveBeenCalled()
  })
})

describe('stopSports', () => {
  it('disables Sports that is on', () => {
    const { store } = fakes(settings)

    stopSports(store as never)

    expect(store.save).toHaveBeenCalledWith({ ...settings, enabled: false })
  })

  it('does nothing when Sports is already off', () => {
    const { store } = fakes({ ...settings, enabled: false })

    stopSports(store as never)

    expect(store.save).not.toHaveBeenCalled()
  })
})
