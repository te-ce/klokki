import { describe, expect, it, vi } from 'vitest'
import type { ReminderAlert } from '../../shared/reminder-alert'
import { createReminderAlertPresenter } from './present'

const surface = () => ({
  notify: vi.fn(),
  showOverlay: vi.fn(),
})

const withUnit: ReminderAlert = { label: 'Pushups', unit: 'reps' }
const withoutUnit: ReminderAlert = { label: 'Drink water', unit: null }

describe('presenting a reminder alert', () => {
  it('shows both halves, because either one alone is missable', () => {
    const platform = surface()

    createReminderAlertPresenter(platform, vi.fn())(withUnit)

    expect(platform.notify).toHaveBeenCalled()
    expect(platform.showOverlay).toHaveBeenCalledWith(withUnit)
  })

  it('still shows the overlay when the notification cannot be shown', () => {
    const platform = surface()
    platform.notify.mockImplementation(() => {
      throw new Error('no notification centre')
    })

    createReminderAlertPresenter(platform, vi.fn())(withoutUnit)

    expect(platform.showOverlay).toHaveBeenCalledWith(withoutUnit)
  })

  it('gives the notification a Stop button that takes the overlay path', () => {
    const platform = surface()
    const stop = vi.fn()

    createReminderAlertPresenter(platform, stop)(withUnit)

    const text = platform.notify.mock.calls[0]?.[0] as {
      actions: readonly { label: string; run: () => void }[]
    }
    expect(text.actions.map((action) => action.label)).toEqual([
      'Stop Reminder',
    ])
    text.actions[0]?.run()
    expect(stop).toHaveBeenCalledOnce()
  })
})
