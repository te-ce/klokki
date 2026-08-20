import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ReminderHistoryEvent } from '../../shared/reminder-history'
import { summariseReminders } from './reminder-stats'

const ZONE = 'Europe/Berlin'

/** 2026-08-20 14:00 in Berlin. */
const NOW = Date.UTC(2026, 7, 20, 12, 0)

const at = (
  utc: number,
  overrides: Partial<ReminderHistoryEvent> = {},
): ReminderHistoryEvent => ({
  loggedAt: utc,
  reminderId: 'pushups',
  stepLabel: 'Pushups',
  quantity: 20,
  outcome: 'done',
  ...overrides,
})

describe('summariseReminders', () => {
  it("totals today's quantity per step label", () => {
    const stats = summariseReminders(
      [
        at(Date.UTC(2026, 7, 20, 7, 0)),
        at(Date.UTC(2026, 7, 20, 7, 15), { quantity: 40 }),
        at(Date.UTC(2026, 7, 20, 7, 45), {
          stepLabel: 'Squats',
          quantity: 40,
        }),
      ],
      NOW,
      ZONE,
    )

    expect(stats.today).toEqual({
      date: '2026-08-20',
      quantityByLabel: [
        { label: 'Pushups', quantity: 60 },
        { label: 'Squats', quantity: 40 },
      ],
    })
  })

  it('counts a unit-less step as one per done answer', () => {
    const stats = summariseReminders(
      [
        at(Date.UTC(2026, 7, 20, 7, 0), {
          stepLabel: 'Drink water',
          quantity: null,
        }),
        at(Date.UTC(2026, 7, 20, 9, 0), {
          stepLabel: 'Drink water',
          quantity: null,
        }),
      ],
      NOW,
      ZONE,
    )

    expect(stats.today.quantityByLabel).toEqual([
      { label: 'Drink water', quantity: 2 },
    ])
  })

  it('does not count a snoozed answer towards the quantity', () => {
    const stats = summariseReminders(
      [at(Date.UTC(2026, 7, 20, 7, 0), { outcome: 'snoozed', quantity: null })],
      NOW,
      ZONE,
    )

    expect(stats.today.quantityByLabel).toEqual([])
  })

  it('puts an event on the local day it was logged, not the UTC one', () => {
    // 00:30 on the 20th in Berlin is still the 19th in UTC.
    const stats = summariseReminders(
      [at(Date.UTC(2026, 7, 19, 22, 30))],
      NOW,
      ZONE,
    )

    expect(stats.today.quantityByLabel).toEqual([
      { label: 'Pushups', quantity: 20 },
    ])
    expect(stats.days[0]?.date).toBe('2026-08-20')
  })

  it('reports seven days ending today, newest first', () => {
    const stats = summariseReminders([], NOW, ZONE)

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

  it('renders a day with nothing logged as empty rather than missing', () => {
    const stats = summariseReminders(
      [at(Date.UTC(2026, 7, 18, 7, 0))],
      NOW,
      ZONE,
    )

    expect(stats.days[0]).toEqual({ date: '2026-08-20', quantityByLabel: [] })
    expect(stats.days[2]).toEqual({
      date: '2026-08-18',
      quantityByLabel: [{ label: 'Pushups', quantity: 20 }],
    })
  })

  it('ignores events older than the window and any in the future', () => {
    const stats = summariseReminders(
      [
        at(Date.UTC(2026, 7, 10, 7, 0)),
        at(Date.UTC(2026, 7, 25, 7, 0)),
        at(Date.UTC(2026, 7, 14, 7, 0)),
      ],
      NOW,
      ZONE,
    )

    expect(stats.days.map((day) => day.quantityByLabel.length)).toEqual([
      0, 0, 0, 0, 0, 0, 1,
    ])
  })

  // Any instant, any zone: the window is always seven distinct calendar days in
  // descending order, one day apart — mirrors stats.test.ts's property test.
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
          const dates = summariseReminders([], now, zone).days.map(
            (day) => day.date,
          )

          expect(new Set(dates).size).toBe(7)
          expect([...dates].sort().reverse()).toEqual(dates)
        },
      ),
    )
  })
})
