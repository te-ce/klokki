import { describe, expect, it } from 'vitest'
import type { HistoryStats } from '../../shared/history'
import type { SportsHistoryStats } from '../../shared/sports-history'
import { accentFor, zipWeek } from './week'

const phases = (
  date: string,
  completed = 0,
  minutesByLabel: readonly { label: string; minutes: number }[] = [],
) => ({ date, completed, minutesByLabel })

const counted = (
  date: string,
  quantityByLabel: readonly { label: string; quantity: number }[] = [],
) => ({ date, quantityByLabel })

const stats: HistoryStats = {
  today: phases('2026-08-20', 3, [
    { label: 'Sitting', minutes: 90 },
    { label: 'Standing', minutes: 45 },
  ]),
  days: [
    phases('2026-08-20', 3, [
      { label: 'Sitting', minutes: 90 },
      { label: 'Standing', minutes: 45 },
    ]),
    // A day the other way round: more standing than sitting.
    phases('2026-08-19', 4, [
      { label: 'Standing', minutes: 120 },
      { label: 'Sitting', minutes: 60 },
    ]),
    phases('2026-08-18'),
  ],
}

const sportsStats: SportsHistoryStats = {
  today: counted('2026-08-20', [{ label: 'Run', quantity: 5 }]),
  days: [
    counted('2026-08-20', [{ label: 'Run', quantity: 5 }]),
    counted('2026-08-19'),
    counted('2026-08-18', [{ label: 'Run', quantity: 2 }]),
  ],
}

describe('zipWeek', () => {
  const week = zipWeek(stats, sportsStats)

  it('joins both logs on the calendar day', () => {
    expect(week.days[0]?.counts).toEqual([{ label: 'Run', quantity: 5 }])
    expect(week.days[2]?.counts).toEqual([{ label: 'Run', quantity: 2 }])
  })

  it('totals each day and the week', () => {
    expect(week.days[0]?.minutes).toBe(135)
    expect(week.days[1]?.minutes).toBe(180)
    expect(week.minutes).toBe(315)
    expect(week.completed).toBe(7)
  })

  it('scales the rows against the busiest day, not against each own', () => {
    expect(week.busiest).toBe(180)
  })

  it('ranks the labels over the week, so a colour cannot swap between rows', () => {
    // Sitting leads today; Standing leads the day before. Over the week Sitting
    // has 150 minutes to Standing's 165, so Standing ranks first everywhere.
    expect(week.labels).toEqual(['Standing', 'Sitting'])
    expect(accentFor(week.labels, 'Standing')).toBe('bg-work')
    expect(accentFor(week.labels, 'Sitting')).toBe('bg-rest')
  })

  it('calls a day empty only when both logs are', () => {
    // 18 Aug has no phases at all, but it does have a Sports entry.
    expect(week.days[2]?.minutes).toBe(0)
    expect(week.days[2]?.empty).toBe(false)
    expect(week.days[1]?.empty).toBe(false)
  })

  it('reports the empty day as empty', () => {
    const bare = zipWeek(
      { today: phases('2026-08-20'), days: [phases('2026-08-20')] },
      { today: counted('2026-08-20'), days: [counted('2026-08-20')] },
    )

    expect(bare.today.empty).toBe(true)
    expect(bare.busiest).toBe(0)
    expect(bare.labels).toEqual([])
  })

  it('survives a log whose window does not line up, rather than shifting a day', () => {
    // Two lists that agree on length today are still two lists: the join is
    // by date, so a short Sports log leaves days without counts, not counts on
    // the wrong day.
    const short = zipWeek(stats, {
      today: counted('2026-08-20'),
      days: [counted('2026-08-20')],
    })

    expect(short.days).toHaveLength(3)
    expect(short.days[2]?.counts).toEqual([])
  })

  it('gives an unranked label an accent rather than nothing', () => {
    expect(accentFor([], 'Sitting')).toBe('bg-work')
  })
})
