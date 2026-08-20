import { MS_PER_MINUTE } from './preset'

/**
 * What a view knows about the timer. Serialisable, because it crosses IPC: the
 * main process owns the countdown and pushes this snapshot, so a renderer never
 * needs the phase list or a clock of its own (see AGENTS.md).
 */
/**
 * How long Snooze defers a boundary. Fixed rather than configurable: the point
 * of the overlay is a decision the user makes in a second, not a dialog.
 */
export const SNOOZE_MS = 5 * MS_PER_MINUTE

export type TimerView = {
  readonly running: boolean
  readonly presetName: string | null
  readonly phaseLabel: string | null
  readonly remainingMs: number
  readonly countdown: string
}
