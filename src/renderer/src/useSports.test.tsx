import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SportsView } from '../../shared/sport'
import { fakeKlokki } from './test-support/fake-klokki'
import { useSports } from './useSports'

const view = (overrides: Partial<SportsView> = {}): SportsView => ({
  intervalMinutes: 60,
  activities: [{ id: 'situps', name: 'Situps' }],
  enabled: true,
  nextFireAt: null,
  awaiting: false,
  ...overrides,
})

const Names = () => (
  <p data-testid="names">
    {useSports()
      .activities.map((a) => a.name)
      .join(', ')}
  </p>
)

const names = () => screen.getByTestId('names').textContent

describe('the Sports settings', () => {
  it('shows the settings the main process has on mount', async () => {
    fakeKlokki({
      getSportsSettings: () => Promise.resolve(view()),
    })

    render(<Names />)

    await waitFor(() => expect(names()).toBe('Situps'))
  })

  it('follows a save made anywhere in the app', async () => {
    const api = fakeKlokki({
      getSportsSettings: () => Promise.resolve(view()),
    })
    render(<Names />)
    await waitFor(() => expect(names()).toBe('Situps'))

    api.pushSports(
      view({
        activities: [
          { id: 'situps', name: 'Situps' },
          { id: 'squats', name: 'Squats' },
        ],
      }),
    )

    await waitFor(() => expect(names()).toBe('Situps, Squats'))
  })

  it('leaves no listener behind when the window closes', async () => {
    const api = fakeKlokki()
    const rendered = render(<Names />)
    await waitFor(() => expect(api.getSportsSettings).toHaveBeenCalled())

    rendered.unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
