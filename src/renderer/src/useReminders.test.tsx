import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReminderView } from '../../shared/reminder'
import { fakeKlokki } from './test-support/fake-klokki'
import { useReminders } from './useReminders'

const reminder = (id: string, name: string): ReminderView => ({
  id,
  name,
  intervalMinutes: 30,
  steps: [{ label: 'Drink water' }],
  enabled: true,
  nextFireAt: 1_800_000,
})

const Names = () => (
  <p data-testid="names">
    {useReminders()
      .map((r) => r.name)
      .join(', ')}
  </p>
)

const names = () => screen.getByTestId('names').textContent

describe('the saved reminder list', () => {
  it('shows the list the main process has on mount', async () => {
    fakeKlokki({
      listReminders: () => Promise.resolve([reminder('a', 'Drink water')]),
    })

    render(<Names />)

    await waitFor(() => expect(names()).toBe('Drink water'))
  })

  it('follows a save made anywhere in the app', async () => {
    const api = fakeKlokki({
      listReminders: () => Promise.resolve([reminder('a', 'Drink water')]),
    })
    render(<Names />)
    await waitFor(() => expect(names()).toBe('Drink water'))

    api.pushReminders([reminder('a', 'Drink water'), reminder('b', 'Stretch')])

    await waitFor(() => expect(names()).toBe('Drink water, Stretch'))
  })

  it('leaves no listener behind when the window closes', async () => {
    const api = fakeKlokki()
    const view = render(<Names />)
    await waitFor(() => expect(api.listReminders).toHaveBeenCalled())

    view.unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
