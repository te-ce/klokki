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

/** How much time "+5 min" adds to the running phase, in the tray and the webui. */
export const ADD_TIME_MS = 5 * MS_PER_MINUTE

/**
 * One phase of the running preset, as a view draws it in the sequence bar: how
 * long it was configured to be, and what it is called.
 *
 * Only the two fields a bar needs. `notify` is not one of them — a view that
 * carried it would be holding a copy of the preset the run started with, which
 * is the store's to own and the editor's to change.
 */
export type PhaseView = {
  readonly label: string
  readonly minutes: number
}

export type TimerView = {
  readonly running: boolean
  /**
   * Whether the run is holding at a boundary nobody has answered yet.
   *
   * A waiting run is still running — it has a preset, a phase list, and a phase
   * about to start — but its countdown is not moving, and a view that drew it
   * the same as a live one would be showing a frozen clock with no explanation.
   * `phaseLabel` and `remainingMs` describe the phase that *will* start, at its
   * full configured length, because that is what confirming the boundary gets.
   */
  readonly awaiting: boolean
  readonly presetName: string | null
  readonly phaseLabel: string | null
  /**
   * What starts when this phase ends, or null when nothing does — the preset is
   * on its last phase and does not loop.
   *
   * Pushed rather than looked up by a view, because naming the phase is what
   * makes skipping to it answerable ("Skip to Standing") in both the tray menu
   * and the settings window, and neither holds the phase list.
   */
  readonly nextPhaseLabel: string | null
  /** How long the phase named by `nextPhaseLabel` is, or null when there is none. */
  readonly nextPhaseMinutes: number | null
  readonly remainingMs: number
  readonly countdown: string
  /**
   * The phases the run started with, in order — empty while idle.
   *
   * The settings window draws them as one bar, at their real proportions, which
   * is the whole reason this is pushed: the phase list a run is on is the
   * machine's, not the store's, and the two differ the moment a preset is edited
   * while it runs (see AGENTS.md).
   */
  readonly phases: readonly PhaseView[]
  /** Which of `phases` is running, or -1 while idle. */
  readonly phaseIndex: number
  readonly loop: boolean
  /**
   * How far through the current stretch, from 0 to 1.
   *
   * A fraction rather than the phase's length, so no view divides one pushed
   * number by another to find out where the timer is — and so a snoozed stretch,
   * which is longer than the phase is configured to be, still reads as one bar
   * filling up once.
   */
  readonly phaseProgress: number
}
