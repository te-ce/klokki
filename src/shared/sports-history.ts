/**
 * What the app remembers about logged Sports activity, and the shape the
 * stats view reads for it — the Sports counterpart to
 * shared/reminder-history.ts. Only a completed answer (overlay Done or a
 * manual log) is ever recorded: a snooze defers the schedule but has no
 * quantities to log, so it writes nothing.
 */

export type SportsHistoryEvent = {
  readonly loggedAt: number
  readonly activityId: string
  readonly activityLabel: string
  readonly quantity: number
}

export type LabelQuantity = {
  readonly label: string
  readonly quantity: number
}

export type SportsDayStats = {
  /** Local calendar day, `YYYY-MM-DD`. */
  readonly date: string
  readonly quantityByLabel: readonly LabelQuantity[]
}

export type SportsHistoryStats = {
  readonly today: SportsDayStats
  /** Seven days ending today, newest first. Empty days are present, not missing. */
  readonly days: readonly SportsDayStats[]
}
