import { describe, expect, it, vi } from 'vitest'
import { voidAlert } from './void'

describe('voiding an alert', () => {
  it('closes the overlay and takes the notification back', () => {
    const notification = { withdraw: vi.fn() }
    const overlay = { close: vi.fn() }

    voidAlert(notification, overlay)()

    // Both halves, because the alert was one thing shown in two places: the
    // window is what the user is looking at, and the notification is the half
    // that outlives it in Notification Center.
    expect(overlay.close).toHaveBeenCalledOnce()
    expect(notification.withdraw).toHaveBeenCalledOnce()
  })

  it('still closes the overlay when the notification cannot be withdrawn', () => {
    const notification = {
      withdraw: vi.fn(() => {
        throw new Error('no notification centre')
      }),
    }
    const overlay = { close: vi.fn() }

    expect(() => voidAlert(notification, overlay)()).not.toThrow()

    // The same rule as showing one: the half the platform can swallow must not
    // be able to take the other one down with it.
    expect(overlay.close).toHaveBeenCalledOnce()
  })
})
