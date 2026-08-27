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
    confirm: vi.fn(() => true),
    stop: vi.fn(),
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

  it('starts the next interval when the reminder is answered as done', () => {
    const service = fakeService()
    const controller = wireReminderAlerts(service, vi.fn(), vi.fn())
    service.fire([due('water', 'Drink water')])

    controller.complete(null)

    // The reminder held its next interval for this answer, so the answer is
    // what starts it — not the boundary the user took a while to notice.
    expect(service.confirm).toHaveBeenCalledWith('water')
    controller.dispose()
  })

  it('does not confirm an interval when nothing is showing', () => {
    const service = fakeService()
    const controller = wireReminderAlerts(service, vi.fn(), vi.fn())

    controller.complete(null)

    expect(service.confirm).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('stops the reminder the overlay is showing, and closes it', () => {
    const service = fakeService()
    const close = vi.fn()
    const record = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close, record)
    service.fire([due('water', 'Drink water')])

    controller.stop()

    // By which reminder is showing, never by an id from outside: a stale id
    // would stop one the user is not looking at.
    expect(service.stop).toHaveBeenCalledExactlyOnceWith('water')
    expect(close).toHaveBeenCalledOnce()
    // A stop is neither a "done" nor a "later", so there is nothing to log.
    expect(record).not.toHaveBeenCalled()
    expect(service.confirm).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('shows the queued reminder once the current one is stopped', () => {
    const service = fakeService()
    const present = vi.fn()
    const controller = wireReminderAlerts(service, present, vi.fn())
    service.fire([due('water', 'Drink water'), due('pushups', 'Pushups')])

    controller.stop()

    // Stopping one reminder is not an answer to the others behind it.
    expect(present).toHaveBeenLastCalledWith({ label: 'Pushups', unit: null })
    controller.dispose()
  })

  it('stops nothing when no reminder is showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close)

    controller.stop()

    expect(service.stop).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('voids the alert of a reminder stopped from somewhere else', () => {
    const service = fakeService()
    const close = vi.fn()
    const record = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close, record)
    service.fire([due('water', 'Drink water')])

    // What the store's subscriber hands in: the tray, the settings window and a
    // delete all read as "this one is no longer running".
    controller.voidStopped((id) => id !== 'water')

    expect(close).toHaveBeenCalledOnce()
    // Voiding an alert is not a stop of its own: whoever stopped the reminder
    // already did that, and nothing is logged either way.
    expect(service.stop).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('leaves the overlay of a reminder that is still running alone', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close)
    service.fire([due('water', 'Drink water')])

    controller.voidStopped((id) => id !== 'pushups')

    // The overlay showing is announcing a firing that is still perfectly
    // answerable — only the stopped reminder's alert is void.
    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('shows the queued reminder when the one showing is stopped elsewhere', () => {
    const service = fakeService()
    const present = vi.fn()
    const controller = wireReminderAlerts(service, present, vi.fn())
    service.fire([due('water', 'Drink water'), due('pushups', 'Pushups')])

    controller.voidStopped((id) => id !== 'water')

    expect(present).toHaveBeenLastCalledWith({ label: 'Pushups', unit: null })
    controller.dispose()
  })

  it('drops a queued reminder that was stopped before its turn came', () => {
    const service = fakeService()
    const present = vi.fn()
    const controller = wireReminderAlerts(service, present, vi.fn())
    service.fire([due('water', 'Drink water'), due('pushups', 'Pushups')])

    controller.voidStopped((id) => id !== 'pushups')
    controller.complete(null)

    // Water was answered and nothing is behind it: the reminder stopped while
    // it waited never gets an overlay of its own.
    expect(present).toHaveBeenCalledOnce()
    controller.dispose()
  })

  it('voids nothing when no reminder is showing', () => {
    const service = fakeService()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, vi.fn(), close)

    controller.voidStopped(() => false)

    expect(close).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('advances the queue once when its own stop comes back through the store', () => {
    const service = fakeService()
    const present = vi.fn()
    const close = vi.fn()
    const controller = wireReminderAlerts(service, present, close)
    // The real store notifies synchronously, so wire.ts's subscriber voids
    // stopped alerts while `stop()` is still on the stack.
    service.stop.mockImplementation(() => {
      controller.voidStopped((id) => id !== 'water')
    })
    service.fire([due('water', 'Drink water'), due('pushups', 'Pushups')])

    controller.stop()

    // Once, not twice: a second advance would close the overlay the queued
    // reminder had only just been given and skip it unanswered.
    expect(close).toHaveBeenCalledOnce()
    expect(present).toHaveBeenCalledTimes(2)
    expect(present).toHaveBeenLastCalledWith({ label: 'Pushups', unit: null })
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
