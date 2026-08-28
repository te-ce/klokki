import { MS_PER_MINUTE } from './preset'

/**
 * What a view knows about the timer. Serialisable, because it crosses IPC: the
 * main process owns the countdown and pushes this snapshot, so a renderer never
 * needs the phase list or a clock of its own (see AGENTS.md).
 */
/** The fixed snooze increments the overlay offers, matching the Sports overlay's convention. */
export const TIMER_SNOOZE_MINUTES_OPTIONS = [5, 10, 15, 30] as const

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

/**
 * One running preset, as every view of the app reads it.
 *
 * Named by `runId` — the id of the preset it is running — because a run is what
 * every run-scoped command has to name: the tray's Stop, the Timer pane's
 * buttons, and the overlay that a boundary of *this* run raised. Starting a
 * preset that is already running restarts that run rather than adding a second
 * copy, which is what makes the preset id enough of an identity (see AGENTS.md).
 *
 * There is no `running` field: a run in `TimerView.runs` is running by being
 * there, and one that ends is gone from the list.
 */
export type RunView = {
  readonly runId: string
  /**
   * Whether this run is holding at a boundary nobody has answered yet.
   *
   * A waiting run is still running — it has a preset, a phase list, and a phase
   * about to start — but its countdown is not moving, and a view that drew it
   * the same as a live one would be showing a frozen clock with no explanation.
   * `phaseLabel` and `remainingMs` describe the phase that *will* start, at its
   * full configured length, because that is what confirming the boundary gets.
   */
  readonly awaiting: boolean
  readonly presetName: string
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
   * The phases this run started with, in order.
   *
   * The settings window draws them as one bar, at their real proportions, which
   * is the whole reason this is pushed: the phase list a run is on is the
   * machine's, not the store's, and the two differ the moment a preset is edited
   * while it runs (see AGENTS.md).
   */
  readonly phases: readonly PhaseView[]
  /** Which of `phases` is running. -1 only for a state whose index is out of range. */
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

/**
 * Every run in progress, in the order they were started.
 *
 * Several presets run at once, so the view is a list rather than one run's
 * fields (see AGENTS.md). Empty is idle — no window, and no tray title, has to
 * be told that separately, because "nothing is running" is `runs.length === 0`
 * and that is arithmetic over this one payload rather than a second push.
 *
 * The order is the order the runs were started, and a restart keeps a run where
 * it was: the menubar title concatenates these, and parts that reshuffled every
 * time a preset was restarted would be unreadable at a glance.
 */
export type TimerView = {
  readonly runs: readonly RunView[]
}
