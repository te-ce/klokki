/**
 * What the app remembers about phases that already ended, and the shape the
 * stats view reads. Serialisable on both counts: one is a line of `history.jsonl`,
 * the other crosses IPC.
 */

/** Whether the stretch ran to its configured end, or was time the user snoozed. */
export type PhaseOutcome = 'completed' | 'snoozed'

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
