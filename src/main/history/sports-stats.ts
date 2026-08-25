import { STATS_DAYS } from '../../shared/history'
import type {
  SportsDayStats,
  SportsHistoryEvent,
  SportsHistoryStats,
} from '../../shared/sports-history'

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

const summariseDay = (
  date: string,
  events: readonly SportsHistoryEvent[],
): SportsDayStats => {
  const byLabel = new Map<string, number>()

  for (const event of events)
    byLabel.set(
      event.activityLabel,
      (byLabel.get(event.activityLabel) ?? 0) + event.quantity,
    )

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
 * The Sports half of the stats view's data set, derived from the Sports
 * log's tail — the counterpart to `summariseReminders`, same day-boundary
 * rules for the same reason.
 */
export const summariseSports = (
  events: readonly SportsHistoryEvent[],
  now: number,
  timeZone?: string,
): SportsHistoryStats => {
  const today = dayKey(now, timeZone)
  const wanted = daysEndingOn(today, STATS_DAYS)

  const buckets = new Map<string, SportsHistoryEvent[]>(
    wanted.map((date) => [date, []]),
  )
  for (const event of events) {
    buckets.get(dayKey(event.loggedAt, timeZone))?.push(event)
  }

  const days = wanted.map((date) => summariseDay(date, buckets.get(date) ?? []))
  const [todayStats = summariseDay(today, [])] = days

  return { today: todayStats, days }
}
