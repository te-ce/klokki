import type { DayStats, HistoryEvent, HistoryStats } from '../../shared/history'

/**
 * How many days the stats view covers, today included. Seven is the whole scope
 * on purpose (see AGENTS.md): it is a tail-read of the log, so nothing wider can
 * be served without a query engine.
 */
export const STATS_DAYS = 7

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/**
 * The local calendar day an instant falls in, as `YYYY-MM-DD`.
 *
 * The zone is a parameter rather than the host's, so the day boundary this maps
 * to is testable without reaching for the machine's clock or `TZ`.
 */
const dayKey = (at: number, timeZone: string | undefined): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at))

/**
 * The `count` days ending on `today`, newest first.
 *
 * Walking is done on the calendar rather than by subtracting 24 hours from the
 * instant: a day is 23 or 25 hours long either side of a daylight-saving change,
 * and repeated subtraction would then skip or repeat a date. Anchoring at UTC
 * noon keeps every step inside its intended day whatever the offset does.
 */
const daysEndingOn = (today: string, count: number): readonly string[] => {
  const [year, month, day] = today.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const anchor = Date.UTC(year, month - 1, day, 12)

  return Array.from({ length: count }, (_unused, index) =>
    new Date(anchor - index * MS_PER_DAY).toISOString().slice(0, 10),
  )
}

const minutes = (ms: number): number => Math.round(ms / MS_PER_MINUTE)

/**
 * One day's totals. Snoozed stretches count towards the minutes — they are time
 * the user really spent in that phase — but not towards the completed count,
 * which is the number of boundaries actually reached.
 */
const summariseDay = (
  date: string,
  events: readonly HistoryEvent[],
): DayStats => {
  const byLabel = new Map<string, number>()
  let completed = 0

  for (const event of events) {
    if (event.outcome === 'completed') completed += 1
    byLabel.set(
      event.phaseLabel,
      (byLabel.get(event.phaseLabel) ?? 0) + event.durationMs,
    )
  }

  return {
    date,
    completed,
    minutesByLabel: [...byLabel]
      .map(([label, total]) => ({ label, minutes: minutes(total) }))
      // Longest first — the sitting-versus-standing comparison is the point.
      .sort((a, b) => b.minutes - a.minutes || a.label.localeCompare(b.label)),
  }
}

/**
 * The stats view's whole data set, derived from the log's tail.
 *
 * Pure over `now`, so every day-boundary case — midnight, daylight saving, an
 * empty day — is a test against a fixed clock rather than a wait.
 */
export const summarise = (
  events: readonly HistoryEvent[],
  now: number,
  timeZone?: string,
): HistoryStats => {
  const today = dayKey(now, timeZone)
  const wanted = daysEndingOn(today, STATS_DAYS)

  const buckets = new Map<string, HistoryEvent[]>(
    wanted.map((date) => [date, []]),
  )
  for (const event of events) {
    // Anything outside the window — an old line, or one dated in the future —
    // simply has no bucket to land in.
    buckets.get(dayKey(event.endedAt, timeZone))?.push(event)
  }

  const days = wanted.map((date) => summariseDay(date, buckets.get(date) ?? []))

  return { today: days[0]!, days }
}
