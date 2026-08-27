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

    createSportsAlertPresenter(platform, vi.fn())(alert)

    expect(platform.notify).toHaveBeenCalled()
    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('still shows the overlay when the notification cannot be shown', () => {
    const platform = surface()
    platform.notify.mockImplementation(() => {
      throw new Error('no notification centre')
    })

    createSportsAlertPresenter(platform, vi.fn())(alert)

    expect(platform.showOverlay).toHaveBeenCalledWith(alert)
  })

  it('gives the notification a Stop button that takes the overlay path', () => {
    const platform = surface()
    const stop = vi.fn()

    createSportsAlertPresenter(platform, stop)(alert)

    const text = platform.notify.mock.calls[0]?.[0] as {
      actions: readonly { label: string; run: () => void }[]
    }
    expect(text.actions.map((action) => action.label)).toEqual(['Stop Sports'])
    text.actions[0]?.run()
    expect(stop).toHaveBeenCalledOnce()
  })
})
