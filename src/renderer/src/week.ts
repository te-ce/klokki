import type { HistoryStats, LabelMinutes } from '../../shared/history'
import type {
  LabelQuantity,
  SportsHistoryStats,
} from '../../shared/sports-history'

/**
 * One day of everything that happened, from both logs at once.
 *
 * Phase minutes are what the day is drawn at; the Sports totals ride
 * alongside them as counts, because reps and kilometres share no scale with
 * minutes and pretending otherwise is the only way to draw them together.
 */
export type WeekDay = {
  /** Local calendar day, `YYYY-MM-DD`. */
  readonly date: string
  readonly minutes: number
  readonly completed: number
  readonly minutesByLabel: readonly LabelMinutes[]
  readonly counts: readonly LabelQuantity[]
  /** Nothing in either log for this day. */
  readonly empty: boolean
}

export type Week = {
  readonly today: WeekDay
  /** Seven days ending today, newest first. Empty days are present, not missing. */
  readonly days: readonly WeekDay[]
  /**
   * Every phase label the week saw, most minutes first. This is what a label's
   * colour is looked up in: a day's own labels are sorted by that day's minutes,
   * so colouring by position within the day would swap Sitting and Standing
   * between two rows of the same list.
   */
  readonly labels: readonly string[]
  readonly minutes: number
  readonly completed: number
  /** The busiest day's minutes — the scale every row's bar is drawn against. */
  readonly busiest: number
}

/**
 * The two accents alternate down the week's ranking, so one label is told from
 * the next. A label the week never saw takes the first accent rather than none.
 */
export const accentFor = (labels: readonly string[], label: string): string =>
  labels.indexOf(label) % 2 === 1 ? 'bg-rest' : 'bg-work'

const total = (minutesByLabel: readonly LabelMinutes[]): number =>
  minutesByLabel.reduce((sum, entry) => sum + entry.minutes, 0)

const byDate = <T extends { readonly date: string }>(
  days: readonly T[],
): Map<string, T> => new Map(days.map((day) => [day.date, day]))

const quantities = (
  day: { readonly quantityByLabel: readonly LabelQuantity[] } | undefined,
): readonly LabelQuantity[] => day?.quantityByLabel ?? []

const zipDay = (
  phases: HistoryStats['today'],
  sports: SportsHistoryStats['today'] | undefined,
): WeekDay => {
  const counts = quantities(sports)
  const minutes = total(phases.minutesByLabel)

  return {
    date: phases.date,
    minutes,
    completed: phases.completed,
    minutesByLabel: phases.minutesByLabel,
    counts,
    empty: minutes === 0 && counts.length === 0,
  }
}

/**
 * The two stats payloads as one week, joined on the calendar day.
 *
 * Joining is the view's job and nothing else here is: the days, their totals per
 * label and the seven-day window are all the main process's answers, already
 * given. What this adds is arithmetic over one payload — a day's total, the
 * week's — never a fact inferred from the timer or from a second push.
 *
 * The join is by date rather than by position, because two lists that agree on
 * length today are still two lists.
 */
export const zipWeek = (
  stats: HistoryStats,
  sportsStats: SportsHistoryStats,
): Week => {
  const sports = byDate(sportsStats.days)

  const days = stats.days.map((day) => zipDay(day, sports.get(day.date)))

  const weekByLabel = new Map<string, number>()
  for (const day of days)
    for (const entry of day.minutesByLabel)
      weekByLabel.set(
        entry.label,
        (weekByLabel.get(entry.label) ?? 0) + entry.minutes,
      )

  return {
    today: zipDay(stats.today, sportsStats.today),
    days,
    labels: [...weekByLabel]
      .sort(([aLabel, a], [bLabel, b]) => b - a || aLabel.localeCompare(bLabel))
      .map(([label]) => label),
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    completed: days.reduce((sum, day) => sum + day.completed, 0),
    busiest: Math.max(0, ...days.map((day) => day.minutes)),
  }
}
