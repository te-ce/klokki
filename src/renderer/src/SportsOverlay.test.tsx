import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SportsOverlay } from './SportsOverlay'
import { fakeKlokki } from './test-support/fake-klokki'

const alert = {
  activities: [
    { id: 'situps', name: 'Situps' },
    { id: 'squats', name: 'Squats' },
  ],
}

describe('SportsOverlay', () => {
  it('names every activity due', () => {
    fakeKlokki()
    render(<SportsOverlay alert={alert} />)

    expect(screen.getByText('Situps')).toBeVisible()
    expect(screen.getByText('Squats')).toBeVisible()
  })

  it('logs zero for an activity left blank, and the entered quantity for the rest', () => {
    const api = fakeKlokki()
    render(<SportsOverlay alert={alert} />)

    fireEvent.change(screen.getByLabelText('Situps'), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(api.confirmSports).toHaveBeenCalledWith({ situps: 20, squats: 0 })
  })

  it('offers no plain dismiss — only Snooze and Done', () => {
    fakeKlokki()
    render(<SportsOverlay alert={alert} />)

    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('offers the fixed snooze increments', () => {
    const api = fakeKlokki()
    render(<SportsOverlay alert={alert} />)

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 10 minutes' }))

    expect(api.snoozeSports).toHaveBeenCalledWith(10 * 60_000)
  })
})
