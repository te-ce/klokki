import { describe, expect, it, vi } from 'vitest'
import type { Alert } from '../../shared/alert'
import { createAlertPresenter } from './present'

const surface = () => ({
  notify: vi.fn(),
  showOverlay: vi.fn(),
})

const alert: Alert = { completedLabel: 'Focus', nextLabel: 'Break' }

describe('presenting an alert', () => {
  it('shows both halves, because either one alone is missable', () => {
    const platform = surface()

    createAlertPresenter(platform)(alert)

    expect(platform.notify).toHaveBeenCalledWith({
      title: 'Focus finished',
      body: 'Break starting now',
    })
    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('still shows the overlay when the notification cannot be shown', () => {
    const platform = surface()
    // Do Not Disturb, a denied permission, a Mac with notifications off: the
    // overlay is exactly what has to survive it.
    platform.notify.mockImplementation(() => {
      throw new Error('no notification centre')
    })

    createAlertPresenter(platform)(alert)

    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('supersedes the last alert rather than stacking a second overlay', () => {
    const platform = surface()
    const present = createAlertPresenter(platform)

    present(alert)
    present({ completedLabel: 'Break', nextLabel: 'Focus' })

    expect(platform.showOverlay).toHaveBeenCalledTimes(2)
    expect(platform.showOverlay).toHaveBeenLastCalledWith({
      completedLabel: 'Break',
      nextLabel: 'Focus',
    })
  })
})
