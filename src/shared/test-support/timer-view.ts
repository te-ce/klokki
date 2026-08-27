import type { RunView, TimerView } from '../timer'

/**
 * The pushed timer view, built once for every test that needs one.
 *
 * It lives beside the type rather than in either suite because both sides of the
 * bridge assert against it: the menubar model and the broadcaster in the main
 * process, and the panes in the renderer. Four hand-written literals is how a
 * field added to `RunView` turns into four identical edits — and how one of
 * them ends up subtly different from the others.
 */
export const IDLE_VIEW: TimerView = { runs: [] }

/** A Pomodoro a second into its Focus phase. */
export const pomodoroRun = (overrides: Partial<RunView> = {}): RunView => ({
  runId: 'pomodoro',
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
export const awaitingRun = (overrides: Partial<RunView> = {}): RunView =>
  pomodoroRun({
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

/** A second preset, so a test can look at two runs at once. */
export const sitStandRun = (overrides: Partial<RunView> = {}): RunView =>
  pomodoroRun({
    runId: 'sit-stand',
    presetName: 'Sit/Stand',
    phaseLabel: 'Sitting',
    nextPhaseLabel: 'Standing',
    nextPhaseMinutes: 15,
    remainingMs: 1_799_000,
    countdown: '30:00',
    phases: [
      { label: 'Sitting', minutes: 30 },
      { label: 'Standing', minutes: 15 },
    ],
    ...overrides,
  })

/** One run in progress — the shape most tests want. */
export const runningView = (overrides: Partial<RunView> = {}): TimerView => ({
  runs: [pomodoroRun(overrides)],
})

/** One run holding at a boundary nobody has answered. */
export const awaitingView = (overrides: Partial<RunView> = {}): TimerView => ({
  runs: [awaitingRun(overrides)],
})

/** Two presets running at once, in the order they were started. */
export const twoRunView = (
  first: Partial<RunView> = {},
  second: Partial<RunView> = {},
): TimerView => ({ runs: [pomodoroRun(first), sitStandRun(second)] })
