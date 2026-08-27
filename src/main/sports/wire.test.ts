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
    stop: vi.fn(),
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

  it('stops Sports from the overlay it raised, and closes it', () => {
    const service = fakeService()
    const close = vi.fn()
    const record = vi.fn()
    const controller = wireSportsAlerts(
      service,
      fakeStore(),
      vi.fn(),
      close,
      record,
    )
    service.fire()

    controller.stop()

    expect(service.stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    // A stop is not a round done, so no quantities are written.
    expect(record).not.toHaveBeenCalled()
    expect(service.confirm).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('stops nothing when no firing is showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), close)

    controller.stop()

    expect(service.stop).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('answers a second stop with nothing, the same as a second Done', () => {
    const service = fakeService()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), vi.fn())
    service.fire()

    controller.stop()
    controller.stop()

    // The overlay is gone after the first: a second answer must not disable a
    // schedule the user has since restarted.
    expect(service.stop).toHaveBeenCalledOnce()
    controller.dispose()
  })

  it('voids the alert when Sports is stopped from somewhere else', () => {
    const service = fakeService()
    const close = vi.fn()
    const record = vi.fn()
    const controller = wireSportsAlerts(
      service,
      fakeStore(),
      vi.fn(),
      close,
      record,
    )
    service.fire()

    // What the store's subscriber hands in — the tray item and the settings
    // window are both a save with `enabled: false`.
    controller.voidStopped(false)

    expect(close).toHaveBeenCalledOnce()
    // Voiding is not a stop of its own, and it is not a round done either.
    expect(service.stop).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('leaves the overlay alone while Sports is still running', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), close)
    service.fire()

    // Every save comes through this, not only the ones that turn Sports off.
    controller.voidStopped(true)

    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('voids nothing when no firing is showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), close)

    controller.voidStopped(false)

    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('closes once when its own stop comes back through the store', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireSportsAlerts(service, fakeStore(), vi.fn(), close)
    // The real store notifies synchronously, so wire.ts's subscriber voids the
    // alert while `stop()` is still on the stack.
    service.stop.mockImplementation(() => {
      controller.voidStopped(false)
    })
    service.fire()

    controller.stop()

    expect(close).toHaveBeenCalledOnce()
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
