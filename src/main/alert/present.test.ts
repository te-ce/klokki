import { describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alert'
import { createAlertPresenter } from './present'

const surface = () => ({
  notify: vi.fn(),
  withdraw: vi.fn(),
  showOverlay: vi.fn(),
})

const alert: Alert = { completedLabel: 'Focus', nextLabel: 'Break' }

describe('presenting an alert', () => {
  it('shows both halves, because either one alone is missable', () => {
    const platform = surface()

    createAlertPresenter(platform, vi.fn())(alert)

    expect(platform.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Focus finished',
        body: 'Break starting now',
      }),
    )
    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('still shows the overlay when the notification cannot be shown', () => {
    const platform = surface()
    // Do Not Disturb, a denied permission, a Mac with notifications off: the
    // overlay is exactly what has to survive it.
    platform.notify.mockImplementation(() => {
      throw new Error('no notification centre')
    })

    createAlertPresenter(platform, vi.fn())(alert)

    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('supersedes the last alert rather than stacking a second overlay', () => {
    const platform = surface()
    const present = createAlertPresenter(platform, vi.fn())

    present(alert)
    present({ completedLabel: 'Break', nextLabel: 'Focus' })

    expect(platform.showOverlay).toHaveBeenCalledTimes(2)
    expect(platform.showOverlay).toHaveBeenLastCalledWith({
      completedLabel: 'Break',
      nextLabel: 'Focus',
    })
  })

  it('gives the notification a Stop button that takes the overlay path', () => {
    const platform = surface()
    const stop = vi.fn()

    createAlertPresenter(platform, stop)(alert)

    // Both halves of one alert must stop the same thing the same way.
    const text = platform.notify.mock.calls[0]?.[0] as {
      actions: readonly { label: string; run: () => void }[]
    }
    expect(text.actions.map((action) => action.label)).toEqual(['Stop Timer'])
    text.actions[0]?.run()
    expect(stop).toHaveBeenCalledOnce()
  })
})
