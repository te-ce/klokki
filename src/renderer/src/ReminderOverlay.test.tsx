import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReminderOverlay } from './ReminderOverlay'
import { fakeKlokki } from './test-support/fake-klokki'

const mockApi = () => fakeKlokki()

describe('ReminderOverlay', () => {
  it('names the step that is due', () => {
    mockApi()
    render(<ReminderOverlay alert={{ label: 'Drink water', unit: null }} />)

    expect(screen.getByText('Drink water')).toBeVisible()
  })

  it('offers Done with no input for a step with no unit', () => {
    const api = mockApi()
    render(<ReminderOverlay alert={{ label: 'Drink water', unit: null }} />)

    const done = screen.getByRole('button', { name: 'Done' })
    expect(done).toBeEnabled()
    fireEvent.click(done)

    expect(api.completeReminder).toHaveBeenCalledWith(null)
  })

  it('needs a quantity before Done is enabled for a step with a unit', () => {
    render(<ReminderOverlay alert={{ label: 'Pushups', unit: 'reps' }} />)

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled()
  })

  it('enables Done once a quantity is entered, and sends it', () => {
    const api = mockApi()
    render(<ReminderOverlay alert={{ label: 'Pushups', unit: 'reps' }} />)

    // The row is named by its unit, so the field needs no second copy of it.
    fireEvent.change(screen.getByLabelText('reps'), {
      target: { value: '20' },
    })
    const done = screen.getByRole('button', { name: 'Done' })
    expect(done).toBeEnabled()
    fireEvent.click(done)

    expect(api.completeReminder).toHaveBeenCalledWith(20)
  })

  it('offers no plain dismiss — only Snooze and Done', () => {
    mockApi()
    render(<ReminderOverlay alert={{ label: 'Drink water', unit: null }} />)

    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('offers the fixed snooze increments', () => {
    const api = mockApi()
    render(<ReminderOverlay alert={{ label: 'Drink water', unit: null }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 10 minutes' }))

    expect(api.snoozeReminder).toHaveBeenCalledWith(10 * 60_000)
  })

  it('lets the frameless window be dragged by its one static row', () => {
    mockApi()
    render(<ReminderOverlay alert={{ label: 'Pushups', unit: 'reps' }} />)

    expect(screen.getByText('Pushups')).toHaveClass('drag-region')
    // The quantity field sits under that row and must still take clicks.
    expect(screen.getByLabelText('reps')).not.toHaveClass('drag-region')
  })
})
