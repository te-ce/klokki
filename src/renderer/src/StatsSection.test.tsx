import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HistoryStats } from '../../shared/history'
import type { SportsHistoryStats } from '../../shared/sports-history'
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

const sportsDay = (date: string, quantityByLabel: unknown[] = []) => ({
  date,
  quantityByLabel,
})

const sportsStats = (
  overrides: Partial<SportsHistoryStats> = {},
): SportsHistoryStats =>
  ({
    today: sportsDay(TODAY, [
      { label: 'Squats', quantity: 40 },
      { label: 'Situps', quantity: 20 },
    ]),
    days: [
      sportsDay(TODAY, [
        { label: 'Squats', quantity: 40 },
        { label: 'Situps', quantity: 20 },
      ]),
      sportsDay('2026-08-19', [{ label: 'Pushups', quantity: 25 }]),
      sportsDay('2026-08-18', [
        { label: 'Pushups', quantity: 20 },
        { label: 'Squats', quantity: 15 },
      ]),
      sportsDay('2026-08-17'),
      sportsDay('2026-08-16'),
      sportsDay('2026-08-15'),
      sportsDay('2026-08-14'),
    ],
    ...overrides,
  }) as SportsHistoryStats

const mockApi = (
  value: HistoryStats = stats(),
  sportsValue: SportsHistoryStats = sportsStats(),
) =>
  fakeKlokki({
    getStats: () => Promise.resolve(value),
    getSportsStats: () => Promise.resolve(sportsValue),
  })

const spine = () => screen.findByRole('list', { name: /^last 7 days$/i })

describe('StatsSection', () => {
  it("shows today's phases, its total and its minutes per label", async () => {
    mockApi()
    render(<StatsSection />)

    expect(await screen.findByText('3 phases')).toBeInTheDocument()
    const today = await screen.findByRole('group', { name: /Today/ })
    expect(today).toHaveTextContent('Thu 20')
    expect(today).toHaveTextContent('2h 15m')
    expect(today).toHaveTextContent('Sitting')
    expect(today).toHaveTextContent('1h 30m')
    expect(today).toHaveTextContent('Standing')
    expect(today).toHaveTextContent('45m')
  })

  it("counts today's Sports activity beside the minutes", async () => {
    mockApi()
    render(<StatsSection />)

    // One card, not two: the reps happened on the day the minutes did.
    const today = await screen.findByRole('group', { name: /Today/ })
    expect(today).toHaveTextContent('Squats 40')
    expect(today).toHaveTextContent('Situps 20')
  })

  it('says so when nothing at all was recorded today', async () => {
    mockApi(
      stats({ today: day(TODAY) as HistoryStats['today'] }),
      sportsStats({ today: sportsDay(TODAY) as SportsHistoryStats['today'] }),
    )
    render(<StatsSection />)

    const today = await screen.findByRole('group', { name: /Today/ })
    expect(today).toHaveTextContent('Nothing recorded')
  })

  it('lists the last seven days as one spine, newest first', async () => {
    mockApi()
    render(<StatsSection />)

    const rows = within(await spine()).getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    expect(rows[0]).toHaveTextContent('Thu 20')
    expect(rows[6]).toHaveTextContent('Fri 14')
  })

  it('puts every log on the same row of the spine', async () => {
    mockApi()
    render(<StatsSection />)

    const rows = within(await spine()).getAllByRole('listitem')
    // 18 Aug: half an hour of sitting, twenty pushups and fifteen squats — two
    // logs, one row.
    expect(rows[2]).toHaveTextContent('Tue 18')
    expect(rows[2]).toHaveTextContent('30m')
    expect(rows[2]).toHaveTextContent('Pushups 20 · Squats 15')
  })

  it('keeps a day with counts but no minutes, rather than reading it as empty', async () => {
    mockApi()
    render(<StatsSection />)

    const rows = within(await spine()).getAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('Wed 19')
    expect(rows[1]).toHaveTextContent('Pushups 25')
    expect(rows[1]).not.toHaveTextContent('Nothing recorded')
  })

  it('renders a day with nothing recorded as empty rather than omitting it', async () => {
    mockApi()
    render(<StatsSection />)

    const rows = within(await spine()).getAllByRole('listitem')
    expect(rows[3]).toHaveTextContent('Mon 17')
    expect(rows[3]).toHaveTextContent('Nothing recorded')
  })

  it('totals the week and averages it over the whole window', async () => {
    mockApi()
    render(<StatsSection />)

    // 135 + 30 minutes over seven days, empty days included.
    const totals = await screen.findByLabelText(/week totals/i)
    expect(totals).toHaveTextContent('2h 45m')
    expect(totals).toHaveTextContent('24m')
    expect(totals).toHaveTextContent('Phases')
    expect(totals).toHaveTextContent('4')
  })

  it('re-reads the log when the main process says a line was written', async () => {
    const api = mockApi()
    render(<StatsSection />)

    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(1))

    api.pushHistoryChanged()
    await waitFor(() => expect(api.getStats).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.getSportsStats).toHaveBeenCalledTimes(2))
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
