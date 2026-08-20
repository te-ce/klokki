import type {
  ReminderDayStats,
  ReminderHistoryEvent,
  ReminderHistoryStats,
} from '../../shared/reminder-history'

/** Matches `STATS_DAYS` in stats.ts — the same seven-day scope, same reason. */
export const REMINDER_STATS_DAYS = 7

const MS_PER_DAY = 86_400_000

/** The local calendar day an instant falls in, as `YYYY-MM-DD`. See stats.ts. */
const dayKey = (at: number, timeZone: string | undefined): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at))

/** The `count` days ending on `today`, newest first. See stats.ts's `daysEndingOn`. */
const daysEndingOn = (today: string, count: number): readonly string[] => {
  const [year = NaN, month = NaN, day = NaN] = today.split('-').map(Number)
  const anchor = Date.UTC(year, month - 1, day, 12)

  return Array.from({ length: count }, (_unused, index) =>
    new Date(anchor - index * MS_PER_DAY).toISOString().slice(0, 10),
  )
}

/**
 * One day's totals. Only a `done` answer contributes: a snooze is time the
 * step was deferred, not a quantity the user actually logged. A step with no
 * `unit` has a null quantity, and counts as one for each time it was done —
 * "drink water" has no number to add, but "how many times" still is one.
 */
const summariseDay = (
  date: string,
  events: readonly ReminderHistoryEvent[],
): ReminderDayStats => {
  const byLabel = new Map<string, number>()

  for (const event of events) {
    if (event.outcome !== 'done') continue
    byLabel.set(
      event.stepLabel,
      (byLabel.get(event.stepLabel) ?? 0) + (event.quantity ?? 1),
    )
  }

  return {
    date,
    quantityByLabel: [...byLabel]
      .map(([label, quantity]) => ({ label, quantity }))
      .sort(
        (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label),
      ),
  }
}

/**
 * The reminder half of the stats view's data set, derived from the reminder
 * log's tail — the counterpart to `summarise` in stats.ts, same day-boundary
 * rules for the same reason.
 */
export const summariseReminders = (
  events: readonly ReminderHistoryEvent[],
  now: number,
  timeZone?: string,
): ReminderHistoryStats => {
  const today = dayKey(now, timeZone)
  const wanted = daysEndingOn(today, REMINDER_STATS_DAYS)

  const buckets = new Map<string, ReminderHistoryEvent[]>(
    wanted.map((date) => [date, []]),
  )
  for (const event of events) {
    buckets.get(dayKey(event.loggedAt, timeZone))?.push(event)
  }

  const days = wanted.map((date) => summariseDay(date, buckets.get(date) ?? []))
  const [todayStats = summariseDay(today, [])] = days

  return { today: todayStats, days }
}
