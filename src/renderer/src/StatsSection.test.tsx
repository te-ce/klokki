import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HistoryStats } from '../../shared/history'
import { StatsSection } from './StatsSection'
import { fakeKlokki, runningView, TODAY } from './test-support/fake-klokki'

const day = (date: string, completed = 0, minutesByLabel: unknown[] = []) => ({
  date,
  completed,
  minutesByLabel,
})

const stats = (overrides: Partial<HistoryStats> = {}): HistoryStats =>
  ({
    today: day(TODAY, 3, [
      { label: 'Sitting', minutes: 90 },
      { label: 'Standing', minutes: 45 },
    ]),
    days: [
      day(TODAY, 3, [
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

const mockApi = (value: HistoryStats = stats()) =>
  fakeKlokki({ getStats: () => Promise.resolve(value) })

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

  it('re-reads the log when the main process says a line was written', async () => {
    const api = mockApi()
    render(<StatsSection />)

    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(1))

    api.pushHistoryChanged()
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(2))
  })

  it('re-reads for a stretch that no phase label would have betrayed', async () => {
    const api = mockApi()
    render(<StatsSection />)
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(1))

    // A snooze, or two phases sharing a label: the log gained a line and the
    // running phase reads exactly as it did before.
    api.pushHistoryChanged()
    api.pushHistoryChanged()

    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(3))
  })

  it('does not re-read once a second while the timer runs', async () => {
    const api = mockApi()
    render(<StatsSection />)
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(1))

    api.pushTimerView(runningView({ countdown: '24:59' }))
    api.pushTimerView(runningView({ countdown: '24:58' }))

    expect(api.getStats).toHaveBeenCalledTimes(1)
  })

  it('leaves no listener behind when the window closes', async () => {
    const api = mockApi()
    const view = render(<StatsSection />)
    await waitFor(() => expect(api.getStats).toHaveBeenCalled())

    view.unmount()

    expect(api.listenerCount()).toBe(0)
  })
})
