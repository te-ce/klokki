import { describe, expect, it, vi } from 'vitest'
import type { Clock } from '../timer/clock'
import type { ReminderDue } from './engine'
import { wireReminderAlerts } from './wire'

const due = (definitionId: string, label: string): ReminderDue => ({
  definitionId,
  step: { label },
  at: 0,
})

/** A reminder service with no engine behind it — just a subscribable due feed. */
const fakeService = () => {
  const listeners = new Set<(due: readonly ReminderDue[]) => void>()
  return {
    subscribe: vi.fn((listener: (due: readonly ReminderDue[]) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    snooze: vi.fn(() => true),
    fire: (batch: readonly ReminderDue[]) => {
      for (const listener of listeners) listener(batch)
    },
  }
}

describe('wireReminderAlerts', () => {
  it('presents a due reminder as it fires', () => {
    const service = fakeService()
    const present = vi.fn()
    const controller = wireReminderAlerts(service, present, vi.fn())

    service.fire([due('water', 'Drink water')])

    expect(present).toHaveBeenCalledWith({ label: 'Drink water', unit: null })
    controller.dispose()
  })

  it('queues a second reminder rather than presenting it immediately', () => {
    const service = fakeService()
    const present = vi.fn()
    const controller = wireReminderAlerts(service, present, vi.fn())

    service.fire([due('water', 'Drink water'), due('pushups', 'Pushups')])

    expect(present).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('shows the queued reminder once the current one is answered with Done', () => {
    const service = fakeService()
    const present = vi.fn()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, present, close)
    service.fire([due('water', 'Drink water'), due('pushups', 'Pushups')])

    controller.complete(null)

    expect(close).toHaveBeenCalledOnce()
    expect(present).toHaveBeenLastCalledWith({ label: 'Pushups', unit: null })
    controller.dispose()
  })

  it('asks the engine to reschedule the same step on Snooze, not advance past it', () => {
    const service = fakeService()
    const controller = wireReminderAlerts(service, vi.fn(), vi.fn())
    service.fire([due('water', 'Drink water')])

    const snoozed = controller.snooze(10 * 60_000)

    expect(service.snooze).toHaveBeenCalledWith('water', 10 * 60_000)
    expect(snoozed).toBe(true)
    controller.dispose()
  })

  it('closes and reports false when snoozing with nothing showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close)

    expect(controller.snooze(5 * 60_000)).toBe(false)
    expect(service.snooze).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('does nothing on Done when nothing is showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close)

    controller.complete(null)

    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('records a Done answer for history, quantity and all', () => {
    const service = fakeService()
    const record = vi.fn()
    const clock: Clock = { now: () => 1_700_000_000_000 }
    const controller = wireReminderAlerts(
      service,
      vi.fn(),
      vi.fn(),
      record,
      clock,
    )
    service.fire([due('pushups', 'Pushups')])

    controller.complete(20)

    expect(record).toHaveBeenCalledExactlyOnceWith({
      loggedAt: 1_700_000_000_000,
      reminderId: 'pushups',
      stepLabel: 'Pushups',
      quantity: 20,
      outcome: 'done',
    })
    controller.dispose()
  })

  it('records a successful Snooze answer for history, with a null quantity', () => {
    const service = fakeService()
    const record = vi.fn()
    const clock: Clock = { now: () => 1_700_000_000_000 }
    const controller = wireReminderAlerts(
      service,
      vi.fn(),
      vi.fn(),
      record,
      clock,
    )
    service.fire([due('water', 'Drink water')])

    controller.snooze(5 * 60_000)

    expect(record).toHaveBeenCalledExactlyOnceWith({
      loggedAt: 1_700_000_000_000,
      reminderId: 'water',
      stepLabel: 'Drink water',
      quantity: null,
      outcome: 'snoozed',
    })
    controller.dispose()
  })

  it('does not record a declined Snooze — nothing really happened', () => {
    const service = fakeService()
    service.snooze.mockReturnValue(false)
    const record = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), vi.fn(), record)
    service.fire([due('water', 'Drink water')])

    controller.snooze(5 * 60_000)

    expect(record).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('does not record anything when Done or Snooze is answered with nothing showing', () => {
    const service = fakeService()
    const record = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), vi.fn(), record)

    controller.complete(null)
    controller.snooze(5 * 60_000)

    expect(record).not.toHaveBeenCalled()
    controller.dispose()
  })
})
