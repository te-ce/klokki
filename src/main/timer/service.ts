import type { Preset } from '../../shared/preset'
import { SNOOZE_MS, type TimerView } from '../../shared/timer'
import { systemClock, type Clock } from './clock'
import { formatRemaining } from './format'
import {
  IDLE,
  currentPhase,
  nextPhase,
  remainingMs,
  setRemaining,
  skip,
  snooze,
  start,
  stretchProgress,
  tick,
  type Snooze,
  type TimerState,
  type Transition,
} from './machine'

const POLL_INTERVAL_MS = 1_000

export type TimerUpdate = {
  readonly view: TimerView
  readonly transitions: readonly Transition[]
  /** Set only on the update caused by the user snoozing a boundary. */
  readonly snoozed: Snooze | null
}

export type TimerService = {
  readonly startPreset: (preset: Preset) => void
  readonly stop: () => void
  /**
   * Defers the boundary the overlay is showing. Answers whether it moved: there
   * may be no boundary to defer, or the deferred end may already have gone by.
   */
  readonly snooze: () => boolean
  /**
   * Ends the current phase now and starts the next. Answers whether anything
   * moved: there is nothing to skip while the timer is idle.
   */
  readonly skip: () => boolean
  /**
   * Corrects the current phase's remaining time — for a timer started late, to
   * pull it back in sync. Answers whether anything moved: there is nothing to
   * correct while idle.
   */
  readonly setRemaining: (targetMs: number) => boolean
  readonly getView: () => TimerView
  /** The raw state, for anything that needs more than the view — e.g. persistence. */
  readonly getState: () => TimerState
  /**
   * Restores a state loaded from disk. Drains whatever elapsed while the app was
   * closed the same way a poll drains a machine that has been asleep — a run
   * that fully finished lands on idle and its transitions still reach history
   * and the alert surface, and a run still in progress resumes its poll.
   */
  readonly resume: (loaded: TimerState) => void
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  readonly dispose: () => void
}

/** Everything in the view that only a running timer has an answer for. */
type RunShape = Pick<TimerView, 'presetName' | 'phases' | 'phaseIndex' | 'loop'>

const IDLE_SHAPE: RunShape = {
  presetName: null,
  phases: [],
  phaseIndex: -1,
  loop: false,
}

const runShape = (state: TimerState): RunShape => {
  if (state.status !== 'running') return IDLE_SHAPE

  return {
    presetName: state.preset.name,
    // The phase list the run is on, which is not the one in the store once a
    // preset has been edited mid-run. Stripped to what a sequence bar draws.
    phases: state.preset.phases.map(({ label, minutes }) => ({
      label,
      minutes,
    })),
    phaseIndex: currentPhase(state) ? state.phaseIndex : -1,
    loop: state.preset.loop,
  }
}

const toView = (state: TimerState, now: number): TimerView => {
  const remaining = remainingMs(state, now)
  const upcoming = nextPhase(state)

  return {
    running: state.status === 'running',
    phaseLabel: currentPhase(state)?.label ?? null,
    nextPhaseLabel: upcoming?.label ?? null,
    nextPhaseMinutes: upcoming?.minutes ?? null,
    remainingMs: remaining,
    countdown: formatRemaining(remaining),
    phaseProgress: stretchProgress(state, now),
    ...runShape(state),
  }
}

/**
 * The impure shell around the phase machine: owns the poll timer and the current
 * state, and is the only thing here that knows what "now" is. All the logic it
 * drives is pure (machine.ts), which is where the tests live.
 */
export const createTimerService = (
  clock: Clock = systemClock,
): TimerService => {
  let state: TimerState = IDLE
  let poll: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(update: TimerUpdate) => void>()

  const emit = (
    transitions: readonly Transition[],
    snoozed: Snooze | null = null,
  ): void => {
    const update: TimerUpdate = {
      view: toView(state, clock.now()),
      transitions,
      snoozed,
    }
    for (const listener of listeners) listener(update)
  }

  const stopPolling = (): void => {
    if (poll === null) return
    clearInterval(poll)
    poll = null
  }

  const advance = (): void => {
    const result = tick(state, clock.now())
    state = result.state
    if (state.status === 'idle') stopPolling()
    emit(result.transitions)
  }

  return {
    startPreset: (preset) => {
      state = start(preset, clock.now())
      stopPolling()
      poll = setInterval(advance, POLL_INTERVAL_MS)
      emit([])
    },
    snooze: () => {
      const result = snooze(state, clock.now(), SNOOZE_MS)
      // Nothing changed when the boundary is gone, so nothing is announced.
      if (result.snoozed === null) return false
      state = result.state
      emit([], result.snoozed)
      return true
    },
    skip: () => {
      if (state.status !== 'running') return false
      const result = skip(state, clock.now())
      state = result.state
      // The run can end on a skip — the last phase of a preset that does not
      // loop — and a poll with nothing left to advance is a leak.
      if (state.status === 'idle') stopPolling()
      emit(result.transitions)
      return true
    },
    setRemaining: (targetMs) => {
      if (state.status !== 'running') return false
      const result = setRemaining(state, clock.now(), targetMs)
      state = result.state
      // A drained boundary can end a non-looping run before the correction is
      // even applied, same as a skip landing on the last phase.
      if (state.status === 'idle') stopPolling()
      emit(result.transitions)
      return true
    },
    stop: () => {
      state = IDLE
      stopPolling()
      emit([])
    },
    resume: (loaded) => {
      const result = tick(loaded, clock.now())
      state = result.state
      stopPolling()
      if (state.status === 'running')
        poll = setInterval(advance, POLL_INTERVAL_MS)
      emit(result.transitions)
    },
    getView: () => toView(state, clock.now()),
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      stopPolling()
      listeners.clear()
    },
  }
}
