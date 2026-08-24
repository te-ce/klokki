import { describe, expect, it, vi } from 'vitest'
import type { SportSettings } from '../../shared/sport'
import type { Clock } from '../timer/clock'
import { wireSportsAlerts } from './wire'

const settings: SportSettings = {
  intervalMinutes: 60,
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
  ],
  enabled: true,
}

/** A Sports service with no engine behind it — just a subscribable firing feed. */
const fakeService = () => {
  const listeners = new Set<() => void>()
  return {
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    snooze: vi.fn(() => true),
    confirm: vi.fn(() => true),
    fire: () => {
      for (const listener of listeners) listener()
    },
  }
}

const fakeStore = (current: SportSettings = settings) => ({
  get: vi.fn(() => current),
})

describe('wireSportsAlerts', () => {
  it('presents Sports as it fires', () => {
    const service = fakeService()
    const present = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), present, vi.fn())

    service.fire()

    expect(present).toHaveBeenCalledWith({
      activities: [
        { id: 'situps', name: 'Situps' },
        { id: 'squats', name: 'Squats' },
      ],
    })
    controller.dispose()
  })

  it('asks the engine to snooze on Snooze', () => {
    const service = fakeService()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), vi.fn())
    service.fire()

    const snoozed = controller.snooze(10 * 60_000)

    expect(service.snooze).toHaveBeenCalledWith(10 * 60_000)
    expect(snoozed).toBe(true)
    controller.dispose()
  })

  it('closes and reports false when snoozing with nothing showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), close)

    expect(controller.snooze(5 * 60_000)).toBe(false)
    expect(service.snooze).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('does nothing on confirm when nothing is showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), close)

    controller.confirm({})

    expect(close).not.toHaveBeenCalled()
    expect(service.confirm).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('starts the next interval when Sports is answered as done', () => {
    const service = fakeService()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), vi.fn())
    service.fire()

    controller.confirm({ situps: 20, squats: 15 })

    expect(service.confirm).toHaveBeenCalled()
    controller.dispose()
  })

  it('records one line per activity on Done, defaulting an unentered quantity to zero', () => {
    const service = fakeService()
    const record = vi.fn()
    const clock: Clock = { now: () => 1_700_000_000_000 }
    const controller = wireSportsAlerts(
      service,
      fakeStore(),
      vi.fn(),
      vi.fn(),
      record,
      clock,
    )
    service.fire()

    controller.confirm({ situps: 20 })

    expect(record).toHaveBeenCalledTimes(2)
    expect(record).toHaveBeenCalledWith({
      loggedAt: 1_700_000_000_000,
      activityId: 'situps',
      activityLabel: 'Situps',
      quantity: 20,
    })
    expect(record).toHaveBeenCalledWith({
      loggedAt: 1_700_000_000_000,
      activityId: 'squats',
      activityLabel: 'Squats',
      quantity: 0,
    })
    controller.dispose()
  })

  it('records nothing on a snooze — there are no quantities to log', () => {
    const service = fakeService()
    const record = vi.fn()
    const controller = wireSportsAlerts(
      service,
      fakeStore(),
      vi.fn(),
      vi.fn(),
      record,
    )
    service.fire()

    controller.snooze(5 * 60_000)

    expect(record).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('records nothing when confirm is called with nothing showing', () => {
    const service = fakeService()
    const record = vi.fn()
    const controller = wireSportsAlerts(
      service,
      fakeStore(),
      vi.fn(),
      vi.fn(),
      record,
    )

    controller.confirm({})

    expect(record).not.toHaveBeenCalled()
    controller.dispose()
  })
})
