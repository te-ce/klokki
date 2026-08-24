import { describe, expect, it, vi } from 'vitest'
import type { SportsAlert } from '../../shared/sports-alert'
import { createSportsAlertPresenter } from './present'

const surface = () => ({
  notify: vi.fn(),
  showOverlay: vi.fn(),
})

const alert: SportsAlert = {
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
  ],
}

describe('presenting a Sports alert', () => {
  it('shows both halves, because either one alone is missable', () => {
    const platform = surface()

    createSportsAlertPresenter(platform)(alert)

    expect(platform.notify).toHaveBeenCalled()
    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('still shows the overlay when the notification cannot be shown', () => {
    const platform = surface()
    platform.notify.mockImplementation(() => {
      throw new Error('no notification centre')
    })

    createSportsAlertPresenter(platform)(alert)

    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })
})
