import { describe, expect, it, vi } from 'vitest'
import type { ReminderDefinition } from '../../shared/reminder'
import { startReminderById } from './start'

const water: ReminderDefinition = {
  id: 'water',
  name: 'Drink water',
  intervalMinutes: 30,
  steps: [{ label: 'Drink a glass' }],
  enabled: true,
}

/** The store and the service, as much of each as a start touches. */
const fakes = (reminders: readonly ReminderDefinition[]) => {
  const store = {
    list: vi.fn(() => reminders),
    save: vi.fn(() => ({ ok: true }) as const),
    remove: vi.fn(),
    setEnabled: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  }
  const service = { start: vi.fn(() => true) }
  return { store, service }
}

describe('startReminderById', () => {
  it('schedules a reminder that was already on', () => {
    const { store, service } = fakes([water])

    startReminderById(store, service as never, 'water')

    // Nothing to enable, and the interval starts over: what "Restart" promises.
    expect(store.setEnabled).not.toHaveBeenCalled()
    expect(service.start).toHaveBeenCalledWith('water')
  })

  it('turns a disabled reminder on before scheduling it', () => {
    const { store, service } = fakes([{ ...water, enabled: false }])

    startReminderById(store, service as never, 'water')

    // Enabled first, or the engine drops the schedule as belonging to a
    // reminder that is switched off.
    expect(store.setEnabled).toHaveBeenCalledWith('water', true)
    expect(service.start).toHaveBeenCalledWith('water')
  })

  it('does nothing for an id the store has never heard of', () => {
    const { store, service } = fakes([water])

    startReminderById(store, service as never, 'gone')

    expect(store.setEnabled).not.toHaveBeenCalled()
    expect(service.start).not.toHaveBeenCalled()
  })
})
