import { describe, expect, it, vi } from 'vitest'
import type { SportSettings } from '../../shared/sport'
import { startSports, stopSports } from './start'

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
  const service = { start: vi.fn(() => true) }
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
