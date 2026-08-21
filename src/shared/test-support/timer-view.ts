import type { TimerView } from '../timer'

/**
 * The pushed timer view, built once for every test that needs one.
 *
 * It lives beside the type rather than in either suite because both sides of the
 * bridge assert against it: the menubar model and the broadcaster in the main
 * process, and the panes in the renderer. Four hand-written literals is how a
 * field added to `TimerView` turns into four identical edits — and how one of
 * them ends up subtly different from the others.
 */
export const IDLE_VIEW: TimerView = {
  running: false,
  awaiting: false,
  presetName: null,
  phaseLabel: null,
  nextPhaseLabel: null,
  nextPhaseMinutes: null,
  remainingMs: 0,
  countdown: '00:00',
  phases: [],
  phaseIndex: -1,
  loop: false,
  phaseProgress: 0,
}

/** A Pomodoro a second into its Focus phase. */
export const runningView = (overrides: Partial<TimerView> = {}): TimerView => ({
  running: true,
  awaiting: false,
  presetName: 'Pomodoro',
  phaseLabel: 'Focus',
  nextPhaseLabel: 'Break',
  nextPhaseMinutes: 5,
  remainingMs: 1_499_000,
  countdown: '25:00',
  phases: [
    { label: 'Focus', minutes: 25 },
    { label: 'Break', minutes: 5 },
  ],
  phaseIndex: 0,
  loop: true,
  phaseProgress: 0.01,
  ...overrides,
})

/**
 * The same Pomodoro, holding at the Focus/Break boundary until it is answered:
 * Break named at its full length, with no time taken off it yet.
 */
export const awaitingView = (overrides: Partial<TimerView> = {}): TimerView =>
  runningView({
    awaiting: true,
    phaseLabel: 'Break',
    nextPhaseLabel: 'Focus',
    nextPhaseMinutes: 25,
    remainingMs: 300_000,
    countdown: '05:00',
    phaseIndex: 1,
    phaseProgress: 0,
    ...overrides,
  })
