import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { HistoryEvent } from '../../shared/history'
import { summarise } from './stats'

const ZONE = 'Europe/Berlin'
const MINUTE = 60_000

/** 2026-08-20 14:00 in Berlin. */
const NOW = Date.UTC(2026, 7, 20, 12, 0)

const at = (
  utc: number,
  overrides: Partial<HistoryEvent> = {},
): HistoryEvent => ({
  endedAt: utc,
  presetId: 'sit-stand',
  phaseLabel: 'Sitting',
  durationMs: 30 * MINUTE,
  outcome: 'completed',
  ...overrides,
})

describe('summarise', () => {
  it("counts today's completed phases and minutes per label", () => {
    const stats = summarise(
      [
        at(Date.UTC(2026, 7, 20, 7, 0)),
        at(Date.UTC(2026, 7, 20, 7, 15), {
          phaseLabel: 'Standing',
          durationMs: 15 * MINUTE,
        }),
        at(Date.UTC(2026, 7, 20, 7, 45)),
      ],
      NOW,
      ZONE,
    )

    expect(stats.today).toEqual({
      date: '2026-08-20',
      completed: 3,
      minutesByLabel: [
        { label: 'Sitting', minutes: 60 },
        { label: 'Standing', minutes: 15 },
      ],
    })
  })

  it('counts snoozed time in the minutes but not in the completed count', () => {
    const stats = summarise(
      [
        at(Date.UTC(2026, 7, 20, 7, 0)),
        at(Date.UTC(2026, 7, 20, 7, 5), {
          durationMs: 5 * MINUTE,
          outcome: 'snoozed',
        }),
      ],
      NOW,
      ZONE,
    )

    expect(stats.today.completed).toBe(1)
    expect(stats.today.minutesByLabel).toEqual([
      { label: 'Sitting', minutes: 35 },
    ])
  })

  it('counts skipped time in the minutes but not in the completed count', () => {
    const stats = summarise(
      [
        at(Date.UTC(2026, 7, 20, 7, 0), {
          durationMs: 12 * MINUTE,
          outcome: 'skipped',
        }),
      ],
      NOW,
      ZONE,
    )

    // Twelve minutes really spent sitting, but no boundary the timer reached.
    expect(stats.today.completed).toBe(0)
    expect(stats.today.minutesByLabel).toEqual([
      { label: 'Sitting', minutes: 12 },
    ])
  })

  it('puts an event on the local day it ended, not the UTC one', () => {
    // 00:30 on the 20th in Berlin is still the 19th in UTC.
    const stats = summarise([at(Date.UTC(2026, 7, 19, 22, 30))], NOW, ZONE)

    expect(stats.today.completed).toBe(1)
    expect(stats.days[0]?.date).toBe('2026-08-20')
  })

  it('reports seven days ending today, newest first', () => {
    const stats = summarise([], NOW, ZONE)

    expect(stats.days.map((day) => day.date)).toEqual([
      '2026-08-20',
      '2026-08-19',
      '2026-08-18',
      '2026-08-17',
      '2026-08-16',
      '2026-08-15',
      '2026-08-14',
    ])
  })

  it('renders a day with nothing recorded as empty rather than missing', () => {
    const stats = summarise([at(Date.UTC(2026, 7, 18, 7, 0))], NOW, ZONE)

    expect(stats.days[0]).toEqual({
      date: '2026-08-20',
      completed: 0,
      minutesByLabel: [],
    })
    expect(stats.days[2]).toEqual({
      date: '2026-08-18',
      completed: 1,
      minutesByLabel: [{ label: 'Sitting', minutes: 30 }],
    })
  })

  it('ignores events older than the window and any in the future', () => {
    const stats = summarise(
      [
        at(Date.UTC(2026, 7, 10, 7, 0)),
        at(Date.UTC(2026, 7, 25, 7, 0)),
        at(Date.UTC(2026, 7, 14, 7, 0)),
      ],
      NOW,
      ZONE,
    )

    expect(stats.days.map((day) => day.completed)).toEqual([
      0, 0, 0, 0, 0, 0, 1,
    ])
  })

  it('walks calendar days across a daylight-saving change', () => {
    // Berlin ends summer time on 2026-10-25, so one of these days is 25 hours.
    const stats = summarise([], Date.UTC(2026, 9, 27, 11, 0), ZONE)

    expect(stats.days.map((day) => day.date)).toEqual([
      '2026-10-27',
      '2026-10-26',
      '2026-10-25',
      '2026-10-24',
      '2026-10-23',
      '2026-10-22',
      '2026-10-21',
    ])
  })

  // Any instant, any zone: the window is always seven distinct calendar days in
  // descending order, one day apart — the property the boundary arithmetic exists
  // to hold, whatever daylight saving does to the length of a day.
  it('always walks seven distinct consecutive days, whatever the instant', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) }),
        fc.constantFrom(
          'UTC',
          'Europe/Berlin',
          'Pacific/Chatham',
          'Asia/Kolkata',
        ),
        (now, zone) => {
          const dates = summarise([], now, zone).days.map((day) => day.date)

          expect(new Set(dates).size).toBe(7)
          expect([...dates].sort().reverse()).toEqual(dates)
          for (const [index, date] of dates.entries()) {
            const gap =
              Date.parse(`${dates[0]!}T12:00:00Z`) -
              Date.parse(`${date}T12:00:00Z`)
            expect(gap).toBe(index * 86_400_000)
          }
        },
      ),
    )
  })
})
