/**
 * What a view knows about the timer. Serialisable, because it crosses IPC: the
 * main process owns the countdown and pushes this snapshot, so a renderer never
 * needs the phase list or a clock of its own (see AGENTS.md).
 */
export type TimerView = {
  readonly running: boolean
  readonly presetName: string | null
  readonly phaseLabel: string | null
  readonly remainingMs: number
  readonly countdown: string
}
