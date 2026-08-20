import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryStats } from '../../shared/history'
import type { TimerView } from '../../shared/timer'
import { StatsSection } from './StatsSection'

const day = (date: string, completed = 0, minutesByLabel: unknown[] = []) => ({
  date,
  completed,
  minutesByLabel,
})

const stats = (overrides: Partial<HistoryStats> = {}): HistoryStats =>
  ({
    today: day('2026-08-20', 3, [
      { label: 'Sitting', minutes: 90 },
      { label: 'Standing', minutes: 45 },
    ]),
    days: [
      day('2026-08-20', 3, [
        { label: 'Sitting', minutes: 90 },
        { label: 'Standing', minutes: 45 },
      ]),
      day('2026-08-19'),
      day('2026-08-18', 1, [{ label: 'Sitting', minutes: 30 }]),
      day('2026-08-17'),
      day('2026-08-16'),
      day('2026-08-15'),
      day('2026-08-14'),
    ],
    ...overrides,
  }) as HistoryStats

const mockApi = (value: HistoryStats = stats()) => {
  const api = {
    getStats: vi.fn(() => Promise.resolve(value)),
    onTimerView: vi.fn((_listener: (view: TimerView) => void) => vi.fn()),
  }
  window.klokki = api as never
  return api
}

describe('StatsSection', () => {
  it("shows today's completed phases and minutes per label", async () => {
    mockApi()
    render(<StatsSection />)

    expect(await screen.findByText('3 phases')).toBeInTheDocument()
    const today = await screen.findByRole('group', { name: /Today/ })
    expect(today).toHaveTextContent('Sitting')
    expect(today).toHaveTextContent('90m')
    expect(today).toHaveTextContent('Standing')
    expect(today).toHaveTextContent('45m')
  })

  it('lists the last seven days, newest first', async () => {
    mockApi()
    render(<StatsSection />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(7)
    expect(rows[0]).toHaveTextContent('2026-08-20')
    expect(rows[6]).toHaveTextContent('2026-08-14')
  })

  it('renders a day with nothing recorded as empty rather than omitting it', async () => {
    mockApi()
    render(<StatsSection />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('2026-08-19')
    expect(rows[1]).toHaveTextContent('Nothing recorded')
  })

  it('re-reads the log when the running phase changes under it', async () => {
    let push: (view: TimerView) => void = () => {}
    const api = mockApi()
    api.onTimerView = vi.fn((listener: (view: TimerView) => void) => {
      push = listener
      return vi.fn()
    })
    render(<StatsSection />)

    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(1))

    const view = (phaseLabel: string): TimerView => ({
      running: true,
      presetName: 'Sit / stand',
      phaseLabel,
      remainingMs: 1_000,
      countdown: '00:01',
    })
    push(view('Sitting'))
    push(view('Sitting'))
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(2))

    // A boundary just passed, so there is a new phase in the log to show.
    push(view('Standing'))
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(3))
  })
})
