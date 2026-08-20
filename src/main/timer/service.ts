import type { Preset } from '../../shared/preset'
import { SNOOZE_MS, type TimerView } from '../../shared/timer'
import { systemClock, type Clock } from './clock'
import { formatRemaining } from './format'
import {
  IDLE,
  currentPhase,
  remainingMs,
  snooze,
  start,
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
  readonly getView: () => TimerView
  readonly subscribe: (listener: (update: TimerUpdate) => void) => () => void
  readonly dispose: () => void
}

const toView = (state: TimerState, now: number): TimerView => {
  const phase = currentPhase(state)
  const remaining = remainingMs(state, now)

  return {
    running: state.status === 'running',
    presetName: state.status === 'running' ? state.preset.name : null,
    phaseLabel: phase?.label ?? null,
    remainingMs: remaining,
    countdown: formatRemaining(remaining),
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
    stop: () => {
      state = IDLE
      stopPolling()
      emit([])
    },
    getView: () => toView(state, clock.now()),
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
