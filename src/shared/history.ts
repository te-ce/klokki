/**
 * What the app remembers about phases that already ended, and the shape the
 * stats view reads. Serialisable on both counts: one is a line of `history.jsonl`,
 * the other crosses IPC.
 */

/**
 * How the stretch ended: it ran to its configured end, it was time the user
 * snoozed, or the user skipped ahead before it was out. All three are minutes
 * really spent in the phase; only `completed` is a boundary the timer reached on
 * its own.
 */
export type PhaseOutcome = 'completed' | 'snoozed' | 'skipped'

export type HistoryEvent = {
  readonly endedAt: number
  readonly presetId: string
  readonly phaseLabel: string
  readonly durationMs: number
  readonly outcome: PhaseOutcome
}

export type LabelMinutes = {
  readonly label: string
  readonly minutes: number
}

export type DayStats = {
  /** Local calendar day, `YYYY-MM-DD`. */
  readonly date: string
  readonly completed: number
  readonly minutesByLabel: readonly LabelMinutes[]
}

export type HistoryStats = {
  readonly today: DayStats
  /** Seven days ending today, newest first. Empty days are present, not missing. */
  readonly days: readonly DayStats[]
}
