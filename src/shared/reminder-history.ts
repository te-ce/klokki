/**
 * What the app remembers about reminder steps that were answered, and the
 * shape the stats view reads for them. A reminder event does not fit
 * `HistoryEvent` (src/shared/history.ts) — no `presetId`, no `durationMs`, and
 * a quantity that schema has no field for — so it gets its own log and its own
 * stats shape, the same durability problem solved the same way.
 */

export type ReminderOutcome = 'done' | 'snoozed'

export type ReminderHistoryEvent = {
  readonly loggedAt: number
  readonly reminderId: string
  readonly stepLabel: string
  /** null for a step with no unit — there is nothing to total for it. */
  readonly quantity: number | null
  readonly outcome: ReminderOutcome
}

export type LabelQuantity = {
  readonly label: string
  readonly quantity: number
}

export type ReminderDayStats = {
  /** Local calendar day, `YYYY-MM-DD`. */
  readonly date: string
  readonly quantityByLabel: readonly LabelQuantity[]
}

export type ReminderHistoryStats = {
  readonly today: ReminderDayStats
  /** Seven days ending today, newest first. Empty days are present, not missing. */
  readonly days: readonly ReminderDayStats[]
}
